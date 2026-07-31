/* ============================================================
   سبورت باور — مشغّل Postgres (جداول علائقية حقيقية)
   - كل مجموعة جدول بأعمدة مُعرَّفة وأنواع ومفاتيح أجنبية وفهارس
   - عمود meta JSONB يستوعب أي حقل مستقبلي دون ترحيل جديد
   - مُشغّل ترحيلات (migrations) بسيط ومُتتبَّع في جدول schema_migrations
   - ترقية آمنة من التخزين القديم (id + data JSONB) مع الاحتفاظ بنسخة
   ============================================================ */
const { SCHEMA, COLLECTIONS, CREATE_ORDER, tableName, columnsOf, SQL_TYPE } = require('./schema');

/* ---------- أنواع pg: أعِد الأرقام أرقامًا لا نصوصًا ---------- */
function configureTypes(pgTypes) {
  pgTypes.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
  pgTypes.setTypeParser(20, (v) => (v === null ? null : Number(v)));       // bigint (عدّادات)
}

/* ============================================================
   التحويل بين المستند (JS) والصف (SQL)
   ============================================================ */
const FIELD_MAP = {};
for (const c of COLLECTIONS) {
  FIELD_MAP[c] = { byField: {}, list: columnsOf(c) };
  for (const item of FIELD_MAP[c].list) FIELD_MAP[c].byField[item.field] = item;
}

/* مستند → { أعمدة معروفة، بقية الحقول في meta } */
function toRow(collection, obj) {
  const map = FIELD_MAP[collection];
  const cols = {};
  const meta = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id') continue;
    const spec = map.byField[k];
    if (!spec) { meta[k] = v; continue; }
    cols[spec.column] = spec.def.type === 'json' && v !== null && v !== undefined ? JSON.stringify(v) : v;
  }
  return { cols, meta };
}

/* صف → مستند (meta أولًا ثم الأعمدة، فالأعمدة هي مصدر الحقيقة) */
function fromRow(collection, row) {
  if (!row) return null;
  const map = FIELD_MAP[collection];
  const out = { ...(row.meta || {}) };
  for (const { field, column } of map.list) {
    if (row[column] !== undefined) out[field] = row[column];
  }
  out.id = row.id;
  return out;
}

/* ============================================================
   بناء شروط الاستعلام — لغة فلترة صغيرة تعمل على المشغّلين
   { traineeId: 5, date: { gte: 'x', lte: 'y' }, status: { in: [...] } }
   ============================================================ */
const OPS = {
  eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE',
};

function buildWhere(collection, where, params) {
  const map = FIELD_MAP[collection];
  const parts = [];
  const push = (v) => { params.push(v); return '$' + params.length; };

  for (const [field, cond] of Object.entries(where || {})) {
    const spec = map.byField[field];
    // المفتاح الأساسي، ثم الأعمدة المعرّفة، وأخيرًا الحقول داخل meta
    const lhs = field === 'id' ? '"id"'
      : spec ? `"${spec.column}"`
        : `meta->>'${field.replace(/'/g, "''")}'`;

    if (cond === null) { parts.push(`${lhs} IS NULL`); continue; }
    if (typeof cond !== 'object' || Array.isArray(cond)) {
      if (Array.isArray(cond)) {
        if (!cond.length) { parts.push('FALSE'); continue; }
        parts.push(`${lhs} IN (${cond.map(push).join(',')})`);
      } else {
        parts.push(`${lhs} = ${push(cond)}`);
      }
      continue;
    }
    for (const [op, val] of Object.entries(cond)) {
      if (op === 'in') {
        if (!val.length) { parts.push('FALSE'); continue; }
        parts.push(`${lhs} IN (${val.map(push).join(',')})`);
      } else if (op === 'notIn') {
        if (!val.length) continue;
        parts.push(`(${lhs} IS NULL OR ${lhs} NOT IN (${val.map(push).join(',')}))`);
      } else if (op === 'isNull') {
        parts.push(val ? `${lhs} IS NULL` : `${lhs} IS NOT NULL`);
      } else if (op === 'ne') {
        // فـ NULL <> x تعطي NULL في SQL — نريدها تطابق منطق JavaScript
        parts.push(`(${lhs} IS NULL OR ${lhs} <> ${push(val)})`);
      } else if (OPS[op]) {
        parts.push(`${lhs} ${OPS[op]} ${push(val)}`);
      } else {
        throw new Error('مُعامل استعلام غير مدعوم: ' + op);
      }
    }
  }
  return parts.length ? 'WHERE ' + parts.join(' AND ') : '';
}

function buildOrder(collection, order) {
  if (!order || !order.length) return 'ORDER BY id';
  const map = FIELD_MAP[collection];
  return 'ORDER BY ' + order.map(([field, dir]) => {
    const spec = map.byField[field];
    const lhs = field === 'id' ? '"id"'
      : spec ? `"${spec.column}"`
        : `meta->>'${field.replace(/'/g, "''")}'`;
    return `${lhs} ${String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
  }).join(', ');
}

/* تعبير العمود لحقل ما (للتجميع) */
function fieldExpr(collection, field) {
  const spec = FIELD_MAP[collection].byField[field];
  return field === 'id' ? '"id"' : spec ? `"${spec.column}"` : `meta->>'${field.replace(/'/g, "''")}'`;
}

/* ============================================================
   تعريفات DDL من المخطط
   ============================================================ */
function createTableSql(collection, { withRefs = true } = {}) {
  const spec = SCHEMA[collection];
  const lines = ['id SERIAL PRIMARY KEY'];
  for (const { column, def } of columnsOf(collection)) {
    let line = `"${column}" ${SQL_TYPE[def.type]}`;
    if (def.default !== undefined) line += ` DEFAULT ${def.default}`;
    if (def.notNull) line += ' NOT NULL';
    if (def.unique) line += ' UNIQUE';
    lines.push(line);
  }
  lines.push("meta JSONB NOT NULL DEFAULT '{}'::jsonb");
  for (const { def } of columnsOf(collection)) {
    if (def.check) lines.push(`CHECK (${def.check.replace(/\b([a-zA-Z]+)\b/, '"$1"')})`);
  }
  void spec; void withRefs;
  return `CREATE TABLE IF NOT EXISTS ${tableName(collection)} (\n  ${lines.join(',\n  ')}\n)`;
}

function indexSqls(collection) {
  const spec = SCHEMA[collection];
  const t = tableName(collection);
  const map = FIELD_MAP[collection];
  return (spec.indexes || []).map((fields) => {
    const cols = fields.map((f) => `"${map.byField[f].column}"`).join(', ');
    const name = `idx_${t}_${fields.map((f) => map.byField[f].column).join('_')}`.slice(0, 60);
    return `CREATE INDEX IF NOT EXISTS ${name} ON ${t} (${cols})`;
  });
}

function foreignKeySqls(collection) {
  const t = tableName(collection);
  const out = [];
  for (const { column, def } of columnsOf(collection)) {
    if (!def.ref) continue;
    const target = tableName(def.ref.table);
    const action = def.ref.onDelete === 'setnull' ? 'SET NULL' : 'CASCADE';
    const name = `fk_${t}_${column}`.slice(0, 60);
    out.push({
      name,
      sql: `ALTER TABLE ${t} ADD CONSTRAINT ${name} FOREIGN KEY ("${column}") REFERENCES ${target}(id) ON DELETE ${action}`,
      column, target, notNull: !!def.notNull,
    });
  }
  return out;
}

/* ============================================================
   الترحيلات
   ============================================================ */
const LEGACY_SUFFIX = '_legacy_v1';

async function tableExists(c, name) {
  const { rows } = await c.query('SELECT to_regclass($1) AS t', ['public.' + name]);
  return !!rows[0].t;
}

async function hasColumn(c, table, column) {
  const { rows } = await c.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',
    ['public', table, column]);
  return rows.length > 0;
}

const MIGRATIONS = [
  {
    id: 1,
    name: 'relational-schema',
    async up(c, log) {
      /* 1) التقط التخزين القديم (id + data JSONB) وأعد تسميته نسخةً احتياطية */
      const legacy = [];
      for (const col of CREATE_ORDER) {
        const t = tableName(col);
        if (!(await tableExists(c, t))) continue;
        const isLegacy = (await hasColumn(c, t, 'data')) && !(await hasColumn(c, t, 'meta'));
        if (!isLegacy) continue;
        await c.query(`ALTER TABLE ${t} RENAME TO ${t}${LEGACY_SUFFIX}`);
        legacy.push(col);
      }
      if (legacy.length) log(`ترقية من التخزين القديم: ${legacy.length} جدولًا (نسخة احتياطية بلاحقة ${LEGACY_SUFFIX})`);

      /* 2) أنشئ الجداول والفهارس (بلا مفاتيح أجنبية بعد — تُضاف بعد التنظيف) */
      for (const col of CREATE_ORDER) {
        await c.query(createTableSql(col));
        for (const sql of indexSqls(col)) await c.query(sql);
      }

      /* 3) انقل البيانات القديمة مع الحفاظ على المعرّفات */
      for (const col of legacy) {
        const t = tableName(col);
        const { rows } = await c.query(`SELECT id, data FROM ${t}${LEGACY_SUFFIX} ORDER BY id`);
        for (const r of rows) {
          const doc = r.data || {};
          const { cols, meta } = toRow(col, doc);
          const names = Object.keys(cols);
          const values = names.map((n) => cols[n]);
          const placeholders = names.map((_, i) => `$${i + 3}`);
          await c.query(
            `INSERT INTO ${t} (id, meta${names.length ? ', ' + names.map((n) => `"${n}"`).join(', ') : ''})
             VALUES ($1, $2${placeholders.length ? ', ' + placeholders.join(', ') : ''})`,
            [r.id, JSON.stringify(meta), ...values]);
        }
        if (rows.length) log(`  ${t}: نُقل ${rows.length} صفًا`);
      }

      /* 4) عدّادات المعرّفات */
      for (const col of CREATE_ORDER) {
        const t = tableName(col);
        await c.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}), 1))`);
      }

      /* 5) نظّف المراجع المعلّقة ثم فعّل المفاتيح الأجنبية.
         بيانات قديمة قد تشير لسجلات محذوفة — نُفرّغ المرجع الاختياري
         ونحذف الصف اليتيم إن كان المرجع إلزاميًا، مع تقرير بما جرى. */
      for (const col of CREATE_ORDER) {
        const t = tableName(col);
        for (const fk of foreignKeySqls(col)) {
          const orphans = `SELECT count(*)::int n FROM ${t} x WHERE x."${fk.column}" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ${fk.target} r WHERE r.id = x."${fk.column}")`;
          const { rows } = await c.query(orphans);
          if (rows[0].n > 0) {
            if (fk.notNull) {
              await c.query(`DELETE FROM ${t} x WHERE x."${fk.column}" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM ${fk.target} r WHERE r.id = x."${fk.column}")`);
              log(`  ⚠️ ${t}.${fk.column}: حُذف ${rows[0].n} صفًا يتيمًا (مرجع إلزامي مفقود)`);
            } else {
              await c.query(`UPDATE ${t} x SET "${fk.column}" = NULL WHERE x."${fk.column}" IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM ${fk.target} r WHERE r.id = x."${fk.column}")`);
              log(`  ⚠️ ${t}.${fk.column}: أُفرغ ${rows[0].n} مرجعًا معلّقًا`);
            }
          }
          const exists = await c.query(
            'SELECT 1 FROM pg_constraint WHERE conname = $1', [fk.name]);
          if (!exists.rows.length) await c.query(fk.sql);
        }
      }
    },
  },
  {
    id: 2,
    name: 'payments-branch-denormalisation',
    async up(c, log) {
      // العمود يُنشأ ضمن مخطط الجداول؛ هنا نملؤه للبيانات القائمة
      const { rowCount } = await c.query(`
        UPDATE payments p SET branch_id = s.branch_id
        FROM subscriptions s
        WHERE p.subscription_id = s.id AND p.branch_id IS NULL AND s.branch_id IS NOT NULL`);
      if (rowCount) log(`  payments.branch_id: عُبّئ لـ ${rowCount} دفعة من اشتراكاتها`);
    },
  },
];

/* مزامنة المخطط: تضيف أي عمود أو فهرس جديد أُضيف إلى schema.js لاحقًا.
   بهذا لا يحتاج إدخال حقل جديد إلى ترحيل يدوي — تكفي إضافته للمخطط.
   الأعمدة المضافة لجدول فيه بيانات تُنشأ nullable (لا يمكن فرض NOT NULL
   على صفوف قائمة)، ويبقى القيد كاملًا على القواعد الجديدة. */
async function syncSchema(c, log) {
  for (const col of CREATE_ORDER) {
    const t = tableName(col);
    if (!(await tableExists(c, t))) continue;
    const { rows } = await c.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['public', t]);
    const present = new Set(rows.map((r) => r.column_name));
    for (const { column, def } of columnsOf(col)) {
      if (present.has(column)) continue;
      let line = `"${column}" ${SQL_TYPE[def.type]}`;
      if (def.default !== undefined) line += ` DEFAULT ${def.default}`;
      await c.query(`ALTER TABLE ${t} ADD COLUMN ${line}`);
      log(`  + عمود ${t}.${column}`);
      if (def.ref) {
        const fk = foreignKeySqls(col).find((f) => f.column === column);
        const exists = await c.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [fk.name]);
        if (!exists.rows.length) await c.query(fk.sql);
      }
    }
    for (const sql of indexSqls(col)) await c.query(sql);
  }
}

async function runMigrations(pool, log) {
  const c = await pool.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows } = await c.query('SELECT id FROM schema_migrations');
    const done = new Set(rows.map((r) => r.id));

    // قاعدة قائمة: طابِق المخطط أولًا حتى تجد الترحيلاتُ الأعمدةَ التي تحتاجها
    if (done.size) {
      await c.query('BEGIN');
      try { await syncSchema(c, log); await c.query('COMMIT'); }
      catch (e) { await c.query('ROLLBACK'); throw e; }
    }

    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      log(`ترحيل #${m.id} — ${m.name}…`);
      await c.query('BEGIN');
      try {
        await m.up(c, log);
        await c.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
        await c.query('COMMIT');
        log(`ترحيل #${m.id} تم ✓`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`فشل الترحيل #${m.id} (${m.name}): ${e.message}`);
      }
    }
    // بعد الترحيلات: طابِق أي عمود/فهرس أُضيف للمخطط بلا ترحيل خاص
    await c.query('BEGIN');
    try {
      await syncSchema(c, log);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
  } finally {
    c.release();
  }
}

/* ============================================================
   المشغّل
   ============================================================ */
class PgDriver {
  constructor(url, opts = {}) {
    const pg = require('pg');
    configureTypes(pg.types);
    this.pool = new pg.Pool({ connectionString: url, ...opts.pool });
    this.log = opts.log || (() => {});
    this.slowMs = opts.slowMs || 0;
    this.pool.on('error', (e) => console.error('خطأ في اتصال Postgres:', e.message));
  }

  async init() {
    await runMigrations(this.pool, this.log);
  }

  /* غلاف استعلام مع رصد الاستعلامات البطيئة */
  _wrap(runner) {
    const slowMs = this.slowMs;
    const log = this.log;
    return async (text, params) => {
      if (!slowMs) return runner.query(text, params);
      const t = process.hrtime.bigint();
      const res = await runner.query(text, params);
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      if (ms >= slowMs) log(`استعلام بطيء (${ms.toFixed(0)}ms): ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
      return res;
    };
  }

  _api(runner) {
    const q = this._wrap(runner);

    const insert = async (col, obj) => {
      const t = tableName(col);
      const { cols, meta } = toRow(col, obj);
      // المعرّف يُحترم إن جاء صراحةً (الزرع والترحيل)، وإلا يولّده التسلسل
      if (obj.id != null) cols.id = Number(obj.id);
      const names = Object.keys(cols);
      const values = names.map((n) => cols[n]);
      const res = await q(
        `INSERT INTO ${t} (meta${names.length ? ', ' + names.map((n) => `"${n}"`).join(', ') : ''})
         VALUES ($1${names.length ? ', ' + names.map((_, i) => `$${i + 2}`).join(', ') : ''}) RETURNING *`,
        [JSON.stringify(meta), ...values]);
      return fromRow(col, res.rows[0]);
    };

    const update = async (col, id, patch) => {
      const t = tableName(col);
      const { cols, meta } = toRow(col, patch);
      const sets = [];
      const params = [Number(id)];
      for (const [name, value] of Object.entries(cols)) {
        params.push(value);
        sets.push(`"${name}" = $${params.length}`);
      }
      if (Object.keys(meta).length) {
        params.push(JSON.stringify(meta));
        sets.push(`meta = meta || $${params.length}::jsonb`);
      }
      if (!sets.length) return this.get(col, id);
      const res = await q(`UPDATE ${t} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
      return fromRow(col, res.rows[0]);
    };

    const find = async (col, where, opts = {}) => {
      const params = [];
      const w = buildWhere(col, where, params);
      let sql = `SELECT * FROM ${tableName(col)} ${w} ${buildOrder(col, opts.order)}`;
      if (opts.limit) { params.push(opts.limit); sql += ` LIMIT $${params.length}`; }
      if (opts.offset) { params.push(opts.offset); sql += ` OFFSET $${params.length}`; }
      const res = await q(sql, params);
      return res.rows.map((r) => fromRow(col, r));
    };

    return {
      all: async (col) => find(col, null, {}),
      find,
      get: async (col, id) => fromRow(col, (await q(`SELECT * FROM ${tableName(col)} WHERE id=$1`, [Number(id)])).rows[0]),
      getForUpdate: async (col, id) => fromRow(col, (await q(`SELECT * FROM ${tableName(col)} WHERE id=$1 FOR UPDATE`, [Number(id)])).rows[0]),
      insert,
      update,
      remove: async (col, id) => { await q(`DELETE FROM ${tableName(col)} WHERE id=$1`, [Number(id)]); },
      deleteWhere: async (col, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`DELETE FROM ${tableName(col)} ${w}`, params);
        return res.rowCount;
      },
      updateWhere: async (col, where, patch) => {
        const { cols, meta } = toRow(col, patch);
        const params = [];
        const sets = [];
        for (const [name, value] of Object.entries(cols)) {
          params.push(value);
          sets.push(`"${name}" = $${params.length}`);
        }
        if (Object.keys(meta).length) {
          params.push(JSON.stringify(meta));
          sets.push(`meta = meta || $${params.length}::jsonb`);
        }
        if (!sets.length) return 0;
        const w = buildWhere(col, where, params);
        const res = await q(`UPDATE ${tableName(col)} SET ${sets.join(', ')} ${w}`, params);
        return res.rowCount;
      },
      count: async (col, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`SELECT count(*)::int n FROM ${tableName(col)} ${w}`, params);
        return res.rows[0].n;
      },
      sum: async (col, field, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`SELECT COALESCE(sum(${fieldExpr(col, field)}::numeric),0)::float8 s FROM ${tableName(col)} ${w}`, params);
        return res.rows[0].s;
      },
      countDistinct: async (col, field, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`SELECT count(DISTINCT ${fieldExpr(col, field)})::int n FROM ${tableName(col)} ${w}`, params);
        return res.rows[0].n;
      },
      groupCount: async (col, field, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`SELECT ${fieldExpr(col, field)} AS k, count(*)::int n FROM ${tableName(col)} ${w} GROUP BY 1`, params);
        return Object.fromEntries(res.rows.map((r) => [r.k, r.n]));
      },
      /* مجموع حقل مُجمّعًا بحقل آخر — يستبدل حلقات O(n×m) في التقارير */
      groupSum: async (col, sumField, byField, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(
          `SELECT ${fieldExpr(col, byField)} AS k, COALESCE(sum(${fieldExpr(col, sumField)}::numeric),0)::float8 s
           FROM ${tableName(col)} ${w} GROUP BY 1`, params);
        return Object.fromEntries(res.rows.map((r) => [r.k, r.s]));
      },
      /* القيم المميزة لحقل — لعدّ المتدربين الفريدين دون سحب الصفوف */
      distinct: async (col, field, where) => {
        const params = [];
        const w = buildWhere(col, where, params);
        const res = await q(`SELECT DISTINCT ${fieldExpr(col, field)} AS v FROM ${tableName(col)} ${w}`, params);
        return res.rows.map((r) => r.v);
      },
    };
  }

  async all(col) { return this._api(this.pool).all(col); }
  async find(col, where, opts) { return this._api(this.pool).find(col, where, opts); }
  async get(col, id) { return this._api(this.pool).get(col, id); }
  async insert(col, obj) { return this._api(this.pool).insert(col, obj); }
  async update(col, id, patch) { return this._api(this.pool).update(col, id, patch); }
  async remove(col, id) { return this._api(this.pool).remove(col, id); }
  async deleteWhere(col, where) { return this._api(this.pool).deleteWhere(col, where); }
  async updateWhere(col, where, patch) { return this._api(this.pool).updateWhere(col, where, patch); }
  async count(col, where) { return this._api(this.pool).count(col, where); }
  async sum(col, field, where) { return this._api(this.pool).sum(col, field, where); }
  async countDistinct(col, field, where) { return this._api(this.pool).countDistinct(col, field, where); }
  async groupCount(col, field, where) { return this._api(this.pool).groupCount(col, field, where); }
  async groupSum(col, sumField, byField, where) { return this._api(this.pool).groupSum(col, sumField, byField, where); }
  async distinct(col, field, where) { return this._api(this.pool).distinct(col, field, where); }

  /* بعد إدراج صفوف بمعرّفات صريحة (زرع/ترحيل) تُضبط العدّادات */
  async resetSequences() {
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      await this.pool.query(
        `SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}), 1))`);
    }
  }

  /* توافق خلفي: حذف بمُسند JavaScript (للمسارات الباردة فقط) */
  async removeWhere(col, pred) {
    const rows = await this.all(col);
    for (const r of rows) if (pred(r)) await this.remove(col, r.id);
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(this._api(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async reseed() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const col of [...CREATE_ORDER].reverse()) {
        await c.query(`DROP TABLE IF EXISTS ${tableName(col)} CASCADE`);
      }
      await c.query('DROP TABLE IF EXISTS schema_migrations');
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    await this.init();
  }

  /* رقم آخر ترحيل مطبَّق — للتأكد أن النشر حدّث المخطط */
  async schemaVersion() {
    try {
      const { rows } = await this.pool.query('SELECT max(id)::int v FROM schema_migrations');
      return rows[0].v || 0;
    } catch (e) { return null; }
  }

  async end() { await this.pool.end(); }
}

module.exports = { PgDriver, runMigrations, toRow, fromRow, buildWhere, createTableSql, MIGRATIONS };

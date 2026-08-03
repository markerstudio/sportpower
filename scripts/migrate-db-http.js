/* ============================================================
   ترحيل البيانات عبر HTTPS فقط — للبيئات التي تمنع منفذ 5432

   نفس منطق scripts/migrate-db.js لكن بلا اتصال Postgres مباشر:
   - المصدر (Neon): واجهة SQL-over-HTTP الخاصة بالمشغّل اللحظي.
   - الهدف (Supabase): واجهة الإدارة api.supabase.com (تلزم رمز
     وصول شخصي sbp_… من حساب Supabase).

   الاستخدام:
     SOURCE_URL="postgres://…(Neon)" \
     SUPABASE_PROJECT_REF="xxxx" SUPABASE_ACCESS_TOKEN="sbp_…" \
     node scripts/migrate-db-http.js

   للاختبار المحلي يقبل أيضًا TARGET_URL=postgres://localhost…
   (يستبدل واجهة Supabase بقاعدة محلية عبر pg).
   ============================================================ */
const { CREATE_ORDER, tableName } = require('../server/schema');
const { createTableSql, MIGRATIONS } = require('../server/pg');
const { indexSqls, foreignKeySqls } = (() => {
  // الدالتان غير مُصدَّرتين من pg.js — نعيد بناءهما من المخطط هنا
  const { SCHEMA, columnsOf } = require('../server/schema');
  return {
    indexSqls(collection) {
      const spec = SCHEMA[collection];
      const t = tableName(collection);
      const cols = columnsOf(collection);
      const byField = Object.fromEntries(cols.map((c) => [c.field, c]));
      return (spec.indexes || []).map((fields) => {
        const list = fields.map((f) => `"${byField[f].column}"`).join(', ');
        const name = `idx_${t}_${fields.map((f) => byField[f].column).join('_')}`.slice(0, 60);
        return `CREATE INDEX IF NOT EXISTS ${name} ON ${t} (${list})`;
      });
    },
    foreignKeySqls(collection) {
      const t = tableName(collection);
      const out = [];
      for (const { column, def } of columnsOf(collection)) {
        if (!def.ref) continue;
        const target = tableName(def.ref.table);
        const action = def.ref.onDelete === 'setnull' ? 'SET NULL' : 'CASCADE';
        const name = `fk_${t}_${column}`.slice(0, 60);
        out.push({ name, sql: `ALTER TABLE ${t} ADD CONSTRAINT ${name} FOREIGN KEY ("${column}") REFERENCES ${target}(id) ON DELETE ${action}` });
      }
      return out;
    },
  };
})();

const SOURCE = process.env.SOURCE_URL;
const REF = process.env.SUPABASE_PROJECT_REF;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const LOCAL_TARGET = process.env.TARGET_URL; // للاختبار المحلي فقط
const FORCE = process.argv.includes('--force');
const BATCH = 200;

const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => console.log('  ✗ ' + m);
const warn = (m) => console.log('  ⚠️  ' + m);

/* ---------- تحويل قيمة JS إلى قيمة SQL حرفية آمنة ---------- */
function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return sqlLit(JSON.stringify(v)) + '::jsonb';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/* ---------- المصدر: Neon SQL عبر HTTP ---------- */
function neonSource(url) {
  const host = new URL(url).hostname;
  const endpoint = `https://${host}/sql`;
  return {
    name: 'Neon (HTTPS) · ' + host,
    async query(text, params = []) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': url },
        body: JSON.stringify({ query: text, params }),
      });
      if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const out = await res.json();
      if (out.message && !out.rows) throw new Error('Neon: ' + out.message);
      return { rows: out.rows || [] };
    },
  };
}

/* ---------- الهدف: واجهة إدارة Supabase ---------- */
function supabaseTarget(ref, token) {
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  return {
    name: 'Supabase (Management API) · ' + ref,
    async run(sql) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ query: sql }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Supabase API ${res.status}: ${body.slice(0, 300)}`);
      try { return JSON.parse(body); } catch (e) { return []; }
    },
  };
}

/* ---------- هدف محلي عبر pg (لاختبار المنطق فقط) ---------- */
function pgTarget(url) {
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  return {
    name: 'Postgres محلي (اختبار) · ' + new URL(url).hostname,
    async run(sql) { return (await pool.query(sql)).rows || []; },
    async end() { await pool.end(); },
  };
}

function pgSource(url) {
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  return {
    name: 'Postgres محلي (اختبار) · ' + new URL(url).hostname,
    async query(text, params = []) { return pool.query(text, params); },
    async end() { await pool.end(); },
  };
}

/* ---------- DDL كامل كسكربت واحد (بديل مُشغّل الترحيلات) ---------- */
function schemaScript() {
  const parts = ['BEGIN;'];
  for (const col of CREATE_ORDER) {
    parts.push(createTableSql(col) + ';');
    for (const s of indexSqls(col)) parts.push(s + ';');
  }
  for (const col of CREATE_ORDER) {
    for (const fk of foreignKeySqls(col)) {
      parts.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${fk.name}') THEN ${fk.sql}; END IF; END $$;`);
    }
  }
  parts.push('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());');
  for (const m of MIGRATIONS) {
    parts.push(`INSERT INTO schema_migrations (id, name) VALUES (${m.id}, ${sqlLit(m.name)}) ON CONFLICT (id) DO NOTHING;`);
  }
  parts.push('COMMIT;');
  return parts.join('\n');
}

(async () => {
  console.log('\n▶ ترحيل قاعدة سبورت باور عبر HTTPS\n');

  if (!SOURCE || (!LOCAL_TARGET && (!REF || !TOKEN))) {
    bad('يلزم SOURCE_URL مع (SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN) أو TARGET_URL للاختبار.');
    process.exit(1);
  }

  const src = /localhost|127\.0\.0\.1/.test(SOURCE) ? pgSource(SOURCE) : neonSource(SOURCE);
  const dst = LOCAL_TARGET ? pgTarget(LOCAL_TARGET) : supabaseTarget(REF, TOKEN);

  try {
    console.log('١) الاتصال');
    console.log('   المصدر: ' + src.name);
    console.log('   الهدف:  ' + dst.name);
    await src.query('SELECT 1');
    ok('المصدر متصل');
    await dst.run('SELECT 1');
    ok('الهدف متصل');

    console.log('\n٢) بناء المخطط على الهدف');
    await dst.run(schemaScript());
    ok('المخطط جاهز (الجداول والفهارس والمفاتيح وسجل الترحيلات)');

    console.log('\n٣) فحص الهدف');
    const counts = await dst.run(
      'SELECT ' + CREATE_ORDER.map((c) => `(SELECT count(*)::int FROM ${tableName(c)}) AS "${tableName(c)}"`).join(', '));
    const existing = Object.values(counts[0] || {}).reduce((a, b) => a + Number(b), 0);
    if (existing > 0 && !FORCE) {
      bad(`الهدف ليس فارغًا (${existing} صفًا). أعد التشغيل مع --force لمسحه أولًا.`);
      process.exit(1);
    }
    if (existing > 0) {
      await dst.run(`TRUNCATE ${CREATE_ORDER.map(tableName).join(', ')} RESTART IDENTITY CASCADE`);
      warn(`مُسح الهدف (${existing} صفًا) بطلب --force`);
    } else {
      ok('الهدف فارغ');
    }

    console.log('\n٤) نقل البيانات');
    const t0 = Date.now();
    let total = 0;
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      const probe = await src.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
        ['public', t]).catch(() => ({ rows: [] }));
      const srcCols = probe.rows.map((r) => r.column_name);
      if (!srcCols.length) { warn(`${t}: غير موجود في المصدر — تُرك فارغًا`); continue; }
      const colList = srcCols.map((c) => `"${c}"`).join(', ');

      let offset = 0;
      let moved = 0;
      for (;;) {
        const { rows } = await src.query(`SELECT ${colList} FROM ${t} ORDER BY id LIMIT ${BATCH} OFFSET ${offset}`);
        if (!rows.length) break;
        const values = rows.map((r) => '(' + srcCols.map((c) => sqlLit(r[c])).join(', ') + ')').join(',\n');
        await dst.run(`INSERT INTO ${t} (${colList}) VALUES\n${values}`);
        moved += rows.length;
        offset += rows.length;
      }
      total += moved;
      if (moved) ok(`${t}: ${moved} صفًا`);
    }
    ok(`المجموع: ${total} صفًا في ${((Date.now() - t0) / 1000).toFixed(1)} ثانية`);

    /* عدّادات المعرّفات */
    await dst.run(CREATE_ORDER.map((c) => {
      const t = tableName(c);
      return `SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}), 1));`;
    }).join('\n'));
    ok('عُيّرت عدّادات المعرّفات');

    console.log('\n٥) التحقق (مطابقة المصدر والهدف)');
    let mismatch = 0;
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      const q = `SELECT count(*)::int AS n, COALESCE(max(id),0)::int AS m FROM ${t}`;
      const s = await src.query(q).catch(() => null);
      if (!s) continue;
      const d = (await dst.run(q))[0];
      const sr = s.rows[0];
      if (Number(sr.n) !== Number(d.n) || Number(sr.m) !== Number(d.m)) {
        mismatch++;
        bad(`${t}: المصدر ${sr.n}/${sr.m} ≠ الهدف ${d.n}/${d.m}`);
      }
    }
    if (mismatch) { bad(`${mismatch} جدولًا غير متطابق — لا تُحوّل الإنتاج قبل المعالجة.`); process.exit(1); }
    ok('كل الجداول متطابقة (العدد وأعلى معرّف)');
    console.log('\n✅ اكتمل الترحيل والتحقق.\n');
  } finally {
    if (src.end) await src.end().catch(() => {});
    if (dst.end) await dst.end().catch(() => {});
  }
})().catch((e) => { console.error('\n✗ ' + e.message); process.exit(1); });

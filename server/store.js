/* ============================================================
   طبقة التخزين
   - Postgres (DATABASE_URL / POSTGRES_URL): للإنتاج — جداول علائقية
     حقيقية بأعمدة وأنواع ومفاتيح أجنبية وفهارس وترحيلات متتبَّعة
   - ملف JSON محلي: للتطوير والعرض (بلا إعداد)
   واجهة واحدة للطرفين: قراءة/كتابة + استعلام مفلتر + تجميع + معاملات.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seedData = require('./seed-data');
const { COLLECTIONS, CREATE_ORDER } = require('./schema');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
const IS_SERVERLESS = !!process.env.VERCEL;
const DEMO_MODE = !DATABASE_URL || process.env.SEED_DEMO === '1';

/* ---------- كلمات المرور: scrypt مع ملح لكل مستخدم ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const calc = crypto.scryptSync(String(password), salt, 64);
    const expect = Buffer.from(hash, 'hex');
    return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
  }
  // توافق خلفي مع قواعد بيانات محلية قديمة (sha256 ثابت الملح)
  const legacy = crypto.createHash('sha256').update('sp-salt::' + password).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored.padEnd(64, '0').slice(0, 64)));
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* ============================================================
   مطابقة شروط الاستعلام في الذاكرة — بنفس دلالات نسخة SQL
   ============================================================ */
function likeToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/%/g, '.*').replace(/_/g, '.') + '$');
}

function matches(obj, where) {
  for (const [field, cond] of Object.entries(where || {})) {
    const v = obj[field];
    if (cond === null) { if (v !== null && v !== undefined) return false; continue; }
    if (Array.isArray(cond)) { if (!cond.includes(v)) return false; continue; }
    if (typeof cond !== 'object') { if (v !== cond) return false; continue; }
    for (const [op, val] of Object.entries(cond)) {
      switch (op) {
        case 'in': if (!val.includes(v)) return false; break;
        case 'notIn': if (val.includes(v)) return false; break;
        case 'isNull': if (val ? (v !== null && v !== undefined) : (v === null || v === undefined)) return false; break;
        case 'eq': if (v !== val) return false; break;
        case 'ne': if (v === val) return false; break;
        case 'gt': if (!(v > val)) return false; break;
        case 'gte': if (!(v >= val)) return false; break;
        case 'lt': if (!(v < val)) return false; break;
        case 'lte': if (!(v <= val)) return false; break;
        case 'like': if (!likeToRegExp(val).test(String(v ?? ''))) return false; break;
        default: throw new Error('مُعامل استعلام غير مدعوم: ' + op);
      }
    }
  }
  return true;
}

function applyOrder(rows, order) {
  if (!order || !order.length) return rows.sort((a, b) => a.id - b.id);
  return rows.sort((a, b) => {
    for (const [field, dir] of order) {
      const s = dir && String(dir).toLowerCase() === 'desc' ? -1 : 1;
      const x = a[field], y = b[field];
      if (x === y) continue;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * s;
    }
    return 0;
  });
}

/* ============================================================
   مشغّل ملف JSON (تطوير/عرض)
   ============================================================ */
class JsonDriver {
  constructor() {
    const dir = IS_SERVERLESS ? '/tmp/sportpower-data' : path.join(__dirname, '..', 'data');
    this.file = path.join(dir, 'db.json');
    this.dir = dir;
    this.db = null;
  }

  async init() {
    if (!fs.existsSync(this.file)) this.db = { __empty: true };
    else this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    for (const col of COLLECTIONS) if (!Array.isArray(this.db[col])) this.db[col] = [];
    delete this.db.__empty;
  }

  async isEmpty() { return !fs.existsSync(this.file) || !this.db.users.length; }

  async loadSeed(seed) {
    this.db = { ...seed };
    for (const col of COLLECTIONS) if (!Array.isArray(this.db[col])) this.db[col] = [];
    this.persist();
  }

  persist() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.db, null, 1));
  }

  save() {
    // في البيئات اللحظية (serverless) قد تتجمد العملية بعد الرد مباشرة —
    // نكتب فورًا حتى لا تضيع آخر التعديلات.
    if (IS_SERVERLESS) return this.persist();
    clearTimeout(this._t);
    this._t = setTimeout(() => this.persist(), 120);
  }

  async all(col) { return this.db[col].map((r) => ({ ...r })); }

  async find(col, where, opts = {}) {
    let rows = this.db[col].filter((r) => matches(r, where)).map((r) => ({ ...r }));
    rows = applyOrder(rows, opts.order);
    const start = opts.offset || 0;
    if (opts.limit) rows = rows.slice(start, start + opts.limit);
    else if (start) rows = rows.slice(start);
    return rows;
  }

  async get(col, id) {
    const r = this.db[col].find((x) => x.id === Number(id));
    return r ? { ...r } : null;
  }

  async insert(col, obj) {
    const id = obj.id != null ? Number(obj.id) : this.db[col].reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const row = { ...obj, id };
    this.db[col].push(row);
    this.save();
    return { ...row };
  }

  async update(col, id, patch) {
    const r = this.db[col].find((x) => x.id === Number(id));
    if (!r) return null;
    Object.assign(r, patch);
    this.save();
    return { ...r };
  }

  async remove(col, id) {
    const i = this.db[col].findIndex((x) => x.id === Number(id));
    if (i !== -1) { this.db[col].splice(i, 1); this.save(); }
  }

  async removeWhere(col, pred) {
    this.db[col] = this.db[col].filter((r) => !pred(r));
    this.save();
  }

  async deleteWhere(col, where) {
    const before = this.db[col].length;
    this.db[col] = this.db[col].filter((r) => !matches(r, where));
    this.save();
    return before - this.db[col].length;
  }

  async updateWhere(col, where, patch) {
    let n = 0;
    this.db[col].forEach((r) => { if (matches(r, where)) { Object.assign(r, patch); n++; } });
    if (n) this.save();
    return n;
  }

  async count(col, where) { return this.db[col].filter((r) => matches(r, where)).length; }

  async sum(col, field, where) {
    return this.db[col].filter((r) => matches(r, where)).reduce((s, r) => s + (Number(r[field]) || 0), 0);
  }

  async countDistinct(col, field, where) {
    return new Set(this.db[col].filter((r) => matches(r, where)).map((r) => r[field])).size;
  }

  async groupCount(col, field, where) {
    const out = {};
    this.db[col].filter((r) => matches(r, where)).forEach((r) => { out[r[field]] = (out[r[field]] || 0) + 1; });
    return out;
  }

  async groupSum(col, sumField, byField, where) {
    const out = {};
    this.db[col].filter((r) => matches(r, where))
      .forEach((r) => { out[r[byField]] = (out[r[byField]] || 0) + (Number(r[sumField]) || 0); });
    return out;
  }

  async distinct(col, field, where) {
    return [...new Set(this.db[col].filter((r) => matches(r, where)).map((r) => r[field]))];
  }

  /* عملية واحدة في كل مرة — كافٍ لعملية محلية أحادية */
  async transaction(fn) {
    const bound = {};
    for (const m of ['all', 'find', 'get', 'insert', 'update', 'updateWhere', 'remove', 'deleteWhere',
      'count', 'sum', 'countDistinct', 'groupCount', 'groupSum', 'distinct']) {
      bound[m] = this[m].bind(this);
    }
    bound.getForUpdate = this.get.bind(this);
    return fn(bound);
  }

  async reseed() {
    await this.loadSeed(seedData.demoSeed(hashPassword));
  }

  async end() {}
}

/* ============================================================
   اختيار المشغّل
   ============================================================ */
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS || 0);
const log = (msg) => console.log('[db] ' + msg);

let driver;
if (DATABASE_URL) {
  const { PgDriver } = require('./pg');
  const local = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
  driver = new PgDriver(DATABASE_URL, {
    log,
    slowMs: SLOW_QUERY_MS,
    pool: {
      // على البيئات اللحظية: اتصال واحد لكل نسخة، والتجميع يتكفّل به
      // pooler المزوّد (Neon/Supabase) عبر رابط الاتصال المجمَّع.
      max: IS_SERVERLESS ? 1 : Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: IS_SERVERLESS ? 10000 : 30000,
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
      // التحقق من شهادة الخادم مفعَّل افتراضيًا (يمنع اعتراض الاتصال).
      // مزوّدو Postgres المُدارون يقدّمون شهادات موثوقة عامةً.
      ssl: local ? false : {
        rejectUnauthorized: process.env.PGSSL_NO_VERIFY === '1' ? false : true,
        ca: process.env.PGSSL_CA || undefined,
      },
    },
  });
} else {
  driver = new JsonDriver();
}

/* ---------- الزرع: مرة واحدة على قاعدة فارغة ---------- */
async function seedIfEmpty() {
  const empty = driver instanceof JsonDriver
    ? await driver.isEmpty()
    : (await driver.count('users', null)) === 0;
  if (!empty) return;

  const seed = DEMO_MODE ? seedData.demoSeed(hashPassword) : seedData.productionSeed(hashPassword);
  if (driver instanceof JsonDriver) return driver.loadSeed(seed);

  // ترتيب الإدراج يحترم المفاتيح الأجنبية، والمعرّفات تُحفظ كما هي
  for (const col of CREATE_ORDER) {
    for (const row of seed[col] || []) await driver.insert(col, row);
  }
  if (driver.resetSequences) await driver.resetSequences();
  log(`زُرعت بيانات ${DEMO_MODE ? 'العرض' : 'الإنتاج'}.`);
}

let ready = null;
function initOnce() {
  if (!ready) {
    ready = driver.init().then(seedIfEmpty).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/* تحميل عدة مجموعات كاملة دفعة واحدة.
   ملاحظة أداء: هذه للمجموعات الصغيرة (الفروع، الإعدادات، الباقات…).
   للمجموعات الكبيرة استخدم find/count/sum حتى تُنفَّذ الفلترة في القاعدة. */
async function load(...cols) {
  await initOnce();
  const out = {};
  await Promise.all(cols.map(async (c) => { out[c] = await driver.all(c); }));
  return out;
}

const wrap = (name) => async (...args) => { await initOnce(); return driver[name](...args); };

module.exports = {
  COLLECTIONS,
  DEMO_MODE,
  IS_PG: !!DATABASE_URL,
  initOnce,
  load,
  all: wrap('all'),
  find: wrap('find'),
  get: wrap('get'),
  insert: wrap('insert'),
  update: wrap('update'),
  updateWhere: wrap('updateWhere'),
  remove: wrap('remove'),
  removeWhere: wrap('removeWhere'),
  deleteWhere: wrap('deleteWhere'),
  count: wrap('count'),
  sum: wrap('sum'),
  countDistinct: wrap('countDistinct'),
  groupCount: wrap('groupCount'),
  groupSum: wrap('groupSum'),
  distinct: wrap('distinct'),
  transaction: wrap('transaction'),
  reseed: async () => { await initOnce(); return driver.reseed(); },
  end: async () => driver.end(),
  hashPassword,
  verifyPassword,
  sha256,
};

/* ============================================================
   طبقة التخزين
   - Postgres (DATABASE_URL / POSTGRES_URL): للإنتاج — دائم وموثوق
   - ملف JSON محلي: للتطوير والعرض (بلا إعداد)
   واجهة واحدة غير متزامنة للطرفين + دعم معاملات (transactions).
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seedData = require('./seed-data');

const COLLECTIONS = ['branches', 'users', 'subscriptions', 'payments', 'sessions',
  'appointments', 'inbody', 'meals', 'mealPlans', 'notifications', 'tokens', 'settings',
  'trainerLogs', 'tasks', 'targets', 'frozen', 'subEvents',
  'expenses', 'leads', 'programs', 'pointsLog', 'rewards', 'redemptions', 'referrals',
  'packages', 'contracts', 'sessionRatings', 'actionLog'];
const TABLE = Object.fromEntries(COLLECTIONS.map((c) => [c, c.replace(/[A-Z]/g, (ch) => '_' + ch.toLowerCase())]));

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
    if (!fs.existsSync(this.file)) await this.reseed();
    else this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    // ملفات قديمة: مجموعات ناقصة أو tokens ككائن
    for (const col of COLLECTIONS) if (!Array.isArray(this.db[col])) this.db[col] = [];
  }

  async reseed() {
    this.db = seedData.demoSeed(hashPassword);
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

  async get(col, id) {
    const r = this.db[col].find((x) => x.id === Number(id));
    return r ? { ...r } : null;
  }

  async insert(col, obj) {
    const id = this.db[col].reduce((m, r) => Math.max(m, r.id), 0) + 1;
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

  /* عملية واحدة في كل مرة — كافٍ لعملية محلية أحادية */
  async transaction(fn) {
    const tx = { all: this.all.bind(this), get: this.get.bind(this), getForUpdate: this.get.bind(this), insert: this.insert.bind(this), update: this.update.bind(this), remove: this.remove.bind(this) };
    return fn(tx);
  }
}

/* ============================================================
   مشغّل Postgres (إنتاج)
   جدول لكل مجموعة: id SERIAL PRIMARY KEY + data JSONB
   ============================================================ */
class PgDriver {
  constructor(url) {
    const { Pool } = require('pg');
    const local = /localhost|127\.0\.0\.1/.test(url);
    this.pool = new Pool({
      connectionString: url,
      max: IS_SERVERLESS ? 1 : 5,
      ssl: local ? false : { rejectUnauthorized: false },
    });
  }

  async init() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const col of COLLECTIONS) {
        await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE[col]} (id SERIAL PRIMARY KEY, data JSONB NOT NULL)`);
      }
      const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM users');
      if (rows[0].n === 0) {
        const seed = DEMO_MODE ? seedData.demoSeed(hashPassword) : seedData.productionSeed(hashPassword);
        for (const col of COLLECTIONS) {
          for (const row of seed[col] || []) {
            await client.query(`INSERT INTO ${TABLE[col]} (id, data) VALUES ($1, $2)`, [row.id, JSON.stringify(row)]);
          }
          await client.query(`SELECT setval(pg_get_serial_sequence('${TABLE[col]}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${TABLE[col]}), 1))`);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  _q(clientOrPool) {
    const q = (text, params) => clientOrPool.query(text, params);
    return {
      all: async (col) => (await q(`SELECT data FROM ${TABLE[col]} ORDER BY id`)).rows.map((r) => r.data),
      get: async (col, id) => ((await q(`SELECT data FROM ${TABLE[col]} WHERE id=$1`, [Number(id)])).rows[0] || {}).data || null,
      getForUpdate: async (col, id) => ((await q(`SELECT data FROM ${TABLE[col]} WHERE id=$1 FOR UPDATE`, [Number(id)])).rows[0] || {}).data || null,
      insert: async (col, obj) => {
        const idRes = await q(`SELECT nextval(pg_get_serial_sequence('${TABLE[col]}','id'))::int AS id`);
        const id = idRes.rows[0].id;
        const row = { ...obj, id };
        await q(`INSERT INTO ${TABLE[col]} (id, data) VALUES ($1, $2)`, [id, JSON.stringify(row)]);
        return row;
      },
      update: async (col, id, patch) => {
        const res = await q(`UPDATE ${TABLE[col]} SET data = data || $2::jsonb WHERE id=$1 RETURNING data`, [Number(id), JSON.stringify(patch)]);
        return (res.rows[0] || {}).data || null;
      },
      remove: async (col, id) => { await q(`DELETE FROM ${TABLE[col]} WHERE id=$1`, [Number(id)]); },
    };
  }

  async all(col) { return this._q(this.pool).all(col); }
  async get(col, id) { return this._q(this.pool).get(col, id); }
  async insert(col, obj) { return this._q(this.pool).insert(col, obj); }
  async update(col, id, patch) { return this._q(this.pool).update(col, id, patch); }
  async remove(col, id) { return this._q(this.pool).remove(col, id); }

  async removeWhere(col, pred) {
    const rows = await this.all(col);
    for (const r of rows) if (pred(r)) await this.remove(col, r.id);
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(this._q(client));
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const col of COLLECTIONS) await client.query(`DROP TABLE IF EXISTS ${TABLE[col]}`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await this.init();
  }
}

/* ============================================================
   الواجهة الموحدة
   ============================================================ */
const driver = DATABASE_URL ? new PgDriver(DATABASE_URL) : new JsonDriver();
let ready = null;

function initOnce() {
  if (!ready) ready = driver.init();
  return ready;
}

/* تحميل عدة مجموعات دفعة واحدة */
async function load(...cols) {
  await initOnce();
  const out = {};
  await Promise.all(cols.map(async (c) => { out[c] = await driver.all(c); }));
  return out;
}

module.exports = {
  COLLECTIONS,
  DEMO_MODE,
  IS_PG: !!DATABASE_URL,
  initOnce,
  load,
  all: async (c) => { await initOnce(); return driver.all(c); },
  get: async (c, id) => { await initOnce(); return driver.get(c, id); },
  insert: async (c, o) => { await initOnce(); return driver.insert(c, o); },
  update: async (c, id, p) => { await initOnce(); return driver.update(c, id, p); },
  remove: async (c, id) => { await initOnce(); return driver.remove(c, id); },
  removeWhere: async (c, pred) => { await initOnce(); return driver.removeWhere(c, pred); },
  transaction: async (fn) => { await initOnce(); return driver.transaction(fn); },
  reseed: async () => { await initOnce(); return driver.reseed(); },
  hashPassword,
  verifyPassword,
  sha256,
};

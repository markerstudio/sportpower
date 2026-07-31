/* ============================================================
   اختبار حمل — npm run load-test
   يولّد حجم بيانات سنتين تشغيل في قاعدة اختبار ثم يقيس زمن
   الاستجابة للمسارات الثقيلة. شغّله قبل أي إطلاق كبير، وبعد أي
   تعديل على طبقة البيانات، وقارن بالأرقام المرجعية في README.

   ⚠️ يكتب بيانات ضخمة — لا تشغّله على قاعدة الإنتاج.
       DATABASE_URL=postgres://…/sportpower_load npm run load-test
       LOAD_BASE=http://localhost:3000 npm run load-test -- --bench-only
   ============================================================ */
const TRAINEES = Number(process.env.LOAD_TRAINEES || 800);
const SESSIONS = Number(process.env.LOAD_SESSIONS || 60000);
const APPTS = Number(process.env.LOAD_APPTS || 45000);
const PAYMENTS = Number(process.env.LOAD_PAYMENTS || 18000);
const TRAINERS = 25;
const BASE = process.env.LOAD_BASE || 'http://localhost:3000';
const benchOnly = process.argv.includes('--bench-only');

const day = (i) => new Date(Date.now() - (i % 730) * 86400000).toISOString().slice(0, 10);

async function generate() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('يحتاج DATABASE_URL لقاعدة اختبار (لا الإنتاج).');
  if (/prod|live/i.test(url)) throw new Error('اسم القاعدة يوحي بالإنتاج — أوقفتُ التوليد.');

  const { Pool } = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true } });
  const c = await pool.connect();
  const t0 = Date.now();
  await c.query('BEGIN');

  for (let i = 0; i < TRAINEES; i++) {
    await c.query(`INSERT INTO users (username,password,role,name,phone,branch_id,goal,active,joined_at,meta)
      VALUES ($1,'scrypt$load$load','trainee',$2,$3,$4,$5,true,$6,'{}')`,
    ['load-tr' + i, 'متدرب ' + i, '05' + (10000000 + i), (i % 3) + 1, ['loss', 'muscle', 'maintain'][i % 3], day(i)]);
  }
  for (let i = 0; i < TRAINERS; i++) {
    await c.query(`INSERT INTO users (username,password,role,name,phone,branch_id,active,meta)
      VALUES ($1,'scrypt$load$load','trainer',$2,$3,$4,true,'{}')`, ['load-co' + i, 'مدرب ' + i, '05' + (20000000 + i), (i % 3) + 1]);
  }
  const uids = (await c.query("SELECT id FROM users WHERE username LIKE 'load-tr%' ORDER BY id")).rows.map((r) => r.id);
  const tids = (await c.query("SELECT id FROM users WHERE username LIKE 'load-co%' ORDER BY id")).rows.map((r) => r.id);

  for (let i = 0; i < TRAINEES * 3; i++) {
    await c.query(`INSERT INTO subscriptions (trainee_id,branch_id,total_sessions,used_sessions,price,start_date,end_date,status,meta)
      VALUES ($1,$2,12,$3,1200,$4,$5,'active','{}')`,
    [uids[i % uids.length], (i % 3) + 1, i % 13, day(i + 40), day(i)]);
  }
  const subRows = (await c.query('SELECT id, branch_id FROM subscriptions ORDER BY id')).rows;
  const sids = subRows.map((r) => r.id);
  const subBranch = Object.fromEntries(subRows.map((r) => [r.id, r.branch_id]));

  const chunk = async (n, sql, mk) => {
    for (let start = 0; start < n; start += 2000) {
      const rows = []; const params = []; let p = 0;
      for (let i = start; i < Math.min(start + 2000, n); i++) {
        const vals = mk(i);
        rows.push('(' + vals.map(() => '$' + (++p)).join(',') + ')');
        params.push(...vals);
      }
      await c.query(sql + rows.join(','), params);
    }
  };

  await chunk(SESSIONS, 'INSERT INTO sessions (trainee_id,trainer_id,branch_id,date,time,duration,style,weight,kind,meta) VALUES ',
    (i) => [uids[i % uids.length], tids[i % tids.length], (i % 3) + 1, day(i),
      String(8 + (i % 12)).padStart(2, '0') + ':00', 60, 'قوة', 70 + (i % 30), 'regular', '{}']);

  await chunk(APPTS, 'INSERT INTO appointments (trainer_id,trainee_id,branch_id,date,time,duration,status,meta) VALUES ',
    (i) => [tids[i % tids.length], uids[i % uids.length], (i % 3) + 1, day(i),
      String(8 + (i % 12)).padStart(2, '0') + ':00', 60, i % 7 === 0 ? 'missed' : 'done', '{}']);

  // فرع الدفعة = فرع اشتراكها، تمامًا كما يكتبها التطبيق
  await chunk(PAYMENTS, 'INSERT INTO payments (subscription_id,trainee_id,branch_id,amount,date,method,meta) VALUES ',
    (i) => { const sid = sids[i % sids.length];
      return [sid, uids[i % uids.length], subBranch[sid], 100 + (i % 55), day(i), 'كاش', '{}']; });

  await c.query('COMMIT');
  c.release();

  const counts = {};
  for (const t of ['users', 'sessions', 'appointments', 'subscriptions', 'payments']) {
    counts[t] = (await pool.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  }
  const size = (await pool.query('SELECT pg_size_pretty(pg_database_size(current_database())) s')).rows[0].s;
  await pool.end();
  console.log('حجم البيانات:', JSON.stringify(counts));
  console.log('حجم القاعدة:', size, '· زمن التوليد:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

const PATHS = [
  ['/api/me', 'مسار مصادق خفيف'],
  ['/api/dashboard/admin', 'لوحة الإدارة'],
  ['/api/daily', 'المتابعة اليومية'],
  ['/api/action-center', 'مركز القرارات'],
  ['/api/reports/monthly', 'التقرير الشهري'],
  ['/api/reports/growth', 'تقرير النمو'],
  ['/api/subscriptions', 'الاشتراكات'],
];

async function bench() {
  const login = await fetch(BASE + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.LOAD_USER || 'admin', password: process.env.LOAD_PASS || 'admin123' }),
  }).then((r) => r.json());
  if (!login.token) throw new Error('تعذّر تسجيل الدخول — اضبط LOAD_USER / LOAD_PASS.');

  console.log('\n  المسار'.padEnd(34) + 'الوسيط    الأسوأ');
  for (const [p, label] of PATHS) {
    const ts = [];
    for (let i = 0; i < 5; i++) {
      const t = process.hrtime.bigint();
      const r = await fetch(BASE + p, { headers: { Authorization: 'Bearer ' + login.token } });
      await r.arrayBuffer();
      ts.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    ts.sort((a, b) => a - b);
    const median = ts[2];
    const flag = median > 1000 ? ' 🔴' : median > 300 ? ' 🟡' : '';
    console.log('  ' + label.padEnd(32) + `${median.toFixed(0).padStart(5)} ms ${ts[4].toFixed(0).padStart(7)} ms${flag}`);
  }

  const t = Date.now();
  const res = await Promise.all(Array.from({ length: 20 }, () =>
    fetch(BASE + '/api/dashboard/admin', { headers: { Authorization: 'Bearer ' + login.token } }).then((r) => r.status)));
  console.log(`\n  20 طلبًا متزامنًا: ${Date.now() - t} ms · كلها 200: ${res.every((s) => s === 200)}`);
}

(async () => {
  if (!benchOnly) await generate();
  await bench();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });

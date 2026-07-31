/* ============================================================
   فحص سلامة البيانات — npm run db:check
   يتحقق من الثوابت التي يعتمد عليها النظام في حساباته.
   يُشغَّل بعد كل استعادة نسخة احتياطية، وبشكل دوري على الإنتاج.
   يخرج بالرمز 1 إن وُجدت مشكلة (صالح للتشغيل الآلي).
   ============================================================ */
const Store = require('../server/store');
const { CREATE_ORDER, tableName } = require('../server/schema');

const CHECKS = [];
const check = (name, fn) => CHECKS.push({ name, fn });

/* ---------- ثوابت تُفحص على أي مشغّل تخزين ---------- */
check('لا اشتراك بلا متدرب موجود', async () => {
  const [subs, users] = await Promise.all([Store.all('subscriptions'), Store.all('users')]);
  const ids = new Set(users.map((u) => u.id));
  const bad = subs.filter((s) => !ids.has(s.traineeId));
  return bad.length ? `${bad.length} اشتراكًا يشير لمتدرب غير موجود (${bad.slice(0, 3).map((s) => '#' + s.id).join('، ')})` : null;
});

check('فرع الدفعة يطابق فرع اشتراكها', async () => {
  const [pays, subs] = await Promise.all([Store.all('payments'), Store.all('subscriptions')]);
  const byId = Object.fromEntries(subs.map((s) => [s.id, s]));
  const bad = pays.filter((p) => p.subscriptionId != null && byId[p.subscriptionId]
    && p.branchId != null && p.branchId !== byId[p.subscriptionId].branchId);
  return bad.length
    ? `${bad.length} دفعة فرعها يخالف فرع اشتراكها — تقارير التحصيل بالفرع ستكون مضلِّلة (${bad.slice(0, 3).map((p) => '#' + p.id).join('، ')})`
    : null;
});

check('الحصص المستخدمة لا تتجاوز حصص الاشتراك', async () => {
  const subs = await Store.all('subscriptions');
  const bad = subs.filter((s) => s.usedSessions > s.totalSessions);
  return bad.length ? `${bad.length} اشتراكًا استُهلك أكثر من رصيده (${bad.slice(0, 3).map((s) => '#' + s.id).join('، ')})` : null;
});

check('لا مدفوعات تتجاوز قيمة الاشتراك', async () => {
  const [pays, subs] = await Promise.all([Store.all('payments'), Store.all('subscriptions')]);
  const paid = {};
  pays.forEach((p) => { paid[p.subscriptionId] = (paid[p.subscriptionId] || 0) + p.amount; });
  const bad = subs.filter((s) => (paid[s.id] || 0) > s.price + 0.001);
  return bad.length ? `${bad.length} اشتراكًا مدفوعه أكبر من قيمته (${bad.slice(0, 3).map((s) => '#' + s.id).join('، ')})` : null;
});

check('كل تقييم مرتبط بحصة صاحبها نفسه', async () => {
  const [ratings, sessions] = await Promise.all([Store.all('sessionRatings'), Store.all('sessions')]);
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const bad = ratings.filter((r) => byId[r.sessionId] && byId[r.sessionId].traineeId !== r.traineeId);
  return bad.length ? `${bad.length} تقييمًا لا يخص متدرب الحصة` : null;
});

check('لا جلسات دخول منتهية متراكمة', async () => {
  const stale = await Store.count('tokens', { expiresAt: { lt: Date.now() } });
  return stale > 500 ? `${stale} جلسة منتهية لم تُنظَّف — تُحذف تلقائيًا عند تسجيل الدخول` : null;
});

check('حساب إدارة واحد فعّال على الأقل', async () => {
  const admins = (await Store.find('users', { role: 'admin' })).filter((u) => u.active !== false);
  return admins.length ? null : 'لا يوجد حساب إدارة فعّال — لن يستطيع أحد الدخول للوحة التحكم';
});

check('كلمات المرور مُخزَّنة مُجزَّأة (scrypt)', async () => {
  const users = await Store.all('users');
  const weak = users.filter((u) => !String(u.password || '').startsWith('scrypt$'));
  return weak.length ? `${weak.length} حسابًا بكلمة مرور بصيغة قديمة — ستُحدَّث عند أول تغيير كلمة مرور` : null;
});

/* ---------- فحوص خاصة بـ Postgres (باتصال مستقل قصير العمر) ---------- */
async function pgChecks() {
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 1,
    ssl: local ? false : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== '1', ca: process.env.PGSSL_CA || undefined },
  });
  const out = [];
  // عدّادات المعرّفات خلف أكبر معرّف = تصادم مفاتيح عند أول إدراج
  for (const col of CREATE_ORDER) {
    const t = tableName(col);
    const { rows } = await pool.query(
      `SELECT COALESCE(MAX(id),0) AS max_id,
              COALESCE((SELECT last_value FROM pg_sequences
                        WHERE schemaname='public' AND sequencename = '${t}_id_seq'), 0) AS seq
       FROM ${t}`);
    const { max_id: maxId, seq } = rows[0];
    if (Number(maxId) > Number(seq)) out.push(`عدّاد ${t} (${seq}) خلف أكبر معرّف (${maxId}) — سيقع تصادم مفاتيح`);
  }
  // الترحيلات المطبَّقة
  const mig = await pool.query('SELECT id, name FROM schema_migrations ORDER BY id');
  out.push(`ℹ️ الترحيلات المطبّقة: ${mig.rows.map((r) => r.id + ':' + r.name).join('، ') || 'لا شيء'}`);
  const size = await pool.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS s');
  out.push(`ℹ️ حجم القاعدة: ${size.rows[0].s}`);
  await pool.end();
  return out;
}

(async () => {
  await Store.initOnce();
  console.log(`فحص سلامة البيانات — التخزين: ${Store.IS_PG ? 'postgres' : 'ملف محلي'}\n`);

  let problems = 0;
  for (const { name, fn } of CHECKS) {
    let result;
    try { result = await fn(); }
    catch (e) { result = 'تعذّر الفحص: ' + e.message; }
    if (result) { problems++; console.log(`  ✗ ${name}\n      ${result}`); }
    else console.log(`  ✓ ${name}`);
  }

  if (Store.IS_PG) {
    console.log();
    const notes = await pgChecks().catch((e) => ['تعذّرت فحوص Postgres: ' + e.message]);
    for (const n of notes) {
      if (n.startsWith('ℹ️')) { console.log('  ' + n); continue; }
      problems++;
      console.log('  ✗ ' + n);
    }
  }

  console.log();
  console.log(problems ? `🔴 ${problems} مشكلة تحتاج مراجعة.` : '✅ كل الثوابت سليمة.');
  await Store.end();
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error('فشل الفحص:', e.message); process.exit(1); });

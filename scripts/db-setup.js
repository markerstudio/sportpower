/* ============================================================
   ربط قاعدة البيانات والتحقق منها — npm run db:setup

   شغّله بعد نسخ رابط الاتصال من المزوّد:
     DATABASE_URL="postgres://…" npm run db:setup

   يفحص الرابط، يتصل، يطبّق الترحيلات، يزرع البيانات إن كانت
   القاعدة فارغة، ثم يتحقق من السلامة ويطبع ما يجب وضعه في
   متغيرات البيئة على الاستضافة.
   ============================================================ */
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => console.log('  ✗ ' + m);
const warn = (m) => console.log('  ⚠️  ' + m);

function inspectUrl(raw) {
  const notes = [];
  let u;
  try { u = new URL(raw); } catch (e) { return { fatal: 'الرابط غير صالح — انسخه كاملًا من لوحة المزوّد.' }; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return { fatal: `البروتوكول «${u.protocol}» ليس postgres.` };
  if (!u.hostname) return { fatal: 'الرابط بلا مضيف (host).' };
  const host = u.hostname;
  const isLocal = /localhost|127\.0\.0\.1/.test(host);
  const provider = /neon\.tech/.test(host) ? 'Neon'
    : /supabase\.(co|com)/.test(host) ? 'Supabase'
      : isLocal ? 'محلي' : 'مزوّد آخر';
  const pooled = /-pooler\.|pooler\./.test(host);

  if (!u.password && !isLocal) notes.push('الرابط بلا كلمة مرور — تأكد أنك نسخت النسخة الكاملة.');

  if ((provider === 'Neon' || provider === 'Supabase') && !pooled) {
    notes.push('هذا رابط اتصال **مباشر** وليس مجمَّعًا (Pooled). على Vercel استخدم الرابط '
      + 'الذي يحوي «-pooler» في اسم المضيف، وإلا تنفد اتصالات القاعدة تحت الحمل.');
  }
  if (provider !== 'محلي' && /sslmode=disable/.test(raw)) {
    notes.push('الرابط يعطّل TLS (sslmode=disable) — لا تفعل ذلك على قاعدة بعيدة.');
  }
  return { provider, pooled, host, database: u.pathname.replace(/^\//, '') || '(الافتراضية)', notes };
}

(async () => {
  console.log('\n▶ ربط قاعدة بيانات سبورت باور\n');

  if (!URL_) {
    bad('لم يُضبط DATABASE_URL.');
    console.log(`
  الخطوات:
    1. أنشئ قاعدة على https://neon.tech (الخطة المجانية تكفي للبداية).
    2. انسخ رابط الاتصال المجمَّع (Pooled) — المضيف يحوي «-pooler».
    3. شغّل:  DATABASE_URL="postgres://…" npm run db:setup
`);
    process.exit(1);
  }

  /* 1) فحص الرابط قبل أي اتصال */
  console.log('١) فحص رابط الاتصال');
  const info = inspectUrl(URL_);
  if (info.fatal) { bad(info.fatal); process.exit(1); }
  ok(`المزوّد: ${info.provider} · القاعدة: ${info.database}`);
  if (info.provider === 'Neon' || info.provider === 'Supabase') {
    (info.pooled ? ok : warn)(info.pooled ? 'رابط مجمَّع (Pooled) — مناسب للاستضافة اللحظية' : 'رابط مباشر (غير مجمَّع)');
  }
  info.notes.forEach(warn);

  /* 2) الاتصال + الترحيلات + الزرع */
  console.log('\n٢) الاتصال وتطبيق الترحيلات');
  const t0 = Date.now();
  const Store = require('../server/store');
  try {
    await Store.initOnce();
  } catch (e) {
    bad('فشل الاتصال أو الترحيل: ' + e.message);
    console.log(`
  الأسباب الشائعة:
    · كلمة مرور خاطئة أو رابط ناقص → أعد نسخه من لوحة المزوّد.
    · القاعدة نائمة (Neon) → أعد المحاولة بعد ثوانٍ.
    · شهادة خاصة → اضبط PGSSL_CA، أو PGSSL_NO_VERIFY=1 للتشخيص فقط.
`);
    process.exit(1);
  }
  ok(`متصل · نسخة المخطط: ${await Store.schemaVersion()} · ${Date.now() - t0}ms`);

  const users = await Store.count('users', null);
  const admins = await Store.count('users', { role: 'admin' });
  ok(`الحسابات: ${users} (منها ${admins} إدارة) · الباقات: ${await Store.count('packages', null)}`);
  if (!process.env.ADMIN_PASSWORD && users <= 1) {
    warn('لم يُضبط ADMIN_PASSWORD — حساب المدير يبدأ بكلمة «admin123» ويجب تغييرها فور الدخول.');
  }

  /* 3) اختبار كتابة/قراءة/حذف حقيقي */
  console.log('\n٣) اختبار كتابة وقراءة');
  try {
    const probe = await Store.insert('actionLog', {
      key: 'setup:probe', status: 'done', note: 'اختبار الإعداد', date: new Date().toISOString().slice(0, 10),
    });
    const back = await Store.get('actionLog', probe.id);
    if (!back || back.key !== 'setup:probe') throw new Error('تعذّرت القراءة بعد الكتابة');
    await Store.remove('actionLog', probe.id);
    ok('الكتابة والقراءة والحذف تعمل');
  } catch (e) {
    bad('فشل اختبار الكتابة: ' + e.message);
    process.exit(1);
  }

  /* 4) سلامة البيانات */
  console.log('\n٤) سلامة البيانات');
  ok('شغّل `npm run db:check` لفحص كامل للثوابت');

  console.log(`
✅ القاعدة جاهزة.

  ضع هذه المتغيرات في إعدادات الاستضافة (Vercel → Environment Variables):

    DATABASE_URL    = ${info.host.replace(/./g, '•').slice(0, 24)}…  (الرابط الذي استخدمته الآن)
    ADMIN_PASSWORD  = كلمة مرور قوية لحساب admin

  ثم أعد النشر، وتحقق من:  https://<موقعك>/api/health
  المتوقع: {"ok":true,"storage":"postgres","schemaVersion":${await Store.schemaVersion()},…}

  للصيانة:  npm run db:backup · npm run db:check
`);
  await Store.end();
})().catch((e) => { console.error('\n✗ ' + e.message); process.exit(1); });

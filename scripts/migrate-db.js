/* ============================================================
   ترحيل البيانات بين قاعدتي Postgres — npm run db:migrate

   ينقل كل البيانات من قاعدة المصدر (Neon مثلًا) إلى قاعدة الهدف
   (Supabase مثلًا) مع الحفاظ على المعرّفات، ثم يتحقق صفًا صفًا.

   الاستخدام:
     SOURCE_URL="postgres://…(Neon)" \
     TARGET_URL="postgres://…(Supabase)" \
     npm run db:migrate

   - المصدر يُقرأ فقط — لا يُكتب فيه شيء إطلاقًا.
   - الهدف يجب أن يكون فارغًا؛ أضف --force لمسحه وإعادة النقل.
   - مع Supabase استخدم هنا رابط «Session pooler» (منفذ 5432)؛
     رابط الـ Transaction pooler (منفذ 6543) يبقى للاستضافة اللحظية.
   ============================================================ */
const { CREATE_ORDER, tableName } = require('../server/schema');
const { runMigrations } = require('../server/pg');

const SOURCE = process.env.SOURCE_URL;
const TARGET = process.env.TARGET_URL;
const FORCE = process.argv.includes('--force');
const BATCH = 200;

const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => console.log('  ✗ ' + m);
const warn = (m) => console.log('  ⚠️  ' + m);

function poolFor(url) {
  const pg = require('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 15000,
    ssl: local ? false : {
      rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== '1',
      ca: process.env.PGSSL_CA || undefined,
    },
  });
}

function describe(url) {
  const u = new URL(url);
  const provider = /neon\.tech/.test(u.hostname) ? 'Neon'
    : /supabase\.(co|com)/.test(u.hostname) ? 'Supabase'
      : /localhost|127\.0\.0\.1/.test(u.hostname) ? 'محلي' : u.hostname;
  return `${provider} · ${u.hostname} · قاعدة ${u.pathname.replace(/^\//, '') || '(الافتراضية)'}`;
}

async function columnsIn(pool, table) {
  const { rows } = await pool.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
    ['public', table]);
  return rows.map((r) => r.column_name);
}

(async () => {
  console.log('\n▶ ترحيل قاعدة سبورت باور — من مصدر إلى هدف\n');

  if (!SOURCE || !TARGET) {
    bad('يلزم ضبط SOURCE_URL (القاعدة الحالية) و TARGET_URL (القاعدة الجديدة).');
    console.log('\n  SOURCE_URL="postgres://…" TARGET_URL="postgres://…" npm run db:migrate\n');
    process.exit(1);
  }
  const sHost = new URL(SOURCE).hostname + new URL(SOURCE).pathname;
  const tHost = new URL(TARGET).hostname + new URL(TARGET).pathname;
  if (sHost === tHost) { bad('المصدر والهدف هما القاعدة نفسها — أوقفت العملية.'); process.exit(1); }

  console.log('١) الاتصال');
  console.log('   المصدر: ' + describe(SOURCE));
  console.log('   الهدف:  ' + describe(TARGET));

  const src = poolFor(SOURCE);
  const dst = poolFor(TARGET);
  try {
    await src.query('SELECT 1');
    ok('المصدر متصل');
    await dst.query('SELECT 1');
    ok('الهدف متصل');

    /* 2) بناء المخطط على الهدف بمُشغّل الترحيلات نفسه */
    console.log('\n٢) بناء المخطط على الهدف (الترحيلات المتتبَّعة)');
    await runMigrations(dst, (m) => console.log('   ' + m));
    ok('المخطط جاهز');

    /* 3) الهدف يجب أن يكون فارغًا — أو --force لمسحه */
    console.log('\n٣) فحص الهدف');
    let existing = 0;
    for (const col of CREATE_ORDER) {
      const { rows } = await dst.query(`SELECT count(*)::int n FROM ${tableName(col)}`);
      existing += rows[0].n;
    }
    if (existing > 0 && !FORCE) {
      bad(`الهدف ليس فارغًا (${existing} صفًا). أعد التشغيل مع --force لمسحه أولًا.`);
      process.exit(1);
    }
    if (existing > 0) {
      const names = CREATE_ORDER.map(tableName).join(', ');
      await dst.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
      warn(`مُسح الهدف (${existing} صفًا) بطلب --force`);
    } else {
      ok('الهدف فارغ');
    }

    /* 4) النقل — بترتيب الإنشاء حتى تصحّ المفاتيح الأجنبية */
    console.log('\n٤) نقل البيانات');
    const t0 = Date.now();
    let total = 0;
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      const srcCols = await columnsIn(src, t);
      if (!srcCols.length) { warn(`${t}: غير موجود في المصدر — تُرك فارغًا`); continue; }
      const dstCols = await columnsIn(dst, t);
      const common = srcCols.filter((c) => dstCols.includes(c));
      const dropped = srcCols.filter((c) => !dstCols.includes(c));
      if (dropped.length) warn(`${t}: أعمدة في المصدر بلا مقابل تُهمل: ${dropped.join(', ')}`);

      const colList = common.map((c) => `"${c}"`).join(', ');
      let offset = 0;
      let moved = 0;
      for (;;) {
        const { rows } = await src.query(
          `SELECT ${colList} FROM ${t} ORDER BY id LIMIT ${BATCH} OFFSET ${offset}`);
        if (!rows.length) break;
        const params = [];
        const tuples = rows.map((r) => '(' + common.map((c) => {
          const v = r[c];
          params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
          return '$' + params.length;
        }).join(', ') + ')');
        await dst.query(`INSERT INTO ${t} (${colList}) VALUES ${tuples.join(', ')}`, params);
        moved += rows.length;
        offset += rows.length;
      }
      total += moved;
      if (moved) ok(`${t}: ${moved} صفًا`);
    }
    ok(`المجموع: ${total} صفًا في ${((Date.now() - t0) / 1000).toFixed(1)} ثانية`);

    /* 5) عدّادات المعرّفات على الهدف */
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      await dst.query(
        `SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}), 1))`);
    }
    ok('عُيّرت عدّادات المعرّفات');

    /* 6) التحقق: عدد الصفوف وأعلى معرّف لكل جدول يجب أن يتطابقا */
    console.log('\n٥) التحقق (مطابقة المصدر والهدف)');
    let mismatch = 0;
    for (const col of CREATE_ORDER) {
      const t = tableName(col);
      const q = `SELECT count(*)::int n, COALESCE(max(id),0)::int m FROM ${t}`;
      const s = (await src.query(q).catch(() => null));
      if (!s) continue; // غير موجود في المصدر
      const d = await dst.query(q);
      const same = s.rows[0].n === d.rows[0].n && s.rows[0].m === d.rows[0].m;
      if (!same) { mismatch++; bad(`${t}: المصدر ${s.rows[0].n}/${s.rows[0].m} ≠ الهدف ${d.rows[0].n}/${d.rows[0].m}`); }
    }
    if (mismatch) { bad(`${mismatch} جدولًا غير متطابق — لا تُحوّل الإنتاج قبل المعالجة.`); process.exit(1); }
    ok('كل الجداول متطابقة (العدد وأعلى معرّف)');

    console.log(`
✅ اكتمل الترحيل والتحقق.

  الخطوات التالية:
    1. شغّل فحص السلامة على القاعدة الجديدة:
         DATABASE_URL="<رابط الهدف>" npm run db:check
    2. في Vercel → Environment Variables حدّث DATABASE_URL إلى رابط
       Supabase «Transaction pooler» (المضيف يحوي pooler، منفذ 6543)
       ثم أعد النشر وتحقق من /api/health
    3. أبقِ قاعدة المصدر أسبوعًا كنسخة احتياطية قبل حذفها.
`);
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
})().catch((e) => { console.error('\n✗ ' + e.message); process.exit(1); });

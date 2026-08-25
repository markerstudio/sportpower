/* ============================================================
   اختبار تأمين الواجهة العامة (Row-Level Security) — اختياري

   يلزمه Postgres حقيقي، فيُتخطّى ما لم يُضبط TEST_DATABASE_URL —
   رابط superuser على Postgres محلي للتطوير (لا الإنتاج أبدًا)، لأن
   الاختبار ينشئ قاعدة مؤقتة ويتقمّص دور anon ليجرّب الاختراق فعلًا:

     TEST_DATABASE_URL="postgres://postgres:pass@127.0.0.1:5432/postgres" npm test

   يحاكي إعداد Supabase (دورا anon/authenticated بمنح افتراضية كاملة
   على public) ثم يتأكد بعد الترحيلات أن:
   1. RLS مفعّل على كل جداول public،
   2. لا صلاحيات باقية لدوري الواجهة،
   3. anon لا يقرأ صفًّا واحدًا حتى مع منح SELECT صريح لاحق،
   4. اتصال التطبيق (مالك الجداول) يعمل كما هو.
   ============================================================ */
const { test } = require('node:test');
const assert = require('node:assert');

const ADMIN_URL = process.env.TEST_DATABASE_URL;

test('RLS: جداول public مقفلة أمام أدوار الواجهة العامة', { skip: !ADMIN_URL && 'يلزم TEST_DATABASE_URL (Postgres اختبار محلي)' }, async () => {
  const { Pool } = require('pg');
  const { runMigrations } = require('../server/pg');
  const dbName = 'sportpower_rls_test_' + process.pid;

  const admin = new Pool({ connectionString: ADMIN_URL, max: 1 });
  const roleExists = async (r) =>
    (await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [r])).rows.length > 0;
  // أدوار Supabase — قد تكون موجودة من تشغيل سابق على نفس الخادم
  for (const r of ['anon', 'authenticated']) {
    if (!(await roleExists(r))) await admin.query(`CREATE ROLE ${r} NOLOGIN`);
  }
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.query(`CREATE DATABASE ${dbName}`);

  const url = new URL(ADMIN_URL);
  url.pathname = '/' + dbName;
  const db = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    // منح Supabase الافتراضية قبل الترحيلات
    await db.query('GRANT USAGE ON SCHEMA public TO anon, authenticated');
    await db.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated');

    await runMigrations(db, () => {});

    const { rows: [chk] } = await db.query(`
      SELECT
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity) AS no_rls,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE n.nspname='public'
           AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) AS grants`);
    assert.equal(chk.no_rls, 0, 'كل جداول public يجب أن تكون بـ RLS مفعّل');
    assert.equal(chk.grants, 0, 'لا صلاحيات لدوري anon/authenticated على أي جدول');

    // اتصال التطبيق (المالك) يعمل: كتابة وقراءة
    await db.query(`INSERT INTO users (username, password, role, name) VALUES ('rls-t','x','trainee','ت')`);
    const mine = await db.query('SELECT count(*)::int n FROM users');
    assert.equal(mine.rows[0].n, 1, 'المالك يقرأ صفوفه كالمعتاد');

    // حتى مع منح صريح لاحق: RLS بلا سياسات = صفر صفوف مرئية
    await db.query('GRANT USAGE ON SCHEMA public TO anon');
    await db.query('GRANT SELECT ON users TO anon');
    // العضوية تلزم غير الـ superuser لتقمّص الدور — تجاهُل فشلها مقصود
    await db.query('GRANT anon TO CURRENT_USER').catch(() => {});
    await db.query('SET ROLE anon');
    const anon = await db.query('SELECT count(*)::int n FROM users');
    assert.equal(anon.rows[0].n, 0, 'anon لا يرى صفًّا واحدًا رغم منح SELECT');
    await db.query('RESET ROLE');
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => {});
    await admin.end();
  }
});

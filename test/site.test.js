/* ============================================================
   اختبارات وحدة الموقع العام — الدورات وواجهة الموقع واستقبال طلباته
   تعمل على التخزين الملفّي (وضع العرض) مثل بقية الاختبارات.
   ============================================================ */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
for (const d of ['data', 'uploads']) { try { fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch (e) {} }
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
process.env.SITE_ORIGINS = 'https://www.sport-power.net,https://*.vercel.app';

const app = require('../server/index.js');
let base;
const S = {};

before(async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  S.server = server;
});
after(() => S.server && S.server.close());

async function req(method, p, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, headers: res.headers };
}
const login = async (username, password) => (await req('POST', '/api/login', { body: { username, password } })).json;

test('public site bundle: branches, packages with currency, published courses, contact — no auth', async () => {
  const r = await req('GET', '/api/public/site');
  assert.equal(r.status, 200);
  assert.ok(r.json.branches.length >= 3);
  assert.ok(r.json.packages.length >= 1);
  assert.ok(r.json.packages.every((p) => p.currency && p.price !== undefined && Array.isArray(p.features)));
  assert.equal(r.json.courses.length, 1, 'the seeded coaching course is published');
  const c = r.json.courses[0];
  assert.equal(c.slug, 'coach-business');
  assert.equal(c.tiers.length, 3);
  assert.equal(c.tiers.find((t) => t.key === 'premium').price, 10000);
  assert.equal(c.modules.length, 6);
  assert.ok('whatsapp' in r.json.contact && 'waCountryCode' in r.json.contact);
  assert.ok(r.json.goals.length >= 5);
  assert.match(r.headers.get('cache-control') || '', /public/, 'public data may be cached at the edge');
  const noBody = JSON.stringify(r.json);
  assert.ok(!noBody.includes('password') && !noBody.includes('createdBy'), 'nothing internal leaks');
});

test('public site: CORS is opened only for allowed origins, with preflight', async () => {
  const ok = await req('GET', '/api/public/site', { headers: { Origin: 'https://www.sport-power.net' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://www.sport-power.net');
  const preview = await req('GET', '/api/public/site', { headers: { Origin: 'https://sportpower-site-abc123.vercel.app' } });
  assert.equal(preview.headers.get('access-control-allow-origin'), 'https://sportpower-site-abc123.vercel.app');
  const bad = await req('GET', '/api/public/site', { headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(base + '/api/public/site/leads', { method: 'OPTIONS', headers: { Origin: 'https://www.sport-power.net', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  // بقية الواجهة البرمجية تبقى مغلقة أمام الأصول الأخرى
  const closed = await req('GET', '/api/config', { headers: { Origin: 'https://www.sport-power.net' } });
  assert.equal(closed.headers.get('access-control-allow-origin'), null);
});

test('public site: a course is served by slug, an unpublished or unknown one is 404', async () => {
  const r = await req('GET', '/api/public/site/courses/coach-business');
  assert.equal(r.status, 200);
  assert.equal(r.json.course.title, 'من مدرب إلى بزنس متكامل');
  assert.equal((await req('GET', '/api/public/site/courses/nope')).status, 404);
});

test('website lead: validated, stored as a website lead, notifies admin, honeypot is silently dropped', async () => {
  S.admin = (await login('admin', 'admin123')).token;
  const bad = await req('POST', '/api/public/site/leads', { body: { name: 'أ', phone: '123' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.field, 'name');
  const badPhone = await req('POST', '/api/public/site/leads', { body: { name: 'زائر الموقع', phone: '12' } });
  assert.equal(badPhone.json.field, 'phone');

  const bot = await req('POST', '/api/public/site/leads', { body: { name: 'Bot Bot', phone: '0599000000', website: 'http://spam' } });
  assert.equal(bot.status, 200);
  const before = (await req('GET', '/api/leads', { token: S.admin })).json.length;

  const r = await req('POST', '/api/public/site/leads', {
    body: { name: 'زائر الموقع', phone: '0599 123 456', email: 'Visitor@Example.com', branchId: 1, interest: 'training', goal: 'muscle', message: 'أريد البدء الأسبوع القادم', lang: 'ar' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.duplicate, false);
  const leads = (await req('GET', '/api/leads', { token: S.admin })).json;
  assert.equal(leads.length, before + 1, 'the bot submission was not stored');
  const lead = leads.find((l) => l.id === r.json.leadId);
  assert.equal(lead.channel, 'الموقع الإلكتروني');
  assert.equal(lead.stage, 'new');
  assert.equal(lead.goal, 'بناء كتلة عضلية');
  assert.equal(lead.email, 'visitor@example.com');
  assert.equal(lead.branchId, 1);
  assert.match(lead.note, /الرسالة: أريد البدء/);
  const notifs = (await req('GET', '/api/notifications', { token: S.admin })).json;
  assert.ok((notifs.items || notifs).some((n) => /طلب جديد من الموقع/.test(n.text)), 'admin is notified');
});

test('website lead: the same phone within a week updates the existing record instead of duplicating', async () => {
  const before = (await req('GET', '/api/leads', { token: S.admin })).json.length;
  const r = await req('POST', '/api/public/site/leads', {
    body: { name: 'زائر الموقع', phone: '0599123456', interest: 'course', courseSlug: 'coach-business', tier: 'gold', lang: 'en' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.duplicate, true);
  const leads = (await req('GET', '/api/leads', { token: S.admin })).json;
  assert.equal(leads.length, before);
  const lead = leads.find((l) => l.id === r.json.leadId);
  assert.equal(lead.tier, 'gold');
  assert.ok(lead.courseId);
  assert.match(lead.note, /coach|من مدرب/);
});

test('website lead: a course interest needs a published course', async () => {
  const r = await req('POST', '/api/public/site/leads', { body: { name: 'مدرب جديد', phone: '0598765432', interest: 'course', courseSlug: 'missing' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.field, 'courseSlug');
});

test('courses admin: admin edits, accountant reads, trainer is denied, unpublished course leaves the site', async () => {
  const list = (await req('GET', '/api/courses', { token: S.admin })).json;
  assert.equal(list.length, 1);
  const id = list[0].id;

  const trainer = (await login('omar', '123456')).token;
  assert.equal((await req('GET', '/api/courses', { token: trainer })).status, 403);

  const badSlug = await req('POST', '/api/courses', { token: S.admin, body: { title: 'x', slug: 'Bad Slug!' } });
  assert.equal(badSlug.status, 400);
  const dupSlug = await req('POST', '/api/courses', { token: S.admin, body: { title: 'x', slug: 'coach-business' } });
  assert.equal(dupSlug.status, 400);

  const created = await req('POST', '/api/courses', {
    token: S.admin,
    body: { title: 'دورة تجريبية', slug: 'trial', lessons: '4', tiers: [{ key: 'silver', name: 'Silver', price: '500', features: 'أ\nب' }, { name: '', price: 1 }], modules: [{ title: 'م1', text: 'ن1' }, { title: '' }], published: true },
  });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  assert.equal(created.json.tiers.length, 1, 'a tier without a name is dropped');
  assert.deepEqual(created.json.tiers[0].features, ['أ', 'ب']);
  assert.equal(created.json.modules.length, 1);
  assert.equal(created.json.lessons, 4);

  let site = (await req('GET', '/api/public/site')).json;
  assert.equal(site.courses.length, 2);

  const upd = await req('PUT', '/api/courses/' + created.json.id, { token: S.admin, body: { published: false } });
  assert.equal(upd.status, 200);
  site = (await req('GET', '/api/public/site')).json;
  assert.equal(site.courses.length, 1, 'unpublished course is hidden from the site');
  assert.equal((await req('GET', '/api/public/site/courses/trial')).status, 404);

  assert.equal((await req('DELETE', '/api/courses/' + created.json.id, { token: trainer })).status, 403);
  assert.equal((await req('DELETE', '/api/courses/' + created.json.id, { token: S.admin })).json.ok, true);
  assert.equal((await req('GET', '/api/courses', { token: S.admin })).json.length, 1);
  assert.ok(id);
});

test('settings: website contact fields are saved and exposed on the public site', async () => {
  const r = await req('PUT', '/api/settings', { token: S.admin, body: { siteWhatsapp: '0599 000 111', siteInstagram: 'sportpower.ps', siteEmail: 'hello@sport-power.net' } });
  assert.equal(r.status, 200);
  const site = (await req('GET', '/api/public/site')).json;
  assert.equal(site.contact.whatsapp, '0599 000 111');
  assert.equal(site.contact.instagram, 'sportpower.ps');
  assert.equal(site.contact.email, 'hello@sport-power.net');
  assert.ok(!('uploadSecret' in site.contact));
});

/* ============================================================
   اختبارات تكامل الواجهة البرمجية — تُشغَّل بـ: npm test
   تعمل بمشغّل node:test المدمج (بلا اعتماد جديد) على التخزين الملفّي
   (وضع العرض). تغطّي ما أُصلح: المصادقة، الصلاحيات، سلامة المال والنقاط،
   محو الهوية، سقف التجميد، المرفقات، حقن CSV، وفصل العملات.
   ============================================================ */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

// تخزين ملفّي نظيف لكل تشغيل
const root = path.join(__dirname, '..');
for (const d of ['data', 'uploads']) { try { fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch (e) {} }
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;

const app = require('../server/index.js');
let base;
const S = {}; // حالة مشتركة (رموز الجلسات)

before(async () => {
  const server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  S.server = server;
});
after(() => S.server && S.server.close());

async function req(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}
const login = async (username, password) => (await req('POST', '/api/login', { body: { username, password } })).json;

test('health check responds ok', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test('login: wrong password is rejected', async () => {
  const r = await req('POST', '/api/login', { body: { username: 'admin', password: 'nope' } });
  assert.equal(r.status, 401);
});

test('login: admin succeeds and gets a token', async () => {
  const d = await login('admin', 'admin123');
  assert.ok(d.token, 'expected a session token');
  S.admin = d.token;
});

test('temp-password gate: a must-change account cannot use the API', async () => {
  await req('POST', '/api/users', { token: S.admin, body: { username: 'gatetest', password: 'temp-pass-123', name: 'Gate', role: 'accountant' } });
  const d = await login('gatetest', 'temp-pass-123');
  assert.ok(d.token, 'login itself should succeed');
  const pay = await req('GET', '/api/payments', { token: d.token });
  assert.equal(pay.status, 403);
  assert.equal(pay.json.code, 'PASSWORD_CHANGE_REQUIRED');
  const me = await req('GET', '/api/me', { token: d.token });
  assert.equal(me.status, 200, '/api/me is allowed while gated');
});

test('permissions: a trainee cannot reach financial endpoints', async () => {
  const t = (await login('ahmad', '123456')).token;
  S.trainee = t;
  assert.equal((await req('GET', '/api/payments', { token: t })).status, 403);
  assert.equal((await req('GET', '/api/users', { token: t })).status, 403);
  assert.equal((await req('POST', '/api/users', { token: t, body: { username: 'x', password: 'abcdefgh', name: 'X', role: 'admin' } })).status, 403);
});

test('isolation: a trainee only sees their own InBody rows', async () => {
  const rows = (await req('GET', '/api/inbody?trainee=11', { token: S.trainee })).json;
  const others = (rows || []).filter((r) => r.traineeId !== 10);
  assert.equal(others.length, 0, 'trainee 10 must not see trainee 11 data');
});

test('money: invalid and negative amounts are rejected', async () => {
  const sub = (await req('POST', '/api/subscriptions', { token: S.admin, body: { traineeId: 11, totalSessions: 12, price: 300, startDate: '2026-08-01', endDate: '2026-09-01' } })).json;
  S.subId = sub.id;
  assert.equal((await req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: sub.id, amount: 'abc', date: '2026-08-10' } })).status, 400);
  assert.equal((await req('POST', '/api/subscriptions', { token: S.admin, body: { traineeId: 11, totalSessions: 12, price: -500, startDate: '2026-08-01', endDate: '2026-09-01' } })).status, 400);
});

test('money: overpayment beyond the subscription price is rejected', async () => {
  const ok = await req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: S.subId, amount: 300, date: '2026-08-10' } });
  assert.equal(ok.status, 200);
  const over = await req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: S.subId, amount: 50, date: '2026-08-11' } });
  assert.equal(over.status, 400, 'a paid-up subscription must reject further payment');
});

test('money: concurrent payments cannot exceed the price (single-process serialization)', async () => {
  const sub = (await req('POST', '/api/subscriptions', { token: S.admin, body: { traineeId: 12, totalSessions: 10, price: 100, startDate: '2026-08-01', endDate: '2026-09-01' } })).json;
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) =>
    req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: sub.id, amount: 100, date: `2026-08-0${i}`, method: `m${i}` } })));
  const accepted = results.filter((r) => r.status === 200 && r.json && !r.json.duplicate).length;
  assert.equal(accepted, 1, 'exactly one full payment should stick');
});

test('loyalty: a redemption cannot drive the balance negative', async () => {
  await req('POST', '/api/loyalty/award', { token: S.admin, body: { traineeId: 15, points: 100, reason: 'test' } });
  const reward = (await req('POST', '/api/rewards', { token: S.admin, body: { name: 'tshirt', cost: 100 } })).json;
  const tt = (await login('rima', '123456')).token;
  const r1 = (await req('POST', '/api/redemptions', { token: tt, body: { rewardId: reward.id } })).json;
  const r2 = (await req('POST', '/api/redemptions', { token: tt, body: { rewardId: reward.id } })).json;
  const [a1, a2] = await Promise.all([
    req('PUT', '/api/redemptions/' + r1.id, { token: S.admin, body: { action: 'approve' } }),
    req('PUT', '/api/redemptions/' + r2.id, { token: S.admin, body: { action: 'approve' } }),
  ]);
  const approved = [a1, a2].filter((r) => r.status === 200 && r.json.status === 'approved').length;
  assert.equal(approved, 1, 'only one of two 100-point redemptions on a 100 balance may pass');
  const bal = (await req('GET', '/api/loyalty/me', { token: tt })).json.balance;
  assert.ok(bal >= 0, 'balance must not go negative');
});

test('freeze limit is enforced on the write path', async () => {
  await req('PUT', '/api/branches/1', { token: S.admin, body: { freezeLimit: 1 } });
  const subs = (await req('GET', '/api/subscriptions?branch=1', { token: S.admin })).json;
  const active = (subs.rows || subs).filter((s) => s.status === 'active').slice(0, 3).map((s) => s.id);
  let overLimitRejected = false;
  for (const id of active) {
    const r = await req('POST', `/api/subscriptions/${id}/action`, { token: S.admin, body: { action: 'freeze' } });
    if (r.status === 400 && /حدّه/.test(r.json.error || '')) { overLimitRejected = true; break; }
  }
  assert.ok(overLimitRejected, 'freezing past the branch limit must be rejected');
});

test('uploads: unsigned access is forbidden, signed access works', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r = (await req('POST', '/api/trainee-photos', { token: S.admin, body: { traineeId: 11, imageBase64: png } })).json;
  const file = r.photos[0].image; const signed = r.photos[0].imageUrl;
  assert.equal((await fetch(base + '/uploads/' + file)).status, 403, 'unsigned must be 403');
  assert.equal((await fetch(base + signed)).status, 200, 'signed must be 200');
});

test('CSV export: a formula in a name is neutralised', async () => {
  await req('POST', '/api/onboard', { token: S.admin, body: {
    name: '=WEBSERVICE("https://evil/")', phone: '0599000222', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 12, price: 500, startDate: '2026-08-01', endDate: '2026-09-01' },
  } });
  const res = await fetch(base + '/api/reports/trainees.csv?cols=phone', { headers: { Authorization: 'Bearer ' + S.admin } });
  const text = await res.text();
  const dangerous = text.split('\n').flatMap((l) => l.split(',')).filter((c) => /^[=+@]/.test(c) && c.length > 3);
  assert.equal(dangerous.length, 0, 'no cell may begin with a raw formula character');
});

test('multi-currency: reports keep currencies separate', async () => {
  await req('PUT', '/api/branches/3', { token: S.admin, body: { currency: 'JOD' } });
  const dash = (await req('GET', '/api/dashboard/accountant?month=2026-08', { token: S.admin })).json;
  const anyMonth = Object.values(dash.byMonth || {})[0];
  assert.ok(anyMonth === undefined || (typeof anyMonth === 'object' && !Array.isArray(anyMonth)),
    'byMonth must be a per-currency map, not a mixed scalar');
});

test('anonymize: admin-only, needs confirmation, scrubs identity but keeps finance', async () => {
  assert.equal((await req('POST', '/api/users/10/anonymize', { token: S.trainee, body: { confirm: true } })).status, 403);
  const rana = (await login('rana', '123456')).token;
  assert.equal((await req('POST', '/api/users/10/anonymize', { token: rana, body: { confirm: true } })).status, 403);
  assert.equal((await req('POST', '/api/users/10/anonymize', { token: S.admin, body: {} })).status, 400, 'confirm required');
  const done = await req('POST', '/api/users/10/anonymize', { token: S.admin, body: { confirm: true } });
  assert.equal(done.status, 200);
  const users = (await req('GET', '/api/users?role=trainee', { token: S.admin })).json;
  const u = users.find((x) => x.id === 10);
  assert.equal(u.name, 'متدرب محذوف');
  assert.equal(u.phone, '');
  assert.equal((await req('GET', '/api/inbody?trainee=10', { token: S.admin })).json.length, 0, 'health data erased');
  const login10 = await login('ahmad', '123456');
  assert.ok(!login10.token, 'anonymized account can no longer log in');
});

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
  S.uploadFile = file;
});

test('uploads: the session fallback is for staff only — a trainee cannot pull a file by name', async () => {
  const auth = (token) => fetch(base + '/uploads/' + S.uploadFile, { headers: { Authorization: 'Bearer ' + token } });
  assert.equal((await auth(S.admin)).status, 200, 'staff session may read via the programmatic fallback');
  assert.equal((await auth(S.trainee)).status, 403, 'a trainee session must not read an upload by bare name');
});

test('isolation: a trainee cannot read another trainee\'s sessions via ?trainee', async () => {
  // المتدرب مقيّد بسجلّه — لا يتجاوزه بتمرير معرّف متدرب آخر في الرابط
  const r = await req('GET', '/api/sessions?trainee=11', { token: S.trainee });
  assert.equal(r.status, 200);
  const rows = r.json.rows || r.json || [];
  const leaked = rows.filter((s) => s.traineeId !== 10);
  assert.equal(leaked.length, 0, 'a trainee must never see another member\'s sessions');
});

test('CSV export: a formula in an expense label is neutralised in the monthly report', async () => {
  const month = new Date().toISOString().slice(0, 7);
  await req('POST', '/api/expenses', { token: S.admin, body: {
    month, branchId: 1, category: '=cmd|calc', label: '=HYPERLINK("http://evil","x")', amount: 5,
  } });
  const res = await fetch(base + '/api/reports/export.csv?month=' + month, { headers: { Authorization: 'Bearer ' + S.admin } });
  const text = await res.text();
  const dangerous = text.split('\n').flatMap((l) => l.split(',')).filter((c) => /^[=+@]/.test(c.trim()) && c.trim().length > 3);
  assert.equal(dangerous.length, 0, 'no report cell may begin with a raw formula character');
});

test('branch scope: a scoped accountant cannot edit a contract or appointment outside their branch', async () => {
  // عقد وموعد في الفرع 1
  const contract = (await req('POST', '/api/contracts', { token: S.admin, body: { branchId: 1, validDays: 30 } })).json;
  const appt = (await req('POST', '/api/appointments', { token: S.admin, body: { trainerId: 2, traineeId: 11, date: '2026-08-25', time: '10:00' } })).json;
  // نحصر رنا (محاسِبة) في الفرع 2
  assert.equal((await req('PUT', '/api/users/5', { token: S.admin, body: { branchId: 2 } })).status, 200);
  const rana = (await login('rana', '123456')).token;
  try {
    assert.equal((await req('PUT', '/api/contracts/' + contract.id, { token: rana, body: { note: 'x' } })).status, 403,
      'accountant scoped to branch 2 must not edit a branch-1 contract');
    assert.equal((await req('PUT', '/api/appointments/' + appt.id, { token: rana, body: { note: 'x' } })).status, 403,
      'accountant scoped to branch 2 must not edit a branch-1 appointment');
    assert.equal((await req('DELETE', '/api/appointments/' + appt.id, { token: rana })).status, 403,
      'accountant scoped to branch 2 must not delete a branch-1 appointment');
  } finally {
    // إعادة رنا لغير محصورة كي لا تتأثر بقية الاختبارات
    await req('PUT', '/api/users/5', { token: S.admin, body: { branchId: null } });
  }
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

/* ============================================================
   الموعد ≠ الحصة: كان المدربون يعلّمون الموعد «منفذًا» ظنًا أنه يسجّل
   الحصة — بلا خصم ولا سجل. الاختبارات تثبّت الصمّام والتسوية.
   ============================================================ */
test('appointment vs session: manual «done» is blocked; recording deducts, links, and settles', async () => {
  // متدرب جديد باشتراك فعّال معزول عن بقية الاختبارات
  const ob = (await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'متدرب التسوية', phone: '0599777001', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 10, price: 400, startDate: '2026-08-01', endDate: '2026-12-01' },
  } })).json;
  const tid = ob.user.id;
  const subId = ob.subscription.id;
  const remaining = async () => {
    const subs = (await req('GET', '/api/subscriptions?trainee=' + tid, { token: S.admin })).json;
    return subs.find((s) => s.id === subId).remaining;
  };
  const getAppt = async (id, date) => {
    const list = (await req('GET', `/api/appointments?from=${date}&to=${date}`, { token: S.admin })).json;
    return list.find((a) => a.id === id);
  };

  // 1) موعد مجدول لا يخصم شيئًا، وتعليمه «منفذًا» يدويًا مرفوض
  const a1 = (await req('POST', '/api/appointments', { token: S.admin, body: { trainerId: 2, traineeId: tid, date: '2026-08-20', time: '10:00' } })).json;
  assert.equal(await remaining(), 10, 'booking an appointment must not deduct');
  const deny = await req('PUT', '/api/appointments/' + a1.id, { token: S.admin, body: { status: 'done' } });
  assert.equal(deny.status, 400, 'manual «done» without a session must be rejected');
  assert.equal((await req('PUT', '/api/appointments/' + a1.id, { token: S.admin, body: { status: 'missed' } })).status, 400,
    'manual «missed» without a session must be rejected');

  // 2) تسجيل الحصة من الموعد: يخصم ويربط ويعلّم الموعد منفذًا
  const s1 = await req('POST', '/api/sessions', { token: S.admin, body: {
    traineeId: tid, trainerId: 2, date: '2026-08-20', time: '10:00', duration: 60, appointmentId: a1.id,
  } });
  assert.equal(s1.status, 200);
  assert.equal(await remaining(), 9, 'recording the session deducts exactly one');
  const a1After = await getAppt(a1.id, '2026-08-20');
  assert.equal(a1After.status, 'done');
  assert.equal(a1After.sessionId, s1.json.session.id, 'appointment links to its session');

  // 3) إدخال مزدوج قديم: حصة سُجّلت من غير الموعد — التسجيل من الموعد يربطها بلا خصم جديد
  const a2 = (await req('POST', '/api/appointments', { token: S.admin, body: { trainerId: 2, traineeId: tid, date: '2026-08-21', time: '17:00' } })).json;
  await req('POST', '/api/sessions', { token: S.admin, body: { traineeId: tid, trainerId: 2, date: '2026-08-21', time: '17:30', duration: 60 } });
  assert.equal(await remaining(), 8, 'the standalone session deducted one');
  const link = await req('POST', '/api/sessions', { token: S.admin, body: {
    traineeId: tid, trainerId: 2, date: '2026-08-21', time: '17:30', duration: 60, appointmentId: a2.id,
  } });
  assert.equal(link.status, 200);
  assert.equal(link.json.linked, true, 'duplicate from an unlinked appointment links instead of erroring');
  assert.equal(await remaining(), 8, 'linking must not deduct a second session');
  const a2After = await getAppt(a2.id, '2026-08-21');
  assert.equal(a2After.status, 'done');
  assert.equal(a2After.sessionId, link.json.session.id);

  // 4) الحصة المربوطة بموعدٍ ما لا تُربط بموعد آخر — يبقى الرفض 409
  const a3 = (await req('POST', '/api/appointments', { token: S.admin, body: { trainerId: 2, traineeId: tid, date: '2026-08-21', time: '17:30' } })).json;
  const steal = await req('POST', '/api/sessions', { token: S.admin, body: {
    traineeId: tid, trainerId: 2, date: '2026-08-21', time: '17:30', duration: 60, appointmentId: a3.id,
  } });
  assert.equal(steal.status, 409, 'a session already linked to another appointment is not re-linked');
  assert.equal(steal.json.duplicate, true);

  // 5) موعد Test لزائر بلا حساب: التعليم اليدوي «منفذ» يبقى مسموحًا (لا رصيد له)
  const test1 = (await req('POST', '/api/appointments', { token: S.admin, body: {
    trainerId: 2, kind: 'test', prospectName: 'زائر تجربة', date: '2026-08-22', time: '12:00',
  } })).json;
  assert.equal((await req('PUT', '/api/appointments/' + test1.id, { token: S.admin, body: { status: 'done' } })).status, 200,
    'prospect Test appointments are still settled manually');

  // 6) تعديل موعد قديم عُلّم «منفذًا» بلا حصة لا يُرفض (المنع على التحويل فقط)
  const keep = await req('PUT', '/api/appointments/' + test1.id, { token: S.admin, body: { status: 'done', note: 'تصحيح ملاحظة' } });
  assert.equal(keep.status, 200, 'saving an already-done appointment stays possible');
});

test('trainees report: payments=1 exports the FULL payments log, not only the last payment', async () => {
  // متدرب باشتراك — عليه دفعتان بتاريخين مختلفين
  const ob = (await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'متدرب الدفعات', phone: '0599777002', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 12, price: 600, startDate: '2026-08-01', endDate: '2026-12-01' },
  } })).json;
  const subId = ob.subscription.id;
  assert.equal((await req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: subId, amount: 200, date: '2026-08-05', method: 'كاش' } })).status, 200);
  assert.equal((await req('POST', '/api/payments', { token: S.admin, body: { subscriptionId: subId, amount: 150, date: '2026-08-18', method: 'تحويل' } })).status, 200);

  const res = await fetch(base + '/api/reports/trainees.csv?payments=1', { headers: { Authorization: 'Bearer ' + S.admin } });
  const text = await res.text();
  assert.ok(text.includes('سجل الدفعات كاملًا'), 'the payments-log section must exist');
  const logPart = text.slice(text.indexOf('سجل الدفعات كاملًا'));
  const mine = logPart.split('\r\n').filter((l) => l.includes('متدرب الدفعات'));
  assert.equal(mine.length, 2, 'both payments must appear, not only the last one');
  assert.ok(mine.some((l) => l.includes('2026-08-05') && l.includes('200')), 'first payment present');
  assert.ok(mine.some((l) => l.includes('2026-08-18') && l.includes('150')), 'second payment present');
  // بدون payments=1 لا يظهر القسم — التقرير القديم كما هو
  const res2 = await fetch(base + '/api/reports/trainees.csv', { headers: { Authorization: 'Bearer ' + S.admin } });
  assert.ok(!(await res2.text()).includes('سجل الدفعات كاملًا'), 'section only appears when requested');
});

test('sessions: measurements can be added AFTER recording — saved to InBody, updated not duplicated', async () => {
  const ob = (await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'متدرب القياسات', phone: '0599777003', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 10, price: 500, startDate: '2026-08-01', endDate: '2026-12-01' },
  } })).json;
  const tid = ob.user.id;

  // حصة بلا أي قياسات وقت التسجيل
  const s = (await req('POST', '/api/sessions', { token: S.admin, body: {
    traineeId: tid, trainerId: 2, date: '2026-08-19', time: '09:00', duration: 60,
  } })).json.session;
  const readings = async () => (await req('GET', '/api/inbody?trainee=' + tid, { token: S.admin })).json
    .filter((r) => r.date === '2026-08-19');
  assert.equal((await readings()).length, 0, 'no reading yet');

  // القياس بعد الحصة: تعديلها بالقياسات يُنشئ قراءة InBody
  const put1 = await req('PUT', '/api/sessions/' + s.id, { token: S.admin, body: { weight: 82.5, bodyFatPct: 21, waist: 90 } });
  assert.equal(put1.status, 200);
  assert.equal(put1.json.measured, true);
  let rs = await readings();
  assert.equal(rs.length, 1, 'one reading created after the fact');
  assert.equal(rs[0].weight, 82.5);
  assert.equal(rs[0].bodyFatPct, 21);

  // تعديل ثانٍ يحدّث القراءة نفسها — لا يكررها ولا يمحو ما لم يُرسل
  const put2 = await req('PUT', '/api/sessions/' + s.id, { token: S.admin, body: { weight: 82.5, bodyFatPct: 20.5 } });
  assert.equal(put2.json.measured, true);
  rs = await readings();
  assert.equal(rs.length, 1, 'still a single session reading');
  assert.equal(rs[0].bodyFatPct, 20.5, 'updated value');
  assert.equal(rs[0].waist, 90, 'unsent field kept');

  // قراءة يدوية بنفس اليوم لا تُمسّ
  await req('POST', '/api/inbody', { token: S.admin, body: { traineeId: tid, date: '2026-08-19', weight: 83, notes: 'قياس يدوي' } });
  await req('PUT', '/api/sessions/' + s.id, { token: S.admin, body: { weight: 82 } });
  const all = await readings();
  assert.equal(all.length, 2, 'manual reading coexists');
  const manual = all.find((r) => r.notes === 'قياس يدوي');
  assert.equal(manual.weight, 83, 'manual reading untouched');
});

test('targets: trainer-performance metrics become measurable goals (hours, office, stories, referred)', async () => {
  const month = '2026-08';
  // سجل يوم للمدرب عمر: حضور 5 ساعات + 4 ستوريات + 2 ريلز
  assert.equal((await req('POST', '/api/trainer-logs', { token: S.admin, body: {
    trainerId: 2, date: '2026-08-20', checkIn: '09:00', checkOut: '14:00', stories: 4, reels: 2,
  } })).status, 200);
  // زبون جاء عن طريق المدرب — Onboarding بمصدره
  await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'زبون محال', phone: '0599777004', branchId: 1, goal: 'loss', sourceTrainerId: 2,
    subscription: { totalSessions: 8, price: 300, startDate: '2026-08-01', endDate: '2026-11-01' },
  } });
  for (const [metric, value] of [['hours', 3], ['officeHours', 40], ['stories', 10], ['reels', 8], ['referred', 5]]) {
    assert.equal((await req('POST', '/api/targets', { token: S.admin, body: {
      scope: 'trainer', refId: 2, metric, period: month, value,
    } })).status, 200, metric + ' target accepted');
  }
  const targets = (await req('GET', '/api/targets', { token: S.admin })).json;
  const of = (m) => targets.find((t) => t.scope === 'trainer' && t.refId === 2 && t.metric === m && t.period === month);
  assert.equal(of('hours').metricLabel, 'ساعات التدريب');
  assert.ok(of('hours').actual >= 1, 'hours computed from delivered sessions');
  assert.ok(of('officeHours').actual >= 5, 'office hours include the check-in/out log');
  assert.ok(of('stories').actual >= 4, 'stories include the day log');
  assert.ok(of('reels').actual >= 2, 'reels include the day log');
  assert.ok(of('referred').actual >= 1, 'referred counts sourced onboarding');

  // KPI الشهري للمدرب يلتقط الأهداف الجديدة تلقائيًا
  const kpis = (await req('GET', '/api/kpi?month=' + month, { token: S.admin })).json;
  const k = kpis.find((x) => x.trainerId === 2);
  assert.ok(k && k.targetsPct !== null, 'trainer KPI includes the new metric targets');
});

test('legacy debts: a debt can be recorded and settled with no prior subscription', async () => {
  /* «الديون مش لازم يكون في مدخل سابق لاشتراك عشان يدخلها» — نظامٌ جديد
     وعلى مشتركين متأخرات من قبله، فلا اشتراك في القاعدة تُعلَّق عليه. */
  const onboard = await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'مدين قديم', phone: '0599777010', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 4, price: 200, startDate: '2026-08-01', endDate: '2026-10-01' },
  } });
  assert.equal(onboard.status, 200, JSON.stringify(onboard.json));
  const tid = onboard.json.user.id;

  const created = await req('POST', '/api/legacy-debts', { token: S.admin, body: {
    traineeId: tid, amount: 500, date: '2025-11-02', reason: 'متبقٍ من اشتراك ٢٠٢٥',
  } });
  assert.equal(created.status, 200, 'legacy debt accepted with no subscription');
  const debtId = created.json.id;

  // يظهر في مصدر الديون الواحد مع ديون الاشتراكات
  const debts = (await req('GET', '/api/debts', { token: S.admin })).json;
  const row = debts.rows.find((r) => r.legacyDebtId === debtId);
  assert.ok(row, 'legacy debt appears in /api/debts');
  assert.equal(row.remaining, 500);
  assert.equal(row.subscriptionId, null, 'it is not tied to any subscription');
  assert.ok(debts.totals.legacyCount >= 1);

  // يُسدَّد بدفعة كبقية الديون
  const pay = await req('POST', '/api/payments', { token: S.admin, body: {
    legacyDebtId: debtId, amount: 200, date: '2026-08-21', method: 'كاش',
  } });
  assert.equal(pay.status, 200, 'payment against a legacy debt is accepted');
  assert.equal(pay.json.subscriptionId, null);

  const after = (await req('GET', '/api/debts', { token: S.admin })).json;
  assert.equal(after.rows.find((r) => r.legacyDebtId === debtId).remaining, 300);

  // ولا تُقبل دفعة أكبر من المتبقي
  const over = await req('POST', '/api/payments', { token: S.admin, body: {
    legacyDebtId: debtId, amount: 1000, date: '2026-08-21',
  } });
  assert.equal(over.status, 400, 'over-payment on a legacy debt is refused');

  // ولا يُخفَّض أصل الدين تحت ما سُدِّد منه
  const shrink = await req('PUT', '/api/legacy-debts/' + debtId, { token: S.admin, body: { amount: 50 } });
  assert.equal(shrink.status, 400, 'principal cannot drop below what was paid');

  // وسداد الدين القديم تحصيلٌ حقيقي يظهر في ملف صاحبه
  const overview = (await req('GET', `/api/trainee/${tid}/overview`, { token: S.admin })).json;
  assert.equal(overview.finance.legacyRemaining, 300);
  assert.ok(overview.payments.some((p) => p.legacyDebtId === debtId));
});

test('targets: a personal goal can be set for the accountant and for sales', async () => {
  const month = '2026-08';
  const acc = (await req('GET', '/api/users?role=accountant', { token: S.admin })).json;
  assert.ok(acc.length, 'an accountant account exists');
  const accId = acc[0].id;

  // التحصيل على المحاسبة يُقاس بفروعها (by=branch) لا بما سجّلته بيدها
  assert.equal((await req('POST', '/api/targets', { token: S.admin, body: {
    scope: 'user', refId: accId, metric: 'revenue', period: month, value: 5000,
  } })).status, 200, 'accountant revenue target accepted');

  // ومؤشرات المبيعات تُقاس على من سجّل الأرقام (by=person)
  for (const metric of ['leads', 'tests', 'closingRate', 'unfreezes', 'renewals']) {
    assert.equal((await req('POST', '/api/targets', { token: S.admin, body: {
      scope: 'user', refId: accId, metric, period: month, value: metric === 'closingRate' ? 40 : 10,
    } })).status, 200, metric + ' target accepted on a person');
  }

  // مؤشر تدريبي بحت لا يُقبل على نطاق «فرع» — لا معنى له هناك
  const bad = await req('POST', '/api/targets', { token: S.admin, body: {
    scope: 'branch', refId: 1, metric: 'sessions', period: month, value: 10,
  } });
  assert.equal(bad.status, 200, 'sessions is measurable per branch');
  const badScope = await req('POST', '/api/targets', { token: S.admin, body: {
    scope: 'trainer', refId: 2, metric: 'closingRate', period: month, value: 40,
  } });
  assert.equal(badScope.status, 400, 'closing rate is not a trainer metric');

  // وصاحب هدفٍ غير موجود يُرفض بدل أن يظهر صفرًا أبدًا
  const ghost = await req('POST', '/api/targets', { token: S.admin, body: {
    scope: 'user', refId: 999999, metric: 'revenue', period: month, value: 100,
  } });
  assert.equal(ghost.status, 400, 'a target on a non-existent person is refused');

  // والمحاسبة تظهر في KPI الموظفين بنسبتها — لا المدربون وحدهم
  const kpis = (await req('GET', '/api/kpi?month=' + month, { token: S.admin })).json;
  const mine = kpis.find((k) => k.trainerId === accId);
  assert.ok(mine, 'the accountant now has a KPI row');
  assert.equal(mine.role, 'accountant');
  assert.ok(mine.targetsPct !== null, 'and a measured completion percentage');

  // ونفس الأهداف تظهر مجمَّعة في لوحة KPI الواحدة
  const board = (await req('GET', '/api/kpi/board?month=' + month, { token: S.admin })).json;
  assert.ok((board.staffTargets || []).some((x) => x.userId === accId), 'staff targets are on the KPI board');
});

test('search: latest=1 lists each person once with their newest subscription', async () => {
  /* «البحث يبطلع الاسم مره وحده والاشتراك الاخير»: من جدّد ثلاث مرات كان
     يملأ نتيجة البحث بثلاثة صفوف باسمه. */
  const ob = await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'مجدد كثير', phone: '0599777020', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 8, price: 400, startDate: '2026-01-01', endDate: '2026-03-01' },
  } });
  const tid = ob.json.user.id;
  for (const [start, end] of [['2026-03-02', '2026-05-01'], ['2026-05-02', '2026-08-01']]) {
    assert.equal((await req('POST', '/api/subscriptions', { token: S.admin, body: {
      traineeId: tid, totalSessions: 8, price: 400, startDate: start, endDate: end,
    } })).status, 200);
  }
  const all = (await req('GET', '/api/subscriptions?limit=50&search=' + encodeURIComponent('مجدد كثير'), { token: S.admin })).json;
  assert.equal(all.rows.filter((r) => r.traineeId === tid).length, 3, 'without latest=1 every renewal is a row');

  const latest = (await req('GET', '/api/subscriptions?limit=50&latest=1&search=' + encodeURIComponent('مجدد كثير'), { token: S.admin })).json;
  const mine = latest.rows.filter((r) => r.traineeId === tid);
  assert.equal(mine.length, 1, 'the name appears exactly once');
  assert.equal(mine[0].startDate, '2026-05-02', 'and it is the newest subscription');
  assert.equal(mine[0].subsCount, 3, 'with the count of all their subscriptions');
});

test('trainer permissions: prices and renewal are granted by name, not to every trainer', async () => {
  const trainers = (await req('GET', '/api/users?role=trainer', { token: S.admin })).json;
  const t = trainers[0];

  // مدرب عادي: بلا أسعار وبلا تجديد وبلا عقود
  await req('POST', '/api/users/' + t.id + '/credentials', { token: S.admin, body: {} });
  const setPass = await req('PUT', '/api/users/' + t.id, { token: S.admin, body: { password: 'trainer-pass-1' } });
  assert.equal(setPass.status, 200);
  let d = await login(t.username, 'trainer-pass-1');
  // كلمة مرور من الإدارة مؤقتة — يغيّرها ثم يعمل
  await req('POST', '/api/me/password', { token: d.token, body: { current: 'trainer-pass-1', next: 'trainer-own-pass-1' } });
  d = await login(t.username, 'trainer-own-pass-1');
  const tok = d.token;

  const pkgs = (await req('GET', '/api/packages', { token: tok })).json;
  assert.ok(pkgs.length, 'a trainer still sees the packages');
  assert.ok(pkgs.every((p) => p.price === undefined), 'but never their prices');
  assert.equal((await req('GET', '/api/contracts', { token: tok })).status, 403, 'and no contracts');

  const trainees = (await req('GET', '/api/users?role=trainee', { token: S.admin })).json;
  const withSub = (await req('GET', '/api/subscriptions?limit=1', { token: S.admin })).json.rows[0];
  const renew = { traineeId: withSub.traineeId, totalSessions: 8, price: 400, startDate: '2026-09-01', endDate: '2026-11-01' };
  assert.equal((await req('POST', '/api/subscriptions', { token: tok, body: renew })).status, 403, 'and cannot renew');

  // بعد المنح: يرى الأسعار والعقود ويجدّد لمشترك سابق في فرعه
  assert.equal((await req('PUT', '/api/users/' + t.id, { token: S.admin, body: { canRenew: true } })).status, 200);
  d = await login(t.username, 'trainer-own-pass-1'); // منح الصلاحية أنهى جلسته
  const tok2 = d.token;
  const pkgs2 = (await req('GET', '/api/packages', { token: tok2 })).json;
  assert.ok(pkgs2.some((p) => p.price !== undefined), 'renewal permission implies seeing prices');
  assert.equal((await req('GET', '/api/contracts', { token: tok2 })).status, 200, 'and the contracts page opens');

  const sameBranch = (await req('GET', '/api/subscriptions?limit=200', { token: S.admin })).json.rows
    .find((r) => trainees.some((x) => x.id === r.traineeId && x.branchId === t.branchId));
  if (sameBranch) {
    const ok = await req('POST', '/api/subscriptions', { token: tok2, body: {
      traineeId: sameBranch.traineeId, totalSessions: 8, price: 400, startDate: '2026-09-01', endDate: '2026-11-01',
    } });
    assert.equal(ok.status, 200, 'a granted trainer renews for an existing member in their branch');
  }

  // لكنه لا يفتح زبونًا جديدًا: من لا اشتراك سابق له
  const fresh = await req('POST', '/api/users', { token: S.admin, body: {
    username: 'freshtrainee1', password: 'temp-pass-123', name: 'بلا اشتراك', role: 'trainee', branchId: t.branchId,
  } });
  const blocked = await req('POST', '/api/subscriptions', { token: tok2, body: {
    traineeId: fresh.json.id, totalSessions: 8, price: 400, startDate: '2026-09-01', endDate: '2026-11-01',
  } });
  assert.equal(blocked.status, 403, 'opening a brand-new client stays with reception');

  // والصلاحية لا تُمنح لدور يملكها أصلًا
  const admins = (await req('GET', '/api/users?role=admin', { token: S.admin })).json;
  assert.equal((await req('PUT', '/api/users/' + admins[0].id, { token: S.admin, body: { canRenew: true } })).status, 400);
});

test('inbody: a wrong reading can be corrected and deleted', async () => {
  const ob = await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'قراءة خاطئة', phone: '0599777030', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 4, price: 200, startDate: '2026-08-01', endDate: '2026-10-01' },
  } });
  const tid = ob.json.user.id;
  const created = await req('POST', '/api/inbody', { token: S.admin, body: {
    traineeId: tid, date: '2026-08-10', weight: 780, bodyFatPct: 30,
  } });
  assert.equal(created.status, 200);
  const id = created.json.id;

  // «التعديل ع inbody بادخال الارقام اذا صار في خربطة»
  const fixed = await req('PUT', '/api/inbody/' + id, { token: S.admin, body: { weight: 78, bodyFatPct: 30 } });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.json.weight, 78);

  // والخانة المُفرَّغة تُمحى بدل أن تبقى قيمة خاطئة
  const cleared = await req('PUT', '/api/inbody/' + id, { token: S.admin, body: { weight: 78, bodyFatPct: '' } });
  assert.equal(cleared.json.bodyFatPct, null);

  assert.equal((await req('DELETE', '/api/inbody/' + id, { token: S.admin })).status, 200);
  const left = (await req('GET', '/api/inbody?trainee=' + tid, { token: S.admin })).json;
  assert.equal(left.length, 0);
});

test('security: bodies cannot smuggle extra fields or pollute prototypes', async () => {
  /* من أشهر ما يسقط فيه الكود المولَّد: نسخُ جسم الطلب كما هو إلى الصف
     المخزَّن. هنا كل صفٍّ يُبنى بحقوله المسمّاة، فما لم يُسمَّ لا يُخزَّن. */
  const ob = await req('POST', '/api/onboard', { token: S.admin, body: {
    name: 'حقول مهرّبة', phone: '0599777040', branchId: 1, goal: 'loss',
    subscription: { totalSessions: 4, price: 200, startDate: '2026-08-01', endDate: '2026-10-01' },
  } });
  const tid = ob.json.user.id;

  // معرّف مفروض وفرع مفروض لا يُقبلان — الفرع يُقرأ من حساب صاحب الدين
  const debt = await req('POST', '/api/legacy-debts', { token: S.admin, body: {
    traineeId: tid, amount: 100, id: 999999, createdBy: 4242, branchId: 99999, evil: 'x',
  } });
  assert.equal(debt.status, 200);
  assert.notEqual(debt.json.id, 999999, 'a forced id is ignored');
  assert.equal(debt.json.branchId, 1, 'the branch comes from the trainee, not the body');
  assert.equal(debt.json.evil, undefined, 'unknown fields are not stored');

  // إنشاء مستخدم بصلاحيات مهرّبة في جسم الطلب
  const u = await req('POST', '/api/users', { token: S.admin, body: {
    username: 'smuggle1', password: 'temp-pass-123', name: 'S', role: 'trainee',
    canRenew: true, canSeePrices: true, mfaExempt: true, active: true,
  } });
  assert.equal(u.json.canRenew, false, 'permissions are not granted at creation from the body');
  assert.equal(u.json.mfaExempt, false);

  // تلويث النموذج الأولي عبر JSON — يمرّ الطلب ولا يُلوَّث شيء
  const res = await fetch(base + '/api/legacy-debts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.admin },
    body: `{"traineeId":${tid},"amount":25,"__proto__":{"pollutedByTest":"yes"}}`,
  });
  assert.ok(res.status < 500);
  assert.equal({}.pollutedByTest, undefined, 'Object.prototype stays clean');
});

test('security: a trainee sees only their own records, whatever id they ask for', async () => {
  // متدربان ننشئهما هنا — لا نعتمد على حالة تركتها اختبارات سابقة
  const mk = async (username, name, phone) => (await req('POST', '/api/onboard', { token: S.admin, body: {
    name, phone, branchId: 1, goal: 'loss',
    subscription: { totalSessions: 4, price: 200, startDate: '2026-08-01', endDate: '2026-10-01' },
  } })).json.user;
  const a = await mk('bolaA', 'ضحية أ', '0599777051');
  const b = await mk('bolaB', 'ضحية ب', '0599777052');
  assert.ok(a && b, 'two trainees created');

  await req('PUT', '/api/users/' + a.id, { token: S.admin, body: { password: 'trainee-temp-1' } });
  const temp = await login(a.username, 'trainee-temp-1');
  assert.ok(temp.token, 'the trainee can log in with the temporary password');
  await req('POST', '/api/me/password', {
    token: temp.token, body: { current: 'trainee-temp-1', next: 'trainee-own-pass-1' },
  });
  const tok = (await login(a.username, 'trainee-own-pass-1')).token;
  assert.ok(tok, 'and again with their own');

  // سجلّ صحّي لكلٍّ منهما كي يكون هناك ما يُسرَّب أصلًا
  for (const t of [a, b]) {
    await req('POST', '/api/inbody', { token: S.admin, body: { traineeId: t.id, date: '2026-08-05', weight: 80 } });
  }

  // ملف غيره مرفوض صراحةً
  assert.equal((await req('GET', `/api/trainee/${b.id}/overview`, { token: tok })).status, 403);

  // وطلبُ سجلات غيره بالمعرّف يعود بسجلاته هو لا بسجلات غيره
  for (const path of ['/api/inbody', '/api/meal-plans', '/api/trainee-photos', '/api/sessions', '/api/subscriptions']) {
    const r = await req('GET', `${path}?trainee=${b.id}`, { token: tok });
    const rows = Array.isArray(r.json) ? r.json : (r.json && r.json.rows) || [];
    assert.ok(rows.every((x) => x.traineeId === undefined || x.traineeId === a.id),
      `${path} never returns another trainee's rows`);
  }

  // والرصد الداخلي (النتائج والمشاكل) لا يفتح للمتدرب إطلاقًا
  assert.equal((await req('GET', `/api/trainee-flags?trainee=${b.id}`, { token: tok })).status, 403);

  // ولا كتابة على أحد
  assert.equal((await req('POST', '/api/inbody', { token: tok, body: { traineeId: b.id, date: '2026-08-01', weight: 70 } })).status, 403);
  assert.equal((await req('PUT', '/api/users/' + b.id, { token: tok, body: { name: 'x' } })).status, 403);
});

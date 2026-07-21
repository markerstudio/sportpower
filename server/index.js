/* ============================================================
   سبورت باور — الخادم والواجهات البرمجية
   نظام داخلي: إدارة / مدرب / محاسب / متدرب
   تخزين: Postgres للإنتاج (DATABASE_URL) أو ملف JSON محليًا.
   ============================================================ */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = process.env.VERCEL ? '/tmp/sportpower-uploads' : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 ساعة

app.disable('x-powered-by');

/* ---------- ترويسات أمان ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/marketing', express.static(path.join(__dirname, '..', 'marketing')));
app.use('/uploads', express.static(UPLOADS));

/* غلاف موحد لالتقاط الأخطاء في المعالجات غير المتزامنة */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ============================================================
   المصادقة والصلاحيات
   ============================================================ */
const auth = h(async (req, res, next) => {
  const raw = (req.headers.authorization || '').replace('Bearer ', '');
  if (!raw) return res.status(401).json({ error: 'غير مصرّح — يرجى تسجيل الدخول.' });
  const hash = Store.sha256(raw);
  const tokens = await Store.all('tokens');
  const t = tokens.find((x) => x.hash === hash);
  if (!t || t.expiresAt < Date.now()) {
    if (t) await Store.remove('tokens', t.id);
    return res.status(401).json({ error: 'انتهت الجلسة — يرجى تسجيل الدخول من جديد.' });
  }
  const user = await Store.get('users', t.userId);
  if (!user) return res.status(401).json({ error: 'المستخدم غير موجود.' });
  // تمديد الجلسة إذا اقترب انتهاؤها
  if (t.expiresAt - Date.now() < TOKEN_TTL_MS / 2) {
    await Store.update('tokens', t.id, { expiresAt: Date.now() + TOKEN_TTL_MS });
  }
  req.user = user;
  req.tokenId = t.id;
  next();
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليست لديك صلاحية لهذه العملية.' });
    }
    next();
  };
}

const publicUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, phone: u.phone, branchId: u.branchId, trainerId: u.trainerId, goal: u.goal, specialty: u.specialty, joinedAt: u.joinedAt, mustChangePassword: !!u.mustChangePassword });

/* ---------- تحديد معدل محاولات الدخول ---------- */
const loginAttempts = new Map(); // key → { count, resetAt }
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || rec.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}

const CURRENCIES = ['ILS', 'JOD', 'USD'];

async function getSettings() {
  const rows = await Store.all('settings');
  return rows[0] || { currency: 'ILS' };
}

app.get('/api/config', h(async (req, res) => {
  const settings = await getSettings();
  res.json({
    demo: Store.DEMO_MODE,
    storage: Store.IS_PG ? 'postgres' : 'file',
    currency: CURRENCIES.includes(settings.currency) ? settings.currency : 'ILS',
    // ملف على بيئة لحظية = جلسات وبيانات غير ثابتة — الواجهة تعرض تحذيرًا
    volatile: !Store.IS_PG && !!process.env.VERCEL,
  });
}));

app.put('/api/settings', auth, requireRole('admin'), h(async (req, res) => {
  const { currency } = req.body || {};
  if (!CURRENCIES.includes(currency)) return res.status(400).json({ error: 'عملة غير مدعومة — المتاح: شيكل ILS، دينار JOD، دولار USD.' });
  const rows = await Store.all('settings');
  const saved = rows[0]
    ? await Store.update('settings', rows[0].id, { currency })
    : await Store.insert('settings', { currency });
  res.json(saved);
}));

app.get('/api/health', h(async (req, res) => {
  await Store.all('branches');
  res.json({ ok: true, storage: Store.IS_PG ? 'postgres' : 'file' });
}));

app.post('/api/login', h(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const { username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (rateLimited('ip:' + ip, 30, 15 * 60 * 1000) || rateLimited('user:' + uname, 8, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجددًا.' });
  }
  const users = await Store.all('users');
  const user = users.find((u) => u.username === uname);
  if (!user || !Store.verifyPassword(password || '', user.password)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }
  loginAttempts.delete('user:' + uname);
  const token = crypto.randomBytes(32).toString('hex');
  await Store.insert('tokens', { hash: Store.sha256(token), userId: user.id, expiresAt: Date.now() + TOKEN_TTL_MS });
  // تنظيف الجلسات المنتهية
  await Store.removeWhere('tokens', (t) => t.expiresAt < Date.now());
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/logout', auth, h(async (req, res) => {
  await Store.remove('tokens', req.tokenId);
  res.json({ ok: true });
}));

app.get('/api/me', auth, h(async (req, res) => res.json(publicUser(req.user))));

app.post('/api/me/password', auth, h(async (req, res) => {
  const { current, next } = req.body || {};
  if (!Store.verifyPassword(current || '', req.user.password)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
  }
  if (!next || String(next).length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' });
  }
  await Store.update('users', req.user.id, { password: Store.hashPassword(next), mustChangePassword: false });
  // إنهاء بقية الجلسات لهذا المستخدم
  await Store.removeWhere('tokens', (t) => t.userId === req.user.id && t.id !== req.tokenId);
  res.json({ ok: true });
}));

/* ============================================================
   أدوات مشتركة
   ============================================================ */
const monthOf = (dateStr) => (dateStr || '').slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);

function subStatus(sub) {
  const remaining = sub.totalSessions - sub.usedSessions;
  if (remaining <= 0 || sub.endDate < todayStr()) return 'expired';
  return 'active';
}
function subExpiring(sub) {
  if (subStatus(sub) === 'expired') return false;
  const remaining = sub.totalSessions - sub.usedSessions;
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  return remaining <= 2 || sub.endDate <= soon.toISOString().slice(0, 10);
}

/* ساعات التدريب: الساعات المميزة (مدرب + تاريخ + ساعة البدء) — شخصان بنفس الساعة = ساعة واحدة */
function trainerHours(sessions) {
  const set = new Set(sessions.map((s) => `${s.trainerId}|${s.date}|${s.time.slice(0, 2)}`));
  return set.size;
}

async function notify(userId, text, type) {
  await Store.insert('notifications', { userId, text, date: todayStr(), read: false, type: type || 'info' });
}

/* إشعارات الاشتراكات القريبة من الانتهاء — تُحدّث عند طلب إشعارات الإدارة */
async function refreshSubscriptionAlerts(adminId) {
  const { subscriptions, users, notifications } = await Store.load('subscriptions', 'users', 'notifications');
  for (const sub of subscriptions.filter(subExpiring)) {
    const t = users.find((u) => u.id === sub.traineeId);
    if (!t) continue;
    const text = `اشتراك ${t.name} يوشك على الانتهاء (متبقي ${sub.totalSessions - sub.usedSessions} حصة — ينتهي ${sub.endDate}).`;
    if (!notifications.some((n) => n.userId === adminId && n.text === text)) {
      await Store.insert('notifications', { userId: adminId, text, date: todayStr(), read: false, type: 'subscription' });
    }
  }
}

const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function saveImage(imageBase64, prefix) {
  if (!imageBase64) return null;
  const m = imageBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) return null;
  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOADS, name), Buffer.from(m[2], 'base64'));
  return name;
}

/* ============================================================
   الفروع والمستخدمون
   ============================================================ */
app.get('/api/branches', auth, h(async (req, res) => res.json(await Store.all('branches'))));

app.post('/api/branches', auth, requireRole('admin'), h(async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفرع مطلوب.' });
  res.json(await Store.insert('branches', { name, address: address || '', phone: phone || '' }));
}));

app.get('/api/users', auth, requireRole('admin', 'accountant', 'trainer', 'nutritionist'), h(async (req, res) => {
  let list = (await Store.all('users')).map(publicUser);
  if (req.query.role) list = list.filter((u) => u.role === req.query.role);
  if (req.query.branch) list = list.filter((u) => u.branchId === Number(req.query.branch));
  if (req.user.role === 'trainer' && req.query.role === 'trainee') {
    list = list.filter((u) => u.trainerId === req.user.id);
  }
  res.json(list);
}));

app.post('/api/users', auth, requireRole('admin'), h(async (req, res) => {
  const { username, password, name, role, phone, branchId, trainerId, goal, specialty } = req.body;
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'الحقول الأساسية مطلوبة.' });
  if (!['trainee', 'trainer', 'accountant', 'nutritionist', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'نوع مستخدم غير صحيح.' });
  }
  if (String(password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل.' });
  const users = await Store.all('users');
  if (users.some((u) => u.username === String(username).toLowerCase())) {
    return res.status(400).json({ error: 'اسم المستخدم موجود مسبقًا.' });
  }
  const user = await Store.insert('users', {
    username: String(username).toLowerCase(), password: Store.hashPassword(password),
    name, role, phone: phone || '', branchId: branchId || null,
    trainerId: trainerId || null, goal: goal || null, specialty: specialty || null,
    joinedAt: todayStr(),
  });
  res.json(publicUser(user));
}));

/* تعديل مستخدم (الإدارة): إعادة إسناد مدرب/فرع/هدف/بيانات أساسية */
app.put('/api/users/:id', auth, requireRole('admin'), h(async (req, res) => {
  const user = await Store.get('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
  const patch = {};
  ['name', 'phone', 'goal', 'specialty'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;
  if (req.body.trainerId !== undefined) {
    const trainerId = Number(req.body.trainerId) || null;
    if (trainerId) {
      const trainer = await Store.get('users', trainerId);
      if (!trainer || trainer.role !== 'trainer') return res.status(400).json({ error: 'المدرب غير موجود.' });
    }
    patch.trainerId = trainerId;
  }
  const updated = await Store.update('users', user.id, patch);
  if (user.role === 'trainee' && patch.trainerId && patch.trainerId !== user.trainerId) {
    await notify(patch.trainerId, `أُسند إليك متدرب جديد: ${updated.name}.`, 'info');
    await notify(user.id, 'تم تحديث مدربك المسؤول — اطّلع على مواعيدك القادمة.', 'info');
  }
  res.json(publicUser(updated));
}));

/* ============================================================
   الاشتراكات
   ============================================================ */
app.get('/api/subscriptions', auth, h(async (req, res) => {
  const { subscriptions, users } = await Store.load('subscriptions', 'users');
  let list = subscriptions;
  if (req.user.role === 'trainee') list = list.filter((s) => s.traineeId === req.user.id);
  if (req.user.role === 'trainer') {
    const mine = users.filter((u) => u.trainerId === req.user.id).map((u) => u.id);
    list = list.filter((s) => mine.includes(s.traineeId));
  }
  if (req.query.branch) list = list.filter((s) => s.branchId === Number(req.query.branch));
  res.json(list.map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions })));
}));

app.post('/api/subscriptions', auth, requireRole('admin'), h(async (req, res) => {
  const { traineeId, totalSessions, price, startDate, endDate } = req.body;
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!totalSessions || !price || !startDate || !endDate) return res.status(400).json({ error: 'كل الحقول مطلوبة.' });
  const sub = await Store.insert('subscriptions', {
    traineeId: trainee.id, branchId: trainee.branchId,
    totalSessions: Number(totalSessions), usedSessions: 0, price: Number(price),
    startDate, endDate, status: 'active',
  });
  await notify(trainee.id, `تم تفعيل اشتراك جديد: ${sub.totalSessions} حصة حتى ${sub.endDate}.`, 'subscription');
  res.json(sub);
}));

/* ============================================================
   الحصص — منطق الخصم والاحتساب (معاملة ذرّية)
   ============================================================ */
app.get('/api/sessions', auth, h(async (req, res) => {
  let list = await Store.all('sessions');
  if (req.user.role === 'trainer') list = list.filter((s) => s.trainerId === req.user.id);
  if (req.user.role === 'trainee') list = list.filter((s) => s.traineeId === req.user.id);
  if (req.query.month) list = list.filter((s) => monthOf(s.date) === req.query.month);
  if (req.query.branch) list = list.filter((s) => s.branchId === Number(req.query.branch));
  if (req.query.trainee) list = list.filter((s) => s.traineeId === Number(req.query.trainee));
  res.json(list);
}));

app.post('/api/sessions', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
  const { traineeId, date, time, duration, style, notes, weight, appointmentId } = req.body;
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!date || !time || !duration) return res.status(400).json({ error: 'التاريخ والساعة والمدة مطلوبة.' });
  if (req.user.role === 'trainer' && trainee.trainerId !== req.user.id) {
    return res.status(403).json({ error: 'هذا المتدرب غير مرتبط بك.' });
  }

  const trainerId = req.user.role === 'trainer' ? req.user.id : (Number(req.body.trainerId) || trainee.trainerId);

  const subs = (await Store.all('subscriptions'))
    .filter((s) => s.traineeId === trainee.id && subStatus(s) === 'active')
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (!subs.length) return res.status(400).json({ error: `لا يوجد اشتراك فعّال للمتدرب ${trainee.name} — يرجى التجديد أولًا.` });

  /* معاملة ذرّية: قفل الاشتراك، إعادة التحقق، الخصم، وتسجيل الحصة معًا */
  const result = await Store.transaction(async (tx) => {
    const sub = await tx.getForUpdate('subscriptions', subs[0].id);
    if (!sub || subStatus(sub) !== 'active') throw Object.assign(new Error('نفد رصيد الاشتراك — يرجى التجديد.'), { status: 400 });
    const session = await tx.insert('sessions', {
      traineeId: trainee.id, trainerId, branchId: trainee.branchId,
      date, time, duration: Number(duration), style: style || '', notes: notes || '',
      weight: weight ? Number(weight) : null, subscriptionId: sub.id,
      createdAt: new Date().toISOString(),
    });
    const used = sub.usedSessions + 1;
    await tx.update('subscriptions', sub.id, {
      usedSessions: used,
      status: sub.totalSessions - used <= 0 ? 'expired' : sub.status,
    });
    if (appointmentId) {
      const appt = await tx.get('appointments', Number(appointmentId));
      if (appt) await tx.update('appointments', appt.id, { status: 'done', sessionId: session.id });
    }
    return { session, remaining: sub.totalSessions - used, total: sub.totalSessions };
  });

  await notify(trainee.id, `تم تسجيل حصتك بتاريخ ${date} — متبقي ${result.remaining} حصة من أصل ${result.total}.`, 'session');
  if (result.remaining <= 2 && result.remaining > 0) {
    const admin = (await Store.all('users')).find((u) => u.role === 'admin');
    if (admin) await notify(admin.id, `اشتراك ${trainee.name} يوشك على الانتهاء (متبقي ${result.remaining} حصة).`, 'subscription');
  }
  res.json(result);
}));

/* ============================================================
   المدفوعات — للمحاسب والإدارة
   ============================================================ */
app.get('/api/payments', auth, requireRole('accountant', 'admin'), h(async (req, res) => {
  const { payments, subscriptions } = await Store.load('payments', 'subscriptions');
  let list = payments;
  if (req.query.month) list = list.filter((p) => monthOf(p.date) === req.query.month);
  if (req.query.branch) {
    const subIds = subscriptions.filter((s) => s.branchId === Number(req.query.branch)).map((s) => s.id);
    list = list.filter((p) => subIds.includes(p.subscriptionId));
  }
  res.json(list);
}));

app.post('/api/payments', auth, requireRole('accountant', 'admin'), h(async (req, res) => {
  const { subscriptionId, amount, date, method, note } = req.body;
  const sub = await Store.get('subscriptions', Number(subscriptionId));
  if (!sub) return res.status(400).json({ error: 'الاشتراك غير موجود.' });
  if (!amount || Number(amount) <= 0 || !date) return res.status(400).json({ error: 'المبلغ والتاريخ مطلوبان.' });
  const payment = await Store.insert('payments', {
    subscriptionId: sub.id, traineeId: sub.traineeId,
    amount: Number(amount), date, method: method || 'كاش', note: note || '', createdBy: req.user.id,
  });
  res.json(payment);
}));

app.put('/api/payments/:id', auth, requireRole('accountant', 'admin'), h(async (req, res) => {
  const payment = await Store.get('payments', req.params.id);
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة.' });
  const patch = {};
  ['amount', 'date', 'method', 'note'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = k === 'amount' ? Number(req.body[k]) : req.body[k];
  });
  res.json(await Store.update('payments', payment.id, patch));
}));

/* ============================================================
   Calendar — المواعيد
   ============================================================ */
app.get('/api/appointments', auth, h(async (req, res) => {
  let list = await Store.all('appointments');
  if (req.user.role === 'trainer') list = list.filter((a) => a.trainerId === req.user.id);
  if (req.user.role === 'trainee') list = list.filter((a) => a.traineeId === req.user.id);
  if (req.query.from) list = list.filter((a) => a.date >= req.query.from);
  if (req.query.to) list = list.filter((a) => a.date <= req.query.to);
  if (req.query.trainer) list = list.filter((a) => a.trainerId === Number(req.query.trainer));
  res.json(list);
}));

app.post('/api/appointments', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
  const { trainerId, traineeId, date, time, duration, note } = req.body;
  const tid = req.user.role === 'trainer' ? req.user.id : Number(trainerId);
  const trainer = await Store.get('users', tid);
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainer || trainer.role !== 'trainer' || !trainee || trainee.role !== 'trainee') {
    return res.status(400).json({ error: 'المدرب أو المتدرب غير موجود.' });
  }
  if (!date || !time) return res.status(400).json({ error: 'التاريخ والساعة مطلوبان.' });
  const appt = await Store.insert('appointments', {
    trainerId: trainer.id, traineeId: trainee.id,
    branchId: trainee.branchId, date, time, duration: Number(duration) || 60,
    status: 'scheduled', note: note || '',
  });
  if (req.user.id !== trainer.id) await notify(trainer.id, `موعد جديد: ${trainee.name} يوم ${date} الساعة ${time}.`, 'appointment');
  await notify(trainee.id, `تم حجز موعد تدريب لك يوم ${date} الساعة ${time} مع ${trainer.name}.`, 'appointment');
  res.json(appt);
}));

app.put('/api/appointments/:id', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
  const appt = await Store.get('appointments', req.params.id);
  if (!appt) return res.status(404).json({ error: 'الموعد غير موجود.' });
  if (req.user.role === 'trainer' && appt.trainerId !== req.user.id) {
    return res.status(403).json({ error: 'لا يمكنك تعديل مواعيد مدرب آخر.' });
  }
  const before = `${appt.date} ${appt.time}`;
  const patch = {};
  ['date', 'time', 'duration', 'status', 'note'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = k === 'duration' ? Number(req.body[k]) : req.body[k];
  });
  const updated = await Store.update('appointments', appt.id, patch);
  const after = `${updated.date} ${updated.time}`;
  if (before !== after) {
    if (req.user.id !== appt.trainerId) await notify(appt.trainerId, `تم تعديل موعد من ${before} إلى ${after}.`, 'appointment');
    await notify(appt.traineeId, `تم تعديل موعد تدريبك من ${before} إلى ${after}.`, 'appointment');
  }
  res.json(updated);
}));

/* ============================================================
   InBody — رفع وقراءة وحفظ ومقارنة
   ============================================================ */
app.get('/api/inbody', auth, h(async (req, res) => {
  let list = await Store.all('inbody');
  if (req.user.role === 'trainee') list = list.filter((r) => r.traineeId === req.user.id);
  else if (req.query.trainee) list = list.filter((r) => r.traineeId === Number(req.query.trainee));
  res.json(list.sort((a, b) => a.date.localeCompare(b.date)));
}));

app.post('/api/inbody', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
  const { traineeId, date, weight, bodyFatPct, muscleMass, fatMass, water, bmi, score, notes, imageBase64 } = req.body;
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!date || !weight) return res.status(400).json({ error: 'التاريخ والوزن مطلوبان على الأقل.' });
  const reading = await Store.insert('inbody', {
    traineeId: trainee.id, date,
    weight: Number(weight), bodyFatPct: numOrNull(bodyFatPct), muscleMass: numOrNull(muscleMass),
    fatMass: numOrNull(fatMass), water: numOrNull(water), bmi: numOrNull(bmi), score: numOrNull(score),
    notes: notes || '', image: saveImage(imageBase64, `inbody-${trainee.id}`),
  });
  await notify(trainee.id, `تمت إضافة قراءة InBody جديدة بتاريخ ${date}.`, 'inbody');
  res.json(reading);
}));

/* محاولة قراءة الصورة تلقائيًا OCR — مع رجوع آمن للإدخال اليدوي */
app.post('/api/inbody/ocr', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'الصورة مطلوبة.' });
  let Tesseract;
  try { Tesseract = require('tesseract.js'); }
  catch (e) { return res.json({ ocr: false, reason: 'محرك OCR غير مثبت — يرجى الإدخال اليدوي.' }); }
  try {
    const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const result = await Promise.race([
      Tesseract.recognize(buf, 'eng'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000)),
    ]);
    const text = result.data.text || '';
    const grab = (patterns) => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return parseFloat(m[1]);
      }
      return null;
    };
    const fields = {
      weight: grab([/weight[^\d]*(\d+\.?\d*)/i, /wt[^\d]*(\d+\.?\d*)/i]),
      bodyFatPct: grab([/pbf[^\d]*(\d+\.?\d*)/i, /percent\s*body\s*fat[^\d]*(\d+\.?\d*)/i, /body\s*fat\s*\(?%?\)?[^\d]*(\d+\.?\d*)/i]),
      muscleMass: grab([/smm[^\d]*(\d+\.?\d*)/i, /skeletal\s*muscle[^\d]*(\d+\.?\d*)/i, /muscle\s*mass[^\d]*(\d+\.?\d*)/i]),
      fatMass: grab([/body\s*fat\s*mass[^\d]*(\d+\.?\d*)/i, /bfm[^\d]*(\d+\.?\d*)/i, /fat\s*mass[^\d]*(\d+\.?\d*)/i]),
      water: grab([/total\s*body\s*water[^\d]*(\d+\.?\d*)/i, /tbw[^\d]*(\d+\.?\d*)/i, /water[^\d]*(\d+\.?\d*)/i]),
      bmi: grab([/bmi[^\d]*(\d+\.?\d*)/i]),
      score: grab([/score[^\d]*(\d+)/i]),
    };
    res.json({ ocr: true, fields, raw: text.slice(0, 2000) });
  } catch (e) {
    res.json({ ocr: false, reason: 'تعذّرت القراءة التلقائية (' + e.message + ') — يرجى الإدخال اليدوي.' });
  }
}));

/* ============================================================
   مكتبة التغذية
   ============================================================ */
app.get('/api/meals', auth, h(async (req, res) => {
  let list = await Store.all('meals');
  const q = req.query;
  if (q.type) list = list.filter((m) => m.type === q.type);
  if (q.goal) list = list.filter((m) => m.goal === q.goal);
  if (q.maxCalories) list = list.filter((m) => m.calories <= Number(q.maxCalories));
  if (q.minProtein) list = list.filter((m) => m.protein >= Number(q.minProtein));
  if (q.search) list = list.filter((m) => m.name.includes(q.search) || (m.ingredients || '').includes(q.search));
  if (req.user.role === 'trainee' && !q.goal && !q.all) list = list.filter((m) => m.goal === req.user.goal);
  res.json(list);
}));

app.post('/api/meals', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
  const { name, type, goal, calories, protein, carbs, fat, ingredients, preparation, imageBase64 } = req.body;
  if (!name || !type || !goal || !calories) return res.status(400).json({ error: 'الاسم والنوع والهدف والسعرات مطلوبة.' });
  const meal = await Store.insert('meals', {
    name, type, goal,
    calories: Number(calories), protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0,
    ingredients: ingredients || '', preparation: preparation || '',
    image: saveImage(imageBase64, 'meal'), createdBy: req.user.id,
  });
  res.json(meal);
}));

app.get('/api/meal-plans', auth, h(async (req, res) => {
  const { mealPlans, meals } = await Store.load('mealPlans', 'meals');
  let list = mealPlans;
  if (req.user.role === 'trainee') list = list.filter((p) => p.traineeId === req.user.id);
  else if (req.query.trainee) list = list.filter((p) => p.traineeId === Number(req.query.trainee));
  res.json(list.map((p) => ({ ...p, meal: meals.find((m) => m.id === p.mealId) })));
}));

app.post('/api/meal-plans', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
  const { traineeId, mealId, slot } = req.body;
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!(await Store.get('meals', Number(mealId)))) return res.status(400).json({ error: 'الوجبة غير موجودة.' });
  const plan = await Store.insert('mealPlans', { traineeId: trainee.id, mealId: Number(mealId), slot: slot || 'lunch' });
  await notify(trainee.id, 'تم تحديث برنامجك الغذائي — اطّلع على وجباتك الجديدة.', 'nutrition');
  res.json(plan);
}));

app.delete('/api/meal-plans/:id', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
  await Store.remove('mealPlans', req.params.id);
  res.json({ ok: true });
}));

/* ============================================================
   الإشعارات
   ============================================================ */
app.get('/api/notifications', auth, h(async (req, res) => {
  if (req.user.role === 'admin') await refreshSubscriptionAlerts(req.user.id);
  const list = (await Store.all('notifications')).filter((n) => n.userId === req.user.id).sort((a, b) => b.id - a.id);
  res.json(list.slice(0, 60));
}));

app.post('/api/notifications/read', auth, h(async (req, res) => {
  const mine = (await Store.all('notifications')).filter((n) => n.userId === req.user.id && !n.read);
  for (const n of mine) await Store.update('notifications', n.id, { read: true });
  res.json({ ok: true });
}));

/* ============================================================
   لوحات المعلومات
   ============================================================ */
app.get('/api/dashboard/admin', auth, requireRole('admin'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const inBranch = (x) => !branch || x.branchId === branch;
  const { sessions, subscriptions, payments, users } = await Store.load('sessions', 'subscriptions', 'payments', 'users');

  const brSessions = sessions.filter(inBranch);
  const monthSessions = brSessions.filter((s) => monthOf(s.date) === month);
  const todaySessions = brSessions.filter((s) => s.date === todayStr());

  const subs = subscriptions.filter(inBranch).map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions }));
  const activeTrainees = new Set(subs.filter((s) => s.status === 'active').map((s) => s.traineeId)).size;

  const subIds = subscriptions.filter(inBranch).map((s) => s.id);
  const monthPayments = payments.filter((p) => subIds.includes(p.subscriptionId) && monthOf(p.date) === month);
  const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const totalDue = subs.reduce((s, x) => s + x.price, 0);
  const totalPaid = payments.filter((p) => subIds.includes(p.subscriptionId)).reduce((s, p) => s + p.amount, 0);

  const trainers = users.filter((u) => u.role === 'trainer' && inBranch(u)).map((t) => {
    const ts = monthSessions.filter((s) => s.trainerId === t.id);
    return {
      id: t.id, name: t.name, branchId: t.branchId, specialty: t.specialty,
      sessions: ts.length, persons: ts.length,
      uniqueTrainees: new Set(ts.map((s) => s.traineeId)).size,
      hours: trainerHours(ts),
    };
  });

  const daily = {};
  monthSessions.forEach((s) => { daily[s.date] = (daily[s.date] || 0) + 1; });

  res.json({
    month, branch,
    kpis: {
      sessionsToday: todaySessions.length,
      sessionsMonth: monthSessions.length,
      activeTrainees,
      expiring: subs.filter((s) => s.expiring).length,
      expired: subs.filter((s) => s.status === 'expired').length,
      collectedMonth: collected,
      outstanding: Math.max(0, totalDue - totalPaid),
    },
    trainers, daily,
    expiringList: subs.filter((s) => s.expiring || s.status === 'expired').map((s) => ({
      ...s, traineeName: (users.find((u) => u.id === s.traineeId) || {}).name,
    })),
  });
}));

app.get('/api/dashboard/trainer', auth, requireRole('trainer'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const { sessions, appointments, users } = await Store.load('sessions', 'appointments', 'users');
  const mine = sessions.filter((s) => s.trainerId === req.user.id);
  const monthSessions = mine.filter((s) => monthOf(s.date) === month);
  const todayAppts = appointments
    .filter((a) => a.trainerId === req.user.id && a.date === todayStr() && a.status === 'scheduled')
    .sort((a, b) => a.time.localeCompare(b.time));

  const now = new Date();
  const soon = todayAppts.filter((a) => {
    const [hh, mm] = a.time.split(':').map(Number);
    const diff = (hh * 60 + mm) - (now.getHours() * 60 + now.getMinutes());
    return diff >= 0 && diff <= 120;
  });
  const nameOf = (id) => (users.find((u) => u.id === id) || {}).name;

  res.json({
    month,
    kpis: {
      sessionsMonth: monthSessions.length,
      persons: monthSessions.length,
      uniqueTrainees: new Set(monthSessions.map((s) => s.traineeId)).size,
      hours: trainerHours(monthSessions),
      today: todayAppts.length,
    },
    todayAppointments: todayAppts.map((a) => ({ ...a, traineeName: nameOf(a.traineeId) })),
    upcomingSoon: soon.map((a) => ({ ...a, traineeName: nameOf(a.traineeId) })),
    recentSessions: monthSessions.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10),
  });
}));

app.get('/api/dashboard/accountant', auth, requireRole('accountant', 'admin'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const { subscriptions, payments, users } = await Store.load('subscriptions', 'payments', 'users');

  const subs = subscriptions
    .filter((s) => !branch || s.branchId === branch)
    .map((s) => {
      const paid = payments.filter((p) => p.subscriptionId === s.id).reduce((sum, p) => sum + p.amount, 0);
      const trainee = users.find((u) => u.id === s.traineeId) || {};
      return {
        id: s.id, traineeId: s.traineeId, traineeName: trainee.name, branchId: s.branchId,
        price: s.price, paid, remaining: Math.max(0, s.price - paid),
        startDate: s.startDate, endDate: s.endDate,
        status: subStatus(s), renewed: subscriptions.filter((x) => x.traineeId === s.traineeId).length > 1,
      };
    });

  const monthPayments = payments
    .filter((p) => monthOf(p.date) === month)
    .filter((p) => !branch || (subscriptions.find((s) => s.id === p.subscriptionId) || {}).branchId === branch);

  const byMonth = {};
  payments.forEach((p) => {
    const sb = subscriptions.find((s) => s.id === p.subscriptionId) || {};
    if (branch && sb.branchId !== branch) return;
    byMonth[monthOf(p.date)] = (byMonth[monthOf(p.date)] || 0) + p.amount;
  });

  res.json({
    month, branch,
    kpis: {
      collectedMonth: monthPayments.reduce((s, p) => s + p.amount, 0),
      paymentsCount: monthPayments.length,
      outstanding: subs.reduce((s, x) => s + x.remaining, 0),
      expired: subs.filter((s) => s.status === 'expired').length,
      renewed: subs.filter((s) => s.renewed).length,
    },
    subscriptions: subs,
    payments: monthPayments,
    byMonth,
  });
}));

/* صفحة المتدرب — نظرة شاملة */
app.get('/api/trainee/:id/overview', auth, h(async (req, res) => {
  const id = Number(req.params.id);
  const { users, subscriptions, sessions, appointments, inbody, mealPlans, meals, branches } = await Store.load(
    'users', 'subscriptions', 'sessions', 'appointments', 'inbody', 'mealPlans', 'meals', 'branches');

  const trainee = users.find((u) => u.id === id && u.role === 'trainee');
  if (!trainee) return res.status(404).json({ error: 'المتدرب غير موجود.' });

  const allowed = ['admin', 'accountant', 'nutritionist'].includes(req.user.role)
    || (req.user.role === 'trainee' && req.user.id === id)
    || (req.user.role === 'trainer' && trainee.trainerId === req.user.id);
  if (!allowed) return res.status(403).json({ error: 'ليست لديك صلاحية.' });

  const subs = subscriptions.filter((s) => s.traineeId === id)
    .map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions }));
  const current = subs.filter((s) => s.status === 'active').sort((a, b) => a.endDate.localeCompare(b.endDate))[0] || subs[subs.length - 1];
  const mySessions = sessions.filter((s) => s.traineeId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const appts = appointments.filter((a) => a.traineeId === id && a.date >= todayStr() && a.status === 'scheduled')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const readings = inbody.filter((r) => r.traineeId === id).sort((a, b) => a.date.localeCompare(b.date));
  const plans = mealPlans.filter((p) => p.traineeId === id).map((p) => ({ ...p, meal: meals.find((m) => m.id === p.mealId) }));

  res.json({
    trainee: publicUser(trainee),
    trainerName: (users.find((u) => u.id === trainee.trainerId) || {}).name,
    branchName: (branches.find((b) => b.id === trainee.branchId) || {}).name,
    subscription: current || null,
    subscriptions: subs,
    sessions: mySessions,
    appointments: appts.map((a) => ({ ...a, trainerName: (users.find((u) => u.id === a.trainerId) || {}).name })),
    inbody: readings,
    mealPlans: plans,
    notes: mySessions.filter((s) => s.notes).slice(0, 6).map((s) => ({ date: s.date, note: s.notes })),
  });
}));

/* ============================================================
   التقارير الشهرية + التصدير
   ============================================================ */
async function buildMonthlyReport(month, branch) {
  const { sessions, subscriptions, payments, users, branches } = await Store.load(
    'sessions', 'subscriptions', 'payments', 'users', 'branches');
  const inBranch = (x) => !branch || x.branchId === branch;
  const monthSessions = sessions.filter((s) => monthOf(s.date) === month && inBranch(s));

  const trainers = users.filter((u) => u.role === 'trainer' && inBranch(u)).map((t) => {
    const ts = monthSessions.filter((s) => s.trainerId === t.id);
    return {
      trainer: t.name, branch: (branches.find((b) => b.id === t.branchId) || {}).name,
      sessions: ts.length, persons: ts.length,
      uniqueTrainees: new Set(ts.map((s) => s.traineeId)).size,
      hours: trainerHours(ts),
    };
  });

  const branchRows = branches.filter((b) => !branch || b.id === branch).map((b) => {
    const bs = monthSessions.filter((s) => s.branchId === b.id);
    const subIds = subscriptions.filter((s) => s.branchId === b.id).map((s) => s.id);
    const pays = payments.filter((p) => subIds.includes(p.subscriptionId) && monthOf(p.date) === month);
    return {
      branch: b.name, sessions: bs.length,
      hours: trainerHours(bs),
      activeTrainees: new Set(subscriptions.filter((s) => s.branchId === b.id && subStatus(s) === 'active').map((s) => s.traineeId)).size,
      collected: pays.reduce((s, p) => s + p.amount, 0),
    };
  });

  return { month, trainers, branches: branchRows, totalSessions: monthSessions.length };
}

app.get('/api/reports/monthly', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  res.json(await buildMonthlyReport(month, branch));
}));

/* تصدير CSV (يفتح في Excel — مع BOM لدعم العربية) */
app.get('/api/reports/export.csv', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const r = await buildMonthlyReport(month, branch);
  const lines = [];
  lines.push(`تقرير شهر ${month}`);
  lines.push('');
  lines.push('المدرب,الفرع,عدد الحصص,عدد الأشخاص,متدربون فريدون,ساعات التدريب');
  r.trainers.forEach((t) => lines.push(`${t.trainer},${t.branch},${t.sessions},${t.persons},${t.uniqueTrainees},${t.hours}`));
  lines.push('');
  lines.push('الفرع,عدد الحصص,ساعات التدريب,متدربون فعالون,التحصيل');
  r.branches.forEach((b) => lines.push(`${b.branch},${b.sessions},${b.hours},${b.activeTrainees},${b.collected}`));
  const csv = '﻿' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sportpower-report-${month}.csv"`);
  res.send(csv);
}));

/* ============================================================ */
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));

/* معالج الأخطاء الموحد */
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('خطأ في الخادم:', err);
  res.status(status).json({ error: status >= 500 ? 'حدث خطأ في الخادم — حاول مجددًا.' : err.message });
});

/* SPA fallback */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

if (require.main === module) {
  Store.initOnce()
    .then(() => app.listen(PORT, () => console.log(
      `SportPower system running → http://localhost:${PORT} [storage: ${Store.IS_PG ? 'postgres' : 'file'}${Store.DEMO_MODE ? ', demo' : ''}]`)))
    .catch((e) => { console.error('تعذّر تهيئة قاعدة البيانات:', e.message); process.exit(1); });
}

module.exports = app;

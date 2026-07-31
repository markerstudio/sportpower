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
const growth = require('./growth');
const clients = require('./clients');

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

/* ملفات PWA — بأنواع وترويسات صحيحة */
app.get('/manifest.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.join(__dirname, '..', 'public', 'manifest.webmanifest'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache'); // ليصل تحديث العامل فورًا
  res.sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
});

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
  // بحث مفهرس بالبصمة — لا يُسحب جدول الجلسات كاملًا في كل طلب
  const t = (await Store.find('tokens', { hash }, { limit: 1 }))[0];
  if (!t || t.expiresAt < Date.now()) {
    if (t) await Store.remove('tokens', t.id);
    return res.status(401).json({ error: 'انتهت الجلسة — يرجى تسجيل الدخول من جديد.' });
  }
  const user = await Store.get('users', t.userId);
  if (!user) return res.status(401).json({ error: 'المستخدم غير موجود.' });
  if (user.active === false) return res.status(401).json({ error: 'هذا الحساب معطّل.' });
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

const publicUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, phone: u.phone, branchId: u.branchId, trainerId: u.trainerId, goal: u.goal, specialty: u.specialty, joinedAt: u.joinedAt, birthDate: u.birthDate || null, mustChangePassword: !!u.mustChangePassword, active: u.active !== false });

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

app.get('/api/settings', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  res.json(await getSettings());
}));

app.put('/api/settings', auth, requireRole('admin'), h(async (req, res) => {
  const patch = {};
  if (req.body.currency !== undefined) {
    if (!CURRENCIES.includes(req.body.currency)) return res.status(400).json({ error: 'عملة غير مدعومة — المتاح: شيكل ILS، دينار JOD، دولار USD.' });
    patch.currency = req.body.currency;
  }
  if (req.body.frozenMessage !== undefined) patch.frozenMessage = String(req.body.frozenMessage).slice(0, 1000);
  if (req.body.waCountryCode !== undefined) patch.waCountryCode = String(req.body.waCountryCode).replace(/\D/g, '').slice(0, 4);
  // نقاط الولاء: قيم قابلة للتحكم من الإدارة
  ['ptsSession', 'ptsRenewal', 'ptsReferral'].forEach((k) => {
    if (req.body[k] !== undefined) {
      const v = Math.trunc(Number(req.body[k]));
      if (v >= 0) patch[k] = v;
    }
  });
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'لا شيء لتعديله.' });
  const rows = await Store.all('settings');
  const saved = rows[0]
    ? await Store.update('settings', rows[0].id, patch)
    : await Store.insert('settings', { currency: 'ILS', ...patch });
  res.json(saved);
}));

/* فحص الصحة — يستخدمه المزوّد والمراقبة، ويؤكد أن النشر طبّق الترحيلات */
app.get('/api/health', h(async (req, res) => {
  const t = process.hrtime.bigint();
  await Store.count('branches', null);
  const latencyMs = Math.round(Number(process.hrtime.bigint() - t) / 1e6);
  res.json({
    ok: true,
    storage: Store.IS_PG ? 'postgres' : 'file',
    schemaVersion: await Store.schemaVersion(),
    latencyMs,
  });
}));

app.post('/api/login', h(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const { username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (rateLimited('ip:' + ip, 30, 15 * 60 * 1000) || rateLimited('user:' + uname, 8, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجددًا.' });
  }
  const user = (await Store.find('users', { username: uname }, { limit: 1 }))[0];
  if (!user || !Store.verifyPassword(password || '', user.password)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }
  if (user.active === false) {
    return res.status(403).json({ error: 'هذا الحساب معطّل — تواصل مع الإدارة.' });
  }
  loginAttempts.delete('user:' + uname);
  const token = crypto.randomBytes(32).toString('hex');
  await Store.insert('tokens', { hash: Store.sha256(token), userId: user.id, expiresAt: Date.now() + TOKEN_TTL_MS });
  // تنظيف الجلسات المنتهية
  await Store.deleteWhere('tokens', { expiresAt: { lt: Date.now() } });
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
  await Store.deleteWhere('tokens', { userId: req.user.id, id: { ne: req.tokenId } });
  res.json({ ok: true });
}));

/* ============================================================
   أدوات مشتركة
   ============================================================ */
const monthOf = (dateStr) => (dateStr || '').slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);

function subStatus(sub) {
  if (sub.status === 'frozen') return 'frozen';
  if (sub.status === 'cancelled') return 'cancelled';
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
  const { subscriptions, users } = await Store.load('subscriptions', 'users');
  // إشعارات الاشتراكات السابقة لهذا المدير فقط — استعلام واحد بدل مسح كل الإشعارات
  const existing = new Set((await Store.find('notifications', { userId: adminId, type: 'subscription' }))
    .map((n) => n.text));
  for (const sub of subscriptions.filter(subExpiring)) {
    const t = users.find((u) => u.id === sub.traineeId);
    if (!t) continue;
    const text = `اشتراك ${t.name} يوشك على الانتهاء (متبقي ${sub.totalSessions - sub.usedSessions} حصة — ينتهي ${sub.endDate}).`;
    if (!existing.has(text)) {
      await Store.insert('notifications', { userId: adminId, text, date: todayStr(), read: false, type: 'subscription' });
      existing.add(text);
    }
  }
}

const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/* ترقيم اختياري للقوائم الكبيرة: ?limit=&offset= (بلا حد افتراضيًا) */
function pageOpts(req, extra = {}) {
  const opts = { ...extra };
  const limit = Number(req.query.limit);
  const offset = Number(req.query.offset);
  if (Number.isFinite(limit) && limit > 0) opts.limit = Math.min(limit, 1000);
  if (Number.isFinite(offset) && offset > 0) opts.offset = offset;
  return opts;
}

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

app.put('/api/branches/:id', auth, requireRole('admin'), h(async (req, res) => {
  const branch = await Store.get('branches', req.params.id);
  if (!branch) return res.status(404).json({ error: 'الفرع غير موجود.' });
  const patch = {};
  ['name', 'address', 'phone'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
  res.json(await Store.update('branches', branch.id, patch));
}));

app.delete('/api/branches/:id', auth, requireRole('admin'), h(async (req, res) => {
  const branch = await Store.get('branches', req.params.id);
  if (!branch) return res.status(404).json({ error: 'الفرع غير موجود.' });
  const { users, subscriptions } = await Store.load('users', 'subscriptions');
  if (users.some((u) => u.branchId === branch.id) || subscriptions.some((s) => s.branchId === branch.id)) {
    return res.status(400).json({ error: 'لا يمكن حذف فرع مرتبط بمستخدمين أو اشتراكات — انقلهم أولًا.' });
  }
  await Store.remove('branches', branch.id);
  res.json({ ok: true });
}));

app.get('/api/users', auth, requireRole('admin', 'accountant', 'trainer', 'nutritionist'), h(async (req, res) => {
  let list = (await Store.all('users')).map(publicUser);
  if (req.query.role) list = list.filter((u) => u.role === req.query.role);
  if (req.query.branch) list = list.filter((u) => u.branchId === Number(req.query.branch));
  // المدربون بالتناوب: كل مدرب يرى كل المتدربين
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

/* تعديل مستخدم (الإدارة): البيانات الأساسية + التفعيل/التعطيل + إعادة تعيين كلمة المرور */
app.put('/api/users/:id', auth, requireRole('admin'), h(async (req, res) => {
  const user = await Store.get('users', req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
  const patch = {};
  ['name', 'phone', 'goal', 'specialty'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;

  // تفعيل / تعطيل الحساب (يمنع تسجيل الدخول ويُنهي الجلسات)
  if (req.body.active !== undefined) {
    if (user.id === req.user.id && req.body.active === false) {
      return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الحالي.' });
    }
    patch.active = !!req.body.active;
  }

  // إعادة تعيين كلمة المرور من الإدارة
  if (req.body.password !== undefined) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل.' });
    patch.password = Store.hashPassword(req.body.password);
    patch.mustChangePassword = user.id !== req.user.id;
  }

  const updated = await Store.update('users', user.id, patch);
  if (patch.active === false || patch.password) {
    await Store.deleteWhere('tokens', { userId: user.id });
  }
  res.json(publicUser(updated));
}));

/* ============================================================
   Onboarding — تسجيل زبون جديد بخطوة واحدة:
   حساب + اشتراك + دفعة أولى + أول موعد (اختياريان)
   ============================================================ */
app.post('/api/onboard', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  const { name, phone, birthDate, branchId, goal, subscription, payment, appointment } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المتدرب مطلوب.' });
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'رقم الجوال مطلوب (يُستخدم لاسم المستخدم وواتساب).' });
  if (!subscription || !subscription.totalSessions || !subscription.price || !subscription.startDate || !subscription.endDate) {
    return res.status(400).json({ error: 'بيانات الاشتراك (الحصص والقيمة والتواريخ) مطلوبة.' });
  }
  if (payment && Number(payment.amount) > Number(subscription.price)) {
    return res.status(400).json({ error: 'الدفعة الأولى أكبر من قيمة الاشتراك.' });
  }
  let trainer = null;
  if (appointment && appointment.trainerId) {
    trainer = await Store.get('users', Number(appointment.trainerId));
    if (!trainer || trainer.role !== 'trainer') return res.status(400).json({ error: 'مدرب الموعد الأول غير موجود.' });
    if (!appointment.date || !appointment.time) return res.status(400).json({ error: 'تاريخ وساعة الموعد الأول مطلوبان.' });
  }

  // اسم مستخدم من رقم الجوال + كلمة مرور تلقائية تُعرض مرة واحدة
  const users = await Store.all('users');
  const digits = String(phone).replace(/\D/g, '');
  let username = digits || 'client';
  while (users.some((u) => u.username === username)) {
    username = (digits || 'client') + '-' + crypto.randomBytes(2).toString('hex');
  }
  const password = 'sp-' + crypto.randomBytes(4).toString('hex');

  const pkg = subscription.packageId ? await Store.get('packages', Number(subscription.packageId)) : null;

  const result = await Store.transaction(async (tx) => {
    const user = await tx.insert('users', {
      username, password: Store.hashPassword(password), role: 'trainee',
      name: String(name).trim(), phone: String(phone).trim(),
      birthDate: birthDate || null, branchId: Number(branchId) || null,
      goal: goal || 'loss', joinedAt: todayStr(), mustChangePassword: true,
    });
    const sub = await tx.insert('subscriptions', {
      traineeId: user.id, branchId: user.branchId,
      totalSessions: Number(subscription.totalSessions), usedSessions: 0,
      price: Number(subscription.price),
      startDate: subscription.startDate, endDate: subscription.endDate, status: 'active',
      packageId: pkg ? pkg.id : null, packageName: pkg ? pkg.name : null,
    });
    await tx.insert('subEvents', {
      subscriptionId: sub.id, traineeId: user.id, branchId: user.branchId, type: 'new', date: todayStr(),
    });
    let pay = null;
    if (payment && Number(payment.amount) > 0) {
      pay = await tx.insert('payments', {
        subscriptionId: sub.id, traineeId: user.id, branchId: user.branchId,
        amount: Number(payment.amount), date: todayStr(),
        method: payment.method || 'كاش', note: 'دفعة الاشتراك عند التسجيل', createdBy: req.user.id,
      });
    }
    let appt = null;
    if (trainer) {
      appt = await tx.insert('appointments', {
        trainerId: trainer.id, traineeId: user.id, branchId: user.branchId,
        date: appointment.date, time: appointment.time,
        duration: Number(appointment.duration) || 60, status: 'scheduled', note: 'أول حصة — Onboarding',
      });
    }
    return { user, sub, pay, appt };
  });

  await notify(result.user.id, `أهلًا بك في سبورت باور! اشتراكك: ${result.sub.totalSessions} حصة حتى ${result.sub.endDate}.`, 'subscription');
  if (result.appt && trainer) {
    await notify(trainer.id, `متدرب جديد: ${result.user.name} — أول حصة يوم ${result.appt.date} الساعة ${result.appt.time}.`, 'appointment');
  }

  // إحالة صديق: كود الإحالة يُنشئ سجل إحالة بانتظار اعتماد الإدارة
  if (req.body.referralCode) {
    const code = String(req.body.referralCode).trim().toUpperCase();
    const referrer = users.find((u) => u.role === 'trainee' && (u.referralCode || '').toUpperCase() === code);
    if (referrer) {
      await Store.insert('referrals', {
        referrerId: referrer.id, traineeId: result.user.id, traineeName: result.user.name,
        code, date: todayStr(), status: 'pending',
      });
      const admin = users.find((u) => u.role === 'admin');
      if (admin) await notify(admin.id, `إحالة جديدة: ${result.user.name} اشترك بكود ${referrer.name} — بانتظار الاعتماد في صفحة الولاء.`, 'loyalty');
      await notify(referrer.id, `صديقك ${result.user.name} اشترك بكودك 🎉 — ستصلك نقاط الإحالة بعد اعتماد الإدارة.`, 'loyalty');
    }
  }

  // ربط الاشتراك بملف متابعة المبيعات
  if (req.body.leadId) {
    const lead = await Store.get('leads', Number(req.body.leadId));
    if (lead) await Store.update('leads', lead.id, { stage: 'subscribed', traineeId: result.user.id, closedAt: todayStr() });
  }

  // إغلاق العقد الإلكتروني الذي عبّأه الزبون بنفسه
  if (req.body.contractId) {
    const contract = await Store.get('contracts', Number(req.body.contractId));
    if (contract) await Store.update('contracts', contract.id, { status: 'converted', traineeId: result.user.id, convertedAt: todayStr() });
  }

  res.json({
    user: publicUser(result.user),
    credentials: { username, password },
    subscription: result.sub, payment: result.pay, appointment: result.appt,
  });
}));

/* ============================================================
   الاشتراكات
   ============================================================ */
app.get('/api/subscriptions', auth, h(async (req, res) => {
  const where = {};
  if (req.user.role === 'trainee') where.traineeId = req.user.id;
  if (req.query.branch) where.branchId = Number(req.query.branch);
  const list = await Store.find('subscriptions', where, pageOpts(req));
  // الأسعار سرّ تجاري: المدرب وأخصائية التغذية لا يريان قيمة الاشتراك
  const withPrice = clients.canSeePrices(req.user.role);
  res.json(list.map((s) => {
    const row = { ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions };
    if (!withPrice) delete row.price;
    return row;
  }));
}));

/* إضافة المشترك/التجديد: من الإدارة أو المحاسب — وليس المدرب */
app.post('/api/subscriptions', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  const { traineeId, totalSessions, price, startDate, endDate, packageId } = req.body;
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!totalSessions || !price || !startDate || !endDate) return res.status(400).json({ error: 'كل الحقول مطلوبة.' });
  const pkg = packageId ? await Store.get('packages', Number(packageId)) : null;
  const prior = (await Store.all('subscriptions')).some((s) => s.traineeId === trainee.id);
  const sub = await Store.insert('subscriptions', {
    traineeId: trainee.id, branchId: trainee.branchId,
    totalSessions: Number(totalSessions), usedSessions: 0, price: Number(price),
    startDate, endDate, status: 'active',
    packageId: pkg ? pkg.id : null, packageName: pkg ? pkg.name : null,
  });
  // سجل الحدث لِلوحة المتابعة اليومية (جديد أم تجديد)
  await Store.insert('subEvents', {
    subscriptionId: sub.id, traineeId: trainee.id, branchId: trainee.branchId,
    type: prior ? 'renewal' : 'new', date: todayStr(),
  });
  await notify(trainee.id, `تم تفعيل اشتراك جديد: ${sub.totalSessions} حصة حتى ${sub.endDate}.`, 'subscription');
  // نقاط الولاء عند تجديد الاشتراك
  if (prior) {
    const pts = await growth.loyaltyPts();
    await growth.awardPoints(trainee.id, pts.renewal, 'تجديد الاشتراك');
  }
  res.json(sub);
}));

/* تجميد / فك تجميد / إلغاء اشتراك — مع تسجيل الحدث وسببه (لتحليل أسباب الإلغاء) */
app.post('/api/subscriptions/:id/action', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
  const sub = await Store.get('subscriptions', req.params.id);
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود.' });
  const { action } = req.body || {};
  const reason = String(req.body.reason || '').slice(0, 200);
  const map = { freeze: 'frozen', unfreeze: 'active', cancel: 'cancelled' };
  if (!map[action]) return res.status(400).json({ error: 'الإجراء: freeze أو unfreeze أو cancel.' });
  if (action === 'freeze' && subStatus(sub) !== 'active') return res.status(400).json({ error: 'لا يُجمَّد إلا اشتراك فعّال.' });
  if (action === 'unfreeze' && sub.status !== 'frozen') return res.status(400).json({ error: 'الاشتراك ليس مجمّدًا.' });

  const patch = { status: map[action] };
  if (action === 'cancel') patch.cancelReason = reason;
  const updated = await Store.update('subscriptions', sub.id, patch);
  await Store.insert('subEvents', {
    subscriptionId: sub.id, traineeId: sub.traineeId, branchId: sub.branchId,
    type: action, date: todayStr(), reason: ['cancel', 'freeze'].includes(action) ? reason : '',
  });
  const labels = { freeze: 'تم تجميد اشتراكك — تواصل معنا للعودة متى أحببت!', unfreeze: 'تم تفعيل اشتراكك من جديد — أهلًا بعودتك!', cancel: 'تم إلغاء اشتراكك.' };
  await notify(sub.traineeId, labels[action], 'subscription');
  res.json({ ...updated, status: subStatus(updated) });
}));

/* ============================================================
   الحصص — منطق الخصم والاحتساب (معاملة ذرّية)
   ============================================================ */
/* كل الفلاتر تُنفَّذ في القاعدة — والحد/الإزاحة اختياريان لواجهات المستقبل */
app.get('/api/sessions', auth, h(async (req, res) => {
  const where = {};
  if (req.user.role === 'trainer') where.trainerId = req.user.id;
  if (req.user.role === 'trainee') where.traineeId = req.user.id;
  if (req.query.month) where.date = { gte: req.query.month + '-01', lte: req.query.month + '-31' };
  if (req.query.branch) where.branchId = Number(req.query.branch);
  if (req.query.trainee) where.traineeId = Number(req.query.trainee);
  res.json(await Store.find('sessions', where, pageOpts(req)));
}));

app.post('/api/sessions', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
  const { traineeId, date, time, duration, style, notes, weight, appointmentId } = req.body;
  const kind = req.body.kind === 'makeup' ? 'makeup' : 'regular';
  const trainee = await Store.get('users', Number(traineeId));
  if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!date || !time || !duration) return res.status(400).json({ error: 'التاريخ والساعة والمدة مطلوبة.' });

  // المدربون بالتناوب: الحصة تُنسب لمن نفّذها فعليًا
  const trainerId = req.user.role === 'trainer' ? req.user.id : Number(req.body.trainerId);
  if (!trainerId) return res.status(400).json({ error: 'اختر المدرب الذي نفّذ الحصة.' });

  /* حصة تعويضية: تُسجل بشكل مستقل عن الحصص العادية — بلا خصم من رصيد الاشتراك */
  if (kind === 'makeup') {
    const session = await Store.insert('sessions', {
      traineeId: trainee.id, trainerId, branchId: trainee.branchId,
      date, time, duration: Number(duration), style: style || '', notes: notes || '',
      weight: weight ? Number(weight) : null, subscriptionId: null, kind: 'makeup',
      createdAt: new Date().toISOString(),
    });
    if (appointmentId) {
      const appt = await Store.get('appointments', Number(appointmentId));
      if (appt) await Store.update('appointments', appt.id, { status: 'done', sessionId: session.id });
    }
    await notify(trainee.id, `تم تسجيل حصة تعويضية لك بتاريخ ${date} — دون خصم من رصيد اشتراكك.`, 'session');
    const pts = await growth.loyaltyPts();
    await growth.awardPoints(trainee.id, pts.session, 'حضور حصة تدريبية');
    return res.json({ session, makeup: true });
  }

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
      weight: weight ? Number(weight) : null, subscriptionId: sub.id, kind: 'regular',
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
  const pts = await growth.loyaltyPts();
  await growth.awardPoints(trainee.id, pts.session, 'حضور حصة تدريبية');
  if (result.remaining <= 2 && result.remaining > 0) {
    const admin = (await Store.find('users', { role: 'admin' }, { limit: 1 }))[0];
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
    subscriptionId: sub.id, traineeId: sub.traineeId, branchId: sub.branchId,
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
    kind: req.body.kind === 'makeup' ? 'makeup' : 'regular', // «تعويض» في الجدول اليومي
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
  if (req.body.kind !== undefined) patch.kind = req.body.kind === 'makeup' ? 'makeup' : 'regular';
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
    createdBy: req.user.id,
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
  const list = await Store.find('notifications', { userId: req.user.id }, { order: [['id', 'desc']], limit: 60 });
  res.json(list);
}));

app.post('/api/notifications/read', auth, h(async (req, res) => {
  await Store.updateWhere('notifications', { userId: req.user.id, read: { ne: true } }, { read: true });
  res.json({ ok: true });
}));

/* ============================================================
   لوحات المعلومات
   ============================================================ */
app.get('/api/dashboard/admin', auth, requireRole('admin'), h(async (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const inBranch = (x) => !branch || x.branchId === branch;
  /* الفلترة تجري في القاعدة: حصص الشهر ودفعاته فقط — لا سحب للجداول كاملة.
     الجداول المرجعية الصغيرة (الاشتراكات والمستخدمون) تُحمَّل كما هي. */
  const scope = branch ? { branchId: branch } : {};
  const period = { gte: month + '-01', lte: month + '-31' };
  const paidScope = { ...scope, subscriptionId: { isNull: false } };

  const [monthSessions, todayCount, subscriptions, users, monthPayments, totalPaid] = await Promise.all([
    Store.find('sessions', { ...scope, date: period }),
    Store.count('sessions', { ...scope, date: todayStr() }),
    Store.all('subscriptions'),
    Store.all('users'),
    Store.find('payments', { ...paidScope, date: period }),
    Store.sum('payments', 'amount', paidScope),
  ]);

  const subs = subscriptions.filter(inBranch).map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions }));
  const activeTrainees = new Set(subs.filter((s) => s.status === 'active').map((s) => s.traineeId)).size;

  const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const totalDue = subs.reduce((s, x) => s + x.price, 0);

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
      sessionsToday: todayCount,
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
  const scope = branch ? { branchId: branch } : {};
  const period = { gte: month + '-01', lte: month + '-31' };
  /* المدفوع لكل اشتراك يُجمَّع في القاعدة بعملية واحدة — كان يُحسب سابقًا
     بحلقة داخل حلقة (كل اشتراك × كل الدفعات). */
  const [subscriptions, users, paidBySub, monthPayments, byDate] = await Promise.all([
    Store.all('subscriptions'),
    Store.all('users'),
    Store.groupSum('payments', 'amount', 'subscriptionId', null),
    Store.find('payments', { ...scope, date: period }),
    Store.groupSum('payments', 'amount', 'date', scope),
  ]);

  const subs = subscriptions
    .filter((s) => !branch || s.branchId === branch)
    .map((s) => {
      const paid = paidBySub[s.id] || 0;
      const trainee = users.find((u) => u.id === s.traineeId) || {};
      return {
        id: s.id, traineeId: s.traineeId, traineeName: trainee.name, branchId: s.branchId,
        price: s.price, paid, remaining: Math.max(0, s.price - paid),
        startDate: s.startDate, endDate: s.endDate,
        status: subStatus(s), renewed: subscriptions.filter((x) => x.traineeId === s.traineeId).length > 1,
      };
    });

  const byMonth = {};
  for (const [date, amount] of Object.entries(byDate)) {
    byMonth[monthOf(date)] = (byMonth[monthOf(date)] || 0) + amount;
  }

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

/* ملف المتدرب — نظرة شاملة */
app.get('/api/trainee/:id/overview', auth, h(async (req, res) => {
  const id = Number(req.params.id);
  await clients.ensureDefaultPackages();
  const { users, subscriptions, sessions, appointments, inbody, mealPlans, meals, branches, payments, packages, sessionRatings } = await Store.load(
    'users', 'subscriptions', 'sessions', 'appointments', 'inbody', 'mealPlans', 'meals', 'branches', 'payments', 'packages', 'sessionRatings');

  const trainee = users.find((u) => u.id === id && u.role === 'trainee');
  if (!trainee) return res.status(404).json({ error: 'المتدرب غير موجود.' });

  // المدربون بالتناوب: أي مدرب يطّلع على ملف أي متدرب
  const allowed = ['admin', 'accountant', 'nutritionist', 'trainer'].includes(req.user.role)
    || (req.user.role === 'trainee' && req.user.id === id);
  if (!allowed) return res.status(403).json({ error: 'ليست لديك صلاحية.' });

  // الأسعار سرّ تجاري: المدرب وأخصائية التغذية يريان الباقة والحصص — بلا أي سعر
  const showPrices = clients.canSeePrices(req.user.role);
  const subs = subscriptions.filter((s) => s.traineeId === id)
    .map((s) => {
      const row = { ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions };
      if (!showPrices) delete row.price;
      return row;
    });
  const current = subs.filter((s) => s.status === 'active').sort((a, b) => a.endDate.localeCompare(b.endDate))[0] || subs[subs.length - 1];
  const mySessions = sessions.filter((s) => s.traineeId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const appts = appointments.filter((a) => a.traineeId === id && a.date >= todayStr() && a.status === 'scheduled')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const readings = inbody.filter((r) => r.traineeId === id).sort((a, b) => a.date.localeCompare(b.date));
  const plans = mealPlans.filter((p) => p.traineeId === id).map((p) => ({ ...p, meal: meals.find((m) => m.id === p.mealId) }));

  // بنظام التناوب لا مدرب ثابتًا — نعرض آخر مدرب درّبه فعليًا
  const lastSession = mySessions[0];
  // الحضور والغياب
  const nowIso = new Date().toISOString().slice(0, 16);
  const isMissedA = (a) => a.status === 'missed' || (a.status === 'scheduled' && (a.date + 'T' + a.time) < nowIso);
  const myAppts = appointments.filter((a) => a.traineeId === id);
  const missedCount = myAppts.filter(isMissedA).length;
  const attendance = {
    attended: mySessions.length,
    missed: missedCount,
    pct: (mySessions.length + missedCount) ? Math.round((mySessions.length / (mySessions.length + missedCount)) * 100) : null,
  };

  // البيانات المالية — للإدارة والمحاسب فقط
  const canSeeMoney = ['admin', 'accountant'].includes(req.user.role);
  const subIds = subs.map((s) => s.id);
  const myPayments = canSeeMoney ? payments.filter((p) => subIds.includes(p.subscriptionId)) : null;
  const finance = canSeeMoney ? {
    totalDue: subs.filter((s) => s.status !== 'cancelled').reduce((t, s) => t + s.price, 0),
    totalPaid: payments.filter((p) => subIds.includes(p.subscriptionId)).reduce((t, p) => t + p.amount, 0),
  } : null;
  if (finance) finance.remaining = Math.max(0, finance.totalDue - finance.totalPaid);

  /* الباقات المتاحة — تظهر على ملف المشترك للتجديد أو الترقية (بلا أسعار للمدرب) */
  const availablePackages = packages
    .filter((p) => p.active !== false && (!p.branchId || p.branchId === trainee.branchId))
    .sort((a, b) => (a.sessions || 0) - (b.sessions || 0))
    .map((p) => (showPrices ? p : clients.stripPackagePrice(p)));

  /* تقييمات الحصص: المتدرب يرى تقييماته، والإدارة ترى كل شيء — والمدرب لا يرى شيئًا */
  const canSeeRatings = req.user.role === 'admin' || (req.user.role === 'trainee' && req.user.id === id);
  const myRatings = canSeeRatings ? sessionRatings.filter((r) => r.traineeId === id).sort((a, b) => b.id - a.id) : null;

  res.json({
    trainee: publicUser(trainee),
    trainerName: lastSession ? (users.find((u) => u.id === lastSession.trainerId) || {}).name : null,
    branchName: (branches.find((b) => b.id === trainee.branchId) || {}).name,
    subscription: current || null,
    subscriptions: subs,
    packages: availablePackages,
    showPrices,
    sessions: mySessions,
    appointments: appts.map((a) => ({ ...a, trainerName: (users.find((u) => u.id === a.trainerId) || {}).name })),
    inbody: readings,
    mealPlans: plans,
    notes: mySessions.filter((s) => s.notes).slice(0, 6).map((s) => ({ date: s.date, note: s.notes })),
    attendance,
    payments: myPayments,
    finance,
    ratings: myRatings,
  });
}));

/* ============================================================
   التقارير الشهرية + التصدير
   ============================================================ */
function prevMonthOf(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

async function buildMonthlyReport(month, branch) {
  /* التقرير يقارن الشهر بسابقه — فنحضر نافذة الشهرين فقط من الجداول الكبيرة */
  const prevM = prevMonthOf(month);
  const window = { gte: prevM + '-01', lte: month + '-31' };
  const [sessions, payments, appointments, tasks, subscriptions, users, branches] = await Promise.all([
    Store.find('sessions', { date: window }),
    Store.find('payments', { date: window }),
    Store.find('appointments', { date: window }),
    Store.find('tasks', { month: { in: [prevM, month] } }),
    Store.all('subscriptions'),
    Store.all('users'),
    Store.all('branches'),
  ]);
  const inBranch = (x) => !branch || x.branchId === branch;
  const monthSessions = sessions.filter((s) => monthOf(s.date) === month && inBranch(s));
  const nowIso = new Date().toISOString().slice(0, 16);
  const isMissed = (a) => a.status === 'missed' || (a.status === 'scheduled' && (a.date + 'T' + a.time) < nowIso);

  const trainers = users.filter((u) => u.role === 'trainer' && inBranch(u)).map((t) => {
    const ts = monthSessions.filter((s) => s.trainerId === t.id);
    const myTasks = tasks.filter((x) => x.trainerId === t.id
      && ((x.type === 'daily' && monthOf(x.date) === month) || (x.type === 'monthly' && x.month === month)));
    return {
      trainer: t.name, branch: (branches.find((b) => b.id === t.branchId) || {}).name,
      sessions: ts.length, persons: ts.length,
      uniqueTrainees: new Set(ts.map((s) => s.traineeId)).size,
      hours: trainerHours(ts),
      tasksPct: myTasks.length ? Math.round((myTasks.filter((x) => x.status === 'done').length / myTasks.length) * 100) : null,
    };
  });

  const buildBranchRow = (b, m) => {
    const bs = sessions.filter((s) => monthOf(s.date) === m && s.branchId === b.id);
    // الفرع محفوظ على الدفعة نفسها — لا حاجة لمطابقتها باشتراكات الفرع واحدةً واحدة
    const pays = payments.filter((p) => p.branchId === b.id && p.subscriptionId != null && monthOf(p.date) === m);
    const appts = appointments.filter((a) => monthOf(a.date) === m && a.branchId === b.id && a.date <= todayStr());
    const missed = appts.filter(isMissed).length;
    return {
      branch: b.name, sessions: bs.length, hours: trainerHours(bs),
      activeTrainees: new Set(subscriptions.filter((s) => s.branchId === b.id && subStatus(s) === 'active').map((s) => s.traineeId)).size,
      collected: pays.reduce((s, p) => s + p.amount, 0),
      missed,
      attendancePct: (bs.length + missed) ? Math.round((bs.length / (bs.length + missed)) * 100) : null,
    };
  };

  const scoped = branches.filter((b) => !branch || b.id === branch);
  const prev = prevMonthOf(month);
  const branchRows = scoped.map((b) => {
    const cur = buildBranchRow(b, month);
    const before = buildBranchRow(b, prev);
    return { ...cur, prevSessions: before.sessions, prevCollected: before.collected };
  });

  return { month, prevMonth: prev, trainers, branches: branchRows, totalSessions: monthSessions.length };
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
  lines.push('المدرب,الفرع,عدد الحصص,عدد الأشخاص,متدربون فريدون,ساعات التدريب,إنجاز المهام %');
  r.trainers.forEach((t) => lines.push(`${t.trainer},${t.branch},${t.sessions},${t.persons},${t.uniqueTrainees},${t.hours},${t.tasksPct ?? '-'}`));
  lines.push('');
  lines.push(`الفرع,عدد الحصص,ساعات التدريب,متدربون فعالون,التحصيل,الغيابات,نسبة الحضور %,حصص ${r.prevMonth},تحصيل ${r.prevMonth}`);
  r.branches.forEach((b) => lines.push(`${b.branch},${b.sessions},${b.hours},${b.activeTrainees},${b.collected},${b.missed},${b.attendancePct ?? '-'},${b.prevSessions},${b.prevCollected}`));

  // مؤشرات النمو + المالية (المصاريف وصافي الربح)
  const g = await growth.buildGrowthReport(month, branch, subStatus);
  lines.push('');
  lines.push('مؤشرات النمو,القيمة');
  lines.push(`المشتركون الجدد,${g.kpis.newSubscribers}`);
  lines.push(`المجددون,${g.kpis.renewals}`);
  lines.push(`نسبة التجديد %,${g.kpis.retentionRate ?? '-'}`);
  lines.push(`الإلغاءات,${g.kpis.cancellations}`);
  lines.push(`نسبة الإلغاء %,${g.kpis.cancellationRate ?? '-'}`);
  lines.push(`المجمدون,${g.kpis.frozen}`);
  lines.push(`نسبة التجميد %,${g.kpis.freezeRate ?? '-'}`);
  lines.push(`النمو الصافي,${g.kpis.netGrowth}`);
  lines.push(`المشتركون النشطون,${g.kpis.activeSubscribers}`);
  lines.push(`متوسط بقاء العميل (أشهر),${g.kpis.avgDurationMonths ?? '-'}`);
  lines.push(`متوسط قيمة العميل LTV,${g.kpis.ltv ?? '-'}`);
  lines.push('');
  lines.push('المالية,القيمة');
  lines.push(`التحصيل,${g.finance.revenue}`);
  lines.push(`المصاريف,${g.finance.expensesTotal}`);
  lines.push(`صافي الربح,${g.finance.netProfit}`);
  if (g.finance.expenses.length) {
    lines.push('');
    lines.push('المصروف,التصنيف,المبلغ');
    g.finance.expenses.forEach((e) => lines.push(`${e.label},${e.category},${e.amount}`));
  }
  const csv = '﻿' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sportpower-report-${month}.csv"`);
  res.send(csv);
}));

/* وحدة التشغيل: متابعة يومية، مهام، أهداف وKPI، مجمّدون */
require('./ops')(app, { auth, requireRole, h, notify, subStatus });

/* وحدة النمو: مصاريف، تقرير نمو، مبيعات، برامج تدريبية، ولاء وإحالات */
growth(app, { auth, requireRole, h, notify, subStatus });

/* وحدة العملاء: الباقات، العقد الإلكتروني، تقييم الحصص */
clients(app, { auth, requireRole, h, notify });

/* مركز القرارات: تحويل كل مشكلة يكتشفها النظام إلى إجراء قابل للتنفيذ */
require('./actions')(app, { auth, requireRole, h, notify, subStatus });

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

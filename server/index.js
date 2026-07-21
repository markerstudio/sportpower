/* ============================================================
   سبورت باور — الخادم والواجهات البرمجية
   نظام داخلي: إدارة / مدرب / محاسب / متدرب
   ============================================================ */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const DB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = process.env.VERCEL ? '/tmp/sportpower-uploads' : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/marketing', express.static(path.join(__dirname, '..', 'marketing')));
app.use('/uploads', express.static(UPLOADS));

/* ============================================================
   المصادقة والصلاحيات
   ============================================================ */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const db = DB.get();
  const userId = db.tokens[token];
  if (!userId) return res.status(401).json({ error: 'غير مصرّح — يرجى تسجيل الدخول.' });
  req.user = db.users.find((u) => u.id === userId);
  if (!req.user) return res.status(401).json({ error: 'المستخدم غير موجود.' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليست لديك صلاحية لهذه العملية.' });
    }
    next();
  };
}

const publicUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, phone: u.phone, branchId: u.branchId, trainerId: u.trainerId, goal: u.goal, specialty: u.specialty, joinedAt: u.joinedAt });

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const db = DB.get();
  const user = db.users.find((u) => u.username === String(username || '').trim().toLowerCase());
  if (!user || user.password !== DB.hash(password || '')) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.tokens[token] = user.id;
  DB.save();
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', auth, (req, res) => {
  const db = DB.get();
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  delete db.tokens[token];
  DB.save();
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

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

function notify(userId, text, type) {
  const db = DB.get();
  db.notifications.push({ id: DB.nextId('notifications'), userId, text, date: todayStr(), read: false, type: type || 'info' });
  DB.save();
}

/* إشعارات الاشتراكات القريبة من الانتهاء — تُحدّث عند طلب الإشعارات */
function refreshSubscriptionAlerts() {
  const db = DB.get();
  const admin = db.users.find((u) => u.role === 'admin');
  db.subscriptions.filter(subExpiring).forEach((sub) => {
    const t = db.users.find((u) => u.id === sub.traineeId);
    if (!t) return;
    const text = `اشتراك ${t.name} يوشك على الانتهاء (متبقي ${sub.totalSessions - sub.usedSessions} حصة — ينتهي ${sub.endDate}).`;
    const exists = db.notifications.some((n) => n.userId === admin.id && n.text === text);
    if (!exists) db.notifications.push({ id: DB.nextId('notifications'), userId: admin.id, text, date: todayStr(), read: false, type: 'subscription' });
  });
  DB.save();
}

/* ============================================================
   الفروع والمستخدمون
   ============================================================ */
app.get('/api/branches', auth, (req, res) => res.json(DB.get().branches));

app.post('/api/branches', auth, requireRole('admin'), (req, res) => {
  const db = DB.get();
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفرع مطلوب.' });
  const branch = { id: DB.nextId('branches'), name, address: address || '', phone: phone || '' };
  db.branches.push(branch);
  DB.save();
  res.json(branch);
});

app.get('/api/users', auth, requireRole('admin', 'accountant', 'trainer', 'nutritionist'), (req, res) => {
  const db = DB.get();
  let list = db.users.map(publicUser);
  if (req.query.role) list = list.filter((u) => u.role === req.query.role);
  if (req.query.branch) list = list.filter((u) => u.branchId === Number(req.query.branch));
  // المدرب يرى متدربيه فقط (وبقية المدربين للاطلاع على الجدول العام لا يحتاجها)
  if (req.user.role === 'trainer' && req.query.role === 'trainee') {
    list = list.filter((u) => u.trainerId === req.user.id);
  }
  res.json(list);
});

app.post('/api/users', auth, requireRole('admin'), (req, res) => {
  const db = DB.get();
  const { username, password, name, role, phone, branchId, trainerId, goal, specialty } = req.body;
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'الحقول الأساسية مطلوبة.' });
  if (db.users.some((u) => u.username === username.toLowerCase())) return res.status(400).json({ error: 'اسم المستخدم موجود مسبقًا.' });
  const user = {
    id: DB.nextId('users'), username: username.toLowerCase(), password: DB.hash(password),
    name, role, phone: phone || '', branchId: branchId || null,
    trainerId: trainerId || null, goal: goal || null, specialty: specialty || null,
    joinedAt: todayStr(),
  };
  db.users.push(user);
  DB.save();
  res.json(publicUser(user));
});

/* ============================================================
   الاشتراكات
   ============================================================ */
app.get('/api/subscriptions', auth, (req, res) => {
  const db = DB.get();
  let list = db.subscriptions;
  if (req.user.role === 'trainee') list = list.filter((s) => s.traineeId === req.user.id);
  if (req.user.role === 'trainer') {
    const myTrainees = db.users.filter((u) => u.trainerId === req.user.id).map((u) => u.id);
    list = list.filter((s) => myTrainees.includes(s.traineeId));
  }
  if (req.query.branch) list = list.filter((s) => s.branchId === Number(req.query.branch));
  res.json(list.map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions })));
});

app.post('/api/subscriptions', auth, requireRole('admin'), (req, res) => {
  const db = DB.get();
  const { traineeId, totalSessions, price, startDate, endDate } = req.body;
  const trainee = db.users.find((u) => u.id === Number(traineeId) && u.role === 'trainee');
  if (!trainee) return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!totalSessions || !price || !startDate || !endDate) return res.status(400).json({ error: 'كل الحقول مطلوبة.' });
  const sub = {
    id: DB.nextId('subscriptions'), traineeId: trainee.id, branchId: trainee.branchId,
    totalSessions: Number(totalSessions), usedSessions: 0, price: Number(price),
    startDate, endDate, status: 'active',
  };
  db.subscriptions.push(sub);
  DB.save();
  notify(trainee.id, `تم تفعيل اشتراك جديد: ${sub.totalSessions} حصة حتى ${sub.endDate}.`, 'subscription');
  res.json(sub);
});

/* ============================================================
   الحصص — منطق الخصم والاحتساب
   ============================================================ */
app.get('/api/sessions', auth, (req, res) => {
  const db = DB.get();
  let list = db.sessions;
  if (req.user.role === 'trainer') list = list.filter((s) => s.trainerId === req.user.id);
  if (req.user.role === 'trainee') list = list.filter((s) => s.traineeId === req.user.id);
  if (req.query.month) list = list.filter((s) => monthOf(s.date) === req.query.month);
  if (req.query.branch) list = list.filter((s) => s.branchId === Number(req.query.branch));
  if (req.query.trainee) list = list.filter((s) => s.traineeId === Number(req.query.trainee));
  res.json(list);
});

app.post('/api/sessions', auth, requireRole('trainer', 'admin'), (req, res) => {
  const db = DB.get();
  const { traineeId, date, time, duration, style, notes, weight, appointmentId } = req.body;
  const trainee = db.users.find((u) => u.id === Number(traineeId) && u.role === 'trainee');
  if (!trainee) return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!date || !time || !duration) return res.status(400).json({ error: 'التاريخ والساعة والمدة مطلوبة.' });

  const trainerId = req.user.role === 'trainer' ? req.user.id : (Number(req.body.trainerId) || trainee.trainerId);

  // اشتراك فعّال للخصم منه
  const sub = db.subscriptions
    .filter((s) => s.traineeId === trainee.id && subStatus(s) === 'active')
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  if (!sub) return res.status(400).json({ error: `لا يوجد اشتراك فعّال للمتدرب ${trainee.name} — يرجى التجديد أولًا.` });

  const session = {
    id: DB.nextId('sessions'), traineeId: trainee.id, trainerId, branchId: trainee.branchId,
    date, time, duration: Number(duration), style: style || '', notes: notes || '',
    weight: weight ? Number(weight) : null, subscriptionId: sub.id,
    createdAt: new Date().toISOString(),
  };
  db.sessions.push(session);

  // خصم حصة من رصيد المتدرب
  sub.usedSessions += 1;
  const remaining = sub.totalSessions - sub.usedSessions;
  if (remaining <= 0) sub.status = 'expired';

  // ربط الموعد إن وجد
  if (appointmentId) {
    const appt = db.appointments.find((a) => a.id === Number(appointmentId));
    if (appt) { appt.status = 'done'; appt.sessionId = session.id; }
  }

  DB.save();

  // إشعار المتدرب برصيده — «متبقي 11 حصة من أصل 12»
  notify(trainee.id, `تم تسجيل حصتك بتاريخ ${date} — متبقي ${remaining} حصة من أصل ${sub.totalSessions}.`, 'session');
  if (remaining <= 2 && remaining > 0) {
    const admin = db.users.find((u) => u.role === 'admin');
    notify(admin.id, `اشتراك ${trainee.name} يوشك على الانتهاء (متبقي ${remaining} حصة).`, 'subscription');
  }

  res.json({ session, remaining, total: sub.totalSessions });
});

/* ============================================================
   المدفوعات — للمحاسب والإدارة
   ============================================================ */
app.get('/api/payments', auth, requireRole('accountant', 'admin'), (req, res) => {
  const db = DB.get();
  let list = db.payments;
  if (req.query.month) list = list.filter((p) => monthOf(p.date) === req.query.month);
  if (req.query.branch) {
    const subIds = db.subscriptions.filter((s) => s.branchId === Number(req.query.branch)).map((s) => s.id);
    list = list.filter((p) => subIds.includes(p.subscriptionId));
  }
  res.json(list);
});

app.post('/api/payments', auth, requireRole('accountant', 'admin'), (req, res) => {
  const db = DB.get();
  const { subscriptionId, amount, date, method, note } = req.body;
  const sub = db.subscriptions.find((s) => s.id === Number(subscriptionId));
  if (!sub) return res.status(400).json({ error: 'الاشتراك غير موجود.' });
  if (!amount || !date) return res.status(400).json({ error: 'المبلغ والتاريخ مطلوبان.' });
  const payment = {
    id: DB.nextId('payments'), subscriptionId: sub.id, traineeId: sub.traineeId,
    amount: Number(amount), date, method: method || 'كاش', note: note || '', createdBy: req.user.id,
  };
  db.payments.push(payment);
  DB.save();
  res.json(payment);
});

app.put('/api/payments/:id', auth, requireRole('accountant', 'admin'), (req, res) => {
  const db = DB.get();
  const payment = db.payments.find((p) => p.id === Number(req.params.id));
  if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة.' });
  ['amount', 'date', 'method', 'note'].forEach((k) => {
    if (req.body[k] !== undefined) payment[k] = k === 'amount' ? Number(req.body[k]) : req.body[k];
  });
  DB.save();
  res.json(payment);
});

/* ============================================================
   Calendar — المواعيد
   ============================================================ */
app.get('/api/appointments', auth, (req, res) => {
  const db = DB.get();
  let list = db.appointments;
  if (req.user.role === 'trainer') list = list.filter((a) => a.trainerId === req.user.id);
  if (req.user.role === 'trainee') list = list.filter((a) => a.traineeId === req.user.id);
  if (req.query.from) list = list.filter((a) => a.date >= req.query.from);
  if (req.query.to) list = list.filter((a) => a.date <= req.query.to);
  if (req.query.trainer) list = list.filter((a) => a.trainerId === Number(req.query.trainer));
  res.json(list);
});

app.post('/api/appointments', auth, requireRole('admin', 'trainer'), (req, res) => {
  const db = DB.get();
  const { trainerId, traineeId, date, time, duration, note } = req.body;
  const tid = req.user.role === 'trainer' ? req.user.id : Number(trainerId);
  const trainer = db.users.find((u) => u.id === tid && u.role === 'trainer');
  const trainee = db.users.find((u) => u.id === Number(traineeId) && u.role === 'trainee');
  if (!trainer || !trainee) return res.status(400).json({ error: 'المدرب أو المتدرب غير موجود.' });
  if (!date || !time) return res.status(400).json({ error: 'التاريخ والساعة مطلوبان.' });
  const appt = {
    id: DB.nextId('appointments'), trainerId: trainer.id, traineeId: trainee.id,
    branchId: trainee.branchId, date, time, duration: Number(duration) || 60,
    status: 'scheduled', note: note || '',
  };
  db.appointments.push(appt);
  DB.save();
  if (req.user.id !== trainer.id) notify(trainer.id, `موعد جديد: ${trainee.name} يوم ${date} الساعة ${time}.`, 'appointment');
  notify(trainee.id, `تم حجز موعد تدريب لك يوم ${date} الساعة ${time} مع ${trainer.name}.`, 'appointment');
  res.json(appt);
});

app.put('/api/appointments/:id', auth, requireRole('admin', 'trainer'), (req, res) => {
  const db = DB.get();
  const appt = db.appointments.find((a) => a.id === Number(req.params.id));
  if (!appt) return res.status(404).json({ error: 'الموعد غير موجود.' });
  if (req.user.role === 'trainer' && appt.trainerId !== req.user.id) {
    return res.status(403).json({ error: 'لا يمكنك تعديل مواعيد مدرب آخر.' });
  }
  const before = `${appt.date} ${appt.time}`;
  ['date', 'time', 'duration', 'status', 'note'].forEach((k) => {
    if (req.body[k] !== undefined) appt[k] = k === 'duration' ? Number(req.body[k]) : req.body[k];
  });
  DB.save();
  const after = `${appt.date} ${appt.time}`;
  if (before !== after) {
    if (req.user.id !== appt.trainerId) notify(appt.trainerId, `تم تعديل موعد من ${before} إلى ${after}.`, 'appointment');
    notify(appt.traineeId, `تم تعديل موعد تدريبك من ${before} إلى ${after}.`, 'appointment');
  }
  res.json(appt);
});

/* ============================================================
   InBody — رفع وقراءة وحفظ ومقارنة
   ============================================================ */
app.get('/api/inbody', auth, (req, res) => {
  const db = DB.get();
  let list = db.inbody;
  if (req.user.role === 'trainee') list = list.filter((r) => r.traineeId === req.user.id);
  else if (req.query.trainee) list = list.filter((r) => r.traineeId === Number(req.query.trainee));
  res.json(list.sort((a, b) => a.date.localeCompare(b.date)));
});

app.post('/api/inbody', auth, requireRole('admin', 'trainer'), (req, res) => {
  const db = DB.get();
  const { traineeId, date, weight, bodyFatPct, muscleMass, fatMass, water, bmi, score, notes, imageBase64 } = req.body;
  const trainee = db.users.find((u) => u.id === Number(traineeId) && u.role === 'trainee');
  if (!trainee) return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!date || !weight) return res.status(400).json({ error: 'التاريخ والوزن مطلوبان على الأقل.' });

  let image = null;
  if (imageBase64) {
    const m = imageBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (m) {
      image = `inbody-${trainee.id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      fs.writeFileSync(path.join(UPLOADS, image), Buffer.from(m[2], 'base64'));
    }
  }

  const reading = {
    id: DB.nextId('inbody'), traineeId: trainee.id, date,
    weight: Number(weight), bodyFatPct: numOrNull(bodyFatPct), muscleMass: numOrNull(muscleMass),
    fatMass: numOrNull(fatMass), water: numOrNull(water), bmi: numOrNull(bmi), score: numOrNull(score),
    notes: notes || '', image,
  };
  db.inbody.push(reading);
  DB.save();
  notify(trainee.id, `تمت إضافة قراءة InBody جديدة بتاريخ ${date}.`, 'inbody');
  res.json(reading);
});

function numOrNull(v) { return v === undefined || v === null || v === '' ? null : Number(v); }

/* محاولة قراءة الصورة تلقائيًا OCR — مع رجوع آمن للإدخال اليدوي */
app.post('/api/inbody/ocr', auth, requireRole('admin', 'trainer'), async (req, res) => {
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
});

/* ============================================================
   مكتبة التغذية
   ============================================================ */
app.get('/api/meals', auth, (req, res) => {
  const db = DB.get();
  let list = db.meals;
  const q = req.query;
  if (q.type) list = list.filter((m) => m.type === q.type);
  if (q.goal) list = list.filter((m) => m.goal === q.goal);
  if (q.maxCalories) list = list.filter((m) => m.calories <= Number(q.maxCalories));
  if (q.minProtein) list = list.filter((m) => m.protein >= Number(q.minProtein));
  if (q.search) list = list.filter((m) => m.name.includes(q.search) || (m.ingredients || '').includes(q.search));
  // المتدرب يرى افتراضيًا الوجبات المناسبة لهدفه (إلا إذا فلتر بنفسه)
  if (req.user.role === 'trainee' && !q.goal && !q.all) list = list.filter((m) => m.goal === req.user.goal);
  res.json(list);
});

app.post('/api/meals', auth, requireRole('admin', 'trainer', 'nutritionist'), (req, res) => {
  const db = DB.get();
  const { name, type, goal, calories, protein, carbs, fat, ingredients, preparation, imageBase64 } = req.body;
  if (!name || !type || !goal || !calories) return res.status(400).json({ error: 'الاسم والنوع والهدف والسعرات مطلوبة.' });
  let image = null;
  if (imageBase64) {
    const m = imageBase64.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (m) {
      image = `meal-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      fs.writeFileSync(path.join(UPLOADS, image), Buffer.from(m[2], 'base64'));
    }
  }
  const meal = {
    id: DB.nextId('meals'), name, type, goal,
    calories: Number(calories), protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0,
    ingredients: ingredients || '', preparation: preparation || '', image, createdBy: req.user.id,
  };
  db.meals.push(meal);
  DB.save();
  res.json(meal);
});

/* ربط وجبة ببرنامج متدرب */
app.get('/api/meal-plans', auth, (req, res) => {
  const db = DB.get();
  let list = db.mealPlans;
  if (req.user.role === 'trainee') list = list.filter((p) => p.traineeId === req.user.id);
  else if (req.query.trainee) list = list.filter((p) => p.traineeId === Number(req.query.trainee));
  res.json(list.map((p) => ({ ...p, meal: db.meals.find((m) => m.id === p.mealId) })));
});

app.post('/api/meal-plans', auth, requireRole('admin', 'trainer', 'nutritionist'), (req, res) => {
  const db = DB.get();
  const { traineeId, mealId, slot } = req.body;
  if (!db.users.some((u) => u.id === Number(traineeId) && u.role === 'trainee')) return res.status(400).json({ error: 'المتدرب غير موجود.' });
  if (!db.meals.some((m) => m.id === Number(mealId))) return res.status(400).json({ error: 'الوجبة غير موجودة.' });
  const plan = { id: DB.nextId('mealPlans'), traineeId: Number(traineeId), mealId: Number(mealId), slot: slot || 'lunch' };
  db.mealPlans.push(plan);
  DB.save();
  notify(Number(traineeId), 'تم تحديث برنامجك الغذائي — اطّلع على وجباتك الجديدة.', 'nutrition');
  res.json(plan);
});

app.delete('/api/meal-plans/:id', auth, requireRole('admin', 'trainer', 'nutritionist'), (req, res) => {
  const db = DB.get();
  const i = db.mealPlans.findIndex((p) => p.id === Number(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'غير موجود.' });
  db.mealPlans.splice(i, 1);
  DB.save();
  res.json({ ok: true });
});

/* ============================================================
   الإشعارات
   ============================================================ */
app.get('/api/notifications', auth, (req, res) => {
  if (req.user.role === 'admin') refreshSubscriptionAlerts();
  const db = DB.get();
  const list = db.notifications.filter((n) => n.userId === req.user.id).sort((a, b) => b.id - a.id);
  res.json(list);
});

app.post('/api/notifications/read', auth, (req, res) => {
  const db = DB.get();
  db.notifications.filter((n) => n.userId === req.user.id).forEach((n) => { n.read = true; });
  DB.save();
  res.json({ ok: true });
});

/* ============================================================
   لوحات المعلومات
   ============================================================ */
app.get('/api/dashboard/admin', auth, requireRole('admin'), (req, res) => {
  const db = DB.get();
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const inBranch = (x) => !branch || x.branchId === branch;

  const sessions = db.sessions.filter((s) => inBranch(s));
  const monthSessions = sessions.filter((s) => monthOf(s.date) === month);
  const todaySessions = sessions.filter((s) => s.date === todayStr());

  const subs = db.subscriptions.filter(inBranch).map((s) => ({ ...s, status: subStatus(s), expiring: subExpiring(s), remaining: s.totalSessions - s.usedSessions }));
  const activeTrainees = new Set(subs.filter((s) => s.status === 'active').map((s) => s.traineeId)).size;

  const subIds = db.subscriptions.filter(inBranch).map((s) => s.id);
  const monthPayments = db.payments.filter((p) => subIds.includes(p.subscriptionId) && monthOf(p.date) === month);
  const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const totalDue = subs.reduce((s, x) => s + x.price, 0);
  const totalPaid = db.payments.filter((p) => subIds.includes(p.subscriptionId)).reduce((s, p) => s + p.amount, 0);

  const trainers = db.users.filter((u) => u.role === 'trainer' && inBranch(u)).map((t) => {
    const ts = monthSessions.filter((s) => s.trainerId === t.id);
    return {
      id: t.id, name: t.name, branchId: t.branchId, specialty: t.specialty,
      sessions: ts.length,
      persons: ts.length, // كل حصة = شخص مدرَّب (حسب العدد الفعلي)
      uniqueTrainees: new Set(ts.map((s) => s.traineeId)).size,
      hours: trainerHours(ts),
    };
  });

  // حصص يومية لهذا الشهر (للرسم البياني)
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
      ...s, traineeName: (db.users.find((u) => u.id === s.traineeId) || {}).name,
    })),
  });
});

app.get('/api/dashboard/trainer', auth, requireRole('trainer'), (req, res) => {
  const db = DB.get();
  const month = req.query.month || thisMonthStr();
  const mine = db.sessions.filter((s) => s.trainerId === req.user.id);
  const monthSessions = mine.filter((s) => monthOf(s.date) === month);
  const todayAppts = db.appointments
    .filter((a) => a.trainerId === req.user.id && a.date === todayStr() && a.status === 'scheduled')
    .sort((a, b) => a.time.localeCompare(b.time));

  // تنبيه قبل الحصة: المواعيد خلال الساعتين القادمتين
  const now = new Date();
  const soon = todayAppts.filter((a) => {
    const [h, m] = a.time.split(':').map(Number);
    const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
    return diff >= 0 && diff <= 120;
  });

  res.json({
    month,
    kpis: {
      sessionsMonth: monthSessions.length,
      persons: monthSessions.length,
      uniqueTrainees: new Set(monthSessions.map((s) => s.traineeId)).size,
      hours: trainerHours(monthSessions),
      today: todayAppts.length,
    },
    todayAppointments: todayAppts.map((a) => ({
      ...a, traineeName: (db.users.find((u) => u.id === a.traineeId) || {}).name,
    })),
    upcomingSoon: soon.map((a) => ({ ...a, traineeName: (db.users.find((u) => u.id === a.traineeId) || {}).name })),
    recentSessions: monthSessions.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10),
  });
});

app.get('/api/dashboard/accountant', auth, requireRole('accountant', 'admin'), (req, res) => {
  const db = DB.get();
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;

  const subs = db.subscriptions
    .filter((s) => !branch || s.branchId === branch)
    .map((s) => {
      const paid = db.payments.filter((p) => p.subscriptionId === s.id).reduce((sum, p) => sum + p.amount, 0);
      const trainee = db.users.find((u) => u.id === s.traineeId) || {};
      return {
        id: s.id, traineeId: s.traineeId, traineeName: trainee.name, branchId: s.branchId,
        price: s.price, paid, remaining: Math.max(0, s.price - paid),
        startDate: s.startDate, endDate: s.endDate,
        status: subStatus(s), renewed: db.subscriptions.filter((x) => x.traineeId === s.traineeId).length > 1,
      };
    });

  const monthPayments = db.payments
    .filter((p) => monthOf(p.date) === month)
    .filter((p) => !branch || (db.subscriptions.find((s) => s.id === p.subscriptionId) || {}).branchId === branch);

  // تحصيل شهري (آخر 6 أشهر) للرسم
  const byMonth = {};
  db.payments.forEach((p) => {
    const sb = db.subscriptions.find((s) => s.id === p.subscriptionId) || {};
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
});

/* صفحة المتدرب — نظرة شاملة */
app.get('/api/trainee/:id/overview', auth, (req, res) => {
  const db = DB.get();
  const id = Number(req.params.id);
  const allowed = req.user.role === 'admin' || req.user.role === 'accountant' || req.user.role === 'nutritionist'
    || (req.user.role === 'trainee' && req.user.id === id)
    || (req.user.role === 'trainer' && (db.users.find((u) => u.id === id) || {}).trainerId === req.user.id);
  if (!allowed) return res.status(403).json({ error: 'ليست لديك صلاحية.' });

  const trainee = db.users.find((u) => u.id === id && u.role === 'trainee');
  if (!trainee) return res.status(404).json({ error: 'المتدرب غير موجود.' });

  const subs = db.subscriptions.filter((s) => s.traineeId === id)
    .map((s) => ({ ...s, status: subStatus(s), remaining: s.totalSessions - s.usedSessions }));
  const current = subs.filter((s) => s.status === 'active').sort((a, b) => a.endDate.localeCompare(b.endDate))[0] || subs[subs.length - 1];
  const sessions = db.sessions.filter((s) => s.traineeId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const appts = db.appointments.filter((a) => a.traineeId === id && a.date >= todayStr() && a.status === 'scheduled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const readings = db.inbody.filter((r) => r.traineeId === id).sort((a, b) => a.date.localeCompare(b.date));
  const plans = db.mealPlans.filter((p) => p.traineeId === id).map((p) => ({ ...p, meal: db.meals.find((m) => m.id === p.mealId) }));

  res.json({
    trainee: publicUser(trainee),
    trainerName: (db.users.find((u) => u.id === trainee.trainerId) || {}).name,
    branchName: (db.branches.find((b) => b.id === trainee.branchId) || {}).name,
    subscription: current || null,
    subscriptions: subs,
    sessions,
    appointments: appts.map((a) => ({ ...a, trainerName: (db.users.find((u) => u.id === a.trainerId) || {}).name })),
    inbody: readings,
    mealPlans: plans,
    notes: sessions.filter((s) => s.notes).slice(0, 6).map((s) => ({ date: s.date, note: s.notes })),
  });
});

/* ============================================================
   التقارير الشهرية + التصدير
   ============================================================ */
function buildMonthlyReport(month, branch) {
  const db = DB.get();
  const inBranch = (x) => !branch || x.branchId === branch;
  const monthSessions = db.sessions.filter((s) => monthOf(s.date) === month && inBranch(s));

  const trainers = db.users.filter((u) => u.role === 'trainer' && inBranch(u)).map((t) => {
    const ts = monthSessions.filter((s) => s.trainerId === t.id);
    return {
      trainer: t.name, branch: (db.branches.find((b) => b.id === t.branchId) || {}).name,
      sessions: ts.length, persons: ts.length,
      uniqueTrainees: new Set(ts.map((s) => s.traineeId)).size,
      hours: trainerHours(ts),
    };
  });

  const branches = db.branches.filter((b) => !branch || b.id === branch).map((b) => {
    const bs = monthSessions.filter((s) => s.branchId === b.id);
    const subIds = db.subscriptions.filter((s) => s.branchId === b.id).map((s) => s.id);
    const pays = db.payments.filter((p) => subIds.includes(p.subscriptionId) && monthOf(p.date) === month);
    return {
      branch: b.name, sessions: bs.length,
      hours: trainerHours(bs),
      activeTrainees: new Set(db.subscriptions.filter((s) => s.branchId === b.id && subStatus(s) === 'active').map((s) => s.traineeId)).size,
      collected: pays.reduce((s, p) => s + p.amount, 0),
    };
  });

  return { month, trainers, branches, totalSessions: monthSessions.length };
}

app.get('/api/reports/monthly', auth, requireRole('admin', 'accountant'), (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  res.json(buildMonthlyReport(month, branch));
});

/* تصدير CSV (يفتح في Excel — مع BOM لدعم العربية) */
app.get('/api/reports/export.csv', auth, requireRole('admin', 'accountant'), (req, res) => {
  const month = req.query.month || thisMonthStr();
  const branch = req.query.branch ? Number(req.query.branch) : null;
  const r = buildMonthlyReport(month, branch);
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
});

/* ============================================================ */
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));

/* SPA fallback */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

if (require.main === module) {
  DB.get();
  app.listen(PORT, () => console.log(`SportPower system running → http://localhost:${PORT}`));
}

module.exports = app;

/* ============================================================
   سبورت باور — وحدة العملاء: الباقات، العقد الإلكتروني، تقييم الحصص
   - الباقات: كتالوج الاشتراكات بأسعارها (الأسعار تُخفى عن المدرب)
   - العقد الإلكتروني: رابط تسجيل ذاتي يفتحه الزبون، يرى كل الأسعار،
     يختار الباقة ويعبّي بياناته قبل أن يشترك — ثم تحوّله الإدارة لمشترك.
   - تقييم الحصة: المتدرب يقيّم حصته ويكتب تعليقًا — خاص بالإدارة فقط.
   ============================================================ */
const crypto = require('crypto');
const Store = require('./store');
const seedData = require('./seed-data');

const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/* الأسعار سرّ تجاري: المدرب والأخصائية لا يريان أي سعر */
const HIDE_PRICE_ROLES = ['trainer', 'nutritionist'];
const canSeePrices = (role) => !HIDE_PRICE_ROLES.includes(role);

function stripPackagePrice(pkg) {
  const { price, ...rest } = pkg;
  return rest;
}

/* قواعد بيانات أُنشئت قبل ميزة الباقات: تعبئة الباقات الافتراضية مرة واحدة */
let packagesBackfilled = false;
async function ensureDefaultPackages() {
  if (packagesBackfilled) return;
  packagesBackfilled = true;
  const rows = await Store.all('packages');
  if (rows.length) return;
  for (const p of seedData.DEFAULT_PACKAGES) {
    const { id, ...pkg } = p;
    await Store.insert('packages', pkg);
  }
}

/* حد بسيط لمحاولات فتح/إرسال العقد العام (بلا مصادقة) */
const publicHits = new Map();
function publicRateLimited(key, max, windowMs) {
  const now = Date.now();
  const rec = publicHits.get(key);
  if (!rec || rec.resetAt < now) {
    publicHits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}

const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);

/* أنواع الباقات في العقد — يختار الزبون نوعه أولًا ثم الباقة داخله */
const PACKAGE_CATEGORIES = ['personal', 'group', 'saver'];
const CATEGORY_LABELS = {
  personal: 'تدريب شخصي',
  group: 'تدريب مجموعات',
  saver: 'باقات التوفير',
};
const catOf = (p) => (PACKAGE_CATEGORIES.includes(p.category) ? p.category : 'personal');
const withCategory = (p) => ({ ...p, category: catOf(p), categoryLabel: CATEGORY_LABELS[catOf(p)] });

module.exports = function registerClients(app, { auth, requireRole, h, notify,
  scopedBranchIds, branchAllowed, denyOutOfScope }) {
  /* ============================================================
     الباقات (Packages)
     ============================================================ */
  app.get('/api/packages', auth, h(async (req, res) => {
    await ensureDefaultPackages();
    let list = await Store.all('packages');
    if (req.query.branch) {
      const b = Number(req.query.branch);
      list = list.filter((p) => !p.branchId || p.branchId === b);
    }
    // الباقة بلا فرع باقةُ الشركة كلها فتظهر للجميع؛ وباقة الفرع لأهله
    const mine = scopedBranchIds(req);
    if (mine) list = list.filter((p) => !p.branchId || mine.includes(Number(p.branchId)));
    if (req.query.active === '1' || !canSeePrices(req.user.role)) list = list.filter((p) => p.active !== false);
    if (PACKAGE_CATEGORIES.includes(req.query.category)) list = list.filter((p) => catOf(p) === req.query.category);
    list = list.sort((a, b) => (a.sessions || 0) - (b.sessions || 0)).map(withCategory);
    res.json(canSeePrices(req.user.role) ? list : list.map(stripPackagePrice));
  }));

  app.post('/api/packages', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { name, sessions, price, durationDays, branchId, sessionsPerWeek, description, features } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم الباقة مطلوب.' });
    if (!sessions || Number(sessions) <= 0) return res.status(400).json({ error: 'عدد الحصص مطلوب.' });
    if (price === undefined || Number(price) < 0) return res.status(400).json({ error: 'سعر الباقة مطلوب.' });
    // باقة بلا فرع تخصّ الشركة كلها — إنشاؤها صلاحية إدارة
    if (!branchAllowed(req.user, Number(branchId) || null)) return denyOutOfScope(res);
    res.json(withCategory(await Store.insert('packages', {
      name: clean(name, 120), sessions: Number(sessions), price: Number(price),
      durationDays: Number(durationDays) || 30, branchId: Number(branchId) || null,
      sessionsPerWeek: Number(sessionsPerWeek) || null,
      category: PACKAGE_CATEGORIES.includes(req.body.category) ? req.body.category : 'personal',
      description: clean(description, 500), features: clean(features, 1000),
      active: true, createdBy: req.user.id,
    })));
  }));

  app.put('/api/packages/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const pkg = await Store.get('packages', req.params.id);
    if (!pkg) return res.status(404).json({ error: 'الباقة غير موجودة.' });
    if (!branchAllowed(req.user, pkg.branchId)) return denyOutOfScope(res);
    const patch = {};
    if (req.body.name !== undefined) patch.name = clean(req.body.name, 120);
    if (req.body.description !== undefined) patch.description = clean(req.body.description, 500);
    if (req.body.features !== undefined) patch.features = clean(req.body.features, 1000);
    ['sessions', 'price', 'durationDays', 'sessionsPerWeek'].forEach((k) => {
      if (req.body[k] !== undefined && req.body[k] !== '') patch[k] = Number(req.body[k]);
    });
    if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;
    if (req.body.active !== undefined) patch.active = !!req.body.active;
    if (PACKAGE_CATEGORIES.includes(req.body.category)) patch.category = req.body.category;
    res.json(withCategory(await Store.update('packages', pkg.id, patch)));
  }));

  app.delete('/api/packages/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('packages', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     العقد الإلكتروني — رابط تسجيل ذاتي للزبون الجديد
     ============================================================ */
  const contractView = (c, branches) => ({
    ...c,
    branchName: (branches.find((b) => b.id === c.branchId) || {}).name || 'كل الفروع',
    url: `/#/contract/${c.token}`,
  });

  app.get('/api/contracts', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { contracts, branches } = await Store.load('contracts', 'branches');
    let list = contracts;
    if (req.query.status) list = list.filter((c) => c.status === req.query.status);
    // العقد بلا فرع عقدُ الشركة — يبقى للإدارة
    const mine = scopedBranchIds(req);
    if (mine) list = list.filter((c) => mine.includes(Number(c.branchId)));
    res.json(list.map((c) => contractView(c, branches)).sort((a, b) => b.id - a.id));
  }));

  app.post('/api/contracts', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const branches = await Store.all('branches');
    const branchId = Number(req.body.branchId) || null;
    if (branchId && !branches.some((b) => b.id === branchId)) return res.status(400).json({ error: 'الفرع غير موجود.' });
    if (!branchAllowed(req.user, branchId)) return denyOutOfScope(res);
    const days = Math.min(Math.max(Number(req.body.validDays) || 14, 1), 180);
    const contract = await Store.insert('contracts', {
      token: crypto.randomBytes(9).toString('hex'),
      branchId, createdBy: req.user.id, createdAt: todayStr(),
      expiresAt: addDays(days), status: 'open',
      note: clean(req.body.note, 300),
      prospectName: clean(req.body.prospectName, 120),
      prospectPhone: clean(req.body.prospectPhone, 30),
      leadId: Number(req.body.leadId) || null,
      submission: null, traineeId: null, convertedAt: null,
    });
    res.json(contractView(contract, branches));
  }));

  app.put('/api/contracts/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const contract = await Store.get('contracts', req.params.id);
    if (!contract) return res.status(404).json({ error: 'العقد غير موجود.' });
    const patch = {};
    if (req.body.note !== undefined) patch.note = clean(req.body.note, 300);
    if (req.body.status !== undefined) {
      if (!['open', 'cancelled', 'converted'].includes(req.body.status)) {
        return res.status(400).json({ error: 'الحالة: open أو cancelled أو converted.' });
      }
      patch.status = req.body.status;
      if (req.body.status === 'converted') {
        patch.traineeId = Number(req.body.traineeId) || null;
        patch.convertedAt = todayStr();
      }
    }
    if (req.body.validDays !== undefined) patch.expiresAt = addDays(Math.min(Math.max(Number(req.body.validDays) || 14, 1), 180));
    const branches = await Store.all('branches');
    res.json(contractView(await Store.update('contracts', contract.id, patch), branches));
  }));

  app.delete('/api/contracts/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('contracts', req.params.id);
    res.json({ ok: true });
  }));

  /* ---------- المسارات العامة (بلا تسجيل دخول) ---------- */
  const findContract = async (token) => (await Store.all('contracts')).find((c) => c.token === String(token || ''));

  app.get('/api/public/contract/:token', h(async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (publicRateLimited('view:' + ip, 120, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'محاولات كثيرة — انتظر قليلًا ثم حاول مجددًا.' });
    }
    await ensureDefaultPackages();
    const contract = await findContract(req.params.token);
    if (!contract) return res.status(404).json({ error: 'رابط العقد غير صحيح — تواصل مع الاستقبال.' });

    const { branches, packages, settings } = await Store.load('branches', 'packages', 'settings');
    const s = settings[0] || {};
    const expired = contract.expiresAt && contract.expiresAt < todayStr();
    const status = expired && contract.status === 'open' ? 'expired' : contract.status;
    const list = packages
      .filter((p) => p.active !== false && (!p.branchId || !contract.branchId || p.branchId === contract.branchId))
      .sort((a, b) => (a.sessions || 0) - (b.sessions || 0))
      .map(withCategory);

    /* الزبون يختار نوع التدريب أولًا: شخصي / مجموعات / توفير — ثم الباقة
       داخل النوع، فتظهر الباقة المختارة في العقد. */
    const categories = PACKAGE_CATEGORIES
      .map((key) => ({ key, label: CATEGORY_LABELS[key], count: list.filter((p) => p.category === key).length }))
      .filter((c) => c.count > 0);

    res.json({
      status,
      branchName: contract.branchId ? (branches.find((b) => b.id === contract.branchId) || {}).name : null,
      prospectName: contract.prospectName || '',
      prospectPhone: contract.prospectPhone || '',
      expiresAt: contract.expiresAt,
      currency: s.currency || 'ILS',
      slogan: 'change your life',
      terms: s.contractTerms || seedData.DEFAULT_CONTRACT_TERMS,
      packages: list, // بكل الأسعار — الزبون يرى كل شيء قبل أن يشترك
      categories,
      submission: ['submitted', 'converted'].includes(contract.status) ? contract.submission : null,
    });
  }));

  app.post('/api/public/contract/:token', h(async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (publicRateLimited('submit:' + ip, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجددًا.' });
    }
    const contract = await findContract(req.params.token);
    if (!contract) return res.status(404).json({ error: 'رابط العقد غير صحيح — تواصل مع الاستقبال.' });
    if (contract.status !== 'open') return res.status(400).json({ error: 'هذا العقد لم يعد متاحًا — تواصل مع الاستقبال.' });
    if (contract.expiresAt && contract.expiresAt < todayStr()) return res.status(400).json({ error: 'انتهت صلاحية رابط العقد — اطلب رابطًا جديدًا.' });

    const { name, phone, birthDate, goal, address, packageId, healthNotes, emergencyPhone, notes, agreed } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'الاسم الكامل مطلوب.' });
    if (!phone || String(phone).replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'رقم جوال صحيح مطلوب.' });
    if (!agreed) return res.status(400).json({ error: 'يرجى الموافقة على شروط الاشتراك أولًا.' });

    const pkg = await Store.get('packages', Number(packageId));
    if (!pkg || pkg.active === false) return res.status(400).json({ error: 'اختر إحدى الباقات المتاحة.' });

    const submission = {
      name: clean(name, 120), phone: clean(phone, 30), birthDate: birthDate || null,
      goal: require('./goals').isGoal(goal) ? goal : 'loss',
      address: clean(address, 200),
      packageId: pkg.id, packageName: pkg.name, sessions: pkg.sessions, price: pkg.price,
      packageCategory: catOf(pkg), packageCategoryLabel: CATEGORY_LABELS[catOf(pkg)],
      durationDays: pkg.durationDays || 30,
      healthNotes: clean(healthNotes, 500), emergencyPhone: clean(emergencyPhone, 30),
      notes: clean(notes, 500), agreedAt: new Date().toISOString(),
    };
    await Store.update('contracts', contract.id, { status: 'submitted', submission, submittedAt: todayStr() });

    const users = await Store.all('users');
    for (const u of users.filter((x) => ['admin', 'accountant'].includes(x.role) && x.active !== false)) {
      await notify(u.id, `📝 عقد جديد: ${submission.name} عبّأ بياناته واختار «${submission.packageName}» (${submission.packageCategoryLabel}) — راجعه في صفحة الباقات والعقود.`, 'contract');
    }
    res.json({ ok: true, packageName: pkg.name, sessions: pkg.sessions, price: pkg.price, categoryLabel: CATEGORY_LABELS[catOf(pkg)] });
  }));

  /* ============================================================
     تقييم الحصة — من المتدرب، وخاص بالإدارة
     ============================================================ */
  app.post('/api/sessions/:id/rating', auth, requireRole('trainee'), h(async (req, res) => {
    const session = await Store.get('sessions', req.params.id);
    if (!session) return res.status(404).json({ error: 'الحصة غير موجودة.' });
    if (session.traineeId !== req.user.id) return res.status(403).json({ error: 'يمكنك تقييم حصصك أنت فقط.' });
    const rating = Math.trunc(Number(req.body.rating));
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'التقييم من 1 إلى 5 نجوم.' });
    const comment = clean(req.body.comment, 1000);

    const all = await Store.all('sessionRatings');
    const existing = all.find((r) => r.sessionId === session.id && r.traineeId === req.user.id);
    const body = {
      sessionId: session.id, traineeId: req.user.id, trainerId: session.trainerId,
      rating, comment, date: todayStr(), seen: false,
    };
    const saved = existing ? await Store.update('sessionRatings', existing.id, body) : await Store.insert('sessionRatings', body);

    // التقييم خاص بالإدارة — لا يصل المدرب منه شيء
    const admins = (await Store.all('users')).filter((u) => u.role === 'admin' && u.active !== false);
    const low = rating <= 2;
    for (const a of admins) {
      await notify(a.id,
        `${low ? '⚠️' : '⭐'} تقييم حصة من ${req.user.name}: ${rating}/5${comment ? ` — «${comment.slice(0, 120)}»` : ''}`,
        'rating');
    }
    res.json({ ...saved, private: true });
  }));

  /* تقييمات المتدرب نفسه — ليعرف ما قيّمه سابقًا */
  app.get('/api/my-ratings', auth, requireRole('trainee'), h(async (req, res) => {
    const all = await Store.all('sessionRatings');
    res.json(all.filter((r) => r.traineeId === req.user.id).sort((a, b) => b.id - a.id));
  }));

  /* لوحة التقييمات — للإدارة فقط (سرّية عن المدربين) */
  app.get('/api/session-ratings', auth, requireRole('admin'), h(async (req, res) => {
    const { sessionRatings, users, sessions } = await Store.load('sessionRatings', 'users', 'sessions');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
    let list = sessionRatings;
    if (req.query.trainer) list = list.filter((r) => r.trainerId === Number(req.query.trainer));
    if (req.query.trainee) list = list.filter((r) => r.traineeId === Number(req.query.trainee));
    if (req.query.month) list = list.filter((r) => (r.date || '').slice(0, 7) === req.query.month);

    const rows = list.map((r) => {
      const s = sessions.find((x) => x.id === r.sessionId) || {};
      return {
        ...r, traineeName: nameOf(r.traineeId), trainerName: nameOf(r.trainerId),
        sessionDate: s.date || null, sessionTime: s.time || null, style: s.style || '',
      };
    }).sort((a, b) => b.id - a.id);

    const byTrainer = {};
    list.forEach((r) => {
      const t = byTrainer[r.trainerId] = byTrainer[r.trainerId] || { trainerId: r.trainerId, name: nameOf(r.trainerId), count: 0, sum: 0, low: 0 };
      t.count += 1; t.sum += r.rating;
      if (r.rating <= 2) t.low += 1;
    });

    res.json({
      ratings: rows,
      average: list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : null,
      count: list.length,
      lowCount: list.filter((r) => r.rating <= 2).length,
      withComments: list.filter((r) => r.comment).length,
      trainers: Object.values(byTrainer)
        .map((t) => ({ ...t, average: Math.round((t.sum / t.count) * 10) / 10 }))
        .sort((a, b) => a.average - b.average),
    });
  }));

  /* تعليم تقييم كمقروء من الإدارة */
  app.put('/api/session-ratings/:id', auth, requireRole('admin'), h(async (req, res) => {
    const row = await Store.get('sessionRatings', req.params.id);
    if (!row) return res.status(404).json({ error: 'التقييم غير موجود.' });
    res.json(await Store.update('sessionRatings', row.id, { seen: req.body.seen !== false }));
  }));
};

module.exports.canSeePrices = canSeePrices;
module.exports.stripPackagePrice = stripPackagePrice;
module.exports.ensureDefaultPackages = ensureDefaultPackages;
module.exports.PACKAGE_CATEGORIES = PACKAGE_CATEGORIES;
module.exports.CATEGORY_LABELS = CATEGORY_LABELS;
module.exports.withCategory = withCategory;

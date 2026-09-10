/* ============================================================
   سبورت باور — وحدة الموقع العام
   - الدورات: كتالوج الدورات المسوَّقة على الموقع (تُدار كما تُدار الباقات)
   - واجهة الموقع العام (بلا مصادقة): الفروع والباقات والدورات وبيانات
     التواصل، واستقبال طلبات الانضمام من الموقع كـ«عميل محتمل» يظهر
     في صفحة متابعة المبيعات وتُشعَر به الإدارة والمحاسبة.
   الموقع نفسه مشروع منفصل (مجلد site/) على أصلٍ آخر، لذا تُفتح له
   مشاركة الموارد عبر الأصول (CORS) على مسارات /api/public/site فقط.
   ============================================================ */
const Store = require('./store');
const seedData = require('./seed-data');
const { GOAL_LABELS, isGoal } = require('./goals');

const todayStr = () => new Date().toISOString().slice(0, 10);
const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
const digits = (v) => String(v || '').replace(/\D/g, '');

/* قناة الموقع في ملف المبيعات — ثابتة حتى تُصفّى بها تقارير القنوات */
const WEBSITE_CHANNEL = 'الموقع الإلكتروني';
const FORMATS = ['online', 'in-person', 'hybrid'];
const TIER_KEYS = ['silver', 'gold', 'premium'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* الأصول المسموح لها بمخاطبة واجهة الموقع: الموقع الرسمي، ويمكن
   توسيعها بمتغير البيئة SITE_ORIGINS (فاصلة بين الأصول، ويقبل نمطًا
   مثل https://*.vercel.app لنسخ المعاينة). محليًا يُقبل localhost. */
function allowedOrigins() {
  const env = String(process.env.SITE_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = env.length ? env : ['https://www.sport-power.net', 'https://sport-power.net'];
  return list;
}
function originAllowed(origin) {
  if (!origin) return false;
  if (!process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return allowedOrigins().some((pattern) => {
    if (!pattern.includes('*')) return pattern === origin;
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+') + '$', 'i');
    return re.test(origin);
  });
}

/* --- تطبيع الدورة قبل الحفظ: الباقات والمحاور مصفوفتان نظيفتان --- */
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => clean(x, 200)).filter(Boolean).slice(0, 12);

function normalizeTiers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const t of arr.slice(0, 3)) {
    if (!t || typeof t !== 'object') continue;
    const price = Number(t.price);
    const name = clean(t.name, 40);
    if (!name || !(price >= 0)) continue;
    const key = TIER_KEYS.includes(t.key) ? t.key : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'tier';
    out.push({
      key, name, nameEn: clean(t.nameEn, 40) || name, price,
      highlight: t.highlight === true,
      features: lines(t.features), featuresEn: lines(t.featuresEn),
    });
  }
  return out;
}

function normalizeModules(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 12).map((m) => (m && typeof m === 'object' ? {
    title: clean(m.title, 120), titleEn: clean(m.titleEn, 120),
    text: clean(m.text, 600), textEn: clean(m.textEn, 600),
  } : null)).filter((m) => m && m.title);
}

function courseBody(body, existing) {
  const b = body || {};
  const pick = (k, max) => (b[k] !== undefined ? clean(b[k], max) : (existing ? existing[k] : ''));
  const out = {
    title: pick('title', 140), titleEn: pick('titleEn', 140),
    tagline: pick('tagline', 200), taglineEn: pick('taglineEn', 200),
    summary: pick('summary', 1500), summaryEn: pick('summaryEn', 1500),
    audience: pick('audience', 500), audienceEn: pick('audienceEn', 500),
    durationText: pick('durationText', 160), durationTextEn: pick('durationTextEn', 160),
    methods: pick('methods', 160),
    startDate: b.startDate !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.startDate)) ? String(b.startDate) : '') : (existing ? existing.startDate : ''),
  };
  if (b.slug !== undefined || !existing) {
    const slug = clean(b.slug, 60).toLowerCase();
    if (!SLUG_RE.test(slug)) throw Object.assign(new Error('الرابط المختصر (slug) بأحرف إنجليزية صغيرة وأرقام وشرطات فقط — مثل coach-business.'), { status: 400 });
    out.slug = slug;
  }
  if (!out.title) throw Object.assign(new Error('عنوان الدورة مطلوب.'), { status: 400 });
  if (b.format !== undefined) out.format = FORMATS.includes(b.format) ? b.format : 'hybrid';
  else if (!existing) out.format = 'hybrid';
  if (b.lessons !== undefined) out.lessons = Math.max(0, Math.trunc(Number(b.lessons)) || 0);
  if (b.currency !== undefined) out.currency = ['ILS', 'JOD', 'USD'].includes(b.currency) ? b.currency : 'ILS';
  else if (!existing) out.currency = 'ILS';
  if (b.tiers !== undefined) out.tiers = normalizeTiers(b.tiers);
  else if (!existing) out.tiers = [];
  if (b.modules !== undefined) out.modules = normalizeModules(b.modules);
  else if (!existing) out.modules = [];
  if (b.published !== undefined) out.published = b.published === true || b.published === 'true';
  else if (!existing) out.published = false;
  if (b.sort !== undefined) out.sort = Math.trunc(Number(b.sort)) || 0;
  return out;
}

/* قاعدة أُنشئت قبل ميزة الدورات: زرع الدورة الافتراضية مرة واحدة */
let coursesBackfilled = false;
async function ensureDefaultCourses() {
  if (coursesBackfilled) return;
  coursesBackfilled = true;
  if (await Store.count('courses', null)) return;
  for (const c of seedData.DEFAULT_COURSES) {
    const { id, ...course } = c;
    await Store.insert('courses', { ...course, createdAt: todayStr() });
  }
}

/* ما يخرج من الدورة للموقع — كما هو، بلا بيانات داخلية */
function publicCourse(c) {
  const { createdBy, ...rest } = c;
  return { ...rest, tiers: Array.isArray(rest.tiers) ? rest.tiers : [], modules: Array.isArray(rest.modules) ? rest.modules : [] };
}

/* بيانات التواصل المعروضة على الموقع — تُضبط من صفحة الإعدادات */
const SITE_CONTACT_KEYS = ['sitePhone', 'siteWhatsapp', 'siteEmail', 'siteInstagram', 'siteFacebook', 'siteTiktok', 'siteAddress'];
function siteContact(settings) {
  const s = settings || {};
  const out = {};
  for (const k of SITE_CONTACT_KEYS) out[k.replace(/^site/, '').replace(/^./, (ch) => ch.toLowerCase())] = s[k] || '';
  out.waCountryCode = s.waCountryCode || '970';
  return out;
}

module.exports = function registerSite(app, { auth, requireRole, h, notify, rateLimited, clientIp, currencyMap }) {
  /* ---------- CORS لمسارات الموقع العام فقط ---------- */
  app.use('/api/public/site', (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  const viewLimit = async (req, res) => {
    if (await rateLimited('site-view:' + clientIp(req), 600, 15 * 60 * 1000)) {
      res.status(429).json({ error: 'محاولات كثيرة — انتظر قليلًا ثم حاول مجددًا.' });
      return false;
    }
    return true;
  };
  /* بيانات الموقع عامة ولا تحمل شيئًا شخصيًا — يجوز تخزينها قليلًا على
     الحافة، خلافًا لبقية الواجهة البرمجية (no-store). */
  const cacheable = (res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.removeHeader('Pragma');
  };

  /* ============================================================
     الواجهة العامة للموقع
     ============================================================ */
  app.get('/api/public/site', h(async (req, res) => {
    if (!(await viewLimit(req, res))) return;
    await ensureDefaultCourses();
    const { branches, packages, courses, settings } = await Store.load('branches', 'packages', 'courses', 'settings');
    const cur = await currencyMap();
    const pkgList = packages
      .filter((p) => p.active !== false)
      .sort((a, b) => (a.branchId || 0) - (b.branchId || 0) || (a.sessions || 0) - (b.sessions || 0))
      .map((p) => ({
        /* بلا سعر: الأسعار سرّ تجاري وتختلف بين الفروع — الموقع يعرض
           «السعر عند التواصل» ويحوّل الزائر إلى واتساب أو نموذج الانضمام */
        id: p.id, name: p.name, category: p.category || 'personal', sessions: p.sessions,
        currency: cur.of(p.branchId || null), durationDays: p.durationDays || 30,
        sessionsPerWeek: p.sessionsPerWeek || null, description: p.description || '',
        features: String(p.features || '').split('\n').map((s) => s.trim()).filter(Boolean),
        branchId: p.branchId || null,
      }));
    cacheable(res);
    res.json({
      contact: siteContact(settings[0]),
      branches: branches.map((b) => ({ id: b.id, name: b.name, address: b.address || '', phone: b.phone || '', currency: cur.of(b.id) })),
      packages: pkgList,
      courses: courses.filter((c) => c.published === true).sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(publicCourse),
      goals: Object.entries(GOAL_LABELS).map(([key, label]) => ({ key, label })),
    });
  }));

  app.get('/api/public/site/courses/:slug', h(async (req, res) => {
    if (!(await viewLimit(req, res))) return;
    await ensureDefaultCourses();
    const course = (await Store.find('courses', { slug: String(req.params.slug || '').toLowerCase() }, { limit: 1 }))[0];
    if (!course || course.published !== true) return res.status(404).json({ error: 'الدورة غير موجودة.' });
    const settings = (await Store.all('settings'))[0];
    cacheable(res);
    res.json({ course: publicCourse(course), contact: siteContact(settings) });
  }));

  /* طلب من الموقع → عميل محتمل في ملف المبيعات + إشعار للإدارة والمحاسبة.
     لا يُنشأ حساب هنا: الحساب يُنشأ بعد التواصل والعقد كما هو نظام العمل. */
  app.post('/api/public/site/leads', h(async (req, res) => {
    const ip = clientIp(req);
    const b = req.body || {};
    /* حقل فخّ للروبوتات: إن مُلئ نعيد نجاحًا صامتًا بلا حفظ */
    if (clean(b.website, 50)) return res.json({ ok: true });
    if (await rateLimited('site-lead:' + ip, 6, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'محاولات كثيرة — انتظر 15 دقيقة ثم حاول مجددًا.' });
    }
    const name = clean(b.name, 120);
    const phone = clean(b.phone, 30);
    const email = clean(b.email, 120).toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: 'الاسم الكامل مطلوب.', field: 'name' });
    if (digits(phone).length < 7) return res.status(400).json({ error: 'رقم جوال صحيح مطلوب.', field: 'phone' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صحيح.', field: 'email' });

    const branchId = Number(b.branchId) || null;
    if (branchId && !(await Store.get('branches', branchId))) return res.status(400).json({ error: 'الفرع غير موجود.', field: 'branchId' });

    const interest = b.interest === 'course' ? 'course' : 'training';
    let course = null; let tier = '';
    let trainingType = 'من الموقع';
    let goal = '';
    if (interest === 'course') {
      const slug = clean(b.courseSlug, 60).toLowerCase();
      course = slug ? (await Store.find('courses', { slug }, { limit: 1 }))[0] : null;
      if (!course || course.published !== true) return res.status(400).json({ error: 'اختر دورة متاحة.', field: 'courseSlug' });
      const t = (course.tiers || []).find((x) => x.key === clean(b.tier, 20));
      tier = t ? t.key : '';
      trainingType = 'دورة';
    } else {
      goal = isGoal(b.goal) ? b.goal : '';
      trainingType = clean(b.trainingType, 40) || 'من الموقع';
    }
    const message = clean(b.message, 800);
    const residence = clean(b.residence, 120);
    const lang = b.lang === 'en' ? 'en' : 'ar';

    const parts = ['[الموقع الإلكتروني' + (lang === 'en' ? ' — EN' : '') + ']'];
    if (course) parts.push(`دورة «${course.title}»` + (tier ? ` — باقة ${tier}` : ''));
    if (email) parts.push('البريد: ' + email);
    if (message) parts.push('الرسالة: ' + message);
    const note = parts.join(' | ').slice(0, 1000);

    /* الرقم نفسه خلال أسبوع = متابعة على السجل القائم لا سجل جديد */
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const dup = (await Store.all('leads')).find((l) => l.phone && digits(l.phone) === digits(phone) && (l.contactDate || '') >= since && l.stage !== 'subscribed');
    let lead;
    if (dup) {
      lead = await Store.update('leads', dup.id, {
        note: [dup.note, note].filter(Boolean).join('\n').slice(0, 2000),
        email: email || dup.email || '',
        courseId: course ? course.id : dup.courseId || null,
        tier: tier || dup.tier || '',
      });
    } else {
      lead = await Store.insert('leads', {
        contactDate: todayStr(), name, phone, email, residence,
        channel: WEBSITE_CHANNEL, trainingType, branchId,
        goal: goal ? GOAL_LABELS[goal] : '', stage: 'new', objection: '', note,
        traineeId: null, createdBy: null, courseId: course ? course.id : null, tier,
      });
    }
    const users = await Store.all('users');
    const what = course ? `يسأل عن دورة «${course.title}»${tier ? ` (${tier})` : ''}` : 'يريد الانضمام للتدريب';
    for (const u of users.filter((x) => ['admin', 'accountant'].includes(x.role) && x.active !== false)) {
      await notify(u.id, `🌐 طلب جديد من الموقع: ${name} (${phone}) ${what} — تابعه في متابعة المبيعات.`, 'lead');
    }
    res.json({ ok: true, duplicate: !!dup, leadId: lead.id });
  }));

  /* ============================================================
     إدارة الدورات (الإدارة تُحرّر — المحاسبة تقرأ)
     ============================================================ */
  /* المسجّلون في كل دورة: هم سجلات متابعة المبيعات المربوطة بالدورة
     (من الموقع أو من الإدارة) — لا جدول ثانٍ، فالمتابعة تبقى في مكان واحد */
  const applicantsOf = (leads, courseId) => leads
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || '') || b.id - a.id);
  const applicantSummary = (list) => ({
    total: list.length,
    open: list.filter((l) => !['subscribed', 'lost'].includes(l.stage)).length,
    subscribed: list.filter((l) => l.stage === 'subscribed').length,
    byTier: list.reduce((m, l) => { const k = l.tier || 'none'; m[k] = (m[k] || 0) + 1; return m; }, {}),
  });

  app.get('/api/courses', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    await ensureDefaultCourses();
    const { courses, leads } = await Store.load('courses', 'leads');
    res.json(courses
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id)
      .map((c) => ({ ...c, applicants: applicantSummary(applicantsOf(leads, c.id)) })));
  }));

  app.get('/api/courses/:id/applicants', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const course = await Store.get('courses', req.params.id);
    if (!course) return res.status(404).json({ error: 'الدورة غير موجودة.' });
    const { leads, branches } = await Store.load('leads', 'branches');
    const tierName = (key) => ((course.tiers || []).find((t) => t.key === key) || {}).name || key || '';
    const list = applicantsOf(leads, course.id).map((l) => ({
      id: l.id, name: l.name, phone: l.phone || '', email: l.email || '', residence: l.residence || '',
      tier: l.tier || '', tierName: tierName(l.tier), stage: l.stage || 'new', objection: l.objection || '',
      channel: l.channel || '', contactDate: l.contactDate || '', note: l.note || '',
      branchName: l.branchId ? (branches.find((b) => b.id === l.branchId) || {}).name || '' : '',
      traineeId: l.traineeId || null,
    }));
    res.json({ course: { id: course.id, title: course.title, slug: course.slug, tiers: course.tiers || [], currency: course.currency || 'ILS' }, summary: applicantSummary(list), applicants: list });
  }));

  app.post('/api/courses', auth, requireRole('admin'), h(async (req, res) => {
    const body = courseBody(req.body, null);
    if ((await Store.find('courses', { slug: body.slug }, { limit: 1 })).length) {
      return res.status(400).json({ error: 'هذا الرابط المختصر مستخدم لدورة أخرى.' });
    }
    res.json(await Store.insert('courses', { ...body, createdBy: req.user.id, createdAt: todayStr() }));
  }));

  app.put('/api/courses/:id', auth, requireRole('admin'), h(async (req, res) => {
    const existing = await Store.get('courses', req.params.id);
    if (!existing) return res.status(404).json({ error: 'الدورة غير موجودة.' });
    const body = courseBody(req.body, existing);
    if (body.slug && body.slug !== existing.slug
      && (await Store.find('courses', { slug: body.slug }, { limit: 1 })).length) {
      return res.status(400).json({ error: 'هذا الرابط المختصر مستخدم لدورة أخرى.' });
    }
    res.json(await Store.update('courses', existing.id, body));
  }));

  app.delete('/api/courses/:id', auth, requireRole('admin'), h(async (req, res) => {
    const existing = await Store.get('courses', req.params.id);
    if (!existing) return res.status(404).json({ error: 'الدورة غير موجودة.' });
    await Store.remove('courses', existing.id);
    res.json({ ok: true });
  }));
};

module.exports.SITE_CONTACT_KEYS = SITE_CONTACT_KEYS;
module.exports.WEBSITE_CHANNEL = WEBSITE_CHANNEL;
module.exports.originAllowed = originAllowed;

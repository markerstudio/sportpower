/* ============================================================
   سبورت باور — وحدة النمو والمبيعات والولاء
   - المصاريف الشهرية وصافي الربح
   - تقرير النمو الشهري (Retention / Cancellation / Net Growth / LTV…)
   - ملف متابعة المبيعات (Leads) وتحليل الإغلاق الشهري
   - البرامج التدريبية (تُربط تلقائيًا بكل المتدربين)
   - نظام الولاء: نقاطي ومكافآتي + الإحالات (ادعُ صديقًا)
   ============================================================ */
const crypto = require('crypto');
const Store = require('./store');
const ops = require('./ops');

const monthOf = (d) => (d || '').slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);
const round1 = (n) => Math.round(n * 10) / 10;

/* نطاق الفروع: قائمةُ فروع (نطاق المحاسب قد يضمّ فرعين) أو null = الكل.
   يُقبل الرقم المفرد أيضًا توافقًا مع نداءات قديمة. */
const asScope = (branch) => (branch == null ? null : (Array.isArray(branch) ? branch : [branch]).map(Number));
const inScopeList = (scope, id) => !scope || scope.includes(Number(id));
/* شرط القاعدة: فرعٌ واحد يُطابَق مباشرةً، وعدةُ فروع بـ IN */
const scopeWhere = (scope, field = 'branchId') => (!scope ? {}
  : { [field]: scope.length === 1 ? scope[0] : { in: scope } });

/* نقاط الولاء الفعلية من الإعدادات (مع افتراضيات) */
async function loyaltyPts() {
  const rows = await Store.all('settings');
  const s = rows[0] || {};
  return {
    // «نتيجة منشورة على السوشال ميديا» حلّت محل نقاط حضور الحصة —
    // المفتاح القديم ptsSession يبقى قيمةً افتراضية للقواعد القائمة
    result: Number(s.ptsResult ?? s.ptsSession) || 25,
    renewal: Number(s.ptsRenewal) || 50,
    referral: Number(s.ptsReferral) || 100,
    // نقطة الولاء: تجديد في وقته + دفعة واحدة + إكمال كل الحصص
    loyalty: Number(s.ptsLoyalty) || 1,
  };
}

/* منح نقاط لمتدرب + إشعاره (قيمة سالبة = خصم استبدال/تصحيح) */
async function awardPoints(traineeId, points, reason) {
  const pts = Math.trunc(Number(points));
  if (!pts) return null;
  const entry = await Store.insert('pointsLog', { traineeId, points: pts, reason: reason || '', date: todayStr() });
  if (pts > 0) {
    await Store.insert('notifications', {
      userId: traineeId, text: `🎁 حصلت على ${pts} نقطة — ${reason}. اطّلع على «نقاطي ومكافآتي».`,
      date: todayStr(), read: false, type: 'loyalty',
    });
  }
  return entry;
}

/* ============================================================
   ولاء المشتركين — «نقطة الولاء»
   تُمنح للمشترك الذي اجتمعت فيه ثلاثة شروط معًا:
     ١) جدّد اشتراكه في وقته المحدد (قبل انتهاء الاشتراك السابق أو فيه)
     ٢) دفع كامل قيمة الاشتراك مرة واحدة (دفعة واحدة تغطي المبلغ)
     ٣) كان قد أنهى كل حصص اشتراكه السابق
   تُقيَّم عند اكتمال السداد، ولا تتكرر للاشتراك نفسه.
   ============================================================ */
async function evaluateLoyalty(subscriptionId) {
  const sub = await Store.get('subscriptions', Number(subscriptionId));
  if (!sub) return null;
  const reason = `ولاء: تجديد في وقته بدفعة واحدة مع إكمال الحصص (اشتراك #${sub.id})`;

  const [payments, subs, log] = await Promise.all([
    Store.find('payments', { subscriptionId: sub.id }),
    Store.find('subscriptions', { traineeId: sub.traineeId }),
    Store.find('pointsLog', { traineeId: sub.traineeId }),
  ]);
  if (log.some((p) => p.reason === reason)) return null; // مُنحت سابقًا

  // شرط الدفعة الواحدة الكاملة
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  if (payments.length !== 1 || paid + 0.001 < sub.price) return null;

  // الاشتراك السابق مباشرةً لهذا المتدرب
  const previous = subs
    .filter((s) => s.id !== sub.id && s.startDate <= sub.startDate && s.status !== 'cancelled')
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .pop();
  if (!previous) return null;                                   // اشتراك أول لا تجديد
  if (sub.startDate > previous.endDate) return null;            // تأخّر عن موعد التجديد
  if (previous.usedSessions < previous.totalSessions) return null; // لم يُنهِ حصصه

  const pts = await loyaltyPts();
  const entry = await awardPoints(sub.traineeId, pts.loyalty, reason);
  if (entry) {
    await Store.insert('notifications', {
      userId: sub.traineeId,
      text: '🏅 نقطة ولاء! جدّدت في وقتك، دفعت دفعة واحدة، وأنهيت كل حصصك — استمر، change your life 💪',
      date: todayStr(), read: false, type: 'loyalty',
    });
  }
  return entry;
}

async function pointsBalance(traineeId) {
  const log = (await Store.all('pointsLog')).filter((p) => p.traineeId === traineeId);
  return log.reduce((s, p) => s + p.points, 0);
}

/* قواعد بيانات أُنشئت قبل ميزة الولاء: تعبئة المكافآت الافتراضية مرة واحدة */
let rewardsBackfilled = false;
async function ensureDefaultRewards() {
  if (rewardsBackfilled) return;
  rewardsBackfilled = true;
  const rows = await Store.all('rewards');
  if (rows.length) return;
  const seedData = require('./seed-data');
  for (const r of seedData.DEFAULT_REWARDS) {
    const { id, ...reward } = r;
    await Store.insert('rewards', reward);
  }
}

/* كود إحالة فريد للمتدرب — يُنشأ عند أول طلب */
async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  const users = await Store.all('users');
  let code;
  do {
    code = 'SP-' + crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  } while (users.some((u) => u.referralCode === code));
  await Store.update('users', user.id, { referralCode: code });
  return code;
}

/* ============================================================
   تقرير النمو الشهري — وفق مؤشرات ملف الشركة
   ============================================================ */
async function buildGrowthReport(month, branchArg, subStatus) {
  const branch = asScope(branchArg);
  const year = month.slice(0, 4);
  // السنة السابقة مشمولة لأن ترحيل الهدف قد يعود حتى 12 شهرًا (ويعبر رأس السنة)
  const prevYear = String(Number(year) - 1);
  const scope = scopeWhere(branch);
  /* الأهداف السنوية تُحسب شهرًا بشهر، فنحتاج نافذة السنة — لا التاريخ كله.
     أما LTV (إجمالي ما دفعه العميل طوال بقائه) فيُحسب بتجميع في القاعدة. */
  const [subscriptions, subEvents, users, expenses, targets, branches, payments, lifetimeByBranch, allPays] = await Promise.all([
    Store.all('subscriptions'),
    Store.find('subEvents', { date: { gte: prevYear + '-01-01', lte: year + '-12-31' } }),
    Store.all('users'),
    Store.all('expenses'),
    Store.all('targets'),
    Store.all('branches'),
    Store.find('payments', { ...scope, subscriptionId: { isNull: false }, date: { gte: prevYear + '-01-01', lte: year + '-12-31' } }),
    Store.groupSum('payments', 'amount', 'branchId', { ...scope, subscriptionId: { isNull: false } }),
    Store.find('payments', { ...scope, subscriptionId: { isNull: false } }, { }),
  ]);
  // مؤشرات الحصص وسجل اليوم والنتائج تُحمَّل فقط إن وُجد هدف يعتمدها
  const relevant = (metrics) => targets.some((t) => metrics.includes(t.metric)
    && (t.period === month || t.period === year || /^\d{4}-H[12]$/.test(t.period)));
  const window2y = { date: { gte: prevYear + '-01-01', lte: year + '-12-31' } };
  const [sessions, trainerLogs, traineeFlags] = await Promise.all([
    relevant(['sessions', 'uniqueTrainees', 'hours', 'results']) ? Store.find('sessions', window2y) : [],
    relevant(['officeHours', 'stories', 'reels']) ? Store.find('trainerLogs', window2y) : [],
    relevant(['results']) ? Store.find('traineeFlags', window2y) : [],
  ]);

  const data = { subscriptions, subEvents, payments, users, expenses, targets, branches, sessions, trainerLogs, traineeFlags };
  const inBranch = (x) => inScopeList(branch, x.branchId);

  const ev = data.subEvents.filter((e) => inBranch(e) && monthOf(e.date) === month);
  const newCount = ev.filter((e) => e.type === 'new').length;
  const renewals = ev.filter((e) => e.type === 'renewal').length;
  const cancels = ev.filter((e) => e.type === 'cancel');
  const returns = ev.filter((e) => e.type === 'unfreeze').length;

  const subs = data.subscriptions.filter(inBranch);
  const activeTrainees = new Set(subs.filter((s) => subStatus(s) === 'active').map((s) => s.traineeId)).size;
  const frozenNow = new Set(subs.filter((s) => subStatus(s) === 'frozen').map((s) => s.traineeId)).size;
  const currentMembers = activeTrainees + frozenNow;

  // نسبة التجديد: من جدد ÷ من انتهت اشتراكاتهم خلال الشهر ×100
  const endedInMonth = subs.filter((s) => monthOf(s.endDate) === month && s.status !== 'cancelled').length;
  const retentionRate = endedInMonth ? Math.min(100, Math.round((renewals / endedInMonth) * 100)) : null;
  // نسبة الإلغاء: الإلغاءات ÷ المشتركين الحاليين ×100
  const cancellationRate = currentMembers ? round1((cancels.length / currentMembers) * 100) : null;
  // نسبة التجميد: المجمدون ÷ المشتركين الحاليين ×100
  const freezeRate = currentMembers ? round1((frozenNow / currentMembers) * 100) : null;
  // النمو الصافي: جدد + عائدون − إلغاءات
  const netGrowth = newCount + returns - cancels.length;

  // متوسط مدة بقاء العميل (أشهر) — من أول اشتراك حتى آخر انتهاء (بحد اليوم)
  const spanByTrainee = {};
  subs.forEach((s) => {
    const t = spanByTrainee[s.traineeId] = spanByTrainee[s.traineeId] || { min: s.startDate, max: s.endDate };
    if (s.startDate < t.min) t.min = s.startDate;
    if (s.endDate > t.max) t.max = s.endDate;
  });
  const CURRENCY_DECIMALS = { ILS: 2, JOD: 3, USD: 2 };
  const roundMoney = (v, code) => { const f = 10 ** (CURRENCY_DECIMALS[code] || 2); return Math.round((Number(v) || 0) * f) / f; };
  const sysCur = (await Store.all('settings'))[0];
  const fallbackCur = ['ILS', 'JOD', 'USD'].includes(sysCur && sysCur.currency) ? sysCur.currency : 'ILS';
  const curOf = (bid) => { const b = branches.find((x) => x.id === bid); return (b && ['ILS','JOD','USD'].includes(b.currency)) ? b.currency : fallbackCur; };
  const byCur = (rows, amtOf = (r) => r.amount) => {
    const o = {};
    for (const r of rows) { const c = curOf(r.branchId); o[c] = roundMoney((o[c] || 0) + Number(amtOf(r) || 0), c); }
    return o;
  };
  const today = todayStr();
  const durations = Object.values(spanByTrainee).map(({ min, max }) => {
    const end = max > today ? today : max;
    return Math.max((new Date(end) - new Date(min)) / 86400000, 0) / 30.44;
  });
  const avgDurationMonths = durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  // متوسط قيمة العميل LTV — لكل عملة على حدة (لا يُقسَم دينارٌ على دافعي الشيكل)
  const pays = data.payments;
  const lifePaidByCur = {};
  for (const [bid, amt] of Object.entries(lifetimeByBranch)) {
    const c = curOf(Number(bid)); lifePaidByCur[c] = roundMoney((lifePaidByCur[c] || 0) + Number(amt || 0), c);
  }
  const payersByCur = {};
  { const seen = {}; for (const p of allPays) { const c = curOf(p.branchId); (seen[c] = seen[c] || new Set()).add(p.traineeId); }
    for (const c of Object.keys(seen)) payersByCur[c] = seen[c].size; }
  const ltv = {};
  for (const c of Object.keys(lifePaidByCur)) if (payersByCur[c]) ltv[c] = roundMoney(lifePaidByCur[c] / payersByCur[c], c);

  // أسباب الإلغاء
  const churnReasons = {};
  cancels.forEach((c) => {
    const r = c.reason || 'غير محدد';
    churnReasons[r] = (churnReasons[r] || 0) + 1;
  });

  // المالية: التحصيل − المصاريف = صافي الربح — لكل عملة على حدة
  const monthPays = pays.filter((p) => monthOf(p.date) === month);
  const revenue = byCur(monthPays);
  const monthExpenses = data.expenses.filter((e) => e.month === month && inScopeList(branch, e.branchId));
  const expensesTotal = byCur(monthExpenses);
  const netProfit = {};
  for (const c of new Set([...Object.keys(revenue), ...Object.keys(expensesTotal)])) {
    netProfit[c] = roundMoney((revenue[c] || 0) - (expensesTotal[c] || 0), c);
  }
  /* هامش الربح كنسبة — للحساب الداخلي (نقاط الصحّة). التقرير المُوجَّه لفرع
     واحد عملةٌ واحدة فالنسبة معرّفة؛ التقرير المختلط يعيد null (لا نسبة
     ذات معنى عبر عملتين). */
  const curKeys = new Set([...Object.keys(revenue), ...Object.keys(expensesTotal)]);
  const profitMargin = (curKeys.size === 1)
    ? (() => { const c = [...curKeys][0]; return revenue[c] > 0 && expensesTotal[c] > 0 ? netProfit[c] / revenue[c] : null; })()
    : null;

  // الأهداف: الشهرية (مع الترحيل) + السنوية مقسمة على الأشهر
  const scopedTargets = data.targets.filter((t) => (t.scope === 'company' && !branch)
    || (t.scope === 'branch' && inScopeList(branch, t.refId)));
  const nameOf = (t) => (t.scope === 'company' ? 'الشركة كاملة' : (data.branches.find((b) => b.id === t.refId) || {}).name || '—');
  const monthlyGoals = scopedTargets.filter((t) => t.period === month).map((t) => {
    const actual = ops.computeActual(t, { ...data, subStatus }) || 0;
    const effective = ops.effectiveTarget(t, data.targets, data, subStatus);
    return {
      scopeName: nameOf(t), metric: t.metric, metricLabel: ops.METRIC_LABELS[t.metric] || t.metric,
      value: t.value, carried: effective - t.value, effective, actual,
      pct: effective ? Math.round((actual / effective) * 100) : null,
    };
  });
  const annualGoals = scopedTargets.filter((t) => t.period === year).map((t) => {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const p = `${year}-${String(m).padStart(2, '0')}`;
      months.push({ month: p, actual: ops.computeActual({ ...t, period: p }, { ...data, subStatus }) || 0 });
    }
    const actualYear = ops.computeActual(t, { ...data, subStatus }) || 0;
    return {
      scopeName: nameOf(t), metric: t.metric, metricLabel: ops.METRIC_LABELS[t.metric] || t.metric,
      value: t.value, monthlyShare: Math.round(t.value / 12), actual: actualYear,
      pct: t.value ? Math.round((actualYear / t.value) * 100) : null, months,
    };
  });

  return {
    month, branch,
    kpis: {
      newSubscribers: newCount, renewals, retentionRate,
      cancellations: cancels.length, cancellationRate,
      frozen: frozenNow, freezeRate,
      netGrowth, activeSubscribers: activeTrainees,
      avgDurationMonths, ltv,
    },
    churnReasons,
    finance: { revenue, expensesTotal, netProfit, profitMargin, expenses: monthExpenses },
    goals: { monthly: monthlyGoals, annual: annualGoals },
  };
}

/* ============================================================
   Branch Health Score — صحة الفرع من 100
   رقم واحد يُلخّص حال الفرع، محسوب من أهم المحاور بأوزان ثابتة
   (لا رقم عشوائيًا): نمو المشتركين 25% · تحقيق هدف التحصيل 25% ·
   التجديد/Retention 20% · الربحية 15% · أداء المدربين 10% ·
   التجميد والإلغاء 5%. المحور الذي لا بيانات له يخرج من الحساب
   وتُعاد موازنة الأوزان على المتبقي.
   ============================================================ */
const clamp01 = (v) => Math.max(0, Math.min(100, Math.round(v)));

function healthLabel(score) {
  if (score >= 90) return 'ممتاز';
  if (score >= 80) return 'جيد جدًا';
  if (score >= 70) return 'جيد';
  if (score >= 60) return 'يحتاج متابعة';
  return 'يحتاج تدخل';
}

const HEALTH_WEIGHTS = [
  ['growth', 'نمو المشتركين', 25],
  ['collection', 'تحقيق هدف التحصيل', 25],
  ['retention', 'التجديد / Retention', 20],
  ['profit', 'الربحية والمصاريف', 15],
  ['trainers', 'أداء المدربين', 10],
  ['freeze', 'التجميد والإلغاء', 5],
];

async function buildHealthScores(month, subStatus) {
  const [branches, users, tasks] = await Promise.all([
    Store.all('branches'),
    Store.all('users'),
    Store.find('tasks', { month }), // اليومية والشهرية معًا (month يُعبّأ للنوعين)
  ]);

  const rows = [];
  for (const b of branches) {
    const g = await buildGrowthReport(month, b.id, subStatus);
    const k = g.kpis;

    /* نمو المشتركين: نسبة تحقيق هدف الاشتراكات إن وُجد هدف شهري،
       وإلا يُشتق من النمو الصافي (0 صافي = 50 نقطة، كل مشترك ±10) */
    const growthGoal = g.goals.monthly.find((x) => ['newSubs', 'activeTrainees'].includes(x.metric));
    const growth = growthGoal && growthGoal.pct !== null
      ? Math.min(100, growthGoal.pct)
      : clamp01(50 + k.netGrowth * 10);

    /* تحقيق هدف التحصيل: يحتاج هدفًا شهريًا للتحصيل (مع المُرحَّل) */
    const revGoal = g.goals.monthly.find((x) => x.metric === 'revenue');
    const collection = revGoal && revGoal.pct !== null ? Math.min(100, revGoal.pct) : null;

    const retention = k.retentionRate;

    /* الربحية: هامش صافي الربح — هامش 50% فأكثر = 100 نقطة.
       بلا مصاريف مسجّلة لا يُحتسب المحور (رقم مضلِّل أسوأ من غيابه). */
    const profit = g.finance.profitMargin !== null && g.finance.profitMargin !== undefined
      ? clamp01(g.finance.profitMargin * 200)
      : null;

    /* أداء المدربين: نسبة إنجاز مهام مدربي الفرع لهذا الشهر */
    const trainerIds = new Set(users
      .filter((u) => u.role === 'trainer' && u.active !== false && u.branchId === b.id)
      .map((u) => u.id));
    const bTasks = tasks.filter((t) => trainerIds.has(t.trainerId));
    const trainers = bTasks.length
      ? Math.round((bTasks.filter((t) => t.status === 'done').length / bTasks.length) * 100)
      : null;

    /* التجميد والإلغاء: كل نقطة تجميد −3 وكل نقطة إلغاء −5 من 100 */
    const freeze = (k.freezeRate === null && k.cancellationRate === null)
      ? null
      : clamp01(100 - (k.freezeRate || 0) * 3 - (k.cancellationRate || 0) * 5);

    const values = { growth, collection, retention, profit, trainers, freeze };
    let weighted = 0, totalWeight = 0;
    const components = HEALTH_WEIGHTS.map(([key, label, weight]) => {
      const value = values[key];
      if (value !== null && value !== undefined) {
        weighted += value * weight;
        totalWeight += weight;
      }
      return { key, label, weight, value: value ?? null };
    });
    const score = totalWeight ? Math.round(weighted / totalWeight) : null;

    rows.push({
      branchId: b.id, branch: b.name,
      score, label: score === null ? 'لا بيانات' : healthLabel(score),
      components,
    });
  }

  const scored = rows.filter((r) => r.score !== null);
  const company = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length)
    : null;
  return {
    month,
    branches: rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    company: { score: company, label: company === null ? 'لا بيانات' : healthLabel(company) },
  };
}

/* ============================================================
   تحليل المبيعات الشهري من ملف المتابعة
   ============================================================ */
function leadsSummary(leads, month) {
  const list = leads.filter((l) => monthOf(l.contactDate) === month);
  const count = (stage) => list.filter((l) => l.stage === stage).length;
  const byStage = {};
  const byObjection = {};
  const byChannel = {};
  list.forEach((l) => {
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
    if (l.objection) byObjection[l.objection] = (byObjection[l.objection] || 0) + 1;
    if (l.channel) byChannel[l.channel] = (byChannel[l.channel] || 0) + 1;
  });
  const subscribed = count('subscribed');
  return {
    month, total: list.length, subscribed,
    lost: count('lost'), noShow: count('no-show'),
    inProgress: list.length - subscribed - count('lost') - count('no-show'),
    closingRate: list.length ? round1((subscribed / list.length) * 100) : null,
    byStage, byObjection, byChannel,
  };
}

module.exports = function registerGrowth(app, { auth, requireRole, h, notify, subStatus,
  rateLimited, scopedBranchIds, scopeFilter, branchAllowed, denyOutOfScope }) {
  /* ============================================================
     المصاريف الشهرية (المحاسب/الإدارة)
     ============================================================ */
  app.get('/api/expenses', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    let list = await Store.all('expenses');
    if (req.query.month) list = list.filter((e) => e.month === req.query.month);
    // المصروف بلا فرع مصروفُ شركةٍ — يخصّ الإدارة لا محاسب فرع
    list = list.filter(scopeFilter(req));
    res.json(list);
  }));

  app.post('/api/expenses', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { month, branchId, category, label, amount, note } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM.' });
    if (!label || !amount || Number(amount) <= 0) return res.status(400).json({ error: 'البيان والمبلغ مطلوبان.' });
    if (!branchAllowed(req.user, Number(branchId) || null)) return denyOutOfScope(res);
    res.json(await Store.insert('expenses', {
      month, branchId: Number(branchId) || null, category: category || 'أخرى',
      label, amount: Number(amount), note: note || '', createdBy: req.user.id,
    }));
  }));

  app.put('/api/expenses/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const row = await Store.get('expenses', req.params.id);
    if (!row) return res.status(404).json({ error: 'المصروف غير موجود.' });
    if (!branchAllowed(req.user, row.branchId)) return denyOutOfScope(res);
    if (req.body.branchId !== undefined && !branchAllowed(req.user, Number(req.body.branchId) || null)) return denyOutOfScope(res);
    const patch = {};
    ['month', 'category', 'label', 'note'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (req.body.amount !== undefined) patch.amount = Number(req.body.amount);
    if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;
    res.json(await Store.update('expenses', row.id, patch));
  }));

  app.delete('/api/expenses/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const row = await Store.get('expenses', req.params.id);
    if (!row) return res.status(404).json({ error: 'المصروف غير موجود.' });
    if (!branchAllowed(req.user, row.branchId)) return denyOutOfScope(res);
    await Store.remove('expenses', row.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     تقرير النمو الشهري — يظهر ضمن التقارير الشهرية
     ============================================================ */
  app.get('/api/reports/growth', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    res.json(await buildGrowthReport(month, scopedBranchIds(req), subStatus));
  }));

  /* Branch Health Score — صحة كل فرع من 100 (أول رقم في التقرير الشهري) */
  app.get('/api/reports/health', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    const all = await buildHealthScores(month, subStatus);
    const mine = scopedBranchIds(req);
    if (!mine) return res.json(all);
    /* محاسب فرعٍ يرى صحة فروعه — ومعدّلها بينها، لا معدّل الشركة كاملة */
    const branches = all.branches.filter((b) => mine.includes(b.branchId));
    const scored = branches.filter((b) => b.score !== null);
    const avg = scored.length ? Math.round(scored.reduce((t, b) => t + b.score, 0) / scored.length) : null;
    res.json({ ...all, branches, company: { score: avg, label: avg === null ? 'لا بيانات' : healthLabel(avg) } });
  }));

  /* ============================================================
     ملف متابعة المبيعات (Leads)
     ============================================================ */
  const LEAD_STAGES = ['new', 'contacted', 'trial-booked', 'trial-attended', 'no-show', 'subscribed', 'lost'];

  app.get('/api/leads', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    let list = await Store.all('leads');
    if (req.query.month) list = list.filter((l) => monthOf(l.contactDate) === req.query.month);
    if (req.query.stage) list = list.filter((l) => l.stage === req.query.stage);
    list = list.filter(scopeFilter(req));
    res.json(list.sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || '')));
  }));

  app.get('/api/leads/summary', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    res.json(leadsSummary((await Store.all('leads')).filter(scopeFilter(req)), month));
  }));

  app.post('/api/leads', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { name, phone, contactDate, residence, channel, trainingType, branchId, goal, stage, objection, note } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم العميل المحتمل مطلوب.' });
    if (!branchAllowed(req.user, Number(branchId) || null)) return denyOutOfScope(res);
    res.json(await Store.insert('leads', {
      contactDate: contactDate || todayStr(), name: String(name).trim(), phone: phone || '',
      residence: residence || '', channel: channel || '', trainingType: trainingType || '',
      branchId: Number(branchId) || null, goal: goal || '',
      stage: LEAD_STAGES.includes(stage) ? stage : 'new',
      objection: objection || '', note: note || '', traineeId: null, createdBy: req.user.id,
    }));
  }));

  app.put('/api/leads/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const lead = await Store.get('leads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'السجل غير موجود.' });
    if (!branchAllowed(req.user, lead.branchId)) return denyOutOfScope(res);
    const patch = {};
    ['name', 'phone', 'contactDate', 'residence', 'channel', 'trainingType', 'goal', 'objection', 'note'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;
    if (req.body.stage !== undefined) {
      if (!LEAD_STAGES.includes(req.body.stage)) return res.status(400).json({ error: 'مرحلة غير صحيحة.' });
      patch.stage = req.body.stage;
    }
    res.json(await Store.update('leads', lead.id, patch));
  }));

  app.delete('/api/leads/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('leads', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     البرامج التدريبية — عند الإنشاء تُربط تلقائيًا بكل المتدربين
     ============================================================ */
  app.get('/api/programs', auth, h(async (req, res) => {
    const { programs, users } = await Store.load('programs', 'users');
    let list = programs;
    // المدرب يرى برامجه — والمتدرب والإدارة يرون الكل (المدربون بالتناوب)
    if (req.user.role === 'trainer' && !req.query.all) list = list.filter((p) => p.trainerId === req.user.id);
    if (req.query.trainer) list = list.filter((p) => p.trainerId === Number(req.query.trainer));
    res.json(list
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((p) => ({ ...p, trainerName: (users.find((u) => u.id === p.trainerId) || {}).name })));
  }));

  app.post('/api/programs', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
    const { title, focus, description } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'عنوان البرنامج مطلوب.' });
    const trainerId = req.user.role === 'trainer' ? req.user.id : Number(req.body.trainerId) || req.user.id;
    const program = await Store.insert('programs', {
      trainerId, title: String(title).trim(), focus: focus || '', description: description || '', createdAt: todayStr(),
    });
    // الربط التلقائي: يصل البرنامج لكل المتدربين الفعّالين مع إشعار
    const { users, subscriptions } = await Store.load('users', 'subscriptions');
    const activeIds = new Set(subscriptions.filter((s) => subStatus(s) === 'active').map((s) => s.traineeId));
    const linked = users.filter((u) => u.role === 'trainee' && u.active !== false && activeIds.has(u.id));
    for (const t of linked) {
      await notify(t.id, `برنامج تدريبي جديد من ${req.user.name}: «${program.title}» — اطّلع عليه في صفحتك.`, 'program');
    }
    res.json({ program, linkedTrainees: linked.length });
  }));

  app.put('/api/programs/:id', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
    const program = await Store.get('programs', req.params.id);
    if (!program) return res.status(404).json({ error: 'البرنامج غير موجود.' });
    if (req.user.role === 'trainer' && program.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'لا يمكنك تعديل برنامج مدرب آخر.' });
    }
    const patch = {};
    ['title', 'focus', 'description'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    res.json(await Store.update('programs', program.id, patch));
  }));

  app.delete('/api/programs/:id', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
    const program = await Store.get('programs', req.params.id);
    if (!program) return res.status(404).json({ error: 'البرنامج غير موجود.' });
    if (req.user.role === 'trainer' && program.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'لا يمكنك حذف برنامج مدرب آخر.' });
    }
    await Store.remove('programs', program.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     نظام الولاء — نقاطي ومكافآتي (المتدرب)
     ============================================================ */
  app.get('/api/loyalty/me', auth, requireRole('trainee'), h(async (req, res) => {
    await ensureDefaultRewards();
    const referralCode = await ensureReferralCode(req.user);
    const { pointsLog, rewards, redemptions, referrals } = await Store.load('pointsLog', 'rewards', 'redemptions', 'referrals');
    const myLog = pointsLog.filter((p) => p.traineeId === req.user.id).sort((a, b) => b.id - a.id);
    res.json({
      balance: myLog.reduce((s, p) => s + p.points, 0),
      earned: myLog.filter((p) => p.points > 0).reduce((s, p) => s + p.points, 0),
      log: myLog.slice(0, 60),
      rewards: rewards.filter((r) => r.active !== false),
      redemptions: redemptions.filter((r) => r.traineeId === req.user.id).sort((a, b) => b.id - a.id),
      referralCode,
      referrals: referrals.filter((r) => r.referrerId === req.user.id).sort((a, b) => b.id - a.id),
      pts: await loyaltyPts(),
    });
  }));

  /* لوحة الولاء (الإدارة/المحاسب): الأرصدة والطلبات والإحالات والتقارير */
  app.get('/api/loyalty/summary', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    await ensureDefaultRewards();
    const all = await Store.load('pointsLog', 'rewards', 'redemptions', 'referrals', 'users');
    const { rewards, users } = all;
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
    /* لوحة الولاء تخصّ المشتركين — فمحاسب فرعٍ يرى مشتركي فروعه وحدهم */
    const mine = scopedBranchIds(req);
    const inScope = mine
      ? (id) => mine.includes(Number((users.find((u) => u.id === id) || {}).branchId))
      : () => true;
    const pointsLog = all.pointsLog.filter((p) => inScope(p.traineeId));
    const redemptions = all.redemptions.filter((r) => inScope(r.traineeId));
    const referrals = all.referrals.filter((r) => inScope(r.referrerId) || inScope(r.traineeId));
    const balances = {};
    pointsLog.forEach((p) => { balances[p.traineeId] = (balances[p.traineeId] || 0) + p.points; });
    res.json({
      pts: await loyaltyPts(),
      rewards,
      balances: Object.entries(balances)
        .map(([traineeId, balance]) => ({ traineeId: Number(traineeId), name: nameOf(Number(traineeId)), balance }))
        .sort((a, b) => b.balance - a.balance),
      redemptions: redemptions.map((r) => ({ ...r, traineeName: nameOf(r.traineeId) })).sort((a, b) => b.id - a.id),
      referrals: referrals.map((r) => ({ ...r, referrerName: nameOf(r.referrerId) })).sort((a, b) => b.id - a.id),
      totals: {
        pointsIssued: pointsLog.filter((p) => p.points > 0).reduce((s, p) => s + p.points, 0),
        pointsRedeemed: -pointsLog.filter((p) => p.points < 0).reduce((s, p) => s + p.points, 0),
        pendingRedemptions: redemptions.filter((r) => r.status === 'pending').length,
        approvedReferrals: referrals.filter((r) => r.status === 'approved').length,
        pendingReferrals: referrals.filter((r) => r.status === 'pending').length,
      },
    });
  }));

  /* منح/خصم نقاط يدويًا (تحقيق هدف وزن أو قياسات وغيرها) */
  app.post('/api/loyalty/award', auth, requireRole('admin'), h(async (req, res) => {
    const trainee = await Store.get('users', Number(req.body.traineeId));
    if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
    const points = Math.trunc(Number(req.body.points));
    if (!points) return res.status(400).json({ error: 'عدد النقاط مطلوب (موجب للمنح، سالب للتصحيح).' });
    if (!req.body.reason) return res.status(400).json({ error: 'سبب المنح مطلوب (مثال: تحقيق هدف الوزن).' });
    const entry = await awardPoints(trainee.id, points, String(req.body.reason).slice(0, 200));
    res.json({ ...entry, balance: await pointsBalance(trainee.id) });
  }));

  /* ---------- المكافآت ---------- */
  app.get('/api/rewards', auth, h(async (req, res) => {
    await ensureDefaultRewards();
    let list = await Store.all('rewards');
    if (req.user.role === 'trainee') list = list.filter((r) => r.active !== false);
    res.json(list);
  }));

  app.post('/api/rewards', auth, requireRole('admin'), h(async (req, res) => {
    const { name, cost, note } = req.body || {};
    if (!name || !cost || Number(cost) <= 0) return res.status(400).json({ error: 'اسم المكافأة وعدد النقاط مطلوبان.' });
    res.json(await Store.insert('rewards', { name, cost: Number(cost), note: note || '', active: true }));
  }));

  app.put('/api/rewards/:id', auth, requireRole('admin'), h(async (req, res) => {
    const reward = await Store.get('rewards', req.params.id);
    if (!reward) return res.status(404).json({ error: 'المكافأة غير موجودة.' });
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.cost !== undefined) patch.cost = Number(req.body.cost);
    if (req.body.note !== undefined) patch.note = req.body.note;
    if (req.body.active !== undefined) patch.active = !!req.body.active;
    res.json(await Store.update('rewards', reward.id, patch));
  }));

  app.delete('/api/rewards/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('rewards', req.params.id);
    res.json({ ok: true });
  }));

  /* ---------- طلبات استبدال النقاط ---------- */
  app.post('/api/redemptions', auth, requireRole('trainee'), h(async (req, res) => {
    // حدّ لطلبات الاستبدال — كي لا يُغرق متدرب الإدارة بإشعارات وسجلات معلّقة
    if (await rateLimited('redeem:' + req.user.id, 20, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'طلبات كثيرة — انتظر قليلًا ثم حاول مجددًا.' });
    }
    const reward = await Store.get('rewards', Number(req.body.rewardId));
    if (!reward || reward.active === false) return res.status(400).json({ error: 'المكافأة غير متاحة.' });
    const balance = await pointsBalance(req.user.id);
    if (balance < reward.cost) return res.status(400).json({ error: `رصيدك ${balance} نقطة — تحتاج ${reward.cost} نقطة لهذه المكافأة.` });
    const redemption = await Store.insert('redemptions', {
      traineeId: req.user.id, rewardId: reward.id, rewardName: reward.name,
      points: reward.cost, date: todayStr(), status: 'pending',
    });
    const admin = (await Store.all('users')).find((u) => u.role === 'admin');
    if (admin) await notify(admin.id, `طلب استبدال نقاط: ${req.user.name} طلب «${reward.name}» (${reward.cost} نقطة) — بانتظار الاعتماد.`, 'loyalty');
    res.json(redemption);
  }));

  app.put('/api/redemptions/:id', auth, requireRole('admin'), h(async (req, res) => {
    const redemption = await Store.get('redemptions', req.params.id);
    if (!redemption) return res.status(404).json({ error: 'الطلب غير موجود.' });
    if (redemption.status !== 'pending') return res.status(400).json({ error: 'الطلب معالج مسبقًا.' });
    const { action } = req.body || {};
    if (action === 'approve') {
      /* ذرّيًا: قفل المتدرب يُسلسِل اعتمادين متزامنين (أو نقرة مزدوجة) —
         كان كلاهما يقرأ الرصيد نفسه ويخصم، فيهبط الرصيد تحت الصفر ويُمنح
         مكافأتان بنقاط واحدة. نُعيد قراءة الطلب والرصيد داخل القفل. */
      try {
        const updated = await Store.transaction(async (tx) => {
          await tx.getForUpdate('users', redemption.traineeId);
          const fresh = await tx.get('redemptions', redemption.id);
          if (!fresh || fresh.status !== 'pending') throw Object.assign(new Error('الطلب معالج مسبقًا.'), { status: 400 });
          const log = await tx.find('pointsLog', { traineeId: redemption.traineeId });
          const balance = log.reduce((t, e) => t + e.points, 0);
          if (balance < fresh.points) throw Object.assign(new Error(`رصيد المتدرب ${balance} نقطة فقط — لا يكفي.`), { status: 400 });
          await tx.insert('pointsLog', { traineeId: fresh.traineeId, points: -fresh.points, reason: `استبدال مكافأة: ${fresh.rewardName}`, date: todayStr() });
          return tx.update('redemptions', fresh.id, { status: 'approved', decidedAt: todayStr() });
        });
        await notify(redemption.traineeId, `🎉 تم اعتماد مكافأتك «${redemption.rewardName}» — راجع الاستقبال لاستلامها.`, 'loyalty').catch(() => {});
        return res.json(updated);
      } catch (e) { return res.status(e.status || 500).json({ error: e.status ? e.message : 'تعذّر الاعتماد.' }); }
    }
    if (action === 'reject') {
      const updated = await Store.update('redemptions', redemption.id, { status: 'rejected', decidedAt: todayStr() });
      await notify(redemption.traineeId, `تعذّر اعتماد طلب مكافأة «${redemption.rewardName}» — نقاطك محفوظة كما هي.`, 'loyalty');
      return res.json(updated);
    }
    res.status(400).json({ error: 'الإجراء: approve أو reject.' });
  }));

  /* ---------- الإحالات: ادعُ صديقًا ---------- */
  app.get('/api/referrals', auth, h(async (req, res) => {
    const { referrals, users } = await Store.load('referrals', 'users');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
    let list = referrals;
    if (req.user.role === 'trainee') list = list.filter((r) => r.referrerId === req.user.id);
    else if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    res.json(list.map((r) => ({ ...r, referrerName: nameOf(r.referrerId) })).sort((a, b) => b.id - a.id));
  }));

  app.put('/api/referrals/:id', auth, requireRole('admin'), h(async (req, res) => {
    const referral = await Store.get('referrals', req.params.id);
    if (!referral) return res.status(404).json({ error: 'الإحالة غير موجودة.' });
    if (referral.status !== 'pending') return res.status(400).json({ error: 'الإحالة معالجة مسبقًا.' });
    const { action } = req.body || {};
    if (action === 'approve') {
      /* قفل الإحالة يمنع اعتمادين متزامنين من مكافأة المُحيل مرتين */
      try {
        const pts = await loyaltyPts();
        const updated = await Store.transaction(async (tx) => {
          const fresh = await tx.getForUpdate('referrals', referral.id);
          if (!fresh || fresh.status !== 'pending') throw Object.assign(new Error('الإحالة معالجة مسبقًا.'), { status: 400 });
          await tx.insert('pointsLog', { traineeId: fresh.referrerId, points: pts.referral, reason: `إحالة صديق (${fresh.traineeName || 'مشترك جديد'})`, date: todayStr() });
          return tx.update('referrals', fresh.id, { status: 'approved', decidedAt: todayStr() });
        });
        // إشعار المُحيل بنقاطه — أفضل الجهد (كما كان awardPoints يفعل)
        if (pts.referral > 0) {
          await Store.insert('notifications', {
            userId: referral.referrerId,
            text: `🎁 حصلت على ${pts.referral} نقطة — إحالة صديق. اطّلع على «نقاطي ومكافآتي».`,
            date: todayStr(), read: false, type: 'loyalty',
          }).catch(() => {});
        }
        return res.json(updated);
      } catch (e) { return res.status(e.status || 500).json({ error: e.status ? e.message : 'تعذّر الاعتماد.' }); }
    }
    if (action === 'reject') {
      return res.json(await Store.update('referrals', referral.id, { status: 'rejected', decidedAt: todayStr() }));
    }
    res.status(400).json({ error: 'الإجراء: approve أو reject.' });
  }));
};

module.exports.awardPoints = awardPoints;
module.exports.loyaltyPts = loyaltyPts;
module.exports.evaluateLoyalty = evaluateLoyalty;
module.exports.buildGrowthReport = buildGrowthReport;
module.exports.buildHealthScores = buildHealthScores;

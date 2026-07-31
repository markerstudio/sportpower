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

/* نقاط الولاء الفعلية من الإعدادات (مع افتراضيات) */
async function loyaltyPts() {
  const rows = await Store.all('settings');
  const s = rows[0] || {};
  return {
    session: Number(s.ptsSession) || 5,
    renewal: Number(s.ptsRenewal) || 50,
    referral: Number(s.ptsReferral) || 100,
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
async function buildGrowthReport(month, branch, subStatus) {
  const year = month.slice(0, 4);
  // السنة السابقة مشمولة لأن ترحيل الهدف قد يعود حتى 12 شهرًا (ويعبر رأس السنة)
  const prevYear = String(Number(year) - 1);
  const scope = branch ? { branchId: branch } : {};
  /* الأهداف السنوية تُحسب شهرًا بشهر، فنحتاج نافذة السنة — لا التاريخ كله.
     أما LTV (إجمالي ما دفعه العميل طوال بقائه) فيُحسب بتجميع في القاعدة. */
  const [subscriptions, subEvents, users, expenses, targets, branches, payments, lifetimePaid, payerCount] = await Promise.all([
    Store.all('subscriptions'),
    Store.find('subEvents', { date: { gte: prevYear + '-01-01', lte: year + '-12-31' } }),
    Store.all('users'),
    Store.all('expenses'),
    Store.all('targets'),
    Store.all('branches'),
    Store.find('payments', { ...scope, subscriptionId: { isNull: false }, date: { gte: prevYear + '-01-01', lte: year + '-12-31' } }),
    Store.sum('payments', 'amount', { ...scope, subscriptionId: { isNull: false } }),
    Store.countDistinct('payments', 'traineeId', { ...scope, subscriptionId: { isNull: false } }),
  ]);
  // مؤشرات الحصص تُحمَّل فقط إن وُجد هدف يعتمدها
  const needSessions = targets.some((t) => ['sessions', 'uniqueTrainees'].includes(t.metric)
    && (t.period === month || t.period === year || /^\d{4}-H[12]$/.test(t.period)));
  const sessions = needSessions
    ? await Store.find('sessions', { date: { gte: prevYear + '-01-01', lte: year + '-12-31' } })
    : [];

  const data = { subscriptions, subEvents, payments, users, expenses, targets, branches, sessions };
  const inBranch = (x) => !branch || x.branchId === branch;

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
  const today = todayStr();
  const durations = Object.values(spanByTrainee).map(({ min, max }) => {
    const end = max > today ? today : max;
    return Math.max((new Date(end) - new Date(min)) / 86400000, 0) / 30.44;
  });
  const avgDurationMonths = durations.length ? round1(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  // متوسط قيمة العميل LTV — مجموع كل ما دُفع ÷ عدد الدافعين (مُجمَّعان في القاعدة)
  const pays = data.payments;
  const ltv = payerCount ? Math.round(lifetimePaid / payerCount) : null;

  // أسباب الإلغاء
  const churnReasons = {};
  cancels.forEach((c) => {
    const r = c.reason || 'غير محدد';
    churnReasons[r] = (churnReasons[r] || 0) + 1;
  });

  // المالية: التحصيل − المصاريف = صافي الربح
  const monthPays = pays.filter((p) => monthOf(p.date) === month);
  const revenue = monthPays.reduce((s, p) => s + p.amount, 0);
  const monthExpenses = data.expenses.filter((e) => e.month === month && (!branch || e.branchId === branch));
  const expensesTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // الأهداف: الشهرية (مع الترحيل) + السنوية مقسمة على الأشهر
  const scopedTargets = data.targets.filter((t) => (t.scope === 'company' && !branch)
    || (t.scope === 'branch' && (branch ? t.refId === branch : true)));
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
    finance: { revenue, expensesTotal, netProfit: revenue - expensesTotal, expenses: monthExpenses },
    goals: { monthly: monthlyGoals, annual: annualGoals },
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

module.exports = function registerGrowth(app, { auth, requireRole, h, notify, subStatus }) {
  /* ============================================================
     المصاريف الشهرية (المحاسب/الإدارة)
     ============================================================ */
  app.get('/api/expenses', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    let list = await Store.all('expenses');
    if (req.query.month) list = list.filter((e) => e.month === req.query.month);
    if (req.query.branch) list = list.filter((e) => e.branchId === Number(req.query.branch));
    res.json(list);
  }));

  app.post('/api/expenses', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { month, branchId, category, label, amount, note } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM.' });
    if (!label || !amount || Number(amount) <= 0) return res.status(400).json({ error: 'البيان والمبلغ مطلوبان.' });
    res.json(await Store.insert('expenses', {
      month, branchId: Number(branchId) || null, category: category || 'أخرى',
      label, amount: Number(amount), note: note || '', createdBy: req.user.id,
    }));
  }));

  app.put('/api/expenses/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const row = await Store.get('expenses', req.params.id);
    if (!row) return res.status(404).json({ error: 'المصروف غير موجود.' });
    const patch = {};
    ['month', 'category', 'label', 'note'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (req.body.amount !== undefined) patch.amount = Number(req.body.amount);
    if (req.body.branchId !== undefined) patch.branchId = Number(req.body.branchId) || null;
    res.json(await Store.update('expenses', row.id, patch));
  }));

  app.delete('/api/expenses/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    await Store.remove('expenses', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     تقرير النمو الشهري — يظهر ضمن التقارير الشهرية
     ============================================================ */
  app.get('/api/reports/growth', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    const branch = req.query.branch ? Number(req.query.branch) : null;
    res.json(await buildGrowthReport(month, branch, subStatus));
  }));

  /* ============================================================
     ملف متابعة المبيعات (Leads)
     ============================================================ */
  const LEAD_STAGES = ['new', 'contacted', 'trial-booked', 'trial-attended', 'no-show', 'subscribed', 'lost'];

  app.get('/api/leads', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    let list = await Store.all('leads');
    if (req.query.month) list = list.filter((l) => monthOf(l.contactDate) === req.query.month);
    if (req.query.stage) list = list.filter((l) => l.stage === req.query.stage);
    if (req.query.branch) list = list.filter((l) => l.branchId === Number(req.query.branch));
    res.json(list.sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || '')));
  }));

  app.get('/api/leads/summary', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    res.json(leadsSummary(await Store.all('leads'), month));
  }));

  app.post('/api/leads', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { name, phone, contactDate, residence, channel, trainingType, branchId, goal, stage, objection, note } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم العميل المحتمل مطلوب.' });
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
    const { pointsLog, rewards, redemptions, referrals, users } = await Store.load('pointsLog', 'rewards', 'redemptions', 'referrals', 'users');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
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
      const balance = await pointsBalance(redemption.traineeId);
      if (balance < redemption.points) return res.status(400).json({ error: `رصيد المتدرب ${balance} نقطة فقط — لا يكفي.` });
      await awardPoints(redemption.traineeId, -redemption.points, `استبدال مكافأة: ${redemption.rewardName}`);
      const updated = await Store.update('redemptions', redemption.id, { status: 'approved', decidedAt: todayStr() });
      await notify(redemption.traineeId, `🎉 تم اعتماد مكافأتك «${redemption.rewardName}» — راجع الاستقبال لاستلامها.`, 'loyalty');
      return res.json(updated);
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
      const pts = await loyaltyPts();
      await awardPoints(referral.referrerId, pts.referral, `إحالة صديق (${referral.traineeName || 'مشترك جديد'})`);
      return res.json(await Store.update('referrals', referral.id, { status: 'approved', decidedAt: todayStr() }));
    }
    if (action === 'reject') {
      return res.json(await Store.update('referrals', referral.id, { status: 'rejected', decidedAt: todayStr() }));
    }
    res.status(400).json({ error: 'الإجراء: approve أو reject.' });
  }));
};

module.exports.awardPoints = awardPoints;
module.exports.loyaltyPts = loyaltyPts;
module.exports.buildGrowthReport = buildGrowthReport;

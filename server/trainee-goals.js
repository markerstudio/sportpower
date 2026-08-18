/* ============================================================
   سبورت باور — أهداف المشتركين
   «البرنامج التدريبي يتحوّل لأهداف المشتركين، ولما بدي اضيف هدف اقدر
   اربطه ع حساب المشترك مش كل الحسابات — لانو كل شخص الو هدف مختلف.»

   وعليه يُبنى ما طلبه العميل بعد ذلك: عدد الأهداف التي وضعها كل مدرب
   خلال الشهر (في KPI)، ومن بقي من المشتركين بلا هدف (قرارٌ في مركز
   القرارات). فالهدف هنا ليس نصًّا حرًّا بل خطةٌ لها حقول تُقاس.
   ============================================================ */
const Store = require('./store');
const { GOAL_KEYS, GOAL_LABELS, isGoal } = require('./goals');

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthOf = (d) => (d || '').slice(0, 7);
const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const intOrNull = (v) => {
  const n = numOrNull(v);
  return n === null || !Number.isFinite(n) ? null : Math.trunc(n);
};
const STATUSES = ['active', 'done', 'cancelled'];

/* أشهر الخطة → تاريخ الانتهاء، فلا يُدخل المدرب تاريخين متعارضين */
function endFrom(startDate, months) {
  const m = Number(months);
  if (!startDate || !Number.isFinite(m) || m <= 0) return null;
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + Math.round(m));
  return d.toISOString().slice(0, 10);
}

/* الحقول التي يكتبها المدرب — مشتركة بين الإنشاء والتعديل */
function goalPatch(body) {
  const patch = {};
  if (body.kind !== undefined) patch.kind = isGoal(body.kind) ? body.kind : null;
  if (body.style !== undefined) patch.style = clean(body.style, 200);
  if (body.purpose !== undefined) patch.purpose = clean(body.purpose, 400);
  if (body.targetChanges !== undefined) patch.targetChanges = clean(body.targetChanges, 800);
  if (body.notes !== undefined) patch.notes = clean(body.notes, 600);
  if (body.months !== undefined) patch.months = numOrNull(body.months);
  if (body.sessionsPlanned !== undefined) patch.sessionsPlanned = intOrNull(body.sessionsPlanned);
  if (body.allowedAbsences !== undefined) patch.allowedAbsences = intOrNull(body.allowedAbsences);
  if (body.makeupMonths !== undefined) patch.makeupMonths = numOrNull(body.makeupMonths);
  if (body.mealCommitPct !== undefined) {
    const v = intOrNull(body.mealCommitPct);
    patch.mealCommitPct = v === null ? null : Math.max(0, Math.min(100, v));
  }
  if (body.startDate !== undefined) patch.startDate = body.startDate || null;
  if (body.endDate !== undefined) patch.endDate = body.endDate || null;
  return patch;
}

/* تقدّم الهدف من بيانات النظام لا من إدخال يدوي: كم حصة نُفّذت من
   المخطَّط، وكم غياب وقع من المسموح — فيُقرأ الالتزام بنظرة. */
function progressOf(goal, sessions) {
  const from = goal.startDate || '';
  const to = goal.endDate || '9999-12-31';
  const within = sessions.filter((s) => s.traineeId === goal.traineeId && s.date >= from && s.date <= to);
  const done = within.filter((s) => s.kind !== 'absence').length;
  const absences = within.filter((s) => s.kind === 'absence').length;
  return {
    sessionsDone: done,
    absences,
    sessionsPct: goal.sessionsPlanned ? Math.round((done / goal.sessionsPlanned) * 100) : null,
    // تجاوزُ الغيابات المسموحة إشارةٌ مبكّرة على تعثّر الخطة
    overAbsence: goal.allowedAbsences != null && absences > goal.allowedAbsences,
  };
}

module.exports = function registerTraineeGoals(app, {
  auth, requireRole, h, notify, scopedBranchIds, scopeFilter, branchAllowed, denyOutOfScope,
}) {
  const STAFF = ['admin', 'trainer', 'accountant', 'nutritionist'];

  /* ---------- قائمة الأهداف ---------- */
  app.get('/api/trainee-goals', auth, h(async (req, res) => {
    const [all, users, sessions] = await Promise.all([
      Store.all('traineeGoals'), Store.all('users'), Store.all('sessions'),
    ]);
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '—';

    let list = all;
    // المتدرب يرى أهدافه هو — وحسابه لا يُفتح على غيره
    if (req.user.role === 'trainee') list = list.filter((g) => g.traineeId === req.user.id);
    else if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    else list = list.filter(scopeFilter(req));

    if (req.query.trainee) list = list.filter((g) => g.traineeId === Number(req.query.trainee));
    if (req.query.trainer) list = list.filter((g) => g.trainerId === Number(req.query.trainer));
    if (req.query.status) list = list.filter((g) => (g.status || 'active') === req.query.status);
    if (req.query.month) list = list.filter((g) => monthOf(g.createdAt || g.startDate) === req.query.month);

    res.json(list
      .map((g) => ({
        ...g,
        kindLabel: GOAL_LABELS[g.kind] || null,
        traineeName: nameOf(g.traineeId),
        trainerName: nameOf(g.trainerId),
        progress: progressOf(g, sessions),
      }))
      .sort((a, b) => b.id - a.id));
  }));

  /* ---------- من بقي بلا هدف تدريبي ----------
     «ببين عندي مين من المشتركين ما انعملو هدف تدريبي» — المشترك الفعّال
     الذي لا هدف قائمًا له. ومعه عدّاد أهداف كل مدرب هذا الشهر. */
  app.get('/api/trainee-goals/coverage', auth, requireRole('admin', 'accountant', 'trainer'), h(async (req, res) => {
    const month = req.query.month || todayStr().slice(0, 7);
    const [goalsAll, users, subscriptions, branches, sessions] = await Promise.all([
      Store.all('traineeGoals'), Store.all('users'), Store.all('subscriptions'),
      Store.all('branches'), Store.find('sessions', { date: { gte: month + '-01', lte: month + '-31' } }),
    ]);
    const mine = scopedBranchIds(req);
    const inScope = (id) => !mine || mine.includes(Number(id));
    const branchName = (id) => (branches.find((b) => b.id === id) || {}).name || '—';

    const activeTraineeIds = new Set(subscriptions
      .filter((s) => s.status === 'active' && s.endDate >= todayStr() && s.totalSessions > s.usedSessions)
      .map((s) => s.traineeId));
    const withGoal = new Set(goalsAll.filter((g) => (g.status || 'active') === 'active').map((g) => g.traineeId));

    const trainees = users.filter((u) => u.role === 'trainee' && u.active !== false
      && inScope(u.branchId) && activeTraineeIds.has(u.id));

    /* آخر مدرب درّبه — هو المرشَّح لوضع هدفه، فتصل المهمة لصاحبها */
    const lastTrainerOf = {};
    sessions.forEach((s) => {
      const prev = lastTrainerOf[s.traineeId];
      if (!prev || s.date > prev.date) lastTrainerOf[s.traineeId] = { date: s.date, trainerId: s.trainerId };
    });

    const missing = trainees.filter((t) => !withGoal.has(t.id)).map((t) => ({
      traineeId: t.id, name: t.name, phone: t.phone || '',
      branchId: t.branchId, branchName: branchName(t.branchId),
      goal: t.goal || null, goalLabel: GOAL_LABELS[t.goal] || null,
      joinedAt: t.joinedAt || '',
      lastTrainerId: (lastTrainerOf[t.id] || {}).trainerId || null,
      lastTrainerName: (users.find((u) => u.id === (lastTrainerOf[t.id] || {}).trainerId) || {}).name || null,
    })).sort((a, b) => a.branchName.localeCompare(b.branchName, 'ar') || a.name.localeCompare(b.name, 'ar'));

    // عدد الأهداف التي وضعها كل مدرب هذا الشهر — رقمٌ في KPI المدرب
    const monthGoals = goalsAll.filter((g) => monthOf(g.createdAt || g.startDate) === month);
    const byTrainer = users
      .filter((u) => u.role === 'trainer' && u.active !== false && inScope(u.branchId))
      .map((u) => ({
        trainerId: u.id, name: u.name,
        goalsThisMonth: monthGoals.filter((g) => g.trainerId === u.id).length,
      }))
      .sort((a, b) => b.goalsThisMonth - a.goalsThisMonth);

    res.json({
      month,
      totals: {
        activeTrainees: trainees.length,
        withGoal: trainees.length - missing.length,
        missing: missing.length,
        coveragePct: trainees.length
          ? Math.round(((trainees.length - missing.length) / trainees.length) * 100) : null,
        goalsThisMonth: monthGoals.length,
      },
      missing, byTrainer,
    });
  }));

  /* ---------- إنشاء هدف لمشترك بعينه ---------- */
  app.post('/api/trainee-goals', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
    const trainee = await Store.get('users', Number(req.body.traineeId));
    if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
    if (!branchAllowed(req.user, trainee.branchId)) return denyOutOfScope(res);

    const patch = goalPatch(req.body);
    if (!patch.style) return res.status(400).json({ error: 'الأسلوب التدريبي مطلوب.' });
    if (!patch.kind) return res.status(400).json({ error: 'اختر نوع الهدف.' });

    const startDate = patch.startDate || todayStr();
    const endDate = patch.endDate || endFrom(startDate, patch.months) || null;
    if (endDate && endDate < startDate) return res.status(400).json({ error: 'تاريخ الانتهاء قبل تاريخ البدء.' });

    /* هدفٌ فعّال قائم لنفس المشترك: لا يُفتح ثانٍ بجانبه — يُغلق الأول
       أو يُعدَّل. وإلا صار «من بلا هدف» و«عدد الأهداف» رقمين لا يُعتمد عليهما. */
    const open = (await Store.find('traineeGoals', { traineeId: trainee.id }))
      .filter((g) => (g.status || 'active') === 'active');
    if (open.length) {
      return res.status(409).json({
        error: `لـ${trainee.name} هدفٌ تدريبي فعّال بالفعل (${open[0].style}) — عدّله أو أغلقه قبل فتح هدف جديد.`,
        goalId: open[0].id,
      });
    }

    const trainerId = req.user.role === 'trainer' ? req.user.id : (Number(req.body.trainerId) || null);
    const goal = await Store.insert('traineeGoals', {
      traineeId: trainee.id, trainerId, branchId: trainee.branchId,
      ...patch, startDate, endDate, status: 'active', outcome: null,
      createdBy: req.user.id, createdAt: new Date().toISOString(),
    });

    /* الهدف التدريبي يُصبح هدف المشترك المعلن — فتتبعه قراءةُ التقدّم
       ومكتبةُ التغذية بدل أن يبقى الحسابُ على هدفٍ قديم. */
    if (patch.kind && trainee.goal !== patch.kind) {
      await Store.update('users', trainee.id, { goal: patch.kind });
    }
    await notify(trainee.id,
      `وُضع لك هدف تدريبي جديد: ${patch.style}${patch.months ? ` خلال ${patch.months} أشهر` : ''} — اطّلع عليه في صفحتك 💪`, 'program');
    res.json(goal);
  }));

  /* ---------- تعديل / إغلاق هدف ---------- */
  app.put('/api/trainee-goals/:id', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
    const goal = await Store.get('traineeGoals', req.params.id);
    if (!goal) return res.status(404).json({ error: 'الهدف غير موجود.' });
    if (!branchAllowed(req.user, goal.branchId)) return denyOutOfScope(res);
    // المدرب يعدّل ما وضعه هو — والإدارة أي هدف
    if (req.user.role === 'trainer' && goal.trainerId && goal.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'هذا هدفٌ وضعه مدرب آخر — تعديله له أو للإدارة.' });
    }

    const patch = goalPatch(req.body);
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'الحالة: active أو done أو cancelled.' });
      patch.status = req.body.status;
    }
    if (req.body.outcome !== undefined) patch.outcome = clean(req.body.outcome, 600);

    const merged = { ...goal, ...patch };
    if (merged.startDate && merged.endDate && merged.endDate < merged.startDate) {
      return res.status(400).json({ error: 'تاريخ الانتهاء قبل تاريخ البدء.' });
    }
    if (patch.kind && patch.kind !== goal.kind) {
      await Store.update('users', goal.traineeId, { goal: patch.kind });
    }
    res.json(await Store.update('traineeGoals', goal.id, patch));
  }));

  app.delete('/api/trainee-goals/:id', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
    const goal = await Store.get('traineeGoals', req.params.id);
    if (!goal) return res.status(404).json({ error: 'الهدف غير موجود.' });
    if (!branchAllowed(req.user, goal.branchId)) return denyOutOfScope(res);
    if (req.user.role === 'trainer' && goal.trainerId && goal.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'هذا هدفٌ وضعه مدرب آخر.' });
    }
    await Store.remove('traineeGoals', goal.id);
    res.json({ ok: true });
  }));

  /* أنواع الأهداف — تغذّي منتقيات الواجهة من مصدر واحد */
  app.get('/api/goal-kinds', auth, h(async (req, res) => {
    res.json(GOAL_KEYS.map((k) => ({ key: k, label: GOAL_LABELS[k] })));
  }));
};

module.exports.progressOf = progressOf;

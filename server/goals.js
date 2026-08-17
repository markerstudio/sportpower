/* ============================================================
   سبورت باور — الأهداف التدريبية للمشتركين
   البرنامج التدريبي كان واحدًا يُربط بكل المتدربين، وهذا لا يصف عملًا
   حقيقيًا: لكل مشترك هدف يخصّه. فصار الهدف يُكتب لشخص بعينه ويحمل:
   الأسلوب التدريبي · الهدف من الأسلوب · حصص الشهر · الغيابات المسموحة
   ومهلة تعويضها · نسبة الالتزام بخطة الأكل · التغيّرات المستهدفة ومدتها.

   وعليه تُبنى ثلاثة أرقام تُدار بها المتابعة:
     • كم هدفًا كتب كل مدرب هذا الشهر (يدخل تقريره وKPI)
     • من من المشتركين الفعّالين بلا هدف (فجوة تُغلَق)
     • إجراء في مركز القرارات لكل مشترك مضى عليه شهر بلا هدف
   ============================================================ */
const Store = require('./store');

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);
const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);
const intOrNull = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(Math.round(n), min), max);
};

/* الأهداف رصد تدريبي لا مالي — يراه الطاقم، ويرى المشترك هدفه هو */
const STAFF = ['admin', 'accountant', 'trainer', 'nutritionist'];

function goalPatch(body) {
  return {
    title: clean(body.title, 120) || null,
    style: clean(body.style, 120) || null,
    purpose: clean(body.purpose, 300) || null,
    sessionsPerMonth: intOrNull(body.sessionsPerMonth, 0, 60),
    allowedAbsences: intOrNull(body.allowedAbsences, 0, 30),
    makeupMonths: intOrNull(body.makeupMonths, 0, 12),
    mealCommitPct: intOrNull(body.mealCommitPct, 0, 100),
    durationMonths: intOrNull(body.durationMonths, 0, 24),
    targetChanges: clean(body.targetChanges, 600) || null,
    notes: clean(body.notes, 600) || null,
  };
}

/* حصيلة الأهداف لشهر: كم كتب كل مدرب، ومن بقي بلا هدف.
   «بلا هدف» تُقاس على المشتركين الفعّالين وحدهم — من لا اشتراك له لا
   يُنتظر منه هدف ولا يُحاسَب عليه المدرب. */
async function goalsSummary(month, branch, subStatus) {
  const [goals, users, subscriptions, branches] = await Promise.all([
    Store.all('traineeGoals'),
    Store.all('users'),
    Store.all('subscriptions'),
    Store.all('branches'),
  ]);
  const inBranch = (x) => !branch || x.branchId === Number(branch);
  const monthGoals = goals.filter((g) => g.month === month && inBranch(g));

  const trainers = users.filter((u) => u.role === 'trainer' && u.active !== false && inBranch(u));
  const byTrainer = trainers.map((t) => ({
    trainerId: t.id, name: t.name,
    branch: (branches.find((b) => b.id === t.branchId) || {}).name || '—',
    goals: monthGoals.filter((g) => g.trainerId === t.id).length,
    trainees: new Set(monthGoals.filter((g) => g.trainerId === t.id).map((g) => g.traineeId)).size,
  })).sort((a, b) => b.goals - a.goals);

  const activeTraineeIds = [...new Set(subscriptions
    .filter((s) => subStatus(s) === 'active' && inBranch(s))
    .map((s) => s.traineeId))];
  const withGoal = new Set(monthGoals.map((g) => g.traineeId));
  const missing = activeTraineeIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u) => u && u.active !== false)
    .filter((u) => !withGoal.has(u.id))
    .map((u) => {
      // آخر هدف كُتب له أصلًا — يفرّق بين «لم يُكتب له قط» و«تأخّر هذا الشهر»
      const last = goals.filter((g) => g.traineeId === u.id).sort((a, b) => a.date.localeCompare(b.date)).pop();
      return {
        traineeId: u.id, name: u.name, phone: u.phone || '',
        branchId: u.branchId || null,
        branch: (branches.find((b) => b.id === u.branchId) || {}).name || '—',
        lastGoalDate: last ? last.date : null,
      };
    })
    .sort((a, b) => (a.lastGoalDate || '').localeCompare(b.lastGoalDate || '') || a.name.localeCompare(b.name, 'ar'));

  return {
    month,
    totals: {
      goals: monthGoals.length,
      traineesWithGoal: withGoal.size,
      activeTrainees: activeTraineeIds.length,
      missing: missing.length,
      coveragePct: activeTraineeIds.length
        ? Math.round((activeTraineeIds.filter((id) => withGoal.has(id)).length / activeTraineeIds.length) * 100)
        : null,
    },
    byTrainer,
    missing,
  };
}

module.exports = function registerGoals(app, { auth, requireRole, h, notify, subStatus }) {
  /* أهداف مشترك بعينه، أو أهداف الشهر كلها للإدارة والمدرب */
  app.get('/api/trainee-goals', auth, h(async (req, res) => {
    const where = {};
    if (req.user.role === 'trainee') where.traineeId = req.user.id;
    else if (req.query.trainee) where.traineeId = Number(req.query.trainee);
    if (req.query.month) where.month = req.query.month;
    if (req.query.trainer) where.trainerId = Number(req.query.trainer);
    if (req.query.branch) where.branchId = Number(req.query.branch);

    const goals = await Store.find('traineeGoals', where);
    const users = await Store.all('users');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || null;
    res.json(goals
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((g) => ({ ...g, traineeName: nameOf(g.traineeId), trainerName: nameOf(g.trainerId) })));
  }));

  /* حصيلة الشهر: إنتاج كل مدرب ومن بقي بلا هدف */
  app.get('/api/trainee-goals/summary', auth, requireRole(...STAFF), h(async (req, res) => {
    res.json(await goalsSummary(req.query.month || thisMonthStr(), req.query.branch || null, subStatus));
  }));

  /* كتابة هدف لمشترك — المدرب والإدارة وأخصائية التغذية */
  app.post('/api/trainee-goals', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
    const trainee = await Store.get('users', Number(req.body.traineeId));
    if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
    const patch = goalPatch(req.body);
    if (!patch.style && !patch.title) return res.status(400).json({ error: 'اكتب الأسلوب التدريبي أو عنوان الهدف على الأقل.' });
    const date = req.body.date || todayStr();
    const trainerId = req.user.role === 'trainer' ? req.user.id : (Number(req.body.trainerId) || null);

    const goal = await Store.insert('traineeGoals', {
      ...patch,
      traineeId: trainee.id, trainerId, branchId: trainee.branchId || null,
      date, month: date.slice(0, 7), status: 'active', createdBy: req.user.id,
    });
    await notify(trainee.id,
      `وُضع لك هدف تدريبي جديد${patch.style ? ` — الأسلوب: ${patch.style}` : ''}. اطّلع عليه في صفحتك 💪`, 'goal');
    res.json(goal);
  }));

  app.put('/api/trainee-goals/:id', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
    const goal = await Store.get('traineeGoals', req.params.id);
    if (!goal) return res.status(404).json({ error: 'الهدف غير موجود.' });
    if (req.user.role === 'trainer' && goal.trainerId && goal.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'لا تعدّل هدفًا كتبه مدرب آخر.' });
    }
    const patch = goalPatch({ ...goal, ...req.body });
    if (req.body.status !== undefined) patch.status = ['active', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : goal.status;
    if (req.body.date) { patch.date = req.body.date; patch.month = String(req.body.date).slice(0, 7); }
    res.json(await Store.update('traineeGoals', goal.id, patch));
  }));

  app.delete('/api/trainee-goals/:id', auth, requireRole('admin', 'trainer', 'nutritionist'), h(async (req, res) => {
    const goal = await Store.get('traineeGoals', req.params.id);
    if (!goal) return res.status(404).json({ error: 'الهدف غير موجود.' });
    if (req.user.role === 'trainer' && goal.trainerId && goal.trainerId !== req.user.id) {
      return res.status(403).json({ error: 'لا تحذف هدفًا كتبه مدرب آخر.' });
    }
    await Store.remove('traineeGoals', goal.id);
    res.json({ ok: true });
  }));
};

module.exports.goalsSummary = goalsSummary;

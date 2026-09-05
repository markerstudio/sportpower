/* ============================================================
   سبورت باور — وحدة التشغيل والمتابعة
   المتابعة اليومية للمدرب، المهام، الأهداف وKPI،
   لوحة المتابعة اليومية، سجل المجمدين (استيراد Excel + واتساب)
   ============================================================ */
const Store = require('./store');

const monthOf = (d) => (d || '').slice(0, 7);
const { todayStr, nowLocalMinute } = require('./clock');
const thisMonthStr = () => todayStr().slice(0, 7);

/* هل يقع التاريخ ضمن الفترة؟ فترات: YYYY-MM | YYYY-H1 | YYYY-H2 | YYYY */
function inPeriod(period, dateStr) {
  if (!dateStr) return false;
  if (/^\d{4}-\d{2}$/.test(period)) return monthOf(dateStr) === period;
  if (/^\d{4}-H1$/.test(period)) return dateStr.slice(0, 4) === period.slice(0, 4) && Number(dateStr.slice(5, 7)) <= 6;
  if (/^\d{4}-H2$/.test(period)) return dateStr.slice(0, 4) === period.slice(0, 4) && Number(dateStr.slice(5, 7)) >= 7;
  if (/^\d{4}$/.test(period)) return dateStr.slice(0, 4) === period;
  return false;
}

/* حدود الفترة كتاريخين — لقياس ما كان قائمًا خلالها لا ما جرى فيها.
   الاشتراك مدةٌ ممتدة لا حدثٌ في يوم، فلا يكفي inPeriod لقياسه. */
function periodRange(period) {
  if (/^\d{4}-\d{2}$/.test(period)) return { from: period + '-01', to: period + '-31' };
  if (/^\d{4}-H1$/.test(period)) return { from: period.slice(0, 4) + '-01-01', to: period.slice(0, 4) + '-06-31' };
  if (/^\d{4}-H2$/.test(period)) return { from: period.slice(0, 4) + '-07-01', to: period.slice(0, 4) + '-12-31' };
  if (/^\d{4}$/.test(period)) return { from: period + '-01-01', to: period + '-12-31' };
  return null;
}

/* هل الشهر مشمول بالفترة؟ (لاحتساب KPI الشهري من أهداف نصف سنوية/سنوية) */
function monthInPeriod(period, month) {
  return inPeriod(period, month + '-15');
}

/* حصة نُفّذت فعلًا — الغياب مخصوم من رصيد المتدرب لكنه ليس تدريبًا مُنجَزًا */
const delivered = (s) => s.kind !== 'absence';

/* الساعة المميزة = مدرب + يوم + ساعة البدء: أربعة متدربين في الساعة
   نفسها ساعةٌ واحدة على المدرب، لا أربع. */
const hoursOf = (sessions) => new Set(sessions.filter(delivered).map((s) => `${s.trainerId}|${s.date}|${s.time.slice(0, 2)}`)).size;

const prevMonthStr = (m) => {
  const [y, mm] = m.split('-').map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
};

/* ترحيل الهدف: إن لم يتحقق هدف شهر منقضٍ يُضاف المتبقي تلقائيًا لهدف الشهر التالي
   (يُتتبع تسلسليًا عبر الأشهر السابقة لنفس النطاق والمؤشر). */
function effectiveTarget(t, allTargets, data, subStatus, depth = 0) {
  if (!/^\d{4}-\d{2}$/.test(t.period) || depth >= 12) return t.value;
  const prevPeriod = prevMonthStr(t.period);
  if (prevPeriod >= thisMonthStr()) return t.value; // لا يُرحَّل إلا شهر منقضٍ
  const prev = allTargets.find((x) => x.scope === t.scope && x.refId === t.refId
    && x.metric === t.metric && x.period === prevPeriod);
  if (!prev) return t.value;
  const prevEffective = effectiveTarget(prev, allTargets, data, subStatus, depth + 1);
  const prevActual = computeActual(prev, { ...data, subStatus }) || 0;
  return t.value + Math.max(0, prevEffective - prevActual);
}

const diffHours = (from, to) => {
  if (!from || !to) return null;
  const [h1, m1] = from.split(':').map(Number);
  const [h2, m2] = to.split(':').map(Number);
  const d = (h2 * 60 + m2) - (h1 * 60 + m1);
  return d > 0 ? Math.round((d / 60) * 10) / 10 : null;
};

/* موعد فائت: عُلّم غيابًا صراحة، أو مجدول وفات وقته دون تنفيذ */
function isMissed(a, nowIso) {
  if (a.status === 'missed') return true;
  return a.status === 'scheduled' && (a.date + 'T' + a.time) < nowIso;
}

/* ============================================================
   المؤشرات القابلة لأن تكون أهدافًا (Targets)
   لم تعد أعمدةَ جدول المدربين وحدها: الهدف يُضبط لأي شخص «بنحسبه» —
   المدرب والمحاسب والمبيعات — لا للشركة والفرع والمدرب فقط.

   لكل مؤشر:
     label — اسمه العربي كما يظهر في الشاشة
     scopes — النطاقات التي يصحّ قياسه فيها
     by — كيف يُنسب في نطاق «شخص»:
          'person' = عملُه هو (حصصه، أرقامه، ما سجّله بيده)
          'branch' = أرقام فروعه (المحاسبة تُقاس بفرعها لا بيدها)
     pct — المؤشر نسبةٌ مئوية لا عدّ (نسبة الإغلاق مثلًا)
     money — قيمة مالية تُعرض بالعملة
   ============================================================ */
const ALL_SCOPES = ['company', 'branch', 'trainer', 'user'];
const TRAINER_SCOPES = ['company', 'branch', 'trainer', 'user'];
const BRANCH_SCOPES = ['company', 'branch', 'user'];

/* المجموعات: القائمة بلغت ثلاثة وعشرين مؤشرًا، وقائمةٌ مسطّحة بهذا
   الطول تُقرأ كأنها مكرَّرة — فتُعرض مقسَّمة بعناوينها. */
const METRIC_GROUPS = [
  ['money', 'مال وتحصيل'],
  ['training', 'تدريب'],
  ['subs', 'اشتراكات'],
  ['freeze', 'تجميد'],
  ['outcomes', 'نتائج ومتابعة'],
  ['sales', 'مبيعات'],
  ['custom', 'أهداف حرّة'],
];

const METRICS = {
  /* --- مال وتشغيل --- */
  revenue: { label: 'التحصيل', group: 'money', scopes: BRANCH_SCOPES, by: 'branch', money: true },
  sessions: { label: 'عدد الحصص', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },
  uniqueTrainees: { label: 'متدربون فريدون', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },
  hours: { label: 'ساعات التدريب', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },
  officeHours: { label: 'ساعات مكتبية', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },
  stories: { label: 'ستوريات منشورة', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },
  reels: { label: 'ريلز/فيديوهات', group: 'training', scopes: TRAINER_SCOPES, by: 'person' },

  /* --- الاشتراكات: التجديد غير الاشتراك الجديد (بطلب العميل صراحةً:
         «في فرق ما بين التجديد وما بين الاشتراكات الجديدة») --- */
  newOnly: { label: 'اشتراكات جديدة فقط', group: 'subs', scopes: BRANCH_SCOPES, by: 'branch' },
  renewals: { label: 'تجديد اشتراكات', group: 'subs', scopes: BRANCH_SCOPES, by: 'branch' },
  /* مجموعُ الاثنين أعلاه حسابيًّا. لم يعد يُعرض في قائمة الاختيار —
     قراءتُه بجانبهما توحي بتكرارٍ لا بمعنى — لكنه يبقى محسوبًا لأي هدف
     ضُبط عليه قبل الفصل، فلا ينقلب معناه على أحد. */
  newSubs: { label: 'اشتراكات جديدة + تجديد', group: 'subs', scopes: BRANCH_SCOPES, by: 'branch', deprecated: true },
  /* «كان مشتركًا فعّالًا خلال الفترة» لا «فعّالٌ الآن»: بقية المؤشرات
     كلها تقيس ما جرى في الفترة المختارة، وهذا وحده كان لقطةً للحظة
     القراءة — فهدفُ شهرٍ ماضٍ يُقرأ برقم اليوم. والاسم يقول ذلك صراحةً
     كي لا يُخلط برقم «الفعّالون الآن» في لوحة KPI. */
  activeTrainees: { label: 'مشتركون فعّالون خلال الفترة', group: 'subs', scopes: BRANCH_SCOPES, by: 'branch' },
  newTrainees: { label: 'مشتركون جدد (أشخاص)', group: 'subs', scopes: BRANCH_SCOPES, by: 'branch' },

  /* --- التجميد: سقفه يُضبط لكل فرع، وهدفه يُقاس هنا --- */
  freezes: { label: 'عدد التجميد', group: 'freeze', scopes: BRANCH_SCOPES, by: 'branch' },
  unfreezes: { label: 'عائد من التجميد', group: 'freeze', scopes: BRANCH_SCOPES, by: 'branch' },

  /* --- النتائج والمشاكل --- */
  results: { label: 'نتائج مشتركين', group: 'outcomes', scopes: TRAINER_SCOPES, by: 'person' },
  problems: { label: 'مشاكل مشتركين', group: 'outcomes', scopes: TRAINER_SCOPES, by: 'person' },
  referred: { label: 'زبائن عن طريقه', group: 'outcomes', scopes: TRAINER_SCOPES, by: 'person' },

  /* --- عمل المدرب مع مشتركيه --- */
  traineeGoals: { label: 'أهداف تدريبية وُضعت', group: 'outcomes', scopes: TRAINER_SCOPES, by: 'person' },
  mealPlans: { label: 'برامج أكل', group: 'outcomes', scopes: TRAINER_SCOPES, by: 'person' },

  /* --- المبيعات --- */
  leads: { label: 'أرقام جديدة (مبيعات)', group: 'sales', scopes: BRANCH_SCOPES, by: 'person' },
  tests: { label: 'حصص تجريبية (test)', group: 'sales', scopes: BRANCH_SCOPES, by: 'person' },
  closedLeads: { label: 'عملاء أُغلقوا (اشتركوا)', group: 'sales', scopes: BRANCH_SCOPES, by: 'person' },
  closingRate: { label: 'نسبة الإغلاق %', group: 'sales', scopes: BRANCH_SCOPES, by: 'person', pct: true },

  /* --- هدف حرّ: «الإدارة تضيف أهداف زي ما بدها» ---
     ما لا يقيسه النظام بنفسه (حملة، تدريب داخلي، تجهيز صالة…) يُكتب
     باسمه ويُحدَّث محقَّقُه يدويًا — على أي نطاق وأي فترة. */
  custom: { label: 'هدف حرّ — يُحدَّث يدويًا', group: 'custom', scopes: ALL_SCOPES, by: 'person', manual: true },
};

const METRIC_KEYS = Object.keys(METRICS);
const METRIC_LABELS = Object.fromEntries(METRIC_KEYS.map((k) => [k, METRICS[k].label]));
const metricAllowsScope = (metric, scope) => !!METRICS[metric] && METRICS[metric].scopes.includes(scope);

/* نطاق فروع صاحب الهدف حين يكون النطاق «شخصًا»: المحاسبة تُقاس بفروعها
   (branchIds إن وُجدت وإلا branchId)، والمدرب بفرعه. الفارغ = بلا تقييد. */
function personBranches(u) {
  if (!u) return null;
  if (Array.isArray(u.branchIds) && u.branchIds.length) return u.branchIds.map(Number);
  return u.branchId != null ? [Number(u.branchId)] : null;
}

/* القيمة الفعلية لهدفٍ ما. المجموعات غير المحمَّلة عند بعض المستدعين
   تسقط إلى [] فيصفر مؤشرها بدل أن ينهار الحساب كله.

   النطاقات: company (بلا تقييد) · branch (فرع بعينه) · trainer (مدرب)
   · user (أي موظف — محاسب أو مبيعات أو مدرب). في نطاق «user» يقرأ كل
   مؤشر انتماءه من جدول METRICS: ما كان by='person' يُنسب لعمل الشخص
   نفسه (حصصه، أرقامه، ما سجّله بيده)، وما كان by='branch' يُقاس على
   فروع ذلك الشخص — فالمحاسبة تُحاسَب بفرعها لا بما كتبته بيدها. */
function computeActual(t, { payments, sessions, subscriptions, subEvents, subStatus,
  trainerLogs = [], traineeFlags = [], users = [], traineeGoals = [], mealPlans = [], leads = [] }) {
  const meta = METRICS[t.metric];
  if (!meta) return null;

  /* من هو صاحب الهدف حين يكون النطاق شخصًا، وما فروعه */
  const person = t.scope === 'user' ? users.find((u) => u.id === t.refId) : null;
  const personScope = t.scope === 'user' ? personBranches(person) : null;
  // في نطاق «user» يقرر جدول المؤشرات: عملُ الشخص نفسه أم أرقام فروعه؟
  const userByPerson = t.scope === 'user' && meta.by === 'person';
  const userByBranch = t.scope === 'user' && meta.by === 'branch';

  const scopeBranch = (branchId) => {
    if (t.scope === 'branch') return Number(branchId) === Number(t.refId);
    if (userByBranch) return !personScope || personScope.includes(Number(branchId));
    return true;
  };
  /* تقييد بالشخص: نطاق «مدرب»، أو نطاق «user» لمؤشرٍ يُنسب لعمل صاحبه */
  const scopePerson = (id) => {
    if (t.scope === 'trainer' || userByPerson) return Number(id) === Number(t.refId);
    return true;
  };
  const scopeTrainer = scopePerson;
  const byPerson = t.scope === 'trainer' || userByPerson;

  // سجل اليوم والإحالة بلا فرع على الصف — فرع المدرب من حسابه
  const branchByTrainer = () => {
    const m = {};
    users.forEach((u) => { if (u.role === 'trainer') m[u.id] = u.branchId; });
    return m;
  };
  const events = (types) => subEvents.filter((e) => types.includes(e.type)
    && inPeriod(t.period, e.date) && scopeBranch(e.branchId));
  /* أرقام المبيعات: العميل المحتمل يُنسب لمن سجّله (createdBy) في نطاق
     الشخص، وبفرعه في نطاق الفرع. */
  const myLeads = () => leads.filter((l) => inPeriod(t.period, l.contactDate)
    && scopeBranch(l.branchId) && scopePerson(l.createdBy));

  switch (t.metric) {
    // الهدف الحرّ: محقَّقُه ما كتبته الإدارة عليه — لا حساب له من البيانات
    case 'custom': return Number(t.actual) || 0;
    case 'revenue': {
      // الفرع محفوظ على الدفعة نفسها؛ الرجوع للاشتراك للبيانات القديمة فقط.
      // (المطابقة بالبحث لكل دفعة كانت تكلّف عدد الدفعات × عدد الاشتراكات.)
      const subBranch = (p) => (p.branchId !== undefined && p.branchId !== null
        ? p.branchId
        : (subscriptions.find((s) => s.id === p.subscriptionId) || {}).branchId);
      return payments.filter((p) => inPeriod(t.period, p.date) && scopeBranch(subBranch(p)))
        .reduce((sum, p) => sum + p.amount, 0);
    }
    case 'sessions':
      return sessions.filter(delivered).filter((s) => inPeriod(t.period, s.date) && scopeBranch(s.branchId) && scopeTrainer(s.trainerId)).length;
    case 'uniqueTrainees':
      return new Set(sessions.filter(delivered).filter((s) => inPeriod(t.period, s.date) && scopeBranch(s.branchId) && scopeTrainer(s.trainerId))
        .map((s) => s.traineeId)).size;

    /* الاشتراك الجديد والتجديد مؤشران منفصلان — ويبقى المجموع متاحًا
       لمن ضبط هدفه عليه قبل الفصل. */
    case 'newSubs': return events(['new', 'renewal']).length;
    case 'newOnly': return events(['new']).length;
    case 'renewals': return events(['renewal']).length;
    case 'freezes': return events(['freeze']).length;
    case 'unfreezes': return events(['unfreeze']).length;

    /* من كان مشتركًا فعّالًا خلال الفترة: اشتراكٌ غير ملغى تتقاطع مدتُه
       معها. كان الحساب لقطةً للحظة القراءة (فعّالٌ الآن) بلا نظرٍ إلى
       الفترة أصلًا — فهدفُ شهرٍ ماضٍ يُقرأ برقم اليوم، وهو المؤشر
       الوحيد الذي كان يشذّ عن بقية المؤشرات في هذا. */
    case 'activeTrainees': {
      const range = periodRange(t.period);
      const live = subscriptions.filter((s) => s.status !== 'cancelled' && scopeBranch(s.branchId));
      if (!range) return new Set(live.filter((s) => subStatus(s) === 'active').map((s) => s.traineeId)).size;
      return new Set(live
        .filter((s) => (s.startDate || '') <= range.to && (s.endDate || '') >= range.from)
        .map((s) => s.traineeId)).size;
    }
    case 'newTrainees':
      return users.filter((u) => u.role === 'trainee' && inPeriod(t.period, u.joinedAt || '')
        && scopeBranch(u.branchId)).length;
    case 'hours':
      // الساعة المميزة لكل مدرب — كما يحسبها التقرير الشهري تمامًا
      return hoursOf(sessions.filter((s) => inPeriod(t.period, s.date) && scopeBranch(s.branchId) && scopeTrainer(s.trainerId)));
    case 'officeHours':
    case 'stories':
    case 'reels': {
      const branchOf = branchByTrainer();
      const logs = trainerLogs.filter((l) => inPeriod(t.period, l.date)
        && scopeTrainer(l.trainerId) && scopeBranch(branchOf[l.trainerId]));
      if (t.metric === 'officeHours') return Math.round(logs.reduce((s, l) => s + (Number(l.workHours) || 0), 0) * 10) / 10;
      return logs.reduce((s, l) => s + (Number(l[t.metric]) || 0), 0);
    }
    case 'results':
    case 'problems': {
      /* نتيجة المشترك (أو مشكلته) تُنسب للمدرب الذي درّبه في الفترة —
         كما في التقرير الشهري تمامًا. */
      const kind = t.metric === 'results' ? 'result' : 'problem';
      const inP = traineeFlags.filter((f) => f.kind === kind && inPeriod(t.period, f.date));
      if (byPerson) {
        const mine = new Set(sessions.filter(delivered)
          .filter((s) => inPeriod(t.period, s.date) && s.trainerId === t.refId).map((s) => s.traineeId));
        return inP.filter((f) => mine.has(f.traineeId)).length;
      }
      return inP.filter((f) => scopeBranch(f.branchId)).length;
    }
    case 'referred': {
      // الزبون المُحال: sourceTrainerId أو (sourceType=trainer + sourceRefId) — كلا الترميزين
      const branchOf = branchByTrainer();
      const referrerOf = (u) => u.sourceTrainerId || (u.sourceType === 'trainer' ? u.sourceRefId : null);
      return users.filter((u) => {
        if (u.role !== 'trainee') return false;
        const ref = referrerOf(u);
        return ref && inPeriod(t.period, u.joinedAt || '')
          && scopeTrainer(ref) && scopeBranch(branchOf[ref]);
      }).length;
    }
    /* الهدف التدريبي يُنسب لواضعه (trainerId) وللفرع المسجَّل عليه */
    case 'traineeGoals':
      return traineeGoals.filter((g) => inPeriod(t.period, g.createdAt || g.startDate || '')
        && scopePerson(g.trainerId) && scopeBranch(g.branchId)).length;
    /* برنامج الأكل بلا فرع على صفّه — فرعُه فرعُ من ربطه */
    case 'mealPlans': {
      const branchOfUser = Object.fromEntries(users.map((u) => [u.id, u.branchId]));
      return mealPlans.filter((m) => inPeriod(t.period, m.date || '')
        && scopePerson(m.createdBy) && scopeBranch(branchOfUser[m.createdBy])).length;
    }
    case 'leads': return myLeads().length;
    case 'tests': return myLeads().filter((l) => ['trial-booked', 'trial-attended'].includes(l.stage)).length;
    case 'closedLeads': return myLeads().filter((l) => l.stage === 'subscribed').length;
    case 'closingRate': {
      const all = myLeads();
      if (!all.length) return 0;
      return Math.round((all.filter((l) => l.stage === 'subscribed').length / all.length) * 1000) / 10;
    }
    default: return null;
  }
}

module.exports = function registerOps(app, { auth, requireRole, h, notify, subStatus,
  scopedBranchIds, branchWhere, scopeFilter, branchAllowed, denyOutOfScope }) {
  /* نطاق الفروع: null = الكل. تُستعمل هنا كما في بقية الوحدات. */
  const inScopeList = (scope, id) => !scope || scope.includes(Number(id));
  /* ============================================================
     أولًا: المتابعة اليومية للمدرب (حضور/انصراف + إنتاج المحتوى)
     ============================================================ */
  app.get('/api/trainer-logs', auth, h(async (req, res) => {
    let logs = await Store.all('trainerLogs');
    if (req.user.role === 'trainer') logs = logs.filter((l) => l.trainerId === req.user.id);
    else if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    else {
      // سجل المدرب لا يحمل فرعًا — ننسبه لفرع صاحبه
      const myBranches = scopedBranchIds(req);
      if (myBranches) {
        const mine = new Set((await Store.find('users', { role: 'trainer' }))
          .filter((u) => inScopeList(myBranches, u.branchId)).map((u) => u.id));
        logs = logs.filter((l) => mine.has(l.trainerId));
      }
    }
    if (req.query.trainer) logs = logs.filter((l) => l.trainerId === Number(req.query.trainer));
    if (req.query.date) logs = logs.filter((l) => l.date === req.query.date);
    if (req.query.month) logs = logs.filter((l) => monthOf(l.date) === req.query.month);
    res.json(logs);
  }));

  app.post('/api/trainer-logs', auth, requireRole('trainer', 'admin'), h(async (req, res) => {
    const trainerId = req.user.role === 'trainer' ? req.user.id : Number(req.body.trainerId);
    const date = req.body.date || todayStr();
    if (!trainerId) return res.status(400).json({ error: 'المدرب مطلوب.' });

    const patch = {
      trainerId, date,
      checkIn: req.body.checkIn || null,
      checkOut: req.body.checkOut || null,
      goalsCreated: Number(req.body.goalsCreated) || 0,
      stories: Number(req.body.stories) || 0,
      reels: Number(req.body.reels) || 0,
      notes: req.body.notes || '',
    };
    patch.workHours = diffHours(patch.checkIn, patch.checkOut);

    const existing = (await Store.all('trainerLogs')).find((l) => l.trainerId === trainerId && l.date === date);
    const saved = existing ? await Store.update('trainerLogs', existing.id, patch) : await Store.insert('trainerLogs', patch);

    // الإحصاءات التلقائية من الحصص المسجلة (لا تُدخل يدويًا)
    const daySessions = (await Store.all('sessions')).filter((s) => s.trainerId === trainerId && s.date === date);
    res.json({
      ...saved,
      auto: {
        sessions: daySessions.length,
        trainingHours: hoursOf(daySessions),
        uniqueTrainees: new Set(daySessions.map((s) => s.traineeId)).size,
      },
    });
  }));

  /* ============================================================
     المهام اليومية/الشهرية (الإدارة تُسند — المدرب يُنجز)
     ============================================================ */
  app.get('/api/tasks', auth, h(async (req, res) => {
    let tasks = await Store.all('tasks');
    if (req.user.role === 'trainer') tasks = tasks.filter((t) => t.trainerId === req.user.id);
    else if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    if (req.query.trainer) tasks = tasks.filter((t) => t.trainerId === Number(req.query.trainer));
    if (req.query.date) tasks = tasks.filter((t) => t.type === 'daily' && t.date === req.query.date);
    if (req.query.month) {
      tasks = tasks.filter((t) => (t.type === 'monthly' && t.month === req.query.month)
        || (t.type === 'daily' && monthOf(t.date) === req.query.month));
    }
    res.json(tasks);
  }));

  app.post('/api/tasks', auth, requireRole('admin'), h(async (req, res) => {
    const { trainerId, title, type, date, month } = req.body;
    const trainer = await Store.get('users', Number(trainerId));
    if (!trainer || trainer.role !== 'trainer') return res.status(400).json({ error: 'المدرب غير موجود.' });
    if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب.' });
    if (type === 'daily' && !date) return res.status(400).json({ error: 'المهمة اليومية تحتاج تاريخًا.' });
    if (type === 'monthly' && !month) return res.status(400).json({ error: 'المهمة الشهرية تحتاج شهرًا.' });
    const task = await Store.insert('tasks', {
      trainerId: trainer.id, title, type: type === 'monthly' ? 'monthly' : 'daily',
      date: type === 'daily' ? date : null, month: type === 'monthly' ? month : monthOf(date),
      status: 'pending', createdBy: req.user.id,
    });
    await notify(trainer.id, `مهمة جديدة من الإدارة: «${title}» (${type === 'monthly' ? 'شهرية' : 'يوم ' + date}).`, 'task');
    res.json(task);
  }));

  app.put('/api/tasks/:id', auth, requireRole('admin', 'trainer'), h(async (req, res) => {
    const task = await Store.get('tasks', req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    if (req.user.role === 'trainer') {
      if (task.trainerId !== req.user.id) return res.status(403).json({ error: 'ليست مهمتك.' });
      if (req.body.status === undefined) return res.status(400).json({ error: 'يمكنك تعديل الحالة فقط.' });
      return res.json(await Store.update('tasks', task.id, { status: req.body.status === 'done' ? 'done' : 'pending' }));
    }
    const patch = {};
    ['title', 'status', 'date', 'month'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    res.json(await Store.update('tasks', task.id, patch));
  }));

  app.delete('/api/tasks/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('tasks', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     الأهداف (Targets) — شهري / نصف سنوي / سنوي
     ============================================================ */
  /* المجموعات التي تقرأ منها المؤشرات — واحدة لكل مستدعٍ فلا يختلف
     رقم الهدف بين الشاشة التي عرضته والشاشة التي حسبته. */
  const TARGET_SOURCES = ['targets', 'payments', 'sessions', 'subscriptions', 'subEvents',
    'users', 'branches', 'trainerLogs', 'traineeFlags', 'traineeGoals', 'mealPlans', 'leads'];

  /* اسم صاحب الهدف ودورُه — الشخص يظهر باسمه ودوره لا برقمه */
  const ROLE_AR = { admin: 'إدارة', accountant: 'محاسبة', trainer: 'مدرب', nutritionist: 'تغذية' };
  function decorateTarget(t, data) {
    const actual = computeActual(t, { ...data, subStatus });
    const effective = effectiveTarget(t, data.targets, data, subStatus);
    const person = ['trainer', 'user'].includes(t.scope)
      ? data.users.find((u) => u.id === t.refId) : null;
    const refName = t.scope === 'branch'
      ? (data.branches.find((b) => b.id === t.refId) || {}).name
      : person
        ? `${person.name}${t.scope === 'user' ? ` (${ROLE_AR[person.role] || person.role})` : ''}`
        : t.scope === 'company' ? 'الشركة كاملة' : '—';
    const meta = METRICS[t.metric] || {};
    return {
      ...t, actual,
      effective, carried: effective - t.value, // المتبقي المرحَّل من الأشهر السابقة
      pct: effective ? Math.round((actual / effective) * 100) : null,
      // الهدف الحرّ يظهر باسمه الذي كتبته الإدارة
      refName, metricLabel: t.label || meta.label || t.metric,
      money: !!meta.money, pctMetric: !!meta.pct, manual: !!meta.manual,
      // مؤشرٌ لم يعد يُعرض في قائمة الاختيار — يُوسَم ليُستبدل بمرور الوقت
      deprecated: !!meta.deprecated,
    };
  }

  app.get('/api/targets', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const data = await Store.load(...TARGET_SOURCES);
    let targets = data.targets;
    if (req.query.period) targets = targets.filter((t) => t.period === req.query.period);
    /* المحاسب المقيَّد يرى أهداف فروعه وأهدافه هو — لا أهداف الشركة
       ولا الفروع الأخرى ولا أهداف زملائه. */
    const myBranches = scopedBranchIds(req);
    if (myBranches) {
      targets = targets.filter((t) => (t.scope === 'branch' && inScopeList(myBranches, t.refId))
        || (t.scope === 'user' && t.refId === req.user.id));
    }
    res.json(targets.map((t) => decorateTarget(t, data)));
  }));

  /* قائمة المؤشرات ونطاقاتها — الواجهة تبنيها منها فلا تتفرّع النسختان */
  app.get('/api/targets/metrics', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    res.json({
      groups: METRIC_GROUPS.map(([key, label]) => ({ key, label })),
      metrics: METRIC_KEYS.map((k) => ({ key: k, ...METRICS[k] })),
    });
  }));

  /* الأدوار التي يصحّ وضع هدف شخصي لها — المتدرب ليس موظفًا يُقاس */
  const TARGETABLE_ROLES = ['admin', 'accountant', 'trainer', 'nutritionist'];

  app.post('/api/targets', auth, requireRole('admin'), h(async (req, res) => {
    const { scope, refId, metric, period, value } = req.body;
    if (!ALL_SCOPES.includes(scope)) return res.status(400).json({ error: 'نطاق غير صحيح.' });
    if (!METRICS[metric]) return res.status(400).json({ error: 'مؤشر غير مدعوم.' });
    if (!metricAllowsScope(metric, scope)) {
      return res.status(400).json({ error: `المؤشر «${METRIC_LABELS[metric]}» لا يُقاس على هذا النطاق.` });
    }
    if (!/^\d{4}(-\d{2}|-H1|-H2)?$/.test(period || '')) return res.status(400).json({ error: 'صيغة الفترة: YYYY-MM أو YYYY-H1/H2 أو YYYY.' });
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return res.status(400).json({ error: 'قيمة الهدف مطلوبة.' });
    if (METRICS[metric].pct && num > 100) return res.status(400).json({ error: 'النسبة المئوية لا تتجاوز ١٠٠.' });

    /* المرجع يجب أن يكون موجودًا فعلًا — هدفٌ على فرعٍ محذوف أو على رقمٍ
       لا يقابله أحد يظهر أبدًا بنسبة صفر بلا سبب ظاهر. */
    const ref = Number(refId);
    if (scope !== 'company') {
      if (!Number.isInteger(ref) || ref <= 0) return res.status(400).json({ error: 'اختر صاحب الهدف.' });
      if (scope === 'branch') {
        if (!(await Store.get('branches', ref))) return res.status(400).json({ error: 'الفرع غير موجود.' });
      } else {
        const u = await Store.get('users', ref);
        if (!u || !TARGETABLE_ROLES.includes(u.role)) return res.status(400).json({ error: 'الموظف غير موجود.' });
        if (scope === 'trainer' && u.role !== 'trainer') return res.status(400).json({ error: 'نطاق «مدرب» لحسابات المدربين وحدها.' });
      }
    }

    const all = await Store.all('targets');
    const body = { scope, refId: scope === 'company' ? null : ref, metric, period, value: num };
    /* الهدف الحرّ: اسمه مطلوب، ومحقَّقُه الابتدائي اختياري — ويتكرر بالاسم
       لا بالمؤشر، فللإدارة أكثر من هدف حرّ في الفترة نفسها. */
    if (METRICS[metric].manual) {
      body.label = String(req.body.label || '').trim().slice(0, 120);
      if (!body.label) return res.status(400).json({ error: 'اكتب اسم الهدف الحرّ (مثال: حملة رمضان، تجهيز الصالة الجديدة…).' });
      const act = Number(req.body.actual);
      body.actual = Number.isFinite(act) && act >= 0 ? act : 0;
    }
    const dup = all.find((t) => t.scope === scope && t.refId === body.refId && t.metric === metric && t.period === period
      && (!METRICS[metric].manual || (t.label || '') === body.label));
    const saved = dup ? await Store.update('targets', dup.id, body) : await Store.insert('targets', body);
    res.json(saved);
  }));

  /* تعديل هدف قائم: قيمتُه، واسمُ الهدف الحرّ ومحقَّقُه — بلا حذفٍ وإعادة
     إدخال، وبلا فقدان تاريخه. المحقَّق يُقبل للهدف الحرّ وحده؛ بقية
     المؤشرات يحسبها النظام من بياناته. */
  app.put('/api/targets/:id', auth, requireRole('admin'), h(async (req, res) => {
    const t = await Store.get('targets', req.params.id);
    if (!t) return res.status(404).json({ error: 'الهدف غير موجود.' });
    const meta = METRICS[t.metric] || {};
    const patch = {};
    if (req.body.value !== undefined) {
      const num = Number(req.body.value);
      if (!Number.isFinite(num) || num <= 0) return res.status(400).json({ error: 'قيمة الهدف مطلوبة.' });
      if (meta.pct && num > 100) return res.status(400).json({ error: 'النسبة المئوية لا تتجاوز ١٠٠.' });
      patch.value = num;
    }
    if (meta.manual) {
      if (req.body.label !== undefined) {
        const label = String(req.body.label || '').trim().slice(0, 120);
        if (!label) return res.status(400).json({ error: 'اسم الهدف مطلوب.' });
        patch.label = label;
      }
      if (req.body.actual !== undefined) {
        const act = Number(req.body.actual);
        if (!Number.isFinite(act) || act < 0) return res.status(400).json({ error: 'المحقَّق رقمٌ غير سالب.' });
        patch.actual = act;
      }
    } else if (req.body.actual !== undefined) {
      return res.status(400).json({ error: 'هذا المؤشر يحسبه النظام من بياناته — المحقَّق يُدخل يدويًا للهدف الحرّ وحده.' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'لا شيء لتعديله.' });
    const data = await Store.load(...TARGET_SOURCES);
    const saved = await Store.update('targets', t.id, patch);
    res.json(decorateTarget(saved, { ...data, targets: data.targets.map((x) => (x.id === saved.id ? saved : x)) }));
  }));

  app.delete('/api/targets/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('targets', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     KPI — تلقائي لكل موظف: (المهام + الأهداف) والنتائج
     ============================================================ */
  /* KPI لكل موظف يُقاس — لا المدربين وحدهم.
     «الهدف الجديد لازم يشمل المحاسب والمبيعات وكل حدا بنحسب»: من كان له
     هدفٌ شخصي (نطاق user) أو مهامٌ هذا الشهر يظهر هنا بنسبته، وأرقام
     التدريب (حصص/ساعات) تبقى للمدربين وحدهم فهي ليست عمل المحاسبة. */
  const KPI_ROLES = ['trainer', 'accountant', 'nutritionist', 'admin'];

  async function computeKpis(month) {
    const data = await Store.load('users', 'tasks', ...TARGET_SOURCES);
    const staff = data.users.filter((u) => KPI_ROLES.includes(u.role) && u.active !== false);
    return staff.map((t) => {
      const isTrainer = t.role === 'trainer';
      const myTasks = data.tasks.filter((x) => x.trainerId === t.id
        && ((x.type === 'daily' && monthOf(x.date) === month) || (x.type === 'monthly' && x.month === month)));
      const tasksPct = myTasks.length ? Math.round((myTasks.filter((x) => x.status === 'done').length / myTasks.length) * 100) : null;

      /* أهداف هذا الشخص: نطاق «مدرب» للمدربين (كما كان) ونطاق «user»
         لأي موظف — فيقرأ المحاسب والمبيعات نسبتهما من المكان نفسه. */
      const myTargets = data.targets.filter((x) => monthInPeriod(x.period, month)
        && x.refId === t.id && (x.scope === 'user' || (isTrainer && x.scope === 'trainer')));
      const targetPcts = myTargets.map((x) => {
        const actual = computeActual(x, { ...data, subStatus }) || 0;
        return Math.min(Math.round((actual / x.value) * 100), 120);
      });
      const targetsPct = targetPcts.length ? Math.round(targetPcts.reduce((a, b) => a + b, 0) / targetPcts.length) : null;

      const parts = [tasksPct, targetsPct].filter((v) => v !== null);
      const kpi = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

      /* الغياب مخصوم من رصيد المتدرب لكنه ليس تدريبًا نفّذه المدرب —
         كان يُحتسب هنا حصةً ومتدربًا فريدًا فيرفع أرقام المدرب زورًا،
         بينما تستثنيه كل بقية التقارير (فتختلف الأرقام بين الشاشات). */
      const monthAll = isTrainer
        ? data.sessions.filter((s) => s.trainerId === t.id && monthOf(s.date) === month) : [];
      const monthSessions = monthAll.filter(delivered);
      return {
        trainerId: t.id, name: t.name, branchId: t.branchId, role: t.role,
        targetsCount: myTargets.length,
        tasksTotal: myTasks.length, tasksDone: myTasks.filter((x) => x.status === 'done').length,
        tasksPct, targetsPct, kpi,
        sessions: monthSessions.length,
        absences: monthAll.length - monthSessions.length,
        hours: hoursOf(monthSessions),
        uniqueTrainees: new Set(monthSessions.map((s) => s.traineeId)).size,
      };
    /* موظفٌ بلا مهام ولا أهداف هذا الشهر لا صفَّ له — الجدول يعرض من يُقاس */
    }).filter((k) => k.role === 'trainer' || k.tasksTotal || k.targetsCount);
  }

  app.get('/api/kpi', auth, h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    const kpis = await computeKpis(month);
    // كلٌّ يرى مؤشره؛ والإدارة والمحاسبة ترى فريقها ضمن نطاق فروعها
    if (['trainer', 'nutritionist'].includes(req.user.role)) {
      return res.json(kpis.filter((k) => k.trainerId === req.user.id));
    }
    if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    /* المحاسب المقيَّد: فريق فروعه + مؤشره هو (حسابه قد يكون بلا فرع
       واحد فيسقط من تصفية الفرع ولا يرى هدفه الشخصي إطلاقًا). */
    const inScope = scopeFilter(req);
    res.json(kpis.filter((k) => k.trainerId === req.user.id || inScope(k)));
  }));

  /* ============================================================
     لوحة KPI الكاملة — أربع زوايا لنفس الشهر:
       المدرب · الفرع · المحاسب (بالفرع) · المبيعات
     كل رقم فيها مشتقّ من بيانات النظام لا من إدخال يدوي.
     ============================================================ */
  /* النطاق قائمةُ فروع لا فرعًا واحدًا — محاسبةٌ قد تتولى فرعين */
  async function buildKpiBoard(month, branch) {
    const period = { gte: month + '-01', lte: month + '-31' };
    const [users, branches, subscriptions, sessionsAll, payments, subEvents,
      trainerLogs, tasks, targets, flags, mealPlans, leads, programs, traineeGoals] = await Promise.all([
      Store.all('users'),
      Store.all('branches'),
      Store.all('subscriptions'),
      Store.find('sessions', { date: period }),
      Store.find('payments', { date: period }),
      Store.find('subEvents', { date: period }),
      Store.find('trainerLogs', { date: period }),
      Store.find('tasks', { month }),
      Store.all('targets'),
      Store.find('traineeFlags', { date: period }),
      Store.all('mealPlans'),
      Store.find('leads', { contactDate: period }),
      Store.all('programs'),
      Store.all('traineeGoals'),
    ]);

    /* نافذة أوسع للأهداف نصف السنوية والسنوية: قياسها على بيانات الشهر
       وحده كان يُظهرها متأخرة أبدًا. تُحمَّل فقط إن وُجد هدف يحتاجها. */
    const year = month.slice(0, 4);
    const wideTargets = targets.some((t) => /^\d{4}$/.test(t.period) || /^\d{4}-H[12]$/.test(t.period));
    const yearRange = { gte: year + '-01-01', lte: year + '-12-31' };
    const [yearPayments, yearSessions, yearEvents, yearLogs, yearFlags, yearLeads] = wideTargets
      ? await Promise.all([
        Store.find('payments', { date: yearRange }),
        Store.find('sessions', { date: yearRange }),
        Store.find('subEvents', { date: yearRange }),
        Store.find('trainerLogs', { date: yearRange }),
        Store.find('traineeFlags', { date: yearRange }),
        // أهداف المبيعات النصف سنوية والسنوية تُقرأ من نافذة السنة كاملة
        Store.find('leads', { contactDate: yearRange }),
      ])
      : [payments, sessionsAll, subEvents, trainerLogs, flags, leads];
    /* أهدافُ المشتركين وبرامجُ الأكل تدخل الحساب أيضًا — بعض المؤشرات
       تُقرأ منها (أهداف تدريبية، برامج أكل). تُحمَّل كاملة لأن تصفيتها
       بالفترة تجري داخل computeActual. */
    const periodData = { payments: yearPayments, sessions: yearSessions, subscriptions, subEvents: yearEvents,
      trainerLogs: yearLogs, traineeFlags: yearFlags, users, traineeGoals, mealPlans, leads: yearLeads };

    const inBranch = (x) => inScopeList(branch, x.branchId);
    const sessions = sessionsAll.filter(delivered).filter(inBranch);
    const absences = sessionsAll.filter((s) => !delivered(s)).filter(inBranch);
    // الدفعة تخصّ اشتراكًا أو دَينًا سابقًا — والاثنان تحصيلٌ حقيقي
    const scopedPayments = payments.filter(inBranch);
    const scopedEvents = subEvents.filter(inBranch);
    const scopedBranches = branches.filter((b) => inScopeList(branch, b.id));
    const trainees = users.filter((u) => u.role === 'trainee');
    const traineeById = Object.fromEntries(trainees.map((t) => [t.id, t]));
    /* أهداف المشتركين: ما وُضع هذا الشهر (رقمُ المدرب)، ومن له هدف فعّال
       (لمعرفة من بقي بلا هدف). */
    const monthGoals = traineeGoals.filter((g) => (g.createdAt || g.startDate || '').slice(0, 7) === month);
    const goalTraineeIds = new Set(traineeGoals
      .filter((g) => (g.status || 'active') === 'active').map((g) => g.traineeId));

    /* ---------- المدرب ---------- */
    const trainerRows = users
      .filter((u) => u.role === 'trainer' && u.active !== false && inBranch(u))
      .map((t) => {
        const ts = sessions.filter((s) => s.trainerId === t.id);
        const myTraineeIds = new Set(ts.map((s) => s.traineeId));
        const logs = trainerLogs.filter((l) => l.trainerId === t.id);
        const myTasks = tasks.filter((x) => x.trainerId === t.id);
        // الزبائن الذين جاؤوا عن طريقه — والتحصيل الناتج عنهم هذا الشهر
        const mine = trainees.filter((u) => u.sourceTrainerId === t.id
          || (u.sourceType === 'trainer' && u.sourceRefId === t.id));
        const mineIds = new Set(mine.map((u) => u.id));
        const collected = scopedPayments
          .filter((p) => mineIds.has(p.traineeId)).reduce((s, p) => s + p.amount, 0);
        const myFlags = flags.filter((f) => myTraineeIds.has(f.traineeId));
        const myEvents = scopedEvents.filter((e) => myTraineeIds.has(e.traineeId) || mineIds.has(e.traineeId));
        const goalMix = {};
        [...myTraineeIds].forEach((id) => {
          const g = (traineeById[id] || {}).goal || 'loss';
          goalMix[g] = (goalMix[g] || 0) + 1;
        });

        /* الهدف نصف السنوي أو السنوي يُقاس على فترته كاملة، وبيانات هذه
           اللوحة محدودة بالشهر — فقياسه عليها يُظهره متأخرًا دائمًا.
           نقيس الشهري من بيانات الشهر، والأطول من نافذته الكاملة. */
        const targetPcts = targets
          .filter((x) => x.scope === 'trainer' && x.refId === t.id && monthInPeriod(x.period, month))
          .map((x) => {
            const wide = /^\d{4}$/.test(x.period) || /^\d{4}-H[12]$/.test(x.period);
            const src = wide ? periodData
              : { payments, sessions: sessionsAll, subscriptions, subEvents, trainerLogs,
                traineeFlags: flags, users, traineeGoals, mealPlans, leads };
            return Math.min(Math.round(((computeActual(x, { ...src, subStatus }) || 0) / x.value) * 100), 120);
          });

        return {
          trainerId: t.id, name: t.name, branchId: t.branchId,
          branch: (branches.find((b) => b.id === t.branchId) || {}).name || '—',
          officeHours: Math.round(logs.reduce((s, l) => s + (Number(l.workHours) || 0), 0) * 10) / 10,
          trainingHours: hoursOf(ts),
          sessions: ts.length,
          absences: absences.filter((s) => s.trainerId === t.id).length,
          trainedPeople: myTraineeIds.size,
          collected,
          stories: logs.reduce((s, l) => s + (Number(l.stories) || 0), 0),
          reels: logs.reduce((s, l) => s + (Number(l.reels) || 0), 0),
          newClients: mine.filter((u) => (u.joinedAt || '').startsWith(month)).length,
          newClientsTotal: mine.length,
          freezes: myEvents.filter((e) => e.type === 'freeze').length,
          renewals: myEvents.filter((e) => e.type === 'renewal').length,
          results: myFlags.filter((f) => f.kind === 'result').length,
          problems: myFlags.filter((f) => f.kind === 'problem').length,
          /* «كم هدفًا تدريبيًا وضعه هذا الشهر» — من جدول الأهداف نفسه لا
             من إدخال يدوي في سجله اليومي. والقديم يبقى معروضًا باسمه. */
          goalsCreated: monthGoals.filter((g) => g.trainerId === t.id).length,
          goalsLoggedManually: logs.reduce((s, l) => s + (Number(l.goalsCreated) || 0), 0),
          // من درّبهم هذا الشهر ولا هدف فعّال لهم — يظهر باسمه لا كرقم
          traineesWithoutGoal: [...myTraineeIds].filter((id) => !goalTraineeIds.has(id))
            .map((id) => (traineeById[id] || {}).name).filter(Boolean),
          // توزيع أهداف متدربيه (نزول/عضل/…) — للاطّلاع لا للتقييم
          traineeGoalMix: goalMix,
          mealPlans: mealPlans.filter((p) => p.createdBy === t.id && (p.date || '').startsWith(month)).length,
          programs: programs.filter((p) => p.trainerId === t.id && (p.createdAt || '').startsWith(month)).length,
          tasksTotal: myTasks.length,
          tasksDone: myTasks.filter((x) => x.status === 'done').length,
          tasksPct: myTasks.length ? Math.round((myTasks.filter((x) => x.status === 'done').length / myTasks.length) * 100) : null,
          targetsPct: targetPcts.length ? Math.round(targetPcts.reduce((a, b) => a + b, 0) / targetPcts.length) : null,
        };
      });

    /* ---------- الفرع ---------- */
    const branchRows = scopedBranches.map((b) => {
      const ev = subEvents.filter((e) => e.branchId === b.id);
      const subs = subscriptions.filter((s) => s.branchId === b.id);
      const frozenNow = new Set(subs.filter((s) => subStatus(s) === 'frozen').map((s) => s.traineeId)).size;
      const ended = subs.filter((s) => monthOf(s.endDate) === month && s.status !== 'cancelled').length;
      const renewals = ev.filter((e) => e.type === 'renewal').length;
      const limit = Number(b.freezeLimit) > 0 ? Number(b.freezeLimit) : null;
      return {
        branchId: b.id, branch: b.name,
        newSubs: ev.filter((e) => e.type === 'new').length,
        renewals,
        returnedFromFreeze: ev.filter((e) => e.type === 'unfreeze').length,
        freezesMonth: ev.filter((e) => e.type === 'freeze').length,
        frozenNow,
        freezeLimit: limit,
        // «التجميد مسموح عدد معين للفرع» — نُظهر التجاوز صراحةً
        freezeOverLimit: limit !== null ? Math.max(0, frozenNow - limit) : 0,
        collected: payments.filter((p) => p.branchId === b.id).reduce((s, p) => s + p.amount, 0),
        activeTrainees: new Set(subs.filter((s) => subStatus(s) === 'active').map((s) => s.traineeId)).size,
        endedSubs: ended,
        retentionPct: ended ? Math.min(100, Math.round((renewals / ended) * 100)) : null,
        sessions: sessionsAll.filter(delivered).filter((s) => s.branchId === b.id).length,
        results: flags.filter((f) => f.kind === 'result' && f.branchId === b.id).length,
        problems: flags.filter((f) => f.kind === 'problem' && f.branchId === b.id).length,
      };
    });

    /* ---------- المحاسب: نفس الأرقام مختصرةً بالفرع ---------- */
    const accountantRows = branchRows.map((b) => ({
      branchId: b.branchId, branch: b.branch,
      collected: b.collected, newSubs: b.newSubs,
      returnedFromFreeze: b.returnedFromFreeze, freezesMonth: b.freezesMonth, frozenNow: b.frozenNow,
    }));

    /* ---------- المبيعات ---------- */
    const scopedLeads = leads.filter((l) => inScopeList(branch, l.branchId));
    const subscribed = scopedLeads.filter((l) => l.stage === 'subscribed').length;
    const sales = {
      newNumbers: scopedLeads.length,
      closingRate: scopedLeads.length ? Math.round((subscribed / scopedLeads.length) * 1000) / 10 : null,
      newClients: subscribed,
      returnedFromFreeze: scopedEvents.filter((e) => e.type === 'unfreeze').length,
      tests: scopedLeads.filter((l) => ['trial-booked', 'trial-attended'].includes(l.stage)).length,
      testsAttended: scopedLeads.filter((l) => l.stage === 'trial-attended').length,
      noShow: scopedLeads.filter((l) => l.stage === 'no-show').length,
      byChannel: scopedLeads.reduce((acc, l) => { if (l.channel) acc[l.channel] = (acc[l.channel] || 0) + 1; return acc; }, {}),
    };

    /* ---------- كيف وصلنا المشتركون الجدد هذا الشهر ---------- */
    const joinedThisMonth = trainees.filter((u) => (u.joinedAt || '').startsWith(month) && inBranch(u));
    const acquisition = joinedThisMonth.reduce((acc, u) => {
      const key = u.sourceType || (u.sourceTrainerId ? 'trainer' : 'new');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    /* ---------- أهداف الأشخاص: المحاسبة والمبيعات وكل من يُقاس ----------
       «الهدف الجديد لازم يشمل المحاسب والمبيعات وكل حدا بنحسب»: كل هدف
       بنطاق «user» يُقاس هنا ويظهر باسم صاحبه ودوره — في اللوحة نفسها
       التي تجمع بقية المؤشرات، لا في شاشة أخرى. */
    const staffData = { payments: yearPayments, sessions: yearSessions, subscriptions,
      subEvents: yearEvents, trainerLogs: yearLogs, traineeFlags: yearFlags,
      users, traineeGoals, mealPlans, leads: yearLeads };
    const ROLE_LABELS = { admin: 'إدارة', accountant: 'محاسبة', trainer: 'مدرب', nutritionist: 'تغذية' };
    const staffTargets = targets
      .filter((x) => x.scope === 'user' && monthInPeriod(x.period, month))
      .map((x) => {
        const u = users.find((p) => p.id === x.refId);
        if (!u) return null;
        // المحاسب المقيَّد لا يرى أهداف زملاء خارج فروعه
        if (branch && u.role !== 'admin' && !inScopeList(branch, u.branchId)
          && !(Array.isArray(u.branchIds) && u.branchIds.some((b) => inScopeList(branch, b)))) return null;
        const actual = computeActual(x, { ...staffData, subStatus }) || 0;
        const meta = METRICS[x.metric] || {};
        return {
          targetId: x.id, userId: u.id, name: u.name,
          role: u.role, roleLabel: ROLE_LABELS[u.role] || u.role,
          branchId: u.branchId || null,
          branch: (branches.find((b) => b.id === u.branchId) || {}).name || '—',
          metric: x.metric, metricLabel: x.label || meta.label || x.metric,
          money: !!meta.money, pctMetric: !!meta.pct,
          period: x.period, target: x.value, actual,
          pct: x.value ? Math.min(Math.round((actual / x.value) * 100), 120) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')
        || String(a.metricLabel).localeCompare(String(b.metricLabel), 'ar'));

    return { month, branch: branch && branch.length === 1 ? branch[0] : null, trainers: trainerRows, branches: branchRows, accountant: accountantRows, sales, acquisition, staffTargets };
  }

  app.get('/api/kpi/board', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    res.json(await buildKpiBoard(month, scopedBranchIds(req)));
  }));

  /* ============================================================
     ثانيًا: لوحة المتابعة اليومية
     ============================================================ */
  app.get('/api/daily', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const date = req.query.date || todayStr();
    /* «المتابعة اليومية اختار الفرع الي بدي اتابعه» — واللوحة تحترم أيضًا
       فروع المحاسب المقيَّد فلا يرى يوم فرعٍ ليس له. */
    const myBranches = scopedBranchIds(req);
    const inBranch = (x) => inScopeList(myBranches, x && x.branchId);
    const nowIso = nowLocalMinute(); // بتوقيت النادي — رصد الغياب فورًا لا بعد ساعات
    /* لوحة يوم واحد: كل الجداول الكبيرة تُصفّى بالتاريخ في القاعدة،
       عدا المواعيد فنحتاج نافذة 30 يومًا لرصد الغياب المتكرر. */
    const absenceFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [payments, subEvents, allDaySessions, dayAppts, windowAppts, trainerLogs, tasks, users, branches] = await Promise.all([
      Store.find('payments', { date }),
      Store.find('subEvents', { date }),
      Store.find('sessions', { date }),
      Store.find('appointments', { date }),
      Store.find('appointments', { date: { gte: absenceFrom, lte: date } }),
      Store.find('trainerLogs', { date }),
      Store.find('tasks', { month: monthOf(date) }),
      Store.all('users'),
      Store.all('branches'),
    ]);
    const sessions = allDaySessions.filter(delivered).filter(inBranch);
    const daySessionAbsences = allDaySessions.filter((s) => !delivered(s)).filter(inBranch);
    const data = {
      payments: payments.filter(inBranch),
      subEvents: subEvents.filter(inBranch),
      sessions, users, trainerLogs, tasks,
      branches: branches.filter((b) => inScopeList(myBranches, b.id)),
    };
    const scopedTraineeIds = new Set(users
      .filter((u) => u.role === 'trainee' && inScopeList(myBranches, u.branchId)).map((u) => u.id));
    const inScopeAppt = (a) => inScopeList(myBranches, a.branchId)
      || (a.traineeId && scopedTraineeIds.has(a.traineeId));

    // التحصيل اليومي لكل فرع
    const branchRows = data.branches.map((b) => {
      const dayPays = data.payments.filter((p) => p.branchId === b.id);
      const ev = data.subEvents.filter((e) => e.branchId === b.id);
      return {
        branchId: b.id, branch: b.name,
        collected: dayPays.reduce((s, p) => s + p.amount, 0),
        newSubs: ev.filter((e) => e.type === 'new').length,
        renewals: ev.filter((e) => e.type === 'renewal').length,
        freezes: ev.filter((e) => e.type === 'freeze').length,
        cancels: ev.filter((e) => e.type === 'cancel').length,
        returns: ev.filter((e) => e.type === 'unfreeze').length,
        sessions: data.sessions.filter((s) => s.branchId === b.id).length,
      };
    });

    // حضور وغياب اليوم — الغياب المسجَّل كحصة يُعلِّم موعده أيضًا فلا يُعدّ مرتين
    const scopedDayAppts = dayAppts.filter(inScopeAppt);
    const absSessionIds = new Set(daySessionAbsences.map((s) => s.id));
    const attendance = {
      sessions: data.sessions.length,
      uniqueTrainees: new Set(data.sessions.map((s) => s.traineeId)).size,
      scheduled: scopedDayAppts.length,
      done: scopedDayAppts.filter((a) => a.status === 'done').length,
      missed: daySessionAbsences.length
        + scopedDayAppts.filter((a) => isMissed(a, nowIso) && !absSessionIds.has(a.sessionId)).length,
      absenceSessions: daySessionAbsences.length,
    };

    // من غاب أكثر من مرة خلال 30 يومًا → تنبيه للإدارة ومدرب الحصص
    const missedByTrainee = {};
    // مواعيد الـ Test لزوّار بلا حساب لا تدخل تنبيهات الغياب المتكرر — لا ملف لهم
    windowAppts.filter((a) => a.traineeId && inScopeAppt(a) && isMissed(a, nowIso))
      .forEach((a) => { (missedByTrainee[a.traineeId] = missedByTrainee[a.traineeId] || []).push(a); });
    const absentees = Object.entries(missedByTrainee)
      .filter(([, list]) => list.length >= 2)
      .map(([traineeId, list]) => {
        const trainee = data.users.find((u) => u.id === Number(traineeId)) || {};
        return {
          traineeId: Number(traineeId), name: trainee.name, phone: trainee.phone,
          missed: list.length,
          trainers: [...new Set(list.map((a) => (data.users.find((u) => u.id === a.trainerId) || {}).name))],
          trainerIds: [...new Set(list.map((a) => a.trainerId))],
        };
      })
      .sort((a, b) => b.missed - a.missed);

    // إشعارات الغياب (بدون تكرار)
    const admin = data.users.find((u) => u.role === 'admin');
    if (absentees.length) {
      const recipients = [...new Set([admin && admin.id, ...absentees.flatMap((a) => a.trainerIds)].filter(Boolean))];
      // إشعارات الغياب السابقة لهؤلاء المستلمين فقط — استعلام واحد بدل مسح الجدول
      const seen = new Set((await Store.find('notifications', { userId: { in: recipients }, type: 'absence' }))
        .map((n) => n.userId + '|' + n.text));
      for (const a of absentees) {
        const text = `تنبيه غياب: ${a.name} غاب عن ${a.missed} حصص — يُرجى التواصل معه.`;
        const targets = [admin && admin.id, ...a.trainerIds].filter(Boolean);
        for (const uid of targets) {
          if (seen.has(uid + '|' + text)) continue;
          await Store.insert('notifications', { userId: uid, text, date, read: false, type: 'absence' });
          seen.add(uid + '|' + text);
        }
      }
    }

    // سجلات المدربين اليومية + إحصاءاتهم التلقائية + مهام اليوم
    const trainers = data.users.filter((u) => u.role === 'trainer' && u.active !== false
      && inScopeList(myBranches, u.branchId));
    const trainerRows = trainers.map((t) => {
      const log = data.trainerLogs.find((l) => l.trainerId === t.id) || {};
      const ds = data.sessions.filter((s) => s.trainerId === t.id);
      const dayTasks = data.tasks.filter((x) => x.trainerId === t.id
        && ((x.type === 'daily' && x.date === date) || (x.type === 'monthly' && x.month === monthOf(date))));
      return {
        trainerId: t.id, name: t.name,
        checkIn: log.checkIn || null, checkOut: log.checkOut || null, workHours: log.workHours || null,
        trainingHours: hoursOf(ds), sessions: ds.length,
        uniqueTrainees: new Set(ds.map((s) => s.traineeId)).size,
        goalsCreated: log.goalsCreated || 0, stories: log.stories || 0, reels: log.reels || 0,
        tasksDone: dayTasks.filter((x) => x.status === 'done').length, tasksTotal: dayTasks.length,
      };
    });

    /* «يوم بلا إدخال»: لا حصص ولا دفعات ولا أحداث اشتراك ولا سجل مدرب.
       على يوم عمل هذا لا يعني هدوءًا — يعني أن أحدًا لم يُدخل شيئًا. */
    const noInput = !data.sessions.length && !daySessionAbsences.length && !data.payments.length
      && !data.subEvents.length && !data.trainerLogs.length;

    /* أعياد الميلاد: عيد الغد أولًا (التنبيه قبل يوم) ثم عيد اليوم —
       تظهر في المتابعة اليومية بجوار بقية عمل اليوم لا في صفحة منفصلة. */
    const mmdd = (d) => (d || '').slice(5, 10);
    const tomorrow = new Date(new Date(date + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
    const birthdays = data.users
      .filter((u) => u.role === 'trainee' && u.active !== false && u.birthDate
        && inScopeList(myBranches, u.branchId))
      .filter((u) => [mmdd(tomorrow), mmdd(date)].includes(mmdd(u.birthDate)))
      .map((u) => ({
        traineeId: u.id, name: u.name, phone: u.phone || '', birthDate: u.birthDate,
        branch: (data.branches.find((b) => b.id === u.branchId) || {}).name || '—',
        when: mmdd(u.birthDate) === mmdd(tomorrow) ? 'tomorrow' : 'today',
      }))
      .sort((a, b) => (a.when === b.when ? a.name.localeCompare(b.name, 'ar') : a.when === 'tomorrow' ? -1 : 1));

    /* مدرب لم يُدخل ساعاته ولا أنجز مهمة يومية — يظهر باسمه لا كرقم */
    const trainersMissingLog = trainerRows
      .filter((t) => !t.checkIn && !t.workHours && !t.tasksDone && !t.sessions)
      .map((t) => ({ trainerId: t.trainerId, name: t.name }));

    res.json({
      date,
      branch: req.query.branch ? Number(req.query.branch) : null,
      totals: {
        collected: branchRows.reduce((s, b) => s + b.collected, 0),
        newSubs: branchRows.reduce((s, b) => s + b.newSubs, 0),
        renewals: branchRows.reduce((s, b) => s + b.renewals, 0),
        freezes: branchRows.reduce((s, b) => s + b.freezes, 0),
        cancels: branchRows.reduce((s, b) => s + b.cancels, 0),
        returns: branchRows.reduce((s, b) => s + b.returns, 0),
      },
      branches: branchRows, attendance, absentees, trainerRows,
      noInput, trainersMissingLog, birthdays,
    });
  }));

  /* ============================================================
     رابعًا: سجل المجمدين — استيراد Excel + متابعة + واتساب
     ============================================================ */
  const FROZEN_STATUSES = ['pending', 'contacted', 'replied', 'no-reply', 'returned'];

  app.get('/api/frozen', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { frozen, branches } = await Store.load('frozen', 'branches');
    const myBranches = scopedBranchIds(req);
    /* سجل بلا فرع (استيراد قديم بنصّ الفرع) يبقى ظاهرًا للإدارة وحدها —
       نسبته غير مؤكدة فلا يُعرض لمحاسب فرعٍ بعينه. */
    res.json(frozen
      .filter((f) => !myBranches || myBranches.includes(Number(f.branchId)))
      .map((f) => ({ ...f, branchName: f.branchId ? (branches.find((b) => b.id === f.branchId) || {}).name : f.branchText || '—' })));
  }));

  app.post('/api/frozen', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { name, phone, birthDate, branchId, lastSubDate, reason } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب.' });
    if (!branchAllowed(req.user, Number(branchId) || null)) return denyOutOfScope(res);
    res.json(await Store.insert('frozen', {
      name, phone: phone || '', birthDate: birthDate || null, branchId: Number(branchId) || null,
      branchText: null, lastSubDate: lastSubDate || null, freezeDate: todayStr(), reason: reason || '',
      status: 'pending', lastContact: null, note: '', importedAt: todayStr(),
    }));
  }));

  app.put('/api/frozen/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const row = await Store.get('frozen', req.params.id);
    if (!row) return res.status(404).json({ error: 'السجل غير موجود.' });
    if (!branchAllowed(req.user, row.branchId)) return denyOutOfScope(res);
    const patch = {};
    if (req.body.status !== undefined) {
      if (!FROZEN_STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'حالة غير صحيحة.' });
      patch.status = req.body.status;
      if (['contacted', 'replied', 'no-reply'].includes(req.body.status)) patch.lastContact = todayStr();
    }
    ['note', 'phone', 'name'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    res.json(await Store.update('frozen', row.id, patch));
  }));

  app.delete('/api/frozen/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('frozen', req.params.id);
    res.json({ ok: true });
  }));

  /* استيراد ملف Excel/CSV — يتعرف على الأعمدة العربية تلقائيًا */
  app.post('/api/frozen/import', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { fileBase64, defaultBranchId } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'الملف مطلوب.' });
    /* محلل Excel اعتماد اختياري: حالة إعدادٍ ناقص لا خطأ خادم — و503
       تقول للمشغّل إن الخدمة غير مهيأة، والرسالة تقول ماذا يفعل. */
    let XLSX;
    try { XLSX = require('xlsx'); }
    catch (e) {
      return res.status(503).json({
        error: 'استيراد Excel غير مفعَّل على هذا الخادم (حزمة xlsx غير مثبّتة). '
          + 'ثبّتها بـ npm install، أو أدخل المجمّدين يدويًا من «+ إضافة مجمّد».',
      });
    }

    const buf = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    /* ملفٌ ليس Excel (أو تالف) كان يرمي خطأً داخليًا فيصل للمستخدم
       «حدث خطأ في الخادم» — وهو خطأ ملفِه لا خطأ الخادم. */
    let wb;
    try { wb = XLSX.read(buf, { type: 'buffer', cellDates: true }); }
    catch (e) { return res.status(400).json({ error: 'تعذّرت قراءة الملف — تأكد أنه ملف Excel أو CSV صالح.' }); }
    if (!wb.SheetNames || !wb.SheetNames.length) {
      return res.status(400).json({ error: 'الملف بلا أوراق عمل.' });
    }
    const sheetName = wb.SheetNames.find((n) => n.includes('مجمد')) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    // ابحث عن صف العناوين (يحتوي «الاسم» أو name)
    const headerIdx = rows.findIndex((r) => r.some((c) => /الاسم|name/i.test(String(c))));
    if (headerIdx === -1) return res.status(400).json({ error: 'لم يُعثر على صف العناوين (يجب أن يتضمن «الاسم»).' });
    const headers = rows[headerIdx].map((c) => String(c));

    const findCol = (...patterns) => headers.findIndex((hd) => patterns.some((p) => p.test(hd)));
    const cols = {
      name: findCol(/الاسم|name/i),
      phone: findCol(/جوال|هاتف|موبايل|phone|رقم/i),
      birth: findCol(/ميلاد|birth/i),
      branch: findCol(/فرع|branch/i),
      lastSub: findCol(/آخر اشتراك|اخر اشتراك|last/i),
      freezeDate: findCol(/تاريخ التجميد/i),
      reason: findCol(/سبب/i),
      note: findCol(/ملاحظ/i),
    };

    const branches = await Store.all('branches');
    const fmtDate = (v) => {
      if (!v && v !== 0) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'number' && v > 20000) { // رقم تاريخ Excel
        const d = new Date(Math.round((v - 25569) * 86400000));
        return d.toISOString().slice(0, 10);
      }
      const s = String(v).trim();
      const m = s.match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
      if (!m) return s || null;
      let [, a, bm, c] = m;
      if (a.length === 4) return `${a}-${bm.padStart(2, '0')}-${c.padStart(2, '0')}`;
      return `${c.length === 2 ? '20' + c : c}-${bm.padStart(2, '0')}-${a.padStart(2, '0')}`;
    };

    let imported = 0, skipped = 0;
    const dataRows = rows.slice(headerIdx + 1);
    // سقف صفوف: ملف ضخم كان يُدرَج صفًا صفًا بلا حدّ فيتوقّف الطلب في منتصفه
    const MAX_IMPORT = 5000;
    if (dataRows.length > MAX_IMPORT) {
      return res.status(400).json({ error: `الملف يحوي ${dataRows.length} صفًا — الحدّ ${MAX_IMPORT}. قسّمه إلى ملفات أصغر.` });
    }
    const existing = await Store.all('frozen');
    // بصمة الموجود + ما أُدرج في هذا الملف نفسه — فلا يتكرر صفّان متطابقان
    // داخل الملف، ولا تتكرر إعادة رفع ملف نصفُه مُدرَج مسبقًا
    const seen = new Set(existing.map((f) => `${f.name}\u0000${f.phone || ''}`));
    for (const r of dataRows) {
      const name = String(cols.name >= 0 ? r[cols.name] : '').trim();
      if (!name || /ملاحظة:/.test(name)) { skipped++; continue; }
      const phone = cols.phone >= 0 ? String(r[cols.phone] || '').trim() : '';
      const key = `${name}\u0000${phone}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      const branchText = cols.branch >= 0 ? String(r[cols.branch] || '').trim() : '';
      const branch = branches.find((b) => branchText && (b.name.includes(branchText) || branchText.includes(b.name.replace('فرع ', ''))));

      await Store.insert('frozen', {
        name, phone,
        birthDate: cols.birth >= 0 ? fmtDate(r[cols.birth]) : null,
        branchId: branch ? branch.id : (Number(defaultBranchId) || null),
        branchText: branch ? null : (branchText || null),
        lastSubDate: cols.lastSub >= 0 ? fmtDate(r[cols.lastSub]) : null,
        freezeDate: cols.freezeDate >= 0 ? fmtDate(r[cols.freezeDate]) : null,
        reason: cols.reason >= 0 ? String(r[cols.reason] || '') : '',
        note: cols.note >= 0 ? String(r[cols.note] || '') : '',
        status: 'pending', lastContact: null, importedAt: todayStr(),
      });
      imported++;
    }
    res.json({ imported, skipped, sheet: sheetName });
  }));
};

module.exports.inPeriod = inPeriod;
module.exports.monthInPeriod = monthInPeriod;
module.exports.computeActual = computeActual;
module.exports.effectiveTarget = effectiveTarget;
module.exports.METRIC_LABELS = METRIC_LABELS;
module.exports.METRICS = METRICS;
module.exports.METRIC_GROUPS = METRIC_GROUPS;
module.exports.periodRange = periodRange;

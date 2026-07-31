/* ============================================================
   سبورت باور — مركز القرارات (Action Center)
   الفكرة: لا تكتفِ اللوحة بعرض الأرقام — كل مشكلة يكتشفها النظام
   تتحوّل تلقائيًا إلى «إجراء» له سبب وأولوية ومسؤول وزر تنفيذ مباشر.

   الأولويات:
     urgent    🔴 إجراءات عاجلة   — تحتاج تنفيذًا اليوم
     important 🟡 إجراءات مهمة    — متابعة خلال الأيام القادمة
     improve   🟢 إجراءات تحسين  — ترفع الأداء وليست عاجلة
   ============================================================ */
const Store = require('./store');
const ops = require('./ops');

const monthOf = (d) => (d || '').slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonthStr = () => todayStr().slice(0, 7);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const pct = (part, total) => (total ? Math.round((part / total) * 100) : null);

const PRIORITIES = ['urgent', 'important', 'improve'];
const PRIORITY_LABELS = { urgent: 'عاجل', important: 'مهم', improve: 'تحسين' };

/* عتبات الاكتشاف — تتحكم بها الإدارة من صفحة مركز القرارات */
const THRESHOLD_DEFAULTS = {
  acAbsences: 2,          // عدد الغيابات خلال 30 يومًا قبل إنشاء مهمة تواصل
  acFollowupDays: 3,      // أيام بلا تواصل بعد الغياب قبل إشعار قسم المتابعة
  acRemaining: 2,         // الحصص المتبقية التي تُطلق مهمة التجديد
  acMeasureDays: 14,      // أيام بلا تسجيل قياسات من المدرب
  acProgressWeeks: 4,     // أسابيع بلا تقدّم قبل مراجعة الخطة التدريبية
  acRetentionPct: 70,     // الحد الأدنى لنسبة التجديد في الفرع
  acAbsenceRatePct: 20,   // الحد الأقصى لنسبة الغياب في الفرع
  acAttendancePct: 80,    // الحد الأدنى لنسبة المتدربين النشطين الحاضرين
  acRevenueTolerance: 10, // نسبة التسامح % قبل التنبيه على تأخر التحصيل عن الهدف
};

function readThresholds(settings) {
  const s = settings || {};
  const out = {};
  Object.entries(THRESHOLD_DEFAULTS).forEach(([k, def]) => {
    const v = Number(s[k]);
    out[k] = Number.isFinite(v) && v >= 0 ? v : def;
  });
  return out;
}

const GOAL_LABELS = { loss: 'نزول وزن', muscle: 'زيادة عضل', maintain: 'تثبيت وزن' };

/* صياغة عربية سليمة للأعداد (٣–١٠ جمع، وما فوقها مفرد) — والنصوص محايدة الجنس */
const countLabel = (n, singular, dual, plural) => {
  if (n === 1) return `${singular} واحدة`;
  if (n === 2) return dual;
  if (n <= 10) return `${n} ${plural}`;
  return `${n} ${singular}`;
};
const sessionsLabel = (n) => countLabel(n, 'حصة', 'حصتان', 'حصص');
const absencesLabel = (n) => countLabel(n, 'غياب', 'غيابان', 'غيابات');
const daysLabel = (n) => (n <= 0 ? 'اليوم' : n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يومًا`);

function isMissed(a, nowIso) {
  if (a.status === 'missed') return true;
  return a.status === 'scheduled' && (a.date + 'T' + a.time) < nowIso;
}

/* ============================================================
   بناء قائمة الإجراءات من بيانات النظام
   ============================================================ */
async function buildActions({ branch, subStatus }) {
  const today = todayStr();
  const month = thisMonthStr();

  /* ------------------------------------------------------------
     كل قاعدة اكتشاف تنظر إلى نافذة زمنية محدودة، فنطلب من القاعدة
     تلك النافذة فقط بدل سحب الجداول كاملة:
       المواعيد/الحصص  30 يومًا (الغياب، القياسات، الحضور)
       القياسات        21 يومًا لالتقاط المرشحين، ثم تاريخهم كاملًا
       الدفعات         400 يومًا (ترحيل أهداف التحصيل يعود 12 شهرًا)
       التقييمات       30 يومًا · سجل الإجراءات 180 يومًا
     الجداول المرجعية الصغيرة تُحمَّل كاملة.
     ------------------------------------------------------------ */
  const monthStart = month + '-01';
  const eventFrom = daysAgo(30) < monthStart ? daysAgo(30) : monthStart;

  const [users, branches, subscriptions, targets, settings,
    sessions, appointments, inbodyRecent, payments, subEvents, sessionRatings, actionLog] = await Promise.all([
    Store.all('users'),
    Store.all('branches'),
    Store.all('subscriptions'),
    Store.all('targets'),
    Store.all('settings'),
    Store.find('sessions', { date: { gte: daysAgo(30) } }),
    Store.find('appointments', { date: { gte: eventFrom } }),
    Store.find('inbody', { date: { gte: daysAgo(21) } }),
    Store.find('payments', { date: { gte: daysAgo(400) } }),
    Store.find('subEvents', { date: { gte: monthStart, lte: month + '-31' } }),
    Store.find('sessionRatings', { date: { gte: daysAgo(30) } }),
    Store.find('actionLog', { date: { gte: daysAgo(180) } }),
  ]);

  // تاريخ القياسات الكامل — للمرشحين وحدهم (من لديه قراءة حديثة)
  const candidateIds = [...new Set(inbodyRecent.map((r) => r.traineeId))];
  const inbody = candidateIds.length
    ? await Store.find('inbody', { traineeId: { in: candidateIds } })
    : [];

  const data = { users, branches, subscriptions, targets, settings, sessions, appointments,
    inbody, inbodyRecent, payments, subEvents, sessionRatings, actionLog };

  const TH = readThresholds(data.settings[0]);
  const nowIso = new Date().toISOString().slice(0, 16);
  const inBranch = (x) => !branch || x.branchId === branch;

  const userById = (id) => data.users.find((u) => u.id === id) || {};
  const branchName = (id) => (data.branches.find((b) => b.id === id) || {}).name || '—';
  const trainees = data.users.filter((u) => u.role === 'trainee' && u.active !== false && inBranch(u));
  const scopedBranches = data.branches.filter((b) => !branch || b.id === branch);

  const actions = [];
  const add = (a) => actions.push(a);

  /* روابط تنفيذ جاهزة */
  const waAction = (phone, message, label) => (phone
    ? { kind: 'wa', label: label || 'واتساب', phone, message }
    : null);
  const callAction = (phone) => (phone ? { kind: 'call', label: 'اتصال', phone } : null);
  const link = (label, href) => ({ kind: 'link', label, href });

  /* ============================================================
     🔴 عاجل — متدرب غاب أكثر من مرة → مهمة تواصل
     ============================================================ */
  const missedAppts = data.appointments.filter((a) => inBranch(a) && a.date >= daysAgo(30) && a.date <= today && isMissed(a, nowIso));
  const missedByTrainee = {};
  missedAppts.forEach((a) => { (missedByTrainee[a.traineeId] = missedByTrainee[a.traineeId] || []).push(a); });

  const absenceHandled = new Set();
  Object.entries(missedByTrainee).forEach(([id, list]) => {
    const traineeId = Number(id);
    const trainee = userById(traineeId);
    if (!trainee.id || trainee.active === false) return;
    if (list.length < TH.acAbsences) return;
    const lastMissed = list.map((a) => a.date).sort().pop();
    const trainerNames = [...new Set(list.map((a) => userById(a.trainerId).name).filter(Boolean))];
    const trainerIds = [...new Set(list.map((a) => a.trainerId))];
    absenceHandled.add(traineeId);

    add({
      key: `absence:${traineeId}:${list.length}`,
      type: 'absence', priority: 'urgent',
      title: `تواصل مع ${trainee.name} — ${absencesLabel(list.length)}`,
      reason: `سُجِّل ${absencesLabel(list.length)} خلال آخر 30 يومًا (آخر غياب ${lastMissed}) — الغياب المتكرر أول مؤشر على خسارة المشترك.`,
      suggestion: 'إنشاء مهمة تواصل: اتصل به، افهم سبب الغياب، وأعد جدولة حصته.',
      ownerLabel: `المسؤول: قسم المتابعة${trainerNames.length ? ' + ' + trainerNames.join('، ') : ''}`,
      owner: { type: 'trainee', id: traineeId, name: trainee.name, phone: trainee.phone },
      branchName: branchName(trainee.branchId),
      metrics: [
        { label: 'مرات الغياب', value: String(list.length) },
        { label: 'آخر غياب', value: lastMissed },
      ],
      actions: [
        callAction(trainee.phone),
        waAction(trainee.phone, `مرحبًا ${trainee.name} 👋 افتقدناك في حصصك الأخيرة في سبورت باور 💪 كل شيء تمام؟ خبّرنا لننسّق لك موعدًا جديدًا.`),
        link('فتح ملف المتدرب', `#/trainee/${traineeId}`),
        trainerIds[0] ? { kind: 'task', label: 'إنشاء مهمة تواصل للمدرب', trainerId: trainerIds[0], title: `التواصل مع ${trainee.name} بعد ${absencesLabel(list.length)}` } : null,
      ].filter(Boolean),
    });
  });

  /* ============================================================
     🔴 عاجل — اشتراك بقي له حصتان أو أقل → مهمة تجديد
     ============================================================ */
  data.subscriptions.filter(inBranch).forEach((sub) => {
    const status = subStatus(sub);
    const remaining = sub.totalSessions - sub.usedSessions;
    const daysLeft = daysBetween(today, sub.endDate);
    const lowSessions = status === 'active' && remaining <= TH.acRemaining;
    const endingSoon = status === 'active' && daysLeft >= 0 && daysLeft <= 7;
    if (!lowSessions && !endingSoon && status !== 'expired') return;
    if (status === 'expired' && sub.endDate < daysAgo(45)) return; // اشتراكات قديمة جدًا لا تُزعج اللوحة
    const trainee = userById(sub.traineeId);
    if (!trainee.id || trainee.active === false) return;
    // إن كان له اشتراك فعّال آخر فلا حاجة للتجديد
    const hasOtherActive = data.subscriptions.some((s) => s.traineeId === sub.traineeId && s.id !== sub.id && subStatus(s) === 'active');
    if (hasOtherActive) return;

    const expired = status === 'expired';
    add({
      key: `renew:${sub.id}:${remaining}:${expired ? 'x' : 'a'}`,
      type: 'renewal', priority: 'urgent',
      title: expired
        ? `تجديد اشتراك ${trainee.name} — منتهٍ`
        : lowSessions
          ? `مهمة تجديد: ${trainee.name} — متبقي ${sessionsLabel(remaining)}`
          : `مهمة تجديد: ${trainee.name} — ينتهي خلال ${daysLabel(daysLeft)}`,
      reason: expired
        ? `انتهى الاشتراك بتاريخ ${sub.endDate} ولم يُجدَّد بعد — كل يوم تأخير يقلّل فرصة العودة.`
        : `متبقي ${sessionsLabel(remaining)} من أصل ${sub.totalSessions}${daysLeft >= 0 ? ` والاشتراك ينتهي بعد ${daysLabel(daysLeft)} (${sub.endDate})` : ''} — هذا وقت عرض التجديد.`,
      suggestion: 'إنشاء مهمة تجديد: اعرض عليه الباقة المناسبة وثبّت التجديد قبل انقطاعه.',
      ownerLabel: `المسؤول: المحاسب / الاستقبال — ${branchName(sub.branchId)}`,
      owner: { type: 'trainee', id: sub.traineeId, name: trainee.name, phone: trainee.phone },
      branchName: branchName(sub.branchId),
      metrics: [
        { label: 'الحصص المتبقية', value: String(Math.max(0, remaining)) },
        { label: 'ينتهي في', value: sub.endDate },
        { label: 'الباقة', value: sub.packageName || `${sub.totalSessions} حصة` },
      ],
      actions: [
        callAction(trainee.phone),
        waAction(trainee.phone, expired
          ? `مرحبًا ${trainee.name} 👋 اشتراكك في سبورت باور انتهى — جدّد الآن وكمّل تقدّمك 💪 نعرض عليك الباقة المناسبة لك.`
          : `مرحبًا ${trainee.name} 👋 متبقي لك ${sessionsLabel(remaining)} فقط في سبورت باور — جدّد الآن حتى لا تنقطع نتائجك 💪`),
        link('فتح ملف المتدرب', `#/trainee/${sub.traineeId}`),
        link('فتح ملف التجديد', '#/subscriptions'),
      ].filter(Boolean),
    });
  });

  /* ============================================================
     🔴 عاجل — متدرب غاب ولم يتم التواصل معه بعد → إشعار قسم المتابعة
     ============================================================ */
  Object.entries(missedByTrainee).forEach(([id, list]) => {
    const traineeId = Number(id);
    const trainee = userById(traineeId);
    if (!trainee.id || trainee.active === false) return;
    if (absenceHandled.has(traineeId)) return; // له بطاقة «تواصل بعد الغياب المتكرر» — لا نكرّر
    const lastMissed = list.map((a) => a.date).sort().pop();
    if (daysBetween(lastMissed, today) < TH.acFollowupDays) return;
    // تواصل معتبَر: حصة نُفّذت بعد الغياب، أو موعد جديد بعده، أو إجراء تواصل مُسجَّل
    const attendedAfter = data.sessions.some((s) => s.traineeId === traineeId && s.date > lastMissed);
    const rebooked = data.appointments.some((a) => a.traineeId === traineeId && a.date > today && a.status === 'scheduled');
    const contacted = data.actionLog.some((l) => l.traineeId === traineeId && ['done', 'assigned'].includes(l.status) && (l.date || '') >= lastMissed);
    if (attendedAfter || rebooked || contacted) return;

    add({
      key: `followup:${traineeId}:${lastMissed}`,
      type: 'followup', priority: 'urgent',
      title: `متابعة بعد الغياب: ${trainee.name} — بلا تواصل حتى الآن`,
      reason: `مرّ ${daysLabel(daysBetween(lastMissed, today))} على آخر غياب (${lastMissed}) دون حصة جديدة ولا موعد ولا تواصل مسجَّل.`,
      suggestion: 'إشعار قسم المتابعة: تواصل اليوم وسجّل نتيجة التواصل على الإجراء.',
      ownerLabel: 'المسؤول: قسم المتابعة',
      owner: { type: 'trainee', id: traineeId, name: trainee.name, phone: trainee.phone },
      branchName: branchName(trainee.branchId),
      metrics: [
        { label: 'أيام بلا تواصل', value: String(daysBetween(lastMissed, today)) },
        { label: 'مرات الغياب', value: String(list.length) },
      ],
      actions: [
        callAction(trainee.phone),
        waAction(trainee.phone, `مرحبًا ${trainee.name} 👋 من سبورت باور — بس نطمّن عليك، اشتقنالك بالنادي! متى منشوفك؟ 💪`),
        link('فتح ملف المتدرب', `#/trainee/${traineeId}`),
      ].filter(Boolean),
    });
  });

  /* ============================================================
     🔴 عاجل — تقييم منخفض لحصة من متدرب (خاص بالإدارة)
     ============================================================ */
  data.sessionRatings.forEach((r) => {
    const trainee = userById(r.traineeId);
    if (!trainee.id || !inBranch(trainee)) return;
    if (r.date < daysAgo(30)) return;
    const trainer = userById(r.trainerId);
    const low = r.rating <= 2;
    if (!low && !r.comment) return;
    add({
      key: `rating:${r.id}`,
      type: 'rating', priority: low ? 'urgent' : 'improve',
      title: low
        ? `تقييم منخفض (${r.rating}/5) من ${trainee.name}`
        : `ملاحظة من ${trainee.name} على حصته (${r.rating}/5)`,
      reason: (r.comment ? `كتب: «${r.comment}»` : 'قيّم حصته بدرجة منخفضة دون تعليق.')
        + ` — الحصة مع ${trainer.name || 'مدرب غير محدد'} بتاريخ ${r.date}.`,
      suggestion: low
        ? 'راجع الحصة مع المدرب، وتواصل مع المتدرب لإغلاق الموضوع قبل أن يتحوّل لانسحاب.'
        : 'اقرأ الملاحظة واستفد منها في تحسين تجربة الحصة.',
      ownerLabel: `المسؤول: الإدارة${trainer.name ? ' + ' + trainer.name : ''} (سرّي — لا يظهر للمدرب)`,
      owner: { type: 'trainee', id: r.traineeId, name: trainee.name, phone: trainee.phone },
      branchName: branchName(trainee.branchId),
      metrics: [
        { label: 'التقييم', value: `${r.rating}/5` },
        { label: 'المدرب', value: trainer.name || '—' },
      ],
      actions: [
        callAction(trainee.phone),
        waAction(trainee.phone, `مرحبًا ${trainee.name} 👋 وصلتنا ملاحظتك عن حصتك في سبورت باور، ومهم علينا رأيك. ممكن نسمع منك أكثر لنحسّن التجربة؟`),
        link('فتح ملف المتدرب', `#/trainee/${r.traineeId}`),
        r.trainerId ? link('فتح ملف المدرب', `#/kpi`) : null,
      ].filter(Boolean),
    });
  });

  /* ============================================================
     🟡 مهم — مدرب لم يسجل قياسات لمتدربيه خلال أسبوعين
     ============================================================ */
  const measureCutoff = daysAgo(TH.acMeasureDays);
  for (const trainer of data.users.filter((u) => u.role === 'trainer' && u.active !== false && inBranch(u))) {
    const recentSessions = data.sessions.filter((s) => s.trainerId === trainer.id && s.date >= measureCutoff);
    if (recentSessions.length < 3) continue; // مدرب بلا نشاط يُقاس عليه
    const traineeIds = [...new Set(recentSessions.map((s) => s.traineeId))];
    const readings = data.inbodyRecent.filter((r) => r.date >= measureCutoff && traineeIds.includes(r.traineeId));
    if (readings.length) continue;
    // آخر قراءة لمتدربي هذا المدرب — استعلام واحد موجّه (لا يُنفَّذ إلا عند تحقق القاعدة)
    const lastRow = (await Store.find('inbody', { traineeId: { in: traineeIds } }, { order: [['date', 'desc']], limit: 1 }))[0];
    const lastReading = lastRow ? lastRow.date : undefined;

    add({
      key: `measure:${trainer.id}:${month}`,
      type: 'measurements', priority: 'important',
      title: `قياسات ناقصة: ${trainer.name} — بلا تسجيل منذ ${TH.acMeasureDays} يومًا`,
      reason: `${recentSessions.length} حصة مع ${traineeIds.length} متدربًا خلال آخر ${TH.acMeasureDays} يومًا دون تسجيل أي قراءة InBody`
        + (lastReading ? ` — آخر قراءة للمتدربين كانت ${lastReading}.` : ' — لا توجد أي قراءة سابقة لهؤلاء المتدربين.'),
      suggestion: 'إنشاء مهمة مراجعة للمدرب: جدولة قياسات لكل متدربيه هذا الأسبوع.',
      ownerLabel: `المسؤول: ${trainer.name} — ${branchName(trainer.branchId)}`,
      owner: { type: 'trainer', id: trainer.id, name: trainer.name, phone: trainer.phone },
      branchName: branchName(trainer.branchId),
      metrics: [
        { label: 'حصص الفترة', value: String(recentSessions.length) },
        { label: 'متدربون بلا قياس', value: String(traineeIds.length) },
      ],
      actions: [
        { kind: 'task', label: 'إنشاء مهمة مراجعة للمدرب', trainerId: trainer.id, title: `تسجيل قياسات InBody لكل متدربيك (${traineeIds.length} متدربًا) خلال هذا الأسبوع` },
        callAction(trainer.phone),
        waAction(trainer.phone, `مرحبًا ${trainer.name}، تذكير من الإدارة: لم تُسجَّل قياسات لمتدربيك خلال آخر ${TH.acMeasureDays} يومًا — يرجى جدولتها هذا الأسبوع.`),
        link('فتح ملف المدرب', `#/kpi`),
        link('فتح صفحة القياسات', '#/inbody'),
      ].filter(Boolean),
    });
  }

  /* ============================================================
     🟡 مهم — متدرب بلا تقدّم خلال 4 أسابيع → مراجعة الخطة التدريبية
     ============================================================ */
  const progressDays = TH.acProgressWeeks * 7;
  for (const trainee of trainees) {
    const readings = data.inbody.filter((r) => r.traineeId === trainee.id).sort((a, b) => a.date.localeCompare(b.date));
    if (readings.length < 2) continue;
    const last = readings[readings.length - 1];
    const base = readings.filter((r) => daysBetween(r.date, last.date) >= progressDays).pop();
    if (!base) continue;
    if (daysBetween(last.date, today) > 21) continue; // قراءة قديمة جدًا — تُعالجها قاعدة القياسات

    const dWeight = last.weight != null && base.weight != null ? +(last.weight - base.weight).toFixed(1) : null;
    const dFat = last.bodyFatPct != null && base.bodyFatPct != null ? +(last.bodyFatPct - base.bodyFatPct).toFixed(1) : null;
    const dMuscle = last.muscleMass != null && base.muscleMass != null ? +(last.muscleMass - base.muscleMass).toFixed(1) : null;

    let improved;
    if (trainee.goal === 'muscle') improved = (dMuscle != null && dMuscle > 0.3) || (dWeight != null && dWeight > 0.5 && (dFat == null || dFat <= 0));
    else if (trainee.goal === 'maintain') improved = (dFat != null && dFat < -0.5) || (dMuscle != null && dMuscle > 0.3);
    else improved = (dWeight != null && dWeight < -0.5) || (dFat != null && dFat < -0.5);
    if (improved) continue;

    const changes = [
      dWeight != null ? `الوزن ${dWeight > 0 ? '+' : ''}${dWeight} كغ` : null,
      dFat != null ? `الدهون ${dFat > 0 ? '+' : ''}${dFat}%` : null,
      dMuscle != null ? `العضل ${dMuscle > 0 ? '+' : ''}${dMuscle} كغ` : null,
    ].filter(Boolean).join(' · ');
    const sessionsCount = await Store.count('sessions', { traineeId: trainee.id, date: { gte: base.date } });

    add({
      key: `progress:${trainee.id}:${last.date}`,
      type: 'progress', priority: 'important',
      title: `${trainee.name} بلا تقدّم منذ ${TH.acProgressWeeks} أسابيع — مراجعة الخطة`,
      reason: `بين قراءتَي ${base.date} و${last.date} (${daysLabel(daysBetween(base.date, last.date))}): ${changes || 'لا تغيّر مسجَّل'} — والهدف ${GOAL_LABELS[trainee.goal] || '—'}.`,
      suggestion: 'مراجعة الخطة التدريبية والغذائية مع المدرب والأخصائية، وتعديل الأحمال أو السعرات.',
      ownerLabel: 'المسؤول: المدرب + أخصائية التغذية',
      owner: { type: 'trainee', id: trainee.id, name: trainee.name, phone: trainee.phone },
      branchName: branchName(trainee.branchId),
      metrics: [
        { label: 'حصص الفترة', value: String(sessionsCount) },
        { label: 'التغيّر', value: changes || '—' },
      ],
      actions: [
        link('فتح ملف المتدرب', `#/trainee/${trainee.id}`),
        link('مراجعة الخطة الغذائية', '#/meals'),
        waAction(trainee.phone, `مرحبًا ${trainee.name} 👋 راجعنا قياساتك في سبورت باور ونحبّ نعدّل خطتك التدريبية لنتائج أسرع — متى يناسبك نلتقي؟`),
      ].filter(Boolean),
    });
  }

  /* ============================================================
     🟡 مهم — انخفاض نسبة التجديد في فرع عن الهدف
     ============================================================ */
  scopedBranches.forEach((b) => {
    const ev = data.subEvents.filter((e) => e.branchId === b.id && monthOf(e.date) === month);
    const renewals = ev.filter((e) => e.type === 'renewal').length;
    const ended = data.subscriptions.filter((s) => s.branchId === b.id && monthOf(s.endDate) === month && s.status !== 'cancelled').length;
    if (ended < 2) return;
    const rate = pct(renewals, ended);
    if (rate === null || rate >= TH.acRetentionPct) return;

    add({
      key: `retention:${b.id}:${month}`,
      type: 'retention', priority: 'important',
      title: `${b.name}: نسبة التجديد ${rate}% دون الهدف (${TH.acRetentionPct}%)`,
      reason: `جدّد ${renewals} من أصل ${ended} اشتراكًا انتهى هذا الشهر — الفجوة ${TH.acRetentionPct - rate} نقطة عن الهدف.`,
      suggestion: 'تنبيه للإدارة: راجع أسباب عدم التجديد (السعر/المدرب/النتائج) وأطلق حملة تجديد للفرع.',
      ownerLabel: `المسؤول: مدير الفرع — ${b.name}`,
      owner: { type: 'branch', id: b.id, name: b.name, phone: b.phone },
      branchName: b.name,
      metrics: [
        { label: 'نسبة التجديد', value: rate + '%' },
        { label: 'جدّدوا', value: `${renewals}/${ended}` },
      ],
      actions: [
        link('فتح ملف التجديد', '#/subscriptions'),
        link('تقرير النمو وأسباب الإلغاء', '#/reports'),
        link('قائمة المجمدين للاسترجاع', '#/frozen'),
      ],
    });
  });

  /* ============================================================
     🟢 تحسين — ارتفاع نسبة الغياب في فرع
     ============================================================ */
  scopedBranches.forEach((b) => {
    const appts = data.appointments.filter((a) => a.branchId === b.id && monthOf(a.date) === month && a.date <= today);
    if (appts.length < 4) return;
    const missed = appts.filter((a) => isMissed(a, nowIso)).length;
    const rate = pct(missed, appts.length);
    if (rate === null || rate <= TH.acAbsenceRatePct) return;

    add({
      key: `absrate:${b.id}:${month}`,
      type: 'absence-rate', priority: 'improve',
      title: `${b.name}: نسبة الغياب ${rate}% هذا الشهر`,
      reason: `${missed} غيابًا من أصل ${appts.length} موعدًا — الحد المقبول ${TH.acAbsenceRatePct}%.`,
      suggestion: 'فعّل التذكير قبل الحصة بيوم، وراجع مواعيد الذروة وتوزيع المدربين.',
      ownerLabel: `المسؤول: مدير الفرع — ${b.name}`,
      owner: { type: 'branch', id: b.id, name: b.name, phone: b.phone },
      branchName: b.name,
      metrics: [
        { label: 'نسبة الغياب', value: rate + '%' },
        { label: 'الغيابات', value: `${missed}/${appts.length}` },
      ],
      actions: [
        link('المتابعة اليومية', '#/daily'),
        link('التقويم والمواعيد', '#/calendar'),
      ],
    });
  });

  /* ============================================================
     🟢 تحسين — انخفاض التحصيل عن الهدف اليومي
     ============================================================ */
  const dayNum = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const revenueTargets = data.targets.filter((t) => t.metric === 'revenue' && t.period === month
    && (branch ? (t.scope === 'branch' && t.refId === branch) : ['company', 'branch'].includes(t.scope)));

  revenueTargets.forEach((t) => {
    const effective = ops.effectiveTarget(t, data.targets, data, subStatus) || t.value;
    if (!effective) return;
    const actual = ops.computeActual(t, { ...data, subStatus }) || 0;
    const dailyTarget = Math.round(effective / daysInMonth);
    const expected = Math.round(dailyTarget * dayNum);
    if (actual >= expected * (1 - TH.acRevenueTolerance / 100)) return;

    const scopeName = t.scope === 'company' ? 'الشركة كاملة' : branchName(t.refId);
    const todayCollected = data.payments
      .filter((p) => p.date === today)
      .filter((p) => {
        if (t.scope !== 'branch') return true;
        const sub = data.subscriptions.find((s) => s.id === p.subscriptionId) || {};
        return sub.branchId === t.refId;
      })
      .reduce((s, p) => s + p.amount, 0);

    add({
      key: `revenue:${t.scope}:${t.refId || 'all'}:${today}`,
      type: 'revenue', priority: 'improve',
      title: `${scopeName}: التحصيل متأخر عن الهدف اليومي`,
      reason: `الهدف اليومي ${dailyTarget} — المتوقع حتى اليوم ${expected} والمحصّل فعليًا ${actual} (تحصيل اليوم ${todayCollected}). الفجوة ${expected - actual}.`,
      suggestion: 'تنبيه للإدارة: تابع الدفعات المتأخرة اليوم واعرض التجديدات المستحقة، وراجع سبب الانخفاض.',
      ownerLabel: `المسؤول: المحاسب — ${scopeName}`,
      owner: { type: 'branch', id: t.refId || null, name: scopeName, phone: null },
      branchName: scopeName,
      metrics: [
        { label: 'الهدف اليومي', value: String(dailyTarget), money: true },
        { label: 'المحصّل حتى اليوم', value: String(actual), money: true },
        { label: 'الفجوة', value: String(expected - actual), money: true },
      ],
      actions: [
        link('اللوحة المالية', '#/accountant'),
        link('المتابعة اليومية', '#/daily'),
        link('الأهداف وKPI', '#/kpi'),
      ],
    });
  });

  /* ============================================================
     🟢 تحسين — انخفاض معدل حضور المتدربين
     ============================================================ */
  scopedBranches.forEach((b) => {
    const activeIds = [...new Set(data.subscriptions
      .filter((s) => s.branchId === b.id && subStatus(s) === 'active')
      .map((s) => s.traineeId))];
    if (activeIds.length < 3) return;
    const cutoff = daysAgo(14);
    const attended = activeIds.filter((id) => data.sessions.some((s) => s.traineeId === id && s.date >= cutoff));
    const rate = pct(attended.length, activeIds.length);
    if (rate === null || rate >= TH.acAttendancePct) return;
    const idle = activeIds.filter((id) => !attended.includes(id)).map((id) => userById(id).name).filter(Boolean);

    add({
      key: `attend:${b.id}:${today}`,
      type: 'attendance', priority: 'improve',
      title: `${b.name}: معدل حضور المتدربين ${rate}% خلال أسبوعين`,
      reason: `${attended.length} من ${activeIds.length} مشتركًا فعّالًا فقط حضروا حصة خلال آخر 14 يومًا`
        + (idle.length ? ` — بينهم بلا حضور: ${idle.slice(0, 6).join('، ')}${idle.length > 6 ? ` و${idle.length - 6} آخرين` : ''}.` : '.'),
      suggestion: 'أطلق حملة تنشيط: تواصل مع غير الحاضرين وحجز مواعيد لهم هذا الأسبوع.',
      ownerLabel: `المسؤول: قسم المتابعة — ${b.name}`,
      owner: { type: 'branch', id: b.id, name: b.name, phone: b.phone },
      branchName: b.name,
      metrics: [
        { label: 'معدل الحضور', value: rate + '%' },
        { label: 'بلا حضور', value: String(activeIds.length - attended.length) },
      ],
      actions: [
        link('المتابعة اليومية', '#/daily'),
        link('قائمة المتدربين', '#/subscriptions'),
      ],
    });
  });

  /* ============================================================
     دمج حالة الإجراء (منفَّذ / مؤجَّل / مُسنَد) وترتيب النتائج
     ============================================================ */
  const logByKey = {};
  data.actionLog.forEach((l) => {
    const prev = logByKey[l.key];
    if (!prev || l.id > prev.id) logByKey[l.key] = l;
  });

  const priorityOrder = { urgent: 0, important: 1, improve: 2 };
  const enriched = actions.map((a) => {
    const log = logByKey[a.key];
    const snoozed = log && log.status === 'snoozed' && (log.snoozeUntil || '') > today;
    return {
      ...a,
      priorityLabel: PRIORITY_LABELS[a.priority],
      status: log ? (snoozed ? 'snoozed' : log.status) : 'open',
      note: log ? log.note || '' : '',
      handledBy: log ? (userById(log.byId).name || null) : null,
      handledAt: log ? log.date : null,
      snoozeUntil: log && log.status === 'snoozed' ? log.snoozeUntil : null,
    };
  }).sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority]) || a.title.localeCompare(b.title, 'ar'));

  const open = enriched.filter((a) => a.status === 'open');
  const summary = {
    urgent: open.filter((a) => a.priority === 'urgent').length,
    important: open.filter((a) => a.priority === 'important').length,
    improve: open.filter((a) => a.priority === 'improve').length,
    handled: enriched.length - open.length,
    total: enriched.length,
  };

  return { date: today, month, branch: branch || null, thresholds: TH, summary, actions: enriched };
}

/* ============================================================
   المسارات
   ============================================================ */
module.exports = function registerActions(app, { auth, requireRole, h, notify, subStatus }) {
  app.get('/api/action-center', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const branch = req.query.branch ? Number(req.query.branch) : null;
    const result = await buildActions({ branch, subStatus });
    if (req.query.status === 'open') result.actions = result.actions.filter((a) => a.status === 'open');
    res.json(result);
  }));

  /* تسجيل تنفيذ إجراء: نُفّذ / أُجّل / أُعيد فتحه */
  app.post('/api/action-center/resolve', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const key = String(req.body.key || '').slice(0, 120);
    const status = req.body.status;
    if (!key) return res.status(400).json({ error: 'مُعرّف الإجراء مطلوب.' });
    if (!['done', 'snoozed', 'open', 'assigned'].includes(status)) {
      return res.status(400).json({ error: 'الحالة: done أو snoozed أو assigned أو open.' });
    }
    const entry = {
      key, status,
      note: String(req.body.note || '').slice(0, 500),
      type: String(req.body.type || '').slice(0, 40),
      title: String(req.body.title || '').slice(0, 200),
      priority: PRIORITIES.includes(req.body.priority) ? req.body.priority : null,
      traineeId: Number(req.body.traineeId) || null,
      trainerId: Number(req.body.trainerId) || null,
      branchId: Number(req.body.branchId) || null,
      byId: req.user.id, date: todayStr(),
      snoozeUntil: status === 'snoozed'
        ? new Date(Date.now() + (Math.min(Math.max(Number(req.body.snoozeDays) || 3, 1), 60)) * 86400000).toISOString().slice(0, 10)
        : null,
    };
    res.json(await Store.insert('actionLog', entry));
  }));

  /* تحويل إجراء إلى مهمة رسمية لمدرب — «كل مشكلة تتحول لمهمة» */
  app.post('/api/action-center/task', auth, requireRole('admin'), h(async (req, res) => {
    const trainer = await Store.get('users', Number(req.body.trainerId));
    if (!trainer || trainer.role !== 'trainer') return res.status(400).json({ error: 'المدرب غير موجود.' });
    const title = String(req.body.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'عنوان المهمة مطلوب.' });
    const date = req.body.date || todayStr();
    const task = await Store.insert('tasks', {
      trainerId: trainer.id, title, type: 'daily', date, month: monthOf(date),
      status: 'pending', createdBy: req.user.id, fromAction: String(req.body.key || '').slice(0, 120) || null,
    });
    await notify(trainer.id, `مهمة جديدة من مركز القرارات: «${title}» (يوم ${date}).`, 'task');
    if (req.body.key) {
      await Store.insert('actionLog', {
        key: String(req.body.key).slice(0, 120), status: 'assigned',
        note: `أُسندت مهمة لـ ${trainer.name}: ${title}`,
        trainerId: trainer.id, byId: req.user.id, date: todayStr(), snoozeUntil: null,
      });
    }
    res.json(task);
  }));

  /* سجل الإجراءات المنفَّذة — من نفّذ، ومتى، وبأي ملاحظة */
  app.get('/api/action-center/log', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { actionLog, users } = await Store.load('actionLog', 'users');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '—';
    res.json(actionLog
      .map((l) => ({ ...l, byName: nameOf(l.byId) }))
      .sort((a, b) => b.id - a.id)
      .slice(0, 120));
  }));

  /* عتبات الاكتشاف — يضبطها المدير ليناسب النظام سياسة الشركة */
  app.put('/api/action-center/thresholds', auth, requireRole('admin'), h(async (req, res) => {
    const patch = {};
    Object.keys(THRESHOLD_DEFAULTS).forEach((k) => {
      if (req.body[k] !== undefined && req.body[k] !== '') {
        const v = Number(req.body[k]);
        if (Number.isFinite(v) && v >= 0) patch[k] = v;
      }
    });
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'لا شيء لتعديله.' });
    const rows = await Store.all('settings');
    const saved = rows[0]
      ? await Store.update('settings', rows[0].id, patch)
      : await Store.insert('settings', { currency: 'ILS', ...patch });
    res.json(readThresholds(saved));
  }));
};

module.exports.buildActions = buildActions;
module.exports.THRESHOLD_DEFAULTS = THRESHOLD_DEFAULTS;
module.exports.PRIORITY_LABELS = PRIORITY_LABELS;

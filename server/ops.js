/* ============================================================
   سبورت باور — وحدة التشغيل والمتابعة
   المتابعة اليومية للمدرب، المهام، الأهداف وKPI،
   لوحة المتابعة اليومية، سجل المجمدين (استيراد Excel + واتساب)
   ============================================================ */
const Store = require('./store');

const monthOf = (d) => (d || '').slice(0, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);
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

/* هل الشهر مشمول بالفترة؟ (لاحتساب KPI الشهري من أهداف نصف سنوية/سنوية) */
function monthInPeriod(period, month) {
  return inPeriod(period, month + '-15');
}

const hoursOf = (sessions) => new Set(sessions.map((s) => `${s.trainerId}|${s.date}|${s.time.slice(0, 2)}`)).size;

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

const METRIC_LABELS = {
  revenue: 'التحصيل',
  sessions: 'عدد الحصص',
  uniqueTrainees: 'متدربون فريدون',
  newSubs: 'اشتراكات جديدة/تجديد',
  activeTrainees: 'المتدربون الفعالون',
};

/* القيمة الفعلية لهدفٍ ما */
function computeActual(t, { payments, sessions, subscriptions, subEvents, subStatus }) {
  const scopeBranch = (branchId) => t.scope !== 'branch' || branchId === t.refId;
  const scopeTrainer = (trainerId) => t.scope !== 'trainer' || trainerId === t.refId;
  switch (t.metric) {
    case 'revenue': {
      const subBranch = (p) => (subscriptions.find((s) => s.id === p.subscriptionId) || {}).branchId;
      return payments.filter((p) => inPeriod(t.period, p.date) && scopeBranch(subBranch(p)))
        .reduce((sum, p) => sum + p.amount, 0);
    }
    case 'sessions':
      return sessions.filter((s) => inPeriod(t.period, s.date) && scopeBranch(s.branchId) && scopeTrainer(s.trainerId)).length;
    case 'uniqueTrainees':
      return new Set(sessions.filter((s) => inPeriod(t.period, s.date) && scopeBranch(s.branchId) && scopeTrainer(s.trainerId))
        .map((s) => s.traineeId)).size;
    case 'newSubs':
      return subEvents.filter((e) => ['new', 'renewal'].includes(e.type) && inPeriod(t.period, e.date) && scopeBranch(e.branchId)).length;
    case 'activeTrainees':
      return new Set(subscriptions.filter((s) => subStatus(s) === 'active' && scopeBranch(s.branchId)).map((s) => s.traineeId)).size;
    default: return null;
  }
}

module.exports = function registerOps(app, { auth, requireRole, h, notify, subStatus }) {
  /* ============================================================
     أولًا: المتابعة اليومية للمدرب (حضور/انصراف + إنتاج المحتوى)
     ============================================================ */
  app.get('/api/trainer-logs', auth, h(async (req, res) => {
    let logs = await Store.all('trainerLogs');
    if (req.user.role === 'trainer') logs = logs.filter((l) => l.trainerId === req.user.id);
    else if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
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
  app.get('/api/targets', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const data = await Store.load('targets', 'payments', 'sessions', 'subscriptions', 'subEvents', 'users', 'branches');
    let targets = data.targets;
    if (req.query.period) targets = targets.filter((t) => t.period === req.query.period);
    res.json(targets.map((t) => {
      const actual = computeActual(t, { ...data, subStatus });
      const refName = t.scope === 'branch'
        ? (data.branches.find((b) => b.id === t.refId) || {}).name
        : t.scope === 'trainer'
          ? (data.users.find((u) => u.id === t.refId) || {}).name
          : 'الشركة كاملة';
      return { ...t, actual, pct: t.value ? Math.round((actual / t.value) * 100) : null, refName, metricLabel: METRIC_LABELS[t.metric] || t.metric };
    }));
  }));

  app.post('/api/targets', auth, requireRole('admin'), h(async (req, res) => {
    const { scope, refId, metric, period, value } = req.body;
    if (!['company', 'branch', 'trainer'].includes(scope)) return res.status(400).json({ error: 'نطاق غير صحيح.' });
    if (!METRIC_LABELS[metric]) return res.status(400).json({ error: 'مؤشر غير مدعوم.' });
    if (!/^\d{4}(-\d{2}|-H1|-H2)?$/.test(period || '')) return res.status(400).json({ error: 'صيغة الفترة: YYYY-MM أو YYYY-H1/H2 أو YYYY.' });
    if (!value || Number(value) <= 0) return res.status(400).json({ error: 'قيمة الهدف مطلوبة.' });

    const all = await Store.all('targets');
    const dup = all.find((t) => t.scope === scope && t.refId === (Number(refId) || null) && t.metric === metric && t.period === period);
    const body = { scope, refId: scope === 'company' ? null : Number(refId), metric, period, value: Number(value) };
    const saved = dup ? await Store.update('targets', dup.id, body) : await Store.insert('targets', body);
    res.json(saved);
  }));

  app.delete('/api/targets/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('targets', req.params.id);
    res.json({ ok: true });
  }));

  /* ============================================================
     KPI — تلقائي لكل موظف: (المهام + الأهداف) والنتائج
     ============================================================ */
  async function computeKpis(month) {
    const data = await Store.load('users', 'tasks', 'targets', 'payments', 'sessions', 'subscriptions', 'subEvents');
    const trainers = data.users.filter((u) => u.role === 'trainer' && u.active !== false);
    return trainers.map((t) => {
      const myTasks = data.tasks.filter((x) => x.trainerId === t.id
        && ((x.type === 'daily' && monthOf(x.date) === month) || (x.type === 'monthly' && x.month === month)));
      const tasksPct = myTasks.length ? Math.round((myTasks.filter((x) => x.status === 'done').length / myTasks.length) * 100) : null;

      const myTargets = data.targets.filter((x) => x.scope === 'trainer' && x.refId === t.id && monthInPeriod(x.period, month));
      const targetPcts = myTargets.map((x) => {
        const actual = computeActual(x, { ...data, subStatus });
        return Math.min(Math.round((actual / x.value) * 100), 120);
      });
      const targetsPct = targetPcts.length ? Math.round(targetPcts.reduce((a, b) => a + b, 0) / targetPcts.length) : null;

      const parts = [tasksPct, targetsPct].filter((v) => v !== null);
      const kpi = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

      const monthSessions = data.sessions.filter((s) => s.trainerId === t.id && monthOf(s.date) === month);
      return {
        trainerId: t.id, name: t.name, branchId: t.branchId,
        tasksTotal: myTasks.length, tasksDone: myTasks.filter((x) => x.status === 'done').length,
        tasksPct, targetsPct, kpi,
        sessions: monthSessions.length,
        hours: hoursOf(monthSessions),
        uniqueTrainees: new Set(monthSessions.map((s) => s.traineeId)).size,
      };
    });
  }

  app.get('/api/kpi', auth, h(async (req, res) => {
    const month = req.query.month || thisMonthStr();
    const kpis = await computeKpis(month);
    if (req.user.role === 'trainer') return res.json(kpis.filter((k) => k.trainerId === req.user.id));
    if (!['admin', 'accountant'].includes(req.user.role)) return res.status(403).json({ error: 'ليست لديك صلاحية.' });
    res.json(kpis);
  }));

  /* ============================================================
     ثانيًا: لوحة المتابعة اليومية
     ============================================================ */
  app.get('/api/daily', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const date = req.query.date || todayStr();
    const nowIso = new Date().toISOString().slice(0, 16).replace('T', 'T');
    const data = await Store.load('payments', 'subscriptions', 'subEvents', 'sessions', 'appointments', 'users', 'branches', 'trainerLogs', 'tasks', 'notifications');

    // التحصيل اليومي لكل فرع
    const branchRows = data.branches.map((b) => {
      const subIds = data.subscriptions.filter((s) => s.branchId === b.id).map((s) => s.id);
      const dayPays = data.payments.filter((p) => p.date === date && subIds.includes(p.subscriptionId));
      const ev = data.subEvents.filter((e) => e.date === date && e.branchId === b.id);
      return {
        branchId: b.id, branch: b.name,
        collected: dayPays.reduce((s, p) => s + p.amount, 0),
        newSubs: ev.filter((e) => e.type === 'new').length,
        renewals: ev.filter((e) => e.type === 'renewal').length,
        freezes: ev.filter((e) => e.type === 'freeze').length,
        cancels: ev.filter((e) => e.type === 'cancel').length,
        returns: ev.filter((e) => e.type === 'unfreeze').length,
        sessions: data.sessions.filter((s) => s.date === date && s.branchId === b.id).length,
      };
    });

    // حضور وغياب اليوم
    const dayAppts = data.appointments.filter((a) => a.date === date);
    const attendance = {
      sessions: data.sessions.filter((s) => s.date === date).length,
      uniqueTrainees: new Set(data.sessions.filter((s) => s.date === date).map((s) => s.traineeId)).size,
      scheduled: dayAppts.length,
      done: dayAppts.filter((a) => a.status === 'done').length,
      missed: dayAppts.filter((a) => isMissed(a, nowIso)).length,
    };

    // من غاب أكثر من مرة خلال 30 يومًا → تنبيه للإدارة ومدرب الحصص
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const missedByTrainee = {};
    data.appointments.filter((a) => a.date >= cutoff && a.date <= date && isMissed(a, nowIso))
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
    for (const a of absentees) {
      const text = `تنبيه غياب: ${a.name} غاب عن ${a.missed} حصص — يُرجى التواصل معه.`;
      if (admin && !data.notifications.some((n) => n.userId === admin.id && n.text === text)) {
        await Store.insert('notifications', { userId: admin.id, text, date, read: false, type: 'absence' });
      }
      for (const tid of a.trainerIds) {
        if (!data.notifications.some((n) => n.userId === tid && n.text === text)) {
          await Store.insert('notifications', { userId: tid, text, date, read: false, type: 'absence' });
        }
      }
    }

    // سجلات المدربين اليومية + إحصاءاتهم التلقائية + مهام اليوم
    const trainers = data.users.filter((u) => u.role === 'trainer' && u.active !== false);
    const trainerRows = trainers.map((t) => {
      const log = data.trainerLogs.find((l) => l.trainerId === t.id && l.date === date) || {};
      const ds = data.sessions.filter((s) => s.trainerId === t.id && s.date === date);
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

    res.json({
      date,
      totals: {
        collected: branchRows.reduce((s, b) => s + b.collected, 0),
        newSubs: branchRows.reduce((s, b) => s + b.newSubs, 0),
        renewals: branchRows.reduce((s, b) => s + b.renewals, 0),
        freezes: branchRows.reduce((s, b) => s + b.freezes, 0),
        cancels: branchRows.reduce((s, b) => s + b.cancels, 0),
        returns: branchRows.reduce((s, b) => s + b.returns, 0),
      },
      branches: branchRows, attendance, absentees, trainerRows,
    });
  }));

  /* ============================================================
     رابعًا: سجل المجمدين — استيراد Excel + متابعة + واتساب
     ============================================================ */
  const FROZEN_STATUSES = ['pending', 'contacted', 'replied', 'no-reply', 'returned'];

  app.get('/api/frozen', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { frozen, branches } = await Store.load('frozen', 'branches');
    res.json(frozen.map((f) => ({ ...f, branchName: f.branchId ? (branches.find((b) => b.id === f.branchId) || {}).name : f.branchText || '—' })));
  }));

  app.post('/api/frozen', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const { name, phone, birthDate, branchId, lastSubDate, reason } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب.' });
    res.json(await Store.insert('frozen', {
      name, phone: phone || '', birthDate: birthDate || null, branchId: Number(branchId) || null,
      branchText: null, lastSubDate: lastSubDate || null, freezeDate: todayStr(), reason: reason || '',
      status: 'pending', lastContact: null, note: '', importedAt: todayStr(),
    }));
  }));

  app.put('/api/frozen/:id', auth, requireRole('admin', 'accountant'), h(async (req, res) => {
    const row = await Store.get('frozen', req.params.id);
    if (!row) return res.status(404).json({ error: 'السجل غير موجود.' });
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
    let XLSX;
    try { XLSX = require('xlsx'); }
    catch (e) { return res.status(500).json({ error: 'محلل Excel غير مثبت.' }); }

    const buf = Buffer.from(fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
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
    const existing = await Store.all('frozen');
    for (const r of rows.slice(headerIdx + 1)) {
      const name = String(cols.name >= 0 ? r[cols.name] : '').trim();
      if (!name || /ملاحظة:/.test(name)) { skipped++; continue; }
      const phone = cols.phone >= 0 ? String(r[cols.phone] || '').trim() : '';
      if (existing.some((f) => f.name === name && f.phone === phone)) { skipped++; continue; }

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

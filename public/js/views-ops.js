/* التشغيل والمتابعة: المتابعة اليومية، الأهداف وKPI، المجمدون، وبطاقات المدرب اليومية */

const FROZEN_STATUS_LABELS = {
  pending: 'بانتظار التواصل', contacted: 'تم التواصل', replied: 'ردّ',
  'no-reply': 'لم يرد', returned: 'عاد للاشتراك',
};
/* قائمة المؤشرات ونطاقاتها تأتي من الخادم (/api/targets/metrics) فلا
   تتفرّع نسختان تختلفان: هناك يُحسب المؤشر وهنا يُعرض. تُجلب مرة واحدة
   لكل جلسة، وهذه نسخة احتياطية إن تعذّر الجلب. */
let METRICS_CACHE = null;
const METRICS_FALLBACK = {
  groups: [{ key: 'money', label: 'مال وتحصيل' }, { key: 'training', label: 'تدريب' }],
  metrics: [
    { key: 'revenue', label: 'التحصيل', group: 'money', scopes: ['company', 'branch', 'user'], money: true },
    { key: 'sessions', label: 'عدد الحصص', group: 'training', scopes: ['company', 'branch', 'trainer', 'user'] },
  ],
};
async function loadMetrics() {
  if (METRICS_CACHE) return METRICS_CACHE;
  try {
    const r = await API.get('/api/targets/metrics');
    // توافقٌ مع نسخة أقدم من الخادم كانت تُعيد مصفوفة لا كائنًا
    METRICS_CACHE = Array.isArray(r) ? { groups: [], metrics: r } : r;
  } catch (e) { METRICS_CACHE = METRICS_FALLBACK; }
  return METRICS_CACHE;
}
/* اسمُ مؤشرٍ أيًّا كان — بما فيه المؤشرات المتوقّفة عن العرض */
const metricMeta = (key) => ((METRICS_CACHE && METRICS_CACHE.metrics) || []).find((m) => m.key === key) || null;

const SCOPE_LABELS = {
  company: 'الشركة كاملة', branch: 'فرع', trainer: 'مدرب', user: 'موظف (محاسبة/مبيعات/…)',
};
const STAFF_ROLE_LABELS = { admin: 'إدارة', accountant: 'محاسبة', trainer: 'مدرب', nutritionist: 'تغذية' };

/* ============================================================
   تغطية الأهداف التدريبية
   «ببين عندي مين من المشتركين ما انعملو هدف تدريبي» — والرقم المهم ليس
   عدد الأهداف بل من بقي بلا هدف، فهو العمل الذي لم يُنجَز بعد.
   ============================================================ */
async function goalCoverageCard(month) {
  let cov;
  try { cov = await API.get('/api/trainee-goals/coverage?month=' + month); }
  catch (e) { return el('span'); }
  const t = cov.totals;
  const card = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `الأهداف التدريبية — تغطية المشتركين (${month})`),
    el('div', { class: 'kpis', style: 'margin-bottom:10px' },
      kpiTile(t.activeTrainees, 'مشترك فعّال', 'users'),
      kpiTile(t.withGoal, 'له هدف تدريبي', 'target', t.missing ? undefined : 'accent'),
      kpiTile(t.missing, 'بلا هدف', 'alert', t.missing ? 'danger' : undefined),
      kpiTile(t.goalsThisMonth, 'أهداف وُضعت هذا الشهر', 'compass')));
  if (t.coveragePct !== null) card.append(progressBar(t.coveragePct));

  if (cov.missing.length) {
    card.append(
      el('div', { style: 'margin:12px 0 6px;font-size:13px;color:var(--app-muted)' },
        'هؤلاء يشتركون فعليًا ولا خطة مقاسة لهم — الهدف يُوضع من ملف كلٍّ منهم:'),
      pagedTable(['المشترك', 'الفرع', 'هدفه المعلن', 'آخر من درّبه', ''],
        cov.missing,
        (m) => [
          el('a', { href: '#/trainee/' + m.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, m.name),
          m.branchName, m.goalLabel || '—', m.lastTrainerName || '—',
          el('a', { class: 'btn btn--accent btn--sm', href: '#/trainee/' + m.traineeId }, 'وضع الهدف ←')],
        { pageSize: 8, searchText: (m) => `${m.name} ${m.branchName}`, searchPlaceholder: 'ابحث بالاسم أو الفرع…' }));
  } else {
    card.append(el('div', { class: 'alert alert--info', style: 'margin:12px 0 0' },
      '✅ كل المشتركين الفعّالين لهم أهداف تدريبية.'));
  }

  if (cov.byTrainer.length) {
    card.append(el('h4', { style: 'margin:16px 0 6px;font-size:13px;color:var(--app-muted)' }, 'أهداف وضعها كل مدرب هذا الشهر'),
      dataTable(['المدرب', 'عدد الأهداف'],
        cov.byTrainer.map((x) => [x.name,
          el('b', { class: 'num', style: x.goalsThisMonth ? 'color:var(--accent-hover)' : 'color:var(--app-muted)' },
            String(x.goalsThisMonth))])));
  }
  return card;
}

/* تحصيل اليوم مفصَّلًا بالعملة — فروعٌ بعملتين لا يُجمع تحصيلها في رقم */
function dailyByCurrency(data) {
  const out = {};
  (data.branches || []).forEach((b) => {
    const c = branchCurrency(b.branchId);
    out[c] = Math.round(((out[c] || 0) + Number(b.collected || 0)) * 100) / 100;
  });
  return out;
}

/* ============================================================
   لوحة المتابعة اليومية (الإدارة/المحاسب)
   ============================================================ */
async function viewDaily(root) {
  // «المتابعة اليومية اختار الفرع الي بدي اتابعه»
  const state = urlState({ date: todayISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);
  const branches = await API.get('/api/branches').catch(() => []);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const branchQ = state.branch ? '&branch=' + state.branch : '';
    const [data, trainers] = await Promise.all([
      API.get('/api/daily?date=' + state.date + branchQ),
      API.user.role === 'admin' ? API.get('/api/users?role=trainer') : Promise.resolve([]),
    ]);
    const tasks = API.user.role === 'admin' || API.user.role === 'accountant'
      ? await API.get('/api/tasks?month=' + state.date.slice(0, 7)) : [];
    container.innerHTML = '';

    const dateIn = input({ type: 'date', value: state.date, onchange: (e) => { state.date = e.target.value; render(); } });
    const bar = el('div', { class: 'card filters' }, field('اليوم', dateIn));
    // فرعٌ واحد لا يحتاج منتقيًا — المحاسب المقيَّد بفرعٍ يرى فرعه وحده
    if (branches.length > 1) {
      bar.append(field('الفرع', select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
        value: state.branch, style: 'width:180px',
        onchange: (e) => { state.branch = e.target.value; render(); },
      })));
    }
    if (API.user.role === 'admin') {
      bar.append(el('button', { class: 'btn btn--accent', onclick: () => openTaskModal(render, trainers, state.date) }, '+ مهمة لمدرب'));
    }
    container.append(bar);

    const t = data.totals;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(state.branch ? fmtMoney(t.collected, Number(state.branch)) : fmtMoneyMap(dailyByCurrency(data)),
        'التحصيل اليومي', 'wallet', 'green'),
      kpiHero(data.attendance.sessions, 'حصة منفذة اليوم', 'dumbbell'),
      kpiHero(data.attendance.missed, 'غيابات اليوم', 'alert', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(t.newSubs, 'اشتراكات جديدة', 'card'),
      kpiTile(t.renewals, 'تجديدات', 'check'),
      kpiTile(t.freezes, 'تجميدات', 'snow', 'blue'),
      kpiTile(t.returns, 'عائدون من التجميد', 'users'),
      kpiTile(t.cancels, 'إلغاءات', 'alert', 'danger'),
      kpiTile(data.attendance.uniqueTrainees, 'متدربون حضروا', 'user')));

    /* يوم بلا أي إدخال — كل الأرقام صفر: إمّا عطلة وإمّا لم يُدخل أحد شيئًا */
    if (data.noInput) {
      container.append(el('div', { class: 'alert alert--warning' },
        `🚨 يوم ${data.date}: لا حصص ولا دفعات ولا أحداث اشتراك ولا سجل حضور لأي مدرب — `
        + 'تأكد إن كان يوم عطلة، وإلّا فالبيانات لم تُدخَل. راجع الفروع اليوم.'));
    }

    /* مدربون لم يُدخلوا ساعاتهم ولا مهامهم اليومية */
    if (data.trainersMissingLog && data.trainersMissingLog.length) {
      container.append(el('div', { class: 'alert alert--warning' },
        `⏱️ لم يُدخل ساعاته ولا مهامه اليوم: ${data.trainersMissingLog.map((t) => t.name).join('، ')} — `
        + 'بلا هذا الإدخال تبقى ساعاتهم المكتبية صفرًا في KPI والتقرير الشهري.'));
    }

    /* أعياد الميلاد — تنبيه قبل يوم (بطلب العميل): يظهر عيد الغد أولًا
       ليُجهَّز اليوم، ثم عيد اليوم نفسه. */
    if (data.birthdays && data.birthdays.length) {
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, '🎂 أعياد الميلاد — تنبيه قبل يوم'),
        dataTable(['المتدرب', 'الفرع', 'تاريخ الميلاد', 'المناسبة', 'الجوال', ''],
          data.birthdays.map((b) => [
            el('a', { href: '#/trainee/' + b.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, b.name),
            b.branch, b.birthDate,
            b.when === 'tomorrow'
              ? el('span', { class: 'tag tag--warning' }, 'غدًا 🎉')
              : el('span', { class: 'tag tag--accent' }, 'اليوم 🎉'),
            b.phone || '—',
            b.phone ? el('a', {
              class: 'btn btn--accent btn--sm', target: '_blank',
              href: waLink(b.phone, OPS_SETTINGS.waCountryCode, `كل عام وأنت بخير ${b.name} 🎉🎂 من عائلة سبورت باور — نتمنى لك سنة مليانة صحة وإنجازات 💪`, b.name),
            }, 'تهنئة واتساب') : '—']))));
    }

    // تنبيهات الغياب المتكرر
    if (data.absentees.length) {
      const list = el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, '⚠️ متدربون بحاجة لتواصل (غياب متكرر)'),
        dataTable(['المتدرب', 'مرات الغياب', 'مدربو حصصه', 'الجوال', ''],
          data.absentees.map((a) => [
            el('a', { href: '#/trainee/' + a.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, a.name),
            el('b', { class: 'num', style: 'color:var(--status-danger)' }, String(a.missed)),
            a.trainers.join('، ') || '—', a.phone || '—',
            a.phone ? el('a', {
              class: 'btn btn--accent btn--sm', target: '_blank',
              href: waLink(a.phone, OPS_SETTINGS.waCountryCode, `مرحبًا ${a.name}، افتقدناك في حصصك الأخيرة في سبورت باور 💪 هل كل شيء تمام؟ خبرنا لننسق لك موعدًا جديدًا.`, a.name),
            }, 'واتساب') : '—'])));
      container.append(list);
    }

    // التحصيل والأحداث حسب الفرع
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `الفروع — ${data.date}`),
      dataTable(['الفرع', 'التحصيل', 'جدد', 'تجديد', 'تجميد', 'عائد', 'إلغاء', 'حصص'],
        data.branches.map((b) => [b.branch, fmtMoney(b.collected, b.branchId),
          String(b.newSubs), String(b.renewals), String(b.freezes), String(b.returns), String(b.cancels), String(b.sessions)]))));

    // سجل المدربين اليومي
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'المتابعة اليومية للمدربين'),
      el('div', { class: 'table-wrap' }, dataTable(
        ['المدرب', 'حضور', 'انصراف', 'ساعات عمل', 'ساعات تدريب', 'حصص', 'متدربون فريدون', 'أهداف تدريبية', 'ستوري', 'ريلز', 'مهام اليوم'],
        data.trainerRows.map((r) => [r.name, r.checkIn || '—', r.checkOut || '—',
          r.workHours != null ? r.workHours + ' س' : '—',
          el('span', { class: 'num' }, String(r.trainingHours)), el('span', { class: 'num' }, String(r.sessions)),
          el('span', { class: 'num' }, String(r.uniqueTrainees)),
          String(r.goalsCreated), String(r.stories), String(r.reels),
          r.tasksTotal ? el('span', { class: 'tag ' + (r.tasksDone === r.tasksTotal ? 'tag--accent' : 'tag--warning') }, `${r.tasksDone}/${r.tasksTotal}`) : '—']))),
    ));

    // مهام المدربين لهذا الشهر
    if (tasks.length || API.user.role === 'admin') {
      const nameOf = (id) => (trainers.find((x) => x.id === id) || {}).name || '#' + id;
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `مهام المدربين — شهر ${state.date.slice(0, 7)}`),
        pagedTable(['المدرب', 'المهمة', 'النوع', 'الموعد', 'الحالة', ''],
          tasks,
          (x) => [nameOf(x.trainerId), x.title,
            x.type === 'monthly' ? el('span', { class: 'tag tag--petrol' }, 'شهرية') : el('span', { class: 'tag tag--neutral' }, 'يومية'),
            x.type === 'monthly' ? x.month : x.date,
            x.status === 'done' ? el('span', { class: 'tag tag--accent' }, 'تم ✓') : el('span', { class: 'tag tag--warning' }, 'لم يتم'),
            API.user.role === 'admin' ? el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => { await API.del('/api/tasks/' + x.id); toast('حُذفت المهمة.'); render(); },
            }, 'حذف') : el('span')],
          { pageSize: 10, emptyText: 'لا مهام لهذا الشهر — أضف مهمة لمدرب.' })));
    }
  }

  await render();
}

function openTaskModal(onDone, trainers, date) {
  const trainerSel = select(trainers.map((x) => [x.id, x.name]));
  const titleIn = input({ placeholder: 'مثال: نشر 3 ستوريات تمارين' });
  const typeSel = select([['daily', 'يومية'], ['monthly', 'شهرية']]);
  const dateIn = input({ type: 'date', value: date });
  const monthIn = input({ type: 'month', value: date.slice(0, 7) });
  const dateField = field('التاريخ', dateIn);
  const monthField = field('الشهر', monthIn);
  monthField.style.display = 'none';
  typeSel.addEventListener('change', () => {
    dateField.style.display = typeSel.value === 'daily' ? '' : 'none';
    monthField.style.display = typeSel.value === 'monthly' ? '' : 'none';
  });

  const close = modal('مهمة جديدة لمدرب', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/tasks', {
            trainerId: Number(trainerSel.value), title: titleIn.value, type: typeSel.value,
            date: dateIn.value, month: monthIn.value,
          });
          toast('أُسندت المهمة — ووصل إشعار للمدرب.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المدرب', trainerSel), field('النوع', typeSel),
      dateField, monthField,
      el('div', { class: 'span-2' }, field('المهمة', titleIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إسناد المهمة'))),
  ]);
}

/* ============================================================
   الأهداف وKPI (الإدارة/المحاسب)
   ============================================================ */
const ACQUISITION_LABELS = {
  social: 'سوشال ميديا', trainee: 'عن طريق متدرب', friend: 'عن طريق صديق',
  new: 'زبون جديد (مباشر)', returned: 'عائد من التجميد', trainer: 'عن طريق مدرب',
};

async function viewKpi(root) {
  const state = urlState({ month: thisMonthISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const [targets, kpis, branches, trainers, board, allUsers] = await Promise.all([
      API.get('/api/targets'),
      API.get('/api/kpi?month=' + state.month),
      API.get('/api/branches'),
      API.get('/api/users?role=trainer'),
      API.get(`/api/kpi/board?month=${state.month}` + (state.branch ? `&branch=${state.branch}` : '')).catch(() => null),
      // موظفو الهدف الشخصي: المحاسبة والتغذية والإدارة إلى جانب المدربين
      API.get('/api/users').catch(() => []),
    ]);
    const staff = (allUsers || []).filter((u) => u.role !== 'trainee');
    container.innerHTML = '';

    const monthIn = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
      value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); },
    });
    const bar = el('div', { class: 'card filters' }, field('شهر KPI', monthIn), field('الفرع', branchSel));
    if (API.user.role === 'admin') {
      bar.append(el('button', { class: 'btn btn--accent', onclick: () => openTargetModal(render, branches, trainers, staff) }, '+ هدف جديد'));
    }
    container.append(bar);

    if (board) await renderKpiBoard(container, board);

    container.append(el('div', { class: 'alert alert--info' },
      'KPI = (المحقق ÷ الهدف). مؤشر كل موظف يُحسب تلقائيًا من إنجاز مهامه + تحقيق أهدافه، ويظهر في التقارير الشهرية.'));

    // الأهداف مع نسب الإنجاز
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الأهداف — مقارنة الفعلي بالمستهدف'),
      pagedTable(['النطاق', 'المؤشر', 'الفترة', 'الهدف', 'المحقق', 'نسبة الإنجاز', ''],
        targets.sort((a, b) => (a.period < b.period ? 1 : -1)),
        (x) => [x.refName || '—',
          /* مؤشرٌ متوقّف عن العرض: يبقى محسوبًا، ويُوسَم كي يُستبدل */
          x.deprecated
            ? el('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, x.metricLabel,
              el('span', {
                class: 'tag tag--warning',
                title: 'هذا المؤشر مجموعُ «اشتراكات جديدة فقط» و«تجديد اشتراكات» — '
                  + 'يبقى محسوبًا لهذا الهدف، والأهداف الجديدة تُضبط على أحدهما.',
              }, 'مؤشر قديم'))
            : x.metricLabel,
          periodLabel(x.period),
          targetValueText(x, x.value), targetValueText(x, x.actual),
          progressBar(x.pct),
          API.user.role === 'admin' ? el('div', { class: 'row-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openTargetEditModal(render, x) },
              x.manual ? 'تحديث المحقَّق' : 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف هدف «${x.metricLabel}»؟`)) return;
                try { await API.del('/api/targets/' + x.id); toast('حُذف الهدف.'); render(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف')) : el('span')],
        { pageSize: 12, emptyText: 'لا أهداف بعد — أضف هدفًا شهريًا أو نصف سنوي أو سنويًا.' })));

    /* جدول «KPI الموظفين» أُزيل بطلب العميل — أهداف كل موظف ونسبته في
       «أهداف الموظفين» أعلاه، وأرقام المدربين في جدول KPI المدربين. */
  }

  await render();
}

/* أعمدة KPI المدربين — مصدرٌ واحد للوحة KPI والتقرير الشهري وصفحة
   المدرب، فلا يختلف عمود بين شاشة وأخرى. */
const KPI_TRAINER_COLUMNS = ['المدرب', 'الفرع', 'ساعات مكتبية', 'ساعات تدريب', 'عدد الأشخاص', 'ستوريات', 'ريلز',
  'زبائن جدد', 'نتائج', 'مشاكل', 'أهداف وُضعت'];
function kpiTrainerRow(t) {
  const num = (v) => el('span', { class: 'num' }, String(v ?? 0));
  return [
    el('span', { class: 'cell-name' }, t.name || t.trainer),
    el('span', { class: 'cell-name' }, t.branch || '—'),
    num(t.officeHours), num(t.trainingHours ?? t.hours), num(t.trainedPeople ?? t.uniqueTrainees),
    num(t.stories), num(t.reels),
    el('span', { class: 'num', title: 'هذا الشهر · الإجمالي' }, `${t.newClients ?? 0} · ${t.newClientsTotal ?? 0}`),
    el('span', { class: 'num', style: t.results ? 'color:var(--accent-hover)' : '' }, String(t.results ?? 0)),
    el('span', { class: 'num', style: t.problems ? 'color:var(--status-danger)' : '' }, String(t.problems ?? 0)),
    el('b', { class: 'num', style: t.goalsCreated ? 'color:var(--accent-hover)' : 'color:var(--app-muted)' }, String(t.goalsCreated || 0)),
  ];
}

/* ============================================================
   صفحة KPI عند المدرب — «تظهر الأهداف المطلوبة التي تضعها الإدارة
   ويتابع الملف حسب إدخاله للوصول للهدف»: الإدارة تضبط الهدف شهريًا
   من صفحتها، وهنا يراه صاحبه مع المحقَّق ونسبة الإنجاز — محسوبةً من
   حصصه وسجل يومه وما رصده، لا من إدخال يدوي.
   ============================================================ */
async function viewMyKpi(root) {
  const state = urlState({ month: thisMonthISO() });
  const container = el('div', { class: 'content' });
  root.append(container);
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    let data;
    try { data = await API.get('/api/kpi/mine?month=' + state.month); }
    catch (ex) { container.innerHTML = ''; container.append(el('div', { class: 'alert alert--warning' }, ex.message)); return; }
    container.innerHTML = '';

    const monthIn = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    container.append(el('div', { class: 'card filters' }, field('الشهر', monthIn)));

    const k = data.kpi;
    if (k && k.kpi !== null && k.kpi !== undefined) {
      container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
        kpiHero(k.kpi + '%', `KPI ${state.month}`, 'target', k.kpi >= 80 ? 'green' : k.kpi >= 50 ? undefined : 'blue'),
        kpiHero(k.targetsPct !== null ? k.targetsPct + '%' : '—', 'إنجاز الأهداف', 'chart', 'green'),
        kpiHero(k.tasksPct !== null ? k.tasksPct + '%' : '—', `إنجاز المهام (${k.tasksDone}/${k.tasksTotal})`, 'check')));
    }

    /* الأهداف التي وضعتها الإدارة لي — كل هدف بمحقَّقه ونسبته */
    const goalsCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `أهدافي — ${state.month}`,
        el('span', { style: 'font-size:12px;color:var(--app-muted);font-weight:400' }, 'تضعها الإدارة شهريًا — والمحقَّق يُحسب من إدخالاتك')));
    if (!data.targets.length) {
      goalsCard.append(el('div', { class: 'empty' }, 'لا أهداف مضبوطة لك تشمل هذا الشهر بعد — تضعها الإدارة من صفحة «الأهداف وKPI».'));
    } else {
      goalsCard.append(el('div', { class: 'goalgrid' },
        ...data.targets.map((t, i) => goalMeter({
          title: t.metricLabel,
          sub: periodLabel(t.period) + (t.carried > 0 ? ` · مُرحَّل من السابق +${targetValueText(t, t.carried)}` : ''),
          pct: t.pct, actual: t.actual, money: t.money, currency: targetCurrency(t),
          targetText: targetValueText(t, t.effective),
        }, i))),
      dataTable(['المؤشر', 'الفترة', 'الهدف', 'المحقَّق', 'المتبقي', 'الإنجاز'],
        data.targets.map((t) => [t.metricLabel, periodLabel(t.period), targetValueText(t, t.effective), targetValueText(t, t.actual),
          targetValueText(t, Math.max(0, Math.round(((t.effective || 0) - (t.actual || 0)) * 100) / 100)), progressBar(t.pct)])));
    }
    container.append(goalsCard);

    /* أرقامي كما تراها الإدارة في جدول KPI المدربين — الأعمدة نفسها */
    if (data.row) {
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `أرقامي هذا الشهر — كما تظهر في KPI المدربين`),
        el('div', { style: 'overflow-x:auto' }, dataTable(KPI_TRAINER_COLUMNS, [kpiTrainerRow(data.row)])),
        el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:8px' },
          'الساعات المكتبية والستوريات والريلز من «سجل اليوم»، وساعات التدريب وعدد الأشخاص من حصصك المسجَّلة، والنتائج والمشاكل من رصدك على متدربيك الذين أنت مدرّبهم الأساسي، والأهداف من أهداف المشتركين التي وضعتها.')));
    }
  }
  await render();
}

/* قيمة هدفٍ معروضة بوحدتها: مال بالعملة، ونسبةٌ بعلامة % */
function targetValueText(t, v) {
  if (v === null || v === undefined) return '—';
  if (t.money || t.metric === 'revenue') return fmtMoney(v, targetCurrency(t));
  if (t.pctMetric) return v + '%';
  return String(v);
}

/* ============================================================
   لوحة KPI بأربع زوايا: المدرب · الفرع · المحاسب · المبيعات
   كل رقم مشتقّ من بيانات النظام — لا إدخال يدوي.
   ============================================================ */
async function renderKpiBoard(container, b) {
  const num = (v) => el('span', { class: 'num' }, String(v ?? 0));

  /* --- المدرب --- */
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `KPI المدرب — ${b.month}`),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'الساعة المميزة: أربعة متدربين في الساعة نفسها = ساعة تدريب واحدة على المدرب. '
      + 'والغياب مخصوم من رصيد المتدرب لكنه لا يُحتسب حصةً منفَّذة للمدرب.'),
    el('div', { style: 'overflow-x:auto' },
      /* الأعمدة كما طلبها العميل حرفيًا: المدرب – الفرع – ساعات مكتبية –
         ساعات تدريب – عدد الأشخاص – الستوريات – الريلز – زبائن جدد –
         نتائج – مشاكل – أهداف وُضعت. */
      dataTable(KPI_TRAINER_COLUMNS, b.trainers.map(kpiTrainerRow), 'لا مدربين.'))));

  /* تغطية الأهداف التدريبية — من بقي من المشتركين بلا هدف */
  container.append(await goalCoverageCard(b.month));

  /* --- الفرع --- */
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `KPI الفروع — ${b.month}`),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'سقف التجميد يُضبط لكل فرع من صفحة الإعدادات — وتجاوزه يظهر هنا بالأحمر.'),
    el('div', { style: 'overflow-x:auto' },
      dataTable(['الفرع', 'مشتركون جدد', 'تجديد', 'عائد من التجميد', 'تجميد الشهر', 'مجمّدون الآن', 'سقف التجميد',
        'التحصيل', 'الفعّالون', 'نسبة التجديد', 'نتائج', 'مشاكل'],
        b.branches.map((x) => [el('span', { class: 'cell-name' }, x.branch),
          num(x.newSubs), num(x.renewals), num(x.returnedFromFreeze), num(x.freezesMonth),
          el('span', {
            class: 'num',
            style: x.freezeOverLimit ? 'color:var(--status-danger);font-weight:800' : '',
            title: x.freezeOverLimit ? `تجاوز السقف بـ ${x.freezeOverLimit}` : '',
          }, String(x.frozenNow) + (x.freezeOverLimit ? ' ⚠️' : '')),
          x.freezeLimit === null ? el('span', { class: 'tag tag--neutral' }, 'بلا سقف') : num(x.freezeLimit),
          fmtMoney(x.collected, x.branchId), num(x.activeTrainees),
          x.retentionPct !== null ? progressBar(x.retentionPct) : '—',
          num(x.results),
          el('span', { class: 'num', style: x.problems ? 'color:var(--status-danger)' : '' }, String(x.problems))]),
        'لا فروع.'))));

  /* --- المحاسب --- */
  container.append(el('div', { class: 'grid-2eq' },
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'KPI المحاسب — حسب الفرع'),
      dataTable(['الفرع', 'التحصيل', 'مشتركون جدد', 'جدد من التجميد', 'تجميد'],
        b.accountant.map((x) => [x.branch, fmtMoney(x.collected, x.branchId), num(x.newSubs), num(x.returnedFromFreeze), num(x.freezesMonth)]),
        'لا فروع.')),

    /* --- المبيعات --- */
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'KPI المبيعات',
        el('a', { class: 'btn btn--outline btn--sm', href: '#/sales' }, 'ملف المتابعة ←')),
      el('div', { class: 'kpis' },
        kpiTile(b.sales.newNumbers, 'أرقام جديدة', 'wa'),
        kpiTile(b.sales.closingRate !== null ? b.sales.closingRate + '%' : '—', 'نسبة الإغلاق', 'target', 'green'),
        kpiTile(b.sales.newClients, 'عملاء جدد هذا الشهر', 'users'),
        kpiTile(b.sales.returnedFromFreeze, 'عائد من التجميد', 'snow', 'blue'),
        kpiTile(b.sales.tests, 'عدد الـ test', 'clipboard')),
      dataTable(['المؤشر', 'العدد'], [
        ['حصص تجريبية محجوزة', String(b.sales.tests)],
        ['حضروا التجربة', String(b.sales.testsAttended)],
        ['لم يحضروا (no-show)', String(b.sales.noShow)],
        ...Object.entries(b.sales.byChannel).map(([k, v]) => ['قناة: ' + k, String(v)]),
      ]))));

  /* --- أهداف الأشخاص: المحاسبة والمبيعات وكل من يُقاس ---
     «خلي KPI كلو بمكان واحد»: هدف كل موظف ونسبة إنجازه هنا لا في شاشة
     ثانية — مجمَّعًا باسم صاحبه. */
  const st = b.staffTargets || [];
  if (st.length) {
    const byPerson = st.reduce((acc, x) => { (acc[x.userId] = acc[x.userId] || []).push(x); return acc; }, {});
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `أهداف الموظفين — ${b.month}`,
        el('span', { style: 'font-size:12px;color:var(--app-muted);font-weight:400' },
          'المحاسبة والمبيعات والتغذية والإدارة — كل هدفٍ شخصي ونسبة إنجازه')),
      el('div', { class: 'goalgrid' },
        ...st.map((x, i) => goalMeter({
          title: `${x.name} — ${x.metricLabel}`,
          sub: `${STAFF_ROLE_LABELS[x.role] || x.role} · ${x.branch} · ${periodLabel(x.period)}`,
          pct: x.pct, actual: x.actual, money: x.money, currency: targetCurrency(x),
          targetText: x.money ? fmtMoney(x.target, targetCurrency(x)) : x.pctMetric ? x.target + '%' : String(x.target),
        }, i))),
      el('div', { class: 'sidebar__caption', style: 'padding:8px 0 0' },
        `${Object.keys(byPerson).length} موظفًا لهم أهداف هذا الشهر · ${st.length} هدفًا.`)));
  } else if (API.user.role === 'admin') {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'أهداف الموظفين'),
      el('div', { class: 'empty' },
        'لا أهداف شخصية بعد. من «+ هدف جديد» اختر النطاق «موظف» لتضبط هدفًا للمحاسبة أو المبيعات '
        + '— التحصيل، الأرقام الجديدة، نسبة الإغلاق، عدد الـ test، المشتركون الجدد، عائد من التجميد…')));
  }

  /* --- كيف وصلنا المشتركون الجدد --- */
  const acq = Object.entries(b.acquisition || {});
  if (acq.length) {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `كيف وصلنا المشتركون الجدد — ${b.month}`),
      el('div', { class: 'macros' },
        ...acq.map(([k, v]) => el('span', { class: 'macro' }, (ACQUISITION_LABELS[k] || k) + ' ', el('b', {}, String(v)))))));
  }
}

function periodLabel(p) {
  if (/^\d{4}-\d{2}$/.test(p)) return 'شهري — ' + p;
  if (/H1$/.test(p)) return 'نصف سنوي — النصف الأول ' + p.slice(0, 4);
  if (/H2$/.test(p)) return 'نصف سنوي — النصف الثاني ' + p.slice(0, 4);
  return 'سنوي — ' + p;
}

/* تعديل هدف قائم: قيمته — وللهدف الحرّ اسمُه ومحقَّقُه اليدوي */
function openTargetEditModal(onDone, t) {
  const valueIn = input({ type: 'number', min: 0, step: 'any', value: t.value });
  const labelIn = input({ value: t.label || t.metricLabel || '' });
  const actualIn = input({ type: 'number', min: 0, step: 'any', value: t.actual || 0 });
  const close = modal(`تعديل الهدف — ${t.refName || 'الشركة كاملة'} · ${periodLabel(t.period)}`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/targets/' + t.id, {
            value: Number(valueIn.value),
            ...(t.manual ? { label: labelIn.value, actual: Number(actualIn.value) || 0 } : {}),
          });
          toast('حُفظ التعديل.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      t.manual ? el('div', { class: 'span-2' }, field('اسم الهدف', labelIn)) : el('div', { class: 'span-2 sidebar__caption', style: 'padding:0' }, t.metricLabel),
      field('قيمة الهدف', valueIn),
      t.manual ? field('المحقَّق حتى الآن', actualIn)
        : el('div', { class: 'sidebar__caption', style: 'padding:22px 0 0' }, 'المحقَّق يحسبه النظام من بياناته.'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ'))),
  ]);
}

async function openTargetModal(onDone, branches, trainers, staff) {
  const { groups, metrics } = await loadMetrics();
  /* «كل حدا بنحسب»: الهدف يُضبط للشركة أو لفرع أو لمدرب — أو لأي موظف
     (محاسبة، مبيعات، تغذية) بنطاق «موظف». */
  const scopeSel = select([['company', SCOPE_LABELS.company], ['branch', SCOPE_LABELS.branch],
    ['trainer', SCOPE_LABELS.trainer], ['user', SCOPE_LABELS.user]]);
  const branchSel = select(branches.map((b) => [b.id, b.name]));
  const trainerSel = select(trainers.map((x) => [x.id, x.name]));
  const staffList = (staff || []).filter((u) => u.active !== false);
  const staffSel = select(staffList.map((u) => [u.id, `${u.name} — ${STAFF_ROLE_LABELS[u.role] || u.role}`]));
  const metricSel = select([]);
  const kindSel = select([['month', 'شهري'], ['H', 'نصف سنوي'], ['year', 'سنوي']]);
  const monthIn = input({ type: 'month', value: thisMonthISO() });
  const halfSel = select([[thisMonthISO().slice(0, 4) + '-H1', 'النصف الأول'], [thisMonthISO().slice(0, 4) + '-H2', 'النصف الثاني']]);
  const yearIn = input({ type: 'number', value: thisMonthISO().slice(0, 4), min: 2024, max: 2100 });
  const valueIn = input({ type: 'number', min: 0, step: 'any', placeholder: 'مثال: 70000' });
  const hint = el('div', { class: 'sidebar__caption', style: 'padding:0' });
  /* الهدف الحرّ: «الإدارة تضيف أهداف زي ما بدها» — اسمٌ تكتبه الإدارة
     ومحقَّقٌ يُحدَّث يدويًا، لما لا يقيسه النظام من بياناته. */
  const labelIn = input({ placeholder: 'مثال: حملة رمضان · تجهيز الصالة الجديدة · دورة للمدربين' });
  const actualIn = input({ type: 'number', min: 0, step: 'any', value: 0 });
  const labelField = el('div', { class: 'span-2' }, field('اسم الهدف الحرّ *', labelIn));
  const actualField = field('المحقَّق حتى الآن (يُحدَّث لاحقًا من الجدول)', actualIn);

  const branchField = field('الفرع', branchSel); branchField.style.display = 'none';
  const trainerField = field('المدرب', trainerSel); trainerField.style.display = 'none';
  const staffField = field('الموظف', staffSel); staffField.style.display = 'none';
  if (!staffList.length) staffField.append(el('div', { class: 'sidebar__caption', style: 'padding:4px 0 0' }, 'لا حسابات موظفين غير المدربين بعد.'));

  /* المؤشر يتبع النطاق: «ساعات التدريب» بلا معنى على المحاسبة، و«نسبة
     الإغلاق» بلا معنى على مدرب — فلا تُعرض أصلًا بدل أن يرفضها الخادم. */
  /* المؤشر يتبع النطاق، ويُعرض مقسَّمًا بمجموعاته: قائمةٌ مسطّحة بثلاثة
     وعشرين بندًا تُقرأ كأنها مكرَّرة. والمؤشر المتوقّف عن العرض
     (مجموعُ غيره) لا يظهر هنا — ويبقى محسوبًا لأهدافٍ ضُبطت عليه. */
  function syncMetrics() {
    const scope = scopeSel.value;
    const allowed = metrics.filter((m) => !m.deprecated && m.scopes.includes(scope));
    const keep = metricSel.value;
    metricSel.innerHTML = '';
    const shown = (groups && groups.length ? groups : [{ key: null, label: '' }]);
    shown.forEach((g) => {
      const list = allowed.filter((m) => (g.key ? m.group === g.key : true));
      if (!list.length) return;
      const box = g.key ? el('optgroup', { label: g.label }) : metricSel;
      list.forEach((m) => box.append(el('option', { value: m.key }, m.label)));
      if (box !== metricSel) metricSel.append(box);
    });
    // مؤشراتٌ بلا مجموعة معروفة لا تسقط من القائمة
    const placed = new Set([...metricSel.querySelectorAll('option')].map((o) => o.value));
    allowed.filter((m) => !placed.has(m.key))
      .forEach((m) => metricSel.append(el('option', { value: m.key }, m.label)));
    if (allowed.some((m) => m.key === keep)) metricSel.value = keep;
    syncHint();
  }
  function syncHint() {
    const m = metrics.find((x) => x.key === metricSel.value);
    labelField.style.display = m && m.manual ? '' : 'none';
    actualField.style.display = m && m.manual ? '' : 'none';
    if (!m) { hint.textContent = ''; return; }
    valueIn.placeholder = m.pct ? 'نسبة مئوية — مثال: 35' : m.money ? 'مثال: 70000' : 'مثال: 40';
    hint.textContent = m.manual
      ? 'هدفٌ لا يقيسه النظام بنفسه: تكتب اسمه وقيمته، وتحدّث المحقَّق يدويًا من جدول الأهداف. يظهر في KPI صاحبه كأي هدف.'
      : scopeSel.value !== 'user' ? ''
        : m.by === 'branch'
          ? 'يُقاس على فروع هذا الموظف (المحاسبة تُقاس بفرعها لا بما سجّلته بيدها).'
          : 'يُقاس على عمله هو: ما سجّله وما نفّذه باسمه.';
  }

  scopeSel.addEventListener('change', () => {
    branchField.style.display = scopeSel.value === 'branch' ? '' : 'none';
    trainerField.style.display = scopeSel.value === 'trainer' ? '' : 'none';
    staffField.style.display = scopeSel.value === 'user' ? '' : 'none';
    syncMetrics();
  });
  metricSel.addEventListener('change', syncHint);
  syncMetrics();

  const monthField = field('الشهر', monthIn);
  const halfField = field('النصف', halfSel); halfField.style.display = 'none';
  const yearField = field('السنة', yearIn); yearField.style.display = 'none';
  kindSel.addEventListener('change', () => {
    monthField.style.display = kindSel.value === 'month' ? '' : 'none';
    halfField.style.display = kindSel.value === 'H' ? '' : 'none';
    yearField.style.display = kindSel.value === 'year' ? '' : 'none';
  });

  const refFor = (scope) => (scope === 'branch' ? Number(branchSel.value)
    : scope === 'trainer' ? Number(trainerSel.value)
      : scope === 'user' ? Number(staffSel.value) : null);

  const close = modal('هدف جديد (Target)', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const scope = scopeSel.value;
        const period = kindSel.value === 'month' ? monthIn.value : kindSel.value === 'H' ? halfSel.value : String(yearIn.value);
        const refId = refFor(scope);
        if (scope !== 'company' && !refId) { toast('اختر صاحب الهدف أولًا.', true); return; }
        const m = metrics.find((x) => x.key === metricSel.value) || {};
        try {
          await API.post('/api/targets', {
            scope, refId, metric: metricSel.value, period, value: Number(valueIn.value),
            ...(m.manual ? { label: labelIn.value, actual: Number(actualIn.value) || 0 } : {}),
          });
          toast(m.manual ? 'حُفظ الهدف الحرّ — حدّث محقَّقه من جدول الأهداف.' : 'حُفظ الهدف — وستُحسب نسبة الإنجاز تلقائيًا.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('النطاق', scopeSel), field('المؤشر', metricSel),
      labelField,
      branchField, trainerField, staffField,
      field('نوع الفترة', kindSel), monthField, halfField, yearField,
      field('قيمة الهدف', valueIn), actualField,
      el('div', { class: 'span-2' }, hint),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ الهدف'))),
  ]);
}

/* ============================================================
   المجمدون — استيراد Excel + متابعة + واتساب
   ============================================================ */
const OPS_SETTINGS = { frozenMessage: '', waCountryCode: '970' };

async function viewFrozen(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [rows, branches, settings] = await Promise.all([
      API.get('/api/frozen'),
      API.get('/api/branches'),
      API.get('/api/settings'),
    ]);
    OPS_SETTINGS.frozenMessage = settings.frozenMessage || '';
    OPS_SETTINGS.waCountryCode = settings.waCountryCode || '970';
    container.innerHTML = '';

    /* استيراد Excel */
    const fileIn = input({ type: 'file', accept: '.xlsx,.xls,.csv' });
    const branchSel = select([['', 'حسب عمود الفرع في الملف'], ...branches.map((b) => [b.id, b.name])]);
    const importBtn = el('button', {
      class: 'btn btn--accent',
      onclick: async () => {
        const f = fileIn.files[0];
        if (!f) { toast('اختر ملف Excel أولًا.', true); return; }
        importBtn.disabled = true;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await API.post('/api/frozen/import', { fileBase64: reader.result, defaultBranchId: branchSel.value || null });
            toast(`استُورد ${res.imported} سجلًا من ورقة «${res.sheet}» (تخطي ${res.skipped}).`);
            render();
          } catch (ex) { toast(ex.message, true); importBtn.disabled = false; }
        };
        reader.readAsDataURL(f);
      },
    }, 'استيراد الملف');

    /* قالب رسالة الواتساب */
    const msgIn = textarea({ value: OPS_SETTINGS.frozenMessage, style: 'min-height:90px' });
    const codeIn = input({ value: OPS_SETTINGS.waCountryCode, dir: 'ltr', style: 'text-align:end;width:110px' });

    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'استيراد ملف Excel للمجمدين'),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
          field('الملف (الاسم، الجوال، تاريخ الميلاد، الفرع، تاريخ آخر اشتراك…)', fileIn),
          field('الفرع الافتراضي (إن لم يذكره الملف)', branchSel),
          importBtn,
          el('div', { style: 'font-size:12px;color:var(--app-muted)' }, 'يتعرف تلقائيًا على الأعمدة العربية ولا يكرر السجلات الموجودة.'))),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'قالب الرسالة التحفيزية'),
        el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
          field('نص الرسالة — استخدم {الاسم} ليُستبدل تلقائيًا', msgIn),
          el('div', { class: 'filters' },
            field('مفتاح الدولة للواتساب', codeIn),
            el('button', {
              class: 'btn btn--outline',
              onclick: async () => {
                try {
                  await API.put('/api/settings', { frozenMessage: msgIn.value, waCountryCode: codeIn.value });
                  OPS_SETTINGS.frozenMessage = msgIn.value;
                  OPS_SETTINGS.waCountryCode = codeIn.value.replace(/\D/g, '');
                  toast('حُفظ القالب.');
                } catch (ex) { toast(ex.message, true); }
              },
            }, 'حفظ القالب'))))));

    /* قائمة المتابعة */
    const selected = new Set();
    const listCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `قائمة متابعة المجمدين (${rows.length})`,
        el('button', {
          class: 'btn btn--accent btn--sm',
          onclick: () => {
            const list = rows.filter((r) => selected.has(r.id) && r.phone);
            if (!list.length) { toast('حدد أشخاصًا لديهم أرقام جوال أولًا.', true); return; }
            openBulkWaModal(list, render);
          },
        }, 'متابعة جماعية عبر واتساب')));

    listCard.append(pagedTable(
      ['', 'الاسم', 'الجوال', 'الفرع', 'آخر اشتراك', 'تاريخ التجميد', 'السبب', 'آخر تواصل', 'الحالة', ''],
      rows,
      (r) => [
        el('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? selected.add(r.id) : selected.delete(r.id); } }),
        r.name, r.phone || '—', r.branchName, r.lastSubDate || '—', r.freezeDate || '—', r.reason || '—', r.lastContact || '—',
        select(Object.entries(FROZEN_STATUS_LABELS), {
          value: r.status, style: 'min-width:130px;padding:6px 8px;font-size:12px',
          onchange: async (e) => {
            try { await API.put('/api/frozen/' + r.id, { status: e.target.value }); toast('حُدّثت الحالة.'); }
            catch (ex) { toast(ex.message, true); }
          },
        }),
        el('div', { class: 'row-actions' },
          r.phone ? el('a', {
            class: 'btn btn--accent btn--sm', target: '_blank',
            href: waLink(r.phone, OPS_SETTINGS.waCountryCode, OPS_SETTINGS.frozenMessage, r.name),
            onclick: () => API.put('/api/frozen/' + r.id, { status: r.status === 'pending' ? 'contacted' : r.status }).catch(() => {}),
          }, 'واتساب') : el('span'),
          API.user.role === 'admin' ? el('button', {
            class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
            onclick: async () => { if (confirm(`حذف «${r.name}»؟`)) { await API.del('/api/frozen/' + r.id); render(); } },
          }, 'حذف') : el('span'))],
      { pageSize: 15, searchText: (r) => `${r.name} ${r.phone || ''} ${r.branchName || ''}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…', emptyText: 'لا سجلات — استورد ملف Excel أعلاه.' }));
    container.append(listCard);
  }

  await render();
}

/* متابعة جماعية: شخص بشخص — فتح واتساب وتحديث الحالة */
function openBulkWaModal(list, onDone) {
  let i = 0;
  const body = el('div');
  const close = modal(`متابعة جماعية (${list.length} أشخاص)`, [body]);

  function draw() {
    if (i >= list.length) {
      body.innerHTML = '';
      body.append(el('div', { class: 'empty' }, '✅ اكتملت المتابعة الجماعية.'),
        el('button', { class: 'btn btn--accent btn--full', onclick: () => { close(); onDone && onDone(); } }, 'تم'));
      return;
    }
    const person = list[i];
    body.innerHTML = '';
    body.append(
      el('div', { style: 'font-size:13px;color:var(--app-muted)' }, `${i + 1} من ${list.length}`),
      el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.2rem;color:var(--app-ink);margin:6px 0' }, person.name),
      el('div', { style: 'font-size:13px;color:var(--app-muted);margin-bottom:14px', dir: 'ltr' }, person.phone),
      el('a', {
        class: 'btn btn--accent btn--full', target: '_blank',
        href: waLink(person.phone, OPS_SETTINGS.waCountryCode, OPS_SETTINGS.frozenMessage, person.name),
        onclick: async () => {
          await API.put('/api/frozen/' + person.id, { status: 'contacted' }).catch(() => {});
          setTimeout(() => { i++; draw(); }, 400);
        },
      }, 'فتح واتساب وتحديد «تم التواصل»'),
      el('button', { class: 'btn btn--ghost btn--full', style: 'margin-top:8px', onclick: () => { i++; draw(); } }, 'تخطي'));
  }
  draw();
}

/* ============================================================
   بطاقات المدرب: سجل اليوم + مهامي + KPI
   ============================================================ */
async function renderTrainerOps(container) {
  const month = thisMonthISO();
  const [tasks, kpis] = await Promise.all([
    API.get('/api/tasks?month=' + month),
    API.get('/api/kpi?month=' + month),
  ]);
  const myKpi = kpis[0];

  /* --- سجل اليوم — مع تنقّل بالتاريخ: المدرب يراجع ساعاته في أي يوم ويعدّلها --- */
  const state = urlState({ date: todayISO() }, 'log');
  const checkIn = input({ type: 'time' });
  const checkOut = input({ type: 'time' });
  /* الساعات المكتبية رقمًا مباشرًا — «سجل اليوم ناقصه الساعات المكتبية».
     إن تُركت فارغة حُسبت من الحضور والانصراف. */
  const officeIn = input({ type: 'number', min: 0, step: '0.5', placeholder: 'مثال: 4 — أو اتركه ليُحسب من الحضور/الانصراف' });
  const goals = input({ type: 'number', min: 0 });
  const stories = input({ type: 'number', min: 0 });
  const reels = input({ type: 'number', min: 0 });
  const notes = input({ placeholder: 'اختياري' });
  const autoChips = el('div', { class: 'macros', style: 'margin-bottom:10px' });
  const titleDate = el('span', {}, `سجل اليوم — ${state.date}`);
  let log = {};

  function drawAuto(a) {
    autoChips.innerHTML = '';
    autoChips.append(
      el('span', { class: 'macro' }, 'حصص اليوم ', el('b', {}, String(a.sessions ?? '—'))),
      el('span', { class: 'macro' }, 'ساعات تدريب ', el('b', {}, String(a.trainingHours ?? '—'))),
      el('span', { class: 'macro' }, 'متدربون فريدون ', el('b', {}, String(a.uniqueTrainees ?? '—'))),
      el('span', { class: 'macro' }, 'ساعات مكتبية ', el('b', {}, log.workHours != null ? log.workHours + ' س' : '—')));
  }

  async function loadDay() {
    state.sync();
    titleDate.textContent = `سجل اليوم — ${state.date}`;
    dateIn.value = state.date;
    const logs = await API.get('/api/trainer-logs?date=' + state.date).catch(() => []);
    log = logs[0] || {};
    checkIn.value = log.checkIn || '';
    checkOut.value = log.checkOut || '';
    officeIn.value = log.workHours != null ? log.workHours : '';
    goals.value = log.goalsCreated || 0;
    stories.value = log.stories || 0;
    reels.value = log.reels || 0;
    notes.value = log.notes || '';
    const day = await API.get(`/api/sessions?from=${state.date}&to=${state.date}`).catch(() => []);
    const deliveredDay = day.filter((s) => s.kind !== 'absence');
    drawAuto({
      sessions: deliveredDay.length,
      trainingHours: new Set(deliveredDay.map((s) => (s.time || '').slice(0, 2))).size,
      uniqueTrainees: new Set(deliveredDay.map((s) => s.traineeId)).size,
    });
  }

  const dateIn = input({ type: 'date', value: state.date, style: 'width:150px',
    onchange: (e) => { state.date = e.target.value; loadDay(); } });
  const shiftDay = (days) => {
    const d = new Date(state.date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    state.date = d.toISOString().slice(0, 10);
    loadDay();
  };

  const dailyCard = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, titleDate,
      myKpi && myKpi.kpi !== null
        ? el('span', { class: 'tag ' + (myKpi.kpi >= 80 ? 'tag--accent' : myKpi.kpi >= 50 ? 'tag--warning' : 'tag--danger') }, `KPI الشهر: ${myKpi.kpi}%`)
        : el('span')),
    el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap' },
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => shiftDay(-1) }, 'اليوم السابق →'),
      dateIn,
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => shiftDay(1) }, '← اليوم التالي'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.date = todayISO(); loadDay(); } }, 'اليوم')),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px' },
      'الحصص وساعات التدريب والمتدربون الفريدون تُحتسب تلقائيًا من الحصص المسجلة — بدّل التاريخ لمراجعة أي يوم سابق وتصحيحه.'),
    autoChips,
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const saved = await API.post('/api/trainer-logs', {
            date: state.date, checkIn: checkIn.value, checkOut: checkOut.value,
            officeHours: officeIn.value,
            goalsCreated: goals.value, stories: stories.value, reels: reels.value, notes: notes.value,
          });
          log.workHours = saved.workHours;
          officeIn.value = saved.workHours != null ? saved.workHours : '';
          drawAuto(saved.auto);
          toast(`حُفظ سجل ${state.date}` + (saved.workHours != null ? ` — الساعات المكتبية: ${saved.workHours} س.` : '.'));
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الحضور (من الساعة)', checkIn), field('الانصراف (إلى الساعة)', checkOut),
      el('div', { class: 'span-2' }, field('الساعات المكتبية (س)', officeIn)),
      field('أهداف تدريبية أنشأتها (يدويًا)', goals), field('ستوريات نشرتها', stories),
      field('ريلز/فيديوهات صوّرتها', reels), field('ملاحظات', notes),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ السجل'))));
  await loadDay();

  /* --- مهامي --- */
  const daily = tasks.filter((x) => x.type === 'daily' && x.date === todayISO());
  const monthly = tasks.filter((x) => x.type === 'monthly');
  const done = tasks.filter((x) => x.status === 'done').length;
  const taskRow = (x) => el('label', { class: 'task-row' },
    el('input', {
      type: 'checkbox', checked: x.status === 'done' || null,
      onchange: async (e) => {
        try {
          await API.put('/api/tasks/' + x.id, { status: e.target.checked ? 'done' : 'pending' });
          toast(e.target.checked ? 'أُنجزت المهمة ✓' : 'أُعيدت المهمة لقائمة الانتظار.');
        } catch (ex) { toast(ex.message, true); e.target.checked = !e.target.checked; }
      },
    }),
    el('span', { style: x.status === 'done' ? 'text-decoration:line-through;color:var(--app-muted)' : '' }, x.title),
    el('span', { class: 'tag ' + (x.type === 'monthly' ? 'tag--petrol' : 'tag--neutral'), style: 'margin-inline-start:auto' },
      x.type === 'monthly' ? 'شهرية' : 'اليوم'));

  const tasksCard = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'مهامي من الإدارة',
      tasks.length ? el('span', { style: 'min-width:130px' }, progressBar(Math.round((done / tasks.length) * 100))) : el('span')),
    tasks.length
      ? el('div', { style: 'display:flex;flex-direction:column;gap:4px' },
        ...daily.map(taskRow),
        monthly.length ? el('div', { class: 'sidebar__caption', style: 'padding:8px 0 2px' }, 'مهام الشهر') : '',
        ...monthly.map(taskRow))
      : el('div', { class: 'empty' }, 'لا مهام مسندة لهذا الشهر.'),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:10px' },
      'في نهاية الشهر يُحسب KPI تلقائيًا من نسبة إنجاز هذه المهام + تحقيق أهدافك.'));

  container.append(el('div', { class: 'grid-2eq' }, dailyCard, tasksCard));
}

/* ============================================================
   مركز القرارات (Action Center)
   لوحة لا تعرض أرقامًا فقط — بل تحوّل كل مشكلة يكتشفها النظام
   إلى إجراء له سبب وأولوية ومسؤول وزر تنفيذ مباشر.
   ============================================================ */

const PRIORITY_META = {
  urgent: { emoji: '🔴', title: 'إجراءات عاجلة', hint: 'تحتاج تنفيذًا اليوم', tag: 'tag--danger' },
  important: { emoji: '🟡', title: 'إجراءات مهمة', hint: 'تحتاج متابعة خلال الأيام القادمة', tag: 'tag--warning' },
  improve: { emoji: '🟢', title: 'إجراءات تحسين', hint: 'ليست عاجلة لكنها ترفع الأداء', tag: 'tag--accent' },
};

const ACTION_TYPE_LABELS = {
  absence: 'غياب متكرر', renewal: 'تجديد اشتراك', followup: 'متابعة بعد الغياب',
  rating: 'تقييم متدرب', measurements: 'قياسات ناقصة', progress: 'تعثّر النتائج',
  retention: 'نسبة التجديد', 'absence-rate': 'نسبة الغياب', revenue: 'التحصيل',
  attendance: 'معدل الحضور', goal: 'بلا هدف تدريبي',
  'weekly-gap': 'نقص حصص الأسبوع', pace: 'إيقاع أسرع من الباقة',
  weighing: 'الميزان الأسبوعي', payment: 'متابعة دفعة',
  'trainer-log': 'إدخال المدرب', 'no-input': 'يوم بلا إدخال',
  birthday: 'عيد ميلاد غدًا',
};

const THRESHOLD_FIELDS = [
  ['acAbsences', 'عدد الغيابات قبل مهمة التواصل', 'غياب'],
  ['acFollowupDays', 'أيام بلا تواصل بعد الغياب', 'يوم'],
  ['acRemaining', 'الحصص المتبقية التي تُطلق التجديد', 'حصة'],
  ['acMeasureDays', 'أيام بلا تسجيل قياسات من المدرب', 'يوم'],
  ['acProgressWeeks', 'أسابيع بلا تقدّم قبل مراجعة الخطة', 'أسبوع'],
  ['acRetentionPct', 'الحد الأدنى لنسبة التجديد', '%'],
  ['acAbsenceRatePct', 'الحد الأقصى لنسبة الغياب', '%'],
  ['acAttendancePct', 'الحد الأدنى لمعدل الحضور', '%'],
  ['acRevenueTolerance', 'تسامح التحصيل عن الهدف', '%'],
  ['acWeighDays', 'أيام بلا وزن قبل تنبيه الميزان', 'يوم'],
  ['acPayFollowDays', 'أيام بلا دفعة على مستحق قبل المتابعة', 'يوم'],
  ['acTrainerLogDays', 'أيام عمل المدرب بلا إدخال ساعاته', 'يوم'],
  ['acWeeklyGapWeeks', 'أسابيع فحص انضباط الحصص', 'أسبوع'],
];

async function viewActionCenter(root) {
  /* الفلاتر في العنوان: التحديث أو زرّ الرجوع لا يُعيدانك للبداية،
     والرابط يُنسخ لزميل فيرى القائمة نفسها. */
  const state = urlState({ branch: '', showHandled: false, priority: '' });
  /* المدرب نطاقه متدربوه لا فرعٌ يختاره — فلا منتقي فرع ولا عتبات */
  const isTrainer = API.user.role === 'trainer';
  const container = el('div', { class: 'content' });
  root.append(container);

  /* بعد تنفيذ إجراء تُعاد البطاقات كلها — ومكان القارئ في القائمة يبقى
     كما هو («ما يرجع للاول — اضل وين انا واصل»). */
  const render = (...args) => keepScroll(() => build(...args));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard('جارٍ تحليل بيانات النظام واستخراج الإجراءات المطلوبة…'));
    const [data, branches, log] = await Promise.all([
      API.get('/api/action-center' + (state.branch ? '?branch=' + state.branch : '')),
      isTrainer ? Promise.resolve([]) : API.get('/api/branches'),
      API.get('/api/action-center/log').catch(() => []),
    ]);
    // مفتاح الدولة لروابط الواتساب — إعدادات النظام صلاحية إدارة
    if (!isTrainer) {
      try {
        const st = await API.get('/api/settings');
        OPS_SETTINGS.waCountryCode = st.waCountryCode || OPS_SETTINGS.waCountryCode || '970';
      } catch (e) { /* الافتراضي */ }
    }
    container.innerHTML = '';

    /* --- شريط الفلاتر --- */
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
      value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); },
    });
    const prioritySel = select([['', 'كل الأولويات'], ['urgent', '🔴 عاجل'], ['important', '🟡 مهم'], ['improve', '🟢 تحسين']], {
      value: state.priority, onchange: (e) => { state.priority = e.target.value; render(); },
    });
    container.append(el('div', { class: 'card filters' },
      isTrainer ? el('span') : field('الفرع', branchSel), field('الأولوية', prioritySel),
      el('button', {
        class: 'btn ' + (state.showHandled ? 'btn--accent' : 'btn--outline'),
        onclick: () => { state.showHandled = !state.showHandled; render(); },
      }, state.showHandled ? 'إخفاء المنفَّذة' : `عرض المنفَّذة (${data.summary.handled})`),
      el('button', { class: 'btn btn--outline', onclick: render }, '↻ تحديث')));

    /* --- الشرح: لماذا هذه الصفحة --- */
    container.append(el('div', { class: 'alert alert--info' },
      isTrainer
        ? 'هذه قراراتك أنت: النظام يفحص متدربيك ويحوّل كل ما يحتاج تدخّلك إلى إجراء جاهز — '
          + 'غياب يحتاج تواصلًا، أسبوع ناقص الحصص، من لم يتوزّن، من بلا هدف تدريبي، '
          + 'ومن قرب اشتراكه ينتهي فجهّز خطته. (الأرقام المالية وتقييمات المتدربين لا تظهر هنا.)'
        : 'هذه ليست لوحة أرقام — النظام يفحص بيانات اليوم ويحوّل كل مشكلة يكتشفها إلى إجراء جاهز للتنفيذ: '
          + 'لكل بطاقة سبب ظهورها، أولويتها، الشخص أو الفرع المسؤول، وأزرار تنفيذ مباشرة.'));

    /* --- عدّادات الأولويات --- */
    const s = data.summary;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(s.urgent, '🔴 إجراء عاجل — اليوم', 'alert'),
      kpiHero(s.important, '🟡 إجراء مهم — هذا الأسبوع', 'clock', 'blue'),
      kpiHero(s.improve, '🟢 إجراء تحسين', 'target', 'green')));

    /* --- الإجراءات مقسّمة حسب الأولوية --- */
    const visible = data.actions
      .filter((a) => (state.showHandled ? true : a.status === 'open'))
      .filter((a) => (state.priority ? a.priority === state.priority : true));

    if (!visible.length) {
      container.append(el('div', { class: 'card' },
        el('div', { class: 'empty' }, isTrainer
        ? '🎉 لا إجراءات على متدربيك الآن — كل شيء ضمن الخطة.'
        : '🎉 لا إجراءات مطلوبة الآن — كل المؤشرات ضمن الحدود المتفق عليها.')));
    }

    ['urgent', 'important', 'improve'].forEach((priority) => {
      const list = visible.filter((a) => a.priority === priority);
      if (!list.length) return;
      const meta = PRIORITY_META[priority];
      const section = el('div', { class: 'card ac-section ac-section--' + priority },
        el('h3', { class: 'card__title' },
          `${meta.emoji} ${meta.title} (${list.length})`,
          el('span', { style: 'font-size:12px;color:var(--app-muted);font-weight:400' }, meta.hint)),
        el('div', { class: 'ac-list' }, ...list.map((a) => actionCard(a, render))));
      container.append(section);
    });

    /* --- عتبات الاكتشاف (المدير) --- */
    if (API.user.role === 'admin') container.append(thresholdsCard(data.thresholds, render));

    /* --- سجل التنفيذ --- */
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, isTrainer ? 'سجل ما نفّذتَه' : 'سجل تنفيذ الإجراءات — من نفّذ ومتى'),
      pagedTable(['التاريخ', 'الإجراء', 'الحالة', 'الملاحظة', 'المنفِّذ'],
        log,
        (l) => [l.date,
          ACTION_TYPE_LABELS[l.type] || (l.key || '').split(':')[0],
          l.status === 'done' ? el('span', { class: 'tag tag--accent' }, 'نُفّذ ✓')
            : l.status === 'assigned' ? el('span', { class: 'tag tag--petrol' }, 'أُسندت مهمة')
              : l.status === 'snoozed' ? el('span', { class: 'tag tag--warning' }, 'مؤجَّل حتى ' + (l.snoozeUntil || '—'))
                : el('span', { class: 'tag tag--neutral' }, 'أُعيد فتحه'),
          l.note || '—', l.byName],
        { pageSize: 8, emptyText: 'لا إجراءات منفَّذة بعد — نفّذ أول إجراء من البطاقات أعلاه.' })));
  }

  await render();
}

/* ============================================================
   بطاقة إجراء واحد
   ============================================================ */
function actionCard(a, onDone) {
  const meta = PRIORITY_META[a.priority];
  const handled = a.status !== 'open';

  /* أزرار التنفيذ المباشر */
  const buttons = a.actions.map((act) => {
    if (act.kind === 'wa') {
      const href = waLink(act.phone, OPS_SETTINGS.waCountryCode || '970', act.message, a.owner && a.owner.name);
      return href ? el('a', { class: 'btn btn--petrol btn--sm', target: '_blank', rel: 'noopener', href }, '💬 ' + act.label) : null;
    }
    if (act.kind === 'call') {
      return el('a', { class: 'btn btn--outline btn--sm', href: 'tel:' + String(act.phone).replace(/\s/g, '') }, '📞 ' + act.label);
    }
    if (act.kind === 'link') {
      /* لا يُعرض زرٌّ يقود إلى صفحة لا يفتحها هذا الدور — بطاقةُ التجديد
         عند المدرب تقوده لملف المتدرب لا لصفحة الباقات. */
      if (!canOpenRoute(act.href, API.user.role)) return null;
      return el('a', { class: 'btn btn--outline btn--sm', href: act.href }, act.label + ' ←');
    }
    if (act.kind === 'task' && API.user.role === 'admin') {
      return el('button', {
        class: 'btn btn--accent btn--sm',
        onclick: () => openActionTaskModal(a, act, onDone),
      }, '📋 ' + act.label);
    }
    return null;
  }).filter(Boolean);

  /* أزرار الحالة */
  const controls = el('div', { class: 'ac-card__controls' });
  if (handled) {
    controls.append(
      el('span', { class: 'tag ' + (a.status === 'snoozed' ? 'tag--warning' : 'tag--accent') },
        a.status === 'done' ? 'نُفّذ ✓' : a.status === 'assigned' ? 'أُسندت مهمة ✓' : 'مؤجَّل حتى ' + (a.snoozeUntil || '—')),
      a.handledBy ? el('span', { style: 'font-size:12px;color:var(--app-muted)' }, `${a.handledBy} · ${a.handledAt}${a.note ? ' — ' + a.note : ''}`) : '',
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => resolveAction(a, 'open', onDone) }, 'إعادة فتحه'));
  } else {
    controls.append(
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => openResolveModal(a, onDone) }, '✓ تم التنفيذ'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSnoozeModal(a, onDone) }, '⏰ تأجيل'));
  }

  return el('div', { class: 'ac-card ac-card--' + a.priority + (handled ? ' ac-card--handled' : '') },
    el('div', { class: 'ac-card__head' },
      el('div', { class: 'ac-card__title' }, a.title),
      el('span', { class: 'tag ' + meta.tag }, meta.emoji + ' ' + a.priorityLabel)),

    el('div', { class: 'ac-card__reason' },
      el('b', {}, 'سبب ظهور الإجراء: '), a.reason),
    a.suggestion ? el('div', { class: 'ac-card__suggestion' }, el('b', {}, 'الإجراء المطلوب: '), a.suggestion) : '',

    el('div', { class: 'ac-card__meta' },
      el('span', { class: 'macro' }, '👤 ', el('b', {}, a.ownerLabel || '—')),
      a.branchName ? el('span', { class: 'macro' }, '🏢 ', el('b', {}, a.branchName)) : '',
      el('span', { class: 'macro' }, 'النوع ', el('b', {}, ACTION_TYPE_LABELS[a.type] || a.type))),

    a.metrics && a.metrics.length
      ? el('div', { class: 'macros' }, ...a.metrics.map((m) => el('span', { class: 'macro' },
        m.label + ' ', el('b', {}, m.money ? fmtMoney(m.value) : m.value))))
      : '',

    buttons.length ? el('div', { class: 'ac-card__actions' }, ...buttons) : '',
    controls);
}

/* ============================================================
   تسجيل تنفيذ الإجراء
   ============================================================ */
async function resolveAction(a, status, onDone, extra = {}) {
  try {
    await API.post('/api/action-center/resolve', {
      key: a.key, status, type: a.type, title: a.title, priority: a.priority,
      traineeId: a.owner && a.owner.type === 'trainee' ? a.owner.id : null,
      trainerId: a.owner && a.owner.type === 'trainer' ? a.owner.id : null,
      branchId: a.owner && a.owner.type === 'branch' ? a.owner.id : null,
      ...extra,
    });
    toast(status === 'done' ? 'سُجّل تنفيذ الإجراء ✓'
      : status === 'snoozed' ? 'أُجّل الإجراء — سيعود تلقائيًا في موعده.'
        : 'أُعيد فتح الإجراء.');
    onDone && onDone();
  } catch (ex) { toast(ex.message, true); }
}

function openResolveModal(a, onDone) {
  const noteIn = textarea({ placeholder: 'ماذا فعلت؟ (اتصلت وردّ / جدّد الاشتراك / أعدنا جدولة الحصة…)', style: 'min-height:90px' });
  const close = modal('تسجيل تنفيذ الإجراء', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        close();
        await resolveAction(a, 'done', onDone, { note: noteIn.value });
      },
    },
      el('div', { class: 'alert alert--info' }, a.title),
      field('نتيجة التنفيذ (تُحفظ في سجل الإجراءات)', noteIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تأكيد التنفيذ')),
  ]);
}

function openSnoozeModal(a, onDone) {
  const daysSel = select([[1, 'غدًا'], [3, 'بعد 3 أيام'], [7, 'بعد أسبوع'], [14, 'بعد أسبوعين'], [30, 'بعد شهر']], { value: 3 });
  const noteIn = input({ placeholder: 'سبب التأجيل (اختياري)' });
  const close = modal('تأجيل الإجراء', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        close();
        await resolveAction(a, 'snoozed', onDone, { snoozeDays: Number(daysSel.value), note: noteIn.value });
      },
    },
      el('div', { class: 'alert alert--warning' }, 'الإجراء سيختفي مؤقتًا ثم يعود تلقائيًا إن بقيت المشكلة قائمة.'),
      field('أجّل حتى', daysSel), field('ملاحظة', noteIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تأجيل')),
  ]);
}

/* تحويل الإجراء إلى مهمة رسمية على مدرب */
async function openActionTaskModal(a, act, onDone) {
  const trainers = await API.get('/api/users?role=trainer');
  const trainerSel = select(trainers.map((t) => [t.id, t.name]), { value: act.trainerId || '' });
  const titleIn = input({ value: act.title || a.title });
  const dateIn = input({ type: 'date', value: todayISO() });

  const close = modal('تحويل الإجراء إلى مهمة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/action-center/task', {
            key: a.key, trainerId: Number(trainerSel.value), title: titleIn.value, date: dateIn.value,
          });
          toast('أُسندت المهمة — ووصل إشعار للمدرب، وسُجّل الإجراء كمُسنَد.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, el('div', { class: 'alert alert--info' }, 'تظهر المهمة في «مهامي» عند المدرب وتدخل في احتساب KPI الشهري.')),
      field('المدرب المسؤول', trainerSel), field('تاريخ التنفيذ', dateIn),
      el('div', { class: 'span-2' }, field('نص المهمة', titleIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إسناد المهمة'))),
  ]);
}

/* ============================================================
   عتبات الاكتشاف — متى يعتبر النظام الأمر مشكلة
   ============================================================ */
function thresholdsCard(thresholds, onDone) {
  const inputs = {};
  const grid = el('div', { class: 'form-grid' });
  THRESHOLD_FIELDS.forEach(([key, label, unit]) => {
    inputs[key] = input({ type: 'number', min: 0, value: thresholds[key] });
    grid.append(field(`${label} (${unit})`, inputs[key]));
  });
  grid.append(el('div', { class: 'span-2' },
    el('button', {
      class: 'btn btn--accent btn--full',
      onclick: async () => {
        const body = {};
        Object.entries(inputs).forEach(([k, inp]) => { body[k] = inp.value; });
        try {
          await API.put('/api/action-center/thresholds', body);
          toast('حُفظت العتبات — أُعيد فحص البيانات وفقها.');
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    }, 'حفظ العتبات وإعادة الفحص')));

  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'متى يعتبره النظام مشكلة؟ — عتبات الاكتشاف'),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'اضبط الحدود لتناسب سياسة الشركة — يُعاد استخراج الإجراءات فورًا وفق القيم الجديدة.'),
    grid);
}

/* ============================================================
   شريط مختصر للوحة الإدارة — يقود إلى مركز القرارات
   ============================================================ */
async function actionCenterBanner(onNavigate) {
  try {
    const data = await API.get('/api/action-center?status=open');
    const s = data.summary;
    if (!s.urgent && !s.important && !s.improve) {
      return el('div', { class: 'alert alert--info' }, '🎉 لا إجراءات مطلوبة اليوم — كل المؤشرات ضمن الحدود.');
    }
    const top = data.actions.filter((a) => a.priority === 'urgent').slice(0, 3);
    return el('div', { class: 'card ac-banner' },
      el('h3', { class: 'card__title' }, '🧭 مركز القرارات — ماذا يجب أن تفعل الآن؟',
        el('a', { class: 'btn btn--accent btn--sm', href: '#/actions' }, `فتح المركز (${s.urgent + s.important + s.improve}) ←`)),
      el('div', { class: 'macros', style: 'margin-bottom:8px' },
        el('span', { class: 'macro' }, '🔴 عاجل ', el('b', {}, String(s.urgent))),
        el('span', { class: 'macro' }, '🟡 مهم ', el('b', {}, String(s.important))),
        el('span', { class: 'macro' }, '🟢 تحسين ', el('b', {}, String(s.improve)))),
      top.length
        ? el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
          ...top.map((a) => el('div', { class: 'notif' },
            el('div', {}, el('b', {}, a.title),
              el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:2px' }, a.reason)),
            el('a', { class: 'btn btn--outline btn--sm', href: '#/actions' }, 'تنفيذ'))))
        : el('div', { class: 'empty' }, 'لا إجراءات عاجلة — راجع المهمة والتحسينية في المركز.'));
  } catch (e) {
    return el('span');
  }
}

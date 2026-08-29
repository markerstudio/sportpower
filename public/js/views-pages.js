/* الصفحات: التقويم، الاشتراكات، الفروع والمدربون، InBody، التغذية، التقارير */

/* ============================================================
   Calendar — أسبوعي مشترك
   ============================================================ */
/* «كيف وصلنا هذا المتدرب؟» — قائمة واحدة تُستعمل عند التسجيل وعند
   التصحيح لاحقًا («هاي القائمة اذا ادخلت الشخص وكان غلط بهدول كيف
   اعدل»)، فلا تختلف الخياراتُ بين الشاشتين. */
const SOURCE_OPTIONS = [
  ['new', 'زبون جديد — جاء مباشرة'],
  ['social', 'سوشال ميديا'],
  ['trainee', 'عن طريق متدرب عندنا'],
  ['friend', 'عن طريق صديق'],
  ['returned', 'عائد من التجميد'],
  ['trainer', 'عن طريق مدرب'],
];
const SOURCE_LABELS_AR = Object.fromEntries(SOURCE_OPTIONS);

async function viewCalendar(root) {
  /* branchScope: المدرب يرى مواعيده وحده افتراضيًا، ويستطيع فتح برنامج
     الفرع كاملًا (كل المدربين) — بطلب العميل. */
  /* «انا اختار الفرع بعدين اختار المدرب حتى يكون اسهل للادارة» */
  const state = urlState({ start: weekStart(new Date()), trainer: '', branch: '', branchScope: false });
  const container = el('div', { class: 'content' });
  root.append(container);
  const allBranches = ['admin', 'accountant'].includes(API.user.role)
    ? await API.get('/api/branches').catch(() => [])
    : [];

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const from = iso(state.start);
    const end = new Date(state.start); end.setDate(end.getDate() + 6);
    const to = iso(end);

    const trainerQ = state.trainer ? `&trainer=${state.trainer}` : '';
    const branchQ = state.branch ? `&branch=${state.branch}` : '';
    const scopeQ = API.user.role === 'trainer' && state.branchScope ? '&all=1' : '';
    const reqs = [
      API.get(`/api/appointments?from=${from}&to=${to}` + trainerQ + branchQ + scopeQ),
      API.get(`/api/sessions?from=${from}&to=${to}` + trainerQ + branchQ + scopeQ),
    ];
    // الإدارة والمحاسب يديران مواعيد كل المدربين
    const isAdmin = ['admin', 'accountant'].includes(API.user.role);
    if (isAdmin) reqs.push(API.get('/api/users?role=trainer'), API.get('/api/users?role=trainee'));
    else if (API.user.role === 'trainer') reqs.push(API.get('/api/users?role=trainer'), API.get('/api/users?role=trainee'));
    const [appts, weekSessions = [], trainers = [], trainees = []] = await Promise.all(reqs);
    // الحصة المسجلة من موعد لا تُعرض مرتين — يكفي الموعد المنفذ
    const linkedSessionIds = new Set(appts.map((a) => a.sessionId).filter(Boolean));
    const sessions = weekSessions.filter((s) => !linkedSessionIds.has(s.id));
    /* الموعد قد يكون لزائر Test بلا حساب — فاسمه مكتوب على الموعد نفسه */
    const personName = (a) => {
      if (!a.traineeId) return (a.prospectName || 'زائر Test') + ' (زائر)';
      const t = trainees.find((x) => x.id === a.traineeId);
      if (t) return t.name;
      if (API.user.role === 'trainee' && a.traineeId === API.user.id) return API.user.name;
      return 'متدرب #' + a.traineeId;
    };
    container.innerHTML = '';

    const title = `أسبوع ${from} → ${to}`;
    const toolbar = el('div', { class: 'card cal-toolbar' },
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => { state.start.setDate(state.start.getDate() - 7); render(); } }, 'الأسبوع السابق →'),
      el('div', { class: 'cal-toolbar__title' }, title),
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => { state.start.setDate(state.start.getDate() + 7); render(); } }, '← الأسبوع التالي'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.start = weekStart(new Date()); render(); } }, 'اليوم'));
    if (isAdmin) {
      /* الفرع أولًا ثم مدربوه وحدهم — فتقصر القائمة على من يعني الإدارة.
         تغيير الفرع يُسقط اختيار مدرب لم يعد ضمنه. */
      if (allBranches.length > 1) {
        toolbar.append(select([['', 'كل الفروع'], ...allBranches.map((b) => [b.id, b.name])], {
          value: state.branch, style: 'width:160px',
          onchange: (e) => {
            state.branch = e.target.value;
            const pick = trainers.find((t) => String(t.id) === String(state.trainer));
            if (pick && state.branch && String(pick.branchId) !== String(state.branch)) state.trainer = '';
            render();
          },
        }));
      }
      const inBranch = state.branch
        ? trainers.filter((t) => String(t.branchId) === String(state.branch))
        : trainers;
      toolbar.append(select([['', state.branch ? 'كل مدربي الفرع' : 'كل المدربين'],
        ...inBranch.map((t) => [t.id, t.name])], {
        value: state.trainer, style: 'width:170px', onchange: (e) => { state.trainer = e.target.value; render(); },
      }));
    }
    // المدرب: مواعيده وحده أو برنامج الفرع كاملًا بكل مدربيه
    if (API.user.role === 'trainer') {
      toolbar.append(select([['mine', 'مواعيدي أنا'], ['branch', 'برنامج الفرع — كل المدربين']], {
        value: state.branchScope ? 'branch' : 'mine', style: 'width:210px',
        onchange: (e) => { state.branchScope = e.target.value === 'branch'; render(); },
      }));
    }
    if (isAdmin || API.user.role === 'trainer') {
      toolbar.append(el('button', { class: 'btn btn--accent btn--sm', onclick: () => openApptModal(render, trainers, trainees) }, '+ إضافة موعد'));
    }
    container.append(toolbar);

    // شبكة الأسبوع 8:00 → 21:00
    const hours = []; for (let h = 8; h <= 21; h++) hours.push(h);
    const days = []; for (let i = 0; i < 7; i++) { const d = new Date(state.start); d.setDate(d.getDate() + i); days.push(d); }
    const grid = el('div', { class: 'cal-grid' });
    grid.append(el('div', { class: 'cal-grid__corner' }, ''));
    days.forEach((d) => grid.append(el('div', { class: 'cal-grid__day' + (iso(d) === todayISO() ? ' today' : '') },
      `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`)));
    hours.forEach((h) => {
      grid.append(el('div', { class: 'cal-grid__hour' }, `${String(h).padStart(2, '0')}:00`));
      days.forEach((d) => {
        const cell = el('div', { class: 'cal-grid__cell' + (iso(d) === todayISO() ? ' today' : '') });
        appts.filter((a) => a.date === iso(d) && Number(a.time.slice(0, 2)) === h)
          .sort((a, b) => a.time.localeCompare(b.time))
          .forEach((a) => {
            const trainer = trainers.find((t) => t.id === a.trainerId);
            const showTrainer = (isAdmin || (API.user.role === 'trainer' && state.branchScope)) && trainer;
            /* موعد متدرب فات وقته بلا حصة (أو عُلّم «منفذًا» بلا حصة أيام
               اللبس بين الموعد والحصة) — يُعلَّم للطاقم ليُسوّى: حصة أو غياب.
               لا يظهر للمتدرب كي لا يُقلقه شأن تسويةٍ داخلية. */
            const unsettled = (isAdmin || API.user.role === 'trainer')
              && a.traineeId && !a.sessionId
              && (a.status === 'done' || (a.status === 'scheduled' && a.date < todayISO()));
            const chip = el('button', { class: 'cal-chip ' + a.status, onclick: () => openApptModal(render, trainers, trainees, a) },
              el('b', {}, personName(a)),
              el('small', {}, ` ${a.time}` + (a.kind === 'makeup' ? ' · تعويض' : a.kind === 'test' ? ' · Test' : '') + (showTrainer ? ` · ${trainer.name.split(' ')[1] || trainer.name}` : '') + (unsettled ? ' · ⚠️ بلا حصة' : '')));
            cell.append(chip);
          });
        sessions.filter((s) => s.date === iso(d) && Number((s.time || '').slice(0, 2)) === h)
          .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
          .forEach((s) => {
            const trainer = trainers.find((t) => t.id === s.trainerId);
            const chip = el('button', { class: 'cal-chip session', onclick: () => openSessionInfoModal(s, personName(s), trainer && trainer.name) },
              el('b', {}, personName(s)),
              el('small', {}, ` ${s.time} · حصة منفذة` + (s.kind === 'makeup' ? ' · تعويض' : '') + (isAdmin && trainer ? ` · ${trainer.name.split(' ')[1] || trainer.name}` : '')));
            cell.append(chip);
          });
        grid.append(cell);
      });
    });
    container.append(el('div', { class: 'card', style: 'padding:0;overflow-x:auto' }, grid));
    container.append(el('div', { class: 'card cal-legend' },
      el('span', { class: 'cal-chip', style: 'display:inline-block;width:auto' }, 'موعد مجدول'),
      el('span', { class: 'cal-chip done', style: 'display:inline-block;width:auto' }, 'موعد منفذ'),
      el('span', { class: 'cal-chip session', style: 'display:inline-block;width:auto' }, 'حصة مسجلة'),
      /* الفرق الذي أوقع المدربين في اللبس — يُقال صراحة تحت الدليل */
      el('div', { style: 'flex-basis:100%;font-size:12px;color:var(--app-muted)' },
        'الموعد حجزٌ في البرنامج فقط ولا يخصم من الرصيد — «تسجيل الحصة» هو ما يخصمها ويعلّم الموعد منفذًا تلقائيًا.'
        + (isAdmin || API.user.role === 'trainer'
          ? ' ⚠️ بلا حصة = موعد فات دون تسجيل، ويُحسب المجدولُ منه غيابًا في التقارير حتى يُسوّى من نافذته أو من «بلا تسوية» في لوحة المدرب.'
          : ''))));
  }

  await render();
}

/* بطاقة معلومات لحصة مسجلة — عرض فقط (تُدار الحصص من صفحة الاشتراكات والحصص) */
function openSessionInfoModal(s, traineeName, trainerName) {
  const row = (label, val) => (val || val === 0)
    ? el('div', { class: 'span-2', style: 'display:flex;gap:8px' }, el('b', {}, label + ':'), el('span', {}, String(val)))
    : el('span');
  modal('تفاصيل الحصة المسجلة', [
    el('div', { class: 'form-grid' },
      row('المتدرب', traineeName),
      row('المدرب', trainerName),
      row('التاريخ', s.date + ' · ' + s.time),
      row('المدة', s.duration ? s.duration + ' دقيقة' : ''),
      row('النوع', s.kind === 'makeup' ? 'تعويضية (مخصومة من الاشتراك)' : s.kind === 'absence' ? 'غياب (مخصوم)' : 'عادية'),
      row('الأسلوب', s.style),
      row('الوزن المسجل', s.weight ? s.weight + ' كغ' : ''),
      row('ملاحظات', s.notes)),
  ]);
}

function weekStart(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; } // الأحد بداية الأسبوع
function iso(d) { return d.toISOString().slice(0, 10); }

async function openApptModal(onDone, trainers, trainees, existing, prefillTraineeId) {
  const isAdmin = ['admin', 'accountant'].includes(API.user.role);
  const isStaff = isAdmin || API.user.role === 'trainer';
  if (!trainees.length) trainees = await API.get('/api/users?role=trainee');
  /* المدرب أيضًا يختار المدرب: البرنامج اليومي يُوزَّع بين المدربين، وله أن
     يحجز موعدًا على برنامج زميله كما تفعل الإدارة (بطلب العميل). */
  if (isStaff && (!trainers || !trainers.length)) trainers = await API.get('/api/users?role=trainer').catch(() => []);
  const trainerSel = isStaff && trainers.length
    ? select(trainers.map((t) => [t.id, t.name]), {
      value: existing ? existing.trainerId : (API.user.role === 'trainer' ? API.user.id : undefined),
    })
    : null;
  /* الفرع أولًا ثم مدربوه — الإدارة والمحاسب يختاران الفرع فتقصر قائمة
     المدربين عليه بدل عرض مدربي الشركة كلها. */
  const apptBranches = isAdmin ? await API.get('/api/branches').catch(() => []) : [];
  const branchPick = isAdmin && apptBranches.length > 1 && trainerSel
    ? select([['', 'كل الفروع'], ...apptBranches.map((b) => [b.id, b.name])], {
      value: existing ? (trainers.find((t) => t.id === existing.trainerId) || {}).branchId || '' : '',
    })
    : null;
  const syncTrainerList = () => {
    if (!branchPick || !trainerSel) return;
    const keep = trainerSel.value;
    const list = branchPick.value
      ? trainers.filter((t) => String(t.branchId) === String(branchPick.value))
      : trainers;
    trainerSel.innerHTML = '';
    list.forEach((t) => trainerSel.append(el('option', { value: t.id }, t.name)));
    if (list.some((t) => String(t.id) === String(keep))) trainerSel.value = keep;
  };
  if (branchPick) branchPick.addEventListener('change', syncTrainerList);
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: existing ? existing.traineeId || '' : (prefillTraineeId || '') });
  // «تعويض» و«test» (حصة تجريبية) — بطلب العميل في البرنامج اليومي
  const kindSel = select([['regular', 'عادية'], ['makeup', 'تعويض'], ['test', 'Test — حصة تجريبية']],
    { value: existing && ['makeup', 'test'].includes(existing.kind) ? existing.kind : 'regular' });
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  const timeIn = input({ type: 'time', value: existing ? existing.time : '17:00' });
  const durIn = input({ type: 'number', value: existing ? existing.duration : 60, min: 15, step: 15 });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });
  /* «منفذة» لا تُختار يدويًا لموعد متدرب لم تُسجَّل حصته: كان المدربون
     يعلّمونها ظنًا أنها تسجّل الحصة — بلا خصم ولا سجل، والخادم يرفضها الآن.
     البند يظهر فقط حين يكون الموعد منفذًا فعلًا (حصة مرتبطة أو حالة قديمة
     تُركت لتصحيحها بإرجاعها «مجدولة» ثم تسجيل حصتها). */
  const manualDoneOk = existing && (!existing.traineeId || existing.sessionId || existing.status === 'done');
  const statusSel = existing ? select([
    ['scheduled', 'مجدولة'],
    ...(manualDoneOk ? [['done', 'منفذة']] : []),
    ['cancelled', 'ملغاة'],
  ], { value: existing.status }) : null;

  /* صاحب الـ Test زائر جديد: لم يشترك بعد ولا حساب له ولا صفحة — فيُكتب
     اسمه وجواله يدويًا، ويتحوّل لحساب كامل حين يشترك. */
  const isProspect = !!(existing && !existing.traineeId);
  const prospectNameIn = input({ value: existing ? existing.prospectName || '' : '', placeholder: 'اسم الزائر الجديد' });
  const prospectPhoneIn = input({ value: existing ? existing.prospectPhone || '' : '', placeholder: '05XXXXXXXX', dir: 'ltr', style: 'text-align:end' });
  const manualChk = input({ type: 'checkbox' });
  manualChk.checked = isProspect;
  const manualField = el('label', {
    class: 'span-2',
    style: 'display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer',
  }, manualChk, el('span', {}, 'شخص جديد غير مسجّل — إدخال يدوي بالاسم (لا حساب له بعد)'));
  const traineeField = field('المتدرب', traineeSel);
  const prospectFields = el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' },
    field('اسم الشخص', prospectNameIn), field('رقم الجوال', prospectPhoneIn));

  const manualMode = () => kindSel.value === 'test' && manualChk.checked;
  const syncKind = () => {
    const test = kindSel.value === 'test';
    manualField.style.display = test && !existing ? '' : (isProspect ? '' : 'none');
    if (isProspect) { manualChk.checked = true; manualChk.disabled = true; }
    prospectFields.style.display = manualMode() ? '' : 'none';
    traineeField.style.display = manualMode() ? 'none' : '';
  };
  kindSel.addEventListener('change', syncKind);
  manualChk.addEventListener('change', syncKind);

  /* المدرب يضيف لزميله لكنه لا يعدّل موعدًا على برنامج زميله — يظهر له
     للاطّلاع فقط بدل أن يصطدم برفض الخادم بعد ملء النموذج. */
  const readOnly = !!(existing && API.user.role === 'trainer' && existing.trainerId !== API.user.id);

  /* توضيح الفرق الذي أوقع المدربين في اللبس: الموعد حجز لا يخصم رصيدًا،
     والحصة تُسجَّل من زرها فتُخصم ويُعلَّم الموعد منفذًا تلقائيًا. */
  const needsSession = !!(existing && existing.traineeId && !existing.sessionId && existing.status !== 'cancelled');
  const clarify = !existing
    ? el('div', { class: 'alert alert--info span-2', style: 'margin:0' },
      'الموعد حجزٌ في البرنامج فقط ولا يخصم من رصيد المتدرب — يوم التنفيذ سجِّل الحصة من زر «تسجيل الحصة» فتُخصم ويُعلَّم الموعد منفذًا تلقائيًا.')
    : existing.sessionId
      ? el('div', { class: 'alert alert--info span-2', style: 'margin:0' }, '✓ هذا الموعد منفذ وحصته مسجلة ومخصومة من الرصيد.')
      : needsSession
        ? el('div', { class: 'alert alert--info span-2', style: 'margin:0' },
          'لم تُسجَّل حصة لهذا الموعد بعد — الموعد وحده لا يخصم من الرصيد'
          + (existing.date < todayISO() && existing.status === 'scheduled' ? '، وما دام فائتًا بلا تسوية فهو محسوب غيابًا في التقارير' : '')
          + '. عند التنفيذ سجِّل الحصة (أو الغياب) من زر «تسجيل الحصة المنفذة».')
        : el('span');
  // تسوية الموعد من نافذته مباشرة — المدرب والإدارة (المحاسب لا يسجّل حصصًا)
  const canLogSession = needsSession && ['admin', 'trainer'].includes(API.user.role);

  const close = modal(existing ? 'تعديل موعد' : 'إضافة موعد جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const manual = manualMode();
        if (manual && !prospectNameIn.value.trim()) { toast('اكتب اسم صاحب الـ Test.', true); return; }
        if (!manual && !traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const body = {
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            traineeId: manual ? null : Number(traineeSel.value), kind: kindSel.value,
            prospectName: manual ? prospectNameIn.value.trim() : undefined,
            prospectPhone: manual ? prospectPhoneIn.value.trim() : undefined,
            date: dateIn.value, time: timeIn.value, duration: Number(durIn.value), note: noteIn.value,
          };
          if (existing) {
            body.status = statusSel.value;
            await API.put('/api/appointments/' + existing.id, body);
            toast('تم تعديل الموعد — وأُرسل إشعار بالتغيير.');
          } else {
            await API.post('/api/appointments', body);
            toast(manual ? 'أُضيف موعد الـ Test باسم الزائر.' : 'تمت إضافة الموعد — وصل إشعار للمدرب والمتدرب.');
          }
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      clarify,
      branchPick ? field('الفرع', branchPick) : el('span'),
      trainerSel ? field('المدرب', trainerSel) : el('span'),
      field('نوع الحصة', kindSel),
      manualField,
      traineeField,
      prospectFields,
      field('التاريخ', dateIn),
      field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn),
      statusSel ? field('الحالة', statusSel) : el('span'),
      el('div', { class: 'span-2' }, field('ملاحظة', noteIn)),
      /* تسوية الموعد من مكانه: تسجيل الحصة يخصمها ويربطها ويعلّم الموعد
         منفذًا — وهو الإجراء الأول لموعد بلا حصة، فحفظ التعديل يصير ثانويًا */
      canLogSession
        ? el('div', { class: 'span-2' }, el('button', {
          class: 'btn btn--accent btn--full', type: 'button',
          onclick: () => {
            close();
            openLogSessionModal(onDone, {
              traineeId: existing.traineeId, trainerId: existing.trainerId,
              date: existing.date, time: existing.time, duration: existing.duration,
              kind: existing.kind === 'test' ? 'makeup' : existing.kind,
              appointmentId: existing.id,
            });
          },
        }, 'تسجيل الحصة المنفذة — تُخصم وتُعلّم الموعد منفذًا ←'))
        : el('span'),
      el('div', { class: 'span-2' }, readOnly
        ? el('div', { class: 'alert alert--info', style: 'margin:0' }, `هذا الموعد على برنامج ${(trainers.find((t) => t.id === existing.trainerId) || {}).name || 'مدرب آخر'} — للاطّلاع فقط. يعدّله صاحبه أو الإدارة.`)
        : el('button', { class: 'btn ' + (canLogSession ? 'btn--outline' : 'btn--accent') + ' btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إضافة الموعد')),
      /* الزائر الذي أعجبه الـ Test يتحوّل لزبون كامل من هنا — ببياناته نفسها،
         ويُنسب موعده القديم لحسابه الجديد فلا ينقطع تاريخه. */
      isProspect && isAdmin
        ? el('div', { class: 'span-2' }, el('button', {
          class: 'btn btn--outline btn--full', type: 'button',
          onclick: () => {
            close();
            openOnboardModal(onDone, {
              name: prospectNameIn.value.trim(), phone: prospectPhoneIn.value.trim(), apptId: existing.id,
            });
          },
        }, 'تسجيله زبونًا (Onboarding) ←'))
        : el('span'),
      /* حذف موعد أُدخل بالخطأ — الإدارة لأي موعد، والمدرب لمواعيده هو */
      existing && (isAdmin || existing.trainerId === API.user.id)
        ? el('div', { class: 'span-2' }, el('button', {
          class: 'btn btn--ghost btn--full', type: 'button', style: 'color:var(--status-danger)',
          onclick: async () => {
            if (!confirm('حذف هذا الموعد نهائيًا؟ للمواعيد المُدخلة بالخطأ — ويصل إشعار للمتدرب بإلغائه.')) return;
            try {
              await API.del('/api/appointments/' + existing.id);
              toast('حُذف الموعد من البرنامج.'); close(); onDone && onDone();
            } catch (ex) { toast(ex.message, true); }
          },
        }, 'حذف الموعد'))
        : el('span')),
  ]);
  syncKind();
  syncTrainerList();
  if (isProspect) {
    prospectFields.style.display = '';
    traineeField.style.display = 'none';
  }
  if (readOnly) {
    [branchPick, trainerSel, traineeSel, kindSel, dateIn, timeIn, durIn, noteIn, statusSel, prospectNameIn, prospectPhoneIn, manualChk]
      .forEach((n) => { if (n) n.disabled = true; });
  }
}

/* ============================================================
   Onboarding — تسجيل زبون جديد بخطوة واحدة
   ============================================================ */
async function openOnboardModal(onDone, prefill = {}) {
  const [branches, trainers, packages] = await Promise.all([
    API.get('/api/branches'),
    API.get('/api/users?role=trainer'),
    API.get('/api/packages').catch(() => []),
  ]);

  const nameIn = input({ placeholder: 'الاسم الكامل *', value: prefill.name || '' });
  const phoneIn = input({ placeholder: '05XXXXXXXX *', dir: 'ltr', style: 'text-align:end', value: prefill.phone || '' });
  const birthIn = input({ type: 'date', value: prefill.birthDate || '' });
  /* مكان السكن: يُجمَّع في تقرير المناطق — «من أي منطقة يأتي مشتركونا فعلًا» */
  const residenceIn = input({ placeholder: 'الحي / المنطقة — مثال: الرمال', value: prefill.residence || '' });
  const branchSel = select(branches.map((b) => [b.id, b.name]), prefill.branchId ? { value: prefill.branchId } : {});
  const goalSel = select(Object.entries(GOAL_LABELS), prefill.goal ? { value: prefill.goal } : {});
  const referralIn = input({ placeholder: 'مثال: SP-AHMAD (اختياري)', dir: 'ltr', style: 'text-align:end' });
  const sourceTrainerSel = select([['', 'لا — قناة أخرى'], ...trainers.map((t) => [t.id, t.name])]);

  /* كيف وصلنا هذا المتدرب؟ — يظهر في KPI المبيعات وفي «كيف وصلنا المشتركون» */
  const trainees = await API.get('/api/users?role=trainee').catch(() => []);
  const activeTrainees = trainees.filter((t) => t.active !== false);
  const sourceTypeSel = select(SOURCE_OPTIONS, { value: prefill.sourceType || 'new' });
  const sourcePersonSel = searchSelect(activeTrainees.map(traineeOption), { placeholder: 'اكتب اسم المتدرب…' });
  const sourceNameIn = input({ placeholder: 'اسم الصديق إن لم يكن مشتركًا عندنا' });
  const sourcePersonField = field('اسم المتدرب المُحيل', sourcePersonSel);
  const sourceNameField = field('اسم الصديق (خارج النظام)', sourceNameIn);
  const syncSource = () => {
    const v = sourceTypeSel.value;
    // متدرب/صديق: نختاره من المسجّلين إن كان فعّالًا عندنا، وإلا نكتب اسمه
    sourcePersonField.style.display = ['trainee', 'friend'].includes(v) ? '' : 'none';
    sourceNameField.style.display = ['friend', 'social'].includes(v) ? '' : 'none';
    if (v === 'social') sourceNameField.querySelector('label').textContent = 'المنصة (انستغرام/تيك توك/فيسبوك…)';
    else sourceNameField.querySelector('label').textContent = 'اسم الصديق (خارج النظام)';
  };
  sourceTypeSel.addEventListener('change', syncSource);

  /* الباقة تملأ الحصص والقيمة وتاريخ الانتهاء تلقائيًا — مع إمكانية التعديل اليدوي */
  const active = packages.filter((p) => p.active !== false);
  const pkgSel = select([['', 'باقة مخصّصة (إدخال يدوي)'],
    ...active.map((p) => [p.id, `${p.name} — ${p.sessions} حصة — ${fmtMoney(p.price)}`])],
  { value: prefill.packageId || '' });
  const totalSel = input({ type: 'number', min: 1, value: prefill.totalSessions || 12 });
  const priceIn = input({ type: 'number', min: 0, value: prefill.price !== undefined ? prefill.price : 1200 });
  // عنوان القيمة والدفعة يتبع عملة الفرع المختار (عمّان بالدينار)
  const priceLabel = curLabel('القيمة', branchCurrency(Number(branchSel.value) || null));
  const payLabel = curLabel('المبلغ المدفوع الآن', branchCurrency(Number(branchSel.value) || null));
  branchSel.addEventListener('change', () => {
    const c = branchCurrency(Number(branchSel.value) || null);
    priceLabel.setCurrency(c); payLabel.setCurrency(c);
  });
  const startIn = input({ type: 'date', value: todayISO() });
  const endDefault = new Date(); endDefault.setMonth(endDefault.getMonth() + 1);
  const endIn = input({ type: 'date', value: prefill.endDate || endDefault.toISOString().slice(0, 10) });

  const applyPackage = () => {
    const p = active.find((x) => String(x.id) === String(pkgSel.value));
    if (!p) return;
    totalSel.value = p.sessions;
    priceIn.value = p.price;
    const end = new Date(startIn.value || todayISO());
    end.setDate(end.getDate() + (p.durationDays || 30));
    endIn.value = end.toISOString().slice(0, 10);
  };
  pkgSel.addEventListener('change', applyPackage);
  startIn.addEventListener('change', () => { if (pkgSel.value) applyPackage(); });

  const payIn = input({ type: 'number', min: 0, placeholder: 'اتركه فارغًا إن لم يدفع الآن' });
  const payDateIn = input({ type: 'date', value: todayISO() });
  const methodSel = select([['كاش', 'كاش'], ['بطاقة', 'بطاقة'], ['تحويل بنكي', 'تحويل بنكي']]);

  const apptTrainerSel = select([['', 'بدون موعد الآن'], ...trainers.map((t) => [t.id, t.name])]);
  const apptDate = input({ type: 'date', value: todayISO() });
  const apptTime = input({ type: 'time', value: '17:00' });

  const section = (title) => el('div', { class: 'span-2 sidebar__caption', style: 'padding:6px 0 0' }, title);
  const body = el('div');
  const close = modal('تسجيل زبون جديد — Onboarding', [body], { wide: true });

  function showForm() {
    body.innerHTML = '';
    body.append(el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const res = await API.post('/api/onboard', {
            name: nameIn.value, phone: phoneIn.value, birthDate: birthIn.value || null,
            residence: residenceIn.value.trim() || null,
            branchId: Number(branchSel.value), goal: goalSel.value,
            referralCode: referralIn.value || null, leadId: prefill.leadId || null,
            contractId: prefill.contractId || null, apptId: prefill.apptId || null,
            sourceTrainerId: sourceTrainerSel.value ? Number(sourceTrainerSel.value) : null,
            sourceType: sourceTypeSel.value,
            sourceRefId: ['trainee', 'friend'].includes(sourceTypeSel.value) && sourcePersonSel.value
              ? Number(sourcePersonSel.value)
              : (sourceTypeSel.value === 'trainer' && sourceTrainerSel.value ? Number(sourceTrainerSel.value) : null),
            sourceName: sourceNameIn.value || null,
            subscription: {
              totalSessions: Number(totalSel.value), price: Number(priceIn.value),
              packageId: pkgSel.value || null, startDate: startIn.value, endDate: endIn.value,
            },
            payment: payIn.value ? { amount: Number(payIn.value), method: methodSel.value, date: payDateIn.value } : null,
            appointment: apptTrainerSel.value ? { trainerId: Number(apptTrainerSel.value), date: apptDate.value, time: apptTime.value } : null,
          });
          showSuccess(res);
        } catch (ex) { toast(ex.message, true); btn.disabled = false; }
      },
    },
      section('١ — بيانات المتدرب'),
      field('الاسم الكامل *', nameIn), field('رقم الجوال *', phoneIn),
      field('تاريخ الميلاد', birthIn), field('مكان السكن (الحي/المنطقة)', residenceIn),
      field('الفرع', branchSel), field('الهدف', goalSel),
      el('div', { class: 'span-2' }, field('كود إحالة صديق', referralIn)),
      el('div', { class: 'span-2 sidebar__caption', style: 'padding:6px 0 0' }, 'كيف وصلنا هذا المتدرب؟'),
      field('القناة', sourceTypeSel),
      sourcePersonField, sourceNameField,
      el('div', { class: 'span-2' }, field('جاء عن طريق مدرب؟ (يُحتسب للمدرب في تقريره)', sourceTrainerSel)),
      section('٢ — الاشتراك والباقة'),
      el('div', { class: 'span-2' }, field('الباقة', pkgSel)),
      field('عدد الحصص', totalSel), field(priceLabel, priceIn),
      field('تاريخ البدء', startIn), field('تاريخ الانتهاء', endIn),
      section('٣ — الدفعة الأولى (اختياري)'),
      field(payLabel, payIn), field('تاريخ الدفعة', payDateIn),
      el('div', { class: 'span-2' }, field('طريقة الدفع', methodSel)),
      section('٤ — أول حصة (اختياري)'),
      el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px' },
        field('المدرب', apptTrainerSel), field('التاريخ', apptDate), field('الساعة', apptTime)),
      el('div', { class: 'span-2' },
        el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'إنشاء الحساب وتفعيل الاشتراك'))));
    syncSource();
  }

  function showSuccess(res) {
    const creds = `بيانات دخولك لنظام سبورت باور:\nالرابط: ${location.origin}\nاسم المستخدم: ${res.credentials.username}\nكلمة المرور: ${res.credentials.password}\n(كلمة المرور مؤقتة — سيُطلب منك تغييرها عند أول دخول)`;
    const waMsg = `أهلًا ${res.user.name} 💪 تم تفعيل اشتراكك في سبورت باور: ${res.subscription.totalSessions} حصة حتى ${res.subscription.endDate}.\n\n${creds}`;
    body.innerHTML = '';
    body.append(
      el('div', { class: 'alert alert--info' }, `✅ تم تسجيل «${res.user.name}» وتفعيل اشتراكه${res.payment ? ' وتسجيل دفعته' : ''}${res.appointment ? ' وحجز أول حصة' : ''}.`),
      el('div', { class: 'card', style: 'box-shadow:none;border:1.5px dashed var(--app-line)' },
        el('h3', { class: 'card__title' }, 'بيانات الدخول — تظهر مرة واحدة فقط'),
        el('div', { style: 'font-family:var(--font-mono);direction:ltr;text-align:left;font-size:14px;line-height:2' },
          `المستخدم: ${res.credentials.username}`, el('br'), `كلمة المرور: ${res.credentials.password}`)),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        el('a', {
          class: 'btn btn--accent', target: '_blank',
          href: waLink(res.user.phone, OPS_SETTINGS.waCountryCode || '970', waMsg, res.user.name),
        }, 'إرسال البيانات واتساب'),
        el('button', {
          class: 'btn btn--outline',
          onclick: (e) => { navigator.clipboard.writeText(creds).then(() => toast('نُسخت بيانات الدخول.')); },
        }, 'نسخ البيانات'),
        el('button', { class: 'btn btn--ghost', onclick: () => { close(); onDone && onDone(); } }, 'إغلاق')));
  }

  showForm();
}

/* ============================================================
   إدارة الاشتراكات والحصص
   ============================================================ */
async function viewSubscriptions(root) {
  const container = el('div', { class: 'content' });
  root.append(container);
  /* latest افتراضيًا: «البحث يبطلع الاسم مره وحده والاشتراك الاخير» */
  const state = urlState({ branch: '', all: false });
  const branches = await API.get('/api/branches').catch(() => []);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    // القوائم الكبيرة تُحمَّل صفحةً صفحة من الخادم مع أسماء متدربيها —
    // ولا تُحمَّل قائمة المتدربين كاملة إلا عند فتح نافذة تحتاجها.
    const byName = (s) => s.traineeName || '#' + s.traineeId;
    const pageQuery = ({ query, page, pageSize }, extra = '') =>
      `limit=${pageSize}&offset=${page * pageSize}` + (query ? '&search=' + encodeURIComponent(query) : '')
      + (state.branch ? `&branch=${state.branch}` : '') + extra;
    const loadTrainees = () => API.get('/api/users?role=trainee');

    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
      value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); },
    });
    /* المدرب المخوَّل بالتجديد يفتح هذه الصفحة للتجديد وحده: فتحُ زبون
       جديد وتسجيلُ الحصص من هنا ليسا من صلاحيته، فلا يُعرض له زرّهما. */
    const canOnboard = ['admin', 'accountant'].includes(API.user.role);
    const bar = el('div', { class: 'card filters' },
      field('الفرع', branchSel),
      el('div', { style: 'flex:1' }),
      canOnboard
        ? el('button', { class: 'btn btn--accent', onclick: () => openOnboardModal(render) }, '+ زبون جديد (Onboarding)')
        : el('span'),
      el('button', { class: 'btn btn--outline', onclick: async () => openSubModal(render, await loadTrainees()) }, 'تجديد اشتراك لمتدرب حالي'));
    // تسجيل الحصص للمدرب/الإدارة — وليس المحاسب
    if (API.user.role === 'admin') {
      bar.append(el('button', { class: 'btn btn--outline', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة'));
    }
    if (API.user.role === 'trainer') {
      container.append(el('div', { class: 'alert alert--info' },
        'مُنحت صلاحية تجديد الاشتراكات: تُجدِّد لمشترك سابق في فرعك من زرّ «تجديد اشتراك لمتدرب حالي». '
        + 'فتحُ زبون جديد وتسجيلُ الدفعات يبقيان للإدارة والمحاسبة.'));
    }
    container.append(bar);

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' },
        state.all ? 'كل الاشتراكات — كل تجديد بسطره' : 'المشتركون — كل اسم مرة واحدة باشتراكه الأخير',
        el('button', {
          class: 'btn btn--outline btn--sm',
          onclick: () => { state.all = !state.all; render(); },
        }, state.all ? 'اعرض الاشتراك الأخير لكل شخص' : 'اعرض كل الاشتراكات (كل تجديد بسطره)')),
      el('div', { class: 'sidebar__caption', style: 'padding:0 0 10px' },
        state.all
          ? 'من جدّد خمس مرات يظهر بخمسة أسطر — للمراجعة المحاسبية والتاريخ الكامل.'
          : 'من جدّد خمس مرات يظهر مرة واحدة باشتراكه الحالي، ومعه عدد اشتراكاته السابقة.'),
      pagedTable(['المتدرب', 'الحصص', 'المستخدم', 'المتبقي', 'القيمة', 'من', 'إلى', 'الحالة', ''],
        null,
        (s) => {
          const nameLink = el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, byName(s));
          const act = async (action, label) => {
            const doIt = async (reason) => {
              try { await API.post(`/api/subscriptions/${s.id}/action`, { action, reason: reason || '' }); toast('تم — وسُجّل الحدث في المتابعة اليومية والتقارير.'); render(); }
              catch (ex) { toast(ex.message, true); }
            };
            // سبب الإلغاء يُسجَّل لتحليل أسباب خسارة العملاء في تقرير النمو
            if (action === 'cancel') { openCancelReasonModal(`إلغاء اشتراك ${byName(s)}`, doIt); return; }
            if (!confirm(`${label} اشتراك ${byName(s)}؟`)) return;
            doIt();
          };
          /* عدد اشتراكاته السابقة بجانب اسمه في وضع «اسم مرة واحدة» */
          const nameCell = s.subsCount > 1
            ? el('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, nameLink,
              el('span', { class: 'tag tag--neutral', title: 'عدد اشتراكاته منذ انضمامه' }, `${s.subsCount} اشتراكات`))
            : nameLink;
          return [nameCell,
            el('span', { class: 'num' }, String(s.totalSessions)),
            el('span', { class: 'num' }, String(s.usedSessions)),
            el('b', { class: 'num', style: s.remaining <= 2 ? 'color:var(--status-danger)' : 'color:var(--accent-hover)' }, String(s.remaining)),
            fmtMoney(s.price), s.startDate, s.endDate, statusTag(s.status, s.expiring),
            el('div', { style: 'display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap' },
              // تعديل تواريخ الاشتراك وحصصه وقيمته — للإدارة والمحاسبة وحدهما
              canOnboard
                ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openEditSubscriptionModal(render, s, byName(s)) }, 'تعديل')
                : el('span'),
              // التجميد والإلغاء قرارٌ إداري/محاسبي — لا يظهران للمدرب المخوَّل بالتجديد
              !canOnboard ? el('span')
                : s.status === 'frozen'
                  ? el('button', { class: 'btn btn--outline btn--sm', onclick: () => act('unfreeze', 'فك تجميد') }, 'فك التجميد')
                  : s.status === 'active' ? el('button', { class: 'btn btn--outline btn--sm', onclick: () => act('freeze', 'تجميد') }, 'تجميد') : el('span'),
              canOnboard && ['active', 'frozen'].includes(s.status)
                ? el('button', { class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)', onclick: () => act('cancel', 'إلغاء') }, 'إلغاء')
                : el('span'),
              !canOnboard ? el('span') : el('button', {
                class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
                onclick: async () => {
                  if (!confirm(`حذف اشتراك ${byName(s)} نهائيًا؟\nتُحذف دفعاته وأحداثه معه، وتبقى حصصه في سجل المتدرب دون ارتباط باشتراك. للحالات المدخلة بالخطأ فقط.`)) return;
                  try {
                    const r = await API.del('/api/subscriptions/' + s.id);
                    toast(`حُذف الاشتراك${r.removedPayments ? ` و${r.removedPayments} دفعة مرتبطة` : ''}.`);
                    render();
                  } catch (ex) { toast(ex.message, true); }
                },
              }, 'حذف'))];
        },
        {
          pageSize: 15,
          searchPlaceholder: 'ابحث باسم المتدرب…',
          remote: async (q) => {
            const r = await API.get('/api/subscriptions?' + pageQuery(q, state.all ? '' : '&latest=1'));
            // المنتهية أخيرًا داخل الصفحة نفسها
            r.rows.sort((a, b) => (a.status === 'expired') - (b.status === 'expired'));
            return r;
          },
        })));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `حصص شهر ${thisMonthISO()}`),
      pagedTable(['التاريخ', 'الساعة', 'المتدرب', 'المدة', 'الأسلوب', 'ملاحظات'],
        null,
        (s) => [s.date, s.time,
          el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none' }, byName(s)),
          s.duration + ' د', s.style || '—', s.notes || '—'],
        {
          pageSize: 15, emptyText: 'لا حصص هذا الشهر.', searchPlaceholder: 'ابحث باسم المتدرب…',
          remote: (q) => API.get(`/api/sessions?month=${thisMonthISO()}&` + pageQuery(q)),
        })));
  }

  await render();
}

async function openSubModal(onDone, trainees, preselectId, presetPackage) {
  const packages = (await API.get('/api/packages').catch(() => [])).filter((p) => p.active !== false);
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: preselectId || '' });
  const pkgSel = select([['', 'باقة مخصّصة (إدخال يدوي)'],
    ...packages.map((p) => [p.id, `${p.name} — ${p.sessions} حصة — ${fmtMoney(p.price)}`])],
  { value: presetPackage ? presetPackage.id : '' });
  const totalIn = input({ type: 'number', min: 1, value: presetPackage ? presetPackage.sessions : 12 });
  const priceIn = input({ type: 'number', value: presetPackage ? presetPackage.price : 1200, min: 0 });
  // القيمة تتبع عملة فرع المتدرب المختار
  const subTraineeBranch = () => { const t = trainees.find((x) => String(x.id) === String(traineeSel.value)); return t ? branchCurrency(t.branchId) : ACTIVE_CURRENCY; };
  const subPriceLabel = curLabel('القيمة', subTraineeBranch());
  traineeSel.addEventListener('change', () => subPriceLabel.setCurrency(subTraineeBranch()));
  const startIn = input({ type: 'date', value: todayISO() });
  const end = new Date();
  end.setDate(end.getDate() + (presetPackage ? presetPackage.durationDays || 30 : 30));
  const endIn = input({ type: 'date', value: end.toISOString().slice(0, 10) });

  const applyPackage = () => {
    const p = packages.find((x) => String(x.id) === String(pkgSel.value));
    if (!p) return;
    totalIn.value = p.sessions;
    priceIn.value = p.price;
    const d = new Date(startIn.value || todayISO());
    d.setDate(d.getDate() + (p.durationDays || 30));
    endIn.value = d.toISOString().slice(0, 10);
  };
  pkgSel.addEventListener('change', applyPackage);
  startIn.addEventListener('change', () => { if (pkgSel.value) applyPackage(); });

  const close = modal('اشتراك جديد / تجديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          await API.post('/api/subscriptions', {
            traineeId: Number(traineeSel.value), totalSessions: Number(totalIn.value),
            price: Number(priceIn.value), packageId: pkgSel.value || null,
            startDate: startIn.value, endDate: endIn.value,
          });
          toast('تم تفعيل الاشتراك — ووصل إشعار للمتدرب.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('المتدرب', traineeSel)),
      el('div', { class: 'span-2' }, field('الباقة', pkgSel)),
      field('عدد الحصص', totalIn),
      field(subPriceLabel, priceIn),
      field('تاريخ البدء', startIn),
      field('تاريخ الانتهاء', endIn),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تفعيل الاشتراك'))),
  ]);
}

/* ============================================================
   الفروع والمدربون
   ============================================================ */
async function viewBranches(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [branches, users] = await Promise.all([API.get('/api/branches'), API.get('/api/users')]);
    container.innerHTML = '';

    container.append(el('div', { class: 'card filters' },
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--outline', onclick: () => openBranchModal(render) }, '+ فرع جديد'),
      el('button', { class: 'btn btn--accent', onclick: () => openUserModal(render, branches, users) }, '+ مستخدم جديد')));

    const grid = el('div', { class: 'grid-2eq', style: 'grid-template-columns:repeat(auto-fit,minmax(320px,1fr))' });
    branches.forEach((b) => {
      const trainers = users.filter((u) => u.role === 'trainer' && u.branchId === b.id);
      const trainees = users.filter((u) => u.role === 'trainee' && u.branchId === b.id);
      grid.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, b.name, el('span', { class: 'tag tag--petrol' }, `${trainees.length} متدرب`)),
        el('div', { style: 'font-size:13px;color:var(--app-muted);margin-bottom:12px' }, `${b.address || ''} · ${b.phone || ''}`),
        el('div', { style: 'font-family:var(--font-display);font-weight:700;font-size:12px;color:var(--accent-hover);margin-bottom:8px' }, 'المدربون — بالتناوب على كل المتدربين'),
        trainers.length
          ? dataTable(['الاسم', 'التخصص', 'الجوال'],
            trainers.map((t) => [t.name, t.specialty || '—', t.phone || '—']))
          : el('div', { class: 'empty' }, 'لا مدربين في هذا الفرع.')));
    });
    container.append(grid);

    const traineesWrap = el('div');
    let branchFilter = '';
    const renderTraineesTable = () => {
      const list = users.filter((u) => u.role === 'trainee' && (!branchFilter || u.branchId === Number(branchFilter)));
      traineesWrap.innerHTML = '';
      traineesWrap.append(pagedTable(['الاسم', 'الجوال', 'الفرع', 'الهدف', ''],
        list,
        (t) => [t.name, t.phone || '—',
          (branches.find((b) => b.id === t.branchId) || {}).name || '—',
          GOAL_LABELS[t.goal] || '—',
          el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openEditTraineeModal(render, t, users, branches) }, 'تعديل'),
            el('a', { class: 'btn btn--ghost btn--sm', href: '#/trainee/' + t.id }, 'الملف ←'))],
        { pageSize: 15, searchText: (t) => `${t.name} ${t.phone || ''}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…' }));
    };
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'كل المتدربين',
        select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
          style: 'width:170px', onchange: (e) => { branchFilter = e.target.value; renderTraineesTable(); },
        })),
      traineesWrap));
    renderTraineesTable();
  }

  await render();
}

/* تعديل متدرب: الاسم والتواريخ والفرع والهدف والجوال (المدربون بالتناوب — لا إسناد ثابتًا) */
function openEditTraineeModal(onDone, trainee, users, branches) {
  const nameIn = input({ value: trainee.name || '' });
  /* اسم المستخدم قابل للتصحيح: حسابات سُجّلت باسم مؤقت («client») أو برقم
     خاطئ كانت تبقى عليه للأبد (بطلب العميل) */
  const usernameIn = input({ value: trainee.username || '', dir: 'ltr', style: 'text-align:end' });
  const branchSel = select(branches.map((b) => [b.id, b.name]), { value: trainee.branchId || '' });
  const goalSel = select(Object.entries(GOAL_LABELS), { value: trainee.goal || 'loss' });
  const phoneIn = input({ value: trainee.phone || '', dir: 'ltr', style: 'text-align:end' });
  const birthIn = input({ type: 'date', value: trainee.birthDate || '' });
  const residenceIn = input({ value: trainee.residence || '', placeholder: 'الحي / المنطقة' });
  const joinedIn = input({ type: 'date', value: trainee.joinedAt || '' });

  const close = modal(`تعديل «${trainee.name}»`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!nameIn.value.trim()) { toast('الاسم مطلوب.', true); return; }
        try {
          await API.put('/api/users/' + trainee.id, {
            name: nameIn.value.trim(), branchId: Number(branchSel.value), goal: goalSel.value,
            username: usernameIn.value.trim(), residence: residenceIn.value.trim() || null,
            phone: phoneIn.value, birthDate: birthIn.value || null, joinedAt: joinedIn.value || null,
          });
          toast('تم حفظ التعديلات.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('الاسم الكامل', nameIn)),
      field('الفرع', branchSel),
      field('الهدف', goalSel),
      field('تاريخ الميلاد', birthIn),
      field('تاريخ الانضمام', joinedIn),
      field('الجوال', phoneIn),
      field('مكان السكن (الحي/المنطقة)', residenceIn),
      el('div', { class: 'span-2' }, field('اسم المستخدم (يدخل به للنظام)', usernameIn)),
      el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
        'اسم المستخدم بالإنجليزية والأرقام فقط. تغييره يعني دخوله بالاسم الجديد في المرة القادمة — أبلغه به.'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات')),
      /* منطقة الخطر — محو بيانات المتدرب (حق النسيان). للإدارة وحدها. */
      API.user.role === 'admin' ? el('div', {
        class: 'span-2',
        style: 'margin-top:10px;padding-top:14px;border-top:1px solid var(--app-line)',
      },
        el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px;line-height:1.7' },
          '🔒 محو البيانات نهائيًا: يمسح الاسم والجوال والميلاد والسكن وصور الجسد وقراءات InBody '
          + 'وخطط التغذية والتقييمات. تبقى الاشتراكات والدفعات محفوظةً بسجلٍ مجهول (للمحاسبة). لا رجعة فيه.'),
        el('button', {
          type: 'button', class: 'btn btn--outline btn--full', style: 'color:var(--status-danger);border-color:var(--status-danger)',
          onclick: () => openAnonymizeModal(() => { close(); onDone && onDone(); }, trainee),
        }, '🗑️ محو بيانات هذا المتدرب نهائيًا')) : ''),
  ]);
}

/* تأكيد محو بيانات متدرب — يتطلّب كتابة «محو» فلا يقع بنقرة واحدة عرَضًا */
function openAnonymizeModal(onDone, trainee) {
  const confirmIn = input({ placeholder: 'اكتب: محو', style: 'text-align:center' });
  const btn = el('button', { class: 'btn btn--full', type: 'submit', disabled: true, style: 'background:var(--status-danger);color:#fff' }, 'تأكيد المحو النهائي');
  confirmIn.addEventListener('input', () => { btn.disabled = confirmIn.value.trim() !== 'محو'; });
  const close = modal(`محو بيانات «${trainee.name}»`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        if (confirmIn.value.trim() !== 'محو') return;
        btn.disabled = true; btn.textContent = 'جارٍ المحو…';
        try {
          const r = await API.post('/api/users/' + trainee.id + '/anonymize', { confirm: true });
          toast(`تم محو بيانات المتدرب — حُذفت ${r.deletedImages || 0} صورة، والسجلات المالية محفوظة.`);
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); btn.disabled = false; btn.textContent = 'تأكيد المحو النهائي'; }
      },
    },
      el('div', { style: 'font-size:13px;line-height:1.8;color:var(--app-ink)' },
        `سيُمحى نهائيًا كل ما يُعرّف «${trainee.name}»: الاسم، الجوال، الميلاد، السكن، `
        + 'صور الجسد، قراءات InBody، خطط التغذية، الأهداف، التقييمات، والإشعارات. ',
        el('b', {}, 'تبقى الاشتراكات والدفعات والحصص محفوظةً مرتبطةً بسجلٍ مجهول للمحاسبة. '),
        el('span', { style: 'color:var(--status-danger)' }, 'لا يمكن التراجع عن هذه العملية.')),
      field('للتأكيد اكتب كلمة «محو»', confirmIn),
      btn),
  ]);
}

function openBranchModal(onDone) {
  const nameIn = input({ placeholder: 'اسم الفرع' });
  const addrIn = input({ placeholder: 'العنوان' });
  const phoneIn = input({ placeholder: 'الهاتف', dir: 'ltr', style: 'text-align:end' });
  const freezeIn = input({ type: 'number', min: 0, placeholder: 'اتركه فارغًا = بلا سقف' });
  const curSel = select([['', `عملة النظام (${curInfo().name})`],
    ...Object.entries(CURRENCIES).map(([code, c]) => [code, `${c.name} ${c.symbol}`])]);
  const close = modal('فرع جديد', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/branches', {
            name: nameIn.value, address: addrIn.value, phone: phoneIn.value,
            freezeLimit: freezeIn.value || null, currency: curSel.value || null,
          });
          toast('تمت إضافة الفرع.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    }, field('الاسم', nameIn), field('العنوان', addrIn), field('الهاتف', phoneIn),
      field('عملة الفرع', curSel),
      field('سقف التجميد المسموح للفرع', freezeIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إضافة')),
  ]);
}

function openUserModal(onDone, branches, users) {
  const roleSel = select([['trainee', 'متدرب'], ['trainer', 'مدرب'], ['accountant', 'محاسب'], ['nutritionist', 'أخصائية تغذية'], ['admin', 'إدارة — صلاحيات كاملة']]);
  const nameIn = input({ placeholder: 'الاسم الكامل' });
  const userIn = input({ placeholder: 'username', dir: 'ltr', style: 'text-align:end' });
  const passIn = input({ placeholder: 'كلمة المرور', dir: 'ltr', style: 'text-align:end' });
  const phoneIn = input({ placeholder: '05XXXXXXXX', dir: 'ltr', style: 'text-align:end' });
  const branchSel = select(branches.map((b) => [b.id, b.name]));
  const goalSel = select([['loss', 'نزول وزن'], ['muscle', 'زيادة عضل'], ['maintain', 'تثبيت وزن']]);
  const specIn = input({ placeholder: 'مثال: قوة وبناء عضل' });

  /* المدربون بالتناوب — لا يُسند مدرب ثابت للمتدرب */
  const traineeFields = field('الهدف', goalSel);
  const trainerFields = field('التخصص', specIn);
  trainerFields.style.display = 'none';
  roleSel.addEventListener('change', () => {
    traineeFields.style.display = roleSel.value === 'trainee' ? '' : 'none';
    trainerFields.style.display = roleSel.value === 'trainer' ? '' : 'none';
  });

  const close = modal('مستخدم جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/users', {
            role: roleSel.value, name: nameIn.value, username: userIn.value, password: passIn.value,
            phone: phoneIn.value, branchId: Number(branchSel.value) || null,
            goal: roleSel.value === 'trainee' ? goalSel.value : null,
            specialty: roleSel.value === 'trainer' ? specIn.value : null,
          });
          toast('تمت إضافة المستخدم.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('نوع المستخدم', roleSel), field('الاسم الكامل', nameIn),
      field('اسم المستخدم', userIn), field('كلمة المرور', passIn),
      field('الجوال', phoneIn), field('الفرع', branchSel),
      traineeFields, trainerFields,
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إضافة المستخدم'))),
  ]);
}

/* ============================================================
   InBody — رفع وقراءة OCR وحفظ ومقارنة
   ============================================================ */
/* ملخّص النتائج والمشاكل بالفرع — أعلى صفحة القراءات، وسرّي عن المتدرب */
async function inbodyFlagsSummaryCard(onDone) {
  let s;
  try { s = await API.get('/api/trainee-flags/summary'); }
  catch (e) { return el('span'); }
  const t = s.totals;
  const card = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'النتائج والمشاكل — حصيلة الفروع 🔒',
      el('a', { class: 'btn btn--outline btn--sm', href: '#/reports' }, 'التقرير الشهري ←')),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'يُرصد من ملف المشترك ومن القراءات. سرّي — لا يظهر للمتدرب في صفحته.'),
    el('div', { class: 'kpis' },
      kpiTile(t.results, 'نتيجة مسجّلة', 'target', 'green'),
      kpiTile(t.resultPeople, 'متدرب وصل لنتيجة', 'check', 'green'),
      kpiTile(t.problemPeople, 'متدرب عنده مشكلة', 'alert', t.problemPeople ? 'danger' : undefined),
      kpiTile(t.closedProblems, 'مشكلة عولجت', 'check')),
    dataTable(['الفرع', 'النتائج', 'متدربون وصلوا لنتيجة', 'مشاكل مفتوحة', 'أشخاص عندهم مشاكل'],
      s.byBranch.map((b) => [b.branch,
        el('span', { class: 'num' }, String(b.results)),
        el('span', { class: 'num' }, String(b.resultPeople)),
        el('span', { class: 'num', style: b.problems ? 'color:var(--status-danger)' : '' }, String(b.problems)),
        el('span', { class: 'num', style: b.problemPeople ? 'color:var(--status-danger)' : '' }, String(b.problemPeople))]),
      'لا فروع.'));
  if (s.recent.length) {
    card.append(el('h4', { style: 'margin:14px 0 6px;font-size:13px;color:var(--app-muted)' }, 'آخر ما رُصد'),
      dataTable(['المتدرب', 'النوع', 'الرصد', 'التاريخ'],
        s.recent.slice(0, 10).map((f) => [
          el('a', { href: '#/trainee/' + f.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, f.traineeName),
          flagTag(f), f.title, f.date])));
  }
  return card;
}

async function viewInbody(root) {
  const isStaff = ['admin', 'trainer'].includes(API.user.role);
  const container = el('div', { class: 'content' });
  root.append(container);
  container.append(spinnerCard());

  const trainees = API.user.role === 'trainee' ? [] : await API.get('/api/users?role=trainee');
  /* المتدرب المعروض في العنوان: التحديث لا يعيدك لأول اسم في القائمة،
     والرابط يُرسل لزميل فيفتح على القراءات نفسها. */
  const urlTrainee = urlState({ trainee: '' });
  const firstId = (trainees[0] || {}).id;
  const known = (id) => trainees.some((t) => String(t.id) === String(id));
  const state = {
    trainee: API.user.role === 'trainee' ? API.user.id
      : (known(urlTrainee.trainee) ? Number(urlTrainee.trainee) : firstId),
  };
  const syncTrainee = () => {
    if (API.user.role === 'trainee') return;
    urlTrainee.trainee = state.trainee && state.trainee !== firstId ? String(state.trainee) : '';
    urlTrainee.sync();
  };
  /* هدف المتدرب المعروض — يحدد قراءة اتجاه الوزن (زيادةٌ لبناء العضل تقدّم) */
  const currentGoal = () => (API.user.role === 'trainee'
    ? API.user.goal
    : (trainees.find((t) => t.id === state.trainee) || {}).goal);
  container.innerHTML = '';

  // حصيلة النتائج والمشاكل بالفرع — للموظفين وحدهم
  if (isStaff) container.append(await inbodyFlagsSummaryCard(() => { root.innerHTML = ''; viewInbody(root); }));

  const listCard = el('div', { class: 'card' });
  const traineeSel = trainees.length
    ? searchSelect(trainees.map(traineeOption), {
      value: state.trainee,
      onchange: (e) => { if (e.target.value) { state.trainee = Number(e.target.value); renderList(); } },
    })
    : null;

  const head = el('div', { class: 'card filters' });
  if (traineeSel) head.append(field('المتدرب', traineeSel));
  if (isStaff) head.append(el('button', { class: 'btn btn--accent', onclick: () => openInbodyModal(renderList, state.trainee, trainees) }, '+ رفع قراءة InBody'));
  container.append(head, listCard);

  const renderList = (...a) => keepScroll(() => buildList(...a));

  async function buildList() {
    syncTrainee();
    listCard.innerHTML = '';
    listCard.append(spinnerCard());
    const url = API.user.role === 'trainee' ? '/api/inbody' : '/api/inbody?trainee=' + state.trainee;
    const readings = await API.get(url);
    listCard.innerHTML = '';
    listCard.append(el('h3', { class: 'card__title' }, 'سجل القراءات — كل القراءات محفوظة حسب التاريخ'));
    if (!readings.length) { listCard.append(el('div', { class: 'empty' }, 'لا قراءات بعد.')); return; }
    listCard.append(
      el('div', { class: 'legend', style: 'margin-bottom:8px' },
        el('span', {}, el('i', { style: 'background:var(--accent)' }), 'الوزن (كغ)'),
        el('span', {}, el('i', { style: 'background:var(--blue-500)' }), 'نسبة الدهون %')),
      lineChart(readings.map((r) => r.date.slice(5)), readings.map((r) => r.weight), readings.map((r) => r.bodyFatPct)),
      dataTable(['التاريخ', 'الوزن', 'التغيّر ⇅', 'الدهون %', 'العضلات', 'دهون الجسم', 'الماء', 'BMI', 'النقاط', 'الصورة',
        ...(isStaff ? ['رصد (سرّي)'] : [])],
        readings.map((r, i) => [r.date, r.weight,
          // السهم مقارنةً بالقراءة السابقة زمنيًا — طلوع الوزن ↑ ونزوله ↓،
          // ولونه بحسب هدف المتدرب (بناء العضل يرحّب بالزيادة)
          changeArrow(r.weight, i > 0 ? readings[i - 1].weight : null, { goodWhenUp: goodWhenUpForGoal(currentGoal()) }),
          r.bodyFatPct ?? '—', r.muscleMass ?? '—', r.fatMass ?? '—',
          r.water ?? '—', r.bmi ?? '—', r.score ?? '—',
          r.imageUrl ? el('a', { href: r.imageUrl, target: '_blank' }, 'عرض') : '—',
          // من القراءة نفسها: هل وصل لنتيجة أم ظهرت عنده مشكلة؟ وتصحيح أرقامها
          ...(isStaff ? [el('div', { style: 'display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap' },
            el('button', {
              class: 'btn btn--ghost btn--sm', title: 'رصد نتيجة من هذه القراءة',
              onclick: () => openFlagModal(renderList, r.traineeId, 'result', { inbodyId: r.id, date: r.date }),
            }, '🎯 نتيجة'),
            el('button', {
              class: 'btn btn--ghost btn--sm', title: 'رصد مشكلة من هذه القراءة',
              onclick: () => openFlagModal(renderList, r.traineeId, 'problem', { inbodyId: r.id, date: r.date }),
            }, '⚠️ مشكلة'),
            /* «التعديل ع inbody بادخال الارقام اذا صار في خربطة»: القراءة
               تُدخل يدويًا أو بـ OCR، والرقم الخاطئ كان يبقى إلى الأبد
               ويجرّ معه اتجاه الرسم وحكم «هل تقدّم؟» في مركز القرارات. */
            el('button', {
              class: 'btn btn--outline btn--sm', title: 'تصحيح أرقام هذه القراءة',
              onclick: () => openInbodyModal(renderList, r.traineeId, trainees, r),
            }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              title: 'حذف القراءة نهائيًا',
              onclick: async () => {
                if (!confirm(`حذف قراءة ${r.date} نهائيًا؟\nتُحذف من الرسم البياني ومن المقارنة ومن حساب التقدّم.`)) return;
                try { await API.del('/api/inbody/' + r.id); toast('حُذفت القراءة.'); renderList(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف'))] : [])])),
      el('h3', { class: 'card__title', style: 'margin-top:18px' }, 'مقارنة أول قراءة بآخر قراءة'),
      inbodyComparisonTable(readings, currentGoal()));
  }

  await renderList();
}

function openInbodyModal(onDone, traineeId, trainees, existing) {
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: existing ? existing.traineeId : traineeId });
  if (existing) traineeSel.disabled = true; // القراءة تخصّ صاحبها — لا تُنقل لغيره
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  const fileIn = input({ type: 'file', accept: 'image/*' });
  const preview = el('div', { style: 'display:none;text-align:center' });
  const ocrStatus = el('div', { style: 'font-size:12px;color:var(--text-muted);min-height:16px' });
  const fields = {
    weight: input({ type: 'number', step: '0.1', placeholder: 'كغ' }),
    bodyFatPct: input({ type: 'number', step: '0.1', placeholder: '%' }),
    muscleMass: input({ type: 'number', step: '0.1', placeholder: 'كغ' }),
    fatMass: input({ type: 'number', step: '0.1', placeholder: 'كغ' }),
    water: input({ type: 'number', step: '0.1', placeholder: 'لتر' }),
    bmi: input({ type: 'number', step: '0.1' }),
    score: input({ type: 'number' }),
    waist: input({ type: 'number', step: '0.5', placeholder: 'سم' }),
    chest: input({ type: 'number', step: '0.5', placeholder: 'سم' }),
    arm: input({ type: 'number', step: '0.5', placeholder: 'سم' }),
    hips: input({ type: 'number', step: '0.5', placeholder: 'سم' }),
    leg: input({ type: 'number', step: '0.5', placeholder: 'سم' }),
  };
  const notesIn = input({ placeholder: 'اختياري', value: existing ? (existing.notes || '') : '' });
  let imageBase64 = null;
  // عند التصحيح تُملأ الخانات بالقيم المحفوظة ليُعدَّل الخطأ وحده
  if (existing) {
    Object.entries(fields).forEach(([k, inp]) => {
      if (existing[k] !== null && existing[k] !== undefined) inp.value = existing[k];
    });
  }

  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      imageBase64 = reader.result;
      preview.style.display = '';
      preview.innerHTML = `<img src="${imageBase64}" style="max-height:160px;border-radius:8px">`;
      ocrStatus.textContent = 'جارٍ قراءة كل قيم الورقة تلقائيًا (OCR)…';
      try {
        const res = await API.post('/api/inbody/ocr', { imageBase64 });
        if (res.ocr) {
          /* تُملأ كل الخانات التي عرفها المحرك — لا الوزن وحده — ويُقرأ
             تاريخ الورقة أيضًا إن كان مطبوعًا عليها. */
          const filledNames = [];
          const LABELS = {
            weight: 'الوزن', bodyFatPct: 'الدهون %', muscleMass: 'العضلات', fatMass: 'دهون الجسم',
            water: 'الماء', bmi: 'BMI', score: 'النقاط', waist: 'الخصر', chest: 'الصدر',
            arm: 'اليد', hips: 'الحوض', leg: 'الرجل',
          };
          Object.entries(res.fields || {}).forEach(([k, v]) => {
            if (v == null || !fields[k]) return;
            fields[k].value = v;
            fields[k].classList.add('field__input--ocr');
            filledNames.push(LABELS[k] || k);
          });
          if (res.date) dateIn.value = res.date;
          ocrStatus.textContent = filledNames.length
            ? `✓ قُرئت ${filledNames.length} قيمة تلقائيًا (${filledNames.join('، ')})${res.date ? ` وتاريخ الورقة ${res.date}` : ''} — راجعها وعدّل ما يلزم.`
            : 'لم يتعرف OCR على قيم واضحة — جرّب صورة أوضح أو أدخل القيم يدويًا.';
        } else {
          ocrStatus.textContent = res.reason;
        }
      } catch (ex) { ocrStatus.textContent = 'تعذّرت القراءة التلقائية — أدخل القيم يدويًا.'; }
    };
    reader.readAsDataURL(f);
  });

  const close = modal(existing ? `تصحيح قراءة InBody — ${existing.date}` : 'رفع قراءة InBody', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!existing && !traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const body = { date: dateIn.value, notes: notesIn.value };
          /* الخانة الفارغة عند التصحيح تعني «امسح هذه القيمة» — تُرسل
             صراحةً كي لا تبقى قيمة خاطئة محفوظة لأنها لم تُذكر. */
          for (const [k, inp] of Object.entries(fields)) body[k] = inp.value;
          if (existing) {
            await API.put('/api/inbody/' + existing.id, body);
            toast('صُحّحت القراءة — وتحدّث معها الرسم والمقارنة وحساب التقدّم.');
          } else {
            body.traineeId = Number(traineeSel.value);
            body.imageBase64 = imageBase64;
            await API.post('/api/inbody', body);
            toast('تم حفظ القراءة في صفحة المتدرب.');
          }
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel), field('تاريخ القراءة', dateIn),
      // صورة الورقة تُرفع مع القراءة الأولى — التصحيح للأرقام لا للصورة
      existing ? el('div', { class: 'span-2' },
        el('div', { class: 'alert alert--info' },
          'صحّح الرقم الخاطئ واترك البقية كما هي. القيمة التي تُفرَّغ تُمحى من القراءة. '
          + 'صورة الورقة الأصلية تبقى كما هي.'))
        : el('div', { class: 'span-2' }, field('صورة ورقة InBody', fileIn), preview, ocrStatus),
      field('الوزن *', fields.weight), field('نسبة الدهون %', fields.bodyFatPct),
      field('كتلة العضلات', fields.muscleMass), field('دهون الجسم', fields.fatMass),
      field('الماء', fields.water), field('BMI', fields.bmi),
      field('النقاط', fields.score), field('ملاحظات', notesIn),
      el('div', { class: 'span-2 sidebar__caption', style: 'padding:4px 0 0' }, 'قياسات شريط القياس (سم)'),
      el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px' },
        field('الخصر', fields.waist), field('الصدر', fields.chest), field('اليد', fields.arm),
        field('الحوض', fields.hips), field('الرجل', fields.leg)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ القراءة'))),
  ], { wide: true });
}

/* ============================================================
   مكتبة التغذية
   ============================================================ */
function mealCard(meal, { slotLabel, actions } = {}) {
  if (!meal) return el('span');
  return el('div', { class: 'card meal-card' },
    el('div', { class: 'meal-card__img' },
      meal.imageUrl ? el('img', { class: 'real', src: meal.imageUrl, alt: meal.name })
        : el('img', { class: 'ph', src: '/assets/icons/energy.svg', alt: '' })),
    el('div', { class: 'meal-card__head' },
      el('h4', {}, meal.name),
      el('span', { class: 'tag tag--accent' }, MEAL_TYPES[meal.type] || meal.type)),
    el('div', { class: 'macros' },
      el('span', { class: 'macro' }, el('b', {}, String(meal.calories)), ' سعرة'),
      el('span', { class: 'macro' }, 'بروتين ', el('b', {}, meal.protein + 'غ')),
      el('span', { class: 'macro' }, 'كارب ', el('b', {}, meal.carbs + 'غ')),
      el('span', { class: 'macro' }, 'دهون ', el('b', {}, meal.fat + 'غ'))),
    el('p', { class: 'meal-card__desc' }, el('b', {}, 'المكونات: '), meal.ingredients || '—'),
    el('p', { class: 'meal-card__desc' }, el('b', {}, 'التحضير: '), meal.preparation || '—'),
    el('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:auto' },
      el('span', { class: 'tag tag--neutral' }, 'المسار: ' + (MEAL_GOALS[meal.goal] || GOAL_LABELS[meal.goal] || meal.goal)),
      slotLabel ? el('span', { class: 'tag tag--petrol' }, slotLabel) : (actions || '')));
}

async function viewMeals(root) {
  const isStaff = ['admin', 'trainer', 'nutritionist'].includes(API.user.role);
  const state = urlState({ search: '', type: '', goal: '', maxCalories: '', minProtein: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  const filterBar = el('div', { class: 'card filters' });
  const grid = el('div', { class: 'meals-grid' });
  container.append(filterBar, grid);

  const searchIn = input({ placeholder: 'ابحث بالاسم أو المكونات…', oninput: debounce(() => { state.search = searchIn.value; render(); }) });
  const typeSel = select([['', 'كل الأنواع'], ...Object.entries(MEAL_TYPES)], { onchange: (e) => { state.type = e.target.value; render(); } });
  const goalSel = select([['', API.user.role === 'trainee' ? 'حسب هدفي' : 'كل المسارات'], ...Object.entries(MEAL_GOALS)], { onchange: (e) => { state.goal = e.target.value; render(); } });
  const calIn = input({ type: 'number', placeholder: 'مثال: 450', oninput: debounce(() => { state.maxCalories = calIn.value; render(); }) });
  const protIn = input({ type: 'number', placeholder: 'مثال: 25', oninput: debounce(() => { state.minProtein = protIn.value; render(); }) });

  filterBar.append(
    el('div', { class: 'field', style: 'flex:1;min-width:200px' }, el('label', { class: 'field__label' }, 'بحث'), searchIn),
    field('نوع الوجبة', typeSel), field('الهدف', goalSel),
    field('حد السعرات الأقصى', calIn), field('حد البروتين الأدنى', protIn));
  if (isStaff) filterBar.append(el('button', { class: 'btn btn--accent', onclick: () => openMealModal(render) }, '+ وجبة جديدة'));

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    grid.innerHTML = '';
    grid.append(spinnerCard());
    const q = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => { if (v) q.set(k, v); });
    if (API.user.role === 'trainee' && state.goal) q.set('all', '1');
    const meals = await API.get('/api/meals?' + q.toString());
    grid.innerHTML = '';
    if (!meals.length) { grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, 'لا وجبات مطابقة للفلاتر.')); return; }
    meals.forEach((m) => grid.append(mealCard(m, {
      actions: isStaff
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openAssignMealModal(m) }, 'ربط بمتدرب')
        : '',
    })));
  }

  await render();
}

function openMealModal(onDone) {
  const nameIn = input({ placeholder: 'اسم الوجبة' });
  const typeSel = select(Object.entries(MEAL_TYPES));
  const goalSel = select(Object.entries(MEAL_GOALS));
  const cal = input({ type: 'number', placeholder: 'سعرة' });
  const prot = input({ type: 'number', placeholder: 'غرام' });
  const carb = input({ type: 'number', placeholder: 'غرام' });
  const fat = input({ type: 'number', placeholder: 'غرام' });
  const ing = textarea({ placeholder: 'المكونات…' });
  const prep = textarea({ placeholder: 'طريقة التحضير…' });
  const fileIn = input({ type: 'file', accept: 'image/*' });
  let imageBase64 = null;
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { imageBase64 = r.result; };
    r.readAsDataURL(f);
  });

  const close = modal('إضافة وجبة إلى المكتبة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/meals', {
            name: nameIn.value, type: typeSel.value, goal: goalSel.value,
            calories: cal.value, protein: prot.value, carbs: carb.value, fat: fat.value,
            ingredients: ing.value, preparation: prep.value, imageBase64,
          });
          toast('أُضيفت الوجبة إلى المكتبة.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('اسم الوجبة', nameIn)),
      field('النوع', typeSel), field('الهدف', goalSel),
      field('السعرات', cal), field('البروتين', prot),
      field('الكارب', carb), field('الدهون', fat),
      el('div', { class: 'span-2' }, field('المكونات', ing)),
      el('div', { class: 'span-2' }, field('طريقة التحضير', prep)),
      el('div', { class: 'span-2' }, field('صورة الوجبة (اختياري)', fileIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ الوجبة'))),
  ], { wide: true });
}

async function openAssignMealModal(meal) {
  const trainees = await API.get('/api/users?role=trainee');
  const traineeSel = searchSelect(trainees.map((t) => [t.id, `${t.name} (${GOAL_LABELS[t.goal] || '—'}) — ${t.phone || t.username}`]));
  const slotSel = select(Object.entries(MEAL_TYPES), { value: meal.type });
  const close = modal(`ربط «${meal.name}» ببرنامج متدرب`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          await API.post('/api/meal-plans', { traineeId: Number(traineeSel.value), mealId: meal.id, slot: slotSel.value });
          toast('رُبطت الوجبة ببرنامج المتدرب اليومي.'); close();
        } catch (ex) { toast(ex.message, true); }
      },
    }, field('المتدرب', traineeSel), field('موضع الوجبة', slotSel),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'ربط الوجبة')),
  ]);
}

/* ============================================================
   التقارير الشهرية + تصدير
   ============================================================ */
/* ============================================================
   تقرير المتدربين بالأسماء — بالفرع، مع الاشتراك والدفعات
   أعمدة اختيارية (الجوال، الميلاد، مكان السكن…) يختارها المستخدم قبل
   العرض والتصدير، ومعه تجميع المناطق: من أين يأتي مشتركونا فعلًا.
   ============================================================ */
const ROSTER_COLUMNS = [
  ['phone', 'رقم الجوال'],
  ['birthDate', 'تاريخ الميلاد'],
  ['residence', 'مكان السكن'],
  ['username', 'اسم المستخدم'],
  ['joinedAt', 'تاريخ الانضمام'],
  ['lastSession', 'آخر حصة'],
];

async function viewTraineeRoster(root) {
  /* الفرع والحالة في العنوان؛ أعمدة التصدير اختيارٌ لحظي يبقى في الذاكرة */
  /* month + lastPayment: «التقارير الشهرية يطلعلي … الدفعات بالشهر واقدر
     ابحث من خلال الشهر ولي اخر دفعه فقط» */
  const state = urlState({ branch: '', status: '', month: '', lastPayment: false });
  state.cols = new Set(['phone', 'residence']);
  const container = el('div', { class: 'content' });
  root.append(container);
  const branches = await API.get('/api/branches').catch(() => []);

  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const q = `?branch=${state.branch}&status=${state.status}`
      + (state.month ? `&month=${state.month}` : '') + (state.lastPayment ? '&lastPayment=1' : '');
    const data = await API.get('/api/reports/trainees' + q);
    container.innerHTML = '';

    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
      value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); },
    });
    const statusSel = select([['', 'الكل'], ['active', 'باشتراك فعّال فقط'], ['inactive', 'بلا اشتراك فعّال']], {
      value: state.status, onchange: (e) => { state.status = e.target.value; render(); },
    });
    /* شهر الدفعات: يُصفّي السجل ويضيف عمود «كم دفع في هذا الشهر» */
    const monthIn = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const lastPayChk = input({ type: 'checkbox' });
    lastPayChk.checked = !!state.lastPayment;
    lastPayChk.addEventListener('change', () => { state.lastPayment = lastPayChk.checked; render(); });
    const colsBox = el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;align-items:center' },
      el('span', { style: 'font-size:12px;color:var(--app-muted)' }, 'أعمدة إضافية:'),
      ...ROSTER_COLUMNS.map(([key, label]) => {
        const chk = input({ type: 'checkbox' });
        chk.checked = state.cols.has(key);
        chk.addEventListener('change', () => {
          if (chk.checked) state.cols.add(key); else state.cols.delete(key);
          drawTable();
        });
        return el('label', { style: 'display:flex;gap:5px;align-items:center;font-size:13px;cursor:pointer;white-space:nowrap' }, chk, label);
      }));

    /* سجل الدفعات كاملًا في الملف — كان عمود «آخر دفعة» وحده يوحي أن باقي
       الدفعات ضاعت عند التنزيل إلى Excel (بطلب المحاسبة: كل دفعة بسطر) */
    const payLogChk = input({ type: 'checkbox' });
    payLogChk.checked = state.payLog !== false;
    payLogChk.addEventListener('change', () => { state.payLog = payLogChk.checked; });

    container.append(el('div', { class: 'card' },
      el('div', { class: 'filters' },
        field('الفرع', branchSel), field('الحالة', statusSel),
        field('شهر الدفعات (اختياري)', monthIn),
        el('div', { style: 'flex:1' }),
        el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:13px;cursor:pointer;white-space:nowrap' },
          lastPayChk, 'آخر دفعة لكل شخص فقط'),
        el('label', { style: 'display:flex;gap:6px;align-items:center;font-size:13px;cursor:pointer;white-space:nowrap' },
          payLogChk, 'مع سجل الدفعات في الملف'),
        el('button', {
          class: 'btn btn--accent',
          onclick: () => API.download(
            `/api/reports/trainees.csv${q}&cols=${[...state.cols].join(',')}` + (payLogChk.checked ? '&payments=1' : ''),
            `sportpower-trainees-${todayISO()}.csv`)
            .then(() => toast(payLogChk.checked
              ? 'نُزّل التقرير ومعه سجل الدفعات كاملًا — كل دفعة بسطرها في Excel.'
              : 'نُزّل التقرير بالأعمدة المختارة — يفتح في Excel.'))
            .catch((ex) => toast(ex.message, true)),
        }, 'تصدير Excel (CSV)'),
        el('button', { class: 'btn btn--outline', onclick: () => window.print() }, 'طباعة / PDF')),
      colsBox));

    const t = data.totals;
    container.append(el('div', { class: 'kpis' },
      kpiTile(t.trainees, 'متدرب في التقرير', 'users'),
      kpiTile(t.active, 'باشتراك فعّال', 'check'),
      kpiTile(fmtMoneyMap(t.paidTotal), 'إجمالي المحصّل منهم', 'wallet'),
      kpiTile(fmtMoneyMap(t.dueTotal), 'إجمالي المتبقي عليهم', 'card', Object.values(t.dueTotal || {}).some((v) => Number(v) > 0) ? 'warn' : undefined),
      kpiTile(`${t.withResidence}/${t.trainees}`, 'مسجّل لهم مكان السكن', 'building',
        t.withResidence < t.trainees ? 'warn' : undefined)));

    const tableWrap = el('div');
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'المتدربون بالأسماء — الاشتراك والدفعات'),
      state.month
        ? el('div', { class: 'sidebar__caption', style: 'padding:0 0 8px' },
          `عمودا «دفع في ${state.month}» يعرضان تحصيل ذلك الشهر وحده — وبقية الأعمدة على كامل تاريخه.`)
        : el('span'),
      tableWrap));

    /* سجل الدفعات المعروض على الشاشة — لا في الملف وحده */
    const log = data.paymentsLog || [];
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' },
        (state.lastPayment ? 'آخر دفعة لكل شخص' : 'سجل الدفعات')
        + (state.month ? ` — شهر ${state.month}` : '') + ` (${log.length})`),
      pagedTable(['التاريخ', 'المتدرب', 'الفرع', 'المبلغ', 'الطريقة', 'البند', 'ملاحظة'],
        log,
        (pmt) => [pmt.date, pmt.name, pmt.branch, fmtMoney(pmt.amount, pmt.currency),
          pmt.method || '—', pmt.packageName || '—', pmt.note || '—'],
        { pageSize: 12, searchText: (pmt) => `${pmt.name} ${pmt.branch} ${pmt.date}`,
          searchPlaceholder: 'ابحث بالاسم أو الفرع أو التاريخ…',
          emptyText: state.month ? `لا دفعات في ${state.month}.` : 'لا دفعات مسجّلة.' })));

    function drawTable() {
      const extra = ROSTER_COLUMNS.filter(([k]) => state.cols.has(k));
      tableWrap.innerHTML = '';
      tableWrap.append(el('div', { style: 'overflow-x:auto' }, pagedTable(
        ['#', 'الاسم', 'الفرع', ...extra.map(([, label]) => label),
          'الباقة', 'الحصص', 'المستخدمة', 'المتبقية', 'من', 'إلى', 'الحالة',
          'قيمة الاشتراك', 'المدفوع', 'المتبقي على الاشتراك', 'إجمالي المتبقي عليه', 'إجمالي ما دفعه',
          ...(state.month ? [`دفع في ${state.month}`, `عدد دفعاته`] : []), 'آخر دفعة'],
        // ترقيم ثابت لكل صف (لا يُعاد من 1 مع كل صفحة)
        data.rows.map((r, i) => ({ ...r, seq: i + 1 })),
        (r) => {
          const s = r.subscription;
          return [String(r.seq),
            el('a', { href: '#/trainee/' + r.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, r.name),
            r.branch,
            ...extra.map(([k]) => r[k] || '—'),
            s ? s.packageName || '—' : '—',
            s ? String(s.totalSessions) : '—', s ? String(s.usedSessions) : '—',
            s ? el('b', { class: 'num' }, String(s.remaining)) : '—',
            s ? s.startDate : '—', s ? s.endDate : '—',
            s ? statusTag(s.status) : el('span', { class: 'tag tag--danger' }, 'بلا اشتراك'),
            s ? fmtMoney(s.price) : '—', fmtMoney(r.paidCurrent),
            el('span', { style: r.dueCurrent > 0 ? 'color:var(--status-danger);font-weight:700' : '' }, fmtMoney(r.dueCurrent)),
            // المتبقي على كل اشتراكاته — يشمل دَين اشتراك سابق لم يُسدَّد
            el('span', { style: r.dueAll > 0 ? 'color:var(--status-danger);font-weight:700' : '' }, fmtMoney(r.dueAll)),
            fmtMoney(r.paidTotal),
            ...(state.month
              ? [el('b', { class: 'num', style: r.paidInMonth ? 'color:var(--accent-hover)' : 'color:var(--app-muted)' },
                fmtMoney(r.paidInMonth || 0)), String(r.paymentsInMonth || 0)]
              : []),
            r.lastPayment || '—'];
        },
        {
          pageSize: 20, emptyText: 'لا متدربين مطابقين.',
          searchText: (r) => `${r.name} ${r.phone} ${r.residence} ${r.branch}`,
          searchPlaceholder: 'ابحث بالاسم أو الجوال أو المنطقة…',
        })));
    }
    drawTable();

    /* من أي المناطق يأتي المشتركون فعلًا — رقم يوجّه التسويق واختيار الفروع */
    const areas = data.areas.filter((a) => a.area !== 'غير محدد');
    const areasCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'من أي المناطق يأتي مشتركونا؟ — حسب مكان السكن'));
    if (areas.length) {
      areasCard.append(
        barChart(areas.slice(0, 12).map((a) => a.area), areas.slice(0, 12).map((a) => a.trainees), { unit: ' متدرب' }),
        dataTable(['المنطقة', 'عدد المتدربين', 'منهم فعّالون', 'التوزّع على الفروع'],
          data.areas.map((a) => [
            a.area === 'غير محدد' ? el('span', { class: 'tag tag--warning' }, 'غير محدد') : a.area,
            el('b', { class: 'num' }, String(a.trainees)),
            el('span', { class: 'num' }, String(a.active)),
            a.branches.map((b) => `${b.branch}: ${b.trainees}`).join(' · ')])));
    } else {
      areasCard.append(el('div', { class: 'empty' },
        'لم يُدخل مكان السكن لأي متدرب بعد — أدخِله من «تعديل بيانات المتدرب» أو عند تسجيل زبون جديد ليظهر هذا التحليل.'));
    }
    container.append(areasCard);
  }

  await render();
}

async function viewReports(root) {
  const state = urlState({ month: thisMonthISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const [report, branches, kpis, growthReport, health, allTargets, allTrainers] = await Promise.all([
      API.get(`/api/reports/monthly?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
      API.get('/api/kpi?month=' + state.month).catch(() => []),
      API.get(`/api/reports/growth?month=${state.month}&branch=${state.branch}`).catch(() => null),
      API.get('/api/reports/health?month=' + state.month).catch(() => null),
      API.get('/api/targets').catch(() => []),
      API.get('/api/users?role=trainer').catch(() => []),
    ]);
    container.innerHTML = '';

    const monthInput = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], { value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); } });
    container.append(el('div', { class: 'card filters' },
      field('الشهر', monthInput), field('الفرع', branchSel),
      el('button', {
        class: 'btn btn--accent',
        onclick: () => API.download(`/api/reports/export.csv?month=${state.month}&branch=${state.branch}`, `sportpower-report-${state.month}.csv`)
          .then(() => toast('نُزّل التقرير — يفتح في Excel.')).catch((ex) => toast(ex.message, true)),
      }, 'تصدير Excel (CSV)'),
      el('button', { class: 'btn btn--outline', onclick: () => window.print() }, 'تصدير PDF / طباعة'),
      el('a', { class: 'btn btn--petrol', href: '#/roster' }, 'تقرير المتدربين بالأسماء ←')));

    /* Branch Health Score — أول رقم في التقرير: صحة كل فرع من 100 */
    if (health && health.branches.length) {
      const scored = health.branches.filter((b) => !state.branch || b.branchId === Number(state.branch));
      container.append(branchHealthCard(health, scored));
    }

    /* 🎯 أهداف الشهر بحركة — القضبان تتقدم والأرقام تصعد لا جداول فقط
       (بطلب العميل). تشمل كل نطاق: الشركة، الفروع، وكل مدرب بمؤشراته. */
    const monthNum = Number(state.month.slice(5, 7));
    const yearStr = state.month.slice(0, 4);
    const coversMonth = (p) => p === state.month || p === yearStr
      || (p === yearStr + '-H1' && monthNum <= 6) || (p === yearStr + '-H2' && monthNum >= 7);
    let goals = (allTargets || []).filter((t) => coversMonth(t.period));
    if (state.branch) {
      const bid = Number(state.branch);
      goals = goals.filter((t) => t.scope === 'company'
        || (t.scope === 'branch' && t.refId === bid)
        || (t.scope === 'trainer' && ((allTrainers.find((x) => x.id === t.refId) || {}).branchId === bid)));
    }
    const scopeOrder = { company: 0, branch: 1, trainer: 2 };
    goals.sort((a, b) => (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9)
      || String(a.refName || '').localeCompare(String(b.refName || ''), 'ar')
      || String(a.metricLabel).localeCompare(String(b.metricLabel), 'ar'));
    const goalsCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `🎯 أهداف ${state.month} — كم حققنا؟`,
        API.user.role === 'admin'
          ? el('a', { class: 'btn btn--outline btn--sm', href: '#/kpi' }, 'ضبط الأهداف ←')
          : el('span')));
    if (!goals.length) {
      goalsCard.append(el('div', { class: 'empty' },
        'لا أهداف مضبوطة تشمل هذا الشهر. من صفحة KPI والأهداف («+ هدف جديد») يُضبط هدف لأي مؤشر من جدول المدربين — '
        + 'حصص، ساعات تدريب، ساعات مكتبية، ستوريات، ريلز، نتائج، زبائن عن طريقه… لكل مدرب أو فرع أو للشركة، ويظهر هنا تقدّمه.'));
    } else {
      goalsCard.append(el('div', { class: 'goalgrid' },
        ...goals.map((t, i) => goalMeter({
          title: `${t.refName || 'الشركة كاملة'} — ${t.metricLabel}`,
          sub: periodLabel(t.period)
            + (t.carried > 0 ? ` · مُرحَّل من السابق +${t.metric === 'revenue' ? fmtMoney(t.carried) : t.carried}` : ''),
          pct: t.pct, actual: t.actual, money: t.metric === 'revenue',
          targetText: t.metric === 'revenue' ? fmtMoney(t.effective) : String(t.effective),
        }, i))));
    }
    container.append(goalsCard);

    const kpiOf = (name) => kpis.find((k) => k.name === name) || {};
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' },
        `تقرير المدربين — ${report.month} (إجمالي الحصص: ${report.totalSessions}`
        + (report.totalAbsences ? ` · غيابات مخصومة: ${report.totalAbsences})` : ')')),
      el('div', { style: 'overflow-x:auto' },
        dataTable(['المدرب', 'الفرع', 'عدد الحصص', 'عدد الأشخاص', 'متدربون فريدون', 'ساعات التدريب', 'ساعات مكتبية',
          'ستوري', 'ريلز', 'نتائج', 'مشاكل', 'زبائن عن طريقه', 'إنجاز المهام', 'KPI'],
          report.trainers.map((t) => {
            const k = kpiOf(t.trainer);
            return [t.trainer, t.branch || '—',
              el('span', { class: 'num' }, String(t.sessions)), el('span', { class: 'num' }, String(t.persons)),
              el('span', { class: 'num' }, String(t.uniqueTrainees)), el('span', { class: 'num' }, String(t.hours)),
              // من سجل الحضور/الانصراف في المتابعة اليومية
              el('span', { class: 'num' }, String(t.officeHours ?? 0)),
              el('span', { class: 'num' }, String(t.stories ?? 0)), el('span', { class: 'num' }, String(t.reels ?? 0)),
              el('span', { class: 'num', style: t.results ? 'color:var(--accent-hover)' : '' }, String(t.results ?? 0)),
              el('span', { class: 'num', style: t.problems ? 'color:var(--status-danger)' : '' }, String(t.problems ?? 0)),
              el('span', { class: 'num', title: 'هذا الشهر · الإجمالي' }, `${t.referredMonth ?? 0} · ${t.referredTotal ?? 0}`),
              t.tasksPct !== null && t.tasksPct !== undefined ? progressBar(t.tasksPct) : '—',
              k.kpi !== null && k.kpi !== undefined
                ? el('span', { class: 'tag ' + (k.kpi >= 80 ? 'tag--accent' : k.kpi >= 50 ? 'tag--warning' : 'tag--danger') }, k.kpi + '%')
                : '—'];
          })))));

    const delta = (cur, prevVal, money) => {
      const d = cur - prevVal;
      const txt = (d > 0 ? '+' : '') + (money ? fmtMoney(d) : d);
      return el('span', { class: 'tag ' + (d > 0 ? 'tag--accent' : d < 0 ? 'tag--danger' : 'tag--neutral') }, txt);
    };
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `تقرير الفروع — ${report.month} (مقارنة بـ ${report.prevMonth})`),
      dataTable(['الفرع', 'الحصص', 'ساعات', 'فعالون', 'التحصيل', 'الغيابات', 'نسبة الحضور', 'الحصص ±', 'التحصيل ±'],
        report.branches.map((b) => [b.branch,
          el('span', { class: 'num' }, String(b.sessions)), el('span', { class: 'num' }, String(b.hours)),
          el('span', { class: 'num' }, String(b.activeTrainees)), fmtMoney(b.collected),
          el('span', { class: 'num', style: b.missed ? 'color:var(--status-danger)' : '' }, String(b.missed)),
          b.attendancePct !== null ? progressBar(b.attendancePct) : '—',
          delta(b.sessions, b.prevSessions), delta(b.collected, b.prevCollected, true)]))));

    /* نتائج المشتركين ومشاكلهم — قسم ثابت في التقرير الشهري (سرّي عن المتدرب) */
    if (report.flags) {
      const f = report.flags;
      const flagTable = (rows, empty) => dataTable(['المتدرب', 'الفرع', 'الرصد', 'التفصيل', 'التاريخ', 'الحالة'],
        rows.map((r) => [
          el('a', { href: '#/trainee/' + r.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, r.traineeName),
          r.branchName, r.title, r.note || '—', r.date,
          r.status === 'closed' ? el('span', { class: 'tag tag--neutral' }, 'مغلق') : el('span', { class: 'tag tag--warning' }, 'مفتوح')]),
        empty);
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `نتائج المشتركين ومشاكلهم — ${report.month} 🔒`),
        el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
          'رصد داخلي من ملف المشترك ومن القراءات — لا يظهر للمتدرب.'),
        dataTable(['الفرع', 'نتائج', 'مشاكل', 'مشاكل مفتوحة'],
          f.byBranch.map((b) => [b.branch,
            el('span', { class: 'num' }, String(b.results)),
            el('span', { class: 'num' }, String(b.problems)),
            el('span', { class: 'num', style: b.openProblems ? 'color:var(--status-danger)' : '' }, String(b.openProblems))])),
        el('h4', { style: 'margin:16px 0 6px;font-size:13px;color:var(--app-muted)' }, `🎯 النتائج (${f.results.length})`),
        flagTable(f.results, 'لا نتائج مسجّلة هذا الشهر.'),
        el('h4', { style: 'margin:16px 0 6px;font-size:13px;color:var(--app-muted)' }, `⚠️ المشاكل (${f.problems.length})`),
        flagTable(f.problems, 'لا مشاكل مرصودة هذا الشهر.')));
    }

    // تقرير النمو الشهري: KPI الفرع + أسباب الإلغاء + المصاريف وصافي الربح + مقارنة الأهداف
    if (growthReport) renderGrowthReport(container, growthReport);

    container.append(el('div', { class: 'alert alert--info' },
      'ملاحظة الاحتساب: إذا درّب المدرب شخصين في نفس الساعة تُحسب ساعة تدريب واحدة، بينما يُحسب عدد الأشخاص حسب العدد الفعلي — وتُخصم حصة من كل متدرب. الغياب يُخصم من الرصيد، والحصة التعويضية تُغطّي غيابًا سبق خصمه فلا تُخصم مرة ثانية — والتعويضية بلا غياب معلّق تُخصم كالحصة العادية.'));
  }

  await render();
}

/* ============================================================
   Branch Health Score — صحة الفرع من 100
   90–100 ممتاز · 80–89 جيد جدًا · 70–79 جيد · 60–69 يحتاج متابعة ·
   أقل من 60 يحتاج تدخل — محسوب من المحاور الموزونة في الخادم.
   ============================================================ */
function healthTone(score) {
  if (score === null || score === undefined) return 'tag--neutral';
  if (score >= 80) return 'tag--accent';
  if (score >= 70) return 'tag--info';
  if (score >= 60) return 'tag--warning';
  return 'tag--danger';
}

function healthDot(score) {
  const color = score === null ? 'var(--app-muted)'
    : score >= 80 ? 'var(--accent)' : score >= 60 ? 'var(--status-warning)' : 'var(--status-danger)';
  return el('span', { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}` });
}

function branchHealthCard(health, rows, { compact } = {}) {
  const card = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'Branch Health Score — صحة الفروع',
      health.company.score !== null
        ? el('span', { class: 'tag ' + healthTone(health.company.score) }, `الشركة: ${health.company.score}/100 — ${health.company.label}`)
        : el('span')));

  const tiles = el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:' + (compact ? '0' : '12px') });
  rows.forEach((b) => {
    tiles.append(el('div', { class: 'kpi' },
      el('div', { style: 'display:flex;align-items:center;gap:8px' }, healthDot(b.score)),
      el('div', {},
        el('div', { class: 'kpi__value' }, b.score === null ? '—' : `${b.score}/100`),
        el('div', { class: 'kpi__label' }, b.branch + ' — ' + b.label))));
  });
  card.append(tiles);
  if (compact) return card;

  card.append(el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
    'محسوب من: نمو المشتركين 25% · تحقيق هدف التحصيل 25% · التجديد 20% · الربحية 15% · أداء المدربين 10% · التجميد والإلغاء 5%. '
    + 'المحور الذي لا بيانات له (مثل هدف تحصيل غير مضبوط) يخرج من الحساب. التصنيف: 90–100 ممتاز · 80–89 جيد جدًا · 70–79 جيد · 60–69 يحتاج متابعة · أقل من 60 يحتاج تدخل.'));

  const componentLabels = (rows[0] || { components: [] }).components.map((c) => `${c.label} (${c.weight}%)`);
  card.append(el('div', { style: 'overflow-x:auto' },
    dataTable(['الفرع', 'Score', 'التصنيف', ...componentLabels],
      rows.map((b) => [b.branch,
        el('b', { class: 'num' }, b.score === null ? '—' : String(b.score)),
        el('span', { class: 'tag ' + healthTone(b.score) }, b.label),
        ...b.components.map((c) => (c.value === null
          ? el('span', { class: 'tag tag--neutral', title: 'لا بيانات لهذا المحور' }, '—')
          : progressBar(c.value)))]),
      'لا فروع.')));
  return card;
}

/* ============================================================
   الإعدادات والتحكم — كل شيء في تبويب واحد (الإدارة)
   ============================================================ */
/* صلاحيتا المدرب المخوَّل — تُمنحان بالاسم من جدول المستخدمين */
const TRAINER_PERMS = [
  ['canSeePrices', 'يرى الأسعار ✓', 'منح رؤية الأسعار',
    (name, on) => (on
      ? `سحب رؤية الأسعار والعقود من «${name}»؟`
      : `منح «${name}» رؤية أسعار الباقات وصفحة العقود؟ الأسعار سرّ تجاري — تُمنح لمن يحتاجها فقط.`)],
  ['canRenew', 'يجدّد الاشتراكات ✓', 'منح صلاحية التجديد',
    (name, on) => (on
      ? `سحب صلاحية تجديد الاشتراكات من «${name}»؟`
      : `منح «${name}» تجديد اشتراكات مشتركي فرعه؟ (فتحُ زبون جديد وتسجيلُ الدفعات يبقيان للإدارة والمحاسبة. ومنحُ التجديد يُظهر له الأسعار لأنه لا يُجدِّد بلا سعر.)`)],
];

async function viewSettings(root) {
  const container = el('div', { class: 'content' });
  root.append(container);
  const state = urlState({ roleFilter: '', search: '' });

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const [branches, users, cfg] = await Promise.all([
      API.get('/api/branches'),
      API.get('/api/users'),
      (API._config = null, API.config()),
    ]);
    container.innerHTML = '';

    /* --- 1) الإعدادات العامة --- */
    const currencySel = select(Object.entries(CURRENCIES).map(([code, c]) => [code, `${c.name} (${c.symbol})`]), {
      value: cfg.currency || ACTIVE_CURRENCY,
      onchange: async (e) => {
        try {
          await API.put('/api/settings', { currency: e.target.value });
          ACTIVE_CURRENCY = e.target.value;
          API._config = null;
          toast('تم تغيير عملة النظام إلى ' + CURRENCIES[ACTIVE_CURRENCY].name + '.');
        } catch (ex) { toast(ex.message, true); e.target.value = ACTIVE_CURRENCY; }
      },
    });
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الإعدادات العامة'),
      el('div', { class: 'filters' },
        field('عملة النظام', currencySel),
        el('div', { style: 'font-size:12px;color:var(--app-muted);max-width:460px' },
          'العملة الافتراضية للنظام — يتبعها كل فرع لم تُحدَّد له عملة خاصة. '
          + 'لفرعٍ بعملة مختلفة (عمّان بالدينار مثلًا) اضبطها من تعديل الفرع نفسه.'))));

    /* --- 2) الفروع --- */
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الفروع',
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openBranchModal(render) }, '+ فرع جديد')),
      dataTable(['الفرع', 'العملة', 'العنوان', 'الهاتف', 'المتدربون', 'المدربون', 'سقف التجميد', ''],
        branches.map((b) => [b.name,
          b.currency
            ? el('span', { class: 'tag tag--petrol' }, curInfo(b.currency).name)
            : el('span', { class: 'tag tag--neutral', title: 'يتبع عملة النظام' }, curInfo().name),
          b.address || '—', b.phone || '—',
          String(users.filter((u) => u.role === 'trainee' && u.branchId === b.id).length),
          String(users.filter((u) => u.role === 'trainer' && u.branchId === b.id).length),
          b.freezeLimit ? String(b.freezeLimit) : el('span', { class: 'tag tag--neutral' }, 'بلا سقف'),
          el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openBranchEditModal(render, b) }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف «${b.name}»؟ لا يُحذف إلا فرع بلا مستخدمين واشتراكات.`)) return;
                try { await API.del('/api/branches/' + b.id); toast('حُذف الفرع.'); render(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف'))]))));

    /* --- 3) المستخدمون --- */
    const searchIn = input({ placeholder: 'ابحث بالاسم أو اسم المستخدم…', value: state.search,
      oninput: debounce(() => { state.search = searchIn.value; renderUsers(); }) });
    const roleSel = select([['', 'كل الأدوار'], ...Object.entries(ROLE_LABELS)], {
      value: state.roleFilter, onchange: (e) => { state.roleFilter = e.target.value; renderUsers(); } });
    const usersWrap = el('div');

    function renderUsers() {
      let list = users;
      if (state.roleFilter) list = list.filter((u) => u.role === state.roleFilter);
      if (state.search) list = list.filter((u) => u.name.includes(state.search) || u.username.includes(state.search.toLowerCase()));
      usersWrap.innerHTML = '';
      usersWrap.append(pagedTable(['الاسم', 'اسم المستخدم', 'الدور', 'الفرع', 'الجوال', 'الحالة', 'صلاحيات إضافية', ''],
        list,
        (u) => [u.role === 'trainee'
            ? el('a', { href: '#/trainee/' + u.id, style: 'color:var(--action);text-decoration:none;font-weight:600' }, u.name)
            : u.name,
          el('code', { style: 'direction:ltr;font-family:var(--font-mono);font-size:12px' }, u.username),
          el('span', { class: 'tag ' + (u.role === 'admin' ? 'tag--petrol' : 'tag--neutral') }, ROLE_LABELS[u.role] || u.role),
          u.role === 'accountant' && (u.branchIds || []).length
            ? el('span', { class: 'tag tag--petrol', title: 'نطاق المحاسب' },
              u.branchIds.map((id) => (branches.find((b) => b.id === id) || {}).name).filter(Boolean).join(' + '))
            : (branches.find((b) => b.id === u.branchId) || {}).name || '—',
          u.phone || '—',
          u.active ? el('span', { class: 'tag tag--accent' }, 'فعّال') : el('span', { class: 'tag tag--danger' }, 'معطّل'),
          /* صلاحيتان تُمنحان لمدرب بعينه لا لكل المدربين:
             «افتح عند المدرب العقود مع الباقات مع الأسعار»، و«أعطِ طه
             ونور خاصية تجديد الاشتراك». */
          ['trainer', 'nutritionist'].includes(u.role)
            ? el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' },
              ...TRAINER_PERMS.map(([key, on, off, ask]) => el('button', {
                class: 'btn btn--sm ' + (u[key] ? 'btn--accent' : 'btn--ghost'),
                title: ask(u.name, u[key]),
                onclick: async () => {
                  if (!confirm(ask(u.name, u[key]))) return;
                  try {
                    await API.put('/api/users/' + u.id, { [key]: !u[key] });
                    toast(u[key] ? 'سُحبت الصلاحية وأُنهيت جلساته.' : 'مُنحت الصلاحية وأُنهيت جلساته ليدخل بها.');
                    render();
                  } catch (ex) { toast(ex.message, true); }
                },
              }, u[key] ? on : off)))
            : el('span', { style: 'color:var(--app-muted)' }, '—'),
          el('div', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' },
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => { openUserEditModal(render, u, branches).catch((ex) => toast(ex.message, true)); } }, 'تعديل'),
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openResetPasswordModal(u) }, 'كلمة المرور'),
            // بيانات الدخول جاهزة على واتساب — بكلمة مرور مؤقتة جديدة
            u.id !== API.user.id
              ? el('button', { class: 'btn btn--petrol btn--sm', onclick: () => openCredentialsModal(u) }, 'إرسال بياناته واتساب')
              : el('span'),
            u.mfaEnrolled ? el('button', {
              class: 'btn btn--outline btn--sm',
              onclick: async () => {
                if (!confirm(`تصفير التحقق الثنائي لـ «${u.name}»؟ سيسجّل تطبيق المصادقة من جديد عند دخوله القادم.`)) return;
                try { await API.put('/api/users/' + u.id, { mfaReset: true }); toast('صُفّر التحقق الثنائي.'); render(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'تصفير 2FA') : el('span'),
            // إعفاء من رمز التحقق — لمن يصعب عليه تطبيق المصادقة (قرار إداري)
            ['admin', 'accountant'].includes(u.role) ? el('button', {
              class: 'btn btn--ghost btn--sm', style: u.mfaExempt ? 'color:var(--status-danger)' : '',
              onclick: async () => {
                const msg = u.mfaExempt
                  ? `إعادة إلزام «${u.name}» برمز التحقق عند الدخول؟`
                  : `إعفاء «${u.name}» من رمز التحقق نهائيًا؟ سيدخل بكلمة المرور فقط — حماية أقل لحساب يرى البيانات المالية.`;
                if (!confirm(msg)) return;
                try {
                  await API.put('/api/users/' + u.id, { mfaExempt: !u.mfaExempt });
                  toast(u.mfaExempt ? 'أُعيد الإلزام بالتحقق الثنائي.' : 'أُعفي من التحقق الثنائي — يدخل بكلمة المرور فقط.');
                  render();
                } catch (ex) { toast(ex.message, true); }
              },
            }, u.mfaExempt ? '2FA: معفى ⚠️' : 'إعفاء 2FA') : el('span'),
            u.id !== API.user.id ? el('button', {
              class: 'btn btn--ghost btn--sm', style: u.active ? 'color:var(--status-danger)' : 'color:var(--accent-hover)',
              onclick: async () => {
                try {
                  await API.put('/api/users/' + u.id, { active: !u.active });
                  toast(u.active ? 'عُطّل الحساب وأُنهيت جلساته.' : 'فُعّل الحساب.');
                  render();
                } catch (ex) { toast(ex.message, true); }
              },
            }, u.active ? 'تعطيل' : 'تفعيل') : el('span'))],
        { pageSize: 15, emptyText: 'لا مستخدمين مطابقين.' }));
    }

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `المستخدمون (${users.length})`,
        el('div', { style: 'display:flex;gap:8px' },
          el('button', { class: 'btn btn--accent btn--sm', onclick: () => openOnboardModal(render) }, '+ زبون جديد (Onboarding)'),
          el('button', { class: 'btn btn--outline btn--sm', onclick: () => openUserModal(render, branches, users) }, '+ موظف/مستخدم'))),
      el('div', { class: 'filters', style: 'margin-bottom:12px' },
        el('div', { class: 'field', style: 'flex:1;min-width:200px' }, el('label', { class: 'field__label' }, 'بحث'), searchIn),
        field('الدور', roleSel)),
      usersWrap));
    renderUsers();
  }

  await render();
}

function openBranchEditModal(onDone, branch) {
  const nameIn = input({ value: branch.name });
  const addrIn = input({ value: branch.address || '' });
  const phoneIn = input({ value: branch.phone || '', dir: 'ltr', style: 'text-align:end' });
  const freezeIn = input({ type: 'number', min: 0, value: branch.freezeLimit ?? '', placeholder: 'اتركه فارغًا = بلا سقف' });
  /* عملة الفرع: عمّان بالدينار وفروع الضفة بالشيكل — تغييرها هنا لا يمسّ
     بقية الفروع (كانت العملة إعدادًا عامًا يقلب النظام كله). */
  const curSel = select([['', `عملة النظام (${curInfo().name})`],
    ...Object.entries(CURRENCIES).map(([code, c]) => [code, `${c.name} ${c.symbol}`])],
  { value: branch.currency || '' });
  const close = modal(`تعديل «${branch.name}»`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/branches/' + branch.id, {
            name: nameIn.value, address: addrIn.value, phone: phoneIn.value,
            freezeLimit: freezeIn.value === '' ? null : freezeIn.value,
            currency: curSel.value || null,
          });
          toast('تم حفظ الفرع — وتسري عملته على مبالغه وحده.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    }, field('الاسم', nameIn), field('العنوان', addrIn), field('الهاتف', phoneIn),
      field('عملة الفرع', curSel),
      el('div', { style: 'font-size:12px;color:var(--app-muted)' },
        'تسري على مبالغ هذا الفرع وحده — اشتراكاته ودفعاته وديونه. والمجاميع '
        + 'التي تضمّ فروعًا بعملتين تُعرض مفصَّلة لا مجموعة في رقم واحد.'),
      field('سقف التجميد المسموح للفرع', freezeIn),
      el('div', { style: 'font-size:12px;color:var(--app-muted)' },
        'تجاوز المجمّدين لهذا السقف يظهر بالأحمر في KPI الفروع.'),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ')),
  ]);
}

async function openUserEditModal(onDone, user, branches) {
  const nameIn = input({ value: user.name });
  // تصحيح اسم المستخدم لأي حساب — لا الاسم المعروض وحده
  const usernameIn = input({ value: user.username || '', dir: 'ltr', style: 'text-align:end' });
  const phoneIn = input({ value: user.phone || '', dir: 'ltr', style: 'text-align:end' });
  const branchSel = select([['', 'بلا فرع'], ...branches.map((b) => [b.id, b.name])], { value: user.branchId || '' });
  const goalSel = user.role === 'trainee' ? select(Object.entries(GOAL_LABELS), { value: user.goal || 'loss' }) : null;
  const residenceIn = user.role === 'trainee' ? input({ value: user.residence || '', placeholder: 'الحي / المنطقة' }) : null;
  const specIn = user.role === 'trainer' ? input({ value: user.specialty || '' }) : null;

  /* ---- بيانات المشترك التي تُغذّي KPI ----
     «تعديل معلومات المتدرب هو جديد أو فعال عشان أقدر أفحص في KPI عدد
     الفعالين وعدد الجدد»: «فعّال» يُشتق من اشتراكه القائم فلا يُكتب
     بيدٍ، أما «جديد» فمن تاريخ انضمامه — وهو ما يُصحَّح هنا.
     ومعه قناةُ وصوله، فمن أُدخل بقناة خاطئة يُصحَّح («هاي القائمة اذا
     ادخلت الشخص وكان غلط بهدول كيف اعدل»). */
  const isTrainee = user.role === 'trainee';
  const joinedIn = isTrainee ? input({ type: 'date', value: (user.joinedAt || '').slice(0, 10) }) : null;
  let sourceTypeSel = null; let sourcePersonSel = null; let sourceTrainerSel = null; let sourceNameIn = null;
  let sourcePersonField = null; let sourceNameField = null; let sourceTrainerField = null;
  if (isTrainee) {
    const [others, trainers] = await Promise.all([
      API.get('/api/users?role=trainee').catch(() => []),
      API.get('/api/users?role=trainer').catch(() => []),
    ]);
    const current = user.sourceType || (user.sourceTrainerId ? 'trainer' : 'new');
    sourceTypeSel = select(SOURCE_OPTIONS, { value: current });
    sourcePersonSel = searchSelect(others.filter((t) => t.id !== user.id).map(traineeOption), {
      value: current === 'trainee' ? (user.sourceRefId || '') : '', placeholder: 'اكتب اسم المتدرب…',
    });
    sourceTrainerSel = select([['', '— اختر المدرب —'], ...trainers.map((t) => [t.id, t.name])], {
      value: current === 'trainer' ? (user.sourceRefId || user.sourceTrainerId || '') : '',
    });
    sourceNameIn = input({ value: user.sourceName || '', placeholder: 'اسم الصديق أو المنصة' });
    sourcePersonField = field('اسم المتدرب المُحيل', sourcePersonSel);
    sourceTrainerField = field('المدرب المُحيل', sourceTrainerSel);
    sourceNameField = field('اسم الصديق / المنصة', sourceNameIn);
    const syncSrc = () => {
      const v = sourceTypeSel.value;
      sourcePersonField.style.display = v === 'trainee' ? '' : 'none';
      sourceTrainerField.style.display = v === 'trainer' ? '' : 'none';
      sourceNameField.style.display = ['friend', 'social'].includes(v) ? '' : 'none';
      sourceNameField.querySelector('label').textContent = v === 'social'
        ? 'المنصة (انستغرام/تيك توك/فيسبوك…)' : 'اسم الصديق (خارج النظام)';
    };
    sourceTypeSel.addEventListener('change', syncSrc);
    setTimeout(syncSrc, 0);
  }

  /* فروع المحاسب: «محاسبة عمّان لا يكون عندها وصول للفروع الثانية».
     يُختار فرع أو أكثر — فمحاسبةٌ واحدة تتولى بيت لحم وبيت ساحور معًا.
     ولا شيء مختارًا = بلا تقييد (كما كان النظام قبل الفروع). */
  const scopeBoxes = user.role === 'accountant'
    ? branches.map((b) => {
      const chk = input({ type: 'checkbox' });
      chk.checked = (user.branchIds || []).includes(b.id);
      return { id: b.id, chk, node: el('label', {
        style: 'display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer;'
          + 'border:1px solid var(--app-line);border-radius:8px;padding:8px 10px',
      }, chk, b.name) };
    })
    : null;
  const scopeHint = el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' });
  const syncScopeHint = () => {
    if (!scopeBoxes) return;
    const picked = scopeBoxes.filter((x) => x.chk.checked).map((x) => (branches.find((b) => b.id === x.id) || {}).name);
    scopeHint.textContent = picked.length
      ? `يرى ${picked.join(' و')} فقط — لا مالية الفروع الأخرى ولا متدربيها. تغيير النطاق يُنهي جلساته ليسري فورًا.`
      : 'بلا تحديد = يرى كل الفروع (الوضع الحالي). حدّد فرعًا أو أكثر لتقييده.';
  };
  if (scopeBoxes) scopeBoxes.forEach((x) => x.chk.addEventListener('change', syncScopeHint));

  const close = modal(`تعديل «${user.name}»`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const body = {
            name: nameIn.value, username: usernameIn.value.trim(),
            phone: phoneIn.value, branchId: branchSel.value ? Number(branchSel.value) : null,
            goal: goalSel ? goalSel.value : undefined,
            residence: residenceIn ? residenceIn.value.trim() || null : undefined,
            specialty: specIn ? specIn.value : undefined,
            branchIds: scopeBoxes ? scopeBoxes.filter((x) => x.chk.checked).map((x) => x.id) : undefined,
          };
          if (isTrainee) {
            body.joinedAt = joinedIn.value || undefined;
            const v = sourceTypeSel.value;
            body.sourceType = v;
            body.sourceRefId = v === 'trainee' ? (Number(sourcePersonSel.value) || null)
              : v === 'trainer' ? (Number(sourceTrainerSel.value) || null) : null;
            body.sourceName = ['friend', 'social'].includes(v) ? (sourceNameIn.value.trim() || null) : null;
            // الترميز القديم يبقى متسقًا مع الجديد فلا يختلف رقمان لمُحيل واحد
            body.sourceTrainerId = v === 'trainer' ? (Number(sourceTrainerSel.value) || null) : null;
          }
          await API.put('/api/users/' + user.id, body);
          toast('تم حفظ التعديلات.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الاسم الكامل', nameIn),
      field('اسم المستخدم', usernameIn),
      field('الجوال', phoneIn),
      field('الفرع', branchSel),
      goalSel ? field('الهدف', goalSel) : (specIn ? field('التخصص', specIn) : el('span')),
      residenceIn ? field('مكان السكن (الحي/المنطقة)', residenceIn) : el('span'),
      isTrainee ? field('تاريخ الانضمام', joinedIn) : el('span'),
      isTrainee ? el('div', { class: 'span-2' }, field('كيف وصلنا؟ (القناة)', sourceTypeSel)) : el('span'),
      isTrainee ? sourcePersonField : el('span'),
      isTrainee ? sourceTrainerField : el('span'),
      isTrainee ? sourceNameField : el('span'),
      isTrainee ? el('div', { class: 'span-2 alert alert--info' },
        'تاريخ الانضمام هو ما يجعله «مشتركًا جديدًا» في KPI ذلك الشهر. '
        + 'أما «فعّال» فيُشتق من اشتراكه القائم — يُفعَّل بتجديد اشتراكه لا بتعديل هنا، '
        + 'كي لا يختلف عدد الفعّالين عن عدد الاشتراكات الفعّالة.') : el('span'),
      scopeBoxes
        ? el('div', { class: 'span-2' },
          el('div', { class: 'field__label', style: 'margin-bottom:6px' }, 'الفروع التي يتولّاها هذا المحاسب'),
          el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px' },
            ...scopeBoxes.map((x) => x.node)))
        : el('span'),
      scopeBoxes ? scopeHint : el('span'),
      el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
        'اسم المستخدم بالإنجليزية والأرقام فقط (ويُسمح بـ . _ -) — أبلغ صاحبه بأي تغيير فهو مفتاح دخوله.'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
  syncScopeHint();
}

/* ============================================================
   إرسال بروفايل المشترك وبياناته على واتساب — نص جاهز تلقائيًا
   كلمة المرور لا تُخزَّن مقروءة في أي مكان، فالإرسال يولّد كلمة مرور
   مؤقتة جديدة (وتسقط القديمة وتُنهى جلساته) ويُطلب منه تغييرها عند دخوله.
   ============================================================ */
async function openCredentialsModal(user, extraLine) {
  if (!confirm(`إرسال بيانات الدخول لـ «${user.name}»؟\nستُولَّد كلمة مرور مؤقتة جديدة وتسقط القديمة فورًا — يُطلب منه تغييرها عند أول دخول.`)) return;
  let res;
  try { res = await API.post(`/api/users/${user.id}/credentials`, {}); }
  catch (ex) { toast(ex.message, true); return; }

  const link = location.origin;
  const hours = res.credentials.validHours;
  const lines = [
    `أهلًا ${user.name} 💪 هذا ملفك في نظام سبورت باور:`,
    extraLine || '',
    '',
    `الرابط: ${link}`,
    `اسم المستخدم: ${res.credentials.username}`,
    `كلمة المرور: ${res.credentials.password}`,
    '',
    `(كلمة المرور مؤقتة وصالحة ${hours ? hours + ' ساعة' : 'لمدة محدودة'} — سيُطلب منك تغييرها عند أول دخول)`,
  ].filter((l) => l !== null);
  const msg = lines.join('\n');
  const wa = user.phone ? waLink(user.phone, OPS_SETTINGS.waCountryCode || '970', msg, user.name) : null;

  modal(`بيانات دخول «${user.name}»`, [
    el('div', { class: 'alert alert--warning' },
      'كلمة المرور تظهر مرة واحدة فقط — أرسلها الآن أو انسخها قبل الإغلاق.'
      + (res.credentials.validHours
        ? ` وهي صالحة ${res.credentials.validHours} ساعة، فإن لم يدخل بها حتى ذلك الحين أصدِر غيرها.`
        : '')),
    el('div', { class: 'card', style: 'box-shadow:none;border:1.5px dashed var(--app-line)' },
      el('div', { style: 'font-family:var(--font-mono);direction:ltr;text-align:left;font-size:14px;line-height:2' },
        `المستخدم: ${res.credentials.username}`, el('br'), `كلمة المرور: ${res.credentials.password}`)),
    el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
      wa
        ? el('a', { class: 'btn btn--accent', target: '_blank', href: wa }, 'إرسال واتساب — النص جاهز')
        : el('span', { class: 'tag tag--warning' }, 'لا يوجد رقم جوال لهذا الحساب — أضِفه ليُرسَل واتساب'),
      el('button', {
        class: 'btn btn--outline',
        onclick: () => navigator.clipboard.writeText(msg).then(() => toast('نُسخت الرسالة كاملة.')),
      }, 'نسخ نص الرسالة')),
  ]);
}

function openResetPasswordModal(user) {
  const passIn = input({ placeholder: '6 أحرف على الأقل', dir: 'ltr', style: 'text-align:end' });
  const close = modal(`إعادة تعيين كلمة مرور «${user.name}»`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/users/' + user.id, { password: passIn.value });
          toast('أُعيد تعيين كلمة المرور وأُنهيت جلسات المستخدم — سيُطلب منه تغييرها.');
          close();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('كلمة المرور الجديدة', passIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إعادة التعيين')),
  ]);
}

/* قائمة المتدربين (المدربون بالتناوب — الكل يرى الكل) */
async function viewMyTrainees(root) {
  const container = el('div', { class: 'content' });
  root.append(container);
  container.append(spinnerCard());
  const [trainees, subs, branches] = await Promise.all([
    API.get('/api/users?role=trainee'),
    API.get('/api/subscriptions'),
    API.get('/api/branches'),
  ]);
  container.innerHTML = '';
  const state = urlState({ branch: '' });
  const listWrap = el('div');
  const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
    value: state.branch, onchange: (e) => { state.branch = e.target.value; renderList(); },
  });
  container.append(el('div', { class: 'card filters' }, field('الفرع', branchSel)));
  container.append(listWrap);

  function renderList() {
    const list = state.branch ? trainees.filter((t) => t.branchId === Number(state.branch)) : trainees;
    listWrap.innerHTML = '';
    listWrap.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'المتدربون'),
    pagedTable(['الاسم', 'الفرع', 'الهدف', 'الرصيد المتبقي', 'الحالة', ''],
      list,
      (t) => {
        const sub = subs.filter((s) => s.traineeId === t.id && s.status === 'active')[0];
        return [t.name,
          (branches.find((b) => b.id === t.branchId) || {}).name || '—',
          GOAL_LABELS[t.goal] || '—',
          sub ? `${sub.remaining} من ${sub.totalSessions}` : '—',
          sub ? statusTag(sub.status, sub.expiring) : el('span', { class: 'tag tag--danger' }, 'بلا اشتراك'),
          el('a', { class: 'btn btn--ghost btn--sm', href: '#/trainee/' + t.id }, 'الملف ←')];
      },
      { pageSize: 15, emptyText: 'لا متدربين بعد.', searchText: (t) => `${t.name} ${t.phone || ''}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…' })));
  }
  renderList();
}

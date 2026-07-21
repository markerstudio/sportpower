/* التشغيل والمتابعة: المتابعة اليومية، الأهداف وKPI، المجمدون، وبطاقات المدرب اليومية */

const FROZEN_STATUS_LABELS = {
  pending: 'بانتظار التواصل', contacted: 'تم التواصل', replied: 'ردّ',
  'no-reply': 'لم يرد', returned: 'عاد للاشتراك',
};
const METRIC_OPTIONS = [
  ['revenue', 'التحصيل'], ['sessions', 'عدد الحصص'], ['uniqueTrainees', 'متدربون فريدون'],
  ['newSubs', 'اشتراكات جديدة/تجديد'], ['activeTrainees', 'المتدربون الفعالون'],
];

/* ============================================================
   لوحة المتابعة اليومية (الإدارة/المحاسب)
   ============================================================ */
async function viewDaily(root) {
  const state = { date: todayISO() };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [data, trainers] = await Promise.all([
      API.get('/api/daily?date=' + state.date),
      API.user.role === 'admin' ? API.get('/api/users?role=trainer') : Promise.resolve([]),
    ]);
    const tasks = API.user.role === 'admin' || API.user.role === 'accountant'
      ? await API.get('/api/tasks?month=' + state.date.slice(0, 7)) : [];
    container.innerHTML = '';

    const dateIn = input({ type: 'date', value: state.date, onchange: (e) => { state.date = e.target.value; render(); } });
    const bar = el('div', { class: 'card filters' }, field('اليوم', dateIn));
    if (API.user.role === 'admin') {
      bar.append(el('button', { class: 'btn btn--accent', onclick: () => openTaskModal(render, trainers, state.date) }, '+ مهمة لمدرب'));
    }
    container.append(bar);

    const t = data.totals;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(fmtMoney(t.collected), 'التحصيل اليومي', 'wallet', 'green'),
      kpiHero(data.attendance.sessions, 'حصة منفذة اليوم', 'dumbbell'),
      kpiHero(data.attendance.missed, 'غيابات اليوم', 'alert', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(t.newSubs, 'اشتراكات جديدة', 'card'),
      kpiTile(t.renewals, 'تجديدات', 'check'),
      kpiTile(t.freezes, 'تجميدات', 'snow', 'blue'),
      kpiTile(t.returns, 'عائدون من التجميد', 'users'),
      kpiTile(t.cancels, 'إلغاءات', 'alert', 'danger'),
      kpiTile(data.attendance.uniqueTrainees, 'متدربون حضروا', 'user')));

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
        data.branches.map((b) => [b.branch, fmtMoney(b.collected),
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
async function viewKpi(root) {
  const state = { month: thisMonthISO() };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [targets, kpis, branches, trainers] = await Promise.all([
      API.get('/api/targets'),
      API.get('/api/kpi?month=' + state.month),
      API.get('/api/branches'),
      API.get('/api/users?role=trainer'),
    ]);
    container.innerHTML = '';

    const monthIn = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const bar = el('div', { class: 'card filters' }, field('شهر KPI', monthIn));
    if (API.user.role === 'admin') {
      bar.append(el('button', { class: 'btn btn--accent', onclick: () => openTargetModal(render, branches, trainers) }, '+ هدف جديد'));
    }
    container.append(bar);

    container.append(el('div', { class: 'alert alert--info' },
      'KPI = (المحقق ÷ الهدف). مؤشر كل موظف يُحسب تلقائيًا من إنجاز مهامه + تحقيق أهدافه، ويظهر في التقارير الشهرية.'));

    // الأهداف مع نسب الإنجاز
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الأهداف — مقارنة الفعلي بالمستهدف'),
      pagedTable(['النطاق', 'المؤشر', 'الفترة', 'الهدف', 'المحقق', 'نسبة الإنجاز', ''],
        targets.sort((a, b) => (a.period < b.period ? 1 : -1)),
        (x) => [x.refName || '—', x.metricLabel, periodLabel(x.period),
          x.metric === 'revenue' ? fmtMoney(x.value) : String(x.value),
          x.metric === 'revenue' ? fmtMoney(x.actual) : String(x.actual),
          progressBar(x.pct),
          API.user.role === 'admin' ? el('button', {
            class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
            onclick: async () => { await API.del('/api/targets/' + x.id); toast('حُذف الهدف.'); render(); },
          }, 'حذف') : el('span')],
        { pageSize: 12, emptyText: 'لا أهداف بعد — أضف هدفًا شهريًا أو نصف سنوي أو سنويًا.' })));

    // KPI الموظفين
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `KPI الموظفين — ${state.month} (يشمل الساعات مقابل الأشخاص الفريدين)`),
      dataTable(['المدرب', 'حصص', 'ساعات تدريب', 'متدربون فريدون', 'المهام', 'إنجاز المهام', 'إنجاز الأهداف', 'KPI النهائي'],
        kpis.map((k) => [k.name,
          el('span', { class: 'num' }, String(k.sessions)),
          el('span', { class: 'num' }, String(k.hours)),
          el('span', { class: 'num' }, String(k.uniqueTrainees)),
          k.tasksTotal ? `${k.tasksDone}/${k.tasksTotal}` : '—',
          k.tasksPct !== null ? progressBar(k.tasksPct) : '—',
          k.targetsPct !== null ? progressBar(k.targetsPct) : '—',
          k.kpi !== null
            ? el('span', { class: 'tag ' + (k.kpi >= 80 ? 'tag--accent' : k.kpi >= 50 ? 'tag--warning' : 'tag--danger'), style: 'font-size:13px' }, k.kpi + '%')
            : el('span', { class: 'tag tag--neutral' }, 'لا مهام/أهداف')]),
        'لا مدربين.')));
  }

  await render();
}

function periodLabel(p) {
  if (/^\d{4}-\d{2}$/.test(p)) return 'شهري — ' + p;
  if (/H1$/.test(p)) return 'نصف سنوي — النصف الأول ' + p.slice(0, 4);
  if (/H2$/.test(p)) return 'نصف سنوي — النصف الثاني ' + p.slice(0, 4);
  return 'سنوي — ' + p;
}

function openTargetModal(onDone, branches, trainers) {
  const scopeSel = select([['company', 'الشركة كاملة'], ['branch', 'فرع'], ['trainer', 'مدرب']]);
  const branchSel = select(branches.map((b) => [b.id, b.name]));
  const trainerSel = select(trainers.map((x) => [x.id, x.name]));
  const metricSel = select(METRIC_OPTIONS);
  const kindSel = select([['month', 'شهري'], ['H', 'نصف سنوي'], ['year', 'سنوي']]);
  const monthIn = input({ type: 'month', value: thisMonthISO() });
  const halfSel = select([[thisMonthISO().slice(0, 4) + '-H1', 'النصف الأول'], [thisMonthISO().slice(0, 4) + '-H2', 'النصف الثاني']]);
  const yearIn = input({ type: 'number', value: thisMonthISO().slice(0, 4), min: 2024, max: 2100 });
  const valueIn = input({ type: 'number', min: 1, placeholder: 'مثال: 70000' });

  const branchField = field('الفرع', branchSel); branchField.style.display = 'none';
  const trainerField = field('المدرب', trainerSel); trainerField.style.display = 'none';
  scopeSel.addEventListener('change', () => {
    branchField.style.display = scopeSel.value === 'branch' ? '' : 'none';
    trainerField.style.display = scopeSel.value === 'trainer' ? '' : 'none';
  });
  const monthField = field('الشهر', monthIn);
  const halfField = field('النصف', halfSel); halfField.style.display = 'none';
  const yearField = field('السنة', yearIn); yearField.style.display = 'none';
  kindSel.addEventListener('change', () => {
    monthField.style.display = kindSel.value === 'month' ? '' : 'none';
    halfField.style.display = kindSel.value === 'H' ? '' : 'none';
    yearField.style.display = kindSel.value === 'year' ? '' : 'none';
  });

  const close = modal('هدف جديد (Target)', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const period = kindSel.value === 'month' ? monthIn.value : kindSel.value === 'H' ? halfSel.value : String(yearIn.value);
        try {
          await API.post('/api/targets', {
            scope: scopeSel.value,
            refId: scopeSel.value === 'branch' ? Number(branchSel.value) : scopeSel.value === 'trainer' ? Number(trainerSel.value) : null,
            metric: metricSel.value, period, value: Number(valueIn.value),
          });
          toast('حُفظ الهدف — وستُحسب نسبة الإنجاز تلقائيًا.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('النطاق', scopeSel), field('المؤشر', metricSel),
      branchField, trainerField,
      field('نوع الفترة', kindSel), monthField, halfField, yearField,
      el('div', { class: 'span-2' }, field('قيمة الهدف', valueIn)),
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
        el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
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
  const today = todayISO();
  const month = thisMonthISO();
  const [logs, tasks, kpis] = await Promise.all([
    API.get('/api/trainer-logs?date=' + today),
    API.get('/api/tasks?month=' + month),
    API.get('/api/kpi?month=' + month),
  ]);
  const log = logs[0] || {};
  const myKpi = kpis[0];

  /* --- سجل اليوم --- */
  const checkIn = input({ type: 'time', value: log.checkIn || '' });
  const checkOut = input({ type: 'time', value: log.checkOut || '' });
  const goals = input({ type: 'number', min: 0, value: log.goalsCreated || 0 });
  const stories = input({ type: 'number', min: 0, value: log.stories || 0 });
  const reels = input({ type: 'number', min: 0, value: log.reels || 0 });
  const notes = input({ value: log.notes || '', placeholder: 'اختياري' });
  const autoChips = el('div', { class: 'macros', style: 'margin-bottom:10px' });

  function drawAuto(a) {
    autoChips.innerHTML = '';
    autoChips.append(
      el('span', { class: 'macro' }, 'حصص اليوم ', el('b', {}, String(a.sessions ?? '—'))),
      el('span', { class: 'macro' }, 'ساعات تدريب ', el('b', {}, String(a.trainingHours ?? '—'))),
      el('span', { class: 'macro' }, 'متدربون فريدون ', el('b', {}, String(a.uniqueTrainees ?? '—'))),
      el('span', { class: 'macro' }, 'ساعات عمل ', el('b', {}, log.workHours != null ? log.workHours + ' س' : '—')));
  }
  drawAuto({});
  API.get('/api/dashboard/trainer').catch(() => null); // يُحدث تلقائيًا في الخلفية

  const dailyCard = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `سجل اليوم — ${today}`,
      myKpi && myKpi.kpi !== null
        ? el('span', { class: 'tag ' + (myKpi.kpi >= 80 ? 'tag--accent' : myKpi.kpi >= 50 ? 'tag--warning' : 'tag--danger') }, `KPI الشهر: ${myKpi.kpi}%`)
        : el('span')),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px' },
      'الحصص وساعات التدريب والمتدربون الفريدون تُحتسب تلقائيًا من الحصص المسجلة.'),
    autoChips,
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const saved = await API.post('/api/trainer-logs', {
            date: today, checkIn: checkIn.value, checkOut: checkOut.value,
            goalsCreated: goals.value, stories: stories.value, reels: reels.value, notes: notes.value,
          });
          log.workHours = saved.workHours;
          drawAuto(saved.auto);
          toast('حُفظ سجل اليوم' + (saved.workHours != null ? ` — ساعات العمل: ${saved.workHours} س.` : '.'));
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الحضور (من الساعة)', checkIn), field('الانصراف (إلى الساعة)', checkOut),
      field('أهداف تدريبية أنشأتها', goals), field('ستوريات نشرتها', stories),
      field('ريلز/فيديوهات صوّرتها', reels), field('ملاحظات', notes),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ سجل اليوم'))));

  /* --- مهامي --- */
  const daily = tasks.filter((x) => x.type === 'daily' && x.date === today);
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

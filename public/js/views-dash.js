/* الشاشات: الدخول + لوحات الإدارة والمدرب والمحاسب + صفحة المتدرب */

/* ============================================================
   تسجيل الدخول
   ============================================================ */
function viewLogin(root) {
  const user = input({ id: 'lu', placeholder: 'اسم المستخدم', autocomplete: 'username', dir: 'ltr', style: 'text-align:end' });
  const pass = input({ id: 'lp', type: 'password', placeholder: '••••••••', autocomplete: 'current-password', dir: 'ltr', style: 'text-align:end' });
  const err = el('div', { style: 'color:var(--status-danger);font-size:13px;min-height:18px' });
  const demoBox = el('div');

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const u = await API.login(user.value.trim(), pass.value);
        location.hash = homeRoute(u.role);
      } catch (ex) { err.textContent = ex.message; }
    },
    style: 'display:flex;flex-direction:column;gap:14px',
  },
    field('اسم المستخدم', user),
    field('كلمة المرور', pass),
    err,
    el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'دخول النظام'));

  root.append(el('div', { class: 'login-screen' },
    el('div', { class: 'login-brand' },
      el('img', { class: 'login-brand__mark', src: '/assets/mark-green.svg', alt: '' }),
      el('img', { class: 'logo', src: '/assets/logo-white.svg', alt: 'سبورت باور' }),
      el('h1', { html: 'نظام الإدارة الداخلي<br><em>جسم أقوى. حياة أصحّ. نظام يبقى معك.</em>' }),
      el('p', {}, 'إدارة الفروع والمدربين والمتدربين والاشتراكات والحصص وقراءات InBody ومكتبة التغذية — في مكان واحد.')),
    el('div', { class: 'login-form-side' },
      el('div', { class: 'login-card' },
        el('h2', {}, 'تسجيل الدخول'),
        el('p', {}, 'كل مستخدم يرى صلاحياته الخاصة فقط.'),
        form,
        demoBox))));

  // بيانات الحسابات التجريبية تظهر في وضع العرض فقط
  API.config().then((cfg) => {
    if (cfg.demo) {
      demoBox.className = 'login-demo';
      demoBox.innerHTML = '<b>حسابات تجريبية:</b><br>الإدارة: <code>admin / admin123</code><br>مدرب: <code>omar / 123456</code> · محاسب: <code>rana / 123456</code><br>متدرب: <code>ahmad / 123456</code> · تغذية: <code>nour / 123456</code>';
    }
    if (cfg.volatile) {
      demoBox.prepend(el('div', { class: 'alert alert--warning', style: 'margin-bottom:10px' },
        '⚠️ قاعدة البيانات غير متصلة — الجلسات والبيانات مؤقتة وقد تُفقد. اربط Postgres عبر متغير DATABASE_URL ثم أعد النشر.'));
    }
  });
}

/* ============================================================
   لوحة الإدارة
   ============================================================ */
async function viewAdminDash(root) {
  const state = { month: thisMonthISO(), branch: '' };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [data, branches] = await Promise.all([
      API.get(`/api/dashboard/admin?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
    ]);
    container.innerHTML = '';

    const monthInput = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], { value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); } });
    container.append(el('div', { class: 'card filters' }, field('الشهر', monthInput), field('الفرع', branchSel),
      el('button', { class: 'btn btn--accent', onclick: () => openOnboardModal(render) }, '+ زبون جديد (Onboarding)'),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/reports'; } }, 'التقارير الشهرية ←'),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/settings'; } }, 'الإعدادات ←')));

    const k = data.kpis;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(k.sessionsMonth, 'حصة منفذة هذا الشهر', 'dumbbell'),
      kpiHero(fmtMoney(k.collectedMonth), 'تحصيل هذا الشهر', 'wallet', 'green'),
      kpiHero(k.activeTrainees, 'متدرب فعّال', 'users', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(k.sessionsToday, 'حصص اليوم', 'calendar'),
      kpiTile(k.expiring, 'تنتهي قريبًا', 'alert', 'warn'),
      kpiTile(k.expired, 'اشتراكات منتهية', 'alert', 'danger'),
      kpiTile(fmtMoney(k.outstanding), 'مستحقات غير محصلة', 'card', 'blue')));

    // رسم الحصص اليومية
    const days = Object.keys(data.daily).sort();
    const chart = days.length
      ? barChart(days.map((d) => d.slice(8)), days.map((d) => data.daily[d]))
      : el('div', { class: 'empty' }, 'لا توجد حصص مسجلة في هذا الشهر.');

    container.append(el('div', { class: 'grid-2' },
      el('div', { class: 'card' }, el('h3', { class: 'card__title' }, `الحصص المنفذة يوميًا — ${data.month}`), chart),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'اشتراكات تحتاج متابعة'),
        dataTable(['المتدرب', 'المتبقي', 'ينتهي في', 'الحالة'],
          data.expiringList.map((s) => [
            el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, s.traineeName),
            `${s.remaining} من ${s.totalSessions}`, s.endDate, statusTag(s.status, s.expiring)]),
          'لا توجد اشتراكات قريبة من الانتهاء.'))));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `أداء المدربين — ${data.month}`,
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة')),
      dataTable(['المدرب', 'التخصص', 'عدد الحصص', 'عدد الأشخاص', 'متدربون فريدون', 'ساعات التدريب'],
        data.trainers.map((t) => [t.name, t.specialty || '—',
          el('span', { class: 'num' }, String(t.sessions)), el('span', { class: 'num' }, String(t.persons)),
          el('span', { class: 'num' }, String(t.uniqueTrainees)), el('span', { class: 'num' }, String(t.hours))]))));
  }

  await render();
}

/* ============================================================
   لوحة المدرب
   ============================================================ */
async function viewTrainerDash(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const data = await API.get('/api/dashboard/trainer');
    container.innerHTML = '';

    // تنبيه قبل الحصة
    data.upcomingSoon.forEach((a) => {
      container.append(el('div', { class: 'alert alert--warning' },
        `⏰ تنبيه: لديك حصة قريبة مع ${a.traineeName} اليوم الساعة ${a.time}.`));
    });

    const k = data.kpis;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(k.sessionsMonth, 'حصة نفذتها هذا الشهر', 'dumbbell'),
      kpiHero(k.hours, 'ساعة تدريب', 'clock', 'green')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(k.today, 'مواعيد اليوم', 'calendar'),
      kpiTile(k.persons, 'أشخاص دربتهم', 'users'),
      kpiTile(k.uniqueTrainees, 'متدربون فريدون', 'user', 'blue')));

    // المتابعة اليومية: سجل اليوم + مهامي (KPI)
    await renderTrainerOps(container);

    // البرامج التدريبية — تُربط تلقائيًا بكل المتدربين
    await renderTrainerPrograms(container, render);

    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'جدول اليوم',
          el('a', { class: 'btn btn--outline btn--sm', href: '#/calendar' }, 'التقويم الكامل')),
        dataTable(['الساعة', 'المتدرب', 'النوع', 'ملاحظة', ''],
          data.todayAppointments.map((a) => [a.time, a.traineeName,
            a.kind === 'makeup' ? el('span', { class: 'tag tag--info' }, 'تعويض') : el('span', { class: 'tag tag--neutral' }, 'عادية'),
            a.note || '—',
            el('button', {
              class: 'btn btn--accent btn--sm',
              onclick: () => openLogSessionModal(render, { traineeId: a.traineeId, time: a.time, appointmentId: a.id, kind: a.kind }),
            }, 'تسجيل الحصة')]),
          'لا مواعيد لهذا اليوم.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'آخر الحصص المسجلة',
          el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة')),
        dataTable(['التاريخ', 'الساعة', 'الأسلوب', 'المدة'],
          data.recentSessions.map((s) => [s.date, s.time,
            s.kind === 'makeup' ? el('span', {}, el('span', { class: 'tag tag--info' }, 'تعويض'), ' ', s.style || '') : (s.style || '—'),
            s.duration + ' د']),
          'لم تسجل حصصًا هذا الشهر بعد.'))));
  }

  await render();
}

/* ============================================================
   نافذة تسجيل حصة — منطق الخصم
   ============================================================ */
async function openLogSessionModal(onDone, prefill = {}) {
  const trainees = await API.get('/api/users?role=trainee');
  let trainers = [];
  if (API.user.role === 'admin') trainers = await API.get('/api/users?role=trainer');

  const traineeSel = searchSelect(trainees.map(traineeOption), { value: prefill.traineeId || '' });
  const trainerSel = trainers.length ? select(trainers.map((t) => [t.id, t.name])) : null;
  const kindSel = select([['regular', 'عادية — تُخصم من الاشتراك'], ['makeup', 'تعويض — لا تُخصم من الاشتراك']],
    { value: prefill.kind === 'makeup' ? 'makeup' : 'regular' });
  const dateIn = input({ type: 'date', value: todayISO() });
  const timeIn = input({ type: 'time', value: prefill.time || '17:00' });
  const durIn = input({ type: 'number', value: 60, min: 15, step: 15 });
  const styleIn = input({ placeholder: 'مثال: قوة — دفع / HIIT / مرونة' });
  const weightIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const notesIn = textarea({ placeholder: 'ملاحظات المدرب…' });

  const saveBtn = el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'حفظ الحصة وخصمها من الاشتراك');
  kindSel.addEventListener('change', () => {
    saveBtn.textContent = kindSel.value === 'makeup' ? 'حفظ الحصة التعويضية (بلا خصم)' : 'حفظ الحصة وخصمها من الاشتراك';
  });
  if (prefill.kind === 'makeup') saveBtn.textContent = 'حفظ الحصة التعويضية (بلا خصم)';

  const close = modal('تسجيل حصة منفذة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const res = await API.post('/api/sessions', {
            traineeId: Number(traineeSel.value),
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            kind: kindSel.value,
            date: dateIn.value, time: timeIn.value, duration: Number(durIn.value),
            style: styleIn.value, notes: notesIn.value,
            weight: weightIn.value || null,
            appointmentId: prefill.appointmentId || null,
          });
          close();
          toast(res.makeup
            ? 'سُجّلت الحصة التعويضية — دون خصم من رصيد المتدرب.'
            : `تم تسجيل الحصة وخصمها — متبقي ${res.remaining} حصة من أصل ${res.total}.`);
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel),
      trainerSel ? field('المدرب', trainerSel) : el('span'),
      el('div', { class: 'span-2' }, field('نوع الحصة', kindSel)),
      field('التاريخ', dateIn),
      field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn),
      field('الوزن الحالي (كغ)', weightIn),
      el('div', { class: 'span-2' }, field('الأسلوب التدريبي', styleIn)),
      el('div', { class: 'span-2' }, field('ملاحظات المدرب', notesIn)),
      el('div', { class: 'span-2' }, saveBtn)),
  ]);
}

/* ============================================================
   اللوحة المالية — المحاسب
   ============================================================ */
async function viewAccountantDash(root) {
  const state = { month: thisMonthISO(), branch: '' };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [data, branches, expenses, targets] = await Promise.all([
      API.get(`/api/dashboard/accountant?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
      API.get(`/api/expenses?month=${state.month}` + (state.branch ? `&branch=${state.branch}` : '')),
      API.get('/api/targets').catch(() => []),
    ]);
    container.innerHTML = '';

    const monthInput = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], { value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); } });
    container.append(el('div', { class: 'card filters' },
      field('الشهر', monthInput), field('الفرع', branchSel),
      el('button', { class: 'btn btn--accent', onclick: () => openOnboardModal(render) }, '+ مشترك جديد (Onboarding)'),
      el('button', { class: 'btn btn--outline', onclick: () => openPaymentModal(render, data.subscriptions) }, '+ دفعة جديدة'),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/reports'; } }, 'التقارير الشهرية ←')));

    const k = data.kpis;
    const expensesTotal = expenses.reduce((s, x) => s + x.amount, 0);
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(fmtMoney(k.collectedMonth), 'تحصيل هذا الشهر', 'wallet', 'green'),
      kpiHero(fmtMoney(expensesTotal), 'مصاريف هذا الشهر', 'card'),
      kpiHero(fmtMoney(k.collectedMonth - expensesTotal), 'صافي الربح', 'chart', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(fmtMoney(k.outstanding), 'متبقٍ غير محصل', 'alert', 'warn'),
      kpiTile(k.paymentsCount, 'عدد الدفعات', 'file'),
      kpiTile(k.renewed, 'اشتراكات مجددة', 'check'),
      kpiTile(k.expired, 'اشتراكات منتهية', 'alert', 'danger')));

    /* الأهداف الشهرية لكل فرع + السنوية مقسمة على الأشهر — بوضوح أمام المحاسب */
    const year = state.month.slice(0, 4);
    const goalTargets = targets.filter((t) => ['company', 'branch'].includes(t.scope)
      && (t.period === state.month || t.period === year)
      && (!state.branch || t.scope === 'company' || t.refId === Number(state.branch)));
    if (goalTargets.length) {
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `أهداف ${state.month} — الشهرية والسنوية`,
          el('a', { class: 'btn btn--outline btn--sm', href: '#/kpi' }, 'كل الأهداف ←')),
        dataTable(['النطاق', 'المؤشر', 'الفترة', 'الهدف', 'المرحَّل', 'المطلوب فعليًا', 'المحقق', 'الإنجاز'],
          goalTargets.map((t) => {
            const money = t.metric === 'revenue';
            const fv = (v) => (money ? fmtMoney(v) : String(v));
            const annual = /^\d{4}$/.test(t.period);
            return [t.refName || '—', t.metricLabel,
              annual ? el('span', {}, 'سنوي — ', el('b', {}, fv(Math.round(t.value / 12))), ' شهريًا') : 'شهري',
              fv(t.value),
              t.carried > 0 ? el('span', { class: 'tag tag--warning' }, '+' + fv(t.carried)) : '—',
              el('b', {}, fv(t.effective || t.value)), fv(t.actual), progressBar(t.pct)];
          }))));
    }

    /* إدارة المصاريف الشهرية */
    container.append(expensesCard(expenses, branches, state.month, render));

    const months = Object.keys(data.byMonth).sort().slice(-6);
    container.append(el('div', { class: 'grid-2' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'التحصيل الشهري (آخر 6 أشهر)'),
        months.length ? barChart(months.map((m) => m.slice(2)), months.map((m) => data.byMonth[m])) : el('div', { class: 'empty' }, 'لا بيانات.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `دفعات شهر ${data.month}`),
        pagedTable(['المتدرب', 'المبلغ', 'التاريخ', 'الطريقة', ''],
          data.payments,
          (p) => {
            const sub = data.subscriptions.find((s) => s.id === p.subscriptionId) || {};
            return [sub.traineeName || '—', fmtMoney(p.amount), p.date, p.method,
              el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openPaymentModal(render, data.subscriptions, p) }, 'تعديل')];
          },
          { pageSize: 10, emptyText: 'لا دفعات في هذا الشهر.',
            searchText: (p) => ((data.subscriptions.find((s) => s.id === p.subscriptionId) || {}).traineeName || '') }))));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الاشتراكات — الحالة المالية'),
      pagedTable(['المتدرب', 'قيمة الاشتراك', 'المدفوع', 'المتبقي', 'تاريخ البدء', 'تاريخ الانتهاء', 'الحالة'],
        data.subscriptions,
        (s) => [el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, s.traineeName),
          fmtMoney(s.price), fmtMoney(s.paid),
          el('span', { style: s.remaining > 0 ? 'color:var(--status-danger);font-weight:700' : '' }, fmtMoney(s.remaining)),
          s.startDate, s.endDate, statusTag(s.status)],
        { pageSize: 15, searchText: (s) => s.traineeName || '', searchPlaceholder: 'ابحث باسم المتدرب…' })));
  }

  await render();
}

async function openPaymentModal(onDone, subscriptions, existing) {
  const subOptions = subscriptions.map((s) => [s.id, `${s.traineeName} — ${fmtMoney(s.price)} (متبقي ${fmtMoney(s.remaining)})`]);
  const subSel = existing
    ? select(subOptions, { value: existing.subscriptionId })
    : searchSelect(subOptions, { placeholder: 'اكتب اسم المتدرب للبحث…' });
  const amountIn = input({ type: 'number', min: 1, value: existing ? existing.amount : '' });
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  const methodSel = select([['كاش', 'كاش'], ['بطاقة', 'بطاقة'], ['تحويل بنكي', 'تحويل بنكي']], { value: existing ? existing.method : 'كاش' });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });

  const close = modal(existing ? 'تعديل دفعة' : 'إضافة دفعة جديدة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!existing && !subSel.value) { toast('اختر الاشتراك من القائمة.', true); return; }
        try {
          if (existing) {
            await API.put('/api/payments/' + existing.id, { amount: amountIn.value, date: dateIn.value, method: methodSel.value, note: noteIn.value });
            toast('تم تعديل الدفعة.');
          } else {
            await API.post('/api/payments', { subscriptionId: Number(subSel.value), amount: amountIn.value, date: dateIn.value, method: methodSel.value, note: noteIn.value });
            toast('تمت إضافة الدفعة — تحدّثت الأرقام تلقائيًا.');
          }
          close();
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('الاشتراك', subSel)),
      field(`المبلغ (${curInfo().name})`, amountIn),
      field('تاريخ الدفع', dateIn),
      field('طريقة الدفع', methodSel),
      field('ملاحظة', noteIn),
      /* سجل التدقيق: من عدّل الدفعة ومتى وما الذي تغيّر */
      existing && existing.history && existing.history.length
        ? el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted);border-top:1px solid var(--app-line);padding-top:10px' },
          el('b', { style: 'color:var(--app-ink)' }, 'سجل التعديلات:'),
          ...existing.history.slice(-5).reverse().map((hst) => {
            const FIELD_LABELS = { amount: 'المبلغ', date: 'التاريخ', method: 'الطريقة', note: 'الملاحظة' };
            const parts = Object.entries(hst.changes).map(([k, [from, to]]) => `${FIELD_LABELS[k] || k}: ${from ?? '—'} ← ${to ?? '—'}`);
            return el('div', { style: 'margin-top:4px' }, `${hst.at.slice(0, 16).replace('T', ' ')} — ${hst.byName}: ${parts.join(' · ')}`);
          }))
        : el('span'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'حفظ الدفعة'))),
  ]);
  if (existing) subSel.disabled = true;
}

/* ============================================================
   صفحة المتدرب (لنفسه أو تعرضها الإدارة/المدرب)
   ============================================================ */
async function viewTraineePage(root, traineeId) {
  const container = el('div', { class: 'content' });
  root.append(container);
  container.append(spinnerCard());
  const data = await API.get(`/api/trainee/${traineeId}/overview`);
  container.innerHTML = '';

  const sub = data.subscription;
  const t = data.trainee;
  const isStaff = ['admin', 'trainer', 'accountant', 'nutritionist'].includes(API.user.role);
  const infoChip = (label, value) => el('span', { class: 'macro' }, label + ' ', el('b', {}, value || '—'));

  const headCard = el('div', { class: 'card', style: 'display:flex;gap:26px;align-items:center;flex-wrap:wrap' },
    sub ? progressRing(sub.usedSessions, sub.totalSessions) : el('div', { class: 'empty' }, 'لا اشتراك فعّال'),
    el('div', { style: 'flex:1;min-width:260px' },
      el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
        el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.4rem;color:var(--app-ink)' }, t.name),
        t.active === false ? el('span', { class: 'tag tag--danger' }, 'حساب معطّل') : ''),
      el('div', { style: 'color:var(--app-muted);font-size:13px;margin:4px 0 10px' },
        `${data.branchName || ''} · الهدف: ${GOAL_LABELS[t.goal] || '—'}` +
        (data.trainerName ? ` · آخر مدرب: ${data.trainerName}` : '')),
      el('div', { class: 'macros', style: 'margin-bottom:10px' },
        infoChip('الجوال', t.phone), infoChip('الميلاد', t.birthDate),
        infoChip('انضم', t.joinedAt), infoChip('اسم المستخدم', t.username)),
      sub ? el('div', { style: 'display:flex;flex-direction:column;gap:6px;font-size:14px' },
        el('div', {}, `عدد الحصص الكلي: `, el('b', {}, String(sub.totalSessions)),
          ' · المستخدمة: ', el('b', {}, String(sub.usedSessions)),
          ' · المتبقية: ', el('b', { style: 'color:var(--accent-hover)' }, String(sub.remaining))),
        el('div', {}, `تاريخ الاشتراك: ${sub.startDate} — ينتهي: ${sub.endDate} `, statusTag(sub.status, sub.expiring)))
        : el('div', { class: 'alert alert--warning' }, 'لا يوجد اشتراك فعّال — يرجى التجديد.')));
  container.append(headCard);

  /* شريط الإجراءات السريعة للموظفين */
  if (isStaff) {
    const refresh = () => { root.innerHTML = ''; viewTraineePage(root, traineeId); };
    const actions = el('div', { class: 'card filters' });
    if (['admin', 'trainer'].includes(API.user.role)) {
      actions.append(
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(refresh, { traineeId }) }, '+ تسجيل حصة'),
        el('button', {
          class: 'btn btn--outline btn--sm',
          onclick: async () => {
            const [trainers, trainees] = await Promise.all([
              API.user.role === 'admin' ? API.get('/api/users?role=trainer') : Promise.resolve([]),
              API.get('/api/users?role=trainee')]);
            openApptModal(refresh, trainers, trainees, null, traineeId);
          },
        }, '+ حجز موعد'),
        el('button', {
          class: 'btn btn--outline btn--sm',
          onclick: async () => openInbodyModal(refresh, traineeId, await API.get('/api/users?role=trainee')),
        }, '+ قراءة InBody'));
    }
    // التجديد من الإدارة أو المحاسب (إدخال الاشتراكات صلاحية المحاسب)
    if (['admin', 'accountant'].includes(API.user.role)) {
      actions.append(el('button', {
        class: 'btn btn--outline btn--sm',
        onclick: async () => openSubModal(refresh, await API.get('/api/users?role=trainee'), traineeId),
      }, 'تجديد الاشتراك'));
    }
    if (API.user.role === 'admin') {
      actions.append(el('button', {
        class: 'btn btn--outline btn--sm',
        onclick: async () => openEditTraineeModal(refresh, t, [], await API.get('/api/branches')),
      }, 'تعديل البيانات'));
    }
    if (['admin', 'accountant'].includes(API.user.role) && data.payments) {
      const paidOf = (sid) => data.payments.filter((p) => p.subscriptionId === sid).reduce((s, p) => s + p.amount, 0);
      const subsForPay = data.subscriptions.filter((s) => s.status !== 'cancelled').map((s) => ({
        id: s.id, traineeName: t.name, price: s.price, paid: paidOf(s.id), remaining: Math.max(0, s.price - paidOf(s.id)),
      }));
      if (subsForPay.length) {
        actions.append(el('button', { class: 'btn btn--outline btn--sm', onclick: () => openPaymentModal(refresh, subsForPay) }, '+ دفعة جديدة'));
      }
    }
    if (t.phone) {
      actions.append(el('a', {
        class: 'btn btn--petrol btn--sm', target: '_blank',
        href: waLink(t.phone, OPS_SETTINGS.waCountryCode || '970', '', t.name),
      }, 'واتساب'));
    }
    container.append(actions);
  }

  /* إحصاءات الحضور والمال */
  const statTiles = el('div', { class: 'kpis' },
    kpiTile(data.attendance.attended, 'حصة حضرها', 'check'),
    kpiTile(data.attendance.missed, 'غياب', 'alert', data.attendance.missed >= 2 ? 'danger' : undefined),
    kpiTile(data.attendance.pct !== null ? data.attendance.pct + '%' : '—', 'نسبة الحضور', 'pulse', 'blue'));
  if (data.finance) {
    statTiles.append(
      kpiTile(fmtMoney(data.finance.totalPaid), 'إجمالي المدفوع', 'wallet'),
      kpiTile(fmtMoney(data.finance.remaining), 'متبقٍ عليه', 'card', data.finance.remaining > 0 ? 'warn' : undefined));
  }
  container.append(statTiles);

  /* نقاطي ومكافآتي — بطاقة سريعة للمتدرب */
  if (API.user.role === 'trainee' && API.user.id === traineeId) {
    try {
      const loyalty = await API.get('/api/loyalty/me');
      container.append(el('div', { class: 'card', style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between' },
        el('div', { style: 'display:flex;align-items:center;gap:12px' },
          el('span', { class: 'kpi__ic' }, icon('star')),
          el('div', {},
            el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.2rem;color:var(--app-ink)' }, `${loyalty.balance} نقطة 🎁`),
            el('div', { style: 'font-size:12px;color:var(--app-muted)' }, 'اكسب نقاطًا بحضور حصصك وتجديد اشتراكك ودعوة أصدقائك — واستبدلها بمكافآت.'))),
        el('a', { class: 'btn btn--accent', href: '#/points' }, 'نقاطي ومكافآتي ←')));
    } catch (e) { /* تجاهل */ }
  }

  /* البرنامج التدريبي — يُربط تلقائيًا بكل المتدربين */
  try {
    const programs = await API.get('/api/programs' + (API.user.role === 'trainer' ? '?all=1' : ''));
    if (programs.length) container.append(programsListCard(programs, 'البرنامج التدريبي'));
  } catch (e) { /* تجاهل */ }

  /* تاريخ الاشتراكات + الدفعات */
  const historyGrid = el('div', { class: 'grid-2eq' });
  historyGrid.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'تاريخ الاشتراكات'),
    dataTable(['الحصص', 'المستخدم', 'القيمة', 'من', 'إلى', 'الحالة'],
      data.subscriptions.slice().reverse().map((s) => [String(s.totalSessions), String(s.usedSessions),
        fmtMoney(s.price), s.startDate, s.endDate, statusTag(s.status, s.expiring)]),
      'لا اشتراكات بعد.')));
  if (data.payments) {
    historyGrid.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'سجل الدفعات'),
      dataTable(['التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة'],
        data.payments.slice().reverse().map((p) => [p.date, fmtMoney(p.amount), p.method, p.note || '—']),
        'لا دفعات مسجلة.')));
  }
  container.append(historyGrid);

  // مواعيد + ملاحظات
  container.append(el('div', { class: 'grid-2eq' },
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'مواعيدي القادمة'),
      dataTable(['التاريخ', 'الساعة', 'المدرب', 'ملاحظة'],
        data.appointments.map((a) => [a.date, a.time, a.trainerName, a.note || '—']),
        'لا مواعيد قادمة.')),
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'ملاحظات المدرب'),
      data.notes.length
        ? el('div', {}, ...data.notes.map((n) => el('div', { class: 'notif' }, n.note, el('time', {}, n.date))))
        : el('div', { class: 'empty' }, 'لا ملاحظات بعد.'))));

  // InBody — رسم ومقارنة
  const rs = data.inbody;
  const inbodyCard = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'قراءات الوزن والـ InBody',
      el('span', { class: 'legend' },
        el('span', {}, el('i', { style: 'background:var(--accent)' }), 'الوزن (كغ)'),
        el('span', {}, el('i', { style: 'background:var(--blue-500)' }), 'نسبة الدهون %'))));
  if (rs.length) {
    inbodyCard.append(lineChart(rs.map((r) => r.date.slice(5)), rs.map((r) => r.weight), rs.map((r) => r.bodyFatPct)));
    inbodyCard.append(inbodyComparisonTable(rs));
  } else {
    inbodyCard.append(el('div', { class: 'empty' }, 'لا قراءات InBody بعد.'));
  }
  container.append(inbodyCard);

  // سجل الحصص
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'سجل الحصص'),
    pagedTable(['التاريخ', 'الساعة', 'المدة', 'الأسلوب', 'الوزن', 'ملاحظات'],
      data.sessions,
      (s) => [s.date, s.time, s.duration + ' د', s.style || '—', s.weight ? s.weight + ' كغ' : '—', s.notes || '—'],
      { pageSize: 10, emptyText: 'لا حصص مسجلة بعد.' })));

  // البرنامج الغذائي
  if (data.mealPlans.length || API.user.role === 'trainee') {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'برنامجي الغذائي اليومي',
        el('a', { class: 'btn btn--outline btn--sm', href: '#/meals' }, 'مكتبة التغذية')),
      data.mealPlans.length
        ? el('div', { class: 'meals-grid' }, ...data.mealPlans.map((p) => mealCard(p.meal, { slotLabel: MEAL_TYPES[p.slot] })))
        : el('div', { class: 'empty' }, 'لم يُربط برنامج غذائي بعد — تصفح مكتبة التغذية حسب هدفك.')));
  }
}

function inbodyComparisonTable(readings) {
  const first = readings[0], last = readings[readings.length - 1];
  const rows = [
    ['الوزن (كغ)', 'weight'], ['نسبة الدهون %', 'bodyFatPct'], ['كتلة العضلات (كغ)', 'muscleMass'],
    ['دهون الجسم (كغ)', 'fatMass'], ['الماء (لتر)', 'water'], ['BMI', 'bmi'], ['النقاط', 'score'],
  ].filter(([, k]) => last[k] != null || first[k] != null);
  return dataTable(['المؤشر', `أول قراءة (${first.date})`, `آخر قراءة (${last.date})`, 'التغير'],
    rows.map(([label, k]) => {
      const a = first[k], b = last[k];
      const delta = a != null && b != null ? +(b - a).toFixed(1) : null;
      const good = (k === 'muscleMass' || k === 'water' || k === 'score') ? delta > 0 : delta < 0;
      return [label, a ?? '—', b ?? '—',
        delta === null ? '—' : el('span', { class: 'tag ' + (delta === 0 ? 'tag--neutral' : good ? 'tag--accent' : 'tag--danger') },
          (delta > 0 ? '+' : '') + delta)];
    }));
}

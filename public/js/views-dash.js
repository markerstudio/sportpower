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
    container.append(el('div', { class: 'filters' }, field('الشهر', monthInput), field('الفرع', branchSel),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/reports'; } }, 'التقارير الشهرية ←')));

    const k = data.kpis;
    container.append(el('div', { class: 'kpis' },
      kpi(k.sessionsToday, 'حصص اليوم'),
      kpi(k.sessionsMonth, 'حصص هذا الشهر'),
      kpi(k.activeTrainees, 'متدربون فعالون'),
      kpi(k.expiring, 'اشتراكات تنتهي قريبًا', 'warn'),
      kpi(k.expired, 'اشتراكات منتهية', 'danger'),
      kpi(fmtMoney(k.collectedMonth), 'تحصيل الشهر', 'blue'),
      kpi(fmtMoney(k.outstanding), 'مستحقات غير محصلة', 'warn')));

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
          data.expiringList.map((s) => [s.traineeName, `${s.remaining} من ${s.totalSessions}`, s.endDate, statusTag(s.status, s.expiring)]),
          'لا توجد اشتراكات قريبة من الانتهاء.'))));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `أداء المدربين — ${data.month}`,
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة')),
      dataTable(['المدرب', 'التخصص', 'عدد الحصص', 'عدد الأشخاص', 'متدربون فريدون', 'ساعات التدريب'],
        data.trainers.map((t) => [t.name, t.specialty || '—',
          el('span', { class: 'num' }, String(t.sessions)), el('span', { class: 'num' }, String(t.persons)),
          el('span', { class: 'num' }, String(t.uniqueTrainees)), el('span', { class: 'num' }, String(t.hours))]))));
  }

  function kpi(value, label, tone) {
    return el('div', { class: 'kpi' + (tone ? ' kpi--' + tone : '') },
      el('div', { class: 'kpi__value' }, String(value)),
      el('div', { class: 'kpi__label' }, label));
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
    container.append(el('div', { class: 'kpis' },
      kv(k.today, 'مواعيد اليوم'),
      kv(k.sessionsMonth, 'حصص هذا الشهر'),
      kv(k.persons, 'أشخاص دربتهم'),
      kv(k.uniqueTrainees, 'متدربون فريدون'),
      kv(k.hours, 'ساعات التدريب')));

    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'جدول اليوم',
          el('a', { class: 'btn btn--outline btn--sm', href: '#/calendar' }, 'التقويم الكامل')),
        dataTable(['الساعة', 'المتدرب', 'ملاحظة', ''],
          data.todayAppointments.map((a) => [a.time, a.traineeName, a.note || '—',
            el('button', {
              class: 'btn btn--accent btn--sm',
              onclick: () => openLogSessionModal(render, { traineeId: a.traineeId, time: a.time, appointmentId: a.id }),
            }, 'تسجيل الحصة')]),
          'لا مواعيد لهذا اليوم.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'آخر الحصص المسجلة',
          el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة')),
        dataTable(['التاريخ', 'الساعة', 'الأسلوب', 'المدة'],
          data.recentSessions.map((s) => [s.date, s.time, s.style || '—', s.duration + ' د']),
          'لم تسجل حصصًا هذا الشهر بعد.'))));
  }

  function kv(value, label) {
    return el('div', { class: 'kpi' }, el('div', { class: 'kpi__value' }, String(value)), el('div', { class: 'kpi__label' }, label));
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

  const traineeSel = select(trainees.map((t) => [t.id, t.name]), { value: prefill.traineeId || (trainees[0] || {}).id });
  const trainerSel = trainers.length ? select(trainers.map((t) => [t.id, t.name])) : null;
  const dateIn = input({ type: 'date', value: todayISO() });
  const timeIn = input({ type: 'time', value: prefill.time || '17:00' });
  const durIn = input({ type: 'number', value: 60, min: 15, step: 15 });
  const styleIn = input({ placeholder: 'مثال: قوة — دفع / HIIT / مرونة' });
  const weightIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const notesIn = textarea({ placeholder: 'ملاحظات المدرب…' });

  const close = modal('تسجيل حصة منفذة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const res = await API.post('/api/sessions', {
            traineeId: Number(traineeSel.value),
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            date: dateIn.value, time: timeIn.value, duration: Number(durIn.value),
            style: styleIn.value, notes: notesIn.value,
            weight: weightIn.value || null,
            appointmentId: prefill.appointmentId || null,
          });
          close();
          toast(`تم تسجيل الحصة وخصمها — متبقي ${res.remaining} حصة من أصل ${res.total}.`);
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel),
      trainerSel ? field('المدرب', trainerSel) : el('span'),
      field('التاريخ', dateIn),
      field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn),
      field('الوزن الحالي (كغ)', weightIn),
      el('div', { class: 'span-2' }, field('الأسلوب التدريبي', styleIn)),
      el('div', { class: 'span-2' }, field('ملاحظات المدرب', notesIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'حفظ الحصة وخصمها من الاشتراك'))),
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
    const [data, branches] = await Promise.all([
      API.get(`/api/dashboard/accountant?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
    ]);
    container.innerHTML = '';

    const monthInput = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], { value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); } });
    container.append(el('div', { class: 'filters' },
      field('الشهر', monthInput), field('الفرع', branchSel),
      el('button', { class: 'btn btn--accent', onclick: () => openPaymentModal(render, data.subscriptions) }, '+ دفعة جديدة')));

    const k = data.kpis;
    container.append(el('div', { class: 'kpis' },
      el('div', { class: 'kpi kpi--blue' }, el('div', { class: 'kpi__value' }, fmtMoney(k.collectedMonth)), el('div', { class: 'kpi__label' }, 'تحصيل الشهر')),
      el('div', { class: 'kpi' }, el('div', { class: 'kpi__value' }, String(k.paymentsCount)), el('div', { class: 'kpi__label' }, 'عدد الدفعات')),
      el('div', { class: 'kpi kpi--warn' }, el('div', { class: 'kpi__value' }, fmtMoney(k.outstanding)), el('div', { class: 'kpi__label' }, 'متبقٍ غير محصل')),
      el('div', { class: 'kpi' }, el('div', { class: 'kpi__value' }, String(k.renewed)), el('div', { class: 'kpi__label' }, 'اشتراكات مجددة')),
      el('div', { class: 'kpi kpi--danger' }, el('div', { class: 'kpi__value' }, String(k.expired)), el('div', { class: 'kpi__label' }, 'اشتراكات منتهية'))));

    const months = Object.keys(data.byMonth).sort().slice(-6);
    container.append(el('div', { class: 'grid-2' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'التحصيل الشهري (آخر 6 أشهر)'),
        months.length ? barChart(months.map((m) => m.slice(2)), months.map((m) => data.byMonth[m])) : el('div', { class: 'empty' }, 'لا بيانات.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `دفعات شهر ${data.month}`),
        dataTable(['المتدرب', 'المبلغ', 'التاريخ', 'الطريقة', ''],
          data.payments.map((p) => {
            const sub = data.subscriptions.find((s) => s.id === p.subscriptionId) || {};
            return [sub.traineeName || '—', fmtMoney(p.amount), p.date, p.method,
              el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openPaymentModal(render, data.subscriptions, p) }, 'تعديل')];
          }), 'لا دفعات في هذا الشهر.'))));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الاشتراكات — الحالة المالية'),
      dataTable(['المتدرب', 'قيمة الاشتراك', 'المدفوع', 'المتبقي', 'تاريخ البدء', 'تاريخ الانتهاء', 'الحالة'],
        data.subscriptions.map((s) => [s.traineeName, fmtMoney(s.price), fmtMoney(s.paid),
          el('span', { style: s.remaining > 0 ? 'color:var(--status-danger);font-weight:700' : '' }, fmtMoney(s.remaining)),
          s.startDate, s.endDate, statusTag(s.status)]))));
  }

  await render();
}

async function openPaymentModal(onDone, subscriptions, existing) {
  const subSel = select(subscriptions.map((s) => [s.id, `${s.traineeName} — ${fmtMoney(s.price)} (متبقي ${fmtMoney(s.remaining)})`]),
    { value: existing ? existing.subscriptionId : undefined });
  const amountIn = input({ type: 'number', min: 1, value: existing ? existing.amount : '' });
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  const methodSel = select([['كاش', 'كاش'], ['بطاقة', 'بطاقة'], ['تحويل بنكي', 'تحويل بنكي']], { value: existing ? existing.method : 'كاش' });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });

  const close = modal(existing ? 'تعديل دفعة' : 'إضافة دفعة جديدة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
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
      field('المبلغ (ر.س)', amountIn),
      field('تاريخ الدفع', dateIn),
      field('طريقة الدفع', methodSel),
      field('ملاحظة', noteIn),
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
  const headCard = el('div', { class: 'card', style: 'display:flex;gap:26px;align-items:center;flex-wrap:wrap' },
    sub ? progressRing(sub.usedSessions, sub.totalSessions) : el('div', { class: 'empty' }, 'لا اشتراك فعّال'),
    el('div', { style: 'flex:1;min-width:230px' },
      el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.4rem;color:var(--text-strong)' }, data.trainee.name),
      el('div', { style: 'color:var(--text-muted);font-size:13px;margin:4px 0 10px' },
        `${data.branchName || ''} · المدرب: ${data.trainerName || '—'} · الهدف: ${GOAL_LABELS[data.trainee.goal] || '—'}`),
      sub ? el('div', { style: 'display:flex;flex-direction:column;gap:6px;font-size:14px' },
        el('div', {}, `عدد الحصص الكلي: `, el('b', {}, String(sub.totalSessions)),
          ' · المستخدمة: ', el('b', {}, String(sub.usedSessions)),
          ' · المتبقية: ', el('b', { style: 'color:var(--accent-hover)' }, String(sub.remaining))),
        el('div', {}, `تاريخ الاشتراك: ${sub.startDate} — ينتهي: ${sub.endDate} `, statusTag(sub.status, sub.expiring)))
        : el('div', { class: 'alert alert--warning' }, 'لا يوجد اشتراك فعّال — يرجى التجديد.')));
  container.append(headCard);

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
    dataTable(['التاريخ', 'الساعة', 'المدة', 'الأسلوب', 'الوزن', 'ملاحظات'],
      data.sessions.map((s) => [s.date, s.time, s.duration + ' د', s.style || '—', s.weight ? s.weight + ' كغ' : '—', s.notes || '—']),
      'لا حصص مسجلة بعد.')));

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

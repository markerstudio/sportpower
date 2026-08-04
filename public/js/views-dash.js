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
      // ضغطة مزدوجة أثناء انتظار الخادم كانت تُظهر خطوة التحقق مرتين
      const btn = e.target.querySelector('button[type=submit]');
      if (btn.disabled) return;
      btn.disabled = true;
      err.textContent = '';
      try {
        const res = await API.login(user.value.trim(), pass.value);
        if (res && (res.mfaRequired || res.mfaSetupRequired)) { showMfaStep(res); return; }
        location.hash = homeRoute(res.role);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    },
    style: 'display:flex;flex-direction:column;gap:14px',
  },
    field('اسم المستخدم', user),
    field('كلمة المرور', pass),
    err,
    el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'دخول النظام'));

  /* التحقق الثنائي: إدخال رمز التطبيق — أو التسجيل الأول بمسح QR */
  let mfaBox = null;
  function showMfaStep(res) {
    form.style.display = 'none';
    demoBox.innerHTML = '';
    if (mfaBox) mfaBox.remove(); // لا تتكرر الخطوة مهما تكرر الاستدعاء
    const isSetup = !!res.mfaSetupRequired;

    const codeIn = input({
      class: 'field__input mfa-code', placeholder: '· · · · · ·',
      dir: 'ltr', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: isSetup ? 6 : 9,
    });
    const mfaErr = el('div', { style: 'color:var(--status-danger);font-size:13px;min-height:18px;text-align:center' });
    const box = el('div', { class: 'mfa-box' });

    // متصفح موثوق: لا يُطلب رمز التطبيق عليه لثلاثين يومًا
    const trustChk = el('input', { type: 'checkbox', id: 'mfa-trust' });
    trustChk.checked = true;
    const trustRow = el('label', { class: 'mfa-trust', for: 'mfa-trust' },
      trustChk, 'الوثوق بهذا المتصفح ٣٠ يومًا — لا يُطلب الرمز عليه');

    const codeForm = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const vbtn = e.target.querySelector('button[type=submit]');
        if (vbtn.disabled) return;
        vbtn.disabled = true;
        mfaErr.textContent = '';
        try {
          const data = await API.loginMfa(res.mfaToken, codeIn.value, trustChk.checked, user.value.trim().toLowerCase());
          if (data.backupCodes) { showBackupCodes(data); return; }
          location.hash = homeRoute(data.user.role);
        } catch (ex) { mfaErr.textContent = ex.message; vbtn.disabled = false; codeIn.select(); }
      },
      style: 'display:flex;flex-direction:column;gap:12px',
    },
      codeIn,
      trustRow,
      mfaErr,
      el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, isSetup ? 'تفعيل ودخول' : 'تحقق ودخول'));

    // ست خانات مكتملة = إرسال تلقائي (رموز الاحتياط أطول فتُرسل بالزر)
    codeIn.addEventListener('input', () => {
      if (/^\d{6}$/.test(codeIn.value.trim())) codeForm.requestSubmit();
    });

    if (isSetup) {
      const qr = qrcode(0, 'M');
      qr.addData(res.otpauth);
      qr.make();
      const chunkedSecret = res.secret.replace(/(.{4})/g, '$1 ').trim();
      box.append(
        el('div', { class: 'mfa-head' },
          el('b', {}, 'تفعيل التحقق الثنائي'),
          el('span', {}, 'خطوة لمرة واحدة تحمي حساب الإدارة والمالية')),
        el('div', { class: 'mfa-qr', html: qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true }) }),
        el('div', { class: 'mfa-steps' },
          el('span', {}, el('i', {}, '١'), ' افتح تطبيق المصادقة — Google Authenticator أو Authy'),
          el('span', {}, el('i', {}, '٢'), ' امسح الرمز أعلاه بالكاميرا من داخل التطبيق'),
          el('span', {}, el('i', {}, '٣'), ' أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق')),
        el('div', { class: 'mfa-alt' },
          el('span', { class: 'mfa-alt__label' }, 'لا كاميرا؟ أدخل المفتاح يدويًا:'),
          el('div', { class: 'mfa-secret' },
            el('code', {}, chunkedSecret),
            el('button', {
              class: 'btn btn--ghost btn--sm', type: 'button',
              onclick: () => navigator.clipboard.writeText(res.secret).then(() => toast('نُسخ المفتاح.')),
            }, 'نسخ'))));
    } else {
      box.append(
        el('div', { class: 'mfa-head' },
          el('b', {}, 'رمز التحقق'),
          el('span', {}, 'أدخل الرمز من تطبيق المصادقة — أو أحد رموزك الاحتياطية')));
    }

    box.append(codeForm,
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: 'align-self:center',
        onclick: () => { box.remove(); mfaBox = null; form.style.display = ''; },
      }, '→ عودة لتسجيل الدخول'));
    form.after(box);
    mfaBox = box;
    codeIn.focus();
  }

  /* الرموز الاحتياطية — تظهر مرة واحدة فقط بعد التسجيل الأول */
  function showBackupCodes(data) {
    const copyAll = () => navigator.clipboard.writeText(data.backupCodes.join('\n')).then(() => toast('نُسخت الرموز الاحتياطية.'));
    const download = () => {
      const blob = new Blob(['رموز سبورت باور الاحتياطية — ' + data.user.username + '\n\n' + data.backupCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'sportpower-backup-codes.txt' });
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const card = document.querySelector('.login-card');
    card.innerHTML = '';
    card.append(
      el('h2', {}, 'تم تفعيل التحقق الثنائي ✅'),
      el('div', { class: 'mfa-box' },
        el('div', { class: 'alert alert--warning', style: 'display:block' },
          el('b', {}, 'رموزك الاحتياطية — تظهر الآن فقط.'), el('br'),
          'كل رمز يفتح الدخول مرة واحدة إذا فقدت جوالك. احفظها في مكان آمن.'),
        el('div', { class: 'backup-grid' },
          ...data.backupCodes.map((c) => el('code', {}, c))),
        el('div', { style: 'display:flex;gap:8px' },
          el('button', { class: 'btn btn--outline', style: 'flex:1', type: 'button', onclick: copyAll }, 'نسخ الرموز'),
          el('button', { class: 'btn btn--outline', style: 'flex:1', type: 'button', onclick: download }, 'تنزيل ملفًا')),
        el('button', {
          class: 'btn btn--accent btn--lg btn--full', type: 'button',
          onclick: () => { location.hash = homeRoute(data.user.role); },
        }, 'حفظتها — دخول النظام')));
  }

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
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/actions'; } }, 'مركز القرارات ←'),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/reports'; } }, 'التقارير الشهرية ←'),
      el('button', { class: 'btn btn--outline', onclick: () => { location.hash = '#/settings'; } }, 'الإعدادات ←')));

    // مركز القرارات: ما الذي يجب فعله الآن — قبل الأرقام
    container.append(await actionCenterBanner());

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
  // ساعة الحصة تُسجَّل تلقائيًا وقت الحفظ (أو من الموعد المرتبط) — بطلب العميل حُذفت من النموذج
  const autoTime = () => prefill.time || new Date().toTimeString().slice(0, 5);
  const durIn = input({ type: 'number', value: 60, min: 15, step: 15 });
  const styleIn = input({ placeholder: 'مثال: قوة — دفع / HIIT / مرونة' });
  const weightIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const fatIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const muscleIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const tape = {};
  for (const k of ['waist', 'chest', 'arm', 'hips', 'leg']) tape[k] = input({ type: 'number', step: '0.5', placeholder: 'سم' });
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
            date: dateIn.value, time: autoTime(), duration: Number(durIn.value),
            style: styleIn.value, notes: notesIn.value,
            weight: weightIn.value || null,
            bodyFatPct: fatIn.value || null,
            muscleMass: muscleIn.value || null,
            waist: tape.waist.value || null, chest: tape.chest.value || null,
            arm: tape.arm.value || null, hips: tape.hips.value || null, leg: tape.leg.value || null,
            appointmentId: prefill.appointmentId || null,
          });
          close();
          toast(res.makeup
            ? 'سُجّلت الحصة التعويضية — دون خصم من رصيد المتدرب.'
            : `تم تسجيل الحصة وخصمها — متبقي ${res.remaining} حصة من أصل ${res.total}.`);
          if (res.measureReminder) {
            toast('⏱️ مرّت 3 حصص أو أكثر منذ آخر قياس لهذا المتدرب — سجّل الوزن والقياسات.', true);
          }
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel),
      trainerSel ? field('المدرب', trainerSel) : el('span'),
      el('div', { class: 'span-2' }, field('نوع الحصة', kindSel)),
      field('التاريخ', dateIn),
      field('المدة (دقيقة)', durIn),
      field('الوزن الحالي (كغ)', weightIn),
      field('نسبة الدهون %', fatIn),
      field('كتلة العضلات (كغ)', muscleIn),
      el('div', { class: 'span-2 sidebar__caption', style: 'padding:4px 0 0' }, 'قياسات شريط القياس (سم) — اختياري'),
      el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px' },
        field('الخصر', tape.waist), field('الصدر', tape.chest), field('اليد', tape.arm),
        field('الحوض', tape.hips), field('الرجل', tape.leg)),
      el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
        'أي قياس يُدخل هنا يُحفظ تلقائيًا قراءةً في سجل InBody الخاص بالمتدرب.'),
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
            return [sub.traineeName || '—', fmtMoney(p.amount), p.date,
              p.debt ? el('span', {}, p.method + ' ', el('span', { class: 'tag tag--warning' }, 'سداد دين')) : p.method,
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
  const optOf = (s) => [s.id, `${s.traineeName} — ${fmtMoney(s.price)} (متبقي ${fmtMoney(s.remaining)})`];
  /* دفعة من الاشتراك الحالي أو سداد دين سابق — سداد الدين يُنسب للاشتراك
     القديم غير المسدَّد فلا يمسّ ما هو مستحق على الاشتراك الحالي */
  const isOld = (s) => ['expired', 'cancelled'].includes(s.status);
  const currentSubs = subscriptions.filter((s) => !isOld(s));
  const debtSubs = subscriptions.filter((s) => isOld(s) && s.remaining > 0);
  const typeSel = select([
    ['current', 'دفعة من الاشتراك الحالي'],
    ['debt', `سداد دين سابق${debtSubs.length ? '' : ' (لا ديون قديمة)'}`],
  ], { value: existing && existing.debt ? 'debt' : 'current' });
  const subField = el('div', { class: 'span-2' });
  let subSel;
  const buildSubSel = () => {
    if (existing) {
      subSel = select(subscriptions.map(optOf), { value: existing.subscriptionId });
      subSel.disabled = true;
    } else {
      const pool = typeSel.value === 'debt' ? debtSubs : currentSubs;
      subSel = searchSelect(pool.map(optOf), {
        placeholder: pool.length ? 'اكتب اسم المتدرب للبحث…' : 'لا اشتراكات مطابقة لهذا الخيار',
      });
    }
    subField.innerHTML = '';
    subField.append(field(typeSel.value === 'debt' ? 'الاشتراك القديم المدين' : 'الاشتراك', subSel));
  };
  typeSel.addEventListener('change', buildSubSel);
  buildSubSel();

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
            await API.post('/api/payments', {
              subscriptionId: Number(subSel.value), amount: amountIn.value, date: dateIn.value,
              method: methodSel.value, note: noteIn.value, debt: typeSel.value === 'debt',
            });
            toast(typeSel.value === 'debt' ? 'سُجّل سداد الدين على الاشتراك القديم — دون المساس بالاشتراك الحالي.' : 'تمت إضافة الدفعة — تحدّثت الأرقام تلقائيًا.');
          }
          close();
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('نوع الدفعة', typeSel)),
      subField,
      field(`المبلغ (${curInfo().name})`, amountIn),
      field('تاريخ الدفع', dateIn),
      field('طريقة الدفع', methodSel),
      field('ملاحظة', noteIn),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'حفظ الدفعة'))),
  ]);
  if (existing) typeSel.disabled = true;
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
  const showPrices = data.showPrices !== false; // المدرب لا يرى الأسعار
  const refreshPage = () => { root.innerHTML = ''; viewTraineePage(root, traineeId); };
  const isMoneyStaff = ['admin', 'accountant'].includes(API.user.role);
  const paidOf = (sid) => (data.payments || []).filter((p) => p.subscriptionId === sid).reduce((s, p) => s + p.amount, 0);
  const subsForPay = isMoneyStaff && data.payments ? data.subscriptions.map((s) => ({
    id: s.id, traineeName: t.name, price: s.price, status: s.status,
    paid: paidOf(s.id), remaining: Math.max(0, s.price - paidOf(s.id)),
  })) : [];
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
        sub.packageName ? el('div', {}, 'الباقة: ', el('b', { style: 'color:var(--accent-hover)' }, sub.packageName)) : '',
        el('div', {}, `عدد الحصص الكلي: `, el('b', {}, String(sub.totalSessions)),
          ' · المستخدمة: ', el('b', {}, String(sub.usedSessions)),
          ' · المتبقية: ', el('b', { style: 'color:var(--accent-hover)' }, String(sub.remaining))),
        el('div', {}, `تاريخ الاشتراك: ${sub.startDate} — ينتهي: ${sub.endDate} `, statusTag(sub.status, sub.expiring)))
        : el('div', { class: 'alert alert--warning' }, 'لا يوجد اشتراك فعّال — يرجى التجديد.')));
  container.append(headCard);

  /* شريط الإجراءات السريعة للموظفين */
  if (isStaff) {
    const refresh = refreshPage;
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
      if (subsForPay.length) {
        actions.append(el('button', { class: 'btn btn--outline btn--sm', onclick: () => openPaymentModal(refresh, subsForPay) }, '+ دفعة جديدة'));
      }
      if (sub) {
        actions.append(el('button', { class: 'btn btn--outline btn--sm', onclick: () => openEditSubscriptionModal(refresh, sub, t.name) }, 'تعديل الاشتراك'));
        if (sub.status === 'active') {
          actions.append(el('button', { class: 'btn btn--outline btn--sm', onclick: () => openFreezeSubModal(refresh, sub, t.name) }, 'تجميد (سفر/ظرف)'));
        } else if (sub.status === 'frozen') {
          actions.append(el('button', {
            class: 'btn btn--outline btn--sm',
            onclick: async () => {
              if (!confirm(`فك تجميد اشتراك ${t.name}؟`)) return;
              try { await API.post(`/api/subscriptions/${sub.id}/action`, { action: 'unfreeze', reason: '' }); toast('فُكّ التجميد.'); refresh(); }
              catch (ex) { toast(ex.message, true); }
            },
          }, 'فك التجميد'));
        }
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

  /* الاشتراك والباقات — على ملف المشترك (بلا أسعار للمدرب) */
  container.append(traineePackagesCard(data, traineeId, refreshPage));

  /* تقييم الحصص: المتدرب يقيّم حصصه — والنتيجة سرّية تصل للإدارة */
  if (API.user.role === 'trainee' && API.user.id === traineeId) {
    container.append(traineeRatingsCard(data, refreshPage));
  } else if (API.user.role === 'admin' && data.ratings && data.ratings.length) {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'تقييمات المتدرب لحصصه 🔒',
        el('a', { class: 'btn btn--outline btn--sm', href: '#/ratings' }, 'كل التقييمات ←')),
      el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px' }, 'سرّي — لا يظهر للمدربين.'),
      dataTable(['التاريخ', 'التقييم', 'التعليق'],
        data.ratings.map((r) => [r.date,
          el('span', { class: 'stars-view' + (r.rating <= 2 ? ' stars-view--low' : '') }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)),
          r.comment || '—']))));
  }

  /* نقاطي ومكافآتي — بطاقة سريعة للمتدرب */
  if (API.user.role === 'trainee' && API.user.id === traineeId) {
    try {
      const loyalty = await API.get('/api/loyalty/me');
      container.append(el('div', { class: 'card', style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between' },
        el('div', { style: 'display:flex;align-items:center;gap:12px' },
          el('span', { class: 'kpi__ic' }, icon('star')),
          el('div', {},
            el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.2rem;color:var(--app-ink)' }, `${loyalty.balance} نقطة 🎁`),
            el('div', { style: 'font-size:12px;color:var(--app-muted)' }, 'اكسب نقاطًا بتحقيق نتائج تُنشر على السوشال ميديا وتجديد اشتراكك ودعوة أصدقائك — واستبدلها بمكافآت.'))),
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
    dataTable(['الباقة', 'الحصص', 'المستخدم', ...(showPrices ? ['القيمة'] : []), 'من', 'إلى', 'الحالة'],
      data.subscriptions.slice().reverse().map((s) => [
        s.packageName || '—', String(s.totalSessions), String(s.usedSessions),
        ...(showPrices ? [fmtMoney(s.price)] : []),
        s.startDate, s.endDate, statusTag(s.status, s.expiring)]),
      'لا اشتراكات بعد.')));
  if (data.payments) {
    historyGrid.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'سجل الدفعات'),
      dataTable(['التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة', ...(isMoneyStaff ? [''] : [])],
        data.payments.slice().reverse().map((p) => [p.date, fmtMoney(p.amount),
          p.debt ? el('span', {}, p.method + ' ', el('span', { class: 'tag tag--warning' }, 'سداد دين')) : p.method,
          p.note || '—',
          ...(isMoneyStaff ? [el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openPaymentModal(refreshPage, subsForPay, p) }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف دفعة ${fmtMoney(p.amount)} بتاريخ ${p.date}؟`)) return;
                try { await API.del('/api/payments/' + p.id); toast('حُذفت الدفعة وتحدّثت الأرقام.'); refreshPage(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف'))] : [])]),
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
    // تعديل القراءات وحذفها — للإدارة والمدرب
    if (['admin', 'trainer'].includes(API.user.role)) {
      inbodyCard.append(el('h4', { style: 'margin:14px 0 6px;font-size:13px;color:var(--app-muted)' }, 'كل القراءات — تعديل وحذف'),
        dataTable(['التاريخ', 'الوزن', 'دهون %', 'عضل', 'الخصر', 'ملاحظة', ''],
          rs.slice().reverse().map((r) => [r.date, r.weight ?? '—', r.bodyFatPct ?? '—', r.muscleMass ?? '—', r.waist ?? '—', r.notes || '—',
            el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
              el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openInbodyEditModal(refreshPage, r) }, 'تعديل'),
              el('button', {
                class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
                onclick: async () => {
                  if (!confirm(`حذف قراءة ${r.date}؟`)) return;
                  try { await API.del('/api/inbody/' + r.id); toast('حُذفت القراءة.'); refreshPage(); }
                  catch (ex) { toast(ex.message, true); }
                },
              }, 'حذف'))])));
    }
  } else {
    inbodyCard.append(el('div', { class: 'empty' }, 'لا قراءات InBody بعد.'));
  }
  container.append(inbodyCard);

  // سجل الحصص — الإدارة تعدّل وتحذف (الحذف يعيد الحصة لرصيد الاشتراك)
  const canEditSession = (s) => API.user.role === 'admin' || (API.user.role === 'trainer' && s.trainerId === API.user.id);
  const sessionActions = isStaff;
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'سجل الحصص'),
    pagedTable(['التاريخ', 'الساعة', 'المدة', 'الأسلوب', 'الوزن', 'ملاحظات', ...(sessionActions ? [''] : [])],
      data.sessions,
      (s) => [s.date, s.time, s.duration + ' د', s.style || '—', s.weight ? s.weight + ' كغ' : '—', s.notes || '—',
        ...(sessionActions ? [el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
          canEditSession(s) ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSessionEditModal(refreshPage, s) }, 'تعديل') : el('span'),
          API.user.role === 'admin' ? el('button', {
            class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
            onclick: async () => {
              if (!confirm(`حذف حصة ${s.date} ${s.time}؟ الحصة العادية تُعاد لرصيد الاشتراك.`)) return;
              try {
                const r = await API.del('/api/sessions/' + s.id);
                toast(r.refunded ? 'حُذفت الحصة وأُعيدت لرصيد الاشتراك.' : 'حُذفت الحصة.');
                refreshPage();
              } catch (ex) { toast(ex.message, true); }
            },
          }, 'حذف') : el('span'))] : [])],
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

/* تعديل بيانات اشتراك قائم — الحصص والقيمة والتواريخ (إدارة/محاسب) */
function openEditSubscriptionModal(onDone, sub, traineeName) {
  const totalIn = input({ type: 'number', min: sub.usedSessions || 1, value: sub.totalSessions });
  const priceIn = input({ type: 'number', min: 0, value: sub.price });
  const startIn = input({ type: 'date', value: sub.startDate });
  const endIn = input({ type: 'date', value: sub.endDate });
  const close = modal(`تعديل اشتراك «${traineeName}»`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/subscriptions/' + sub.id, {
            totalSessions: totalIn.value, price: priceIn.value,
            startDate: startIn.value, endDate: endIn.value,
          });
          toast('حُفظ الاشتراك وتحدّثت الأرقام.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field(`عدد الحصص (المستخدم: ${sub.usedSessions})`, totalIn),
      field(`القيمة (${curInfo().name})`, priceIn),
      field('تاريخ البدء', startIn),
      field('تاريخ الانتهاء', endIn),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
}

/* تجميد اشتراك بسبب مسجَّل (سفر/ظرف) — يظهر في المتابعة والتقارير */
function openFreezeSubModal(onDone, sub, traineeName) {
  const reasonSel = select([['سفر ✈️', 'سفر ✈️'], ['ظرف صحي', 'ظرف صحي'], ['ظرف شخصي', 'ظرف شخصي'], ['أخرى', 'أخرى']]);
  const noteIn = input({ placeholder: 'تفصيل اختياري' });
  const close = modal(`تجميد اشتراك «${traineeName}»`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const reason = reasonSel.value + (noteIn.value ? ' — ' + noteIn.value : '');
          await API.post(`/api/subscriptions/${sub.id}/action`, { action: 'freeze', reason });
          toast('جُمّد الاشتراك — وسُجّل السبب في المتابعة.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('السبب', reasonSel),
      field('تفصيل', noteIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تجميد الاشتراك')),
  ]);
}

/* تعديل حصة مسجلة — البيانات الوصفية، والإدارة تنقلها لمدرب آخر */
async function openSessionEditModal(onDone, s) {
  const dateIn = input({ type: 'date', value: s.date });
  const timeIn = input({ type: 'time', value: s.time });
  const durIn = input({ type: 'number', min: 15, step: 15, value: s.duration });
  const styleIn = input({ value: s.style || '' });
  const weightIn = input({ type: 'number', step: '0.1', value: s.weight ?? '' });
  const notesIn = textarea({ value: s.notes || '' });
  let trainerSel = null;
  if (API.user.role === 'admin') {
    const trainers = await API.get('/api/users?role=trainer');
    trainerSel = select(trainers.map((t) => [t.id, t.name]), { value: s.trainerId || '' });
  }
  const close = modal('تعديل الحصة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/sessions/' + s.id, {
            date: dateIn.value, time: timeIn.value, duration: durIn.value,
            style: styleIn.value, notes: notesIn.value, weight: weightIn.value || null,
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
          });
          toast('حُفظت الحصة.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      trainerSel ? el('div', { class: 'span-2' }, field('المدرب المنفّذ (تُنسب له الحصة في تقاريره)', trainerSel)) : el('span'),
      field('التاريخ', dateIn), field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn), field('الوزن (كغ)', weightIn),
      el('div', { class: 'span-2' }, field('الأسلوب', styleIn)),
      el('div', { class: 'span-2' }, field('ملاحظات', notesIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
}

/* تعديل قراءة InBody */
function openInbodyEditModal(onDone, r) {
  const dateIn = input({ type: 'date', value: r.date });
  const nums = {};
  const numField = (key, label, val) => { nums[key] = input({ type: 'number', step: '0.1', value: val ?? '' }); return field(label, nums[key]); };
  const notesIn = input({ value: r.notes || '' });
  const close = modal('تعديل قراءة InBody', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!nums.weight.value) { toast('الوزن مطلوب على الأقل.', true); return; }
        try {
          const body = { date: dateIn.value, notes: notesIn.value };
          for (const [k, inp] of Object.entries(nums)) body[k] = inp.value === '' ? null : inp.value;
          await API.put('/api/inbody/' + r.id, body);
          toast('حُفظت القراءة.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('التاريخ', dateIn),
      numField('weight', 'الوزن (كغ)', r.weight),
      numField('bodyFatPct', 'نسبة الدهون %', r.bodyFatPct),
      numField('muscleMass', 'كتلة العضلات (كغ)', r.muscleMass),
      numField('fatMass', 'دهون الجسم (كغ)', r.fatMass),
      numField('water', 'الماء (لتر)', r.water),
      numField('bmi', 'BMI', r.bmi),
      numField('score', 'النقاط', r.score),
      numField('waist', 'الخصر (سم)', r.waist),
      numField('chest', 'الصدر (سم)', r.chest),
      numField('arm', 'اليد (سم)', r.arm),
      numField('hips', 'الحوض (سم)', r.hips),
      numField('leg', 'الرجل (سم)', r.leg),
      el('div', { class: 'span-2' }, field('ملاحظة', notesIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
}

function inbodyComparisonTable(readings) {
  const first = readings[0], last = readings[readings.length - 1];
  const rows = [
    ['الوزن (كغ)', 'weight'], ['نسبة الدهون %', 'bodyFatPct'], ['كتلة العضلات (كغ)', 'muscleMass'],
    ['دهون الجسم (كغ)', 'fatMass'], ['الماء (لتر)', 'water'], ['BMI', 'bmi'], ['النقاط', 'score'],
    ['الخصر (سم)', 'waist'], ['الصدر (سم)', 'chest'], ['اليد (سم)', 'arm'],
    ['الحوض (سم)', 'hips'], ['الرجل (سم)', 'leg'],
  ].filter(([, k]) => last[k] != null || first[k] != null);
  return dataTable(['المؤشر', `أول قراءة (${first.date})`, `آخر قراءة (${last.date})`, 'التغير'],
    rows.map(([label, k]) => {
      const a = first[k], b = last[k];
      const delta = a != null && b != null ? +(b - a).toFixed(1) : null;
      // العضل والماء والصدر واليد والرجل: الزيادة تقدم — والخصر والحوض والدهون: النقصان تقدم
      const good = ['muscleMass', 'water', 'score', 'chest', 'arm', 'leg'].includes(k) ? delta > 0 : delta < 0;
      return [label, a ?? '—', b ?? '—',
        delta === null ? '—' : el('span', { class: 'tag ' + (delta === 0 ? 'tag--neutral' : good ? 'tag--accent' : 'tag--danger') },
          (delta > 0 ? '+' : '') + delta)];
    }));
}

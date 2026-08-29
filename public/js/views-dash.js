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
      // القفل أثناء انتظار الخادم يتكفّل به حارس الإرسال في el()؛
      // هنا نُعيد فتح الزر عند الخطأ وحده لأن النجاح ينقل الصفحة
      const btn = e.target.querySelector('button[type=submit]');
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
      el('h1', { html: 'نظام الإدارة الداخلي<br><em>change your life</em><br><em>جسم أقوى. حياة أصحّ. نظام يبقى معك.</em>' }),
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
  const state = urlState({ month: thisMonthISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
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

    /* صحة الفروع من أول نظرة — أي فرع يحتاج تدخلًا؟ التفاصيل في التقرير
       الشهري. تُحمَّل بعد رسم اللوحة حتى لا يعطّل حسابُها فتح الصفحة. */
    const healthSlot = el('div');
    container.append(healthSlot);
    API.get('/api/reports/health?month=' + state.month).then((health) => {
      if (!health || !health.branches.length) return;
      const hc = branchHealthCard(health, health.branches, { compact: true });
      hc.append(el('div', { style: 'margin-top:10px' },
        el('a', { class: 'btn btn--outline btn--sm', href: '#/reports' }, 'تفاصيل الاحتساب في التقرير الشهري ←')));
      healthSlot.append(hc);
    }).catch(() => null);

    const k = data.kpis;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(k.sessionsMonth, 'حصة منفذة هذا الشهر', 'dumbbell'),
      kpiHero(fmtMoneyMap(k.collectedMonth), 'تحصيل هذا الشهر', 'wallet', 'green'),
      kpiHero(k.activeTrainees, 'متدرب فعّال', 'users', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(k.sessionsToday, 'حصص اليوم', 'calendar'),
      kpiTile(k.expiring, 'تنتهي قريبًا', 'alert', 'warn'),
      kpiTile(k.expired, 'اشتراكات منتهية', 'alert', 'danger'),
      kpiTile(fmtMoneyMap(k.outstanding), 'مستحقات غير محصلة', 'card', 'blue')));

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
      kpiTile(k.uniqueTrainees, 'متدربون فريدون', 'user', 'blue'),
      kpiTile(k.absences || 0, 'غيابات سجّلتها', 'alert', k.absences ? 'warn' : undefined)));
    container.append(el('div', { class: 'alert alert--info' },
      'إن درّبت أكثر من متدرب في الساعة نفسها فهي ساعة تدريب واحدة عليك — والعدد الفعلي للأشخاص يُحتسب كما هو. '
      + 'وتسجيل الغياب يخصم حصة من المتدرب دون أن يُحتسب حصة منفَّذة لك.'));

    // المتابعة اليومية: سجل اليوم + مهامي (KPI)
    await renderTrainerOps(container);

    // البرامج التدريبية — تُربط تلقائيًا بكل المتدربين
    await renderTrainerPrograms(container, render);

    /* جدول اليوم: برنامج الفرع كاملًا مع اختيار المدرب — لا مواعيد المدرب وحده */
    const schedCard = el('div', { class: 'card' });
    const sessionsCard = el('div', { class: 'card' });
    container.append(el('div', { class: 'grid-2eq' }, schedCard, sessionsCard));
    await renderTrainerSchedule(schedCard, data, render);
    await renderTrainerDaySessions(sessionsCard, render);
  }

  await render();
}

/* جدول اليوم للمدرب — البرنامج لكل الفرع مع فلتر المدرب.
   الموعد قد يكون على برنامج مدرب وينفّذه آخر، فيسجّل الحصة باسم من نفّذها. */
async function renderTrainerSchedule(card, dashData, onDone) {
  /* الحالة تبقى عبر إعادة رسم اللوحة: من يسوّي مواعيد متأخرة واحدًا بعد
     الآخر لا يُعاد إلى «جدول اليوم» بعد كل تسوية */
  const state = (renderTrainerSchedule._state = renderTrainerSchedule._state || { scope: 'mine', mode: 'today' });
  let trainers = [];
  let trainees = [];
  try { [trainers, trainees] = await Promise.all([API.get('/api/users?role=trainer'), API.get('/api/users?role=trainee')]); }
  catch (e) { /* يبقى جدوله هو */ }
  const nameOf = (id) => (trainees.find((t) => t.id === id) || {}).name || 'متدرب #' + id;
  const trainerName = (id) => (trainers.find((t) => t.id === id) || {}).name || '—';

  const scopeSel = select([
    ['mine', 'مواعيدي أنا'],
    ['all', 'كل الفرع — جميع المدربين'],
    ...trainers.filter((t) => t.id !== API.user.id).map((t) => [t.id, t.name]),
  ], { value: state.scope, style: 'width:200px', onchange: (e) => { state.scope = e.target.value; draw(); } });

  // المدرب يضيف موعدًا على برنامجه أو على برنامج زميله — كما تفعل الإدارة
  const addBtn = el('button', {
    class: 'btn btn--accent btn--sm',
    onclick: () => openApptModal(() => { draw(); onDone && onDone(); }, trainers, trainees),
  }, '+ موعد');

  const kindTag = (a) => (a.kind === 'makeup' ? el('span', { class: 'tag tag--info' }, 'تعويض')
    : a.kind === 'test' ? el('span', { class: 'tag tag--petrol' }, 'Test') : el('span', { class: 'tag tag--neutral' }, 'عادية'));

  /* «بلا تسوية»: مواعيد فات وقتها ولم تُسجَّل حصتها — أثر اللبس القديم بين
     الموعد والحصة. تُصفّى من هنا واحدًا واحدًا: حصة، أو غياب، أو ربط بحصة
     سُجّلت يومَها من غير الموعد (بلا خصم جديد). */
  const backlogBtn = el('button', {
    class: 'btn btn--outline btn--sm',
    onclick: () => { state.mode = state.mode === 'today' ? 'backlog' : 'today'; draw(); },
  }, 'بلا تسوية');

  const body = el('div');
  card.append(el('h3', { class: 'card__title' }, 'جدول اليوم — برنامج الفرع',
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, scopeSel, backlogBtn, addBtn,
      el('a', { class: 'btn btn--outline btn--sm', href: '#/calendar' }, 'التقويم الكامل'))), body);

  const refresh = () => { draw(); onDone && onDone(); };

  async function draw() {
    body.innerHTML = '';
    body.append(spinnerCard());
    const today = todayISO();
    const back = new Date(); back.setDate(back.getDate() - 90);
    const from = back.toISOString().slice(0, 10);
    const scopeQ = state.scope === 'mine' ? '' : '&all=1';
    /* مواعيد اليوم للجدول، و90 يومًا سابقة لعدّاد «بلا تسوية» — وحصص المدة
       نفسها (بكل مدربي الفرع) لكشف حصةٍ سُجّلت يوم الموعد من غير ربط */
    const [todayAppts, pastAppts, pastSessions] = await Promise.all([
      API.get(`/api/appointments?from=${today}&to=${today}${scopeQ}`).catch(() => dashData.todayAppointments || []),
      API.get(`/api/appointments?from=${from}&to=${today}${scopeQ}`).catch(() => []),
      API.get(`/api/sessions?from=${from}&to=${today}&all=1`).catch(() => []),
    ]);
    body.innerHTML = '';

    const inScope = (a) => state.scope === 'mine' || state.scope === 'all' || a.trainerId === Number(state.scope);
    /* موعد متدرب بلا حصة مرتبطة (ولو عُلّم «منفذًا» أيام اللبس)، وموعد Test
       لزائر بقي مجدولًا — كلاهما ينتظر تسوية */
    const needsSettle = (a) => (a.traineeId
      ? !a.sessionId && (a.status === 'scheduled' || a.status === 'done')
      : a.status === 'scheduled');
    const backlog = pastAppts
      .filter((a) => a.date < today && inScope(a) && needsSettle(a))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    backlogBtn.textContent = state.mode === 'backlog' ? '← جدول اليوم' : `بلا تسوية (${backlog.length})`;
    backlogBtn.className = 'btn btn--sm ' + (state.mode === 'today' && backlog.length ? 'btn--accent' : 'btn--outline');

    /* حصص لم تُربط بأي موعد — مرشّحة لتسوية «الإدخال المزدوج»: الأقرب ساعةً
       لحصة اليوم نفسه هي الأرجح أنها حصة هذا الموعد نفسها */
    const linkedIds = new Set(pastAppts.concat(todayAppts).map((a) => a.sessionId).filter(Boolean));
    const freeSessions = pastSessions.filter((s) => !linkedIds.has(s.id));
    const mins = (t) => Number((t || '00:00').slice(0, 2)) * 60 + Number((t || '00:00').slice(3, 5));
    const matchFor = (a) => {
      if (!a.traineeId) return null;
      return freeSessions
        .filter((s) => s.traineeId === a.traineeId && s.date === a.date)
        .sort((x, y) => Math.abs(mins(x.time) - mins(a.time)) - Math.abs(mins(y.time) - mins(a.time)))[0] || null;
    };

    const isBacklog = state.mode === 'backlog';
    let appts = isBacklog
      ? backlog
      : todayAppts.filter((a) => a.status === 'scheduled' && inScope(a)).sort((a, b) => a.time.localeCompare(b.time));
    // موعد Test لزائر بلا حساب: اسمه مكتوب على الموعد نفسه
    appts = appts.map((a) => ({
      ...a,
      traineeName: a.traineeId ? (a.traineeName || nameOf(a.traineeId)) : (a.prospectName || 'زائر Test'),
    }));

    if (isBacklog) {
      body.append(el('div', { class: 'alert alert--info', style: 'margin:0 0 10px' },
        'مواعيد فات وقتها (آخر 90 يومًا) دون حصة مسجلة — الموعد وحده لا يخصم من الرصيد، والمجدول الفائت يُحسب غيابًا في التقارير حتى يُسوّى. '
        + 'سوِّ كل موعد: سجّل حصته أو غيابه، أو اربطه بحصة سُجّلت يومَها من غير الموعد (بلا خصم جديد).'));
    }

    const showTrainer = state.scope !== 'mine';
    body.append(dataTable([...(isBacklog ? ['التاريخ'] : []), 'الساعة', 'المتدرب', ...(showTrainer ? ['المدرب'] : []), 'النوع', 'ملاحظة', ''],
      appts.map((a) => {
        const twin = isBacklog ? matchFor(a) : null;
        return [...(isBacklog ? [a.date] : []), a.time,
          el('span', {},
            a.traineeId
              ? el('a', { href: '#/trainee/' + a.traineeId, style: 'color:var(--action);text-decoration:none' }, a.traineeName)
              : el('span', {}, a.traineeName, ' ', el('span', { class: 'tag tag--neutral' }, 'زائر')),
            // موعد عُلّم «منفذًا» يدويًا أيام اللبس — بلا حصة ولا خصم
            a.traineeId && a.status === 'done' ? el('span', {}, ' ', el('span', { class: 'tag tag--info' }, 'معلَّم منفذًا بلا حصة')) : ''),
          ...(showTrainer ? [trainerName(a.trainerId)] : []),
          kindTag(a), a.note || '—',
          el('div', { class: 'row-actions' },
            /* زائر الـ Test لا اشتراك له ولا رصيد يُخصم منه — فالإجراء عليه
               «تم الـ Test» أو تحويله لزبون، لا تسجيل حصة. */
            a.traineeId
              ? (twin
                ? el('button', {
                  class: 'btn btn--accent btn--sm',
                  title: `للمتدرب حصة مسجلة يوم ${twin.date} الساعة ${twin.time} غير مربوطة بأي موعد — الأرجح أنها حصة هذا الموعد نفسها`,
                  onclick: async () => {
                    try {
                      const r = await API.post('/api/sessions', {
                        traineeId: a.traineeId, trainerId: twin.trainerId || a.trainerId,
                        date: twin.date, time: twin.time, duration: twin.duration || 60, appointmentId: a.id,
                      });
                      toast(r.linked ? 'رُبط الموعد بالحصة المسجلة نفسها — دون أي خصم جديد.' : 'سُجّلت الحصة وخُصمت.');
                      refresh();
                    } catch (ex) { toast(ex.message, true); }
                  },
                }, `ربط بحصة ${twin.time} (بلا خصم)`)
                : el('button', {
                  class: 'btn btn--accent btn--sm',
                  onclick: () => openLogSessionModal(refresh, {
                    traineeId: a.traineeId, time: a.time, appointmentId: a.id,
                    ...(isBacklog ? { date: a.date, duration: a.duration } : {}),
                    kind: a.kind === 'test' ? 'makeup' : a.kind, trainerId: a.trainerId,
                  }),
                }, 'تسجيل الحصة'))
              : el('button', {
                class: 'btn btn--accent btn--sm', title: 'انتهى الـ Test — علّم الموعد منفَّذًا',
                onclick: async () => {
                  try { await API.put('/api/appointments/' + a.id, { status: 'done' }); toast('سُجّل تنفيذ الـ Test.'); refresh(); }
                  catch (ex) { toast(ex.message, true); }
                },
              }, 'تم الـ Test'),
            a.traineeId
              ? el('button', {
                class: 'btn btn--outline btn--sm', title: 'لم يحضر — تسجيل غياب (يُخصم من الرصيد)',
                onclick: () => openLogSessionModal(refresh, {
                  traineeId: a.traineeId, time: a.time, appointmentId: a.id, kind: 'absence', trainerId: a.trainerId,
                  ...(isBacklog ? { date: a.date, duration: a.duration } : {}),
                }),
              }, 'غياب')
              : el('button', {
                class: 'btn btn--outline btn--sm', title: 'لم يحضر الـ Test',
                onclick: async () => {
                  try { await API.put('/api/appointments/' + a.id, { status: 'cancelled' }); toast('سُجّل عدم حضور الـ Test.'); refresh(); }
                  catch (ex) { toast(ex.message, true); }
                },
              }, 'لم يحضر'),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openApptModal(refresh, trainers, trainees, a) }, 'تعديل'))];
      }),
      isBacklog ? 'لا مواعيد بلا تسوية — كل المواعيد السابقة سُوّيت ✓' : 'لا مواعيد لهذا اليوم.'));
  }
  await draw();
}

/* حصص المدرب حسب اليوم — يراجع كل ما سجّله في أي يوم ويعدّله أو يحذفه */
async function renderTrainerDaySessions(card, onDone) {
  // بادئة خاصة: بطاقة «سجل اليوم» في الصفحة نفسها تستعمل date أيضًا
  const state = urlState({ date: todayISO() }, 'sess');
  const dateIn = input({
    type: 'date', value: state.date, style: 'width:150px',
    onchange: (e) => { state.date = e.target.value; draw(); },
  });
  const shift = (days) => {
    const d = new Date(state.date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    state.date = d.toISOString().slice(0, 10);
    dateIn.value = state.date;
    draw();
  };

  const body = el('div');
  card.append(
    el('h3', { class: 'card__title' }, 'حصصي — مراجعة وتعديل',
      el('div', { style: 'display:flex;gap:8px' },
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openLogSessionModal(onDone) }, '+ تسجيل حصة'),
        el('button', { class: 'btn btn--outline btn--sm', onclick: () => openLogSessionModal(onDone, { kind: 'absence' }) }, '+ غياب'))),
    el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap' },
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => shift(-1) }, 'اليوم السابق →'),
      dateIn,
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => shift(1) }, '← اليوم التالي'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.date = todayISO(); dateIn.value = state.date; draw(); } }, 'اليوم')),
    body);

  async function draw() {
    state.sync();
    body.innerHTML = '';
    body.append(spinnerCard());
    let sessions = [];
    let trainees = [];
    try {
      [sessions, trainees] = await Promise.all([
        API.get(`/api/sessions?from=${state.date}&to=${state.date}`),
        API.get('/api/users?role=trainee'),
      ]);
    } catch (ex) { body.innerHTML = ''; body.append(el('div', { class: 'alert alert--warning' }, ex.message)); return; }
    const nameOf = (id) => (trainees.find((t) => t.id === id) || {}).name || '#' + id;
    const deliveredDay = sessions.filter((s) => s.kind !== 'absence');
    const hours = new Set(deliveredDay.map((s) => (s.time || '').slice(0, 2))).size;
    body.innerHTML = '';
    body.append(
      el('div', { class: 'macros', style: 'margin-bottom:8px' },
        el('span', { class: 'macro' }, 'حصص اليوم ', el('b', {}, String(deliveredDay.length))),
        el('span', { class: 'macro' }, 'ساعات تدريب ', el('b', {}, String(hours))),
        el('span', { class: 'macro' }, 'غيابات ', el('b', {}, String(sessions.length - deliveredDay.length)))),
      dataTable(['الساعة', 'النوع', 'المتدرب', 'الأسلوب', 'المدة', ''],
        sessions.slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((s) => [s.time, sessionKindTag(s),
          el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none' }, nameOf(s.traineeId)),
          s.style || '—', s.duration + ' د',
          el('div', { class: 'row-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSessionEditModal(() => { draw(); onDone && onDone(); }, s) }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف حصة ${s.date} ${s.time}؟ الحصة العادية أو الغياب تُعاد لرصيد المتدرب.`)) return;
                try {
                  const r = await API.del('/api/sessions/' + s.id);
                  toast(r.refunded ? 'حُذفت الحصة وأُعيدت لرصيد الاشتراك.' : 'حُذفت الحصة.');
                  draw();
                } catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف'))]),
        `لا حصص مسجلة يوم ${state.date}.`));
  }
  await draw();
}

/* ============================================================
   نافذة تسجيل حصة — منطق الخصم
   ============================================================ */
async function openLogSessionModal(onDone, prefill = {}) {
  const trainees = await API.get('/api/users?role=trainee');
  /* المدرب أيضًا يرى قائمة المدربين: الموعد قد يكون على برنامجه بينما
     نفّذ الحصة مدرب آخر — فينسبها له من هنا مباشرة */
  let trainers = [];
  if (['admin', 'trainer'].includes(API.user.role)) trainers = await API.get('/api/users?role=trainer');

  const traineeSel = searchSelect(trainees.map(traineeOption), { value: prefill.traineeId || '' });
  const trainerSel = trainers.length
    ? select(trainers.map((t) => [t.id, t.name]),
      { value: prefill.trainerId || (API.user.role === 'trainer' ? API.user.id : undefined) })
    : null;
  /* الغياب نوع ثالث: يُخصم من الاشتراك كالحصة تمامًا، لكنه يُسجَّل غيابًا
     فلا يُحتسب حضورًا ولا ساعةَ تدريب للمدرب. */
  const kindSel = select([
    ['regular', 'عادية — تُخصم من الاشتراك'],
    ['absence', 'غياب — تُخصم من الاشتراك وتُسجَّل غيابًا'],
    ['makeup', 'تعويض — تُغطّي غيابًا مخصومًا بلا خصم جديد'],
  ], { value: ['makeup', 'absence'].includes(prefill.kind) ? prefill.kind : 'regular' });
  const absenceReasonIn = input({ placeholder: 'مثال: لم يحضر دون إشعار / اعتذر متأخرًا' });
  const dateIn = input({ type: 'date', value: prefill.date || todayISO() });
  /* ساعة الحصة ظاهرة وقابلة للتعديل — كانت تؤخذ تلقائيًا وقت الحفظ فتُسجَّل
     بساعة الإدخال لا بساعة الحصة الفعلية (بطلب العميل أُعيدت للنموذج) */
  const timeIn = input({ type: 'time', value: prefill.time || new Date().toTimeString().slice(0, 5) });
  const durIn = input({ type: 'number', value: prefill.duration || 60, min: 15, step: 15 });
  const styleIn = input({ placeholder: 'مثال: قوة — دفع / HIIT / مرونة' });
  const weightIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const fatIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  // كتلة الدهون بالكيلوغرام — بطلب العميل، إلى جانب النسبة المئوية
  const fatMassIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const muscleIn = input({ type: 'number', step: '0.1', placeholder: 'اختياري' });
  const tape = {};
  for (const k of ['waist', 'chest', 'arm', 'hips', 'leg']) tape[k] = input({ type: 'number', step: '0.5', placeholder: 'سم' });
  const notesIn = textarea({ placeholder: 'ملاحظات المدرب…' });

  const saveBtn = el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'حفظ الحصة وخصمها من الاشتراك');
  const absenceField = el('div', { class: 'span-2' }, field('سبب الغياب (اختياري)', absenceReasonIn));
  /* التعويضية تُقابل غيابًا سبق خصمه — فلا خصم جديد. وإن لم يكن على
     المتدرب غياب معلّق فهي حصة نُفّذت وتُخصم كالعادية. */
  const makeupHint = el('div', { class: 'alert alert--info span-2', style: 'margin:0' },
    'الحصة التعويضية تُغطّي أقدم غياب مخصوم على المتدرب فلا تُخصم منه حصة ثانية. '
    + 'وإن لم يكن عليه غياب بانتظار التعويض، تُخصم كحصة عادية.');
  /* حقول التدريب والقياس لا معنى لها في الغياب — تختفي بدل أن تُترك فارغة */
  const trainingFields = [
    field('الوزن الحالي (كغ)', weightIn),
    field('نسبة الدهون %', fatIn),
    field('كتلة الدهون (كغ)', fatMassIn),
    field('كتلة العضلات (كغ)', muscleIn),
    el('div', { class: 'span-2 sidebar__caption', style: 'padding:4px 0 0' }, 'قياسات شريط القياس (سم) — اختياري'),
    el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px' },
      field('الخصر', tape.waist), field('الصدر', tape.chest), field('اليد', tape.arm),
      field('الحوض', tape.hips), field('الرجل', tape.leg)),
    el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
      'أي قياس يُدخل هنا يُحفظ تلقائيًا قراءةً في سجل InBody الخاص بالمتدرب.'),
    el('div', { class: 'span-2' }, field('الأسلوب التدريبي', styleIn)),
  ];
  const syncKind = () => {
    const k = kindSel.value;
    saveBtn.textContent = k === 'makeup' ? 'حفظ الحصة التعويضية'
      : k === 'absence' ? 'تسجيل الغياب وخصم الحصة' : 'حفظ الحصة وخصمها من الاشتراك';
    makeupHint.style.display = k === 'makeup' ? '' : 'none';
    absenceField.style.display = k === 'absence' ? '' : 'none';
    trainingFields.forEach((n) => { n.style.display = k === 'absence' ? 'none' : ''; });
  };
  kindSel.addEventListener('change', syncKind);

  const close = modal('تسجيل حصة منفذة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const absent = kindSel.value === 'absence';
          const res = await API.post('/api/sessions', {
            traineeId: Number(traineeSel.value),
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            kind: kindSel.value,
            absenceReason: absent ? absenceReasonIn.value : undefined,
            date: dateIn.value, time: timeIn.value || new Date().toTimeString().slice(0, 5), duration: Number(durIn.value),
            style: absent ? '' : styleIn.value, notes: notesIn.value,
            weight: absent ? null : (weightIn.value || null),
            bodyFatPct: absent ? null : (fatIn.value || null),
            fatMass: absent ? null : (fatMassIn.value || null),
            muscleMass: absent ? null : (muscleIn.value || null),
            waist: absent ? null : (tape.waist.value || null), chest: absent ? null : (tape.chest.value || null),
            arm: absent ? null : (tape.arm.value || null), hips: absent ? null : (tape.hips.value || null),
            leg: absent ? null : (tape.leg.value || null),
            appointmentId: prefill.appointmentId || null,
          });
          close();
          // الخادم وجد الحصة نفسها مسجلة بهذا الوقت فربط الموعد بها — لا خصم جديد
          if (res.linked) {
            toast('كانت الحصة مسجلة مسبقًا بهذا الوقت — رُبط الموعد بها دون أي خصم جديد.');
            onDone && onDone();
            return;
          }
          toast(res.makeup
            ? (res.compensated
              ? `سُجّلت الحصة التعويضية عن غياب يوم ${res.absenceDate} — بلا خصم جديد (خُصمت يوم الغياب).`
              : `لا غياب مخصومًا على المتدرب — سُجّلت الحصة التعويضية وخُصمت. متبقي ${res.remaining} من أصل ${res.total}.`)
            : res.absent
              ? `سُجّل الغياب وخُصمت الحصة — متبقي ${res.remaining} حصة من أصل ${res.total}. المتدرب يستحق تعويضًا.`
              : `تم تسجيل الحصة وخصمها — متبقي ${res.remaining} حصة من أصل ${res.total}.`);
          if (res.measureReminder) {
            toast('⏱️ مرّت 3 حصص أو أكثر منذ آخر قياس لهذا المتدرب — سجّل الوزن والقياسات.', true);
          }
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel),
      trainerSel ? field('المدرب المنفّذ (تُنسب له الحصة)', trainerSel) : el('span'),
      el('div', { class: 'span-2' }, field('نوع الحصة', kindSel)),
      absenceField,
      makeupHint,
      field('التاريخ', dateIn),
      field('ساعة الحصة', timeIn),
      field('المدة (دقيقة)', durIn),
      ...trainingFields,
      el('div', { class: 'span-2' }, field('ملاحظات المدرب', notesIn)),
      el('div', { class: 'span-2' }, saveBtn)),
  ]);
  syncKind();
}

/* ============================================================
   اللوحة المالية — المحاسب
   ============================================================ */
async function viewAccountantDash(root) {
  const state = urlState({ month: thisMonthISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const [data, branches, expenses, targets, debts] = await Promise.all([
      API.get(`/api/dashboard/accountant?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
      API.get(`/api/expenses?month=${state.month}` + (state.branch ? `&branch=${state.branch}` : '')),
      API.get('/api/targets').catch(() => []),
      API.get('/api/debts' + (state.branch ? `?branch=${state.branch}` : '')).catch(() => null),
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
    /* المصاريف بعملة فرعها، ومصروف الشركة (بلا فرع) بعملة النظام */
    const expensesByCur = {};
    expenses.forEach((x) => {
      const c = branchCurrency(x.branchId);
      expensesByCur[c] = Math.round(((expensesByCur[c] || 0) + Number(x.amount || 0)) * 100) / 100;
    });
    /* صافي الربح = التحصيل − المصاريف، لكل عملة على حدة. طرحُ دينارٍ من
       شيكل لا معنى له، فلا نُخرج رقمًا واحدًا حين تتعدّد العملات. */
    const netByCur = {};
    for (const c of new Set([...Object.keys(k.collectedMonth || {}), ...Object.keys(expensesByCur)])) {
      netByCur[c] = Math.round((((k.collectedMonth || {})[c] || 0) - (expensesByCur[c] || 0)) * 100) / 100;
    }
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(fmtMoneyMap(k.collectedMonth), 'تحصيل هذا الشهر', 'wallet', 'green'),
      kpiHero(fmtMoneyMap(expensesByCur), 'مصاريف هذا الشهر', 'card'),
      kpiHero(fmtMoneyMap(netByCur), 'صافي الربح', 'chart', 'blue')));
    if (isMultiCurrency(k.collectedMonth) || isMultiCurrency(k.outstanding)) {
      container.append(el('div', { class: 'alert alert--info' },
        'فروعك بعملتين مختلفتين — كل مبلغ معروض بعملته، ولا تُجمع العملتان في رقم واحد.'));
    }
    container.append(el('div', { class: 'kpis' },
      kpiTile(fmtMoneyMap(k.outstanding), 'متبقٍ غير محصل', 'alert', 'warn'),
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

    /* الديون — كل من عليه متبقٍ، بأي حالة اشتراك، وسدادها بضغطة.
       تُعرض البطاقة حتى بلا ديون: منها يُسجَّل الدَّين السابق للنظام. */
    if (debts) {
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `الديون المستحقة (${debts.totals.count} بندًا · ${debts.totals.people} شخصًا)`,
          el('button', { class: 'btn btn--accent btn--sm', onclick: () => openPaymentModal(render, data.subscriptions) }, '+ تسجيل سداد'),
          /* «الديون مش لازم يكون في مدخل سابق لاشتراك عشان يدخلها» —
             دَينُ ما قبل النظام يُسجَّل على الشخص مباشرةً */
          el('button', { class: 'btn btn--outline btn--sm', onclick: () => openLegacyDebtModal(render) }, '+ دَين سابق للنظام')),
        el('div', { class: 'kpis', style: 'margin-bottom:10px' },
          kpiTile(fmtMoneyMap(debts.totals.amount), 'إجمالي الديون', 'alert', 'danger'),
          kpiTile(fmtMoneyMap(debts.totals.oldAmount), 'ديون اشتراكات سابقة', 'card', 'warn'),
          kpiTile(fmtMoneyMap(debts.totals.legacyAmount || {}), `ديون ما قبل النظام (${debts.totals.legacyCount || 0})`, 'file', 'warn'),
          kpiTile(debts.totals.people, 'أشخاص عليهم دين', 'users')),
        pagedTable(['المتدرب', 'الفرع', 'البند', 'القيمة', 'المدفوع', 'المتبقي', 'ينتهي', 'الحالة', ''],
          debts.rows,
          (r) => [
            /* غيرُ المسجَّل لا ملفَّ له — اسمُه نصٌّ لا رابط يقود لصفحة فارغة */
            r.traineeId != null
              ? el('a', { href: '#/trainee/' + r.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, r.traineeName)
              : el('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
                el('b', {}, r.traineeName),
                el('span', { class: 'tag tag--neutral', title: 'دَينٌ على شخص ليس له حساب في النظام' }, 'غير مسجَّل')),
            r.branchName, r.packageName, fmtMoney(r.price, r.currency), fmtMoney(r.paid, r.currency),
            el('b', { style: 'color:var(--status-danger)' }, fmtMoney(r.remaining, r.currency)),
            r.endDate || '—',
            r.legacy ? el('span', { class: 'tag tag--warning' }, 'دَين سابق للنظام')
              : r.old ? el('span', { class: 'tag tag--danger' }, 'دين سابق') : statusTag(r.status),
            el('div', { class: 'row-actions' },
              el('button', {
                class: 'btn btn--outline btn--sm',
                onclick: () => openDebtPaymentModal(render, r),
              }, 'تسجيل سداد'),
              r.phone ? el('a', {
                class: 'btn btn--petrol btn--sm', target: '_blank', rel: 'noopener',
                href: waLink(r.phone, OPS_SETTINGS.waCountryCode || '970',
                  `مرحبًا ${r.traineeName} 👋 تذكير ودّي من سبورت باور بخصوص المتبقي على اشتراكك (${fmtMoney(r.remaining)}) — نسعد بترتيب الدفعة في أي وقت يناسبك.`,
                  r.traineeName),
              }, 'واتساب') : el('span'))],
          { pageSize: 10, searchText: (r) => r.traineeName || '', searchPlaceholder: 'ابحث باسم المتدرب…',
            emptyText: '✅ لا ديون مستحقة. ومن «+ دَين سابق للنظام» تُسجَّل متأخرات ما قبل التشغيل.' })));
    }

    /* إدارة المصاريف الشهرية */
    container.append(expensesCard(expenses, branches, state.month, render));

    const months = Object.keys(data.byMonth).sort().slice(-6);
    /* الاتجاه الشهري لكل عملة على حدة — رسمٌ منفصل لكل عملة، فلا يُجمع
       الدينار على الشيكل في عمود واحد. */
    const trendCurs = [...new Set(months.flatMap((m) => Object.keys(data.byMonth[m] || {})))];
    const trendBody = !months.length
      ? el('div', { class: 'empty' }, 'لا بيانات.')
      : el('div', {}, ...(trendCurs.length ? trendCurs : ['ILS']).map((code) => el('div', { style: 'margin-bottom:8px' },
          trendCurs.length > 1 ? el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:2px' }, curInfo(code).name) : '',
          barChart(months.map((m) => m.slice(2)), months.map((m) => (data.byMonth[m] || {})[code] || 0), { unit: curInfo(code).symbol }))));
    container.append(el('div', { class: 'grid-2' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'التحصيل الشهري (آخر 6 أشهر)'),
        trendBody),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `دفعات شهر ${data.month}`),
        pagedTable(['المتدرب', 'المبلغ', 'التاريخ', 'الطريقة', ''],
          data.payments,
          (p) => {
            const sub = data.subscriptions.find((s) => s.id === p.subscriptionId) || {};
            const who = sub.traineeName || p.payerName || '—';
            return [
              p.unregistered
                ? el('span', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
                  el('b', {}, who), el('span', { class: 'tag tag--neutral' }, 'غير مسجَّل'))
                : who,
              fmtMoney(p.amount, p.branchId), p.date,
              p.debt ? el('span', {}, p.method + ' ', el('span', { class: 'tag tag--warning' }, p.legacy ? 'سداد دَين سابق' : 'سداد دين')) : p.method,
              /* دفعةُ دَينٍ سابق تُعدَّل من قائمة الديون لا من هنا —
                 نافذةُ التعديل مبنيّة على اشتراك، ولا اشتراك لها. */
              p.legacy ? el('span') : el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openPaymentModal(render, data.subscriptions, p) }, 'تعديل')];
          },
          { pageSize: 10, emptyText: 'لا دفعات في هذا الشهر.',
            searchText: (p) => ((data.subscriptions.find((s) => s.id === p.subscriptionId) || {}).traineeName || p.payerName || '') }))));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الاشتراكات — الحالة المالية'),
      pagedTable(['المتدرب', 'قيمة الاشتراك', 'المدفوع', 'المتبقي', 'تاريخ البدء', 'تاريخ الانتهاء', 'الحالة'],
        data.subscriptions,
        (s) => [el('a', { href: '#/trainee/' + s.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, s.traineeName),
          fmtMoney(s.price, s.branchId), fmtMoney(s.paid, s.branchId),
          /* الاشتراك الملغى لا يُطالَب به — يظهر متبقيه رماديًا وخارج
             مجموع الديون، وإلا بدا دَينًا يُلاحَق وهو ليس كذلك */
          el('span', {
            style: s.cancelled ? 'color:var(--app-muted);text-decoration:line-through'
              : s.remaining > 0 ? 'color:var(--status-danger);font-weight:700' : '',
            title: s.cancelled ? 'اشتراك ملغى — لا يدخل في إجمالي الديون' : null,
          }, fmtMoney(s.remaining, s.branchId)),
          s.startDate, s.endDate, statusTag(s.status)],
        { pageSize: 15, searchText: (s) => s.traineeName || '', searchPlaceholder: 'ابحث باسم المتدرب…' })));
  }

  await render();
}

async function openPaymentModal(onDone, subscriptions, existing) {
  const dates = (s) => (s.startDate ? ` · ${s.startDate} ← ${s.endDate}` : '');
  const optOf = (s) => [s.id, `${s.traineeName} — ${fmtMoney(s.price)} (متبقي ${fmtMoney(s.remaining)})${dates(s)}`];
  /* «سداد دين» كان يعرض الاشتراكات المنتهية فقط، فمن عليه متأخرات على
     اشتراك فعّال لم يكن له خيار في القائمة — والدفعة لا تُسجَّل.
     الآن نجلب كل ما عليه دين من الخادم (فعّال ومنتهٍ)، ونُقدّم القديم. */
  const isOld = (s) => ['expired', 'cancelled'].includes(s.status);
  const currentSubs = subscriptions.filter((s) => !isOld(s));
  /* دفعة على اشتراك سابق: المبلغ يخص الاشتراك القديم لا الحالي —
     وليست بالضرورة «دينًا» يُميَّز في السجل. تُنسب للاشتراك الصحيح
     ويمكن تسجيلها بتاريخ ذلك الاشتراك. */
  const previousSubs = subscriptions.filter(isOld);
  let debtSubs = subscriptions.filter((s) => s.remaining > 0);
  if (!existing) {
    try {
      const d = await API.get('/api/debts');
      debtSubs = d.rows.map((r) => ({
        id: r.subscriptionId, traineeName: `${r.traineeName}${r.old ? ' (اشتراك سابق)' : ''}`,
        price: r.price, remaining: r.remaining, status: r.status, branchId: r.branchId,
        startDate: r.startDate, endDate: r.endDate,
      }));
    } catch (e) { /* نبقى على ما تعرفه الصفحة */ }
  }
  const typeSel = select([
    ['current', 'دفعة من الاشتراك الحالي'],
    ['previous', `دفعة على اشتراك سابق${previousSubs.length ? ` (${previousSubs.length})` : ''}`],
    ['debt', `سداد دين${debtSubs.length ? ` (${debtSubs.length} اشتراكًا عليه متبقٍ)` : ' (لا ديون مستحقة)'}`],
  ], { value: existing && existing.debt ? 'debt' : 'current' });
  const subField = el('div', { class: 'span-2' });
  const subInfo = el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted);display:none' });
  let subSel;
  const poolOf = () => (typeSel.value === 'debt' ? debtSubs : typeSel.value === 'previous' ? previousSubs : currentSubs);
  const drawSubInfo = () => {
    const row = poolOf().find((s) => String(s.id) === String(subSel.value));
    subInfo.innerHTML = '';
    if (!row || !row.startDate) { subInfo.style.display = 'none'; return; }
    subInfo.style.display = '';
    subInfo.append(`مدة الاشتراك المختار: ${row.startDate} ← ${row.endDate}. `,
      el('button', {
        type: 'button', class: 'btn btn--ghost btn--sm',
        onclick: () => { dateIn.value = row.startDate; toast('اعتُمد تاريخ بداية الاشتراك تاريخًا للدفعة.'); },
      }, 'اعتماد تاريخ الاشتراك للدفعة'));
  };
  const buildSubSel = () => {
    if (existing) {
      subSel = select(subscriptions.map(optOf), { value: existing.subscriptionId });
      subSel.disabled = true;
    } else {
      const pool = poolOf();
      subSel = searchSelect(pool.map(optOf), {
        placeholder: pool.length ? 'اكتب اسم المتدرب للبحث…' : 'لا اشتراكات مطابقة لهذا الخيار',
      });
      subSel.addEventListener('change', () => {
        const row = pool.find((s) => String(s.id) === String(subSel.value));
        // سداد دين: املأ المبلغ بالمتبقي تلقائيًا عند اختيار الاشتراك
        if (row && typeSel.value === 'debt' && !amountIn.value) amountIn.value = row.remaining;
        drawSubInfo();
        if (typeof updateAmountCur === 'function') updateAmountCur();
      });
    }
    subField.innerHTML = '';
    subField.append(field(typeSel.value === 'debt' ? 'الاشتراك الذي عليه دين'
      : typeSel.value === 'previous' ? 'الاشتراك السابق' : 'الاشتراك', subSel));
    drawSubInfo();
    if (typeof updateAmountCur === 'function') updateAmountCur();
  };

  const amountIn = input({ type: 'number', min: 1, value: existing ? existing.amount : '' });
  // عنوان المبلغ يتبع عملة فرع الاشتراك المختار (دفعة عمّان بالدينار)
  const amountLabel = curLabel('المبلغ', existing ? branchCurrency(existing.branchId) : ACTIVE_CURRENCY);
  const updateAmountCur = () => {
    const row = poolOf().find((s) => subSel && String(s.id) === String(subSel.value));
    amountLabel.setCurrency(row && row.branchId != null ? branchCurrency(row.branchId) : ACTIVE_CURRENCY);
  };
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  typeSel.addEventListener('change', buildSubSel);
  buildSubSel();
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
            const r = await API.post('/api/payments', {
              subscriptionId: Number(subSel.value), amount: amountIn.value, date: dateIn.value,
              method: methodSel.value, note: noteIn.value, debt: typeSel.value === 'debt',
            });
            toast(typeSel.value === 'debt'
              ? 'سُجّل سداد الدين على الاشتراك المدين — وتحدّث المتبقي تلقائيًا.'
              : typeSel.value === 'previous'
                ? 'سُجّلت الدفعة على الاشتراك السابق — لا تمس رصيد الاشتراك الحالي.'
                : 'تمت إضافة الدفعة — تحدّثت الأرقام تلقائيًا.');
            // نقطة الولاء: تجديد في وقته + دفعة واحدة كاملة + إكمال الحصص
            if (r && r.loyaltyPoint) toast('🏅 استحق المشترك نقطة ولاء: جدّد في وقته، دفع دفعة واحدة، وأنهى كل حصصه.');
          }
          close();
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('نوع الدفعة', typeSel)),
      subField,
      subInfo,
      field(amountLabel, amountIn),
      field('تاريخ الدفع', dateIn),
      field('طريقة الدفع', methodSel),
      field('ملاحظة', noteIn),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'حفظ الدفعة'))),
  ]);
  if (existing) typeSel.disabled = true;
}

/* سداد دين على اشتراك بعينه — المبلغ يبدأ بالمتبقي كاملًا */
function openDebtPaymentModal(onDone, debtRow) {
  const amountIn = input({ type: 'number', min: 1, max: debtRow.remaining, value: debtRow.remaining });
  const dateIn = input({ type: 'date', value: todayISO() });
  const methodSel = select([['كاش', 'كاش'], ['بطاقة', 'بطاقة'], ['تحويل بنكي', 'تحويل بنكي']]);
  const noteIn = input({ placeholder: 'ملاحظة (اختياري)' });

  const close = modal(`سداد دين — ${debtRow.traineeName}`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          /* دَينُ ما قبل النظام لا اشتراك له — يُسدَّد على الدين نفسه */
          const r = await API.post('/api/payments', debtRow.legacyDebtId
            ? { legacyDebtId: debtRow.legacyDebtId, amount: amountIn.value, date: dateIn.value,
              method: methodSel.value, note: noteIn.value || 'سداد دين سابق' }
            : { subscriptionId: debtRow.subscriptionId, amount: amountIn.value, date: dateIn.value,
              method: methodSel.value, note: noteIn.value || 'سداد دين', debt: true });
          toast(debtRow.legacyDebtId ? 'سُجّل السداد — وتحدّث المتبقي من الدين.'
            : 'سُجّل السداد — وتحدّث المتبقي على الاشتراك.');
          if (r && r.loyaltyPoint) toast('🏅 استحق المشترك نقطة ولاء.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, el('div', { class: 'alert alert--info' },
        `${debtRow.packageName} — قيمة ${fmtMoney(debtRow.price, debtRow.currency)}، مدفوع ${fmtMoney(debtRow.paid, debtRow.currency)}، متبقٍ ${fmtMoney(debtRow.remaining, debtRow.currency)}.`)),
      field(`المبلغ (${curInfo(debtRow.currency).name})`, amountIn), field('تاريخ السداد', dateIn),
      field('طريقة الدفع', methodSel), field('ملاحظة', noteIn),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تسجيل السداد'))),
  ]);
}

/* ============================================================
   دَين سابق للنظام
   «الديون مش لازم يكون في مدخل سابق لاشتراك عشان يدخلها لانو في ديون
   سابقة بحكم انو النظام جديد»: يُسجَّل الدين على الشخص مباشرةً بلا
   اشتراك، ثم يُسدَّد بدفعات كبقية الديون.
   ============================================================ */
async function openLegacyDebtModal(onDone) {
  const [trainees, branches] = await Promise.all([
    API.get('/api/users?role=trainee').catch(() => []),
    API.get('/api/branches').catch(() => []),
  ]);

  /* صاحب الدَّين حالتان — «فيه خيارين»:
     مشتركٌ مسجَّل عندنا فيُربط بحسابه، أو شخصٌ ليس في النظام فيكفي
     اسمه («ما بدنا نسجّل الكل عشان نقبض دَينًا قديمًا»). */
  const whoSel = select([
    ['registered', 'مشترك مسجَّل في النظام'],
    ['unregistered', 'شخص غير مسجَّل — يكفي اسمه'],
  ], { value: 'registered' });

  const traineeSel = searchSelect(trainees.map(traineeOption), { value: '' });
  const nameIn = input({ placeholder: 'اسم صاحب الدَّين' });
  const phoneIn = input({ placeholder: 'جواله (اختياري)', dir: 'ltr', style: 'text-align:end' });
  const branchSel = select([['', 'بلا فرع'], ...branches.map((b) => [b.id, b.name])], { value: '' });

  const amountIn = input({ type: 'number', min: 1, step: 'any', placeholder: 'قيمة الدين' });
  const dateIn = input({ type: 'date', value: todayISO() });
  const reasonIn = input({ placeholder: 'مثال: متبقٍ من اشتراك ٢٠٢٥ قبل النظام' });
  const noteIn = input({ placeholder: 'ملاحظة (اختياري)' });

  /* دفعةٌ مع التسجيل: تسجيلُ واحدٍ يدفع دَينه فعلٌ واحد لا فعلان.
     تُترك فارغة إن كان الدَّين يُسجَّل الآن ويُسدَّد لاحقًا. */
  const payIn = input({ type: 'number', min: 0, step: 'any', placeholder: 'اتركه فارغًا إن لم يدفع الآن' });
  const payDateIn = input({ type: 'date', value: todayISO() });
  const payMethodSel = select([['كاش', 'كاش'], ['بطاقة', 'بطاقة'], ['تحويل بنكي', 'تحويل بنكي']]);

  const traineeField = field('المشترك', traineeSel);
  const nameField = field('اسم صاحب الدَّين', nameIn);
  const phoneField = field('الجوال (اختياري)', phoneIn);
  const branchField = field('الفرع', branchSel);
  const hint = el('div', { class: 'span-2 alert alert--info' });

  const syncWho = () => {
    const reg = whoSel.value === 'registered';
    traineeField.style.display = reg ? '' : 'none';
    nameField.style.display = reg ? 'none' : '';
    phoneField.style.display = reg ? 'none' : '';
    branchField.style.display = reg ? 'none' : '';
    hint.textContent = reg
      ? 'الدَّين يُربط بحساب المشترك ويظهر في ملفه، وفرعُه يُقرأ من حسابه.'
      : 'لا يُفتح حساب لهذا الشخص — يُسجَّل اسمه فقط. الدَّين يدخل إجمالي الديون، '
        + 'وسدادُه يدخل التحصيل وسجلَّ الدفعات كأي مبلغ آخر.';
  };
  whoSel.addEventListener('change', syncWho);

  const close = modal('تسجيل دَين سابق للنظام', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const reg = whoSel.value === 'registered';
        if (reg && !traineeSel.value) { toast('اختر المشترك.', true); return; }
        if (!reg && !nameIn.value.trim()) { toast('اكتب اسم صاحب الدَّين.', true); return; }
        try {
          const body = {
            amount: amountIn.value, date: dateIn.value,
            reason: reasonIn.value, note: noteIn.value,
            payAmount: payIn.value || undefined,
            payDate: payDateIn.value, payMethod: payMethodSel.value,
          };
          if (reg) body.traineeId = Number(traineeSel.value);
          else {
            body.personName = nameIn.value.trim();
            body.personPhone = phoneIn.value.trim();
            body.branchId = branchSel.value ? Number(branchSel.value) : null;
          }
          const r = await API.post('/api/legacy-debts', body);
          toast(r && r.payment
            ? 'سُجّل الدَّين ومعه دفعته — ودخلت التحصيل.'
            : 'سُجّل الدين — ويظهر الآن في قائمة الديون المستحقة.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, el('div', { class: 'alert alert--info' },
        'للمتأخرات التي نشأت قبل تشغيل النظام فلا اشتراك لها هنا. '
        + 'تُسجَّل على الشخص، وتدخل إجمالي الديون، وتُسدَّد بدفعات كبقية الديون.')),
      el('div', { class: 'span-2' }, field('صاحب الدَّين', whoSel)),
      hint,
      el('div', { class: 'span-2' }, traineeField),
      nameField, phoneField,
      el('div', { class: 'span-2' }, branchField),
      field('قيمة الدين', amountIn), field('تاريخ نشوء الدين', dateIn),
      el('div', { class: 'span-2' }, field('سبب الدين / وصفه', reasonIn)),
      el('div', { class: 'span-2' }, field('ملاحظة', noteIn)),
      el('div', { class: 'span-2 sidebar__caption', style: 'padding:6px 0 0' },
        'دفع الآن؟ (اختياري — تُسجَّل الدفعة مع الدَّين في خطوة واحدة)'),
      field('المبلغ المدفوع الآن', payIn), field('تاريخ الدفعة', payDateIn),
      el('div', { class: 'span-2' }, field('طريقة الدفع', payMethodSel)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ'))),
  ], { wide: true });
  syncWho();
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
    startDate: s.startDate, endDate: s.endDate, packageName: s.packageName,
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
        infoChip('مكان السكن', t.residence), infoChip('انضم', t.joinedAt),
        infoChip('اسم المستخدم', t.username)),
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
    // المحاسب أيضًا يحجز المواعيد (بطلب العميل)
    if (API.user.role === 'accountant') {
      actions.append(el('button', {
        class: 'btn btn--outline btn--sm',
        onclick: async () => {
          const [trainers, trainees] = await Promise.all([
            API.get('/api/users?role=trainer'), API.get('/api/users?role=trainee')]);
          openApptModal(refresh, trainers, trainees, null, traineeId);
        },
      }, '+ حجز موعد'));
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
    /* إرسال بروفايله وبيانات دخوله برسالة واتساب جاهزة — للإدارة والمحاسب.
       تُولَّد كلمة مرور مؤقتة جديدة عند كل إرسال (لا تُخزَّن مقروءة). */
    if (['admin', 'accountant'].includes(API.user.role)) {
      actions.append(el('button', {
        class: 'btn btn--outline btn--sm',
        onclick: () => openCredentialsModal(t, sub
          ? `اشتراكك: ${sub.totalSessions} حصة — المتبقي ${sub.remaining} حصة حتى ${sub.endDate}.`
          : ''),
      }, 'إرسال بياناته واتساب'));
    }
    container.append(actions);
  }

  /* إحصاءات الحضور والمال */
  const statTiles = el('div', { class: 'kpis' },
    kpiTile(data.attendance.attended, 'حصة حضرها', 'check'),
    kpiTile(data.attendance.missed, 'غياب', 'alert', data.attendance.missed >= 2 ? 'danger' : undefined),
    /* الغياب خُصم من الرصيد، وتعويضه لاحقًا بلا خصم جديد — فالرقم المهم
       هو ما لم يُعوَّض بعد */
    kpiTile(data.attendance.owedMakeups ?? data.attendance.absenceSessions ?? 0, 'غياب مخصوم بانتظار تعويض', 'alert',
      (data.attendance.owedMakeups ?? data.attendance.absenceSessions) ? 'warn' : undefined),
    kpiTile(data.attendance.pct !== null ? data.attendance.pct + '%' : '—', 'نسبة الحضور', 'pulse', 'blue'));
  if (data.finance) {
    statTiles.append(
      kpiTile(fmtMoney(data.finance.totalPaid), 'إجمالي المدفوع', 'wallet'),
      kpiTile(fmtMoney(data.finance.remaining), 'متبقٍ عليه', 'card', data.finance.remaining > 0 ? 'warn' : undefined));
  }
  container.append(statTiles);

  /* ديون ما قبل النظام على هذا المشترك — بلا اشتراك يقابلها.
     تظهر هنا كي لا يبدو الملف مسدَّدًا وعلى صاحبه متأخرات حقيقية. */
  if (isMoneyStaff && (data.legacyDebts || []).length) {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'ديون سابقة للنظام',
        el('button', { class: 'btn btn--outline btn--sm', onclick: () => openLegacyDebtModal(refreshPage) }, '+ دَين سابق')),
      el('div', { class: 'sidebar__caption', style: 'padding:0 0 8px' },
        'متأخرات نشأت قبل تشغيل النظام فلا اشتراك لها — تُسدَّد كبقية الديون.'),
      dataTable(['التاريخ', 'السبب', 'القيمة', 'المدفوع', 'المتبقي', ''],
        data.legacyDebts.map((d) => [d.date || '—', d.reason || 'دَين سابق',
          fmtMoney(d.amount, d.branchId), fmtMoney(d.paid, d.branchId),
          el('b', { style: d.remaining > 0 ? 'color:var(--status-danger)' : 'color:var(--app-muted)' },
            fmtMoney(d.remaining, d.branchId)),
          d.remaining > 0
            ? el('button', {
              class: 'btn btn--accent btn--sm',
              onclick: () => openDebtPaymentModal(refreshPage, {
                legacyDebtId: d.id, traineeName: t.name, packageName: d.reason || 'دَين سابق للنظام',
                price: d.amount, paid: d.paid, remaining: d.remaining, currency: undefined,
              }),
            }, 'تسجيل سداد')
            : el('span', { class: 'tag tag--accent' }, 'مسدَّد ✓')]))));
  }

  /* النتائج والمشاكل — رصد داخلي سرّي (الخادم يُرسل null لحساب المتدرب) */
  if (data.flags) container.append(traineeFlagsCard(data, traineeId, refreshPage));

  /* الاشتراك والباقات — على ملف المشترك (بلا أسعار للمدرب) */
  container.append(traineePackagesCard(data, traineeId, refreshPage));

  /* الهدف التدريبي لهذا المشترك — لا برنامج عام يُربط بالجميع */
  container.append(traineeGoalCard(data, traineeId, refreshPage));

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
  /* تاريخ الاشتراكات مع تعديل وحذف: التجديد قد يُدخَل اشتراكين بالخطأ بدل
     واحد — فيُحذف المكرَّر من هنا مباشرة (تُحذف دفعاته معه). */
  const canEditSubs = ['admin', 'accountant'].includes(API.user.role);
  historyGrid.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'تاريخ الاشتراكات',
      data.subscriptions.length > 1 && canEditSubs
        ? el('span', { class: 'tag tag--neutral' }, `${data.subscriptions.length} اشتراكات`) : el('span')),
    dataTable(['الباقة', 'الحصص', 'المستخدم', ...(showPrices ? ['القيمة'] : []), 'من', 'إلى', 'الحالة', ...(canEditSubs ? [''] : [])],
      data.subscriptions.slice().reverse().map((s) => [
        s.packageName || '—', String(s.totalSessions), String(s.usedSessions),
        ...(showPrices ? [fmtMoney(s.price)] : []),
        s.startDate, s.endDate, statusTag(s.status, s.expiring),
        ...(canEditSubs ? [el('div', { class: 'row-actions' },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openEditSubscriptionModal(refreshPage, s, t.name) }, 'تعديل'),
          el('button', {
            class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
            onclick: async () => {
              if (!confirm(`حذف اشتراك ${s.startDate} → ${s.endDate} نهائيًا؟\nتُحذف دفعاته وأحداثه معه، وتبقى حصصه في السجل دون ارتباط باشتراك. للاشتراكات المُدخلة بالخطأ (تجديد مكرَّر) فقط.`)) return;
              try {
                const r = await API.del('/api/subscriptions/' + s.id);
                toast(`حُذف الاشتراك${r.removedPayments ? ` و${r.removedPayments} دفعة مرتبطة` : ''}.`);
                refreshPage();
              } catch (ex) { toast(ex.message, true); }
            },
          }, 'حذف'))] : [])]),
      'لا اشتراكات بعد.')));
  if (data.payments) {
    historyGrid.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'سجل الدفعات'),
      dataTable(['التاريخ', 'المبلغ', 'الطريقة', 'ملاحظة', ...(isMoneyStaff ? [''] : [])],
        data.payments.slice().reverse().map((p) => [p.date, fmtMoney(p.amount, p.branchId),
          p.debt ? el('span', {}, p.method + ' ', el('span', { class: 'tag tag--warning' }, 'سداد دين')) : p.method,
          p.note || '—',
          ...(isMoneyStaff ? [el('div', { class: 'row-actions' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openPaymentModal(refreshPage, subsForPay, p) }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف دفعة ${fmtMoney(p.amount, p.branchId)} بتاريخ ${p.date}؟`)) return;
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
    inbodyCard.append(inbodyComparisonTable(rs, t.goal));
    // تعديل القراءات وحذفها — للإدارة والمدرب
    if (['admin', 'trainer'].includes(API.user.role)) {
      inbodyCard.append(el('h4', { style: 'margin:14px 0 6px;font-size:13px;color:var(--app-muted)' }, 'كل القراءات — تعديل وحذف'),
        dataTable(['التاريخ', 'الوزن', 'التغيّر ⇅', 'دهون %', 'عضل', 'الخصر', 'ملاحظة', ''],
          rs.map((r, i) => ({ r, prev: i > 0 ? rs[i - 1] : null })).reverse().map(({ r, prev }) => [r.date, r.weight ?? '—',
            // مقارنة بالقراءة التي قبلها زمنيًا — الاتجاه يعكس الطلوع والنزول الفعلي
            changeArrow(r.weight, prev && prev.weight, { goodWhenUp: goodWhenUpForGoal(t.goal) }),
            r.bodyFatPct ?? '—', r.muscleMass ?? '—', r.waist ?? '—', r.notes || '—',
            el('div', { class: 'row-actions' },
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

  /* صور المتابعة — كل أسبوعين، تُحفظ في ملف المشترك بمبدأ InBody */
  container.append(await traineePhotosCard(traineeId, refreshPage));

  // سجل الحصص — الإدارة والمدرب يعدّلان ويحذفان (الحذف يعيد الحصة للرصيد)
  const canEditSession = (s) => API.user.role === 'admin' || (API.user.role === 'trainer' && s.trainerId === API.user.id);
  const sessionActions = isStaff;
  const sessionRow = (s) => [s.date, s.time, sessionKindTag(s), s.duration + ' د', s.style || '—', s.weight ? s.weight + ' كغ' : '—',
    s.kind === 'absence' ? (s.absenceReason || s.notes || '—') : (s.notes || '—'),
    ...(sessionActions ? [el('div', { class: 'row-actions' },
      canEditSession(s) ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSessionEditModal(refreshPage, s) }, 'تعديل') : el('span'),
      canEditSession(s) ? el('button', {
        class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
        onclick: async () => {
          if (!confirm(`حذف حصة ${s.date} ${s.time}؟ الحصة العادية أو الغياب تُعاد لرصيد الاشتراك.`)) return;
          try {
            const r = await API.del('/api/sessions/' + s.id);
            toast(r.refunded ? 'حُذفت الحصة وأُعيدت لرصيد الاشتراك.' : 'حُذفت الحصة.');
            refreshPage();
          } catch (ex) { toast(ex.message, true); }
        },
      }, 'حذف') : el('span'))] : [])];
  const sessionHeaders = ['التاريخ', 'الساعة', 'النوع', 'المدة', 'الأسلوب', 'الوزن', 'ملاحظات', ...(sessionActions ? [''] : [])];

  /* سجل الحصص مفصولًا باشتراكاته: فاصل بين حصص كل اشتراك حتى يتضح
     أي الحصص تخص الاشتراك الأول وأيها الثاني وهكذا (بطلب العميل) */
  const sessionsCard = el('div', { class: 'card' });
  /* «الساعات الي سجلها المتدرب تظهر ع صفحته ويقدر يغير التاريخ ليشوف
     الي قبل والي بعد» — منتقي فترة فوق السجل، وفارغٌ يعني كل الحصص. */
  const sessFrom = input({ type: 'date', style: 'width:150px' });
  const sessTo = input({ type: 'date', style: 'width:150px' });
  const sessBody = el('div');
  const monthShift = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  };
  const setRange = (from, to) => { sessFrom.value = from || ''; sessTo.value = to || ''; drawSessions(); };
  sessionsCard.append(
    el('h3', { class: 'card__title' }, 'سجل الحصص — مفصولًا حسب الاشتراك'),
    el('div', { style: 'display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px' },
      field('من تاريخ', sessFrom), field('إلى تاريخ', sessTo),
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => setRange(monthShift(-1), todayISO()) }, 'آخر شهر'),
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => setRange(monthShift(-3), todayISO()) }, 'آخر ٣ أشهر'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => setRange('', '') }, 'كل الحصص')),
    sessBody);
  sessFrom.addEventListener('change', () => drawSessions());
  sessTo.addEventListener('change', () => drawSessions());

  function drawSessions() {
    sessBody.innerHTML = '';
    const from = sessFrom.value, to = sessTo.value;
    const sessions = data.sessions.filter((s) => (!from || s.date >= from) && (!to || s.date <= to));
    if (from || to) {
      sessBody.append(el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px' },
        `${sessions.length} حصة ضمن الفترة المختارة من أصل ${data.sessions.length}.`));
    }
    drawSessionGroups(sessBody, sessions);
  }

  /* الحصص مجمّعة باشتراكاتها — الفاصل يوضّح أي الحصص للاشتراك الأول
     وأيها للثاني، ويبقى صحيحًا داخل الفترة المختارة. */
  function drawSessionGroups(target, sessionList) {
    if (!sessionList.length) {
      target.append(el('div', { class: 'empty' },
        data.sessions.length ? 'لا حصص في هذه الفترة.' : 'لا حصص مسجلة بعد.'));
      return;
    }
    const sessionsCard = target;
    {
    // ترقيم الاشتراكات زمنيًا: الأقدم = الاشتراك ١
    const subsChrono = data.subscriptions.slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
    const subNo = new Map(subsChrono.map((s, i) => [s.id, i + 1]));
    const AR_NUMS = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠'];
    const groups = [];
    const byId = new Map();
    sessionList.forEach((s) => { // مرتبة تنازليًا — الأحدث أولًا
      const key = s.subscriptionId || 0;
      if (!byId.has(key)) { byId.set(key, []); groups.push(key); }
      byId.get(key).push(s);
    });
    groups.forEach((key) => {
      const list = byId.get(key);
      const sub = data.subscriptions.find((x) => x.id === key);
      let title;
      if (sub) {
        const n = subNo.get(sub.id);
        title = el('div', { class: 'macros', style: 'align-items:center' },
          el('span', { class: 'tag tag--petrol' }, `الاشتراك ${AR_NUMS[n - 1] || n}`),
          el('span', { class: 'macro' }, el('b', {}, sub.packageName || `${sub.totalSessions} حصة`)),
          el('span', { class: 'macro' }, `${sub.startDate} ← ${sub.endDate}`),
          el('span', { class: 'macro' }, 'حصص مسجلة ', el('b', {}, String(list.length))),
          statusTag(sub.status, sub.expiring));
      } else {
        title = el('div', { class: 'macros', style: 'align-items:center' },
          el('span', { class: 'tag tag--info' }, 'بلا اشتراك'),
          el('span', { class: 'macro' }, 'حصص قديمة غير مرتبطة باشتراك ', el('b', {}, String(list.length))));
      }
      sessionsCard.append(
        el('div', { style: 'margin:14px 0 8px;padding-top:12px;border-top:2px dashed var(--app-line)' }, title),
        dataTable(sessionHeaders, list.map(sessionRow)));
    });
  }
  }
  drawSessions();
  container.append(sessionsCard);

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

/* ============================================================
   الهدف التدريبي للمشترك
   «كل شخص الو هدف مختلف» — فالهدف خطةٌ مربوطة بحسابه: أسلوبها وغايتها
   وعدد حصصها وغياباتها المسموحة والتزام خطة أكلها والتغيّرات المستهدفة.
   وتقدّمُها يُقرأ من الحصص المسجَّلة لا من إدخال يدوي.
   ============================================================ */
function goalKindOptions() {
  return Object.entries(GOAL_LABELS);
}

function traineeGoalCard(data, traineeId, onDone) {
  const goals = data.goals || [];
  const active = goals.find((g) => (g.status || 'active') === 'active');
  const past = goals.filter((g) => g !== active);
  const canEdit = ['admin', 'trainer', 'nutritionist'].includes(API.user.role);
  const card = el('div', { class: 'card' });

  const head = el('h3', { class: 'card__title' }, 'الهدف التدريبي');
  if (canEdit) {
    head.append(active
      ? el('div', { style: 'display:flex;gap:6px' },
        el('button', { class: 'btn btn--outline btn--sm', onclick: () => openGoalModal(onDone, traineeId, active) }, 'تعديل'),
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openGoalCloseModal(onDone, active) }, 'إغلاق الهدف'))
      : el('button', { class: 'btn btn--accent btn--sm', onclick: () => openGoalModal(onDone, traineeId, null) }, '+ وضع هدف'));
  }
  card.append(head);

  if (!active) {
    card.append(el('div', { class: 'alert alert--warning', style: 'margin:0' },
      canEdit
        ? '⚠️ لا هدف تدريبي فعّال لهذا المشترك — بلا هدف لا خطة تُقاس ولا يُعرف إن كان يتقدّم أم يراوح مكانه.'
        : 'لم يُوضع لك هدف تدريبي بعد — تواصل مع مدربك.'));
  } else {
    const p = active.progress || {};
    const row = (label, value) => (value || value === 0
      ? el('div', {}, el('div', { style: 'font-size:12px;color:var(--app-muted)' }, label),
        el('div', { style: 'font-weight:700' }, String(value)))
      : null);
    card.append(
      el('div', { class: 'macros', style: 'margin-bottom:10px' },
        el('span', { class: 'tag tag--petrol' }, active.kindLabel || GOAL_LABELS[active.kind] || 'هدف'),
        el('span', { class: 'macro' }, el('b', {}, active.style || '—')),
        active.trainerName ? el('span', { class: 'macro' }, 'وضعه ', el('b', {}, active.trainerName)) : el('span'),
        active.startDate ? el('span', { class: 'macro' }, `${active.startDate}${active.endDate ? ' ← ' + active.endDate : ''}`) : el('span')),
      active.purpose ? el('p', { style: 'margin:0 0 12px;color:var(--app-muted);font-size:14px' }, active.purpose) : el('span'),
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:12px' },
        ...[
          row('المدة', active.months ? active.months + ' أشهر' : null),
          row('الحصص المخطَّطة', active.sessionsPlanned),
          row('الغيابات المسموحة', active.allowedAbsences),
          row('التعويض خلال', active.makeupMonths ? active.makeupMonths + ' شهر' : null),
          row('التزام خطة الأكل', active.mealCommitPct ? active.mealCommitPct + '%' : null),
        ].filter(Boolean)));

    if (active.sessionsPlanned) {
      card.append(
        el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:4px' },
          `الحصص المنفَّذة ضمن الهدف: ${p.sessionsDone} من ${active.sessionsPlanned}`),
        progressBar(p.sessionsPct));
    }
    if (active.allowedAbsences != null) {
      card.append(el('div', { style: 'margin-top:8px;font-size:13px' },
        'الغيابات: ',
        el('b', { style: p.overAbsence ? 'color:var(--status-danger)' : '' }, `${p.absences} من ${active.allowedAbsences}`),
        p.overAbsence ? el('span', { class: 'tag tag--danger', style: 'margin-inline-start:6px' }, 'تجاوز المسموح') : ''));
    }
    if (active.targetChanges) {
      card.append(el('div', { class: 'alert alert--info', style: 'margin:12px 0 0' },
        el('b', {}, 'التغيّرات المستهدفة: '), active.targetChanges));
    }
    if (active.notes) {
      card.append(el('div', { style: 'margin-top:10px;font-size:13px;color:var(--app-muted)' }, active.notes));
    }
  }

  if (past.length) {
    card.append(el('h4', { style: 'margin:16px 0 6px;font-size:13px;color:var(--app-muted)' }, 'أهداف سابقة'),
      dataTable(['النوع', 'الأسلوب', 'من', 'إلى', 'الحالة', 'ما تحقق'],
        past.map((g) => [g.kindLabel || '—', g.style || '—', g.startDate || '—', g.endDate || '—',
          el('span', { class: 'tag ' + (g.status === 'done' ? 'tag--accent' : 'tag--neutral') },
            g.status === 'done' ? 'مكتمل' : 'ملغى'),
          g.outcome || '—'])));
  }
  return card;
}

function openGoalModal(onDone, traineeId, existing) {
  const kindSel = select(goalKindOptions(), { value: existing ? existing.kind : 'loss' });
  const styleIn = input({ value: existing ? existing.style || '' : '', placeholder: 'مثال: قوة — تقسيمة دفع/سحب/أرجل' });
  const purposeIn = textarea({ value: existing ? existing.purpose || '' : '', placeholder: 'الهدف من هذا الأسلوب…' });
  const monthsIn = input({ type: 'number', step: '0.5', min: 0.5, value: existing ? existing.months ?? '' : 3 });
  const sessionsIn = input({ type: 'number', min: 1, value: existing ? existing.sessionsPlanned ?? '' : 36 });
  const absIn = input({ type: 'number', min: 0, value: existing ? existing.allowedAbsences ?? '' : 4 });
  const makeupIn = input({ type: 'number', step: '0.5', min: 0, value: existing ? existing.makeupMonths ?? '' : 1 });
  const mealIn = input({ type: 'number', min: 0, max: 100, value: existing ? existing.mealCommitPct ?? '' : 90 });
  const changesIn = textarea({ value: existing ? existing.targetChanges || '' : '', placeholder: 'مثال: −6 كغ وزن، −3% دهون، محيط الخصر −5 سم' });
  const startIn = input({ type: 'date', value: existing ? existing.startDate || todayISO() : todayISO() });
  const notesIn = textarea({ value: existing ? existing.notes || '' : '', placeholder: 'ملاحظات (اختياري)' });

  const close = modal(existing ? 'تعديل الهدف التدريبي' : 'وضع هدف تدريبي', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!styleIn.value.trim()) { toast('الأسلوب التدريبي مطلوب.', true); return; }
        const body = {
          traineeId, kind: kindSel.value, style: styleIn.value.trim(), purpose: purposeIn.value.trim(),
          months: monthsIn.value || null, sessionsPlanned: sessionsIn.value || null,
          allowedAbsences: absIn.value === '' ? null : absIn.value,
          makeupMonths: makeupIn.value || null, mealCommitPct: mealIn.value || null,
          targetChanges: changesIn.value.trim(), startDate: startIn.value, notes: notesIn.value.trim(),
        };
        try {
          if (existing) await API.put('/api/trainee-goals/' + existing.id, body);
          else await API.post('/api/trainee-goals', body);
          toast(existing ? 'حُفظ الهدف.' : 'وُضع الهدف — ووصل إشعار للمشترك.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('نوع الهدف', kindSel)),
      el('div', { class: 'span-2' }, field('الأسلوب التدريبي *', styleIn)),
      el('div', { class: 'span-2' }, field('الهدف من الأسلوب', purposeIn)),
      field('المدة (أشهر)', monthsIn),
      field('عدد الحصص خلال المدة', sessionsIn),
      field('الغيابات المسموحة', absIn),
      field('التعويض خلال (أشهر)', makeupIn),
      field('التزام خطة الأكل %', mealIn),
      field('تاريخ البدء', startIn),
      el('div', { class: 'span-2' }, field('التغيّرات المستهدفة خلال المدة', changesIn)),
      el('div', { class: 'span-2' }, field('ملاحظات', notesIn)),
      el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
        'تاريخ الانتهاء يُحسب من المدة تلقائيًا. ونوع الهدف يصير هدفَ حساب المشترك — '
        + 'فتتبعه قراءةُ التقدّم في القياسات ومكتبةُ التغذية.'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' },
        existing ? 'حفظ الهدف' : 'وضع الهدف'))),
  ]);
}

/* إغلاق الهدف: مكتملٌ بما تحقق، أو ملغى — والسجل يبقى في ملفه */
function openGoalCloseModal(onDone, goal) {
  const statusSel = select([['done', 'مكتمل — تحقق الهدف'], ['cancelled', 'ملغى']]);
  const outcomeIn = textarea({ placeholder: 'ما الذي تحقق فعلًا؟ (يظهر في سجل أهدافه)' });
  const close = modal('إغلاق الهدف التدريبي', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/trainee-goals/' + goal.id, { status: statusSel.value, outcome: outcomeIn.value.trim() });
          toast('أُغلق الهدف — ويمكن وضع هدف جديد الآن.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('الحالة', statusSel)),
      el('div', { class: 'span-2' }, field('ما تحقق', outcomeIn)),
      el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
        'إغلاق الهدف يفتح البابَ لوضع هدف جديد — ولا يُحذف هذا من سجله.'),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إغلاق الهدف'))),
  ]);
}

/* ============================================================
   صور متابعة المشترك — تُلتقط كل أسبوعين وتُحفظ في ملفه
   ============================================================ */
async function traineePhotosCard(traineeId, onDone) {
  const canManage = ['admin', 'trainer'].includes(API.user.role);
  const url = API.user.role === 'trainee' ? '/api/trainee-photos' : '/api/trainee-photos?trainee=' + traineeId;
  let photos = [];
  try { photos = await API.get(url); } catch (e) { /* تُعرض فارغة */ }

  const card = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'صور المتابعة 📸',
      canManage
        ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => openPhotosUploadModal(onDone, traineeId) }, '+ إضافة صور')
        : el('span')),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'تُلتقط الصور كل أسبوعين وتُحفظ في ملف المشترك بالتاريخ — لمتابعة التقدّم بصريًا إلى جانب قراءات InBody.'));

  if (!photos.length) {
    card.append(el('div', { class: 'empty' }, 'لا صور متابعة بعد' + (canManage ? ' — أضف أول مجموعة صور.' : '.')));
    return card;
  }

  /* آخر صورة كل أسبوعين: تنبيه إن مرّ أكثر من 14 يومًا على آخر التقاط */
  const lastDate = photos[0].date; // الأحدث أولًا من الخادم
  const daysSince = Math.floor((new Date(todayISO()) - new Date(lastDate)) / 86400000);
  if (canManage && daysSince > 14) {
    card.append(el('div', { class: 'alert alert--warning' },
      `⏱️ مرّ ${daysSince} يومًا على آخر صور متابعة (${lastDate}) — حان موعد التقاط صور جديدة.`));
  }

  // تجميع بالتاريخ — كل جلسة تصوير قسم مستقل
  const byDate = [];
  const map = new Map();
  photos.forEach((p) => {
    if (!map.has(p.date)) { map.set(p.date, []); byDate.push(p.date); }
    map.get(p.date).push(p);
  });
  byDate.forEach((d) => {
    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px' });
    map.get(d).forEach((p) => {
      grid.append(el('div', { style: 'position:relative' },
        el('a', { href: p.imageUrl, target: '_blank' },
          el('img', { src: p.imageUrl, alt: 'صورة متابعة ' + p.date, loading: 'lazy',
            style: 'width:100%;height:150px;object-fit:cover;border-radius:10px;border:1px solid var(--app-line)' })),
        p.notes ? el('div', { style: 'font-size:11px;color:var(--app-muted);margin-top:2px' }, p.notes) : '',
        canManage ? el('button', {
          class: 'btn btn--ghost btn--sm', title: 'حذف الصورة',
          style: 'position:absolute;top:4px;inset-inline-end:4px;background:rgba(0,0,0,.45);color:#fff;padding:2px 8px',
          onclick: async () => {
            if (!confirm(`حذف صورة ${p.date}؟`)) return;
            try { await API.del('/api/trainee-photos/' + p.id); toast('حُذفت الصورة.'); onDone && onDone(); }
            catch (ex) { toast(ex.message, true); }
          },
        }, '✕') : ''));
    });
    card.append(
      el('div', { class: 'sidebar__caption', style: 'padding:12px 0 6px' }, `📅 ${d} (${map.get(d).length} صورة)`),
      grid);
  });
  return card;
}

function openPhotosUploadModal(onDone, traineeId) {
  const dateIn = input({ type: 'date', value: todayISO() });
  const fileIn = input({ type: 'file', accept: 'image/*', multiple: true });
  const notesIn = input({ placeholder: 'مثال: أمامي / جانبي / خلفي (اختياري)' });
  const preview = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  let images = [];

  fileIn.addEventListener('change', () => {
    images = [];
    preview.innerHTML = '';
    [...fileIn.files].slice(0, 8).forEach((f) => {
      const r = new FileReader();
      r.onload = () => {
        images.push(r.result);
        preview.append(el('img', { src: r.result, style: 'height:90px;border-radius:8px;border:1px solid var(--app-line)' }));
      };
      r.readAsDataURL(f);
    });
  });

  const close = modal('إضافة صور متابعة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!images.length) { toast('اختر صورة واحدة على الأقل.', true); return; }
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          const r = await API.post('/api/trainee-photos', {
            traineeId, date: dateIn.value, notes: notesIn.value, imagesBase64: images,
          });
          toast(`حُفظت ${r.photos.length} صورة في ملف المشترك.`);
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); btn.disabled = false; }
      },
    },
      field('تاريخ الالتقاط', dateIn),
      field('ملاحظة', notesIn),
      el('div', { class: 'span-2' }, field('الصور (حتى 8 صور)', fileIn), preview),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ الصور'))),
  ], { wide: true });
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
      field(`القيمة (${curInfo(branchCurrency(sub.branchId)).name})`, priceIn),
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

/* تعديل حصة مسجلة — البيانات الوصفية والقياسات، والإدارة تنقلها لمدرب آخر */
async function openSessionEditModal(onDone, s) {
  const dateIn = input({ type: 'date', value: s.date });
  const timeIn = input({ type: 'time', value: s.time });
  const durIn = input({ type: 'number', min: 15, step: 15, value: s.duration });
  const styleIn = input({ value: s.style || '' });
  const weightIn = input({ type: 'number', step: '0.1', value: s.weight ?? '' });
  const notesIn = textarea({ value: s.notes || '' });

  /* القياس بعد الحصة (بطلب المدربين): المدرب قد يقيس بعد التسجيل لا قبله —
     فالحقول كلها هنا أيضًا، معبأة من قراءة الحصة في سجل InBody إن وُجدت،
     والحفظ يحدّث القراءة نفسها لا يكررها. */
  const twin = (await API.get('/api/inbody?trainee=' + s.traineeId).catch(() => []))
    .find((r) => r.date === s.date && (r.notes || '') === 'قياسات مسجلة مع الحصة') || {};
  if (!weightIn.value && twin.weight) weightIn.value = twin.weight;
  const fatIn = input({ type: 'number', step: '0.1', value: twin.bodyFatPct ?? '', placeholder: 'اختياري' });
  const fatMassIn = input({ type: 'number', step: '0.1', value: twin.fatMass ?? '', placeholder: 'اختياري' });
  const muscleIn = input({ type: 'number', step: '0.1', value: twin.muscleMass ?? '', placeholder: 'اختياري' });
  const tape = {};
  for (const k of ['waist', 'chest', 'arm', 'hips', 'leg']) tape[k] = input({ type: 'number', step: '0.5', value: twin[k] ?? '', placeholder: 'سم' });
  const measureFields = [
    field('الوزن (كغ)', weightIn),
    field('نسبة الدهون %', fatIn),
    field('كتلة الدهون (كغ)', fatMassIn),
    field('كتلة العضلات (كغ)', muscleIn),
    el('div', { class: 'span-2 sidebar__caption', style: 'padding:4px 0 0' }, 'قياسات شريط القياس (سم) — اختياري'),
    el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px' },
      field('الخصر', tape.waist), field('الصدر', tape.chest), field('اليد', tape.arm),
      field('الحوض', tape.hips), field('الرجل', tape.leg)),
    el('div', { class: 'span-2', style: 'font-size:12px;color:var(--app-muted)' },
      'أي قياس يُدخل أو يُعدَّل هنا يُحفظ في قراءة الحصة بسجل InBody — قِس قبل الحصة أو بعدها كما يناسبك.'),
  ];

  /* التبديل بين الأنواع تصحيحُ توسيمٍ واحتسابِ حضور. والحصة التعويضية
     المرتبطة بغياب (بلا خصم) لا تُحوَّل — يرفضها الخادم وتُحذف وتُسجَّل
     من جديد. */
  const kindSel = select([
    ['regular', 'عادية — حضر ونُفّذت'],
    ['makeup', 'تعويض — نُفّذت تعويضًا وتبقى مخصومة'],
    ['absence', 'غياب — تُحتسب غيابًا وتبقى مخصومة'],
  ], { value: ['makeup', 'absence'].includes(s.kind) ? s.kind : 'regular' });
  const absenceReasonIn = input({ value: s.absenceReason || '', placeholder: 'سبب الغياب (اختياري)' });
  const absenceField = el('div', { class: 'span-2' }, field('سبب الغياب', absenceReasonIn));
  const syncKind = () => {
    const absent = kindSel.value === 'absence';
    absenceField.style.display = absent ? '' : 'none';
    // لا قياسات في الغياب — تختفي بدل أن تُترك فارغة
    measureFields.forEach((n) => { n.style.display = absent ? 'none' : ''; });
  };
  kindSel.addEventListener('change', syncKind);
  /* الإدارة تنقل أي حصة لمدرب آخر — والمدرب ينقل حصته هو
     (سجّلها على برنامجه بينما درّبها زميله) */
  let trainerSel = null;
  if (['admin', 'trainer'].includes(API.user.role)) {
    const trainers = await API.get('/api/users?role=trainer');
    trainerSel = select(trainers.map((t) => [t.id, t.name]), { value: s.trainerId || '' });
  }
  const close = modal('تعديل الحصة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const absent = kindSel.value === 'absence';
          const r = await API.put('/api/sessions/' + s.id, {
            date: dateIn.value, time: timeIn.value, duration: durIn.value,
            style: styleIn.value, notes: notesIn.value, weight: absent ? null : (weightIn.value || null),
            bodyFatPct: absent ? undefined : (fatIn.value || undefined),
            fatMass: absent ? undefined : (fatMassIn.value || undefined),
            muscleMass: absent ? undefined : (muscleIn.value || undefined),
            waist: absent ? undefined : (tape.waist.value || undefined),
            chest: absent ? undefined : (tape.chest.value || undefined),
            arm: absent ? undefined : (tape.arm.value || undefined),
            hips: absent ? undefined : (tape.hips.value || undefined),
            leg: absent ? undefined : (tape.leg.value || undefined),
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            kind: kindSel.value,
            absenceReason: kindSel.value === 'absence' ? absenceReasonIn.value : undefined,
          });
          toast(r && r.measured ? 'حُفظت الحصة — والقياسات في سجل InBody.' : 'حُفظت الحصة.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      trainerSel ? el('div', { class: 'span-2' }, field('المدرب المنفّذ (تُنسب له الحصة في تقاريره)', trainerSel)) : el('span'),
      el('div', { class: 'span-2' }, field('نوع الحصة', kindSel)),
      absenceField,
      field('التاريخ', dateIn), field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn),
      el('div', { class: 'span-2' }, field('الأسلوب', styleIn)),
      ...measureFields,
      el('div', { class: 'span-2' }, field('ملاحظات', notesIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
  syncKind();
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

function inbodyComparisonTable(readings, goal) {
  const first = readings[0], last = readings[readings.length - 1];
  const weightUpIsGood = goodWhenUpForGoal(goal);
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
      /* العضل والماء والصدر واليد والرجل: الزيادة تقدم — والخصر والحوض
         والدهون: النقصان تقدم. أما الوزن فيتبع هدف المتدرب: زيادةٌ لمن
         يبني عضلًا تقدّم، وبلا حكم لمن هدفه التثبيت. */
      const good = k === 'weight'
        ? (weightUpIsGood === null ? null : weightUpIsGood ? delta > 0 : delta < 0)
        : ['muscleMass', 'water', 'score', 'chest', 'arm', 'leg'].includes(k) ? delta > 0 : delta < 0;
      const tone = delta === 0 || good === null ? 'tag--neutral' : good ? 'tag--accent' : 'tag--danger';
      return [label, a ?? '—', b ?? '—',
        delta === null ? '—' : el('span', { class: 'tag ' + tone }, (delta > 0 ? '+' : '') + delta)];
    }));
}

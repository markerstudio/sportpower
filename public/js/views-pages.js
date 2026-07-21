/* الصفحات: التقويم، الاشتراكات، الفروع والمدربون، InBody، التغذية، التقارير */

/* ============================================================
   Calendar — أسبوعي مشترك
   ============================================================ */
async function viewCalendar(root) {
  const state = { start: weekStart(new Date()), trainer: '' };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const from = iso(state.start);
    const end = new Date(state.start); end.setDate(end.getDate() + 6);
    const to = iso(end);

    const reqs = [API.get(`/api/appointments?from=${from}&to=${to}` + (state.trainer ? `&trainer=${state.trainer}` : ''))];
    const isAdmin = API.user.role === 'admin';
    if (isAdmin) reqs.push(API.get('/api/users?role=trainer'), API.get('/api/users?role=trainee'));
    else if (API.user.role === 'trainer') reqs.push(Promise.resolve([]), API.get('/api/users?role=trainee'));
    const [appts, trainers = [], trainees = []] = await Promise.all(reqs);
    container.innerHTML = '';

    const title = `أسبوع ${from} → ${to}`;
    const toolbar = el('div', { class: 'card cal-toolbar' },
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => { state.start.setDate(state.start.getDate() - 7); render(); } }, 'الأسبوع السابق →'),
      el('div', { class: 'cal-toolbar__title' }, title),
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => { state.start.setDate(state.start.getDate() + 7); render(); } }, '← الأسبوع التالي'),
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { state.start = weekStart(new Date()); render(); } }, 'اليوم'));
    if (isAdmin) {
      toolbar.append(select([['', 'كل المدربين'], ...trainers.map((t) => [t.id, t.name])], {
        value: state.trainer, style: 'width:170px', onchange: (e) => { state.trainer = e.target.value; render(); },
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
            const trainee = trainees.find((t) => t.id === a.traineeId);
            const trainer = trainers.find((t) => t.id === a.trainerId);
            const chip = el('button', { class: 'cal-chip ' + a.status, onclick: () => openApptModal(render, trainers, trainees, a) },
              el('b', {}, trainee ? trainee.name : 'متدرب #' + a.traineeId),
              el('small', {}, ` ${a.time}` + (isAdmin && trainer ? ` · ${trainer.name.split(' ')[1] || trainer.name}` : '')));
            cell.append(chip);
          });
        grid.append(cell);
      });
    });
    container.append(el('div', { class: 'card', style: 'padding:0;overflow-x:auto' }, grid));
  }

  await render();
}

function weekStart(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; } // الأحد بداية الأسبوع
function iso(d) { return d.toISOString().slice(0, 10); }

async function openApptModal(onDone, trainers, trainees, existing) {
  const isAdmin = API.user.role === 'admin';
  if (!trainees.length) trainees = await API.get('/api/users?role=trainee');
  const trainerSel = isAdmin
    ? select(trainers.map((t) => [t.id, t.name]), { value: existing ? existing.trainerId : undefined })
    : null;
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: existing ? existing.traineeId : '' });
  const dateIn = input({ type: 'date', value: existing ? existing.date : todayISO() });
  const timeIn = input({ type: 'time', value: existing ? existing.time : '17:00' });
  const durIn = input({ type: 'number', value: existing ? existing.duration : 60, min: 15, step: 15 });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });
  const statusSel = existing ? select([['scheduled', 'مجدولة'], ['done', 'منفذة'], ['cancelled', 'ملغاة']], { value: existing.status }) : null;

  const close = modal(existing ? 'تعديل موعد' : 'إضافة موعد جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const body = {
            trainerId: trainerSel ? Number(trainerSel.value) : undefined,
            traineeId: Number(traineeSel.value),
            date: dateIn.value, time: timeIn.value, duration: Number(durIn.value), note: noteIn.value,
          };
          if (existing) {
            body.status = statusSel.value;
            await API.put('/api/appointments/' + existing.id, body);
            toast('تم تعديل الموعد — وأُرسل إشعار بالتغيير.');
          } else {
            await API.post('/api/appointments', body);
            toast('تمت إضافة الموعد — وصل إشعار للمدرب والمتدرب.');
          }
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      trainerSel ? field('المدرب', trainerSel) : el('span'),
      field('المتدرب', traineeSel),
      field('التاريخ', dateIn),
      field('الساعة', timeIn),
      field('المدة (دقيقة)', durIn),
      statusSel ? field('الحالة', statusSel) : el('span'),
      el('div', { class: 'span-2' }, field('ملاحظة', noteIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إضافة الموعد'))),
  ]);
  if (existing && trainerSel) trainerSel.disabled = true;
}

/* ============================================================
   Onboarding — تسجيل زبون جديد بخطوة واحدة
   ============================================================ */
async function openOnboardModal(onDone) {
  const [branches, trainers] = await Promise.all([
    API.get('/api/branches'),
    API.get('/api/users?role=trainer'),
  ]);

  const nameIn = input({ placeholder: 'الاسم الكامل *' });
  const phoneIn = input({ placeholder: '05XXXXXXXX *', dir: 'ltr', style: 'text-align:end' });
  const birthIn = input({ type: 'date' });
  const branchSel = select(branches.map((b) => [b.id, b.name]));
  const goalSel = select(Object.entries(GOAL_LABELS));

  const totalSel = select([[8, '8 حصص'], [12, '12 حصة'], [16, '16 حصة'], [24, '24 حصة']], { value: 12 });
  const priceIn = input({ type: 'number', min: 0, value: 1200 });
  const startIn = input({ type: 'date', value: todayISO() });
  const endDefault = new Date(); endDefault.setMonth(endDefault.getMonth() + 1);
  const endIn = input({ type: 'date', value: endDefault.toISOString().slice(0, 10) });

  const payIn = input({ type: 'number', min: 0, placeholder: 'اتركه فارغًا إن لم يدفع الآن' });
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
            branchId: Number(branchSel.value), goal: goalSel.value,
            subscription: { totalSessions: Number(totalSel.value), price: Number(priceIn.value), startDate: startIn.value, endDate: endIn.value },
            payment: payIn.value ? { amount: Number(payIn.value), method: methodSel.value } : null,
            appointment: apptTrainerSel.value ? { trainerId: Number(apptTrainerSel.value), date: apptDate.value, time: apptTime.value } : null,
          });
          showSuccess(res);
        } catch (ex) { toast(ex.message, true); btn.disabled = false; }
      },
    },
      section('١ — بيانات المتدرب'),
      field('الاسم الكامل *', nameIn), field('رقم الجوال *', phoneIn),
      field('تاريخ الميلاد', birthIn), field('الفرع', branchSel),
      el('div', { class: 'span-2' }, field('الهدف', goalSel)),
      section('٢ — الاشتراك'),
      field('عدد الحصص', totalSel), field(`القيمة (${curInfo().name})`, priceIn),
      field('تاريخ البدء', startIn), field('تاريخ الانتهاء', endIn),
      section('٣ — الدفعة الأولى (اختياري)'),
      field('المبلغ المدفوع الآن', payIn), field('طريقة الدفع', methodSel),
      section('٤ — أول حصة (اختياري)'),
      el('div', { class: 'span-2', style: 'display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px' },
        field('المدرب', apptTrainerSel), field('التاريخ', apptDate), field('الساعة', apptTime)),
      el('div', { class: 'span-2' },
        el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'إنشاء الحساب وتفعيل الاشتراك'))));
  }

  function showSuccess(res) {
    const creds = `بيانات دخولك لنظام سبورت باور:\nالرابط: ${location.origin}\nاسم المستخدم: ${res.credentials.username}\nكلمة المرور: ${res.credentials.password}\n(سيُطلب منك تغييرها عند أول دخول)`;
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

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [subs, trainees, sessions] = await Promise.all([
      API.get('/api/subscriptions'),
      API.get('/api/users?role=trainee'),
      API.get('/api/sessions?month=' + thisMonthISO()),
    ]);
    container.innerHTML = '';

    const byName = (id) => (trainees.find((t) => t.id === id) || {}).name || '#' + id;

    container.append(el('div', { class: 'card filters' },
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--accent', onclick: () => openOnboardModal(render) }, '+ زبون جديد (Onboarding)'),
      el('button', { class: 'btn btn--outline', onclick: () => openSubModal(render, trainees) }, 'تجديد اشتراك لمتدرب حالي'),
      el('button', { class: 'btn btn--outline', onclick: () => openLogSessionModal(render) }, '+ تسجيل حصة')));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'كل الاشتراكات'),
      pagedTable(['المتدرب', 'الحصص', 'المستخدم', 'المتبقي', 'القيمة', 'من', 'إلى', 'الحالة', ''],
        subs.sort((a, b) => (a.status === 'expired') - (b.status === 'expired')),
        (s) => {
          const act = async (action, label) => {
            if (!confirm(`${label} اشتراك ${byName(s.traineeId)}؟`)) return;
            try { await API.post(`/api/subscriptions/${s.id}/action`, { action }); toast('تم — وسُجّل الحدث في المتابعة اليومية.'); render(); }
            catch (ex) { toast(ex.message, true); }
          };
          return [byName(s.traineeId),
            el('span', { class: 'num' }, String(s.totalSessions)),
            el('span', { class: 'num' }, String(s.usedSessions)),
            el('b', { class: 'num', style: s.remaining <= 2 ? 'color:var(--status-danger)' : 'color:var(--accent-hover)' }, String(s.remaining)),
            fmtMoney(s.price), s.startDate, s.endDate, statusTag(s.status, s.expiring),
            el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
              s.status === 'frozen'
                ? el('button', { class: 'btn btn--outline btn--sm', onclick: () => act('unfreeze', 'فك تجميد') }, 'فك التجميد')
                : s.status === 'active' ? el('button', { class: 'btn btn--outline btn--sm', onclick: () => act('freeze', 'تجميد') }, 'تجميد') : el('span'),
              ['active', 'frozen'].includes(s.status)
                ? el('button', { class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)', onclick: () => act('cancel', 'إلغاء') }, 'إلغاء')
                : el('span'))];
        },
        { pageSize: 15, searchText: (s) => byName(s.traineeId), searchPlaceholder: 'ابحث باسم المتدرب…' })));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `حصص شهر ${thisMonthISO()}`),
      pagedTable(['التاريخ', 'الساعة', 'المتدرب', 'المدة', 'الأسلوب', 'ملاحظات'],
        sessions.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
        (s) => [s.date, s.time, byName(s.traineeId), s.duration + ' د', s.style || '—', s.notes || '—'],
        { pageSize: 15, emptyText: 'لا حصص هذا الشهر.', searchText: (s) => byName(s.traineeId), searchPlaceholder: 'ابحث باسم المتدرب…' })));
  }

  await render();
}

async function openSubModal(onDone, trainees) {
  const traineeSel = searchSelect(trainees.map(traineeOption));
  const totalIn = select([[8, '8 حصص'], [12, '12 حصة'], [16, '16 حصة'], [24, '24 حصة']], { value: 12 });
  const priceIn = input({ type: 'number', value: 1200, min: 0 });
  const startIn = input({ type: 'date', value: todayISO() });
  const end = new Date(); end.setMonth(end.getMonth() + 1);
  const endIn = input({ type: 'date', value: end.toISOString().slice(0, 10) });

  const close = modal('اشتراك جديد / تجديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          await API.post('/api/subscriptions', {
            traineeId: Number(traineeSel.value), totalSessions: Number(totalIn.value),
            price: Number(priceIn.value), startDate: startIn.value, endDate: endIn.value,
          });
          toast('تم تفعيل الاشتراك — ووصل إشعار للمتدرب.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('المتدرب', traineeSel)),
      field('عدد الحصص', totalIn),
      field(`القيمة (${curInfo().name})`, priceIn),
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

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'كل المتدربين'),
      pagedTable(['الاسم', 'الجوال', 'الفرع', 'الهدف', ''],
        users.filter((u) => u.role === 'trainee'),
        (t) => [t.name, t.phone || '—',
          (branches.find((b) => b.id === t.branchId) || {}).name || '—',
          GOAL_LABELS[t.goal] || '—',
          el('div', { style: 'display:flex;gap:6px;justify-content:flex-end' },
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openEditTraineeModal(render, t, users, branches) }, 'تعديل'),
            el('a', { class: 'btn btn--ghost btn--sm', href: '#/trainee/' + t.id }, 'الملف ←'))],
        { pageSize: 15, searchText: (t) => `${t.name} ${t.phone || ''}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…' })));
  }

  await render();
}

/* تعديل متدرب: الفرع / الهدف / الجوال (المدربون بالتناوب — لا إسناد ثابتًا) */
function openEditTraineeModal(onDone, trainee, users, branches) {
  const branchSel = select(branches.map((b) => [b.id, b.name]), { value: trainee.branchId || '' });
  const goalSel = select(Object.entries(GOAL_LABELS), { value: trainee.goal || 'loss' });
  const phoneIn = input({ value: trainee.phone || '', dir: 'ltr', style: 'text-align:end' });

  const close = modal(`تعديل «${trainee.name}»`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/users/' + trainee.id, {
            branchId: Number(branchSel.value), goal: goalSel.value, phone: phoneIn.value,
          });
          toast('تم حفظ التعديلات.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الفرع', branchSel),
      field('الهدف', goalSel),
      el('div', { class: 'span-2' }, field('الجوال', phoneIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
  ]);
}

function openBranchModal(onDone) {
  const nameIn = input({ placeholder: 'اسم الفرع' });
  const addrIn = input({ placeholder: 'العنوان' });
  const phoneIn = input({ placeholder: 'الهاتف', dir: 'ltr', style: 'text-align:end' });
  const close = modal('فرع جديد', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.post('/api/branches', { name: nameIn.value, address: addrIn.value, phone: phoneIn.value });
          toast('تمت إضافة الفرع.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    }, field('الاسم', nameIn), field('العنوان', addrIn), field('الهاتف', phoneIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'إضافة')),
  ]);
}

function openUserModal(onDone, branches, users) {
  const roleSel = select([['trainee', 'متدرب'], ['trainer', 'مدرب'], ['accountant', 'محاسب'], ['nutritionist', 'أخصائية تغذية']]);
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
async function viewInbody(root) {
  const isStaff = ['admin', 'trainer'].includes(API.user.role);
  const container = el('div', { class: 'content' });
  root.append(container);
  container.append(spinnerCard());

  const trainees = API.user.role === 'trainee' ? [] : await API.get('/api/users?role=trainee');
  const state = { trainee: API.user.role === 'trainee' ? API.user.id : (trainees[0] || {}).id };
  container.innerHTML = '';

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

  async function renderList() {
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
      dataTable(['التاريخ', 'الوزن', 'الدهون %', 'العضلات', 'دهون الجسم', 'الماء', 'BMI', 'النقاط', 'الصورة'],
        readings.map((r) => [r.date, r.weight, r.bodyFatPct ?? '—', r.muscleMass ?? '—', r.fatMass ?? '—',
          r.water ?? '—', r.bmi ?? '—', r.score ?? '—',
          r.image ? el('a', { href: '/uploads/' + r.image, target: '_blank' }, 'عرض') : '—'])),
      el('h3', { class: 'card__title', style: 'margin-top:18px' }, 'مقارنة أول قراءة بآخر قراءة'),
      inbodyComparisonTable(readings));
  }

  await renderList();
}

function openInbodyModal(onDone, traineeId, trainees) {
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: traineeId });
  const dateIn = input({ type: 'date', value: todayISO() });
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
  };
  const notesIn = input({ placeholder: 'اختياري' });
  let imageBase64 = null;

  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      imageBase64 = reader.result;
      preview.style.display = '';
      preview.innerHTML = `<img src="${imageBase64}" style="max-height:160px;border-radius:8px">`;
      ocrStatus.textContent = 'جارٍ محاولة القراءة التلقائية (OCR)…';
      try {
        const res = await API.post('/api/inbody/ocr', { imageBase64 });
        if (res.ocr) {
          let filled = 0;
          Object.entries(res.fields).forEach(([k, v]) => { if (v != null && fields[k]) { fields[k].value = v; filled++; } });
          ocrStatus.textContent = filled
            ? `✓ قُرئت ${filled} قيمة تلقائيًا — راجعها وعدّل ما يلزم.`
            : 'لم يتعرف OCR على قيم واضحة — يرجى الإدخال اليدوي.';
        } else {
          ocrStatus.textContent = res.reason;
        }
      } catch (ex) { ocrStatus.textContent = 'تعذّرت القراءة التلقائية — أدخل القيم يدويًا.'; }
    };
    reader.readAsDataURL(f);
  });

  const close = modal('رفع قراءة InBody', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          await API.post('/api/inbody', {
            traineeId: Number(traineeSel.value), date: dateIn.value,
            weight: fields.weight.value, bodyFatPct: fields.bodyFatPct.value,
            muscleMass: fields.muscleMass.value, fatMass: fields.fatMass.value,
            water: fields.water.value, bmi: fields.bmi.value, score: fields.score.value,
            notes: notesIn.value, imageBase64,
          });
          toast('تم حفظ القراءة في صفحة المتدرب.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('المتدرب', traineeSel), field('تاريخ القراءة', dateIn),
      el('div', { class: 'span-2' }, field('صورة ورقة InBody', fileIn), preview, ocrStatus),
      field('الوزن *', fields.weight), field('نسبة الدهون %', fields.bodyFatPct),
      field('كتلة العضلات', fields.muscleMass), field('دهون الجسم', fields.fatMass),
      field('الماء', fields.water), field('BMI', fields.bmi),
      field('النقاط', fields.score), field('ملاحظات', notesIn),
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
      meal.image ? el('img', { class: 'real', src: '/uploads/' + meal.image, alt: meal.name })
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
      el('span', { class: 'tag tag--neutral' }, 'الهدف: ' + (GOAL_LABELS[meal.goal] || meal.goal)),
      slotLabel ? el('span', { class: 'tag tag--petrol' }, slotLabel) : (actions || '')));
}

async function viewMeals(root) {
  const isStaff = ['admin', 'trainer', 'nutritionist'].includes(API.user.role);
  const state = { search: '', type: '', goal: '', maxCalories: '', minProtein: '' };
  const container = el('div', { class: 'content' });
  root.append(container);

  const filterBar = el('div', { class: 'card filters' });
  const grid = el('div', { class: 'meals-grid' });
  container.append(filterBar, grid);

  const searchIn = input({ placeholder: 'ابحث بالاسم أو المكونات…', oninput: debounce(() => { state.search = searchIn.value; render(); }) });
  const typeSel = select([['', 'كل الأنواع'], ...Object.entries(MEAL_TYPES)], { onchange: (e) => { state.type = e.target.value; render(); } });
  const goalSel = select([['', API.user.role === 'trainee' ? 'حسب هدفي' : 'كل الأهداف'], ...Object.entries(GOAL_LABELS)], { onchange: (e) => { state.goal = e.target.value; render(); } });
  const calIn = input({ type: 'number', placeholder: 'مثال: 450', oninput: debounce(() => { state.maxCalories = calIn.value; render(); }) });
  const protIn = input({ type: 'number', placeholder: 'مثال: 25', oninput: debounce(() => { state.minProtein = protIn.value; render(); }) });

  filterBar.append(
    el('div', { class: 'field', style: 'flex:1;min-width:200px' }, el('label', { class: 'field__label' }, 'بحث'), searchIn),
    field('نوع الوجبة', typeSel), field('الهدف', goalSel),
    field('حد السعرات الأقصى', calIn), field('حد البروتين الأدنى', protIn));
  if (isStaff) filterBar.append(el('button', { class: 'btn btn--accent', onclick: () => openMealModal(render) }, '+ وجبة جديدة'));

  async function render() {
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
  const goalSel = select(Object.entries(GOAL_LABELS));
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
async function viewReports(root) {
  const state = { month: thisMonthISO(), branch: '' };
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [report, branches, kpis] = await Promise.all([
      API.get(`/api/reports/monthly?month=${state.month}&branch=${state.branch}`),
      API.get('/api/branches'),
      API.get('/api/kpi?month=' + state.month).catch(() => []),
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
      el('button', { class: 'btn btn--outline', onclick: () => window.print() }, 'تصدير PDF / طباعة')));

    const kpiOf = (name) => kpis.find((k) => k.name === name) || {};
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `تقرير المدربين — ${report.month} (إجمالي الحصص: ${report.totalSessions})`),
      dataTable(['المدرب', 'الفرع', 'عدد الحصص', 'عدد الأشخاص', 'متدربون فريدون', 'ساعات التدريب', 'إنجاز المهام', 'KPI'],
        report.trainers.map((t) => {
          const k = kpiOf(t.trainer);
          return [t.trainer, t.branch || '—',
            el('span', { class: 'num' }, String(t.sessions)), el('span', { class: 'num' }, String(t.persons)),
            el('span', { class: 'num' }, String(t.uniqueTrainees)), el('span', { class: 'num' }, String(t.hours)),
            t.tasksPct !== null && t.tasksPct !== undefined ? progressBar(t.tasksPct) : '—',
            k.kpi !== null && k.kpi !== undefined
              ? el('span', { class: 'tag ' + (k.kpi >= 80 ? 'tag--accent' : k.kpi >= 50 ? 'tag--warning' : 'tag--danger') }, k.kpi + '%')
              : '—'];
        }))));

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

    container.append(el('div', { class: 'alert alert--info' },
      'ملاحظة الاحتساب: إذا درّب المدرب شخصين في نفس الساعة تُحسب ساعة تدريب واحدة، بينما يُحسب عدد الأشخاص حسب العدد الفعلي — وتُخصم حصة من كل متدرب.'));
  }

  await render();
}

/* ============================================================
   الإعدادات والتحكم — كل شيء في تبويب واحد (الإدارة)
   ============================================================ */
async function viewSettings(root) {
  const container = el('div', { class: 'content' });
  root.append(container);
  const state = { roleFilter: '', search: '' };

  async function render() {
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
        el('div', { style: 'font-size:12px;color:var(--app-muted);max-width:420px' },
          'تسري العملة على كل المبالغ: الاشتراكات، الدفعات، اللوحات، والتقارير.'))));

    /* --- 2) الفروع --- */
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الفروع',
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openBranchModal(render) }, '+ فرع جديد')),
      dataTable(['الفرع', 'العنوان', 'الهاتف', 'المتدربون', 'المدربون', ''],
        branches.map((b) => [b.name, b.address || '—', b.phone || '—',
          String(users.filter((u) => u.role === 'trainee' && u.branchId === b.id).length),
          String(users.filter((u) => u.role === 'trainer' && u.branchId === b.id).length),
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
      usersWrap.append(pagedTable(['الاسم', 'اسم المستخدم', 'الدور', 'الفرع', 'الجوال', 'الحالة', ''],
        list,
        (u) => [u.name,
          el('code', { style: 'direction:ltr;font-family:var(--font-mono);font-size:12px' }, u.username),
          el('span', { class: 'tag ' + (u.role === 'admin' ? 'tag--petrol' : 'tag--neutral') }, ROLE_LABELS[u.role] || u.role),
          (branches.find((b) => b.id === u.branchId) || {}).name || '—',
          u.phone || '—',
          u.active ? el('span', { class: 'tag tag--accent' }, 'فعّال') : el('span', { class: 'tag tag--danger' }, 'معطّل'),
          el('div', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' },
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openUserEditModal(render, u, branches) }, 'تعديل'),
            el('button', { class: 'btn btn--outline btn--sm', onclick: () => openResetPasswordModal(u) }, 'كلمة المرور'),
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
  const close = modal(`تعديل «${branch.name}»`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/branches/' + branch.id, { name: nameIn.value, address: addrIn.value, phone: phoneIn.value });
          toast('تم حفظ الفرع.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    }, field('الاسم', nameIn), field('العنوان', addrIn), field('الهاتف', phoneIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ')),
  ]);
}

function openUserEditModal(onDone, user, branches) {
  const nameIn = input({ value: user.name });
  const phoneIn = input({ value: user.phone || '', dir: 'ltr', style: 'text-align:end' });
  const branchSel = select([['', 'بلا فرع'], ...branches.map((b) => [b.id, b.name])], { value: user.branchId || '' });
  const goalSel = user.role === 'trainee' ? select(Object.entries(GOAL_LABELS), { value: user.goal || 'loss' }) : null;
  const specIn = user.role === 'trainer' ? input({ value: user.specialty || '' }) : null;

  const close = modal(`تعديل «${user.name}»`, [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await API.put('/api/users/' + user.id, {
            name: nameIn.value, phone: phoneIn.value, branchId: branchSel.value ? Number(branchSel.value) : null,
            goal: goalSel ? goalSel.value : undefined,
            specialty: specIn ? specIn.value : undefined,
          });
          toast('تم حفظ التعديلات.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الاسم الكامل', nameIn),
      field('الجوال', phoneIn),
      field('الفرع', branchSel),
      goalSel ? field('الهدف', goalSel) : (specIn ? field('التخصص', specIn) : el('span')),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ التعديلات'))),
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
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'المتدربون'),
    pagedTable(['الاسم', 'الفرع', 'الهدف', 'الرصيد المتبقي', 'الحالة', ''],
      trainees,
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

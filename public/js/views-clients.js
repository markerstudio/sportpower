/* ============================================================
   الباقات والعقود وتقييم الحصص
   - الباقات: كتالوج الاشتراكات بأسعارها (لا يراها المدرب)
   - العقد الإلكتروني: رابط يفتحه الزبون، يرى كل الأسعار، يختار
     باقته ويعبّي بياناته قبل أن يشترك — ثم تحوّله الإدارة لمشترك
   - تقييم الحصة: المتدرب يقيّم ويكتب تعليقًا — خاص بالإدارة
   ============================================================ */

const CONTRACT_STATUS_LABELS = {
  open: 'رابط مفتوح', submitted: 'عبّأ بياناته — بانتظار الاعتماد',
  converted: 'تحوّل لمشترك ✓', cancelled: 'ملغى', expired: 'منتهي الصلاحية',
};

/* ============================================================
   صفحة الباقات والعقود (الإدارة / المحاسب)
   ============================================================ */
/* أنواع الباقات — يختارها الزبون في العقد قبل الباقة نفسها */
const PACKAGE_CATEGORIES = [
  ['personal', 'تدريب شخصي'],
  ['group', 'تدريب مجموعات'],
  ['saver', 'باقات التوفير'],
];
const categoryLabel = (c) => (PACKAGE_CATEGORIES.find(([k]) => k === c) || PACKAGE_CATEGORIES[0])[1];

async function viewPackages(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const [packages, contracts, branches, settings] = await Promise.all([
      API.get('/api/packages'),
      API.get('/api/contracts'),
      API.get('/api/branches').then(rememberBranches),
      API.get('/api/settings').catch(() => ({})),
    ]);
    OPS_SETTINGS.waCountryCode = settings.waCountryCode || OPS_SETTINGS.waCountryCode || '970';
    container.innerHTML = '';

    container.append(el('div', { class: 'card filters' },
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--accent', onclick: () => openContractModal(render, branches) }, '+ فتح عقد لزبون جديد'),
      el('button', { class: 'btn btn--outline', onclick: () => openPackageModal(render, branches) }, '+ باقة جديدة')));

    container.append(el('div', { class: 'alert alert--info' },
      'الباقات تظهر للزبون داخل العقد الإلكتروني بكل أسعارها قبل أن يشترك، وتظهر على ملف كل مشترك للتجديد أو الترقية. '
      + 'المدرب لا يرى الأسعار إطلاقًا.'));

    /* --- بطاقات الباقات مجمّعة بالنوع (كما تظهر في العقد) --- */
    const pkgCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `باقات الاشتراك (${packages.length})`));
    if (!packages.length) {
      pkgCard.append(el('div', { class: 'empty' }, 'لا باقات بعد — أضف أول باقة.'));
    } else {
      PACKAGE_CATEGORIES.forEach(([key, label]) => {
        const list = packages.filter((p) => (p.category || 'personal') === key);
        if (!list.length) return;
        const grid = el('div', { class: 'meals-grid' });
        list.forEach((p) => grid.append(packageCard(p, branches, render)));
        pkgCard.append(
          el('h4', { style: 'margin:14px 0 8px;font-family:var(--font-display);font-weight:800;color:var(--accent-hover)' },
            `${label} (${list.length})`),
          grid);
      });
    }
    container.append(pkgCard);

    /* --- العقود --- */
    const pending = contracts.filter((c) => c.status === 'submitted');
    if (pending.length) {
      container.append(el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, `🔔 عقود بانتظار الاعتماد (${pending.length})`),
        el('div', { class: 'ac-list' }, ...pending.map((c) => submittedContractCard(c, render)))));
    }

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `العقود الإلكترونية (${contracts.length})`),
      el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
        'أنشئ رابط عقد وأرسله للزبون على واتساب — يفتحه بلا حساب، يشاهد كل الباقات وأسعارها، يختار باقته ويعبّي بياناته.'),
      pagedTable(['التاريخ', 'الفرع', 'الزبون', 'الحالة', 'ينتهي', 'الرابط', ''],
        contracts,
        (c) => {
          const url = location.origin + '/#/contract/' + c.token;
          const expired = c.status === 'open' && c.expiresAt < todayISO();
          const label = expired ? CONTRACT_STATUS_LABELS.expired : CONTRACT_STATUS_LABELS[c.status];
          const tone = c.status === 'converted' ? 'tag--accent' : c.status === 'submitted' ? 'tag--warning'
            : expired || c.status === 'cancelled' ? 'tag--neutral' : 'tag--info';
          return [c.createdAt, c.branchName,
            c.submission ? c.submission.name : (c.prospectName || '—'),
            el('span', { class: 'tag ' + tone }, label),
            c.expiresAt || '—',
            el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' },
              el('button', {
                class: 'btn btn--outline btn--sm',
                onclick: () => navigator.clipboard.writeText(url).then(() => toast('نُسخ رابط العقد.')),
              }, 'نسخ'),
              c.prospectPhone ? el('a', {
                class: 'btn btn--petrol btn--sm', target: '_blank', rel: 'noopener',
                href: waLink(c.prospectPhone, OPS_SETTINGS.waCountryCode || '970',
                  `مرحبًا ${c.prospectName || ''} 👋 هذا رابط التسجيل في سبورت باور — تقدر تشوف كل الباقات وأسعارها وتختار المناسب لك وتعبّي بياناتك:\n${url}`,
                  c.prospectName),
              }, 'واتساب') : el('span'),
              el('a', { class: 'btn btn--ghost btn--sm', href: '#/contract/' + c.token, target: '_blank' }, 'معاينة')),
            el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
              c.status === 'submitted'
                ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => convertContract(c, render) }, 'تحويله لمشترك')
                : el('span'),
              c.status === 'open' ? el('button', {
                class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
                onclick: async () => {
                  if (!confirm('إلغاء رابط العقد؟ لن يعمل بعد الإلغاء.')) return;
                  try { await API.put('/api/contracts/' + c.id, { status: 'cancelled' }); toast('أُلغي الرابط.'); render(); }
                  catch (ex) { toast(ex.message, true); }
                },
              }, 'إلغاء') : el('span'))];
        },
        { pageSize: 10, emptyText: 'لا عقود بعد — افتح أول عقد لزبون جديد.', searchText: (c) => `${c.prospectName || ''} ${(c.submission || {}).name || ''} ${c.branchName}` })));
  }

  await render();
}

function packageCard(p, branches, onDone) {
  const features = (p.features || '').split('\n').filter(Boolean);
  return el('div', { class: 'card meal-card pkg-card' + (p.active === false ? ' pkg-card--off' : '') },
    el('div', { class: 'meal-card__head' },
      el('h4', {}, p.name),
      p.active === false ? el('span', { class: 'tag tag--neutral' }, 'موقوفة') : el('span', { class: 'tag tag--accent' }, 'متاحة')),
    el('div', { class: 'pkg-card__price' }, p.price !== undefined ? fmtMoney(p.price) : '—'),
    el('div', { class: 'macros' },
      el('span', { class: 'macro' }, el('b', {}, categoryLabel(p.category || 'personal'))),
      el('span', { class: 'macro' }, el('b', {}, String(p.sessions)), ' حصة'),
      el('span', { class: 'macro' }, 'المدة ', el('b', {}, (p.durationDays || 30) + ' يوم')),
      p.sessionsPerWeek ? el('span', { class: 'macro' }, el('b', {}, String(p.sessionsPerWeek)), ' أسبوعيًا') : '',
      el('span', { class: 'macro' }, p.branchId ? ((branches.find((b) => b.id === p.branchId) || {}).name || '—') : 'كل الفروع')),
    p.description ? el('p', { class: 'meal-card__desc' }, p.description) : '',
    features.length ? el('ul', { class: 'pkg-card__features' }, ...features.map((f) => el('li', {}, f))) : '',
    p.price !== undefined && p.sessions
      ? el('div', { style: 'font-size:12px;color:var(--app-muted)' }, `سعر الحصة: ${fmtMoney(Math.round(p.price / p.sessions))}`)
      : '',
    el('div', { style: 'display:flex;gap:6px;margin-top:auto;flex-wrap:wrap' },
      el('button', { class: 'btn btn--outline btn--sm', onclick: () => openPackageModal(onDone, branches, p) }, 'تعديل'),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: async () => {
          try { await API.put('/api/packages/' + p.id, { active: p.active === false }); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, p.active === false ? 'تفعيل' : 'إيقاف'),
      API.user.role === 'admin' ? el('button', {
        class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
        onclick: async () => {
          if (!confirm(`حذف باقة «${p.name}»؟`)) return;
          try { await API.del('/api/packages/' + p.id); toast('حُذفت الباقة.'); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, 'حذف') : el('span')));
}

function openPackageModal(onDone, branches, existing) {
  const nameIn = input({ value: existing ? existing.name : '', placeholder: 'مثال: الباقة الأساسية — 12 حصة' });
  const sessionsIn = input({ type: 'number', min: 1, value: existing ? existing.sessions : 12 });
  const priceIn = input({ type: 'number', min: 0, value: existing ? existing.price : 1200 });
  const durationIn = input({ type: 'number', min: 1, value: existing ? existing.durationDays || 30 : 30 });
  const perWeekIn = input({ type: 'number', min: 1, max: 7, value: existing ? existing.sessionsPerWeek || '' : 3 });
  const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], { value: existing ? existing.branchId || '' : '' });
  const categorySel = select(PACKAGE_CATEGORIES, { value: existing ? existing.category || 'personal' : 'personal' });
  const descIn = textarea({ value: existing ? existing.description : '', placeholder: 'وصف مختصر يظهر للزبون في العقد…' });
  const featuresIn = textarea({ value: existing ? existing.features : '', placeholder: 'ميزة في كل سطر:\nبرنامج تدريبي مخصص\nبرنامج غذائي\nقراءات InBody', style: 'min-height:110px' });

  const close = modal(existing ? `تعديل «${existing.name}»` : 'باقة اشتراك جديدة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const body = {
          name: nameIn.value, sessions: sessionsIn.value, price: priceIn.value,
          durationDays: durationIn.value, sessionsPerWeek: perWeekIn.value || null,
          branchId: branchSel.value || null, category: categorySel.value,
          description: descIn.value, features: featuresIn.value,
        };
        try {
          if (existing) await API.put('/api/packages/' + existing.id, body);
          else await API.post('/api/packages', body);
          toast('حُفظت الباقة — ستظهر في العقد وفي ملفات المشتركين.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('اسم الباقة *', nameIn)),
      field('عدد الحصص *', sessionsIn), field(`السعر (${curInfo().name}) *`, priceIn),
      field('مدة الصلاحية (يوم)', durationIn), field('حصص أسبوعيًا', perWeekIn),
      field('نوع الباقة (يظهر في العقد)', categorySel), field('الفرع', branchSel),
      el('div', { class: 'span-2' }, field('وصف الباقة', descIn)),
      el('div', { class: 'span-2' }, field('ما تشمله الباقة (ميزة بكل سطر)', featuresIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إضافة الباقة'))),
  ], { wide: true });
}

/* --- عقد جديد: إنشاء الرابط ومشاركته --- */
function openContractModal(onDone, branches) {
  const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])]);
  const nameIn = input({ placeholder: 'اسم الزبون (اختياري — يساعد بالمتابعة)' });
  const phoneIn = input({ placeholder: '05XXXXXXXX (لإرسال الرابط واتساب)', dir: 'ltr', style: 'text-align:end' });
  const daysIn = input({ type: 'number', min: 1, max: 180, value: 14 });
  const noteIn = input({ placeholder: 'ملاحظة داخلية (لا يراها الزبون)' });
  const body = el('div');
  const close = modal('فتح عقد لزبون جديد', [body], { wide: true });

  function showForm() {
    body.innerHTML = '';
    body.append(el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const c = await API.post('/api/contracts', {
            branchId: branchSel.value || null, prospectName: nameIn.value,
            prospectPhone: phoneIn.value, validDays: daysIn.value, note: noteIn.value,
          });
          showLink(c);
          onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, el('div', { class: 'alert alert--info' },
        'الرابط يفتحه الزبون بلا حساب — يشاهد كل الباقات بأسعارها وشروط الاشتراك، يختار باقته ويعبّي بياناته. '
        + 'ثم تظهر لك بياناته هنا لتحوّله لمشترك بضغطة.')),
      field('الفرع', branchSel), field('صلاحية الرابط (يوم)', daysIn),
      field('اسم الزبون', nameIn), field('جوال الزبون', phoneIn),
      el('div', { class: 'span-2' }, field('ملاحظة داخلية', noteIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--lg btn--full', type: 'submit' }, 'إنشاء رابط العقد'))));
  }

  function showLink(c) {
    const url = location.origin + '/#/contract/' + c.token;
    const msg = `مرحبًا ${c.prospectName || ''} 👋 هذا رابط التسجيل في سبورت باور — تقدر تشوف كل الباقات وأسعارها وتختار المناسب لك وتعبّي بياناتك:\n${url}`;
    body.innerHTML = '';
    body.append(
      el('div', { class: 'alert alert--info' }, '✅ جاهز — أرسل الرابط للزبون. صالح حتى ' + c.expiresAt + '.'),
      el('div', { class: 'card', style: 'box-shadow:none;border:1.5px dashed var(--app-line)' },
        el('div', { style: 'font-family:var(--font-mono);direction:ltr;text-align:left;font-size:13px;word-break:break-all' }, url)),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
        c.prospectPhone ? el('a', {
          class: 'btn btn--accent', target: '_blank', rel: 'noopener',
          href: waLink(c.prospectPhone, OPS_SETTINGS.waCountryCode || '970', msg, c.prospectName),
        }, 'إرسال واتساب') : '',
        el('button', { class: 'btn btn--outline', onclick: () => navigator.clipboard.writeText(url).then(() => toast('نُسخ الرابط.')) }, 'نسخ الرابط'),
        el('a', { class: 'btn btn--outline', href: '#/contract/' + c.token, target: '_blank' }, 'معاينة العقد'),
        el('button', { class: 'btn btn--ghost', onclick: close }, 'إغلاق')));
  }

  showForm();
}

/* --- بطاقة عقد عبّأه الزبون --- */
function submittedContractCard(c, onDone) {
  const s = c.submission || {};
  return el('div', { class: 'ac-card ac-card--important' },
    el('div', { class: 'ac-card__head' },
      el('div', { class: 'ac-card__title' }, `${s.name} — اختار «${s.packageName}»`),
      el('span', { class: 'tag tag--warning' }, 'بانتظار الاعتماد')),
    el('div', { class: 'macros' },
      el('span', { class: 'macro' }, 'الجوال ', el('b', { dir: 'ltr' }, s.phone || '—')),
      el('span', { class: 'macro' }, 'الفرع ', el('b', {}, c.branchName)),
      el('span', { class: 'macro' }, 'الحصص ', el('b', {}, String(s.sessions))),
      el('span', { class: 'macro' }, 'القيمة ', el('b', {}, fmtMoney(s.price))),
      el('span', { class: 'macro' }, 'الهدف ', el('b', {}, GOAL_LABELS[s.goal] || '—')),
      s.birthDate ? el('span', { class: 'macro' }, 'الميلاد ', el('b', {}, s.birthDate)) : ''),
    s.healthNotes ? el('div', { class: 'ac-card__reason' }, el('b', {}, 'ملاحظات صحية: '), s.healthNotes) : '',
    s.notes ? el('div', { class: 'ac-card__reason' }, el('b', {}, 'ملاحظات الزبون: '), s.notes) : '',
    el('div', { style: 'font-size:12px;color:var(--app-muted)' }, `وافق على الشروط بتاريخ ${(s.agreedAt || '').slice(0, 10)}`),
    el('div', { class: 'ac-card__actions' },
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => convertContract(c, onDone) }, 'تحويله لمشترك'),
      s.phone ? el('a', {
        class: 'btn btn--petrol btn--sm', target: '_blank', rel: 'noopener',
        href: waLink(s.phone, OPS_SETTINGS.waCountryCode || '970', `مرحبًا ${s.name} 👋 وصلنا طلبك في سبورت باور على «${s.packageName}» — منرحب فيك، خلينا ننسّق أول حصة!`, s.name),
      }, '💬 واتساب') : '',
      s.phone ? el('a', { class: 'btn btn--outline btn--sm', href: 'tel:' + s.phone }, '📞 اتصال') : ''));
}

/* تحويل عقد إلى مشترك — يفتح Onboarding معبّأً ببيانات الزبون وباقته */
function convertContract(c, onDone) {
  const s = c.submission || {};
  const end = new Date();
  end.setDate(end.getDate() + (s.durationDays || 30));
  openOnboardModal(onDone, {
    name: s.name, phone: s.phone, branchId: c.branchId, goal: s.goal,
    birthDate: s.birthDate, packageId: s.packageId, contractId: c.id,
    totalSessions: s.sessions, price: s.price, endDate: end.toISOString().slice(0, 10),
  });
}

/* ============================================================
   بطاقة الباقات على ملف المشترك
   ============================================================ */
function traineePackagesCard(data, traineeId, onDone) {
  const sub = data.subscription;
  const canRenew = ['admin', 'accountant'].includes(API.user.role);
  const showPrices = data.showPrices !== false;

  const currentBox = sub
    ? el('div', { class: 'pkg-current' },
      el('div', { style: 'font-family:var(--font-display);font-weight:900;color:var(--app-ink);font-size:1.05rem' },
        sub.packageName || `اشتراك ${sub.totalSessions} حصة`),
      el('div', { class: 'macros', style: 'margin-top:8px' },
        el('span', { class: 'macro' }, 'الحصص ', el('b', {}, String(sub.totalSessions))),
        el('span', { class: 'macro' }, 'المستخدمة ', el('b', {}, String(sub.usedSessions))),
        el('span', { class: 'macro' }, 'المتبقية ', el('b', {}, String(sub.remaining))),
        showPrices && sub.price !== undefined ? el('span', { class: 'macro' }, 'القيمة ', el('b', {}, fmtMoney(sub.price))) : '',
        el('span', { class: 'macro' }, 'من ', el('b', {}, sub.startDate)),
        el('span', { class: 'macro' }, 'إلى ', el('b', {}, sub.endDate)),
        statusTag(sub.status, sub.expiring)))
    : el('div', { class: 'alert alert--warning' }, 'لا اشتراك فعّال حاليًا — اختر باقة للتجديد.');

  const grid = el('div', { class: 'meals-grid' });
  (data.packages || []).forEach((p) => {
    const isCurrent = sub && sub.packageId === p.id;
    grid.append(el('div', { class: 'card meal-card pkg-card' + (isCurrent ? ' pkg-card--current' : '') },
      el('div', { class: 'meal-card__head' },
        el('h4', {}, p.name),
        isCurrent ? el('span', { class: 'tag tag--accent' }, 'باقته الحالية') : ''),
      showPrices && p.price !== undefined ? el('div', { class: 'pkg-card__price' }, fmtMoney(p.price)) : '',
      el('div', { class: 'macros' },
        el('span', { class: 'macro' }, el('b', {}, String(p.sessions)), ' حصة'),
        el('span', { class: 'macro' }, 'المدة ', el('b', {}, (p.durationDays || 30) + ' يوم')),
        p.sessionsPerWeek ? el('span', { class: 'macro' }, el('b', {}, String(p.sessionsPerWeek)), ' أسبوعيًا') : ''),
      p.description ? el('p', { class: 'meal-card__desc' }, p.description) : '',
      (p.features || '') ? el('ul', { class: 'pkg-card__features' }, ...(p.features || '').split('\n').filter(Boolean).map((f) => el('li', {}, f))) : '',
      canRenew
        ? el('button', {
          class: 'btn btn--accent btn--sm', style: 'margin-top:auto',
          onclick: async () => openSubModal(onDone, await API.get('/api/users?role=trainee'), traineeId, p),
        }, 'تفعيل هذه الباقة')
        : el('span')));
  });

  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'الاشتراك والباقات',
      !showPrices ? el('span', { style: 'font-size:12px;color:var(--app-muted);font-weight:400' }, 'الأسعار متاحة للإدارة والمحاسب فقط') : ''),
    currentBox,
    (data.packages || []).length
      ? el('div', {},
        el('div', { class: 'sidebar__caption', style: 'padding:14px 0 8px' }, 'الباقات المتاحة للتجديد أو الترقية'),
        grid)
      : '');
}

/* ============================================================
   تقييم الحصة — المتدرب (خاص بالإدارة)
   ============================================================ */
function openRateSessionModal(session, existing, onDone) {
  let value = existing ? existing.rating : 0;
  const starsRow = el('div', { class: 'stars-input' });
  const commentIn = textarea({
    value: existing ? existing.comment : '',
    placeholder: 'اكتب رأيك بحرّية: المدرب، التمارين، وقت الحصة، النظافة، أي ملاحظة…',
    style: 'min-height:110px',
  });

  function drawStars() {
    starsRow.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      starsRow.append(el('button', {
        type: 'button', class: 'star' + (i <= value ? ' star--on' : ''),
        title: `${i} من 5`,
        onclick: () => { value = i; drawStars(); },
      }, '★'));
    }
    starsRow.append(el('span', { style: 'font-size:13px;color:var(--app-muted);margin-inline-start:8px' },
      value ? `${value} من 5` : 'اختر تقييمك'));
  }
  drawStars();

  const close = modal(`تقييم حصة ${session.date}`, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!value) { toast('اختر عدد النجوم أولًا.', true); return; }
        try {
          await API.post(`/api/sessions/${session.id}/rating`, { rating: value, comment: commentIn.value });
          toast('شكرًا لتقييمك — وصل للإدارة مباشرة 🙏');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'alert alert--info' },
        '🔒 تقييمك وتعليقك يصلان للإدارة فقط — لا يظهران للمدرب إطلاقًا.'),
      el('div', { style: 'font-size:13px;color:var(--app-muted)' },
        `الحصة: ${session.date} الساعة ${session.time}${session.style ? ' — ' + session.style : ''}`),
      field('كيف كانت الحصة؟', starsRow),
      field('تعليقك (اختياري)', commentIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'تحديث التقييم' : 'إرسال التقييم للإدارة')),
  ]);
}

/* بطاقة «قيّم حصصك» على صفحة المتدرب */
function traineeRatingsCard(data, onDone) {
  const rated = {};
  (data.ratings || []).forEach((r) => { rated[r.sessionId] = r; });
  const recent = data.sessions.slice(0, 8);
  if (!recent.length) return el('span');

  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'قيّم حصصك ⭐',
      el('span', { style: 'font-size:12px;color:var(--app-muted);font-weight:400' }, 'خاص بالإدارة — لا يظهر للمدرب')),
    dataTable(['التاريخ', 'الساعة', 'الأسلوب', 'تقييمك', ''],
      recent.map((sn) => {
        const r = rated[sn.id];
        return [sn.date, sn.time, sn.style || '—',
          r ? el('span', { class: 'stars-view' }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)) : el('span', { class: 'tag tag--neutral' }, 'بلا تقييم'),
          el('button', {
            class: 'btn ' + (r ? 'btn--ghost' : 'btn--accent') + ' btn--sm',
            onclick: () => openRateSessionModal(sn, r, onDone),
          }, r ? 'تعديل التقييم' : 'قيّم الحصة')];
      }),
      'لا حصص بعد.'));
}

/* ============================================================
   لوحة تقييمات المتدربين — الإدارة فقط
   ============================================================ */
/* ============================================================
   نتائج المتدرب ومشاكله — رصد داخلي على ملف المشترك
   سرّي تمامًا: لا يظهر للمتدرب (الخادم يرسل flags = null لحسابه).
   ============================================================ */
function traineeFlagsCard(data, traineeId, onDone) {
  const flags = data.flags || [];
  const results = flags.filter((f) => f.kind === 'result');
  const problems = flags.filter((f) => f.kind === 'problem');
  const openProblems = problems.filter((f) => f.status !== 'closed');

  const row = (f) => [
    flagTag(f),
    el('div', {}, el('b', {}, f.title), f.note ? el('div', { style: 'font-size:12px;color:var(--app-muted)' }, f.note) : ''),
    f.date,
    f.status === 'closed' ? el('span', { class: 'tag tag--neutral' }, 'مغلق ' + (f.closedAt || '')) : el('span', { class: 'tag tag--warning' }, 'مفتوح'),
    el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
      f.status === 'closed'
        ? el('button', {
          class: 'btn btn--ghost btn--sm',
          onclick: async () => {
            try { await API.put('/api/trainee-flags/' + f.id, { status: 'open' }); toast('أُعيد فتح الرصد.'); onDone && onDone(); }
            catch (ex) { toast(ex.message, true); }
          },
        }, 'إعادة فتح')
        : el('button', {
          class: 'btn btn--outline btn--sm',
          onclick: async () => {
            try { await API.put('/api/trainee-flags/' + f.id, { status: 'closed' }); toast('أُغلق الرصد.'); onDone && onDone(); }
            catch (ex) { toast(ex.message, true); }
          },
        }, 'إغلاق'),
      API.user.role === 'admin' ? el('button', {
        class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
        onclick: async () => {
          if (!confirm(`حذف الرصد «${f.title}»؟`)) return;
          try { await API.del('/api/trainee-flags/' + f.id); toast('حُذف الرصد.'); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, 'حذف') : el('span')),
  ];

  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'النتائج والمشاكل 🔒',
      el('div', { style: 'display:flex;gap:8px' },
        el('button', { class: 'btn btn--accent btn--sm', onclick: () => openFlagModal(onDone, traineeId, 'result') }, '＋ رصد نتيجة'),
        el('button', { class: 'btn btn--outline btn--sm', onclick: () => openFlagModal(onDone, traineeId, 'problem') }, '＋ رصد مشكلة'))),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:10px' },
      'رصد داخلي للإدارة والمدرب — لا يظهر للمتدرب إطلاقًا، ويُجمَّع في صفحة القراءات والتقرير الشهري.'),
    el('div', { class: 'macros', style: 'margin-bottom:10px' },
      el('span', { class: 'macro' }, 'نتائج ', el('b', {}, String(results.length))),
      el('span', { class: 'macro' }, 'مشاكل مفتوحة ', el('b', {}, String(openProblems.length))),
      el('span', { class: 'macro' }, 'مشاكل مغلقة ', el('b', {}, String(problems.length - openProblems.length)))),
    dataTable(['النوع', 'الرصد', 'التاريخ', 'الحالة', ''], flags.map(row),
      'لا رصد بعد — سجّل نتيجة وصل إليها المتدرب أو مشكلة تحتاج معالجة.'));
}

function openFlagModal(onDone, traineeId, kind, extra = {}) {
  const isProblem = kind === 'problem';
  const titleIn = input({ placeholder: isProblem ? 'مثال: ألم في الركبة / انقطاع متكرر' : 'مثال: نزل 4 كغ خلال شهر' });
  const noteIn = textarea({ placeholder: 'تفصيل يفيد من يقرأ الرصد لاحقًا…' });
  const dateIn = input({ type: 'date', value: extra.date || todayISO() });
  const sevSel = select([['medium', 'متوسطة'], ['high', 'حرجة'], ['low', 'بسيطة']]);

  const close = modal(isProblem ? 'رصد مشكلة عند المتدرب' : 'رصد نتيجة للمتدرب', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!titleIn.value.trim()) { toast('اكتب عنوان الرصد.', true); return; }
        try {
          await API.post('/api/trainee-flags', {
            traineeId, kind, title: titleIn.value, note: noteIn.value,
            date: dateIn.value, severity: isProblem ? sevSel.value : null,
            inbodyId: extra.inbodyId || null,
          });
          toast(isProblem ? 'سُجّلت المشكلة — ووصل تنبيه للإدارة.' : 'سُجّلت النتيجة في ملف المتدرب.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, el('div', { class: 'alert alert--info' }, 'هذا الرصد سرّي — لا يظهر للمتدرب في صفحته ولا في إشعاراته.')),
      el('div', { class: 'span-2' }, field(isProblem ? 'المشكلة' : 'النتيجة', titleIn)),
      field('التاريخ', dateIn),
      isProblem ? field('درجة الخطورة', sevSel) : el('span'),
      el('div', { class: 'span-2' }, field('تفاصيل', noteIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ الرصد'))),
  ]);
}

async function viewRatings(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const data = await API.get('/api/session-ratings');
    container.innerHTML = '';

    container.append(el('div', { class: 'alert alert--info' },
      '🔒 هذه الصفحة سرّية: تقييمات المتدربين وتعليقاتهم تصل للإدارة فقط ولا يراها المدربون — استخدمها لقياس جودة الحصص وتحسين الخدمة.'));

    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(data.average !== null ? data.average + ' / 5' : '—', 'متوسط تقييم الحصص', 'star', 'green'),
      kpiHero(data.count, 'عدد التقييمات', 'file'),
      kpiHero(data.lowCount, 'تقييمات منخفضة (≤2)', 'alert', 'blue')));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'متوسط التقييم لكل مدرب (الأدنى أولًا)'),
      dataTable(['المدرب', 'عدد التقييمات', 'المتوسط', 'تقييمات منخفضة'],
        data.trainers.map((t) => [t.name, String(t.count),
          el('span', { class: 'tag ' + (t.average >= 4 ? 'tag--accent' : t.average >= 3 ? 'tag--warning' : 'tag--danger') }, t.average + ' / 5'),
          el('b', { class: 'num', style: t.low ? 'color:var(--status-danger)' : '' }, String(t.low))]),
        'لا تقييمات بعد.')));

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `كل التقييمات والتعليقات (${data.ratings.length})`),
      pagedTable(['التاريخ', 'المتدرب', 'المدرب', 'الحصة', 'التقييم', 'التعليق', ''],
        data.ratings,
        (r) => [r.date,
          el('a', { href: '#/trainee/' + r.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, r.traineeName),
          r.trainerName, r.sessionDate || '—',
          el('span', { class: 'stars-view' + (r.rating <= 2 ? ' stars-view--low' : '') }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)),
          r.comment || '—',
          r.seen
            ? el('span', { class: 'tag tag--neutral' }, 'مقروء')
            : el('button', {
              class: 'btn btn--outline btn--sm',
              onclick: async () => {
                try { await API.put('/api/session-ratings/' + r.id, { seen: true }); render(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'تعليم كمقروء')],
        { pageSize: 12, emptyText: 'لا تقييمات بعد — تظهر هنا فور تقييم المتدربين لحصصهم.',
          searchText: (r) => `${r.traineeName} ${r.trainerName} ${r.comment || ''}` })));
  }

  await render();
}

/* ============================================================
   صفحة العقد العامة — يفتحها الزبون بلا تسجيل دخول
   ============================================================ */
async function viewPublicContract(root, token) {
  root.innerHTML = '';
  const page = el('div', { class: 'public-page' });
  root.append(page);
  const body = el('div', { class: 'public-card' }, spinnerCard('جارٍ تحميل العقد…'));
  page.append(
    el('div', { class: 'public-head' },
      el('img', { class: 'public-head__logo', src: '/assets/logo-white.svg', alt: 'سبورت باور' }),
      el('h1', {}, 'طلب اشتراك'),
      el('p', {}, 'change your life')),
    body);

  let data;
  try {
    data = await fetch('/api/public/contract/' + encodeURIComponent(token)).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'تعذّر فتح العقد.');
      return j;
    });
  } catch (ex) {
    body.innerHTML = '';
    body.append(el('div', { class: 'alert alert--warning' }, ex.message));
    return;
  }

  if (data.currency) ACTIVE_CURRENCY = data.currency;

  if (data.status !== 'open') {
    body.innerHTML = '';
    const msg = data.status === 'submitted' || data.status === 'converted'
      ? '✅ تم استلام طلبك مسبقًا — سيتواصل معك فريق سبورت باور لتأكيد اشتراكك وتنسيق أول حصة.'
      : data.status === 'expired'
        ? '⏳ انتهت صلاحية هذا الرابط — تواصل مع الاستقبال ليصلك رابط جديد.'
        : 'هذا الرابط لم يعد متاحًا — تواصل مع الاستقبال.';
    body.append(el('div', { class: 'alert alert--info' }, msg));
    if (data.submission) {
      body.append(el('div', { class: 'macros', style: 'margin-top:14px' },
        el('span', { class: 'macro' }, 'الاسم ', el('b', {}, data.submission.name)),
        el('span', { class: 'macro' }, 'الباقة ', el('b', {}, data.submission.packageName)),
        el('span', { class: 'macro' }, 'القيمة ', el('b', {}, fmtMoney(data.submission.price)))));
    }
    return;
  }

  /* --- النموذج --- */
  let selectedId = null;
  /* الزبون يختار نوع التدريب أولًا (شخصي/مجموعات/توفير) ثم الباقة داخله */
  const cats = (data.categories && data.categories.length)
    ? data.categories
    : [{ key: 'personal', label: 'تدريب شخصي', count: data.packages.length }];
  let activeCat = cats[0].key;
  const catBar = el('div', { class: 'public-cats' });
  const pkgGrid = el('div', { class: 'public-packages' });
  const nameIn = input({ value: data.prospectName || '', placeholder: 'الاسم الكامل *' });
  const phoneIn = input({ value: data.prospectPhone || '', placeholder: '05XXXXXXXX *', dir: 'ltr', style: 'text-align:end' });
  const birthIn = input({ type: 'date' });
  const goalSel = select(Object.entries(GOAL_LABELS));
  const addressIn = input({ placeholder: 'مكان السكن' });
  const emergencyIn = input({ placeholder: 'رقم للطوارئ', dir: 'ltr', style: 'text-align:end' });
  const healthIn = textarea({ placeholder: 'إصابات أو أمراض أو أدوية يجب أن يعرفها المدرب…' });
  const notesIn = input({ placeholder: 'الأوقات المناسبة لك مثلًا' });
  const agreeIn = el('input', { type: 'checkbox', style: 'width:18px;height:18px;accent-color:var(--green-500)' });
  const summaryBox = el('div', { class: 'public-summary' }, 'اختر باقتك من الأعلى لتظهر التفاصيل هنا.');

  function drawCats() {
    catBar.innerHTML = '';
    cats.forEach((c) => {
      catBar.append(el('button', {
        type: 'button', class: 'public-cat' + (activeCat === c.key ? ' public-cat--on' : ''),
        onclick: () => { activeCat = c.key; drawCats(); drawPackages(); },
      }, c.label, el('small', {}, ` ${c.count} باقات`)));
    });
  }

  function drawPackages() {
    pkgGrid.innerHTML = '';
    data.packages.filter((p) => (p.category || 'personal') === activeCat).forEach((p) => {
      const selected = selectedId === p.id;
      pkgGrid.append(el('button', {
        type: 'button', class: 'public-pkg' + (selected ? ' public-pkg--on' : ''),
        onclick: () => { selectedId = p.id; drawPackages(); drawSummary(); },
      },
        el('div', { class: 'public-pkg__name' }, p.name),
        el('div', { class: 'public-pkg__price' }, fmtMoney(p.price)),
        el('div', { class: 'public-pkg__meta' },
          `${p.sessions} حصة · ${p.durationDays || 30} يوم` + (p.sessionsPerWeek ? ` · ${p.sessionsPerWeek} أسبوعيًا` : '')),
        el('div', { class: 'public-pkg__meta' }, `سعر الحصة ${fmtMoney(Math.round(p.price / p.sessions))}`),
        p.description ? el('div', { class: 'public-pkg__desc' }, p.description) : '',
        (p.features || '')
          ? el('ul', { class: 'pkg-card__features' }, ...(p.features || '').split('\n').filter(Boolean).map((f) => el('li', {}, f)))
          : '',
        selected ? el('span', { class: 'tag tag--accent' }, 'الباقة المختارة ✓') : el('span', { class: 'tag tag--neutral' }, 'اختر هذه الباقة')));
    });
  }

  function drawSummary() {
    const p = data.packages.find((x) => x.id === selectedId);
    summaryBox.innerHTML = '';
    if (!p) { summaryBox.append('اختر باقتك من الأعلى لتظهر التفاصيل هنا.'); return; }
    summaryBox.append(
      el('b', {}, 'ملخص اشتراكك: '),
      `${p.name} — ${p.sessions} حصة خلال ${p.durationDays || 30} يومًا، القيمة الإجمالية `,
      el('b', {}, fmtMoney(p.price)),
      ` (سعر الحصة ${fmtMoney(Math.round(p.price / p.sessions))}).`,
      el('div', { style: 'margin-top:6px' },
        el('span', { class: 'tag tag--accent' }, 'نوع التدريب: ' + categoryLabel(p.category || 'personal'))));
  }
  drawCats();
  drawPackages();

  const section = (n, title, hint) => el('div', { class: 'public-section' },
    el('span', { class: 'public-section__num' }, n),
    el('div', {}, el('b', {}, title), hint ? el('div', { style: 'font-size:12px;color:var(--app-muted)' }, hint) : ''));

  body.innerHTML = '';
  body.append(
    data.branchName ? el('div', { class: 'alert alert--info' }, `فرع الاشتراك: ${data.branchName}`) : '',
    section('١', 'اختر نوع التدريب ثم باقتك', 'تدريب شخصي أو مجموعات أو باقات التوفير — كل الأسعار أمامك.'),
    catBar,
    pkgGrid,
    summaryBox,
    section('٢', 'بياناتك'),
    el('div', { class: 'form-grid' },
      field('الاسم الكامل *', nameIn), field('رقم الجوال *', phoneIn),
      field('تاريخ الميلاد', birthIn), field('هدفك من التدريب', goalSel),
      field('مكان السكن', addressIn), field('رقم للطوارئ', emergencyIn),
      el('div', { class: 'span-2' }, field('ملاحظات صحية (إصابات/أمراض/أدوية)', healthIn)),
      el('div', { class: 'span-2' }, field('ملاحظات إضافية', notesIn))),
    section('٣', 'شروط الاشتراك'),
    el('ul', { class: 'public-terms' }, ...(data.terms || '').split('\n').filter(Boolean).map((t) => el('li', {}, t))),
    el('label', { class: 'public-agree' }, agreeIn,
      el('span', {}, 'قرأت شروط الاشتراك وأوافق عليها، والبيانات التي أدخلتها صحيحة.')),
    el('button', {
      class: 'btn btn--accent btn--lg btn--full',
      onclick: async (e) => {
        if (!selectedId) { toast('اختر باقتك أولًا.', true); return; }
        if (!nameIn.value.trim()) { toast('الاسم الكامل مطلوب.', true); return; }
        if (!agreeIn.checked) { toast('يرجى الموافقة على شروط الاشتراك.', true); return; }
        e.target.disabled = true;
        try {
          const res = await fetch('/api/public/contract/' + encodeURIComponent(token), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: nameIn.value, phone: phoneIn.value, birthDate: birthIn.value || null,
              goal: goalSel.value, address: addressIn.value, packageId: selectedId,
              healthNotes: healthIn.value, emergencyPhone: emergencyIn.value,
              notes: notesIn.value, agreed: true,
            }),
          }).then(async (r) => {
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'تعذّر إرسال الطلب.');
            return j;
          });
          body.innerHTML = '';
          body.append(
            el('div', { class: 'alert alert--info' },
              `✅ تم إرسال طلبك بنجاح — اخترت «${res.packageName}»${res.categoryLabel ? ` (${res.categoryLabel})` : ''} — ${res.sessions} حصة بقيمة ${fmtMoney(res.price)}.`),
            el('div', { style: 'text-align:center;padding:24px 8px' },
              el('div', { style: 'font-family:var(--font-display);font-weight:900;font-size:1.3rem;color:var(--app-ink)' }, 'أهلًا بك في سبورت باور 💪'),
              el('div', { style: 'font-family:var(--font-display);font-weight:800;color:var(--accent-hover);letter-spacing:.06em;margin-top:4px' }, 'change your life'),
              el('p', { style: 'color:var(--app-muted);font-size:14px;margin-top:8px' },
                'سيتواصل معك فريقنا لتأكيد الاشتراك واستلام الدفعة وتنسيق أول حصة. نراك قريبًا!')));
          window.scrollTo(0, 0);
        } catch (ex) { toast(ex.message, true); e.target.disabled = false; }
      },
    }, 'إرسال طلب الاشتراك'),
    el('div', { style: 'text-align:center;font-size:12px;color:var(--app-muted);margin-top:10px' },
      'بياناتك تُستخدم لإنشاء ملفك التدريبي داخل النظام فقط.'));
}

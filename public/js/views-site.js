/* ============================================================
   الموقع العام — الدورات المسوَّقة عليه، وبيانات التواصل المعروضة فيه
   - الدورات: تُدار هنا كما تُدار الباقات، وتظهر على الموقع فور نشرها.
   - طلبات الموقع تصل إلى «متابعة المبيعات» بقناة «الموقع الإلكتروني».
   ============================================================ */

const SITE_BASE = 'https://www.sport-power.net';
const COURSE_FORMATS = [['hybrid', 'حضوري + أونلاين'], ['online', 'أونلاين'], ['in-person', 'حضوري']];
const TIER_SLOTS = [['silver', 'Silver'], ['gold', 'Gold'], ['premium', 'Premium']];

const courseFormatLabel = (f) => (COURSE_FORMATS.find(([k]) => k === f) || COURSE_FORMATS[0])[1];

async function viewCourses(root) {
  const container = el('div', { class: 'content' });
  root.append(container);
  const render = (...a) => keepScroll(() => build(...a));
  const isAdmin = API.user.role === 'admin';

  async function build() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const courses = await API.get('/api/courses');
    container.innerHTML = '';

    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `الدورات على الموقع (${courses.length})`,
        isAdmin ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => openCourseModal(render) }, '+ دورة جديدة') : el('span')),
      el('p', { style: 'font-size:13px;color:var(--app-muted);margin:0' },
        'ما يُنشر هنا يظهر فورًا في قسم «الدورات» على الموقع العام، ومن يسجّل اهتمامه بدورة يصل إلى متابعة المبيعات بقناة «الموقع الإلكتروني». ',
        'صفحة كل دورة على الموقع: ', el('code', { style: 'direction:ltr;unicode-bidi:embed;font-family:var(--font-mono);font-size:12px' }, SITE_BASE + '/courses/<slug>'))));

    if (!courses.length) {
      container.append(el('div', { class: 'card' }, el('p', { style: 'margin:0;color:var(--app-muted)' }, 'لا دورات بعد — أضف أول دورة لتظهر على الموقع.')));
      return;
    }
    container.append(el('div', { class: 'meals-grid' }, ...courses.map((c) => courseCard(c, render, isAdmin))));
  }

  await render();
}

function courseCard(c, onDone, isAdmin) {
  const tiers = Array.isArray(c.tiers) ? c.tiers : [];
  const modules = Array.isArray(c.modules) ? c.modules : [];
  const url = `${SITE_BASE}/courses/${c.slug}`;
  return el('div', { class: 'card meal-card pkg-card' + (c.published ? '' : ' pkg-card--off') },
    el('div', { class: 'meal-card__head' },
      el('h4', {}, c.title),
      c.published ? el('span', { class: 'tag tag--accent' }, 'منشورة') : el('span', { class: 'tag tag--neutral' }, 'مسودّة')),
    c.tagline ? el('div', { style: 'font-size:13px;color:var(--app-muted)' }, c.tagline) : '',
    el('div', { class: 'macros' },
      el('span', { class: 'macro' }, el('b', {}, courseFormatLabel(c.format))),
      c.lessons ? el('span', { class: 'macro' }, el('b', {}, String(c.lessons)), ' دروس') : '',
      el('span', { class: 'macro' }, el('b', {}, String(modules.length)), ' محاور'),
      c.startDate ? el('span', { class: 'macro' }, 'تبدأ ', el('b', {}, c.startDate)) : ''),
    tiers.length
      ? el('ul', { class: 'pkg-card__features' }, ...tiers.map((t) => el('li', {},
        el('b', {}, t.name), ' — ', fmtMoney(t.price, c.currency || 'ILS'), t.highlight ? ' ★' : '')))
      : el('div', { style: 'font-size:12px;color:var(--status-warning)' }, 'بلا باقات بعد — أضف باقة واحدة على الأقل قبل النشر.'),
    el('a', { href: url, target: '_blank', rel: 'noopener', style: 'font-size:12px;color:var(--action);direction:ltr;unicode-bidi:embed;text-align:end' }, url),
    applicantsLine(c),
    el('div', { style: 'display:flex;gap:6px;margin-top:auto;flex-wrap:wrap' },
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => openApplicantsModal(c, onDone) },
        `المسجّلون (${(c.applicants || {}).total || 0})`),
      isAdmin ? el('button', { class: 'btn btn--outline btn--sm', onclick: () => openCourseModal(onDone, c) }, 'تعديل') : el('span'),
      isAdmin ? el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: async () => {
          try { await API.put('/api/courses/' + c.id, { published: !c.published }); toast(c.published ? 'أُخفيت الدورة عن الموقع.' : 'نُشرت الدورة على الموقع.'); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, c.published ? 'إخفاء عن الموقع' : 'نشر على الموقع') : el('span'),
      isAdmin ? el('button', {
        class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
        onclick: async () => {
          if (!confirm(`حذف دورة «${c.title}»؟ طلبات الاهتمام السابقة تبقى في متابعة المبيعات.`)) return;
          try { await API.del('/api/courses/' + c.id); toast('حُذفت الدورة.'); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, 'حذف') : el('span')));
}

/* ============================================================
   المسجّلون في الدورة — من سجّل اهتمامه من الموقع (أو أضافته الإدارة)
   السجل نفسه هو سجل متابعة المبيعات: تعديل المرحلة هنا يظهر هناك والعكس.
   ============================================================ */
function applicantsLine(c) {
  const a = c.applicants || { total: 0, open: 0, subscribed: 0, byTier: {} };
  if (!a.total) return el('div', { style: 'font-size:12px;color:var(--app-muted)' }, 'لم يسجّل أحد بعد.');
  const tiers = (Array.isArray(c.tiers) ? c.tiers : []).map((t) => `${t.name}: ${a.byTier[t.key] || 0}`);
  if (a.byTier.none) tiers.push(`بلا باقة: ${a.byTier.none}`);
  return el('div', { class: 'macros' },
    el('span', { class: 'macro' }, el('b', {}, String(a.total)), ' مسجّل'),
    el('span', { class: 'macro' }, el('b', {}, String(a.open)), ' قيد المتابعة'),
    a.subscribed ? el('span', { class: 'macro' }, el('b', {}, String(a.subscribed)), ' اشتركوا') : '',
    ...tiers.map((t) => el('span', { class: 'macro', style: 'font-weight:400' }, t)));
}

async function openApplicantsModal(course, onDone) {
  const wrap = el('div');
  const close = modal(`المسجّلون في «${course.title}»`, [wrap], { wide: true });
  /* الجدول بسبعة أعمدة — النافذة العريضة الافتراضية (760px) تقصّه */
  const box = document.querySelector('#modal-root .modal');
  if (box) box.style.width = 'min(1120px, 96vw)';
  const canEdit = ['admin', 'accountant'].includes(API.user.role);
  let changed = false;
  const origClose = close;
  const closeAll = () => { origClose(); if (changed && onDone) onDone(); };

  async function build() {
    wrap.innerHTML = '';
    wrap.append(spinnerCard());
    let data;
    try { data = await API.get(`/api/courses/${course.id}/applicants`); }
    catch (ex) { wrap.innerHTML = ''; wrap.append(el('div', { class: 'empty' }, ex.message)); return; }
    wrap.innerHTML = '';
    const s = data.summary;
    wrap.append(el('div', { class: 'macros', style: 'margin-bottom:12px' },
      el('span', { class: 'macro' }, el('b', {}, String(s.total)), ' مسجّل'),
      el('span', { class: 'macro' }, el('b', {}, String(s.open)), ' قيد المتابعة'),
      el('span', { class: 'macro' }, el('b', {}, String(s.subscribed)), ' اشتركوا'),
      ...data.course.tiers.map((t) => el('span', { class: 'macro', style: 'font-weight:400' }, `${t.name}: ${s.byTier[t.key] || 0}`)),
      el('span', { style: 'flex:1' }),
      el('a', { href: '#/sales', class: 'btn btn--ghost btn--sm', onclick: closeAll }, 'فتح متابعة المبيعات')));
    if (!data.applicants.length) {
      wrap.append(el('div', { class: 'empty' }, 'لم يسجّل أحد في هذه الدورة بعد. كل من يعبّئ نموذج الدورة على الموقع يظهر هنا فورًا.'));
      return;
    }
    const waMsg = `مرحبًا {الاسم}، شكرًا لتسجيل اهتمامك بدورة «${course.title}» في سبورت باور. متى الوقت المناسب لمكالمة فيديو قصيرة مع الكوتش؟`;
    wrap.append(pagedTable(['الاسم', 'الجوال', 'الباقة', 'الفرع / السكن', 'التاريخ', 'المرحلة', 'ملاحظات'], data.applicants, (l) => [
      el('div', {}, el('b', {}, l.name), l.email ? el('div', { style: 'font-size:11px;color:var(--app-muted);direction:ltr;unicode-bidi:embed;text-align:end' }, l.email) : ''),
      l.phone ? el('div', { style: 'display:flex;gap:6px;align-items:center' },
        el('span', { style: 'direction:ltr;unicode-bidi:embed;white-space:nowrap' }, l.phone),
        el('a', { class: 'btn btn--ghost btn--sm', target: '_blank', rel: 'noopener', title: 'واتساب',
          href: waLink(l.phone, OPS_SETTINGS.waCountryCode || '970', waMsg, l.name) }, icon('wa'))) : '—',
      l.tierName ? el('span', { class: 'tag tag--accent' }, l.tierName) : el('span', { class: 'tag tag--neutral' }, 'لم يقرر'),
      [l.branchName, l.residence].filter(Boolean).join(' — ') || '—',
      l.contactDate || '—',
      canEdit ? select(Object.entries(LEAD_STAGE_LABELS), {
        value: l.stage, style: 'min-width:150px',
        onchange: async (e) => {
          try { await API.put('/api/leads/' + l.id, { stage: e.target.value }); changed = true; toast('حُدّثت المرحلة.'); }
          catch (ex) { toast(ex.message, true); e.target.value = l.stage; }
        },
      }) : (LEAD_STAGE_LABELS[l.stage] || l.stage),
      el('div', { style: 'font-size:12px;color:var(--app-muted);max-width:260px;white-space:pre-wrap' }, l.note || '—'),
    ], { pageSize: 20, searchText: (l) => `${l.name} ${l.phone} ${l.email} ${l.tierName}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…', emptyText: 'لا نتائج.' }));
  }
  /* زر الإغلاق في رأس النافذة يعيد رسم البطاقات إن تغيّرت مرحلة */
  const closeBtn = document.querySelector('#modal-root .modal__close');
  if (closeBtn) closeBtn.addEventListener('click', () => { if (changed && onDone) onDone(); });
  await build();
}

/* المحاور تُكتب سطرًا لكل محور: «العنوان | الشرح» — والإنجليزية بالترتيب نفسه */
const modulesToText = (mods, en) => (Array.isArray(mods) ? mods : [])
  .map((m) => (en ? [m.titleEn, m.textEn] : [m.title, m.text]).filter(Boolean).join(' | ')).join('\n');
function modulesFromText(ar, en) {
  const parse = (txt) => String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { const i = l.indexOf('|'); return i === -1 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
  const a = parse(ar); const e = parse(en);
  return a.map(([title, text], i) => ({ title, text, titleEn: (e[i] || [])[0] || '', textEn: (e[i] || [])[1] || '' }));
}

function openCourseModal(onDone, existing) {
  const ex = existing || {};
  const titleIn = input({ value: ex.title || '', placeholder: 'مثال: من مدرب إلى بزنس متكامل' });
  const titleEnIn = input({ value: ex.titleEn || '', placeholder: 'From Coach to a Complete Business', dir: 'ltr' });
  const slugIn = input({ value: ex.slug || '', placeholder: 'coach-business', dir: 'ltr', style: 'font-family:var(--font-mono)' });
  const taglineIn = input({ value: ex.tagline || '', placeholder: 'سطر تعريفي قصير تحت العنوان' });
  const taglineEnIn = input({ value: ex.taglineEn || '', placeholder: 'Short tagline', dir: 'ltr' });
  const summaryIn = textarea({ value: ex.summary || '', placeholder: 'فقرة تشرح الدورة وهدفها…' });
  const summaryEnIn = textarea({ value: ex.summaryEn || '', placeholder: 'Course summary in English…', dir: 'ltr' });
  const audienceIn = input({ value: ex.audience || '', placeholder: 'لمن هذه الدورة؟' });
  const audienceEnIn = input({ value: ex.audienceEn || '', placeholder: 'Who is it for?', dir: 'ltr' });
  const formatSel = select(COURSE_FORMATS, { value: ex.format || 'hybrid' });
  const lessonsIn = input({ type: 'number', min: 0, value: ex.lessons || 10 });
  const durationIn = input({ value: ex.durationText || '', placeholder: 'مثال: 10 دروس — مع متابعة بعد الدورة' });
  const durationEnIn = input({ value: ex.durationTextEn || '', placeholder: '10 lessons with follow-up', dir: 'ltr' });
  const startIn = input({ type: 'date', value: ex.startDate || '' });
  const currencySel = select(Object.entries(CURRENCIES).map(([code, c]) => [code, `${c.name} (${c.symbol})`]), { value: ex.currency || 'ILS' });
  const methodsIn = input({ value: ex.methods || '', placeholder: 'A.E.P · F.T.S · P&M', dir: 'ltr' });
  const sortIn = input({ type: 'number', value: ex.sort || 1 });
  const publishedChk = el('input', { type: 'checkbox', style: 'width:18px;height:18px;accent-color:var(--green-500)' });
  publishedChk.checked = ex.published === true;
  const modulesIn = textarea({ value: modulesToText(ex.modules), style: 'min-height:150px', placeholder: 'محور في كل سطر:\nبناء سيستم متكامل | نظام واضح وموحَّد…\nزيادة دخلك | تستفيد من ساعات العمل…' });
  const modulesEnIn = textarea({ value: modulesToText(ex.modules, true), style: 'min-height:150px', dir: 'ltr', placeholder: 'One module per line, same order:\nBuild a complete system | A clear, unified system…' });

  const tierRows = TIER_SLOTS.map(([key, label]) => {
    const t = (Array.isArray(ex.tiers) ? ex.tiers : []).find((x) => x.key === key) || {};
    const nameIn = input({ value: t.name || label, dir: 'ltr' });
    const priceIn = input({ type: 'number', min: 0, value: t.price !== undefined ? t.price : '', placeholder: 'اتركه فارغًا لإخفاء الباقة' });
    const hl = el('input', { type: 'checkbox', style: 'width:16px;height:16px;accent-color:var(--green-500)' });
    hl.checked = t.highlight === true;
    const featIn = textarea({ value: (t.features || []).join('\n'), placeholder: 'ميزة في كل سطر', style: 'min-height:90px' });
    const featEnIn = textarea({ value: (t.featuresEn || []).join('\n'), placeholder: 'One feature per line', dir: 'ltr', style: 'min-height:90px' });
    const node = el('div', { class: 'span-2 card', style: 'padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
      el('div', { style: 'grid-column:span 2;font-weight:700;display:flex;justify-content:space-between;align-items:center' },
        `باقة ${label}`, el('label', { style: 'display:flex;gap:6px;align-items:center;font-weight:400;font-size:13px' }, hl, 'الأبرز (تُميَّز على الموقع)')),
      field('الاسم المعروض', nameIn), field('السعر', priceIn),
      field('ما تشمله (عربي)', featIn), field('ما تشمله (English)', featEnIn));
    return { key, node, read: () => (priceIn.value === '' ? null : {
      key, name: nameIn.value, nameEn: nameIn.value, price: priceIn.value, highlight: hl.checked,
      features: featIn.value, featuresEn: featEnIn.value,
    }) };
  });

  const close = modal(existing ? `تعديل «${existing.title}»` : 'دورة جديدة', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const body = {
          title: titleIn.value, titleEn: titleEnIn.value, slug: slugIn.value.trim().toLowerCase(),
          tagline: taglineIn.value, taglineEn: taglineEnIn.value,
          summary: summaryIn.value, summaryEn: summaryEnIn.value,
          audience: audienceIn.value, audienceEn: audienceEnIn.value,
          format: formatSel.value, lessons: lessonsIn.value,
          durationText: durationIn.value, durationTextEn: durationEnIn.value,
          startDate: startIn.value, currency: currencySel.value, methods: methodsIn.value,
          sort: sortIn.value, published: publishedChk.checked,
          modules: modulesFromText(modulesIn.value, modulesEnIn.value),
          tiers: tierRows.map((r) => r.read()).filter(Boolean),
        };
        if (body.published && !body.tiers.length) { toast('أضف باقة واحدة على الأقل قبل النشر.', true); return; }
        try {
          if (existing) await API.put('/api/courses/' + existing.id, body);
          else await API.post('/api/courses', body);
          toast(body.published ? 'حُفظت الدورة وهي منشورة على الموقع.' : 'حُفظت الدورة كمسودّة.');
          close(); onDone && onDone();
        } catch (ex2) { toast(ex2.message, true); }
      },
    },
      field('عنوان الدورة *', titleIn), field('العنوان بالإنجليزية', titleEnIn),
      field('الرابط المختصر (slug) *', slugIn), field('الترتيب على الموقع', sortIn),
      field('سطر تعريفي', taglineIn), field('Tagline', taglineEnIn),
      el('div', { class: 'span-2' }, field('نبذة الدورة', summaryIn)),
      el('div', { class: 'span-2' }, field('Summary (English)', summaryEnIn)),
      field('لمن الدورة؟', audienceIn), field('Audience (English)', audienceEnIn),
      field('طريقة التقديم', formatSel), field('عدد الدروس', lessonsIn),
      field('المدة (نص يظهر على الموقع)', durationIn), field('Duration (English)', durationEnIn),
      field('تاريخ البداية (اختياري)', startIn), field('عملة الأسعار', currencySel),
      field('أساليب التدريب (تظهر كشارات)', methodsIn),
      el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'الحالة'),
        el('label', { style: 'display:flex;gap:8px;align-items:center;height:40px' }, publishedChk, 'منشورة على الموقع')),
      el('div', { class: 'span-2' }, field('المحاور — سطر لكل محور: «العنوان | الشرح»', modulesIn)),
      el('div', { class: 'span-2' }, field('Modules (English) — same order: "Title | Text"', modulesEnIn)),
      el('div', { class: 'span-2', style: 'font-weight:700;margin-top:6px' }, 'باقات الدورة — اترك السعر فارغًا لإخفاء باقة'),
      ...tierRows.map((r) => r.node),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إضافة الدورة'))),
  ], { wide: true });
}

/* ============================================================
   بطاقة «الموقع الإلكتروني» في الإعدادات: بيانات التواصل التي يعرضها الموقع
   ============================================================ */
function siteContactCard() {
  const card = el('div', { class: 'card' }, el('h3', { class: 'card__title' }, 'الموقع الإلكتروني — بيانات التواصل'), spinnerCard());
  (async () => {
    let cfg = {};
    try { cfg = await API.get('/api/settings'); } catch (e) { /* المحاسب لا يعدّل — يكفي العرض */ }
    const fields = [
      ['sitePhone', 'هاتف الاستقبال', '02-2740000'],
      ['siteWhatsapp', 'واتساب الموقع (يستقبل رسائل «تواصل معنا»)', '0599000000'],
      ['siteEmail', 'البريد الإلكتروني', 'info@sport-power.net'],
      ['siteInstagram', 'إنستغرام (اسم الحساب)', 'sportpower'],
      ['siteFacebook', 'فيسبوك (اسم الصفحة أو رابطها)', 'sportpower'],
      ['siteTiktok', 'تيك توك (اسم الحساب)', 'sportpower'],
      ['siteAddress', 'العنوان الرئيسي', 'بيت لحم، فلسطين'],
    ];
    const inputs = Object.fromEntries(fields.map(([k, , ph]) => [k, input({ value: cfg[k] || '', placeholder: ph, dir: 'ltr', style: 'text-align:end' })]));
    inputs.siteAddress.dir = 'auto';
    card.innerHTML = '';
    card.append(
      el('h3', { class: 'card__title' }, 'الموقع الإلكتروني — بيانات التواصل'),
      el('p', { style: 'font-size:13px;color:var(--app-muted);margin:0 0 12px' },
        'تظهر في تذييل الموقع وصفحة التواصل وأزرار واتساب. الفروع وعناوينها تُقرأ من جدول الفروع أدناه، والباقات من صفحة الباقات، والدورات من صفحة الدورات.'),
      el('form', {
        class: 'form-grid',
        onsubmit: async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(fields.map(([k]) => [k, inputs[k].value]));
          try { await API.put('/api/settings', body); toast('حُفظت بيانات الموقع — تظهر على الموقع خلال دقائق.'); }
          catch (ex) { toast(ex.message, true); }
        },
      },
        ...fields.map(([k, label]) => field(label, inputs[k])),
        el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent', type: 'submit' }, 'حفظ بيانات الموقع'))));
  })();
  return card;
}

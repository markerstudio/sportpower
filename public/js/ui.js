/* أدوات الواجهة: بناء DOM، جداول، نوافذ، رسوم بيانية */

/* ------------------------------------------------------------
   حارس الإرسال المزدوج
   كل معالجات النماذج في النظام غير متزامنة: تنتظر ردّ الخادم بينما
   يبقى زر الحفظ فعّالًا. فنقرة مزدوجة (أو ضغطة Enter مكررة، أو نقرة
   ثانية على اتصال بطيء) كانت تُرسل الطلب مرتين — فتُسجَّل الحصة
   مرتين، وتُضاف الدفعة مرتين، ويُنشأ اشتراكان بدل واحد عند التجديد.
   هنا نُغلق النموذج ما دام طلبه جاريًا، ونُعيد فتحه عند انتهائه.
   يمرّ من هنا **كل** نموذج تلقائيًا (بلا تعديل في كل صفحة على حدة).
   ------------------------------------------------------------ */
function guardSubmit(handler) {
  let busy = false;
  return async function guarded(e) {
    if (busy) { e.preventDefault(); return undefined; }
    busy = true;
    const form = e.currentTarget;
    const locked = form
      ? [...form.querySelectorAll('button:not([type=button]),input[type=submit]')].filter((b) => !b.disabled)
      : [];
    locked.forEach((b) => { b.disabled = true; });
    if (form) form.classList.add('is-busy');
    try {
      return await handler.call(this, e);
    } finally {
      busy = false;
      if (form) form.classList.remove('is-busy');
      // النافذة قد تكون أُغلقت بنجاح الحفظ — لا نُعيد تفعيل زرٍ خرج من الصفحة
      locked.forEach((b) => { if (b.isConnected) b.disabled = false; });
    }
  };
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), tag === 'form' && k === 'onsubmit' ? guardSubmit(v) : v);
    }
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

/* ---------- أيقونات خطية (stroke 24×24) ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.2c2.6.3 4.5 2 4.5 4.3"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M7 15h4"/>',
  building: '<rect x="4" y="3" width="12" height="18" rx="1.5"/><path d="M16 9h3.5a.5.5 0 0 1 .5.5V21M8 7h1.5M8 11h1.5M8 15h1.5M12 7h1.5M12 11h1.5M12 15h1.5M9 21v-3h4v3"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  leaf: '<path d="M6 20c0-8 4-13 13-14 0 9-4 13-11 13"/><path d="M6 20c2-5 5-8 9-10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.5"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M4 5v13a2 2 0 0 0 2 2h14V7"/><path d="M16 13.5h2.5"/>',
  alert: '<path d="M12 3.5 22 20H2L12 3.5z"/><path d="M12 10v4.5M12 17.5v.3"/>',
  dumbbell: '<rect x="2" y="9.5" width="3" height="5" rx="1"/><rect x="19" y="9.5" width="3" height="5" rx="1"/><rect x="5.5" y="7.5" width="3.5" height="9" rx="1.2"/><rect x="15" y="7.5" width="3.5" height="9" rx="1.2"/><path d="M9 12h6"/>',
  file: '<path d="M6 2.5h8L19 8v13.5H6V2.5z"/><path d="M13.5 3v5H19M9.5 13h5M9.5 17h5"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="M11.5 11.5 20 3M16 7l2.5 2.5M13 10l2 2"/>',
  logout: '<path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14"/><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  back: '<path d="M4 12h16M13.5 5.5 20 12l-6.5 6.5"/>',
  check: '<path d="M4.5 12.5 10 18 19.5 6.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0M8.5 10.5h7M8.5 14h7M8.5 17.5h4"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 3l-2 2.2M12 3l2 2.2M12 21l-2-2.2M12 21l2-2.2M4.2 7.5l3 .4M4.2 16.5l3-.4M19.8 7.5l-3 .4M19.8 16.5l-3-.4"/>',
  wa: '<path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z"/><path d="M9 8.8c.3-.7.8-.7 1.1-.1l.6 1.2c.2.4 0 .8-.3 1.1-.4.4-.3.8.1 1.3.6.8 1.3 1.4 2.2 1.8.5.2.9.2 1.2-.2.3-.4.7-.5 1.1-.2l1.1.7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.6l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.2z"/>',
  gift: '<rect x="3.5" y="9" width="17" height="12" rx="1.5"/><path d="M3.5 13h17M12 9v12M12 9c-2.2 0-4.5-.8-4.5-3A2 2 0 0 1 9.5 4c2.2 0 2.5 3 2.5 5zm0 0c2.2 0 4.5-.8 4.5-3A2 2 0 0 0 14.5 4C12.3 4 12 7 12 9z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.6 13.6 8.5 15.5l1.9-5.1 5.1-1.9z"/>',
  tag: '<path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.6"/>',
};

/* شريط تقدم بنِسَب ملونة — يتقدّم من الصفر لقيمته عند الظهور */
function progressBar(pct) {
  const p = Math.max(0, Math.min(Number(pct) || 0, 120));
  const tone = p >= 80 ? 'var(--accent)' : p >= 50 ? 'var(--status-warning)' : 'var(--status-danger)';
  const fill = el('span', { class: 'bar__fill', style: `width:0%;background:${tone}` });
  // بعد الإدراج في الصفحة — كي يعمل الانتقال المعرَّف في CSS
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.min(p, 100) + '%'; }));
  return el('div', { class: 'bar', title: p + '%' }, fill, el('b', {}, p + '%'));
}

/* رقم يصعد لقيمته — حركة التقارير */
function countUp(node, value, { money, currency, suffix = '', duration = 900 } = {}) {
  const target = Number(value) || 0;
  // المال بعملة صاحبه (رقم فرع أو رمز عملة) — لا بعملة النظام دائمًا
  const fmt = (v) => (money ? fmtMoney(Math.round(v), currency) : String(Math.round(v))) + suffix;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = fmt(target); return node; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min((now - t0) / duration, 1);
    node.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return node;
}

/* عدّاد هدف متحرك: شريط يتقدم ورقم يصعد — للتقرير الشهري وأمثاله */
function goalMeter({ title, sub, pct, actual, money, currency, targetText }, i = 0) {
  const p = pct === null || pct === undefined ? null : Math.max(0, Math.min(Number(pct), 120));
  const tone = p === null ? 'var(--app-muted)'
    : p >= 100 ? 'var(--accent)' : p >= 70 ? 'var(--blue-500)' : p >= 40 ? 'var(--status-warning)' : 'var(--status-danger)';
  const tagTone = p === null ? 'tag--neutral'
    : p >= 100 ? 'tag--accent' : p >= 70 ? 'tag--info' : p >= 40 ? 'tag--warning' : 'tag--danger';
  const actualEl = el('b', {}, '0');
  const pctEl = el('span', { class: 'tag ' + tagTone }, p === null ? '—' : '0%');
  const fill = el('span', { class: 'goalmeter__fill', style: `background:${tone};transition-delay:${Math.min(i, 10) * 80}ms` });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.width = Math.min(p || 0, 100) + '%';
    countUp(actualEl, actual || 0, { money, currency });
    if (p !== null) countUp(pctEl, p, { suffix: '%' });
  }));
  return el('div', { class: 'goalmeter' },
    el('div', { class: 'goalmeter__head' },
      el('div', {}, el('b', {}, title), sub ? el('div', { class: 'goalmeter__sub' }, sub) : el('span')),
      pctEl),
    el('div', { class: 'goalmeter__bar' }, fill),
    el('div', { class: 'goalmeter__meta' }, 'المحقق ', actualEl, ' من هدف ', el('b', {}, targetText)));
}

/* رابط واتساب مع تعويض الاسم في القالب */
function waLink(phone, countryCode, message, name) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = (countryCode || '970') + digits.slice(1);
  const text = (message || '').split('{الاسم}').join(name || '');
  return `https://wa.me/${digits}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

function icon(name, cls) {
  const s = el('span', { class: 'ic' + (cls ? ' ' + cls : '') });
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.grid}</svg>`;
  return s;
}

/* بطاقة KPI بطلية (متدرجة بدوائر زخرفية) */
function kpiHero(value, label, iconName, variant) {
  return el('div', { class: 'kpi-hero' + (variant ? ' kpi-hero--' + variant : '') },
    el('span', { class: 'kpi-hero__icon' }, icon(iconName)),
    el('div', { class: 'kpi-hero__value' }, String(value)),
    el('div', { class: 'kpi-hero__label' }, label));
}

/* مربع KPI أبيض بأيقونة ملونة */
function kpiTile(value, label, iconName, tone) {
  return el('div', { class: 'kpi' + (tone ? ' kpi--' + tone : '') },
    el('span', { class: 'kpi__ic' }, icon(iconName)),
    el('div', {},
      el('div', { class: 'kpi__value' }, String(value)),
      el('div', { class: 'kpi__label' }, label)));
}

function toast(message, isError) {
  const t = el('div', { class: 'toast' + (isError ? ' toast--error' : '') }, message);
  document.getElementById('toast-root').append(t);
  setTimeout(() => t.remove(), 4200);
}

/* ------------------------------------------------------------
   نافذة منبثقة
   كانت تُفتح بلا أيٍّ من سلوك النوافذ المتوقَّع: لا Escape يغلقها، ولا
   تركيزَ يدخلها فيبقى المؤشر في الصفحة خلفها، ولا يعود التركيز لزرّ
   الفتح عند الإغلاق، والصفحة خلفها تُمرَّر تحت الغشاء. والنظام إدخالُ
   بياناتٍ طوال اليوم — فهذه نقراتٌ ضائعة في كل مرة.
   ------------------------------------------------------------ */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),'
  + 'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* drawer: لوحٌ جانبي بكامل الارتفاع بدل صندوقٍ في الوسط — لقوائم
   يُطّلع عليها ثم تُغلق (الباقات مثلًا). هو النافذة نفسها بهندسةٍ
   أخرى، فيرث حصرَ التركيز وEscape وتجميدَ الصفحة بلا تكرارِ أيٍّ منها. */
function modal(title, bodyNodes, { wide, drawer } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const opener = document.activeElement; // نعيد إليه التركيز عند الإغلاق
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.body.classList.remove('modal-open');
    root.innerHTML = '';
    // العودة لزرّ الفتح: من يتنقّل بلوحة المفاتيح لا يبدأ من أول الصفحة
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  };

  const box = el('div', {
    class: 'modal' + (drawer ? ' modal--drawer' : ''),
    style: wide && !drawer ? 'width:760px' : '',
    role: 'dialog', 'aria-modal': 'true', 'aria-label': String(title || 'نافذة'),
  },
    el('div', { class: 'modal__head' },
      el('img', { src: '/assets/mark-green.svg', alt: '' }),
      el('div', { class: 'modal__title' }, title),
      el('button', { class: 'modal__close', type: 'button', onclick: close, 'aria-label': 'إغلاق' }, '✕')),
    el('div', { class: 'modal__body' }, ...bodyNodes));

  /* Escape يغلق، وTab يدور داخل النافذة ولا يخرج لعناصر الصفحة خلفها */
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  const overlay = el('div', {
    class: 'modal-overlay' + (drawer ? ' modal-overlay--drawer' : ''),
    onclick: (e) => { if (e.target === overlay) close(); },
  }, box);
  root.append(overlay);
  document.body.classList.add('modal-open'); // توقف تمرير الصفحة خلف الغشاء

  /* التركيز على أول حقل قابل للكتابة — لا على زرّ الإغلاق:
     من يفتح «دفعة جديدة» يريد الكتابة فورًا لا البحث عن الحقل. */
  requestAnimationFrame(() => {
    const body = box.querySelector('.modal__body');
    const firstField = drawer ? null
      : body && body.querySelector('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
    (firstField || box.querySelector('.modal__close')).focus({ preventScroll: true });
  });

  return close;
}

function field(label, input) {
  return el('div', { class: 'field' }, el('label', { class: 'field__label' }, label), input);
}

/* عنوان حقلٍ ماليّ تتبدّل عملته: «القيمة (شيكل)» → «القيمة (دينار أردني)»
   حين يتغيّر الفرع في النموذج. يعيد عنصرًا فيه دالة setCurrency(code).
   يُستعمل في نماذج الإدخال متعددة الفروع فلا يُطبع «شيكل» على مبلغ دينار. */
function curLabel(prefix, code) {
  const cur = el('span', {}, curInfo(code).name);
  const node = el('span', {}, prefix + ' (', cur, ')');
  node.setCurrency = (c) => { cur.textContent = curInfo(c).name; };
  return node;
}

function input(attrs) { return el('input', { class: 'field__input', ...attrs }); }
function textarea(attrs = {}) {
  const t = el('textarea', { class: 'field__textarea', ...attrs });
  if (attrs.value !== undefined) t.value = attrs.value; // خاصية لا سمة
  return t;
}
function select(options, attrs = {}) {
  const s = el('select', { class: 'field__select', ...attrs });
  options.forEach(([value, label]) => s.append(el('option', { value }, label)));
  if (attrs.value !== undefined) s.value = attrs.value;
  return s;
}

/* منتقٍ قابل للبحث (للأعداد الكبيرة من المتدربين) — اكتب للبحث */
let _dlSeq = 0;
function searchSelect(options, attrs = {}) {
  const id = 'sp-dl-' + (++_dlSeq);
  const dl = el('datalist', { id });
  const byLabel = new Map();
  options.forEach(([value, label]) => {
    byLabel.set(String(label), String(value));
    dl.append(el('option', { value: label }));
  });
  const inp = el('input', {
    class: 'field__input', list: id, autocomplete: 'off',
    placeholder: attrs.placeholder || `اكتب للبحث… (${options.length})`,
  });
  if (attrs.value !== undefined && attrs.value !== null && attrs.value !== '') {
    const found = options.find(([v]) => String(v) === String(attrs.value));
    if (found) inp.value = found[1];
  }
  const wrap = el('div', { style: 'width:100%' }, inp, dl);
  Object.defineProperty(wrap, 'value', {
    get() { return byLabel.get(inp.value.trim()) || ''; },
    set(v) {
      const found = options.find(([val]) => String(val) === String(v));
      inp.value = found ? found[1] : '';
    },
  });
  /* الغلاف يتصرّف كحقل: تعطيله يُعطّل مربع الكتابة داخله. بدونه كان
     وضع «للاطّلاع فقط» يترك المنتقي قابلًا للكتابة رغم تعطيل بقية الحقول. */
  Object.defineProperty(wrap, 'disabled', {
    get() { return inp.disabled; },
    set(v) { inp.disabled = !!v; },
  });
  if (attrs.onchange) inp.addEventListener('change', () => attrs.onchange({ target: wrap }));
  return wrap;
}

/* تسمية موحّدة للمتدرب داخل المنتقيات: الاسم — الجوال (لتمييز التشابه) */
const traineeOption = (t) => [t.id, t.phone ? `${t.name} — ${t.phone}` : `${t.name} — ${t.username}`];

/* جدول مع بحث وترقيم صفحات — للقوائم الكبيرة.
   وضعان:
   - محلي: تُمرَّر البيانات كاملة (opts.searchText للبحث) — للقوائم الصغيرة.
   - من الخادم: opts.remote({ query, page, pageSize }) → { rows, total }
     فلا تُنقل إلى المتصفح إلا صفحة واحدة مهما كبر الجدول. */
/* ------------------------------------------------------------
   ذاكرة الجداول: الصفحة وكلمة البحث تبقيان عبر إعادة البناء
   كل شاشة تُعيد بناء نفسها بعد كل حفظ، فينشأ جدول جديد بصفحته الأولى:
   من كان في الصفحة الثالثة من سجل الإجراءات عاد للأولى بعد كل تنفيذ.
   نُفهرس الجدول بمساره وترويسته وترتيبه في الصفحة، ونحفظ موضعه.
   والذاكرة تُمسح عند تغيير الصفحة فلا تنمو بلا حد.
   ------------------------------------------------------------ */
const TABLE_STATE = new Map();
let tableStateRoute = null;
let tableSeq = new Map();
/* يُستدعى مع كل إعادة بناء لشاشة — فيبدأ عدّ الجداول من جديد */
function resetTableSeq() { tableSeq = new Map(); }

function tableStateKey(headers) {
  const route = typeof routeOf === 'function' ? routeOf(location.hash) : location.hash;
  if (tableStateRoute !== route) { TABLE_STATE.clear(); tableStateRoute = route; }
  const sig = route + '|' + headers.join('~');
  const n = tableSeq.get(sig) || 0;
  tableSeq.set(sig, n + 1);
  return sig + '|' + n;
}

function pagedTable(headers, data, rowRender, opts = {}) {
  const pageSize = opts.pageSize || 15;
  const remote = opts.remote || null;
  const memKey = tableStateKey(headers);
  const saved = TABLE_STATE.get(memKey) || { page: 0, query: '' };
  let page = saved.page;
  let query = saved.query;
  const remember = () => TABLE_STATE.set(memKey, { page, query });
  let token = 0; // يتجاهل ردود الطلبات المتجاوَزة
  const wrap = el('div');
  const body = el('div');
  const bar = el('div', { class: 'pt-bar' });
  const info = el('span', { class: 'pt-info' });
  const nav = el('div', { class: 'pt-nav' });

  let searchIn = null;
  if (opts.searchText || remote) {
    searchIn = input({
      value: query,
      placeholder: opts.searchPlaceholder || 'بحث…',
      oninput: debounce(() => { query = searchIn.value.trim(); page = 0; remember(); draw(); }, 300),
    });
    wrap.append(el('div', { style: 'max-width:320px;margin-bottom:12px' }, searchIn));
  }
  wrap.append(body, bar);

  function paint(rows, total) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    body.innerHTML = '';
    body.append(dataTable(headers, rows.map(rowRender), opts.emptyText));

    bar.innerHTML = '';
    info.textContent = total
      ? `${total.toLocaleString('en')} سجل` + (pages > 1 ? ` · صفحة ${page + 1} من ${pages}` : '')
      : '';
    bar.append(info);
    if (pages > 1) {
      nav.innerHTML = '';
      nav.append(
        el('button', { class: 'btn btn--outline btn--sm', disabled: page === 0 || null, onclick: () => { page--; remember(); draw(); } }, 'السابق'),
        el('button', { class: 'btn btn--outline btn--sm', disabled: page >= pages - 1 || null, onclick: () => { page++; remember(); draw(); } }, 'التالي'));
      bar.append(nav);
    }
  }

  async function draw() {
    if (!remote) {
      const filtered = query ? data.filter((d) => (opts.searchText(d) || '').includes(query)) : data;
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (page >= pages) { page = pages - 1; remember(); }
      paint(filtered.slice(page * pageSize, (page + 1) * pageSize), filtered.length);
      return;
    }
    const mine = ++token;
    if (!body.firstChild) body.append(spinnerCard());
    try {
      const { rows, total } = await remote({ query, page, pageSize });
      if (mine !== token) return; // وصل ردّ أحدث
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (page >= pages && page > 0) { page = pages - 1; remember(); return draw(); }
      paint(rows, total);
    } catch (ex) {
      if (mine !== token) return;
      body.innerHTML = '';
      body.append(el('div', { class: 'alert alert--warning' }, ex.message));
    }
  }

  draw();
  wrap.reload = () => { page = 0; remember(); draw(); };
  return wrap;
}

function debounce(fn, ms = 300) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

function dataTable(headers, rows, emptyText) {
  if (!rows.length) return el('div', { class: 'empty' }, emptyText || 'لا توجد بيانات.');
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, c && c.nodeType ? c : String(c ?? '—'))))))));
}

/* ---------- الرسوم البيانية SVG ---------- */
function barChart(labels, values, { height = 190, unit = '' } = {}) {
  const W = 560, H = height, pad = 26, bottom = 22;
  const max = Math.max(...values, 1);
  const bw = (W - pad * 2) / labels.length;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const mk = (tag, attrs, text) => {
    const n = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  svg.append(mk('line', { x1: pad, y1: H - bottom, x2: W - pad, y2: H - bottom, class: 'axis' }));
  values.forEach((v, i) => {
    const h = (v / max) * (H - bottom - 26);
    const x = pad + i * bw + bw * 0.18;
    // الأعمدة تنمو من القاعدة بتتابع خفيف — حركة التقارير (تُعطَّل مع تفضيل تقليل الحركة)
    const bar = mk('rect', { x, y: H - bottom - h, width: bw * 0.64, height: Math.max(h, 1), rx: 3, class: 'bar' });
    bar.style.animationDelay = Math.min(i * 45, 900) + 'ms';
    svg.append(bar);
    if (v) svg.append(mk('text', { x: x + bw * 0.32, y: H - bottom - h - 5, 'text-anchor': 'middle' }, v + unit));
    svg.append(mk('text', { x: x + bw * 0.32, y: H - 7, 'text-anchor': 'middle' }, labels[i]));
  });
  return el('div', { class: 'chart' }, svg);
}

function lineChart(labels, seriesA, seriesB, { height = 200 } = {}) {
  const W = 560, H = height, pad = 34, bottom = 24;
  const all = [...seriesA, ...(seriesB || [])].filter((v) => v != null);
  if (!all.length) return el('div', { class: 'empty' }, 'لا توجد بيانات كافية للرسم.');
  const min = Math.min(...all), max = Math.max(...all);
  const span = (max - min) || 1;
  const x = (i) => pad + (i / Math.max(labels.length - 1, 1)) * (W - pad * 2);
  const y = (v) => 14 + (1 - (v - min) / span) * (H - bottom - 24);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const mk = (tag, attrs, text) => {
    const n = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  svg.append(mk('line', { x1: pad, y1: H - bottom, x2: W - pad, y2: H - bottom, class: 'axis' }));
  const path = (arr) => arr.map((v, i) => (v == null ? '' : `${i === 0 || arr[i - 1] == null ? 'M' : 'L'}${x(i)},${y(v)}`)).join(' ');
  svg.append(mk('path', { d: path(seriesA), class: 'line' }));
  seriesA.forEach((v, i) => {
    if (v == null) return;
    svg.append(mk('circle', { cx: x(i), cy: y(v), r: 3.4, class: 'dot' }));
    svg.append(mk('text', { x: x(i), y: Math.max(10, y(v) - 8), 'text-anchor': 'middle' }, v));
  });
  if (seriesB) {
    svg.append(mk('path', { d: path(seriesB), class: 'line2' }));
    seriesB.forEach((v, i) => { if (v != null) svg.append(mk('circle', { cx: x(i), cy: y(v), r: 3, class: 'dot2' })); });
  }
  labels.forEach((l, i) => svg.append(mk('text', { x: x(i), y: H - 7, 'text-anchor': 'middle' }, l)));
  return el('div', { class: 'chart' }, svg);
}

function progressRing(used, total, caption) {
  const r = 62, c = 2 * Math.PI * r;
  const remaining = Math.max(0, total - used);
  const frac = total ? remaining / total : 0;
  const ring = el('div', { class: 'progress-ring' });
  ring.innerHTML =
    `<svg width="148" height="148" viewBox="0 0 148 148">
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--border-subtle)" stroke-width="12"/>
      <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--accent)" stroke-width="12"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/>
    </svg>`;
  ring.append(el('div', { class: 'progress-ring__label' },
    el('div', { class: 'progress-ring__num' }, String(remaining)),
    el('div', { class: 'progress-ring__cap' }, caption || `من أصل ${total} حصة`)));
  return ring;
}

/* ---------- مساعدات عامة ---------- */
const ROLE_LABELS = { admin: 'الإدارة', trainer: 'مدرب', accountant: 'محاسب', trainee: 'متدرب', nutritionist: 'أخصائية تغذية' };
/* أهداف المشتركين — نفس تصنيف الخادم (server/goals.js).
   weightUp: هل زيادة الوزن تقدّمٌ لهذا الهدف؟ null = لا حكم على الوزن. */
const GOAL_KINDS = {
  loss:     { label: 'نزول وزن',        weightUp: false },
  fat:      { label: 'نزول دهون',       weightUp: null },
  muscle:   { label: 'بناء كتلة عضلية', weightUp: true },
  football: { label: 'لاعب فطبول',      weightUp: null },
  athlete:  { label: 'لاعب رياضي',      weightUp: null },
  therapy:  { label: 'علاجي',           weightUp: null },
  maintain: { label: 'تثبيت وزن',       weightUp: null },
};
const GOAL_LABELS = Object.fromEntries(Object.entries(GOAL_KINDS).map(([k, v]) => [k, v.label]));
/* مكتبة التغذية مبنية على ثلاثة مسارات، والأهداف السبعة تنزل عليها:
   «لاعب فطبول» يقرأ وجبات مسار العضل. فمنتقيات الوجبات تعرض المسارات
   الثلاثة وحدها — وإلا أُنشئت وجبة على هدفٍ لا يصله أحد. */
const MEAL_GOALS = { loss: 'نزول وزن', muscle: 'بناء عضل', maintain: 'تثبيت' };
const MEAL_TYPES = { breakfast: 'فطور', lunch: 'غداء', dinner: 'عشاء', snack: 'سناك' };
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* العملات المدعومة — تُضبط من إعدادات النظام (الإدارة) */
const CURRENCIES = {
  ILS: { symbol: '₪', name: 'شيكل' },
  JOD: { symbol: 'د.أ', name: 'دينار أردني' },
  USD: { symbol: '$', name: 'دولار' },
};
let ACTIVE_CURRENCY = 'ILS';
/* عملة كل فرع — تُملأ من /api/branches عند رسم الصفحة.
   الفرع بلا عملة يتبع عملة النظام. */
const BRANCH_CURRENCY = {};
const curInfo = (code) => CURRENCIES[code || ACTIVE_CURRENCY] || CURRENCIES.ILS;
const branchCurrency = (branchId) => BRANCH_CURRENCY[branchId] || ACTIVE_CURRENCY;

/* fmtMoney(1200) → بعملة النظام · fmtMoney(1200, 3) → بعملة الفرع ٣
   · fmtMoney(1200, 'JOD') → بعملة بعينها */
function fmtMoney(n, where) {
  const code = typeof where === 'number' ? branchCurrency(where) : where;
  return Number(n || 0).toLocaleString('en') + ' ' + curInfo(code).symbol;
}

/* مبالغ بعملات مختلفة: «١٢٠٠ ₪ · ٣٠٠ د.أ» — لا تُجمع في رقم واحد،
   فجمع الدينار على الشيكل يعطي رقمًا لا يعني شيئًا. يقبل أيضًا رقمًا
   مفردًا توافقًا مع الشاشات التي لم تنتقل بعد. */
function fmtMoneyMap(byCurrency) {
  if (byCurrency === null || byCurrency === undefined) return fmtMoney(0);
  if (typeof byCurrency !== 'object') return fmtMoney(byCurrency);
  const parts = Object.entries(byCurrency).filter(([, v]) => Number(v));
  if (!parts.length) return fmtMoney(0);
  return parts.map(([code, v]) => fmtMoney(v, code)).join(' · ');
}
/* عملة هدفٍ (Target): هدفُ فرعٍ بعملة فرعه، وهدفُ موظفٍ بعملة فرعه إن
   عُرف، وهدفُ الشركة بعملة النظام. */
const targetCurrency = (t) => (t && t.scope === 'branch' && t.refId != null ? branchCurrency(Number(t.refId))
  : t && t.branchId != null ? branchCurrency(Number(t.branchId)) : ACTIVE_CURRENCY);
/* هل يتجاوز المجموع عملةً واحدة؟ (لتنبيه الواجهة أن الرقم غير قابل للجمع) */
const isMultiCurrency = (m) => !!m && typeof m === 'object'
  && Object.values(m).filter((v) => Number(v)).length > 1;
const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonthISO = () => todayISO().slice(0, 7);

/* وسم نوع الحصة — الغياب يُميَّز بلونه لأنه مخصوم من الرصيد لكنه ليس حضورًا */
const SESSION_KIND_LABELS = { regular: 'عادية', makeup: 'تعويض', absence: 'غياب' };
function sessionKindTag(s) {
  const k = s.kind === 'makeup' ? 'makeup' : s.kind === 'absence' ? 'absence' : 'regular';
  const cls = k === 'absence' ? 'tag--danger' : k === 'makeup' ? 'tag--info' : 'tag--neutral';
  /* التعويضية المرتبطة بغياب لم تُخصم مرة ثانية — يوضّحها العنوان عند المرور */
  const title = k === 'makeup'
    ? (s.absenceSessionId ? 'تعويض غياب مخصوم — بلا خصم جديد' : 'تعويضية بلا غياب معلّق — خُصمت كحصة عادية')
    : k === 'absence' ? 'غياب — خُصمت الحصة من الرصيد' : 'حصة نُفّذت — خُصمت من الرصيد';
  return el('span', { class: 'tag ' + cls, title }, SESSION_KIND_LABELS[k] + (s.absenceSessionId ? ' ✓' : ''));
}

/* رصد داخلي على المتدرب: نتيجة أو مشكلة (سرّي عن المتدرب) */
const FLAG_LABELS = { result: 'نتيجة', problem: 'مشكلة' };
const SEVERITY_LABELS = { low: 'بسيطة', medium: 'متوسطة', high: 'حرجة' };
function flagTag(f) {
  if (f.kind === 'result') return el('span', { class: 'tag tag--accent' }, '🎯 نتيجة');
  const cls = f.severity === 'high' ? 'tag--danger' : f.severity === 'medium' ? 'tag--warning' : 'tag--neutral';
  return el('span', { class: 'tag ' + cls }, '⚠️ مشكلة' + (f.severity ? ` — ${SEVERITY_LABELS[f.severity]}` : ''));
}

/* سهم التغيّر بين قراءتين متتاليتين (بترتيب التاريخ) — الاتجاه يعكس
   الحركة الفعلية دائمًا: طلوع = ↑ ونزول = ↓، واللون حسب المرغوب للمؤشر */
/* اتجاه الوزن يُقرأ حرفيًا (طلوع ↑ ونزول ↓)، أما اللونُ فحكمٌ يتبع هدف
   المتدرب لا الوزن وحده: من هدفه بناء العضل زيادةُ وزنه تقدّمٌ لا تراجع،
   ومن هدفه التثبيت لا يُحكم على تغيّره أصلًا. كان اللون يُحمّر كل زيادة
   للجميع فيقرأ المدرب نتيجةً صحيحة على أنها مشكلة. */
const goodWhenUpForGoal = (goal) => (GOAL_KINDS[goal] ? GOAL_KINDS[goal].weightUp : false);

function changeArrow(curr, prev, { goodWhenUp = false } = {}) {
  if (curr == null || prev == null) return el('span', { class: 'tag tag--neutral' }, '—');
  const d = +(Number(curr) - Number(prev)).toFixed(1);
  if (d === 0) return el('span', { class: 'tag tag--neutral' }, '＝');
  const up = d > 0;
  const tone = goodWhenUp === null ? 'tag--neutral'
    : (goodWhenUp ? up : !up) ? 'tag--accent' : 'tag--danger';
  return el('span', { class: 'tag ' + tone, title: 'مقارنة بالقراءة السابقة' },
    (up ? '↑ +' : '↓ −') + Math.abs(d));
}

function statusTag(status, expiring) {
  if (status === 'expired') return el('span', { class: 'tag tag--danger' }, 'منتهٍ');
  if (status === 'frozen') return el('span', { class: 'tag tag--info' }, 'مجمّد');
  if (status === 'cancelled') return el('span', { class: 'tag tag--neutral' }, 'ملغى');
  if (expiring) return el('span', { class: 'tag tag--warning' }, 'قريب من الانتهاء');
  return el('span', { class: 'tag tag--accent' }, 'فعّال');
}

function spinnerCard(text) {
  return el('div', { class: 'empty' }, text || 'جارٍ التحميل…');
}

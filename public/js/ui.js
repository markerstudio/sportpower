/* أدوات الواجهة: بناء DOM، جداول، نوافذ، رسوم بيانية */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
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
  check: '<path d="M4.5 12.5 10 18 19.5 6.5"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/>',
};

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

function modal(title, bodyNodes, { wide } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const close = () => { root.innerHTML = ''; };
  const box = el('div', { class: 'modal', style: wide ? 'width:760px' : '' },
    el('div', { class: 'modal__head' },
      el('img', { src: '/assets/mark-green.svg', alt: '' }),
      el('div', { class: 'modal__title' }, title),
      el('button', { class: 'modal__close', onclick: close, 'aria-label': 'إغلاق' }, '✕')),
    el('div', { class: 'modal__body' }, ...bodyNodes));
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, box);
  root.append(overlay);
  return close;
}

function field(label, input) {
  return el('div', { class: 'field' }, el('label', { class: 'field__label' }, label), input);
}

function input(attrs) { return el('input', { class: 'field__input', ...attrs }); }
function textarea(attrs) { return el('textarea', { class: 'field__textarea', ...attrs }); }
function select(options, attrs = {}) {
  const s = el('select', { class: 'field__select', ...attrs });
  options.forEach(([value, label]) => s.append(el('option', { value }, label)));
  if (attrs.value !== undefined) s.value = attrs.value;
  return s;
}

function dataTable(headers, rows, emptyText) {
  if (!rows.length) return el('div', { class: 'empty' }, emptyText || 'لا توجد بيانات.');
  return el('div', { class: 'table-wrap' },
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', {}, h)))),
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
    svg.append(mk('rect', { x, y: H - bottom - h, width: bw * 0.64, height: Math.max(h, 1), rx: 3, class: 'bar' }));
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
const GOAL_LABELS = { loss: 'نزول وزن', muscle: 'زيادة عضل', maintain: 'تثبيت وزن' };
const MEAL_TYPES = { breakfast: 'فطور', lunch: 'غداء', dinner: 'عشاء', snack: 'سناك' };
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/* العملات المدعومة — تُضبط من إعدادات النظام (الإدارة) */
const CURRENCIES = {
  ILS: { symbol: '₪', name: 'شيكل' },
  JOD: { symbol: 'د.أ', name: 'دينار أردني' },
  USD: { symbol: '$', name: 'دولار' },
};
let ACTIVE_CURRENCY = 'ILS';
const curInfo = () => CURRENCIES[ACTIVE_CURRENCY] || CURRENCIES.ILS;
const fmtMoney = (n) => Number(n || 0).toLocaleString('en') + ' ' + curInfo().symbol;
const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonthISO = () => todayISO().slice(0, 7);

function statusTag(status, expiring) {
  if (status === 'expired') return el('span', { class: 'tag tag--danger' }, 'منتهٍ');
  if (expiring) return el('span', { class: 'tag tag--warning' }, 'قريب من الانتهاء');
  return el('span', { class: 'tag tag--accent' }, 'فعّال');
}

function spinnerCard(text) {
  return el('div', { class: 'empty' }, text || 'جارٍ التحميل…');
}

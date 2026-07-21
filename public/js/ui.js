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

const fmtMoney = (n) => Number(n || 0).toLocaleString('en') + ' ر.س';
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

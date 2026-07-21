/* هيكل التطبيق: التوجيه + الشريط الجانبي + الإشعارات */

function homeRoute(role) {
  return { admin: '#/admin', trainer: '#/trainer', accountant: '#/accountant', trainee: '#/me', nutritionist: '#/meals' }[role] || '#/login';
}

const NAV = {
  admin: [
    ['#/admin', 'لوحة التحكم'],
    ['#/calendar', 'التقويم والمواعيد'],
    ['#/subscriptions', 'الاشتراكات والحصص'],
    ['#/branches', 'الفروع والمدربون'],
    ['#/inbody', 'قراءات InBody'],
    ['#/meals', 'مكتبة التغذية'],
    ['#/reports', 'التقارير الشهرية'],
  ],
  trainer: [
    ['#/trainer', 'لوحتي'],
    ['#/calendar', 'مواعيدي'],
    ['#/trainees', 'متدربيّ'],
    ['#/inbody', 'قراءات InBody'],
    ['#/meals', 'مكتبة التغذية'],
  ],
  accountant: [
    ['#/accountant', 'اللوحة المالية'],
    ['#/reports', 'التقارير الشهرية'],
  ],
  trainee: [
    ['#/me', 'صفحتي'],
    ['#/meals', 'مكتبة التغذية'],
  ],
  nutritionist: [
    ['#/meals', 'مكتبة التغذية'],
    ['#/trainees', 'المتدربون'],
  ],
};

const TITLES = {
  '#/admin': 'لوحة تحكم الإدارة', '#/trainer': 'لوحة المدرب', '#/accountant': 'اللوحة المالية',
  '#/me': 'صفحتي', '#/calendar': 'التقويم والمواعيد', '#/subscriptions': 'إدارة الاشتراكات والحصص',
  '#/branches': 'الفروع والمدربون', '#/inbody': 'قراءات InBody', '#/meals': 'مكتبة التغذية',
  '#/reports': 'التقارير الشهرية', '#/trainees': 'المتدربون',
};

async function renderShell(route, renderView) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const nav = NAV[API.user.role] || [];
  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    el('div', { class: 'sidebar__logo' }, el('img', { src: '/assets/logo-white.svg', alt: 'سبورت باور' })),
    el('nav', { class: 'sidebar__nav' },
      ...nav.map(([href, label]) => el('a', { href, class: route === href ? 'active' : '' }, label))),
    el('div', { class: 'sidebar__foot' }, 'سبورت باور © 2026', el('br'), 'نظام يبقى معك.'));

  const bellBtn = el('button', { class: 'bell', title: 'الإشعارات', onclick: openNotifications }, '🔔');
  const main = el('div', { class: 'main' },
    el('header', { class: 'topbar' },
      el('button', { class: 'menu-btn', onclick: () => sidebar.classList.toggle('open') }, '☰'),
      el('div', { class: 'topbar__title' }, TITLES[route] || 'نظام سبورت باور'),
      bellBtn,
      el('div', { class: 'topbar__user' },
        el('span', { class: 'topbar__avatar' }, (API.user.name || '؟').trim().slice(0, 1)),
        el('div', {},
          el('div', { style: 'font-weight:700;color:var(--text-strong);font-size:13px' }, API.user.name),
          el('div', { style: 'font-size:11px;color:var(--text-muted)' }, ROLE_LABELS[API.user.role] || API.user.role))),
      el('button', {
        class: 'btn btn--outline btn--sm',
        onclick: async () => { await API.logout(); location.hash = '#/login'; },
      }, 'خروج')),
    el('div', { id: 'view' }));

  app.append(el('div', { class: 'shell' }, sidebar, main));

  // عدّاد الإشعارات
  try {
    const notifs = await API.get('/api/notifications');
    const unread = notifs.filter((n) => !n.read).length;
    if (unread) bellBtn.append(el('span', { class: 'bell__count' }, String(unread)));
  } catch (e) { /* تجاهل */ }

  await renderView(document.getElementById('view'));
}

async function openNotifications() {
  const notifs = await API.get('/api/notifications');
  const body = notifs.length
    ? el('div', { class: 'notif-list' },
      ...notifs.map((n) => el('div', { class: 'notif' + (n.read ? '' : ' unread') }, n.text, el('time', {}, n.date))))
    : el('div', { class: 'empty' }, 'لا إشعارات.');
  modal('الإشعارات', [body]);
  if (notifs.some((n) => !n.read)) {
    await API.post('/api/notifications/read');
    document.querySelector('.bell__count')?.remove();
  }
}

/* ---------- الموجّه ---------- */
async function route() {
  const hash = location.hash || '#/login';
  const app = document.getElementById('app');

  if (!API.token || hash === '#/login') {
    if (API.token && hash === '#/login') { location.hash = homeRoute(API.user.role); return; }
    app.innerHTML = '';
    viewLogin(app);
    return;
  }

  const guard = (roles, fn) => (roles.includes(API.user.role) ? fn : (r) => { r.append(el('div', { class: 'content' }, el('div', { class: 'alert alert--warning' }, 'ليست لديك صلاحية لهذه الصفحة.'))); });

  const traineeMatch = hash.match(/^#\/trainee\/(\d+)$/);
  if (traineeMatch) {
    await renderShell(hash, (r) => viewTraineePage(r, Number(traineeMatch[1])));
    return;
  }

  const routes = {
    '#/admin': guard(['admin'], viewAdminDash),
    '#/trainer': guard(['trainer'], viewTrainerDash),
    '#/accountant': guard(['accountant', 'admin'], viewAccountantDash),
    '#/me': guard(['trainee'], (r) => viewTraineePage(r, API.user.id)),
    '#/calendar': guard(['admin', 'trainer', 'trainee'], viewCalendar),
    '#/subscriptions': guard(['admin'], viewSubscriptions),
    '#/branches': guard(['admin'], viewBranches),
    '#/inbody': guard(['admin', 'trainer', 'trainee'], viewInbody),
    '#/meals': viewMeals,
    '#/reports': guard(['admin', 'accountant'], viewReports),
    '#/trainees': guard(['trainer', 'nutritionist'], viewMyTrainees),
  };

  const view = routes[hash];
  if (!view) { location.hash = homeRoute(API.user.role); return; }

  try {
    await renderShell(hash, view);
  } catch (ex) {
    toast(ex.message, true);
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = API.token ? homeRoute(API.user.role) : '#/login';
  route();
});

/* هيكل التطبيق: التوجيه + الشريط الجانبي + الإشعارات */

function homeRoute(role) {
  return { admin: '#/admin', trainer: '#/trainer', accountant: '#/accountant', trainee: '#/me', nutritionist: '#/meals' }[role] || '#/login';
}

const NAV = {
  admin: [
    ['#/admin', 'لوحة التحكم', 'grid'],
    ['#/calendar', 'التقويم والمواعيد', 'calendar'],
    ['#/subscriptions', 'الاشتراكات والحصص', 'card'],
    ['#/branches', 'الفروع والمدربون', 'building'],
    ['#/inbody', 'قراءات InBody', 'pulse'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
    ['#/reports', 'التقارير الشهرية', 'chart'],
  ],
  trainer: [
    ['#/trainer', 'لوحتي', 'grid'],
    ['#/calendar', 'مواعيدي', 'calendar'],
    ['#/trainees', 'متدربيّ', 'users'],
    ['#/inbody', 'قراءات InBody', 'pulse'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
  ],
  accountant: [
    ['#/accountant', 'اللوحة المالية', 'wallet'],
    ['#/reports', 'التقارير الشهرية', 'chart'],
  ],
  trainee: [
    ['#/me', 'صفحتي', 'user'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
  ],
  nutritionist: [
    ['#/meals', 'مكتبة التغذية', 'leaf'],
    ['#/trainees', 'المتدربون', 'users'],
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

  // عملة النظام من الإعدادات
  try {
    const cfg = await API.config();
    if (cfg.currency) ACTIVE_CURRENCY = cfg.currency;
  } catch (e) { /* الافتراضي شيكل */ }

  const nav = NAV[API.user.role] || [];
  const logoSrc = document.documentElement.getAttribute('data-theme') === 'dark' ? '/assets/logo-white.svg' : '/assets/logo-color.svg';
  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    el('div', { class: 'sidebar__logo' }, el('img', { src: logoSrc, alt: 'سبورت باور' })),
    el('div', { class: 'sidebar__caption' }, 'القائمة الرئيسية'),
    el('nav', { class: 'sidebar__nav' },
      ...nav.map(([href, label, ic]) => el('a', { href, class: route === href ? 'active' : '' }, icon(ic), label))),
    el('div', { class: 'sidebar__foot' },
      el('b', {}, 'سبورت باور © 2026'),
      'جسم أقوى. حياة أصحّ. نظام يبقى معك.'));

  const bellBtn = el('button', { class: 'iconbtn', title: 'الإشعارات', onclick: openNotifications }, icon('bell'));
  const main = el('div', { class: 'main' },
    el('header', { class: 'topbar' },
      el('button', { class: 'iconbtn menu-btn', onclick: () => sidebar.classList.toggle('open') }, icon('menu')),
      el('div', { class: 'topbar__title' }, TITLES[route] || 'نظام سبورت باور'),
      el('button', { class: 'iconbtn', title: 'الوضع الليلي / النهاري', onclick: toggleTheme }, icon('moon')),
      bellBtn,
      el('button', { class: 'iconbtn', title: 'تغيير كلمة المرور', onclick: openPasswordModal }, icon('key')),
      el('div', { class: 'topbar__user' },
        el('span', { class: 'topbar__avatar' }, (API.user.name || '؟').trim().slice(0, 1)),
        el('div', {},
          el('div', { style: 'font-weight:700;color:var(--app-ink);font-size:13px' }, API.user.name),
          el('div', { style: 'font-size:11px;color:var(--app-muted)' }, ROLE_LABELS[API.user.role] || API.user.role))),
      el('button', { class: 'iconbtn', title: 'خروج', onclick: async () => { await API.logout(); location.hash = '#/login'; } }, icon('logout'))),
    el('div', { id: 'view' }));

  app.append(el('div', { class: 'shell' }, sidebar, main));

  // تنبيه أمان: كلمة المرور الافتراضية لم تُغيَّر بعد
  if (API.user.mustChangePassword) {
    main.insertBefore(
      el('div', { class: 'alert alert--warning', style: 'margin:16px 28px 0;justify-content:space-between' },
        el('span', {}, '⚠️ ما زلت تستخدم كلمة المرور الافتراضية — غيّرها الآن لتأمين الحساب.'),
        el('button', { class: 'btn btn--accent btn--sm', onclick: openPasswordModal }, 'تغيير كلمة المرور')),
      document.getElementById('view'));
  }

  // عدّاد الإشعارات
  try {
    const notifs = await API.get('/api/notifications');
    const unread = notifs.filter((n) => !n.read).length;
    if (unread) bellBtn.append(el('span', { class: 'bell__count' }, String(unread)));
  } catch (e) { /* تجاهل */ }

  await renderView(document.getElementById('view'));
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', 'dark');
  try { localStorage.setItem('sp-theme', isDark ? 'light' : 'dark'); } catch (e) { /* تجاهل */ }
  route();
}

function openPasswordModal() {
  const cur = input({ type: 'password', placeholder: 'كلمة المرور الحالية', dir: 'ltr', style: 'text-align:end' });
  const nxt = input({ type: 'password', placeholder: '8 أحرف على الأقل', dir: 'ltr', style: 'text-align:end' });
  const rpt = input({ type: 'password', placeholder: 'تأكيد الجديدة', dir: 'ltr', style: 'text-align:end' });
  const close = modal('تغيير كلمة المرور', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        if (nxt.value !== rpt.value) { toast('كلمتا المرور غير متطابقتين.', true); return; }
        try {
          await API.post('/api/me/password', { current: cur.value, next: nxt.value });
          API.user.mustChangePassword = false;
          localStorage.setItem('sp-user', JSON.stringify(API.user));
          close();
          toast('تم تغيير كلمة المرور وإنهاء بقية الجلسات.');
          route();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('كلمة المرور الحالية', cur),
      field('كلمة المرور الجديدة', nxt),
      field('تأكيد كلمة المرور الجديدة', rpt),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ')),
  ]);
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

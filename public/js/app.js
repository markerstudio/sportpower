/* هيكل التطبيق: التوجيه + الشريط الجانبي + الإشعارات */

function homeRoute(role) {
  return { admin: '#/admin', trainer: '#/trainer', accountant: '#/accountant', trainee: '#/me', nutritionist: '#/meals' }[role] || '#/login';
}

const NAV = {
  admin: [
    ['#/actions', 'مركز القرارات', 'compass'],
    ['#/admin', 'لوحة التحكم', 'grid'],
    ['#/daily', 'المتابعة اليومية', 'clipboard'],
    ['#/kpi', 'الأهداف وKPI', 'target'],
    ['#/sales', 'متابعة المبيعات', 'wa'],
    ['#/packages', 'الباقات والعقود', 'tag'],
    ['#/ratings', 'تقييمات المتدربين', 'star'],
    ['#/loyalty', 'الولاء والإحالات', 'gift'],
    ['#/frozen', 'المجمدون', 'snow'],
    ['#/calendar', 'التقويم والمواعيد', 'calendar'],
    ['#/subscriptions', 'الاشتراكات والحصص', 'card'],
    ['#/branches', 'الفروع والمدربون', 'building'],
    ['#/inbody', 'قراءات InBody', 'pulse'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
    ['#/reports', 'التقارير الشهرية', 'chart'],
    ['#/roster', 'تقرير المتدربين بالأسماء', 'users'],
    ['#/settings', 'الإعدادات والتحكم', 'gear'],
  ],
  trainer: [
    ['#/actions', 'مركز قراراتي', 'compass'],
    ['#/trainer', 'لوحتي', 'grid'],
    ['#/calendar', 'مواعيدي', 'calendar'],
    ['#/trainees', 'المتدربون', 'users'],
    ['#/inbody', 'قراءات InBody', 'pulse'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
  ],
  accountant: [
    ['#/actions', 'مركز القرارات', 'compass'],
    ['#/accountant', 'اللوحة المالية', 'wallet'],
    ['#/daily', 'المتابعة اليومية', 'clipboard'],
    ['#/kpi', 'الأهداف وKPI', 'target'],
    ['#/sales', 'متابعة المبيعات', 'wa'],
    ['#/packages', 'الباقات والعقود', 'tag'],
    ['#/loyalty', 'الولاء والإحالات', 'gift'],
    ['#/calendar', 'التقويم والمواعيد', 'calendar'],
    ['#/subscriptions', 'الاشتراكات والحصص', 'card'],
    ['#/trainees', 'المتدربون', 'users'],
    ['#/frozen', 'المجمدون', 'snow'],
    ['#/reports', 'التقارير الشهرية', 'chart'],
    ['#/roster', 'تقرير المتدربين بالأسماء', 'users'],
  ],
  trainee: [
    ['#/me', 'صفحتي', 'user'],
    ['#/my-packages', 'باقاتي', 'tag'],
    ['#/points', 'نقاطي ومكافآتي', 'star'],
    ['#/meals', 'مكتبة التغذية', 'leaf'],
  ],
  nutritionist: [
    ['#/meals', 'مكتبة التغذية', 'leaf'],
    ['#/trainees', 'المتدربون', 'users'],
  ],
};

/* من يفتح أي صفحة — مصدرٌ واحد يستعمله الموجّه وأزرارُ مركز القرارات،
   فلا يُعرض للمدرب زرٌّ يقوده إلى «ليست لديك صلاحية». */
const ROUTE_ROLES = {
  '#/admin': ['admin'],
  '#/trainer': ['trainer'],
  '#/accountant': ['accountant', 'admin'],
  '#/me': ['trainee'],
  '#/calendar': ['admin', 'accountant', 'trainer', 'trainee'],
  '#/subscriptions': ['admin', 'accountant'],
  '#/branches': ['admin'],
  '#/inbody': ['admin', 'trainer', 'trainee'],
  '#/meals': null, // للجميع
  '#/reports': ['admin', 'accountant'],
  '#/roster': ['admin', 'accountant'],
  '#/trainees': ['trainer', 'nutritionist', 'accountant'],
  '#/settings': ['admin'],
  '#/daily': ['admin', 'accountant'],
  '#/kpi': ['admin', 'accountant'],
  '#/frozen': ['admin', 'accountant'],
  '#/sales': ['admin', 'accountant'],
  '#/loyalty': ['admin', 'accountant'],
  '#/points': ['trainee'],
  '#/my-packages': ['trainee'],
  '#/actions': ['admin', 'accountant', 'trainer'],
  '#/packages': ['admin', 'accountant'],
  '#/ratings': ['admin'],
};

/* ملف المتدرب مفتوح لكل الموظفين وللمتدرب على نفسه */
function canOpenRoute(hash, role) {
  const h = String(hash || '').split('?')[0];
  if (/^#\/trainee\/\d+$/.test(h)) return ['admin', 'accountant', 'trainer', 'nutritionist', 'trainee'].includes(role);
  if (!(h in ROUTE_ROLES)) return false;
  const allowed = ROUTE_ROLES[h];
  return !allowed || allowed.includes(role);
}

const TITLES = {
  '#/admin': 'لوحة تحكم الإدارة', '#/trainer': 'لوحة المدرب', '#/accountant': 'اللوحة المالية',
  '#/me': 'صفحتي', '#/calendar': 'التقويم والمواعيد', '#/subscriptions': 'إدارة الاشتراكات والحصص',
  '#/branches': 'الفروع والمدربون', '#/inbody': 'قراءات InBody', '#/meals': 'مكتبة التغذية',
  '#/reports': 'التقارير الشهرية', '#/trainees': 'المتدربون',
  '#/roster': 'تقرير المتدربين بالأسماء — بالفرع والاشتراك والدفعات',
  '#/settings': 'الإعدادات والتحكم',
  '#/daily': 'المتابعة اليومية', '#/kpi': 'الأهداف وKPI', '#/frozen': 'متابعة المجمدين',
  '#/sales': 'متابعة المبيعات', '#/loyalty': 'الولاء والإحالات', '#/points': 'نقاطي ومكافآتي',
  '#/actions': 'مركز القرارات — القرارات اليومية',
  '#/goals': 'أهداف المشتركين',
  '#/packages': 'الباقات والعقود', '#/ratings': 'تقييمات المتدربين (سرّي)',
  '#/my-packages': 'باقاتي — اشتراكي والباقات المتاحة',
};

/* جيل الرسم: نقرتان سريعتان على القائمة كانتا تُشغّلان رسمتين معًا،
   وكلٌّ منهما تُفرّغ الصفحة ثم تنتظر الخادم ثم تُلحق هيكلها — فينتهي
   الأمر بهيكلين فوق بعض ومعالجات مكررة (وضغطة واحدة تُرسل طلبين).
   كل رسمة تحمل رقمها، وأي رسمة تجاوزها غيرُها تنسحب بصمت. */
let renderSeq = 0;

async function renderShell(route, renderView) {
  const mine = ++renderSeq;
  const stale = () => mine !== renderSeq;
  const app = document.getElementById('app');
  app.innerHTML = '';

  // عملة النظام من الإعدادات — والفروع قد يكون لكلٍّ منها عملته
  try {
    const cfg = await API.config();
    if (cfg.currency) ACTIVE_CURRENCY = cfg.currency;
  } catch (e) { /* الافتراضي شيكل */ }
  try {
    for (const b of await API.get('/api/branches')) {
      if (b.currency) BRANCH_CURRENCY[b.id] = b.currency;
    }
  } catch (e) { /* الفروع تتبع عملة النظام */ }

  // مفتاح الدولة لروابط الواتساب — تحتاجه بطاقات الإجراءات والعقود
  if (['admin', 'accountant'].includes(API.user.role)) {
    try {
      const st = await API.get('/api/settings');
      OPS_SETTINGS.waCountryCode = st.waCountryCode || OPS_SETTINGS.waCountryCode || '970';
      OPS_SETTINGS.frozenMessage = st.frozenMessage || OPS_SETTINGS.frozenMessage || '';
    } catch (e) { /* الافتراضي */ }
  }

  const nav = NAV[API.user.role] || [];
  const logoSrc = document.documentElement.getAttribute('data-theme') === 'dark' ? '/assets/logo-white.svg' : '/assets/logo-color.svg';
  // على الموبايل: القائمة تنزلق فوق المحتوى مع خلفية معتمة، وتُغلق بالنقر خارجها أو باختيار صفحة
  const closeSidebar = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
  const toggleSidebar = () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show', sidebar.classList.contains('open'));
  };
  const sidebar = el('aside', { class: 'sidebar', id: 'sidebar' },
    el('div', { class: 'sidebar__logo' }, el('img', { src: logoSrc, alt: 'سبورت باور' })),
    el('div', { class: 'sidebar__caption' }, 'القائمة الرئيسية'),
    el('nav', { class: 'sidebar__nav' },
      ...nav.map(([href, label, ic]) => el('a', { href, class: route === href ? 'active' : '', onclick: closeSidebar }, icon(ic), label))),
    el('div', { class: 'sidebar__foot' },
      el('b', {}, 'سبورت باور © 2026'),
      el('div', { class: 'sidebar__slogan' }, 'change your life'),
      'جسم أقوى. حياة أصحّ. نظام يبقى معك.'));
  const backdrop = el('div', { class: 'sidebar-backdrop', onclick: closeSidebar });

  const bellBtn = el('button', { class: 'iconbtn', title: 'الإشعارات', onclick: openNotifications }, icon('bell'));
  const main = el('div', { class: 'main' },
    el('header', { class: 'topbar' },
      el('button', { class: 'iconbtn menu-btn', onclick: toggleSidebar }, icon('menu')),
      el('button', { class: 'iconbtn', title: 'عودة للصفحة السابقة', onclick: () => history.back() }, icon('back')),
      el('div', { class: 'topbar__title' }, TITLES[route] || (route.startsWith('#/trainee/') ? 'ملف المتدرب' : 'نظام سبورت باور')),
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

  if (stale()) return;
  app.innerHTML = '';
  app.append(el('div', { class: 'shell' }, sidebar, backdrop, main));

  // تنبيه أمان: كلمة المرور الافتراضية لم تُغيَّر بعد
  if (API.user.mustChangePassword) {
    main.insertBefore(
      el('div', { class: 'alert alert--warning', style: 'margin:16px 28px 0;justify-content:space-between' },
        el('span', {}, '⚠️ ما زلت تستخدم كلمة المرور الافتراضية — غيّرها الآن لتأمين الحساب.'),
        el('button', { class: 'btn btn--accent btn--sm', onclick: openPasswordModal }, 'تغيير كلمة المرور')),
      main.querySelector('#view'));
  }

  // عدّاد الإشعارات
  try {
    const notifs = await API.get('/api/notifications');
    const unread = notifs.filter((n) => !n.read).length;
    if (unread) bellBtn.append(el('span', { class: 'bell__count' }, String(unread)));
  } catch (e) { /* تجاهل */ }

  if (stale()) return;
  await renderView(main.querySelector('#view'));
  if (stale()) return;

  /* نشرة «ما الجديد» بعد اكتمال الصفحة — مرة واحدة لكل مستخدم بعد التحديث.
     المستخدم الذي عليه تغيير كلمة مروره يراها بعد أن ينتهي من ذلك. */
  if (!API.user.mustChangePassword) maybeShowWhatsNew();
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
  // نافذة مفتوحة أثناء التنقل (زر العودة مثلًا) كانت تترك غشاءها عالقًا فوق الصفحة الجديدة
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';

  /* العقد الإلكتروني: صفحة عامة يفتحها الزبون بلا تسجيل دخول */
  const contractMatch = hash.match(/^#\/contract\/([\w-]+)$/);
  if (contractMatch) {
    app.innerHTML = '';
    await viewPublicContract(app, contractMatch[1]);
    return;
  }

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

  const VIEWS = {
    '#/admin': viewAdminDash,
    '#/trainer': viewTrainerDash,
    '#/accountant': viewAccountantDash,
    '#/me': (r) => viewTraineePage(r, API.user.id),
    '#/calendar': viewCalendar,
    '#/subscriptions': viewSubscriptions,
    '#/branches': viewBranches,
    '#/inbody': viewInbody,
    '#/meals': viewMeals,
    '#/reports': viewReports,
    '#/roster': viewTraineeRoster,
    '#/trainees': viewMyTrainees,
    '#/settings': viewSettings,
    '#/daily': viewDaily,
    '#/kpi': viewKpi,
    '#/frozen': viewFrozen,
    '#/sales': viewSales,
    '#/loyalty': viewLoyalty,
    '#/points': viewMyPoints,
    '#/my-packages': viewMyPackages,
    '#/actions': viewActionCenter,
    '#/packages': viewPackages,
    '#/ratings': viewRatings,
  };
  const routes = Object.fromEntries(Object.entries(VIEWS)
    // null في ROUTE_ROLES = مفتوحة لكل الأدوار
    .map(([h, fn]) => [h, guard(ROUTE_ROLES[h] || Object.keys(NAV), fn)]));

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

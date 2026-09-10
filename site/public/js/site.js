/* ============================================================
   سبورت باور — الموقع العام: البيانات الحية من النظام والتفاعلات
   - الفرع أولًا: الزائر يختار فرعه (فلسطين/الأردن) فتظهر باقاته وحدها،
     بلا أسعار — السعر عند التواصل. الاختيار يُحفظ في المتصفح.
   - الباقات والفروع والدورات وبيانات التواصل من /api/public/site
   - نماذج الانضمام والاهتمام بالدورات → عميل محتمل في النظام
   ============================================================ */
(function () {
  'use strict';
  var T = window.SP_T || {};
  var C = window.SP_CONFIG || {};
  var lang = document.documentElement.lang || 'ar';
  var en = lang === 'en';
  var t = function (k) { return T[k] || k; };
  var url = function (p) { return en ? (p === '/' ? '/en/' : '/en' + p) : p; };
  var money = function (n, cur) { return Number(n || 0).toLocaleString('en-US') + ' ' + t('cur_' + cur); };
  var esc = function (s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var qs = new URLSearchParams(location.search);
  var motion = function (el) { if (window.SPMotion) window.SPMotion.observe(el); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* التخزين غير متاح */ } },
  };

  /* ---------- الوضع الليلي والقائمة واللغة ---------- */
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark');
    store.set('sp-theme', dark ? 'light' : 'dark');
  });
  var navToggle = document.getElementById('navToggle');
  var siteNav = document.getElementById('siteNav');
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', function () { var open = siteNav.classList.toggle('is-open'); navToggle.setAttribute('aria-expanded', String(open)); });
    siteNav.addEventListener('click', function (e) { if (e.target.tagName === 'A') siteNav.classList.remove('is-open'); });
  }
  var langSwitch = document.querySelector('[data-lang-switch]');
  if (langSwitch) langSwitch.addEventListener('click', function () { store.set('sp-lang', en ? 'ar' : 'en'); });
  var pref = store.get('sp-lang');
  if (pref && pref !== lang && location.pathname === (en ? '/en/' : '/') && !qs.has('stay')) location.replace(pref === 'en' ? '/en/' : '/');

  /* ---------- البيانات الحية ---------- */
  var API = (C.api || '').replace(/\/+$/, '');
  function loadSite() {
    var KEY = 'sp-site-v2';
    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) return Promise.resolve(cached.data);
    } catch (e) { /* تجاهُل */ }
    return fetch(API + '/api/public/site', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('site ' + r.status); return r.json(); })
      .then(function (data) { try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* تجاهُل */ } return data; });
  }

  /* ---------- الفرع المختار ---------- */
  var regionOf = function (b) { return b.currency === 'JOD' ? 'jo' : b.currency === 'ILS' ? 'ps' : 'intl'; };
  var regionLabel = function (r) { return t('loc_' + r); };
  var loc = { id: Number(qs.get('branch')) || Number(store.get('sp-branch')) || 0 };
  var listeners = [];
  function setBranch(id, data) {
    loc.id = Number(id) || 0;
    store.set('sp-branch', String(loc.id));
    listeners.forEach(function (fn) { fn(loc.id, data); });
  }
  var branchOf = function (data, id) { return (data.branches || []).filter(function (b) { return b.id === id; })[0] || null; };
  var catLabel = function (c) { return t('cat_' + (c || 'personal')); };

  /* اختيار الفرع: مجموعات بحسب البلد (فلسطين/الأردن) */
  function renderLocations(el, data) {
    var branches = data.branches || [];
    var groups = {};
    branches.forEach(function (b) { (groups[regionOf(b)] = groups[regionOf(b)] || []).push(b); });
    var big = el.classList.contains('loc-choose--big');
    el.innerHTML = ['ps', 'jo', 'intl'].filter(function (r) { return groups[r]; }).map(function (r) {
      return '<div class="loc-choose__group"><span class="loc-choose__region">' + esc(regionLabel(r)) + '</span><div class="loc-choose__row">'
        + groups[r].map(function (b) {
          return '<button type="button" class="loc-btn' + (b.id === loc.id ? ' is-on' : '') + '" data-branch="' + esc(b.id) + '">'
            + esc(b.name) + (big && b.address ? '<small>' + esc(b.address) + '</small>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    if (!el.hasAttribute('data-loc-bound')) {
      el.setAttribute('data-loc-bound', '1');
      el.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-branch]'); if (!btn) return;
        setBranch(btn.getAttribute('data-branch'), data);
        var target = el.closest('.hero') ? document.getElementById('packages') : null;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
  function syncLocationUi(data) {
    var b = branchOf(data, loc.id);
    document.querySelectorAll('[data-render="locations"]').forEach(function (el) { renderLocations(el, data); });
    document.querySelectorAll('[data-loc-name]').forEach(function (n) { n.textContent = b ? b.name : t('loc_pick'); });
    document.querySelectorAll('[data-loc-pill]').forEach(function (n) { n.classList.toggle('is-empty', !b); });
    document.querySelectorAll('[data-loc-title]').forEach(function (n) { n.textContent = b ? t('loc_current') + ' ' + b.name : t('packages_title'); });
    document.querySelectorAll('[data-loc-only]').forEach(function (n) { n.hidden = !b; });
    document.querySelectorAll('[data-loc-panel]').forEach(function (n) {
      n.classList.toggle('is-set', !!b);
      var title = n.querySelector('[data-loc-panel-title]');
      if (title) title.textContent = b ? t('loc_selected') + ' ' + b.name : t('loc_none_title');
    });
    document.querySelectorAll('[data-render="branches"] .branch-row').forEach(function (row) {
      var on = Number(row.getAttribute('data-branch-row')) === loc.id;
      row.classList.toggle('is-on', on);
      var btn = row.querySelector('.btn'); if (btn) { btn.textContent = on ? t('branch_picked') : t('branch_pick'); btn.classList.toggle('btn--outline', !on); btn.classList.toggle('btn--petrol', on); }
    });
  }

  /* ---------- الباقات — بلا أسعار ---------- */
  function packageCard(p, data, waNum) {
    var branch = branchOf(data, p.branchId) || branchOf(data, loc.id);
    var bName = branch ? branch.name : t('all_branches');
    var join = url('/join') + '?branch=' + encodeURIComponent(branch ? branch.id : '') + '&package=' + encodeURIComponent(p.name);
    var waText = t('wa_prefill_package').replace('{pkg}', p.name).replace('{branch}', bName);
    var wa = waNum ? 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(waText) : '';
    return '<article class="card pkg pkg--' + esc(p.category || 'personal') + '" id="pkg-' + esc(p.id) + '">'
      + '<div class="pkg__head"><span>' + esc(catLabel(p.category)) + '</span><span>' + esc(bName) + '</span></div>'
      + '<h3 class="pkg__name">' + esc(p.name) + '</h3>'
      + '<div class="pkg__meta"><span><b>' + esc(p.sessions) + '</b>' + esc(t('sessions')) + '</span>'
      + (p.sessionsPerWeek ? '<span><b>' + esc(p.sessionsPerWeek) + '</b>' + esc(t('per_week')) + '</span>' : '')
      + '<span><b>' + esc(p.durationDays) + '</b>' + esc(t('valid_days')) + '</span></div>'
      + (p.description ? '<p class="pkg__desc">' + esc(p.description) + '</p>' : '')
      + ((p.features || []).length ? '<ul class="pkg__features">' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '')
      + '<div class="pkg__price-note">' + esc(t('pkg_no_price')) + '</div>'
      + '<div class="pkg__actions"><a class="btn btn--accent btn--full" href="' + join + '">' + esc(t('pkg_book')) + '</a>'
      + (wa ? '<a class="btn btn--outline btn--full" href="' + esc(wa) + '" target="_blank" rel="noopener">' + esc(t('pkg_ask')) + '</a>' : '') + '</div>'
      + '</article>';
  }

  function renderPackages(el, data, cat) {
    var waNum = waNumber(data.contact || {});
    if (!loc.id) {
      el.innerHTML = '<div class="empty"><b>' + esc(t('loc_none_title')) + '</b><br>' + esc(t('loc_none_lead')) + '</div>';
      return;
    }
    var list = (data.packages || []).filter(function (p) { return !p.branchId || p.branchId === loc.id; });
    if (cat && cat !== 'all') list = list.filter(function (p) { return (p.category || 'personal') === cat; });
    var limit = Number(el.getAttribute('data-limit')) || 0;
    if (limit) { var seen = {}; list = list.filter(function (p) { if (seen[p.category]) return false; seen[p.category] = true; return true; }).slice(0, limit); }
    if (!list.length) { el.innerHTML = '<p class="empty">' + esc(t('no_packages')) + '</p>'; return; }
    if (el.getAttribute('data-group') === 'category') {
      el.innerHTML = ['personal', 'group', 'saver'].map(function (c) {
        var sub = list.filter(function (p) { return (p.category || 'personal') === c; });
        if (!sub.length) return '';
        return '<h2 class="packages-grid__title" id="' + c + '">' + esc(catLabel(c)) + '</h2><div class="packages-grid__row" data-stagger="up">' + sub.map(function (p) { return packageCard(p, data, waNum); }).join('') + '</div>';
      }).join('');
    } else {
      el.innerHTML = '<div class="packages-grid__row" data-stagger="up">' + list.map(function (p) { return packageCard(p, data, waNum); }).join('') + '</div>';
    }
    motion(el);
  }

  /* ---------- الفروع: صفوف مع زر الاختيار ---------- */
  function renderBranches(el, data) {
    var branches = data.branches || [];
    if (!branches.length) { el.innerHTML = ''; return; }
    el.innerHTML = branches.map(function (b) {
      return '<div class="branch-row" data-branch-row="' + esc(b.id) + '">'
        + '<div><h3>' + esc(b.name) + '</h3><span class="branch-row__region">' + esc(regionLabel(regionOf(b))) + '</span></div>'
        + '<p>' + esc(b.address || '') + '</p>'
        + (b.phone ? '<a class="tel" href="tel:' + esc(b.phone.replace(/\s/g, '')) + '">' + esc(b.phone) + '</a>' : '<span></span>')
        + '<button type="button" class="btn btn--outline btn--sm" data-branch="' + esc(b.id) + '">' + esc(t('branch_pick')) + '</button>'
        + '</div>';
    }).join('');
    if (!el.hasAttribute('data-loc-bound')) {
      el.setAttribute('data-loc-bound', '1');
      el.addEventListener('click', function (e) { var btn = e.target.closest('[data-branch]'); if (btn) setBranch(btn.getAttribute('data-branch'), data); });
    }
    motion(el);
  }

  /* ---------- الدورات ---------- */
  var locCourse = function (c) {
    var pick = function (ar, enV) { return (en && enV) ? enV : (ar || enV || ''); };
    return {
      slug: c.slug, title: pick(c.title, c.titleEn), tagline: pick(c.tagline, c.taglineEn), summary: pick(c.summary, c.summaryEn),
      lessons: c.lessons, modules: (c.modules || []).map(function (m) { return pick(m.title, m.titleEn); }),
      tiers: (c.tiers || []).map(function (x) { return { key: x.key, name: pick(x.name, x.nameEn), price: x.price, highlight: x.highlight === true, features: (en && (x.featuresEn || []).length ? x.featuresEn : x.features) || [] }; }),
      currency: c.currency || 'ILS', format: t('format_' + (c.format || 'hybrid')), startDate: c.startDate || '',
      minPrice: (c.tiers || []).length ? Math.min.apply(null, c.tiers.map(function (x) { return Number(x.price) || 0; })) : null,
    };
  };
  function courseCard(c) {
    var lc = locCourse(c);
    return '<article class="card course-card">'
      + '<div class="course-card__head"><span>' + esc(t('course_eyebrow')) + '</span>' + (lc.startDate ? '<span>' + esc(t('starts')) + ' ' + esc(lc.startDate) + '</span>' : '') + '</div>'
      + '<h3 class="course-card__title">' + esc(lc.title) + '</h3>'
      + (lc.tagline ? '<p class="course-card__tagline">' + esc(lc.tagline) + '</p>' : '')
      + (lc.summary ? '<p class="course-card__desc">' + esc(lc.summary) + '</p>' : '')
      + '<div class="pkg__meta">' + (lc.lessons ? '<span><b>' + esc(lc.lessons) + '</b>' + esc(t('lessons')) + '</span>' : '')
      + '<span><b>' + lc.modules.length + '</b>' + esc(t('modules_n')) + '</span><span><b>' + esc(lc.tiers.length) + '</b>' + esc(t('feat_tiers')) + '</span></div>'
      + (lc.minPrice !== null ? '<div class="course-card__price">' + esc(t('from_price')) + ' <b>' + esc(money(lc.minPrice, lc.currency)) + '</b></div>' : '')
      + '<a class="btn btn--accent" href="' + url('/courses/' + lc.slug) + '">' + esc(t('view_course')) + ' ←</a>'
      + '</article>';
  }
  function renderCourses(el, data) {
    var list = data.courses || [];
    if (!list.length) { el.innerHTML = '<p class="empty">' + esc(t('no_courses')) + '</p>'; return; }
    el.innerHTML = list.map(courseCard).join('');
    el.setAttribute('data-stagger', 'up'); motion(el);
  }
  /* قسم الدورة على الرئيسية */
  function renderCourseFeature(data) {
    var sec = document.getElementById('course'); if (!sec || !sec.classList.contains('feature')) return;
    var c = (data.courses || [])[0];
    if (!c) { sec.hidden = true; document.querySelectorAll('[data-announce]').forEach(function (a) { a.hidden = true; }); return; }
    var lc = locCourse(c);
    var q = function (k) { return sec.querySelector('[data-course-feature="' + k + '"]'); };
    var set = function (k, v) { var n = q(k); if (n) n.textContent = v || ''; };
    set('title', lc.title); set('tagline', lc.tagline); set('summary', lc.summary);
    var link = q('link'); if (link) link.href = url('/courses/' + lc.slug);
    var book = q('book'); if (book) book.href = url('/courses/' + lc.slug) + '#register';
    var meta = q('meta');
    if (meta) meta.innerHTML = (lc.lessons ? '<span>' + esc(lc.lessons) + ' ' + esc(t('lessons')) + '</span>' : '') + '<span>' + esc(lc.format) + '</span>' + (lc.startDate ? '<span>' + esc(t('starts')) + ' ' + esc(lc.startDate) + '</span>' : '');
    var mods = q('modules'); if (mods) mods.innerHTML = lc.modules.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
    var tiers = q('tiers');
    if (tiers) tiers.innerHTML = lc.tiers.map(function (x) {
      return '<li' + (x.highlight ? ' class="is-highlight"' : '') + '><div><b>' + esc(x.name) + '</b>' + (x.features[x.features.length - 1] ? '<small>' + esc(x.features[x.features.length - 1]) + '</small>' : '') + '</div><span>' + esc(money(x.price, lc.currency)) + '</span></li>';
    }).join('');
    document.querySelectorAll('[data-announce]').forEach(function (a) { a.href = url('/courses/' + lc.slug); });
  }

  /* ---------- بيانات التواصل وواتساب ---------- */
  function waNumber(contact) {
    var d = String(contact.whatsapp || contact.phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = (contact.waCountryCode || '970') + d.slice(1);
    return d;
  }
  function applyContact(contact) {
    contact = contact || {};
    var num = waNumber(contact);
    document.querySelectorAll('[data-wa]').forEach(function (a) {
      if (!num) { a.hidden = true; return; }
      var key = a.getAttribute('data-wa-text') || 'wa_prefill_training';
      if (a.hasAttribute('data-wa-from-query') && qs.get('interest') === 'course') key = 'wa_prefill_course';
      a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(t(key) + (a.getAttribute('data-wa-suffix') || ''));
      a.hidden = false;
    });
    var map = {
      phone: { text: contact.phone, href: contact.phone ? 'tel:' + contact.phone.replace(/\s/g, '') : '' },
      whatsapp: { text: contact.whatsapp, href: num ? 'https://wa.me/' + num : '' },
      email: { text: contact.email, href: contact.email ? 'mailto:' + contact.email : '' },
      address: { text: contact.address },
    };
    Object.keys(map).forEach(function (k) {
      document.querySelectorAll('[data-contact="' + k + '"]').forEach(function (n) {
        if (!map[k].text) { n.hidden = true; return; }
        n.textContent = map[k].text; if (map[k].href && n.tagName === 'A') n.href = map[k].href;
        if (k !== 'address') n.setAttribute('dir', 'ltr');
        n.hidden = false;
      });
      document.querySelectorAll('[data-contact-row="' + k + '"]').forEach(function (n) { n.hidden = !map[k].text; });
    });
    var socials = [
      ['instagram', 'Instagram', function (v) { return /^https?:/.test(v) ? v : 'https://instagram.com/' + v.replace(/^@/, ''); }],
      ['facebook', 'Facebook', function (v) { return /^https?:/.test(v) ? v : 'https://facebook.com/' + v; }],
      ['tiktok', 'TikTok', function (v) { return /^https?:/.test(v) ? v : 'https://tiktok.com/@' + v.replace(/^@/, ''); }],
    ].filter(function (s) { return contact[s[0]]; });
    document.querySelectorAll('[data-render="social"]').forEach(function (n) {
      n.innerHTML = socials.map(function (s) { return '<a href="' + esc(s[2](contact[s[0]])) + '" target="_blank" rel="noopener">' + s[1] + '</a>'; }).join('');
    });
    document.querySelectorAll('[data-contact-row="social"]').forEach(function (n) { n.hidden = !socials.length; });
  }

  /* ---------- النماذج ---------- */
  function fillSelects(data) {
    document.querySelectorAll('select[data-fill="branches"]').forEach(function (s) {
      (data.branches || []).forEach(function (b) { s.append(new Option(b.name, b.id)); });
      if (loc.id) s.value = String(loc.id);
    });
    document.querySelectorAll('select[data-fill="goals"]').forEach(function (s) { (data.goals || []).forEach(function (g) { s.append(new Option(g.label, g.key)); }); });
    document.querySelectorAll('select[data-fill="courses"]').forEach(function (s) {
      var tierSel = s.form && s.form.querySelector('select[data-fill="tiers"]');
      var fillTiers = function () {
        if (!tierSel) return;
        var c = (data.courses || []).filter(function (x) { return x.slug === s.value; })[0];
        tierSel.innerHTML = '<option value="">' + esc(t('undecided')) + '</option>';
        if (c) locCourse(c).tiers.forEach(function (x) { tierSel.append(new Option(x.name + ' — ' + money(x.price, c.currency || 'ILS'), x.key)); });
        var preTier = qs.get('tier'); if (preTier) tierSel.value = preTier;
      };
      (data.courses || []).forEach(function (c) { s.append(new Option(locCourse(c).title, c.slug)); });
      var pre = qs.get('course'); if (pre) s.value = pre; else if ((data.courses || []).length === 1) s.value = data.courses[0].slug;
      s.addEventListener('change', fillTiers); fillTiers();
    });
  }

  function setupForms() {
    document.querySelectorAll('form[data-lead]').forEach(function (form) {
      var radios = form.querySelectorAll('input[name="interest"][type="radio"]');
      var applyInterest = function () {
        var v = form.querySelector('input[name="interest"]:checked'); v = v ? v.value : (form.getAttribute('data-interest') || 'training');
        form.querySelectorAll('[data-when]').forEach(function (n) { n.hidden = n.getAttribute('data-when') !== v; });
      };
      radios.forEach(function (r) { r.addEventListener('change', applyInterest); });
      if (radios.length && qs.get('interest') === 'course') radios.forEach(function (r) { r.checked = r.value === 'course'; });
      applyInterest();
      var pkg = qs.get('package');
      var msg = form.querySelector('[name="message"]');
      if (pkg && msg && !msg.value) msg.value = (en ? 'Package: ' : 'الباقة: ') + pkg;

      var setErr = function (name, message) {
        var f = form.querySelector('[data-field="' + name + '"]'); if (!f) return;
        f.classList.toggle('field--error', !!message);
        var hint = f.querySelector('[data-hint]'); if (hint) hint.textContent = message || '';
      };
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(form); var body = {};
        fd.forEach(function (v, k) { body[k] = String(v).trim(); });
        var ok = true;
        if ((body.name || '').length < 2) { setErr('name', t('form_err_name')); ok = false; } else setErr('name', '');
        if ((body.phone || '').replace(/\D/g, '').length < 7) { setErr('phone', t('form_err_phone')); ok = false; } else setErr('phone', '');
        if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) { setErr('email', t('form_err_email')); ok = false; } else setErr('email', '');
        var errBox = form.querySelector('[data-form-error]'); errBox.hidden = true;
        if (!ok) return;
        var btn = form.querySelector('[data-submit]'); var label = btn.textContent;
        btn.disabled = true; btn.textContent = t('form_sending');
        fetch(API + '/api/public/site/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
          .then(function (r) {
            if (r.status !== 200 || !r.json.ok) {
              if (r.json.field) setErr(r.json.field, r.json.error);
              errBox.textContent = r.json.error || t('form_err_generic'); errBox.hidden = false;
              btn.disabled = false; btn.textContent = label; return;
            }
            location.href = url('/thanks') + '?interest=' + encodeURIComponent(body.interest || 'training');
          })
          .catch(function () { errBox.textContent = t('form_err_generic'); errBox.hidden = false; btn.disabled = false; btn.textContent = label; });
      });
    });
    document.querySelectorAll('[data-pick-tier]').forEach(function (a) {
      a.addEventListener('click', function () { var sel = document.querySelector('select[name="tier"]'); if (sel) sel.value = a.getAttribute('data-pick-tier'); });
    });
    document.querySelectorAll('[data-badge]').forEach(function (n) { n.textContent = t('badge_' + n.getAttribute('data-badge')); });
  }

  /* شريط الحجز الثابت في صفحة الدورة على الجوال */
  var sticky = document.querySelector('[data-sticky-cta]');
  if (sticky) {
    var formVisible = false;
    var reg = document.getElementById('register');
    var tick = function () { sticky.classList.toggle('is-visible', (window.scrollY || 0) > 520 && !formVisible); };
    if (reg && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { formVisible = es[0].isIntersecting; tick(); }, { threshold: 0.15 }).observe(reg);
    window.addEventListener('scroll', tick, { passive: true }); tick();
  }

  setupForms();
  loadSite().then(function (data) {
    /* إن جاء الزائر من رابط فيه فرع، أو اختار من قبل — وإلا يبقى الاختيار له */
    if (loc.id && !branchOf(data, loc.id)) loc.id = 0;
    applyContact(data.contact);
    fillSelects(data);
    renderCourseFeature(data);
    document.querySelectorAll('[data-render="courses"]').forEach(function (el) { renderCourses(el, data); });
    document.querySelectorAll('[data-render="branches"]').forEach(function (el) { renderBranches(el, data); });

    var catTabs = document.querySelector('[data-cat-tabs]');
    var cat = (location.hash || '').replace('#', '');
    if (['personal', 'group', 'saver'].indexOf(cat) === -1) cat = 'all';
    var drawPackages = function () {
      document.querySelectorAll('[data-render="packages"]').forEach(function (el) { renderPackages(el, data, el.hasAttribute('data-group') ? cat : 'all'); });
    };
    if (catTabs) {
      var pre = catTabs.querySelector('[data-tab="' + cat + '"]');
      if (pre) catTabs.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('is-on', b === pre); });
      catTabs.addEventListener('sp:tab', function (e) { if (e.detail !== cat) { cat = e.detail; drawPackages(); } });
    }
    listeners.push(function () { syncLocationUi(data); drawPackages(); if (catTabs && catTabs.reposition) setTimeout(catTabs.reposition, 50); });
    syncLocationUi(data);
    drawPackages();
    if (catTabs && catTabs.reposition) setTimeout(catTabs.reposition, 50);
    if (location.hash && location.hash !== '#choose') { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
  }).catch(function () {
    document.querySelectorAll('[data-render="packages"],[data-render="courses"],[data-render="branches"],[data-render="locations"]').forEach(function (el) {
      el.innerHTML = '<p class="empty">' + esc(t('load_error')) + '</p>';
    });
  });
})();

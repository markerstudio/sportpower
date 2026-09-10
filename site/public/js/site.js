/* ============================================================
   سبورت باور — الموقع العام: التفاعلات والبيانات الحية من النظام
   - القائمة الجوّالة، الوضع الليلي، تبديل اللغة
   - الباقات والفروع والدورات وبيانات التواصل تُقرأ من واجهة النظام
     (/api/public/site) — فما يُعدَّل في النظام يظهر هنا بلا نشر جديد
   - نماذج الانضمام والاهتمام بالدورات تُرسل إلى النظام كعميل محتمل
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

  /* ---------- الوضع الليلي ---------- */
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('sp-theme', dark ? 'light' : 'dark'); } catch (e) { /* تجاهُل */ }
  });

  /* ---------- القائمة الجوّالة ---------- */
  var navToggle = document.getElementById('navToggle');
  var siteNav = document.getElementById('siteNav');
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', function () {
      var open = siteNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    siteNav.addEventListener('click', function (e) { if (e.target.tagName === 'A') siteNav.classList.remove('is-open'); });
  }

  /* ---------- تفضيل اللغة: يُحفظ عند التبديل ويُستعمل عند فتح الرئيسية ---------- */
  var langSwitch = document.querySelector('[data-lang-switch]');
  if (langSwitch) langSwitch.addEventListener('click', function () { try { localStorage.setItem('sp-lang', en ? 'ar' : 'en'); } catch (e) { /* تجاهُل */ } });
  try {
    var pref = localStorage.getItem('sp-lang');
    if (pref && pref !== lang && location.pathname === (en ? '/en/' : '/') && !qs.has('stay')) location.replace(pref === 'en' ? '/en/' : '/');
  } catch (e) { /* تجاهُل */ }

  /* ---------- البيانات الحية من النظام ---------- */
  var API = (C.api || '').replace(/\/+$/, '');
  function loadSite() {
    var KEY = 'sp-site-v1';
    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) return Promise.resolve(cached.data);
    } catch (e) { /* تجاهُل */ }
    return fetch(API + '/api/public/site', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('site ' + r.status); return r.json(); })
      .then(function (data) { try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* تجاهُل */ } return data; });
  }

  var catLabel = function (c) { return t('cat_' + (c || 'personal')); };
  var branchName = function (data, id) { var b = (data.branches || []).filter(function (x) { return x.id === id; })[0]; return b ? b.name : t('all_branches'); };
  var locCourse = function (c) {
    var pick = function (ar, enV) { return (en && enV) ? enV : (ar || enV || ''); };
    return {
      slug: c.slug, title: pick(c.title, c.titleEn), tagline: pick(c.tagline, c.taglineEn), summary: pick(c.summary, c.summaryEn),
      lessons: c.lessons, modules: (c.modules || []).map(function (m) { return pick(m.title, m.titleEn); }),
      tiers: (c.tiers || []).map(function (x) { return { key: x.key, name: pick(x.name, x.nameEn), price: x.price }; }),
      currency: c.currency || 'ILS', format: t('format_' + (c.format || 'hybrid')), startDate: c.startDate || '',
      minPrice: (c.tiers || []).length ? Math.min.apply(null, c.tiers.map(function (x) { return Number(x.price) || 0; })) : null,
    };
  };

  /* --- الباقات --- */
  function packageCard(p, data) {
    var per = p.sessions ? Math.round(p.price / p.sessions) : null;
    var join = url('/join') + '?branch=' + (p.branchId || '') + '&package=' + encodeURIComponent(p.name);
    return '<article class="card pkg" id="pkg-' + p.id + '">'
      + '<div class="pkg__head"><span class="tag tag--accent">' + esc(catLabel(p.category)) + '</span><span class="pkg__branch">' + esc(branchName(data, p.branchId)) + '</span></div>'
      + '<h3 class="pkg__name">' + esc(p.name) + '</h3>'
      + '<div class="pkg__price">' + esc(money(p.price, p.currency)) + '</div>'
      + '<div class="pkg__meta"><span><b>' + esc(p.sessions) + '</b> ' + esc(t('sessions')) + '</span>'
      + (p.sessionsPerWeek ? '<span><b>' + esc(p.sessionsPerWeek) + '</b> ' + esc(t('per_week')) + '</span>' : '')
      + '<span><b>' + esc(p.durationDays) + '</b> ' + esc(t('valid_days')) + '</span></div>'
      + (p.description ? '<p class="pkg__desc">' + esc(p.description) + '</p>' : '')
      + ((p.features || []).length ? '<ul class="pkg__features">' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '')
      + (per ? '<div class="pkg__per">' + esc(t('per_session')) + ': ' + esc(money(per, p.currency)) + '</div>' : '')
      + '<a class="btn btn--accent btn--full" href="' + join + '">' + esc(t('choose')) + '</a>'
      + '</article>';
  }

  function renderPackages(el, data, branchId) {
    var list = (data.packages || []).slice();
    if (branchId) list = list.filter(function (p) { return !p.branchId || p.branchId === branchId; });
    var limit = Number(el.getAttribute('data-limit')) || 0;
    if (limit) {
      /* واجهة الرئيسية: أشهر باقة من كل نوع */
      var seen = {}; list = list.filter(function (p) { if (seen[p.category]) return false; seen[p.category] = true; return true; }).slice(0, limit);
    }
    if (!list.length) { el.innerHTML = '<p class="empty">' + esc(t('no_packages')) + '</p>'; return; }
    if (el.getAttribute('data-group') === 'category') {
      var order = ['personal', 'group', 'saver'];
      el.innerHTML = order.map(function (cat) {
        var sub = list.filter(function (p) { return (p.category || 'personal') === cat; });
        if (!sub.length) return '';
        return '<h2 class="packages-grid__title" id="' + cat + '">' + esc(catLabel(cat)) + '</h2><div class="packages-grid__row">' + sub.map(function (p) { return packageCard(p, data); }).join('') + '</div>';
      }).join('');
    } else {
      el.innerHTML = '<div class="packages-grid__row">' + list.map(function (p) { return packageCard(p, data); }).join('') + '</div>';
    }
  }

  function renderBranchTabs(el, data, onPick) {
    var branches = data.branches || [];
    if (branches.length < 2) { el.hidden = true; return; }
    var current = Number(qs.get('branch')) || 0;
    var draw = function () {
      el.innerHTML = [{ id: 0, name: t('all_branches') }].concat(branches).map(function (b) {
        return '<button type="button" role="tab" class="branch-tab' + (b.id === current ? ' is-on' : '') + '" aria-selected="' + (b.id === current) + '" data-branch="' + b.id + '">' + esc(b.name) + '</button>';
      }).join('');
    };
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-branch]'); if (!btn) return;
      current = Number(btn.getAttribute('data-branch')) || 0;
      draw(); onPick(current);
      var u = new URL(location.href); if (current) u.searchParams.set('branch', current); else u.searchParams.delete('branch'); history.replaceState(null, '', u);
    });
    draw();
    if (current) onPick(current);
  }

  /* --- الفروع --- */
  function renderBranches(el, data) {
    var branches = data.branches || [];
    if (!branches.length) { el.innerHTML = ''; return; }
    el.innerHTML = branches.map(function (b) {
      return '<div class="card branch"><h3>' + esc(b.name) + '</h3>'
        + (b.address ? '<p>' + esc(b.address) + '</p>' : '')
        + (b.phone ? '<a class="tag tag--neutral" href="tel:' + esc(b.phone.replace(/\s/g, '')) + '" dir="ltr">' + esc(b.phone) + '</a>' : '')
        + '</div>';
    }).join('');
  }

  /* --- الدورات --- */
  function courseCard(c) {
    var lc = locCourse(c);
    return '<article class="card course-card">'
      + '<div class="course-card__head"><span class="tag tag--accent">' + esc(t('course_eyebrow')) + '</span>'
      + (lc.startDate ? '<span class="tag tag--petrol">' + esc(t('starts')) + ' ' + esc(lc.startDate) + '</span>' : '') + '</div>'
      + '<h3 class="course-card__title">' + esc(lc.title) + '</h3>'
      + (lc.tagline ? '<p class="course-card__tagline">' + esc(lc.tagline) + '</p>' : '')
      + (lc.summary ? '<p class="course-card__desc">' + esc(lc.summary) + '</p>' : '')
      + '<div class="pkg__meta">' + (lc.lessons ? '<span><b>' + esc(lc.lessons) + '</b> ' + esc(t('lessons')) + '</span>' : '')
      + '<span><b>' + lc.modules.length + '</b> ' + esc(t('modules_n')) + '</span><span>' + esc(lc.format) + '</span></div>'
      + (lc.minPrice !== null ? '<div class="course-card__price">' + esc(t('from_price')) + ' <b>' + esc(money(lc.minPrice, lc.currency)) + '</b></div>' : '')
      + '<a class="btn btn--accent" href="' + url('/courses/' + lc.slug) + '">' + esc(t('view_course')) + ' ←</a>'
      + '</article>';
  }
  function renderCourses(el, data) {
    var list = data.courses || [];
    if (!list.length) { el.innerHTML = '<p class="empty">' + esc(t('no_courses')) + '</p>'; return; }
    el.innerHTML = list.map(courseCard).join('');
  }
  function renderCourseTeaser(data) {
    var c = (data.courses || [])[0];
    var sec = document.getElementById('course');
    if (!sec) return;
    if (!c) { sec.hidden = true; return; }
    var lc = locCourse(c);
    var set = function (k, v) { var n = sec.querySelector('[data-course-teaser="' + k + '"]'); if (n && v) n.textContent = v; };
    set('title', lc.title); set('summary', lc.summary);
    var link = sec.querySelector('[data-course-teaser="link"]'); if (link) link.href = url('/courses/' + lc.slug);
    var meta = sec.querySelector('[data-course-teaser="meta"]');
    if (meta) meta.innerHTML = (lc.lessons ? '<span class="tag tag--petrol">' + esc(lc.lessons) + ' ' + esc(t('lessons')) + '</span>' : '')
      + '<span class="tag tag--petrol">' + esc(lc.format) + '</span>'
      + (lc.minPrice !== null ? '<span class="tag tag--accent">' + esc(t('from_price')) + ' ' + esc(money(lc.minPrice, lc.currency)) + '</span>' : '');
    var mods = sec.querySelector('[data-course-teaser="modules"]');
    if (mods) mods.innerHTML = lc.modules.map(function (m, i) { return '<li><span>' + String(i + 1).padStart(2, '0') + '</span>' + esc(m) + '</li>'; }).join('');
  }

  /* --- بيانات التواصل وواتساب --- */
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
      var text = t(key) + (a.getAttribute('data-wa-suffix') || '');
      a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
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

  /* --- نماذج الطلب --- */
  function fillSelects(data) {
    document.querySelectorAll('select[data-fill="branches"]').forEach(function (s) {
      (data.branches || []).forEach(function (b) { s.append(new Option(b.name, b.id)); });
      var pre = qs.get('branch'); if (pre) s.value = pre;
    });
    document.querySelectorAll('select[data-fill="goals"]').forEach(function (s) {
      (data.goals || []).forEach(function (g) { s.append(new Option(g.label, g.key)); });
    });
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
      /* نوع الاهتمام: تدريب أو دورة — يبدّل الحقول المعروضة */
      var radios = form.querySelectorAll('input[name="interest"][type="radio"]');
      var applyInterest = function () {
        var v = form.querySelector('input[name="interest"]:checked'); v = v ? v.value : (form.getAttribute('data-interest') || 'training');
        form.querySelectorAll('[data-when]').forEach(function (n) { n.hidden = n.getAttribute('data-when') !== v; });
      };
      radios.forEach(function (r) { r.addEventListener('change', applyInterest); });
      if (radios.length && qs.get('interest') === 'course') { radios.forEach(function (r) { r.checked = r.value === 'course'; }); }
      applyInterest();
      /* باقة اختارها الزائر من صفحة الباقات تُذكر في الرسالة */
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
        var errBox = form.querySelector('[data-form-error]');
        errBox.hidden = true;
        if (!ok) return;
        var btn = form.querySelector('[data-submit]'); var label = btn.textContent;
        btn.disabled = true; btn.textContent = t('form_sending');
        fetch(API + '/api/public/site/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
          .then(function (r) {
            if (r.status !== 200 || !r.json.ok) {
              if (r.json.field) setErr(r.json.field, r.json.error);
              errBox.textContent = r.json.error || t('form_err_generic'); errBox.hidden = false;
              btn.disabled = false; btn.textContent = label;
              return;
            }
            try { sessionStorage.removeItem('sp-site-v1'); } catch (e2) { /* تجاهُل */ }
            location.href = url('/thanks') + '?interest=' + encodeURIComponent(body.interest || 'training');
          })
          .catch(function () { errBox.textContent = t('form_err_generic'); errBox.hidden = false; btn.disabled = false; btn.textContent = label; });
      });
    });
    /* زر باقة الدورة يختارها في النموذج */
    document.querySelectorAll('[data-pick-tier]').forEach(function (a) {
      a.addEventListener('click', function () {
        var sel = document.querySelector('select[name="tier"]'); if (sel) sel.value = a.getAttribute('data-pick-tier');
      });
    });
    document.querySelectorAll('[data-badge]').forEach(function (n) { n.textContent = t('badge_' + n.getAttribute('data-badge')); });
  }

  setupForms();
  loadSite().then(function (data) {
    applyContact(data.contact);
    fillSelects(data);
    document.querySelectorAll('[data-render="branches"]').forEach(function (el) { renderBranches(el, data); });
    document.querySelectorAll('[data-render="courses"]').forEach(function (el) { renderCourses(el, data); });
    renderCourseTeaser(data);
    document.querySelectorAll('[data-render="packages"]').forEach(function (el) {
      var tabs = document.querySelector('[data-render="branch-tabs"]');
      renderPackages(el, data, Number(qs.get('branch')) || 0);
      if (tabs) renderBranchTabs(tabs, data, function (id) { renderPackages(el, data, id); });
      if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
    });
  }).catch(function () {
    document.querySelectorAll('[data-render="packages"],[data-render="courses"],[data-render="branches"]').forEach(function (el) {
      el.innerHTML = '<p class="empty">' + esc(t('load_error')) + '</p>';
    });
    var teaser = document.getElementById('course'); if (teaser) teaser.querySelector('[data-course-teaser="modules"]').hidden = true;
  });
})();

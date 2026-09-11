/* ============================================================
   سبورت باور — «خطتك في دقيقة»
   رحلة من أربع خطوات: الفرع ← الهدف ← الالتزام ← طريقة التدريب،
   تنتهي باقتراح الباقة الأقرب من باقات النظام نفسها (بلا أسعار)،
   مع سبب الاقتراح، وبدائل قريبة، ورابط حجز معبّأ مسبقًا.
   يعتمد على window.SPSite الذي يصدّره site.js.
   ============================================================ */
(function () {
  'use strict';
  var S = window.SPSite;
  var app = document.querySelector('[data-plan-app]');
  if (!S || (!app && !document.querySelector('[data-ways]'))) return;

  var t = S.t, esc = S.esc, url = S.url;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STEPS = ['branch', 'goal', 'days', 'mode'];
  var MODES = ['personal', 'group', 'saver'];
  var DAYS = [2, 3, 4];
  var KEY = 'sp-plan';
  var data = null;

  var fill = function (s, map) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return map[k] === undefined ? m : map[k]; }); };

  var st = (function () {
    var d = { branch: 0, goal: '', days: 0, mode: '' };
    try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) { d.goal = raw.goal || ''; d.days = Number(raw.days) || 0; d.mode = raw.mode || ''; } } catch (e) { /* التخزين غير متاح */ }
    d.branch = S.getBranch() || 0;
    return d;
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ goal: st.goal, days: st.days, mode: st.mode })); } catch (e) { /* تجاهُل */ } }

  var answered = function (k) { return k === 'branch' ? !!st.branch : k === 'days' ? !!st.days : !!st[k]; };
  var firstOpen = function () { for (var i = 0; i < STEPS.length; i++) if (!answered(STEPS[i])) return i; return STEPS.length; };
  var cur = firstOpen();

  var goalLabel = function (key) {
    var g = (data && data.goals || []).filter(function (x) { return x.key === key; })[0];
    return g ? g.label : '';
  };

  /* ---------- المطابقة: ترتيب باقات الفرع بحسب إجابات الزائر ---------- */
  function forBranch() {
    return (data.packages || []).filter(function (p) { return !p.branchId || p.branchId === st.branch; });
  }
  function score(p) {
    var s = 0, cat = p.category || 'personal', spw = Number(p.sessionsPerWeek) || 0;
    if (cat === st.mode) s += 5;
    else if (st.mode === 'personal' && cat === 'saver') s += 2;
    else if (st.mode === 'saver' && cat === 'personal') s += 1;
    if (spw && st.days) { var d = Math.abs(spw - st.days); s += d === 0 ? 3 : d === 1 ? 1.5 : 0; }
    if (['therapy', 'athlete', 'football'].indexOf(st.goal) > -1 && cat === 'personal') s += 1.5;
    if (['loss', 'fat', 'muscle'].indexOf(st.goal) > -1 && spw >= 3) s += 1;
    if (st.goal === 'maintain' && spw && spw <= 2) s += 1;
    return s;
  }
  function ranked() {
    return forBranch().map(function (p) { return { p: p, s: score(p) }; })
      .sort(function (a, b) { return b.s - a.s || (Number(a.p.sessions) - Number(b.p.sessions)); })
      .map(function (x) { return x.p; });
  }

  /* ---------- لبنات العرض ---------- */
  function optBtn(val, label, small, on, extra) {
    return '<button type="button" class="opt' + (on ? ' is-on' : '') + '" data-val="' + esc(val) + '"' + (extra || '') + '>'
      + '<span class="opt__t">' + esc(label) + '</span>'
      + (small ? '<span class="opt__s">' + esc(small) + '</span>' : '') + '</button>';
  }
  function railHtml() {
    return '<ol class="plan__rail">' + STEPS.map(function (k, i) {
      var done = answered(k), on = i === cur && cur < STEPS.length;
      var value = k === 'branch' ? ((S.branchOf(st.branch) || {}).name || '')
        : k === 'goal' ? goalLabel(st.goal)
          : k === 'days' ? (st.days ? t('plan_days_' + st.days) : '')
            : (st.mode ? t('plan_mode_' + st.mode) : '');
      return '<li class="plan__rail-item' + (done ? ' is-done' : '') + (on ? ' is-on' : '') + '">'
        + '<button type="button" data-step="' + i + '"' + (done || on ? '' : ' disabled') + '>'
        + '<span class="plan__rail-n">' + (i + 1) + '</span>'
        + '<span class="plan__rail-l">' + esc(t('plan_s' + (i + 1))) + '</span>'
        + (value ? '<span class="plan__rail-v">' + esc(value) + '</span>' : '')
        + '</button></li>';
    }).join('') + '</ol>';
  }
  function stepHtml() {
    var k = STEPS[cur], opts = '';
    if (k === 'branch') {
      var groups = {};
      (data.branches || []).forEach(function (b) { (groups[S.regionOf(b)] = groups[S.regionOf(b)] || []).push(b); });
      opts = ['ps', 'jo', 'intl'].filter(function (r) { return groups[r]; }).map(function (r) {
        return '<div class="plan__group"><span class="plan__group-l">' + esc(S.regionLabel(r)) + '</span><div class="plan__opts">'
          + groups[r].map(function (b) { return optBtn(b.id, b.name, b.address, b.id === st.branch); }).join('') + '</div></div>';
      }).join('');
    } else if (k === 'goal') {
      opts = '<div class="plan__opts plan__opts--wrap">' + (data.goals || []).map(function (g) {
        return optBtn(g.key, g.label, '', g.key === st.goal);
      }).join('') + '</div>';
    } else if (k === 'days') {
      opts = '<div class="plan__opts plan__opts--3">' + DAYS.map(function (d) {
        return optBtn(d, t('plan_days_' + d), t('plan_days_' + d + '_s'), d === st.days);
      }).join('') + '</div>';
    } else {
      opts = '<div class="plan__opts plan__opts--3">' + MODES.map(function (m) {
        return optBtn(m, t('plan_mode_' + m), t('plan_mode_' + m + '_s'), m === st.mode);
      }).join('') + '</div>';
    }
    return '<div class="plan__view" data-view="step">'
      + '<p class="plan__of">' + esc(fill(t('plan_of'), { n: cur + 1, total: STEPS.length })) + '</p>'
      + '<h3 class="plan__q">' + esc(t('plan_q' + (cur + 1))) + '</h3>'
      + '<p class="plan__qs">' + esc(t('plan_q' + (cur + 1) + '_s')) + '</p>'
      + opts
      + (cur > 0 ? '<div class="plan__nav"><button type="button" class="plan__back" data-back>' + esc(t('plan_back')) + '</button></div>' : '')
      + '</div>';
  }
  function whyList(p) {
    var spw = Number(p.sessionsPerWeek) || 0;
    var why = [];
    var b = S.branchOf(st.branch);
    if (b) why.push(fill(t('plan_why_branch'), { b: b.name }));
    if (spw && st.days) why.push(spw === st.days ? fill(t('plan_why_days'), { n: spw }) : t('plan_why_days_near'));
    if (st.goal) why.push(fill(t('plan_why_goal'), { g: goalLabel(st.goal) }));
    why.push(t('plan_why_follow'));
    return '<ul class="plan-card__why">' + why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
  }
  function metaHtml(p) {
    return '<div class="pkg__meta"><span><b>' + esc(p.sessions) + '</b>' + esc(t('sessions')) + '</span>'
      + (p.sessionsPerWeek ? '<span><b>' + esc(p.sessionsPerWeek) + '</b>' + esc(t('per_week')) + '</span>' : '')
      + '<span><b>' + esc(p.durationDays) + '</b>' + esc(t('valid_days')) + '</span></div>';
  }
  function joinHref(p) {
    return url('/join') + '?interest=training&branch=' + encodeURIComponent(st.branch)
      + '&package=' + encodeURIComponent(p.name) + '&goal=' + encodeURIComponent(st.goal);
  }
  function waHref(p) {
    var num = S.waNumber(); if (!num) return '';
    var b = S.branchOf(st.branch);
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(fill(t('plan_wa_msg'), {
      pkg: p.name, branch: b ? b.name : '', goal: goalLabel(st.goal), days: st.days,
    }));
  }
  function resultHtml() {
    var list = ranked();
    var chips = '<div class="plan__chips"><span class="plan__chips-l">' + esc(t('plan_summary')) + '</span>'
      + STEPS.map(function (k, i) {
        var v = k === 'branch' ? ((S.branchOf(st.branch) || {}).name || '')
          : k === 'goal' ? goalLabel(st.goal)
            : k === 'days' ? t('plan_days_' + st.days) : t('plan_mode_' + st.mode);
        return '<button type="button" class="chip" data-step="' + i + '"><span>' + esc(v) + '</span><i aria-hidden="true">✎</i><span class="sr-only">' + esc(t('plan_edit')) + '</span></button>';
      }).join('') + '</div>';
    if (!list.length) {
      return '<div class="plan__view" data-view="result">' + chips
        + '<p class="empty">' + esc(t('plan_none')) + '</p>'
        + '<div class="plan__foot"><a class="btn btn--accent" href="' + url('/join') + '">' + esc(t('plan_book')) + '</a>'
        + '<button type="button" class="plan__restart" data-restart>' + esc(t('plan_restart')) + '</button></div></div>';
    }
    var best = list[0], alts = list.slice(1, 3);
    var wa = waHref(best);
    return '<div class="plan__view" data-view="result">' + chips
      + '<article class="plan-card plan-card--' + esc(best.category || 'personal') + '">'
      + '<div class="plan-card__media" aria-hidden="true"></div>'
      + '<div class="plan-card__body">'
      + '<p class="plan-card__kicker">' + esc(t('plan_result_kicker')) + '</p>'
      + '<h3 class="plan-card__name">' + esc(best.name) + '</h3>'
      + metaHtml(best)
      + (best.description ? '<p class="plan-card__desc">' + esc(best.description) + '</p>' : '')
      + whyList(best)
      + ((best.features || []).length ? '<ul class="pkg__features">' + best.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '')
      + '<div class="plan-card__cta"><a class="btn btn--accent btn--lg" href="' + joinHref(best) + '">' + esc(t('plan_book')) + '</a>'
      + (wa ? '<a class="btn btn--outline btn--lg" href="' + esc(wa) + '" target="_blank" rel="noopener">' + esc(t('plan_wa')) + '</a>' : '')
      + '</div></div></article>'
      + (alts.length ? '<div class="plan__alts"><h4 class="plan__alts-t">' + esc(t('plan_alts')) + '</h4><div class="plan__alts-row">'
        + alts.map(function (p) {
          return '<a class="alt" href="' + joinHref(p) + '"><span class="alt__cat">' + esc(S.catLabel(p.category)) + '</span>'
            + '<span class="alt__name">' + esc(p.name) + '</span>'
            + '<span class="alt__meta">' + esc(p.sessions) + ' ' + esc(t('sessions'))
            + (p.sessionsPerWeek ? ' · ' + esc(p.sessionsPerWeek) + ' ' + esc(t('per_week')) : '') + '</span></a>';
        }).join('') + '</div></div>' : '')
      + '<div class="plan__foot"><a class="btn btn--ghost" href="' + url('/packages') + '#choose">' + esc(t('plan_all')) + '</a>'
      + '<button type="button" class="plan__restart" data-restart>' + esc(t('plan_restart')) + '</button></div>'
      + '</div>';
  }

  /* ---------- الرسم والتنقّل ---------- */
  function swapStage(html) {
    var stage = app.querySelector('.plan__stage');
    var from = stage.offsetHeight;
    stage.innerHTML = html;
    if (!reduced && from) {
      var to = stage.scrollHeight;
      if (Math.abs(to - from) > 4) {
        stage.style.height = from + 'px';
        stage.getBoundingClientRect();
        stage.style.transition = 'height .38s cubic-bezier(0.22, 1, 0.36, 1)';
        stage.style.height = to + 'px';
        setTimeout(function () { stage.style.height = ''; stage.style.transition = ''; }, 420);
      }
    }
  }
  function render(keepScroll) {
    if (!app || !data) return;
    var rail = app.querySelector('.plan__rail');
    var railWrap = document.createElement('div');
    railWrap.innerHTML = railHtml();
    if (rail) rail.replaceWith(railWrap.firstChild); else app.prepend(railWrap.firstChild);
    swapStage(cur < STEPS.length ? stepHtml() : resultHtml());
    app.classList.toggle('is-done', cur >= STEPS.length);
    if (!keepScroll) {
      var box = app.getBoundingClientRect();
      if (box.top < 0 || box.top > window.innerHeight * 0.6) app.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }
  var choosing = false;
  function choose(val) {
    var at = cur, k = STEPS[at];
    choosing = true;
    /* setBranch يُطلق مستمعي الفرع، وهم قد يحرّكون cur — لذلك نحسب الخطوة التالية من at */
    if (k === 'branch') S.setBranch(Number(val));
    else if (k === 'days') st.days = Number(val);
    else st[k] = String(val);
    save();
    var next = at + 1;
    while (next < STEPS.length && answered(STEPS[next])) next++;
    cur = next;
    choosing = false;
    setTimeout(function () { render(true); }, reduced ? 0 : 160);
  }

  if (app) {
    app.innerHTML = '<div class="plan__stage"></div>';
    app.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-val]');
      if (opt) {
        opt.classList.add('is-on');
        opt.parentElement.querySelectorAll('.opt.is-on').forEach(function (n) { if (n !== opt) n.classList.remove('is-on'); });
        choose(opt.getAttribute('data-val'));
        return;
      }
      var step = e.target.closest('[data-step]');
      if (step) { cur = Number(step.getAttribute('data-step')); render(true); return; }
      if (e.target.closest('[data-back]')) { cur = Math.max(0, cur - 1); render(true); return; }
      if (e.target.closest('[data-restart]')) {
        st.goal = ''; st.days = 0; st.mode = ''; save(); cur = firstOpen(); render(true);
      }
    });
  }

  /* ---------- «ثلاث طرق للتدريب»: من باقات الفرع نفسها ---------- */
  function renderWays() {
    document.querySelectorAll('[data-ways]').forEach(function (el) {
      var all = forBranch();
      var cards = MODES.map(function (m) {
        var sub = all.filter(function (p) { return (p.category || 'personal') === m; });
        if (!sub.length) return '';
        var counts = sub.map(function (p) { return Number(p.sessions) || 0; }).sort(function (a, b) { return a - b; });
        var range = counts[0] === counts[counts.length - 1]
          ? fill(t('ways_one'), { a: counts[0] })
          : fill(t('ways_range'), { a: counts[0], b: counts[counts.length - 1] });
        return '<article class="way way--' + esc(m) + '">'
          + '<div class="way__media" aria-hidden="true"></div>'
          + '<div class="way__body">'
          + '<h3 class="way__name">' + esc(t('plan_mode_' + m)) + '</h3>'
          + '<p class="way__desc">' + esc(t('plan_mode_' + m + '_s')) + '</p>'
          + '<p class="way__meta">' + esc(sub.length === 1 ? t('ways_count_one') : fill(t('ways_count'), { n: sub.length })) + ' · ' + esc(range) + '</p>'
          + '<button type="button" class="way__btn" data-way="' + esc(m) + '">' + esc(t('ways_pick')) + ' <span aria-hidden="true">←</span></button>'
          + '</div></article>';
      }).join('');
      el.innerHTML = cards || '<p class="empty">' + esc(t('no_packages')) + '</p>';
      if (window.SPMotion) window.SPMotion.observe(el);
      if (!el.hasAttribute('data-ways-bound')) {
        el.setAttribute('data-ways-bound', '1');
        el.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-way]'); if (!btn) return;
          st.mode = btn.getAttribute('data-way'); save();
          cur = firstOpen();
          render();
          if (app) app.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        });
      }
    });
  }

  S.fail(function () {
    if (!app) return;
    var stage = app.querySelector('.plan__stage');
    if (stage) stage.innerHTML = '<div class="plan__view"><p class="empty">' + esc(t('load_error')) + '</p>'
      + '<div class="plan__foot"><a class="btn btn--accent" href="' + url('/join') + '">' + esc(t('plan_book')) + '</a></div></div>';
  });

  S.ready(function (d) {
    data = d;
    st.branch = S.getBranch() || 0;
    cur = firstOpen();
    render(true);
    renderWays();
  });
  S.onBranch(function (id) {
    if (!data) return;
    st.branch = Number(id) || 0;
    if (choosing) { renderWays(); return; }
    if (cur === 0 && st.branch) cur = firstOpen();
    render(true);
    renderWays();
  });
})();

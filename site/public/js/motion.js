/* ============================================================
   سبورت باور — طبقة الحركة والتفاعل (بلا مكتبات)
   - ترويسة تتحوّل زجاجية عند التمرير، وزر العودة للأعلى
   - ظهور العناصر عند التمرير ([data-reveal]) مع تتابع ([data-stagger])
   - عدّادات تصاعدية ([data-count])، وميلان ثلاثي الأبعاد ([data-tilt])
   - أكورديون ([data-accordion]) وتبويبات بمؤشر متحرك ([data-tabs])
   - شريط متحرك ([data-marquee]) وانزياح خلفية ([data-parallax])
   - قصاصات احتفال ([data-confetti])
   كل شيء يحترم prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  /* ---------- الترويسة وزر الأعلى ---------- */
  var header = document.querySelector('.site-header');
  var backTop = document.querySelector('[data-back-top]');
  var parallax = [].slice.call(document.querySelectorAll('[data-parallax]'));
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    raf(function () {
      var y = window.scrollY || 0;
      if (header) header.classList.toggle('is-scrolled', y > 24);
      if (backTop) backTop.classList.toggle('is-visible', y > 700);
      if (!reduce) parallax.forEach(function (n) {
        var f = parseFloat(n.getAttribute('data-parallax')) || 0.2;
        n.style.transform = 'translate3d(0,' + Math.round(y * f) + 'px,0)' + (n.getAttribute('data-parallax-base') || '');
      });
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (backTop) backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  /* ---------- الظهور عند التمرير + العدّادات ---------- */
  function countUp(node) {
    if (node.dataset.counted) return; node.dataset.counted = '1';
    var target = parseFloat(String(node.getAttribute('data-count') || node.textContent).replace(/[^\d.]/g, ''));
    if (!isFinite(target)) return;
    var suffix = node.getAttribute('data-suffix') || '';
    var decimals = (String(target).split('.')[1] || '').length;
    if (reduce) { node.textContent = target.toLocaleString('en-US') + suffix; return; }
    var dur = Math.min(1600, 600 + target * 2); var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur); var e = 1 - Math.pow(1 - p, 3);
      node.textContent = (target * e).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
      if (p < 1) raf(step);
    }
    raf(step);
  }
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
      [].forEach.call(e.target.querySelectorAll('[data-count]'), countUp);
      if (e.target.hasAttribute('data-count')) countUp(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }) : null;

  function observe(root) {
    var scope = root || document;
    [].forEach.call(scope.querySelectorAll('[data-stagger]'), function (parent) {
      [].forEach.call(parent.children, function (child, i) {
        child.style.setProperty('--i', i);
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', parent.getAttribute('data-stagger') || 'up');
      });
    });
    [].forEach.call(scope.querySelectorAll('[data-reveal]:not(.is-in), [data-count]:not([data-counted])'), function (n) {
      if (reduce || !io) { n.classList.add('is-in'); if (n.hasAttribute('data-count')) countUp(n); [].forEach.call(n.querySelectorAll('[data-count]'), countUp); }
      else io.observe(n);
    });
    bindTilt(scope); bindAccordion(scope); bindTabs(scope); bindMarquee(scope);
  }

  /* ---------- ميلان ثلاثي الأبعاد ---------- */
  function bindTilt(scope) {
    if (reduce || !window.matchMedia('(hover: hover)').matches) return;
    [].forEach.call(scope.querySelectorAll('[data-tilt]:not([data-tilt-bound])'), function (card) {
      card.setAttribute('data-tilt-bound', '1');
      var max = parseFloat(card.getAttribute('data-tilt')) || 6;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5; var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateX(' + (-y * max) + 'deg) rotateY(' + (x * max) + 'deg) translateY(-4px)';
        card.style.setProperty('--mx', (x + 0.5) * 100 + '%'); card.style.setProperty('--my', (y + 0.5) * 100 + '%');
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* ---------- أكورديون ---------- */
  function bindAccordion(scope) {
    [].forEach.call(scope.querySelectorAll('[data-accordion]:not([data-acc-bound])'), function (acc) {
      acc.setAttribute('data-acc-bound', '1');
      var single = acc.getAttribute('data-accordion') !== 'multi';
      acc.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-acc-toggle]'); if (!btn || !acc.contains(btn)) return;
        var item = btn.closest('[data-acc-item]'); var open = item.classList.contains('is-open');
        if (single) [].forEach.call(acc.querySelectorAll('[data-acc-item].is-open'), function (o) { setOpen(o, false); });
        setOpen(item, !open);
      });
      [].forEach.call(acc.querySelectorAll('[data-acc-item]'), function (item) { setOpen(item, item.classList.contains('is-open'), true); });
    });
    function setOpen(item, open, instant) {
      var panel = item.querySelector('[data-acc-panel]'); var btn = item.querySelector('[data-acc-toggle]');
      item.classList.toggle('is-open', open);
      if (btn) btn.setAttribute('aria-expanded', String(open));
      if (panel) { panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0px'; if (instant) panel.style.transition = 'none'; raf(function () { panel.style.transition = ''; }); }
    }
  }

  /* ---------- تبويبات بمؤشر منزلق ---------- */
  function bindTabs(scope) {
    [].forEach.call(scope.querySelectorAll('[data-tabs]:not([data-tabs-bound])'), function (tabs) {
      tabs.setAttribute('data-tabs-bound', '1');
      var ind = document.createElement('span'); ind.className = 'tabs__indicator'; tabs.appendChild(ind);
      function move(btn) {
        if (!btn) return;
        [].forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
        ind.style.width = btn.offsetWidth + 'px'; ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
        var target = btn.getAttribute('data-tab');
        [].forEach.call(document.querySelectorAll('[data-panel]'), function (p) {
          if (p.closest('[data-tabs-group]') !== tabs.closest('[data-tabs-group]')) return;
          p.hidden = target !== 'all' && p.getAttribute('data-panel') !== target;
        });
        tabs.dispatchEvent(new CustomEvent('sp:tab', { detail: target }));
      }
      tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) move(b); });
      window.addEventListener('resize', function () { move(tabs.querySelector('[data-tab].is-on')); });
      raf(function () { move(tabs.querySelector('[data-tab].is-on') || tabs.querySelector('[data-tab]')); });
    });
  }

  /* ---------- شريط متحرك: نضاعف المحتوى ليدور بلا فجوة ---------- */
  function bindMarquee(scope) {
    [].forEach.call(scope.querySelectorAll('[data-marquee]:not([data-marquee-bound])'), function (m) {
      m.setAttribute('data-marquee-bound', '1');
      var track = m.querySelector('.marquee__track'); if (!track) return;
      track.innerHTML += track.innerHTML;
      var speed = parseFloat(m.getAttribute('data-marquee')) || 40;
      track.style.animationDuration = Math.max(10, track.scrollWidth / 2 / speed) + 's';
    });
  }

  /* ---------- قصاصات الاحتفال ---------- */
  function confetti(host) {
    if (reduce) return;
    var colors = ['#79be43', '#3772ff', '#153131', '#e2b64a', '#ffffff'];
    for (var i = 0; i < 48; i++) {
      var p = document.createElement('i'); p.className = 'confetti__piece';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 1.2) + 's';
      p.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      p.style.width = (6 + Math.random() * 6) + 'px'; p.style.height = (10 + Math.random() * 8) + 'px';
      host.appendChild(p);
    }
    setTimeout(function () { host.innerHTML = ''; }, 5000);
  }
  [].forEach.call(document.querySelectorAll('[data-confetti]'), confetti);

  /* ---------- الكلمات المتحركة في العنوان ---------- */
  [].forEach.call(document.querySelectorAll('[data-words]'), function (h) {
    if (reduce) return;
    var k = 0; [].forEach.call(h.children, function (line) { if (line.tagName === 'BR') return; line.classList.add('word-in'); line.style.setProperty('--i', k++); });
  });

  document.documentElement.classList.add('has-motion');
  observe(document);
  window.SPMotion = { observe: observe, countUp: countUp };
})();

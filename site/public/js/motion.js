/* ============================================================
   سبورت باور — الحركة والتفاعل (بلا مكتبات)
   - ترويسة تنضغط عند التمرير، وزر العودة للأعلى
   - ظهور الأقسام عند التمرير ([data-reveal]) مع تتابع ([data-stagger])
   - أكورديون ([data-accordion]) وتبويبات بمؤشر منزلق ([data-tabs])
   يحترم prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  var header = document.querySelector('.site-header');
  var backTop = document.querySelector('[data-back-top]');
  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    raf(function () {
      var y = window.scrollY || 0;
      if (header) header.classList.toggle('is-scrolled', y > 24);
      if (backTop) backTop.classList.toggle('is-visible', y > 700);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (backTop) backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }) : null;

  function observe(root) {
    var scope = root || document;
    [].forEach.call(scope.querySelectorAll('[data-stagger]'), function (parent) {
      [].forEach.call(parent.children, function (child, i) {
        child.style.setProperty('--i', i);
        if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', parent.getAttribute('data-stagger') || 'up');
      });
    });
    [].forEach.call(scope.querySelectorAll('[data-reveal]:not(.is-in)'), function (n) {
      /* ما هو داخل الشاشة أو فوقها يظهر فورًا — لا ينتظر مراقبًا قد يفوته تمرير سريع */
      if (reduce || !io || n.getBoundingClientRect().top < window.innerHeight) n.classList.add('is-in'); else io.observe(n);
    });
    bindAccordion(scope); bindTabs(scope);
  }

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

  function bindTabs(scope) {
    [].forEach.call(scope.querySelectorAll('[data-tabs]:not([data-tabs-bound])'), function (tabs) {
      tabs.setAttribute('data-tabs-bound', '1');
      var ind = document.createElement('span'); ind.className = 'tabs__indicator'; tabs.appendChild(ind);
      function move(btn) {
        if (!btn) return;
        [].forEach.call(tabs.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
        ind.style.width = btn.offsetWidth + 'px'; ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
        tabs.dispatchEvent(new CustomEvent('sp:tab', { detail: btn.getAttribute('data-tab') }));
      }
      tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) move(b); });
      window.addEventListener('resize', function () { move(tabs.querySelector('[data-tab].is-on')); });
      raf(function () { move(tabs.querySelector('[data-tab].is-on') || tabs.querySelector('[data-tab]')); });
      tabs.reposition = function () { move(tabs.querySelector('[data-tab].is-on') || tabs.querySelector('[data-tab]')); };
    });
  }

  [].forEach.call(document.querySelectorAll('[data-words]'), function (h) {
    if (reduce) return;
    var k = 0; [].forEach.call(h.children, function (line) { if (line.tagName === 'BR') return; line.classList.add('word-in'); line.style.setProperty('--i', k++); });
  });

  document.documentElement.classList.add('has-motion');
  observe(document);
  window.SPMotion = { observe: observe };
})();

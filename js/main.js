/* ============================================================
   سبورت باور — التفاعلات
   نافذة الانضمام + التحقق من النموذج + حفظ الطلبات محليًا
   + القائمة الجوّالة + الوضع الليلي
   ============================================================ */
(function () {
  'use strict';

  /* ---------- الوضع الليلي / النهاري ---------- */
  var themeToggle = document.getElementById('themeToggle');
  var savedTheme = null;
  try { savedTheme = localStorage.getItem('sp-theme'); } catch (e) { /* التخزين غير متاح */ }
  if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  themeToggle.addEventListener('click', function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    try { localStorage.setItem('sp-theme', isDark ? 'light' : 'dark'); } catch (e) { /* تجاهُل */ }
  });

  /* ---------- القائمة الجوّالة ---------- */
  var navToggle = document.getElementById('navToggle');
  var siteNav = document.getElementById('siteNav');
  navToggle.addEventListener('click', function () {
    var open = siteNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  siteNav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      siteNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- نافذة الانضمام ---------- */
  var overlay = document.getElementById('joinOverlay');
  var modal = document.getElementById('joinModal');
  var form = document.getElementById('joinForm');
  var closeBtn = document.getElementById('joinClose');
  var doneBtn = document.getElementById('joinDone');
  var title = document.getElementById('joinTitle');
  var lastFocused = null;

  function openModal() {
    lastFocused = document.activeElement;
    modal.classList.remove('is-done');
    title.textContent = 'الانضمام إلى سبورت باور';
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    var first = form.querySelector('input');
    if (first) first.focus();
  }

  function closeModal() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('[data-join]').forEach(function (btn) {
    btn.addEventListener('click', openModal);
  });
  closeBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
  });

  /* ---------- التحقق من النموذج ---------- */
  function setError(name, message) {
    var field = form.querySelector('[data-field="' + name + '"]');
    if (!field) return;
    var hint = field.querySelector('[data-hint]');
    if (message) {
      field.classList.add('field--error');
      hint.textContent = message;
    } else {
      field.classList.remove('field--error');
      hint.textContent = '';
    }
  }

  function validate() {
    var ok = true;
    var name = form.name.value.trim();
    var email = form.email.value.trim();
    var phone = form.phone.value.trim();

    if (name.length < 2) { setError('name', 'يرجى إدخال الاسم الكامل.'); ok = false; }
    else setError('name', '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('email', 'يرجى إدخال بريد إلكتروني صحيح.'); ok = false; }
    else setError('email', '');

    if (!/^[+\d][\d\s-]{6,}$/.test(phone)) { setError('phone', 'يرجى إدخال رقم جوال صحيح.'); ok = false; }
    else setError('phone', '');

    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;

    var entry = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      program: form.program.value,
      at: new Date().toISOString()
    };
    try {
      var list = JSON.parse(localStorage.getItem('sp-signups') || '[]');
      list.push(entry);
      localStorage.setItem('sp-signups', JSON.stringify(list));
    } catch (err) { /* التخزين غير متاح — نكتفي بحالة النجاح */ }

    modal.classList.add('is-done');
    title.textContent = 'أنت معنا!';
    form.reset();
  });
})();

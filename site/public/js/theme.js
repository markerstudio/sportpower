/* يُطبَّق الوضع المحفوظ قبل الرسم حتى لا تومض الصفحة */
(function () {
  try { if (localStorage.getItem('sp-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) { /* التخزين غير متاح */ }
})();

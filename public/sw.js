/* ============================================================
   سبورت باور — عامل الخدمة (Service Worker)
   - الملفات الثابتة: cache-first مع تحديث بالخلفية
   - واجهات /api: شبكة فقط — لا تُخزَّن أبدًا (بيانات حية + مصادقة)
   - التنقلات: شبكة أولًا مع رجوع للنسخة المخزنة عند انقطاع الاتصال
   ============================================================ */
const VERSION = 'sp-v1';
const CORE = [
  '/',
  '/css/tokens.css',
  '/css/app.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/views-dash.js',
  '/js/views-pages.js',
  '/js/app.js',
  '/assets/logo-color.svg',
  '/assets/logo-white.svg',
  '/assets/mark-green.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // بيانات حية ومصادقة — لا تخزين إطلاقًا
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // تنقلات الصفحة: الشبكة أولًا (لالتقاط التحديثات)، ثم المخزن عند الانقطاع
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')));
    return;
  }

  // ملفات ثابتة: من المخزن فورًا مع تحديث بالخلفية (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }));
});

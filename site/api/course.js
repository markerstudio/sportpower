/* ============================================================
   صفحة الدورة — تُولَّد عند الطلب من بيانات النظام (لا من ملف ثابت)
   /courses/:slug و /en/courses/:slug (rewrite في vercel.json)
   محتوى الدورة يُقرأ من واجهة النظام العامة فيظهر تعديل الإدارة
   خلال دقائق، والصفحة كاملة HTML لمحركات البحث والمشاركة.
   ============================================================ */
const { renderPage, localizeCourse, localUrl } = require('../lib/render');
const config = require('../lib/config');

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const slug = String(q.slug || '').toLowerCase();
  const lang = q.lang === 'en' ? 'en' : 'ar';
  const alt = lang === 'en' ? 'ar' : 'en';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const notFound = () => {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end(renderPage('404', lang, config, { title: '404' }));
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return notFound();

  let payload;
  try {
    const r = await fetch(`${config.apiBase}/api/public/site/courses/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' } });
    if (r.status === 404) return notFound();
    if (!r.ok) throw new Error('upstream ' + r.status);
    payload = await r.json();
  } catch (e) {
    res.statusCode = 503;
    res.setHeader('Retry-After', '30');
    return res.end(renderPage('404', lang, config, { title: '503' }));
  }

  const course = localizeCourse(payload.course, lang);
  const pathAr = '/courses/' + course.slug;
  const html = renderPage('course', lang, config, {
    course,
    title: `${course.title} — Sport Power`,
    description: course.tagline || course.summary.slice(0, 160),
    canonical: config.siteUrl + localUrl(pathAr, lang),
    canonicalPath: localUrl(pathAr, lang),
    altUrl: localUrl(pathAr, alt),
    page_course: true,
  });
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  res.end(html);
};

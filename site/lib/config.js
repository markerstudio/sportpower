/* إعدادات النشر — من متغيرات البيئة في مشروع Vercel الخاص بالموقع:
     SITE_API_BASE  عنوان النظام (واجهته البرمجية) — مثل https://app.sport-power.net
     SITE_APP_URL   عنوان تسجيل الدخول للنظام (افتراضيًا = SITE_API_BASE)
     SITE_URL       العنوان الرسمي للموقع (للروابط القانونية وخريطة الموقع) */
const strip = (u) => String(u || '').trim().replace(/\/+$/, '');
const apiBase = strip(process.env.SITE_API_BASE) || 'https://app.sport-power.net';
module.exports = {
  apiBase,
  appUrl: strip(process.env.SITE_APP_URL) || apiBase,
  siteUrl: strip(process.env.SITE_URL) || 'https://www.sport-power.net',
};

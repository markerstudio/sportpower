#!/usr/bin/env node
/* ============================================================
   سبورت باور — بناء الموقع العام إلى dist/
   - كل صفحة تُولَّد بالعربية (/) وبالإنجليزية (/en/)
   - الملفات الثابتة تُنسخ كما هي من public/
   - js/config.js يحمل عنوان واجهة النظام (SITE_API_BASE) وعنوان التطبيق
   - sitemap.xml وrobots.txt و404.html
   الاستعمال: node build.js   |   node build.js --serve (معاينة محلية)
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { renderPage, LANGS, ROOT, readJson, localUrl, i18n } = require('./lib/render');
const config = require('./lib/config');

const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name); const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function write(rel, content) {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(PUBLIC, DIST);

  const pages = readJson(path.join(ROOT, 'src', 'pages.json'));
  const shop = readJson(path.join(ROOT, 'src', 'data', 'shop.json'));
  const urls = [];
  for (const lang of LANGS) {
    for (const [name, meta] of Object.entries(pages)) {
      const extra = name === 'shop' ? { items: shop.items.map((it) => ({ ...it, name: lang === 'en' ? it.nameEn : it.name, priceText: it.price.toLocaleString('en-US') })) } : {};
      const html = renderPage(name, lang, config, extra);
      const out = meta.path === '/' ? 'index.html' : meta.path.replace(/^\//, '') + '.html';
      write(lang === 'ar' ? out : path.join('en', out), html);
      if (meta.sitemap !== false) urls.push(config.siteUrl + localUrl(meta.path, lang));
    }
  }
  write('404.html', renderPage('404', 'ar', config, { title: '404' }));
  for (const lang of LANGS) write(`js/i18n.${lang}.js`, `window.SP_T=${JSON.stringify(i18n[lang])};\n`);
  write('js/config.js', `window.SP_CONFIG=${JSON.stringify({ api: config.apiBase, app: config.appUrl, site: config.siteUrl })};\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');
  console.log(`[site] بُنيت ${urls.length} صفحة إلى dist/ — API: ${config.apiBase}`);
}

/* خادم معاينة صغير بلا اعتماد خارجي: يحاكي cleanUrls ومسار الدورة */
function serve(port) {
  const http = require('http');
  const course = require('./api/course');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/(en\/)?courses\/([a-z0-9-]+)\/?$/);
    if (m) { req.query = { slug: m[2], lang: m[1] ? 'en' : 'ar' }; return course(req, res); }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(DIST, p);
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(DIST, '404.html'); res.statusCode = 404; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`[site] معاينة → http://localhost:${port}`));
}

if (require.main === module) {
  build();
  if (process.argv.includes('--serve')) serve(Number(process.env.PORT) || 4000);
}

module.exports = { build };

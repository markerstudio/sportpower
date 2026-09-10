/* اختبارات بناء الموقع: اللغتان، النصوص، القوالب، وصفحة الدورة */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.SITE_API_BASE = 'https://app.example.test';
process.env.SITE_URL = 'https://www.example.test';
const { renderPage, renderTemplate, localizeCourse, i18n, LANGS } = require('../lib/render');
const config = require('../lib/config');
const { build } = require('../build');

test('i18n: both languages carry the same keys', () => {
  const ar = Object.keys(i18n.ar).sort(); const en = Object.keys(i18n.en).sort();
  const missingEn = ar.filter((k) => !en.includes(k)); const missingAr = en.filter((k) => !ar.includes(k));
  assert.deepEqual(missingEn, [], 'keys missing from en.json');
  assert.deepEqual(missingAr, [], 'keys missing from ar.json');
});

test('template engine: sections, loops, inverted sections, escaping and local urls', () => {
  const out = renderTemplate('{{#items}}<i>{{.}}</i>{{/items}}{{^none}}empty{{/none}}{{name}}|{{{raw}}}|{{@/packages}}',
    [{ items: ['a', '<b>'], none: [], name: '<x>', raw: '<x>' }], 'en');
  assert.equal(out, '<i>a</i><i>&lt;b&gt;</i>empty&lt;x&gt;|<x>|/en/packages');
  assert.equal(renderTemplate('{{@/}}', [{}], 'ar'), '/');
  assert.equal(renderTemplate('{{@/}}', [{}], 'en'), '/en/');
});

test('build: every page renders in both languages with no leftover placeholders and correct direction', () => {
  build();
  const dist = path.join(__dirname, '..', 'dist');
  const pages = ['index', 'packages', 'courses', 'join', 'shop', 'about', 'privacy', 'thanks'];
  for (const lang of LANGS) {
    for (const p of pages) {
      const file = path.join(dist, lang === 'ar' ? '' : 'en', p + '.html');
      const html = fs.readFileSync(file, 'utf8');
      assert.ok(!/\{\{[^}]*\}\}/.test(html), `unrendered placeholder in ${lang}/${p}`);
      assert.match(html, lang === 'ar' ? /<html lang="ar" dir="rtl">/ : /<html lang="en" dir="ltr">/);
      assert.match(html, /hreflang="ar"/); assert.match(html, /hreflang="en"/);
      assert.match(html, /js\/config\.js/);
    }
  }
  const cfg = fs.readFileSync(path.join(dist, 'js', 'config.js'), 'utf8');
  assert.match(cfg, /https:\/\/app\.example\.test/);
  assert.ok(fs.existsSync(path.join(dist, 'sitemap.xml')) && fs.existsSync(path.join(dist, '404.html')));
  assert.ok(fs.existsSync(path.join(dist, 'css', 'fonts.css')) && fs.existsSync(path.join(dist, 'js', 'i18n.ar.js')));
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/www\.example\.test\/en\/packages/);
  assert.ok(!sitemap.includes('/thanks'), 'thanks page is not in the sitemap');
});

test('course page: localized from the system payload, tiers and modules rendered, English falls back to Arabic', () => {
  const course = {
    slug: 'coach-business', title: 'من مدرب', titleEn: 'From Coach', summary: 'ملخص', currency: 'ILS', format: 'hybrid', lessons: 10,
    methods: 'A.E.P · F.T.S · P&M',
    modules: [{ title: 'م١', text: 'ن١', titleEn: 'M1', textEn: '' }],
    tiers: [{ key: 'gold', name: 'Gold', price: 7200, features: ['أ'], featuresEn: [] }, { key: 'premium', name: 'Premium', price: 10000, highlight: true, features: ['ب'] }],
  };
  const en = localizeCourse(course, 'en');
  assert.equal(en.title, 'From Coach');
  assert.equal(en.summary, 'ملخص', 'missing English falls back to Arabic');
  assert.deepEqual(en.tiers[0].features, ['أ']);
  assert.equal(en.tiers[1].tierClass, 'tier--premium');
  assert.deepEqual(en.methods, ['A.E.P', 'F.T.S', 'P&M']);
  const html = renderPage('course', 'ar', config, { course: localizeCourse(course, 'ar'), title: 'x', page_course: true });
  assert.match(html, /tier--premium tier--highlight/);
  assert.match(html, /10,000/);
  assert.match(html, /<option value="gold">Gold — 7,200 شيكل<\/option>/);
  assert.match(html, /P&amp;M/);
  assert.match(html, /name="courseSlug" value="coach-business"/);
  assert.ok(!/\{\{[^}]*\}\}/.test(html));
});

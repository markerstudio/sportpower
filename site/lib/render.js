/* ============================================================
   سبورت باور — الموقع العام: محرّك القوالب الصغير + اللغتان
   يستعمله build.js (الصفحات الثابتة) وapi/course.js (صفحة الدورة
   المولَّدة عند الطلب) — فالتخطيط والنصوص مصدرٌ واحد للاثنين.

   الصيغة (شبيهة بـ Mustache):
     {{key}}            قيمة مهرَّبة (من السياق أو من نصوص اللغة t.)
     {{{key}}}          قيمة خام (HTML)
     {{@/path}}         رابط محلّي: /path بالعربية و /en/path بالإنجليزية
     {{#key}}…{{/key}}  قسم: يُكرَّر إن كانت مصفوفة، ويُعرض إن كانت صادقة
     {{^key}}…{{/key}}  عكس القسم
     {{.}}              العنصر الحالي داخل التكرار
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const LANGS = ['ar', 'en'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const i18n = Object.fromEntries(LANGS.map((l) => [l, readJson(path.join(SRC, 'i18n', l + '.json'))]));
const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');
const pageSrc = (name) => fs.readFileSync(path.join(SRC, 'pages', name + '.html'), 'utf8');

/* بحث بمسار منقّط في مكدس السياقات (الأعمق أولًا) */
function lookup(stack, key) {
  if (key === '.') return stack[stack.length - 1];
  for (let i = stack.length - 1; i >= 0; i--) {
    let cur = stack[i];
    if (cur === null || typeof cur !== 'object') continue;
    let ok = true;
    for (const part of key.split('.')) {
      if (cur !== null && typeof cur === 'object' && part in cur) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok) return cur;
  }
  return undefined;
}

function localUrl(p, lang) {
  const clean = p.startsWith('/') ? p : '/' + p;
  if (lang === 'ar') return clean;
  return clean === '/' ? '/en/' : '/en' + clean;
}

function renderTemplate(tpl, stack, lang) {
  let out = '';
  let i = 0;
  const sectionRe = /\{\{([#^])\s*([\w.]+)\s*\}\}/g;
  while (i < tpl.length) {
    sectionRe.lastIndex = i;
    const m = sectionRe.exec(tpl);
    if (!m) { out += renderInline(tpl.slice(i), stack, lang); break; }
    out += renderInline(tpl.slice(i, m.index), stack, lang);
    const [, kind, key] = m;
    // إيجاد قفل القسم المطابق مع مراعاة التداخل بالاسم نفسه
    const openRe = new RegExp('\\{\\{[#^]\\s*' + key.replace('.', '\\.') + '\\s*\\}\\}', 'g');
    const closeTag = new RegExp('\\{\\{/\\s*' + key.replace('.', '\\.') + '\\s*\\}\\}', 'g');
    let depth = 1; let pos = m.index + m[0].length; let end = -1;
    while (depth > 0) {
      openRe.lastIndex = pos; closeTag.lastIndex = pos;
      const o = openRe.exec(tpl); const c = closeTag.exec(tpl);
      if (!c) throw new Error('قسم غير مغلق: ' + key);
      if (o && o.index < c.index) { depth++; pos = o.index + o[0].length; }
      else { depth--; pos = c.index + c[0].length; if (depth === 0) end = c.index; }
    }
    const inner = tpl.slice(m.index + m[0].length, end);
    const val = lookup(stack, key);
    if (kind === '^') {
      const empty = !val || (Array.isArray(val) && !val.length);
      if (empty) out += renderTemplate(inner, stack, lang);
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => { out += renderTemplate(inner, [...stack, { index: idx + 1, first: idx === 0, last: idx === val.length - 1 }, item], lang); });
    } else if (val && typeof val === 'object') {
      out += renderTemplate(inner, [...stack, val], lang);
    } else if (val) {
      out += renderTemplate(inner, stack, lang);
    }
    i = pos;
  }
  return out;
}

function renderInline(s, stack, lang) {
  return s
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => { const v = lookup(stack, k); return v === undefined || v === null ? '' : String(v); })
    .replace(/\{\{@([^}]+)\}\}/g, (_, p) => localUrl(p.trim(), lang))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const v = lookup(stack, k); return v === undefined || v === null ? '' : esc(v); });
}

/* السياق الأساسي لصفحة: اللغة، الاتجاه، النصوص، الروابط، الإعدادات */
function baseContext(lang, config, page, extra = {}) {
  const t = i18n[lang];
  const isEn = lang === 'en';
  const altLang = isEn ? 'ar' : 'en';
  const pathAr = page.path || '/';
  return {
    lang, dir: isEn ? 'ltr' : 'rtl', isEn, isAr: !isEn, altLang,
    altLabel: isEn ? 'العربية' : 'English',
    t,
    page: page.name,
    ['page_' + page.name]: true,
    siteUrl: config.siteUrl,
    appUrl: config.appUrl,
    apiBase: config.apiBase,
    canonical: config.siteUrl + localUrl(pathAr, lang),
    canonicalPath: localUrl(pathAr, lang),
    altUrl: localUrl(pathAr, altLang),
    year: new Date().getFullYear(),
    ...extra,
  };
}

/* تحويل عنصرٍ من واجهة النظام (دورة/باقة) إلى نصوص لغة الصفحة */
function localizeCourse(c, lang) {
  const en = lang === 'en';
  const pick = (ar, enV) => (en && enV ? enV : ar || enV || '');
  const tiers = (c.tiers || []).map((t) => ({
    ...t,
    name: pick(t.name, t.nameEn),
    features: en && (t.featuresEn || []).length ? t.featuresEn : (t.features || []),
    priceText: Number(t.price).toLocaleString('en-US'),
    tierClass: 'tier--' + (['silver', 'gold', 'premium'].includes(t.key) ? t.key : 'silver'),
  }));
  return {
    ...c,
    title: pick(c.title, c.titleEn), tagline: pick(c.tagline, c.taglineEn),
    summary: pick(c.summary, c.summaryEn), audience: pick(c.audience, c.audienceEn),
    durationText: pick(c.durationText, c.durationTextEn),
    formatLabel: i18n[lang]['format_' + (c.format || 'hybrid')] || c.format,
    currencyLabel: i18n[lang]['cur_' + (c.currency || 'ILS')] || c.currency,
    methods: (c.methods || '').split(/[·,]/).map((s) => s.trim()).filter(Boolean),
    modules: (c.modules || []).map((m, i) => ({ ...m, num: String(i + 1).padStart(2, '0'), title: pick(m.title, m.titleEn), text: pick(m.text, m.textEn) })),
    tiers,
    hasTiers: tiers.length > 0,
    url: localUrl('/courses/' + c.slug, lang),
  };
}

function renderPage(name, lang, config, extra = {}) {
  const pages = readJson(path.join(SRC, 'pages.json'));
  const page = { name, ...(pages[name] || {}) };
  const ctx = baseContext(lang, config, page, extra);
  const t = ctx.t;
  ctx.title = extra.title || t['title_' + name] || t.site_name;
  ctx.description = extra.description || t['desc_' + name] || t.site_desc;
  ctx.canonical = extra.canonical || ctx.canonical;
  ctx.altUrl = extra.altUrl || ctx.altUrl;
  const stack = [ctx.t, ctx];
  const body = renderTemplate(pageSrc(page.template || name), stack, lang);
  return renderTemplate(layout, [...stack, { content: body }], lang);
}

module.exports = { renderPage, renderTemplate, localizeCourse, localUrl, LANGS, i18n, ROOT, SRC, esc, readJson };

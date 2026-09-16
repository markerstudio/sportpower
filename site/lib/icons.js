/* ============================================================
   أيقونات صفحة الدورة — SVG مضمَّن (خطّي، يرث اللون من النص)
   محاور الدورة تُعيَّن بالترتيب (المحور الأول → system … وهكذا، ثم تدور)،
   وأساليب التدريب بالاسم (A.E.P / F.T.S / P&M) مع أيقونة افتراضية.
   ============================================================ */
const svg = (inner, extra = '') => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${inner}</svg>`;

const MODULE_ICONS = [
  /* سيستم: ترس */
  svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  /* دخل: أعمدة تصاعدية */
  svg('<path d="M4 20h16"/><rect x="5.5" y="12" width="3.4" height="6" rx=".6"/><rect x="10.3" y="8" width="3.4" height="10" rx=".6"/><rect x="15.1" y="4.5" width="3.4" height="13.5" rx=".6"/>'),
  /* سوشال ميديا: شاشة وقلب */
  svg('<rect x="3" y="4" width="18" height="13" rx="2.2"/><path d="M9 21h6M12 17v4"/><path d="M12 13.6s-3.3-2-3.3-4.1a1.8 1.8 0 0 1 3.3-1 1.8 1.8 0 0 1 3.3 1c0 2.1-3.3 4.1-3.3 4.1z"/>'),
  /* مبيعات: مصافحة */
  svg('<path d="M3 11.5 7.5 7h3l3 2.5"/><path d="M21 11.5 16.5 7H13"/><path d="M3 11.5l4.5 4.5a1.5 1.5 0 0 0 2.2-.1l.1-.1a1.5 1.5 0 0 0 2.1 0l.2-.2a1.5 1.5 0 0 0 2.2 0l.1-.1a1.5 1.5 0 0 0 2.2-2.1L13.5 9.5"/><path d="M21 11.5l-3.5 3.5"/>'),
  /* فريق: ثلاثة أشخاص */
  svg('<circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/><path d="M2.5 18a3.5 3.5 0 0 1 4-3.4M21.5 18a3.5 3.5 0 0 0-4-3.4"/>'),
  /* أساليب حديثة: دمبل */
  svg('<path d="M8 12h8"/><rect x="4.5" y="8" width="3.5" height="8" rx="1"/><rect x="16" y="8" width="3.5" height="8" rx="1"/><path d="M2.5 10v4M21.5 10v4"/>'),
];

const METHOD_ICONS = {
  /* A.E.P — نبض */
  aep: svg('<path d="M2.5 12h4l2.2-5 3 10 2.6-7.5 1.7 2.5h5.5"/>'),
  /* F.T.S — بار حديد */
  fts: svg('<path d="M7 12h10"/><rect x="3" y="7.5" width="4" height="9" rx="1"/><rect x="17" y="7.5" width="4" height="9" rx="1"/><path d="M1 10v4M23 10v4"/>'),
  /* P&M — وضعية جسم */
  pm: svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7"/><path d="M8 9.5l4-1.5 4 1.5"/><path d="M12 14l-3 6M12 14l3 6"/>'),
  default: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4l2.8 1.6"/>'),
};

/* A.E.P → aep، P&M → pm */
const methodKey = (name) => String(name || '').toLowerCase().replace(/[^a-z]/g, '');

module.exports = { MODULE_ICONS, METHOD_ICONS, methodKey };

/* ============================================================
   ساعة النادي — التاريخ والوقت بالتوقيت المحلي لا UTC
   الخادم على Vercel بتوقيت UTC؛ لو أُخذ «اليوم» و«الآن» منه مباشرة
   لسُجّل ما بعد منتصف الليل محليًا بتاريخ الأمس، ولتأخّر رصد الغياب
   بفارق المنطقة. Intl يعطي التاريخ المحلي مهما كان توقيت العملية.
   الافتراضي Asia/Jerusalem (يغطّي الضفة وعمّان بفارق ساعة على الأكثر)،
   ويُضبط بمتغيّر البيئة CLUB_TZ.
   ============================================================ */
const CLUB_TZ = process.env.CLUB_TZ || 'Asia/Jerusalem';

function parts() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
}

const todayStr = () => { const p = parts(); return `${p.year}-${p.month}-${p.day}`; };
// ساعة en-CA قد تُخرج «24» عند منتصف الليل — تُطبَّع إلى «00»
const nowLocalMinute = () => { const p = parts(); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`; };
const thisMonthStr = () => todayStr().slice(0, 7);

module.exports = { CLUB_TZ, todayStr, nowLocalMinute, thisMonthStr };

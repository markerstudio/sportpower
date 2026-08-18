/* ============================================================
   سبورت باور — أهداف المشتركين: التصنيف الواحد
   كان الهدف ثلاثةَ أنواع فقط (نزول وزن · زيادة عضل · تثبيت)، فأُضيفت
   بطلب العميل: نزول دهون، لاعب فطبول، لاعب رياضي، علاجي.

   ولأن الهدف ليس تسميةً فحسب — تقرأ به لوحةُ القياسات اتجاهَ الوزن،
   ويحكم به مركزُ القرارات على التقدّم، وتُصفّى به مكتبةُ التغذية —
   يُعرَّف هنا مرة واحدة بكل ما يترتب عليه، فلا يُضاف هدفٌ جديد ويبقى
   النظام يقرأ نتائجه بمنطق هدفٍ آخر.
   ============================================================ */

/* mealGoal: مكتبة التغذية مبنية على ثلاثة مسارات — كل هدف جديد يُسنَد
   لمساره حتى لا يجد المتدرب صفحة وجبات فارغة.
   weightUpIsGood: اتجاه الوزن المرغوب (null = لا حكم على الوزن). */
const GOALS = {
  loss:      { label: 'نزول وزن',        mealGoal: 'loss',     weightUpIsGood: false },
  fat:       { label: 'نزول دهون',       mealGoal: 'loss',     weightUpIsGood: null },
  muscle:    { label: 'بناء كتلة عضلية', mealGoal: 'muscle',   weightUpIsGood: true },
  football:  { label: 'لاعب فطبول',      mealGoal: 'muscle',   weightUpIsGood: null },
  athlete:   { label: 'لاعب رياضي',      mealGoal: 'muscle',   weightUpIsGood: null },
  therapy:   { label: 'علاجي',           mealGoal: 'maintain', weightUpIsGood: null },
  maintain:  { label: 'تثبيت وزن',       mealGoal: 'maintain', weightUpIsGood: null },
};

const GOAL_KEYS = Object.keys(GOALS);
const GOAL_LABELS = Object.fromEntries(GOAL_KEYS.map((k) => [k, GOALS[k].label]));
const isGoal = (g) => GOAL_KEYS.includes(g);
const goalOf = (g) => GOALS[g] || GOALS.loss;
/* مسار مكتبة التغذية لهذا الهدف — الأهداف السبعة تنزل على ثلاثة مسارات */
const mealGoalOf = (g) => goalOf(g).mealGoal;

/* هل تحسّن المتدرب بين قراءتين؟ الحكم يتبع هدفه لا الوزن وحده:
   من يبني عضلًا زيادةُ وزنه تقدّم، ومن هدفه علاجي لا يُحكم عليه بالميزان.
   القيم: فروق (آخر − أول) بالكيلوغرام والنسبة المئوية. */
function improvedFor(goal, { dWeight, dFat, dMuscle }) {
  const up = (v, by) => v != null && v > by;
  const down = (v, by) => v != null && v < -by;
  switch (goal) {
    case 'muscle':
      return up(dMuscle, 0.3) || (up(dWeight, 0.5) && (dFat == null || dFat <= 0));
    case 'fat':
      return down(dFat, 0.5) || up(dMuscle, 0.3);
    // اللاعب والرياضي: الأداء يُقاس بالتركيب لا بالميزان — عضلٌ أعلى أو دهونٌ أقل
    case 'football':
    case 'athlete':
      return up(dMuscle, 0.3) || down(dFat, 0.5);
    /* العلاجي: التحسّن طبّي لا رقميّ، فأي ثبات أو تحسّن في التركيب يكفي —
       ولا يُنشأ له قرارُ «بلا تقدّم» على تراجع وزنٍ قد يكون مقصودًا. */
    case 'therapy':
      return !down(dMuscle, 0.5);
    case 'maintain':
      return down(dFat, 0.5) || up(dMuscle, 0.3);
    default: // نزول وزن
      return down(dWeight, 0.5) || down(dFat, 0.5);
  }
}

module.exports = { GOALS, GOAL_KEYS, GOAL_LABELS, isGoal, goalOf, mealGoalOf, improvedFor };

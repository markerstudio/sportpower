/* ============================================================
   سبورت باور — نطاق الفروع
   الفرع المطلوب في أي تقرير قد يكون فرعًا واحدًا اختاره المستخدم، أو
   **نطاق** فروع مسموح له بها (محاسبة واحدة تخدم فرعين مثلًا). فبدل أن
   يقارن كل تقرير `x.branchId === branch` يستعمل مُطابِقًا يقبل الحالتين
   — وهكذا يسري تقييد المحاسب على كل الأرقام لا على القوائم وحدها.
   ============================================================ */

/* يقبل: null (كل الفروع) · رقم فرع · مصفوفة فروع */
const matchBranch = (branch) => {
  if (branch === null || branch === undefined || branch === '') return () => true;
  const ids = (Array.isArray(branch) ? branch : [branch]).map(Number).filter((n) => Number.isFinite(n));
  if (!ids.length) return () => true;
  return (id) => id != null && ids.includes(Number(id));
};

/* الفرع المعتمد للطلب: ما اختاره المستخدم إن كان داخل نطاقه (يتحقق منه
   الوسيط auth)، وإلا نطاقه كاملًا، وإلا كل الفروع. */
const branchParam = (req) => (req.query.branch ? Number(req.query.branch) : (req.branchScope || null));

module.exports = { matchBranch, branchParam };

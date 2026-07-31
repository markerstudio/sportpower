/* ============================================================
   بيانات التهيئة
   - demoSeed: بيانات تجريبية كاملة (وضع العرض/التطوير)
   - productionSeed: الحد الأدنى لبدء الاستخدام الفعلي
   hash(password) تُمرَّر من طبقة التخزين (scrypt).
   ============================================================ */

const MEALS = [
  { id: 1, name: 'شوفان بالحليب والموز', type: 'breakfast', goal: 'muscle', calories: 420, protein: 22, carbs: 62, fat: 9, ingredients: 'شوفان 80غ، حليب قليل الدسم 250مل، موزة، عسل ملعقة صغيرة، قرفة', preparation: 'يُطبخ الشوفان بالحليب 5 دقائق، يُضاف الموز شرائح والعسل والقرفة.', image: null, createdBy: null },
  { id: 2, name: 'بيض مسلوق مع توست أسمر', type: 'breakfast', goal: 'loss', calories: 290, protein: 20, carbs: 24, fat: 12, ingredients: 'بيضتان، شريحتا توست أسمر، خيار وطماطم', preparation: 'يُسلق البيض 8 دقائق ويُقدّم مع التوست والخضار.', image: null, createdBy: null },
  { id: 3, name: 'صدر دجاج مشوي مع أرز', type: 'lunch', goal: 'muscle', calories: 560, protein: 45, carbs: 58, fat: 12, ingredients: 'صدر دجاج 200غ، أرز بسمتي 150غ مطبوخ، بروكلي، زيت زيتون', preparation: 'يُتبّل الدجاج ويُشوى، يُقدّم مع الأرز والبروكلي المسلوق.', image: null, createdBy: null },
  { id: 4, name: 'سلطة تونة', type: 'lunch', goal: 'loss', calories: 330, protein: 32, carbs: 14, fat: 16, ingredients: 'علبة تونة بالماء، خس، ذرة، خيار، ليمون، زيت زيتون ملعقة', preparation: 'تُخلط المكونات وتُتبل بالليمون وزيت الزيتون.', image: null, createdBy: null },
  { id: 5, name: 'سمك سلمون مع خضار سوتيه', type: 'dinner', goal: 'maintain', calories: 450, protein: 38, carbs: 18, fat: 24, ingredients: 'فيليه سلمون 180غ، كوسا، فلفل ألوان، بصل، زيت زيتون', preparation: 'يُشوى السلمون 12 دقيقة وتُقلّب الخضار على نار متوسطة.', image: null, createdBy: null },
  { id: 6, name: 'زبادي يوناني بالتوت', type: 'snack', goal: 'loss', calories: 160, protein: 15, carbs: 17, fat: 4, ingredients: 'زبادي يوناني 170غ، توت مشكل 80غ', preparation: 'يُضاف التوت فوق الزبادي مباشرة.', image: null, createdBy: null },
  { id: 7, name: 'شيك بروتين بزبدة الفستق', type: 'snack', goal: 'muscle', calories: 380, protein: 32, carbs: 28, fat: 15, ingredients: 'مكيال بروتين، حليب 300مل، زبدة فستق ملعقة، موز نصف', preparation: 'تُخلط المكونات في الخلاط 30 ثانية.', image: null, createdBy: null },
  { id: 8, name: 'كينوا بالدجاج والأفوكادو', type: 'dinner', goal: 'loss', calories: 410, protein: 34, carbs: 36, fat: 15, ingredients: 'كينوا 120غ مطبوخة، دجاج مشوي 120غ، أفوكادو ربع، جرجير', preparation: 'تُقدّم الكينوا مع شرائح الدجاج والأفوكادو على فرشة جرجير.', image: null, createdBy: null },
  { id: 9, name: 'عجة الخضار بالجبن', type: 'breakfast', goal: 'maintain', calories: 340, protein: 21, carbs: 12, fat: 23, ingredients: '3 بيضات، سبانخ، فلفل، جبن أبيض 40غ', preparation: 'تُخفق البيضات مع الخضار وتُطهى على مقلاة غير لاصقة.', image: null, createdBy: null },
  { id: 10, name: 'ستيك لحم مع بطاطا مشوية', type: 'lunch', goal: 'muscle', calories: 640, protein: 48, carbs: 45, fat: 26, ingredients: 'ستيك 220غ، بطاطا 200غ، هليون، زبدة قليلة', preparation: 'يُشوى الستيك حسب الرغبة وتُشوى البطاطا بالفرن 25 دقيقة.', image: null, createdBy: null },
];

const DEFAULT_FROZEN_MSG = 'مرحبًا {الاسم} 👋 اشتقنالك في سبورت باور! جسمك بيستناك يرجع أقوى — رجعتك علينا: أول أسبوع بعد التجميد مجانًا. متى بنشوفك؟ 💪';

/* نقاط الولاء الافتراضية — تعدلها الإدارة من صفحة الولاء والإحالات */
const LOYALTY_DEFAULTS = { ptsSession: 5, ptsRenewal: 50, ptsReferral: 100 };

/* مكافآت البداية لنظام الولاء */
const DEFAULT_REWARDS = [
  { id: 1, name: 'خصم 10% على تجديد الاشتراك', cost: 300, active: true, note: '' },
  { id: 2, name: 'بلوزة من منتجات Sport Power', cost: 400, active: true, note: '' },
  { id: 3, name: 'حصة تدريبية إضافية مجانية', cost: 250, active: true, note: '' },
  { id: 4, name: 'شهر مجاني', cost: 1200, active: true, note: '' },
];

const BRANCHES = [
  { id: 1, name: 'فرع بيت ساحور', address: 'بيت ساحور، فلسطين', phone: '02-2770000' },
  { id: 2, name: 'فرع بيت لحم', address: 'بيت لحم، فلسطين', phone: '02-2740000' },
  { id: 3, name: 'فرع عمّان', address: 'عمّان، الأردن', phone: '06-5850000' },
];

/* باقات الاشتراك — تظهر في العقد الإلكتروني وفي ملف المشترك (الأسعار للإدارة والمحاسب فقط) */
const DEFAULT_PACKAGES = [
  { id: 1, name: 'باقة البداية — 8 حصص', sessions: 8, price: 900, durationDays: 30, branchId: null, sessionsPerWeek: 2, description: 'مناسبة لمن يبدأ رحلته: حصتان أسبوعيًا مع متابعة وزن.', features: 'خطة تدريب مبدئية\nقراءة InBody عند البداية\nمتابعة أسبوعية', active: true },
  { id: 2, name: 'الباقة الأساسية — 12 حصة', sessions: 12, price: 1200, durationDays: 30, branchId: null, sessionsPerWeek: 3, description: 'الأكثر طلبًا: ثلاث حصص أسبوعيًا مع برنامج غذائي.', features: 'برنامج تدريبي مخصص\nبرنامج غذائي من الأخصائية\nقراءتا InBody\nمتابعة مستمرة', active: true },
  { id: 3, name: 'الباقة المتقدمة — 16 حصة', sessions: 16, price: 1500, durationDays: 30, branchId: null, sessionsPerWeek: 4, description: 'أربع حصص أسبوعيًا لمن يريد نتائج أسرع.', features: 'برنامج تدريبي متقدم\nبرنامج غذائي\nقراءات InBody شهرية\nحصة تعويضية مجانية', active: true },
  { id: 4, name: 'باقة الالتزام — 24 حصة', sessions: 24, price: 2100, durationDays: 60, branchId: null, sessionsPerWeek: 3, description: 'شهران كاملان بسعر مميز — أفضل قيمة مقابل السعر.', features: 'كل مزايا الباقة المتقدمة\nخصم على التجديد\nنقاط ولاء مضاعفة', active: true },
];

/* نصّ شروط العقد الإلكتروني — تعدله الإدارة من صفحة الباقات والعقود */
const DEFAULT_CONTRACT_TERMS = [
  'الاشتراك شخصي وغير قابل للتحويل لشخص آخر.',
  'الحصص تُخصم عند تنفيذها، والحصة الملغاة قبل أقل من 4 ساعات تُحتسب.',
  'يمكن تجميد الاشتراك مرة واحدة لمدة أقصاها أسبوعان بطلب مسبق.',
  'الأسعار المذكورة أعلاه شاملة، ولا تُسترد الرسوم بعد بدء الاشتراك.',
  'يلتزم المشترك بتعليمات المدرب والسلامة داخل النادي.',
].join('\n');

/* الحد الأدنى للإنتاج: مدير + الفروع + مكتبة الوجبات */
function productionSeed(hash) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  return {
    branches: BRANCHES,
    users: [{
      id: 1, username: 'admin', password: hash(adminPassword), role: 'admin',
      name: 'إدارة سبورت باور', phone: '', branchId: null,
      mustChangePassword: !process.env.ADMIN_PASSWORD,
    }],
    subscriptions: [], payments: [], sessions: [], appointments: [],
    inbody: [], meals: MEALS, mealPlans: [], notifications: [], tokens: [],
    settings: [{ id: 1, currency: process.env.CURRENCY || 'ILS', frozenMessage: DEFAULT_FROZEN_MSG, waCountryCode: '970', contractTerms: DEFAULT_CONTRACT_TERMS, ...LOYALTY_DEFAULTS }],
    trainerLogs: [], tasks: [], targets: [], frozen: [], subEvents: [],
    expenses: [], leads: [], programs: [], pointsLog: [], rewards: DEFAULT_REWARDS, redemptions: [], referrals: [],
    packages: DEFAULT_PACKAGES, contracts: [], sessionRatings: [], actionLog: [],
  };
}

/* بيانات العرض الكاملة */
function demoSeed(hash) {
  const today = new Date();
  const Y = today.getFullYear();
  const M = today.getMonth();
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const thisMonth = (d) => iso(Y, M, d);
  const prevMonth = (d) => (M === 0 ? iso(Y - 1, 11, d) : iso(Y, M - 1, d));
  const nextMonth = (d) => (M === 11 ? iso(Y + 1, 0, d) : iso(Y, M + 1, d));
  const TODAY = iso(Y, M, today.getDate());

  const users = [
    { id: 1, username: 'admin', password: hash('admin123'), role: 'admin', name: 'م. إلياس بولس', phone: '0500000001', branchId: null },
    { id: 2, username: 'omar', password: hash('123456'), role: 'trainer', name: 'كابتن عمر السيد', phone: '0500000002', branchId: 1, specialty: 'قوة وبناء عضل' },
    { id: 3, username: 'huda', password: hash('123456'), role: 'trainer', name: 'كابتن هدى العلي', phone: '0500000003', branchId: 2, specialty: 'لياقة عالية HIIT' },
    { id: 4, username: 'khaled', password: hash('123456'), role: 'trainer', name: 'كابتن خالد مراد', phone: '0500000004', branchId: 3, specialty: 'استشفاء ومرونة' },
    { id: 5, username: 'rana', password: hash('123456'), role: 'accountant', name: 'أ. رنا الخطيب', phone: '0500000005', branchId: null },
    { id: 6, username: 'nour', password: hash('123456'), role: 'nutritionist', name: 'أخصائية نور حداد', phone: '0500000006', branchId: null },
    { id: 10, username: 'ahmad', password: hash('123456'), role: 'trainee', name: 'أحمد الخطيب', phone: '0501111110', branchId: 1, goal: 'muscle', joinedAt: prevMonth(3), referralCode: 'SP-AHMAD' },
    { id: 11, username: 'sara', password: hash('123456'), role: 'trainee', name: 'سارة منصور', phone: '0501111111', branchId: 1, goal: 'loss', joinedAt: prevMonth(5), referralCode: 'SP-SARA' },
    { id: 12, username: 'fadi', password: hash('123456'), role: 'trainee', name: 'فادي عبد الله', phone: '0501111112', branchId: 1, goal: 'maintain', joinedAt: prevMonth(10) },
    { id: 13, username: 'lina', password: hash('123456'), role: 'trainee', name: 'لينا سعيد', phone: '0501111113', branchId: 2, goal: 'loss', joinedAt: prevMonth(8) },
    { id: 14, username: 'majed', password: hash('123456'), role: 'trainee', name: 'ماجد الحسن', phone: '0501111114', branchId: 2, goal: 'muscle', joinedAt: thisMonth(1) },
    { id: 15, username: 'rima', password: hash('123456'), role: 'trainee', name: 'ريما قاسم', phone: '0501111115', branchId: 2, goal: 'loss', joinedAt: thisMonth(2) },
    { id: 16, username: 'yousef', password: hash('123456'), role: 'trainee', name: 'يوسف نجار', phone: '0501111116', branchId: 3, goal: 'maintain', joinedAt: prevMonth(15) },
    { id: 17, username: 'dana', password: hash('123456'), role: 'trainee', name: 'دانا سليمان', phone: '0501111117', branchId: 3, goal: 'loss', joinedAt: thisMonth(5) },
    { id: 18, username: 'tarek', password: hash('123456'), role: 'trainee', name: 'طارق عوض', phone: '0501111118', branchId: 1, goal: 'muscle', joinedAt: prevMonth(20) },
    { id: 19, username: 'noura', password: hash('123456'), role: 'trainee', name: 'نورة الشامي', phone: '0501111119', branchId: 3, goal: 'loss', joinedAt: prevMonth(25) },
  ];

  const subscriptions = [
    { id: 1, traineeId: 10, branchId: 1, totalSessions: 12, usedSessions: 5, price: 1200, startDate: prevMonth(3), endDate: nextMonth(3), status: 'active', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة' },
    { id: 2, traineeId: 11, branchId: 1, totalSessions: 12, usedSessions: 9, price: 1200, startDate: prevMonth(5), endDate: thisMonth(28), status: 'active', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة' },
    { id: 3, traineeId: 12, branchId: 1, totalSessions: 8, usedSessions: 7, price: 900, startDate: prevMonth(10), endDate: thisMonth(24), status: 'active', packageId: 1, packageName: 'باقة البداية — 8 حصص' },
    { id: 4, traineeId: 13, branchId: 2, totalSessions: 16, usedSessions: 6, price: 1500, startDate: prevMonth(8), endDate: nextMonth(8), status: 'active', packageId: 3, packageName: 'الباقة المتقدمة — 16 حصة' },
    { id: 5, traineeId: 14, branchId: 2, totalSessions: 12, usedSessions: 3, price: 1200, startDate: thisMonth(1), endDate: nextMonth(1), status: 'active', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة' },
    { id: 6, traineeId: 15, branchId: 2, totalSessions: 8, usedSessions: 2, price: 900, startDate: thisMonth(2), endDate: nextMonth(2), status: 'frozen', packageId: 1, packageName: 'باقة البداية — 8 حصص' }, // يطابق حدث التجميد أدناه
    { id: 7, traineeId: 16, branchId: 3, totalSessions: 12, usedSessions: 11, price: 1200, startDate: prevMonth(15), endDate: thisMonth(23), status: 'active', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة' },
    { id: 8, traineeId: 17, branchId: 3, totalSessions: 12, usedSessions: 2, price: 1200, startDate: thisMonth(5), endDate: nextMonth(5), status: 'active', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة' },
    { id: 9, traineeId: 18, branchId: 1, totalSessions: 16, usedSessions: 8, price: 1500, startDate: prevMonth(20), endDate: nextMonth(20), status: 'active', packageId: 3, packageName: 'الباقة المتقدمة — 16 حصة' },
    { id: 10, traineeId: 19, branchId: 3, totalSessions: 8, usedSessions: 8, price: 900, startDate: prevMonth(1), endDate: prevMonth(28), status: 'expired', packageId: 1, packageName: 'باقة البداية — 8 حصص' },
  ];

  const payments = [
    { id: 1, subscriptionId: 1, traineeId: 10, amount: 1200, date: prevMonth(3), method: 'كاش', note: 'دفعة كاملة', createdBy: 5 },
    { id: 2, subscriptionId: 2, traineeId: 11, amount: 700, date: prevMonth(5), method: 'تحويل بنكي', note: 'دفعة أولى', createdBy: 5 },
    { id: 3, subscriptionId: 2, traineeId: 11, amount: 500, date: thisMonth(2), method: 'كاش', note: 'دفعة ثانية — إغلاق', createdBy: 5 },
    { id: 4, subscriptionId: 3, traineeId: 12, amount: 900, date: prevMonth(10), method: 'بطاقة', note: '', createdBy: 5 },
    { id: 5, subscriptionId: 4, traineeId: 13, amount: 1000, date: prevMonth(8), method: 'كاش', note: 'دفعة أولى', createdBy: 5 },
    { id: 6, subscriptionId: 5, traineeId: 14, amount: 1200, date: thisMonth(1), method: 'تحويل بنكي', note: '', createdBy: 5 },
    { id: 7, subscriptionId: 6, traineeId: 15, amount: 450, date: thisMonth(2), method: 'كاش', note: 'دفعة أولى 50%', createdBy: 5 },
    { id: 8, subscriptionId: 7, traineeId: 16, amount: 1200, date: prevMonth(15), method: 'كاش', note: '', createdBy: 5 },
    { id: 9, subscriptionId: 8, traineeId: 17, amount: 600, date: thisMonth(5), method: 'بطاقة', note: 'دفعة أولى', createdBy: 5 },
    { id: 10, subscriptionId: 9, traineeId: 18, amount: 1500, date: prevMonth(20), method: 'تحويل بنكي', note: 'دفعة كاملة', createdBy: 5 },
    { id: 11, subscriptionId: 10, traineeId: 19, amount: 900, date: prevMonth(1), method: 'كاش', note: '', createdBy: 5 },
  ];

  const sessions = [];
  let sid = 1;
  const addSession = (traineeId, trainerId, branchId, date, time, duration, style, notes, weight) => {
    sessions.push({ id: sid++, traineeId, trainerId, branchId, date, time, duration, style, notes: notes || '', weight: weight || null, subscriptionId: null, createdAt: date + 'T' + time + ':00' });
  };
  addSession(10, 2, 1, prevMonth(6), '17:00', 60, 'قوة — دفع', 'بداية ممتازة', 86);
  addSession(10, 2, 1, prevMonth(9), '17:00', 60, 'قوة — سحب', '', 85.4);
  addSession(11, 2, 1, prevMonth(7), '18:00', 60, 'كارديو + مقاومة', '', 74);
  addSession(13, 3, 2, prevMonth(9), '10:00', 60, 'HIIT', '', 68);
  addSession(16, 4, 3, prevMonth(16), '19:00', 60, 'مرونة', 'تحسّن بمدى الحركة', 92);
  addSession(10, 2, 1, thisMonth(2), '17:00', 60, 'قوة — أرجل', 'زيادة الأوزان 5٪', 85);
  addSession(10, 2, 1, thisMonth(6), '17:00', 60, 'قوة — دفع', '', 84.6);
  addSession(10, 2, 1, thisMonth(13), '17:00', 60, 'قوة — سحب', 'أداء ثابت', 84.2);
  addSession(11, 2, 1, thisMonth(8), '17:00', 60, 'تدريب زوجي — كارديو', 'مع فادي بنفس الساعة', 73.1);
  addSession(12, 2, 1, thisMonth(8), '17:00', 60, 'تدريب زوجي — كارديو', 'مع سارة بنفس الساعة', 88);
  addSession(11, 2, 1, thisMonth(11), '18:00', 60, 'مقاومة', '', 72.8);
  addSession(18, 2, 1, thisMonth(4), '19:00', 60, 'قوة — ظهر', '', 90.5);
  addSession(18, 2, 1, thisMonth(12), '19:00', 60, 'قوة — صدر', '', 90.1);
  addSession(13, 3, 2, thisMonth(3), '10:00', 60, 'HIIT — دائري', '', 67.2);
  addSession(13, 3, 2, thisMonth(10), '10:00', 60, 'HIIT — قوة', 'التزام ممتاز', 66.8);
  addSession(14, 3, 2, thisMonth(5), '11:00', 60, 'بناء عضل — كتف', '', 78);
  addSession(14, 3, 2, thisMonth(12), '11:00', 60, 'بناء عضل — أرجل', '', 78.4);
  addSession(15, 3, 2, thisMonth(9), '12:00', 45, 'كارديو خفيف', 'أول أسبوع', 81);
  addSession(16, 4, 3, thisMonth(7), '19:00', 60, 'مرونة ومفاصل', '', 91.2);
  addSession(17, 4, 3, thisMonth(10), '18:00', 60, 'استشفاء — عمود فقري', 'تحسن ملحوظ', 77.5);

  const appointments = [];
  let aid = 1;
  const addAppt = (trainerId, traineeId, branchId, date, time, duration, status, note) => {
    appointments.push({ id: aid++, trainerId, traineeId, branchId, date, time, duration: duration || 60, status: status || 'scheduled', note: note || '' });
  };
  const d = today.getDate();
  addAppt(2, 10, 1, TODAY, '17:00', 60, 'scheduled', 'حصة قوة — أرجل');
  addAppt(2, 11, 1, TODAY, '18:00', 60, 'scheduled', '');
  addAppt(2, 18, 1, iso(Y, M, Math.min(d + 1, 28)), '19:00', 60, 'scheduled', '');
  addAppt(2, 12, 1, iso(Y, M, Math.min(d + 2, 28)), '17:00', 60, 'scheduled', 'آخر حصة بالاشتراك');
  addAppt(3, 13, 2, TODAY, '10:00', 60, 'scheduled', '');
  addAppt(3, 14, 2, iso(Y, M, Math.min(d + 1, 28)), '11:00', 60, 'scheduled', '');
  addAppt(3, 15, 2, iso(Y, M, Math.min(d + 3, 28)), '12:00', 45, 'scheduled', '');
  addAppt(4, 16, 3, TODAY, '19:00', 60, 'scheduled', 'قبل انتهاء الاشتراك');
  addAppt(4, 17, 3, iso(Y, M, Math.min(d + 2, 28)), '18:00', 60, 'scheduled', '');

  const inbody = [
    { id: 1, traineeId: 10, date: prevMonth(3), weight: 87.0, bodyFatPct: 24.5, muscleMass: 34.2, fatMass: 21.3, water: 47.9, bmi: 27.8, score: 68, image: null, notes: 'قراءة البداية' },
    { id: 2, traineeId: 10, date: thisMonth(1), weight: 85.0, bodyFatPct: 22.8, muscleMass: 34.9, fatMass: 19.4, water: 48.8, bmi: 27.1, score: 72, image: null, notes: '' },
    { id: 3, traineeId: 10, date: thisMonth(15), weight: 84.2, bodyFatPct: 21.9, muscleMass: 35.3, fatMass: 18.4, water: 49.3, bmi: 26.9, score: 74, image: null, notes: 'تقدم ممتاز' },
    { id: 4, traineeId: 11, date: prevMonth(5), weight: 76.0, bodyFatPct: 33.0, muscleMass: 24.1, fatMass: 25.1, water: 37.2, bmi: 28.4, score: 61, image: null, notes: 'قراءة البداية' },
    { id: 5, traineeId: 11, date: thisMonth(5), weight: 73.0, bodyFatPct: 31.2, muscleMass: 24.4, fatMass: 22.8, water: 38.0, bmi: 27.2, score: 65, image: null, notes: '' },
    { id: 6, traineeId: 13, date: prevMonth(8), weight: 69.5, bodyFatPct: 29.8, muscleMass: 23.5, fatMass: 20.7, water: 36.1, bmi: 25.9, score: 66, image: null, notes: '' },
    { id: 7, traineeId: 13, date: thisMonth(8), weight: 66.8, bodyFatPct: 27.4, muscleMass: 23.9, fatMass: 18.3, water: 36.9, bmi: 24.9, score: 70, image: null, notes: '' },
    { id: 8, traineeId: 16, date: prevMonth(15), weight: 92.5, bodyFatPct: 26.0, muscleMass: 36.0, fatMass: 24.0, water: 50.2, bmi: 29.0, score: 67, image: null, notes: '' },
    // طارق: قراءتان بفارق أكثر من 4 أسابيع بلا أي تقدّم — يظهر في مركز القرارات كمراجعة خطة
    { id: 9, traineeId: 18, date: prevMonth(10), weight: 90.4, bodyFatPct: 25.1, muscleMass: 33.0, fatMass: 22.7, water: 49.0, bmi: 28.2, score: 65, image: null, notes: '' },
    { id: 10, traineeId: 18, date: thisMonth(12), weight: 90.6, bodyFatPct: 25.2, muscleMass: 33.1, fatMass: 22.8, water: 49.1, bmi: 28.3, score: 65, image: null, notes: 'ثبات بالقياسات' },
  ];

  const meals = MEALS.map((m) => ({ ...m, createdBy: 6 }));

  const mealPlans = [
    { id: 1, traineeId: 10, mealId: 1, slot: 'breakfast' },
    { id: 2, traineeId: 10, mealId: 3, slot: 'lunch' },
    { id: 3, traineeId: 10, mealId: 7, slot: 'snack' },
    { id: 4, traineeId: 11, mealId: 2, slot: 'breakfast' },
    { id: 5, traineeId: 11, mealId: 4, slot: 'lunch' },
    { id: 6, traineeId: 11, mealId: 6, slot: 'snack' },
  ];

  const notifications = [
    { id: 1, userId: 2, text: 'أضافت الإدارة موعدًا جديدًا لك اليوم الساعة 17:00 مع أحمد الخطيب.', date: TODAY, read: false, type: 'appointment' },
    { id: 2, userId: 1, text: 'اشتراك يوسف نجار يوشك على الانتهاء (متبقي حصة واحدة).', date: TODAY, read: false, type: 'subscription' },
  ];

  /* ---------- بيانات التشغيل والمتابعة ---------- */
  // مواعيد فائتة لفادي (غياب مرتين ← تنبيه للإدارة والمدرب)
  addAppt(2, 12, 1, prevMonth(26), '17:00', 60, 'missed', 'لم يحضر');
  addAppt(2, 12, 1, thisMonth(Math.max(1, d - 3)), '17:00', 60, 'missed', 'لم يحضر ولم يعتذر');

  const trainerLogs = [
    { id: 1, trainerId: 2, date: TODAY, checkIn: '09:00', checkOut: null, workHours: null, goalsCreated: 2, stories: 3, reels: 1, notes: '' },
    { id: 2, trainerId: 3, date: TODAY, checkIn: '08:30', checkOut: null, workHours: null, goalsCreated: 1, stories: 2, reels: 0, notes: '' },
    { id: 3, trainerId: 2, date: iso(Y, M, Math.max(1, d - 1)), checkIn: '09:00', checkOut: '17:00', workHours: 8, goalsCreated: 3, stories: 4, reels: 1, notes: 'يوم ممتاز' },
  ];

  const MONTH = TODAY.slice(0, 7);
  const tasks = [
    { id: 1, trainerId: 2, title: 'نشر 3 ستوريات تمارين', type: 'daily', date: TODAY, month: MONTH, status: 'done', createdBy: 1 },
    { id: 2, trainerId: 2, title: 'متابعة أوزان متدربي الأسبوع', type: 'daily', date: TODAY, month: MONTH, status: 'pending', createdBy: 1 },
    { id: 3, trainerId: 3, title: 'تصوير ريلز تمرين HIIT', type: 'daily', date: TODAY, month: MONTH, status: 'pending', createdBy: 1 },
    { id: 4, trainerId: 2, title: 'إنشاء 10 أهداف تدريبية جديدة', type: 'monthly', date: null, month: MONTH, status: 'done', createdBy: 1 },
    { id: 5, trainerId: 3, title: 'تحديث برامج متدربي الفرع', type: 'monthly', date: null, month: MONTH, status: 'pending', createdBy: 1 },
    { id: 6, trainerId: 4, title: 'جلسات تقييم مرونة لكل المتدربين', type: 'monthly', date: null, month: MONTH, status: 'pending', createdBy: 1 },
  ];

  // أهداف مطابقة لملف المتابعة: 80 فعّال و70,000 تحصيل لفرع بيت لحم + أهداف مدربين
  const YEAR = TODAY.slice(0, 4);
  const targets = [
    { id: 1, scope: 'branch', refId: 2, metric: 'revenue', period: MONTH, value: 70000 },
    { id: 2, scope: 'branch', refId: 2, metric: 'activeTrainees', period: MONTH, value: 80 },
    { id: 3, scope: 'branch', refId: 1, metric: 'revenue', period: MONTH, value: 60000 },
    { id: 4, scope: 'company', refId: null, metric: 'revenue', period: YEAR, value: 1500000 },
    { id: 5, scope: 'company', refId: null, metric: 'newSubs', period: YEAR + (Number(TODAY.slice(5,7)) <= 6 ? '-H1' : '-H2'), value: 250 },
    { id: 6, scope: 'trainer', refId: 2, metric: 'sessions', period: MONTH, value: 40 },
    { id: 7, scope: 'trainer', refId: 2, metric: 'uniqueTrainees', period: MONTH, value: 15 },
    { id: 8, scope: 'trainer', refId: 3, metric: 'sessions', period: MONTH, value: 35 },
    { id: 9, scope: 'trainer', refId: 4, metric: 'sessions', period: MONTH, value: 30 },
    // هدف الشهر الماضي — غير محقق فيُرحَّل المتبقي تلقائيًا لهدف هذا الشهر
    { id: 10, scope: 'branch', refId: 1, metric: 'revenue', period: prevMonth(1).slice(0, 7), value: 60000 },
    { id: 11, scope: 'company', refId: null, metric: 'newSubs', period: MONTH, value: 20 },
    { id: 12, scope: 'company', refId: null, metric: 'revenue', period: MONTH, value: 130000 },
  ];

  const frozen = [
    { id: 1, name: 'سامر جرايسة', phone: '0598111222', birthDate: '1992-03-14', branchId: 2, branchText: null, lastSubDate: prevMonth(2), freezeDate: prevMonth(20), reason: 'سفر', status: 'pending', lastContact: null, note: '', importedAt: TODAY },
    { id: 2, name: 'هالة قمصية', phone: '0598333444', birthDate: '1988-11-02', branchId: 2, branchText: null, lastSubDate: prevMonth(10), freezeDate: prevMonth(25), reason: 'إصابة خفيفة', status: 'contacted', lastContact: thisMonth(Math.max(1, d - 2)), note: 'وعدت بالعودة الشهر القادم', importedAt: TODAY },
    { id: 3, name: 'جورج حزبون', phone: '0599555666', birthDate: '1995-06-21', branchId: 1, branchText: null, lastSubDate: prevMonth(5), freezeDate: prevMonth(28), reason: 'ضغط عمل', status: 'no-reply', lastContact: thisMonth(Math.max(1, d - 1)), note: '', importedAt: TODAY },
  ];

  // أحداث الاشتراكات (لأرقام لوحة المتابعة اليومية)
  const subEvents = [];
  let evId = 1;
  subscriptions.forEach((s) => {
    const prior = subscriptions.some((x) => x.traineeId === s.traineeId && x.startDate < s.startDate);
    subEvents.push({ id: evId++, subscriptionId: s.id, traineeId: s.traineeId, branchId: s.branchId, type: prior ? 'renewal' : 'new', date: s.startDate });
  });
  subEvents.push({ id: evId++, subscriptionId: 6, traineeId: 15, branchId: 2, type: 'freeze', date: TODAY });
  subEvents.push({ id: evId++, subscriptionId: 5, traineeId: 14, branchId: 2, type: 'renewal', date: TODAY });
  // إلغاء بسبب مسجّل — يغذي تقرير النمو (أسباب الإلغاء)
  subEvents.push({ id: evId++, subscriptionId: 10, traineeId: 19, branchId: 3, type: 'cancel', date: thisMonth(6), reason: 'السعر' });

  /* ---------- المصاريف الشهرية ---------- */
  const PREV = prevMonth(1).slice(0, 7);
  const expenses = [
    { id: 1, month: MONTH, branchId: 1, category: 'رواتب', label: 'رواتب المدربين والموظفين', amount: 9000, note: '' },
    { id: 2, month: MONTH, branchId: 1, category: 'إيجار', label: 'إيجار الفرع', amount: 3500, note: '' },
    { id: 3, month: MONTH, branchId: 2, category: 'تسويق', label: 'إعلانات ممولة', amount: 1200, note: 'حملة إنستغرام' },
    { id: 4, month: MONTH, branchId: null, category: 'اشتراكات وأنظمة', label: 'أنظمة وبرمجيات', amount: 400, note: '' },
    { id: 5, month: PREV, branchId: 1, category: 'رواتب', label: 'رواتب المدربين والموظفين', amount: 9000, note: '' },
    { id: 6, month: PREV, branchId: 2, category: 'صيانة', label: 'صيانة أجهزة', amount: 800, note: '' },
  ];

  /* ---------- ملف متابعة المبيعات (Leads) ---------- */
  const leads = [
    { id: 1, contactDate: thisMonth(1), name: 'رامي حنّا', phone: '0599000001', residence: 'بيت ساحور', channel: 'إنستغرام', trainingType: 'تدريب شخصي', branchId: 1, goal: 'نزول بالوزن', stage: 'subscribed', objection: '', note: 'اشترك بعد حصة التجربة', traineeId: null, createdBy: 5 },
    { id: 2, contactDate: thisMonth(2), name: 'ميرا سابا', phone: '0599000002', residence: 'بيت لحم', channel: 'فيسبوك', trainingType: 'جروب', branchId: 2, goal: 'لياقة عامة', stage: 'trial-booked', objection: '', note: '', traineeId: null, createdBy: 5 },
    { id: 3, contactDate: thisMonth(3), name: 'باسل زيدان', phone: '0599000003', residence: 'العبيدية', channel: 'واتساب', trainingType: 'تدريب شخصي', branchId: 2, goal: 'بناء عضل', stage: 'lost', objection: 'غالي', note: 'طلب عرضًا أرخص', traineeId: null, createdBy: 5 },
    { id: 4, contactDate: thisMonth(4), name: 'نانسي عوض', phone: '0599000004', residence: 'الخليل', channel: 'إنستغرام', trainingType: 'جروب', branchId: 1, goal: 'نزول بالوزن', stage: 'lost', objection: 'بعيد', note: 'المسافة طويلة عليها', traineeId: null, createdBy: 5 },
    { id: 5, contactDate: thisMonth(6), name: 'شادي قسيس', phone: '0599000005', residence: 'بيت جالا', channel: 'إحالة صديق', trainingType: 'تدريب شخصي', branchId: 1, goal: 'بناء عضل', stage: 'no-show', objection: 'ما اجى عالتست', note: 'حجز تجربة ولم يحضر', traineeId: null, createdBy: 5 },
    { id: 6, contactDate: thisMonth(8), name: 'لارا مسلّم', phone: '0599000006', residence: 'بيت ساحور', channel: 'تيك توك', trainingType: 'جروب', branchId: 1, goal: 'لياقة عامة', stage: 'contacted', objection: 'يفكر', note: 'ستقرر نهاية الشهر', traineeId: null, createdBy: 5 },
    { id: 7, contactDate: thisMonth(9), name: 'إيلي فرح', phone: '0599000007', residence: 'عمّان', channel: 'اتصال هاتفي', trainingType: 'تدريب شخصي', branchId: 3, goal: 'استشفاء', stage: 'trial-attended', objection: '', note: 'معجب بالمكان', traineeId: null, createdBy: 5 },
    { id: 8, contactDate: thisMonth(10), name: 'دينا شحادة', phone: '0599000008', residence: 'بيت لحم', channel: 'إنستغرام', trainingType: 'جروب', branchId: 2, goal: 'نزول بالوزن', stage: 'subscribed', objection: '', note: '', traineeId: null, createdBy: 5 },
    { id: 9, contactDate: PREV + '-20', name: 'فارس نصار', phone: '0599000009', residence: 'بيت ساحور', channel: 'زيارة مباشرة', trainingType: 'تدريب شخصي', branchId: 1, goal: 'بناء عضل', stage: 'subscribed', objection: '', note: '', traineeId: null, createdBy: 5 },
    { id: 10, contactDate: thisMonth(12), name: 'هديل عابد', phone: '0599000010', residence: 'الدوحة', channel: 'واتساب', trainingType: 'جروب', branchId: 2, goal: 'نزول بالوزن', stage: 'new', objection: '', note: '', traineeId: null, createdBy: 5 },
  ];

  /* ---------- البرامج التدريبية ---------- */
  const programs = [
    { id: 1, trainerId: 2, title: 'برنامج القوة الأساسي — 4 أسابيع', focus: 'قوة وبناء عضل', description: 'أسبوع 1-2: دفع/سحب/أرجل بأوزان متوسطة. أسبوع 3-4: زيادة الأحمال 5% مع تمارين مركبة (سكوات، ديدلفت، بنش).', createdAt: thisMonth(1) },
  ];

  /* ---------- نظام الولاء: نقاط، مكافآت، استبدال، إحالات ---------- */
  const pointsLog = [
    { id: 1, traineeId: 10, points: 50, reason: 'تجديد الاشتراك', date: prevMonth(3) },
    { id: 2, traineeId: 10, points: 5, reason: 'حضور حصة تدريبية', date: thisMonth(2) },
    { id: 3, traineeId: 10, points: 5, reason: 'حضور حصة تدريبية', date: thisMonth(6) },
    { id: 4, traineeId: 10, points: 100, reason: 'إحالة صديق (ماجد الحسن)', date: thisMonth(1) },
    { id: 5, traineeId: 10, points: 150, reason: 'تحقيق هدف الوزن 🎯', date: thisMonth(15) },
    { id: 6, traineeId: 11, points: 5, reason: 'حضور حصة تدريبية', date: thisMonth(8) },
    { id: 7, traineeId: 11, points: 50, reason: 'تجديد الاشتراك', date: prevMonth(5) },
  ];
  const redemptions = [
    { id: 1, traineeId: 10, rewardId: 3, rewardName: 'حصة تدريبية إضافية مجانية', points: 250, date: TODAY, status: 'pending' },
  ];
  const referrals = [
    { id: 1, referrerId: 10, traineeId: 14, traineeName: 'ماجد الحسن', code: 'SP-AHMAD', date: thisMonth(1), status: 'approved' },
    { id: 2, referrerId: 11, traineeId: 17, traineeName: 'دانا سليمان', code: 'SP-SARA', date: thisMonth(5), status: 'pending' },
  ];

  /* ---------- تقييمات المتدربين للحصص (خاصة بالإدارة) ---------- */
  const sessionRatings = [
    { id: 1, sessionId: 8, traineeId: 10, trainerId: 2, rating: 5, comment: 'حصة ممتازة، الكابتن صحّح وضعية الظهر وشرح كل تمرين.', date: thisMonth(13), seen: false },
    { id: 2, sessionId: 15, traineeId: 13, trainerId: 3, rating: 2, comment: 'الحصة كانت مزدحمة والمتابعة كانت سريعة — حسّيت ما أخذت وقتي.', date: thisMonth(10), seen: false },
    { id: 3, sessionId: 17, traineeId: 14, trainerId: 3, rating: 4, comment: '', date: thisMonth(12), seen: true },
  ];

  /* ---------- العقود الإلكترونية (رابط تسجيل ذاتي) ---------- */
  const contracts = [
    { id: 1, token: 'demo-open-link-001', branchId: 1, createdBy: 1, createdAt: TODAY, expiresAt: nextMonth(1), status: 'open', note: 'رابط تسجيل لعملاء حملة إنستغرام', submission: null, traineeId: null, convertedAt: null },
    {
      id: 2, token: 'demo-submitted-002', branchId: 2, createdBy: 1, createdAt: thisMonth(Math.max(1, d - 1)), expiresAt: nextMonth(1),
      status: 'submitted', note: '', traineeId: null, convertedAt: null,
      submission: {
        name: 'رانيا خوري', phone: '0599777888', birthDate: '1994-08-12', goal: 'loss',
        address: 'بيت لحم', packageId: 2, packageName: 'الباقة الأساسية — 12 حصة', sessions: 12, price: 1200,
        healthNotes: 'لا يوجد', emergencyPhone: '0599777000', notes: 'أفضل التدريب مساءً',
        agreedAt: thisMonth(Math.max(1, d - 1)),
      },
    },
  ];

  return { branches: BRANCHES, users, subscriptions, payments, sessions, appointments, inbody, meals, mealPlans, notifications, tokens: [],
    settings: [{ id: 1, currency: process.env.CURRENCY || 'ILS', frozenMessage: DEFAULT_FROZEN_MSG, waCountryCode: '970', contractTerms: DEFAULT_CONTRACT_TERMS, ...LOYALTY_DEFAULTS }],
    trainerLogs, tasks, targets, frozen, subEvents,
    expenses, leads, programs, pointsLog, rewards: DEFAULT_REWARDS.map((r) => ({ ...r })), redemptions, referrals,
    packages: DEFAULT_PACKAGES.map((p) => ({ ...p })), contracts, sessionRatings, actionLog: [] };
}

module.exports = { demoSeed, productionSeed, DEFAULT_REWARDS, DEFAULT_PACKAGES, DEFAULT_CONTRACT_TERMS };

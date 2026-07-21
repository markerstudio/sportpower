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

const BRANCHES = [
  { id: 1, name: 'فرع وسط المدينة', address: 'شارع الملك فيصل، وسط المدينة', phone: '0111234567' },
  { id: 2, name: 'الفرع الغربي', address: 'حي الروضة الغربية', phone: '0117654321' },
  { id: 3, name: 'الفرع الشرقي', address: 'حي النهضة الشرقية', phone: '0119876543' },
];

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
    { id: 10, username: 'ahmad', password: hash('123456'), role: 'trainee', name: 'أحمد الخطيب', phone: '0501111110', branchId: 1, trainerId: 2, goal: 'muscle', joinedAt: prevMonth(3) },
    { id: 11, username: 'sara', password: hash('123456'), role: 'trainee', name: 'سارة منصور', phone: '0501111111', branchId: 1, trainerId: 2, goal: 'loss', joinedAt: prevMonth(5) },
    { id: 12, username: 'fadi', password: hash('123456'), role: 'trainee', name: 'فادي عبد الله', phone: '0501111112', branchId: 1, trainerId: 2, goal: 'maintain', joinedAt: prevMonth(10) },
    { id: 13, username: 'lina', password: hash('123456'), role: 'trainee', name: 'لينا سعيد', phone: '0501111113', branchId: 2, trainerId: 3, goal: 'loss', joinedAt: prevMonth(8) },
    { id: 14, username: 'majed', password: hash('123456'), role: 'trainee', name: 'ماجد الحسن', phone: '0501111114', branchId: 2, trainerId: 3, goal: 'muscle', joinedAt: thisMonth(1) },
    { id: 15, username: 'rima', password: hash('123456'), role: 'trainee', name: 'ريما قاسم', phone: '0501111115', branchId: 2, trainerId: 3, goal: 'loss', joinedAt: thisMonth(2) },
    { id: 16, username: 'yousef', password: hash('123456'), role: 'trainee', name: 'يوسف نجار', phone: '0501111116', branchId: 3, trainerId: 4, goal: 'maintain', joinedAt: prevMonth(15) },
    { id: 17, username: 'dana', password: hash('123456'), role: 'trainee', name: 'دانا سليمان', phone: '0501111117', branchId: 3, trainerId: 4, goal: 'loss', joinedAt: thisMonth(5) },
    { id: 18, username: 'tarek', password: hash('123456'), role: 'trainee', name: 'طارق عوض', phone: '0501111118', branchId: 1, trainerId: 2, goal: 'muscle', joinedAt: prevMonth(20) },
    { id: 19, username: 'noura', password: hash('123456'), role: 'trainee', name: 'نورة الشامي', phone: '0501111119', branchId: 3, trainerId: 4, goal: 'loss', joinedAt: prevMonth(25) },
  ];

  const subscriptions = [
    { id: 1, traineeId: 10, branchId: 1, totalSessions: 12, usedSessions: 5, price: 1200, startDate: prevMonth(3), endDate: nextMonth(3), status: 'active' },
    { id: 2, traineeId: 11, branchId: 1, totalSessions: 12, usedSessions: 9, price: 1200, startDate: prevMonth(5), endDate: thisMonth(28), status: 'active' },
    { id: 3, traineeId: 12, branchId: 1, totalSessions: 8, usedSessions: 7, price: 900, startDate: prevMonth(10), endDate: thisMonth(24), status: 'active' },
    { id: 4, traineeId: 13, branchId: 2, totalSessions: 16, usedSessions: 6, price: 1500, startDate: prevMonth(8), endDate: nextMonth(8), status: 'active' },
    { id: 5, traineeId: 14, branchId: 2, totalSessions: 12, usedSessions: 3, price: 1200, startDate: thisMonth(1), endDate: nextMonth(1), status: 'active' },
    { id: 6, traineeId: 15, branchId: 2, totalSessions: 8, usedSessions: 2, price: 900, startDate: thisMonth(2), endDate: nextMonth(2), status: 'active' },
    { id: 7, traineeId: 16, branchId: 3, totalSessions: 12, usedSessions: 11, price: 1200, startDate: prevMonth(15), endDate: thisMonth(23), status: 'active' },
    { id: 8, traineeId: 17, branchId: 3, totalSessions: 12, usedSessions: 2, price: 1200, startDate: thisMonth(5), endDate: nextMonth(5), status: 'active' },
    { id: 9, traineeId: 18, branchId: 1, totalSessions: 16, usedSessions: 8, price: 1500, startDate: prevMonth(20), endDate: nextMonth(20), status: 'active' },
    { id: 10, traineeId: 19, branchId: 3, totalSessions: 8, usedSessions: 8, price: 900, startDate: prevMonth(1), endDate: prevMonth(28), status: 'expired' },
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

  return { branches: BRANCHES, users, subscriptions, payments, sessions, appointments, inbody, meals, mealPlans, notifications, tokens: [] };
}

module.exports = { demoSeed, productionSeed };

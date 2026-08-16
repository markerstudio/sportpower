/* ============================================================
   سبورت باور — مخطط قاعدة البيانات العلائقي
   يصف كل مجموعة: أعمدتها المعروفة وأنواعها، فهارسها، وعلاقاتها.
   يستخدمه مشغّل Postgres لبناء جداول حقيقية (لا JSON مكدّس)،
   ويستخدمه مشغّل الملف كما هو (مستندات) لوضع العرض المحلي.

   ملاحظة مقصودة: حقول التواريخ تبقى TEXT بصيغة YYYY-MM-DD.
   النظام كله يقارن التواريخ كنصوص (s.date >= cutoff) ويجمّعها
   بالسلاسل (slice(0,7) للشهر) — تخزينها نصًا يحافظ على هذا السلوك
   تمامًا ويتجنّب أخطاء المناطق الزمنية، والفهرس على النص يخدم
   المدى (BETWEEN) والبادئة (LIKE '2026-07%') بنفس الكفاءة.
   ============================================================ */

/* أنواع مختصرة: text | int | num | bool | json */
const col = (type, opts = {}) => ({ type, ...opts });
const ref = (table, onDelete = 'cascade') => ({ table, onDelete });

const SCHEMA = {
  branches: {
    columns: {
      name: col('text', { notNull: true }),
      address: col('text'),
      phone: col('text'),
      /* سقف التجميد المسموح للفرع — يقارَن بعدد المجمّدين فعليًا في KPI الفروع */
      freezeLimit: col('int'),
    },
    indexes: [],
  },

  users: {
    columns: {
      username: col('text', { notNull: true, unique: true }),
      password: col('text', { notNull: true }),
      role: col('text', { notNull: true, check: "role IN ('admin','trainer','accountant','nutritionist','trainee')" }),
      name: col('text', { notNull: true }),
      phone: col('text'),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      trainerId: col('int'),
      goal: col('text'),
      specialty: col('text'),
      joinedAt: col('text'),
      birthDate: col('text'),
      /* مكان السكن (الحي/المنطقة) — يُدخله المدرب أو الاستقبال، ويُجمَّع في
         تقرير «من أي المناطق يأتي المشتركون» لتوجيه التسويق والفروع */
      residence: col('text'),
      active: col('bool'),
      mustChangePassword: col('bool'),
      referralCode: col('text'),
      sourceTrainerId: col('int'),
      /* كيف وصلنا هذا المتدرب: سوشال ميديا / عن طريق متدرب / صديق /
         جديد / عائد من التجميد — مع مرجع الشخص أو اسمه إن لم يكن مسجّلًا */
      sourceType: col('text'),
      sourceRefId: col('int'),
      sourceName: col('text'),
      mfaSecret: col('text'),
      mfaEnrolledAt: col('text'),
      mfaExempt: col('bool'),
      /* آخر إصدار عُرضت نشرته «ما الجديد» على هذا المستخدم — تظهر مرة
         واحدة لكل شخص عند أول دخول بعد التحديث، ثم لا تتكرر */
      seenRelease: col('text'),
    },
    indexes: [['role'], ['branchId'], ['referralCode']],
  },

  subscriptions: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      totalSessions: col('int', { notNull: true }),
      usedSessions: col('int', { notNull: true, default: '0' }),
      price: col('num', { notNull: true }),
      startDate: col('text', { notNull: true }),
      endDate: col('text', { notNull: true }),
      status: col('text', { notNull: true, default: "'active'" }),
      cancelReason: col('text'),
      packageId: col('int', { ref: ref('packages', 'setnull') }),
      packageName: col('text'),
    },
    indexes: [['traineeId'], ['branchId'], ['status'], ['endDate'], ['branchId', 'status']],
  },

  payments: {
    columns: {
      subscriptionId: col('int', { ref: ref('subscriptions') }),
      traineeId: col('int', { ref: ref('users') }),
      // الفرع مُكرَّر هنا عن قصد: كل تقارير التحصيل تُصفّى بالفرع،
      // وبدونه يحتاج كل مجموع مالي وصلًا (JOIN) بالاشتراكات.
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      amount: col('num', { notNull: true }),
      date: col('text', { notNull: true }),
      method: col('text'),
      note: col('text'),
      createdBy: col('int'),
      /* سداد دين على اشتراك سابق — يُميَّز في السجل ولا يخلط بتحصيل الاشتراك الحالي */
      debt: col('bool', { default: 'false' }),
    },
    indexes: [['date'], ['subscriptionId'], ['traineeId'], ['branchId'], ['branchId', 'date']],
  },

  sessions: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      trainerId: col('int', { ref: ref('users', 'setnull') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      date: col('text', { notNull: true }),
      time: col('text', { notNull: true }),
      duration: col('int'),
      style: col('text'),
      notes: col('text'),
      weight: col('num'),
      subscriptionId: col('int', { ref: ref('subscriptions', 'setnull') }),
      /* regular = حصة نُفّذت · absence = غياب: تُخصم من الرصيد وتُحتسب
         غيابًا في الحضور والتقارير · makeup = تعويضية: تُنفَّذ مقابل غياب
         سبق خصمه فلا تُخصم مرة ثانية (absenceSessionId يشير إليه)، وإن
         سُجّلت بلا غياب معلّق خُصمت كالحصة العادية. */
      kind: col('text', { default: "'regular'" }),
      absenceReason: col('text'),
      /* الغياب الذي تُعوّضه هذه الحصة — وجوده يعني أنها بلا خصم جديد */
      absenceSessionId: col('int'),
      createdAt: col('text'),
    },
    indexes: [['date'], ['trainerId'], ['traineeId'], ['branchId'], ['branchId', 'date'], ['trainerId', 'date']],
  },

  appointments: {
    columns: {
      trainerId: col('int', { ref: ref('users', 'setnull') }),
      /* يبقى فارغًا في موعد الـ Test: صاحبه زائر جديد لم يُسجَّل بعد ولا حساب
         له، فيُكتب اسمه وجواله يدويًا في prospectName/prospectPhone */
      traineeId: col('int', { ref: ref('users') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      date: col('text', { notNull: true }),
      time: col('text', { notNull: true }),
      duration: col('int'),
      status: col('text', { default: "'scheduled'" }),
      note: col('text'),
      kind: col('text'),
      sessionId: col('int'),
      prospectName: col('text'),
      prospectPhone: col('text'),
    },
    indexes: [['date'], ['trainerId'], ['traineeId'], ['branchId'], ['status'], ['branchId', 'date']],
  },

  /* صور متابعة المشترك — تُلتقط كل أسبوعين وتُحفظ في ملفه (بمبدأ InBody) */
  traineePhotos: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      date: col('text', { notNull: true }),
      image: col('text', { notNull: true }),
      notes: col('text'),
      createdBy: col('int'),
    },
    indexes: [['traineeId'], ['date'], ['traineeId', 'date']],
  },

  inbody: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      date: col('text', { notNull: true }),
      weight: col('num'),
      bodyFatPct: col('num'),
      muscleMass: col('num'),
      fatMass: col('num'),
      water: col('num'),
      bmi: col('num'),
      score: col('num'),
      /* قياسات شريط القياس (سم) — بطلب العميل */
      waist: col('num'),
      chest: col('num'),
      arm: col('num'),
      hips: col('num'),
      leg: col('num'),
      notes: col('text'),
      image: col('text'),
      createdBy: col('int'),
    },
    indexes: [['traineeId'], ['date'], ['traineeId', 'date']],
  },

  meals: {
    columns: {
      name: col('text', { notNull: true }),
      type: col('text'),
      goal: col('text'),
      calories: col('num'),
      protein: col('num'),
      carbs: col('num'),
      fat: col('num'),
      ingredients: col('text'),
      preparation: col('text'),
      image: col('text'),
      createdBy: col('int'),
    },
    indexes: [['goal'], ['type']],
  },

  mealPlans: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      mealId: col('int', { notNull: true, ref: ref('meals') }),
      slot: col('text'),
      /* من ربط البرنامج الغذائي ومتى — «برامج الأكل» في KPI المدرب/الأخصائية */
      createdBy: col('int'),
      date: col('text'),
    },
    indexes: [['traineeId'], ['createdBy']],
  },

  notifications: {
    columns: {
      userId: col('int', { notNull: true, ref: ref('users') }),
      text: col('text', { notNull: true }),
      date: col('text'),
      read: col('bool', { default: 'false' }),
      type: col('text'),
    },
    indexes: [['userId'], ['userId', 'read'], ['read', 'date']],
  },

  tokens: {
    columns: {
      hash: col('text', { notNull: true, unique: true }),
      userId: col('int', { notNull: true, ref: ref('users') }),
      expiresAt: col('num', { notNull: true }), // epoch ms
    },
    indexes: [['userId'], ['expiresAt']],
  },

  /* إعدادات النظام: صف واحد بمفاتيح متغيّرة (عملة، رسائل، نقاط، عتبات
     مركز القرارات…) — يبقى مستندًا في meta عن قصد، فلا قيمة لتعميده أعمدة */
  settings: { columns: {}, indexes: [] },

  trainerLogs: {
    columns: {
      trainerId: col('int', { notNull: true, ref: ref('users') }),
      date: col('text', { notNull: true }),
      checkIn: col('text'),
      checkOut: col('text'),
      workHours: col('num'),
      goalsCreated: col('int'),
      stories: col('int'),
      reels: col('int'),
      notes: col('text'),
    },
    indexes: [['trainerId'], ['date'], ['trainerId', 'date']],
  },

  tasks: {
    columns: {
      trainerId: col('int', { notNull: true, ref: ref('users') }),
      title: col('text', { notNull: true }),
      type: col('text'),
      date: col('text'),
      month: col('text'),
      status: col('text', { default: "'pending'" }),
      createdBy: col('int'),
      fromAction: col('text'),
    },
    indexes: [['trainerId'], ['date'], ['month'], ['trainerId', 'month']],
  },

  targets: {
    columns: {
      scope: col('text', { notNull: true }),
      refId: col('int'),
      metric: col('text', { notNull: true }),
      period: col('text', { notNull: true }),
      value: col('num', { notNull: true }),
    },
    indexes: [['period'], ['scope', 'refId']],
  },

  frozen: {
    columns: {
      name: col('text', { notNull: true }),
      phone: col('text'),
      birthDate: col('text'),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      branchText: col('text'),
      lastSubDate: col('text'),
      freezeDate: col('text'),
      reason: col('text'),
      status: col('text', { default: "'pending'" }),
      lastContact: col('text'),
      note: col('text'),
      importedAt: col('text'),
    },
    indexes: [['status'], ['branchId']],
  },

  subEvents: {
    columns: {
      subscriptionId: col('int', { ref: ref('subscriptions', 'setnull') }),
      traineeId: col('int', { ref: ref('users', 'setnull') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      type: col('text', { notNull: true }),
      date: col('text', { notNull: true }),
      reason: col('text'),
    },
    indexes: [['date'], ['branchId'], ['type'], ['branchId', 'date']],
  },

  expenses: {
    columns: {
      month: col('text', { notNull: true }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      category: col('text'),
      label: col('text', { notNull: true }),
      amount: col('num', { notNull: true }),
      note: col('text'),
      createdBy: col('int'),
    },
    indexes: [['month'], ['branchId']],
  },

  leads: {
    columns: {
      contactDate: col('text'),
      name: col('text', { notNull: true }),
      phone: col('text'),
      residence: col('text'),
      channel: col('text'),
      trainingType: col('text'),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      goal: col('text'),
      stage: col('text', { default: "'new'" }),
      objection: col('text'),
      note: col('text'),
      traineeId: col('int', { ref: ref('users', 'setnull') }),
      createdBy: col('int'),
      closedAt: col('text'),
    },
    indexes: [['contactDate'], ['stage'], ['branchId']],
  },

  programs: {
    columns: {
      trainerId: col('int', { ref: ref('users', 'setnull') }),
      title: col('text', { notNull: true }),
      focus: col('text'),
      description: col('text'),
      createdAt: col('text'),
    },
    indexes: [['trainerId']],
  },

  pointsLog: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      points: col('int', { notNull: true }),
      reason: col('text'),
      date: col('text'),
    },
    indexes: [['traineeId'], ['date']],
  },

  rewards: {
    columns: {
      name: col('text', { notNull: true }),
      cost: col('int', { notNull: true }),
      note: col('text'),
      active: col('bool', { default: 'true' }),
    },
    indexes: [],
  },

  redemptions: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      rewardId: col('int', { ref: ref('rewards', 'setnull') }),
      rewardName: col('text'),
      points: col('int', { notNull: true }),
      date: col('text'),
      status: col('text', { default: "'pending'" }),
      decidedAt: col('text'),
    },
    indexes: [['traineeId'], ['status']],
  },

  referrals: {
    columns: {
      referrerId: col('int', { notNull: true, ref: ref('users') }),
      traineeId: col('int', { ref: ref('users', 'setnull') }),
      traineeName: col('text'),
      code: col('text'),
      date: col('text'),
      status: col('text', { default: "'pending'" }),
      decidedAt: col('text'),
    },
    indexes: [['referrerId'], ['status']],
  },

  packages: {
    columns: {
      name: col('text', { notNull: true }),
      sessions: col('int', { notNull: true }),
      price: col('num', { notNull: true }),
      durationDays: col('int'),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      sessionsPerWeek: col('int'),
      /* نوع الباقة في العقد: personal (تدريب شخصي) · group (تدريب مجموعات) ·
         saver (باقات التوفير) — تُعرض مجمّعة في العقد الإلكتروني */
      category: col('text', { default: "'personal'" }),
      description: col('text'),
      features: col('text'),
      active: col('bool', { default: 'true' }),
      createdBy: col('int'),
    },
    indexes: [['active'], ['branchId']],
  },

  contracts: {
    columns: {
      token: col('text', { notNull: true, unique: true }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      createdBy: col('int'),
      createdAt: col('text'),
      expiresAt: col('text'),
      status: col('text', { default: "'open'" }),
      note: col('text'),
      prospectName: col('text'),
      prospectPhone: col('text'),
      leadId: col('int'),
      submission: col('json'), // بيانات الزبون التي عبّأها في العقد
      traineeId: col('int', { ref: ref('users', 'setnull') }),
      convertedAt: col('text'),
      submittedAt: col('text'),
    },
    indexes: [['status'], ['branchId']],
  },

  sessionRatings: {
    columns: {
      sessionId: col('int', { notNull: true, ref: ref('sessions') }),
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      trainerId: col('int', { ref: ref('users', 'setnull') }),
      rating: col('int', { notNull: true, check: 'rating BETWEEN 1 AND 5' }),
      comment: col('text'),
      date: col('text'),
      seen: col('bool', { default: 'false' }),
    },
    indexes: [['traineeId'], ['trainerId'], ['date'], ['sessionId']],
  },

  /* نتائج المشتركين ومشاكلهم — تُرصد من صفحة المشترك ومن القراءات.
     سرّية عن المتدرب تمامًا: تظهر للإدارة والمدرب والمحاسب والأخصائية فقط. */
  traineeFlags: {
    columns: {
      traineeId: col('int', { notNull: true, ref: ref('users') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      kind: col('text', { notNull: true, check: "kind IN ('result','problem')" }),
      title: col('text', { notNull: true }),
      note: col('text'),
      severity: col('text'), // للمشاكل: low | medium | high
      status: col('text', { default: "'open'" }), // open | closed
      date: col('text'),
      closedAt: col('text'),
      inbodyId: col('int'),
      createdBy: col('int'),
    },
    indexes: [['traineeId'], ['branchId'], ['kind'], ['status'], ['date'], ['branchId', 'kind']],
  },

  actionLog: {
    columns: {
      key: col('text', { notNull: true }),
      status: col('text', { notNull: true }),
      note: col('text'),
      type: col('text'),
      title: col('text'),
      priority: col('text'),
      traineeId: col('int', { ref: ref('users', 'setnull') }),
      trainerId: col('int', { ref: ref('users', 'setnull') }),
      branchId: col('int', { ref: ref('branches', 'setnull') }),
      byId: col('int'),
      date: col('text'),
      snoozeUntil: col('text'),
    },
    indexes: [['key'], ['status'], ['traineeId'], ['date']],
  },
};

/* ترتيب الإنشاء: الجداول المرجعية أولًا حتى تصحّ المفاتيح الأجنبية */
const CREATE_ORDER = [
  'branches', 'users', 'packages', 'meals', 'rewards', 'settings',
  'subscriptions', 'payments', 'sessions', 'appointments', 'inbody', 'traineePhotos', 'mealPlans',
  'notifications', 'tokens', 'trainerLogs', 'tasks', 'targets', 'frozen',
  'subEvents', 'expenses', 'leads', 'programs', 'pointsLog', 'redemptions',
  'referrals', 'contracts', 'sessionRatings', 'traineeFlags', 'actionLog',
];

const COLLECTIONS = CREATE_ORDER.slice();

/* أسماء SQL: camelCase → snake_case (مع تفادي الكلمات المحجوزة) */
const snake = (s) => s.replace(/[A-Z]/g, (ch) => '_' + ch.toLowerCase());
const tableName = (col) => snake(col);
const columnName = (field) => snake(field);

const SQL_TYPE = {
  text: 'TEXT', int: 'INTEGER', num: 'DOUBLE PRECISION', bool: 'BOOLEAN', json: 'JSONB',
};

/* أعمدة كل مجموعة كقائمة [اسم الحقل، اسم العمود، التعريف] */
function columnsOf(collection) {
  const spec = SCHEMA[collection];
  return Object.entries(spec.columns).map(([field, def]) => ({ field, column: columnName(field), def }));
}

module.exports = { SCHEMA, COLLECTIONS, CREATE_ORDER, tableName, columnName, columnsOf, SQL_TYPE, snake };

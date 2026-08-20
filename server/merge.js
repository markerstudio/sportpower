/* ============================================================
   سبورت باور — الحسابات المكرَّرة: كشفٌ ودمج

   «لما ببحث عن اسم الشخص بالاشتراكات والدفعات بطلعلي اشتراكاته السابقة
   وكانوا فعليًا في أكثر من حساب لنفس الشخص».

   لا شيء في النظام كان يمنع حسابين لشخصٍ واحد: القيد الفريد الوحيد هو
   «username»، والجوال نصٌّ بلا قيد. والأسوأ أن تسجيل عميل جديد كان يلتفّ
   على تكرار الجوال بلاحقةٍ عشوائية — فيُخفي الإشارةَ الوحيدة على التكرار.

   ولأن الحسابين يحملان تاريخًا ماليًا حقيقيًا (اشتراكات ودفعات وحصص
   وقياسات)، لا يُحلّ التكرار بحذف أحدهما: يُنقل كل ما يتعلّق به إلى
   الحساب الباقي، ثم **يُعطَّل هو ولا يُحذف**.
   ============================================================ */

/* لماذا التعطيل لا الحذف؟
   افتراض ref() في المخطط هو ON DELETE CASCADE، وثلاثة عشر جدولًا مرتبطة
   بالمستخدم بهذا الافتراض — منها الاشتراكات، والدفعات مرتبطةٌ بالاشتراك
   بالتتابع نفسه. فحذف صفّ المستخدم في Postgres يمحو اشتراكاته وما دُفع
   عليها. سطرُ حذفٍ واحد يمحو تاريخًا ماليًا كاملًا. */

/* كل موضع يشير إلى متدرب — عشرون نقطةً في سبعة عشر جدولًا.
   أي حقلٍ جديد يشير إلى مستخدم يجب أن يُضاف هنا، وإلا بقيت صفوفُه
   معلّقةً على حسابٍ معطَّل. */
const REPARENT = [
  ['subscriptions', 'traineeId'],
  ['payments', 'traineeId'],
  ['sessions', 'traineeId'],
  ['appointments', 'traineeId'],
  ['traineePhotos', 'traineeId'],
  ['inbody', 'traineeId'],
  ['mealPlans', 'traineeId'],
  ['notifications', 'userId'],
  ['subEvents', 'traineeId'],
  ['leads', 'traineeId'],
  ['traineeGoals', 'traineeId'],
  ['pointsLog', 'traineeId'],
  ['redemptions', 'traineeId'],
  ['referrals', 'referrerId'],
  ['referrals', 'traineeId'],
  ['contracts', 'traineeId'],
  ['sessionRatings', 'traineeId'],
  ['traineeFlags', 'traineeId'],
  ['actionLog', 'traineeId'],
];

/* الحقول التي تُملأ عند الباقي من المدموج إن كانت فارغة عنده —
   فلا يضيع ما كان مسجَّلًا عند أحدهما فقط. وما هو موجود لا يُمسّ. */
const FILL_GAPS = ['phone', 'birthDate', 'residence', 'goal', 'branchId', 'joinedAt', 'sourceType', 'sourceName'];

/* الجوال بعد التجريد: آخر تسع خانات تتخطى الصفر ورمز الدولة —
   0599123456 و00970599123456 و+970599123456 مفتاحٌ واحد. */
const phoneKey = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
};

/* الاسم بعد التطبيع: المسافات المكررة، وهمزات الألف، والتاء المربوطة،
   والألف المقصورة — «عبدالله أحمد» و«عبدالله احمد» اسمٌ واحد. */
const nameKey = (name) => String(name || '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[ً-ْ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

module.exports = (app, ctx) => {
  const { Store, auth, requireRole, h, todayStr } = ctx;

  /* ============================================================
     الكشف — الإدارة وحدها
     الحسابان قد يكونان في فرعين مختلفين (وهي الحالة التي وصفها العميل)،
     والمحاسبُ المقيَّد بفرعٍ يرى نصف الصورة فيدمج نصفًا. فالإدارة وحدها.
     ============================================================ */
  app.get('/api/duplicate-trainees', auth, requireRole('admin'), h(async (req, res) => {
    const { users, branches, subscriptions, payments, sessions } = await Store.load(
      'users', 'branches', 'subscriptions', 'payments', 'sessions');
    const branchName = (id) => (branches.find((b) => b.id === id) || {}).name || '—';

    /* الحسابات المدموجة سابقًا تخرج من الكشف — وإلا عاد التكرار نفسه
       يظهر بعد حلّه إلى الأبد. */
    const trainees = users.filter((u) => u.role === 'trainee' && !u.mergedInto);

    const countOn = (rows, field, id) => rows.filter((r) => r[field] === id).length;
    const info = (u) => {
      const mySubs = subscriptions.filter((s) => s.traineeId === u.id);
      const subIds = mySubs.map((s) => s.id);
      const myPays = payments.filter((p) => p.traineeId === u.id || subIds.includes(p.subscriptionId));
      const mySessions = sessions.filter((s) => s.traineeId === u.id);
      const lastSession = mySessions.reduce((m, s) => (s.date > m ? s.date : m), '');
      const lastPayment = myPays.reduce((m, p) => (p.date > m ? p.date : m), '');
      return {
        traineeId: u.id, name: u.name, username: u.username, phone: u.phone || '',
        birthDate: u.birthDate || '', residence: u.residence || '',
        branchId: u.branchId || null, branchName: branchName(u.branchId),
        joinedAt: u.joinedAt || '', active: u.active !== false,
        subscriptions: mySubs.length,
        activeSubscriptions: mySubs.filter((s) => s.status === 'active').length,
        payments: myPays.length,
        paidTotal: Math.round(myPays.reduce((t, p) => t + (Number(p.amount) || 0), 0) * 100) / 100,
        sessions: mySessions.length,
        /* آخر نشاط: أحدث حصة أو دفعة — الرقم الذي يقرّر أيّ الحسابين يبقى */
        lastActivity: [lastSession, lastPayment, u.joinedAt || ''].sort().pop() || '',
      };
    };

    /* مجموعتان من المفاتيح: الجوال قويّ يُدمج بلا تردد، والاسم ضعيف
       يُعرض موسومًا لأن التشابه وحده لا يكفي — أخوان قد يتشابه اسماهما. */
    const groups = [];
    const seen = new Set();
    const byPhone = {};
    trainees.forEach((u) => {
      const k = phoneKey(u.phone);
      if (k) (byPhone[k] = byPhone[k] || []).push(u);
    });
    Object.entries(byPhone).forEach(([k, list]) => {
      if (list.length < 2) return;
      list.forEach((u) => seen.add(u.id));
      groups.push({ key: 'phone:' + k, match: 'phone', label: 'جوال متطابق', accounts: list.map(info) });
    });

    const byName = {};
    trainees.forEach((u) => {
      const k = nameKey(u.name);
      if (k) (byName[k] = byName[k] || []).push(u);
    });
    Object.entries(byName).forEach(([k, list]) => {
      // من اجتمع بالجوال أصلًا لا يُكرَّر بالاسم
      const rest = list.filter((u) => !seen.has(u.id));
      if (rest.length < 2) return;
      groups.push({ key: 'name:' + k, match: 'name', label: 'تشابه اسم فقط', accounts: rest.map(info) });
    });

    groups.sort((a, b) => (a.match === b.match ? 0 : a.match === 'phone' ? -1 : 1)
      || b.accounts.length - a.accounts.length);

    res.json({
      groups,
      totals: {
        groups: groups.length,
        byPhone: groups.filter((g) => g.match === 'phone').length,
        byName: groups.filter((g) => g.match === 'name').length,
        accounts: groups.reduce((t, g) => t + g.accounts.length, 0),
        trainees: trainees.length,
      },
    });
  }));

  /* ============================================================
     الدمج — الإدارة وحدها
     الاتجاه يختاره المدير صراحةً (keepId / mergeId) — لا اختيار تلقائي.
     و«dryRun» يُرجع عدّاد ما سينتقل بلا كتابةٍ واحدة: المعاينة الإلزامية.
     ============================================================ */
  app.post('/api/trainees/merge', auth, requireRole('admin'), h(async (req, res) => {
    const keepId = Number(req.body.keepId);
    const mergeId = Number(req.body.mergeId);
    const dryRun = req.body.dryRun === true;
    if (!keepId || !mergeId) return res.status(400).json({ error: 'اختر الحساب الباقي والحساب المدموج.' });
    if (keepId === mergeId) return res.status(400).json({ error: 'لا يُدمج الحساب في نفسه.' });

    const keep = await Store.get('users', keepId);
    const merge = await Store.get('users', mergeId);
    if (!keep || keep.role !== 'trainee') return res.status(404).json({ error: 'الحساب الباقي غير موجود.' });
    if (!merge || merge.role !== 'trainee') return res.status(404).json({ error: 'الحساب المدموج غير موجود.' });
    /* قابلية التكرار: طلبٌ ثانٍ على حسابٍ مدموج يُرَدّ — فإعادة إرسال
       النموذج لا تُحرّك شيئًا مرتين. */
    if (merge.mergedInto) {
      return res.status(409).json({ error: `${merge.name} مدموجٌ سابقًا في حسابٍ آخر — لا يُدمج مرتين.` });
    }
    if (keep.mergedInto) {
      return res.status(409).json({ error: `${keep.name} حسابٌ مدموج — لا يصلح أن يكون الحساب الباقي.` });
    }

    // عدّاد ما سينتقل، لكل جدول — هو نفسه ردّ المعاينة وسجلّ التدقيق
    const counts = {};
    for (const [col, field] of REPARENT) {
      const n = await Store.count(col, { [field]: mergeId });
      if (n) counts[`${col}.${field}`] = (counts[`${col}.${field}`] || 0) + n;
    }
    const total = Object.values(counts).reduce((t, n) => t + n, 0);

    /* تنبيهٌ لا مانع: اشتراكان فعّالان ينتقلان معًا ويظهران في سجلٍّ واحد،
       وهو المطلوب (الشخص اشترك مرتين فعلًا) — لكن المدير يُنبَّه إليه. */
    const keepActive = await Store.count('subscriptions', { traineeId: keepId, status: 'active' });
    const mergeActive = await Store.count('subscriptions', { traineeId: mergeId, status: 'active' });
    const warnings = [];
    if (keepActive && mergeActive) {
      warnings.push('للحسابين اشتراكٌ فعّال — سينتقلان معًا ويظهران في سجل واحد. '
        + 'راجع الاشتراكات بعد الدمج وألغِ المكرر منها إن لزم.');
    }
    const gaps = FILL_GAPS.filter((k) => (keep[k] === null || keep[k] === undefined || keep[k] === '')
      && merge[k] !== null && merge[k] !== undefined && merge[k] !== '');
    if (gaps.length) warnings.push('ستُنقل إلى الحساب الباقي حقولٌ فارغة عنده: ' + gaps.join('، ') + '.');

    const preview = {
      keep: { id: keep.id, name: keep.name, username: keep.username, phone: keep.phone || '' },
      merge: { id: merge.id, name: merge.name, username: merge.username, phone: merge.phone || '' },
      counts, total, warnings, fillGaps: gaps,
    };
    if (dryRun) return res.json({ dryRun: true, ...preview });

    await Store.transaction(async (tx) => {
      /* القفل على الحسابين قبل أي كتابة — فطلبان متزامنان على الحساب
         نفسه لا يتقاطعان في منتصف النقل. */
      const lockedMerge = await tx.getForUpdate('users', mergeId);
      await tx.getForUpdate('users', keepId);
      if (lockedMerge && lockedMerge.mergedInto) throw Object.assign(new Error('دُمج هذا الحساب للتوّ.'), { status: 409 });

      for (const [col, field] of REPARENT) {
        await tx.updateWhere(col, { [field]: mergeId }, { [field]: keepId });
      }

      // الفراغات عند الباقي تُملأ من المدموج — وما هو موجود لا يُمسّ
      const patch = {};
      gaps.forEach((k) => { patch[k] = merge[k]; });
      if (Object.keys(patch).length) await tx.update('users', keepId, patch);

      /* التعطيل: يمنع الدخول ويُخرجه من كل القوائم والتقارير. واسم
         المستخدم يُزاح ليُحرَّر الأصلي، ورمز الإحالة يُلغى فلا يُحال إليه. */
      await tx.update('users', mergeId, {
        active: false,
        username: `merged-${mergeId}-${merge.username}`.slice(0, 60),
        referralCode: null,
        mergedInto: keepId,
      });
      // جلسات الحساب المدموج تُنهى فورًا — لا تُنقل إلى الباقي
      await tx.deleteWhere('tokens', { userId: mergeId });

      /* سطر تدقيق يظهر في «سجل تنفيذ الإجراءات» القائم */
      await tx.insert('actionLog', {
        key: `merge:${mergeId}->${keepId}`,
        status: 'done',
        type: 'merge',
        title: `دمج حساب مكرر: ${merge.name} ← ${keep.name}`,
        note: `نُقل ${total} سجلًا: ` + (Object.entries(counts).map(([k, n]) => `${k}=${n}`).join('، ') || 'لا سجلات')
          + (gaps.length ? ` · حقول مُلئت: ${gaps.join('، ')}` : ''),
        traineeId: keepId,
        branchId: keep.branchId || null,
        byId: req.user.id,
        date: todayStr(),
      });
    });

    res.json({ ok: true, ...preview });
  }));
};

module.exports.phoneKey = phoneKey;
module.exports.nameKey = nameKey;
module.exports.REPARENT = REPARENT;

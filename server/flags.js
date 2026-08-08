/* ============================================================
   سبورت باور — نتائج المشتركين ومشاكلهم (Trainee Flags)
   الفكرة: أي متدرب قد «يصل لنتيجة» أو «تظهر عنده مشكلة» — وهذا رصد
   داخلي يُحدَّد من صفحة المشترك ومن صفحة القراءات، ويُجمَّع بالفرع
   ليعرف المدير كم نتيجة وكم مشكلة عنده.

   قاعدة صارمة: المتدرب لا يرى هذه السجلات إطلاقًا — لا في ملفه ولا في
   إشعاراته. تظهر للإدارة والمحاسب والمدرب وأخصائية التغذية فقط.
   ============================================================ */
const Store = require('./store');

const todayStr = () => new Date().toISOString().slice(0, 10);
const clean = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200);

const KINDS = ['result', 'problem'];
const SEVERITIES = ['low', 'medium', 'high'];

/* الأدوار التي ترى الرصد — المتدرب خارجها عمدًا */
const STAFF = ['admin', 'accountant', 'trainer', 'nutritionist'];
const canSeeFlags = (role) => STAFF.includes(role);

/* ملخّص الفرع: كم نتيجة وكم شخصًا عنده مشكلة — يُستعمل في صفحة القراءات */
async function flagsSummary(branch) {
  const [flags, branches, users] = await Promise.all([
    Store.all('traineeFlags'),
    Store.all('branches'),
    Store.all('users'),
  ]);
  const scoped = branch ? flags.filter((f) => f.branchId === Number(branch)) : flags;
  const open = scoped.filter((f) => f.status !== 'closed');
  const byBranch = branches
    .filter((b) => !branch || b.id === Number(branch))
    .map((b) => {
      const mine = flags.filter((f) => f.branchId === b.id);
      const mineOpen = mine.filter((f) => f.status !== 'closed');
      return {
        branchId: b.id, branch: b.name,
        results: mine.filter((f) => f.kind === 'result').length,
        // «عدد الأشخاص الذين عندهم مشاكل» — أشخاص لا سجلات
        problemPeople: new Set(mineOpen.filter((f) => f.kind === 'problem').map((f) => f.traineeId)).size,
        problems: mineOpen.filter((f) => f.kind === 'problem').length,
        resultPeople: new Set(mine.filter((f) => f.kind === 'result').map((f) => f.traineeId)).size,
      };
    });

  const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
  return {
    totals: {
      results: scoped.filter((f) => f.kind === 'result').length,
      resultPeople: new Set(scoped.filter((f) => f.kind === 'result').map((f) => f.traineeId)).size,
      problems: open.filter((f) => f.kind === 'problem').length,
      problemPeople: new Set(open.filter((f) => f.kind === 'problem').map((f) => f.traineeId)).size,
      closedProblems: scoped.filter((f) => f.kind === 'problem' && f.status === 'closed').length,
    },
    byBranch,
    recent: scoped
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, 40)
      .map((f) => ({ ...f, traineeName: nameOf(f.traineeId) })),
  };
}

module.exports = function registerFlags(app, { auth, requireRole, h, notify }) {
  /* قائمة الرصد — بالفرع أو بالمتدرب أو بالنوع */
  app.get('/api/trainee-flags', auth, requireRole(...STAFF), h(async (req, res) => {
    const { traineeFlags, users, branches } = await Store.load('traineeFlags', 'users', 'branches');
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || '#' + id;
    const branchOf = (id) => (branches.find((b) => b.id === id) || {}).name || '—';
    let list = traineeFlags;
    if (req.query.trainee) list = list.filter((f) => f.traineeId === Number(req.query.trainee));
    if (req.query.branch) list = list.filter((f) => f.branchId === Number(req.query.branch));
    if (KINDS.includes(req.query.kind)) list = list.filter((f) => f.kind === req.query.kind);
    if (req.query.status) list = list.filter((f) => (f.status || 'open') === req.query.status);
    res.json(list
      .map((f) => ({ ...f, traineeName: nameOf(f.traineeId), branchName: branchOf(f.branchId), byName: nameOf(f.createdBy) }))
      .sort((a, b) => b.id - a.id));
  }));

  /* ملخّص النتائج والمشاكل بالفرع — يظهر أعلى صفحة القراءات */
  app.get('/api/trainee-flags/summary', auth, requireRole(...STAFF), h(async (req, res) => {
    res.json(await flagsSummary(req.query.branch || null));
  }));

  app.post('/api/trainee-flags', auth, requireRole(...STAFF), h(async (req, res) => {
    const trainee = await Store.get('users', Number(req.body.traineeId));
    if (!trainee || trainee.role !== 'trainee') return res.status(400).json({ error: 'المتدرب غير موجود.' });
    const kind = KINDS.includes(req.body.kind) ? req.body.kind : null;
    if (!kind) return res.status(400).json({ error: 'النوع: نتيجة (result) أو مشكلة (problem).' });
    const title = clean(req.body.title, 160);
    if (!title) return res.status(400).json({ error: 'عنوان الرصد مطلوب (مثال: نزل 4 كغ / انقطاع متكرر).' });

    const flag = await Store.insert('traineeFlags', {
      traineeId: trainee.id, branchId: trainee.branchId, kind, title,
      note: clean(req.body.note, 600),
      severity: kind === 'problem' && SEVERITIES.includes(req.body.severity) ? req.body.severity : null,
      status: 'open', date: req.body.date || todayStr(), closedAt: null,
      inbodyId: Number(req.body.inbodyId) || null,
      createdBy: req.user.id,
    });

    /* إشعار الإدارة بالمشاكل فقط — والمتدرب لا يصله شيء إطلاقًا */
    if (kind === 'problem') {
      const admins = (await Store.find('users', { role: 'admin' })).filter((u) => u.active !== false);
      for (const a of admins) {
        if (a.id === req.user.id) continue;
        await notify(a.id, `⚠️ مشكلة مرصودة عند ${trainee.name}: «${title}» — راجعها في ملف المشترك (سرّي).`, 'flag');
      }
    }
    res.json(flag);
  }));

  app.put('/api/trainee-flags/:id', auth, requireRole(...STAFF), h(async (req, res) => {
    const flag = await Store.get('traineeFlags', req.params.id);
    if (!flag) return res.status(404).json({ error: 'السجل غير موجود.' });
    const patch = {};
    if (req.body.title !== undefined) patch.title = clean(req.body.title, 160);
    if (req.body.note !== undefined) patch.note = clean(req.body.note, 600);
    if (req.body.severity !== undefined) patch.severity = SEVERITIES.includes(req.body.severity) ? req.body.severity : null;
    if (req.body.status !== undefined) {
      if (!['open', 'closed'].includes(req.body.status)) return res.status(400).json({ error: 'الحالة: open أو closed.' });
      patch.status = req.body.status;
      patch.closedAt = req.body.status === 'closed' ? todayStr() : null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'لا شيء لتعديله.' });
    res.json(await Store.update('traineeFlags', flag.id, patch));
  }));

  app.delete('/api/trainee-flags/:id', auth, requireRole('admin'), h(async (req, res) => {
    await Store.remove('traineeFlags', req.params.id);
    res.json({ ok: true });
  }));
};

module.exports.canSeeFlags = canSeeFlags;
module.exports.flagsSummary = flagsSummary;
module.exports.STAFF = STAFF;

/* ============================================================
   الأهداف التدريبية للمشتركين
   البرنامج التدريبي لم يعد واحدًا يُربط بالجميع: لكل مشترك هدفه هو.
   من هنا يُكتب الهدف، ومنه تُعرف فجوة الشهر: من بقي بلا هدف تدريبي.
   ============================================================ */

function goalChip(label, value, suffix) {
  if (value === null || value === undefined || value === '') return el('span');
  return el('span', { class: 'macro' }, label + ' ', el('b', {}, String(value) + (suffix || '')));
}

/* بطاقة هدف واحد — تُستعمل في ملف المشترك وفي لوحة المدرب */
function goalCard(g, { onDone, canEdit } = {}) {
  const body = el('div', { style: 'flex:1' },
    el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px' },
      el('b', { style: 'font-family:var(--font-display);font-size:14px' }, g.style || g.title || 'هدف تدريبي'),
      g.status === 'done' ? el('span', { class: 'tag tag--accent' }, 'تحقّق')
        : g.status === 'cancelled' ? el('span', { class: 'tag tag--neutral' }, 'ملغى')
          : el('span', { class: 'tag tag--petrol' }, 'ساري'),
      el('span', { style: 'font-size:12px;color:var(--app-muted)' }, g.date)),
    g.purpose ? el('div', { style: 'font-size:13px;color:var(--app-muted);margin-bottom:6px' }, 'الهدف من الأسلوب: ' + g.purpose) : '',
    el('div', { class: 'macros' },
      goalChip('حصص الشهر', g.sessionsPerMonth),
      goalChip('غيابات مسموحة', g.allowedAbsences),
      goalChip('تعويض خلال', g.makeupMonths, ' شهر'),
      goalChip('التزام الأكل', g.mealCommitPct, '%'),
      goalChip('مدة الهدف', g.durationMonths, ' شهر')),
    g.targetChanges ? el('div', { style: 'font-size:13px;margin-top:8px' },
      el('b', {}, 'التغيّرات المطلوبة: '), g.targetChanges) : '',
    g.notes ? el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:6px' }, g.notes) : '',
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:6px' }, 'المدرب: ' + (g.trainerName || '—')));

  const actions = canEdit
    ? el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openGoalModal(onDone, g.traineeId, null, g) }, 'تعديل'),
      el('button', {
        class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
        onclick: async () => {
          if (!confirm('حذف هذا الهدف التدريبي؟')) return;
          try { await API.del('/api/trainee-goals/' + g.id); toast('حُذف الهدف.'); onDone && onDone(); }
          catch (ex) { toast(ex.message, true); }
        },
      }, 'حذف'))
    : el('span');

  return el('div', { class: 'notif', style: 'align-items:flex-start;gap:12px' }, body, actions);
}

/* بطاقة أهداف المشترك داخل ملفه */
async function traineeGoalsCard(traineeId, onDone) {
  let goals = [];
  try { goals = await API.get('/api/trainee-goals?trainee=' + traineeId); } catch (e) { return el('span'); }
  const canWrite = ['admin', 'trainer', 'nutritionist'].includes(API.user.role);
  const card = el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, '🎯 الأهداف التدريبية',
      canWrite
        ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => openGoalModal(onDone, traineeId) }, '+ هدف تدريبي')
        : el('span')));
  if (!goals.length) {
    card.append(el('div', { class: 'empty' },
      canWrite ? 'لا هدف تدريبي لهذا المشترك بعد — اكتب له هدفه (الأسلوب، حصص الشهر، الغيابات المسموحة، التزام الأكل، والتغيّرات المطلوبة).'
        : 'لم يُوضع لك هدف تدريبي بعد — اسأل مدربك.'));
  } else {
    card.append(el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      ...goals.map((g) => goalCard(g, {
        onDone,
        canEdit: canWrite && (API.user.role !== 'trainer' || !g.trainerId || g.trainerId === API.user.id),
      }))));
  }
  return card;
}

/* نافذة كتابة الهدف — الحقول التي طلبها العميل بالحرف */
async function openGoalModal(onDone, traineeId, trainees, existing) {
  if (!traineeId && !trainees) trainees = await API.get('/api/users?role=trainee').catch(() => []);
  const traineeSel = traineeId ? null : searchSelect((trainees || []).map(traineeOption), { value: '' });
  const g = existing || {};
  const styleIn = input({ value: g.style || '', placeholder: 'مثال: قوة ودفع — تقسيم علوي/سفلي' });
  const purposeIn = input({ value: g.purpose || '', placeholder: 'مثال: رفع القوة القصوى مع تثبيت الوزن' });
  const sessionsIn = input({ type: 'number', min: 0, max: 60, value: g.sessionsPerMonth ?? 12 });
  const absIn = input({ type: 'number', min: 0, max: 30, value: g.allowedAbsences ?? 2 });
  const makeupIn = input({ type: 'number', min: 0, max: 12, value: g.makeupMonths ?? 1 });
  const mealIn = input({ type: 'number', min: 0, max: 100, value: g.mealCommitPct ?? 90 });
  const durIn = input({ type: 'number', min: 0, max: 24, value: g.durationMonths ?? 3 });
  const changesIn = textarea({ value: g.targetChanges || '', placeholder: 'مثال: نزول 6 كغ دهون · رفع كتلة العضل 2 كغ · خصر −8 سم' });
  const notesIn = textarea({ value: g.notes || '', placeholder: 'ملاحظات إضافية…' });
  const dateIn = input({ type: 'date', value: g.date || todayISO() });
  const statusSel = existing
    ? select([['active', 'ساري'], ['done', 'تحقّق'], ['cancelled', 'ملغى']], { value: g.status || 'active' })
    : null;

  const close = modal(existing ? 'تعديل الهدف التدريبي' : 'هدف تدريبي جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const tid = traineeId || Number(traineeSel.value);
        if (!tid) { toast('اختر المشترك.', true); return; }
        if (!styleIn.value.trim()) { toast('اكتب الأسلوب التدريبي.', true); return; }
        const body = {
          traineeId: tid, date: dateIn.value,
          style: styleIn.value, purpose: purposeIn.value,
          sessionsPerMonth: sessionsIn.value, allowedAbsences: absIn.value,
          makeupMonths: makeupIn.value, mealCommitPct: mealIn.value,
          durationMonths: durIn.value, targetChanges: changesIn.value, notes: notesIn.value,
        };
        try {
          if (existing) {
            body.status = statusSel.value;
            await API.put('/api/trainee-goals/' + existing.id, body);
            toast('حُفظ الهدف.');
          } else {
            await API.post('/api/trainee-goals', body);
            toast('كُتب الهدف — ووصل إشعار للمشترك.');
          }
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      traineeSel ? el('div', { class: 'span-2' }, field('المشترك', traineeSel)) : el('span'),
      el('div', { class: 'span-2' }, field('الأسلوب التدريبي *', styleIn)),
      el('div', { class: 'span-2' }, field('الهدف من الأسلوب', purposeIn)),
      field('عدد الحصص خلال الشهر', sessionsIn),
      field('الغيابات المسموحة', absIn),
      field('تعويض الغياب خلال (شهر)', makeupIn),
      field('الالتزام بخطة الأكل %', mealIn),
      field('مدة الهدف (شهر)', durIn),
      field('تاريخ الهدف', dateIn),
      statusSel ? field('الحالة', statusSel) : el('span'),
      el('div', { class: 'span-2' }, field('التغيّرات المطلوبة خلال المدة', changesIn)),
      el('div', { class: 'span-2' }, field('ملاحظات', notesIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' },
        existing ? 'حفظ الهدف' : 'كتابة الهدف'))),
  ], { wide: true });
}

/* بطاقة المدرب: أهدافه هذا الشهر + من بقي من متدربيه بلا هدف */
async function trainerGoalsCard(container, onDone) {
  const month = thisMonthISO();
  const card = el('div', { class: 'card' });
  container.append(card);
  let sum;
  try { sum = await API.get('/api/trainee-goals/summary?month=' + month); }
  catch (e) { card.remove(); return; }

  const mine = (sum.byTrainer || []).find((t) => t.trainerId === API.user.id) || { goals: 0, trainees: 0 };
  card.append(
    el('h3', { class: 'card__title' }, `🎯 الأهداف التدريبية — ${month}`,
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => openGoalModal(onDone, null) }, '+ هدف لمشترك')),
    el('div', { class: 'macros', style: 'margin-bottom:10px' },
      el('span', { class: 'macro' }, 'أهداف كتبتها ', el('b', {}, String(mine.goals))),
      el('span', { class: 'macro' }, 'مشتركون غطّيتهم ', el('b', {}, String(mine.trainees))),
      el('span', { class: 'macro' }, 'بلا هدف هذا الشهر ',
        el('b', { style: sum.totals.missing ? 'color:var(--status-danger)' : '' }, String(sum.totals.missing)))),
    sum.missing.length
      ? dataTable(['مشترك بلا هدف هذا الشهر', 'الفرع', 'آخر هدف كُتب له', ''],
        sum.missing.slice(0, 12).map((m) => [
          el('a', { href: '#/trainee/' + m.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, m.name),
          m.branch,
          m.lastGoalDate || el('span', { class: 'tag tag--danger' }, 'لم يُكتب له قط'),
          el('button', { class: 'btn btn--outline btn--sm', onclick: () => openGoalModal(onDone, m.traineeId) }, '+ اكتب هدفه')]))
      : el('div', { class: 'empty' }, 'كل المشتركين الفعّالين لهم هدف هذا الشهر 👏'));
}

/* لوحة الإدارة: إنتاج كل مدرب من الأهداف ومن بقي بلا هدف */
async function goalsSummaryCard(month, branch) {
  let sum;
  try { sum = await API.get(`/api/trainee-goals/summary?month=${month}${branch ? '&branch=' + branch : ''}`); }
  catch (e) { return el('span'); }
  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `الأهداف التدريبية — ${sum.month}`,
      sum.totals.coveragePct !== null
        ? el('span', { class: 'tag ' + (sum.totals.coveragePct >= 90 ? 'tag--accent' : sum.totals.coveragePct >= 60 ? 'tag--warning' : 'tag--danger') },
          `التغطية ${sum.totals.coveragePct}%`)
        : el('span')),
    el('div', { class: 'kpis', style: 'margin-bottom:10px' },
      kpiTile(sum.totals.goals, 'هدف كُتب هذا الشهر', 'target'),
      kpiTile(sum.totals.traineesWithGoal, 'مشترك له هدف', 'check'),
      kpiTile(sum.totals.missing, 'مشترك بلا هدف', 'alert', sum.totals.missing ? 'danger' : undefined)),
    dataTable(['المدرب', 'الفرع', 'أهداف كتبها', 'مشتركون غطّاهم'],
      sum.byTrainer.map((t) => [t.name, t.branch,
        el('b', { class: 'num' }, String(t.goals)), el('span', { class: 'num' }, String(t.trainees))])),
    sum.missing.length
      ? el('div', {},
        el('h4', { style: 'margin:14px 0 6px;font-size:13px;color:var(--app-muted)' },
          `مشتركون فعّالون بلا هدف هذا الشهر (${sum.missing.length})`),
        dataTable(['المشترك', 'الفرع', 'آخر هدف'],
          sum.missing.slice(0, 30).map((m) => [
            el('a', { href: '#/trainee/' + m.traineeId, style: 'color:var(--action);text-decoration:none' }, m.name),
            m.branch, m.lastGoalDate || el('span', { class: 'tag tag--danger' }, 'لم يُكتب له قط')])))
      : el('span'));
}

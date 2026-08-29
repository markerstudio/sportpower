/* النمو والمبيعات والولاء: متابعة المبيعات، تقرير النمو، المصاريف،
   البرامج التدريبية، نقاطي ومكافآتي، الولاء والإحالات */

const LEAD_STAGE_LABELS = {
  new: 'جديد', contacted: 'تم التواصل', 'trial-booked': 'حجز تجربة',
  'trial-attended': 'حضر التجربة', 'no-show': 'لم يحضر التجربة',
  subscribed: 'اشترك ✓', lost: 'مغلق (لم يشترك)',
};
const LEAD_OBJECTIONS = ['غالي', 'بعيد', 'ما رد', 'يفكر', 'ما اجى عالتست', 'وقت غير مناسب', 'اشترك بمكان آخر', 'أخرى'];
const LEAD_CHANNELS = ['إنستغرام', 'فيسبوك', 'واتساب', 'تيك توك', 'إحالة صديق', 'زيارة مباشرة', 'اتصال هاتفي', 'أخرى'];
const CANCEL_REASONS = ['السعر', 'السفر', 'الإصابة', 'عدم وجود نتائج', 'عدم الالتزام', 'خدمة المدرب', 'ظروف مالية', 'أخرى'];

/* ============================================================
   متابعة المبيعات — ملف بكل رقم نتواصل معه + تحليل شهري
   ============================================================ */
async function viewSales(root) {
  /* «المبيعات اقدر ابحث كل فرع لحاله» — الفرع فلتر كامل يشمل المؤشرات
     والقنوات والاعتراضات وملف المتابعة، لا الجدول وحده. */
  const state = urlState({ month: thisMonthISO(), branch: '' });
  const container = el('div', { class: 'content' });
  root.append(container);

  /* الفلاتر تُكتب في العنوان، وموضع الصفحة يبقى كما هو بعد كل إعادة بناء */
  const render = (...a) => keepScroll(() => build(...a));

  async function build() {
    state.sync();
    container.innerHTML = '';
    container.append(spinnerCard());
    const branchQ = state.branch ? '&branch=' + state.branch : '';
    const [leads, summary, branches] = await Promise.all([
      API.get(`/api/leads?month=${state.month}${branchQ}`),
      API.get(`/api/leads/summary?month=${state.month}${branchQ}`),
      API.get('/api/branches'),
    ]);
    container.innerHTML = '';

    const monthIn = input({ type: 'month', value: state.month, onchange: (e) => { state.month = e.target.value; render(); } });
    const branchSel = select([['', 'كل الفروع'], ...branches.map((b) => [b.id, b.name])], {
      value: state.branch, onchange: (e) => { state.branch = e.target.value; render(); },
    });
    container.append(el('div', { class: 'card filters' },
      field('الشهر', monthIn), field('الفرع', branchSel),
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn btn--accent', onclick: () => openLeadModal(render, branches) }, '+ عميل محتمل جديد')));

    if (state.branch) {
      const bn = (branches.find((b) => String(b.id) === String(state.branch)) || {}).name || '';
      container.append(el('div', { class: 'alert alert--info' },
        `كل الأرقام أدناه لفرع ${bn} وحده — نسبة الإغلاق والقنوات والاعتراضات وملف المتابعة.`));
    }

    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(summary.total, 'رقم تواصلنا معه هذا الشهر', 'wa'),
      kpiHero(summary.subscribed, 'صاروا عملاء', 'check', 'green'),
      kpiHero(summary.closingRate !== null ? summary.closingRate + '%' : '—', 'نسبة الإغلاق الشهرية', 'target', 'blue')));
    container.append(el('div', { class: 'kpis' },
      kpiTile(summary.inProgress, 'قيد المتابعة', 'clock'),
      kpiTile(summary.noShow, 'لم يحضروا التجربة', 'alert', 'warn'),
      kpiTile(summary.lost, 'مغلق بلا اشتراك', 'alert', 'danger')));

    // أين تكمن مشاكل المبيعات + من أين يصل العملاء
    const pctOf = (n) => summary.total ? Math.round((n / summary.total) * 100) + '%' : '—';
    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'مشاكل المبيعات — الاعتراضات'),
        dataTable(['السبب', 'العدد', 'من إجمالي الشهر'],
          Object.entries(summary.byObjection).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, el('b', { class: 'num' }, String(v)), pctOf(v)]),
          'لا اعتراضات مسجلة هذا الشهر.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'قنوات التواصل'),
        dataTable(['القناة', 'العدد', 'اشتركوا'],
          Object.entries(summary.byChannel).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, el('b', { class: 'num' }, String(v)),
              String(leads.filter((l) => l.channel === k && l.stage === 'subscribed').length)]),
          'لا بيانات قنوات هذا الشهر.'))));

    // ملف المتابعة
    const branchName = (id) => (branches.find((b) => b.id === id) || {}).name || '—';
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `ملف المتابعة — ${state.month} (${leads.length})`),
      pagedTable(['التاريخ', 'الاسم', 'الجوال', 'السكن', 'القناة', 'الفرع', 'الهدف', 'المرحلة', 'المشكلة', ''],
        leads,
        (l) => [l.contactDate, l.name,
          el('span', { dir: 'ltr' }, l.phone || '—'),
          l.residence || '—', l.channel || '—', branchName(l.branchId), l.goal || '—',
          select(Object.entries(LEAD_STAGE_LABELS), {
            value: l.stage, style: 'min-width:130px;padding:6px 8px;font-size:12px',
            onchange: async (e) => {
              try { await API.put('/api/leads/' + l.id, { stage: e.target.value }); toast('حُدّثت المرحلة.'); }
              catch (ex) { toast(ex.message, true); }
            },
          }),
          l.objection || '—',
          el('div', { style: 'display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap' },
            l.phone ? el('a', {
              class: 'btn btn--petrol btn--sm', target: '_blank',
              href: waLink(l.phone, OPS_SETTINGS.waCountryCode || '970', '', l.name),
            }, 'واتساب') : el('span'),
            l.stage !== 'subscribed'
              ? el('button', {
                class: 'btn btn--accent btn--sm',
                onclick: () => openOnboardModal(render, { name: l.name, phone: l.phone, branchId: l.branchId, leadId: l.id }),
              }, 'تسجيله كمشترك')
              : el('span', { class: 'tag tag--accent' }, 'عميل ✓'),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openLeadModal(render, branches, l) }, 'تعديل'))],
        { pageSize: 15, searchText: (l) => `${l.name} ${l.phone || ''} ${l.channel || ''}`, searchPlaceholder: 'ابحث بالاسم أو الجوال…', emptyText: 'لا سجلات لهذا الشهر — أضف أول عميل محتمل.' })));
  }

  await render();
}

function openLeadModal(onDone, branches, existing) {
  const nameIn = input({ value: existing ? existing.name : '', placeholder: 'اسم العميل المحتمل *' });
  const phoneIn = input({ value: existing ? existing.phone : '', placeholder: '05XXXXXXXX', dir: 'ltr', style: 'text-align:end' });
  const dateIn = input({ type: 'date', value: existing ? existing.contactDate : todayISO() });
  const residenceIn = input({ value: existing ? existing.residence : '', placeholder: 'مكان السكن' });
  const channelSel = select(LEAD_CHANNELS.map((c) => [c, c]), { value: existing ? existing.channel || 'إنستغرام' : 'إنستغرام' });
  const typeIn = input({ value: existing ? existing.trainingType : '', placeholder: 'شخصي / جروب…' });
  const branchSel = select([['', 'بلا فرع'], ...branches.map((b) => [b.id, b.name])], { value: existing ? existing.branchId || '' : '' });
  const goalIn = input({ value: existing ? existing.goal : '', placeholder: 'نزول بالوزن / بناء عضل…' });
  const stageSel = select(Object.entries(LEAD_STAGE_LABELS), { value: existing ? existing.stage : 'new' });
  const objectionSel = select([['', 'لا يوجد'], ...LEAD_OBJECTIONS.map((o) => [o, o])], { value: existing ? existing.objection || '' : '' });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });

  const close = modal(existing ? `تعديل «${existing.name}»` : 'عميل محتمل جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const body = {
          name: nameIn.value, phone: phoneIn.value, contactDate: dateIn.value,
          residence: residenceIn.value, channel: channelSel.value, trainingType: typeIn.value,
          branchId: branchSel.value || null, goal: goalIn.value,
          stage: stageSel.value, objection: objectionSel.value, note: noteIn.value,
        };
        try {
          if (existing) await API.put('/api/leads/' + existing.id, body);
          else await API.post('/api/leads', body);
          toast(existing ? 'حُدّث السجل.' : 'أُضيف للمتابعة — تابع مراحله من الجدول.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('الاسم *', nameIn), field('الجوال', phoneIn),
      field('تاريخ التواصل', dateIn), field('قناة التواصل', channelSel),
      field('مكان السكن', residenceIn), field('نوع التدريب', typeIn),
      field('فرع التدريب', branchSel), field('هدف المشترك', goalIn),
      field('المرحلة', stageSel), field('المشكلة / الاعتراض', objectionSel),
      el('div', { class: 'span-2' }, field('ملاحظات', noteIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إضافة للمتابعة'))),
  ], { wide: true });
}

/* ============================================================
   تقرير النمو الشهري — يُعرض داخل صفحة التقارير
   ============================================================ */
function renderGrowthReport(container, g) {
  const k = g.kpis;
  const fmtPct = (v) => (v === null || v === undefined ? '—' : v + '%');

  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `KPI نمو الفرع — ${g.month}`),
    el('div', { class: 'kpis', style: 'margin-bottom:12px' },
      kpiTile(k.newSubscribers, 'المشتركون الجدد', 'users'),
      kpiTile(k.renewals, 'المجددون', 'check'),
      kpiTile(fmtPct(k.retentionRate), 'نسبة التجديد Retention', 'target', 'blue'),
      kpiTile(k.activeSubscribers, 'المشتركون النشطون', 'user')),
    el('div', { class: 'kpis', style: 'margin-bottom:12px' },
      kpiTile(k.cancellations, 'الإلغاءات', 'alert', 'danger'),
      kpiTile(fmtPct(k.cancellationRate), 'نسبة الإلغاء', 'alert', 'danger'),
      kpiTile(k.frozen, 'المجمدون', 'snow', 'blue'),
      kpiTile(fmtPct(k.freezeRate), 'نسبة التجميد', 'snow')),
    el('div', { class: 'kpis' },
      kpiTile((k.netGrowth > 0 ? '+' : '') + k.netGrowth, 'النمو الصافي Net Growth', 'chart', k.netGrowth >= 0 ? undefined : 'danger'),
      kpiTile(k.avgDurationMonths !== null ? k.avgDurationMonths + ' شهر' : '—', 'متوسط بقاء العميل', 'clock'),
      kpiTile(k.ltv && Object.keys(k.ltv).length ? fmtMoneyMap(k.ltv) : '—', 'متوسط قيمة العميل LTV', 'wallet', 'blue'))));

  // أسباب الإلغاء + المالية (المصاريف وصافي الربح)
  const churnRows = Object.entries(g.churnReasons).sort((a, b) => b[1] - a[1]);
  container.append(el('div', { class: 'grid-2eq' },
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'أسباب الإلغاء'),
      dataTable(['السبب', 'العدد'],
        churnRows.map(([r, n]) => [r, el('b', { class: 'num' }, String(n))]),
        'لا إلغاءات هذا الشهر 🎉')),
    el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'الأرباح وصافي الربح'),
      el('div', { class: 'kpis', style: 'grid-template-columns:1fr 1fr 1fr;margin-bottom:12px' },
        kpiTile(fmtMoneyMap(g.finance.revenue), 'التحصيل', 'wallet'),
        kpiTile(fmtMoneyMap(g.finance.expensesTotal), 'المصاريف', 'card', 'warn'),
        kpiTile(fmtMoneyMap(g.finance.netProfit), 'صافي الربح', 'chart', Object.values(g.finance.netProfit || {}).every((v) => Number(v) >= 0) ? 'blue' : 'danger')),
      dataTable(['المصروف', 'التصنيف', 'المبلغ'],
        g.finance.expenses.map((e) => [e.label, e.category, fmtMoney(e.amount)]),
        'لا مصاريف مسجلة لهذا الشهر.'))));

  // مقارنة النتائج بالهدف الشهري والسنوي
  if (g.goals.monthly.length) {
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `الأهداف الشهرية — ${g.month} (مع الترحيل التلقائي للمتبقي)`),
      dataTable(['النطاق', 'المؤشر', 'الهدف الأساسي', 'المرحَّل من السابق', 'الهدف الفعلي', 'المحقق', 'نسبة الإنجاز'],
        g.goals.monthly.map((t) => {
          const money = t.metric === 'revenue';
          const fv = (v) => (money ? fmtMoney(v) : String(v));
          return [t.scopeName, t.metricLabel, fv(t.value),
            t.carried > 0 ? el('span', { class: 'tag tag--warning' }, '+' + fv(t.carried)) : '—',
            el('b', {}, fv(t.effective)), fv(t.actual), progressBar(t.pct)];
        }))));
  }
  g.goals.annual.forEach((t) => {
    const money = t.metric === 'revenue';
    const fv = (v) => (money ? fmtMoney(v) : String(v));
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, `الهدف السنوي — ${t.scopeName} · ${t.metricLabel}`,
        el('span', { style: 'min-width:130px' }, progressBar(t.pct))),
      el('div', { class: 'macros', style: 'margin-bottom:10px' },
        el('span', { class: 'macro' }, 'الهدف السنوي ', el('b', {}, fv(t.value))),
        el('span', { class: 'macro' }, 'حصة كل شهر ', el('b', {}, fv(t.monthlyShare))),
        el('span', { class: 'macro' }, 'المحقق ', el('b', {}, fv(t.actual)))),
      el('div', { class: 'legend', style: 'margin-bottom:6px' },
        el('span', {}, el('i', { style: 'background:var(--accent)' }), 'المحقق شهريًا'),
        el('span', {}, el('i', { style: 'background:var(--blue-500)' }), 'الحصة الشهرية من الهدف')),
      lineChart(t.months.map((m) => m.month.slice(5)),
        t.months.map((m) => m.actual),
        t.months.map(() => t.monthlyShare))));
  });
}

/* ============================================================
   المصاريف الشهرية — بطاقة إدارة (لوحة المحاسب)
   ============================================================ */
function expensesCard(expenses, branches, month, onDone) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, `المصاريف الشهرية — ${month} (${fmtMoney(total)})`,
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => openExpenseModal(onDone, branches, month) }, '+ مصروف')),
    dataTable(['البيان', 'التصنيف', 'الفرع', 'المبلغ', 'ملاحظة', ''],
      expenses.map((x) => [x.label, x.category,
        x.branchId ? (branches.find((b) => b.id === x.branchId) || {}).name || '—' : 'عام',
        fmtMoney(x.amount), x.note || '—',
        el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openExpenseModal(onDone, branches, month, x) }, 'تعديل'),
          el('button', {
            class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
            onclick: async () => {
              if (!confirm(`حذف مصروف «${x.label}»؟`)) return;
              try { await API.del('/api/expenses/' + x.id); toast('حُذف المصروف.'); onDone && onDone(); }
              catch (ex) { toast(ex.message, true); }
            },
          }, 'حذف'))]),
      'لا مصاريف مسجلة لهذا الشهر — تظهر في التقرير الشهري مع صافي الربح.'));
}

function openExpenseModal(onDone, branches, month, existing) {
  const labelIn = input({ value: existing ? existing.label : '', placeholder: 'مثال: رواتب المدربين' });
  const categorySel = select(['رواتب', 'إيجار', 'كهرباء وماء', 'صيانة', 'تسويق', 'معدات', 'اشتراكات وأنظمة', 'أخرى'].map((c) => [c, c]),
    { value: existing ? existing.category : 'رواتب' });
  const monthIn = input({ type: 'month', value: existing ? existing.month : month });
  const branchSel = select([['', 'عام (كل الشركة)'], ...branches.map((b) => [b.id, b.name])], { value: existing ? existing.branchId || '' : '' });
  const amountIn = input({ type: 'number', min: 1, value: existing ? existing.amount : '' });
  const expAmountLabel = curLabel('المبلغ', branchCurrency(Number(branchSel.value) || null));
  branchSel.addEventListener('change', () => expAmountLabel.setCurrency(branchCurrency(Number(branchSel.value) || null)));
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });

  const close = modal(existing ? 'تعديل مصروف' : 'مصروف شهري جديد', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        const body = {
          label: labelIn.value, category: categorySel.value, month: monthIn.value,
          branchId: branchSel.value || null, amount: amountIn.value, note: noteIn.value,
        };
        try {
          if (existing) await API.put('/api/expenses/' + existing.id, body);
          else await API.post('/api/expenses', body);
          toast('حُفظ المصروف — سيظهر في التقرير الشهري مع صافي الربح.');
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('البيان *', labelIn)),
      field('التصنيف', categorySel), field('الشهر', monthIn),
      field('الفرع', branchSel), field(expAmountLabel, amountIn),
      el('div', { class: 'span-2' }, field('ملاحظة', noteIn)),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ المصروف'))),
  ]);
}

/* ============================================================
   إلغاء اشتراك مع سبب — يغذي «أسباب الإلغاء» في تقرير النمو
   ============================================================ */
function openCancelReasonModal(title, onConfirm) {
  const reasonSel = select(CANCEL_REASONS.map((r) => [r, r]));
  const noteIn = input({ placeholder: 'تفصيل إضافي (اختياري)' });
  const close = modal(title, [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        const reason = reasonSel.value === 'أخرى' && noteIn.value ? noteIn.value : reasonSel.value + (noteIn.value ? ` — ${noteIn.value}` : '');
        close();
        onConfirm(reason);
      },
    },
      el('div', { class: 'alert alert--warning' }, 'سبب الإلغاء يُسجَّل في تقرير النمو الشهري لتحليل أسباب خسارة العملاء.'),
      field('سبب الإلغاء', reasonSel),
      field('ملاحظة', noteIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit', style: 'background:var(--status-danger)' }, 'تأكيد الإلغاء')),
  ]);
}

/* ============================================================
   البرامج التدريبية — تُربط تلقائيًا بكل المتدربين
   ============================================================ */
async function renderTrainerPrograms(container, onDone) {
  const programs = await API.get('/api/programs');
  container.append(el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, 'برامجي التدريبية',
      el('button', { class: 'btn btn--accent btn--sm', onclick: () => openProgramModal(onDone) }, '+ برنامج جديد')),
    el('div', { style: 'font-size:12px;color:var(--app-muted);margin-bottom:8px' },
      'عند إنشاء برنامج يُربط تلقائيًا بكل متدربيك ويصلهم إشعار به.'),
    programs.length
      ? el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        ...programs.map((p) => el('div', { class: 'notif' },
          el('div', {},
            el('b', {}, p.title),
            p.focus ? el('span', { class: 'tag tag--petrol', style: 'margin-inline-start:8px' }, p.focus) : '',
            el('div', { style: 'font-size:13px;color:var(--app-muted);margin-top:4px' }, p.description || '')),
          el('div', { style: 'display:flex;gap:6px;align-items:center' },
            el('time', {}, p.createdAt),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openProgramModal(onDone, p) }, 'تعديل'),
            el('button', {
              class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)',
              onclick: async () => {
                if (!confirm(`حذف برنامج «${p.title}»؟`)) return;
                try { await API.del('/api/programs/' + p.id); toast('حُذف البرنامج.'); onDone && onDone(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, 'حذف')))))
      : el('div', { class: 'empty' }, 'لا برامج بعد — أنشئ أول برنامج تدريبي.')));
}

function openProgramModal(onDone, existing) {
  const titleIn = input({ value: existing ? existing.title : '', placeholder: 'مثال: برنامج القوة الأساسي — 4 أسابيع' });
  const focusIn = input({ value: existing ? existing.focus : '', placeholder: 'مثال: قوة وبناء عضل' });
  const descIn = textarea({ value: existing ? existing.description : '', placeholder: 'تفاصيل الأسابيع والتمارين…', style: 'min-height:120px' });

  const close = modal(existing ? 'تعديل البرنامج التدريبي' : 'برنامج تدريبي جديد', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          if (existing) {
            await API.put('/api/programs/' + existing.id, { title: titleIn.value, focus: focusIn.value, description: descIn.value });
            toast('حُدّث البرنامج.');
          } else {
            const res = await API.post('/api/programs', { title: titleIn.value, focus: focusIn.value, description: descIn.value });
            toast(`أُنشئ البرنامج ورُبط تلقائيًا بـ ${res.linkedTrainees} متدربًا — ووصلهم إشعار.`);
          }
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('عنوان البرنامج *', titleIn),
      field('التركيز / الهدف', focusIn),
      field('تفاصيل البرنامج', descIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, existing ? 'حفظ التعديل' : 'إنشاء وربط بكل المتدربين')),
  ], { wide: true });
}

function programsListCard(programs, title) {
  return el('div', { class: 'card' },
    el('h3', { class: 'card__title' }, title || 'البرنامج التدريبي'),
    programs.length
      ? el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        ...programs.slice(0, 5).map((p) => el('div', { class: 'notif' },
          el('div', {},
            el('b', {}, p.title),
            p.focus ? el('span', { class: 'tag tag--petrol', style: 'margin-inline-start:8px' }, p.focus) : '',
            el('div', { style: 'font-size:13px;color:var(--app-muted);margin-top:4px' }, p.description || ''),
            el('div', { style: 'font-size:12px;color:var(--app-muted);margin-top:4px' }, 'المدرب: ' + (p.trainerName || '—'))),
          el('time', {}, p.createdAt))))
      : el('div', { class: 'empty' }, 'لم يُنشر برنامج تدريبي بعد.'));
}

/* ============================================================
   نقاطي ومكافآتي — تطبيق المتدرب
   ============================================================ */
async function viewMyPoints(root) {
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const data = await API.get('/api/loyalty/me');
    container.innerHTML = '';

    const redeemed = data.earned - data.balance;
    container.append(el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(230px,1fr))' },
      kpiHero(data.balance, 'نقطتي الحالية', 'star', 'green'),
      kpiHero(data.earned, 'إجمالي النقاط المكتسبة', 'gift'),
      kpiHero(data.referrals.length, 'أصدقاء دعوتهم', 'users', 'blue')));

    // ادعُ صديقًا
    const subscribeMsg = `يا هلا 👋 أنا متدرب في Sport Power وناصحك تجرب 💪\nاشترك واذكر كود الإحالة تبعي: ${data.referralCode}\nمنستفيد إحنا الاثنين 🎁`;
    const sessionMsg = `مدعو لحصة تدريبية تجريبية معي في Sport Power 🏋️\nاحكي مع الاستقبال واذكر كودي ${data.referralCode} لينسقولك الموعد!`;
    const shareBtn = (label, msg) => el('a', {
      class: 'btn btn--accent', target: '_blank',
      href: 'https://wa.me/?text=' + encodeURIComponent(msg),
    }, label);
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'ادعُ صديقًا 🤝'),
      el('div', { style: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap' },
        el('div', { style: 'font-family:var(--font-mono);direction:ltr;font-size:1.6rem;font-weight:900;color:var(--accent-hover);border:2px dashed var(--app-line);border-radius:10px;padding:10px 22px' }, data.referralCode),
        el('div', { style: 'flex:1;min-width:220px;font-size:13px;color:var(--app-muted)' },
          `شارك كودك مع أصدقائك — عند اشتراك صديقك فعليًا تحصل على ${data.pts.referral} نقطة بعد اعتماد الإدارة، وتقدر تدعوه لحصة تجريبية كمان.`)),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px' },
        shareBtn('دعوة صديق للاشتراك 💪', subscribeMsg),
        shareBtn('دعوة صديق لحصة تجريبية 🏋️', sessionMsg),
        el('button', {
          class: 'btn btn--outline',
          onclick: () => navigator.clipboard.writeText(data.referralCode).then(() => toast('نُسخ الكود.')),
        }, 'نسخ الكود'))));

    // كيف أكسب النقاط؟
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'كيف أكسب النقاط؟'),
      el('div', { class: 'macros' },
        el('span', { class: 'macro' }, 'نتيجة منشورة على السوشال ميديا 📣 ', el('b', {}, `+${data.pts.result}`)),
        el('span', { class: 'macro' }, 'تجديد الاشتراك ', el('b', {}, `+${data.pts.renewal}`)),
        el('span', { class: 'macro' }, 'إحالة صديق ', el('b', {}, `+${data.pts.referral}`)),
        el('span', { class: 'macro' }, 'تحقيق هدف الوزن/القياسات ', el('b', {}, 'مكافأة من المدرب 🎯')))));

    // المكافآت المتاحة
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'المكافآت — استبدل نقاطك'),
      el('div', { class: 'kpis', style: 'grid-template-columns:repeat(auto-fit,minmax(220px,1fr))' },
        ...data.rewards.map((r) => el('div', { class: 'kpi', style: 'flex-direction:column;align-items:flex-start;gap:8px' },
          el('div', { class: 'kpi__value', style: 'font-size:1rem' }, r.name),
          el('div', { class: 'kpi__label' }, `${r.cost} نقطة`),
          el('button', {
            class: 'btn btn--sm ' + (data.balance >= r.cost ? 'btn--accent' : 'btn--outline'),
            disabled: data.balance < r.cost || null,
            onclick: async () => {
              if (!confirm(`استبدال ${r.cost} نقطة بمكافأة «${r.name}»؟`)) return;
              try {
                await API.post('/api/redemptions', { rewardId: r.id });
                toast('أُرسل طلبك — بانتظار اعتماد الإدارة.');
                render();
              } catch (ex) { toast(ex.message, true); }
            },
          }, data.balance >= r.cost ? 'استبدال' : `تحتاج ${r.cost - data.balance} نقطة إضافية`))))));

    // السجلات
    const statusTagOf = (s) => s === 'approved' ? el('span', { class: 'tag tag--accent' }, 'معتمد ✓')
      : s === 'rejected' ? el('span', { class: 'tag tag--danger' }, 'مرفوض')
        : el('span', { class: 'tag tag--warning' }, 'بانتظار الاعتماد');
    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'سجل النقاط'),
        dataTable(['التاريخ', 'السبب', 'النقاط'],
          data.log.map((p) => [p.date, p.reason,
            el('b', { class: 'num', style: p.points > 0 ? 'color:var(--accent-hover)' : 'color:var(--status-danger)' },
              (p.points > 0 ? '+' : '') + p.points)]),
          'لا حركات نقاط بعد — احضر حصصك واكسب أول نقاطك!')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'طلبات الاستبدال والإحالات'),
        dataTable(['التاريخ', 'المكافأة', 'النقاط', 'الحالة'],
          data.redemptions.map((r) => [r.date, r.rewardName, String(r.points), statusTagOf(r.status)]),
          'لا طلبات استبدال بعد.'),
        el('h3', { class: 'card__title', style: 'margin-top:14px' }, 'إحالاتي'),
        dataTable(['التاريخ', 'الصديق', 'الحالة'],
          data.referrals.map((r) => [r.date, r.traineeName || '—', statusTagOf(r.status)]),
          'لا إحالات بعد — شارك كودك مع أصدقائك.'))));
  }

  await render();
}

/* ============================================================
   الولاء والإحالات — لوحة الإدارة/المحاسب
   ============================================================ */
async function viewLoyalty(root) {
  const isAdmin = API.user.role === 'admin';
  const container = el('div', { class: 'content' });
  root.append(container);

  async function render() {
    container.innerHTML = '';
    container.append(spinnerCard());
    const data = await API.get('/api/loyalty/summary');
    container.innerHTML = '';

    const t = data.totals;
    container.append(el('div', { class: 'kpis' },
      kpiTile(t.pointsIssued, 'نقاط ممنوحة', 'star'),
      kpiTile(t.pointsRedeemed, 'نقاط مستبدلة', 'gift', 'blue'),
      kpiTile(t.pendingRedemptions, 'طلبات استبدال معلقة', 'clock', (isAdmin && t.pendingRedemptions) ? 'warn' : undefined),
      kpiTile(t.approvedReferrals, 'إحالات معتمدة', 'users'),
      kpiTile(t.pendingReferrals, 'إحالات بانتظار الاعتماد', 'alert', (isAdmin && t.pendingReferrals) ? 'warn' : undefined)));

    /* إعداد قيم النقاط — تتحكم بها الإدارة.
       «نتيجة منشورة على السوشال ميديا» حلّت محل نقاط حضور الحصة:
       تُمنح يدويًا عند وصول المتدرب لنتيجة ونشرها. */
    const resultPts = input({ type: 'number', min: 0, value: data.pts.result, disabled: !isAdmin || null });
    const renewalPts = input({ type: 'number', min: 0, value: data.pts.renewal, disabled: !isAdmin || null });
    const referralPts = input({ type: 'number', min: 0, value: data.pts.referral, disabled: !isAdmin || null });
    const loyaltyPts = input({ type: 'number', min: 0, value: data.pts.loyalty, disabled: !isAdmin || null });
    const settingsCard = el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'قيم النقاط (تحكم الإدارة)'),
      el('div', { class: 'filters' },
        field('نتيجة منشورة على السوشال ميديا 📣', resultPts),
        field('تجديد الاشتراك', renewalPts),
        field('إحالة صديق', referralPts),
        field('نقطة الولاء 🏅', loyaltyPts),
        isAdmin ? el('button', {
          class: 'btn btn--accent',
          onclick: async () => {
            try {
              await API.put('/api/settings', {
                ptsResult: resultPts.value, ptsRenewal: renewalPts.value,
                ptsReferral: referralPts.value, ptsLoyalty: loyaltyPts.value,
              });
              toast('حُفظت قيم النقاط — وتسري على العمليات القادمة.');
            } catch (ex) { toast(ex.message, true); }
          },
        }, 'حفظ') : el('span')),
      el('div', { style: 'font-size:12px;color:var(--app-muted)' },
        'نقاط النتيجة تُمنح من زر «منح نقاط» عند تحقيق المتدرب نتيجة ونشرها على صفحات السوشال ميديا. '
        + 'ونقطة الولاء تُمنح تلقائيًا لمن جدّد اشتراكه في وقته المحدد، ودفع المبلغ دفعةً واحدة، وكان قد أنهى كل حصص اشتراكه السابق.'));
    container.append(settingsCard);

    const statusTagOf = (s) => s === 'approved' ? el('span', { class: 'tag tag--accent' }, 'معتمد ✓')
      : s === 'rejected' ? el('span', { class: 'tag tag--danger' }, 'مرفوض')
        : el('span', { class: 'tag tag--warning' }, 'معلق');
    const decide = (url, action, msg) => async () => {
      try { await API.put(url, { action }); toast(msg); render(); }
      catch (ex) { toast(ex.message, true); }
    };

    /* طلبات الاستبدال + الإحالات */
    container.append(el('div', { class: 'grid-2eq' },
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'طلبات استبدال المكافآت'),
        dataTable(['المتدرب', 'المكافأة', 'النقاط', 'التاريخ', 'الحالة', ''],
          data.redemptions.map((r) => [r.traineeName, r.rewardName, String(r.points), r.date, statusTagOf(r.status),
            r.status === 'pending'
              ? (isAdmin
                ? el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
                  el('button', { class: 'btn btn--accent btn--sm', onclick: decide('/api/redemptions/' + r.id, 'approve', 'اعتُمدت المكافأة وخُصمت النقاط.') }, 'اعتماد'),
                  el('button', { class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)', onclick: decide('/api/redemptions/' + r.id, 'reject', 'رُفض الطلب.') }, 'رفض'))
                : el('span', { style: 'font-size:12px;color:var(--app-muted)' }, 'بانتظار اعتماد الإدارة'))
              : '—'],
          ),
          'لا طلبات استبدال بعد.')),
      el('div', { class: 'card' },
        el('h3', { class: 'card__title' }, 'الإحالات — ادعُ صديقًا'),
        dataTable(['المُحيل', 'المشترك الجديد', 'الكود', 'التاريخ', 'الحالة', ''],
          data.referrals.map((r) => [r.referrerName, r.traineeName || '—',
            el('code', { style: 'direction:ltr;font-family:var(--font-mono);font-size:12px' }, r.code || '—'),
            r.date, statusTagOf(r.status),
            r.status === 'pending'
              ? (isAdmin
                ? el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
                  el('button', { class: 'btn btn--accent btn--sm', onclick: decide('/api/referrals/' + r.id, 'approve', `اعتُمدت الإحالة — ومُنح المُحيل ${data.pts.referral} نقطة.`) }, 'اعتماد'),
                  el('button', { class: 'btn btn--ghost btn--sm', style: 'color:var(--status-danger)', onclick: decide('/api/referrals/' + r.id, 'reject', 'رُفضت الإحالة.') }, 'رفض'))
                : el('span', { style: 'font-size:12px;color:var(--app-muted)' }, 'بانتظار اعتماد الإدارة'))
              : '—'],
          ),
          'لا إحالات بعد.'))));

    /* المكافآت */
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'المكافآت المتاحة',
        isAdmin ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => openRewardModal(render) }, '+ مكافأة') : el('span')),
      dataTable(['المكافأة', 'النقاط المطلوبة', 'الحالة', ''],
        data.rewards.map((r) => [r.name, String(r.cost),
          r.active !== false ? el('span', { class: 'tag tag--accent' }, 'متاحة') : el('span', { class: 'tag tag--neutral' }, 'موقوفة'),
          isAdmin ? el('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openRewardModal(render, r) }, 'تعديل'),
            el('button', {
              class: 'btn btn--outline btn--sm',
              onclick: async () => {
                try { await API.put('/api/rewards/' + r.id, { active: r.active === false }); render(); }
                catch (ex) { toast(ex.message, true); }
              },
            }, r.active !== false ? 'إيقاف' : 'تفعيل')) : '—']),
        'لا مكافآت — أضف أول مكافأة.')));

    /* أرصدة النقاط */
    container.append(el('div', { class: 'card' },
      el('h3', { class: 'card__title' }, 'أرصدة نقاط المتدربين',
        isAdmin ? el('button', { class: 'btn btn--accent btn--sm', onclick: () => openAwardModal(render) }, '+ منح نقاط (تحقيق هدف…)') : el('span')),
      pagedTable(['المتدرب', 'الرصيد الحالي', ''],
        data.balances,
        (b) => [el('a', { href: '#/trainee/' + b.traineeId, style: 'color:var(--action);text-decoration:none;font-weight:600' }, b.name),
          el('b', { class: 'num', style: 'color:var(--accent-hover)' }, String(b.balance)),
          isAdmin ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openAwardModal(render, b.traineeId) }, 'منح/خصم') : el('span')],
        { pageSize: 10, searchText: (b) => b.name || '', searchPlaceholder: 'ابحث باسم المتدرب…', emptyText: 'لا نقاط ممنوحة بعد.' })));
  }

  await render();
}

function openRewardModal(onDone, existing) {
  const nameIn = input({ value: existing ? existing.name : '', placeholder: 'مثال: بلوزة Sport Power' });
  const costIn = input({ type: 'number', min: 1, value: existing ? existing.cost : '' });
  const noteIn = input({ value: existing ? existing.note : '', placeholder: 'اختياري' });
  const close = modal(existing ? 'تعديل المكافأة' : 'مكافأة جديدة', [
    el('form', {
      style: 'display:flex;flex-direction:column;gap:14px',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          if (existing) await API.put('/api/rewards/' + existing.id, { name: nameIn.value, cost: costIn.value, note: noteIn.value });
          else await API.post('/api/rewards', { name: nameIn.value, cost: costIn.value, note: noteIn.value });
          toast('حُفظت المكافأة.'); close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      field('اسم المكافأة *', nameIn),
      field('النقاط المطلوبة *', costIn),
      field('ملاحظة', noteIn),
      el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'حفظ')),
  ]);
}

async function openAwardModal(onDone, preselectId) {
  const trainees = await API.get('/api/users?role=trainee');
  const traineeSel = searchSelect(trainees.map(traineeOption), { value: preselectId || '' });
  const pointsIn = input({ type: 'number', placeholder: 'موجب للمنح — سالب للتصحيح' });
  const reasonSel = select([
    ['نتيجة منشورة على السوشال ميديا 📣', 'نتيجة منشورة على السوشال ميديا 📣'],
    ['تحقيق هدف الوزن 🎯', 'تحقيق هدف الوزن 🎯'],
    ['تحقيق هدف القياسات 📏', 'تحقيق هدف القياسات 📏'],
    ['الالتزام الكامل بالحصص 💪', 'الالتزام الكامل بالحصص 💪'],
    ['مكافأة خاصة', 'مكافأة خاصة'],
    ['تصحيح رصيد', 'تصحيح رصيد'],
  ]);
  const close = modal('منح / خصم نقاط', [
    el('form', {
      class: 'form-grid',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!traineeSel.value) { toast('اختر المتدرب من القائمة.', true); return; }
        try {
          const res = await API.post('/api/loyalty/award', {
            traineeId: Number(traineeSel.value), points: pointsIn.value, reason: reasonSel.value,
          });
          toast(`تم — رصيد المتدرب الآن ${res.balance} نقطة.`);
          close(); onDone && onDone();
        } catch (ex) { toast(ex.message, true); }
      },
    },
      el('div', { class: 'span-2' }, field('المتدرب', traineeSel)),
      field('النقاط', pointsIn),
      field('السبب', reasonSel),
      el('div', { class: 'span-2' }, el('button', { class: 'btn btn--accent btn--full', type: 'submit' }, 'تنفيذ'))),
  ]);
}

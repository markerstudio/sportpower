#!/usr/bin/env node
/* ============================================================
   إعداد الموقع العام على Vercel بأمر واحد — يُشغَّل من جهازك:

     VERCEL_TOKEN="…" node scripts/vercel-site-setup.js [--app <اسم مشروع النظام>]
                                                        [--site sportpower-site]
                                                        [--branch <فرع للنشر التجريبي>]
                                                        [--production]
                                                        [--dry-run]

   ما يفعله (آمن لإعادة التشغيل — يعيد استعمال ما أُنشئ سابقًا):
   1. يجد مشروع النظام (المرتبط بمستودع markerstudio/sportpower بلا Root Directory).
   2. ينشئ مشروع الموقع من المستودع نفسه بـ Root Directory = site (أو يعيد استعماله).
   3. يضبط متغيرات الموقع: SITE_API_BASE وSITE_URL (وSITE_APP_URL).
   4. يضيف SITE_ORIGINS إلى مشروع النظام حتى يقبل طلبات الموقع (CORS).
   5. يضيف النطاقات: www.sport-power.net وsport-power.net للموقع، وapp.sport-power.net للنظام،
      ويطبع سجلات DNS المطلوبة في لوحة Wix.
   6. يطلق نشرًا تجريبيًا للموقع والنظام من الفرع المطلوب ويطبع الروابط
      (--production ينشر الموقع إنتاجًا من الفرع — النظام لا يُنشر إنتاجًا إلا من فرعه الرئيسي).
   يحتاج Node 18+ ورمز Vercel (Account Settings → Tokens). لا يطبع الرمز أبدًا.
   ============================================================ */
const API = 'https://api.vercel.com';
const TOKEN = process.env.VERCEL_TOKEN;
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; };
const has = (name) => args.includes(name);

const REPO = 'markerstudio/sportpower';
const SITE_NAME = opt('--site', 'sportpower-site');
const APP_NAME = opt('--app', null);
const BRANCH = opt('--branch', 'claude/public-website-courses-5ivmpw');
const SITE_URL = 'https://www.sport-power.net';
const DRY = has('--dry-run');
const DOMAINS = { siteWww: 'www.sport-power.net', siteApex: 'sport-power.net', app: 'app.sport-power.net' };

const bad = (m) => { console.error('\n✗ ' + m + '\n'); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);
if (!TOKEN) bad('اضبط VERCEL_TOKEN (Vercel → Account Settings → Tokens).');

let TEAM = null; // { id, slug } أو null للحساب الشخصي
const scope = () => (TEAM ? (`teamId=${TEAM.id}`) : '');
async function api(method, path, body) {
  const url = API + path + (scope() ? (path.includes('?') ? '&' : '?') + scope() : '');
  if (DRY && method !== 'GET') { console.log(`  [dry-run] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 200) : ''); return {}; }
  const r = await fetch(url, {
    method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${method} ${path} → ${r.status} ${j.error ? j.error.code + ': ' + j.error.message : ''}`); e.status = r.status; e.code = j.error && j.error.code; throw e; }
  return j;
}

/* المشاريع في كل النطاقات (الحساب الشخصي + الفرق) — لنجد أين يعيش النظام */
async function findProjects() {
  const scopes = [null];
  try { scopes.push(...((await api('GET', '/v2/teams')).teams || [])); } catch (e) { /* رمز بلا فرق */ }
  const found = [];
  for (const s of scopes) {
    TEAM = s;
    try {
      const { projects } = await api('GET', '/v9/projects?limit=100');
      for (const p of projects) found.push({ scope: s, project: p });
    } catch (e) { /* نطاق بلا صلاحية */ }
  }
  TEAM = null;
  return found;
}
const linkedToRepo = (p) => p.link && p.link.type === 'github' && `${p.link.org}/${p.link.repo}`.toLowerCase() === REPO.toLowerCase();

async function upsertEnv(projectId, key, value, targets) {
  await api('POST', `/v10/projects/${projectId}/env?upsert=true`, { key, value, type: 'plain', target: targets });
  ok(`${key} = ${value}  (${targets.join(', ')})`);
}

async function addDomain(project, name, redirect) {
  try {
    await api('POST', `/v10/projects/${project.id}/domains`, redirect ? { name, redirect, redirectStatusCode: 308 } : { name });
    ok(`نطاق ${name} أُضيف إلى ${project.name}`);
  } catch (e) {
    if (e.code === 'domain_already_in_use' || e.status === 409) ok(`نطاق ${name} موجود مسبقًا على ${project.name}`);
    else console.warn(`⚠ تعذّرت إضافة ${name}: ${e.message}`);
  }
}

async function deploy(project, target) {
  if (!project.link || !project.link.repoId) { console.warn(`⚠ ${project.name} غير مرتبط بـGitHub — انشره من لوحة Vercel.`); return null; }
  const d = await api('POST', '/v13/deployments?forceNew=1', {
    name: project.name, project: project.id, target,
    gitSource: { type: 'github', repoId: project.link.repoId, ref: BRANCH },
  });
  ok(`نشر ${target} لـ${project.name} من ${BRANCH}: https://${d.url}`);
  return d;
}

(async () => {
  const me = await api('GET', '/v2/user');
  ok(`الرمز صالح — الحساب: ${me.user.username || me.user.email}`);

  const all = await findProjects();
  const repoProjects = all.filter(({ project }) => linkedToRepo(project));
  let appEntry = APP_NAME
    ? all.find(({ project }) => project.name === APP_NAME)
    : repoProjects.find(({ project }) => !project.rootDirectory);
  if (!appEntry) {
    console.log('المشاريع المرئية:', all.map(({ scope: s, project }) => `${s ? s.slug + '/' : ''}${project.name}${project.rootDirectory ? ' (root: ' + project.rootDirectory + ')' : ''}`).join(', ') || 'لا شيء');
    bad('لم أجد مشروع النظام المرتبط بالمستودع. مرّر --app <اسم المشروع>.');
  }
  TEAM = appEntry.scope;
  const app = await api('GET', `/v9/projects/${appEntry.project.id}`);
  ok(`مشروع النظام: ${app.name}${TEAM ? ' (فريق ' + TEAM.slug + ')' : ''} — الفرع الإنتاجي: ${app.link && app.link.productionBranch}`);

  const appDomains = (await api('GET', `/v9/projects/${app.id}/domains`)).domains || [];
  const appHost = appDomains.find((d) => d.name === DOMAINS.app) ? DOMAINS.app
    : (appDomains.find((d) => !d.name.endsWith('.vercel.app') && d.verified) || appDomains[0] || {}).name || `${app.name}.vercel.app`;
  const appUrl = 'https://' + appHost;

  /* --- مشروع الموقع --- */
  let site = repoProjects.map((x) => x.project).find((p) => p.rootDirectory === 'site')
    || all.map((x) => x.project).find((p) => p.name === SITE_NAME);
  if (site) {
    site = await api('GET', `/v9/projects/${site.id}`);
    ok(`مشروع الموقع موجود: ${site.name}`);
  } else {
    site = await api('POST', '/v11/projects', {
      name: SITE_NAME, framework: null, rootDirectory: 'site',
      gitRepository: { type: 'github', repo: REPO },
    });
    ok(`أُنشئ مشروع الموقع: ${site.name} (Root Directory: site)`);
  }
  if (!DRY && (!site.link || !site.link.repoId)) {
    try { site = await api('POST', `/v9/projects/${site.id}/link`, { type: 'github', repo: REPO }); ok('رُبط المستودع بمشروع الموقع'); }
    catch (e) { console.warn('⚠ اربط المستودع يدويًا من Settings → Git: ' + e.message); }
  }

  /* --- المتغيرات --- */
  console.log('\nمتغيرات مشروع الموقع:');
  await upsertEnv(site.id, 'SITE_API_BASE', appUrl, ['production']);
  await upsertEnv(site.id, 'SITE_APP_URL', appUrl, ['production', 'preview']);
  await upsertEnv(site.id, 'SITE_URL', SITE_URL, ['production', 'preview']);
  console.log('\nمتغيرات مشروع النظام:');
  await upsertEnv(app.id, 'SITE_ORIGINS', `${SITE_URL},https://${DOMAINS.siteApex},https://*.vercel.app`, ['production', 'preview']);

  /* --- النطاقات --- */
  console.log('\nالنطاقات:');
  await addDomain(site, DOMAINS.siteWww);
  await addDomain(site, DOMAINS.siteApex, DOMAINS.siteWww);
  await addDomain(app, DOMAINS.app);

  /* --- النشر --- */
  console.log('\nالنشر:');
  /* معاينة النظام أولًا من الفرع (فيها المسارات الجديدة)، ثم توجَّه معاينة
     الموقع إليها — فتعمل المعاينة كاملة قبل دمج الفرع في الإنتاج. */
  const appDeploy = await deploy(app, 'preview');
  await upsertEnv(site.id, 'SITE_API_BASE', appDeploy ? 'https://' + appDeploy.url : appUrl, ['preview']);
  const siteDeploy = await deploy(site, has('--production') ? 'production' : 'preview');

  console.log(`
============================================================
سجلات DNS المطلوبة في Wix (Domains → Advanced → DNS):
  A      @      76.76.21.21
  CNAME  www    cname.vercel-dns.com
  CNAME  app    cname.vercel-dns.com
(Vercel يعرض القيم الدقيقة في Settings → Domains إن اختلفت.)
احذف سجلات Wix القديمة للجذر وwww بعد إضافة هذه.

بعد الانتشار تحقق من:
  ${siteDeploy ? 'https://' + siteDeploy.url : '(انشر الموقع من لوحة Vercel)'}          ← الموقع (${has('--production') ? 'إنتاج' : 'معاينة'} من ${BRANCH})
  ${appDeploy ? 'https://' + appDeploy.url + '/api/public/site' : '(انشر النظام من لوحة Vercel)'}   ← واجهة النظام العامة (معاينة)

ملاحظة: نشر الموقع الإنتاجي يقرأ من ${appUrl} — أي من نسخة النظام الإنتاجية،
فلا تظهر الدورات والباقات على الموقع إلا بعد دمج الفرع في فرع النظام
الإنتاجي (${app.link && app.link.productionBranch}) ونشره.
============================================================`);
})().catch((e) => bad(e.message));

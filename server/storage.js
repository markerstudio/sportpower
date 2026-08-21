/* ============================================================
   تخزين الصور الدائم — Supabase Storage (دلو خاص)
   على Vercel، /tmp لحظيّ فتزول الصور مع كل نشر. حين تُضبط متغيّرات
   Supabase تُرفع الصور إلى دلوٍ خاص وتبقى؛ وإلا يُستعمل القرص المحلي
   (للتطوير والعرض). الحماية (رابط موقّع/جلسة) تبقى على مسار /uploads
   كما هي — هذه الوحدة تبدّل «أين» تُخزَّن البايتات فقط.

   الإعداد في الإنتاج (Vercel → Environment Variables):
     SUPABASE_URL                = https://<project>.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   = مفتاح الخدمة (خادميّ فقط — لا يُكشف)
     SUPABASE_STORAGE_BUCKET     = اسم الدلو (افتراضي: member-uploads)
   الدلو يُنشأ تلقائيًا خاصًّا عند أول رفع إن لم يوجد.
   ============================================================ */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'member-uploads';

const configured = () => !!(SUPABASE_URL && SERVICE_KEY);

const CT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const contentTypeOf = (name) => CT[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

const headers = (extra = {}) => ({
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  ...extra,
});

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  // إنشاء الدلو خاصًّا إن لم يوجد — نتجاهل خطأ «موجود مسبقًا»
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).catch(() => null);
  // 200 أنشئ، 400/409 موجود — كلاهما مقبول
  bucketReady = true;
  return res;
}

async function put(name, buffer, contentType) {
  await ensureBucket();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType || contentTypeOf(name), 'x-upsert': 'true' }),
    body: buffer,
  });
  if (!res.ok) throw new Error(`رفع الصورة إلى التخزين فشل (${res.status})`);
  return name;
}

async function get(name) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    headers: headers(),
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, contentType: res.headers.get('content-type') || contentTypeOf(name) };
}

async function del(name) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, {
    method: 'DELETE', headers: headers(),
  }).catch(() => {});
}

module.exports = { configured, put, get, del, contentTypeOf, BUCKET };

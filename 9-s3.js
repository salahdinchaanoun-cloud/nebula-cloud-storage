const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { pipeline } = require('stream/promises');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ===== تشفير أسرار الخدمات المضافة من لوحة الإدارة (AES-256-GCM) =====
const ENC_KEY = crypto.createHash('sha256')
  .update(String(process.env.STORAGE_KEY || process.env.SESSION_SECRET || 'nebula-default-storage-key'))
  .digest();
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
function decryptSecret(blob) {
  const [iv, tag, data] = String(blob).split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

// كل خدمة لها دور: 'storage' للتخزين الأساسي، أو 'backup' للنسخ الاحتياطي
// الترتيب مهم: التخزين يبدأ بالأولى ثم ينتقل للتالية عند امتلائها
function loadBackends() {
  const list = [{
    id: 'primary', name: 'الأساسية', role: 'storage', endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.AWS_REGION || 'us-east-1', bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    capacityGb: Number(process.env.S3_CAPACITY_GB) || 10,
  }];
  for (const key of Object.keys(process.env)) {
    const m = key.match(/^S3_(\d+)_BUCKET$/);
    if (!m) continue;
    const pre = `S3_${m[1]}_`;
    list.push({
      id: `extra${m[1]}`, name: `الخدمة ${m[1]}`, role: 'storage', endpoint: process.env[pre + 'ENDPOINT'] || '',
      region: process.env[pre + 'REGION'] || 'us-east-1', bucket: process.env[key],
      accessKeyId: process.env[pre + 'ACCESS_KEY_ID'], secretAccessKey: process.env[pre + 'SECRET_ACCESS_KEY'],
      capacityGb: Number(process.env[pre + 'CAPACITY_GB']) || 10,
    });
  }
  try {
    const file = path.join(__dirname, 'storages.json');
    if (fs.existsSync(file)) {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const b of (j.backends || [])) {
        if (!b || !b.id || !b.bucket || b.enabled === false) continue;
        list.push({
          id: String(b.id), name: b.name || String(b.id), role: b.role === 'backup' ? 'backup' : 'storage',
          endpoint: b.endpoint || '', region: b.region || 'us-east-1', bucket: b.bucket,
          accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey,
          capacityGb: Number(b.capacityGb) || 10,
        });
      }
    }
  } catch (e) { console.error('storages.json غير صالح:', e.message); }
  return list.filter(b => b.bucket && b.accessKeyId && b.secretAccessKey);
}

let BACKENDS = loadBackends();
const clients = {};

// الخدمات المضافة من لوحة الإدارة (من قاعدة البيانات) تُعرَّف بمعرّف db<id>
function applyDbBackends(rows) {
  const dbList = rows.map(r => ({
    id: `db${r.id}`, name: r.name, role: r.role === 'backup' ? 'backup' : 'storage',
    endpoint: r.endpoint, region: r.region || 'us-east-1', bucket: r.bucket,
    accessKeyId: r.accessKeyId, secretAccessKey: r.secretAccessKey, capacityGb: Number(r.capacityGb) || 10,
  }));
  BACKENDS = [...loadBackends(), ...dbList];
  for (const k of Object.keys(clients)) delete clients[k];
}

function makeClient(b) {
  return new S3Client({
    region: b.region,
    endpoint: b.endpoint || undefined,
    forcePathStyle: !!b.endpoint,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey },
  });
}

// اختبار الاتصال قبل حفظ خدمة جديدة: يرمي خطأ إن كانت البيانات أو الصلاحيات غير صحيحة
async function testBackend(b) {
  await makeClient(b).send(new ListObjectsV2Command({ Bucket: b.bucket, MaxKeys: 1 }));
}

function clientFor(id) {
  const b = BACKENDS.find(x => x.id === id);
  if (!b) throw new Error('خدمة التخزين غير متاحة: ' + id);
  if (!clients[b.id]) clients[b.id] = makeClient(b);
  return { client: clients[b.id], bucket: b.bucket };
}

// خدمات التخزين الأساسية بترتيبها (بدون النسخ الاحتياطي) مع سعة كل منها بالبايت
function listBackends() {
  return BACKENDS.filter(b => b.role === 'storage')
    .map(b => ({ id: b.id, name: b.name, capacityBytes: b.capacityGb * 1024 * 1024 * 1024 }));
}

// خدمات النسخ الاحتياطي
function listBackupBackends() { return []; // النسخ الاحتياطي معطّل: كل الحاويات أساسية
  return BACKENDS.filter(b => b.role === 'backup').map(b => ({ id: b.id, name: b.name }));
}

// رفع بجسم معروف الحجم (Buffer) لتفادي البث الذي ترفضه Backblaze
async function uploadFile(localPath, key, contentType, backendId = 'primary', metadata = {}) {
  const { client, bucket } = clientFor(backendId);
  const body = fs.readFileSync(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.length, ContentType: contentType, Metadata: metadata }));
}

function signedUrl(key, { filename, contentType, inline = false, expiresIn = 300 } = {}, backendId = 'primary') {
  const { client, bucket } = clientFor(backendId);
  const disposition = filename
    ? `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`
    : undefined;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition, ResponseContentType: contentType }),
    { expiresIn }
  );
}

async function deleteFile(key, backendId = 'primary') {
  const { client, bucket } = clientFor(backendId);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// هل الملف موجود فعلاً في هذه الخدمة؟ أي خطأ يُعامَل كغير موجود (الخدمة متوقفة أو الملف محذوف)
async function objectExists(backendId, key) {
  try {
    const { client, bucket } = clientFor(backendId);
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) { return false; }
}

// تنزيل ملف من أي خدمة إلى مسار محلي مؤقت (يُستخدم لمزامنة النسخ الاحتياطي)
async function downloadToFile(backendId, key, destPath) {
  const { client, bucket } = clientFor(backendId);
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(r.Body, fs.createWriteStream(destPath));
}

// مفتاح الملف في النسخ الاحتياطي: مجلد لكل مالك حتى يبقى كل ملف مرتبطاً بصاحبه
function backupKey(ownerId, storedName) {
  return `u${ownerId}/${storedName}`;
}

// يحاول الخدمة الأساسية أولاً، ثم نسخ الاحتياط بالترتيب، ويعيد أول موقع متاح للملف
async function locateFile(storedName, ownerId, primaryBackendId) {
  if (await objectExists(primaryBackendId, storedName)) return { backendId: primaryBackendId, key: storedName };
  for (const b of listBackupBackends()) {
    const key = backupKey(ownerId, storedName);
    if (await objectExists(b.id, key)) return { backendId: b.id, key };
  }
  return { backendId: primaryBackendId, key: storedName };
}

// نسخ ملف إلى كل خدمات النسخ الاحتياطي؛ الفشل في خدمة لا يوقف البقية
async function replicateToBackups(localPath, key, contentType, metadata = {}) { return []; // معطّل
  const results = [];
  const targets = listBackupBackends();
  if (!targets.length) console.warn('[BACKUP] لا توجد حاوية احتياطية مفعّلة، لم يُنسخ الملف:', key);
  for (const b of targets) {
    try {
      await uploadFile(localPath, key, contentType, b.id, metadata);
      results.push({ id: b.id, ok: true });
    } catch (e) {
      console.error('فشل النسخ الاحتياطي إلى', b.id, e.name || e.message);
      results.push({ id: b.id, ok: false });
    }
  }
  return results;
}

// حذف نسخ الملف من خدمات النسخ الاحتياطي عند حذفه من المنصة
async function deleteFromBackups(ownerId, storedName) {
  for (const b of listBackupBackends()) {
    try { await deleteFile(backupKey(ownerId, storedName), b.id); }
    catch (e) { console.error('فشل حذف نسخة احتياطية من', b.id, e.name || e.message); }
  }
}

// معلومات الحاويات للوحة الإدارة (بدون الأسرار)
function containerInfo() {
  return BACKENDS.map(b => ({
    id: b.id, name: b.name, role: b.role, endpoint: b.endpoint || '', region: b.region || '',
    bucket: b.bucket || '', accessKeyId: b.accessKeyId || '', capacityGb: b.capacityGb,
    source: String(b.id).startsWith('db') ? 'db' : 'env',
  }));
}

// السر لا يُعرض إلا عند طلب صريح من مدير المنصة
function revealSecret(id) {
  const b = BACKENDS.find(x => String(x.id) === String(id));
  return b ? (b.secretAccessKey || '') : '';
}

// عدّ الملفات الفعلي داخل حاوية (يشمل النسخ الاحتياطية) عبر تصفح الصفحات
async function countObjects(backendId, maxPages = 500) {
  const { client, bucket } = clientFor(backendId);
  let count = 0, token, pages = 0;
  do {
    const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    count += (out.Contents || []).length;
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
    pages++;
  } while (token && pages < maxPages);
  return { count, truncated: !!token };
}

// قائمة الملفات الفعلية داخل حاوية (بحد أقصى)
async function listObjects(backendId, max = 500) {
  const { client, bucket } = clientFor(backendId);
  const out = [];
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({
      Bucket: bucket, ContinuationToken: token, MaxKeys: Math.max(1, Math.min(1000, max - out.length)),
    }));
    for (const o of r.Contents || []) {
      out.push({ key: o.Key, size: o.Size || 0, date: o.LastModified ? o.LastModified.toISOString().slice(0, 16).replace('T', ' ') : '' });
    }
    token = r.IsTruncated && out.length < max ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

module.exports = {
  uploadFile, signedUrl, deleteFile, listBackends, listBackupBackends, applyDbBackends, testBackend,
  encryptSecret, decryptSecret, containerInfo, revealSecret, countObjects, listObjects, objectExists, locateFile, replicateToBackups, deleteFromBackups, backupKey, downloadToFile,
};

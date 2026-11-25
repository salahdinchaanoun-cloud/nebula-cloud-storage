// مثال: رفع ملف إلى منصة Nebula عبر واجهة API ثم طباعة رابط التحميل
// المنصة: https://nebula.spcfy.eu
//
// الاستخدام (Node.js 18 أو أحدث):
//   NEBULA_API_KEY=nbk_live_xxxxxxxx node nebula-upload-example.js ./photo.jpg

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = (process.env.NEBULA_BASE_URL || 'https://nebula.spcfy.eu').replace(/\/+$/, '');
const API_KEY = process.env.NEBULA_API_KEY;

async function api(route, { method = 'GET', body } = {}) {
  if (!API_KEY) throw new Error('ضع NEBULA_API_KEY في متغيرات البيئة');

  const res = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}` },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`${data.error?.code || res.status}: ${data.error?.message || 'خطأ غير معروف'}`);
  }
  return data;
}

async function main() {
  const [filePath] = process.argv.slice(2);
  if (!filePath) {
    console.log('الاستخدام: node nebula-upload-example.js <مسار الملف>');
    process.exit(1);
  }

  // 1) تحقق من المفتاح والمساحة المتبقية
  const me = await api('/api/v1/me');
  console.log(`متصل بحساب: ${me.email}`);
  console.log(`المساحة المتبقية: ${me.remaining_bytes} بايت`);

  // 2) ارفع الملف
  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(filePath));
  const file = await api('/api/v1/files', { method: 'POST', body: form });

  console.log(`تم الرفع: ${file.name} (${file.size} بايت)`);
  console.log(`رابط التحميل: ${file.download_url}`);
}

main().catch(e => {
  console.error('فشل:', e.message);
  process.exit(1);
});

// تشخيص محدد لمشكلة اتصال نيبولا: المنصة، الدومين، الشبكة، المفتاح، والبوت
// الاستخدام: node scripts/diagnose.js            (فحص سريع)
//            node scripts/diagnose.js --upload   (وأضف اختبار رفع ملف تجريبي)
// لا يطبع أي مفتاح أو كلمة مرور، ويكتب التقرير في diagnose-report.txt

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };

// قراءة .env دون مكتبات إضافية
function loadEnv() {
  const env = { ...process.env };
  for (const name of ['.env', 'bot.env']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const PUBLIC_URL = (env.PUBLIC_URL || '').replace(/\/+$/, '');
const BASE_URL = (env.NEBULA_BASE_URL || '').replace(/\/+$/, '');
const KEY = env.NEBULA_API_KEY || '';
const PORT = env.PORT || '25080';
const problems = [];
const fixes = [];

const check = (ok, label, detail = '') => out(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
const problem = (title, fix) => { problems.push(title); fixes.push(fix); };

async function getJson(url, opts = {}, ms = 10000) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data, text };
  } catch (e) {
    return { ok: false, status: 0, error: e.cause?.code || e.name || e.message };
  }
}

function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }

async function main() {
  out('========== تقرير تشخيص نيبولا ==========');
  out(`التاريخ: ${new Date().toISOString()}`);
  out(`الجهاز: ${os.hostname()} (${os.platform()})`);
  out('');

  // 1) الإعدادات
  out('--- 1) الإعدادات ---');
  check(!!PUBLIC_URL, 'PUBLIC_URL مضبوط', PUBLIC_URL || 'غير موجود');
  check(!!BASE_URL, 'NEBULA_BASE_URL مضبوط (للبوت)', BASE_URL || 'غير موجود');
  check(!!KEY, 'NEBULA_API_KEY مضبوط', KEY ? `يبدأ بـ ${KEY.slice(0, 8)}…` : 'غير موجود');
  if (BASE_URL.endsWith('/api/v1')) problem('NEBULA_BASE_URL يحتوي /api/v1 في آخره', 'احذف /api/v1 من NEBULA_BASE_URL، ليصبح العنوان بدونه.');
  if (PUBLIC_URL && BASE_URL && PUBLIC_URL !== BASE_URL) out(`ℹ️ العنوانان مختلفان: PUBLIC_URL=${PUBLIC_URL} وNEBULA_BASE_URL=${BASE_URL}`);
  out('');

  // 2) المنصة محلياً
  out('--- 2) المنصة على الجهاز نفسه ---');
  const local = await getJson(`http://127.0.0.1:${PORT}/health`);
  check(local.ok, `المنصة تستجيب محلياً على المنفذ ${PORT}`, local.ok ? '' : `خطأ: ${local.error || local.status}`);
  if (!local.ok) problem(
    'المنصة لا تعمل على هذا الجهاز (المنفذ ' + PORT + ' مغلق)',
    'شغّل المنصة: npm start، أو تحقق من سجل الخادم لمعرفة سبب توقفها (مثل خطأ في متغيرات البيئة).'
  );
  out('');

  // 3) الدومين وDNS
  out('--- 3) الدومين وDNS ---');
  const host = hostOf(PUBLIC_URL);
  let dnsIps = [];
  if (host) {
    try { dnsIps = (await dns.lookup(host, { all: true })).map(r => r.address); } catch (e) { dnsIps = []; }
    check(dnsIps.length > 0, `DNS لـ ${host}`, dnsIps.length ? dnsIps.join(', ') : 'لا يتحول إلى عنوان');
    if (!dnsIps.length) problem(
      `الدومين ${host} لا يتحول إلى أي عنوان IP`,
      'اطلب من دعم spaceify ربط الدومين بالسيرفر، أو استخدم عنوان السيرفر المباشر في PUBLIC_URL.'
    );
  }
  const pub = await getJson('https://api.ipify.org?format=json');
  const myIp = pub.ok && pub.data ? pub.data.ip : '';
  check(!!myIp, 'العنوان العام لهذا الجهاز', myIp || 'تعذر الحصول عليه');
  out('');

  // 4) الوصول من الخارج (كما يراه المستخدم والبوت)
  out('--- 4) الوصول من الإنترنت ---');
  const publicHealth = PUBLIC_URL ? await getJson(`${PUBLIC_URL}/health`) : null;
  if (publicHealth) {
    check(publicHealth.ok, `${PUBLIC_URL}/health`, publicHealth.ok ? 'يعمل' : `فشل: ${publicHealth.error || 'HTTP ' + publicHealth.status}`);
    if (!publicHealth.ok) {
      const code = publicHealth.error || '';
      if (code === 'ECONNREFUSED') problem(
        'الاتصال مرفوض على العنوان العام (ECONNREFUSED)',
        'لا يوجد برنامج يستقبل الطلب على هذا العنوان والمنفذ. تأكد أن المنصة تعمل، وأن الدومين مربوط بالسيرفر، وأن المنفذ مفتوح في جدار الحماية.'
      );
      else if (code === 'ENOTFOUND') problem(
        'الدومين غير موجود (ENOTFOUND)',
        'الدومين لا يشير إلى أي خادم. أعد ربطه أو استخدم العنوان المباشر.'
      );
      else if (code.includes('TIMEOUT') || code === 'ETIMEDOUT' || code === 'AbortError' || publicHealth.error === 'TimeoutError') problem(
        'انتهت مهلة الاتصال بالعنوان العام',
        'جدار الحماية أو مزوّد الاستضافة يحجب المنفذ. افتح المنفذ في إعدادات السيرفر.'
      );
      else problem(`فشل الوصول إلى ${PUBLIC_URL} (${code || 'HTTP ' + publicHealth.status})`, 'راجع السجل أعلاه، وتأكد من تطابق PUBLIC_URL مع العنوان الفعلي للخدمة.');
    }
  }
  if (PUBLIC_URL.startsWith('https://') && publicHealth && !publicHealth.ok) {
    problem('HTTPS غير مفعّل على الدومين', 'جرّب العنوان بـ http://، أو فعّل شهادة SSL من لوحة الاستضافة بعد ربط الدومين.');
  }
  out('');

  // 5) مفتاح API والبوت
  out('--- 5) مفتاح API والبوت ---');
  if (!KEY || !BASE_URL) {
    check(false, 'اختبار المفتاح', 'يحتاج NEBULA_API_KEY وNEBULA_BASE_URL');
  } else {
    const me = await getJson(`${BASE_URL}/api/v1/me`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (me.ok && me.data) {
      check(true, 'المفتاح صحيح', `الحساب: ${me.data.email}، المتبقي: ${me.data.remaining_bytes} بايت`);
    } else if (me.status === 401) {
      check(false, 'المفتاح مرفوض (401)');
      problem('المفتاح غير صحيح أو ملغى', 'أنشئ مفتاحاً جديداً من صفحة API في نيبولا، وضعه في NEBULA_API_KEY.');
    } else if (me.status === 0) {
      check(false, 'البوت لا يصل إلى نيبولا', me.error || '');
      problem(
        'البوت لا يصل إلى عنوان نيبولا (NEBULA_BASE_URL)',
        'تأكد أن NEBULA_BASE_URL يطابق العنوان الذي يعمل فعلاً (انظر القسم 4)، وبدون /api/v1 في آخره.'
      );
    } else if (me.status === 502 || me.status === 503) {
      check(false, `نيبولا ترد بـ ${me.status}`);
      problem(`الخادم يرد ${me.status} (بوابة أو خدمة متوقفة)`, 'المنصة متوقفة خلف الوسيط أو الخادم. أعد تشغيلها وتأكد من الوسيط.');
    } else {
      check(false, `استجابة غير متوقعة (${me.status})`);
    }

    if (me.ok && process.argv.includes('--upload')) {
      const form = new FormData();
      form.append('file', new Blob([`nebula diagnose ${Date.now()}`], { type: 'text/plain' }), 'diagnose-test.txt');
      const up = await getJson(`${BASE_URL}/api/v1/files`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form }, 30000);
      check(up.ok, 'اختبار رفع ملف تجريبي', up.ok ? `تم: ${up.data?.download_url || ''}` : `فشل: ${up.data?.error?.message || up.status}`);
      if (up.ok && up.data?.id) {
        await getJson(`${BASE_URL}/api/v1/files/${up.data.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}` } });
        out('   (تم حذف الملف التجريبي)');
      }
    }
  }
  out('');

  // الخلاصة
  out('========== الخلاصة ==========');
  if (!problems.length) {
    out('✅ لم يُكتشف أي مشكلة. إن استمر الخلل في البوت فراجع سجل البوت عند الرفع.');
  } else {
    problems.forEach((p, i) => { out(`❌ المشكلة ${i + 1}: ${p}`); out(`   الحل: ${fixes[i]}`); });
  }
  out('=================================');

  try {
    fs.writeFileSync(path.join(ROOT, 'diagnose-report.txt'), lines.join('\n') + '\n', 'utf8');
    out(`\nتم حفظ التقرير في: diagnose-report.txt`);
  } catch (e) {
    // نظام الملفات للقراءة فقط: التقرير يظهر في الكونسول فقط
    out(`\nتعذر حفظ التقرير في الملف (${e.code || e.message})، والنص أعلاه هو التقرير كاملاً.`);
  }
}

main().catch(e => { console.error('فشل التشخيص:', e.message); process.exit(1); });

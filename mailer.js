const nodemailer = require('nodemailer');

// إعدادات SMTP من متغيرات البيئة
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const transporter = SMTP_HOST ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
}) : null;

const FROM = process.env.MAIL_FROM || 'Nebula <no-reply@example.com>';

function mailConfigured() { return !!transporter; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('MAIL_NOT_CONFIGURED');
    console.log(`\n[mail:dev] إلى: ${to}\n[mail:dev] الموضوع: ${subject}\n${text}\n`);
    return;
  }
  await transporter.sendMail({
    from: FROM, to, subject, text, html,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
  });
}

// قالب موحّد بألوان Nebula: خلفية داكنة مع تدرج بنفسجي وسماوي
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:0;background:#080b18;font-family:Arial,Tahoma,sans-serif">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080b18;padding:28px 12px"><tr><td align="center">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#11162b;border:1px solid #2a3260;border-radius:18px;overflow:hidden">`
    + `<tr><td style="background:linear-gradient(120deg,#8d71ff,#6a54e8 60%,#4eafe1);padding:22px 26px;color:#ffffff">`
    + `<div style="font-size:12px;letter-spacing:3px;opacity:.85">NEBULA CLOUD</div>`
    + `<div style="font-size:20px;font-weight:bold;margin-top:6px">${escapeHtml(title)}</div></td></tr>`
    + `<tr><td style="padding:26px;color:#d5d9ee;font-size:15px;line-height:1.9;text-align:right">${bodyHtml}</td></tr>`
    + `<tr><td style="padding:14px 26px;border-top:1px solid #2a3260;color:#7f88ad;font-size:12px;text-align:right">لا تشارك هذه الرسالة مع أي شخص. إذا لم تطلب هذا الإجراء فتجاهلها.</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// رسالة رمز التأكيد: نص عادي + HTML، بدون روابط أو كلمات ترويجية (تقلل احتمال وصولها إلى الرسائل غير المرغوبة)
function otpMail(to, name, code) {
  const subject = 'رمز تأكيد حسابك';
  const text = `مرحباً ${name}،\n\nرمز التأكيد الخاص بك: ${code}\n\nالرمز صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.\nإذا لم تطلب إنشاء حساب فتجاهل هذه الرسالة.`;
  const html = layout('رمز تأكيد الحساب',
    `<p style="margin:0 0 10px">مرحباً <b style="color:#c4b5ff">${escapeHtml(name)}</b>،</p>`
    + `<p style="margin:0 0 14px">رمز التأكيد الخاص بك:</p>`
    + `<div style="text-align:center;margin:18px 0"><span style="display:inline-block;padding:14px 26px;border-radius:14px;background:#1d2350;border:1px solid #65e5f3;color:#65e5f3;font-size:30px;font-weight:bold;letter-spacing:8px">${escapeHtml(code)}</span></div>`
    + `<p style="margin:14px 0 0;color:#9da5c4;font-size:13px">الرمز صالح لمدة <b style="color:#f38bd9">10 دقائق</b>.</p>`);
  return { to, subject, text }; // نص عادي فقط بدون HTML
}

function resetMail(to, name, link) {
  const subject = 'إعادة تعيين كلمة المرور';
  const text = `مرحباً ${name}،\n\nلإعادة تعيين كلمة المرور افتح الرابط التالي (صالح لمدة 30 دقيقة ويعمل مرة واحدة):\n\n${link}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة، وكلمة مرورك لن تتغير.`;
  const html = layout('إعادة تعيين كلمة المرور',
    `<p style="margin:0 0 10px">مرحباً <b style="color:#c4b5ff">${escapeHtml(name)}</b>،</p>`
    + `<p style="margin:0 0 18px">اضغط الزر التالي لتعيين كلمة مرور جديدة:</p>`
    + `<div style="text-align:center;margin:18px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 28px;border-radius:12px;background:linear-gradient(120deg,#8d71ff,#6a54e8);color:#ffffff;text-decoration:none;font-weight:bold">إعادة التعيين</a></div>`
    + `<p style="margin:14px 0 0;color:#9da5c4;font-size:13px">الرابط صالح لمدة <b style="color:#f38bd9">30 دقيقة</b> ويعمل مرة واحدة فقط.</p>`);
  return { to, subject, text }; // نص عادي فقط بدون HTML
}

module.exports = { sendMail, mailConfigured, otpMail, resetMail };

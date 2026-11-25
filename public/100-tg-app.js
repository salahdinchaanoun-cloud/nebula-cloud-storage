(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const initData = tg ? tg.initData : '';
  const mode = new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login';
  const login = document.getElementById('tg-login');
  const register = document.getElementById('tg-register');
  const otp = document.getElementById('tg-otp');
  const msg = document.getElementById('tg-msg');
  const title = document.getElementById('tg-title');
  let pending = '';
  let flow = mode;
  const show = t => { msg.textContent = t; };
  const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

  if (mode === 'register') {
    title.textContent = 'إنشاء حساب في Nebula';
    login.hidden = true;
    register.hidden = false;
  }

  login.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(login);
    show('جارٍ التحقق…');
    const r = await post('/tg/start', { initData, email: f.get('email'), password: f.get('password') });
    if (!r.ok) return show(r.data.error || 'تعذر تسجيل الدخول.');
    pending = r.data.pending; flow = 'login';
    login.hidden = true; otp.hidden = false; show('');
  });

  register.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(register);
    show('جارٍ الإرسال…');
    const r = await post('/tg/register', { initData, name: f.get('name'), email: f.get('email'), password: f.get('password') });
    if (!r.ok) return show(r.data.error || 'تعذر إنشاء الحساب.');
    pending = r.data.pending; flow = 'register';
    register.hidden = true; otp.hidden = false; show('');
  });

  otp.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(otp);
    show('جارٍ التحقق…');
    const url = flow === 'register' ? '/tg/register/verify' : '/tg/verify';
    const r = await post(url, { pending, code: f.get('code') });
    if (!r.ok) return show(r.data.error || 'الرمز غير صحيح.');
    location.href = r.data.redirect || '/dashboard';
  });
})();

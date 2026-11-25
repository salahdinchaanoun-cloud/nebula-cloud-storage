// حماية CSRF من جهة العميل: يضيف الرمز لكل نموذج POST ولكل طلب يغيّر البيانات
(() => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const token = meta ? meta.content : '';
  if (!token) return;

  // أي نموذج POST (ثابت أو مُنشأ بالجافاسكربت) يحمل الرمز في رابطه
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || (f.method || '').toLowerCase() !== 'post') return;
    const u = new URL(f.getAttribute('action') || location.href, location.href);
    if (u.origin !== location.origin || u.searchParams.has('_csrf')) return;
    u.searchParams.set('_csrf', token);
    f.setAttribute('action', u.pathname + u.search + u.hash);
  }, true);

  // كل طلب fetch يغيّر البيانات يحمل الرمز في ترويسة
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input.url;
    if (!['GET', 'HEAD'].includes(method) && new URL(url, location.href).origin === location.origin) {
      init.headers = new Headers(init.headers || {});
      init.headers.set('X-CSRF-Token', token);
    }
    return originalFetch(input, init);
  };
})();

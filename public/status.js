// يفحص /health كل 15 ثانية ويعرض الحالة
(() => {
  const el = id => document.getElementById(id);
  const fmtUptime = s => (typeof s === 'number' ? `${Math.floor(s / 3600)} س ${Math.floor((s % 3600) / 60)} د` : '—');

  async function check() {
    const t0 = performance.now();
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      const data = await res.json();
      const ok = res.ok && data.ok;
      el('st-state').textContent = ok ? 'يعمل بشكل طبيعي' : 'توجد مشكلة';
      el('st-dot').className = 'st-dot' + (ok ? '' : ' bad');
      el('st-ms').textContent = Math.round(performance.now() - t0) + ' ms';
      el('st-up').textContent = fmtUptime(data.uptime);
    } catch (_) {
      el('st-state').textContent = 'غير متاح حالياً';
      el('st-dot').className = 'st-dot bad';
      el('st-ms').textContent = '—';
      el('st-up').textContent = '—';
    }
    el('st-time').textContent = new Date().toLocaleTimeString('ar');
  }
  check();
  setInterval(check, 15000);
})();

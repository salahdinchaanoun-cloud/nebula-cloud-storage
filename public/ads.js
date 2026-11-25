// الإعلانات: لا تُحمَّل إلا بعد موافقة الزائر، وتُخفى تماماً في لوحة الإدارة ولوحة المساعد
(() => {
  const cfg = document.getElementById('ads-cfg');
  const slot = document.getElementById('ad-footer');
  const consent = document.getElementById('consent');
  const remove = el => { if (el) el.remove(); };

  if (!cfg || cfg.dataset.enabled !== 'true' || !cfg.dataset.src || document.querySelector('.ai-page') || location.pathname.startsWith('/admin')) {
    remove(slot); remove(consent); return;
  }

  const KEY = 'nebula-ads-consent';
  const read = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const write = v => { try { localStorage.setItem(KEY, v); } catch (_) {} };

  function loadAds() {
    if (!slot || slot.dataset.loaded === '1') return;
    slot.dataset.loaded = '1';
    const opts = document.createElement('script');
    opts.textContent = `atOptions = ${JSON.stringify({ key: cfg.dataset.key, format: 'iframe', height: Number(cfg.dataset.h), width: Number(cfg.dataset.w), params: {} })};`;
    slot.appendChild(opts);
    const src = document.createElement('script');
    src.src = cfg.dataset.src;
    src.async = true;
    slot.appendChild(src);
  }

  const decision = read();
  if (decision === 'yes') { loadAds(); return; }
  if (decision === 'no') { remove(slot); remove(consent); return; }

  if (consent) {
    consent.hidden = false;
    consent.querySelector('[data-yes]').addEventListener('click', () => { write('yes'); consent.hidden = true; loadAds(); });
    consent.querySelector('[data-no]').addEventListener('click', () => { write('no'); consent.hidden = true; remove(slot); });
  }
})();

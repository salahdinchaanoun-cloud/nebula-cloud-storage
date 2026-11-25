// رفع قابل للاستئناف: يقسّم الملف إلى أجزاء، ويكمل من حيث توقف عند انقطاع الاتصال
(() => {
  const form = document.getElementById('upload-form');
  if (!form) return;
  const input = form.querySelector('input[type=file]');
  const wrap = document.getElementById('upload-progress');
  const bar = document.getElementById('upload-bar');
  const status = document.getElementById('upload-status');
  const CHUNK = 8 * 1024 * 1024;
  const KEY = 'nebula-uploads';

  const sessions = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const saveSessions = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} };
  const fileKey = f => `${f.name}|${f.size}|${f.lastModified}`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function retry(fn, tries = 4) {
    for (let i = 0; i < tries; i++) {
      try { return await fn(); }
      catch (e) { if (i === tries - 1) throw e; await sleep(800 * (i + 1)); }
    }
  }

  async function uploadOne(file, onProgress) {
    let sid = sessions()[fileKey(file)];
    let received = [];
    if (sid) {
      try {
        const st = await fetch(`/upload/${sid}/status`, { credentials: 'same-origin' });
        if (st.ok) received = (await st.json()).received; else sid = null;
      } catch (_) { sid = null; }
    }
    if (!sid) {
      const res = await fetch('/upload/init', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, mime: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر بدء الرفع');
      sid = data.id;
      const s = sessions(); s[fileKey(file)] = sid; saveSessions(s);
    }
    const total = Math.ceil(file.size / CHUNK);
    for (let i = 0; i < total; i++) {
      if (!received.includes(i)) {
        const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
        await retry(async () => {
          const r = await fetch(`/upload/${sid}/chunk/${i}`, {
            method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: blob,
          });
          if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'فشل إرسال جزء'); }
        });
      }
      onProgress((i + 1) / total);
    }
    const done = await fetch(`/upload/${sid}/complete`, { method: 'POST', credentials: 'same-origin' });
    const data = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(data.error || 'تعذر إتمام الرفع');
    const s = sessions(); delete s[fileKey(file)]; saveSessions(s);
    return data;
  }

  form.addEventListener('submit', async e => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const btn = form.querySelector('button[type=submit]');
    if (wrap) wrap.hidden = false;
    if (btn) btn.disabled = true;
    let ok = 0; const fail = [];
    for (let n = 0; n < files.length; n++) {
      const f = files[n];
      if (status) status.textContent = `جارٍ رفع ${f.name} (${n + 1} من ${files.length})`;
      try {
        await uploadOne(f, p => { if (bar) bar.style.width = Math.round(p * 100) + '%'; });
        ok++;
      } catch (err) { fail.push(`${f.name}: ${err.message}`); }
      if (bar) bar.style.width = '0%';
    }
    if (status) status.textContent = fail.length ? `تم رفع ${ok} من ${files.length}. أخطاء: ${fail.join(' | ')}` : `تم رفع ${ok} ملف بنجاح`;
    if (btn) btn.disabled = false;
    if (ok) setTimeout(() => location.reload(), 900);
  }, true);

  // إذا تعذر تحميل صورة مصغّرة تُخفى ويظهر الأيقونة مكانها
  document.addEventListener('error', e => {
    if (e.target && e.target.classList && e.target.classList.contains('thumb')) e.target.style.display = 'none';
  }, true);
})();

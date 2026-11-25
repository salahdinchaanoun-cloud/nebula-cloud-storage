// أدوات الملفات في لوحة المستخدم: بحث، ترتيب، إعادة تسمية، نسخ رابط سريع
(() => {
  const grid = document.getElementById('file-grid');
  if (!grid) return;
  const search = document.getElementById('file-search');
  const sort = document.getElementById('file-sort');
  const none = document.getElementById('no-results');
  const cards = [...grid.querySelectorAll('.file-card')];

  function apply() {
    const q = (search.value || '').trim().toLowerCase();
    const mode = sort.value;
    cards.sort((a, b) => {
      switch (mode) {
        case 'old': return a.dataset.date.localeCompare(b.dataset.date);
        case 'name': return a.dataset.name.localeCompare(b.dataset.name, 'ar');
        case 'size': return Number(b.dataset.size) - Number(a.dataset.size);
        default: return b.dataset.date.localeCompare(a.dataset.date);
      }
    }).forEach(c => grid.appendChild(c));
    let visible = 0;
    cards.forEach(c => {
      const ok = !q || c.dataset.name.includes(q);
      c.hidden = !ok;
      if (ok) visible++;
    });
    none.hidden = visible > 0;
  }
  search.addEventListener('input', apply);
  sort.addEventListener('change', apply);

  const copy = (text, btn) => (window.copyText ? window.copyText(text, btn) : navigator.clipboard.writeText(text));

  grid.addEventListener('click', async e => {
    const limitBtn = e.target.closest('.limit-btn');
    if (limitBtn) {
      const hours = prompt('مدة صلاحية الرابط بالساعات (0 = بلا انتهاء):', '0');
      if (hours === null) return;
      const max = prompt('أقصى عدد تنزيلات (0 = بلا حد):', '0');
      if (max === null) return;
      try {
        const res = await fetch(limitBtn.dataset.limit, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ hours: hours || '0', max_downloads: max || '0' }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'فشل');
        alert('تم حفظ الصلاحية.\n' + (d.expires_at ? 'ينتهي: ' + new Date(d.expires_at).toLocaleString('ar') : 'بلا انتهاء') + '\n' + (d.max_downloads ? 'الحد: ' + d.max_downloads + ' تنزيل' : 'بلا حد للتنزيل'));
      } catch (err) { alert('تعذر الحفظ: ' + err.message); }
      return;
    }
    const rename = e.target.closest('.rename-btn');
    if (rename) {
      const current = rename.closest('.file-card').querySelector('h3').textContent.trim();
      const name = prompt('الاسم الجديد للملف:', current);
      if (!name || !name.trim() || name.trim() === current) return;
      const form = document.createElement('form');
      form.method = 'post';
      form.action = rename.dataset.rename;
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'name'; input.value = name.trim();
      form.appendChild(input);
      document.body.appendChild(form);
      form.requestSubmit();
      return;
    }
    const link = e.target.closest('.copy-link-btn');
    if (link) {
      const label = link.textContent;
      link.disabled = true; link.textContent = 'جارٍ…';
      try {
        const res = await fetch(link.dataset.share, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل');
        await copy(data.url, link);
      } catch (_) {
        link.textContent = 'تعذر النسخ';
      } finally {
        setTimeout(() => { link.textContent = label; link.disabled = false; }, 1600);
      }
    }
  });

  // تحديد متعدد وحذف دفعة واحدة
  const bar = document.getElementById('bulk-bar');
  const updateBar = () => {
    const n = document.querySelectorAll('.pick-box:checked').length;
    if (bar) { bar.hidden = n === 0; document.getElementById('bulk-count').textContent = n; }
  };
  document.addEventListener('change', e => {
    if (!e.target.classList.contains('pick-box')) return;
    e.target.closest('.file-card')?.classList.toggle('picked', e.target.checked);
    updateBar();
  });
  document.getElementById('bulk-clear')?.addEventListener('click', () => {
    document.querySelectorAll('.pick-box:checked').forEach(b => { b.checked = false; b.closest('.file-card')?.classList.remove('picked'); });
    updateBar();
  });
  document.getElementById('bulk-delete')?.addEventListener('click', () => {
    const picked = [...document.querySelectorAll('.pick-box:checked')];
    if (!picked.length || !confirm(`حذف ${picked.length} ملف نهائياً؟`)) return;
    const form = document.createElement('form');
    form.method = 'post'; form.action = '/files/bulk-delete';
    picked.forEach(b => { const i = document.createElement('input'); i.type = 'hidden'; i.name = 'ids'; i.value = b.value; form.appendChild(i); });
    document.body.appendChild(form);
    form.requestSubmit();
  });
  document.getElementById('bulk-zip')?.addEventListener('click', () => {
    const picked = [...document.querySelectorAll('.pick-box:checked')];
    if (!picked.length) return;
    const form = document.createElement('form');
    form.method = 'post'; form.action = '/files/bulk-zip';
    picked.forEach(b => { const i = document.createElement('input'); i.type = 'hidden'; i.name = 'ids'; i.value = b.value; form.appendChild(i); });
    document.body.appendChild(form);
    form.requestSubmit();
  });
})();

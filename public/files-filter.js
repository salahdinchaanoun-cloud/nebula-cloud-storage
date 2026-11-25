(() => {
  const grid = document.getElementById('file-grid');
  if (!grid) return;
  const search = document.getElementById('file-search');
  const kind = document.getElementById('file-kind');
  const date = document.getElementById('file-date');
  const none = document.getElementById('no-results');
  const cards = () => Array.from(grid.querySelectorAll('.file-card'));
  function apply() {
    const q = search ? search.value.trim().toLowerCase() : '';
    const k = kind ? kind.value : '';
    const d = date ? date.value : '';
    let visible = 0;
    cards().forEach(c => {
      const okName = !q || (c.dataset.name || '').includes(q);
      const okKind = !k || c.dataset.kind === k;
      const okDate = !d || (c.dataset.date || '').slice(0, 10) === d;
      const ok = okName && okKind && okDate;
      c.hidden = !ok;
      if (ok) visible++;
    });
    if (none) none.hidden = visible > 0;
  }
  [search, kind, date].forEach(el => { if (el) el.addEventListener('input', apply); });
  [kind, date].forEach(el => { if (el) el.addEventListener('change', apply); });
  apply();
})();

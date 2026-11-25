(() => {
  const form = document.getElementById('upload-form');
  if (!form) return;
  const input = form.querySelector('input[type=file]');
  if (!input) return;
  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="drop-box"><b>أفلت الملفات هنا للرفع</b><span>يمكنك إسقاط عدة ملفات معاً</span></div>';
  document.body.appendChild(overlay);
  let depth = 0;
  const hasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'));
  document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; overlay.hidden = false; });
  document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) overlay.hidden = true; });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    const dt = new DataTransfer();
    Array.from(files).forEach(f => dt.items.add(f));
    input.files = dt.files;
    form.requestSubmit();
  });
})();

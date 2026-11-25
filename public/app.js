document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.stat-card,.file-card,.feature,.panel,.auth-card').forEach((el,i)=>{
    el.style.setProperty('--delay',`${Math.min(i*55,440)}ms`);
    el.classList.add('reveal');
  });
  const toast=document.querySelector('.toast');
  if(toast) setTimeout(()=>{toast.classList.add('toast-hide');setTimeout(()=>toast.remove(),400)},4800);
});

// نسخ النص إلى الحافظة مع بديل للمتصفحات القديمة
async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = ok ? 'تم النسخ ✓' : 'تعذر النسخ';
    setTimeout(() => { btn.textContent = old; }, 1600);
  }
  return ok;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-copy]');
  if (btn) copyText(btn.dataset.copy, btn);
});

// زر نسخ لكل كود في صفحة التوثيق
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.api-page pre').forEach(pre => {
    if (pre.parentElement && pre.parentElement.classList.contains('code-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'copy-code'; b.textContent = 'نسخ';
    b.addEventListener('click', () => copyText(pre.innerText, b));
    wrap.appendChild(b);
  });
});

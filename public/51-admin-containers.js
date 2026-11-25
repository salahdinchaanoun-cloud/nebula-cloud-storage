// كشف سر الحاوية عند الطلب فقط، مع إخفاء تلقائي بعد 30 ثانية
(() => {
  document.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const box = btn.parentElement.querySelector('.secret-box');
      const code = box.querySelector('code');
      if (!box.hidden) { box.hidden = true; code.textContent = ''; btn.textContent = 'كشف السر'; return; }
      if (!confirm('سيظهر السر السري لهذه الحاوية على الشاشة. هل تريد المتابعة؟')) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/admin/containers/${encodeURIComponent(btn.dataset.container)}/secret`, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل');
        code.textContent = data.secret;
        box.hidden = false;
        btn.textContent = 'إخفاء السر';
        setTimeout(() => { code.textContent = ''; box.hidden = true; btn.textContent = 'كشف السر'; }, 30000);
      } catch (e) {
        alert('تعذر كشف السر: ' + e.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
  document.querySelectorAll('.copy-secret').forEach(b => b.addEventListener('click', () => {
    const text = b.parentElement.querySelector('code').textContent;
    if (text && window.copyText) window.copyText(text, b);
  }));
  // عدّ الملفات داخل الحاويات الاحتياطية عند الطلب
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const out = btn.parentElement.querySelector('.count-out');
      btn.disabled = true; btn.textContent = 'جارٍ العدّ…';
      try {
        const res = await fetch(`/admin/containers/${encodeURIComponent(btn.dataset.count)}/count`, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل');
        out.textContent = data.count + ' ملف' + (data.truncated ? ' (أو أكثر)' : '');
        btn.textContent = 'تحديث العدد';
      } catch (e) {
        out.textContent = e.message;
        btn.textContent = 'عدّ الملفات';
      } finally {
        btn.disabled = false;
      }
    });
  });
})();

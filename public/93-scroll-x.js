// يلفّ كل جدول غير ملفوف في حاوية قابلة للتمرير الأفقي
(() => {
  const wrap = () => {
    document.querySelectorAll('table').forEach(t => {
      if (t.closest('.table-wrap, .scroll-x')) return;
      const box = document.createElement('div');
      box.className = 'scroll-x';
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wrap);
  else wrap();
})();

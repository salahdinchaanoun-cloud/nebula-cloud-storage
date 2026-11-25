// حركات ومظاهر: الهالة، المظهر، الظهور عند التمرير، ميلان البطاقات
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // طبقة الهالة في الخلفية
  if (!document.querySelector('.aura')) {
    const aura = document.createElement('div');
    aura.className = 'aura';
    aura.setAttribute('aria-hidden', 'true');
    document.body.prepend(aura);
  }

  // المظهر الافتراضي ثابت: لا تبديل للألوان من التذييل
  delete document.documentElement.dataset.theme;

  if (reduce) return;

  // الظهور عند التمرير
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.feature, .panel, .file-card, .page-hero, .section-title, .status-card').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = (i % 6) * 60 + 'ms';
      io.observe(el);
    });
  }

  // ميلان خفيف للبطاقات مع الفأرة (على الحاسوب فقط)
  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.feature').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }
})();

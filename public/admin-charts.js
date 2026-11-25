// رسم بياني لعدد الملفات المرفوعة خلال 14 يوماً
(() => {
  const canvas = document.getElementById('uploads-chart');
  if (!canvas || !window.Chart) return;
  let labels = [], values = [];
  try { labels = JSON.parse(canvas.dataset.labels || '[]'); values = JSON.parse(canvas.dataset.values || '[]'); } catch (_) {}
  new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'ملفات مرفوعة', data: values, backgroundColor: '#1d4ed8', borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
})();

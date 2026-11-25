const CACHE = 'nebula-shell-v1';
const SHELL = ['/site.css', '/files-tools.js', '/app.js', '/security.js', '/resumable-upload.js', '/offline.html'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // الصفحات والبيانات تأتي من الشبكة دائماً، وعند انقطاع الاتصال تُعرض صفحة بسيطة
  e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html')));
});

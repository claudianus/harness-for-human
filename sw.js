// 네트워크 우선, 실패하면 캐시. 오프라인에서도 열리고, 업데이트는 바로 반영된다.
const CACHE = 'human-harness-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/store.js', 'js/ui.js',
  'js/modules/today.js', 'js/modules/focus.js', 'js/modules/inbox.js', 'js/modules/think.js',
  'js/modules/rhythm.js', 'js/modules/manual.js', 'js/modules/review.js', 'js/modules/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

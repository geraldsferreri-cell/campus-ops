const CACHE_NAME = 'campus-ops-v8';
const ASSETS = [
  '/campus-ops/',
  '/campus-ops/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // HTML: network-first, ensures immediate effect after each deploy
  if (event.request.destination === 'document' || event.request.url.match(/\/campus-ops\/?$/)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Other assets: cache-first
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
});

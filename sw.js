
const CACHE_NAME = 'carsan-estimator-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // We attempt to cache core assets, but don't fail installation if one fails
        return cache.addAll(urlsToCache).catch(err => console.log('Cache add failed', err));
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            // Cache valid responses for offline use
            // Only cache http/https requests
            if (event.request.url.startsWith('http')) {
                cache.put(event.request, responseToCache);
            }
          });

        return response;
      })
      .catch(() => {
        // If fetch fails, try to return from cache
        return caches.match(event.request);
      })
  );
});

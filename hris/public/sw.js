const CACHE_NAME = 'trace-hris-v3';

// Only truly static assets that never change without a filename change
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete all old caches so stale chunks don't survive a deploy
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API calls — always fresh from network
  if (url.pathname.startsWith('/api/')) return;

  // Never intercept Next.js built chunks — they use content hashes in the
  // filename so caching them in the SW is pointless and breaks HMR in dev.
  if (url.pathname.startsWith('/_next/')) return;

  // Pre-cached static assets — cache-first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request))
    );
    return;
  }

  // Everything else (page navigations) — network-first, cache HTML for offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached ??
            new Response('You appear to be offline. Please check your connection.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
        )
      )
  );
});

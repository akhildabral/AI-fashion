// Minimal service worker: makes the app installable (Android requires a
// fetch handler) without caching anything — the app is API-driven and
// stale caches would show other users' state. Network-only passthrough.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

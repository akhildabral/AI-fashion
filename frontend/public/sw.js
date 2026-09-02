// Minimal service worker: makes the app installable (Android requires a
// fetch handler) without caching anything — the app is API-driven and
// stale caches would show other users' state. Network-only passthrough.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// The morning ritual: a push arrives with today's look; tapping opens Today.
self.addEventListener('push', (event) => {
  let data = { title: 'Your look is ready.', body: 'Open the app to see today’s outfit.', url: '/', tag: 'ritual' };
  try {
    data = { ...data, ...event.data.json() };
  } catch (e) {
    /* plain text or empty — keep the defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

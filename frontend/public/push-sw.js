/* Web Push handler — generateSW tarafından importScripts ile yüklenir. */
/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Sinemood', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Sinemood';
  const options = {
    body: data.body || '',
    icon: '/sinemod-mark.png',
    badge: '/sinemod-mark.png',
    tag: data.tag || 'sinemood',
    renotify: true,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Açık bir sekme varsa ona odaklan + yönlendir
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});

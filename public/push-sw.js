// Notificações push (importado pelo service worker gerado pelo Workbox).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const base = self.registration.scope;
  event.waitUntil(self.registration.showNotification(data.title || 'Nós Dois', {
    body: data.body || '',
    icon: base + 'icon-192.png',
    badge: base + 'icon-192.png',
    tag: data.tag,
    data: { url: base + (data.url || '') },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        return c.navigate(url).catch(() => {});
      }
    }
    return clients.openWindow(url);
  })());
});

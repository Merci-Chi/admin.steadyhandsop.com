/* Steady Hands Call Center service worker
   Freshness-first: same-origin app files always come from the network when available. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    ])
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();

  if (event.data?.type === 'SHOW_SCHEDULED_NOTIFICATION') {
    const data = event.data || {};
    event.waitUntil(
      self.registration.showNotification(
        data.title || 'Scheduled call',
        {
          body: data.body || '',
          icon: 'images/icon-192.png',
          badge: 'images/icon-192.png',
          tag: data.tag || 'scheduled-call',
          renotify: true,
          data: { url: data.url || 'index.html' }
        }
      )
    );
  }
});



self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data?.text?.() || '' };
    } catch {}
  }

  const title = data.title || 'Scheduled call';
  const options = {
    body: data.body || '',
    icon: 'images/icon-192.png',
    badge: 'images/icon-192.png',
    tag: data.tag || 'scheduled-call',
    renotify: true,
    data: {
      url: data.url || 'index.html',
      crm_id: data.crm_id || null,
      reminder_minutes: data.reminder_minutes ?? null
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || 'index.html';

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clientsList) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.navigate(target);
          return client.focus();
        }
      } catch {}
    }

    return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => fetch(request))
  );
});

/* Steady Hands Admin service worker.
   Freshness-first: admin app files come from the network whenever available. */
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

/* Clicking a displayed booking notification opens the existing PWA. */
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('bookings.html',self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const match=windows.find(w=>w.url.startsWith(self.registration.scope));
    if(match){await match.focus();if(match.navigate)await match.navigate(target);return;}
    await self.clients.openWindow(target);
  })());
});

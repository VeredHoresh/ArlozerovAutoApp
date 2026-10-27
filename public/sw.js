const CACHE = 'arlo-shell-v4';
const STATIC = ['/offline.html', '/style.css', '/hug-192.png', '/hug-512.png', '/hug-maskable.png', '/hug-apple-touch.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('arlo-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache authentication, account data, schedules, or booking API calls.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (STATIC.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { data = null; }
  event.waitUntil(self.registration.showNotification(data?.title || 'החוג שלי', {
    body: data?.body || 'יש עדכון חדש בהרשמות שלך.',
    icon: '/hug-192.png', badge: '/hug-192.png', dir: 'rtl', lang: 'he',
    tag: data?.tag || 'booking-update', data: { url: '/?view=upcoming' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('/?view=upcoming', self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) { await client.navigate(url); return client.focus(); }
    }
    return clients.openWindow(url);
  }));
});

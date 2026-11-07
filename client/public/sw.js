// Adulthood service worker. It keeps the game's own files (page, scripts, models, icons) so the app opens fast,
// and always asks the network first for the page so updates arrive. It never touches /api or the live game connection.
const CACHE = 'adulthood-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/socket.io/')) return;
  const page = r.mode === 'navigate' || u.pathname === '/' || u.pathname.endsWith('.html');
  if (page) {
    // network first, so a new version always wins; the saved copy is only for when you are offline
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put('/', c)); return res; }).catch(() => caches.match('/')));
    return;
  }
  // files with a hash in the name never change, models and icons rarely: cache first
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r, c)); } return res; })));
});
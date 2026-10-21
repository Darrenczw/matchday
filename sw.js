// Matchday service worker. Bump VERSION on every deploy.
const VERSION = 'md-v16';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'data/rights.json',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/identity.js', 'js/kits.js', 'js/espn.js', 'js/tv.js', 'js/suggest.js', 'js/rules.js', 'js/names.js', 'js/cal.js', 'js/ics.js', 'js/ui.js', 'js/ground.js',
  'js/views/home.js', 'js/views/follow.js', 'js/views/comp.js', 'js/views/team.js', 'js/views/match.js', 'js/views/week.js', 'js/views/settings.js',
  'fonts/Saira-var.woff2', 'fonts/SairaCondensed-700.woff2', 'fonts/SairaCondensed-800.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const DATA = 'md-data', IMG = 'md-img';

// cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files.
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![VERSION, DATA, IMG].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Score feed and Wikipedia: always try the network; offline, serve the last copy marked with its age.
  if (u.hostname.endsWith('api.espn.com') || u.hostname === 'en.wikipedia.org') {
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(e.request, stamp(copy))); }
      return r;
    }).catch(async () => {
      const hit = await caches.match(e.request, { cacheName: DATA });
      if (!hit) throw new Error('offline');
      const h = new Headers(hit.headers); h.set('x-md-cached', hit.headers.get('x-md-saved') || '0');
      return new Response(await hit.blob(), { status: 200, headers: h });
    }));
    return;
  }
  // Logos: cache first, they rarely change.
  if (u.hostname === 'a.espncdn.com') {
    e.respondWith(caches.open(IMG).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; })));
    return;
  }
  // App files: cache first, refreshed by VERSION.
  if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
  }
});

async function stamp(r) {
  const h = new Headers(r.headers); h.set('x-md-saved', String(Date.now()));
  return new Response(await r.blob(), { status: r.status, headers: h });
}

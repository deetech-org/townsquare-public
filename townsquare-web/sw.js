// Townsquare Web service worker — offline app shell with safe versioned updates.
// Bump CACHE on every deploy so clients pick up new code instead of a stale build.
const CACHE = 'townsquare-v2';
const SHELL = [
  '.', 'index.html', 'core.js', 'ui.js', 'manifest.webmanifest',
  'vendor/qrcode.js', 'vendor/jsQR.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Best-effort per-file so a missing vendor drop-in doesn't abort the whole install.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* skip */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first: fresh code whenever online (so deploys show up without a manual cache
// bump), fall back to cache when offline so the installed PWA still runs with no signal.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, res.clone());
      }
      return res;
    } catch {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      if (e.request.mode === 'navigate') return caches.match('index.html');
      throw new Error('offline');
    }
  })());
});

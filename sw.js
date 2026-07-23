// ════════════════════════════════════════════════════════════════════
// M.U.S.C.L.E. Collector — sw.js  (service worker)
// ────────────────────────────────────────────────────────────────────
// Offline-first PWA cache. Bump CACHE on every release (keep it in step
// with APP_VERSION in js/state.js). Strategy:
//   • app shell + local assets → cache-first, populated on install
//   • figure images (raw.githubusercontent) → stale-while-revalidate
//   • fonts (googleapis/gstatic) → stale-while-revalidate
//   • navigations → serve cached index.html (SPA shell)
// A new worker signals clients (UPDATE_AVAILABLE) so the app can refresh.
// ════════════════════════════════════════════════════════════════════

const VERSION = '1.2';
const CACHE = `muscle-v${VERSION}`;
const RUNTIME = `muscle-runtime-v${VERSION}`;

// Local app shell — everything needed to boot offline.
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'figures.json',
  'css/app.css',
  'css/fonts.css',
  'fonts/anton-400.woff2',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlow-600.woff2',
  'fonts/barlow-700.woff2',
  'js/app.js',
  'js/state.js',
  'js/data.js',
  'js/render.js',
  'js/handlers.js',
  'js/delegate.js',
  'js/idb-store.js',
  'images/icon-192.png',
  'images/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll is atomic; if one asset 404s the whole install fails, so add
    // them individually and tolerate the odd miss (e.g. an icon not yet built).
    await Promise.all(CORE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== CACHE && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
    // Tell open tabs a new version is live.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.postMessage({ type: 'UPDATE_AVAILABLE', version: VERSION });
  })());
});

const isImage = url => url.hostname === 'raw.githubusercontent.com';
const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return cached || network || fetch(request).catch(() => new Response('', { status: 504 }));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // SPA navigations: serve the cached shell, fall back to network.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./')) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  if (isImage(url) || isFont(url)) { event.respondWith(staleWhileRevalidate(request)); return; }
  if (url.origin === self.location.origin) { event.respondWith(cacheFirst(request)); return; }
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

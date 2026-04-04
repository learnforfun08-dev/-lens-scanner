/* ═══════════════════════════════════════════════════
   Lens Scanner — Service Worker  v1
   GitHub Pages: learnforfun08-dev/lens-scanner
═══════════════════════════════════════════════════ */

const CACHE_NAME  = 'lens-scanner-v1';
const BASE        = '/lens-scanner';

const APP_SHELL = [
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-maskable-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/icon-maskable-512.png`,
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* ── INSTALL: pre-cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Promise.allSettled so one missing file never breaks the whole install
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log(`[SW] Deleting old cache: ${k}`);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: three routing strategies ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // 1. Google Fonts → Stale-While-Revalidate
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 2. Own origin + under BASE → Cache First
  if (url.origin === self.location.origin && url.pathname.startsWith(BASE)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Everything else (CDN scripts, etc.) → Network First with cache fallback
  event.respondWith(networkFirst(request));
});

/* ── Strategy: Cache First ── */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached — return offline shell if available
    return caches.match(`${BASE}/index.html`);
  }
}

/* ── Strategy: Network First ── */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

/* ── Strategy: Stale-While-Revalidate ── */
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

/* ── Message handler ── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});

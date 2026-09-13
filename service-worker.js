/* ==========================================================================
   BillNova India — Service Worker
   Offline-first: pre-caches the app shell + third-party libraries, then
   serves everything from cache, falling back to network for anything new.
   ========================================================================== */

const CACHE_VERSION = 'billnova-v1.2.0';
const CACHE_NAME = `billnova-cache-${CACHE_VERSION}`;

// App shell: everything needed for the app to boot and run fully offline.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',

  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/photo-picker.css',
  './css/layout.css',
  './css/bottom-nav.css',
  './css/quick-actions-permissions.css',
  './css/scanner.css',
  './css/cart.css',
  './css/billing-flow.css',
  './css/receipt.css',
  './css/label.css',
  './css/recent.css',
  './css/profile.css',
  './css/themes.css',

  './js/db.js',
  './js/utils.js',
  './js/toast.js',
  './js/loading.js',
  './js/modal.js',
  './js/photo-picker.js',
  './js/onboarding.js',
  './js/permissions.js',
  './js/pwa-install.js',
  './js/scanner.js',
  './js/cart.js',
  './js/profile.js',
  './js/receipt.js',
  './js/label.js',
  './js/billing.js',
  './js/recent.js',
  './js/navigation.js',
  './js/quick-actions.js',
  './js/app.js',

  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-128.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-152.png',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-384.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './vendor/html5-qrcode.min.js',
  './vendor/JsBarcode.all.min.js',
  './vendor/qrcode.min.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/fontawesome/css/all.min.css',
  './vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
];

// Third-party assets loaded from CDN (fonts only) — cached opportunistically
// so the app keeps working offline after the first successful load. Failure
// to cache these (e.g. offline first install) never blocks installation.
const THIRD_PARTY_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Cache third-party assets individually so one failed CDN request
      // doesn't block installation of the core offline app shell.
      await Promise.all(
        THIRD_PARTY_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Failed to cache', url, err))
        )
      );
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('billnova-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          // Cache successful same-origin or CDN responses for future offline use
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: serve the app shell for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});

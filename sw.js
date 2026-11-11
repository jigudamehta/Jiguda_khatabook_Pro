// Service worker: caches the app files so the app opens offline.
// IMPORTANT: when you edit any app file, change CACHE_VERSION so phones pick up the new files.
const CACHE_VERSION = 'rms-ledger-v2';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './core.js', './forms.js', './pages.js', './customer.js',
  './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API / Drive / fonts go straight to the network
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      const net = fetch(req).then(function (res) {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit || caches.match('./index.html'); });
      return hit || net;
    })
  );
});

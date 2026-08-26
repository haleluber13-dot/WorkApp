// Cache the shell and the catalog so OlaKai opens instantly and still shows
// spots, write-ups and travel info with no connection. Live cams and live
// conditions obviously need the network; everything else does not.
const CACHE = 'olakai-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/spots.json',
  './data/cams.json',
  './data/airports.json',
  './data/world_land.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache the weather APIs or anything cross-origin -- stale conditions
  // are worse than none, and cams must always be live.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => hit);
    })
  );
});

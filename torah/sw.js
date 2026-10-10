/* Otiyot — offline shell.
 *
 * The app itself is small and the five books are static, so everything gets
 * cached on first run and the app works with no network at all afterwards.
 */
const CACHE = 'otiyot-v3';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/mapping.js', './js/audio.js', './js/data.js', './js/export.js',
  './js/styles.js', './js/fx.js', './js/samples.js', './js/lyrics.js',
  './js/panes.js', './js/niqqud.js', './js/voice.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './data/manifest.json',
  './data/genesis.json', './data/exodus.json', './data/leviticus.json',
  './data/numbers.json', './data/deuteronomy.json',
  // The other translations are fetched the first time they are chosen, and
  // the fetch handler below caches them from then on.
  './data/trans/index.json', './data/trans/en.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL))
    .then(() => self.skipWaiting())
    .catch(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});

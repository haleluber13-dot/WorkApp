/* MotorLab service worker — offline app shell. Bump CACHE when files change. */
const CACHE = 'motorlab-v1';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/icon.svg',
  './vendor/three/build/three.module.min.js',
  './vendor/three/examples/jsm/controls/OrbitControls.js',
  './data/world_land.json',
  './js/main.js', './js/ui.js', './js/store.js', './js/game.js', './js/viewport.js', './js/updates.js',
  './js/lib/geo.js',
  './js/data/engines.js', './js/data/parts.js', './js/data/vehicles.js', './js/data/vehicleParts.js',
  './js/data/upgrades.js', './js/data/curriculum.js', './js/data/electrical.js',
  './js/data/races.js', './js/data/news.js',
  './js/sim/ecu.js', './js/sim/engineSim.js', './js/sim/dyno.js',
  './js/build/engineModel.js', './js/build/vehicleModel.js',
  './js/workspaces/assembly.js', './js/workspaces/garage.js', './js/workspaces/engine.js',
  './js/workspaces/tune.js', './js/workspaces/dyno.js', './js/workspaces/upgrade.js',
  './js/workspaces/wiring.js', './js/workspaces/audio.js', './js/workspaces/learn.js',
  './js/workspaces/races.js', './js/workspaces/news.js', './js/workspaces/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  /* the update feed must always come from the network when it can */
  if (url.pathname.endsWith('/data/updates.json')){
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match('./index.html'))));
});

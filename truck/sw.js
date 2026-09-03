/* Offline app shell. The map tiles and every routing/POI call are live by
   nature, so only the shell and the reference data are cached — a cached route
   would be worse than no route. Bump CACHE when app files change. */
const CACHE = "truckway-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./vendor/leaflet.js", "./vendor/leaflet.css",
  "./vendor/images/marker-icon.png", "./vendor/images/marker-icon-2x.png",
  "./vendor/images/marker-shadow.png",
  "./js/util.js", "./js/profile.js", "./js/services.js", "./js/restrict.js",
  "./js/poi.js", "./js/fuel.js", "./js/nav.js", "./js/map.js", "./js/ui.js", "./js/app.js",
  "./data/fuel-baselines.json",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  /* Tiles, routing, Overpass and geocoding are all live services. */
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});

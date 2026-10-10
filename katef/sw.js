/* Offline app shell for Katef. Data (requests, messages) always comes from the
   network or local storage — only the app files are cached.
   Bump CACHE when app files change. */
const CACHE = "katef-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./js/app.js", "./js/store.js", "./js/seed.js", "./js/taxonomy.js", "./js/ui.js", "./js/directory.js",
  "./js/map.js", "./js/config.js",
  "./js/views/home.js", "./js/views/find.js", "./js/views/board.js", "./js/views/request.js", "./js/views/form.js",
  "./js/views/orgs.js", "./js/views/offers.js", "./js/views/me.js", "./js/views/auth.js", "./js/views/admin.js",
  "./js/views/about.js",
  "./data/orgs.json", "./vendor/leaflet.js", "./vendor/leaflet.css",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
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
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("katef-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network first so updates show up immediately; cache when offline. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});

const CACHE = "globewatch-v4";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/js/data.js", "./assets/js/store.js", "./assets/js/globe.js",
  "./assets/js/ui.js", "./assets/js/app.js",
  "./assets/vendor/globe.gl.min.js", "./assets/vendor/hls.min.js", "./assets/vendor/dash.all.min.js",
  "./assets/vendor/img/earth-night.jpg", "./assets/vendor/img/earth-topology.png",
  "./assets/icons/icon.svg"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Never cache live streams / third-party media/APIs
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html")))
  );
});

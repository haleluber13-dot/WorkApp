// Offline shell: the whole app and every card file are cached on first visit,
// so the map works with no connection (homeschool on the go).
const CACHE = "lifemap-v2";
const TOPICS = ["nature","animals","body","feelings","family","food","build","tools","art","music",
  "language","numbers","science","cultures","history","safety","community","money","outdoors","thinking"];
const SHELL = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./js/store.js", "./js/engine.js", "./js/speech.js", "./js/ui.js", "./js/app.js",
  "./data/topics.js",
  ...TOPICS.map((t) => `./data/cards/${t}.js`),
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // fonts etc. go straight to network
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});

/* Offline app shell: everything PianoPath needs is local (the piano sound is
   synthesized), so the whole app works without a connection once loaded.
   Bump CACHE when app files change. */
const CACHE = "pianopath-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./js/app.js", "./js/theory.js", "./js/score.js", "./js/staff.js", "./js/keyboard.js",
  "./js/audio.js", "./js/listen.js", "./js/practice.js", "./js/tools.js",
  "./js/curriculum.js", "./js/store.js",
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
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("pianopath-") && k !== CACHE).map((k) => caches.delete(k))))
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

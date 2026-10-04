/* Offline support: precache the app shell, then cache every same-origin file
   the app loads (modules, fonts, vendor libs) the first time it's used.
   Network first so updates show up immediately. Bump CACHE when files change. */
const CACHE = "inkform-v1";
const SHELL = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./vendor/three/three.module.js", "./vendor/three/three.core.js",
  "./vendor/three/addons/OrbitControls.js", "./vendor/three/addons/RoomEnvironment.js",
  "./vendor/bvh/three-mesh-bvh.js",
  "./js/app.js", "./js/state.js", "./js/settings.js", "./js/viewer.js", "./js/decal.js", "./js/ink.js",
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
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("inkform-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never touch the Claude API or other hosts
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

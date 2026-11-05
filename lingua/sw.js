/* Offline app shell. Everything LinguaPath needs (code + all course content) is local; translation and
   speech recognition need the network. Bump CACHE when app files change. */
const CACHE = "linguapath-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./styles.css",
  "./js/app.js", "./js/i18n.js", "./js/langs.js", "./js/store.js", "./js/srs.js", "./js/speech.js", "./js/translate.js",
  "./js/ui.js", "./js/curriculum.js", "./js/exercises.js", "./js/lesson.js", "./js/unit.js", "./js/review.js",
  "./js/practice.js", "./js/translator.js", "./js/progress.js", "./js/grammar.js", "./js/tutor.js",
  "./js/content/concepts-a.js", "./js/content/concepts-b.js",
  "./js/content/es.js", "./js/content/pt.js", "./js/content/fr.js", "./js/content/it.js", "./js/content/de.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("linguapath-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Network first (updates show up right away), cache as fallback. Third-party requests pass through untouched. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});

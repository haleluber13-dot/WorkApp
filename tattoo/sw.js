/* Offline support: precache every app file (shell, lazily loaded modules,
   fonts, vendor libs) so the whole app works offline after the first visit.
   Network first so updates show up immediately. Bump CACHE when files change. */
const CACHE = "inkform-v4";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./fonts/caveat-brush.woff",
  "./fonts/courier-prime.woff",
  "./fonts/dancing-script-700.woff",
  "./fonts/fonts.css",
  "./fonts/great-vibes.woff",
  "./fonts/kaushan-script.woff",
  "./fonts/mr-dafoe.woff",
  "./fonts/oswald-600.woff",
  "./fonts/pirata-one.woff",
  "./fonts/rye.woff",
  "./fonts/unifrakturmaguntia.woff",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./js/agent/agent.css",
  "./js/agent/chat.js",
  "./js/agent/claude.js",
  "./js/agent/lexicon.js",
  "./js/agent/local.js",
  "./js/agent/regions.js",
  "./js/agent/vocab.js",
  "./js/android.js",
  "./js/app.js",
  "./js/body/core.js",
  "./js/body/index.js",
  "./js/body/mesher.js",
  "./js/body/model.js",
  "./js/body/regions.js",
  "./js/body/sdf.js",
  "./js/body/vec.js",
  "./js/body/worker.js",
  "./js/decal.js",
  "./js/designs/bands.js",
  "./js/designs/core.js",
  "./js/designs/fallback-font.js",
  "./js/designs/fonts.js",
  "./js/designs/index.js",
  "./js/designs/lettering.js",
  "./js/designs/library.js",
  "./js/designs/motifs-animals.js",
  "./js/designs/motifs-extra.js",
  "./js/designs/motifs.js",
  "./js/designs/opts.js",
  "./js/designs/prompt.js",
  "./js/designs/render.js",
  "./js/designs/styles-lettering.js",
  "./js/designs/styles-misc.js",
  "./js/designs/styles-motif.js",
  "./js/designs/styles-pattern.js",
  "./js/designs/styles-pattern2.js",
  "./js/geo/delaunay.js",
  "./js/geo/geo.css",
  "./js/geo/geomaker.js",
  "./js/geo/icons.js",
  "./js/geo/imgfx.js",
  "./js/geo/model.js",
  "./js/geo/render.js",
  "./js/geo/samples.js",
  "./js/geo/shapes.js",
  "./js/geo/templates.js",
  "./js/imageio.js",
  "./js/ink.js",
  "./js/photo/adjust.js",
  "./js/photo/icons.js",
  "./js/photo/looks.js",
  "./js/photo/magnetic.js",
  "./js/photo/mask.js",
  "./js/photo/output.js",
  "./js/photo/panels.js",
  "./js/photo/photo.css",
  "./js/photo/photostudio.js",
  "./js/photo/render-worker.js",
  "./js/photo/seg-worker.js",
  "./js/photo/segment.js",
  "./js/photo/util.js",
  "./js/photo/widgets.js",
  "./js/settings.js",
  "./js/sketch/brushes.js",
  "./js/sketch/fill.js",
  "./js/sketch/history.js",
  "./js/sketch/icons.js",
  "./js/sketch/sketch.css",
  "./js/sketch/sketchpad.js",
  "./js/sketch/stencil.js",
  "./js/sketch/text.js",
  "./js/sketch/ui.js",
  "./js/state.js",
  "./js/viewer.js",
  "./js/webbank/pack.js",
  "./js/webbank/sources.js",
  "./js/webbank/webbank.css",
  "./js/webbank/webbank.js",
  "./vendor/anthropic/sdk.js",
  "./vendor/bvh/three-mesh-bvh.js",
  "./vendor/opentype/opentype.min.mjs",
  "./vendor/three/addons/OrbitControls.js",
  "./vendor/three/addons/RoomEnvironment.js",
  "./vendor/three/three.core.js",
  "./vendor/three/three.module.js",
  "./vendor/webbank/game-icons.json",
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
    }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});

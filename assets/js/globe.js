/* GlobeWatch — 3D globe layer (globe.gl / three.js) with graceful fallback. */
(function () {
  "use strict";
  const GlobeView = {
    world: null, el: null, onSelect: null, _data: [],

    available() { return typeof window.Globe === "function"; },

    init(el, { onSelect } = {}) {
      this.el = el; this.onSelect = onSelect;
      if (!this.available()) { this._fallback(); return false; }
      const catColor = {};
      (window.CATEGORIES || []).forEach((c) => (catColor[c.id] = c.color));

      this.world = Globe()(el)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl("./assets/vendor/img/earth-night.jpg")
        .bumpImageUrl("./assets/vendor/img/earth-topology.png")
        .atmosphereColor("#3aa0ff")
        .atmosphereAltitude(0.18)
        .pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 0)
        .pointsData([])
        .pointLat("lat").pointLng("lng")
        .pointColor((d) => catColor[d.category] || "#38bdf8")
        .pointAltitude(0.01)
        .pointRadius(0.28)
        .pointLabel((d) => labelHTML(d))
        .onPointClick((d) => this.onSelect && this.onSelect(d.id))
        .ringsData([])
        .ringColor((d) => (t) => `rgba(56,189,248,${1 - t})`)
        .ringMaxRadius(3).ringPropagationSpeed(2).ringRepeatPeriod(1200);

      const controls = this.world.controls();
      controls.autoRotate = !!(window.Store && Store.settings.autoRotate);
      controls.autoRotateSpeed = 0.35;
      controls.enableDamping = true;

      window.addEventListener("resize", () => this.resize());
      this.resize();
      return true;
    },

    resize() {
      if (!this.world || !this.el) return;
      this.world.width(this.el.clientWidth).height(this.el.clientHeight);
    },

    // Rendering tens of thousands of points stalls WebGL; thin them spatially so
    // the globe stays smooth while keeping worldwide spread.
    MAX_POINTS: 4000,

    setData(cams) {
      this._data = cams;
      if (!this.world) { this._fallback(); return; }
      this.world.pointsData(thin(cams, this.MAX_POINTS));
    },

    setAutoRotate(on) { if (this.world) this.world.controls().autoRotate = !!on; },

    /** Current camera target { lat, lng, altitude } or null if globe unavailable. */
    getPOV() { return this.world ? this.world.pointOfView() : null; },

    focus(cam) {
      if (!this.world || !cam) return;
      this.world.pointOfView({ lat: cam.lat, lng: cam.lng, altitude: 1.1 }, 900);
      this.world.ringsData([{ lat: cam.lat, lng: cam.lng }]);
      setTimeout(() => this.world && this.world.ringsData([]), 2600);
    },

    _fallback() {
      if (!this.el) return;
      this.el.classList.add("globe-fallback");
      this.el.innerHTML =
        '<div class="globe-fallback__msg">🌐 3D globe needs the mapping library ' +
        '(loads from CDN). You are offline or it was blocked — the live wall, ' +
        'search, and all controls still work below.</div>';
    }
  };

  /** Keep at most `max` points, spread evenly over the world via a lat/lng grid. */
  function thin(cams, max) {
    if (cams.length <= max) return cams;
    const cells = new Map();
    // grid fine enough that `max` cells can plausibly be filled
    const step = Math.max(0.25, 180 / Math.sqrt(max * 2));
    // no early break: scan every camera so the grid covers the whole world,
    // otherwise the result is biased to whichever region comes first in the list
    for (const c of cams) {
      const key = Math.round(c.lat / step) + ":" + Math.round(c.lng / step);
      if (!cells.has(key)) cells.set(key, c);
    }
    let out = Array.from(cells.values());
    if (out.length > max) {                       // still dense: take an even stride
      const stride = out.length / max, picked = [];
      for (let i = 0; picked.length < max && Math.floor(i) < out.length; i += stride) picked.push(out[Math.floor(i)]);
      out = picked;
    } else if (out.length < max) {                // grid under-filled: top up
      const chosen = new Set(out.map((c) => c.id));
      for (const c of cams) {
        if (out.length >= max) break;
        if (!chosen.has(c.id)) { out.push(c); chosen.add(c.id); }
      }
    }
    return out;
  }

  function labelHTML(d) {
    const cat = (window.CATEGORIES || []).find((c) => c.id === d.category);
    return '<div class="pt-label"><b>' + esc(d.name) + '</b><br>' +
      '<span>' + (cat ? cat.icon + " " : "") + esc([d.city, d.country].filter(Boolean).join(", ")) +
      '</span></div>';
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  window.GlobeView = GlobeView;
})();

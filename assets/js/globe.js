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
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
        .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
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

    setData(cams) {
      this._data = cams;
      if (!this.world) { this._fallback(); return; }
      this.world.pointsData(cams);
    },

    setAutoRotate(on) { if (this.world) this.world.controls().autoRotate = !!on; },

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

/* GlobeWatch — state store: persistence, user edits, filtering, Windy API. */
(function () {
  "use strict";
  const LS_KEYS = { user: "gw:userCams", removed: "gw:removedIds", edits: "gw:edits",
                    fav: "gw:favorites", settings: "gw:settings" };

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (_) { return false; }
  }

  const Store = {
    categories: window.CATEGORIES || [],
    _seed: (window.SEED_CAMERAS || []).map((c) => Object.assign({ _origin: "seed" }, c)),
    userCams: load(LS_KEYS.user, []),
    removedIds: new Set(load(LS_KEYS.removed, [])),
    edits: load(LS_KEYS.edits, {}),          // id -> partial overrides
    favorites: new Set(load(LS_KEYS.fav, [])),
    windyCams: [],                            // fetched at runtime, not persisted
    settings: Object.assign(
      { windyKey: "", autoRotate: true, showLabels: true, quality: "auto", theme: "midnight" },
      load(LS_KEYS.settings, {})
    ),
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => { try { fn(); } catch (_) {} }); },

    persist() {
      save(LS_KEYS.user, this.userCams);
      save(LS_KEYS.removed, Array.from(this.removedIds));
      save(LS_KEYS.edits, this.edits);
      save(LS_KEYS.fav, Array.from(this.favorites));
      save(LS_KEYS.settings, this.settings);
    },

    /** All cameras merged: seed + windy + user, minus removed, with edits applied. */
    all() {
      const merged = [];
      const base = this._seed.concat(this.windyCams).concat(this.userCams);
      for (const cam of base) {
        if (this.removedIds.has(cam.id)) continue;
        const patch = this.edits[cam.id];
        merged.push(patch ? Object.assign({}, cam, patch) : cam);
      }
      // de-dup by id (user copy wins)
      const byId = new Map();
      for (const c of merged) byId.set(c.id, c);
      return Array.from(byId.values());
    },

    get(id) { return this.all().find((c) => c.id === id); },

    filter({ query = "", cats = null, favOnly = false } = {}) {
      const q = query.trim().toLowerCase();
      const catSet = cats && cats.size ? cats : null;
      return this.all().filter((c) => {
        if (favOnly && !this.favorites.has(c.id)) return false;
        if (catSet && !catSet.has(c.category)) return false;
        if (!q) return true;
        const hay = [c.name, c.city, c.country, c.category, (c.tags || []).join(" ")]
          .join(" ").toLowerCase();
        return hay.includes(q);
      });
    },

    addOrUpdate(cam) {
      const isEdit = !!cam.id && this.all().some((c) => c.id === cam.id);
      const origin = cam.id ? (this.get(cam.id) || {})._origin : null;
      if (isEdit && origin && origin !== "user") {
        // editing a seed/windy cam -> store as override patch
        this.edits[cam.id] = Object.assign({}, this.edits[cam.id], cam);
      } else {
        cam.id = cam.id || ("u-" + Date.now().toString(36) + Math.floor(Math.abs(hashStr(cam.name)) % 1e4));
        cam._origin = "user";
        const idx = this.userCams.findIndex((c) => c.id === cam.id);
        if (idx >= 0) this.userCams[idx] = cam; else this.userCams.push(cam);
      }
      this.persist(); this.emit();
      return cam.id;
    },

    remove(id) {
      const idx = this.userCams.findIndex((c) => c.id === id);
      if (idx >= 0) this.userCams.splice(idx, 1);
      else this.removedIds.add(id);
      this.favorites.delete(id);
      delete this.edits[id];
      this.persist(); this.emit();
    },

    toggleFav(id) {
      if (this.favorites.has(id)) this.favorites.delete(id); else this.favorites.add(id);
      this.persist(); this.emit();
    },

    resetSeed(id) { // undo edits/removal on a seed cam
      this.removedIds.delete(id); delete this.edits[id];
      this.persist(); this.emit();
    },

    setSetting(k, v) { this.settings[k] = v; this.persist(); this.emit(); },

    exportJSON() {
      return JSON.stringify({
        version: 1, exportedAt: new Date().toISOString(),
        userCams: this.userCams, removedIds: Array.from(this.removedIds),
        edits: this.edits, favorites: Array.from(this.favorites),
        settings: Object.assign({}, this.settings, { windyKey: "" })
      }, null, 2);
    },

    importJSON(text, { merge = true } = {}) {
      const data = JSON.parse(text);
      if (!merge) { this.userCams = []; this.removedIds = new Set(); this.edits = {}; this.favorites = new Set(); }
      (data.userCams || []).forEach((c) => {
        const i = this.userCams.findIndex((x) => x.id === c.id);
        if (i >= 0) this.userCams[i] = c; else this.userCams.push(c);
      });
      (data.removedIds || []).forEach((id) => this.removedIds.add(id));
      Object.assign(this.edits, data.edits || {});
      (data.favorites || []).forEach((id) => this.favorites.add(id));
      if (data.settings) Object.assign(this.settings, data.settings);
      this.persist(); this.emit();
    },

    /** Pull public webcams worldwide from the official Windy Webcams API. */
    async loadWindy(bbox) {
      const key = (this.settings.windyKey || "").trim();
      if (!key) throw new Error("Add a free Windy Webcams API key in Settings first.");
      const params = new URLSearchParams({
        limit: "50", lang: "en",
        include: "categories,images,location,urls,player"
      });
      if (bbox) params.set("nearby", bbox); // "lat,lng,radiusKm"
      const url = "https://api.windy.com/webcams/api/v3/webcams?" + params.toString();
      const res = await fetch(url, { headers: { "x-windy-api-key": key } });
      if (!res.ok) throw new Error("Windy API error " + res.status + " (check your key/quota).");
      const json = await res.json();
      const cams = (json.webcams || []).map((w) => ({
        id: "windy-" + w.webcamId,
        name: w.title || ("Webcam " + w.webcamId),
        category: mapWindyCat(w.categories),
        city: (w.location && w.location.city) || "",
        country: (w.location && w.location.country) || "",
        lat: w.location && w.location.latitude, lng: w.location && w.location.longitude,
        tags: (w.categories || []).map((c) => c.id),
        source: { type: "iframe", url: (w.player && (w.player.live || w.player.day)) || (w.urls && w.urls.provider) },
        thumb: w.images && w.images.current && w.images.current.preview,
        page: (w.urls && w.urls.detail) || (w.urls && w.urls.provider),
        _origin: "windy"
      })).filter((c) => c.lat != null && c.lng != null && c.source.url);
      // merge (replace previous windy batch by id)
      const map = new Map(this.windyCams.map((c) => [c.id, c]));
      cams.forEach((c) => map.set(c.id, c));
      this.windyCams = Array.from(map.values());
      this.emit();
      return cams.length;
    }
  };

  function mapWindyCat(cats) {
    const ids = (cats || []).map((c) => (c.id || "").toLowerCase());
    if (ids.some((i) => i.includes("beach") || i.includes("harbor") || i.includes("sea") || i.includes("lake"))) return "sea";
    if (ids.some((i) => i.includes("traffic") || i.includes("highway"))) return "road";
    if (ids.some((i) => i.includes("airport"))) return "airport";
    if (ids.some((i) => i.includes("mountain") || i.includes("landscape") || i.includes("park"))) return "nature";
    if (ids.some((i) => i.includes("city") || i.includes("square"))) return "street";
    return "street";
  }
  function hashStr(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

  window.Store = Store;
})();

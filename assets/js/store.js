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
    providerCams: [],                         // fetched from providers at runtime, not persisted
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
      const base = this._seed.concat(this.providerCams).concat(this.userCams);
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

    /** Countries present in the loaded set, with counts, most cameras first. */
    countryList() {
      const counts = {};
      this.all().forEach((c) => { if (c.country) counts[c.country] = (counts[c.country] || 0) + 1; });
      return Object.keys(counts).map((k) => ({ country: k, count: counts[k] }))
        .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
    },

    filter({ query = "", cats = null, favOnly = false, country = null } = {}) {
      const q = query.trim().toLowerCase();
      const catSet = cats && cats.size ? cats : null;
      return this.all().filter((c) => {
        if (favOnly && !this.favorites.has(c.id)) return false;
        if (catSet && !catSet.has(c.category)) return false;
        if (country && c.country !== country) return false;
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
      return this._mergeProvider(cams);
    },

    /** Load Transport for London public traffic cameras (JamCams) — no key needed. */
    async loadTfL() {
      const res = await fetch("https://api.tfl.gov.uk/Place/Type/JamCam");
      if (!res.ok) throw new Error("TfL API error " + res.status);
      const arr = await res.json();
      const cams = (Array.isArray(arr) ? arr : []).map((p) => {
        const props = {};
        (p.additionalProperties || []).forEach((a) => { props[a.key] = a.value; });
        const img = props.imageUrl || props.imageURL || props.image;
        const vid = props.videoUrl || props.video;
        if (!img && !vid) return null;
        return {
          id: "tfl-" + p.id, name: p.commonName || ("JamCam " + p.id),
          category: "road", city: "London", country: "UK",
          lat: p.lat, lng: p.lon, tags: ["tfl", "traffic", "london"],
          // live-refreshing snapshot for the wall; the mp4 clip plays in focus view
          source: img ? { type: "image", url: img } : { type: "video", url: vid },
          clip: vid || null, thumb: img,
          page: "https://tfl.gov.uk/traffic/status/", _origin: "tfl"
        };
      }).filter((c) => c && c.lat != null && c.lng != null);
      return this._mergeProvider(cams);
    },

    /** Load New York City DOT traffic cameras — no key needed.
     *  NYC's API sends no CORS header, so the camera list ships as a static file
     *  in this repo; the image URLs still point at NYC's live endpoint. */
    async loadNYC() {
      let list;
      try {
        const res = await fetch("./data/nyc-cameras.json");
        if (!res.ok) throw new Error("local list " + res.status);
        list = await res.json();
      } catch (_) {
        const res = await fetch("https://webcams.nyctmc.org/api/cameras/");
        if (!res.ok) throw new Error("NYC DOT API error " + res.status);
        const arr = await res.json();
        list = Array.isArray(arr) ? arr : (arr.cameras || arr.data || []);
      }
      const cams = list.map((c) => {
        if (String(c.isOnline) === "false") return null;
        const img = c.imageUrl || (c.id ? ("https://webcams.nyctmc.org/api/cameras/" + c.id + "/image") : null);
        if (!img || c.latitude == null) return null;
        return {
          id: "nyc-" + c.id, name: c.name || "NYC Camera",
          category: "road", city: c.area || "New York", country: "USA",
          lat: +c.latitude, lng: +c.longitude, tags: ["nyc", "traffic", (c.area || "").toLowerCase()].filter(Boolean),
          source: { type: "image", url: img }, thumb: img,
          page: "https://webcams.nyctmc.org/", _origin: "nyc"
        };
      }).filter(Boolean);
      return this._mergeProvider(cams);
    },

    /** Load the bundled worldwide camera dataset (built by tools/harvest.py).
     *  Shipping it as a static file avoids the CORS wall on most government APIs —
     *  only the image URLs are hit from the browser, and images never need CORS. */
    async loadBundle() {
      const res = await fetch("./data/cameras.json");
      if (!res.ok) throw new Error("camera dataset " + res.status);
      const data = await res.json();
      // v2 is a compact format: short keys and a shared page-URL table, which
      // keeps ~57k records small enough to ship and quick to parse on a phone.
      const pages = data.pages || [];
      const v2 = data.v === 2;
      const cams = (data.cameras || []).map((c) => {
        const id = v2 ? c.i : c.id;
        const url = v2 ? c.u : c.image;
        // most feeds are refreshing stills; some (Thailand, Indonesia) are HLS streams
        const isStream = (v2 ? c.k : c.kind) === "hls";
        return {
          id: id, name: v2 ? c.n : c.name,
          category: (v2 ? c.g : c.category) || "road",
          city: (v2 ? c.t : c.city) || "",
          country: (v2 ? c.c : c.country) || "",
          lat: v2 ? c.a : c.lat, lng: v2 ? c.o : c.lng,
          tags: v2 ? [] : (c.tags || []),
          source: { type: isStream ? "hls" : "image", url: url },
          clip: (v2 ? c.l : c.clip) || null,
          thumb: isStream ? null : url,
          page: v2 ? (c.p != null ? pages[c.p] : null) : (c.page || null),
          _origin: "bundle"
        };
      });
      this.countries = data.countries || {};
      return this._mergeProvider(cams);
    },

    /** Singapore LTA — image URLs carry a per-refresh UUID, so they must be
     *  fetched live rather than bundled. Sends CORS headers. */
    async loadSingapore() {
      const res = await fetch("https://api.data.gov.sg/v1/transport/traffic-images");
      if (!res.ok) throw new Error("Singapore API " + res.status);
      const d = await res.json();
      const list = ((d.items || [])[0] || {}).cameras || [];
      return this._mergeProvider(list.map((c) => {
        const loc = c.location || {};
        return {
          id: "sg-" + c.camera_id, name: "Singapore camera " + c.camera_id,
          category: "road", city: "Singapore", country: "Singapore",
          lat: loc.latitude, lng: loc.longitude, tags: ["singapore", "traffic"],
          source: { type: "image", url: c.image }, thumb: c.image,
          page: "https://data.gov.sg/", _origin: "live"
        };
      }).filter((c) => c.lat != null && c.source.url));
    },

    /** Estonia Transpordiamet — image paths embed a timestamp that changes on
     *  every update, so these are fetched live too. Sends CORS headers. */
    async loadEstonia() {
      const url = "https://tarktee.transpordiamet.ee/tarktee/rest/services/tram/road_cameras/" +
                  "MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Estonia API " + res.status);
      const d = await res.json();
      return this._mergeProvider((d.features || []).map((f) => {
        const a = f.attributes || {}, g = f.geometry || {};
        if (!a.image_path || g.y == null) return null;
        return {
          id: "ee-" + a.objectid, name: a.site_name || "Estonia camera",
          category: "road", city: a.site_name || "", country: "Estonia",
          lat: g.y, lng: g.x, tags: ["estonia", "traffic"],
          source: { type: "image", url: "https://tarktee.transpordiamet.ee/images/" + a.image_path },
          thumb: "https://tarktee.transpordiamet.ee/images/" + a.image_path,
          page: "https://tarktee.transpordiamet.ee/", _origin: "live"
        };
      }).filter(Boolean));
    },

    /** Load everything available on startup. Errors per-provider are non-fatal. */
    async autoBootstrap(onProgress) {
      let total = 0;
      // 1) the bundled worldwide dataset — the main source
      try { const n = await this.loadBundle(); total += n; if (onProgress) onProgress("worldwide", n, null); }
      catch (e) { if (onProgress) onProgress("worldwide", 0, e); }
      // 2) CORS-enabled sources fetched live: either for freshness, or because
      //    their image URLs expire and cannot be bundled at all.
      const live = [["London", () => this.loadTfL()], ["Singapore", () => this.loadSingapore()],
                    ["Estonia", () => this.loadEstonia()]];
      await Promise.all(live.map(async ([name, fn]) => {
        try { const n = await fn(); total += n; if (onProgress) onProgress(name, n, null); }
        catch (_) { /* non-fatal: bundled data still shows */ }
      }));
      return total;
    },

    _mergeProvider(cams) {
      const map = new Map(this.providerCams.map((c) => [c.id, c]));
      cams.forEach((c) => map.set(c.id, c));
      this.providerCams = Array.from(map.values());
      this.emit();
      return cams.length;
    },

    /** Recognize a pasted link from any common live platform. */
    detectSource(input) {
      const u = (input || "").trim();
      if (!u) return null;
      let m;
      if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i))) return { type: "youtube", id: m[1] };
      if ((m = u.match(/youtube\.com\/channel\/([\w-]+)/i))) return { type: "ytchannel", id: m[1] };
      if ((m = u.match(/(?:twitch\.tv|player\.twitch\.tv)\/videos\/(\d+)/i)) || (m = u.match(/[?&]video=(\d+)/i))) return { type: "twitchvideo", id: m[1] };
      if ((m = u.match(/(?:twitch\.tv\/|player\.twitch\.tv\/\?channel=)([A-Za-z0-9_]{3,})/i))) return { type: "twitch", id: m[1] };
      if ((m = u.match(/(?:kick\.com|player\.kick\.com)\/([A-Za-z0-9_-]{2,})/i))) return { type: "kick", id: m[1] };
      if ((m = u.match(/vimeo\.com\/(?:video\/|event\/)?(\d+)/i))) return { type: "vimeo", id: m[1] };
      if (/\.m3u8(\?|#|$)/i.test(u)) return { type: "hls", url: u };
      if (/\.mpd(\?|#|$)/i.test(u)) return { type: "dash", url: u };
      if (/\.mp4(\?|#|$)/i.test(u)) return { type: "video", url: u };
      if (/\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(u)) return { type: "image", url: u };
      if (/^https?:\/\//i.test(u)) return { type: "iframe", url: u };
      return null;
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

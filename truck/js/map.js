/* map.js — everything drawn on the map.
   Leaflet does the tiles and panning; this owns the route lines, the hazard and
   stop markers, and the vehicle arrow that follows the driver. */
(function (global) {
  "use strict";
  var G = global.TW.G, F = global.TW.F, H = global.TW.H;
  var POI = global.TW.POI;

  var BASEMAPS = {
    day: {
      label: "Day",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }
    },
    night: {
      label: "Night",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      options: {
        maxZoom: 20, subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    plain: {
      label: "Plain",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      options: {
        maxZoom: 20, subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    }
  };

  function TruckMap(elementId) {
    this.map = L.map(elementId, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      worldCopyJump: true
    }).setView([39.5, -98.35], 4);

    L.control.zoom({ position: "bottomright" }).addTo(this.map);

    this.basemapName = null;
    this.tileLayer = null;
    this.setBasemap(H.load("truckway.basemap", "day"));

    /* One pane per concern so the z-order stays predictable. */
    this.map.createPane("altRoutes").style.zIndex = 400;
    this.map.createPane("mainRoute").style.zIndex = 420;
    this.map.createPane("poi").style.zIndex = 600;
    this.map.createPane("hazards").style.zIndex = 640;
    this.map.createPane("vehicle").style.zIndex = 680;

    this.layers = {
      alt: L.layerGroup().addTo(this.map),
      route: L.layerGroup().addTo(this.map),
      stops: L.layerGroup().addTo(this.map),
      poi: L.layerGroup().addTo(this.map),
      hazards: L.layerGroup().addTo(this.map),
      vehicle: L.layerGroup().addTo(this.map)
    };

    this.follow = false;
    this.vehicleMarker = null;
    this.onRoutePick = null;
    this.onMapClick = null;

    var self = this;
    this.map.on("click", function (e) {
      if (self.onMapClick) self.onMapClick([e.latlng.lat, e.latlng.lng]);
    });
    /* Any manual pan drops follow mode — the driver is looking ahead. */
    this.map.on("dragstart", function () {
      if (self.follow) {
        self.follow = false;
        if (self.onFollowChange) self.onFollowChange(false);
      }
    });
  }

  TruckMap.prototype.setBasemap = function (name) {
    if (!BASEMAPS[name]) name = "day";
    if (this.basemapName === name) return;
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    var b = BASEMAPS[name];
    this.tileLayer = L.tileLayer(b.url, b.options).addTo(this.map);
    this.basemapName = name;
    H.save("truckway.basemap", name);
    document.body.setAttribute("data-basemap", name);
  };

  TruckMap.prototype.clearRoutes = function () {
    this.layers.alt.clearLayers();
    this.layers.route.clearLayers();
    this.layers.hazards.clearLayers();
  };

  /* Draw the chosen route bright, the rest muted and clickable. */
  TruckMap.prototype.drawRoutes = function (routes, selectedId) {
    var self = this;
    this.layers.alt.clearLayers();
    this.layers.route.clearLayers();

    routes.forEach(function (r) {
      if (r.id === selectedId) return;
      var line = L.polyline(r.line, {
        pane: "altRoutes", color: "#7d8590", weight: 5, opacity: 0.55,
        dashArray: r.truckAware ? null : "8 8"
      }).addTo(self.layers.alt);
      line.on("click", function (e) {
        L.DomEvent.stopPropagation(e);
        if (self.onRoutePick) self.onRoutePick(r.id);
      });
      line.bindTooltip(r.engineLabel + " · " + F.dist(r.distance, true), { sticky: true });
    });

    var sel = null;
    routes.forEach(function (r) { if (r.id === selectedId) sel = r; });
    if (!sel) return;

    var tone = "#2f81f7";
    if (sel.audit) {
      if (sel.audit.verdict === "blocked") tone = "#f85149";
      else if (sel.audit.verdict === "caution") tone = "#d29922";
      else if (sel.audit.verdict === "clear") tone = "#3fb950";
    }
    /* A dark casing under the line keeps it readable over any basemap. */
    L.polyline(sel.line, { pane: "mainRoute", color: "#04070d", weight: 12, opacity: 0.5 })
      .addTo(this.layers.route);
    L.polyline(sel.line, {
      pane: "mainRoute", color: tone, weight: 7, opacity: 0.95,
      dashArray: sel.truckAware ? null : "10 8", lineCap: "round", lineJoin: "round"
    }).addTo(this.layers.route);
  };

  function divIcon(html, className, size) {
    return L.divIcon({
      html: html, className: className,
      iconSize: [size || 30, size || 30],
      iconAnchor: [(size || 30) / 2, (size || 30) / 2]
    });
  }

  TruckMap.prototype.drawStops = function (stops) {
    var self = this;
    this.layers.stops.clearLayers();
    stops.forEach(function (s, i) {
      if (!s || !s.lat) return;
      var label = i === 0 ? "A" : (i === stops.length - 1 ? "B" : String(i));
      var cls = i === 0 ? "pin pin--start" : (i === stops.length - 1 ? "pin pin--end" : "pin pin--via");
      L.marker([s.lat, s.lon], {
        icon: divIcon('<span>' + label + '</span>', cls, 32),
        keyboard: false, title: s.name || ""
      }).addTo(self.layers.stops);
    });
  };

  TruckMap.prototype.drawHazards = function (flags, onPick) {
    var self = this;
    this.layers.hazards.clearLayers();
    (flags || []).forEach(function (f) {
      var critical = f.severity === "critical";
      var icon = divIcon(
        '<span>' + (critical ? "!" : "▲") + '</span>',
        "hazpin " + (critical ? "hazpin--critical" : "hazpin--tight"), 26
      );
      var m = L.marker([f.lat, f.lon], { pane: "hazards", icon: icon, title: f.text[0] })
        .addTo(self.layers.hazards);
      m.on("click", function (e) {
        L.DomEvent.stopPropagation(e);
        if (onPick) onPick(f);
      });
    });
  };

  TruckMap.prototype.drawPOIs = function (pois, onPick) {
    var self = this;
    this.layers.poi.clearLayers();
    (pois || []).forEach(function (p) {
      var cat = POI.BY_ID[p.cat];
      if (!cat) return;
      var m = L.marker([p.lat, p.lon], {
        pane: "poi",
        icon: divIcon('<span>' + cat.icon + '</span>', "poipin poipin--" + p.cat, 28),
        title: p.name
      }).addTo(self.layers.poi);
      m.on("click", function (e) {
        L.DomEvent.stopPropagation(e);
        if (onPick) onPick(p);
      });
      p._marker = m;
    });
  };

  TruckMap.prototype.focusPOI = function (poi) {
    this.map.setView([poi.lat, poi.lon], Math.max(this.map.getZoom(), 14), { animate: true });
  };

  TruckMap.prototype.setVehicle = function (latlon, heading) {
    if (!latlon) return;
    if (!this.vehicleMarker) {
      this.vehicleMarker = L.marker(latlon, {
        pane: "vehicle",
        icon: divIcon('<div class="truckdot__arrow"></div>', "truckdot", 40),
        interactive: false, keyboard: false
      }).addTo(this.layers.vehicle);
    } else {
      this.vehicleMarker.setLatLng(latlon);
    }
    var el = this.vehicleMarker.getElement();
    if (el) {
      var arrow = el.querySelector(".truckdot__arrow");
      if (arrow) arrow.style.transform = "rotate(" + (heading || 0) + "deg)";
    }
    if (this.follow) {
      this.map.setView(latlon, Math.max(this.map.getZoom(), 15), { animate: true, duration: 0.5 });
    }
  };

  TruckMap.prototype.setFollow = function (on) {
    this.follow = !!on;
    if (on && this.vehicleMarker) {
      this.map.setView(this.vehicleMarker.getLatLng(), Math.max(this.map.getZoom(), 15));
    }
    if (this.onFollowChange) this.onFollowChange(this.follow);
  };

  TruckMap.prototype.fit = function (line, padding) {
    if (!line || !line.length) return;
    var b = L.latLngBounds(line);
    this.map.fitBounds(b, { padding: padding || [50, 50], maxZoom: 15 });
  };

  TruckMap.prototype.fitAll = function (routes) {
    var pts = [];
    (routes || []).forEach(function (r) { pts = pts.concat(r.line); });
    this.fit(pts);
  };

  TruckMap.prototype.invalidate = function () {
    var self = this;
    setTimeout(function () { self.map.invalidateSize(); }, 60);
  };

  global.TW.TruckMap = TruckMap;
  global.TW.BASEMAPS = BASEMAPS;
})(window);

/* app.js — the controller.
   Owns the state, drives the flow from "where to?" through routing, the
   restriction audit and the fuel search, and hands navigation over to nav.js. */
(function (global) {
  "use strict";
  var H = global.TW.H, F = global.TW.F, G = global.TW.G, U = global.TW.U;
  var Profile = global.TW.Profile, Services = global.TW.Services;
  var Restrict = global.TW.Restrict, POI = global.TW.POI, Fuel = global.TW.Fuel;
  var UI = global.TW.UI, $ = UI.$;

  var SETTINGS_KEY = "truckway.settings.v1";

  var state = {
    from: null,            // {name, lat, lon}
    to: null,
    via: [],
    routes: [],
    selectedId: null,
    userPicked: false,
    routing: false,
    routingNote: "",
    error: "",
    auditProgress: 0,
    pois: [],
    stations: [],
    stationsTotal: 0,
    regions: [],
    poiLoading: false,
    around: {},
    tab: "route",
    showSteps: false,
    stopCats: ["truck_stop", "truck_parking", "rest_area", "weigh"],
    fuelSort: "price",
    truckFuelOnly: true,
    maxDetour: 5000,
    myPosition: null,
    selected: function () {
      for (var i = 0; i < this.routes.length; i++) {
        if (this.routes[i].id === this.selectedId) return this.routes[i];
      }
      return null;
    }
  };

  var map, nav, suggestResults = [], suggestTarget = null;

  function settings() { return H.load(SETTINGS_KEY, { maxDetour: 5000 }) || {}; }
  function saveSettings(s) { H.save(SETTINGS_KEY, s); }

  /* ---------- boot ---------- */

  function init() {
    var s = settings();
    state.maxDetour = s.maxDetour || 5000;

    map = new global.TW.TruckMap("map");
    map.onMapClick = onMapClick;
    map.onRoutePick = function (id) { pickRoute(id, true); };
    map.onFollowChange = function (on) { $("btnFollow").classList.toggle("on", on); };

    nav = new global.TW.Navigator();
    nav.on("update", onNavUpdate);
    nav.on("offroute", onOffRoute);
    nav.on("arrive", function () { UI.toast("You have arrived.", "ok", 6000); });
    nav.on("gpserror", function (e) {
      UI.toast(e && e.message ? e.message : "No GPS fix.", "bad");
    });

    Fuel.load();
    wire();
    updateTruckChip();
    locateSilently();
    registerServiceWorker();
  }

  function wire() {
    $("btnGo").onclick = planRoute;
    $("btnSwap").onclick = swapEnds;
    $("btnUseGps").onclick = function () { locate(true); };
    $("btnMenu").onclick = openSettings;
    $("truckChip").onclick = openTruckEditor;
    $("btnLocate").onclick = function () { locate(true); };
    $("btnFit").onclick = fitToRoutes;
    $("btnBasemap").onclick = cycleBasemap;
    $("btnExitNav").onclick = stopNavigation;
    $("btnFollow").onclick = function () { map.setFollow(!map.follow); };

    $("sheetGrab").onclick = function () {
      var sheet = $("sheet");
      sheet.setAttribute("data-state", sheet.getAttribute("data-state") === "full" ? "peek" : "full");
      map.invalidate();
    };

    $("tabs").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (!t) return;
      state.tab = t.getAttribute("data-tab");
      Array.prototype.forEach.call($("tabs").children, function (c) {
        c.classList.toggle("on", c === t);
      });
      $("sheet").setAttribute("data-state", "full");
      render();
      map.invalidate();
    });

    $("sheetBody").addEventListener("click", onSheetClick);

    bindSearch($("fromInput"), "from");
    bindSearch($("toInput"), "to");

    $("suggest").addEventListener("click", function (e) {
      var item = e.target.closest("[data-i]");
      if (!item) return;
      var pick = suggestResults[parseInt(item.getAttribute("data-i"), 10)];
      if (!pick) return;
      setEnd(suggestTarget, pick);
      UI.renderSuggest([]);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { UI.closeModal(); UI.renderSuggest([]); }
    });
  }

  function fitToRoutes() {
    var r = state.selected();
    if (r) map.fit(r.line);
    else if (state.routes.length) map.fitAll(state.routes);
    else if (state.myPosition) map.map.setView(state.myPosition, 13);
  }

  /* Day for daylight, night for the dark, plain when the driver wants the map
     to get out of the way. */
  function cycleBasemap() {
    var order = ["day", "night", "plain"];
    var i = order.indexOf(map.basemapName);
    var next = order[(i + 1) % order.length];
    map.setBasemap(next);
    UI.toast(global.TW.BASEMAPS[next].label + " map", "", 1400);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register("./sw.js").catch(function () { /* offline shell is optional */ });
  }

  /* ---------- search fields ---------- */

  function bindSearch(input, which) {
    var run = H.debounce(function () {
      var q = input.value.trim();
      suggestTarget = which;
      if (q.length < 2) { UI.renderSuggest([]); return; }
      Services.geocode(q, state.myPosition).then(function (results) {
        if (suggestTarget !== which) return;
        suggestResults = results;
        UI.renderSuggest(results);
      });
    }, 320);

    input.addEventListener("input", run);
    input.addEventListener("focus", function () { suggestTarget = which; });
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (suggestResults.length && suggestTarget === which) {
        setEnd(which, suggestResults[0]);
        UI.renderSuggest([]);
      } else {
        planRoute();
      }
    });
  }

  function setEnd(which, place) {
    var entry = { name: place.name, detail: place.detail, lat: place.lat, lon: place.lon };
    if (which === "from") {
      state.from = entry;
      $("fromInput").value = place.name;
    } else {
      state.to = entry;
      $("toInput").value = place.name;
    }
    drawStops();
    if (state.from && state.to) planRoute();
  }

  function swapEnds() {
    var a = state.from, b = state.to;
    state.from = b; state.to = a;
    $("fromInput").value = b ? b.name : "";
    $("toInput").value = a ? a.name : "";
    drawStops();
    if (state.from && state.to) planRoute();
  }

  function drawStops() {
    var pts = [];
    if (state.from) pts.push(state.from);
    state.via.forEach(function (v) { pts.push(v); });
    if (state.to) pts.push(state.to);
    map.drawStops(pts);
  }

  /* ---------- location ---------- */

  function locateSilently() { locate(false); }

  function locate(announce) {
    if (!navigator.geolocation) {
      if (announce) UI.toast("This device has no location service.", "bad");
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var here = [pos.coords.latitude, pos.coords.longitude];
      state.myPosition = here;
      map.setVehicle(here, pos.coords.heading || 0);
      if (announce) {
        map.map.setView(here, Math.max(map.map.getZoom(), 13));
        if (!state.from) {
          state.from = { name: "My location", lat: here[0], lon: here[1] };
          $("fromInput").value = "My location";
          drawStops();
        }
      } else if (!state.from) {
        state.from = { name: "My location", lat: here[0], lon: here[1] };
        if (!map.vehicleMarker) map.map.setView(here, 12);
      }
    }, function (err) {
      if (announce) {
        UI.toast(err.code === 1 ? "Location permission denied." : "Could not get a fix.", "bad");
      }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  function onMapClick(latlon) {
    if (document.body.getAttribute("data-mode") === "nav") return;
    Services.reverse(latlon[0], latlon[1]).then(function (place) {
      var entry = place || {
        name: latlon[0].toFixed(4) + ", " + latlon[1].toFixed(4),
        lat: latlon[0], lon: latlon[1]
      };
      entry.lat = latlon[0]; entry.lon = latlon[1];
      setEnd(state.from ? "to" : "from", entry);
    });
  }

  /* ---------- routing ---------- */

  function planRoute() {
    if (!state.from || !state.to) {
      UI.toast("Set a start and a destination first.", "bad");
      return;
    }
    var points = [[state.from.lat, state.from.lon]];
    state.via.forEach(function (v) { points.push([v.lat, v.lon]); });
    points.push([state.to.lat, state.to.lon]);

    var p = Profile.get();
    state.routing = true;
    state.error = "";
    state.routes = [];
    state.selectedId = null;
    state.userPicked = false;
    state.pois = [];
    state.stations = [];
    state.routingNote = "Asking every routing engine that knows about trucks…";
    map.clearRoutes();
    render();
    $("sheet").setAttribute("data-state", "full");

    Services.routeAll(points, p, { alternates: 2 }).then(function (res) {
      state.routing = false;
      state.routes = res.routes;
      state.selectedId = res.routes[0].id;
      if (res.errors.length) {
        var truckEngines = res.engines.filter(function (e) { return e !== "osrm"; });
        if (!truckEngines.length) {
          UI.toast("No truck-aware router answered — showing a car route, checked for restrictions.", "bad", 7000);
        }
      }
      render();
      map.drawRoutes(state.routes, state.selectedId);
      map.fitAll(state.routes);
      return auditAll();
    }).catch(function (err) {
      state.routing = false;
      state.error = err && err.message ? err.message : "Routing failed.";
      render();
      UI.toast(state.error, "bad", 6000);
    });
  }

  /* Screen every candidate, re-ranking as each result lands so the best route
     floats to the top while the rest are still being checked. */
  function auditAll() {
    var p = Profile.get();
    var routes = state.routes.slice(0, 4);
    var i = 0;

    function next() {
      if (i >= routes.length) return Promise.resolve();
      var r = routes[i++];
      return Restrict.audit(r, p, { level: "screen" }).then(function () {
        state.routes = Restrict.rank(state.routes, p);
        if (!state.userPicked) state.selectedId = state.routes[0].id;
        render();
        map.drawRoutes(state.routes, state.selectedId);
        /* Show what we already know rather than making the driver wait for the
           thorough pass — the screen audit's flags are real flags. */
        var sel = state.selected();
        if (sel && sel.audit) map.drawHazards(sel.audit.flags, showFlag);
        updateWarnBadge();
        return next();
      });
    }

    return next().then(function () {
      var best = state.selected();
      if (!best) return;
      /* Now a thorough pass on the one we are actually going to drive. */
      state.auditProgress = 0;
      return Restrict.audit(best, p, {
        level: "full",
        onProgress: function (done, total) {
          state.auditProgress = done / total;
          if (state.tab === "warnings") render();
        }
      }).then(function (audit) {
        render();
        map.drawRoutes(state.routes, state.selectedId);
        map.drawHazards(audit.flags, showFlag);
        updateWarnBadge();
        if (audit.critical) {
          UI.toast(audit.critical + " restriction" + (audit.critical > 1 ? "s" : "") +
                   " your truck cannot pass — see Warnings.", "bad", 7000);
        }
        return loadPOIs();
      });
    });
  }

  function pickRoute(id, byUser) {
    if (state.selectedId === id) return;
    state.selectedId = id;
    if (byUser) state.userPicked = true;
    var r = state.selected();
    render();
    map.drawRoutes(state.routes, id);
    if (r && r.audit) map.drawHazards(r.audit.flags, showFlag);
    updateWarnBadge();

    /* A route promoted by hand still deserves the thorough check. */
    if (r && (!r.audit || r.audit.level !== "full")) {
      Restrict.audit(r, Profile.get(), { level: "full" }).then(function (audit) {
        render();
        map.drawHazards(audit.flags, showFlag);
        updateWarnBadge();
      });
    }
    loadPOIs();
  }

  function updateWarnBadge() {
    var r = state.selected();
    var badge = $("badgeWarn");
    if (!r || !r.audit || (!r.audit.critical && !r.audit.tight)) {
      badge.hidden = true;
      return;
    }
    var n = r.audit.critical || r.audit.tight;
    badge.textContent = n;
    badge.setAttribute("data-tone", r.audit.critical ? "critical" : "caution");
    badge.hidden = false;
  }

  /* ---------- stops and fuel ---------- */

  function loadPOIs() {
    var route = state.selected();
    if (!route) return Promise.resolve();
    state.poiLoading = true;
    render();

    return POI.alongRoute(route, { maxDetour: state.maxDetour }).then(function (res) {
      state.pois = res.pois;
      map.drawPOIs(res.pois, showPOI);
      state.poiLoading = false;
      render();
      return Fuel.load().then(function () { return Fuel.regionsForRoute(route); });
    }).then(function (regions) {
      state.regions = regions || [];
      recomputeStations();
      render();
    }).catch(function () {
      state.poiLoading = false;
      render();
    });
  }

  /* Recomputed whenever the truck-only filter, a reported price or the profile
     changes — everything downstream reads state.stations. */
  function recomputeStations() {
    var p = Profile.get();
    state.stationsTotal = Fuel.priceStations(state.pois, state.regions, p, { truckOnly: false }).length;
    state.stations = Fuel.priceStations(state.pois, state.regions, p, { truckOnly: state.truckFuelOnly });
  }

  function showPOI(poi) {
    map.focusPOI(poi);
    loadAround(poi);
    state.tab = poi.cat === "fuel" || poi.cat === "truck_stop" ? "fuel" : "stops";
    Array.prototype.forEach.call($("tabs").children, function (c) {
      c.classList.toggle("on", c.getAttribute("data-tab") === state.tab);
    });
    render();
  }

  function loadAround(poi) {
    if (state.around[poi.id]) return;
    state.around[poi.id] = "loading";
    render();
    POI.around(poi.lat, poi.lon, 500).then(function (list) {
      state.around[poi.id] = list;
      render();
    });
  }

  function showFlag(flag) {
    map.map.setView([flag.lat, flag.lon], 16);
    UI.toast(flag.text[0], flag.severity === "critical" ? "bad" : "", 6000);
  }

  /* ---------- sheet interactions ---------- */

  function onSheetClick(e) {
    var catBtn = e.target.closest("[data-cat]");
    if (catBtn) {
      var cat = catBtn.getAttribute("data-cat");
      var idx = state.stopCats.indexOf(cat);
      if (idx >= 0) state.stopCats.splice(idx, 1); else state.stopCats.push(cat);
      render();
      return;
    }

    var btn = e.target.closest("[data-act]");
    var card = e.target.closest("[data-route], [data-poi], [data-flag]");

    if (btn) {
      var act = btn.getAttribute("data-act");
      if (act === "start") { startNavigation(); return; }
      if (act === "steps") { state.showSteps = !state.showSteps; render(); return; }
      if (act === "truckonly") {
        state.truckFuelOnly = !state.truckFuelOnly;
        recomputeStations();
        render();
        return;
      }
      if (act === "sortfuel") {
        state.fuelSort = state.fuelSort === "price" ? "along" : "price";
        render();
        return;
      }
      if (act === "recheck") {
        var again = state.selected();
        if (again) {
          again.audit = null;
          render();
          Restrict.audit(again, Profile.get(), { level: "full" }).then(function (audit) {
            render();
            map.drawHazards(audit.flags, showFlag);
            updateWarnBadge();
          });
        }
        return;
      }
      if (act === "widen") {
        state.maxDetour = Math.min(20000, state.maxDetour * 2);
        var s = settings(); s.maxDetour = state.maxDetour; saveSettings(s);
        loadPOIs();
        return;
      }
      if (card && card.hasAttribute("data-poi")) {
        var poi = findPOI(card.getAttribute("data-poi"));
        if (!poi) return;
        if (act === "around") { loadAround(poi); return; }
        if (act === "show") { map.focusPOI(poi); return; }
        if (act === "via") { addVia(poi); return; }
        if (act === "report") { openPriceReport(poi); return; }
      }
      if (card && card.hasAttribute("data-flag") && act === "showflag") {
        var route = state.selected();
        if (!route || !route.audit) return;
        var id = card.getAttribute("data-flag");
        route.audit.flags.forEach(function (f) { if (f.id === id) showFlag(f); });
        return;
      }
      return;
    }

    if (card && card.hasAttribute("data-route")) {
      pickRoute(card.getAttribute("data-route"), true);
    }
  }

  function findPOI(id) {
    for (var i = 0; i < state.pois.length; i++) if (state.pois[i].id === id) return state.pois[i];
    return null;
  }

  function addVia(poi) {
    state.via.push({ name: poi.name, lat: poi.lat, lon: poi.lon });
    drawStops();
    UI.toast("Added " + poi.name + " as a stop.", "ok");
    planRoute();
  }

  /* ---------- price reporting ---------- */

  function openPriceReport(poi) {
    var p = Profile.get();
    var region = Fuel.regionAt(poi.along || 0, state.regions);
    var unit = region.display;
    var current = null;
    state.stations.forEach(function (s) { if (s.poi.id === poi.id) current = s; });

    UI.openModal("Price at " + poi.name,
      '<div class="field"><label>Diesel price per ' + unit + " (" + region.currency + ")</label>" +
      '<input type="number" id="rPrice" step="0.001" min="0" inputmode="decimal" value="' +
      (current ? Fuel.displayPrice(current.price).toFixed(3) : "") + '"></div>' +
      '<p class="tiny muted">Saved on this device and used instead of the estimate for this station. ' +
      "It travels with your backup in Settings.</p>" +
      '<div class="btnrow"><button class="btn btn--primary" data-act="save">Save price</button>' +
      '<button class="btn" data-act="clear">Remove</button></div>',
      function (root) {
        root.querySelector('[data-act="save"]').onclick = function () {
          var v = parseFloat(root.querySelector("#rPrice").value);
          if (!isFinite(v) || v <= 0) { UI.toast("Enter a price.", "bad"); return; }
          Fuel.report(poi.id, v, unit, region.currency);
          recomputeStations();
          UI.closeModal();
          render();
          UI.toast("Price saved.", "ok");
        };
        root.querySelector('[data-act="clear"]').onclick = function () {
          Fuel.clearReport(poi.id);
          recomputeStations();
          UI.closeModal();
          render();
        };
      });
  }

  /* ---------- truck editor ---------- */

  function openTruckEditor() {
    UI.openModal("Your truck", UI.truckModalHTML(), function (root) {
      root.querySelectorAll("[data-preset]").forEach(function (b) {
        b.onclick = function () {
          Profile.applyPreset(b.getAttribute("data-preset"));
          UI.closeModal();
          openTruckEditor();
          updateTruckChip();
        };
      });
      var lvl = root.querySelector("#fFuelLevel");
      if (lvl) {
        lvl.oninput = function () {
          root.querySelector("#fuelLevelOut").textContent = lvl.value + "%";
        };
      }
      /* Switching units re-renders in the new ones, keeping the values. */
      root.querySelector("#fImperial").onchange = function () {
        applyTruckForm(root, true);
        UI.closeModal();
        openTruckEditor();
      };
      root.querySelector('[data-act="savetruck"]').onclick = function () {
        applyTruckForm(root, false);
        UI.closeModal();
        updateTruckChip();
        UI.toast("Truck saved. Re-checking the route.", "ok");
        if (state.routes.length) planRoute();
      };
      root.querySelector('[data-act="resettruck"]').onclick = function () {
        Profile.reset();
        UI.closeModal();
        updateTruckChip();
        openTruckEditor();
      };
    });
  }

  function applyTruckForm(root, unitsOnly) {
    var read = UI.readTruckForm(root);
    Profile.set(read.patch);
    if (read.economy !== null && read.economy !== "") {
      /* economyDisplay is unit-dependent, so convert against the units the form
         was rendered in, not the ones just selected. */
      var p = Profile.get();
      var was = p.imperial;
      Profile.set({ imperial: read.wasImperial });
      Profile.setEconomyDisplay(read.economy);
      Profile.set({ imperial: was });
    }
    if (!unitsOnly) updateTruckChip();
  }

  function updateTruckChip() {
    var p = Profile.get();
    $("truckChipText").textContent = Profile.summary(p);
    var et = $("emptyTruck");
    if (et) et.textContent = Profile.summary(p);
  }

  /* ---------- settings ---------- */

  function openSettings() {
    var s = settings();
    UI.openModal("Settings", UI.settingsHTML(s), function (root) {
      var keyInput = root.querySelector("#sOrsKey");
      var detour = root.querySelector("#sDetour");
      keyInput.onchange = function () {
        s.orsKey = keyInput.value.trim();
        saveSettings(s);
        UI.toast(s.orsKey ? "Key saved — OpenRouteService will be compared too." : "Key removed.", "ok");
      };
      detour.onchange = function () {
        s.maxDetour = parseInt(detour.value, 10);
        state.maxDetour = s.maxDetour;
        saveSettings(s);
        if (state.selected()) loadPOIs();
      };

      var regionSel = root.querySelector("#sRegion");
      var priceInput = root.querySelector("#sRegionPrice");
      var hint = root.querySelector("#sRegionHint");
      if (regionSel) {
        var b = Fuel.baselines();
        var syncRegion = function () {
          var r = b.regions[regionSel.value];
          if (!r) return;
          var shown = r.display === "gal" ? r.perLitre * U.L_PER_GAL : r.perLitre;
          priceInput.value = shown.toFixed(3);
          hint.textContent = r.currency + " per " + r.display + " — " + r.label;
        };
        regionSel.onchange = syncRegion;
        syncRegion();
        root.querySelector('[data-act="savebaseline"]').onclick = function () {
          var r = b.regions[regionSel.value];
          var v = parseFloat(priceInput.value);
          if (!r || !isFinite(v) || v <= 0) { UI.toast("Enter a price.", "bad"); return; }
          r.perLitre = r.display === "gal" ? v / U.L_PER_GAL : v;
          Fuel.saveBaselines(b);
          if (state.pois.length) {
            recomputeStations();
            render();
          }
          UI.toast("Reference price updated.", "ok");
        };
      }

      root.querySelector('[data-act="export"]').onclick = exportBackup;
      root.querySelector('[data-act="import"]').onclick = importBackup;
      root.querySelector('[data-act="wipe"]').onclick = function () {
        H.remove("truckway.fuelReports.v1");
        UI.closeModal();
        UI.toast("Saved prices cleared.", "ok");
      };
    });
  }

  function exportBackup() {
    var data = {
      app: "truckway", version: 1, at: new Date().toISOString(),
      profile: Profile.get(),
      settings: settings(),
      fuelReports: Fuel.reports(),
      baselines: H.load("truckway.fuelBaselines.v1", null)
    };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "truckway-backup.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function importBackup() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var d = JSON.parse(reader.result);
          if (d.profile) Profile.set(d.profile);
          if (d.settings) saveSettings(d.settings);
          if (d.fuelReports) H.save("truckway.fuelReports.v1", d.fuelReports);
          if (d.baselines) Fuel.saveBaselines(d.baselines);
          UI.closeModal();
          updateTruckChip();
          UI.toast("Backup restored.", "ok");
        } catch (e) {
          UI.toast("That file could not be read.", "bad");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ---------- navigation ---------- */

  function startNavigation() {
    var route = state.selected();
    if (!route) return;
    var p = Profile.get();

    if (route.audit && route.audit.critical) {
      UI.openModal("This route has conflicts",
        '<div class="card card--bad"><b>' + route.audit.critical +
        " restriction" + (route.audit.critical > 1 ? "s" : "") +
        " on this route your truck cannot pass.</b>" +
        '<p class="tiny muted" style="margin:8px 0 0">Check the Warnings tab. ' +
        "Starting anyway is your call — the alerts will still call each one out as you approach.</p></div>" +
        '<div class="btnrow"><button class="btn" data-act="warnings">See warnings</button>' +
        '<button class="btn btn--danger" data-act="anyway">Start anyway</button></div>',
        function (root) {
          root.querySelector('[data-act="warnings"]').onclick = function () {
            UI.closeModal();
            state.tab = "warnings";
            Array.prototype.forEach.call($("tabs").children, function (c) {
              c.classList.toggle("on", c.getAttribute("data-tab") === "warnings");
            });
            render();
          };
          root.querySelector('[data-act="anyway"]').onclick = function () {
            UI.closeModal();
            beginNav(route, p);
          };
        });
      return;
    }
    beginNav(route, p);
  }

  function beginNav(route, p) {
    document.body.setAttribute("data-mode", "nav");
    $("navBanner").hidden = false;
    $("navBar").hidden = false;
    map.setFollow(true);
    map.invalidate();
    nav.start(route, p);
  }

  function stopNavigation() {
    nav.stop();
    document.body.setAttribute("data-mode", "plan");
    $("navBanner").hidden = true;
    $("navBar").hidden = true;
    $("alertStrip").hidden = true;
    map.setFollow(false);
    map.invalidate();
  }

  function onNavUpdate(s) {
    var p = Profile.get();
    var icons = global.TW.MANEUVER_ICON;

    if (s.snapped) map.setVehicle(s.snapped, s.heading || 0);

    $("navArrow").textContent = s.next ? (icons[s.next.type] || "↑") : "◉";
    $("navDist").textContent = s.toManeuver === null ? "—" : F.near(s.toManeuver, p.imperial);
    $("navRoad").textContent = s.next ? s.next.text : "Continue to your destination";

    var then = $("navThen");
    if (s.after) {
      then.hidden = false;
      then.innerHTML = '<span style="font-size:17px">' + (icons[s.after.type] || "↑") +
                       "</span><span>then " + H.escape(s.after.text) + "</span>";
    } else {
      then.hidden = true;
    }

    $("navEta").textContent = F.eta(s.eta);
    $("navRemain").textContent = F.dist(s.remaining, p.imperial);
    $("navTime").textContent = F.clock(s.eta);
    $("navSpeed").textContent = F.speed(s.speed, p.imperial);

    renderAlert(s, p);
  }

  /* The strip that shows the next restriction while there is still room to
     do something about it. */
  function renderAlert(s, p) {
    var strip = $("alertStrip");
    var next = null;
    for (var i = 0; i < s.hazards.length; i++) {
      var h = s.hazards[i];
      var window = h.flag.severity === "critical" ? 10000 : 2500;
      if (h.distance <= window) { next = h; break; }
    }
    if (s.offRoute) {
      strip.hidden = false;
      strip.setAttribute("data-tone", "info");
      strip.innerHTML = '<span class="spinner"></span> Off route — recalculating…';
      return;
    }
    if (!next) { strip.hidden = true; return; }
    strip.hidden = false;
    strip.setAttribute("data-tone", next.flag.severity);
    strip.innerHTML = "<span>" + (next.flag.severity === "critical" ? "⛔" : "⚠️") + "</span>" +
                      "<span>" + F.near(next.distance, p.imperial) + " — " +
                      H.escape(next.flag.text[0]) + "</span>";
  }

  var rerouting = false;
  function onOffRoute(info) {
    if (rerouting || !state.to) return;
    rerouting = true;
    var p = Profile.get();
    var points = [info.position, [state.to.lat, state.to.lon]];

    Services.routeAll(points, p, { alternates: 0 }).then(function (res) {
      var fresh = Restrict.rank(res.routes, p)[0];
      state.routes = res.routes;
      state.selectedId = fresh.id;
      nav.swapRoute(fresh);
      map.drawRoutes(state.routes, fresh.id);
      render();
      /* Check the new road as thoroughly as the old one. */
      return Restrict.audit(fresh, p, { level: "full" }).then(function (audit) {
        map.drawHazards(audit.flags, showFlag);
        updateWarnBadge();
        render();
      });
    }).catch(function () {
      UI.toast("Could not recalculate — following the original route.", "bad");
    }).then(function () {
      rerouting = false;
    });
  }

  /* ---------- render ---------- */

  function render() {
    var body = $("sheetBody");
    var html;
    if (state.tab === "route") html = UI.renderRoutes(state);
    else if (state.tab === "warnings") html = UI.renderWarnings(state);
    else if (state.tab === "fuel") html = UI.renderFuel(state);
    else html = UI.renderStops(state);

    if (html === null) return;   // keep the welcome panel until there is something to show
    body.innerHTML = html;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.TW.app = { state: state, planRoute: planRoute, render: render };
})(window);

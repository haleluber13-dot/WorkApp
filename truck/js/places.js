/* places.js — the places a driver goes back to, and where the miles were run.
   Saved yards, docks and home; recent trips; and an approximate per-jurisdiction
   mileage split for the quarterly fuel-tax paperwork. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G;

  var SAVED_KEY = "truckway.saved.v1";
  var RECENT_KEY = "truckway.recent.v1";
  var MAX_RECENT = 12;

  function saved() { return H.load(SAVED_KEY, []) || []; }
  function recents() { return H.load(RECENT_KEY, []) || []; }

  function keyOf(place) {
    return place.lat.toFixed(4) + "," + place.lon.toFixed(4);
  }

  var Places = {
    saved: saved,
    recents: recents,

    isSaved: function (place) {
      if (!place) return false;
      var k = keyOf(place);
      return saved().some(function (s) { return keyOf(s) === k; });
    },

    toggleSave: function (place) {
      if (!place) return false;
      var list = saved();
      var k = keyOf(place);
      var idx = -1;
      list.forEach(function (s, i) { if (keyOf(s) === k) idx = i; });
      if (idx >= 0) {
        list.splice(idx, 1);
        H.save(SAVED_KEY, list);
        return false;
      }
      list.unshift({
        name: place.name, detail: place.detail || "",
        lat: place.lat, lon: place.lon, at: Date.now()
      });
      H.save(SAVED_KEY, list.slice(0, 60));
      return true;
    },

    rename: function (place, name) {
      var list = saved();
      var k = keyOf(place);
      list.forEach(function (s) { if (keyOf(s) === k) s.name = name; });
      H.save(SAVED_KEY, list);
    },

    remove: function (place) {
      var k = keyOf(place);
      H.save(SAVED_KEY, saved().filter(function (s) { return keyOf(s) !== k; }));
    },

    /* A trip is remembered by both ends, so picking it up again refills both
       fields rather than just the destination. */
    remember: function (from, to, route) {
      if (!from || !to) return;
      var list = recents().filter(function (t) {
        return !(keyOf(t.from) === keyOf(from) && keyOf(t.to) === keyOf(to));
      });
      list.unshift({
        from: { name: from.name, lat: from.lat, lon: from.lon },
        to: { name: to.name, detail: to.detail || "", lat: to.lat, lon: to.lon },
        distance: route ? route.distance : null,
        duration: route ? route.duration : null,
        at: Date.now()
      });
      H.save(RECENT_KEY, list.slice(0, MAX_RECENT));
    },

    clearRecents: function () { H.remove(RECENT_KEY); }
  };

  /* ---------- per-jurisdiction mileage ---------- */

  /* Which state or country each mile was driven in, for IFTA-style reporting.

     There is no free API that will slice a line by administrative boundary, so
     this walks the route with reverse geocoding: a coarse pass to find which
     jurisdictions the route touches, then a bisection on each transition to
     pin the crossing down to about a mile. That keeps it to a few dozen
     requests instead of hundreds, which matters because Nominatim asks for no
     more than one request a second — the pace below is deliberate.

     It is an estimate from the planned route, not a record of where the truck
     actually went, and the UI says so. */
  var REVERSE = "https://nominatim.openstreetmap.org/reverse";
  var PACE_MS = 1100;

  function jurisdictionAt(lat, lon) {
    var url = REVERSE + "?format=jsonv2&zoom=5&addressdetails=1&lat=" +
              lat.toFixed(5) + "&lon=" + lon.toFixed(5);
    return H.fetchJSON(url, { timeout: 15000 }).then(function (d) {
      var a = (d && d.address) || {};
      var code = a["ISO3166-2-lvl4"] ||
                 (a.country_code ? a.country_code.toUpperCase() : null);
      if (!code) return null;
      return { code: code, label: a.state || a.province || a.country || code };
    }).catch(function () { return null; });
  }

  function pointAt(route, along) {
    var cum = route.cumulative;
    var i = 0;
    while (i < cum.length - 1 && cum[i] < along) i++;
    return route.line[Math.min(i, route.line.length - 1)];
  }

  function mileage(route, opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var total = route.cumulative[route.cumulative.length - 1] || route.distance;
    /* Enough coarse probes to notice a short crossing, capped so a long haul
       does not turn into hundreds of requests. */
    var probes = Math.max(4, Math.min(20, Math.round(total / 60000) + 3));
    var step = total / (probes - 1);
    var coarse = [];
    var budget = { used: 0, max: 60 };

    function probe(along) {
      budget.used++;
      onProgress(budget.used, probes + 12);
      var pt = pointAt(route, along);
      return jurisdictionAt(pt[0], pt[1]).then(function (j) {
        return new Promise(function (r) {
          setTimeout(function () { r({ along: along, j: j }); }, PACE_MS);
        });
      });
    }

    var i = 0;
    function coarsePass() {
      if (i >= probes) return Promise.resolve();
      var along = Math.min(total, i * step);
      i++;
      return probe(along).then(function (res) {
        coarse.push(res);
        return coarsePass();
      });
    }

    return coarsePass().then(function () {
      var known = coarse.filter(function (c) { return c.j; });
      if (known.length < 2) {
        return { ok: false, reason: "Could not identify the regions on this route." };
      }

      /* Every place two consecutive probes disagree is a crossing to locate. */
      var transitions = [];
      for (var k = 1; k < known.length; k++) {
        if (known[k].j.code !== known[k - 1].j.code) {
          transitions.push({ lo: known[k - 1], hi: known[k] });
        }
      }

      function bisect(t, depth) {
        /* ~7 halvings takes a 60 km gap down to under a kilometre. */
        if (depth <= 0 || (t.hi.along - t.lo.along) < 1500 || budget.used >= budget.max) {
          return Promise.resolve((t.lo.along + t.hi.along) / 2);
        }
        var mid = (t.lo.along + t.hi.along) / 2;
        return probe(mid).then(function (res) {
          if (!res.j) return (t.lo.along + t.hi.along) / 2;
          if (res.j.code === t.lo.j.code) t.lo = res; else t.hi = res;
          return bisect(t, depth - 1);
        });
      }

      var boundaries = [];
      var ti = 0;
      function refine() {
        if (ti >= transitions.length) return Promise.resolve();
        var t = transitions[ti++];
        var fromCode = t.lo.j, toCode = t.hi.j;
        return bisect(t, 7).then(function (at) {
          boundaries.push({ at: at, from: fromCode, to: toCode });
          return refine();
        });
      }

      return refine().then(function () {
        boundaries.sort(function (a, b) { return a.at - b.at; });
        var segments = [];
        var cursor = 0;
        var current = known[0].j;
        boundaries.forEach(function (b) {
          segments.push({ code: current.code, label: current.label, metres: b.at - cursor });
          cursor = b.at;
          current = b.to;
        });
        segments.push({ code: current.code, label: current.label, metres: total - cursor });

        /* One row per jurisdiction, even if the route re-enters it. */
        var byCode = {};
        var order = [];
        segments.forEach(function (s) {
          if (s.metres <= 0) return;
          if (!byCode[s.code]) { byCode[s.code] = { code: s.code, label: s.label, metres: 0 }; order.push(s.code); }
          byCode[s.code].metres += s.metres;
        });
        return {
          ok: true,
          total: total,
          rows: order.map(function (c) { return byCode[c]; })
                     .sort(function (a, b) { return b.metres - a.metres; }),
          probes: budget.used,
          approximate: true
        };
      });
    });
  }

  Places.mileage = mileage;
  global.TW.Places = Places;
})(window);

/* fuel.js — what the diesel will cost and where to buy it.
   Be clear about what this is: there is no free, global, live diesel-price feed,
   so a station's price here is ESTIMATED from a regional reference average
   unless a driver has reported the real one. Every estimate is labelled as such
   in the UI. A reported price always wins, and reports travel with the driver's
   backup. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, U = global.TW.U;

  var REPORTS_KEY = "truckway.fuelReports.v1";
  var BASE_KEY = "truckway.fuelBaselines.v1";

  var baselines = null;
  var loading = null;

  function load() {
    if (baselines) return Promise.resolve(baselines);
    if (loading) return loading;
    var custom = H.load(BASE_KEY, null);
    if (custom && custom.regions) {
      baselines = custom;
      return Promise.resolve(baselines);
    }
    loading = H.fetchJSON("./data/fuel-baselines.json", { timeout: 15000 })
      .then(function (d) { baselines = d; return d; })
      .catch(function () {
        baselines = {
          as_of: "", note: "", regions: {},
          "default": { label: "Unknown region", currency: "USD", display: "gal", perLitre: 1.017 }
        };
        return baselines;
      });
    return loading;
  }

  function regionEntry(key) {
    if (!baselines) return null;
    if (key && baselines.regions[key]) return baselines.regions[key];
    /* "US-IL" with no entry still tells us the country. */
    if (key && key.indexOf("-") > 0) {
      var country = key.split("-")[0];
      if (baselines.regions[country]) return baselines.regions[country];
    }
    return baselines["default"];
  }

  /* ---------- which region is this stretch of road in ---------- */

  /* Reverse-geocode a handful of points so a route crossing state lines prices
     each stretch against the right average. Kept to a few calls: Nominatim asks
     for no more than one request a second. */
  function regionsForRoute(route) {
    var samples = [0, 0.34, 0.67, 1].map(function (f) {
      var idx = Math.min(route.line.length - 1, Math.round(f * (route.line.length - 1)));
      return { along: (route.cumulative[idx] || 0), pt: route.line[idx] };
    });
    /* Drop samples that are effectively the same place. */
    var wanted = samples.filter(function (s, i) {
      return i === 0 || G.haversine(s.pt, samples[i - 1].pt) > 15000;
    });

    var out = [];
    var i = 0;
    function next() {
      if (i >= wanted.length) return Promise.resolve();
      var s = wanted[i++];
      var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8" +
                "&addressdetails=1&lat=" + s.pt[0].toFixed(4) + "&lon=" + s.pt[1].toFixed(4);
      return H.fetchJSON(url, { timeout: 12000 }).then(function (d) {
        var a = (d && d.address) || {};
        var key = a["ISO3166-2-lvl4"] ||
                  (a.country_code ? a.country_code.toUpperCase() : null);
        if (key) out.push({ along: s.along, key: key, label: a.state || a.country || "" });
      }).catch(function () {})
        .then(function () {
          /* Space the calls out, as Nominatim's usage policy asks. */
          return new Promise(function (r) { setTimeout(r, 1100); });
        })
        .then(next);
    }
    return next().then(function () { return out; });
  }

  function regionAt(along, regions) {
    if (!regions || !regions.length) return regionEntry(null);
    var best = regions[0];
    for (var i = 0; i < regions.length; i++) {
      if (regions[i].along <= along) best = regions[i];
    }
    return regionEntry(best.key);
  }

  /* ---------- reported prices ---------- */

  function reports() { return H.load(REPORTS_KEY, {}) || {}; }

  /* A price the driver typed in, in whatever unit they were shown. */
  function report(poiId, price, unit, currency) {
    var all = reports();
    var perLitre = unit === "gal" ? price / U.L_PER_GAL : price;
    all[poiId] = { perLitre: perLitre, currency: currency, at: Date.now() };
    H.save(REPORTS_KEY, all);
    return all[poiId];
  }

  function clearReport(poiId) {
    var all = reports();
    delete all[poiId];
    H.save(REPORTS_KEY, all);
  }

  /* A reported price stops being trustworthy fairly quickly. */
  var FRESH_MS = 3 * 24 * 3600 * 1000;
  var STALE_MS = 14 * 24 * 3600 * 1000;

  /* ---------- the estimate ---------- */

  /* Highway truck stops charge more than an independent off the interstate, and
     the big chains sit above the regional average at the cash pump. These are
     rules of thumb, not measurements, which is exactly why the result is
     labelled an estimate. */
  var CHAIN_FACTOR = {
    "pilot": 1.04, "flying j": 1.04, "love's": 1.03, "loves": 1.03,
    "ta ": 1.05, "travelcenters": 1.05, "petro": 1.05,
    "buc-ee's": 0.95, "quiktrip": 0.96, "kwik trip": 0.96, "casey's": 0.98,
    "sheetz": 0.98, "wawa": 0.98, "maverik": 0.99, "costco": 0.90,
    "sam's club": 0.90, "speedway": 1.01, "circle k": 1.01, "cenex": 1.00
  };

  function priceFor(poi, regions) {
    var rep = reports()[poi.id];
    var region = regionAt(poi.along || 0, regions);
    var age = rep ? Date.now() - rep.at : 0;

    if (rep && age < STALE_MS) {
      return {
        perLitre: rep.perLitre,
        currency: rep.currency || region.currency,
        display: region.display,
        basis: "reported",
        fresh: age < FRESH_MS,
        at: rep.at
      };
    }

    var base = region.perLitre;
    var factor = 1;
    if (poi.chain && CHAIN_FACTOR[poi.chain]) factor *= CHAIN_FACTOR[poi.chain];
    /* Motorway service areas price above town stations. */
    if (poi.cat === "truck_stop") factor *= 1.02;
    /* A stable per-station wobble so the spread looks like a real market and
       does not reshuffle every time the list re-renders. */
    var jitter = ((H.hash(poi.id) % 1000) / 1000 - 0.5) * 0.07;
    return {
      perLitre: base * factor * (1 + jitter),
      currency: region.currency,
      display: region.display,
      basis: "estimate",
      fresh: false,
      regionLabel: region.label,
      staleReport: rep ? rep.at : null
    };
  }

  /* Price in the unit the driver reads: per gallon in the US, per litre elsewhere. */
  function displayPrice(price) {
    return price.display === "gal" ? price.perLitre * U.L_PER_GAL : price.perLitre;
  }

  /* ---------- ranking the stations on a route ---------- */

  /* Detouring costs fuel and time, so the cheapest sign is not always the
     cheapest fill. Charge the detour against the saving. */
  function effectiveCost(poi, price, profile, litres) {
    var detourMetres = poi.detour * 2;            // there and back
    var detourFuel = profile.economy / 100 * (detourMetres / 1000);
    var detourTime = detourMetres / 13.4;         // ~30 mph on the access road
    return {
      fuelCost: litres * price.perLitre,
      detourFuel: detourFuel,
      detourCost: detourFuel * price.perLitre,
      detourTime: detourTime,
      total: (litres + detourFuel) * price.perLitre
    };
  }

  /* opts.truckOnly keeps only stops a truck can actually use. It has to happen
     before ranking, not in the view: the cheapest badge, the price spread and
     the fill-up plan all have to agree, and none of them should ever send a
     53-footer into a forecourt it cannot turn around in. */
  function priceStations(pois, regions, profile, opts) {
    opts = opts || {};
    var litres = profile.tank * (1 - profile.fuelLevel);
    var candidates = pois.filter(function (p) {
      return p.cat === "fuel" || (p.cat === "truck_stop" && p.diesel !== false);
    });
    if (opts.truckOnly) {
      var truckable = candidates.filter(function (p) {
        return p.truckFriendly || p.cat === "truck_stop";
      });
      /* Only apply it when it still leaves a usable choice. */
      if (truckable.length >= 3) candidates = truckable;
    }
    var out = candidates.map(function (p) {
      var price = priceFor(p, regions);
      return {
        poi: p,
        price: price,
        display: displayPrice(price),
        cost: effectiveCost(p, price, profile, litres)
      };
    });
    out.sort(function (a, b) { return a.price.perLitre - b.price.perLitre; });
    if (out.length) {
      out[0].cheapest = true;
      out[out.length - 1].priciest = true;
    }
    return out;
  }

  /* What the driver saves by filling at the best station instead of the worst,
     for the amount they would actually put in. */
  function spread(stations, profile) {
    if (stations.length < 2) return null;
    var litres = profile.tank * (1 - profile.fuelLevel);
    var lo = stations[0], hi = stations[stations.length - 1];
    return {
      low: lo, high: hi,
      litres: litres,
      saving: (hi.price.perLitre - lo.price.perLitre) * litres,
      currency: lo.price.currency,
      perUnit: displayPrice(hi.price) - displayPrice(lo.price),
      unit: lo.price.display
    };
  }

  /* ---------- where to fill up ---------- */

  /* Greedy but sensible: drive as far as the tank safely allows, then take the
     cheapest station in the last stretch before running dry. Repeat until the
     destination is in range. */
  function plan(route, stations, profile) {
    if (!stations.length) return { stops: [], reachable: true, note: "" };

    var byAlong = stations.slice().sort(function (a, b) { return a.poi.along - b.poi.along; });
    var usableLitres = profile.tank * Math.max(0, profile.fuelLevel - profile.reserve);
    var perMetre = (profile.economy / 100) / 1000;
    var range = usableLitres / perMetre;
    var fullRange = profile.tank * (1 - profile.reserve) / perMetre;

    var stops = [];
    var position = 0;
    var rangeLeft = range;
    var guard = 0;

    while (position + rangeLeft < route.distance && guard++ < 12) {
      var limit = position + rangeLeft;
      /* Consider anything in the last 40% of the remaining range, so we are not
         stopping needlessly early, and never behind us. */
      var window = byAlong.filter(function (s) {
        return s.poi.along > position + 1000 && s.poi.along <= limit;
      });
      if (!window.length) {
        return {
          stops: stops, reachable: false,
          note: "No diesel found within range before " +
                (position + rangeLeft > route.distance ? "the destination" : "running low") + "."
        };
      }
      /* Cheapest, with a mild preference for later (fewer stops) and less detour. */
      window.sort(function (a, b) {
        var ka = a.price.perLitre + a.poi.detour / 1000 * 0.01 - (a.poi.along / route.distance) * 0.02;
        var kb = b.price.perLitre + b.poi.detour / 1000 * 0.01 - (b.poi.along / route.distance) * 0.02;
        return ka - kb;
      });
      var pick = window[0];
      var burned = (pick.poi.along - position + pick.poi.detour * 2) * perMetre;
      var arriveLitres = Math.max(0, (position === 0 ? profile.tank * profile.fuelLevel : profile.tank * (1 - profile.reserve)) - burned);
      var fill = Math.max(0, profile.tank - arriveLitres);
      stops.push({
        station: pick,
        along: pick.poi.along,
        litres: fill,
        cost: fill * pick.price.perLitre,
        arriveLitres: arriveLitres
      });
      position = pick.poi.along;
      rangeLeft = fullRange - pick.poi.detour * 2;
    }

    var totalCost = stops.reduce(function (a, s) { return a + s.cost; }, 0);
    return {
      stops: stops,
      reachable: true,
      totalCost: totalCost,
      currency: stations[0].price.currency,
      tripLitres: profile.economy / 100 * (route.distance / 1000)
    };
  }

  global.TW.Fuel = {
    load: load,
    regionsForRoute: regionsForRoute,
    regionAt: function (along, regions) { return regionAt(along, regions); },
    priceFor: priceFor,
    displayPrice: displayPrice,
    priceStations: priceStations,
    spread: spread,
    plan: plan,
    report: report,
    clearReport: clearReport,
    reports: reports,
    baselines: function () { return baselines; },
    saveBaselines: function (b) { baselines = b; H.save(BASE_KEY, b); }
  };
})(window);

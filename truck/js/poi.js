/* poi.js — the places a driver actually stops.
   Truck stops, diesel, overnight parking, rest areas, scales and repair, found
   along the planned route and ranked by how far off it they sit. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G;
  var Services = global.TW.Services;

  /* Each category carries the Overpass filters that find it and the styling the
     map and lists use. `hgv` marks the ones that are truck-specific. */
  var CATEGORIES = [
    {
      id: "truck_stop", label: "Truck stops", icon: "🛻", color: "#f5a524", hgv: true,
      filters: ['nwr["highway"="services"]', 'nwr["amenity"="truck_stop"]']
    },
    {
      id: "fuel", label: "Diesel", icon: "⛽", color: "#3fb950", hgv: false,
      filters: ['nwr["amenity"="fuel"]']
    },
    {
      id: "truck_parking", label: "Truck parking", icon: "🅿️", color: "#4c9aff", hgv: true,
      filters: ['nwr["amenity"="parking"]["hgv"~"^(yes|designated)$"]',
                'nwr["amenity"="parking"]["parking"="truck"]']
    },
    {
      id: "rest_area", label: "Rest areas", icon: "🛏️", color: "#a371f7", hgv: false,
      filters: ['nwr["highway"="rest_area"]']
    },
    {
      id: "weigh", label: "Scales", icon: "⚖️", color: "#f78166", hgv: true,
      filters: ['nwr["amenity"="weighbridge"]', 'nwr["highway"="weigh_station"]']
    },
    {
      id: "repair", label: "Repair & tyres", icon: "🔧", color: "#db6d28", hgv: true,
      filters: ['nwr["shop"="truck_repair"]', 'nwr["shop"="tyres"]',
                'nwr["amenity"="vehicle_inspection"]']
    }
  ];

  var BY_ID = {};
  CATEGORIES.forEach(function (c) { BY_ID[c.id] = c; });

  /* The chains a driver recognises. Used for the badge and, in fuel.js, for a
     rough price expectation. */
  var CHAINS = ["pilot", "flying j", "love's", "loves", "ta ", "travelcenters",
                "petro", "sapp bros", "roady's", "aral", "shell", "bp", "esso",
                "total", "circle k", "buc-ee's", "quiktrip", "sheetz", "wawa",
                "maverik", "kwik trip", "casey's", "speedway", "cenex"];

  function chainOf(name, brand) {
    var s = String(brand || name || "").toLowerCase();
    for (var i = 0; i < CHAINS.length; i++) {
      if (s.indexOf(CHAINS[i]) >= 0) return CHAINS[i].trim();
    }
    return "";
  }

  function centre(el) {
    if (el.center) return [el.center.lat, el.center.lon];
    if (typeof el.lat === "number") return [el.lat, el.lon];
    if (el.geometry && el.geometry.length) return [el.geometry[0].lat, el.geometry[0].lon];
    return null;
  }

  /* Which of our categories does this element belong to? Order matters: a
     services area that also sells diesel is a truck stop first. */
  function classify(t) {
    if (!t) return null;
    if (t.highway === "services" || t.amenity === "truck_stop") return "truck_stop";
    if (t.amenity === "weighbridge" || t.highway === "weigh_station") return "weigh";
    if (t.shop === "truck_repair" || t.shop === "tyres" || t.amenity === "vehicle_inspection") return "repair";
    if (t.amenity === "fuel") return "fuel";
    if (t.amenity === "parking") {
      if (t.hgv === "yes" || t.hgv === "designated" || t.parking === "truck") return "truck_parking";
      return null;
    }
    if (t.highway === "rest_area") return "rest_area";
    return null;
  }

  /* Facilities a driver wants to know about before committing to a detour. */
  function facilities(t) {
    var out = [];
    if (t["fuel:diesel"] === "yes" || t["fuel:HGV_diesel"] === "yes") out.push("diesel");
    if (t["fuel:HGV_diesel"] === "yes" || t.hgv === "yes" || t.hgv === "designated") out.push("truck lanes");
    if (t["fuel:diesel:class2"] === "yes" || t["fuel:adblue"] === "yes" || t["fuel:def"] === "yes") out.push("DEF/AdBlue");
    if (t.shower === "yes" || t.showers === "yes") out.push("showers");
    if (t.toilets === "yes" || t.amenity === "toilets") out.push("toilets");
    if (t.internet_access && t.internet_access !== "no") out.push("wifi");
    if (t.compressed_air === "yes") out.push("air");
    if (t.capacity_hgv || t["capacity:hgv"]) out.push((t["capacity:hgv"] || t.capacity_hgv) + " truck spaces");
    if (t.overnight === "yes") out.push("overnight");
    if (t.fee === "no") out.push("free");
    else if (t.fee === "yes") out.push("paid");
    if (t.lit === "yes") out.push("lit");
    if (t.surveillance) out.push("cameras");
    return out;
  }

  /* Plenty of fuel and parking nodes carry no name at all. A list of six
     identical "Diesel" rows is useless, so fall back to whatever else locates
     it — the street, then the town. */
  function fallbackName(cat, t) {
    var base = BY_ID[cat].label.replace(/s$/, "");
    var where = t["addr:street"] || t["addr:city"] || t["addr:place"] || t.ref || "";
    return where ? base + " · " + where : base + " (unnamed)";
  }

  function toPOI(el) {
    var t = el.tags || {};
    var cat = classify(t);
    if (!cat) return null;
    var c = centre(el);
    if (!c) return null;
    return {
      id: el.type + "/" + el.id,
      osmType: el.type,
      osmId: el.id,
      cat: cat,
      name: t.name || t.brand || t.operator || fallbackName(cat, t),
      brand: t.brand || t.operator || "",
      chain: chainOf(t.name, t.brand || t.operator),
      lat: c[0], lon: c[1],
      hours: t.opening_hours || "",
      phone: t.phone || t["contact:phone"] || "",
      website: t.website || t["contact:website"] || "",
      facilities: facilities(t),
      diesel: t["fuel:diesel"] === "yes" || t["fuel:HGV_diesel"] === "yes" ||
              (cat === "truck_stop" && t.amenity !== "parking"),
      truckFriendly: t.hgv === "yes" || t.hgv === "designated" ||
                     cat === "truck_stop" || cat === "truck_parking",
      tags: t
    };
  }

  /* Along-route search.
     Overpass answers a tag-filtered bbox far faster than a wide `around`, so we
     box each slice of the route, then measure the real off-route detour here. */
  function query(bbox, cats) {
    var box = "(" + bbox[0].toFixed(4) + "," + bbox[1].toFixed(4) + "," +
                    bbox[2].toFixed(4) + "," + bbox[3].toFixed(4) + ")";
    var parts = [];
    cats.forEach(function (id) {
      var c = BY_ID[id];
      if (!c) return;
      c.filters.forEach(function (f) { parts.push(f + box + ";"); });
    });
    return "[out:json][timeout:60];(" + parts.join("") + ");out tags center 900;";
  }

  function alongRoute(route, opts) {
    opts = opts || {};
    var cats = opts.cats || CATEGORIES.map(function (c) { return c.id; });
    var detour = opts.maxDetour || 5000;
    /* Slice the route so no single bbox covers a silly amount of ground. */
    var sliceLength = 60000;
    var slices = Math.max(1, Math.min(14, Math.ceil(route.distance / sliceLength)));
    var per = Math.ceil(route.line.length / slices);
    var jobs = [];
    for (var i = 0; i < slices; i++) {
      var part = route.line.slice(i * per, Math.min(route.line.length, (i + 1) * per + 1));
      if (part.length < 2) continue;
      jobs.push(G.bbox(part, detour));
    }

    var found = {}, failures = 0;
    var index = 0;
    function next() {
      if (index >= jobs.length) return Promise.resolve();
      var mine = index++;
      return Services.overpass(query(jobs[mine], cats), { timeout: 40000 })
        .then(function (d) {
          (d.elements || []).forEach(function (el) {
            var poi = toPOI(el);
            if (poi && !found[poi.id]) found[poi.id] = poi;
          });
          if (opts.onProgress) opts.onProgress(mine + 1, jobs.length);
        }, function () {
          failures++;
          if (opts.onProgress) opts.onProgress(mine + 1, jobs.length);
        })
        .then(next);
    }
    var runners = [];
    for (var r = 0; r < Math.min(2, jobs.length); r++) runners.push(next());

    return Promise.all(runners).then(function () {
      var list = [];
      for (var key in found) {
        if (!Object.prototype.hasOwnProperty.call(found, key)) continue;
        var poi = found[key];
        var near = G.nearestOnLine([poi.lat, poi.lon], route.line, route.cumulative);
        if (near.dist > detour) continue;
        poi.detour = near.dist;
        poi.along = near.along;
        poi.remaining = Math.max(0, route.distance - near.along);
        list.push(poi);
      }
      list.sort(function (a, b) { return a.along - b.along; });
      return { pois: list, failures: failures, total: jobs.length };
    });
  }

  /* "What is around it" — the question that decides whether a stop is worth
     pulling off for. One cheap point query. */
  var AROUND_FILTERS =
    'nwr.a["amenity"~"^(restaurant|fast_food|cafe|bar|pub|fuel|toilets|shower|atm|bank|' +
    'pharmacy|hospital|clinic|parking|truck_wash|weighbridge|car_wash|charging_station)$"];' +
    'nwr.a["shop"~"^(convenience|supermarket|laundry|truck_repair|tyres|car_repair|' +
    'department_store|kiosk)$"];' +
    'nwr.a["tourism"~"^(motel|hotel|hostel|camp_site)$"];' +
    'nwr.a["leisure"~"^(fitness_centre|sauna)$"];';

  var AROUND_LABEL = {
    restaurant: "Restaurant", fast_food: "Fast food", cafe: "Cafe", bar: "Bar", pub: "Pub",
    fuel: "Fuel", toilets: "Toilets", shower: "Showers", atm: "ATM", bank: "Bank",
    pharmacy: "Pharmacy", hospital: "Hospital", clinic: "Clinic", parking: "Parking",
    truck_wash: "Truck wash", weighbridge: "Scales", car_wash: "Wash",
    charging_station: "EV charging", convenience: "Convenience store",
    supermarket: "Supermarket", laundry: "Laundry", truck_repair: "Truck repair",
    tyres: "Tyres", car_repair: "Repair", department_store: "Store", kiosk: "Kiosk",
    motel: "Motel", hotel: "Hotel", hostel: "Hostel", camp_site: "Campsite",
    fitness_centre: "Gym", sauna: "Sauna"
  };

  var aroundCache = {};

  function around(lat, lon, radius) {
    radius = radius || 500;
    var key = lat.toFixed(4) + "," + lon.toFixed(4) + "," + radius;
    if (aroundCache[key]) return Promise.resolve(aroundCache[key]);

    var q = "[out:json][timeout:30];nwr(around:" + radius + "," +
            lat.toFixed(5) + "," + lon.toFixed(5) + ")->.a;(" + AROUND_FILTERS +
            ");out tags center 80;";

    return Services.overpass(q, { timeout: 25000 }).then(function (d) {
      var here = [lat, lon];
      var out = [];
      (d.elements || []).forEach(function (el) {
        var t = el.tags || {};
        var kind = t.amenity || t.shop || t.tourism || t.leisure;
        if (!kind || !AROUND_LABEL[kind]) return;
        var c = centre(el);
        if (!c) return;
        out.push({
          kind: kind,
          label: AROUND_LABEL[kind],
          name: t.name || "",
          hours: t.opening_hours || "",
          dist: G.haversine(here, c),
          lat: c[0], lon: c[1]
        });
      });
      out.sort(function (a, b) { return a.dist - b.dist; });
      aroundCache[key] = out;
      return out;
    }).catch(function () { return []; });
  }

  /* Group the raw list into "3 restaurants, a pharmacy, showers" for the card. */
  function summarise(list) {
    var counts = {}, order = [];
    list.forEach(function (a) {
      if (!counts[a.label]) { counts[a.label] = 0; order.push(a.label); }
      counts[a.label]++;
    });
    return order.map(function (label) {
      return { label: label, count: counts[label] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  global.TW.POI = {
    CATEGORIES: CATEGORIES,
    BY_ID: BY_ID,
    alongRoute: alongRoute,
    around: around,
    summarise: summarise,
    classify: classify,
    toPOI: toPOI
  };
})(window);

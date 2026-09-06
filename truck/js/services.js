/* services.js — every network call the app makes.
   Three routing engines, two geocoders and a pool of Overpass mirrors. Nothing
   here is a hard dependency: each family fails over to the next member, and the
   caller is told which engine actually answered so the UI can say so. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, U = global.TW.U;

  /* ---------- endpoints ---------- */

  var VALHALLA = ["https://valhalla1.openstreetmap.de/route"];
  var ORS = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson";
  var OSRM = "https://router.project-osrm.org/route/v1/driving/";
  var PHOTON = "https://photon.komoot.io/api/";
  var NOMINATIM = "https://nominatim.openstreetmap.org/search";
  var NOMINATIM_REV = "https://nominatim.openstreetmap.org/reverse";

  /* Public Overpass instances, tried in order. They rate-limit independently,
     so rotating past a busy one is usually faster than waiting on it. */
  var OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  var overpassCursor = 0;

  function settings() { return H.load("truckway.settings.v1", {}) || {}; }

  /* ---------- geocoding ---------- */

  function photonSearch(query, near) {
    var url = PHOTON + "?q=" + encodeURIComponent(query) + "&limit=8";
    if (near) url += "&lat=" + near[0].toFixed(4) + "&lon=" + near[1].toFixed(4);
    return H.fetchJSON(url, { timeout: 12000 }).then(function (d) {
      return (d.features || []).map(function (f) {
        var p = f.properties || {};
        var c = f.geometry && f.geometry.coordinates;
        if (!c) return null;
        var line1 = p.name || p.street || p.city || "Unnamed";
        var rest = [];
        if (p.housenumber && p.street) line1 = p.street + " " + p.housenumber;
        if (p.city && p.city !== p.name) rest.push(p.city);
        if (p.state) rest.push(p.state);
        if (p.country) rest.push(p.country);
        return {
          name: line1,
          detail: rest.join(", "),
          lat: c[1], lon: c[0],
          kind: p.osm_value || p.type || "",
          source: "photon"
        };
      }).filter(Boolean);
    });
  }

  function nominatimSearch(query, near) {
    var url = NOMINATIM + "?format=jsonv2&limit=8&q=" + encodeURIComponent(query);
    return H.fetchJSON(url, { timeout: 12000 }).then(function (list) {
      return (list || []).map(function (r) {
        var parts = String(r.display_name || "").split(",");
        return {
          name: parts.shift().trim(),
          detail: parts.join(",").trim(),
          lat: parseFloat(r.lat), lon: parseFloat(r.lon),
          kind: r.type || "",
          source: "nominatim"
        };
      });
    });
  }

  /* ---------- Overpass ---------- */

  /* Public Overpass mirrors are frequently slow or rate-limited, and a single
     stalled one would hold up the whole restriction check. So we hedge: start
     with one mirror, and if it has not answered shortly, race the next one
     rather than waiting it out. First good answer wins and becomes the mirror
     we try first next time. */
  var OVERPASS_HEDGE_MS = 6000;

  function overpassOnce(endpoint, body, timeout) {
    var url = endpoint + "?" + body;
    if (url.length < 7000) return H.fetchJSON(url, { timeout: timeout });
    /* Too long for a GET; Overpass takes the same query as a form POST. */
    return H.fetchJSON(endpoint, {
      method: "POST", body: body, timeout: timeout,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
  }

  function overpass(query, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 30000;
    var body = "data=" + encodeURIComponent(query);
    var order = [];
    var count = Math.min(opts.attempts || OVERPASS.length, OVERPASS.length);
    for (var i = 0; i < count; i++) order.push(OVERPASS[(overpassCursor + i) % OVERPASS.length]);

    return new Promise(function (resolve, reject) {
      var settled = false, launched = 0, failed = 0, firstError = null;

      function launch() {
        if (settled || launched >= order.length) return;
        var index = launched++;
        var endpoint = order[index];

        overpassOnce(endpoint, body, timeout).then(function (d) {
          /* Overpass reports overload in the body with a 200 status. */
          if (d && d.remark && /timed out|Query run out of memory/i.test(d.remark) &&
              !(d.elements && d.elements.length)) {
            throw new Error("Overpass: " + d.remark);
          }
          if (settled) return;
          settled = true;
          overpassCursor = OVERPASS.indexOf(endpoint);
          if (overpassCursor < 0) overpassCursor = 0;
          resolve(d);
        }, function (err) {
          firstError = firstError || err;
          failed++;
          if (settled) return;
          if (launched < order.length) launch();
          else if (failed >= launched) reject(firstError || new Error("Overpass unavailable"));
        });

        /* Do not sit on a silent mirror — bring the next one in alongside it. */
        if (index + 1 < order.length) {
          setTimeout(function () {
            if (!settled && launched === index + 1) launch();
          }, OVERPASS_HEDGE_MS);
        }
      }

      launch();
    });
  }

  /* ---------- route normalisation ---------- */

  function makeRoute(fields) {
    var r = {
      id: H.uid(),
      engine: fields.engine,
      engineLabel: fields.engineLabel,
      truckAware: !!fields.truckAware,
      variant: fields.variant || "",
      distance: fields.distance,
      duration: fields.duration,
      line: fields.line,
      steps: fields.steps || [],
      hasToll: !!fields.hasToll,
      hasFerry: !!fields.hasFerry,
      warnings: fields.warnings || [],
      audit: null            // filled in later by restrict.js
    };
    r.cumulative = G.cumulative(r.line);
    /* Trust the measured geometry when an engine's own summary looks off. */
    if (!isFinite(r.distance) || r.distance <= 0) {
      r.distance = r.cumulative[r.cumulative.length - 1] || 0;
    }
    return r;
  }

  /* ---------- Valhalla (keyless, real truck costing) ---------- */

  var VALHALLA_MANEUVER = {
    1: "depart", 2: "depart", 3: "depart", 4: "arrive", 5: "arrive", 6: "arrive",
    7: "straight", 8: "straight", 9: "slight-right", 10: "right", 11: "sharp-right",
    12: "uturn", 13: "uturn", 14: "sharp-left", 15: "left", 16: "slight-left",
    17: "straight", 18: "ramp-right", 19: "ramp-left", 20: "exit-right", 21: "exit-left",
    22: "straight", 23: "keep-right", 24: "keep-left", 25: "merge",
    26: "roundabout", 27: "roundabout", 28: "ferry", 29: "ferry",
    37: "merge-right", 38: "merge-left"
  };

  function valhallaBody(points, p, opts) {
    var truck = {
      height: +p.height.toFixed(2),
      width: +p.width.toFixed(2),
      length: +p.length.toFixed(2),
      weight: +(p.weight / 1000).toFixed(2),        // metric tonnes
      axle_load: +(p.axleLoad / 1000).toFixed(2),   // metric tonnes
      axle_count: p.axles,
      hazmat: !!p.hazmat,
      use_tolls: p.avoidTolls ? 0 : 0.5,
      use_highways: p.avoidHighways ? 0.1 : 1,
      use_ferry: p.avoidFerries ? 0 : 0.5,
      use_tracks: p.avoidUnpaved ? 0 : 0.2,
      shortest: !!(opts && opts.shortest)
    };
    return {
      locations: points.map(function (pt, i) {
        return { lat: pt[0], lon: pt[1], type: (i === 0 || i === points.length - 1) ? "break" : "through" };
      }),
      costing: "truck",
      costing_options: { truck: truck },
      /* Always ask for kilometres: the app converts at the display edge. */
      directions_options: { units: "kilometers" },
      alternates: (opts && opts.alternates) || 0
    };
  }

  function valhallaTrip(trip, label, variant) {
    var line = [], steps = [], hasToll = false, hasFerry = false;
    (trip.legs || []).forEach(function (leg) {
      var offset = line.length;
      var shape = G.decodePolyline(leg.shape, 6);
      /* Legs share their joining vertex; drop the duplicate. */
      if (offset > 0 && shape.length) shape = shape.slice(1);
      var base = offset > 0 ? offset - 1 : 0;
      line = line.concat(shape);
      (leg.maneuvers || []).forEach(function (m) {
        if (m.toll) hasToll = true;
        if (m.ferry || m.type === 28 || m.type === 29) hasFerry = true;
        var idx = Math.min(line.length - 1, base + (m.begin_shape_index || 0));
        steps.push({
          text: m.instruction || "",
          verbal: m.verbal_pre_transition_instruction || m.instruction || "",
          arrival: m.verbal_post_transition_instruction || "",
          distance: (m.length || 0) * 1000,
          duration: m.time || 0,
          type: VALHALLA_MANEUVER[m.type] || "straight",
          name: (m.street_names || []).join(" / "),
          exit: (m.sign && m.sign.exit_number_elements &&
                 m.sign.exit_number_elements[0] && m.sign.exit_number_elements[0].text) || "",
          index: idx
        });
      });
    });
    var sum = trip.summary || {};
    return makeRoute({
      engine: "valhalla", engineLabel: label, truckAware: true, variant: variant,
      distance: (sum.length || 0) * 1000,
      duration: sum.time || 0,
      line: line, steps: steps,
      hasToll: hasToll || !!sum.has_toll,
      hasFerry: hasFerry || !!sum.has_ferry
    });
  }

  function routeValhalla(points, p, opts) {
    var body = JSON.stringify(valhallaBody(points, p, opts));
    var url = VALHALLA[0] + "?json=" + encodeURIComponent(body);
    /* Valhalla's public instance answers GET with a json= param, which avoids a
       CORS preflight; fall back to POST if the URL grows past a safe length. */
    var req = url.length < 6000
      ? H.fetchJSON(url, { timeout: 30000 })
      : H.fetchJSON(VALHALLA[0], {
          method: "POST", body: body, timeout: 30000,
          headers: { "Content-Type": "application/json" }
        });
    return req.then(function (d) {
      if (!d || !d.trip || !d.trip.legs) throw new Error("Valhalla returned no trip");
      var out = [valhallaTrip(d.trip, "Valhalla truck", "recommended")];
      (d.alternates || []).forEach(function (alt, i) {
        if (alt && alt.trip && alt.trip.legs) {
          out.push(valhallaTrip(alt.trip, "Valhalla truck", "alternative " + (i + 1)));
        }
      });
      return out;
    });
  }

  /* ---------- OpenRouteService driving-hgv (needs a free key) ---------- */

  var ORS_MANEUVER = {
    0: "left", 1: "right", 2: "sharp-left", 3: "sharp-right", 4: "slight-left",
    5: "slight-right", 6: "straight", 7: "roundabout", 8: "roundabout",
    9: "uturn", 10: "arrive", 11: "depart", 12: "keep-left", 13: "keep-right"
  };

  function routeORS(points, p, opts) {
    var key = (settings().orsKey || "").trim();
    if (!key) return Promise.reject(new Error("no ORS key"));

    var avoid = [];
    if (p.avoidTolls) avoid.push("tollways");
    if (p.avoidFerries) avoid.push("ferries");
    if (p.avoidHighways) avoid.push("highways");

    var body = {
      coordinates: points.map(function (pt) { return [pt[1], pt[0]]; }),
      instructions: true,
      units: "m",
      geometry: true,
      options: {
        vehicle_type: p.hazmat ? "hgv" : "hgv",
        profile_params: {
          restrictions: {
            height: +p.height.toFixed(2),
            width: +p.width.toFixed(2),
            length: +p.length.toFixed(2),
            weight: +(p.weight / 1000).toFixed(2),
            axleload: +(p.axleLoad / 1000).toFixed(2),
            hazmat: !!p.hazmat
          }
        }
      }
    };
    if (avoid.length) body.options.avoid_features = avoid;
    /* ORS only offers alternatives for a simple A-to-B request. */
    if (points.length === 2 && opts && opts.alternates) {
      body.alternative_routes = { target_count: 2, share_factor: 0.6, weight_factor: 1.6 };
    }

    return H.fetchJSON(ORS, {
      method: "POST", body: JSON.stringify(body), timeout: 30000,
      headers: { "Content-Type": "application/json", "Authorization": key }
    }).then(function (d) {
      var feats = d.features || [];
      if (!feats.length) throw new Error("ORS returned no route");
      return feats.map(function (f, fi) {
        var coords = (f.geometry && f.geometry.coordinates) || [];
        var line = coords.map(function (c) { return [c[1], c[0]]; });
        var props = f.properties || {};
        var steps = [];
        (props.segments || []).forEach(function (seg) {
          (seg.steps || []).forEach(function (s) {
            var wp = s.way_points || [0, 0];
            steps.push({
              text: s.instruction || "",
              verbal: s.instruction || "",
              arrival: "",
              distance: s.distance || 0,
              duration: s.duration || 0,
              type: ORS_MANEUVER[s.type] || "straight",
              name: s.name && s.name !== "-" ? s.name : "",
              exit: s.exit_number ? String(s.exit_number) : "",
              index: Math.min(line.length - 1, wp[0] || 0)
            });
          });
        });
        var sum = props.summary || {};
        var extras = props.extras || {};
        return makeRoute({
          engine: "ors", engineLabel: "OpenRouteService HGV", truckAware: true,
          variant: fi === 0 ? "recommended" : "alternative " + fi,
          distance: sum.distance, duration: sum.duration,
          line: line, steps: steps,
          hasToll: !!(extras.tollways && extras.tollways.summary && extras.tollways.summary.length),
          hasFerry: false
        });
      });
    });
  }

  /* ---------- OSRM (keyless, but a CAR profile) ---------- */

  var OSRM_MANEUVER = {
    "turn:left": "left", "turn:right": "right",
    "turn:slight left": "slight-left", "turn:slight right": "slight-right",
    "turn:sharp left": "sharp-left", "turn:sharp right": "sharp-right",
    "turn:uturn": "uturn", "turn:straight": "straight",
    "depart": "depart", "arrive": "arrive", "merge": "merge",
    "on ramp": "ramp-right", "off ramp": "exit-right", "fork": "keep-right",
    "end of road": "straight", "continue": "straight", "roundabout": "roundabout",
    "rotary": "roundabout", "roundabout turn": "roundabout", "new name": "straight"
  };

  function osrmType(man) {
    var t = man.type || "";
    var key = t + (man.modifier ? ":" + man.modifier : "");
    if (OSRM_MANEUVER[key]) return OSRM_MANEUVER[key];
    if (OSRM_MANEUVER[t]) return OSRM_MANEUVER[t];
    if (man.modifier && OSRM_MANEUVER["turn:" + man.modifier]) return OSRM_MANEUVER["turn:" + man.modifier];
    return "straight";
  }

  function osrmText(step) {
    var man = step.maneuver || {};
    var road = step.name ? " onto " + step.name : "";
    switch (man.type) {
      case "depart": return "Head out" + (step.name ? " on " + step.name : "");
      case "arrive": return "Arrive at your destination";
      case "roundabout": case "rotary":
        return "At the roundabout take exit " + (man.exit || 1) + road;
      case "merge": return "Merge" + road;
      case "on ramp": return "Take the ramp" + road;
      case "off ramp": return "Take the exit" + road;
      case "fork": return "Keep " + (man.modifier || "right") + road;
      case "new name": return "Continue" + road;
      case "continue": return "Continue" + road;
      default:
        if (man.modifier === "straight") return "Continue" + road;
        return "Turn " + (man.modifier || "").replace("slight ", "slightly ") + road;
    }
  }

  function routeOSRM(points, p, opts) {
    var coords = points.map(function (pt) { return pt[1].toFixed(6) + "," + pt[0].toFixed(6); }).join(";");
    var url = OSRM + coords + "?overview=full&geometries=polyline6&steps=true&alternatives=" +
              (points.length === 2 && opts && opts.alternates ? "true" : "false");
    /* The public OSRM demo server is built without exclude classes, so it
       rejects any `exclude=` at all. Nothing to send — the caller is told
       below that avoid preferences did not reach this engine. */
    return H.fetchJSON(url, { timeout: 25000 }).then(function (d) {
      if (d.code !== "Ok" || !d.routes || !d.routes.length) {
        throw new Error("OSRM: " + (d.message || d.code || "no route"));
      }
      var notes = ["Routed on a car profile — it does not know your truck's size or weight."];
      if (p.avoidTolls || p.avoidFerries || p.avoidHighways) {
        notes.push("Your avoid-tolls/ferries/motorways preferences are not applied by this engine.");
      }
      return d.routes.map(function (r, ri) {
        /* Build the line out of the step geometries so every maneuver's index
           into it is exact rather than a nearest-point guess. */
        var line = [], steps = [];
        (r.legs || []).forEach(function (leg) {
          (leg.steps || []).forEach(function (s) {
            var pts = G.decodePolyline(s.geometry || "", 6);
            var startIndex = line.length ? line.length - 1 : 0;
            if (line.length && pts.length) pts = pts.slice(1);
            line = line.concat(pts);
            steps.push({
              text: osrmText(s),
              verbal: osrmText(s),
              arrival: "",
              distance: s.distance || 0,
              duration: s.duration || 0,
              type: osrmType(s.maneuver || {}),
              name: s.name || "",
              exit: (s.maneuver && s.maneuver.exit) ? String(s.maneuver.exit) : "",
              index: startIndex
            });
          });
        });
        if (!line.length) line = G.decodePolyline(r.geometry || "", 6);
        return makeRoute({
          engine: "osrm", engineLabel: "OSRM (car profile)", truckAware: false,
          variant: ri === 0 ? "fallback" : "fallback alt " + ri,
          distance: r.distance, duration: r.duration,
          line: line, steps: steps,
          warnings: notes
        });
      });
    });
  }

  /* ---------- the combined router ---------- */

  var ENGINES = [
    { id: "valhalla", label: "Valhalla truck", run: routeValhalla, truck: true },
    { id: "ors", label: "OpenRouteService HGV", run: routeORS, truck: true },
    { id: "osrm", label: "OSRM car", run: routeOSRM, truck: false }
  ];

  /* Ask every engine that can answer, in parallel, and hand back everything
     that came back. Picking the best of them is restrict.js's job — it needs
     the restriction audit to judge. A single engine answering is enough. */
  function routeAll(points, profile, opts) {
    opts = opts || {};
    var wanted = opts.engines || ["valhalla", "ors", "osrm"];
    var jobs = ENGINES.filter(function (e) { return wanted.indexOf(e.id) >= 0; })
      .map(function (e) {
        return e.run(points, profile, opts).then(
          function (routes) { return { ok: true, engine: e.id, routes: routes }; },
          function (err) { return { ok: false, engine: e.id, label: e.label, error: err }; }
        );
      });

    return Promise.all(jobs).then(function (results) {
      var routes = [], errors = [], engines = [];
      results.forEach(function (r) {
        if (r.ok && r.routes && r.routes.length) {
          routes = routes.concat(r.routes);
          engines.push(r.engine);
        } else if (!r.ok) {
          var msg = r.error && r.error.message ? r.error.message : "failed";
          if (msg !== "no ORS key") errors.push({ engine: r.engine, label: r.label, message: msg });
        }
      });
      if (!routes.length) {
        var detail = errors.map(function (e) { return e.label + ": " + e.message; }).join(" · ");
        throw new Error(detail || "No routing service could be reached.");
      }
      /* Two engines can return near-identical lines; keep the truck-aware one. */
      routes = dedupe(routes);
      return { routes: routes, engines: engines, errors: errors };
    });
  }

  function dedupe(routes) {
    var out = [];
    routes.sort(function (a, b) { return (b.truckAware ? 1 : 0) - (a.truckAware ? 1 : 0); });
    routes.forEach(function (r) {
      for (var i = 0; i < out.length; i++) {
        var o = out[i];
        var distClose = Math.abs(o.distance - r.distance) / Math.max(1, o.distance) < 0.015;
        if (distClose && sameShape(o.line, r.line)) return;
      }
      out.push(r);
    });
    return out;
  }

  /* Sample a handful of points; if they all sit within 120 m of the other line
     the two routes are the same road for our purposes. */
  function sameShape(a, b) {
    if (!a.length || !b.length) return false;
    var cum = G.cumulative(b);
    for (var i = 1; i <= 9; i++) {
      var p = a[Math.floor((a.length - 1) * i / 10)];
      if (G.nearestOnLine(p, b, cum).dist > 120) return false;
    }
    return true;
  }

  global.TW.Services = {
    overpass: overpass,
    routeAll: routeAll,
    ENGINES: ENGINES,

    geocode: function (query, near) {
      if (!query || query.trim().length < 2) return Promise.resolve([]);
      /* Bare "lat, lon" is a perfectly good destination — a dispatcher pastes
         coordinates far more often than a street address for a yard or dock. */
      var m = query.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (m) {
        var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          return Promise.resolve([{
            name: lat.toFixed(5) + ", " + lon.toFixed(5),
            detail: "Coordinates", lat: lat, lon: lon, kind: "coordinates", source: "input"
          }]);
        }
      }
      return photonSearch(query, near).catch(function () {
        return nominatimSearch(query, near);
      }).catch(function () { return []; });
    },

    reverse: function (lat, lon) {
      var url = NOMINATIM_REV + "?format=jsonv2&zoom=17&lat=" + lat + "&lon=" + lon;
      return H.fetchJSON(url, { timeout: 10000 }).then(function (d) {
        if (!d || !d.display_name) return null;
        var parts = d.display_name.split(",");
        return { name: parts.shift().trim(), detail: parts.slice(0, 3).join(",").trim(), lat: lat, lon: lon };
      }).catch(function () { return null; });
    }
  };
})(window);

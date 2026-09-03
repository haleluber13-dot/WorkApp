/* restrict.js — the part that keeps the truck out of trouble.
   A routing engine tells you it avoided the low bridges. This checks. We pull
   every height, weight, width, length and HGV-ban tag OSM knows along the
   corridor and compare each one against the truck actually being driven, so a
   route is judged on evidence rather than on the engine's word. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, U = global.TW.U, F = global.TW.F;
  var Services = global.TW.Services;

  /* Corridor sampling. Overpass charges for `around` by the number of points in
     the polyline, and falls over somewhere past a hundred of them, so every
     request covers a bounded slice of the route.

     Each request is two stages: a tag-indexed bbox lookup narrows the whole
     area to the few hundred ways that carry a restriction tag at all, then an
     `around` filter on that small set trims it to the corridor. Doing it in
     that order turns a query that times out into one that answers in a few
     seconds and returns kilobytes instead of megabytes. The final, exact test
     — is this way actually on my route — happens here in JS against the real
     polyline, because the server only ever sees a coarse buffer. */
  var PTS_PER_CHUNK = 60;     // beyond this Overpass's `around` degrades badly
  var MAX_CHUNKS = { full: 12, screen: 3 };
  var MIN_SPACING = 150;      // metres between corridor sample points
  var ON_ROUTE = 22;          // a way this close to the line counts as "on it"

  var RESTRICTION_TAGS = [
    'way["maxheight"]["highway"]',
    'way["maxheight:physical"]["highway"]',
    'way["maxweight"]["highway"]',
    'way["maxweight:signed"]["highway"]',
    'way["maxwidth"]["highway"]',
    'way["maxlength"]["highway"]',
    'way["maxaxleload"]["highway"]',
    'way["hgv"~"^(no|destination|delivery|private|agricultural|forestry)$"]["highway"]',
    'way["hazmat"~"^(no|designated)$"]["highway"]',
    'node["barrier"="height_restrictor"]',
    /* Only barrier nodes: a bare maxheight node is as often a building entrance
       or a car-park deck as it is something over the roadway. */
    'node["maxheight"]["barrier"]'
  ];

  function corridorQuery(points, radius) {
    var bb = G.bbox(points, 400);
    var box = "(" + bb[0].toFixed(4) + "," + bb[1].toFixed(4) + "," +
                    bb[2].toFixed(4) + "," + bb[3].toFixed(4) + ")";
    var candidates = RESTRICTION_TAGS.map(function (t) { return t + box + ";"; }).join("");
    var coords = points.map(function (p) {
      return p[0].toFixed(5) + "," + p[1].toFixed(5);
    }).join(",");
    return "[out:json][timeout:60];(" + candidates + ")->.c;" +
           "(way.c(around:" + radius + "," + coords + ");" +
            "node.c(around:" + radius + "," + coords + "););" +
           "out tags geom 800;";
  }

  /* OSM tags a lot of things with maxheight — buildings, trees, car park decks.
     Only something you can drive on can stop a truck. */
  var NOT_DRIVABLE = {
    footway: 1, path: 1, cycleway: 1, steps: 1, pedestrian: 1, bridleway: 1,
    corridor: 1, platform: 1, proposed: 1, construction: 1, raceway: 1
  };

  function isRoadLike(el) {
    var t = el.tags || {};
    if (t.barrier === "height_restrictor") return true;
    if (!t.highway) return el.type === "node" && !!(t.maxheight || t.maxweight);
    if (NOT_DRIVABLE[t.highway]) return false;
    /* A parking aisle or a private driveway with a 6'10" deck is a real low
       clearance, but it is not a road the route is travelling on — it just
       passes within a few metres of one. Flagging those buries the bridges
       that matter under garage entrances. */
    if (t.highway === "service") {
      var sv = t.service || "";
      if (sv === "parking_aisle" || sv === "driveway" || sv === "drive-through") return false;
    }
    return true;
  }

  function elementGeometry(el) {
    if (el.geometry && el.geometry.length) {
      return el.geometry.map(function (g) { return [g.lat, g.lon]; });
    }
    if (el.center) return [[el.center.lat, el.center.lon]];
    if (typeof el.lat === "number") return [[el.lat, el.lon]];
    return [];
  }

  /* Is this way actually part of the route, or just a road that crosses it?
     A low bridge over the highway is somebody else's problem. We require real
     overlap and a matching heading before we believe it. */
  function matchToRoute(geom, route) {
    if (!geom.length) return null;
    var onPoints = [], best = null;
    for (var i = 0; i < geom.length; i++) {
      var near = G.nearestOnLine(geom[i], route.line, route.cumulative);
      if (near.dist <= ON_ROUTE) onPoints.push({ pt: geom[i], near: near });
      if (!best || near.dist < best.dist) best = near;
    }
    if (!onPoints.length) return null;

    /* A single node (a height restrictor, a gate) has no length to overlap. */
    if (geom.length === 1) {
      return best.dist <= 15 ? { along: best.along, point: best.point, confidence: "high" } : null;
    }

    var overlap = G.haversine(onPoints[0].pt, onPoints[onPoints.length - 1].pt);
    var wayLength = G.length(geom);
    var enough = overlap >= Math.min(25, wayLength * 0.5);
    if (!enough && onPoints.length < 2) {
      /* Short bridge segments are legitimately only a few metres long. */
      if (wayLength > 40) return null;
    }

    /* Heading check — a crossing road runs across the route, not along it. */
    if (geom.length >= 2 && wayLength > 15) {
      var wayBearing = G.bearing(geom[0], geom[geom.length - 1]);
      var ri = Math.min(route.line.length - 2, onPoints[0].near.index);
      var routeBearing = G.bearing(route.line[ri], route.line[ri + 1]);
      var delta = Math.abs(G.bearingDelta(routeBearing, wayBearing));
      if (delta > 45 && delta < 135) return null;
    }
    return {
      along: onPoints[0].near.along,
      point: onPoints[0].near.point,
      confidence: overlap >= 25 ? "high" : "medium"
    };
  }

  /* One tag, one verdict. Returns null when the tag says nothing useful. */
  function checkLimit(kind, raw, mine, opts) {
    var limit = opts.weight ? U.parseWeight(raw) : U.parseLength(raw);
    if (limit === null || !isFinite(limit) || limit <= 0) return null;
    /* OSM occasionally carries absurd values; ignore rather than cry wolf. */
    if (!opts.weight && limit > 12) return null;
    if (opts.weight && limit > 200000) return null;

    if (limit < mine) {
      return {
        kind: kind, severity: "critical", limit: limit, mine: mine,
        margin: limit - mine, raw: String(raw)
      };
    }
    if (limit - mine <= opts.tight) {
      return {
        kind: kind, severity: "tight", limit: limit, mine: mine,
        margin: limit - mine, raw: String(raw)
      };
    }
    return null;
  }

  function describe(issue, p) {
    var imp = p.imperial;
    var fmt = issue.kind === "weight" || issue.kind === "axleload"
      ? function (v) { return F.weight(v, imp); }
      : function (v) { return F.dim(v, imp); };

    switch (issue.kind) {
      case "height":
        return issue.severity === "critical"
          ? "Low clearance " + fmt(issue.limit) + " — your truck is " + fmt(issue.mine)
          : "Clearance " + fmt(issue.limit) + " — only " + fmt(Math.abs(issue.margin)) + " to spare";
      case "weight":
        return issue.severity === "critical"
          ? "Weight limit " + fmt(issue.limit) + " — you are " + fmt(issue.mine)
          : "Weight limit " + fmt(issue.limit) + " — close to your " + fmt(issue.mine);
      case "width":
        return issue.severity === "critical"
          ? "Width limit " + fmt(issue.limit) + " — you are " + fmt(issue.mine)
          : "Width limit " + fmt(issue.limit) + " — tight";
      case "length":
        return issue.severity === "critical"
          ? "Length limit " + fmt(issue.limit) + " — you are " + fmt(issue.mine)
          : "Length limit " + fmt(issue.limit) + " — tight";
      case "axleload":
        return issue.severity === "critical"
          ? "Axle load limit " + fmt(issue.limit) + " — yours is " + fmt(issue.mine)
          : "Axle load limit " + fmt(issue.limit) + " — close";
      case "hgv-ban": return "No trucks permitted on this road";
      case "hgv-local": return "Trucks for local access only";
      case "hazmat": return "Hazmat prohibited on this road";
      default: return "Restriction";
    }
  }

  function issuesFor(el, p) {
    var t = el.tags || {};
    var out = [];
    var tightH = 0.15, tightW = 0.10, tightL = 0.5, tightWt = 1500;

    var h = checkLimit("height", t["maxheight"] || t["maxheight:physical"], p.height, { tight: tightH });
    if (h) out.push(h);
    var w = checkLimit("width", t["maxwidth"] || t["maxwidth:physical"], p.width, { tight: tightW });
    if (w) out.push(w);
    var l = checkLimit("length", t["maxlength"], p.length, { tight: tightL });
    if (l) out.push(l);
    var wt = checkLimit("weight", t["maxweight"] || t["maxweight:signed"], p.weight, { tight: tightWt, weight: true });
    if (wt) out.push(wt);
    var al = checkLimit("axleload", t["maxaxleload"], p.axleLoad, { tight: 500, weight: true });
    if (al) out.push(al);

    if (t.hgv === "no" || t.hgv === "private") {
      out.push({ kind: "hgv-ban", severity: "critical" });
    } else if (t.hgv === "destination" || t.hgv === "delivery" ||
               t.hgv === "agricultural" || t.hgv === "forestry") {
      out.push({ kind: "hgv-local", severity: "tight" });
    }
    if (p.hazmat && t.hazmat === "no") {
      out.push({ kind: "hazmat", severity: "critical" });
    }
    return out;
  }

  /* Split the route into corridor chunks small enough for one request each.
     Long routes widen the spacing rather than firing hundreds of requests; the
     buffer radius grows with it so a straighter sample still covers the bends,
     and the exact JS match keeps the extra width from producing noise. */
  function planChunks(route, level) {
    var maxChunks = MAX_CHUNKS[level] || MAX_CHUNKS.full;
    var budget = maxChunks * (PTS_PER_CHUNK - 1);
    var spacing = Math.max(MIN_SPACING, route.distance / budget);
    var pts = G.resample(route.line, spacing);
    var radius = Math.round(H.clamp(spacing / 4, 35, 300));
    var chunks = [];
    for (var i = 0; i < pts.length; i += PTS_PER_CHUNK - 1) {
      var slice = pts.slice(i, i + PTS_PER_CHUNK);
      if (slice.length >= 2) chunks.push(slice);
    }
    if (!chunks.length && pts.length >= 2) chunks.push(pts);
    /* No truncation here: dropping a chunk would leave a silent unchecked gap
       at the end of the route, which is the one failure this must never have. */
    return { chunks: chunks, radius: radius, spacing: spacing };
  }

  /* Walk the chunks with a small amount of concurrency, reporting as we go. */
  function runChunks(chunks, radius, onChunk) {
    var results = [], index = 0, failures = 0;
    var concurrency = Math.min(2, chunks.length);

    function next() {
      if (index >= chunks.length) return Promise.resolve();
      var mine = index++;
      return Services.overpass(corridorQuery(chunks[mine], radius), { timeout: 40000 })
        .then(function (d) {
          results.push(d);
          if (onChunk) onChunk(mine + 1, chunks.length, d);
        }, function () {
          failures++;
          if (onChunk) onChunk(mine + 1, chunks.length, null);
        })
        .then(next);
    }
    var runners = [];
    for (var i = 0; i < concurrency; i++) runners.push(next());
    return Promise.all(runners).then(function () {
      return { results: results, failures: failures, total: chunks.length };
    });
  }

  /* OSM splits one road into many ways, so a single truck ban shows up a dozen
     times in a row. The driver needs to see "no trucks on the Dan Ryan express
     lanes", once, not twelve identical lines. Merge runs of the same problem on
     the same road, keeping the most restrictive limit found. */
  function cluster(flags) {
    var out = [];
    flags.forEach(function (f) {
      var kinds = f.issues.map(function (i) { return i.kind; }).sort().join(",");
      for (var i = out.length - 1; i >= 0; i--) {
        var c = out[i];
        if (c.along < f.along - 3000) break;         // too far back to be the same run
        if (c.kindKey !== kinds || c.severity !== f.severity) continue;
        /* Slip roads and link ways are usually untagged with a name, and
           listing "no trucks" twice — once for the road, once for its ramp —
           just reads as a duplicate. Fold an unnamed way into the named one
           when they are close enough to be the same problem. */
        var sameName = (c.name || "") === (f.name || "");
        var oneUnnamed = (!c.name || !f.name) && (f.along - c.endAlong) < 800;
        if (!sameName && !oneUnnamed) continue;
        if (!c.name && f.name) c.name = f.name;
        /* Same problem, same road, close by: one entry. */
        c.count += 1;
        c.endAlong = Math.max(c.endAlong, f.along);
        mergeWorst(c, f);
        return;
      }
      f.kindKey = kinds;
      f.count = 1;
      f.endAlong = f.along;
      out.push(f);
    });
    return out;
  }

  /* Keep whichever reading is worst — a run of bridges is only as tall as its
     lowest span. */
  function mergeWorst(target, other) {
    other.issues.forEach(function (oi) {
      for (var i = 0; i < target.issues.length; i++) {
        var ti = target.issues[i];
        if (ti.kind !== oi.kind) continue;
        if (typeof oi.limit === "number" && typeof ti.limit === "number" && oi.limit < ti.limit) {
          target.issues[i] = oi;
          target.dirty = true;
        }
        return;
      }
    });
  }

  function auditRoute(route, profile, opts) {
    opts = opts || {};
    var plan = planChunks(route, opts.level || "full");
    return runChunks(plan.chunks, plan.radius, opts.onProgress).then(function (res) {
      var seen = {}, flags = [];
      res.results.forEach(function (d) {
        (d.elements || []).forEach(function (el) {
          var key = el.type + "/" + el.id;
          if (seen[key]) return;
          seen[key] = true;
          if (!isRoadLike(el)) return;

          var issues = issuesFor(el, profile);
          if (!issues.length) return;

          var match = matchToRoute(elementGeometry(el), route);
          if (!match) return;
          /* Service roads run alongside everything; only count one when the
             route demonstrably runs along it rather than merely near it. */
          if (el.tags.highway === "service" && match.confidence !== "high") return;

          var worst = "tight";
          issues.forEach(function (i) { if (i.severity === "critical") worst = "critical"; });
          flags.push({
            id: key,
            osmType: el.type,
            osmId: el.id,
            name: (el.tags && (el.tags.name || el.tags.ref)) || "",
            road: (el.tags && el.tags.highway) || "",
            bridge: !!(el.tags && (el.tags.bridge || el.tags.tunnel)),
            tunnel: !!(el.tags && el.tags.tunnel),
            severity: worst,
            issues: issues,
            confidence: match.confidence,
            along: match.along,
            lat: match.point[0],
            lon: match.point[1],
            text: issues.map(function (i) { return describe(i, profile); })
          });
        });
      });

      flags.sort(function (a, b) { return a.along - b.along; });
      flags = cluster(flags);

      flags.forEach(function (f) {
        if (f.dirty) {
          f.text = f.issues.map(function (i) { return describe(i, profile); });
          delete f.dirty;
        }
      });

      var critical = flags.filter(function (f) { return f.severity === "critical"; });
      var tight = flags.filter(function (f) { return f.severity === "tight"; });
      var partial = res.failures > 0;
      var covered = res.total > 0 ? (res.total - res.failures) / res.total : 0;

      /* Finding nothing is only good news if we actually looked. When no chunk
         came back, the honest answer is "unknown" — reporting a green "clear"
         for a route nobody checked is the worst thing this could do. */
      var verdict;
      if (critical.length) verdict = "blocked";
      else if (tight.length) verdict = "caution";
      else if (covered <= 0) verdict = "unknown";
      else verdict = "clear";

      route.audit = {
        flags: flags,
        critical: critical.length,
        tight: tight.length,
        coverage: covered,
        partial: partial,
        level: opts.level || "full",
        verdict: verdict,
        checkedAt: Date.now()
      };
      return route.audit;
    }, function (err) {
      route.audit = {
        flags: [], critical: 0, tight: 0, coverage: 0, partial: true,
        verdict: "unknown", error: err && err.message, checkedAt: Date.now()
      };
      return route.audit;
    });
  }

  /* What the route costs us once legality, time and preferences are weighed.
     A blocked route must always lose to a legal one, however much faster it is,
     so the per-violation penalty dwarfs any plausible time difference. */
  function score(route, profile) {
    var s = route.duration || 0;
    var a = route.audit;
    if (a) {
      s += a.critical * 12 * 3600;
      s += a.tight * 6 * 60;
      if (a.verdict === "unknown") s += 45 * 60;
      if (a.partial && a.verdict !== "unknown") s += 10 * 60;
    } else {
      s += 45 * 60;
    }
    /* An engine that never knew the truck's dimensions is a last resort. */
    if (!route.truckAware) s += 90 * 60;
    if (route.hasToll && profile.avoidTolls) s += 40 * 60;
    if (route.hasFerry && profile.avoidFerries) s += 60 * 60;
    /* Mild preference for shorter, since fuel is the driver's real cost. */
    s += (route.distance / 1000) * 4;
    return s;
  }

  function rank(routes, profile) {
    var scored = routes.map(function (r) {
      return { route: r, score: score(r, profile) };
    });
    scored.sort(function (a, b) { return a.score - b.score; });
    scored.forEach(function (s, i) { s.route.rank = i; s.route.score = s.score; });
    return scored.map(function (s) { return s.route; });
  }

  /* A short human verdict for the route card. */
  function verdictText(route, profile) {
    var a = route.audit;
    if (!a) return { tone: "unknown", label: "Not checked yet" };
    if (a.verdict === "unknown") return { tone: "unknown", label: "Could not check restrictions" };
    if (a.critical) {
      return {
        tone: "blocked",
        label: a.critical + " restriction" + (a.critical > 1 ? "s" : "") + " your truck cannot pass"
      };
    }
    if (a.tight) {
      return { tone: "caution", label: a.tight + " tight spot" + (a.tight > 1 ? "s" : "") + " — passable, stay alert" };
    }
    return {
      tone: "clear",
      label: route.truckAware ? "Clear for your truck" : "No conflicts found (car-profile route)"
    };
  }

  global.TW.Restrict = {
    audit: auditRoute,
    rank: rank,
    score: score,
    verdictText: verdictText,
    describe: describe,
    matchToRoute: matchToRoute,
    isRoadLike: isRoadLike
  };
})(window);

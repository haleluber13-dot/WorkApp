/* nav.js — turn-by-turn while the wheels are turning.
   Snaps the GPS fix to the route, works out what the next manoeuvre is and how
   far off it sits, speaks it in time to act on, and — the part a car navigator
   will not do — calls out the low bridge or weight limit ahead while there is
   still somewhere to turn. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, F = global.TW.F;

  /* How far off the line before we accept we are not on the route. One bad fix
     in a city canyon is normal; several in a row is a wrong turn. */
  var OFF_ROUTE_METRES = 55;
  var OFF_ROUTE_FIXES = 4;

  /* Manoeuvre call-outs. Distances in metres; the phrasing adapts to units. */
  var CALLS = [
    { at: 1600, key: "far", highwayOnly: true },
    { at: 800,  key: "mid" },
    { at: 250,  key: "near" },
    { at: 60,   key: "now" }
  ];

  /* Restriction warnings get called earlier — you need room to turn a 73-foot
     vehicle around, and the whole point is to hear it before the bridge. */
  var HAZARD_CALLS = [8000, 3000, 1200, 400];

  function Navigator() {
    this.route = null;
    this.profile = null;
    this.watchId = null;
    this.wakeLock = null;
    this.listeners = {};
    this.reset();
  }

  Navigator.prototype.reset = function () {
    this.active = false;
    this.position = null;      // raw fix
    this.snapped = null;       // [lat,lon] on the route
    this.along = 0;
    this.offRouteCount = 0;
    this.offRoute = false;
    this.stepIndex = 0;
    this.searchFrom = 0;
    this.spoken = {};
    this.hazardSpoken = {};
    this.startedAt = 0;
    this.lastSpeakAt = 0;
    this.heading = null;
    this.speed = 0;
  };

  Navigator.prototype.on = function (evt, fn) {
    (this.listeners[evt] = this.listeners[evt] || []).push(fn);
    return this;
  };

  Navigator.prototype.emit = function (evt, data) {
    (this.listeners[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { /* a bad listener must not stop navigation */ }
    });
  };

  /* ---------- voice ---------- */

  Navigator.prototype.speak = function (text, force) {
    if (!text) return;
    if (!this.profile || !this.profile.voice) return;
    if (typeof speechSynthesis === "undefined") return;
    var now = Date.now();
    /* Do not talk over ourselves unless it is urgent. */
    if (!force && now - this.lastSpeakAt < 2500) return;
    this.lastSpeakAt = now;
    try {
      if (force) speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.volume = this.profile.voiceVolume === undefined ? 1 : this.profile.voiceVolume;
      u.rate = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* speech is a nicety, never a failure */ }
    this.emit("spoke", text);
  };

  /* ---------- lifecycle ---------- */

  Navigator.prototype.start = function (route, profile) {
    if (!route || !route.line || route.line.length < 2) return false;
    this.reset();
    this.route = route;
    this.profile = profile;
    this.active = true;
    this.startedAt = Date.now();

    var self = this;
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        function (pos) { self.onFix(pos); },
        function (err) { self.emit("gpserror", err); },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
      );
    } else {
      this.emit("gpserror", { message: "This device has no location service." });
    }

    this.requestWakeLock();
    this.speak("Starting navigation. " + this.hazardPreamble(), true);
    this.emit("start", route);
    return true;
  };

  Navigator.prototype.stop = function () {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.releaseWakeLock();
    if (typeof speechSynthesis !== "undefined") {
      try { speechSynthesis.cancel(); } catch (e) {}
    }
    this.active = false;
    this.emit("stop");
  };

  Navigator.prototype.requestWakeLock = function () {
    var self = this;
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request("screen").then(function (lock) {
      self.wakeLock = lock;
    }).catch(function () { /* denied or unsupported — not fatal */ });
  };

  Navigator.prototype.releaseWakeLock = function () {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch (e) {}
      this.wakeLock = null;
    }
  };

  /* Said once at the start, so the driver knows what is coming. */
  Navigator.prototype.hazardPreamble = function () {
    var a = this.route && this.route.audit;
    if (!a) return "";
    if (a.critical) {
      return "Warning: " + a.critical + " restriction" + (a.critical > 1 ? "s" : "") +
             " on this route your truck cannot clear.";
    }
    if (a.tight) return a.tight + " tight clearance" + (a.tight > 1 ? "s" : "") + " ahead.";
    return "Route is clear for your truck.";
  };

  /* ---------- position handling ---------- */

  Navigator.prototype.onFix = function (pos) {
    if (!this.active || !this.route) return;
    var c = pos.coords;
    var here = [c.latitude, c.longitude];
    this.position = here;
    this.speed = c.speed === null || c.speed === undefined || isNaN(c.speed) ? this.speed : c.speed;
    if (c.heading !== null && c.heading !== undefined && !isNaN(c.heading)) this.heading = c.heading;
    this.update(here, c.accuracy || 20);
  };

  /* Feed a position in without a GPS — used by the simulator and by tests. */
  Navigator.prototype.simulate = function (latlon, speed) {
    this.position = latlon;
    if (speed !== undefined) this.speed = speed;
    this.update(latlon, 5);
  };

  Navigator.prototype.update = function (here, accuracy) {
    var route = this.route;
    /* Search a window around where we last were: it is far cheaper than
       scanning the whole line, and it stops a route that doubles back on
       itself from snapping to the wrong lap. */
    var window = 400;
    var near = G.nearestOnLine(here, route.line, route.cumulative,
                               Math.max(0, this.searchFrom - 40),
                               Math.min(route.line.length - 2, this.searchFrom + window));
    /* If the windowed search looks wrong, fall back to the whole line. */
    if (near.dist > 150) {
      var full = G.nearestOnLine(here, route.line, route.cumulative);
      if (full.dist < near.dist) near = full;
    }
    this.searchFrom = near.index;
    this.snapped = near.point;
    this.along = near.along;

    /* Off-route: only after several consecutive bad fixes, and never on a fix
       so imprecise that it proves nothing. */
    var tolerance = Math.max(OFF_ROUTE_METRES, accuracy * 1.5);
    if (near.dist > tolerance) {
      this.offRouteCount++;
      if (this.offRouteCount >= OFF_ROUTE_FIXES && !this.offRoute) {
        this.offRoute = true;
        this.speak("Off route. Recalculating.", true);
        this.emit("offroute", { position: here, distance: near.dist });
      }
    } else {
      if (this.offRoute) this.emit("backonroute", { position: here });
      this.offRoute = false;
      this.offRouteCount = 0;
    }

    var state = this.state();
    this.announce(state);
    this.emit("update", state);

    if (state.remaining < 40 && !this.arrived) {
      this.arrived = true;
      this.speak("You have arrived.", true);
      this.emit("arrive", state);
    }
  };

  /* ---------- derived state ---------- */

  /* Which step are we in? Steps carry the index of their first shape point, so
     the step we are performing is the last one that starts behind us. */
  Navigator.prototype.currentStep = function () {
    var steps = this.route.steps;
    if (!steps.length) return -1;
    var idx = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].index <= this.searchFrom) idx = i; else break;
    }
    return idx;
  };

  Navigator.prototype.state = function () {
    var route = this.route;
    var total = route.cumulative[route.cumulative.length - 1] || route.distance;
    var remaining = Math.max(0, total - this.along);
    var progress = total > 0 ? this.along / total : 0;

    var si = this.currentStep();
    this.stepIndex = si;
    var steps = route.steps;
    var next = si >= 0 && si + 1 < steps.length ? steps[si + 1] : null;
    var after = si >= 0 && si + 2 < steps.length ? steps[si + 2] : null;

    var toManeuver = null;
    if (next) {
      var atNext = route.cumulative[Math.min(next.index, route.cumulative.length - 1)];
      toManeuver = Math.max(0, atNext - this.along);
    }

    /* Remaining time from the engine's own estimate, scaled by progress, and
       corrected by actual speed when we have a believable one. */
    var eta = route.duration * (1 - progress);
    if (this.speed > 2 && remaining > 500) {
      var bySpeed = remaining / this.speed;
      eta = eta * 0.65 + bySpeed * 0.35;
    }

    return {
      position: this.position,
      snapped: this.snapped,
      along: this.along,
      remaining: remaining,
      progress: progress,
      offRoute: this.offRoute,
      speed: this.speed,
      heading: this.heading,
      step: si >= 0 ? steps[si] : null,
      next: next,
      after: after,
      toManeuver: toManeuver,
      eta: eta,
      hazards: this.hazardsAhead(6)
    };
  };

  /* Restrictions still in front of us, nearest first. */
  Navigator.prototype.hazardsAhead = function (limit) {
    var a = this.route && this.route.audit;
    if (!a || !a.flags) return [];
    var here = this.along;
    var out = [];
    for (var i = 0; i < a.flags.length; i++) {
      var f = a.flags[i];
      if (f.along < here - 50) continue;
      out.push({ flag: f, distance: Math.max(0, f.along - here) });
      if (out.length >= (limit || 6)) break;
    }
    return out;
  };

  /* ---------- what to say, and when ---------- */

  Navigator.prototype.announce = function (state) {
    if (!state.next || state.toManeuver === null) return;
    var imperial = this.profile.imperial;
    var key = "s" + this.stepIndex;
    var seen = this.spoken[key] || (this.spoken[key] = {});
    var isHighway = state.next.type.indexOf("exit") === 0 ||
                    state.next.type.indexOf("ramp") === 0 ||
                    state.next.type === "merge";

    for (var i = 0; i < CALLS.length; i++) {
      var call = CALLS[i];
      if (call.highwayOnly && !isHighway) continue;
      if (seen[call.key]) continue;
      if (state.toManeuver > call.at) continue;
      seen[call.key] = true;
      var phrase = state.next.verbal || state.next.text;
      if (call.key === "now") this.speak(phrase, true);
      else this.speak("In " + F.near(state.toManeuver, imperial) + ", " + lower(phrase));
      break;
    }

    this.announceHazards(state);
  };

  Navigator.prototype.announceHazards = function (state) {
    var imperial = this.profile.imperial;
    for (var i = 0; i < state.hazards.length; i++) {
      var h = state.hazards[i];
      if (h.flag.severity !== "critical" && h.distance > 3000) continue;
      var seen = this.hazardSpoken[h.flag.id] || (this.hazardSpoken[h.flag.id] = {});
      for (var j = 0; j < HAZARD_CALLS.length; j++) {
        var at = HAZARD_CALLS[j];
        if (h.distance > at || seen[at]) continue;
        /* Do not repeat the far call for a merely tight clearance. */
        if (h.flag.severity !== "critical" && at > 1500) { seen[at] = true; continue; }
        seen[at] = true;
        var lead = h.distance < 500 ? "Ahead" : "In " + F.near(h.distance, imperial);
        var what = h.flag.text[0] || "restriction";
        this.speak(lead + ": " + what, h.flag.severity === "critical");
        return;
      }
    }
  };

  function lower(s) {
    if (!s) return "";
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  /* ---------- route replacement after a reroute ---------- */

  Navigator.prototype.swapRoute = function (route) {
    this.route = route;
    this.searchFrom = 0;
    this.spoken = {};
    this.hazardSpoken = {};
    this.offRoute = false;
    this.offRouteCount = 0;
    this.arrived = false;
    if (this.position) this.update(this.position, 20);
    this.emit("routeswapped", route);
  };

  global.TW.Navigator = Navigator;

  /* Icons for each normalised manoeuvre type. */
  global.TW.MANEUVER_ICON = {
    "depart": "▲", "arrive": "◉", "straight": "↑",
    "left": "↰", "right": "↱",
    "slight-left": "↖", "slight-right": "↗",
    "sharp-left": "⬉", "sharp-right": "⬈",
    "uturn": "⤾", "merge": "⤭", "merge-left": "⤪", "merge-right": "⤬",
    "ramp-left": "↰", "ramp-right": "↱",
    "exit-left": "⤶", "exit-right": "⤷",
    "keep-left": "↖", "keep-right": "↗",
    "roundabout": "⟳", "ferry": "⛴"
  };
})(window);

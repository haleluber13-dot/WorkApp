/* hos.js — hours of service, and the thing that actually matters about them:
   where you are going to park before they run out.

   A clock that only counts down is a nagging device. The useful question is
   "given where I am on this route and how much driving I have left, which of
   the truck stops ahead can I still reach" — asked early enough that the answer
   is a parking space rather than a shoulder. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, F = global.TW.F;

  var KEY = "truckway.hos.v1";

  /* The limits drivers actually work to. These are the common cases, not legal
     advice, and the app says so — split sleeper berth, adverse-conditions
     extensions, short-haul exemptions and the rest are the driver's call. */
  var RULESETS = {
    us_property: {
      id: "us_property",
      label: "US · property-carrying",
      drive: 11 * 3600,          // driving in a duty period
      duty: 14 * 3600,           // the window it must happen inside
      breakAfter: 8 * 3600,      // driving before a break is required
      breakLength: 30 * 60,
      reset: 10 * 3600,          // off-duty needed to start a new period
      cycle: 70 * 3600,          // on-duty in the rolling cycle
      cycleDays: 8,
      restart: 34 * 3600
    },
    eu: {
      id: "eu",
      label: "EU · AETR/561",
      drive: 9 * 3600,           // 10 h twice a week, not modelled
      duty: 13 * 3600,
      breakAfter: 4.5 * 3600,
      breakLength: 45 * 60,
      reset: 11 * 3600,
      cycle: 56 * 3600,
      cycleDays: 7,
      restart: 45 * 3600
    },
    off: {
      id: "off", label: "Not tracked",
      drive: 0, duty: 0, breakAfter: 0, breakLength: 0, reset: 0, cycle: 0, cycleDays: 0, restart: 0
    }
  };

  var DEFAULTS = {
    ruleset: "us_property",
    driveUsed: 0,        // seconds driving in the current duty period
    dutyUsed: 0,         // seconds on duty in the current period
    sinceBreak: 0,       // seconds driving since the last qualifying break
    cycleUsed: 0,        // seconds on duty in the rolling cycle
    running: false,      // the clock is counting
    since: 0,            // ms timestamp the clock started counting
    updatedAt: 0
  };

  function load() {
    var s = H.load(KEY, null) || {};
    var out = {};
    for (var k in DEFAULTS) {
      out[k] = Object.prototype.hasOwnProperty.call(s, k) ? s[k] : DEFAULTS[k];
    }
    if (!RULESETS[out.ruleset]) out.ruleset = "us_property";
    return out;
  }

  function save(s) {
    s.updatedAt = Date.now();
    H.save(KEY, s);
    return s;
  }

  /* Elapsed time is derived from a timestamp rather than accumulated by a
     ticker, so the numbers stay right across a reload, a backgrounded tab or a
     phone that went to sleep for four hours. */
  function live() {
    var s = load();
    var rules = RULESETS[s.ruleset];
    var extra = s.running && s.since ? Math.max(0, (Date.now() - s.since) / 1000) : 0;
    return {
      raw: s,
      rules: rules,
      running: s.running,
      driveUsed: s.driveUsed + extra,
      dutyUsed: s.dutyUsed + extra,
      sinceBreak: s.sinceBreak + extra,
      cycleUsed: s.cycleUsed + extra
    };
  }

  /* Fold the running time into the stored totals. Called before any change. */
  function settle() {
    var s = load();
    if (s.running && s.since) {
      var extra = Math.max(0, (Date.now() - s.since) / 1000);
      s.driveUsed += extra;
      s.dutyUsed += extra;
      s.sinceBreak += extra;
      s.cycleUsed += extra;
      s.since = Date.now();
    }
    return s;
  }

  function remaining() {
    var st = live();
    var r = st.rules;
    if (r.id === "off") return null;
    return {
      drive: Math.max(0, r.drive - st.driveUsed),
      duty: Math.max(0, r.duty - st.dutyUsed),
      untilBreak: Math.max(0, r.breakAfter - st.sinceBreak),
      cycle: Math.max(0, r.cycle - st.cycleUsed),
      /* The binding one — whichever runs out first is what stops the truck. */
      limiting: null
    };
  }

  /* Which clock stops you first, and how long you have. */
  function binding() {
    var rem = remaining();
    if (!rem) return null;
    var options = [
      { key: "untilBreak", label: "30-minute break", seconds: rem.untilBreak, kind: "break" },
      { key: "drive", label: "driving limit", seconds: rem.drive, kind: "stop" },
      { key: "duty", label: "duty window", seconds: rem.duty, kind: "stop" },
      { key: "cycle", label: "cycle limit", seconds: rem.cycle, kind: "stop" }
    ];
    options.sort(function (a, b) { return a.seconds - b.seconds; });
    return { first: options[0], all: options, remaining: rem };
  }

  var Hos = {
    RULESETS: RULESETS,
    live: live,
    remaining: remaining,
    binding: binding,

    setRuleset: function (id) {
      var s = settle();
      if (RULESETS[id]) s.ruleset = id;
      return save(s);
    },

    start: function () {
      var s = settle();
      s.running = true;
      s.since = Date.now();
      return save(s);
    },

    pause: function () {
      var s = settle();
      s.running = false;
      s.since = 0;
      return save(s);
    },

    /* An off-duty period. Long enough and it resets the whole duty period;
       otherwise it just clears the break clock. */
    rest: function (seconds) {
      var s = settle();
      var rules = RULESETS[s.ruleset];
      s.running = false;
      s.since = 0;
      if (seconds >= rules.restart && rules.restart) {
        s.driveUsed = 0; s.dutyUsed = 0; s.sinceBreak = 0; s.cycleUsed = 0;
      } else if (seconds >= rules.reset) {
        s.driveUsed = 0; s.dutyUsed = 0; s.sinceBreak = 0;
      } else if (seconds >= rules.breakLength) {
        s.sinceBreak = 0;
      }
      return save(s);
    },

    /* Manual correction — drivers start the app mid-shift. */
    setUsed: function (patch) {
      var s = settle();
      ["driveUsed", "dutyUsed", "sinceBreak", "cycleUsed"].forEach(function (k) {
        if (typeof patch[k] === "number" && isFinite(patch[k])) s[k] = Math.max(0, patch[k]);
      });
      return save(s);
    },

    reset: function () {
      H.remove(KEY);
      return load();
    },

    /* ---------- the planner ---------- */

    /* Where can you legally still be when each clock runs out, and which of the
       stops ahead gets you off the road before that happens?

       `from` is how far along the route you already are, so this stays right
       after a reroute or when you pick it up mid-trip. */
    plan: function (route, pois, opts) {
      opts = opts || {};
      var b = binding();
      if (!b) return null;

      var from = opts.from || 0;
      var rem = b.remaining;
      /* Use the route's own average speed rather than a guess — it already
         accounts for the mix of motorway and town on this particular trip. */
      var speed = route.duration > 0 ? route.distance / route.duration : 22;
      var left = Math.max(0, route.distance - from);

      function reach(seconds) { return from + seconds * speed; }

      var hardStop = Math.min(rem.drive, rem.duty, rem.cycle);
      var stopAt = reach(hardStop);
      /* A break you would take after you must already have parked is not a
         break — cap it at the point the shift ends. */
      var breakAt = Math.min(reach(rem.untilBreak), stopAt);
      var finishes = left <= hardStop * speed;
      /* Once the two coincide there is only one stop to make, not two. */
      var breakSeparate = breakAt < stopAt - 1000;
      var margin = Math.min(15 * 60 * speed, 25000);

      return {
        rules: b.first,
        remaining: rem,
        speed: speed,
        breakAt: breakAt,
        stopAt: stopAt,
        margin: margin,
        finishesOnThisShift: finishes,
        breakSeparate: breakSeparate,
        /* A break can be taken anywhere with a safe place to pull in; the end
           of the shift needs somewhere you can actually sleep. */
        breakStop: breakSeparate
          ? pickStop(pois, from, breakAt, margin, ["truck_stop", "rest_area", "truck_parking", "fuel"])
          : null,
        restStop: pickStop(pois, from, stopAt, margin, ["truck_parking", "truck_stop", "rest_area"])
      };
    },

    /* A compact "3:12 driving left" for the navigation bar. */
    shortRemaining: function () {
      var b = binding();
      if (!b) return null;
      return { label: b.first.label, text: F.clock(b.first.seconds), seconds: b.first.seconds };
    }
  };

  /* The best place to stop is the latest one you can comfortably reach — not
     the nearest, and not the best-equipped. Stopping 200 miles early to get a
     shower throws away a third of the shift.

     So the margin is a preference rather than a cut-off: a stop inside the last
     quarter-hour of the clock is penalised steeply but still considered, which
     is what stops a well-appointed truck stop 200 miles back from beating the
     one that is ten minutes tight. Anything genuinely past the limit is out. */
  function pickStop(pois, from, limitAlong, margin, preferredCats) {
    if (!pois || !pois.length || !isFinite(limitAlong)) return null;

    var candidates = pois.filter(function (p) {
      return p.along > from + 2000 && p.along <= limitAlong &&
             preferredCats.indexOf(p.cat) >= 0;
    });

    /* What comes after the limit matters too: knowing the next stop is only
       ten miles past helps the driver decide whether to push or park early. */
    var beyond = null;
    pois.forEach(function (p) {
      if (p.along > limitAlong && preferredCats.indexOf(p.cat) >= 0) {
        if (!beyond || p.along < beyond.along) beyond = p;
      }
    });

    if (!candidates.length) {
      return beyond ? { poi: null, beyond: beyond, beyondBy: beyond.along - limitAlong } : null;
    }

    candidates.sort(function (a, b) {
      return score(b, limitAlong, margin, preferredCats) - score(a, limitAlong, margin, preferredCats);
    });
    var best = candidates[0];
    var slack = limitAlong - best.along;
    return {
      poi: best,
      slack: slack,
      tight: slack < margin,
      /* Flag a stop that gives up a lot of the shift, so the UI can explain
         why it is the pick and what the alternative costs. */
      early: slack > (limitAlong - from) * 0.35,
      beyond: beyond,
      beyondBy: beyond ? beyond.along - limitAlong : null
    };
  }

  function score(poi, limitAlong, margin, preferredCats) {
    /* Closeness to the limit dominates: a stop at 90% of your range is worth
       far more than one at 40%. */
    var closeness = poi.along / Math.max(1, limitAlong);
    var s = closeness * 100;
    /* Ramp a penalty through the safety margin — zero at its outer edge,
       heavy right on the limit. */
    var slack = limitAlong - poi.along;
    if (margin > 0 && slack < margin) {
      s -= 35 * (1 - slack / margin);
    }
    s -= (poi.detour / 1000) * 3;
    /* Prefer the categories earlier in the list — real truck parking over a
       filling station forecourt. */
    var rank = preferredCats.indexOf(poi.cat);
    s += (preferredCats.length - rank) * 4;
    if (poi.facilities.indexOf("overnight") >= 0) s += 6;
    if (poi.facilities.indexOf("showers") >= 0) s += 4;
    if (poi.facilities.indexOf("lit") >= 0) s += 2;
    (poi.facilities || []).forEach(function (f) {
      if (/truck spaces/.test(f)) s += 5;
    });
    if (poi.truckFriendly) s += 6;
    return s;
  }

  global.TW.Hos = Hos;
})(window);

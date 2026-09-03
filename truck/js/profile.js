/* profile.js — the truck itself.
   Every dimension is held in SI (metres, kilograms, litres). The unit system is
   purely a display and data-entry preference; nothing downstream reads it. */
(function (global) {
  "use strict";
  var H = global.TW.H, U = global.TW.U;

  var KEY = "truckway.profile.v1";

  /* Presets are starting points, not gospel — the driver adjusts from here.
     US figures are the common legal maxima; EU figures the usual C+E limits. */
  var PRESETS = [
    {
      id: "us-semi-53", label: "53′ Semi — dry van", region: "US", icon: "🚛",
      height: U.ftToM(13) + U.M_PER_IN * 6, width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(73), weight: U.lbToKg(80000), axleLoad: U.lbToKg(17000),
      axles: 5, hazmat: false, trailers: 1
    },
    {
      id: "us-semi-48", label: "48′ Semi — flatbed", region: "US", icon: "🛻",
      height: U.ftToM(13) + U.M_PER_IN * 6, width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(68), weight: U.lbToKg(80000), axleLoad: U.lbToKg(17000),
      axles: 5, hazmat: false, trailers: 1
    },
    {
      id: "us-tanker", label: "Tanker — hazmat", region: "US", icon: "⚠️",
      height: U.ftToM(13) + U.M_PER_IN * 6, width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(70), weight: U.lbToKg(80000), axleLoad: U.lbToKg(17000),
      axles: 5, hazmat: true, trailers: 1
    },
    {
      id: "us-reefer", label: "53′ Reefer", region: "US", icon: "❄️",
      height: U.ftToM(13) + U.M_PER_IN * 6, width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(73), weight: U.lbToKg(80000), axleLoad: U.lbToKg(17000),
      axles: 5, hazmat: false, trailers: 1
    },
    {
      id: "us-car-hauler", label: "Car hauler", region: "US", icon: "🚗",
      height: U.ftToM(14), width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(75), weight: U.lbToKg(80000), axleLoad: U.lbToKg(17000),
      axles: 5, hazmat: false, trailers: 1
    },
    {
      id: "us-box-26", label: "26′ Box truck", region: "US", icon: "📦",
      height: U.ftToM(13), width: U.ftToM(8) + U.M_PER_IN * 2,
      length: U.ftToM(26), weight: U.lbToKg(26000), axleLoad: U.lbToKg(13000),
      axles: 2, hazmat: false, trailers: 0
    },
    {
      id: "us-daycab", label: "Day cab — bobtail", region: "US", icon: "🚚",
      height: U.ftToM(13), width: U.ftToM(8) + U.M_PER_IN * 6,
      length: U.ftToM(24), weight: U.lbToKg(20000), axleLoad: U.lbToKg(10000),
      axles: 3, hazmat: false, trailers: 0
    },
    {
      id: "eu-artic", label: "EU artic 40 t", region: "EU", icon: "🚛",
      height: 4.0, width: 2.55, length: 16.5, weight: 40000, axleLoad: 11500,
      axles: 5, hazmat: false, trailers: 1
    },
    {
      id: "eu-rigid", label: "EU rigid 26 t", region: "EU", icon: "🚚",
      height: 4.0, width: 2.55, length: 12.0, weight: 26000, axleLoad: 11500,
      axles: 3, hazmat: false, trailers: 0
    },
    {
      id: "eu-van", label: "Van / 3.5 t", region: "EU", icon: "🚐",
      height: 2.9, width: 2.2, length: 6.0, weight: 3500, axleLoad: 2000,
      axles: 2, hazmat: false, trailers: 0
    }
  ];

  var DEFAULTS = {
    presetId: "us-semi-53",
    name: "My truck",
    /* Derived, not rounded: a hand-rounded kilogram value comes back out as
       79,999 lb and looks like a bug to anyone running at 80,000. */
    height: U.ftToM(13) + U.M_PER_IN * 6,
    width: U.ftToM(8) + U.M_PER_IN * 6,
    length: U.ftToM(73),
    weight: U.lbToKg(80000),
    axleLoad: U.lbToKg(17000),
    axles: 5,
    trailers: 1,
    hazmat: false,
    hazmatClass: "",          // "" | general | flammable | corrosive | explosive | poison | radioactive
    imperial: true,           // display in ft/in, lb, mi, gal
    currency: "USD",
    /* Routing preferences */
    avoidTolls: false,
    avoidFerries: true,
    avoidHighways: false,
    avoidUnpaved: true,
    /* Fuel */
    tank: 1135,               // litres (~300 US gal, twin tanks)
    fuelLevel: 0.5,           // fraction of tank remaining
    economy: 39.2,            // litres per 100 km (~6.0 US MPG)
    reserve: 0.15,            // never plan to drop below this fraction
    /* Hours of service, simplified */
    hosEnabled: true,
    driveLimit: 11 * 3600,    // seconds of driving before a mandatory stop
    breakAfter: 8 * 3600,     // seconds before the 30-minute break
    /* Voice */
    voice: true,
    voiceVolume: 1
  };

  var state = null;

  function coerce(raw) {
    var p = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) p[k] = DEFAULTS[k];
    if (raw && typeof raw === "object") {
      for (var key in p) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        var v = raw[key];
        if (typeof DEFAULTS[key] === "number") {
          v = parseFloat(v);
          if (!isFinite(v)) continue;
        } else if (typeof DEFAULTS[key] === "boolean") {
          v = !!v;
        }
        p[key] = v;
      }
    }
    return clampAll(p);
  }

  /* Keep dimensions inside physically sensible bounds. A zero height would make
     every low bridge "safe", which is the exact failure mode we cannot have. */
  function clampAll(p) {
    p.height   = H.clamp(p.height   || 0, 1.5, 8);
    p.width    = H.clamp(p.width    || 0, 1.4, 5);
    p.length   = H.clamp(p.length   || 0, 3,   40);
    p.weight   = H.clamp(p.weight   || 0, 500, 120000);
    p.axleLoad = H.clamp(p.axleLoad || 0, 300, 30000);
    p.axles    = Math.round(H.clamp(p.axles || 2, 2, 12));
    p.trailers = Math.round(H.clamp(p.trailers || 0, 0, 3));
    p.tank     = H.clamp(p.tank     || 1, 20, 4000);
    p.economy  = H.clamp(p.economy  || 1, 5, 200);
    p.fuelLevel = H.clamp(p.fuelLevel, 0, 1);
    p.reserve   = H.clamp(p.reserve, 0, 0.5);
    return p;
  }

  var Profile = {
    PRESETS: PRESETS,
    DEFAULTS: DEFAULTS,

    get: function () {
      if (!state) state = coerce(H.load(KEY, null));
      return state;
    },

    set: function (patch) {
      var p = Profile.get();
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) &&
            Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
          p[k] = patch[k];
        }
      }
      state = clampAll(p);
      H.save(KEY, state);
      return state;
    },

    applyPreset: function (id) {
      var preset = null;
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) preset = PRESETS[i];
      if (!preset) return Profile.get();
      return Profile.set({
        presetId: preset.id,
        height: preset.height, width: preset.width, length: preset.length,
        weight: preset.weight, axleLoad: preset.axleLoad,
        axles: preset.axles, trailers: preset.trailers, hazmat: preset.hazmat,
        imperial: preset.region === "US" ? true : false,
        currency: preset.region === "US" ? "USD" : "EUR"
      });
    },

    reset: function () {
      H.remove(KEY);
      state = coerce(null);
      return state;
    },

    /* Fuel economy expressed the way the driver entered it. */
    economyDisplay: function (p) {
      p = p || Profile.get();
      if (p.imperial) return (100 * U.L_PER_GAL / p.economy / (U.M_PER_MI / 1000)).toFixed(1);
      return p.economy.toFixed(1);
    },

    setEconomyDisplay: function (value) {
      var p = Profile.get();
      var v = parseFloat(value);
      if (!isFinite(v) || v <= 0) return p;
      if (p.imperial) {
        // value is US MPG -> litres per 100 km
        return Profile.set({ economy: 100 * U.L_PER_GAL / (v * U.M_PER_MI / 1000) });
      }
      return Profile.set({ economy: v });
    },

    /* Litres of diesel needed to cover a distance, ignoring terrain. */
    fuelFor: function (metres, p) {
      p = p || Profile.get();
      return (metres / 1000) * (p.economy / 100);
    },

    /* How far the truck can go on what is in the tank, keeping the reserve. */
    rangeMetres: function (p) {
      p = p || Profile.get();
      var usable = p.tank * Math.max(0, p.fuelLevel - p.reserve);
      return usable / (p.economy / 100) * 1000;
    },

    /* A one-line summary for the header: 13'6" · 80,000 lb · 5 axles */
    summary: function (p) {
      var F = global.TW.F;
      p = p || Profile.get();
      var bits = [F.dim(p.height, p.imperial), F.weight(p.weight, p.imperial), p.axles + " axles"];
      if (p.hazmat) bits.push("hazmat");
      return bits.join(" · ");
    }
  };

  global.TW.Profile = Profile;
})(window);

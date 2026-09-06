/* util.js — units, geometry and small helpers shared by every other module.
   Everything inside the app is stored in SI (metres, kilograms, m/s, litres);
   conversion to whatever the driver reads happens only at the display edge. */
(function (global) {
  "use strict";

  /* ---------- unit conversion ---------- */

  var M_PER_FT = 0.3048;
  var M_PER_IN = 0.0254;
  var M_PER_MI = 1609.344;
  var KG_PER_LB = 0.45359237;
  var L_PER_GAL = 3.785411784;

  var U = {
    M_PER_FT: M_PER_FT, M_PER_IN: M_PER_IN, M_PER_MI: M_PER_MI,
    KG_PER_LB: KG_PER_LB, L_PER_GAL: L_PER_GAL,

    ftToM: function (ft) { return ft * M_PER_FT; },
    mToFt: function (m) { return m / M_PER_FT; },
    miToM: function (mi) { return mi * M_PER_MI; },
    mToMi: function (m) { return m / M_PER_MI; },
    lbToKg: function (lb) { return lb * KG_PER_LB; },
    kgToLb: function (kg) { return kg / KG_PER_LB; },
    galToL: function (g) { return g * L_PER_GAL; },
    lToGal: function (l) { return l / L_PER_GAL; },

    /* "13'6\"" / "13 ft 6 in" / "4.1" / "4.1 m" -> metres. Bare numbers are
       metres, which matches the OSM convention for maxheight & friends. */
    parseLength: function (raw) {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "number") return isFinite(raw) ? raw : null;
      var s = String(raw).trim().toLowerCase();
      if (!s || s === "none" || s === "unsigned" || s === "no") return null;
      if (s === "default" || s === "below_default") return null;
      // 13'6" or 13'6 or 13' or 13'-6"
      var imp = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''|in|inch(?:es)?)?)?/);
      if (imp) {
        var ft = parseFloat(imp[1]);
        var inch = imp[2] ? parseFloat(imp[2]) : 0;
        return ft * M_PER_FT + inch * M_PER_IN;
      }
      var inOnly = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:"|''|in|inch(?:es)?)$/);
      if (inOnly) return parseFloat(inOnly[1]) * M_PER_IN;
      var m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(m|metre|meter|meters|metres)?$/);
      if (m) return parseFloat(m[1].replace(",", "."));
      var cm = s.match(/^(-?\d+(?:\.\d+)?)\s*cm$/);
      if (cm) return parseFloat(cm[1]) / 100;
      var num = parseFloat(s);
      return isFinite(num) ? num : null;
    },

    /* "120000 lbs" / "40 t" / "7.5" -> kilograms. Bare numbers are tonnes,
       again matching OSM's maxweight convention. */
    parseWeight: function (raw) {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "number") return isFinite(raw) ? raw * 1000 : null;
      var s = String(raw).trim().toLowerCase();
      if (!s || s === "none" || s === "unsigned" || s === "no") return null;
      if (s === "default" || s === "below_default") return null;
      var lb = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)$/);
      if (lb) return parseFloat(lb[1].replace(",", "")) * KG_PER_LB;
      var st = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:st|short\s*tons?|tons?)$/);
      if (st) return parseFloat(st[1].replace(",", ".")) * 907.18474;
      var kg = s.match(/^(-?\d+(?:[.,]\d+)?)\s*kg$/);
      if (kg) return parseFloat(kg[1].replace(",", "."));
      var t = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)?$/);
      if (t) return parseFloat(t[1].replace(",", ".")) * 1000;
      var num = parseFloat(s);
      return isFinite(num) ? num * 1000 : null;
    }
  };

  /* ---------- formatting ---------- */

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  var F = {
    /* Long-haul distance. US drivers read miles; everyone else kilometres. */
    dist: function (metres, imperial, precise) {
      if (metres === null || metres === undefined || !isFinite(metres)) return "—";
      if (imperial) {
        var mi = metres / M_PER_MI;
        if (mi < 0.19) return Math.round(metres / M_PER_FT / 10) * 10 + " ft";
        if (mi < 10 || precise) return mi.toFixed(1) + " mi";
        return Math.round(mi) + " mi";
      }
      if (metres < 950) return Math.round(metres / 10) * 10 + " m";
      var km = metres / 1000;
      if (km < 10 || precise) return km.toFixed(1) + " km";
      return Math.round(km) + " km";
    },

    /* Short distance used by the navigation banner ("in 900 ft"). */
    near: function (metres, imperial) {
      if (metres === null || !isFinite(metres)) return "—";
      if (imperial) {
        var ft = metres / M_PER_FT;
        if (ft < 1000) return Math.max(50, Math.round(ft / 50) * 50) + " ft";
        return (metres / M_PER_MI).toFixed(1) + " mi";
      }
      if (metres < 1000) return Math.max(20, Math.round(metres / 20) * 20) + " m";
      return (metres / 1000).toFixed(1) + " km";
    },

    dim: function (metres, imperial) {
      if (metres === null || metres === undefined || !isFinite(metres)) return "—";
      if (imperial) {
        var totalIn = Math.round(metres / M_PER_IN);
        return Math.floor(totalIn / 12) + "'" + (totalIn % 12) + '"';
      }
      return metres.toFixed(2).replace(/0$/, "").replace(/\.$/, "") + " m";
    },

    weight: function (kg, imperial) {
      if (kg === null || kg === undefined || !isFinite(kg)) return "—";
      if (imperial) return Math.round(kg / KG_PER_LB).toLocaleString() + " lb";
      return (kg / 1000).toFixed(kg < 10000 ? 1 : 0) + " t";
    },

    speed: function (mps, imperial) {
      if (mps === null || !isFinite(mps)) return "—";
      return imperial ? Math.round(mps / M_PER_MI * 3600) + " mph"
                      : Math.round(mps * 3.6) + " km/h";
    },

    volume: function (litres, imperial) {
      if (litres === null || !isFinite(litres)) return "—";
      return imperial ? Math.round(litres / L_PER_GAL) + " gal"
                      : Math.round(litres) + " L";
    },

    /* Seconds -> "6 h 12 min" / "45 min". */
    dur: function (sec) {
      if (sec === null || sec === undefined || !isFinite(sec)) return "—";
      sec = Math.max(0, Math.round(sec));
      var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
      if (m === 60) { h += 1; m = 0; }
      if (h > 0) return h + " h" + (m ? " " + m + " min" : "");
      if (sec < 60) return sec + " s";
      return m + " min";
    },

    /* Seconds -> "6:12", for the compact navigation strip. */
    clock: function (sec) {
      if (!isFinite(sec)) return "—";
      sec = Math.max(0, Math.round(sec));
      var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return h > 0 ? h + ":" + pad2(m) : m + " min";
    },

    /* An arrival time the driver can compare against a delivery window. */
    eta: function (secondsFromNow) {
      if (!isFinite(secondsFromNow)) return "—";
      var d = new Date(Date.now() + secondsFromNow * 1000);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    },

    /* mode "unit" is a price per gallon or litre, which is quoted to a tenth
       of a cent; everything else is a total and gets two decimals. */
    money: function (value, currency, mode) {
      if (value === null || value === undefined || !isFinite(value)) return "—";
      var digits = mode === "unit" ? 3 : 2;
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency", currency: currency || "USD",
          minimumFractionDigits: digits, maximumFractionDigits: digits
        }).format(value);
      } catch (e) {
        return (currency || "$") + value.toFixed(digits);
      }
    },

    ago: function (ts) {
      var s = (Date.now() - ts) / 1000;
      if (s < 90) return "just now";
      if (s < 3600) return Math.round(s / 60) + " min ago";
      if (s < 86400) return Math.round(s / 3600) + " h ago";
      return Math.round(s / 86400) + " d ago";
    }
  };

  /* ---------- geometry ---------- */

  var R_EARTH = 6371008.8;
  var toRad = function (d) { return d * Math.PI / 180; };
  var toDeg = function (r) { return r * 180 / Math.PI; };

  var G = {
    toRad: toRad,
    toDeg: toDeg,

    /* Great-circle distance in metres between [lat,lon] pairs. */
    haversine: function (a, b) {
      var dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
      var la1 = toRad(a[0]), la2 = toRad(b[0]);
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
    },

    bearing: function (a, b) {
      var la1 = toRad(a[0]), la2 = toRad(b[0]), dLon = toRad(b[1] - a[1]);
      var y = Math.sin(dLon) * Math.cos(la2);
      var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    },

    /* Smallest signed difference between two compass bearings, in degrees. */
    bearingDelta: function (a, b) {
      var d = ((b - a + 540) % 360) - 180;
      return d;
    },

    /* Local equirectangular projection — accurate enough over the few hundred
       metres we use it for, and far cheaper than repeated haversines. */
    project: function (pt, originLat) {
      var k = Math.cos(toRad(originLat));
      return [toRad(pt[1]) * k * R_EARTH, toRad(pt[0]) * R_EARTH];
    },

    /* Perpendicular distance from p to segment a-b, plus the closest point and
       how far along the segment (0..1) it falls. */
    pointToSegment: function (p, a, b) {
      var lat0 = a[0];
      var P = G.project(p, lat0), A = G.project(a, lat0), B = G.project(b, lat0);
      var vx = B[0] - A[0], vy = B[1] - A[1];
      var wx = P[0] - A[0], wy = P[1] - A[1];
      var len2 = vx * vx + vy * vy;
      var t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      var cx = A[0] + t * vx, cy = A[1] + t * vy;
      var dx = P[0] - cx, dy = P[1] - cy;
      return {
        dist: Math.sqrt(dx * dx + dy * dy),
        t: t,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
      };
    },

    /* Nearest point on a polyline. Returns the distance, the snapped position,
       the segment index and the distance travelled along the line to get there.
       `cumulative` is an optional precomputed prefix-sum of segment lengths;
       `from`/`to` narrow the search when we already know roughly where we are. */
    nearestOnLine: function (p, line, cumulative, from, to) {
      var best = { dist: Infinity, index: 0, t: 0, point: line[0] || p, along: 0 };
      if (!line || line.length === 0) return best;
      if (line.length === 1) {
        best.dist = G.haversine(p, line[0]);
        return best;
      }
      var start = Math.max(0, from || 0);
      var end = Math.min(line.length - 2, to === undefined ? line.length - 2 : to);
      for (var i = start; i <= end; i++) {
        var r = G.pointToSegment(p, line[i], line[i + 1]);
        if (r.dist < best.dist) {
          best.dist = r.dist;
          best.index = i;
          best.t = r.t;
          best.point = r.point;
        }
      }
      if (cumulative) {
        var segLen = cumulative[best.index + 1] - cumulative[best.index];
        best.along = cumulative[best.index] + segLen * best.t;
      }
      return best;
    },

    /* Prefix sums of segment lengths, so "how far along am I" is O(1). */
    cumulative: function (line) {
      var out = [0];
      for (var i = 1; i < line.length; i++) {
        out.push(out[i - 1] + G.haversine(line[i - 1], line[i]));
      }
      return out;
    },

    length: function (line) {
      var c = G.cumulative(line);
      return c[c.length - 1] || 0;
    },

    /* Drop points that add less than `tolerance` metres of detail. Used to keep
       Overpass corridor queries inside a sane URL length. */
    simplify: function (line, tolerance) {
      if (!line || line.length < 3) return (line || []).slice();
      var out = [line[0]];
      var last = line[0];
      for (var i = 1; i < line.length - 1; i++) {
        if (G.haversine(last, line[i]) >= tolerance) {
          out.push(line[i]);
          last = line[i];
        }
      }
      out.push(line[line.length - 1]);
      return out;
    },

    /* Resample a line to a point roughly every `step` metres — an even spread
       is what `around:` corridor queries want, rather than a shape-preserving
       simplification that clusters points in the bends. */
    resample: function (line, step) {
      if (!line || line.length === 0) return [];
      var out = [line[0]];
      var carry = 0;
      for (var i = 1; i < line.length; i++) {
        var a = line[i - 1], b = line[i];
        var d = G.haversine(a, b);
        if (d === 0) continue;
        var pos = step - carry;
        while (pos <= d) {
          var t = pos / d;
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          pos += step;
        }
        carry = (carry + d) % step;
      }
      var end = line[line.length - 1];
      if (G.haversine(out[out.length - 1], end) > step * 0.25) out.push(end);
      return out;
    },

    bbox: function (line, padMetres) {
      var b = [Infinity, Infinity, -Infinity, -Infinity]; // s, w, n, e
      for (var i = 0; i < line.length; i++) {
        b[0] = Math.min(b[0], line[i][0]); b[2] = Math.max(b[2], line[i][0]);
        b[1] = Math.min(b[1], line[i][1]); b[3] = Math.max(b[3], line[i][1]);
      }
      if (padMetres) {
        var dLat = padMetres / 111320;
        var midLat = (b[0] + b[2]) / 2;
        var dLon = padMetres / (111320 * Math.max(0.05, Math.cos(toRad(midLat))));
        b[0] -= dLat; b[2] += dLat; b[1] -= dLon; b[3] += dLon;
      }
      return b;
    },

    /* Google's encoded polyline. Valhalla uses precision 6, OSRM either. */
    decodePolyline: function (str, precision) {
      var factor = Math.pow(10, precision === undefined ? 5 : precision);
      var index = 0, lat = 0, lon = 0, out = [];
      while (index < str.length) {
        var b, shift = 0, result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
        shift = 0; result = 0;
        do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lon += ((result & 1) ? ~(result >> 1) : (result >> 1));
        out.push([lat / factor, lon / factor]);
      }
      return out;
    }
  };

  /* ---------- misc ---------- */

  var H = {
    /* localStorage that never throws — private mode and full quotas are real. */
    load: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    save: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    },

    uid: function () {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    /* Stable 32-bit hash — used to give a station a consistent pseudo-random
       offset instead of one that changes on every render. */
    hash: function (str) {
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      return h >>> 0;
    },

    clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },

    debounce: function (fn, wait) {
      var t;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, wait);
      };
    },

    escape: function (s) {
      return String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },

    /* fetch with a timeout, because a hung routing server should fall through
       to the next engine rather than freeze the app. */
    fetchJSON: function (url, opts) {
      opts = opts || {};
      var ms = opts.timeout || 25000;
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
      var init = { method: opts.method || "GET", headers: opts.headers || {} };
      if (opts.body !== undefined) init.body = opts.body;
      if (ctrl) init.signal = ctrl.signal;
      return fetch(url, init).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) {
          return res.text().then(function (t) {
            var err = new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 200) : ""));
            err.status = res.status;
            throw err;
          });
        }
        return res.json();
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
    }
  };

  global.TW = global.TW || {};
  global.TW.U = U;
  global.TW.F = F;
  global.TW.G = G;
  global.TW.H = H;
})(window);

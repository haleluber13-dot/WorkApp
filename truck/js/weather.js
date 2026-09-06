/* weather.js — the weather where you will be when you get there.
   Forecasts along the route, sampled at the hour you are actually predicted to
   reach each point rather than the weather now. The alerts are tuned for a
   high-sided vehicle: a crosswind that a car would not notice is what puts an
   empty box trailer on its side. */
(function (global) {
  "use strict";
  var H = global.TW.H, G = global.TW.G, F = global.TW.F;

  var API = "https://api.open-meteo.com/v1/forecast";
  var SAMPLES = 10;

  /* Gust thresholds in m/s. A loaded trailer is far more stable than an empty
     one, so the profile shifts them — but the high figure is the one where
     highway agencies start closing roads to high-sided vehicles. */
  var GUST_HIGH = 18;      // ~40 mph — genuine rollover risk, consider stopping
  var GUST_CAUTION = 13;   // ~29 mph — you will feel it, especially on bridges

  var WMO = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail"
  };

  var FREEZING_CODES = { 56: 1, 57: 1, 66: 1, 67: 1, 48: 1 };
  var SNOW_CODES = { 71: 1, 73: 1, 75: 1, 77: 1, 85: 1, 86: 1 };

  function icon(code, gust) {
    if (gust >= GUST_CAUTION) return "💨";
    if (SNOW_CODES[code]) return "❄️";
    if (FREEZING_CODES[code]) return "🧊";
    if (code >= 95) return "⛈️";
    if (code >= 80 || (code >= 61 && code <= 67)) return "🌧️";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 57) return "🌦️";
    if (code === 3) return "☁️";
    if (code === 1 || code === 2) return "⛅";
    return "☀️";
  }

  /* Evenly spaced points, each tagged with when we expect to be there. */
  function samplePoints(route, startAt) {
    var out = [];
    var total = route.cumulative[route.cumulative.length - 1] || route.distance;
    var n = Math.max(2, Math.min(SAMPLES, Math.round(route.distance / 40000) + 2));
    for (var i = 0; i < n; i++) {
      var along = total * (i / (n - 1));
      /* Find the shape point at that distance. */
      var idx = 0;
      while (idx < route.cumulative.length - 1 && route.cumulative[idx] < along) idx++;
      var pt = route.line[Math.min(idx, route.line.length - 1)];
      out.push({
        along: along,
        lat: pt[0], lon: pt[1],
        at: startAt + (route.duration * (along / Math.max(1, total))) * 1000
      });
    }
    return out;
  }

  /* Open-Meteo returns hourly arrays in the location's own local time, with no
     offset unless asked — so request UTC and compare against UTC throughout. */
  function hourIndex(times, targetMs) {
    var best = 0, bestDelta = Infinity;
    for (var i = 0; i < times.length; i++) {
      var t = Date.parse(times[i] + "Z");
      var d = Math.abs(t - targetMs);
      if (d < bestDelta) { bestDelta = d; best = i; }
    }
    return best;
  }

  function assess(sample, profile) {
    var issues = [];
    var gust = sample.gust;
    var code = sample.code;

    /* An empty or light trailer catches the wind far more than a loaded one. */
    var loaded = profile.weight > 20000;
    var tall = profile.height >= 3.6;
    var gustHigh = loaded ? GUST_HIGH + 2 : GUST_HIGH;
    var gustCaution = loaded ? GUST_CAUTION + 2 : GUST_CAUTION;
    if (!tall) { gustHigh += 4; gustCaution += 4; }

    if (gust >= gustHigh) {
      issues.push({
        severity: "critical", kind: "wind",
        text: "Gusts to " + F.speed(gust, profile.imperial) +
              " — high rollover risk for a " + F.dim(profile.height, profile.imperial) +
              " vehicle. Bridges and open country are the worst of it."
      });
    } else if (gust >= gustCaution) {
      issues.push({
        severity: "tight", kind: "wind",
        text: "Gusty — " + F.speed(gust, profile.imperial) + ". Expect to be pushed on exposed stretches."
      });
    }

    if (FREEZING_CODES[code] || (sample.temp <= 1 && sample.precip > 0.1)) {
      issues.push({
        severity: "critical", kind: "ice",
        text: "Ice risk — " + Math.round(sample.temp) + "°C with precipitation."
      });
    } else if (SNOW_CODES[code]) {
      issues.push({
        severity: code === 75 || code === 86 ? "critical" : "tight",
        kind: "snow", text: (WMO[code] || "Snow") + " forecast."
      });
    }

    if (sample.vis !== null && sample.vis < 500) {
      issues.push({ severity: "critical", kind: "fog", text: "Dense fog — visibility under 500 m." });
    } else if (sample.vis !== null && sample.vis < 2000) {
      issues.push({ severity: "tight", kind: "fog", text: "Poor visibility — " + Math.round(sample.vis) + " m." });
    }

    if (code >= 95) {
      issues.push({ severity: "tight", kind: "storm", text: "Thunderstorms in the area." });
    } else if (sample.precip >= 5) {
      issues.push({ severity: "tight", kind: "rain", text: "Heavy rain — standing water and spray." });
    }
    return issues;
  }

  function forRoute(route, profile, opts) {
    opts = opts || {};
    var startAt = opts.startAt || Date.now();
    var points = samplePoints(route, startAt);
    if (!points.length) return Promise.resolve({ points: [], alerts: [], ok: false });

    var lats = points.map(function (p) { return p.lat.toFixed(3); }).join(",");
    var lons = points.map(function (p) { return p.lon.toFixed(3); }).join(",");
    var url = API + "?latitude=" + lats + "&longitude=" + lons +
      "&hourly=wind_gusts_10m,wind_speed_10m,precipitation,temperature_2m,visibility,weather_code" +
      "&wind_speed_unit=ms&timezone=UTC&forecast_days=3";

    return H.fetchJSON(url, { timeout: 20000 }).then(function (d) {
      var list = Array.isArray(d) ? d : [d];
      var out = [];
      points.forEach(function (p, i) {
        var loc = list[i] || list[0];
        if (!loc || !loc.hourly) return;
        var h = loc.hourly;
        var idx = hourIndex(h.time, p.at);
        var sample = {
          along: p.along, lat: p.lat, lon: p.lon, at: p.at,
          gust: num(h.wind_gusts_10m, idx),
          wind: num(h.wind_speed_10m, idx),
          precip: num(h.precipitation, idx) || 0,
          temp: num(h.temperature_2m, idx),
          vis: num(h.visibility, idx),
          code: h.weather_code ? h.weather_code[idx] : 0
        };
        sample.label = WMO[sample.code] || "";
        sample.icon = icon(sample.code, sample.gust);
        sample.issues = assess(sample, profile);
        sample.severity = sample.issues.reduce(function (acc, i) {
          return i.severity === "critical" ? "critical" : (acc === "critical" ? acc : i.severity);
        }, "");
        out.push(sample);
      });

      /* Collapse neighbouring samples with the same problem into one alert, so
         a 300-mile windy stretch is one line, not eight. */
      var alerts = [];
      out.forEach(function (s) {
        s.issues.forEach(function (issue) {
          var last = alerts[alerts.length - 1];
          if (last && last.kind === issue.kind && last.severity === issue.severity &&
              s.along - last.endAlong < 160000) {
            last.endAlong = s.along;
            if (issue.kind === "wind" && s.gust > last.peak) {
              last.peak = s.gust;
              last.text = issue.text;
            }
            return;
          }
          alerts.push({
            kind: issue.kind, severity: issue.severity, text: issue.text,
            along: s.along, endAlong: s.along, peak: s.gust || 0,
            at: s.at, lat: s.lat, lon: s.lon
          });
        });
      });

      return { points: out, alerts: alerts, ok: true, fetchedAt: Date.now() };
    }).catch(function (err) {
      return { points: [], alerts: [], ok: false, error: err && err.message };
    });
  }

  function num(arr, i) {
    if (!arr) return null;
    var v = arr[i];
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  global.TW.Weather = {
    forRoute: forRoute,
    WMO: WMO,
    icon: icon,
    GUST_HIGH: GUST_HIGH,
    GUST_CAUTION: GUST_CAUTION
  };
})(window);

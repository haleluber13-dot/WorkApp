/* ui.js — turning app state into something readable at a glance.
   Pure rendering: it produces markup and wires the controls inside it, but it
   never fetches anything and never decides anything. app.js owns the state. */
(function (global) {
  "use strict";
  var H = global.TW.H, F = global.TW.F, U = global.TW.U;
  var Profile = global.TW.Profile, POI = global.TW.POI, Fuel = global.TW.Fuel;
  var Restrict = global.TW.Restrict;
  var Hos = global.TW.Hos, Weather = global.TW.Weather, Places = global.TW.Places;

  var $ = function (id) { return document.getElementById(id); };
  var esc = H.escape;

  /* "0 ft in" reads oddly for a stop beside the yard you are leaving. */
  function alongText(metres, imperial) {
    if (metres < 150) return "at the start";
    return F.dist(metres, imperial) + " in";
  }

  var toastTimer = null;
  function toast(msg, tone, ms) {
    var el = $("toast");
    el.textContent = msg;
    el.setAttribute("data-tone", tone || "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 3200);
  }

  /* ---------- modal ---------- */

  function openModal(title, bodyHTML, onMount) {
    var m = $("modal");
    m.innerHTML =
      '<div class="modal__panel">' +
        '<div class="modal__head"><h2>' + esc(title) + '</h2>' +
        '<button class="iconbtn iconbtn--flat" data-close>✕</button></div>' +
        '<div class="modal__body">' + bodyHTML + '</div>' +
      '</div>';
    m.hidden = false;
    m.querySelector("[data-close]").onclick = closeModal;
    m.onclick = function (e) { if (e.target === m) closeModal(); };
    if (onMount) onMount(m);
    return m;
  }

  function closeModal() {
    var m = $("modal");
    m.hidden = true;
    m.innerHTML = "";
  }

  /* ---------- shared fragments ---------- */

  function verdictPill(route) {
    if (!route.audit) return '<span class="pill"><span class="spinner"></span> checking</span>';
    var v = Restrict.verdictText(route);
    var cls = { clear: "pill--ok", caution: "pill--warn", blocked: "pill--bad", unknown: "pill" }[v.tone];
    var icon = { clear: "✓", caution: "▲", blocked: "✕", unknown: "?" }[v.tone];
    return '<span class="pill ' + cls + '">' + icon + " " + esc(shortVerdict(route, v)) + "</span>";
  }

  function shortVerdict(route, v) {
    var a = route.audit;
    if (!a || v.tone === "unknown") return "unchecked";
    if (a.critical) return a.critical + " blocked";
    if (a.tight) return a.tight + " tight";
    return "clear";
  }

  function engineBadge(route) {
    if (route.truckAware) {
      return '<span class="pill pill--info">🚛 ' + esc(route.engineLabel) + "</span>";
    }
    return '<span class="pill pill--warn">⚠ car profile</span>';
  }

  /* ---------- route tab ---------- */

  function renderRoutes(state) {
    var p = Profile.get();
    if (state.routing) {
      return '<div class="empty"><span class="spinner"></span>' +
             '<h2 style="margin-top:12px">Comparing truck routes…</h2>' +
             '<p>' + esc(state.routingNote || "Asking every routing engine that knows about trucks.") + "</p></div>";
    }
    if (!state.routes.length && (Places.saved().length || Places.recents().length) && !state.error) {
      return '<div class="empty" style="padding-bottom:16px"><h2>Where are you headed?</h2>' +
             '<p class="tiny">Pick one you have been to before, or type a destination above.</p></div>' +
             renderPlacesPanel();
    }
    if (!state.routes.length) {
      return $("sheetBody") && state.error
        ? '<div class="card card--bad"><b>Could not build a route</b><p class="muted tiny" style="margin:6px 0 0">' +
          esc(state.error) + "</p></div>"
        : null;
    }

    var html = "";
    var blocked = state.routes.filter(function (r) { return r.audit && r.audit.verdict === "blocked"; });
    if (blocked.length === state.routes.length && state.routes.length) {
      html += '<div class="card card--bad"><b>Every route we found has a conflict</b>' +
              '<p class="muted tiny" style="margin:6px 0 0">Check the Warnings tab. You may need a permit, ' +
              'or the truck dimensions may be set higher than what you are actually running.</p></div>';
    }

    state.routes.forEach(function (r) {
      var picked = r.id === state.selectedId;
      var v = r.audit ? Restrict.verdictText(r) : { tone: "unknown", label: "Checking restrictions…" };
      var cls = "card" + (picked ? " card--pick" : "") +
                (r.audit && r.audit.verdict === "blocked" ? " card--bad" : "") +
                (r.audit && r.audit.verdict === "caution" ? " card--warn" : "");

      html += '<div class="' + cls + '" data-route="' + r.id + '">';
      html +=   '<div class="route__head"><div class="spread">';
      html +=     '<div class="route__nums"><span class="big">' + F.dur(r.duration) + "</span>" +
                  '<span class="muted">' + F.dist(r.distance, p.imperial) + "</span></div>";
      html +=     '<div class="route__engine">' + esc(r.engineLabel) +
                  (r.variant ? " · " + esc(r.variant) : "") +
                  " · arrive " + F.eta(r.duration) + "</div>";
      html +=   "</div>";
      html +=   (picked ? '<span class="pill pill--info">selected</span>' : "");
      html +=   "</div>";

      html +=   '<div class="route__verdict" data-tone="' + v.tone + '">';
      html +=     (r.audit ? "" : '<span class="spinner"></span> ') + esc(v.label);
      html +=   "</div>";

      html +=   '<div class="pills">' + engineBadge(r);
      if (r.hasToll) html += '<span class="pill">toll</span>';
      if (r.hasFerry) html += '<span class="pill">ferry</span>';
      if (r.audit && r.audit.partial) html += '<span class="pill pill--warn">partial check</span>';
      html +=   "</div>";

      if (picked) {
        html += '<div class="btnrow">';
        html +=   '<button class="btn btn--go" data-act="start">▶ Start navigation</button>';
        html +=   '<button class="btn" data-act="steps">Directions</button>';
        html += "</div>";
        html += '<div class="btnrow">';
        html +=   '<button class="btn" data-act="savedest">' +
                  (state.to && Places.isSaved(state.to) ? "★ Saved" : "☆ Save destination") + "</button>";
        html +=   '<button class="btn" data-act="miles">State miles</button>';
        html += "</div>";
        html += renderMileage(state, p);
        if (state.showSteps) html += renderSteps(r, p);
      }
      html += "</div>";
    });
    return html;
  }

  /* Per-jurisdiction mileage, for the quarterly fuel-tax return. */
  function renderMileage(state, p) {
    if (state.milesLoading) {
      return '<div class="card" style="margin-top:10px"><span class="spinner"></span> ' +
             "Working out the state lines" +
             (state.milesProgress ? " (" + Math.round(state.milesProgress * 100) + "%)" : "") +
             "…<p class=\"tiny faint\" style=\"margin:8px 0 0\">Paced to stay within the map " +
             "service's usage limits, so it takes a minute.</p></div>";
    }
    var m = state.miles;
    if (!m) return "";
    if (!m.ok) {
      return '<div class="card" style="margin-top:10px"><span class="tiny muted">' +
             esc(m.reason || "Could not work out the regions.") + "</span></div>";
    }
    var html = '<div class="card" style="margin-top:10px">' +
               '<div class="sectionhead" style="margin:0 0 8px"><span>Miles by region</span>' +
               "<span>approximate</span></div>";
    m.rows.forEach(function (row) {
      html += '<div class="row row--between" style="padding:5px 0">' +
              "<span>" + esc(row.label) + ' <span class="faint tiny">' + esc(row.code) + "</span></span>" +
              "<b>" + F.dist(row.metres, p.imperial) + "</b></div>";
    });
    html += '<p class="tiny faint" style="margin:8px 0 0">Estimated from the planned route by locating ' +
            "each border crossing to within about a mile. It is not a record of where the truck went.</p>";
    return html + "</div>";
  }

  function renderSteps(route, p) {
    var icons = global.TW.MANEUVER_ICON;
    var html = '<div class="steps">';
    route.steps.forEach(function (s) {
      html += '<div class="step">' +
                '<div class="step__icon">' + (icons[s.type] || "↑") + "</div>" +
                '<div class="spread"><div>' + esc(s.text) + "</div>" +
                (s.exit ? '<div class="tiny faint">Exit ' + esc(s.exit) + "</div>" : "") +
                "</div>" +
                '<div class="step__dist">' + F.dist(s.distance, p.imperial) + "</div>" +
              "</div>";
    });
    return html + "</div>";
  }

  /* ---------- warnings tab ---------- */

  function renderWarnings(state) {
    var p = Profile.get();
    var route = state.selected();
    if (!route) return '<div class="empty"><p>Plan a route first.</p></div>';
    if (!route.audit) {
      return '<div class="empty"><span class="spinner"></span><p style="margin-top:10px">' +
             "Checking every bridge and weight limit along this route…</p>" +
             (state.auditProgress ? '<div class="progress"><i style="width:' +
               Math.round(state.auditProgress * 100) + '%"></i></div>' : "") + "</div>";
    }

    var a = route.audit;
    var html = "";

    if (a.verdict === "unknown") {
      html += '<div class="card card--warn"><b>This route has not been checked</b>' +
              '<p class="tiny muted" style="margin:6px 0 0">The map data service could not be ' +
              "reached, so no bridge, weight limit or truck ban has been verified on this route. " +
              "Do not read this as clear. Try again when you have signal.</p>" +
              '<div class="btnrow"><button class="btn" data-act="recheck">Check again</button></div></div>';
    }

    html += '<div class="card"><div class="row row--between">' +
              '<div><b>' + esc(Restrict.verdictText(route).label) + "</b>" +
              '<div class="tiny faint" style="margin-top:3px">Checked against ' +
              esc(Profile.summary(p)) + "</div></div>" +
              verdictPill(route) +
            "</div>";
    if (a.partial) {
      html += '<p class="tiny muted" style="margin:9px 0 0">Part of the route could not be checked — ' +
              "the map data service did not answer for every section. Treat the gaps as unknown.</p>";
    }
    html += "</div>";

    if (!a.flags.length) {
      /* Only claim the road is clear when the check actually ran. With no
         coverage the card above already says so, and repeating "nothing found"
         underneath it would read as reassurance we have not earned. */
      if (a.verdict !== "unknown") {
        html += '<div class="empty"><h2>Nothing in the way</h2><p>No low bridge, weight limit, ' +
                "width limit or truck ban was found on this route for your dimensions" +
                (a.partial ? " on the sections that could be checked" : "") + ".</p>" +
                '<p class="empty__hint">Signs on the road always win. This is OpenStreetMap data, ' +
                "and it can be missing or out of date.</p></div>";
      }
      return html;
    }

    html += '<div class="sectionhead"><span>' + a.flags.length + " on this route</span>" +
            "<span>distance from start</span></div>";

    a.flags.forEach(function (f) {
      var critical = f.severity === "critical";
      html += '<div class="card ' + (critical ? "card--bad" : "card--warn") + '" data-flag="' + esc(f.id) + '">';
      html +=   '<div class="haz"><div class="haz__mark haz__mark--' + f.severity + '">' +
                (critical ? "!" : "▲") + "</div>";
      html +=   '<div class="spread">';
      f.text.forEach(function (t) { html += '<div class="haz__line">' + esc(t) + "</div>"; });
      html +=     '<div class="haz__meta">' +
                    alongText(f.along, p.imperial) +
                    (f.name ? " · " + esc(f.name) : "") +
                    (f.bridge ? " · bridge" : "") +
                    (f.count > 1 ? " · " + f.count + " sections" : "") +
                    (f.confidence === "medium" ? " · likely" : "") +
                    ' · <a href="https://www.openstreetmap.org/' + f.osmType + "/" + f.osmId +
                    '" target="_blank" rel="noopener">source</a>' +
                  "</div>";
      html +=   "</div></div>";
      html +=   '<div class="btnrow"><button class="btn" data-act="showflag">Show on map</button></div>';
      html += "</div>";
    });

    html += '<p class="tiny faint" style="margin:14px 2px">Restrictions come from OpenStreetMap. ' +
            "Coverage is good on main roads in most countries and patchy on minor ones. " +
            "It is a second pair of eyes, not a substitute for the sign at the bridge.</p>";
    return html + renderWeather(state, p);
  }

  /* Weather sits below the restrictions rather than mixed in with them: both
     can stop you, but a low bridge is a fact and a forecast is a forecast. */
  function renderWeather(state, p) {
    var wx = state.weather;
    if (state.weatherLoading) {
      return '<div class="sectionhead" style="margin-top:18px"><span>Weather on the way</span></div>' +
             '<div class="card"><span class="spinner"></span> Checking the forecast along the route…</div>';
    }
    if (!wx) return "";
    if (!wx.ok) {
      return '<div class="sectionhead" style="margin-top:18px"><span>Weather on the way</span></div>' +
             '<div class="card"><span class="muted tiny">Forecast unavailable right now.</span></div>';
    }

    var html = '<div class="sectionhead" style="margin-top:18px"><span>Weather on the way</span>' +
               "<span>at your arrival time</span></div>";

    if (wx.alerts.length) {
      wx.alerts.forEach(function (a) {
        var critical = a.severity === "critical";
        html += '<div class="card ' + (critical ? "card--bad" : "card--warn") + '">' +
                  '<div class="haz"><div class="haz__mark haz__mark--' + a.severity + '">' +
                  (a.kind === "wind" ? "💨" : critical ? "!" : "▲") + "</div>" +
                  '<div class="spread"><div class="haz__line">' + esc(a.text) + "</div>" +
                  '<div class="haz__meta">' + alongText(a.along, p.imperial) +
                  (a.endAlong > a.along + 1000 ? " to " + F.dist(a.endAlong, p.imperial) : "") +
                  " · around " + new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
                  "</div></div></div></div>";
      });
    } else {
      html += '<div class="card"><span class="muted tiny">Nothing rough in the forecast along this route.</span></div>';
    }

    html += '<div class="wxstrip">';
    wx.points.forEach(function (pt) {
      var tone = pt.severity === "critical" ? " wxcell--bad" : (pt.severity ? " wxcell--warn" : "");
      html += '<div class="wxcell' + tone + '">' +
                '<div class="wxcell__icon">' + pt.icon + "</div>" +
                '<div class="wxcell__temp">' + (pt.temp === null ? "—" :
                  (p.imperial ? Math.round(pt.temp * 9 / 5 + 32) + "°F" : Math.round(pt.temp) + "°C")) + "</div>" +
                '<div class="wxcell__gust">' + (pt.gust === null ? "" : F.speed(pt.gust, p.imperial)) + "</div>" +
                '<div class="wxcell__at">' + F.dist(pt.along, p.imperial) + "</div>" +
              "</div>";
    });
    html += "</div>";
    html += '<p class="tiny faint" style="margin:10px 2px">Forecast from Open-Meteo for the hour you are ' +
            "predicted to reach each point. Wind thresholds are set for your vehicle height and weight.</p>";
    return html;
  }

  /* ---------- fuel tab ---------- */

  function renderFuel(state) {
    var p = Profile.get();
    var route = state.selected();
    if (!route) return '<div class="empty"><p>Plan a route first.</p></div>';
    if (state.poiLoading) {
      return '<div class="empty"><span class="spinner"></span><p style="margin-top:10px">' +
             "Finding diesel along the route…</p></div>";
    }
    var stations = state.stations || [];
    if (!stations.length) {
      return '<div class="empty"><h2>No diesel found</h2>' +
             "<p>Nothing tagged as a fuel stop was found within " +
             F.dist(state.maxDetour, p.imperial) + " of this route.</p>" +
             '<button class="btn btn--wide" data-act="widen" style="margin-top:10px">Search further off route</button></div>';
    }

    var spread = Fuel.spread(stations, p);
    var plan = Fuel.plan(route, stations, p);
    var tripLitres = Profile.fuelFor(route.distance, p);
    var cur = stations[0].price.currency;
    var unit = stations[0].price.display;

    var html = "";

    html += '<div class="fuelhead">';
    html +=   '<div class="fuelhead__box"><b class="big">' + F.volume(tripLitres, p.imperial) + "</b>" +
              "<small>diesel for this trip</small></div>";
    html +=   '<div class="fuelhead__box"><b class="big">' +
              F.money(tripLitres * stations[0].price.perLitre, cur) + "</b>" +
              "<small>at the cheapest</small></div>";
    html += "</div>";

    if (spread && spread.saving > 0) {
      html += '<div class="card" style="margin-top:10px"><div class="row row--between">' +
                "<div><b>" + F.money(spread.saving, cur) + " spread</b>" +
                '<div class="tiny muted" style="margin-top:3px">Between the cheapest and dearest on this route, ' +
                "on a " + F.volume(spread.litres, p.imperial) + " fill</div></div>" +
                '<div class="station__price"><b>' + F.money(spread.perUnit, cur, "unit") + "</b>" +
                '<div class="tiny faint">per ' + unit + "</div></div>" +
              "</div></div>";
    }

    html += '<div class="notice"><b>Prices are estimates.</b> There is no free live diesel feed, so ' +
            "TruckWay estimates from a regional average" +
            (Fuel.baselines() && Fuel.baselines().as_of ? " (" + esc(Fuel.baselines().as_of) + ")" : "") +
            " adjusted for the chain and road type. Confirm at the pump — and tap " +
            "<b>Report price</b> to save the real one, which then replaces the estimate everywhere.</div>";

    if (plan.stops.length) {
      html += '<div class="sectionhead"><span>Suggested fill-ups</span><span>' +
              F.money(plan.totalCost, cur) + "</span></div>";
      plan.stops.forEach(function (s) {
        html += '<div class="card"><div class="row row--between">' +
                  "<div class=\"spread\"><b>" + esc(s.station.poi.name) + "</b>" +
                  '<div class="tiny muted" style="margin-top:3px">' +
                  alongText(s.along, p.imperial) + " · put in " + F.volume(s.litres, p.imperial) +
                  " · " + F.money(s.cost, cur) + "</div></div>" +
                  '<span class="pill pill--ok">fill</span>' +
                "</div></div>";
      });
    } else if (!plan.reachable) {
      html += '<div class="card card--warn"><b>Range warning</b><p class="tiny muted" style="margin:6px 0 0">' +
              esc(plan.note || "") + " Check the tank level and economy in your truck settings.</p></div>";
    }

    var hidden = Math.max(0, (state.stationsTotal || stations.length) - stations.length);
    html += '<div class="chips">' +
            '<button class="chip' + (state.truckFuelOnly ? " on" : "") +
            '" data-act="truckonly">🚛 Truck-friendly only</button>' +
            '<button class="chip" data-act="sortfuel">' +
            (state.fuelSort === "along" ? "↕ Route order" : "↕ By price") + "</button></div>";

    html += '<div class="sectionhead"><span>' + stations.length + " diesel stop" +
            (stations.length === 1 ? "" : "s") +
            (hidden ? " · " + hidden + " car-only hidden" : "") + "</span></div>";

    var list = stations.slice();
    if (state.fuelSort === "along") list.sort(function (a, b) { return a.poi.along - b.poi.along; });

    list.forEach(function (s) { html += stationCard(s, p, cur, unit, state); });
    return html;
  }

  function stationCard(s, p, cur, unit, state) {
    var poi = s.poi;
    var badge = s.price.basis === "reported"
      ? '<span class="pill ' + (s.price.fresh ? "pill--ok" : "pill--warn") + '">reported ' +
        F.ago(s.price.at) + "</span>"
      : '<span class="pill pill--est">est.</span>';

    var html = '<div class="card' + (s.cheapest ? " card--pick" : "") + '" data-poi="' + esc(poi.id) + '">';
    html +=   '<div class="row">';
    html +=     '<div class="spread"><b>' + esc(poi.name) + "</b>";
    html +=       '<div class="tiny muted" style="margin-top:3px">' +
                  alongText(poi.along, p.imperial) + " · " +
                  (poi.detour < 120 ? "on the route" : F.dist(poi.detour, p.imperial) + " off route") +
                  "</div>";
    html +=     "</div>";
    html +=     '<div class="station__price"><b>' + F.money(Fuel.displayPrice(s.price), cur, "unit") + "</b>" +
                '<div class="tiny faint">per ' + unit + "</div></div>";
    html +=   "</div>";

    html += '<div class="pills">' + badge;
    if (s.cheapest) html += '<span class="pill pill--ok">cheapest here</span>';
    if (s.priciest) html += '<span class="pill pill--bad">dearest here</span>';
    poi.facilities.slice(0, 5).forEach(function (f) {
      html += '<span class="pill">' + esc(f) + "</span>";
    });
    if (poi.hours) html += '<span class="pill">' + esc(poi.hours.slice(0, 22)) + "</span>";
    html += "</div>";

    html += aroundBlock(poi, state);

    html += '<div class="btnrow">' +
              '<button class="btn" data-act="report">Report</button>' +
              '<button class="btn" data-act="around">Nearby</button>' +
              '<button class="btn" data-act="via">Add stop</button>' +
            "</div>";
    return html + "</div>";
  }

  function aroundBlock(poi, state) {
    var data = state.around[poi.id];
    if (!data) return "";
    if (data === "loading") {
      return '<div class="around"><span class="spinner"></span> Looking around…</div>';
    }
    if (!data.length) return '<div class="around">Nothing else mapped within 500 m.</div>';
    var groups = POI.summarise(data);
    var html = '<div class="around">Within 500 m:<div class="around__list">';
    groups.slice(0, 12).forEach(function (g) {
      html += '<span class="pill">' + esc(g.label) + (g.count > 1 ? " ×" + g.count : "") + "</span>";
    });
    html += "</div>";
    var named = data.filter(function (d) { return d.name; }).slice(0, 6);
    if (named.length) {
      html += '<div class="tiny faint" style="margin-top:6px">' +
              named.map(function (d) { return esc(d.name); }).join(" · ") + "</div>";
    }
    return html + "</div>";
  }

  /* ---------- stops tab ---------- */

  function renderStops(state) {
    var p = Profile.get();
    var route = state.selected();
    if (!route) return '<div class="empty"><p>Plan a route first.</p></div>';
    if (state.poiLoading) {
      return '<div class="empty"><span class="spinner"></span><p style="margin-top:10px">' +
             "Finding truck stops and parking…</p></div>";
    }

    var html = '<div class="chips">';
    POI.CATEGORIES.forEach(function (c) {
      var on = state.stopCats.indexOf(c.id) >= 0;
      html += '<button class="chip' + (on ? " on" : "") + '" data-cat="' + c.id + '">' +
              c.icon + " " + esc(c.label) + "</button>";
    });
    html += "</div>";

    var list = (state.pois || []).filter(function (poi) {
      return state.stopCats.indexOf(poi.cat) >= 0;
    });
    if (!list.length) {
      return html + '<div class="empty"><h2>Nothing in these categories</h2>' +
             "<p>Try turning on more categories, or search further off the route.</p>" +
             '<button class="btn btn--wide" data-act="widen" style="margin-top:10px">Search further off route</button></div>';
    }

    html += '<div class="sectionhead"><span>' + list.length + " along the route</span></div>";
    list.forEach(function (poi) {
      var cat = POI.BY_ID[poi.cat];
      html += '<div class="card" data-poi="' + esc(poi.id) + '">';
      html +=   '<div class="row"><div class="spread"><b>' + cat.icon + " " + esc(poi.name) + "</b>" +
                '<div class="tiny muted" style="margin-top:3px">' +
                alongText(poi.along, p.imperial) + " · " +
                (poi.detour < 120 ? "on the route" : F.dist(poi.detour, p.imperial) + " off route") +
                " · " + F.dist(poi.remaining, p.imperial) + " to go</div></div></div>";
      html +=   '<div class="pills">';
      if (poi.truckFriendly) html += '<span class="pill pill--ok">truck</span>';
      poi.facilities.slice(0, 6).forEach(function (f) {
        html += '<span class="pill">' + esc(f) + "</span>";
      });
      if (poi.hours) html += '<span class="pill">' + esc(poi.hours.slice(0, 22)) + "</span>";
      html +=   "</div>";
      html +=   aroundBlock(poi, state);
      html +=   '<div class="btnrow">' +
                  '<button class="btn" data-act="around">Nearby</button>' +
                  '<button class="btn" data-act="show">Show</button>' +
                  '<button class="btn" data-act="via">Add stop</button>' +
                "</div>";
      html += "</div>";
    });
    return html;
  }

  /* ---------- hours tab ---------- */

  function renderHours(state) {
    var p = Profile.get();
    var st = Hos.live();
    var rules = st.rules;
    var html = "";

    html += '<div class="chips">';
    Object.keys(Hos.RULESETS).forEach(function (id) {
      html += '<button class="chip' + (rules.id === id ? " on" : "") +
              '" data-ruleset="' + id + '">' + esc(Hos.RULESETS[id].label) + "</button>";
    });
    html += "</div>";

    if (rules.id === "off") {
      return html + '<div class="empty"><h2>Hours not tracked</h2>' +
             "<p>Pick a rule set above and TruckWay will keep the clocks, and — more to the " +
             "point — work out which truck stop you can still reach before they run out.</p></div>";
    }

    var b = Hos.binding();
    var rem = b.remaining;

    html += '<div class="card ' + (b.first.seconds < 1800 ? "card--bad" : (b.first.seconds < 3600 ? "card--warn" : "")) + '">';
    html +=   '<div class="row row--between"><div>';
    html +=     '<div class="huge">' + F.clock(b.first.seconds) + "</div>";
    html +=     '<div class="muted tiny">until your ' + esc(b.first.label) + "</div>";
    html +=   "</div>";
    html +=   '<button class="btn ' + (st.running ? "btn--danger" : "btn--go") + '" data-act="hostoggle">' +
              (st.running ? "❚❚ Pause" : "▶ Driving") + "</button>";
    html +=   "</div>";
    html += "</div>";

    html += '<div class="fuelhead">' +
      clockBox("Driving", rem.drive, rules.drive) +
      clockBox("Duty", rem.duty, rules.duty) +
    "</div>";
    html += '<div class="fuelhead" style="margin-top:10px">' +
      clockBox("To break", rem.untilBreak, rules.breakAfter) +
      clockBox("Cycle", rem.cycle, rules.cycle) +
    "</div>";

    html += '<div class="btnrow">' +
            '<button class="btn" data-act="hosbreak">Took a ' + Math.round(rules.breakLength / 60) + "-min break</button>" +
            '<button class="btn" data-act="hosreset">' + Math.round(rules.reset / 3600) + "-hour reset</button>" +
            "</div>";
    html += '<div class="btnrow"><button class="btn" data-act="hosedit">Adjust hours already used</button></div>';

    html += renderHosPlan(state, p);

    html += '<p class="tiny faint" style="margin:14px 2px">These are the everyday limits, kept on this ' +
            "device only. Split sleeper berth, adverse-conditions extensions and short-haul exemptions " +
            "are not modelled — your log book is the record, not this.</p>";
    return html;
  }

  function clockBox(label, remaining, limit) {
    var pct = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 0;
    var tone = pct < 0.12 ? "var(--bad)" : (pct < 0.3 ? "var(--warn)" : "var(--ok)");
    return '<div class="fuelhead__box"><b class="big">' + F.clock(remaining) + "</b>" +
           "<small>" + esc(label) + " left</small>" +
           '<div class="progress" style="margin-top:7px"><i style="width:' +
           Math.round(pct * 100) + "%;background:" + tone + '"></i></div></div>';
  }

  /* The part that earns the tab: where to stop. */
  function renderHosPlan(state, p) {
    var route = state.selected();
    if (!route) {
      return '<div class="empty" style="padding-top:20px"><p class="tiny">' +
             "Plan a route and this will show which truck stop you can reach before the clock stops you.</p></div>";
    }
    if (state.poiLoading || !state.pois.length) {
      return '<div class="sectionhead" style="margin-top:18px"><span>Where to stop</span></div>' +
             '<div class="card"><span class="spinner"></span> Looking for parking along the route…</div>';
    }

    var plan = Hos.plan(route, state.pois, { from: state.progressAlong || 0 });
    if (!plan) return "";

    var html = '<div class="sectionhead" style="margin-top:18px"><span>Where to stop</span></div>';

    if (plan.finishesOnThisShift) {
      html += '<div class="card"><div class="row"><span class="pill pill--ok">✓</span>' +
              '<div class="spread" style="margin-left:8px"><b>This trip fits in your remaining hours</b>' +
              '<div class="tiny muted" style="margin-top:3px">' +
              F.dist(route.distance - (state.progressAlong || 0), p.imperial) + " to run, " +
              F.clock(plan.remaining.drive) + " driving left.</div></div></div></div>";
    } else {
      html += '<div class="card card--warn"><b>You will run out before you arrive</b>' +
              '<p class="tiny muted" style="margin:6px 0 0">Your driving time ends around ' +
              F.dist(plan.stopAt, p.imperial) + " in. Plan a night out.</p></div>";
    }

    if (plan.breakSeparate) {
      html += stopCard("30-minute break", plan.breakStop, plan.breakAt, p);
    }
    /* No point planning a night stop for a trip that ends before the clock. */
    if (!plan.finishesOnThisShift) {
      html += stopCard("End of driving", plan.restStop, plan.stopAt, p);
    }
    return html;
  }

  function stopCard(title, stop, limitAlong, p) {
    var poi = stop && stop.poi;
    var html = '<div class="card' + (stop && stop.tight ? " card--warn" : "") +
               (!poi ? " card--bad" : "") + '">';
    html +=   '<div class="row row--between"><b>' + esc(title) + "</b>" +
              '<span class="pill">by ' + F.dist(limitAlong, p.imperial) + "</span></div>";

    if (!poi) {
      html += '<p class="tiny muted" style="margin:8px 0 0">No suitable stop on the route before ' +
              "this limit.";
      if (stop && stop.beyond) {
        html += " The next one is <b>" + esc(stop.beyond.name) + "</b> at " +
                F.dist(stop.beyond.along, p.imperial) + " — " +
                F.dist(stop.beyondBy, p.imperial) + " past your limit.";
      } else {
        html += " Widen the search in Settings, or plan to come off the route.";
      }
      return html + "</p></div>";
    }
    var cat = POI.BY_ID[poi.cat];
    html += '<div class="row" style="margin-top:9px"><div class="spread">' +
              "<b>" + cat.icon + " " + esc(poi.name) + "</b>" +
              '<div class="tiny muted" style="margin-top:3px">' +
              alongText(poi.along, p.imperial) + " · " +
              (poi.detour < 120 ? "on the route" : F.dist(poi.detour, p.imperial) + " off route") +
              " · " + F.dist(stop.slack, p.imperial) + " of slack</div></div></div>";
    if (poi.facilities.length) {
      html += '<div class="pills">';
      poi.facilities.slice(0, 6).forEach(function (f) { html += '<span class="pill">' + esc(f) + "</span>"; });
      html += "</div>";
    }
    if (stop.tight) {
      html += '<p class="tiny" style="margin:8px 0 0;color:#e3b341">Cutting it fine — the last one ' +
              "before the limit, with " + F.dist(stop.slack, p.imperial) + " to spare.</p>";
    } else if (stop.early) {
      html += '<p class="tiny muted" style="margin:8px 0 0">Well before your limit, but it is the last ' +
              "suitable stop on the route" +
              (stop.beyond ? " — the next is " + esc(stop.beyond.name) + " at " +
               F.dist(stop.beyond.along, p.imperial) + ", past your limit." : ".") + "</p>";
    }
    html += '<div class="btnrow" data-poi="' + esc(poi.id) + '">' +
              '<button class="btn" data-act="show">Show</button>' +
              '<button class="btn" data-act="via">Route via here</button></div>';
    return html + "</div>";
  }

  /* ---------- saved places and recent trips ---------- */

  function renderPlacesPanel() {
    var savedList = Places.saved();
    var recent = Places.recents();
    if (!savedList.length && !recent.length) return "";
    var html = "";
    if (savedList.length) {
      html += '<div class="sectionhead"><span>Saved</span></div><div class="chips" style="flex-wrap:wrap">';
      savedList.slice(0, 10).forEach(function (s, i) {
        html += '<button class="chip" data-saved="' + i + '">★ ' + esc(s.name) + "</button>";
      });
      html += "</div>";
    }
    if (recent.length) {
      html += '<div class="sectionhead"><span>Recent trips</span></div>';
      recent.slice(0, 6).forEach(function (t, i) {
        html += '<button class="card" style="width:100%;text-align:left" data-recent="' + i + '">' +
                "<b>" + esc(t.to.name) + "</b>" +
                '<div class="tiny muted" style="margin-top:3px">from ' + esc(t.from.name) +
                (t.distance ? " · " + F.dist(t.distance, Profile.get().imperial) : "") + "</div></button>";
      });
    }
    return html;
  }

  /* ---------- truck editor ---------- */

  function truckModalHTML() {
    var p = Profile.get();
    var imp = p.imperial;
    var html = "";

    html += '<div class="sectionhead"><span>Start from a preset</span></div><div class="presetgrid">';
    Profile.PRESETS.forEach(function (pre) {
      html += '<button class="preset' + (p.presetId === pre.id ? " on" : "") + '" data-preset="' + pre.id + '">' +
              "<b>" + pre.icon + " " + esc(pre.label) + "</b>" +
              "<small>" + F.dim(pre.height, pre.region === "US") + " · " +
              F.weight(pre.weight, pre.region === "US") + "</small></button>";
    });
    html += "</div>";

    html += '<div class="switch"><div class="switch__label"><b>Imperial units</b>' +
            "<small>feet, inches, pounds, miles, gallons</small></div>" +
            '<input type="checkbox" id="fImperial"' + (imp ? " checked" : "") + "></div>";

    html += '<div class="sectionhead" style="margin-top:16px"><span>Dimensions</span></div>';

    if (imp) {
      html += '<div class="grid2">' +
        dimFieldImperial("Height", "height", p.height) +
        dimFieldImperial("Width", "width", p.width) +
      "</div>";
      html += '<div class="grid2">' +
        dimFieldImperial("Length", "length", p.length) +
        numField("Gross weight (lb)", "weight", Math.round(U.kgToLb(p.weight)), 1000, 200000, 500) +
      "</div>";
      html += '<div class="grid2">' +
        numField("Heaviest axle (lb)", "axleLoad", Math.round(U.kgToLb(p.axleLoad)), 1000, 60000, 500) +
        numField("Axles", "axles", p.axles, 2, 12, 1) +
      "</div>";
    } else {
      html += '<div class="grid2">' +
        numField("Height (m)", "height", round2(p.height), 1.5, 8, 0.01) +
        numField("Width (m)", "width", round2(p.width), 1.4, 5, 0.01) +
      "</div>";
      html += '<div class="grid2">' +
        numField("Length (m)", "length", round2(p.length), 3, 40, 0.1) +
        numField("Gross weight (t)", "weight", round2(p.weight / 1000), 0.5, 120, 0.1) +
      "</div>";
      html += '<div class="grid2">' +
        numField("Heaviest axle (t)", "axleLoad", round2(p.axleLoad / 1000), 0.3, 30, 0.1) +
        numField("Axles", "axles", p.axles, 2, 12, 1) +
      "</div>";
    }

    html += '<div class="switch"><div class="switch__label"><b>Carrying hazmat</b>' +
            "<small>Avoids roads and tunnels that ban dangerous goods</small></div>" +
            '<input type="checkbox" id="fHazmat"' + (p.hazmat ? " checked" : "") + "></div>";

    html += '<div class="sectionhead" style="margin-top:16px"><span>Fuel</span></div>';
    html += '<div class="grid2">' +
      numField(imp ? "Tank (gal)" : "Tank (L)", "tank",
               imp ? Math.round(U.lToGal(p.tank)) : Math.round(p.tank), 5, 1200, 5) +
      numField(imp ? "Economy (MPG)" : "Economy (L/100km)", "economy",
               Profile.economyDisplay(p), 0.5, 200, 0.1) +
    "</div>";
    html += '<div class="field"><label>Tank now: <span id="fuelLevelOut">' +
            Math.round(p.fuelLevel * 100) + '%</span></label>' +
            '<input type="range" id="fFuelLevel" min="0" max="100" step="5" value="' +
            Math.round(p.fuelLevel * 100) + '" style="width:100%"></div>';

    html += '<div class="sectionhead" style="margin-top:16px"><span>Routing preferences</span></div>';
    html += switchRow("Avoid tolls", "fAvoidTolls", p.avoidTolls, "");
    html += switchRow("Avoid ferries", "fAvoidFerries", p.avoidFerries, "");
    html += switchRow("Avoid motorways", "fAvoidHighways", p.avoidHighways, "Rarely what you want in a truck");
    html += switchRow("Avoid unpaved", "fAvoidUnpaved", p.avoidUnpaved, "");
    html += switchRow("Voice guidance", "fVoice", p.voice, "");

    html += '<div class="btnrow" style="margin-top:18px">' +
            '<button class="btn btn--primary" data-act="savetruck">Save truck</button>' +
            '<button class="btn" data-act="resettruck">Reset</button></div>';
    return html;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  function numField(label, key, value, min, max, step) {
    return '<div class="field"><label>' + esc(label) + "</label>" +
           '<input type="number" data-key="' + key + '" value="' + value +
           '" min="' + min + '" max="' + max + '" step="' + step + '" inputmode="decimal"></div>';
  }

  /* Feet and inches in two boxes — nobody types 13.5 for 13'6". */
  function dimFieldImperial(label, key, metres) {
    var totalIn = Math.round(metres / U.M_PER_IN);
    return '<div class="field"><label>' + esc(label) + "</label>" +
           '<div class="dimrow">' +
             '<input type="number" data-key="' + key + '-ft" value="' + Math.floor(totalIn / 12) +
             '" min="0" max="60" step="1" inputmode="numeric"><span>ft</span>' +
             '<input type="number" data-key="' + key + '-in" value="' + (totalIn % 12) +
             '" min="0" max="11" step="1" inputmode="numeric"><span>in</span>' +
           "</div></div>";
  }

  function switchRow(label, id, on, hint) {
    return '<div class="switch"><div class="switch__label"><b>' + esc(label) + "</b>" +
           (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>" +
           '<input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "></div>";
  }

  /* Read the truck editor back out. Mirrors the units it was rendered in. */
  function readTruckForm(root) {
    var imperial = root.querySelector("#fImperial").checked;
    var get = function (key) {
      var el = root.querySelector('[data-key="' + key + '"]');
      return el ? parseFloat(el.value) : NaN;
    };
    var patch = { imperial: imperial };
    var wasImperial = Profile.get().imperial;

    function dim(key) {
      if (wasImperial) {
        var ft = get(key + "-ft"), inch = get(key + "-in");
        if (isFinite(ft) || isFinite(inch)) {
          return (isFinite(ft) ? ft : 0) * U.M_PER_FT + (isFinite(inch) ? inch : 0) * U.M_PER_IN;
        }
        return NaN;
      }
      return get(key);
    }

    ["height", "width", "length"].forEach(function (k) {
      var v = dim(k);
      if (isFinite(v)) patch[k] = v;
    });
    var w = get("weight");
    if (isFinite(w)) patch.weight = wasImperial ? U.lbToKg(w) : w * 1000;
    var al = get("axleLoad");
    if (isFinite(al)) patch.axleLoad = wasImperial ? U.lbToKg(al) : al * 1000;
    var ax = get("axles");
    if (isFinite(ax)) patch.axles = ax;
    var tank = get("tank");
    if (isFinite(tank)) patch.tank = wasImperial ? U.galToL(tank) : tank;

    patch.hazmat = root.querySelector("#fHazmat").checked;
    patch.avoidTolls = root.querySelector("#fAvoidTolls").checked;
    patch.avoidFerries = root.querySelector("#fAvoidFerries").checked;
    patch.avoidHighways = root.querySelector("#fAvoidHighways").checked;
    patch.avoidUnpaved = root.querySelector("#fAvoidUnpaved").checked;
    patch.voice = root.querySelector("#fVoice").checked;
    var lvl = root.querySelector("#fFuelLevel");
    if (lvl) patch.fuelLevel = parseInt(lvl.value, 10) / 100;

    var econ = root.querySelector('[data-key="economy"]');
    return { patch: patch, economy: econ ? econ.value : null, wasImperial: wasImperial };
  }

  /* ---------- settings ---------- */

  function settingsHTML(settings) {
    var b = Fuel.baselines();
    var html = "";
    html += '<div class="field"><label>OpenRouteService API key (optional)</label>' +
            '<input type="password" id="sOrsKey" value="' + esc(settings.orsKey || "") +
            '" placeholder="Paste a free key" autocomplete="off">' +
            "<small>Adds a second truck-routing engine to compare against. " +
            'Free keys: <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener">openrouteservice.org</a>. ' +
            "Stored only in this browser.</small></div>";

    html += '<div class="field"><label>Search this far off the route</label>' +
            '<select id="sDetour">' +
            [2000, 5000, 10000, 20000].map(function (m) {
              return '<option value="' + m + '"' + (settings.maxDetour === m ? " selected" : "") + ">" +
                     F.dist(m, Profile.get().imperial) + "</option>";
            }).join("") + "</select>" +
            "<small>How far from the route to look for fuel, parking and truck stops.</small></div>";

    html += '<div class="sectionhead" style="margin-top:16px"><span>Diesel reference prices</span></div>';
    html += '<p class="tiny muted" style="margin:0 0 10px">' +
            esc((b && b.note) || "") + "</p>";
    if (b && b.as_of) {
      html += '<p class="tiny faint">Reference table dated ' + esc(b.as_of) + ". " +
              "Adjust the figure for the region you run in if it is out of date:</p>";
      html += '<div class="field"><label>Region</label><select id="sRegion">' +
              Object.keys(b.regions).sort().map(function (k) {
                return '<option value="' + esc(k) + '">' + esc(k) + " — " + esc(b.regions[k].label) + "</option>";
              }).join("") + "</select></div>";
      html += '<div class="field"><label>Price per unit</label>' +
              '<input type="number" id="sRegionPrice" step="0.01" min="0">' +
              '<small id="sRegionHint"></small></div>';
      html += '<button class="btn btn--wide" data-act="savebaseline">Save this price</button>';
    }

    var reports = Fuel.reports();
    var count = Object.keys(reports).length;
    html += '<div class="sectionhead" style="margin-top:18px"><span>Your data</span></div>';
    html += '<p class="tiny muted" style="margin:0 0 10px">' + count +
            " reported price" + (count === 1 ? "" : "s") + " saved on this device.</p>";
    html += '<div class="btnrow"><button class="btn" data-act="export">Export backup</button>' +
            '<button class="btn" data-act="import">Import backup</button></div>';
    html += '<div class="btnrow"><button class="btn btn--danger btn--wide" data-act="wipe">Clear saved prices</button></div>';

    html += '<p class="tiny faint" style="margin-top:18px">Map data © OpenStreetMap contributors. ' +
            "Routing by Valhalla, OpenRouteService and OSRM. Restriction data from OpenStreetMap. " +
            "TruckWay checks what the map knows — the sign on the road is always the authority.</p>";
    return html;
  }

  /* ---------- suggestions ---------- */

  function renderSuggest(results) {
    var el = $("suggest");
    if (!results || !results.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.innerHTML = results.map(function (r, i) {
      return '<button class="suggest__item" data-i="' + i + '">' +
             "<b>" + esc(r.name) + "</b>" +
             (r.detail ? "<small>" + esc(r.detail) + "</small>" : "") + "</button>";
    }).join("");
    el.hidden = false;
  }

  global.TW.UI = {
    $: $,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    renderRoutes: renderRoutes,
    renderWarnings: renderWarnings,
    renderFuel: renderFuel,
    renderStops: renderStops,
    renderHours: renderHours,
    renderPlacesPanel: renderPlacesPanel,
    truckModalHTML: truckModalHTML,
    readTruckForm: readTruckForm,
    settingsHTML: settingsHTML,
    renderSuggest: renderSuggest,
    verdictPill: verdictPill
  };
})(window);

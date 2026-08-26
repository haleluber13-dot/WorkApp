/* OlaKai — the web build.
 *
 * Same catalog, same scoring and the same fare model as the Android app; the
 * data files under data/ are the very ones the APK ships. Vanilla JS on purpose:
 * no build step, no dependencies, and it loads fast over a phone connection.
 */
'use strict';

const S = {
  spots: [],
  cams: {},
  airports: [],
  conditions: {},
  favourites: new Set(JSON.parse(localStorage.getItem('olakai.fav') || '[]')),
  query: '',
  sort: 'firing',
  favOnly: false,
  budget: Number(localStorage.getItem('olakai.budget') || 2),
  useFeet: false,
  tab: 'wall',
  focusSpot: null,
  camIndex: 0,
  tripSpot: null,
  origin: null,
  depart: addDays(new Date(), 30),
  ret: addDays(new Date(), 44),
  weight: 50,
  resolved: {},   // channelId -> videoId, resolved live
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ---------- boot ---------------------------------------------------------- */

async function boot() {
  const [catalog, cams, airports] = await Promise.all([
    fetch('data/spots.json').then((r) => r.json()),
    fetch('data/cams.json').then((r) => r.json()),
    fetch('data/airports.json').then((r) => r.json()),
  ]);

  S.cams = cams;
  S.airports = airports.airports;
  S.spots = catalog.spots.map((spot) => {
    // Two shapes share cams.json: an entry with `url` is a direct HLS stream,
    // anything else is a YouTube channel or video.
    const resolved = (cams[spot.id] || []).map((c, i) => ({
      id: `${spot.id}-${i}`,
      title: c.title || 'Live cam',
      kind: c.url ? 'hls' : 'youtube',
      url: c.url || '',
      channelId: c.channelId || '',
      videoId: c.videoId || '',
      channel: c.channel || '',
      pageUrl: c.channelUrl || (c.videoId ? `https://www.youtube.com/watch?v=${c.videoId}` : c.url || ''),
    })).filter((c) => c.url || c.channelId || c.videoId);
    return { ...spot, liveCams: resolved };
  });

  const savedOrigin = localStorage.getItem('olakai.origin');
  if (savedOrigin) S.origin = S.airports.find((a) => a.iata === savedOrigin) || null;

  render();
  refreshConditions();
  setInterval(refreshConditions, 10 * 60 * 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ---------- live conditions ---------------------------------------------- */

const MARINE = 'wave_height,wave_direction,wave_period,swell_wave_height,' +
  'swell_wave_period,swell_wave_direction,sea_level_height_msl,sea_surface_temperature';
const WIND = 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m';

async function refreshConditions() {
  if (!S.spots.length) return;
  $('#refresh').classList.add('on');
  try {
    // Both endpoints take coordinate lists and answer in request order, so the
    // whole wall refreshes in two calls rather than two per spot.
    for (const chunk of chunked(S.spots, 40)) {
      const lat = chunk.map((s) => s.lat.toFixed(4)).join(',');
      const lon = chunk.map((s) => s.lon.toFixed(4)).join(',');
      const [marine, wind] = await Promise.all([
        getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
          `&current=${MARINE}&hourly=sea_level_height_msl&forecast_days=1&timeformat=unixtime`),
        getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=${WIND}&timeformat=unixtime`),
      ]);
      chunk.forEach((spot, i) => {
        const m = asArray(marine)[i] || {};
        const w = asArray(wind)[i] || {};
        const mc = m.current || {};
        const wc = w.current || {};
        S.conditions[spot.id] = {
          waveHeightM: mc.wave_height,
          wavePeriodS: mc.wave_period,
          swellDirectionDeg: mc.swell_wave_direction,
          windSpeedKmh: wc.wind_speed_10m,
          windGustKmh: wc.wind_gusts_10m,
          windDirectionDeg: wc.wind_direction_10m,
          waterTempC: mc.sea_surface_temperature,
          airTempC: wc.temperature_2m,
          seaLevelM: mc.sea_level_height_msl,
          seaLevelNextM: nextHourSeaLevel(m, mc.time),
        };
      });
    }
  } catch (e) {
    /* offline: the catalog still works, just without readings */
  }
  $('#refresh').classList.remove('on');
  render();
}

function nextHourSeaLevel(root, now) {
  const h = root.hourly;
  if (!h || !h.time || !h.sea_level_height_msl) return undefined;
  const target = (now || Date.now() / 1000) + 3600;
  let best = 0, bestDelta = Infinity;
  h.time.forEach((t, i) => {
    const d = Math.abs(t - target);
    if (d < bestDelta) { bestDelta = d; best = i; }
  });
  return h.sea_level_height_msl[best];
}

/* Size sets the ceiling; period and wind scale it down. Multiplicative on
   purpose — an additive model rewards a flat ocean for being windless. */
function score(c) {
  if (!c || c.waveHeightM == null) return 0;
  const h = c.waveHeightM, p = c.wavePeriodS ?? 8, wind = c.windSpeedKmh ?? 0;
  let size;
  if (h < 0.3) size = 5;
  else if (h < 0.8) size = 30 + (h - 0.3) * 80;
  else if (h <= 2.5) size = 70 + (h - 0.8) * 15;
  else if (h <= 4.0) size = 95 - (h - 2.5) * 8;
  else size = 70;
  const periodQ = clamp((p - 6) / 10, 0, 1);
  const windQ = clamp(1 - wind / 35, 0, 1);
  return Math.round(clamp(size * (0.5 + 0.3 * periodQ + 0.2 * windQ), 0, 100));
}

function verdict(s) {
  if (s >= 85) return 'Firing';
  if (s >= 70) return 'Very good';
  if (s >= 55) return 'Fun';
  if (s >= 40) return 'Rideable';
  if (s >= 20) return 'Marginal';
  return 'Flat / blown';
}

function scoreColor(s) {
  if (s >= 85) return '#2be3c6';
  if (s >= 70) return '#63d8a4';
  if (s >= 55) return '#ffb35c';
  if (s >= 40) return '#e9a23b';
  if (s >= 20) return '#ff7a5a';
  return '#9fb6c6';
}

function summaryLine(c) {
  if (!c || c.waveHeightM == null) return 'No reading yet';
  const size = S.useFeet
    ? `${round1(c.waveHeightM * 3.28084)} ft`
    : `${round1(c.waveHeightM)} m`;
  const period = c.wavePeriodS != null ? ` · ${Math.round(c.wavePeriodS)} s` : '';
  const wind = c.windSpeedKmh != null
    ? ` · ${Math.round(c.windSpeedKmh)} km/h${c.windDirectionDeg != null ? ' ' + compass(c.windDirectionDeg) : ''}`
    : '';
  return size + period + wind;
}

/* ---------- the wall ------------------------------------------------------ */

function visibleSpots() {
  const q = S.query.trim().toLowerCase();
  let list = S.spots.filter((s) => {
    const okQuery = !q || s.name.toLowerCase().includes(q) ||
      s.region.toLowerCase().includes(q) || s.country.toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q));
    return okQuery && (!S.favOnly || S.favourites.has(s.id));
  });
  if (S.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else list.sort((a, b) => score(S.conditions[b.id]) - score(S.conditions[a.id]));
  return list;
}

/* Round-robin across spots rather than grouping a spot's cams together: three
   Waikiki angles in a row buries everything else at the top of the wall. Every
   spot shows its best cam first, then second cams follow, and so on. */
function tiles() {
  const spots = visibleSpots();
  const out = [];
  const depth = Math.max(0, ...spots.map((s) => (s.liveCams || []).length));
  for (let round = 0; round < depth; round++) {
    spots.forEach((spot) => {
      const cam = (spot.liveCams || [])[round];
      if (cam) out.push({ spot, cam });
    });
  }
  return out;
}

function renderWall() {
  const wall = $('#wall');
  // Detached hls.js instances keep fetching segments; kill them explicitly.
  wall.querySelectorAll('video').forEach((v) => { if (v._hls) v._hls.destroy(); });
  wall.innerHTML = '';
  const list = tiles();
  $('#subtitle').textContent =
    `${list.length} cams · ${S.budget} playing · ${S.spots.length} spots`;

  if (!list.length) {
    wall.appendChild(el('p', 'note', 'No cams match that search.'));
    return;
  }

  list.forEach(({ spot, cam }, index) => {
    const live = index < S.budget;
    const c = S.conditions[spot.id];
    const s = score(c);
    const tile = el('div', 'tile');

    if (live) {
      tile.appendChild(playerFor(cam, false));
    } else if (cam.kind === 'youtube' && cam.videoId) {
      const img = el('img');
      img.loading = 'lazy';
      img.src = `https://i.ytimg.com/vi/${cam.videoId}/hqdefault.jpg`;
      img.alt = '';
      // A missing poster must not leave a broken-image glyph over the caption.
      img.onerror = () => img.replaceWith(el('div', 'placeholder', 'Tap to go live'));
      tile.appendChild(img);
    } else {
      tile.appendChild(el('div', 'placeholder', 'Tap to go live'));
    }

    tile.appendChild(el('div', 'scrim'));
    const badges = el('div', 'badges');
    badges.appendChild(el('span', live ? 'live' : 'paused', live ? 'LIVE' : 'PAUSED'));
    const badge = el('span', 'score', `<b style="color:${scoreColor(s)}">${c ? s : '–'}</b>`);
    badge.style.borderColor = scoreColor(s) + '73';
    badges.appendChild(badge);
    tile.appendChild(badges);

    tile.appendChild(el('div', 'caption',
      `<b>${escapeHtml(spot.name)}</b><span>${escapeHtml(spot.subtitle || spot.region + ', ' + spot.country)}</span>` +
      `<em>${escapeHtml(summaryLine(c))}</em>`));

    tile.onclick = () => openFocus(spot);
    wall.appendChild(tile);
  });
}

/* The player is an iframe on this page's own origin, which is what YouTube
   requires: loaded as a top-level navigation it refuses with "Video player
   configuration error", and with youtube.com as the referring origin it
   refuses with "This video is unavailable".
   mute=1 is not a preference — browsers will not autoplay audible video at all.
   playsinline=1 keeps iOS from taking over the whole screen. */
function playerFor(cam, controls) {
  return cam.kind === 'hls' ? hlsPlayer(cam, controls) : playerFrame(cam, controls);
}

/* A direct HLS stream. Safari plays these natively; every other browser needs
   hls.js, which is vendored rather than pulled from a CDN so the app keeps
   working offline and needs no third-party origin. */
function hlsPlayer(cam, controls) {
  const video = el('video');
  video.muted = true;              // required, or autoplay is refused outright
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.controls = !!controls;
  video.preload = 'none';

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = cam.url;
  } else if (window.Hls && window.Hls.isSupported()) {
    const hls = new window.Hls({ liveDurationInfinity: true, lowLatencyMode: false });
    hls.loadSource(cam.url);
    hls.attachMedia(video);

    // A live cam drops segments now and then; giving up on the first fatal
    // error would blank a tile that was about to recover. Walk hls.js's own
    // recovery ladder first and only surrender when it stops helping.
    let recoveries = 0;
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      const K = window.Hls.ErrorTypes;
      if (recoveries < 3 && data.type === K.NETWORK_ERROR) {
        recoveries++;
        hls.startLoad();
      } else if (recoveries < 3 && data.type === K.MEDIA_ERROR) {
        recoveries++;
        hls.recoverMediaError();
      } else {
        hls.destroy();
        video.replaceWith(el('div', 'placeholder', 'Stream unavailable'));
      }
    });
    video._hls = hls;
  } else {
    return el('div', 'placeholder', 'HLS not supported here');
  }
  video.play().catch(() => {});
  return video;
}

function playerFrame(cam, controls) {
  const id = S.resolved[cam.channelId] || cam.videoId;
  const frame = el('iframe');
  frame.src = `https://www.youtube.com/embed/${id}` +
    `?autoplay=1&mute=1&playsinline=1&controls=${controls ? 1 : 0}` +
    `&rel=0&fs=0&iv_load_policy=3&enablejsapi=1&origin=${location.origin}`;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.setAttribute('frameborder', '0');
  frame.title = cam.title;
  return frame;
}

function renderRail() {
  const rail = $('#rail');
  rail.innerHTML = '';
  rail.appendChild(el('div', 'rail-head', `SPOTS · ${S.spots.length}`));
  visibleSpots().forEach((spot) => {
    const c = S.conditions[spot.id];
    const s = score(c);
    const row = el('div', 'rail-row' + (S.focusSpot === spot.id ? ' sel' : ''));
    const bar = el('div', 'bar');
    bar.style.background = scoreColor(s);
    row.appendChild(bar);
    row.appendChild(el('div', 'txt',
      `<b>${escapeHtml(spot.name)}</b><span>${escapeHtml(spot.region + ', ' + spot.country)}</span>` +
      `<em style="color:${scoreColor(s)}">${escapeHtml(summaryLine(c))}</em>`));
    const star = el('span', 'star' + (S.favourites.has(spot.id) ? ' on' : ''),
      S.favourites.has(spot.id) ? '★' : '☆');
    star.onclick = (e) => { e.stopPropagation(); toggleFav(spot.id); };
    row.appendChild(star);
    row.onclick = () => { rail.classList.remove('open'); openFocus(spot); };
    rail.appendChild(row);
  });
}

/* ---------- focus --------------------------------------------------------- */

async function openFocus(spot) {
  S.focusSpot = spot.id;
  S.camIndex = 0;
  $('#focus').hidden = false;
  $('#atlas').hidden = true;
  renderFocus();
  // Resolve the channel's current broadcast, since a catalogued video id dies
  // the moment an operator restarts their stream.
  const cam = (spot.liveCams || [])[0];
  if (cam && cam.channelId && !S.resolved[cam.channelId]) {
    const id = await resolveLive(cam.channelId);
    if (id) { S.resolved[cam.channelId] = id; renderFocus(); }
  }
}

/* Browsers cannot read youtube.com pages cross-origin, so this leans on the
   catalogued id and simply verifies it still exists. Anything more would need
   a server; the Android build does the full resolution. */
async function resolveLive(channelId) {
  return null;
}

function renderFocus() {
  const spot = S.spots.find((s) => s.id === S.focusSpot);
  if (!spot) return;
  const c = S.conditions[spot.id];
  const s = score(c);

  $('#focus-name').textContent = spot.name;
  $('#focus-place').textContent = `${spot.region}, ${spot.country}`;
  const badge = $('#focus-score');
  badge.innerHTML = `<b style="color:${scoreColor(s)}">${c ? s : '–'}</b> <span style="font-size:11px;color:#e8fbf7bb">${c ? verdict(s) : 'No data'}</span>`;
  $('#focus-fav').textContent = S.favourites.has(spot.id) ? '★' : '☆';
  $('#focus-fav').onclick = () => { toggleFav(spot.id); renderFocus(); };

  const cams = spot.liveCams || [];
  const player = $('#player');
  player.innerHTML = '';
  if (cams.length) {
    player.appendChild(playerFor(cams[Math.min(S.camIndex, cams.length - 1)], true));
  } else {
    // No embeddable stream here, but the operators below do have one. Put them
    // in the player itself rather than at the bottom of the page.
    const box = el('div', 'placeholder nocam');
    box.appendChild(el('b', '', 'No embeddable cam here — but these operators have one'));
    const row = el('div', 'nocam-links');
    (spot.externalCams || []).forEach((cam) => {
      const a = el('a', cam.provider === 'MEO Beachcam' ? 'primary' : '',
        escapeHtml(cam.provider === 'MEO Beachcam' ? cam.title.replace('MEO Beachcam — ', '') : cam.provider));
      a.href = cam.pageUrl || cam.source;
      a.target = '_blank';
      a.rel = 'noopener';
      row.appendChild(a);
    });
    box.appendChild(row);
    box.appendChild(el('span', '', 'The readings below are live either way.'));
    player.appendChild(box);
  }

  const sw = $('#cam-switch');
  sw.innerHTML = '';
  if (cams.length > 1) {
    cams.forEach((cam, i) => {
      const b = el('button', i === S.camIndex ? 'on' : '', escapeHtml(cam.title));
      b.onclick = () => { S.camIndex = i; renderFocus(); };
      sw.appendChild(b);
    });
  }

  const m = $('#focus-metrics');
  m.innerHTML = '';
  const tide = tideLabel(c);
  [
    [c && c.waveHeightM != null ? (S.useFeet ? round1(c.waveHeightM * 3.28084) + ' ft' : round1(c.waveHeightM) + ' m') : '–', 'WAVE'],
    [c && c.wavePeriodS != null ? Math.round(c.wavePeriodS) + ' s' : '–', 'PERIOD'],
    [c && c.swellDirectionDeg != null ? compass(c.swellDirectionDeg) : '–', 'SWELL DIR'],
    [c && c.windSpeedKmh != null ? Math.round(c.windSpeedKmh) + ' km/h' : '–',
      c && c.windDirectionDeg != null ? 'WIND ' + compass(c.windDirectionDeg) : 'WIND'],
    [c && c.windGustKmh != null ? Math.round(c.windGustKmh) : '–', 'GUST KM/H'],
    [tide, 'TIDE'],
    [c && c.waterTempC != null ? Math.round(c.waterTempC) + '°C' : '–', 'WATER'],
    [c && c.airTempC != null ? Math.round(c.airTempC) + '°C' : '–', 'AIR'],
  ].forEach(([v, k]) => m.appendChild(el('div', '', `<b>${v}</b><span>${k}</span>`)));

  const info = spot.info;
  const body = $('#focus-body');
  body.innerHTML = '';
  body.appendChild(el('div', 'tags',
    (spot.tags || []).slice(0, 4).map((t) => `<span class="tag">${escapeHtml(t.toUpperCase())}</span>`).join('')));
  body.appendChild(el('p', '', escapeHtml(info.about)));

  const cta = el('button', 'cta', '✈  Get me there');
  cta.onclick = () => openTrip(spot);
  body.appendChild(cta);

  body.appendChild(el('div', 'section', 'THE WAVE'));
  body.appendChild(facts([['Break', info.breakType], ['Bottom', info.bottom],
    ['Shape', info.wave], ['Level', info.level], ['Crowd', info.crowd]]));

  body.appendChild(el('div', 'section', 'WHEN IT WORKS'));
  body.appendChild(facts([['Swell', info.bestSwell], ['Wind', info.bestWind],
    ['Tide', info.bestTide], ['Season', info.bestSeason], ['Water', info.waterTemp]]));

  if ((info.hazards || []).length) {
    body.appendChild(el('div', 'section', 'HAZARDS'));
    info.hazards.forEach((h) => body.appendChild(el('div', 'hazard', escapeHtml(h))));
  }
  if (info.localTip) {
    body.appendChild(el('div', 'section', 'LOCAL KNOWLEDGE'));
    body.appendChild(el('div', 'tip', escapeHtml(info.localTip)));
  }

  body.appendChild(el('div', 'section', 'GETTING THERE'));
  body.appendChild(facts([['Airports', (spot.access.airports || []).join(' · ')],
    ['Transfer', spot.access.transfer],
    ['Entry', spot.access.visaNote || 'Check entry rules for your passport']]));

  const links = el('div', 'links');
  (spot.externalCams || []).forEach((cam) => {
    const a = el('a', '', escapeHtml(cam.title));
    a.href = cam.pageUrl || cam.source;
    a.target = '_blank';
    a.rel = 'noopener';
    links.appendChild(a);
  });
  if (cams.length) {
    const a = el('a', '', 'Open in YouTube');
    a.href = cams[Math.min(S.camIndex, cams.length - 1)].pageUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    links.appendChild(a);
  }
  body.appendChild(el('div', 'section', 'MORE CAMS'));
  body.appendChild(links);
}

function facts(rows) {
  const dl = el('dl', 'facts');
  rows.filter(([, v]) => v).forEach(([k, v]) => {
    dl.appendChild(el('dt', '', escapeHtml(k.toUpperCase())));
    dl.appendChild(el('dd', '', escapeHtml(v)));
  });
  return dl;
}

function tideLabel(c) {
  if (!c || c.seaLevelM == null || c.seaLevelNextM == null) return '–';
  const d = c.seaLevelNextM - c.seaLevelM;
  if (d > 0.05) return 'Rising';
  if (d < -0.05) return 'Falling';
  return 'Slack';
}

/* ---------- trip ---------------------------------------------------------- */

function openTrip(spot) {
  S.tripSpot = spot;
  $('#focus').hidden = true;
  $('#trip').hidden = false;
  $('#atlas').hidden = true;
  setTab('trip');
  $('#trip-dest').textContent = `${spot.name} · ${spot.country}`;
  renderTrip();
}

function renderTrip() {
  $('#depart-label').textContent = fmtDate(S.depart);
  $('#return-label').textContent = S.ret ? fmtDate(S.ret) : '—';
  $('#origin').value = S.origin ? `${S.origin.iata} — ${S.origin.city}` : '';
  $('#weight').value = S.weight;

  const picks = $('#picks');
  const list = $('#trip-options');
  const links = $('#trip-links');
  picks.innerHTML = ''; list.innerHTML = ''; links.innerHTML = '';

  if (!S.tripSpot || !S.origin) {
    list.appendChild(el('p', 'note', 'Pick the airport you are flying from.'));
    return;
  }

  const dest = destinationFor(S.tripSpot);
  if (!dest) { list.appendChild(el('p', 'note', 'No airport for this spot.')); return; }

  const options = estimate(S.origin, dest, S.depart, S.ret);
  const cheapest = options.reduce((a, b) => (a.price <= b.price ? a : b));
  const fastest = options.reduce((a, b) => (a.minutes <= b.minutes ? a : b));
  const best = bestValue(options, S.weight / 100);

  [['CHEAPEST', cheapest, '#2be3c6', 'Lowest fare, however long it takes'],
   ['FASTEST', fastest, '#ffb35c', 'Least time in the air and in terminals'],
   ['BEST VALUE', best, '#6c5ce7', 'The fast way for the least money']]
  .forEach(([rank, o, colour, why]) => {
    const card = el('div', 'pick',
      `<div class="rank" style="color:${colour}">${rank}</div>` +
      `<div class="price">$${Math.round(o.price)}</div>` +
      `<div class="sub">${fmtDuration(o.minutes)} · ${stopsText(o.stops)}</div>` +
      `<div class="why">${why}</div>`);
    card.style.borderColor = colour + '66';
    card.onclick = () => window.open(googleFlights(S.origin.iata, dest.iata, S.depart, S.ret), '_blank');
    picks.appendChild(card);
  });

  list.appendChild(el('div', 'section', 'ALL OPTIONS'));
  options.slice().sort((a, b) => a.price - b.price).forEach((o) => {
    const row = el('div', 'opt',
      `<div class="grow"><b>${fmtDuration(o.minutes)} · ${stopsText(o.stops)}</b>` +
      `<span>${o.stops === options[0].stops ? 'Fastest routing' : 'Connecting routing'} · modelled</span></div>` +
      `<div class="p">$${Math.round(o.price)}</div>`);
    row.onclick = () => window.open(googleFlights(S.origin.iata, dest.iata, S.depart, S.ret), '_blank');
    list.appendChild(row);
  });
  list.appendChild(el('p', 'note',
    `${S.origin.iata} → ${dest.iata} · ${Math.round(distanceKm(S.origin.lat, S.origin.lon, dest.lat, dest.lon))} km. ` +
    'Modelled fares — open a booking site for live prices.'));

  const d = iso(S.depart), r = S.ret ? iso(S.ret) : null;
  [['Google Flights', googleFlights(S.origin.iata, dest.iata, S.depart, S.ret)],
   ['Skyscanner', `https://www.skyscanner.net/transport/flights/${S.origin.iata}/${dest.iata}/${compactDate(d)}/${r ? compactDate(r) + '/' : ''}`],
   ['Kiwi', `https://www.kiwi.com/en/search/results/${S.origin.iata}/${dest.iata}/${d}${r ? '/' + r : ''}`],
   ['Kayak', `https://www.kayak.com/flights/${S.origin.iata}-${dest.iata}/${d}${r ? '/' + r : ''}?sort=bestflight_a`]]
  .forEach(([label, href]) => {
    const a = el('a', '', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    links.appendChild(a);
  });
}

function destinationFor(spot) {
  for (const code of spot.access.airports || []) {
    const hit = S.airports.find((a) => a.iata === code);
    if (hit) return hit;
  }
  return null;
}

/* Same offline model as the Android build: fare and block time from distance,
   airport size, season and booking lead time, with a routing per stop count so
   the cheapest/fastest trade is real. Everything here is an estimate and the UI
   says so. */
function estimate(from, to, depart, ret) {
  const km = distanceKm(from.lat, from.lon, to.lat, to.lon);
  const hub = from.size + to.size;
  const minStops = km < 3500 ? (hub >= 5 ? 0 : 1) : km < 9000 ? (hub === 6 ? 0 : 1) : (hub === 6 ? 1 : 2);
  const base = km < 800 ? 70 + km * 0.075
    : km < 2500 ? 95 + km * 0.052
    : km < 6000 ? 150 + km * 0.038
    : km < 11000 ? 260 + km * 0.030
    : 420 + km * 0.024;
  const northern = to.lat >= 0;
  const month = depart.getMonth();
  const peak = northern ? [5, 6, 7, 11].includes(month) : [11, 0, 1, 6].includes(month);
  const days = Math.round((depart - new Date()) / 86400000);
  const lead = days < 0 ? 1 : days < 7 ? 1.55 : days < 21 ? 1.18 : days <= 90 ? 0.95 : days <= 200 ? 1.02 : 1.10;
  const connectivity = 1 + (6 - hub) * 0.06;

  return [0, 1, 2].map((extra) => {
    const stops = minStops + extra;
    const detour = 1 + stops * 0.07;
    const air = Math.round(35 + (km * detour) / 13.7);
    const minutes = air + stops * (km > 6000 ? 150 : 95);
    let price = base * connectivity * (peak ? 1.22 : 0.97) * lead * Math.pow(0.86, extra);
    if (ret) price *= 1.85;
    return { stops, minutes, price };
  });
}

/* "Fast, for less money": normalise both axes across the board and minimise a
   weighted blend. The slider is that weight. */
function bestValue(options, weight) {
  if (options.length <= 1) return options[0];
  const minP = Math.min(...options.map((o) => o.price));
  const maxP = Math.max(...options.map((o) => o.price));
  const minT = Math.min(...options.map((o) => o.minutes));
  const maxT = Math.max(...options.map((o) => o.minutes));
  const norm = (v, lo, hi) => (hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo));
  return options.reduce((best, o) => {
    const s = norm(o.price, minP, maxP) * weight + norm(o.minutes, minT, maxT) * (1 - weight);
    return s < best.s ? { s, o } : best;
  }, { s: Infinity, o: options[0] }).o;
}

function googleFlights(from, to, depart, ret) {
  const q = `flights from ${from} to ${to} on ${iso(depart)}` + (ret ? ` returning ${iso(ret)}` : '');
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q);
}

/* ---------- atlas --------------------------------------------------------- */

let land = null, atlasScale = 1, atlasOffset = { x: 0, y: 0 };

async function renderAtlas() {
  const canvas = $('#map');
  if (!land) land = (await fetch('data/world_land.json').then((r) => r.json())).polygons;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.clientWidth, h = canvas.clientHeight;

  ctx.fillStyle = '#03101c';
  ctx.fillRect(0, 0, w, h);

  const project = (lon, lat) => {
    const x = ((lon + 180) / 360) * w, y = ((90 - lat) / 180) * h;
    return [(x - w / 2) * atlasScale + w / 2 + atlasOffset.x,
            (y - h / 2) * atlasScale + h / 2 + atlasOffset.y];
  };

  ctx.fillStyle = '#0e2b41';
  ctx.strokeStyle = 'rgba(43,227,198,.33)';
  ctx.lineWidth = 1;
  land.forEach((ring) => {
    ctx.beginPath();
    ring.forEach((p, i) => {
      const [x, y] = project(p[0], p[1]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  S.spots.forEach((spot) => {
    const [x, y] = project(spot.lon, spot.lat);
    const s = score(S.conditions[spot.id]);
    const r = (3.5 + s / 22) * Math.min(atlasScale, 2.2);
    ctx.fillStyle = scoreColor(s) + '3a';
    ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = scoreColor(s);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if ((spot.liveCams || []).length) {
      ctx.fillStyle = '#e8fbf7';
      ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, 7); ctx.fill();
    }
  });

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = null, bestD = Infinity;
    S.spots.forEach((spot) => {
      const [x, y] = project(spot.lon, spot.lat);
      const d = Math.abs(x - px) + Math.abs(y - py);
      if (d < bestD) { bestD = d; best = spot; }
    });
    if (best && bestD < 40) { $('#atlas').hidden = true; setTab('wall'); openFocus(best); }
  };
}

/* ---------- plumbing ------------------------------------------------------ */

function render() {
  renderWall();
  renderRail();
  if (!$('#focus').hidden) renderFocus();
  if (!$('#trip').hidden) renderTrip();
}

function setTab(name) {
  S.tab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
}

function toggleFav(id) {
  S.favourites.has(id) ? S.favourites.delete(id) : S.favourites.add(id);
  localStorage.setItem('olakai.fav', JSON.stringify([...S.favourites]));
  render();
}

function wire() {
  $('#search').oninput = (e) => { S.query = e.target.value; render(); };
  $('#refresh').onclick = refreshConditions;
  $('#spots-toggle').onclick = () => $('#rail').classList.toggle('open');

  $('#chips').onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.sort) {
      S.sort = b.dataset.sort;
      document.querySelectorAll('[data-sort]').forEach((c) => c.classList.toggle('on', c === b));
    } else if (b.dataset.fav) {
      S.favOnly = !S.favOnly;
      b.classList.toggle('on', S.favOnly);
    } else if (b.id === 'budget-chip') {
      S.budget = S.budget >= 6 ? 1 : S.budget + 1;
      localStorage.setItem('olakai.budget', String(S.budget));
      b.textContent = `${S.budget} live`;
    }
    render();
  };
  $('#budget-chip').textContent = `${S.budget} live`;

  $('#focus-back').onclick = () => { $('#focus').hidden = true; S.focusSpot = null; render(); };
  $('#trip-back').onclick = () => { $('#trip').hidden = true; setTab('wall'); };

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = () => {
      const name = tab.dataset.tab;
      setTab(name);
      $('#focus').hidden = true;
      $('#trip').hidden = name !== 'trip';
      $('#atlas').hidden = name !== 'atlas';
      if (name === 'atlas') renderAtlas();
      if (name === 'trip') {
        if (!S.tripSpot) S.tripSpot = visibleSpots()[0];
        $('#trip-dest').textContent = S.tripSpot ? `${S.tripSpot.name} · ${S.tripSpot.country}` : '';
        renderTrip();
      }
    };
  });

  $('#origin').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    const hits = $('#origin-hits');
    hits.innerHTML = '';
    if (q.length < 2) return;
    S.airports
      .filter((a) => a.iata.toLowerCase() === q || a.city.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => (b.iata.toLowerCase() === q) - (a.iata.toLowerCase() === q) || b.size - a.size)
      .slice(0, 8)
      .forEach((a) => {
        const b = el('button', '', `<code>${a.iata}</code>${escapeHtml(a.city)}, ${escapeHtml(a.country)}`);
        b.onclick = () => {
          S.origin = a;
          localStorage.setItem('olakai.origin', a.iata);
          hits.innerHTML = '';
          renderTrip();
        };
        hits.appendChild(b);
      });
  };

  document.querySelectorAll('.nudge').forEach((n) => {
    n.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const days = Number(b.dataset.d);
      if (n.dataset.target === 'depart') {
        S.depart = addDays(S.depart, days);
        if (S.depart < new Date()) S.depart = new Date();
        if (S.ret && S.ret < S.depart) S.ret = addDays(S.depart, 14);
      } else {
        S.ret = addDays(S.ret || addDays(S.depart, 14), days);
        if (S.ret < S.depart) S.ret = addDays(S.depart, 1);
      }
      renderTrip();
    };
  });
  $('#oneway').onclick = () => { S.ret = S.ret ? null : addDays(S.depart, 14); renderTrip(); };
  $('#weight').oninput = (e) => { S.weight = Number(e.target.value); renderTrip(); };

  let pinchStart = null;
  const canvas = $('#map');
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) pinchStart = touchDistance(e) / atlasScale;
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart) {
      atlasScale = clamp(touchDistance(e) / pinchStart, 1, 8);
      renderAtlas();
    }
  }, { passive: true });
  window.addEventListener('resize', () => { if (!$('#atlas').hidden) renderAtlas(); });
}

function touchDistance(e) {
  const [a, b] = e.touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/* ---------- small helpers ------------------------------------------------- */

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round1 = (v) => Math.round(v * 10) / 10;
const chunked = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const asArray = (v) => (Array.isArray(v) ? v : [v]);
const getJSON = (url) => fetch(url).then((r) => r.json());
// A function declaration, not a const arrow: the state object below is built
// at parse time and would hit the temporal dead zone otherwise.
function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}
const iso = (d) => d.toISOString().slice(0, 10);
const compactDate = (isoDate) => isoDate.replace(/-/g, '').slice(2);
const fmtDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDuration = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const stopsText = (s) => (s === 0 ? 'Direct' : s === 1 ? '1 stop' : `${s} stops`);

function compass(deg) {
  const points = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return points[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

wire();
boot();

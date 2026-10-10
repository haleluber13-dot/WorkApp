/* Leaflet map of requests. Pins are city-level and slightly shifted (see
   form.js), never a home address. Falls back to a region summary if Leaflet
   or the map tiles cannot load. */
import { REGIONS, URG, regionLabel } from "./taxonomy.js";
import { esc } from "./ui.js";

const URG_COLOR = { low: "#4c9a6a", normal: "#2f7fb5", high: "#e08a1e", critical: "#d43c3c" };

export function requestMap(el, reqs) {
  if (!window.L) {
    el.innerHTML = regionSummary(reqs);
    return { update: (r) => (el.innerHTML = regionSummary(r)), destroy() {} };
  }
  const map = L.map(el, { zoomControl: true, attributionControl: true, zoomSnap: 0.25 });
  const ISRAEL = [[29.5, 34.3], [33.3, 35.85]];
  map.fitBounds(ISRAEL);
  let points = [];
  /* frame the requests being shown, or the whole country when there are none */
  const frame = () => {
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 11 });
    else map.fitBounds(ISRAEL);
  };
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 16, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);

  function update(list) {
    layer.clearLayers();
    points = list.filter((r) => r.lat != null && r.lng != null).map((r) => [r.lat, r.lng]);
    frame();
    for (const r of list) {
      if (r.lat == null || r.lng == null) continue;
      const m = L.circleMarker([r.lat, r.lng], {
        radius: r.urgency === "critical" ? 11 : r.urgency === "high" ? 9 : 7,
        color: "#fff", weight: 2, fillColor: r.status === "in_progress" ? "#8a8fa3" : URG_COLOR[r.urgency] || "#2f7fb5", fillOpacity: 0.9,
      });
      m.bindPopup(`<div class="pop" dir="rtl"><b>${esc(r.title)}</b><br><span>${esc(r.city || regionLabel(r.region))} · ${esc(URG[r.urgency]?.label || "")}</span><br><a href="#/request/${encodeURIComponent(r.id)}">לפרטים ←</a></div>`);
      m.addTo(layer);
    }
  }
  update(reqs);
  setTimeout(() => { map.invalidateSize(); frame(); }, 50);
  return { update, destroy: () => map.remove(), map };
}

function regionSummary(reqs) {
  return `<div class="reg-summary">${REGIONS.map((r) => {
    const n = reqs.filter((x) => x.region === r.key).length;
    return `<a href="#/requests?region=${r.key}" class="reg-cell"><b>${n}</b>${esc(r.label)}</a>`;
  }).join("")}</div>`;
}

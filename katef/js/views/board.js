/* Request board (#/requests): everyone who asked for help, as a list or on a
   map, filtered by region, kind of help, who is asking and urgency. Filters
   live in the URL so a link to a filtered view can be shared. */
import { CATEGORIES, REGIONS, AUDIENCES, URGENCY, km } from "../taxonomy.js";
import { esc, $, toast, emptyState } from "../ui.js";
import { setQuery } from "../app.js";
import { reqCard } from "./home.js";
import { requestMap } from "../map.js";
import { requestFitsOrg } from "../directory.js";
import { STALE_CLAIM_DAYS } from "../config.js";

const URG_RANK = { critical: 0, high: 1, normal: 2, low: 3 };

export async function render(main, { query, me, store }) {
  const isOrg = me?.profile.role === "org";
  const all = await store.listRequests();
  const f = {
    q: query.get("q") || "", region: query.get("region") || "", cat: query.get("cat") || "",
    aud: query.get("aud") || "", urg: (query.get("urg") || "").split(",").filter(Boolean),
    status: query.get("status") || "active", sort: query.get("sort") || "urgent",
    view: query.get("view") || "list", mine: query.get("mine") === "1",
  };
  let here = null;

  main.innerHTML = `<section class="page wide">
    <div class="sec-head">
      <h1>לוח בקשות</h1>
      <div class="seg" role="tablist">
        <button data-view="list" class="${f.view === "list" ? "on" : ""}">☰ רשימה</button>
        <button data-view="map" class="${f.view === "map" ? "on" : ""}">🗺️ מפה</button>
      </div>
    </div>
    <p class="muted">${isOrg ? "בקשות של אנשים שצריכים עזרה. לקחו בקשה כדי לראות את פרטי הקשר ולהתחיל לעזור." : "כל מי שביקש עזרה. רק תחום, עיר ותיאור קצר גלויים — פרטי הקשר נחשפים רק לעמותה המטפלת."}</p>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="🔍 חיפוש…" value="${esc(f.q)}" aria-label="חיפוש">
      <select name="region" aria-label="אזור"><option value="">כל האזורים</option>${REGIONS.map((r) => `<option value="${r.key}" ${f.region === r.key ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>
      <select name="cat" aria-label="תחום"><option value="">כל סוגי העזרה</option>${CATEGORIES.map((c) => `<option value="${c.key}" ${f.cat === c.key ? "selected" : ""}>${c.icon} ${esc(c.label)}</option>`).join("")}</select>
      <select name="aud" aria-label="מי מבקש"><option value="">כל המבקשים</option>${AUDIENCES.map((a) => `<option value="${a.key}" ${f.aud === a.key ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select>
      <select name="urg" aria-label="דחיפות"><option value="">כל רמות הדחיפות</option>
        <option value="critical" ${f.urg.join() === "critical" ? "selected" : ""}>דחוף מאוד בלבד</option>
        <option value="critical,high" ${f.urg.join() === "critical,high" ? "selected" : ""}>דחוף ודחוף מאוד</option></select>
      <select name="status" aria-label="סטטוס">
        <option value="active" ${f.status === "active" ? "selected" : ""}>פתוחות ובטיפול</option>
        <option value="open" ${f.status === "open" ? "selected" : ""}>מחכות לעזרה</option>
        <option value="in_progress" ${f.status === "in_progress" ? "selected" : ""}>בטיפול</option>
        <option value="stale" ${f.status === "stale" ? "selected" : ""}>תקועות (${STALE_CLAIM_DAYS}+ ימים בלי עדכון)</option>
        <option value="resolved" ${f.status === "resolved" ? "selected" : ""}>טופלו</option>
        <option value="all" ${f.status === "all" ? "selected" : ""}>הכל</option></select>
      <select name="sort" aria-label="מיון">
        <option value="urgent" ${f.sort === "urgent" ? "selected" : ""}>הכי דחוף קודם</option>
        <option value="new" ${f.sort === "new" ? "selected" : ""}>הכי חדש קודם</option>
        <option value="old" ${f.sort === "old" ? "selected" : ""}>מחכה הכי הרבה זמן</option>
        <option value="near" ${f.sort === "near" ? "selected" : ""}>הכי קרוב אליי</option></select>
      ${isOrg ? `<label class="check"><input type="checkbox" name="mine" ${f.mine ? "checked" : ""}> רק מה שמתאים לעמותה שלי</label>` : ""}
    </form>
    <div class="summary" id="summary"></div>
    <div id="mapWrap" ${f.view === "map" ? "" : "hidden"}>
      <div id="mapBox" class="mapbox"></div>
      <div class="legend small"><span style="--c:#d43c3c">דחוף מאוד</span><span style="--c:#e08a1e">דחוף</span><span style="--c:#2f7fb5">רגיל</span><span style="--c:#4c9a6a">יכול לחכות</span><span style="--c:#8a8fa3">בטיפול</span>
        <span class="muted">· המיקום מוצג ברמת עיר בלבד</span></div>
    </div>
    <div id="list" class="cards" ${f.view === "list" ? "" : "hidden"}></div>
  </section>`;

  let mapCtl = null;
  const filtered = () => {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const staleMs = STALE_CLAIM_DAYS * 864e5;
    let res = all.filter((r) => {
      if (f.status === "active" && !["open", "in_progress"].includes(r.status)) return false;
      if (f.status === "stale" && !(["open", "in_progress"].includes(r.status) && Date.now() - Date.parse(r.updatedAt) > staleMs)) return false;
      if (!["active", "stale", "all"].includes(f.status) && r.status !== f.status) return false;
      if (f.status === "all" && r.status === "closed") return false;
      if (f.region && r.region !== f.region) return false;
      if (f.cat && !r.categories.includes(f.cat)) return false;
      if (f.aud && r.audience !== f.aud) return false;
      if (f.urg.length && !f.urg.includes(r.urgency)) return false;
      if (f.mine && !requestFitsOrg(r, me.org)) return false;
      if (words.length && !words.every((w) => `${r.title} ${r.description} ${r.city}`.toLowerCase().includes(w))) return false;
      return true;
    });
    const by = {
      urgent: (a, b) => URG_RANK[a.urgency] - URG_RANK[b.urgency] || Date.parse(b.createdAt) - Date.parse(a.createdAt),
      new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      old: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      near: (a, b) => (here ? km(here, [a.lat, a.lng]) - km(here, [b.lat, b.lng]) : 0),
    };
    return res.sort(by[f.sort] || by.urgent);
  };

  const draw = () => {
    const res = filtered();
    const open = res.filter((r) => r.status === "open").length;
    const crit = res.filter((r) => r.status === "open" && r.urgency === "critical").length;
    $("#summary", main).innerHTML = `<b>${res.length}</b> בקשות · ${open} מחכות לעזרה${crit ? ` · <span class="txt-crit">${crit} דחופות מאוד</span>` : ""}`;
    $("#list", main).innerHTML = res.length ? res.map(reqCard).join("")
      : emptyState("🌱", "אין בקשות שמתאימות לסינון", "נסו לשנות אזור או תחום.");
    if (f.view === "map") {
      if (!mapCtl) mapCtl = requestMap($("#mapBox", main), res);
      else mapCtl.update(res);
    }
  };

  const readForm = () => {
    const fd = new FormData($("#filters", main));
    Object.assign(f, {
      q: fd.get("q").trim(), region: fd.get("region"), cat: fd.get("cat"), aud: fd.get("aud"),
      urg: (fd.get("urg") || "").split(",").filter(Boolean), status: fd.get("status"), sort: fd.get("sort"), mine: !!fd.get("mine"),
    });
    sync();
  };
  const sync = () => setQuery({ q: f.q, region: f.region, cat: f.cat, aud: f.aud, urg: f.urg, status: f.status === "active" ? "" : f.status, sort: f.sort === "urgent" ? "" : f.sort, view: f.view === "list" ? "" : f.view, mine: f.mine ? "1" : "" });

  let t;
  $("#filters", main).addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { readForm(); maybeLocate(); draw(); }, 120); });
  $("#filters", main).addEventListener("submit", (e) => e.preventDefault());
  main.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    f.view = b.dataset.view;
    main.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("on", x === b));
    $("#mapWrap", main).hidden = f.view !== "map";
    $("#list", main).hidden = f.view !== "list";
    sync(); draw();
    mapCtl?.map?.invalidateSize();
  }));

  function maybeLocate() {
    if (f.sort !== "near" || here) return;
    navigator.geolocation?.getCurrentPosition((p) => { here = [p.coords.latitude, p.coords.longitude]; draw(); },
      () => toast("אין הרשאת מיקום — ממיינים לפי דחיפות"), { timeout: 10000 });
  }
  maybeLocate();
  draw();
  return () => mapCtl?.destroy();
}

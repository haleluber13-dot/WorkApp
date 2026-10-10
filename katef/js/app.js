/* App shell: hash router, top bar state, accessibility preferences, and the
   service worker. Each screen lives in js/views/ and exports render(main, ctx). */
import { store } from "./store.js";
import { $, $$, esc, modal, toast } from "./ui.js";

const routes = {
  "": () => import("./views/home.js"),
  find: () => import("./views/find.js"),
  requests: () => import("./views/board.js"),
  request: () => import("./views/request.js"),
  new: () => import("./views/form.js"),
  edit: () => import("./views/form.js"),
  orgs: () => import("./views/orgs.js"),
  org: () => import("./views/orgs.js"),
  offers: () => import("./views/offers.js"),
  me: () => import("./views/me.js"),
  login: () => import("./views/auth.js"),
  signup: () => import("./views/auth.js"),
  admin: () => import("./views/admin.js"),
  about: () => import("./views/about.js"),
  crisis: () => import("./views/about.js"),
};

/* "#/requests?region=south&cat=food" → { name: "requests", parts: [], query } */
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const [name = "", ...parts] = path.split("/").map(decodeURIComponent);
  return { name, parts, query: new URLSearchParams(qs) };
}

/* Replace the query string of the current route without re-rendering. */
export function setQuery(params) {
  const { name, parts } = parseHash();
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])).toString();
  history.replaceState(null, "", "#/" + [name, ...parts].map(encodeURIComponent).join("/") + (qs ? "?" + qs : ""));
}

let cleanup = null;
let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();
  const load = routes[route.name] || routes[""];
  const main = $("#main");
  if (typeof cleanup === "function") { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const me = await store.me().catch(() => null);
  updateTop(me, route.name);
  try {
    const mod = await load();
    if (seq !== renderSeq) return;
    main.innerHTML = "";
    cleanup = await mod.render(main, { ...route, me, store });
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="page"><div class="card"><h2>משהו השתבש</h2><p>${esc(e.message)}</p><a class="btn" href="#/">חזרה לדף הבית</a></div></section>`;
  }
  if (seq === renderSeq && !route.query.has("s")) window.scrollTo(0, 0);
}

function updateTop(me, name) {
  const link = $("#meLink");
  if (me) {
    link.href = "#/me";
    link.textContent = me.profile.role === "org" ? "🏛️ העמותה שלי" : me.profile.role === "admin" ? "🛡️ ניהול" : "👤 האזור שלי";
  } else {
    link.href = "#/login";
    link.textContent = "כניסה / הרשמה";
  }
  const active = name || "home";
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === active || (active === "request" && a.dataset.nav === "requests") || (active === "org" && a.dataset.nav === "orgs")));
  const bar = $("#modeBar");
  if (store.mode === "demo") {
    bar.hidden = false;
    bar.innerHTML = `🧪 <b>מצב הדגמה</b> — הנתונים נשמרים רק בדפדפן הזה, והבקשות המסומנות ״דוגמה״ אינן אמיתיות. <a href="#/about?s=live">איך מחברים למצב חי</a>`;
  } else bar.hidden = true;
}

/* accessibility & display */
function prefs() { try { return JSON.parse(localStorage.getItem("katef:prefs") || "{}"); } catch { return {}; } }
function savePrefs(p) { try { localStorage.setItem("katef:prefs", JSON.stringify(p)); } catch { /* ignore */ } }

$("#btnA11y").addEventListener("click", async () => {
  const p = prefs();
  const v = await modal({
    title: "נגישות ותצוגה",
    ok: "שמירה",
    body: `
      <label class="field"><span>ערכת צבעים</span>
        <select name="theme">
          <option value="">לפי המכשיר</option>
          <option value="light" ${p.theme === "light" ? "selected" : ""}>בהירה</option>
          <option value="dark" ${p.theme === "dark" ? "selected" : ""}>כהה</option>
          <option value="contrast" ${p.theme === "contrast" ? "selected" : ""}>ניגודיות גבוהה</option>
        </select></label>
      <label class="check"><input type="checkbox" name="big" ${p.big ? "checked" : ""}> טקסט גדול</label>`,
  });
  if (!v) return;
  const next = { theme: v.theme || "", big: !!v.big };
  savePrefs(next);
  if (next.theme) document.documentElement.dataset.theme = next.theme; else delete document.documentElement.dataset.theme;
  document.documentElement.classList.toggle("big", next.big);
});

window.addEventListener("hashchange", render);
store.onChange(() => { store.me().then((me) => updateTop(me, parseHash().name)); });
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason?.message;
  if (msg) toast(msg, "err");
});

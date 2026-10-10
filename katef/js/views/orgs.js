/* Organization directory (#/orgs) and one organization's page (#/org/:id). */
import { CATEGORIES, REGIONS, AUDIENCES, regionLabel } from "../taxonomy.js";
import { esc, safeUrl, telHref, waHref, catChips, $, $$, toast, modal, emptyState } from "../ui.js";
import { allOrgs, scoreOrg } from "../directory.js";
import { setQuery } from "../app.js";
import { offerCard } from "./offers.js";

const FAV_KEY = "katef:favOrgs";
const favs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); } };
const saveFavs = (s) => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };

const TYPE_LABEL = { nonprofit: "עמותה", government: "גוף ממשלתי", hotline: "קו סיוע" };

export function orgCard(o) {
  const site = safeUrl(o.website);
  const tel = o.phone ? telHref(o.phone) : "";
  const wa = o.whatsapp ? waHref(o.whatsapp) : "";
  const fav = favs().has(o.id);
  return `
  <article class="card org" data-org="${esc(o.id)}">
    <div class="org-head">
      <a class="org-name" href="#/org/${encodeURIComponent(o.id)}"><h3>${esc(o.name)}</h3></a>
      <button class="fav ${fav ? "on" : ""}" data-fav="${esc(o.id)}" aria-pressed="${fav}" title="שמירה ברשימה שלי" aria-label="שמירה">${fav ? "★" : "☆"}</button>
    </div>
    <div class="org-tags">
      <span class="badge type">${esc(TYPE_LABEL[o.type] || "עמותה")}</span>
      ${o.onPlatform ? (o.verified ? `<span class="badge ok">✓ רשומה ומאומתת בכתף</span>` : `<span class="badge">רשומה — ממתינה לאימות</span>`) : ""}
      ${o.demo ? `<span class="badge demo">דוגמה</span>` : ""}
      <span class="muted small">📍 ${esc((o.regions?.length ? o.regions : ["all"]).map(regionLabel).join(" · "))}</span>
    </div>
    <p>${esc(o.desc)}</p>
    <div class="chips">${catChips((o.categories || []).slice(0, 5))}</div>
    <div class="org-actions">
      ${tel ? `<a class="btn small primary" href="${esc(tel)}">📞 ${esc(o.phone)}</a>` : ""}
      ${wa ? `<a class="btn small" href="${esc(wa)}" target="_blank" rel="noopener">💬 וואטסאפ</a>` : ""}
      ${site ? `<a class="btn small" href="${esc(site)}" target="_blank" rel="noopener">🌐 אתר</a>` : ""}
      ${o.hours ? `<span class="muted small">🕒 ${esc(o.hours)}</span>` : ""}
    </div>
  </article>`;
}

export function bindOrgCards(root) {
  $$("[data-fav]", root).forEach((b) => b.addEventListener("click", () => {
    const s = favs(); const id = b.dataset.fav;
    s.has(id) ? s.delete(id) : s.add(id);
    saveFavs(s);
    const on = s.has(id);
    b.classList.toggle("on", on); b.textContent = on ? "★" : "☆"; b.setAttribute("aria-pressed", on);
    toast(on ? "נשמר ברשימה שלך" : "הוסר מהרשימה");
  }));
}

export async function render(main, ctx) {
  if (ctx.name === "org") return renderOne(main, ctx);
  const { query } = ctx;
  const orgs = await allOrgs();
  const f = {
    q: query.get("q") || "", cat: query.get("cat") || "", region: query.get("region") || "",
    aud: query.get("aud") || "", type: query.get("type") || "", fav: query.get("fav") === "1",
  };

  main.innerHTML = `<section class="page">
    <div class="sec-head"><h1>מאגר עמותות וקווי סיוע</h1><span class="muted" id="count"></span></div>
    <p class="muted">עמותות, קווי סיוע וגופים שעוזרים לחיילים, למשפחות ולכל מי שצריך. פרטי הקשר נאספו ממקורות רשמיים — אם משהו השתנה, <a href="#" id="fix">ספרו לנו</a>.</p>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="🔍 חיפוש לפי שם, תחום או מילה…" value="${esc(f.q)}" aria-label="חיפוש">
      <select name="cat" aria-label="תחום"><option value="">כל התחומים</option>${CATEGORIES.map((c) => `<option value="${c.key}" ${f.cat === c.key ? "selected" : ""}>${c.icon} ${esc(c.label)}</option>`).join("")}</select>
      <select name="region" aria-label="אזור"><option value="">כל האזורים</option>${REGIONS.map((r) => `<option value="${r.key}" ${f.region === r.key ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>
      <select name="aud" aria-label="למי"><option value="">לכולם</option>${AUDIENCES.map((a) => `<option value="${a.key}" ${f.aud === a.key ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select>
      <select name="type" aria-label="סוג"><option value="">כל הסוגים</option>
        <option value="nonprofit" ${f.type === "nonprofit" ? "selected" : ""}>עמותות</option>
        <option value="hotline" ${f.type === "hotline" ? "selected" : ""}>קווי סיוע</option>
        <option value="government" ${f.type === "government" ? "selected" : ""}>גופים ממשלתיים</option>
        <option value="platform" ${f.type === "platform" ? "selected" : ""}>רשומות בכתף (לוקחות בקשות)</option></select>
      <label class="check"><input type="checkbox" name="fav" ${f.fav ? "checked" : ""}> ★ השמורים שלי</label>
    </form>
    <div class="cards orgs" id="list"></div>
  </section>`;

  const list = $("#list", main);
  const draw = () => {
    const fd = new FormData($("#filters", main));
    Object.assign(f, { q: fd.get("q").trim(), cat: fd.get("cat"), region: fd.get("region"), aud: fd.get("aud"), type: fd.get("type"), fav: !!fd.get("fav") });
    setQuery({ q: f.q, cat: f.cat, region: f.region, aud: f.aud, type: f.type, fav: f.fav ? "1" : "" });
    const fv = favs();
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    let res = orgs.filter((o) => {
      if (f.fav && !fv.has(o.id)) return false;
      if (f.type === "platform" ? !o.onPlatform : f.type && o.type !== f.type) return false;
      if (f.cat || f.region || f.aud) {
        if (!scoreOrg(o, { categories: f.cat ? [f.cat] : [], region: f.region, audience: "" })) return false;
        if (f.aud && o.audiences?.length && !o.audiences.includes(f.aud) && !o.audiences.includes("general")) return false;
      }
      if (words.length) {
        const cats = (o.categories || []).map((k) => CATEGORIES.find((c) => c.key === k)?.label || "").join(" ");
        const hay = `${o.name} ${o.nameEn || ""} ${o.desc} ${cats}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (f.aud) res = res.sort((a, b) => (b.audiences?.includes(f.aud) ? 1 : 0) - (a.audiences?.includes(f.aud) ? 1 : 0));
    $("#count", main).textContent = `${res.length} מתוך ${orgs.length}`;
    list.innerHTML = res.length ? res.map(orgCard).join("") : emptyState("🔎", "לא נמצאו תוצאות", "נסו לנקות חלק מהסינונים.");
    bindOrgCards(list);
  };
  let t;
  $("#filters", main).addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, 120); });
  $("#filters", main).addEventListener("submit", (e) => e.preventDefault());
  $("#fix", main).addEventListener("click", (e) => { e.preventDefault(); reportOrg(ctx.store, null); });
  draw();
}

async function reportOrg(store, org) {
  const v = await modal({
    title: org ? `דיווח על ${org.name}` : "תיקון במאגר",
    ok: "שליחה",
    body: `<label class="field"><span>מה לא מדויק? (טלפון שגוי, עמותה שנסגרה, חשד להונאה…)</span><textarea name="reason" required rows="4"></textarea></label>`,
  });
  if (!v) return;
  await store.report("org", org?.id || "directory", v.reason);
  toast("תודה! הדיווח נשלח לצוות");
}

async function renderOne(main, { parts, store }) {
  const id = parts[0];
  const orgs = await allOrgs();
  const o = orgs.find((x) => x.id === id);
  if (!o) { main.innerHTML = `<section class="page">${emptyState("🏛️", "העמותה לא נמצאה", "", `<a class="btn" href="#/orgs">למאגר העמותות</a>`)}</section>`; return; }
  const offers = o.onPlatform ? (await store.listOffers()).filter((x) => x.orgId === o.platformId) : [];
  const site = safeUrl(o.website);
  main.innerHTML = `<section class="page narrow">
    <a class="back" href="#/orgs">→ למאגר</a>
    ${orgCard(o)}
    <div class="card">
      <h3>פרטים</h3>
      <dl class="dl">
        ${o.nameEn ? `<dt>שם באנגלית</dt><dd>${esc(o.nameEn)}</dd>` : ""}
        <dt>למי</dt><dd>${(o.audiences || []).map((a) => esc(AUDIENCES.find((x) => x.key === a)?.label || a)).join(" · ") || "לכולם"}</dd>
        <dt>תחומים</dt><dd>${catChips(o.categories)}</dd>
        <dt>אזורים</dt><dd>${esc((o.regions?.length ? o.regions : ["all"]).map(regionLabel).join(" · "))}</dd>
        ${o.email ? `<dt>אימייל</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>` : ""}
        ${site ? `<dt>אתר</dt><dd><a href="${esc(site)}" target="_blank" rel="noopener">${esc(site)}</a></dd>` : ""}
        ${o.regNumber ? `<dt>מספר עמותה</dt><dd>${esc(o.regNumber)} · <a href="https://www.guidestar.org.il/organization/${encodeURIComponent(o.regNumber)}" target="_blank" rel="noopener">בדיקה בגיידסטאר ↗</a></dd>` : ""}
        ${o.source ? `<dt>מקור המידע</dt><dd><a href="${esc(safeUrl(o.source))}" target="_blank" rel="noopener" class="small">${esc(o.source)}</a></dd>` : ""}
      </dl>
    </div>
    ${offers.length ? `<h2 class="sec">הצעות עזרה פעילות</h2><div class="cards">${offers.map(offerCard).join("")}</div>` : ""}
    <div class="row">
      <a class="btn" href="#/new?cat=${encodeURIComponent((o.categories || [])[0] || "")}">פרסום בקשה בתחום הזה</a>
      <button class="btn ghost" id="rep">🚩 דיווח על מידע שגוי</button>
    </div>
  </section>`;
  bindOrgCards(main);
  $("#rep", main).onclick = () => reportOrg(store, o);
}

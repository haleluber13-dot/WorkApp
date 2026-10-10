/* Personal area (#/me). A person sees their requests and their status; an
   organization sees requests that fit it, the ones it handles, its offers
   and its profile. */
import { CATEGORIES, REGIONS, AUDIENCES } from "../taxonomy.js";
import { esc, $, toast, chipPicker, pickedValues, emptyState, timeAgo, statusBadge } from "../ui.js";
import { requestFitsOrg } from "../directory.js";
import { reqCard } from "./home.js";
import { offerCard, offerForm, bindOfferDelete } from "./offers.js";
import { STALE_CLAIM_DAYS } from "../config.js";

export async function render(main, ctx) {
  const { me, store } = ctx;
  if (!me) { location.hash = "#/login?next=" + encodeURIComponent("#/me"); return; }
  if (me.profile.role === "org") return orgArea(main, ctx);
  if (me.profile.role === "admin") {
    main.innerHTML = `<section class="page narrow"><div class="card"><h1>🛡️ ${esc(me.profile.displayName)}</h1>
      <p>את/ה מחובר/ת כמנהל/ת.</p><div class="row"><a class="btn primary" href="#/admin">ללוח הניהול</a><button class="btn ghost" id="out">יציאה</button></div></div></section>`;
    $("#out", main).onclick = () => store.signOut().then(() => (location.hash = "#/"));
    return;
  }

  const mine = (await store.listRequests()).filter((r) => r.ownerId === me.user.id)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  main.innerHTML = `<section class="page">
    <div class="sec-head"><h1>שלום ${esc(me.profile.displayName || "")} 👋</h1><a class="btn primary" href="#/new">＋ בקשה חדשה</a></div>
    <h2 class="sec">הבקשות שלי</h2>
    ${mine.length ? `<div class="cards">${mine.map((r) => `
      <a class="card req" href="#/request/${encodeURIComponent(r.id)}">
        <div class="req-top">${statusBadge(r.status)}<span class="muted">עודכן ${timeAgo(r.updatedAt)}</span></div>
        <h3>${esc(r.title)}</h3>
        <p class="muted">${r.assignedOrgName ? `🏛️ ${esc(r.assignedOrgName)} מטפלת — לחצו לפרטי הקשר וההודעות` : r.status === "open" ? "ממתינה שעמותה תיקח אותה. בינתיים אפשר לפנות ישירות לעמותות מתאימות." : ""}</p>
      </a>`).join("")}</div>`
      : emptyState("📝", "עוד לא פרסמת בקשות", "פרסמו בקשה ועמותות מתאימות יראו אותה.", `<a class="btn primary" href="#/new">פרסום בקשה</a>`)}

    <div class="split">
      <div class="card soft"><h3>🧭 מי יכול לעזור לי?</h3><p>שאלון קצר שמתאים לכם עמותות וזכויות.</p><a class="btn" href="#/find">לשאלון</a></div>
      <div class="card soft"><h3>★ העמותות ששמרתי</h3><p>העמותות שסימנתם בכוכב במאגר.</p><a class="btn" href="#/orgs?fav=1">לרשימה</a></div>
    </div>
    ${accountCard(me)}
  </section>`;
  bindAccount(main, me, store);
}

function accountCard(me) {
  return `<details class="card"><summary><b>⚙️ החשבון שלי</b> <span class="muted small">${esc(me.user.email || "")}</span></summary>
    <form id="acc" class="form row">
      <label class="field grow"><span>שם תצוגה</span><input name="displayName" value="${esc(me.profile.displayName || "")}" maxlength="40"></label>
      <button class="btn">שמירה</button>
    </form>
    <button class="btn ghost" id="out">יציאה מהחשבון</button>
  </details>`;
}
function bindAccount(main, me, store) {
  $("#acc", main)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await store.updateProfile({ displayName: e.target.displayName.value.trim() });
    toast("נשמר");
  });
  $("#out", main)?.addEventListener("click", async () => { await store.signOut(); location.hash = "#/"; });
}

async function orgArea(main, { me, store, query }) {
  const org = me.org;
  if (!org || query.get("setup") === "1" || query.get("edit") === "1") return orgProfileForm(main, me, store, !org);

  const [reqs, offers] = await Promise.all([store.listRequests(), store.listOffers()]);
  const lastKey = "katef:lastSeen:" + me.user.id;
  let lastSeen = 0; try { lastSeen = Number(localStorage.getItem(lastKey) || 0); } catch { /* ignore */ }
  const fits = reqs.filter((r) => r.status === "open" && requestFitsOrg(r, org))
    .sort((a, b) => ({ critical: 0, high: 1, normal: 2, low: 3 }[a.urgency] - { critical: 0, high: 1, normal: 2, low: 3 }[b.urgency]) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const fresh = fits.filter((r) => Date.parse(r.createdAt) > lastSeen).length;
  const handling = reqs.filter((r) => r.assignedOrg === me.user.id && r.status === "in_progress");
  const done = reqs.filter((r) => r.assignedOrg === me.user.id && r.status === "resolved").length;
  const stale = handling.filter((r) => Date.now() - Date.parse(r.updatedAt) > (STALE_CLAIM_DAYS - 2) * 864e5);
  const myOffers = offers.filter((o) => o.orgId === me.user.id);
  try { localStorage.setItem(lastKey, String(Date.now())); } catch { /* ignore */ }

  main.innerHTML = `<section class="page">
    <div class="sec-head"><h1>🏛️ ${esc(org.name)}</h1><div class="row"><a class="btn small" href="#/me?edit=1">עריכת פרופיל</a></div></div>
    ${org.verified ? "" : `<div class="alert warn"><b>החשבון ממתין לאימות.</b> כדי להגן על מי שמבקש עזרה, צוות כתף בודק כל עמותה (מספר עמותה ואישור ניהול תקין) לפני שהיא יכולה לקחת בקשות ולראות פרטי קשר. בינתיים אפשר לעיין בלוח.</div>`}
    <div class="stats">
      <div class="stat"><b>${fits.length}</b><span>בקשות פתוחות שמתאימות לכם${fresh ? ` · <span class="txt-crit">${fresh} חדשות</span>` : ""}</span></div>
      <div class="stat"><b>${handling.length}</b><span>בטיפול שלכם</span></div>
      <div class="stat"><b>${done}</b><span>טופלו על ידיכם</span></div>
    </div>

    ${stale.length ? `<div class="alert warn">⏳ ${stale.length} בקשות בטיפול שלכם לא עודכנו כמה ימים. אחרי ${STALE_CLAIM_DAYS} ימים בלי עדכון עמותה אחרת תוכל לקחת אותן — עדכנו סטטוס או שלחו הודעה.</div>` : ""}

    <h2 class="sec">בטיפול שלכם</h2>
    ${handling.length ? `<div class="cards">${handling.map(reqCard).join("")}</div>` : `<p class="muted">עוד לא לקחתם בקשות.</p>`}

    <div class="sec-head"><h2 class="sec">מחכות לעזרה — בתחומים ובאזורים שלכם</h2><a href="#/requests?mine=1">לכל הלוח והמפה ←</a></div>
    ${fits.length ? `<div class="cards">${fits.slice(0, 12).map(reqCard).join("")}</div>` : `<p class="muted">אין כרגע בקשות פתוחות שמתאימות לפרופיל שלכם. <a href="#/requests">לכל הבקשות</a></p>`}

    <div class="sec-head"><h2 class="sec">ההצעות שלכם</h2><button class="btn small" id="addOffer">＋ הצעה חדשה</button></div>
    <div id="offerSlot"></div>
    ${myOffers.length ? `<div class="cards">${myOffers.map((o) => offerCard(o, true)).join("")}</div>` : `<p class="muted">פרסמו עזרה שיש לכם לתת (סלי מזון, ציוד, ייעוץ) — אנשים יראו אותה בשאלון ובדף ההצעות.</p>`}
    ${accountCard(me)}
  </section>`;
  bindAccount(main, me, store);
  bindOfferDelete(main, store);
  $("#addOffer", main).onclick = () => {
    if (!org.verified) return toast("אפשר לפרסם הצעות אחרי שהעמותה מאומתת", "err");
    offerForm($("#offerSlot", main), store);
  };
}

function orgProfileForm(main, me, store, isNew) {
  const o = me.org || {};
  main.innerHTML = `<section class="page narrow">
    <h1>${isNew ? "פרופיל העמותה" : "עריכת פרופיל העמותה"}</h1>
    <p class="muted">${isNew ? "עוד צעד אחד: ספרו מי אתם ובמה אתם עוזרים. לפי זה נראה לכם את הבקשות שמתאימות לכם." : ""}</p>
    <form id="f" class="form">
      <fieldset class="card">
        <label class="field"><span>שם העמותה</span><input name="name" required maxlength="80" value="${esc(o.name || "")}"></label>
        <label class="field"><span>מספר עמותה (ע״ר / חל״צ)</span><input name="regNumber" required inputmode="numeric" pattern="5[0-9]{8}" title="9 ספרות שמתחילות ב-5" maxlength="9" value="${esc(o.regNumber || "")}" placeholder="58XXXXXXX">
          <small class="muted">משמש לאימות מול רשם העמותות וגיידסטאר.</small></label>
        <label class="field"><span>מה אתם עושים</span><textarea name="description" required rows="4" maxlength="800">${esc(o.description || "")}</textarea></label>
        <label class="field"><span>טלפון ציבורי</span><input name="phone" type="tel" maxlength="20" value="${esc(o.phone || "")}"></label>
        <label class="field"><span>אתר</span><input name="website" maxlength="120" value="${esc(o.website || "")}" placeholder="https://"></label>
        <label class="field"><span>אימייל ציבורי</span><input name="email" type="email" maxlength="80" value="${esc(o.email || me.user.email || "")}"></label>
      </fieldset>
      <fieldset class="card"><legend>במה אתם עוזרים</legend>${chipPicker("cat", CATEGORIES, o.categories || [])}</fieldset>
      <fieldset class="card"><legend>באילו אזורים</legend>${chipPicker("reg", [{ key: "all", label: "כל הארץ", icon: "🇮🇱" }, ...REGIONS], o.regions || [])}</fieldset>
      <fieldset class="card"><legend>למי (לא חובה — ריק = לכולם)</legend>${chipPicker("aud", AUDIENCES, o.audiences || [])}</fieldset>
      <div class="row end"><button class="btn primary big">שמירה</button></div>
    </form>
  </section>`;
  const form = $("#f", main);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const categories = pickedValues("cat", form);
    let regions = pickedValues("reg", form);
    if (!categories.length) return toast("בחרו לפחות תחום אחד", "err");
    if (!regions.length || regions.includes("all")) regions = ["all"];
    const fd = Object.fromEntries(new FormData(form));
    await store.saveOrg({
      name: fd.name.trim(), regNumber: fd.regNumber.trim(), description: fd.description.trim(), phone: fd.phone.trim(),
      website: fd.website.trim(), email: fd.email.trim(), categories, regions, audiences: pickedValues("aud", form),
    });
    toast("הפרופיל נשמר");
    location.hash = "#/me";
  });
}

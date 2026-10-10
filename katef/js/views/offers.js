/* Offers (#/offers): organizations announcing help they have available right now. */
import { CATEGORIES, REGIONS, AUDIENCES, regionLabel } from "../taxonomy.js";
import { esc, catChips, timeAgo, chipPicker, pickedValues, $, $$, toast, confirmBox, emptyState } from "../ui.js";

export function offerCard(o, mine = false) {
  return `
  <article class="card offer">
    <div class="req-top"><span class="badge give">🎁 הצעת עזרה</span><span class="muted">${timeAgo(o.createdAt)}</span></div>
    <h3>${esc(o.title)}</h3>
    <p>${esc(o.description)}</p>
    <div class="chips">${catChips(o.categories)}</div>
    <div class="req-meta">📍 ${esc((o.regions || []).map(regionLabel).join(" · ") || "כל הארץ")}
      ${o.expiresAt ? ` · בתוקף עד ${new Date(o.expiresAt).toLocaleDateString("he-IL")}` : ""}</div>
    <div class="row">
      <a class="btn small" href="#/org/p:${encodeURIComponent(o.orgId)}">🏛️ ${esc(o.orgName)}</a>
      ${mine ? `<button class="btn small danger" data-del-offer="${esc(o.id)}">מחיקה</button>`
        : `<a class="btn small primary" href="#/new?cat=${encodeURIComponent((o.categories || [])[0] || "")}&offer=${encodeURIComponent(o.id)}">אני צריך/ה את זה</a>`}
    </div>
  </article>`;
}

export async function render(main, { me, store }) {
  const isOrg = me?.profile.role === "org";
  const offers = await store.listOffers();
  main.innerHTML = `<section class="page">
    <div class="sec-head"><h1>הצעות עזרה</h1>${isOrg ? `<button class="btn primary" id="add">＋ הצעה חדשה</button>` : ""}</div>
    <p class="muted">עמותות מפרסמות כאן עזרה שיש להן לתת עכשיו — סלי מזון, ציוד, ייעוץ, הסעות. לחצו ״אני צריך/ה את זה״ כדי לפרסם בקשה שהעמותה תראה.</p>
    <div id="formSlot"></div>
    <div class="cards">${offers.length ? offers.map((o) => offerCard(o, me && o.orgId === me.user.id)).join("") : emptyState("🎁", "אין כרגע הצעות פעילות")}</div>
  </section>`;
  bindOfferDelete(main, store);
  $("#add", main)?.addEventListener("click", () => {
    if (!me.org?.verified) return toast("אפשר לפרסם הצעות אחרי שהעמותה מאומתת", "err");
    offerForm($("#formSlot", main), store);
  });
}

export function bindOfferDelete(root, store) {
  $$("[data-del-offer]", root).forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmBox("מחיקת הצעה", "למחוק את ההצעה?", "מחיקה", true))) return;
    await store.deleteOffer(b.dataset.delOffer);
    toast("ההצעה נמחקה");
    dispatchEvent(new HashChangeEvent("hashchange"));
  }));
}

export function offerForm(slot, store) {
  slot.innerHTML = `<form class="card form" id="of">
    <h2>הצעת עזרה חדשה</h2>
    <label class="field"><span>כותרת</span><input name="title" required maxlength="80" placeholder="למשל: 50 סלי מזון לחג"></label>
    <label class="field"><span>תיאור</span><textarea name="description" required rows="3" maxlength="800" placeholder="מה יש, למי, איך מקבלים"></textarea></label>
    <div class="field"><span>תחומים</span>${chipPicker("ocat", CATEGORIES)}</div>
    <div class="field"><span>אזורים</span>${chipPicker("oreg", [{ key: "all", label: "כל הארץ" }, ...REGIONS])}</div>
    <div class="field"><span>למי (לא חובה)</span>${chipPicker("oaud", AUDIENCES)}</div>
    <label class="field"><span>בתוקף עד (לא חובה)</span><input type="date" name="until"></label>
    <div class="row end"><button type="button" class="btn ghost" data-cancel>ביטול</button><button class="btn primary">פרסום</button></div>
  </form>`;
  const form = $("#of", slot);
  $("[data-cancel]", form).onclick = () => (slot.innerHTML = "");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const categories = pickedValues("ocat", form);
    if (!categories.length) return toast("בחרו לפחות תחום אחד", "err");
    let regions = pickedValues("oreg", form);
    if (!regions.length || regions.includes("all")) regions = ["all"];
    const until = fd.get("until");
    await store.createOffer({
      title: fd.get("title").trim(), description: fd.get("description").trim(), categories, regions,
      audiences: pickedValues("oaud", form), expiresAt: until ? new Date(until + "T23:59:59").toISOString() : null,
    });
    toast("ההצעה פורסמה");
    dispatchEvent(new HashChangeEvent("hashchange"));
  });
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

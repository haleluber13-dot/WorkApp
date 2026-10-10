/* One request (#/request/:id): the public details for everyone; contact
   details, messages and actions for the person who asked and for the
   organization handling it. */
import { audLabel, regionLabel, STAT, CONTACT_PREFS } from "../taxonomy.js";
import { esc, $, $$, toast, modal, confirmBox, timeAgo, catChips, urgencyBadge, statusBadge, telHref, waHref, emptyState } from "../ui.js";
import { allOrgs, matchOrgs } from "../directory.js";
import { orgCard, bindOrgCards } from "./orgs.js";
import { STALE_CLAIM_DAYS, EXPIRE_DAYS } from "../config.js";

const EVENT_TEXT = {
  created: "הבקשה פורסמה", edited: "הבקשה עודכנה", taken: "העמותה לקחה את הבקשה", released: "העמותה שחררה את הבקשה",
  referred: "העמותה הפנתה את הבקשה לגורם אחר", still_relevant: "אושר שהבקשה עדיין רלוונטית", contact_viewed: "פרטי הקשר נצפו",
};
const eventText = (k) => EVENT_TEXT[k] || (k.startsWith("status:") ? "סטטוס: " + (STAT[k.slice(7)]?.label || k.slice(7)) : k);

export async function render(main, { parts, me, store }) {
  const id = parts[0];
  let poll = null;

  async function draw() {
    const r = await store.getRequest(id);
    if (!r) { main.innerHTML = `<section class="page">${emptyState("🔎", "הבקשה לא נמצאה", "ייתכן שנמחקה או נסגרה.", `<a class="btn" href="#/requests">ללוח הבקשות</a>`)}</section>`; return; }
    const isOwner = me && r.ownerId === me.user.id;
    const isHandler = me && r.assignedOrg === me.user.id;
    const isOrg = me?.profile.role === "org";
    const active = ["open", "in_progress"].includes(r.status);
    const staleMs = Date.now() - Date.parse(r.updatedAt);
    const stale = r.status === "in_progress" && staleMs > STALE_CLAIM_DAYS * 864e5;
    const askRelevant = isOwner && r.status === "open" && staleMs > EXPIRE_DAYS * 864e5;
    const [priv, events, msgs] = await Promise.all([
      isOwner || isHandler ? store.getPrivate(id) : null,
      store.listEvents(id),
      isOwner || isHandler ? store.listMessages(id) : [],
    ]);
    const shareUrl = location.href.split("?")[0];

    main.innerHTML = `<section class="page narrow">
      <a class="back" href="#/requests">→ ללוח הבקשות</a>
      ${askRelevant ? `<div class="alert"><b>הבקשה פתוחה כבר יותר מ-${EXPIRE_DAYS} ימים.</b> היא עדיין רלוונטית?
        <button class="btn small primary" data-act="touch">כן, עדיין צריך</button> <button class="btn small" data-act="resolve">כבר לא, תודה</button></div>` : ""}
      <article class="card detail">
        <div class="req-top">${statusBadge(r.status)} ${urgencyBadge(r.urgency)} ${r.demo ? `<span class="badge demo">דוגמה — לא בקשה אמיתית</span>` : ""}
          ${stale ? `<span class="badge warn">⏳ לא עודכן ${Math.floor(staleMs / 864e5)} ימים</span>` : ""}</div>
        <h1>${esc(r.title)}</h1>
        <p class="lead">${esc(r.description).replace(/\n/g, "<br>")}</p>
        <div class="chips">${catChips(r.categories)}</div>
        <dl class="dl">
          <dt>מי מבקש</dt><dd>${esc(r.displayName || "אנונימי")} · ${esc(audLabel(r.audience))}${r.onBehalf ? " · (פורסם בשמו/ה ע״י קרוב/ה או מתנדב/ת)" : ""}</dd>
          <dt>איפה</dt><dd>📍 ${esc(r.city || "")}${r.city ? ", " : ""}${esc(regionLabel(r.region))}</dd>
          <dt>פורסם</dt><dd>${timeAgo(r.createdAt)} · עודכן ${timeAgo(r.updatedAt)}</dd>
          ${r.assignedOrgName ? `<dt>מטפלת</dt><dd>🏛️ ${esc(r.assignedOrgName)}</dd>` : ""}
        </dl>
        <div class="row" id="actions">${actions()}</div>
      </article>

      ${priv ? `<div class="card private">
        <h3>🔒 פרטי קשר ${isHandler ? "(גלויים רק לך כעמותה המטפלת)" : "(גלויים רק לך ולעמותה המטפלת)"}</h3>
        <dl class="dl">
          ${priv.fullName ? `<dt>שם</dt><dd>${esc(priv.fullName)}</dd>` : ""}
          ${priv.phone ? `<dt>טלפון</dt><dd><a href="${esc(telHref(priv.phone))}">${esc(priv.phone)}</a> · <a href="${esc(waHref(priv.phone, "שלום, אני מ" + (r.assignedOrgName || "") + " בעקבות הבקשה שלך בכתף"))}" target="_blank" rel="noopener">וואטסאפ</a></dd>` : ""}
          ${priv.email ? `<dt>אימייל</dt><dd><a href="mailto:${esc(priv.email)}">${esc(priv.email)}</a></dd>` : ""}
          <dt>דרך מועדפת</dt><dd>${esc(CONTACT_PREFS.find((p) => p.key === priv.pref)?.label || "—")}</dd>
          ${priv.notes ? `<dt>פרטים נוספים</dt><dd>${esc(priv.notes).replace(/\n/g, "<br>")}</dd>` : ""}
        </dl>
      </div>` : ""}

      ${isOwner || isHandler ? `<div class="card chat">
        <h3>💬 הודעות ${r.assignedOrg ? "עם " + esc(isHandler ? r.displayName || "המבקש/ת" : r.assignedOrgName) : ""}</h3>
        <div class="msgs" id="msgs">${msgs.length ? msgs.map((m) => `<div class="msg ${m.senderId === me.user.id ? "me" : ""}"><b>${esc(m.senderName)}</b><p>${esc(m.body).replace(/\n/g, "<br>")}</p><time>${timeAgo(m.createdAt)}</time></div>`).join("")
          : `<p class="muted">${r.assignedOrg ? "עוד אין הודעות." : "ברגע שעמותה תיקח את הבקשה, תוכלו להתכתב איתה כאן."}</p>`}</div>
        ${r.assignedOrg && active ? `<form id="msgForm" class="msg-form"><textarea name="body" rows="2" required maxlength="2000" placeholder="כתבו הודעה…"></textarea><button class="btn primary">שליחה</button></form>` : ""}
      </div>` : ""}

      <div class="card">
        <h3>מה קרה עד עכשיו</h3>
        <ol class="timeline">${events.map((e) => `<li><b>${esc(eventText(e.kind))}</b>${e.actorName ? ` · ${esc(e.actorName)}` : ""}${e.note ? `<div class="muted">${esc(e.note)}</div>` : ""}<time>${timeAgo(e.createdAt)}</time></li>`).join("") || `<li class="muted">${r.demo ? "בקשה לדוגמה." : "—"}</li>`}</ol>
      </div>

      ${isOwner && active ? `<h2 class="sec">בינתיים, אפשר גם לפנות ישירות</h2><div class="cards orgs" id="sugg"></div>` : ""}

      <div class="row">
        <a class="btn ghost small" href="https://wa.me/?text=${encodeURIComponent("מישהו צריך עזרה — אולי תוכלו לעזור: " + r.title + " " + shareUrl)}" target="_blank" rel="noopener">שיתוף בוואטסאפ</a>
        <button class="btn ghost small" data-act="copy">העתקת קישור</button>
        ${!isOwner ? `<button class="btn ghost small" data-act="report">🚩 דיווח</button>` : ""}
      </div>
    </section>`;

    function actions() {
      const a = [];
      if (isOwner) {
        if (active) a.push(`<a class="btn" href="#/edit/${encodeURIComponent(r.id)}">✏️ עריכה</a>`, `<button class="btn primary" data-act="resolve">✓ קיבלתי עזרה</button>`, `<button class="btn ghost" data-act="close">סגירת הבקשה</button>`);
        else a.push(`<button class="btn" data-act="reopen">פתיחה מחדש</button>`, `<button class="btn ghost danger" data-act="delete">מחיקה</button>`);
      } else if (isHandler && active) {
        a.push(`<button class="btn primary" data-act="resolve">✓ סיימנו לטפל</button>`, `<button class="btn" data-act="touch">עדיין בטיפול</button>`,
          `<button class="btn ghost" data-act="refer">הפניה לגורם אחר</button>`, `<button class="btn ghost" data-act="release">לא נוכל לעזור</button>`);
      } else if (active && (r.status === "open" || stale)) {
        if (isOrg) a.push(`<button class="btn primary big" data-act="take">🤝 ${stale ? "לקחת את הבקשה (לא טופלה זמן רב)" : "אנחנו ניקח את זה"}</button>`);
        else if (!me) a.push(`<a class="btn primary" href="#/login?next=${encodeURIComponent(location.hash)}">עמותה? התחברו כדי לקחת את הבקשה</a>`);
      } else if (r.status === "in_progress") a.push(`<span class="muted">🏛️ ${esc(r.assignedOrgName || "עמותה")} מטפלת בבקשה הזו</span>`);
      return a.join("");
    }

    if (isOwner && active) {
      const orgs = matchOrgs(await allOrgs(), { categories: r.categories, audience: r.audience, region: r.region }).slice(0, 4);
      const box = $("#sugg", main);
      if (box) { box.innerHTML = orgs.map(orgCard).join(""); bindOrgCards(box); }
    }

    $$("[data-act]", main).forEach((b) => b.addEventListener("click", () => act(b.dataset.act, r)));
    $("#msgForm", main)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = e.target.body.value.trim();
      if (!body) return;
      await store.sendMessage(id, body);
      draw();
    });
    const box = $("#msgs", main); if (box) box.scrollTop = box.scrollHeight;
  }

  async function act(kind, r) {
    try {
      if (kind === "take") {
        if (!(await confirmBox("לקחת את הבקשה?", "העמותה שלכם לוקחת אחריות ליצור קשר ולעזור. פרטי הקשר ייחשפו לכם, ועמותות אחרות יראו שהבקשה בטיפול. אם לא תוכלו לעזור — שחררו או הפנו אותה הלאה.", "כן, אנחנו לוקחים"))) return;
        await store.takeRequest(id, STALE_CLAIM_DAYS);
        toast("הבקשה אצלכם — פרטי הקשר גלויים עכשיו");
      } else if (kind === "release") {
        const v = await modal({ title: "שחרור הבקשה", ok: "שחרור", body: `<label class="field"><span>למה? (יוצג למבקש/ת)</span><textarea name="note" rows="3" placeholder="למשל: זה מחוץ לתחום שלנו"></textarea></label>` });
        if (!v) return;
        await store.releaseRequest(id, v.note, "released");
        toast("הבקשה חזרה ללוח ועמותות אחרות יכולות לקחת אותה");
      } else if (kind === "refer") {
        const v = await modal({ title: "הפניה לגורם אחר", ok: "הפניה ושחרור", body: `<p class="muted">הבקשה תחזור ללוח, עם ההמלצה שלכם — כדי שהמבקש/ת והעמותה הבאה יידעו לאן לפנות.</p><label class="field"><span>לאיזה גורם כדאי לפנות ולמה</span><textarea name="note" rows="3" required></textarea></label>` });
        if (!v) return;
        await store.releaseRequest(id, v.note, "referred");
        toast("הבקשה הופנתה");
      } else if (kind === "resolve") {
        const v = await modal({ title: "הבקשה טופלה", ok: "סימון כטופל", body: `<label class="field"><span>כמה מילים על מה שנעשה (לא חובה)</span><textarea name="note" rows="2"></textarea></label>` });
        if (!v) return;
        await store.setStatus(id, "resolved", v.note);
        toast("איזה יופי! 💙");
      } else if (kind === "close") {
        if (!(await confirmBox("סגירת הבקשה", "הבקשה תוסר מהלוח. אפשר לפתוח אותה שוב אחר כך."))) return;
        await store.setStatus(id, "closed", "");
      } else if (kind === "reopen") {
        await store.setStatus(id, "open", "");
        toast("הבקשה פתוחה שוב");
      } else if (kind === "touch") {
        await store.touchRequest(id);
        toast("עודכן");
      } else if (kind === "delete") {
        if (!(await confirmBox("מחיקת הבקשה", "הבקשה, ההודעות ופרטי הקשר יימחקו לצמיתות.", "מחיקה", true))) return;
        await store.deleteRequest(id);
        location.hash = "#/me";
        return;
      } else if (kind === "copy") {
        await navigator.clipboard?.writeText(location.href.split("?")[0]);
        toast("הקישור הועתק");
        return;
      } else if (kind === "report") {
        const v = await modal({ title: "דיווח על הבקשה", ok: "שליחה", body: `<label class="field"><span>מה הבעיה? (תוכן פוגעני, הונאה, פרטים אישיים שנחשפו…)</span><textarea name="reason" required rows="3"></textarea></label>` });
        if (!v) return;
        await store.report("request", id, v.reason);
        toast("תודה, הצוות יבדוק");
        return;
      }
      me = await store.me();
      draw();
    } catch (e) { toast(e.message, "err"); }
  }

  await draw();
  poll = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector(".modal-wrap") && !document.activeElement?.closest("#msgForm")) draw(); }, 20000);
  return () => clearInterval(poll);
}

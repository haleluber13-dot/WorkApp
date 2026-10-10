/* Admin (#/admin): verify organizations, handle reports, and see where help is missing. */
import { CATEGORIES, REGIONS } from "../taxonomy.js";
import { esc, $$, toast, timeAgo, emptyState, confirmBox } from "../ui.js";

export async function render(main, { me, store }) {
  if (!me || !(await store.isAdmin())) {
    main.innerHTML = `<section class="page narrow">${emptyState("🛡️", "אין גישה", "הדף הזה מיועד למנהלי המערכת.")}</section>`;
    return;
  }
  const [reqs, orgs, reports] = await Promise.all([store.listRequests(), store.listOrgs(), store.listReports()]);
  const open = reqs.filter((r) => r.status === "open");
  const waiting = open.filter((r) => Date.now() - Date.parse(r.createdAt) > 48 * 3600e3)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const pending = orgs.filter((o) => !o.verified);
  const verified = orgs.filter((o) => o.verified);

  /* open requests per category × region: where the gaps are */
  const cell = (c, r) => open.filter((x) => x.categories.includes(c) && x.region === r).length;
  const usedCats = CATEGORIES.filter((c) => open.some((x) => x.categories.includes(c.key)));

  main.innerHTML = `<section class="page wide">
    <h1>🛡️ ניהול</h1>
    <div class="stats">
      <div class="stat"><b>${open.length}</b><span>בקשות פתוחות</span></div>
      <div class="stat"><b class="txt-crit">${waiting.length}</b><span>פתוחות יותר מ-48 שעות</span></div>
      <div class="stat"><b>${pending.length}</b><span>עמותות ממתינות לאימות</span></div>
      <div class="stat"><b>${reports.length}</b><span>דיווחים</span></div>
    </div>

    <h2 class="sec">עמותות ממתינות לאימות</h2>
    <p class="muted small">לפני אישור: בדקו את מספר העמותה בגיידסטאר — שהיא פעילה ושיש לה אישור ניהול תקין — ושאיש הקשר באמת מייצג אותה.</p>
    ${pending.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>עמותה</th><th>מספר</th><th>תחומים</th><th>נרשמה</th><th></th></tr></thead><tbody>
      ${pending.map((o) => `<tr><td><b>${esc(o.name)}</b><div class="muted small">${esc(o.email || "")} ${esc(o.phone || "")}</div></td>
        <td><a href="https://www.guidestar.org.il/organization/${encodeURIComponent(o.regNumber || "")}" target="_blank" rel="noopener">${esc(o.regNumber || "—")} ↗</a></td>
        <td class="small">${(o.categories || []).map((k) => CATEGORIES.find((c) => c.key === k)?.label || k).map(esc).join(", ")}</td>
        <td class="small">${timeAgo(o.createdAt)}</td>
        <td><button class="btn small primary" data-verify="${esc(o.id)}">✓ אימות</button></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">אין עמותות ממתינות.</p>`}

    <h2 class="sec">בקשות שמחכות יותר מ-48 שעות</h2>
    ${waiting.length ? `<ul class="list">${waiting.map((r) => `<li><a href="#/request/${encodeURIComponent(r.id)}">${esc(r.title)}</a> <span class="muted small">· ${esc(r.city)} · ${timeAgo(r.createdAt)}</span>
      <button class="btn small ghost" data-close="${esc(r.id)}">סגירה</button></li>`).join("")}</ul>` : `<p class="muted">אין.</p>`}

    <h2 class="sec">איפה חסרה עזרה — בקשות פתוחות לפי תחום ואזור</h2>
    ${usedCats.length ? `<div class="table-wrap"><table class="table heat"><thead><tr><th></th>${REGIONS.map((r) => `<th>${esc(r.label)}</th>`).join("")}</tr></thead><tbody>
      ${usedCats.map((c) => `<tr><th>${c.icon} ${esc(c.label)}</th>${REGIONS.map((r) => { const n = cell(c.key, r.key); return `<td class="h${Math.min(n, 4)}">${n || ""}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">אין בקשות פתוחות.</p>`}

    <h2 class="sec">דיווחים</h2>
    ${reports.length ? `<ul class="list">${reports.map((x) => `<li><b>${x.targetType === "request" ? `<a href="#/request/${encodeURIComponent(x.targetId)}">בקשה</a>` : "עמותה / מאגר"}</b> · ${esc(x.reason)} <span class="muted small">${timeAgo(x.createdAt)}</span></li>`).join("")}</ul>` : `<p class="muted">אין דיווחים.</p>`}

    <h2 class="sec">עמותות מאומתות (${verified.length})</h2>
    <ul class="list">${verified.map((o) => `<li>${esc(o.name)} <span class="muted small">${esc(o.regNumber || "")}</span> <button class="btn small ghost" data-unverify="${esc(o.id)}">ביטול אימות</button></li>`).join("")}</ul>
    ${store.mode === "demo" ? `<p><button class="btn ghost danger" id="reset">איפוס נתוני ההדגמה</button></p>` : ""}
  </section>`;

  const again = () => dispatchEvent(new HashChangeEvent("hashchange"));
  $$("[data-verify]", main).forEach((b) => (b.onclick = async () => { await store.setOrgVerified(b.dataset.verify, true); toast("העמותה אומתה"); again(); }));
  $$("[data-unverify]", main).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("ביטול אימות", "העמותה לא תוכל לקחת בקשות חדשות.", "ביטול אימות", true))) return;
    await store.setOrgVerified(b.dataset.unverify, false); again();
  }));
  $$("[data-close]", main).forEach((b) => (b.onclick = async () => { await store.adminCloseRequest(b.dataset.close); again(); }));
  main.querySelector("#reset")?.addEventListener("click", async () => {
    if (await confirmBox("איפוס", "כל הנתונים בדפדפן הזה יימחקו ויחזרו לדוגמאות.", "איפוס", true)) store.resetDemo();
  });
}

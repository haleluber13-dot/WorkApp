/* Sign in (#/login) and sign up (#/signup?role=org). */
import { esc, $, toast } from "../ui.js";

export async function render(main, { name, query, me, store }) {
  const next = query.get("next") || "";
  const goNext = (who) => { location.hash = next || (who?.profile.role === "org" && !who.org ? "#/me?setup=1" : "#/me"); };
  if (me) { goNext(me); return; }
  const signup = name === "signup";
  const role = query.get("role") === "org" ? "org" : "person";

  main.innerHTML = `<section class="page narrow">
    <div class="card auth">
      <div class="seg wide">
        <a href="#/login${next ? "?next=" + encodeURIComponent(next) : ""}" class="${signup ? "" : "on"}">כניסה</a>
        <a href="#/signup${next ? "?next=" + encodeURIComponent(next) : ""}" class="${signup ? "on" : ""}">הרשמה</a>
      </div>
      <form id="f" class="form">
        ${signup ? `
          <div class="field"><span>אני…</span>
            <div class="role-pick">
              <label class="pick big"><input type="radio" name="role" value="person" ${role === "person" ? "checked" : ""}><span>🙋 <b>צריך/ה עזרה</b><small>חייל/ת, מילואימניק/ית, משפחה, או כל מי שצריך יד</small></span></label>
              <label class="pick big"><input type="radio" name="role" value="org" ${role === "org" ? "checked" : ""}><span>🏛️ <b>עמותה / ארגון</b><small>רוצים לראות מי צריך עזרה ולעזור</small></span></label>
            </div></div>
          <label class="field"><span id="nameLbl">${role === "org" ? "שם איש/אשת הקשר בעמותה" : "שם פרטי (כך יופיע)"}</span><input name="displayName" required maxlength="40" autocomplete="given-name"></label>` : ""}
        <label class="field"><span>אימייל</span><input name="email" type="email" required autocomplete="email"></label>
        <label class="field"><span>סיסמה</span><input name="password" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}"><small class="muted">${signup ? "לפחות 8 תווים" : ""}</small></label>
        <button class="btn primary big full">${signup ? "יצירת חשבון" : "כניסה"}</button>
      </form>
      ${store.mode === "demo" ? `<div class="demo-login">
        <p class="muted small">מצב הדגמה — אפשר להיכנס בלחיצה לחשבון לדוגמה ולראות את שני הצדדים:</p>
        <div class="row center">
          <button class="btn small" data-demo="person">🙋 כמבקש/ת עזרה</button>
          <button class="btn small" data-demo="org">🏛️ כעמותה מאומתת</button>
          <button class="btn small ghost" data-demo="admin">🛡️ כמנהל/ת</button>
        </div></div>` : ""}
    </div>
  </section>`;

  const form = $("#f", main);
  form.addEventListener("change", () => {
    const lbl = $("#nameLbl", main);
    if (lbl) lbl.textContent = form.role.value === "org" ? "שם איש/אשת הקשר בעמותה" : "שם פרטי (כך יופיע)";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector("button"); btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const res = signup ? await store.signUp(data) : await store.signIn(data);
      if (res?.needsConfirm) {
        main.innerHTML = `<section class="page narrow"><div class="card center"><h1>📧 כמעט סיימנו</h1><p>שלחנו קישור אימות ל-<b>${esc(data.email)}</b>. לחצו עליו ואז היכנסו.</p></div></section>`;
        return;
      }
      toast(signup ? "ברוכים הבאים לכתף 💙" : "התחברת בהצלחה");
      goNext(res);
    } catch (err) { toast(err.message, "err"); btn.disabled = false; }
  });
  main.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", async () => {
    const who = await store.demoLogin(b.dataset.demo);
    toast("נכנסת לחשבון הדגמה");
    location.hash = next || (b.dataset.demo === "admin" ? "#/admin" : "#/me");
  }));
}

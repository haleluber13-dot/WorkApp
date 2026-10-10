/* The "find help" wizard: who are you → what do you need → where → matching
   organizations, rights to check, and offers. Answers live only in the URL. */
import { AUDIENCES, CATEGORIES, REGIONS, nearestRegion, regionLabel, audLabel, CAT } from "../taxonomy.js";
import { esc, chipPicker, pickedValues, $, toast } from "../ui.js";
import { allOrgs, matchOrgs, RIGHTS, RIGHTS_ENGINE, scoreOrg } from "../directory.js";
import { setQuery } from "../app.js";
import { orgCard, bindOrgCards } from "./orgs.js";
import { offerCard } from "./offers.js";

export async function render(main, { query, store }) {
  const state = {
    aud: query.get("aud") || "",
    cat: (query.get("cat") || "").split(",").filter(Boolean),
    region: query.get("region") || "",
    step: Number(query.get("step") || 0),
  };
  const go = (step) => {
    state.step = step;
    setQuery({ aud: state.aud, cat: state.cat, region: state.region, step });
    draw();
    window.scrollTo(0, 0);
  };

  async function draw() {
    const steps = ["מי אתם", "מה צריך", "איפה", "תוצאות"];
    const progress = `<ol class="progress">${steps.map((s, i) => `<li class="${i < state.step ? "done" : i === state.step ? "on" : ""}">${s}</li>`).join("")}</ol>`;

    if (state.step === 0) {
      main.innerHTML = `<section class="page narrow">${progress}
        <h1>מי צריך/ה את העזרה?</h1>
        <p class="muted">בחרו את מה שהכי מתאר אתכם. אפשר לשנות אחר כך.</p>
        <form id="f">${chipPicker("aud", AUDIENCES, [state.aud], { single: true })}
        <div class="row end"><button class="btn primary">המשך ←</button></div></form></section>`;
      $("#f", main).addEventListener("change", () => { state.aud = pickedValues("aud", main)[0] || ""; });
      $("#f", main).addEventListener("submit", (e) => {
        e.preventDefault();
        state.aud = pickedValues("aud", main)[0] || "";
        if (!state.aud) return toast("בחרו אפשרות אחת");
        go(1);
      });
    } else if (state.step === 1) {
      main.innerHTML = `<section class="page narrow">${progress}
        <h1>במה אתם צריכים עזרה?</h1>
        <p class="muted">אפשר לבחור כמה תחומים.</p>
        <form id="f">${chipPicker("cat", CATEGORIES, state.cat)}
        <div class="row between"><button type="button" class="btn ghost" data-back>→ חזרה</button><button class="btn primary">המשך ←</button></div></form></section>`;
      $("[data-back]", main).onclick = () => go(0);
      $("#f", main).addEventListener("submit", (e) => {
        e.preventDefault();
        state.cat = pickedValues("cat", main);
        if (!state.cat.length) return toast("בחרו לפחות תחום אחד");
        go(2);
      });
    } else if (state.step === 2) {
      main.innerHTML = `<section class="page narrow">${progress}
        <h1>באיזה אזור?</h1>
        <button type="button" class="btn" id="geo">📍 לפי המיקום שלי</button>
        <form id="f">${chipPicker("region", [{ key: "all", label: "לא משנה / כל הארץ", icon: "🇮🇱" }, ...REGIONS.map((r) => ({ ...r, icon: "📍" }))], [state.region || ""], { single: true })}
        <div class="row between"><button type="button" class="btn ghost" data-back>→ חזרה</button><button class="btn primary">הצג תוצאות ←</button></div></form></section>`;
      $("[data-back]", main).onclick = () => go(1);
      $("#geo", main).onclick = () => {
        if (!navigator.geolocation) return toast("המכשיר לא תומך באיתור מיקום");
        navigator.geolocation.getCurrentPosition((p) => {
          const n = nearestRegion(p.coords.latitude, p.coords.longitude);
          if (!n || n.km > 60) return toast("לא הצלחנו לזהות אזור בישראל — בחרו מהרשימה");
          state.region = n.region;
          toast(`זיהינו: ${n.city} (${regionLabel(n.region)})`);
          go(3);
        }, () => toast("לא קיבלנו הרשאה למיקום — בחרו מהרשימה"), { timeout: 10000 });
      };
      $("#f", main).addEventListener("submit", (e) => {
        e.preventDefault();
        const r = pickedValues("region", main)[0];
        if (!r) return toast("בחרו אזור");
        state.region = r === "all" ? "" : r;
        go(3);
      });
    } else {
      await results();
    }
  }

  async function results() {
    const [orgs, offers] = await Promise.all([allOrgs(), store.listOffers()]);
    const q = { categories: state.cat, audience: state.aud, region: state.region };
    const matches = matchOrgs(orgs, q);
    const crisis = state.cat.includes("mental") || state.cat.includes("emergency");
    const rights = RIGHTS[state.aud] || [];
    const offerHits = offers.filter((o) => scoreOrg({ ...o, type: "", onPlatform: false }, q) > 0);
    const newHref = `#/new?aud=${encodeURIComponent(state.aud)}&cat=${encodeURIComponent(state.cat.join(","))}&region=${encodeURIComponent(state.region)}`;

    main.innerHTML = `<section class="page">
      <ol class="progress">${["מי אתם", "מה צריך", "איפה", "תוצאות"].map((s, i) => `<li class="${i < 3 ? "done" : "on"}">${s}</li>`).join("")}</ol>
      <div class="sec-head">
        <h1>מצאנו ${matches.length} גורמים שיכולים לעזור</h1>
        <button class="btn ghost small" id="restart">שינוי תשובות</button>
      </div>
      <p class="muted">${esc(audLabel(state.aud))} · ${state.cat.map((c) => CAT[c]?.label).map(esc).join(", ")} · ${esc(state.region ? regionLabel(state.region) : "כל הארץ")}</p>

      ${crisis ? `<div class="alert crisis"><b>אם קשה לך עכשיו — לא צריך לחכות לעמותה.</b>
        ער״ן — עזרה ראשונה נפשית, 24/7: <a href="tel:1201">1201</a> ·
        נט״ל — קו סיוע לנפגעי טראומה על רקע לאומי: <a href="tel:*3362">‎*3362</a> ·
        במצב של סכנת חיים: <a href="tel:101">101</a>.
        <a href="#/crisis">כל קווי הסיוע ←</a></div>` : ""}

      <div class="post-cta card">
        <div><b>רוצים שעמותה תפנה אליכם?</b><span class="muted"> פרסמו בקשה — העמותות המתאימות יראו אותה ואחת מהן תיקח אותה.</span></div>
        <a class="btn primary" href="${newHref}">פרסום בקשה עם הפרטים האלה</a>
      </div>

      ${offerHits.length ? `<h2 class="sec">הצעות עזרה פעילות שמתאימות לכם</h2><div class="cards">${offerHits.map(offerCard).join("")}</div>` : ""}

      <h2 class="sec">עמותות וקווי סיוע מתאימים</h2>
      ${matches.length ? `<div class="cards orgs">${matches.slice(0, 60).map((o) => orgCard(o)).join("")}</div>`
        : `<p>לא מצאנו התאמה מדויקת. נסו להרחיב את האזור, או <a href="${newHref}">פרסמו בקשה</a> ועמותות יראו אותה.</p>`}

      <h2 class="sec">זכויות שכדאי לבדוק</h2>
      <div class="card soft">
        <ul class="links">
          ${rights.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} — כל זכות ↗</a></li>`).join("")}
          <li><a href="${RIGHTS_ENGINE}" target="_blank" rel="noopener">מנוע הזכויות הלאומי (gov.il) — בדיקה אישית ↗</a></li>
        </ul>
        <p class="muted small">זו הכוונה כללית בלבד. הזכאות נקבעת על ידי הגורם המוסמך.</p>
      </div>
    </section>`;
    $("#restart", main).onclick = () => go(0);
    bindOrgCards(main);
  }

  draw();
}

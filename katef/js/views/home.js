import { esc, timeAgo, catChips, urgencyBadge } from "../ui.js";
import { CATEGORIES, regionLabel, audLabel } from "../taxonomy.js";
import { loadCurated } from "../directory.js";

export async function render(main, { me, store }) {
  const [reqs, curated, platformOrgs] = await Promise.all([store.listRequests(), loadCurated(), store.listOrgs()]);
  const open = reqs.filter((r) => r.status === "open");
  const handled = reqs.filter((r) => r.status === "in_progress").length;
  const resolved = reqs.filter((r) => r.status === "resolved").length;
  const urgent = open.filter((r) => r.urgency === "critical" || r.urgency === "high")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4);

  const isOrg = me?.profile.role === "org";

  main.innerHTML = `
  <section class="hero">
    <div class="hero-in">
      <h1>שמים כתף.<br><span>מחברים את מי שצריך עזרה לעמותה שיכולה לעזור.</span></h1>
      <p>חיילים, מילואימניקים, משפחות, מפונים וכל מי שצריך יד — ספרו לנו מה אתם צריכים ואיפה, ונחבר אתכם לעמותות המתאימות.</p>
      <div class="hero-cta">
        <a class="cta need" href="#/find">
          <span class="cta-ico">🙋</span>
          <span><b>אני צריך/ה עזרה</b><small>מצאו עמותות שמתאימות לכם או פרסמו בקשה</small></span>
        </a>
        <a class="cta give" href="${isOrg ? "#/me" : "#/signup?role=org"}">
          <span class="cta-ico">🏛️</span>
          <span><b>אני עמותה</b><small>ראו מי צריך עזרה באזור ובתחום שלכם</small></span>
        </a>
      </div>
    </div>
  </section>

  <section class="page">
    <div class="stats">
      <div class="stat"><b>${open.length}</b><span>בקשות מחכות לעזרה</span></div>
      <div class="stat"><b>${handled}</b><span>בטיפול של עמותה</span></div>
      <div class="stat"><b>${resolved}</b><span>טופלו</span></div>
      <div class="stat"><b>${curated.length + platformOrgs.length}</b><span>עמותות וקווי סיוע במאגר</span></div>
    </div>

    <h2 class="sec">במה אפשר לעזור לכם?</h2>
    <div class="cat-grid">
      ${CATEGORIES.map((c) => `<a class="cat-tile" href="#/find?cat=${c.key}"><span>${c.icon}</span>${esc(c.label)}</a>`).join("")}
    </div>

    ${urgent.length ? `
    <div class="sec-head"><h2 class="sec">בקשות דחופות עכשיו</h2><a href="#/requests?urg=critical,high">לכל הבקשות הדחופות ←</a></div>
    <div class="cards">${urgent.map(reqCard).join("")}</div>` : ""}

    <h2 class="sec">איך זה עובד</h2>
    <ol class="steps">
      <li><b>מספרים מה צריך</b><span>בוחרים סוג עזרה, אזור ומי אתם. אפשר לקבל מיד רשימת עמותות מתאימות — בלי להירשם.</span></li>
      <li><b>מפרסמים בקשה</b><span>רק התחום, העיר ותיאור קצר גלויים לכולם. שם מלא וטלפון נחשפים רק לעמותה שלוקחת את הבקשה.</span></li>
      <li><b>עמותה מאומתת לוקחת</b><span>עמותה אחת לוקחת אחריות, כדי שלא תקבלו עשר שיחות — ואחרות רואות שהבקשה בטיפול.</span></li>
      <li><b>מתעדכנים עד שזה נפתר</b><span>הודעות ישירות, סטטוס בכל רגע, ואם העמותה לא יכולה — היא מעבירה הלאה.</span></li>
    </ol>

    <div class="split">
      <div class="card soft">
        <h3>🧭 לא בטוחים למה אתם זכאים?</h3>
        <p>שאלון קצר שמתאים לכם עמותות וזכויות לפי מי שאתם, מה שאתם צריכים והאזור. התשובות נשארות במכשיר שלכם.</p>
        <a class="btn primary" href="#/find">להתחיל את השאלון</a>
      </div>
      <div class="card soft">
        <h3>🏛️ עמותה? הצטרפו</h3>
        <p>נרשמים, ממלאים תחומים ואזורים, ואחרי אימות רואים בקשות שמתאימות בדיוק לכם — ברשימה ובמפה.</p>
        <a class="btn" href="#/signup?role=org">הרשמת עמותה</a>
      </div>
    </div>
  </section>`;
}

export function reqCard(r) {
  return `
  <a class="card req" href="#/request/${encodeURIComponent(r.id)}">
    <div class="req-top">${urgencyBadge(r.urgency)}${r.demo ? `<span class="badge demo">דוגמה</span>` : ""}<span class="muted">${timeAgo(r.createdAt)}</span></div>
    <h3>${esc(r.title)}</h3>
    <p class="clip">${esc(r.description)}</p>
    <div class="chips">${catChips(r.categories)}</div>
    <div class="req-meta">📍 ${esc(r.city || regionLabel(r.region))} · ${esc(audLabel(r.audience))}</div>
  </a>`;
}

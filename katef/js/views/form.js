/* Post (#/new) or edit (#/edit/:id) a help request. What is public and what
   is private is spelled out next to every field. */
import { AUDIENCES, CATEGORIES, URGENCY, CITIES, REGIONS, CONTACT_PREFS, cityInfo, nearestRegion, REG } from "../taxonomy.js";
import { esc, $, toast, chipPicker, pickedValues, piiWarning } from "../ui.js";

/* Move the pin up to ~1 km from the city center so no pin marks a real home. */
const fuzz = (v) => v + (Math.random() - 0.5) * 0.02;

export async function render(main, { name, parts, query, me, store }) {
  if (!me) {
    main.innerHTML = `<section class="page narrow"><div class="card center">
      <h1>פרסום בקשת עזרה</h1>
      <p>כדי שעמותה תוכל לחזור אליכם ושתוכלו לעקוב אחרי הבקשה, צריך חשבון. זה לוקח חצי דקה.</p>
      <p class="muted">רוצים רק לראות למי אפשר לפנות? <a href="#/find">השאלון הקצר</a> לא דורש הרשמה.</p>
      <div class="row center"><a class="btn primary" href="#/signup?next=${encodeURIComponent(location.hash)}">יצירת חשבון</a>
      <a class="btn" href="#/login?next=${encodeURIComponent(location.hash)}">כבר יש לי חשבון</a></div></div></section>`;
    return;
  }
  if (me.profile.role === "org") {
    main.innerHTML = `<section class="page narrow"><div class="card center"><h1>אתם מחוברים כעמותה</h1>
      <p>בקשות עזרה מפרסמים מחשבון אישי. עמותות יכולות לפרסם <a href="#/offers">הצעות עזרה</a>.</p></div></section>`;
    return;
  }

  const editing = name === "edit";
  let r = null, priv = null;
  if (editing) {
    r = await store.getRequest(parts[0]);
    if (!r || r.ownerId !== me.user.id) { main.innerHTML = `<section class="page"><p>אין הרשאה לערוך את הבקשה הזו.</p></section>`; return; }
    priv = (await store.getPrivate(r.id)) || {};
  }
  const preset = {
    aud: r?.audience || query.get("aud") || "",
    cat: r?.categories || (query.get("cat") || "").split(",").filter(Boolean),
    region: r?.region || query.get("region") || "",
  };
  let offerNote = "";
  if (query.get("offer")) {
    const offer = (await store.listOffers()).find((o) => o.id === query.get("offer"));
    if (offer) offerNote = `<div class="alert ok">בעקבות ההצעה של <b>${esc(offer.orgName)}</b>: ״${esc(offer.title)}״. הבקשה תופיע בלוח והעמותה תוכל לקחת אותה.</div>`;
  }
  const cityOptions = REGIONS.map((reg) => `<optgroup label="${esc(reg.label)}">${CITIES.filter((c) => c[1] === reg.key).map((c) => `<option ${r?.city === c[0] ? "selected" : ""}>${esc(c[0])}</option>`).join("")}</optgroup>`).join("");

  main.innerHTML = `<section class="page narrow">
    <h1>${editing ? "עריכת הבקשה" : "בקשת עזרה"}</h1>
    ${store.mode === "demo" ? `<div class="alert crisis"><b>⚠️ האתר עדיין בהרצה — בקשות שמתפרסמות כאן עוד לא מגיעות לעמותות.</b>
      כדי לקבל עזרה עכשיו, פנו ישירות לעמותה מתאימה: <a href="#/find">מצאו עמותה לפי הצורך והאזור שלכם</a>, או לקווי הסיוע: ער״ן <a href="tel:1201">1201</a>.</div>` : ""}
    ${offerNote}
    <form id="f" class="form" novalidate>
      <fieldset class="card">
        <legend>1 · מי צריך/ה עזרה</legend>
        ${chipPicker("aud", AUDIENCES, [preset.aud], { single: true })}
        <label class="check"><input type="checkbox" name="onBehalf" ${r?.onBehalf ? "checked" : ""}> אני ממלא/ת את הבקשה בשם מישהו אחר, בהסכמתו/ה</label>
      </fieldset>

      <fieldset class="card">
        <legend>2 · במה צריך עזרה</legend>
        ${chipPicker("cat", CATEGORIES, preset.cat)}
        <div id="crisis" class="alert crisis" hidden><b>אם קשה לך עכשיו — אל תחכו.</b> ער״ן 24/7: <a href="tel:1201">1201</a> · נט״ל: <a href="tel:*3362">‎*3362</a> · סכנת חיים: <a href="tel:101">101</a>. אפשר להמשיך ולפרסם את הבקשה במקביל.</div>
      </fieldset>

      <fieldset class="card">
        <legend>3 · ספרו בקצרה <span class="pub">🌐 גלוי לכולם</span></legend>
        <label class="field"><span>כותרת</span><input name="title" required maxlength="80" value="${esc(r?.title || "")}" placeholder="למשל: מילואימניק — צריך עזרה עם שכר דירה"></label>
        <label class="field"><span>מה המצב ומה יעזור לכם</span><textarea name="description" required rows="5" maxlength="1500" placeholder="ככל שתהיו ספציפיים יותר, יהיה קל יותר לעזור. בלי שם מלא, טלפון, כתובת או מספר אישי — את אלה ממלאים למטה.">${esc(r?.description || "")}</textarea></label>
        <div id="pii" class="alert warn" hidden></div>
        <label class="field"><span>איך להציג אתכם</span><input name="displayName" maxlength="40" value="${esc(r?.displayName ?? me.profile.displayName ?? "")}" placeholder="שם פרטי בלבד, או ״אנונימי״"></label>
      </fieldset>

      <fieldset class="card">
        <legend>4 · איפה ומתי <span class="pub">🌐 רק העיר גלויה</span></legend>
        <label class="field"><span>עיר / יישוב</span>
          <select name="city"><option value="">בחרו…</option>${cityOptions}<option value="__other" ${r && !cityInfo(r.city) ? "selected" : ""}>יישוב אחר</option></select></label>
        <div class="row"><button type="button" class="btn small ghost" id="geo">📍 לפי המיקום שלי</button></div>
        <div id="otherBox" ${r && !cityInfo(r.city) ? "" : "hidden"}>
          <label class="field"><span>שם היישוב</span><input name="otherCity" maxlength="40" value="${esc(r && !cityInfo(r.city) ? r.city : "")}"></label>
          <label class="field"><span>אזור</span><select name="region">${REGIONS.map((x) => `<option value="${x.key}" ${preset.region === x.key ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
        </div>
        <div class="field"><span>כמה דחוף</span>${chipPicker("urgency", URGENCY, [r?.urgency || "normal"], { single: true })}</div>
      </fieldset>

      <fieldset class="card">
        <legend>5 · איך לחזור אליכם <span class="priv">🔒 רק לעמותה שתיקח את הבקשה</span></legend>
        <label class="field"><span>שם מלא</span><input name="fullName" maxlength="60" value="${esc(priv?.fullName || "")}" autocomplete="name"></label>
        <label class="field"><span>טלפון</span><input name="phone" type="tel" maxlength="20" value="${esc(priv?.phone || "")}" autocomplete="tel" inputmode="tel" placeholder="050-0000000"></label>
        <label class="field"><span>אימייל</span><input name="email" type="email" maxlength="80" value="${esc(priv?.email ?? me.user.email ?? "")}" autocomplete="email"></label>
        <div class="field"><span>איך נוח לכם שיפנו</span>${chipPicker("pref", CONTACT_PREFS, [priv?.pref || "phone"], { single: true })}</div>
        <label class="field"><span>פרטים שרק העמותה צריכה לדעת (לא חובה)</span><textarea name="notes" rows="3" maxlength="1500" placeholder="כתובת למשלוח, שעות נוחות, פרטים רגישים…">${esc(priv?.notes || "")}</textarea></label>
      </fieldset>

      ${editing ? "" : `<label class="check consent"><input type="checkbox" name="consent" required> קראתי את <a href="#/about" target="_blank">מדיניות הפרטיות</a>. אני מסכים/ה שהכותרת, התיאור והעיר יוצגו לכולם, ושפרטי הקשר יועברו רק לעמותה מאומתת שתיקח את הבקשה.</label>`}
      <div class="row end sticky-bar"><a class="btn ghost" href="${editing ? "#/request/" + encodeURIComponent(r.id) : "#/"}">ביטול</a><button class="btn primary big">${editing ? "שמירה" : "פרסום הבקשה"}</button></div>
    </form>
  </section>`;

  const form = $("#f", main);
  const sync = () => {
    const cats = pickedValues("cat", form);
    $("#crisis", main).hidden = !(cats.includes("mental") || cats.includes("emergency"));
    const w = piiWarning(form.title.value + " " + form.description.value);
    $("#pii", main).hidden = !w; $("#pii", main).textContent = w;
    $("#otherBox", main).hidden = form.city.value !== "__other";
  };
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  sync();

  $("#geo", main).onclick = () => {
    navigator.geolocation?.getCurrentPosition((p) => {
      const n = nearestRegion(p.coords.latitude, p.coords.longitude);
      if (!n || n.km > 25) return toast("לא מצאנו יישוב קרוב ברשימה — בחרו ״יישוב אחר״");
      form.city.value = n.city; sync();
      toast("נבחר: " + n.city);
    }, () => toast("לא התקבלה הרשאת מיקום"), { timeout: 10000 });
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const audience = pickedValues("aud", form)[0];
    const categories = pickedValues("cat", form);
    if (!audience) return toast("בחרו מי צריך/ה את העזרה", "err");
    if (!categories.length) return toast("בחרו לפחות סוג עזרה אחד", "err");
    if (!form.title.value.trim() || !form.description.value.trim()) return toast("מלאו כותרת ותיאור", "err");
    let city = form.city.value, region, lat, lng;
    if (!city) return toast("בחרו עיר או יישוב", "err");
    if (city === "__other") {
      city = form.otherCity.value.trim();
      if (!city) return toast("כתבו את שם היישוב", "err");
      region = form.region.value;
      [lat, lng] = REG[region].center;
    } else {
      const c = cityInfo(city); region = c.region; lat = c.lat; lng = c.lng;
    }
    const phone = form.phone.value.trim(), email = form.email.value.trim();
    const pref = pickedValues("pref", form)[0] || "phone";
    if (!phone && !email && pref !== "in_app") return toast("השאירו טלפון או אימייל, או בחרו ״רק דרך הודעות באתר״", "err");
    if (!editing && !form.consent.checked) return toast("יש לאשר את תנאי הפרטיות", "err");

    const pub = {
      title: form.title.value.trim(), description: form.description.value.trim(), categories, audience,
      region, city, urgency: pickedValues("urgency", form)[0] || "normal",
      displayName: form.displayName.value.trim() || "אנונימי", onBehalf: form.onBehalf.checked,
    };
    if (!editing || r.city !== city) { pub.lat = fuzz(lat); pub.lng = fuzz(lng); }
    const privData = { fullName: form.fullName.value.trim(), phone, email, pref, notes: form.notes.value.trim() };
    const btn = form.querySelector("button.primary"); btn.disabled = true;
    try {
      if (editing) {
        await store.updateRequest(r.id, pub, privData);
        toast("נשמר");
        location.hash = "#/request/" + encodeURIComponent(r.id);
      } else {
        const created = await store.createRequest(pub, privData);
        toast("הבקשה פורסמה! עמותות מתאימות יראו אותה עכשיו");
        location.hash = "#/request/" + encodeURIComponent(created.id);
      }
    } catch (err) { toast(err.message, "err"); btn.disabled = false; }
  });
}

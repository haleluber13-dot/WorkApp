// Views. Every screen beyond the board is a "sheet" (bottom panel on phones, centered dialog on desktop).
(function () {
  const T = window.LIFEMAP_TYPES, LEVELS = window.LIFEMAP_LEVELS, BANDS = window.LIFEMAP_BANDS, TOPICS = window.LIFEMAP_TOPICS;
  const S = () => window.Store, E = () => window.Engine;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const level = (id) => LEVELS.find((l) => l.id === id);
  const AVATARS = ["🙂", "😄", "🐻", "🦊", "🐰", "🐸", "🦄", "🐼", "🐯", "🦋", "🚀", "🌈", "🐙", "🦖", "🐥", "⚽"];

  // ---------- sheet plumbing ----------
  const sheet = document.getElementById("sheet"), panel = document.getElementById("sheetPanel");
  const stack = [];
  function open(html, { cls = "", onMount, replace = false, locked = false } = {}) {
    if (!replace) stack.push({ html, cls, onMount, locked });
    else stack[stack.length - 1] = { html, cls, onMount, locked };
    render();
  }
  function render() {
    const top = stack[stack.length - 1];
    if (!top) { sheet.hidden = true; document.body.classList.remove("sheet-open"); window.Speech?.stop(); return; }
    sheet.hidden = false; document.body.classList.add("sheet-open");
    panel.className = "sheet__panel " + top.cls;
    panel.innerHTML = `<div class="sheet__bar">${stack.length > 1 ? '<button class="iconbtn" data-back title="חזרה">→</button>' : ""}<span class="sheet__grip"></span>${top.locked ? "" : '<button class="iconbtn" data-close title="סגירה">✕</button>'}</div>` + top.html;
    panel.scrollTop = 0;
    panel.querySelector("[data-back]")?.addEventListener("click", back);
    panel.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeAll));
    top.onMount?.(panel);
  }
  function back() { window.Speech?.stop(); stack.pop(); render(); }
  function closeAll() { if (stack[stack.length - 1]?.locked) return; stack.length = 0; render(); }
  sheet.querySelector(".sheet__backdrop").addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) (stack.length > 1 ? back : closeAll)(); });

  // ---------- toast / confetti ----------
  const toastEl = document.getElementById("toast");
  let toastT;
  function toast(html, ms = 2200) { toastEl.innerHTML = html; toastEl.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), ms); }
  function confetti() {
    const c = document.getElementById("confetti"); c.innerHTML = "";
    const colors = ["#f6a23a", "#a97be8", "#5db3f0", "#7fd060", "#f0713e", "#f2c230"];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("i");
      s.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.4 + Math.random()}s;transform:rotate(${Math.random() * 360}deg)`;
      c.appendChild(s);
    }
    c.classList.add("on"); setTimeout(() => c.classList.remove("on"), 2600);
  }

  // ---------- child profile ----------
  function ageLabel(age) { const b = E().bandForAge(age); return `גיל ${age} · ${b.name}`; }
  function viewChild(child) {
    const editing = !!child;
    const c = child || { name: "", age: 5, avatar: "🙂" };
    const html = `
      <h2 class="sheet__title">${editing ? "עריכת פרופיל" : "מי לומד היום?"}</h2>
      <p class="muted">הממשק, רמות הקושי והכרטיסיות מותאמים לגיל. אפשר להוסיף כמה ילדים.</p>
      <form id="childForm" class="form">
        <label>שם<input name="name" required maxlength="20" value="${esc(c.name)}" placeholder="למשל: נועה"></label>
        <label>גיל <b id="ageOut">${ageLabel(c.age)}</b>
          <input name="age" type="range" min="2" max="12" step="1" value="${c.age}">
          <div class="bands">${BANDS.map((b) => `<span>${b.label}<br><small>${b.name}</small></span>`).join("")}</div>
        </label>
        <div class="label">דמות</div>
        <div class="avatars">${AVATARS.map((a) => `<button type="button" class="avatar-pick ${a === c.avatar ? "on" : ""}" data-av="${a}">${a}</button>`).join("")}</div>
        <input type="hidden" name="avatar" value="${c.avatar}">
        <div class="row">
          <button class="btn btn--primary" type="submit">${editing ? "שמירה" : "יאללה, מתחילים! 🚀"}</button>
          ${editing && S().children().length > 1 ? '<button class="btn btn--danger" type="button" id="delChild">מחיקה</button>' : ""}
        </div>
      </form>`;
    open(html, { locked: !editing && !S().children().length, onMount(p) {
      const f = p.querySelector("#childForm");
      f.age.addEventListener("input", () => p.querySelector("#ageOut").textContent = ageLabel(+f.age.value));
      p.querySelectorAll(".avatar-pick").forEach((b) => b.addEventListener("click", () => { p.querySelectorAll(".avatar-pick").forEach((x) => x.classList.remove("on")); b.classList.add("on"); f.avatar.value = b.dataset.av; }));
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const data = { name: f.name.value, age: +f.age.value, avatar: f.avatar.value };
        if (editing) S().updateChild(child.id, data); else S().addChild(data);
        stack.length = 0; render(); window.App.refresh();
        toast(editing ? "נשמר ✔" : `ברוכים הבאים, ${esc(data.name)}! 🎉`);
      });
      p.querySelector("#delChild")?.addEventListener("click", () => {
        if (confirm(`למחוק את ${child.name} ואת כל ההתקדמות?`)) { S().removeChild(child.id); stack.length = 0; render(); window.App.refresh(); }
      });
    } });
  }
  function viewSwitchChild() {
    const html = `<h2 class="sheet__title">מי לומד עכשיו?</h2>
      <div class="list">${S().children().map((c) => `<button class="list__item ${c.id === S().child()?.id ? "on" : ""}" data-id="${c.id}"><span class="avatar">${c.avatar}</span><span><b>${esc(c.name)}</b><small>${ageLabel(c.age)} · ⭐ ${S().prog(c.id).stars}</small></span></button>`).join("")}</div>
      <button class="btn btn--ghost" id="addChild">＋ הוספת ילד/ה</button>`;
    open(html, { onMount(p) {
      p.querySelectorAll(".list__item").forEach((b) => b.addEventListener("click", () => { S().setActive(b.dataset.id); closeAll(); window.App.refresh(); }));
      p.querySelector("#addChild").addEventListener("click", () => viewChild(null));
    } });
  }

  // ---------- level picker ----------
  function viewLevel(topic) {
    const child = S().child(); const counts = E().counts(topic.id, child.age);
    const stats = E().topicStats(child.age).find((s) => s.topic.id === topic.id);
    const html = `
      <div class="topic-head topic-head--${topic.color}"><span class="topic-head__emoji">${topic.emoji}</span><div><h2>${esc(topic.name)}</h2><p>${esc(topic.blurb)}</p></div></div>
      <p class="muted center">בחרו רמה — הכרטיסייה תצא רנדומלית ומותאמת לגיל ${child.age}</p>
      <div class="levels">
        ${LEVELS.map((l) => `<button class="lvl lvl--${l.id}" data-level="${l.id}" ${counts[l.id] ? "" : "disabled"}>
          <span class="lvl__dot"></span><b>${l.name}</b>
          <small>${stats.byLevel[l.id].done}/${counts[l.id]} הושלמו · ${"⭐".repeat(E().STARS[l.id])}</small></button>`).join("")}
        <button class="lvl lvl--any" data-level=""><span class="lvl__dot">🎲</span><b>הפתיעו אותי</b><small>רמה אקראית</small></button>
      </div>`;
    open(html, { onMount(p) {
      p.querySelectorAll(".lvl").forEach((b) => b.addEventListener("click", () => {
        const lv = b.dataset.level || LEVELS[Math.floor(Math.random() * 3)].id;
        const card = E().pick(topic.id, child.age, lv);
        if (!card) return toast("אין עדיין כרטיסיות ברמה הזו 😅");
        viewCard(card, { level: lv });
      }));
    } });
  }

  // ---------- card ----------
  function viewCard(card, { level: lv = card.level, replace = false, fromDaily = false } = {}) {
    const topic = E().topic(card.topic), child = S().child(), type = T[card.type] || T.task;
    S().markSeen(card.id);
    const done = S().prog().done[card.id];
    const bigText = S().setting("bigText") || child.age <= 5;
    const readable = [card.title, card.text, ...(card.steps || [])].join(". ");
    const html = `
      <article class="card card--${topic.color} ${bigText ? "card--big" : ""}" data-level="${card.level}">
        <header class="card__head">
          <span class="chip chip--topic">${topic.emoji} ${esc(topic.name)}</span>
          <span class="chip chip--lvl chip--${card.level}">${level(card.level).name}</span>
          <span class="chip chip--type">${type.emoji} ${type.name}</span>
          ${card.minutes ? `<span class="chip">⏱ ${card.minutes} דק׳</span>` : ""}
        </header>
        <h2 class="card__title">${esc(card.title)}</h2>
        <p class="card__text">${esc(card.text)}</p>
        ${card.materials?.length ? `<div class="card__materials"><b>צריך:</b> ${card.materials.map((m) => `<span class="chip chip--mat">${esc(m)}</span>`).join("")}</div>` : ""}
        ${card.steps?.length ? `<ol class="steps">${card.steps.map((s, i) => `<li><label><input type="checkbox" data-step="${i}"><span>${esc(s)}</span></label></li>`).join("")}</ol>` : ""}
        ${card.answer ? `<div class="answer"><button class="btn btn--ghost" id="showAns">👀 הצגת התשובה</button><div class="answer__text" hidden><b>תשובה:</b> ${esc(card.answer)}</div></div>` : ""}
        <details class="tip"><summary>💛 טיפ להורה</summary><p>${esc(card.tip)}</p>${card.skills?.length ? `<p class="skills">${card.skills.map((s) => `<span class="chip chip--skill">${esc(s)}</span>`).join("")}</p>` : ""}</details>
        <div class="card__actions">
          ${window.Speech.available ? '<button class="btn btn--ghost" id="readBtn" title="הקראה">🔊 הקראה</button>' : ""}
          <button class="btn btn--ghost" id="favBtnC">${S().isFav(card.id) ? "💖 שמור" : "🤍 שמירה"}</button>
          <button class="btn btn--ghost" id="anotherBtn">🎲 כרטיסייה אחרת</button>
          <button class="btn btn--primary btn--big" id="doneBtn">${done ? "עשינו שוב! ⭐" : "עשינו! ⭐"}</button>
        </div>
        ${done ? `<p class="muted center small">כבר השלמתם את הכרטיסייה הזו ${done.count > 1 ? done.count + " פעמים" : "פעם אחת"} 👏</p>` : ""}
      </article>`;
    open(html, { replace, onMount(p) {
      p.querySelector("#showAns")?.addEventListener("click", (e) => { e.target.hidden = true; p.querySelector(".answer__text").hidden = false; });
      p.querySelector("#readBtn")?.addEventListener("click", () => { if (window.Speech.speaking()) window.Speech.stop(); else window.Speech.say(readable); });
      p.querySelector("#favBtnC").addEventListener("click", (e) => { const on = S().toggleFav(card.id); e.target.textContent = on ? "💖 שמור" : "🤍 שמירה"; toast(on ? "נשמר במועדפים 💖" : "הוסר מהמועדפים"); });
      p.querySelector("#anotherBtn").addEventListener("click", () => {
        const next = E().pick(card.topic, child.age, lv === card.level ? lv : null, { exclude: card.id });
        if (!next) return toast("זו הכרטיסייה היחידה כאן 😊");
        viewCard(next, { level: lv, replace: true });
      });
      p.querySelector("#doneBtn").addEventListener("click", () => {
        const stars = E().STARS[card.level];
        S().markDone(card, stars);
        confetti(); window.App.refresh();
        const badges = E().newBadges();
        toast(`+${stars} ${stars === 1 ? "כוכב" : "כוכבים"} ⭐ כל הכבוד ${esc(child.name)}!`);
        if (badges.length) setTimeout(() => toast(`🏅 תג חדש: <b>${badges.map((b) => b.emoji + " " + b.name).join(", ")}</b>`, 3500), 2300);
        viewAfterDone(card, lv, fromDaily);
      });
      if (child.age <= 5 && S().setting("tts") && window.Speech.hasHebrew) setTimeout(() => window.Speech.say(readable), 350);
    } });
  }
  function viewAfterDone(card, lv, fromDaily) {
    const topic = E().topic(card.topic), child = S().child();
    const html = `<div class="done">
      <div class="done__emoji">🎉</div><h2>כל הכבוד!</h2>
      <p class="muted">${esc(card.title)} · ${topic.emoji} ${esc(topic.name)}</p>
      <p class="done__stars">⭐ ${S().prog().stars} כוכבים בסך הכול</p>
      <div class="col">
        ${fromDaily ? '<button class="btn btn--primary btn--big" id="backDaily">📅 חזרה לתוכנית היום</button>' : `<button class="btn btn--primary btn--big" id="moreBtn">🎲 עוד כרטיסייה ב${esc(topic.name)}</button>`}
        <button class="btn btn--ghost" id="mapBtn">🗺️ חזרה למפה</button>
      </div></div>`;
    open(html, { replace: true, onMount(p) {
      p.querySelector("#moreBtn")?.addEventListener("click", () => { const n = E().pick(card.topic, child.age, lv, { exclude: card.id }); n ? viewCard(n, { level: lv, replace: true }) : toast("סיימתם את כל הכרטיסיות ברמה הזו! 🏆"); });
      p.querySelector("#backDaily")?.addEventListener("click", () => { stack.length = 0; viewDaily(); });
      p.querySelector("#mapBtn").addEventListener("click", closeAll);
    } });
  }

  // ---------- daily plan ----------
  function viewDaily() {
    const child = S().child(); const plan = E().dailyPlan(child.age);
    const cards = plan.ids.map((id) => E().card(id)).filter(Boolean);
    const doneN = cards.filter((c) => plan.done.includes(c.id) || S().prog().done[c.id]?.last >= new Date().setHours(0, 0, 0, 0)).length;
    const html = `<h2 class="sheet__title">📅 התוכנית להיום</h2>
      <p class="muted">5 כרטיסיות מנושאים שעוד לא חקרתם הרבה. ${doneN === cards.length && cards.length ? "סיימתם הכול! 🏆" : `הושלמו ${doneN} מתוך ${cards.length}.`}</p>
      <div class="progress"><i style="width:${cards.length ? (doneN / cards.length) * 100 : 0}%"></i></div>
      <div class="list">${cards.map((c) => { const t = E().topic(c.topic); const ok = plan.done.includes(c.id) || S().prog().done[c.id]; return `
        <button class="list__item list__item--${t.color} ${ok ? "done" : ""}" data-id="${c.id}"><span class="avatar">${t.emoji}</span><span><b>${esc(c.title)}</b><small>${esc(t.name)} · <i class="dot dot--${c.level}"></i>${level(c.level).name} · ${T[c.type]?.emoji || ""} ${T[c.type]?.name || ""}</small></span><span class="check">${ok ? "✅" : ""}</span></button>`; }).join("")}</div>
      <button class="btn btn--ghost" id="newPlan">🔄 תוכנית אחרת להיום</button>`;
    open(html, { onMount(p) {
      p.querySelectorAll(".list__item").forEach((b) => b.addEventListener("click", () => viewCard(E().card(b.dataset.id), { fromDaily: true })));
      p.querySelector("#newPlan").addEventListener("click", () => { S().prog().daily = null; S().save(); stack.pop(); viewDaily(); });
    } });
  }

  // ---------- favorites ----------
  function viewFavs() {
    const favs = S().prog().favs.map((id) => E().card(id)).filter(Boolean);
    const html = `<h2 class="sheet__title">❤️ כרטיסיות שמורות</h2>
      ${favs.length ? `<div class="list">${favs.map((c) => { const t = E().topic(c.topic); return `<button class="list__item list__item--${t.color}" data-id="${c.id}"><span class="avatar">${t.emoji}</span><span><b>${esc(c.title)}</b><small>${esc(t.name)} · <i class="dot dot--${c.level}"></i>${level(c.level).name}</small></span></button>`; }).join("")}</div>`
        : '<p class="muted center">עוד אין כרטיסיות שמורות. בתוך כרטיסייה לחצו על 🤍 כדי לשמור אותה לכאן.</p>'}`;
    open(html, { onMount(p) { p.querySelectorAll(".list__item").forEach((b) => b.addEventListener("click", () => viewCard(E().card(b.dataset.id)))); } });
  }

  // ---------- stars & badges ----------
  function viewStars() {
    const p0 = S().prog(), child = S().child();
    const doneN = Object.keys(p0.done).length;
    const html = `<h2 class="sheet__title">⭐ הכוכבים של ${esc(child.name)}</h2>
      <div class="stats">
        <div class="stat"><b>${p0.stars}</b><small>כוכבים</small></div>
        <div class="stat"><b>${doneN}</b><small>כרטיסיות</small></div>
        <div class="stat"><b>${p0.streak.count}🔥</b><small>ימים ברצף</small></div>
        <div class="stat"><b>${p0.badges.length}/${E().BADGES.length}</b><small>תגים</small></div>
      </div>
      <h3>תגים</h3>
      <div class="badges">${E().BADGES.map((b) => `<div class="badge ${p0.badges.includes(b.id) ? "on" : ""}"><span>${b.emoji}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join("")}</div>`;
    open(html);
  }

  // ---------- parent area ----------
  function viewParentGate(next) {
    if (!S().setting("parentGate")) return next();
    const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    const html = `<h2 class="sheet__title">👩‍👧 אזור ההורה</h2><p class="muted">שאלה קטנה כדי לוודא שזה לא הילד/ה 😉</p>
      <form id="gate" class="form"><label>כמה זה ${a} × ${b}?<input name="ans" type="number" inputmode="numeric" autofocus required></label><button class="btn btn--primary">כניסה</button></form>`;
    open(html, { onMount(p) { p.querySelector("#gate").addEventListener("submit", (e) => { e.preventDefault(); if (+e.target.ans.value === a * b) { stack.pop(); next(); } else toast("לא נכון, נסו שוב 🙂"); }); setTimeout(() => p.querySelector("input")?.focus(), 50); } });
  }
  function viewParent(tab = "progress") {
    const child = S().child();
    const tabs = [["progress", "📊 התקדמות"], ["children", "👧 ילדים"], ["library", "📚 ספרייה"], ["log", "📝 יומן"], ["settings", "⚙️ הגדרות"]];
    const html = `<h2 class="sheet__title">👩‍👧 אזור ההורה</h2>
      <nav class="tabs">${tabs.map(([id, n]) => `<button class="tab ${id === tab ? "on" : ""}" data-tab="${id}">${n}</button>`).join("")}</nav>
      <div id="tabBody">${({ progress: tabProgress, children: tabChildren, library: tabLibrary, log: tabLog, settings: tabSettings })[tab](child)}</div>`;
    open(html, { replace: stack[stack.length - 1]?.cls === "parent", cls: "parent", onMount(p) {
      p.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => viewParent(b.dataset.tab)));
      mountParent[tab]?.(p, child);
    } });
  }
  function tabProgress(child) {
    const stats = E().topicStats(child.age), p0 = S().prog();
    const totalDone = Object.keys(p0.done).length;
    const weak = stats.filter((s) => s.total).sort((a, b) => a.done / a.total - b.done / b.total).slice(0, 3);
    return `<div class="stats">
        <div class="stat"><b>${p0.stars}</b><small>כוכבים</small></div>
        <div class="stat"><b>${totalDone}</b><small>כרטיסיות</small></div>
        <div class="stat"><b>${p0.streak.count}</b><small>ימים ברצף (שיא ${p0.streak.best})</small></div>
        <div class="stat"><b>${stats.filter((s) => s.doneAll).length}/20</b><small>נושאים נגעו</small></div>
      </div>
      <p class="muted">כיסוי לפי נושא עבור גיל ${child.age} (${E().bandForAge(child.age).name}). שווה לחזק: ${weak.map((s) => s.topic.emoji + " " + s.topic.name).join(", ")}.</p>
      <div class="bars">${stats.map((s) => `<div class="bar"><span class="bar__name">${s.topic.emoji} ${esc(s.topic.name)}</span>
        <div class="bar__track">${LEVELS.map((l) => `<i class="bar__seg bar__seg--${l.id}" style="width:${s.total ? (s.byLevel[l.id].done / s.total) * 100 : 0}%" title="${l.name}: ${s.byLevel[l.id].done}/${s.byLevel[l.id].total}"></i>`).join("")}</div>
        <span class="bar__num">${s.done}/${s.total}</span></div>`).join("")}</div>`;
  }
  function tabChildren() {
    return `<div class="list">${S().children().map((c) => `<button class="list__item ${c.id === S().child()?.id ? "on" : ""}" data-edit="${c.id}"><span class="avatar">${c.avatar}</span><span><b>${esc(c.name)}</b><small>${ageLabel(c.age)} · ⭐ ${S().prog(c.id).stars} · ${Object.keys(S().prog(c.id).done).length} כרטיסיות</small></span><span class="check">✏️</span></button>`).join("")}</div>
      <div class="row"><button class="btn btn--primary" id="addChild2">＋ הוספת ילד/ה</button><button class="btn btn--ghost" id="switchChild">החלפת ילד/ה פעיל/ה</button></div>
      <p class="muted small">הגיל קובע את מאגר הכרטיסיות (2–3, 4–5, 6–8, 9–12). עדכנו אותו ביום ההולדת 🎂 — ההתקדמות נשמרת.</p>`;
  }
  function tabLibrary(child) {
    return `<p class="muted">עיון בכל הכרטיסיות לפי נושא, גיל ורמה — להכנה מראש או לבחירה ידנית.</p>
      <div class="filters">
        <select id="fTopic">${TOPICS.map((t) => `<option value="${t.id}">${t.emoji} ${esc(t.name)}</option>`).join("")}</select>
        <select id="fBand">${BANDS.map((b) => `<option value="${b.id}" ${b === E().bandForAge(child.age) ? "selected" : ""}>${b.label} · ${b.name}</option>`).join("")}</select>
        <select id="fLevel"><option value="">כל הרמות</option>${LEVELS.map((l) => `<option value="${l.id}">${l.name}</option>`).join("")}</select>
      </div><div id="libList" class="list"></div>`;
  }
  function tabLog() {
    const log = S().prog().log;
    if (!log.length) return '<p class="muted center">עוד לא הושלמו כרטיסיות.</p>';
    const days = {};
    for (const e of log) { const d = new Date(e.at).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }); (days[d] = days[d] || []).push(e); }
    return Object.entries(days).map(([d, es]) => `<h3>${d}</h3><div class="list">${es.map((e) => { const t = E().topic(e.topic); return `<button class="list__item list__item--${t?.color}" data-id="${e.cardId}"><span class="avatar">${t?.emoji}</span><span><b>${esc(e.title)}</b><small>${esc(t?.name)} · <i class="dot dot--${e.level}"></i>${level(e.level)?.name} · ${new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</small></span></button>`; }).join("")}</div>`).join("");
  }
  function tabSettings() {
    const dis = new Set(S().setting("disabledTopics") || []);
    return `<div class="form">
      <label class="switch"><input type="checkbox" id="sTts" ${S().setting("tts") ? "checked" : ""}><span>הקראה אוטומטית לגילאי 2–5 ${window.Speech.hasHebrew ? "" : "(אין קול עברי במכשיר הזה)"}</span></label>
      <label class="switch"><input type="checkbox" id="sBig" ${S().setting("bigText") ? "checked" : ""}><span>טקסט גדול בכרטיסיות לכל הגילאים</span></label>
      <label class="switch"><input type="checkbox" id="sGate" ${S().setting("parentGate") ? "checked" : ""}><span>שאלת חשבון בכניסה לאזור ההורה</span></label>
      <div class="label">נושאים פעילים במפה</div>
      <div class="topic-toggles">${TOPICS.map((t) => `<label class="switch small"><input type="checkbox" data-topic="${t.id}" ${dis.has(t.id) ? "" : "checked"}><span>${t.emoji} ${esc(t.name)}</span></label>`).join("")}</div>
      <div class="label">האפליקציה בטלפון</div>
      <div class="row"><a class="btn btn--ghost" href="download.html" target="_blank" rel="noopener">📲 הורדה לאנדרואיד / התקנה באייפון</a></div>
      <div class="label">גיבוי</div>
      <div class="row"><button class="btn btn--ghost" id="exportBtn">⬇️ ייצוא (JSON)</button><label class="btn btn--ghost">⬆️ ייבוא<input type="file" id="importFile" accept="application/json" hidden></label></div>
      <div class="label">איפוס</div>
      <div class="row"><button class="btn btn--danger" id="resetChild">איפוס ההתקדמות של ${esc(S().child().name)}</button><button class="btn btn--danger" id="wipeAll">מחיקת הכול</button></div>
      <p class="muted small">הכול נשמר על המכשיר הזה בלבד. ${E().all.length} כרטיסיות ב-20 נושאים.</p></div>`;
  }
  const mountParent = {
    children(p) {
      p.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => viewChild(S().children().find((c) => c.id === b.dataset.edit))));
      p.querySelector("#addChild2").addEventListener("click", () => viewChild(null));
      p.querySelector("#switchChild").addEventListener("click", viewSwitchChild);
    },
    library(p) {
      const fill = () => {
        const band = BANDS.find((b) => b.id === p.querySelector("#fBand").value), lv = p.querySelector("#fLevel").value, tid = p.querySelector("#fTopic").value;
        const cards = E().byTopic[tid].filter((c) => c.band === band && (!lv || c.level === lv));
        p.querySelector("#libList").innerHTML = cards.length ? cards.map((c) => `<button class="list__item ${S().prog().done[c.id] ? "done" : ""}" data-id="${c.id}"><span class="avatar"><i class="dot dot--${c.level}"></i></span><span><b>${esc(c.title)}</b><small>${T[c.type]?.emoji} ${T[c.type]?.name} · ${esc(c.text).slice(0, 70)}…</small></span><span class="check">${S().prog().done[c.id] ? "✅" : ""}</span></button>`).join("") : '<p class="muted center">אין כרטיסיות בסינון הזה.</p>';
        p.querySelectorAll("#libList .list__item").forEach((b) => b.addEventListener("click", () => viewCard(E().card(b.dataset.id))));
      };
      p.querySelectorAll(".filters select").forEach((s) => s.addEventListener("change", fill)); fill();
    },
    log(p) { p.querySelectorAll(".list__item").forEach((b) => b.addEventListener("click", () => { const c = E().card(b.dataset.id); c && viewCard(c); })); },
    settings(p) {
      p.querySelector("#sTts").addEventListener("change", (e) => S().setting("tts", e.target.checked));
      p.querySelector("#sBig").addEventListener("change", (e) => S().setting("bigText", e.target.checked));
      p.querySelector("#sGate").addEventListener("change", (e) => S().setting("parentGate", e.target.checked));
      p.querySelectorAll("[data-topic]").forEach((cb) => cb.addEventListener("change", () => {
        const dis = [...p.querySelectorAll("[data-topic]")].filter((x) => !x.checked).map((x) => x.dataset.topic);
        S().setting("disabledTopics", dis); window.App.refresh();
      }));
      p.querySelector("#exportBtn").addEventListener("click", () => {
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([S().exportJSON()], { type: "application/json" }));
        a.download = `lifemap-backup-${S().today()}.json`; a.click();
      });
      p.querySelector("#importFile").addEventListener("change", async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { S().importJSON(await f.text()); toast("הגיבוי נטען ✔"); stack.length = 0; render(); window.App.refresh(); } catch { toast("הקובץ לא תקין 😕"); }
      });
      p.querySelector("#resetChild").addEventListener("click", () => { if (confirm("לאפס את כל ההתקדמות, הכוכבים והתגים?")) { S().resetChild(S().child().id); toast("אופס ✔"); window.App.refresh(); viewParent("settings"); } });
      p.querySelector("#wipeAll").addEventListener("click", () => { if (confirm("למחוק את כל הילדים וכל הנתונים מהמכשיר?")) { S().wipe(); location.reload(); } });
    },
  };

  window.UI = { open, back, closeAll, toast, confetti, esc, viewChild, viewSwitchChild, viewLevel, viewCard, viewDaily, viewFavs, viewStars, viewParent: () => viewParentGate(() => viewParent("progress")) };
})();

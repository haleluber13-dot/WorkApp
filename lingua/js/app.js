/* LinguaPath — app shell and routing.
   #/                      home (today's plan) / onboarding
   #/course                course map
   #/unit/<id>             unit page (words, practice, dialogue, grammar, speak, write)
   #/practice/<id>         practice session for a unit
   #/review                spaced-repetition review
   #/practice              practice hub (speaking, listening, reading, writing, grammar, sounds, conversation, tutor)
   #/translate             translator
   #/me                    progress & settings */
import { t, bi, setUILang, getUILang, levelName } from "./i18n.js";
import { LANGS, FEATURED, PACKS, BASE, lang as langInfo, hasPack, isBase } from "./langs.js";
import { store } from "./store.js";
import { esc, toast, modal, fmtMin, pct, sfx } from "./ui.js";
import { Course, UNITS, LEVELS, unitsOf, unitById, nextUnit, unitUnlocked, estimatedLevel, startIndex, unitIds } from "./curriculum.js";
import { speak, stopSpeaking } from "./speech.js";
import { renderUnit, renderPracticeSession } from "./unit.js";
import { renderReview } from "./review.js";
import { renderPracticeHub } from "./practice.js";
import { renderTranslator } from "./translator.js";
import { renderMe } from "./progress.js";

const view = document.getElementById("view");
const tabs = document.getElementById("tabs");
let cleanup = null;
export const ctx = { course: null };

applyTheme();
setUILang(store.setting("ui"));
localizeTabs();

export const nav = { go: (h) => { location.hash = h; } };

/* Load (or switch to) the current course. */
export async function ensureCourse() {
  const code = store.current;
  if (!code) return null;
  if (ctx.course && ctx.course.code === code && ctx.course.base === store.setting("known")) return ctx.course;
  ctx.course = await new Course(code, store.setting("known")).load();
  return ctx.course;
}

async function route() {
  cleanup?.(); cleanup = null; stopSpeaking();
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const [page, a] = parts;
  document.body.dataset.page = page || "home";
  tabs.querySelectorAll("a").forEach((x) => x.classList.toggle("on", x.dataset.tab === ({ course: "home", unit: "home", home: "home" }[page] || page || "home")));
  window.scrollTo(0, 0);
  if (!store.setting("onboarded") || !store.current) return renderOnboarding();
  if (page === "translate") { cleanup = await renderTranslator(view); return; }
  if (page === "me") { cleanup = renderMe(view, { applyTheme, refresh: route }); return; }
  const course = await ensureCourse();
  if (!course) return renderOnboarding();
  if (!page || page === "home") return renderHome(course);
  if (page === "course") return renderCourseMap(course);
  if (page === "unit") { cleanup = await renderUnit(view, course, a); return; }
  if (page === "session") { cleanup = await renderPracticeSession(view, course, a); return; }
  if (page === "review") { cleanup = renderReview(view, course); return; }
  if (page === "practice") { cleanup = await renderPracticeHub(view, course, parts.slice(1)); return; }
  renderHome(course);
}
window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]");
  if (n) { e.preventDefault(); nav.go(n.dataset.nav); }
  const s = e.target.closest("[data-say]");
  if (s && !e.target.closest(".lesson")) { const c = s.dataset.lang || store.current; speak(s.dataset.say, c, { prefs: ctx.course?.code === c ? ctx.course.ttsPrefs : undefined, slow: !!s.dataset.slow }); }
});

export function applyTheme() {
  const th = store.setting("theme");
  if (th === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
}
function localizeTabs() {
  tabs.innerHTML = [["home", "🏠", "nav_learn"], ["review", "🔁", "nav_review"], ["practice", "🎯", "nav_practice"], ["translate", "🌐", "nav_translate"], ["me", "👤", "nav_me"]]
    .map(([k, ic, lab]) => `<a href="#/${k === "home" ? "" : k}" data-tab="${k}"><span>${ic}</span>${t(lab)}</a>`).join("");
}
export function relocalize() { setUILang(store.setting("ui")); localizeTabs(); }

/* ───────── onboarding ───────── */
function langCard(l, selected) {
  const kind = hasPack(l.code) ? "pack_full" : isBase(l.code) ? "pack_base" : "pack_auto";
  return `<button class="langcard ${selected ? "sel" : ""}" data-code="${l.code}">
    <span class="langcard__flag">${l.flag}</span><b>${esc(l.native)}</b><small>${esc(l.name)}</small>
    <span class="tag ${hasPack(l.code) || isBase(l.code) ? "tag--full" : ""}">${hasPack(l.code) || isBase(l.code) ? "★" : "⚙"} ${t(kind).split(":")[0]}</span></button>`;
}
export function renderOnboarding(addMode = false) {
  const ui = store.setting("ui");
  let known = store.setting("known") || (ui === "he" ? "he" : "en"), target = null, level = "A1", goal = store.setting("goalMin") || 15, filter = "";
  const draw = () => {
    const featured = FEATURED.filter((c) => c !== known);
    const q = filter.trim().toLowerCase();
    const others = LANGS.filter((l) => l.code !== known && (!q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q)) && (q || !featured.includes(l.code)));
    view.innerHTML = `<div class="page ob">
      ${addMode ? `<div class="page-h"><button class="iconbtn" data-nav="#/me">←</button><h2>${t("add_lang")}</h2></div>` : `<div class="hero"><div class="logo">🗣️</div><h1>${t("welcome")}</h1><p>${t("ob_intro")}</p></div>`}
      ${addMode ? "" : `<div class="field"><label>${t("ob_ui")}</label><div class="seg"><button class="${ui === "en" ? "on" : ""}" data-ui="en">English</button><button class="${ui === "he" ? "on" : ""}" data-ui="he">עברית</button></div></div>
      <div class="field"><label>${t("ob_know")}</label><div class="seg"><button class="${known === "en" ? "on" : ""}" data-known="en">🇬🇧 English</button><button class="${known === "he" ? "on" : ""}" data-known="he">🇮🇱 עברית</button></div></div>`}
      <div class="field"><label>${t("ob_learn")}</label>
        <input class="input" id="langFilter" placeholder="🔍 ${t("all_langs")}" value="${esc(filter)}">
        ${q ? "" : `<div class="muted small">${t("featured")}</div>`}
        <div class="langgrid">${(q ? others : featured.map((c) => langInfo(c))).map((l) => langCard(l, target === l.code)).join("")}</div>
        ${q ? "" : `<details class="more"><summary>${t("all_langs")} (${LANGS.length})</summary><div class="langgrid">${others.map((l) => langCard(l, target === l.code)).join("")}</div></details>`}
        <p class="muted small">★ ${t("pack_full")}<br>⚙ ${t("pack_auto")}</p>
      </div>
      <div class="field"><label>${t("ob_level")}</label><div class="seg wrap">${[["A1", "lvl_new"], ["A2", "lvl_some"], ["B1", "lvl_mid"], ["B2", "lvl_adv"]].map(([v, k]) => `<button class="${level === v ? "on" : ""}" data-level="${v}">${t(k)}</button>`).join("")}</div></div>
      ${addMode ? "" : `<div class="field"><label>${t("ob_goal")}</label><div class="seg">${[5, 10, 15, 30].map((m) => `<button class="${goal === m ? "on" : ""}" data-goal="${m}">${m} ${t("min")}</button>`).join("")}</div></div>`}
      <button class="btn primary big wide" id="obGo" ${target ? "" : "disabled"}>${t("ob_go")} ${target ? langInfo(target).flag : ""}</button>
    </div>`;
    const f = view.querySelector("#langFilter");
    f.oninput = () => { filter = f.value; const pos = f.selectionStart; draw(); const nf = view.querySelector("#langFilter"); nf.focus(); nf.setSelectionRange(pos, pos); };
    view.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.ui) { store.setting("ui", b.dataset.ui); setUILang(b.dataset.ui); localizeTabs(); if (!store.setting("known") || store.setting("known") === (b.dataset.ui === "he" ? "en" : "he")) known = b.dataset.ui; draw(); }
      else if (b.dataset.known) { known = b.dataset.known; if (target === known) target = null; draw(); }
      else if (b.dataset.code) { target = b.dataset.code; draw(); view.querySelector("#obGo").scrollIntoView({ behavior: "smooth", block: "nearest" }); }
      else if (b.dataset.level) { level = b.dataset.level; draw(); }
      else if (b.dataset.goal) { goal = +b.dataset.goal; draw(); }
      else if (b.id === "obGo" && target) {
        store.setting("known", known); store.setting("goalMin", goal); store.setting("onboarded", true);
        store.setCurrent(target); store.lang(target).start = level; store.save();
        ctx.course = null; nav.go("#/"); if (location.hash === "#/" || location.hash === "") route();
      }
    };
  };
  draw();
}

/* ───────── home ───────── */
function renderHome(course) {
  const code = course.code, L = store.lang(code);
  const due = store.dueCards(code).length, stats = store.cardStats(code);
  const nxt = nextUnit(code), streak = store.streak(), goal = store.setting("goalMin"), mins = Math.round(store.todaySec() / 60);
  const prog = nxt ? store.unitProg(code, nxt.id) : {};
  const started = Object.values(prog).some((v) => v > 0);
  const doneCount = UNITS.filter((u) => store.unitDone(code, u.id)).length;
  const lvl = estimatedLevel(code);
  const myLangs = store.myLangs();
  view.innerHTML = `<div class="page home">
    <header class="home__top">
      <button class="langpill" id="langSwitch" title="${t("change_lang")}"><span>${course.info.flag}</span><b>${esc(course.name)}</b><small>▾</small></button>
      <div class="stats">
        <span class="stat" title="${t("streak")}">🔥 <b>${streak}</b></span>
        <span class="stat" title="${t("xp")}">⭐ <b>${L.xp}</b></span>
        <span class="stat" title="${t("level_est")}">🎓 <b>${lvl}</b></span>
      </div>
    </header>
    <section class="card goal">
      <div class="ring" style="--p:${Math.min(100, pct(mins, goal))}"><span>${mins}<small>/${goal}</small></span></div>
      <div><b>${t("today")}</b><div class="muted">${mins >= goal ? t("goal_reached") : t("keep_going", { n: Math.max(0, goal - mins) })}</div></div>
    </section>
    <h2 class="h2">${t("today_plan")}</h2>
    <div class="plan">
      ${nxt ? `<a class="card plan__item primary" href="#/unit/${nxt.id}"><span class="plan__ic">${nxt.emoji || "📘"}</span><div><b>${started ? t("continue_lesson") : t("start_lesson")}</b><div class="muted">${nxt.level} · ${esc(bi(nxt.title))}</div></div><span class="chev">›</span></a>` : `<div class="card plan__item"><span class="plan__ic">🏆</span><div><b>${t("unit_done")}</b></div></div>`}
      <a class="card plan__item ${due ? "" : "dim"}" href="#/review"><span class="plan__ic">🔁</span><div><b>${due ? t("review_due", { n: due }) : t("review_none")}</b><div class="muted">${t("learned")} ${stats.learned} · ${t("mastered")} ${stats.mastered}</div></div><span class="chev">›</span></a>
      <a class="card plan__item" href="#/practice/speak"><span class="plan__ic">🎤</span><div><b>${t("speak_5")}</b><div class="muted">${t("ph_speak_d")}</div></div><span class="chev">›</span></a>
      <a class="card plan__item" href="#/practice/read"><span class="plan__ic">📖</span><div><b>${t("read_today")}</b><div class="muted">${t("ph_read_d")}</div></div><span class="chev">›</span></a>
      <a class="card plan__item" href="#/translate"><span class="plan__ic">🌐</span><div><b>${t("tr_title")}</b><div class="muted">${t("tr_placeholder")}</div></div><span class="chev">›</span></a>
    </div>
    <h2 class="h2 row between">${t("course_map")} <a class="muted small" href="#/course">${t("units_done", { d: doneCount, n: UNITS.length })} ›</a></h2>
    <div class="levels">${LEVELS.map((lv, i) => { const us = unitsOf(lv); const d = us.filter((u) => store.unitDone(code, u.id)).length; return `<a class="level ${d === us.length ? "done" : ""}" href="#/course#${lv}"><b>${lv}</b><small>${levelName(i)}</small><div class="bar"><i style="width:${pct(d, us.length)}%"></i></div></a>`; }).join("")}</div>
    ${course.isMT ? `<p class="muted small">⚙ ${t("mt_note")}</p>` : ""}
  </div>`;
  view.querySelector("#langSwitch").onclick = () => {
    const m = modal(`<h3>${t("my_langs")}</h3><div class="list">${myLangs.map((c) => `<button class="listitem ${c === code ? "sel" : ""}" data-pick="${c}"><span>${langInfo(c).flag}</span><b>${esc(langInfo(c).native)}</b><small>${store.lang(c).xp} ${t("xp")}</small></button>`).join("")}</div>
      <button class="btn wide" data-add>＋ ${t("add_lang")}</button>`);
    m.el.onclick = (e) => {
      const p = e.target.closest("[data-pick]"); if (p) { store.setCurrent(p.dataset.pick); ctx.course = null; m.close(); route(); }
      if (e.target.closest("[data-add]")) { m.close(); renderOnboarding(true); }
    };
  };
}

/* ───────── course map ───────── */
function renderCourseMap(course) {
  const code = course.code;
  view.innerHTML = `<div class="page">
    <div class="page-h"><button class="iconbtn" data-nav="#/">←</button><h2>${t("course_map")} · ${course.info.flag} ${esc(course.name)}</h2></div>
    ${LEVELS.map((lv, i) => `<section class="lvlsec" id="${lv}"><h3>${lv} <small class="muted">${levelName(i)}</small></h3>
      <div class="units">${unitsOf(lv).map((u) => { const done = store.unitDone(code, u.id), open = unitUnlocked(code, u); const p = store.unitProg(code, u.id); const pp = Math.round(100 * (Object.values(p).reduce((a, b) => a + b, 0) / 6)); return `<a class="unitcard ${done ? "done" : ""} ${open ? "" : "locked"}" href="#/unit/${u.id}"><span class="unitcard__ic">${done ? "✅" : open ? (u.emoji || "📘") : "🔒"}</span><div><b>${esc(bi(u.title))}</b><small class="muted">${u.vocab.length} ${t("words_")}</small>${!done && pp ? `<div class="bar"><i style="width:${pp}%"></i></div>` : ""}</div></a>`; }).join("")}</div></section>`).join("")}
  </div>`;
  const target = location.hash.split("#")[2]; if (target) document.getElementById(target)?.scrollIntoView();
}

/* service worker */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
export const canInstall = () => !!installEvt;
export const doInstall = () => installEvt?.prompt();

route();

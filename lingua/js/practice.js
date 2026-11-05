/* Practice hub: speaking · listening · reading · writing · conversation · grammar & verbs · sounds · AI tutor */
import { t, bi, getUILang } from "./i18n.js";
import { esc, sample, shuffle, toast } from "./ui.js";
import { store } from "./store.js";
import { UNITS, LEVELS, READINGS, readingsOf, readingById, unitById, startIndex, unitsOf } from "./curriculum.js";
import { runSession } from "./lesson.js";
import { speak, stopSpeaking, listen, abortListening, sttSupported, bestMatch } from "./speech.js";
import { translate } from "./translate.js";
import { verbsHTML, soundsHTML, grammarHTML } from "./grammar.js";
import { renderTutor, aiAvailable } from "./tutor.js";

export async function renderPracticeHub(view, course, [sub, arg]) {
  const code = course.code;
  if (!sub) {
    const items = [["speak", "🎤", "ph_speak"], ["conv", "🎭", "ph_conv"], ["listen", "🎧", "ph_listen"], ["read", "📖", "ph_read"], ["write", "✍️", "ph_write"], ["grammar", "📚", "ph_grammar"], ["sounds", "🔤", "ph_sounds"], ["tutor", "✨", "ph_tutor"]];
    view.innerHTML = `<div class="page"><div class="page-h"><h2>🎯 ${t("practice_hub")} · ${course.info.flag} ${esc(course.name)}</h2></div>
      <div class="hub">${items.map(([k, ic, lab]) => `<a class="card hub__item" href="#/practice/${k}"><span class="hub__ic">${ic}</span><b>${t(lab)}</b><small class="muted">${t(lab + "_d")}</small></a>`).join("")}</div></div>`;
    return;
  }
  const back = `<button class="iconbtn" data-nav="#/practice">←</button>`;
  const learnedUnits = () => { const from = startIndex(store.lang(code).start); return UNITS.filter((u, i) => i < from || store.unitDone(code, u.id) || Object.keys(store.unitProg(code, u.id)).length) ; };
  const unitPicker = (target) => {
    const done = new Set(learnedUnits().map((u) => u.id));
    return `<div class="list">${UNITS.map((u) => `<a class="listitem ${done.has(u.id) ? "" : "dim"}" href="#/practice/${target}/${u.id}"><span>${u.emoji || "📘"}</span><div><b>${esc(bi(u.title))}</b><small class="muted">${u.level}</small></div><span class="chev">›</span></a>`).join("")}</div>`;
  };
  async function ready(u) {
    if (course.unitReady(u)) return true;
    view.innerHTML = `<div class="page center"><div class="spinner"></div><p>${t("auto_building", { lang: course.name })}</p></div>`;
    return course.ensureUnit(u).catch(() => false);
  }

  /* ── speaking: shadowing drills ── */
  if (sub === "speak") {
    if (!arg) { view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>🎤 ${t("ph_speak")}</h2></div><p class="muted">${t("shadowing")}</p><h3>${t("pick_unit")}</h3>${unitPicker("speak")}</div>`; return; }
    const u = unitById(arg); if (!u || !(await ready(u))) return;
    const items = [...u.phrases, ...u.sentences, ...u.dialogue.lines].filter((x) => course.text(x.id));
    const exs = shuffle(items).slice(0, 10).map((x) => ({ type: "speak", id: x.id, prompt: course.text(x.id), translation: course.baseText(x.id), answer: course.text(x.id), audio: course.text(x.id) }));
    if (!sttSupported()) exs.forEach((e) => { e.type = "dictation"; });
    return runSession(view, { course, exercises: exs, title: `${t("ph_speak")} · ${bi(u.title)}`, xpPer: 8, onExit: () => { location.hash = "#/practice/speak"; }, onDone: ({ score, xp }) => { toast(`${t("score")} ${score}% · ${t("xp_earned", { n: xp })}`); location.hash = "#/practice/speak"; } });
  }
  /* ── conversation: role-play dialogue ── */
  if (sub === "conv") {
    if (!arg) { view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>🎭 ${t("ph_conv")}</h2></div><p class="muted">${t("ph_conv_d")}</p>${unitPicker("conv")}</div>`; return; }
    sessionStorage.setItem(`tab.${arg}`, "dialogue"); location.hash = `#/unit/${arg}`; return;
  }
  /* ── listening: dictation ── */
  if (sub === "listen") {
    if (!arg) { view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>🎧 ${t("ph_listen")}</h2></div><p class="muted">${t("ph_listen_d")}</p>${unitPicker("listen")}</div>`; return; }
    const u = unitById(arg); if (!u || !(await ready(u))) return;
    const items = [...u.phrases, ...u.sentences].filter((x) => course.text(x.id));
    const words = u.vocab.filter((v) => course.text(v.id));
    const exs = [...sample(words, 4).map((v) => ({ type: "listenPick", id: v.id, audio: course.text(v.id), answer: v.id, options: shuffle([v, ...course.distractors(v, 3, u)].map((x) => ({ id: x.id, text: course.text(x.id) }))) })),
      ...shuffle(items).slice(0, 8).map((x) => ({ type: "dictation", id: x.id, audio: course.text(x.id), answer: course.text(x.id), translation: course.baseText(x.id) }))];
    return runSession(view, { course, exercises: shuffle(exs), title: `${t("ph_listen")} · ${bi(u.title)}`, xpPer: 8, onExit: () => { location.hash = "#/practice/listen"; }, onDone: ({ score, xp }) => { toast(`${t("score")} ${score}% · ${t("xp_earned", { n: xp })}`); location.hash = "#/practice/listen"; } });
  }
  /* ── reading ── */
  if (sub === "read") {
    if (!arg) {
      view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>📖 ${t("ph_read")}</h2></div><p class="muted">${t("tap_word")}</p>
        ${LEVELS.map((lv) => `<h3>${lv}</h3><div class="list">${readingsOf(lv).map((r) => `<a class="listitem ${store.lang(code).readDone[r.id] ? "done" : ""}" href="#/practice/read/${r.id}"><span>${store.lang(code).readDone[r.id] ? "✅" : "📄"}</span><div><b>${esc(bi(r.title))}</b><small class="muted">${r.text.en.split(/\s+/).length} ${t("words_")}</small></div><span class="chev">›</span></a>`).join("")}</div>`).join("")}</div>`;
      return;
    }
    const r = readingById(arg); if (!r) return;
    if (!course.readingReady(r)) { view.innerHTML = `<div class="page center"><div class="spinner"></div><p>${t("auto_building", { lang: course.name })}</p></div>`; if (!(await course.ensureReading(r).catch(() => false))) { view.innerHTML = `<div class="page center"><p>⚠️ ${t("auto_fail")}</p></div>`; return; } }
    const text = course.text(r.id);
    const paras = text.split(/\n+/).filter(Boolean);
    const wordify = (p) => p.split(/(\s+)/).map((w) => (/\s/.test(w) ? w : `<span class="w" data-w="${esc(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))}">${esc(w)}</span>`)).join("");
    let showT = false;
    const draw = () => {
      view.innerHTML = `<div class="page reading">
        <div class="page-h"><button class="iconbtn" data-nav="#/practice/read">←</button><div><small class="muted">${r.level}</small><h2>${esc(bi(r.title))}</h2></div></div>
        <div class="row wrap"><button class="btn sm" data-say="${esc(text)}">🔊 ${t("listen")}</button><button class="btn sm" id="stop">⏹</button><button class="btn sm" id="tog">${showT ? t("hide_translation") : t("show_translation")}</button></div>
        <p class="muted small">${t("tap_word")}</p>
        <article class="rtext" lang="${code}" dir="${course.dir}">${paras.map((p) => `<p>${wordify(p)}</p>`).join("")}</article>
        <div class="wordpop" id="pop" hidden></div>
        ${showT ? `<article class="rtext tr muted">${esc(bi(r.text)).replace(/\n/g, "<br>")}</article>` : ""}
        <h3>${t("questions")}</h3>
        <form id="qs">${r.questions.map((q, i) => `<fieldset class="q"><legend>${i + 1}. ${esc(bi(q.q))}</legend>${bi(q.options).map((o, j) => `<label class="radio"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join("")}</fieldset>`).join("")}
        <button class="btn primary" type="submit">${t("check")}</button><div id="qres"></div></form></div>`;
      view.querySelector("#stop").onclick = stopSpeaking;
      view.querySelector("#tog").onclick = () => { showT = !showT; draw(); };
      const pop = view.querySelector("#pop");
      view.querySelector(".rtext").onclick = async (e) => {
        const w = e.target.closest(".w"); if (!w || !w.dataset.w) return;
        view.querySelectorAll(".w.hl").forEach((x) => x.classList.remove("hl")); w.classList.add("hl");
        speak(w.dataset.w, code, { prefs: course.ttsPrefs });
        pop.hidden = false; pop.innerHTML = `<b lang="${code}">${esc(w.dataset.w)}</b> → …`;
        try { const tr = await translate(w.dataset.w, code, course.base); pop.innerHTML = `<b lang="${code}" dir="${course.dir}">${esc(w.dataset.w)}</b> → ${esc(tr.text)} <button class="iconbtn" data-save="${esc(w.dataset.w)}" data-b="${esc(tr.text)}">＋</button>`; }
        catch { pop.innerHTML = `<b>${esc(w.dataset.w)}</b> → ⚠️`; }
      };
      pop.onclick = (e) => { const b = e.target.closest("[data-save]"); if (b) { store.addPhrase(code, b.dataset.save, b.dataset.b); toast(t("tr_saved")); } };
      view.querySelector("#qs").onsubmit = (e) => {
        e.preventDefault();
        let c = 0;
        r.questions.forEach((q, i) => { const v = view.querySelector(`input[name="q${i}"]:checked`); const fs = view.querySelectorAll(".q")[i]; fs.classList.remove("ok", "bad"); if (v && +v.value === q.answer) { c++; fs.classList.add("ok"); } else fs.classList.add("bad"); });
        view.querySelector("#qres").innerHTML = `<div class="notice ${c === r.questions.length ? "ok" : ""}">${t("read_score", { c, n: r.questions.length })}</div>`;
        if (c === r.questions.length && !store.lang(code).readDone[r.id]) { store.lang(code).readDone[r.id] = Date.now(); store.addXP(30, code); store.save(); toast(t("xp_earned", { n: 30 })); }
      };
    };
    draw();
    return () => stopSpeaking();
  }
  /* ── writing ── */
  if (sub === "write") {
    if (!arg) { view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>✍️ ${t("ph_write")}</h2></div><p class="muted">${t("ph_write_d")}</p>${unitPicker("write")}</div>`; return; }
    sessionStorage.setItem(`tab.${arg}`, "write"); location.hash = `#/unit/${arg}`; return;
  }
  /* ── grammar & verbs ── */
  if (sub === "grammar") {
    const st = { verb: null, tense: null, unit: arg || null };
    const draw = () => {
      view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>📚 ${t("ph_grammar")}</h2></div>
        <section class="card pad"><h3>${t("verbs")}</h3><div id="verbs">${verbsHTML(course, st)}</div></section>
        <h3 class="h2">${t("tab_grammar")}</h3>
        <div class="list" id="glist">${UNITS.map((u) => `<details class="gunit" ${st.unit === u.id ? "open" : ""} data-u="${u.id}"><summary>${u.emoji || ""} ${esc(bi(u.title))} <small class="muted">${u.level}</small></summary><div class="gbody">${st.unit === u.id ? grammarHTML(course, u) : ""}</div></details>`).join("")}</div></div>`;
      view.querySelector("#verbs").onclick = (e) => { const v = e.target.closest("[data-verb]"), tn = e.target.closest("[data-tense]"); if (v) { st.verb = v.dataset.verb; draw(); } else if (tn) { st.tense = tn.dataset.tense; draw(); } };
      view.querySelectorAll(".gunit").forEach((d) => d.addEventListener("toggle", () => { if (d.open && !d.querySelector(".gbody").innerHTML) d.querySelector(".gbody").innerHTML = grammarHTML(course, unitById(d.dataset.u)); }));
      if (st.unit) view.querySelector(`[data-u="${st.unit}"]`)?.scrollIntoView();
    };
    draw(); return;
  }
  if (sub === "sounds") { view.innerHTML = `<div class="page"><div class="page-h">${back}<h2>🔤 ${t("ph_sounds")} · ${esc(course.name)}</h2></div>${soundsHTML(course)}</div>`; return; }
  if (sub === "tutor") { renderTutor(view, course); return () => abortListening(); }
  location.hash = "#/practice";
}

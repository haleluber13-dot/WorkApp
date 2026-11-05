/* Unit page: words · practice · dialogue · grammar · speak · write. */
import { t, bi, getUILang } from "./i18n.js";
import { esc, toast, sfx, modal } from "./ui.js";
import { store } from "./store.js";
import { unitById, UNITS, unitIndex, unitUnlocked, nextUnit } from "./curriculum.js";
import { buildSession } from "./exercises.js";
import { runSession } from "./lesson.js";
import { speak, stopSpeaking, listen, abortListening, sttSupported, bestMatch, similarity } from "./speech.js";
import { translate } from "./translate.js";
import { grammarHTML } from "./grammar.js";
import { aiAvailable, correctWriting } from "./tutor.js";

const PARTS = ["learn", "practice", "dialogue", "grammar", "speak", "write"];

async function prepare(view, course, u) {
  if (course.unitReady(u)) return true;
  view.innerHTML = `<div class="page center"><div class="spinner"></div><p>${t("auto_building", { lang: course.name })}</p><div class="progress"><div class="progress__bar" id="pb" style="width:0%"></div></div></div>`;
  const ok = await course.ensureUnit(u, (p) => { const b = view.querySelector("#pb"); if (b) b.style.width = `${Math.round(p * 100)}%`; }).catch(() => false);
  if (!ok) { view.innerHTML = `<div class="page center"><p>⚠️ ${t("auto_fail")}</p><button class="btn" onclick="location.reload()">${t("retry")}</button> <button class="btn" data-nav="#/">${t("back")}</button></div>`; return false; }
  return true;
}

export async function renderUnit(view, course, id) {
  const u = unitById(id);
  if (!u) { location.hash = "#/"; return; }
  if (!(await prepare(view, course, u))) return;
  const code = course.code, dir = course.dir;
  const tab = sessionStorage.getItem(`tab.${id}`) || "learn";
  let cleanup = null;
  const tgt = (s, cls = "") => `<span class="tgt ${cls}" lang="${code}" dir="${dir}">${esc(s)}</span>`;
  const say = (s, slow) => `<button class="iconbtn speakbtn" data-say="${esc(s)}" ${slow ? 'data-slow="1"' : ""}>${slow ? "🐢" : "🔊"}</button>`;

  function draw(which) {
    cleanup?.(); cleanup = null; stopSpeaking(); abortListening();
    sessionStorage.setItem(`tab.${id}`, which);
    const prog = store.unitProg(code, id);
    const done = store.unitDone(code, id);
    const pp = Math.round((100 * PARTS.reduce((a, p) => a + (prog[p] || 0), 0)) / PARTS.length);
    const idx = unitIndex(id);
    view.innerHTML = `<div class="page unit">
      <div class="page-h"><button class="iconbtn" data-nav="#/course">←</button><div><small class="muted">${u.level} · ${t("unit")} ${idx + 1}</small><h2>${u.emoji || ""} ${esc(bi(u.title))}</h2></div></div>
      ${!unitUnlocked(code, u) ? `<div class="notice">🔒 ${t("locked")}</div>` : ""}
      <div class="bar unit__bar" title="${t("unit_progress")}"><i style="width:${pp}%"></i></div>
      <nav class="subtabs">${[["learn", "tab_learn"], ["practice", "tab_practice"], ["dialogue", "tab_dialogue"], ["grammar", "tab_grammar"], ["speak", "tab_speak"], ["write", "tab_write"]].map(([k, l]) => `<button class="${which === k ? "on" : ""} ${prog[k] >= 1 ? "done" : ""}" data-tab="${k}">${t(l)}${prog[k] >= 1 ? " ✓" : ""}</button>`).join("")}</nav>
      <section id="tabbody"></section>
      <div class="unit__foot">${done ? `<div class="notice ok">✅ ${t("unit_done")}</div>` : `<button class="btn primary big wide" id="btnComplete" ${prog.practice >= 1 ? "" : "disabled"}>${t("complete_unit")}</button>`}</div>
    </div>`;
    view.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => draw(b.dataset.tab));
    const body = view.querySelector("#tabbody");
    view.querySelector("#btnComplete")?.addEventListener("click", () => {
      store.markUnit(code, id); store.addXP(50, code); sfx("done"); toast(`${t("unit_done")} ${t("xp_earned", { n: 50 })}`);
      const nx = nextUnit(code); draw(which);
      if (nx) setTimeout(() => { if (confirm(`${t("next")}: ${bi(nx.title)}?`)) location.hash = `#/unit/${nx.id}`; }, 400);
    });
    ({ learn, practice, dialogue, grammar, speakTab, write })[which === "speak" ? "speakTab" : which](body);
  }

  /* ── words ── */
  function learn(body) {
    body.innerHTML = `<div class="goals"><b>${t("goals")}:</b><ul>${(bi(u.goals) || []).map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>
      <div class="row"><button class="btn primary" id="btnFlash">🃏 ${t("learn_words")}</button><span class="muted small">${u.vocab.length} ${t("words_")}</span></div>
      <div class="wordlist">${u.vocab.map((v) => { const c = store.card(code, v.id); const n = course.note(v.id); return `<div class="word ${c ? (c.iv >= 21 ? "strong" : c.n > 0 ? "learning" : "new") : ""}">
          <div class="word__t">${tgt(course.text(v.id), "big")}${say(course.text(v.id))}</div>
          <div class="word__b">${esc(course.baseText(v.id))} <small class="muted">${esc(v.pos)}</small>${n ? `<div class="muted small">💡 ${esc(bi(n))}</div>` : ""}</div></div>`; }).join("")}</div>`;
    body.querySelector("#btnFlash").onclick = () => {
      const exs = u.vocab.filter((v) => course.text(v.id)).map((v) => ({ type: "flash", id: v.id, front: course.text(v.id), back: course.baseText(v.id) }));
      document.body.dataset.page = "session";
      cleanup = runSession(view, { course, exercises: exs, title: bi(u.title), onExit: () => { document.body.dataset.page = "unit"; draw("learn"); },
        onDone: ({ xp }) => { store.setUnitProg(code, id, "learn", 1); document.body.dataset.page = "unit"; toast(t("xp_earned", { n: xp })); draw("practice"); } });
    };
  }
  /* ── practice ── */
  function practice(body) {
    const n = Math.min(18, u.vocab.length + 6);
    const best = store.unitProg(code, id).practiceScore;
    body.innerHTML = `<div class="card center pad">
      <div class="big">🎯</div><p>${t("practice_intro", { n })}</p>
      ${best ? `<p class="muted">${t("score")}: <b>${best}%</b></p>` : ""}
      <button class="btn primary big" data-nav="#/session/${id}">${best ? t("practice_again") : t("practice_start")}</button></div>`;
  }
  /* ── dialogue ── */
  function dialogue(body) {
    const d = u.dialogue, names = course.names(id);
    let showT = true, role = null;
    const drawD = () => {
      body.innerHTML = `<h3>${esc(bi(d.title))}</h3>
        <div class="row wrap">
          <button class="btn sm" id="playAll">▶ ${t("dialogue_listen")}</button>
          <button class="btn sm" id="togT">${showT ? t("hide_translation") : t("show_translation")}</button>
          ${sttSupported() ? Object.keys(d.roles).map((r) => `<button class="btn sm ${role === r ? "on" : ""}" data-role="${r}">🎭 ${esc(names[r] || r)}</button>`).join("") : ""}
        </div>
        ${role ? `<div class="notice">${t("dialogue_role", { who: esc(names[role] || role) })}</div>` : ""}
        <div class="dialog" id="dlg">${d.lines.map((l, i) => `<div class="line ${l.who === "A" ? "a" : "b"} ${role === l.who ? "mine" : ""}" data-i="${i}">
          <small class="who">${esc(names[l.who] || l.who)}</small>
          <div class="bubble">${tgt(course.text(l.id))}${say(course.text(l.id))}${showT ? `<div class="muted small tr">${esc(course.baseText(l.id))}</div>` : ""}
          ${role === l.who ? `<button class="micbtn sm" data-mic="${i}">🎤</button><div class="heard small" id="heard${i}"></div>` : ""}</div></div>`).join("")}</div>`;
      body.querySelector("#togT").onclick = () => { showT = !showT; drawD(); };
      body.querySelectorAll("[data-role]").forEach((b) => b.onclick = () => { role = role === b.dataset.role ? null : b.dataset.role; drawD(); });
      body.querySelector("#playAll").onclick = async () => {
        store.setUnitProg(code, id, "dialogue", role ? 1 : 0.6);
        for (const [i, l] of d.lines.entries()) {
          const el = body.querySelector(`.line[data-i="${i}"]`); if (!el) return;
          body.querySelectorAll(".line").forEach((x) => x.classList.remove("cur")); el.classList.add("cur"); el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          if (role === l.who) {
            const ok = await userLine(i, l); if (ok === null) return;
          } else { const ok = await speak(course.text(l.id), code, { prefs: course.ttsPrefs }); if (!ok && !body.isConnected) return; }
          await new Promise((r) => setTimeout(r, 300));
        }
        body.querySelectorAll(".line").forEach((x) => x.classList.remove("cur"));
        if (role) { store.setUnitProg(code, id, "dialogue", 1); toast(t("session_done")); }
      };
      body.querySelectorAll("[data-mic]").forEach((b) => b.onclick = () => userLine(+b.dataset.mic, d.lines[+b.dataset.mic]));
    };
    async function userLine(i, l) {
      const btn = body.querySelector(`[data-mic="${i}"]`), out = body.querySelector(`#heard${i}`);
      if (!btn) return null;
      btn.classList.add("on"); out.textContent = t("your_turn");
      try {
        const r = await listen(code, { locale: course.stt, onInterim: (s) => { out.textContent = s; } });
        const m = bestMatch(r, course.text(l.id));
        out.innerHTML = `${Math.round(m.score * 100)}% · ${esc(m.text)}`; out.className = `heard small ${m.score >= 0.75 ? "ok" : m.score >= 0.5 ? "almost" : "bad"}`;
        if (m.score >= 0.5) store.addXP(5, code);
        return m.score >= 0.5;
      } catch (e) { out.textContent = e.message === "denied" ? t("mic_denied") : t("try_again"); return false; }
      finally { btn.classList.remove("on"); }
    }
    drawD();
  }
  /* ── grammar ── */
  function grammar(body) {
    body.innerHTML = grammarHTML(course, u);
    store.setUnitProg(code, id, "grammar", 1);
  }
  /* ── speaking task ── */
  function speakTab(body) {
    const model = course.text(u.model.id);
    body.innerHTML = `<div class="card pad">
      <h3>🎤 ${t("speak_prompt")}</h3><p class="big">${esc(bi(u.speaking))}</p><p class="muted small">${t("speak_tip", { lang: course.name })}</p>
      <div class="center"><button class="micbtn" id="mic" ${sttSupported() ? "" : "disabled"}>🎤</button><div class="muted small" id="st">${sttSupported() ? t("tap_mic") : t("mic_unsupported")}</div></div>
      <div id="res"></div>
      <details class="model"><summary>${t("model_answer")}</summary><p>${tgt(model, "big")} ${say(model)} ${say(model, true)}</p><p class="muted">${esc(course.baseText(u.model.id))}</p></details></div>`;
    const mic = body.querySelector("#mic"), st = body.querySelector("#st"), res = body.querySelector("#res");
    mic.onclick = async () => {
      mic.classList.add("on"); st.textContent = t("listening");
      try {
        const r = await listen(code, { locale: course.stt, onInterim: (s) => { res.innerHTML = `<p>${esc(s)}</p>`; } });
        const sc = similarity(r.text, model);
        res.innerHTML = `<div class="notice"><b>${t("your_speech")}:</b> ${tgt(r.text)} ${say(r.text)}<div class="muted small" id="bt">…</div><div class="small">${t("pron_score")} (${t("model_answer").toLowerCase()}): ${Math.round(sc * 100)}%</div></div>`;
        store.setUnitProg(code, id, "speak", 1); store.addXP(15, code); st.textContent = t("tap_mic");
        try { const b = await translate(r.text, code, course.base); res.querySelector("#bt").textContent = `${t("back_translation")}: ${b.text}`; } catch { res.querySelector("#bt").textContent = ""; }
      } catch (e) { st.textContent = e.message === "denied" ? t("mic_denied") : e.message === "nospeech" ? t("try_again") : t("mic_unsupported"); }
      finally { mic.classList.remove("on"); }
    };
  }
  /* ── writing task ── */
  function write(body) {
    const model = course.text(u.model.id);
    body.innerHTML = `<div class="card pad">
      <h3>✍️ ${t("write_prompt")}</h3><p class="big">${esc(bi(u.writing))}</p><p class="muted small">${t("write_tip", { lang: course.name })}</p>
      <textarea class="input" id="wr" rows="5" lang="${code}" dir="${dir}" placeholder="${t("type_here")}">${esc(store.unitProg(code, id).writeText || "")}</textarea>
      <div class="row between"><span class="muted small" id="wc"></span><div class="row"><button class="btn" id="chk">${t("write_check")}</button>${aiAvailable() ? `<button class="btn primary" id="ai">✨ ${t("tutor_correct")}</button>` : ""}</div></div>
      <div id="out"></div>
      <details class="model"><summary>${t("model_answer")}</summary><p>${tgt(model, "big")} ${say(model)}</p><p class="muted">${esc(course.baseText(u.model.id))}</p></details></div>`;
    const ta = body.querySelector("#wr"), wc = body.querySelector("#wc"), out = body.querySelector("#out");
    const count = () => { wc.textContent = t("words_count", { n: ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0 }); };
    ta.oninput = () => { count(); const L = store.lang(code); L.unitProgress[id] = L.unitProgress[id] || {}; L.unitProgress[id].writeText = ta.value; store.save(); }; count();
    body.querySelector("#chk").onclick = async () => {
      if (!ta.value.trim()) return;
      out.innerHTML = `<div class="notice">${t("loading")}</div>`;
      try { const r = await translate(ta.value, code, course.base); out.innerHTML = `<div class="notice"><b>${t("back_translation")}:</b><br>${esc(r.text)}</div>`; store.setUnitProg(code, id, "write", 1); store.addXP(15, code); }
      catch { out.innerHTML = `<div class="notice bad">${t("tr_error")}</div>`; }
    };
    body.querySelector("#ai")?.addEventListener("click", async () => {
      if (!ta.value.trim()) return;
      out.innerHTML = `<div class="notice">${t("loading")}</div>`;
      try { const r = await correctWriting(course, ta.value); out.innerHTML = `<div class="notice ai">${r}</div>`; store.setUnitProg(code, id, "write", 1); store.addXP(15, code); }
      catch (e) { out.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; }
    });
  }

  draw(tab);
  return () => { cleanup?.(); stopSpeaking(); abortListening(); };
}

/* Practice session route: #/session/<unitId> */
export async function renderPracticeSession(view, course, id) {
  const u = unitById(id);
  if (!u) { location.hash = "#/"; return; }
  if (!(await prepare(view, course, u))) return;
  const exs = buildSession(course, u);
  const code = course.code;
  const cleanup = runSession(view, { course, exercises: exs, title: bi(u.title),
    onExit: () => { location.hash = `#/unit/${id}`; },
    onDone: ({ score, xp, secs }) => {
      store.setUnitProg(code, id, "practice", score >= 60 ? 1 : 0.5);
      const L = store.lang(code); L.unitProgress[id].practiceScore = Math.max(L.unitProgress[id].practiceScore || 0, score); store.save();
      view.innerHTML = `<div class="page center summary">
        <div class="huge">${score >= 90 ? "🏆" : score >= 60 ? "🎉" : "💪"}</div><h2>${t("session_done")}</h2>
        <div class="stat-row"><div class="stat"><b>${score}%</b><span>${t("score")}</span></div><div class="stat"><b>+${xp}</b><span>${t("xp")}</span></div><div class="stat"><b>${Math.round(secs / 60)}:${String(secs % 60).padStart(2, "0")}</b><span>⏱</span></div></div>
        <div class="row center"><button class="btn" data-nav="#/session/${id}">${t("practice_again")}</button><button class="btn primary" data-nav="#/unit/${id}">${t("continue_")}</button></div></div>`;
    } });
  return cleanup;
}

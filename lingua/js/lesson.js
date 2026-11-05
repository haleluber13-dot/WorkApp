/* Exercise player: runs a list of exercises, gives feedback, re-queues mistakes, updates spaced repetition. */
import { t, getUILang } from "./i18n.js";
import { esc, shuffle, toast, sfx } from "./ui.js";
import { speak, stopSpeaking, listen, abortListening, gradeTyped, similarity, bestMatch, sttSupported, normalize } from "./speech.js";
import { store } from "./store.js";
import { GRADE } from "./srs.js";
import { CONCEPTS } from "./curriculum.js";

export function runSession(root, { course, exercises, title = "", onDone, onExit, xpPer = 10 }) {
  const code = course.code, dir = course.dir;
  const queue = [...exercises];
  const results = {};          // id -> true/false (first attempt)
  let idx = 0, correctCount = 0, total = exercises.length, start = Date.now(), xp = 0;
  let cur = null, state = {}, checked = false, disposed = false;
  const uiDir = getUILang() === "he" ? "rtl" : "ltr";
  const tgt = (s, cls = "") => `<span class="tgt ${cls}" lang="${code}" dir="${dir}">${esc(s)}</span>`;
  const audioBtn = (text, slow = false) => `<button class="iconbtn speakbtn ${slow ? "slow" : ""}" data-say="${esc(text)}" ${slow ? 'data-slow="1"' : ""} title="${t(slow ? "slow" : "listen")}">${slow ? "🐢" : "🔊"}</button>`;

  root.innerHTML = `
  <div class="lesson" dir="${uiDir}">
    <header class="lesson__top">
      <button class="iconbtn" data-exit title="${t("close")}">✕</button>
      <div class="progress"><div class="progress__bar" style="width:0%"></div></div>
      <span class="lesson__title">${esc(title)}</span>
    </header>
    <section class="lesson__body" id="exbody"></section>
    <footer class="lesson__foot" id="exfoot">
      <div class="feedback" id="feedback"></div>
      <div class="row">
        <button class="btn ghost" id="btnSkip">${t("dont_know")}</button>
        <button class="btn primary big" id="btnCheck" disabled>${t("check")}</button>
      </div>
    </footer>
  </div>`;
  const body = root.querySelector("#exbody"), foot = root.querySelector("#exfoot"), fb = root.querySelector("#feedback");
  const btnCheck = root.querySelector("#btnCheck"), btnSkip = root.querySelector("#btnSkip"), bar = root.querySelector(".progress__bar");
  root.querySelector("[data-exit]").onclick = () => { cleanup(); onExit?.(); };
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-say]");
    if (s) { e.stopPropagation(); speak(s.dataset.say, code, { prefs: course.ttsPrefs, slow: !!s.dataset.slow }); }
  });
  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey && !(e.target.tagName === "TEXTAREA")) { if (!btnCheck.disabled) { e.preventDefault(); btnCheck.click(); } } };
  document.addEventListener("keydown", onKey);
  function cleanup() { disposed = true; stopSpeaking(); abortListening(); document.removeEventListener("keydown", onKey); }

  function setCheck(on) { btnCheck.disabled = !on; }
  function autoPlay(text, slow) { if (store.setting("autoAudio") && text) setTimeout(() => speak(text, code, { prefs: course.ttsPrefs, slow }), 150); }

  function next() {
    if (disposed) return;
    checked = false; fb.className = "feedback"; fb.innerHTML = "";
    btnCheck.textContent = t("check"); btnSkip.hidden = false; setCheck(false);
    bar.style.width = `${Math.round((100 * idx) / Math.max(queue.length, total))}%`;
    cur = queue[idx];
    if (!cur) return finish();
    state = {};
    render[cur.type]?.(cur);
  }

  /* ───────── renderers ───────── */
  const render = {
    pickT(ex) { renderPick(ex, { promptIsTarget: false, optionsTarget: true }); },
    pickB(ex) { renderPick(ex, { promptIsTarget: true, optionsTarget: false }); },
    listenPick(ex) { renderPick(ex, { listenOnly: true, optionsTarget: true }); autoPlay(ex.audio); },
    match(ex) {
      const left = shuffle(ex.pairs.map((p) => ({ id: p.id, text: p.a, side: "a" })));
      const right = shuffle(ex.pairs.map((p) => ({ id: p.id, text: p.b, side: "b" })));
      body.innerHTML = `<h2 class="ex__q">${t("ex_match")}</h2>
        <div class="match">
          <div class="match__col">${left.map((x) => `<button class="opt" data-id="${x.id}" data-side="a" lang="${code}" dir="${dir}">${esc(x.text)}</button>`).join("")}</div>
          <div class="match__col">${right.map((x) => `<button class="opt" data-id="${x.id}" data-side="b">${esc(x.text)}</button>`).join("")}</div>
        </div>`;
      btnSkip.hidden = true;
      let sel = null, matched = 0, mistakes = 0;
      body.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        if (b.classList.contains("ok")) return;
        if (b.dataset.side === "a") speak(b.textContent, code, { prefs: course.ttsPrefs });
        if (sel && sel.dataset.side === b.dataset.side) { sel.classList.remove("sel"); sel = b; b.classList.add("sel"); return; }
        if (!sel) { sel = b; b.classList.add("sel"); return; }
        if (sel.dataset.id === b.dataset.id) {
          sel.classList.remove("sel"); sel.classList.add("ok"); b.classList.add("ok"); sel = null; matched++; sfx("tick");
          if (matched === ex.pairs.length) { state.correct = mistakes <= 1; state.answerShown = ""; sfx("ok"); setTimeout(() => showResult(state.correct, ""), 250); }
        } else {
          mistakes++; sel.classList.add("shake"); b.classList.add("shake"); const a = sel; sel = null;
          setTimeout(() => { a.classList.remove("sel", "shake"); b.classList.remove("shake"); }, 400);
        }
      });
    },
    type(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_type", { lang: course.name })}</h2>
        <div class="ex__prompt">${esc(ex.prompt)}${ex.hint ? `<small class="muted"> · ${esc(ex.hint)}</small>` : ""}</div>
        <input class="input big" id="ans" lang="${code}" dir="${dir}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t("type_here")}">`;
      wireInput();
    },
    dictation(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_dictation")}</h2>
        <div class="ex__audio">${audioBtn(ex.audio)}${audioBtn(ex.audio, true)}</div>
        <input class="input big" id="ans" lang="${code}" dir="${dir}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t("type_here")}">`;
      wireInput(); autoPlay(ex.audio);
    },
    translateSent(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_translate_sent")}</h2><div class="ex__prompt">${esc(ex.prompt)}</div>
        <textarea class="input big" id="ans" rows="2" lang="${code}" dir="${dir}" autocapitalize="off" spellcheck="false" placeholder="${t("type_here")}"></textarea>`;
      wireInput();
    },
    order(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_order")}</h2><div class="ex__prompt">${esc(ex.prompt)} ${audioBtn(ex.audio)}</div>
        <div class="order__answer" id="oAns" lang="${code}" dir="${dir}"></div>
        <div class="order__bank" id="oBank" lang="${code}" dir="${dir}">${ex.tokens.map((w, i) => `<button class="chip" data-i="${i}">${esc(w)}</button>`).join("")}</div>`;
      const ans = body.querySelector("#oAns"), bank = body.querySelector("#oBank");
      body.onclick = (e) => {
        const c = e.target.closest(".chip"); if (!c || checked) return;
        (c.parentElement === bank ? ans : bank).appendChild(c);
        setCheck(ans.children.length > 0);
      };
    },
    gap(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_gap")}</h2>
        <div class="ex__prompt">${tgt(ex.prompt, "big")}</div><div class="muted">${esc(ex.translation)}</div>
        <div class="opts opts--chips">${ex.options.map((o) => `<button class="opt" data-val="${esc(o)}" lang="${code}" dir="${dir}">${esc(o)}</button>`).join("")}</div>`;
      body.querySelectorAll(".opt").forEach((b) => b.onclick = () => { if (checked) return; body.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); state.val = b.dataset.val; setCheck(true); });
    },
    speak(ex) {
      body.innerHTML = `<h2 class="ex__q">${t("ex_speak")}</h2>
        <div class="ex__prompt">${tgt(ex.prompt, "big")} ${audioBtn(ex.audio)}${audioBtn(ex.audio, true)}</div><div class="muted">${esc(ex.translation)}</div>
        <button class="micbtn" id="mic" aria-label="${t("speak")}">🎤</button>
        <div class="muted center" id="micStatus">${sttSupported() ? t("tap_mic") : t("mic_unsupported")}</div>
        <div class="heard" id="heard"></div>`;
      const mic = body.querySelector("#mic"), st = body.querySelector("#micStatus"), heard = body.querySelector("#heard");
      if (!sttSupported()) { mic.disabled = true; btnSkip.textContent = t("skip"); return; }
      mic.onclick = async () => {
        if (checked) return;
        mic.classList.add("on"); st.textContent = t("listening"); heard.textContent = "";
        try {
          const r = await listen(code, { locale: course.stt, onInterim: (s) => { heard.textContent = s; } });
          const m = bestMatch(r, ex.answer);
          heard.innerHTML = `${t("heard")}: ${tgt(m.text)}`;
          state.score = m.score; state.heard = m.text;
          st.textContent = `${t("pron_score")}: ${Math.round(m.score * 100)}%`;
          setCheck(true);
          if (m.score >= 0.75) { setTimeout(() => btnCheck.click(), 300); }
        } catch (e) {
          st.textContent = e.message === "denied" ? t("mic_denied") : e.message === "unsupported" ? t("mic_unsupported") : t("try_again");
        } finally { mic.classList.remove("on"); }
      };
      autoPlay(ex.audio);
    },
    flash(ex) {
      body.innerHTML = `<div class="flash" id="flash">
          <div class="flash__front">${tgt(ex.front, "huge")}<div>${audioBtn(ex.front)}${audioBtn(ex.front, true)}</div><div class="muted">${t("flip")}</div></div>
          <div class="flash__back" hidden><div class="muted small">${esc(ex.front)}</div><div class="flash__answer">${esc(ex.back)}</div></div>
        </div>
        <div class="grades" id="grades" hidden>
          <button class="btn bad" data-g="0">${t("again")}</button><button class="btn warn" data-g="1">${t("hard")}</button>
          <button class="btn good" data-g="2">${t("good")}</button><button class="btn primary" data-g="3">${t("easy")}</button>
        </div>`;
      foot.hidden = true;
      const flash = body.querySelector("#flash");
      flash.onclick = (e) => { if (e.target.closest("[data-say]")) return; flash.querySelector(".flash__back").hidden = false; flash.querySelector(".flash__front").classList.add("dim"); body.querySelector("#grades").hidden = false; };
      body.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => {
        const g = +b.dataset.g; store.grade(code, ex.id, g);
        results[ex.id] = g >= 2; if (g >= 2) correctCount++; xp += g >= 2 ? 5 : 2; store.addXP(g >= 2 ? 5 : 2, code);
        if (g === 0) queue.push({ ...ex, retry: true });
        idx++; foot.hidden = false; next();
      });
      autoPlay(ex.front);
    },
  };

  function renderPick(ex, { promptIsTarget, optionsTarget, listenOnly }) {
    const q = listenOnly ? t("ex_listen") : promptIsTarget ? t("ex_pick_b") : t("ex_pick_t");
    body.innerHTML = `<h2 class="ex__q">${q}</h2>
      <div class="ex__prompt">${listenOnly ? `<div class="ex__audio">${audioBtn(ex.audio)}${audioBtn(ex.audio, true)}</div>` : promptIsTarget ? `${tgt(ex.prompt, "big")} ${audioBtn(ex.audio)}` : `<span class="big">${esc(ex.prompt)}</span>`}</div>
      <div class="opts">${ex.options.map((o) => `<button class="opt" data-id="${o.id}" ${optionsTarget ? `lang="${code}" dir="${dir}"` : ""}>${esc(o.text)}</button>`).join("")}</div>`;
    body.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      if (checked) return;
      body.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); state.val = b.dataset.id; setCheck(true);
      if (optionsTarget && !listenOnly) speak(b.textContent, code, { prefs: course.ttsPrefs });
    });
    if (promptIsTarget) autoPlay(ex.audio);
  }
  function wireInput() {
    const inp = body.querySelector("#ans");
    inp.oninput = () => setCheck(inp.value.trim().length > 0);
    setTimeout(() => inp.focus(), 50);
  }

  /* ───────── checking ───────── */
  btnSkip.onclick = () => { if (checked) return; state.skipped = true; evaluate(true); };
  btnCheck.onclick = () => { if (checked) { idx++; next(); return; } evaluate(false); };

  function evaluate(skipped) {
    const ex = cur; let ok = false, almost = false, shown = ex.answer || "";
    if (skipped) ok = false;
    else switch (ex.type) {
      case "pickT": case "pickB": case "listenPick": ok = state.val === ex.answer; shown = ex.options.find((o) => o.id === ex.answer)?.text || ""; break;
      case "gap": ok = state.val === ex.answer; shown = ex.audio; break;
      case "type": { const g = gradeTyped(body.querySelector("#ans").value, ex.answer, { articles: course.articles }); ok = g !== "wrong"; almost = g === "almost"; break; }
      case "dictation": { const g = gradeTyped(body.querySelector("#ans").value, ex.answer); ok = g !== "wrong" || similarity(body.querySelector("#ans").value, ex.answer) >= 0.9; almost = ok && g !== "correct"; break; }
      case "translateSent": { const s = similarity(body.querySelector("#ans").value, ex.answer); ok = s >= 0.66; almost = ok && s < 0.9; break; }
      case "order": { const got = Array.from(body.querySelectorAll("#oAns .chip")).map((c) => c.textContent).join(ex.noSpaces ? "" : " "); ok = normalize(got, { keepAccents: true }) === normalize(ex.answer, { keepAccents: true }); almost = !ok && normalize(got) === normalize(ex.answer); ok = ok || almost; break; }
      case "speak": ok = (state.score || 0) >= 0.5; almost = ok && state.score < 0.75; shown = ex.answer; break;
      default: ok = !!state.correct;
    }
    if (ex.type === "pickT" || ex.type === "listenPick") body.querySelectorAll(".opt").forEach((b) => { if (b.dataset.id === ex.answer) b.classList.add("ok"); else if (b.classList.contains("sel")) b.classList.add("bad"); });
    if (ex.type === "pickB") body.querySelectorAll(".opt").forEach((b) => { if (b.dataset.id === ex.answer) b.classList.add("ok"); else if (b.classList.contains("sel")) b.classList.add("bad"); });
    if (ex.type === "gap") body.querySelectorAll(".opt").forEach((b) => { if (b.dataset.val === ex.answer) b.classList.add("ok"); else if (b.classList.contains("sel")) b.classList.add("bad"); });
    showResult(ok, shown, almost, skipped);
  }

  function showResult(ok, shown, almost = false, skipped = false) {
    checked = true; btnSkip.hidden = true; setCheck(true); btnCheck.textContent = t("continue_");
    const ex = cur;
    if (ex.id && !ex.retry && results[ex.id] === undefined) results[ex.id] = ok;
    if (ex.ids) for (const id of ex.ids) if (results[id] === undefined) results[id] = ok;
    if (ok) { correctCount++; const gain = ex.retry ? Math.round(xpPer / 2) : xpPer; xp += gain; store.addXP(gain, code); if (store.setting("sfx")) sfx("ok"); }
    else { if (store.setting("sfx")) sfx("bad"); if (!ex.retry) queue.push({ ...ex, retry: true, options: ex.options ? shuffle(ex.options) : undefined, tokens: ex.tokens ? shuffle(ex.tokens) : undefined }); }
    fb.className = `feedback on ${ok ? (almost ? "almost" : "ok") : "bad"}`;
    const showAns = shown && (!ok || almost || ex.type === "speak" || ex.type === "dictation");
    fb.innerHTML = `<b>${ok ? (almost ? t("almost") : ex.type === "speak" ? (state.score >= 0.9 ? t("good_pron") : t("ok_pron")) : t("correct")) : (skipped ? t("answer_was") : t("wrong"))}</b>
      ${showAns ? `<div class="feedback__ans">${!ok && !skipped ? `<span class="muted">${t("answer_was")}:</span> ` : ""}${tgt(shown)} ${audioBtn(shown)}</div>` : ""}
      ${(!ok || almost) && ex.type === "speak" && state.heard ? `<div class="muted small">${t("heard")}: ${esc(state.heard)}</div>` : ""}
      ${!ok && ex.type === "speak" ? `<div class="muted small">${t("bad_pron")}</div>` : ""}`;
    if (!ok && shown && ex.type !== "speak") speak(shown, code, { prefs: course.ttsPrefs });
    if (ex.type === "speak" && !sttSupported()) { /* nothing */ }
  }

  function finish() {
    const secs = Math.round((Date.now() - start) / 1000);
    const ids = Object.keys(results);
    for (const id of ids) {
      const c = CONCEPTS.get(id);
      if (c && (c.kind === "word" || c.kind === "phrase")) { store.addCard(code, id); store.grade(code, id, results[id] ? GRADE.good : GRADE.again); }
    }
    const score = total ? Math.round((100 * ids.filter((i) => results[i]).length) / Math.max(ids.length, 1)) : 100;
    if (store.setting("sfx")) sfx("done");
    cleanup();
    onDone?.({ score, xp, secs, results });
  }

  next();
  return cleanup;
}

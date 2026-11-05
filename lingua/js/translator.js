/* Translator: text + voice, any language pair, auto-detect, speak results, phrasebook, history, conversation mode. */
import { t, getUILang } from "./i18n.js";
import { LANGS, lang as langInfo, isRTL } from "./langs.js";
import { store } from "./store.js";
import { esc, toast } from "./ui.js";
import { translate, guessScript } from "./translate.js";
import { speak, stopSpeaking, listen, abortListening, sttSupported, ttsSupported } from "./speech.js";

const PREF_KEY = "linguapath.tr";
let prefs = { from: "auto", to: null, conv: false };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { /* ignore */ }
const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

const options = (sel, withAuto) => (withAuto ? `<option value="auto" ${sel === "auto" ? "selected" : ""}>🔍 ${t("tr_detect")}</option>` : "") + LANGS.map((l) => `<option value="${l.code}" ${sel === l.code ? "selected" : ""}>${l.flag} ${esc(l.native)} · ${esc(l.name)}</option>`).join("");

export async function renderTranslator(view) {
  const known = store.setting("known") || "en";
  if (!prefs.to) prefs.to = store.current && store.current !== known ? store.current : (known === "he" ? "en" : "es");
  let src = sessionStorage.getItem("tr.src") || "", result = null, busy = false, detected = null;
  const uiDir = getUILang() === "he" ? "rtl" : "ltr";

  const draw = () => {
    const from = prefs.from, to = prefs.to;
    const fromCode = from === "auto" ? (detected || known) : from;
    view.innerHTML = `<div class="page tr" dir="${uiDir}">
      <div class="page-h"><h2>🌐 ${t("tr_title")}</h2><button class="btn sm ${prefs.conv ? "on" : ""}" id="convBtn">🗣️ ${t("tr_conv")}</button></div>
      <div class="tr__langs">
        <select id="from" class="select" aria-label="${t("tr_from")}">${options(from, true)}</select>
        <button class="iconbtn" id="swap" title="${t("tr_swap")}">⇄</button>
        <select id="to" class="select" aria-label="${t("tr_to")}">${options(to, false)}</select>
      </div>
      ${prefs.conv ? `<p class="muted small">${t("tr_conv_tip")}</p>
        <div class="conv">
          <button class="convbtn" data-side="a">🎤<span>${esc(langInfo(fromCode).native)}</span></button>
          <button class="convbtn" data-side="b">🎤<span>${esc(langInfo(to).native)}</span></button>
        </div>
        <div class="convlog" id="convlog">${(view._convlog || []).map((x) => `<div class="msg ${x.side}"><div class="bubble"><div dir="auto">${esc(x.src)}</div><b dir="auto" lang="${x.to}">${esc(x.dst)}</b></div><button class="iconbtn speakbtn" data-say="${esc(x.dst)}" data-lang="${x.to}">🔊</button></div>`).join("")}</div>`
      : `<div class="tr__box">
          <textarea id="src" class="input tr__in" rows="4" dir="auto" placeholder="${t("tr_placeholder")}">${esc(src)}</textarea>
          <div class="row between">
            <div class="row">
              <button class="iconbtn ${sttSupported() ? "" : "dim"}" id="mic" title="${t("speak")}">🎤</button>
              <button class="iconbtn" id="sayIn" title="${t("listen")}" ${src ? "" : "disabled"}>🔊</button>
              <button class="iconbtn" id="clear" title="${t("tr_clear")}">✕</button>
            </div>
            <span class="muted small" id="det">${detected && from === "auto" ? t("tr_detected", { lang: langInfo(detected).name }) : ""}</span>
            <button class="btn primary" id="go">${t("tr_go")}</button>
          </div>
        </div>
        <div class="tr__out ${result ? "" : "empty"}" id="out">${result ? `
          <div class="tr__res" lang="${to}" dir="${isRTL(to) ? "rtl" : "ltr"}">${esc(result.text)}</div>
          <div class="row between wrap">
            <div class="row">
              <button class="iconbtn" data-say="${esc(result.text)}" data-lang="${to}" title="${t("listen")}">🔊</button>
              <button class="iconbtn" data-say="${esc(result.text)}" data-lang="${to}" data-slow="1" title="${t("slow")}">🐢</button>
              <button class="iconbtn" id="copy" title="${t("copy")}">⧉</button>
              <button class="iconbtn" id="save" title="${t("tr_save")}">＋📒</button>
            </div>
            <small class="muted">${result.offline ? t("tr_offline_dict") : result.provider ? t("tr_provider", { p: result.provider }) : ""}</small>
          </div>
          ${result.alts?.length ? `<div class="muted small">${t("tr_alt")}: ${result.alts.map((a) => `<button class="chip sm" data-alt="${esc(a)}" lang="${to}">${esc(a)}</button>`).join(" ")}</div>` : ""}` : `<span class="muted">${busy ? t("loading") : ""}</span>`}</div>
        <details class="hist"><summary>${t("tr_history")} <small class="muted">${store.s.trHistory.length}</small></summary>
          <div class="list">${store.s.trHistory.map((h, i) => `<button class="listitem" data-h="${i}"><div><div dir="auto">${esc(h.src)}</div><b dir="auto" lang="${h.to}">${esc(h.dst)}</b></div><small class="muted">${langInfo(h.from).flag}→${langInfo(h.to).flag}</small></button>`).join("")}</div>
          ${store.s.trHistory.length ? `<button class="btn sm" id="clearHist">${t("tr_clear")}</button>` : ""}</details>`}
      <label class="check small"><input type="checkbox" id="autoSay" ${store.setting("trAuto") ? "checked" : ""}> ${t("tr_autoplay")}</label>
    </div>`;
    view.querySelector("#from").onchange = (e) => { prefs.from = e.target.value; savePrefs(); detected = null; draw(); };
    view.querySelector("#to").onchange = (e) => { prefs.to = e.target.value; savePrefs(); if (src) run(); else draw(); };
    view.querySelector("#swap").onclick = () => { const f = prefs.from === "auto" ? (detected || known) : prefs.from; prefs.from = prefs.to; prefs.to = f; if (result) { src = result.text; result = null; } savePrefs(); draw(); if (src) run(); };
    view.querySelector("#convBtn").onclick = () => { prefs.conv = !prefs.conv; if (prefs.conv && prefs.from === "auto") prefs.from = known; savePrefs(); draw(); };
    view.querySelector("#autoSay").onchange = (e) => store.setting("trAuto", e.target.checked);
    if (prefs.conv) {
      view.querySelectorAll(".convbtn").forEach((b) => b.onclick = async () => {
        const side = b.dataset.side; const f = side === "a" ? fromCode : to, tt = side === "a" ? to : fromCode;
        if (!sttSupported()) return toast(t("mic_unsupported"));
        b.classList.add("on");
        try {
          const r = await listen(f);
          const tr = await translate(r.text, f, tt);
          (view._convlog ||= []).push({ side, src: r.text, dst: tr.text, to: tt });
          store.pushHistory({ from: f, to: tt, src: r.text, dst: tr.text, t: Date.now() });
          draw(); speak(tr.text, tt);
        } catch (e) { toast(e.message === "denied" ? t("mic_denied") : e.message === "nospeech" ? t("try_again") : t("tr_error")); b.classList.remove("on"); }
      });
      return;
    }
    const ta = view.querySelector("#src");
    let timer;
    ta.oninput = () => { src = ta.value; sessionStorage.setItem("tr.src", src); view.querySelector("#sayIn").disabled = !src; clearTimeout(timer); if (src.trim()) timer = setTimeout(run, 700); };
    ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } };
    view.querySelector("#go").onclick = run;
    view.querySelector("#clear").onclick = () => { src = ""; result = null; detected = null; sessionStorage.removeItem("tr.src"); draw(); view.querySelector("#src").focus(); };
    view.querySelector("#sayIn").onclick = () => speak(src, prefs.from === "auto" ? (detected || guessScript(src) || known) : prefs.from);
    view.querySelector("#mic").onclick = async () => {
      if (!sttSupported()) return toast(t("mic_unsupported"));
      const mic = view.querySelector("#mic"); mic.classList.add("on");
      const code = prefs.from === "auto" ? (detected || known) : prefs.from;
      try { const r = await listen(code, { onInterim: (s) => { ta.value = s; } }); src = r.text; ta.value = src; run(); }
      catch (e) { toast(e.message === "denied" ? t("mic_denied") : t("try_again")); }
      finally { mic.classList.remove("on"); }
    };
    view.querySelector("#copy")?.addEventListener("click", () => { navigator.clipboard?.writeText(result.text); toast(t("copied")); });
    view.querySelector("#save")?.addEventListener("click", () => {
      const learning = store.current;
      let tTxt, bTxt, code;
      if (to === learning) { tTxt = result.text; bTxt = src; code = learning; }
      else if (fromCode === learning) { tTxt = src; bTxt = result.text; code = learning; }
      else { tTxt = result.text; bTxt = src; code = to; if (!store.myLangs().includes(to)) store.lang(to); }
      toast(store.addPhrase(code, tTxt.trim(), bTxt.trim()) ? t("tr_saved") : t("tr_saved"));
    });
    view.querySelectorAll("[data-alt]").forEach((b) => b.onclick = () => { result = { ...result, text: b.dataset.alt, alts: result.alts.filter((a) => a !== b.dataset.alt).concat([result.text]) }; draw(); });
    view.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { const h = store.s.trHistory[+b.dataset.h]; src = h.src; prefs.from = h.from; prefs.to = h.to; savePrefs(); result = { text: h.dst, provider: "" }; draw(); });
    view.querySelector("#clearHist")?.addEventListener("click", () => { store.clearHistory(); draw(); });
  };

  async function run() {
    if (!src.trim() || busy) return;
    busy = true; const out = view.querySelector("#out"); if (out) out.innerHTML = `<span class="muted">${t("loading")}</span>`;
    try {
      const from = prefs.from === "auto" ? "auto" : prefs.from;
      const r = await translate(src, from, prefs.to);
      if (prefs.from === "auto") { detected = (r.detected && r.detected !== "auto" ? r.detected : guessScript(src)) || known; if (detected === prefs.to) { /* translating into the same language: swap target to the learner's language */ const alt = prefs.to === known ? (store.current || "en") : known; const r2 = await translate(src, detected, alt); prefs.to = alt; result = r2; } else result = r; }
      else result = r;
      store.pushHistory({ from: detected || from, to: prefs.to, src: src.trim(), dst: result.text, t: Date.now() });
      busy = false; draw();
      if (store.setting("trAuto") && ttsSupported()) speak(result.text, prefs.to);
    } catch (e) { busy = false; result = null; draw(); toast(t("tr_error")); }
  }
  draw();
  if (src.trim()) run();
  return () => { stopSpeaking(); abortListening(); };
}

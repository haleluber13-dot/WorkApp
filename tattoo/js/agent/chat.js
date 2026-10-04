// InkForm 3D — AI tattoo assistant chat UI.
//
//   import { mountAssistant } from "./agent/chat.js";
//   const assistant = mountAssistant(document.body, app);
//   assistant.open(); assistant.say("Hi!");
//
// Two engines share one UI: the offline rule-based interpreter (local.js, default)
// and Claude (claude.js) when the user picks it in Settings and enters an API key.

import { createLocalEngine } from "./local.js";
import { createClaudeEngine, ClaudeError } from "./claude.js";

const LS_CHAT = "inkform.assistant.chat.v1";
const MAX_SAVED = 50;
const CSS_URL = new URL("./agent.css", import.meta.url).href;

const ICON = {
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" fill="currentColor"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.7a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="currentColor" transform="translate(-1 0)"/></svg>',
};

function ensureCss() {
  if (document.querySelector(`link[data-ink-assistant-css]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = CSS_URL; l.dataset.inkAssistantCss = "1";
  document.head.appendChild(l);
}

function el(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  if (html != null) e.innerHTML = html;
  return e;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Tiny formatter: escape, then **bold**, line breaks, bullets.
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

export function mountAssistant(container, app) {
  ensureCss();
  container = container || document.body;
  const getSetting = (k) => { try { return app.getSetting ? app.getSetting(k) : undefined; } catch { return undefined; } };
  const setSetting = (k, v) => { try { app.setSetting && app.setSetting(k, v); } catch {} };

  const local = createLocalEngine(app);
  const claude = createClaudeEngine(app, { getSetting });

  /* ── DOM ── */
  const root = el("div", { class: "ink-assistant" });
  const fab = el("button", { class: "ia-fab", type: "button", "aria-label": "Open the AI tattoo assistant", "aria-expanded": "false", "aria-controls": "ia-panel" }, '<span class="ia-fab-star" aria-hidden="true">✦</span><span>AI</span>');
  const panel = el("section", { class: "ia-panel", id: "ia-panel", role: "dialog", "aria-label": "AI tattoo assistant", "aria-hidden": "true" });
  panel.innerHTML = `
    <div class="ia-grab" aria-hidden="true"></div>
    <header class="ia-head">
      <div class="ia-title"><span class="ia-logo" aria-hidden="true">✦</span><div><div class="ia-name">Tattoo assistant</div><button type="button" class="ia-badge" title="Assistant settings"></button></div></div>
      <div class="ia-head-btns">
        <button type="button" class="ia-icon ia-settings-btn" aria-label="Assistant settings">${ICON.gear}</button>
        <button type="button" class="ia-icon ia-clear" aria-label="Clear chat">${ICON.trash}</button>
        <button type="button" class="ia-icon ia-close" aria-label="Close assistant">${ICON.close}</button>
      </div>
    </header>
    <div class="ia-settings" hidden>
      <div class="ia-set-row"><span>Assistant brain</span>
        <div class="ia-seg" role="radiogroup" aria-label="Assistant brain">
          <button type="button" role="radio" data-engine="local">Built-in</button>
          <button type="button" role="radio" data-engine="claude">Claude</button>
        </div></div>
      <label class="ia-set-row ia-claude-only"><span>Anthropic API key</span><input type="password" class="ia-key" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <label class="ia-set-row ia-claude-only"><span>Model</span><select class="ia-model">
        <option value="claude-opus-5-5">Claude Opus 5.5 (best)</option>
        <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (faster)</option>
        <option value="claude-haiku-4-5">Claude Haiku 4.5 (fastest)</option>
        <option value="claude-fable-5-1">Claude Fable 5.1 (most capable)</option>
      </select></label>
      <label class="ia-set-row ia-claude-only"><span>Thinking effort</span><select class="ia-effort">
        <option value="low">Low (quick)</option><option value="medium">Medium</option><option value="high">High (careful)</option>
      </select></label>
      <p class="ia-note ia-claude-only">Your key is stored only on this device and sent only to Anthropic.</p>
      <button type="button" class="ia-done-set">Done</button>
    </div>
    <div class="ia-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div>
    <div class="ia-chips" role="group" aria-label="Suggestions"></div>
    <form class="ia-form" autocomplete="off">
      <textarea class="ia-input" rows="1" placeholder="Describe a tattoo or a change…" aria-label="Message the assistant" enterkeyhint="send"></textarea>
      <button type="button" class="ia-mic" aria-label="Speak" hidden>${ICON.mic}</button>
      <button type="submit" class="ia-send" aria-label="Send">${ICON.send}</button>
    </form>`;
  root.append(fab, panel);
  container.appendChild(root);

  const $ = (s) => panel.querySelector(s);
  const log = $(".ia-log"), input = $(".ia-input"), chipsBox = $(".ia-chips"), form = $(".ia-form");
  const badge = $(".ia-badge"), micBtn = $(".ia-mic"), sendBtn = $(".ia-send");
  const settingsBox = $(".ia-settings");

  /* ── state ── */
  let messages = loadChat();
  let busy = false;
  let isOpen = false;

  function loadChat() {
    try { const a = JSON.parse(localStorage.getItem(LS_CHAT) || "[]"); return Array.isArray(a) ? a.slice(-MAX_SAVED) : []; } catch { return []; }
  }
  function saveChat() {
    try { localStorage.setItem(LS_CHAT, JSON.stringify(messages.filter((m) => !m.transient).slice(-MAX_SAVED).map(({ role, text, ts, engine, note }) => ({ role, text, ts, engine, note })))); } catch {}
  }

  function engineName() {
    const want = getSetting("ai.engine") === "claude";
    const key = String(getSetting("ai.apiKey") || "").trim();
    return want && key ? "claude" : "local";
  }
  function refreshBadge() {
    const e = engineName();
    badge.textContent = e === "claude" ? "Claude" : "Local · offline";
    badge.classList.toggle("is-claude", e === "claude");
    if (getSetting("ai.engine") === "claude" && e !== "claude") badge.textContent = "Local · add API key";
  }

  /* ── rendering ── */
  function bubble(m) {
    const row = el("div", { class: `ia-msg ia-${m.role}${m.error ? " ia-error" : ""}` });
    const b = el("div", { class: "ia-bubble" });
    b.innerHTML = fmt(m.text || "");
    if (m.note) b.appendChild(el("div", { class: "ia-note-inline" }, esc(m.note)));
    if (m.image) {
      const a = el("a", { href: m.image, download: "inkform-tattoo.png", class: "ia-shot", title: "Save image" });
      a.appendChild(el("img", { src: m.image, alt: "Snapshot of the 3D view" }));
      b.appendChild(a);
    }
    row.appendChild(b);
    return row;
  }
  function renderAll() {
    log.innerHTML = "";
    if (!messages.length) {
      log.appendChild(el("div", { class: "ia-empty" }, `<div class="ia-empty-mark" aria-hidden="true">✦</div><p><strong>Hi! I'm your tattoo assistant.</strong></p><p>Tell me what you'd like inked and where — I'll put it on the body right away. You can type or tap the mic.</p>`));
      setChips(["Geometric wolf on my left forearm", "Small rose behind my right ear", "Mandala on my upper back", "What can you do?"]);
    } else {
      for (const m of messages) log.appendChild(bubble(m));
    }
    scrollDown();
  }
  function scrollDown() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
  function push(m) {
    m.ts = m.ts || Date.now();
    messages.push(m);
    if (messages.length > MAX_SAVED * 2) messages = messages.slice(-MAX_SAVED);
    const empty = log.querySelector(".ia-empty");
    if (empty) empty.remove();
    const node = bubble(m);
    log.appendChild(node);
    saveChat();
    scrollDown();
    return node;
  }
  function setChips(list) {
    chipsBox.innerHTML = "";
    if (getSetting("ai.suggestions") === false || !list || !list.length) { chipsBox.hidden = true; return; }
    chipsBox.hidden = false;
    for (const c of list.slice(0, 6)) {
      chipsBox.appendChild(el("button", { type: "button", class: "ia-chip", onclick: () => send(c) }, esc(c)));
    }
  }
  function showTyping() {
    const t = el("div", { class: "ia-msg ia-assistant ia-typing-row", "aria-hidden": "true" }, '<div class="ia-bubble ia-typing"><span></span><span></span><span></span></div>');
    log.appendChild(t); scrollDown();
    return t;
  }

  /* ── sending ── */
  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return null;
    busy = true;
    panel.classList.add("is-busy");
    sendBtn.disabled = true;
    input.value = ""; autosize();
    push({ role: "user", text });
    setChips([]);
    const typing = showTyping();
    let result;
    const engine = engineName();
    try {
      if (engine === "claude") result = await sendClaude(text, typing);
      else {
        const t0 = performance.now();
        result = await local.handle(text);
        // A breath of "typing" so instant replies don't feel abrupt.
        const wait = 160 - (performance.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    } catch (e) {
      console.warn("[assistant]", e);
      result = { reply: "Sorry — something went wrong there. Could you try again?", chips: [] };
    }
    typing.remove();
    const msg = { role: "assistant", text: result.reply, engine: result.engine || engine, note: result.note, image: result.image, transient: !!result.image };
    if (result.liveNode) { result.liveNode.replaceWith(bubble(msg)); messages.push(msg); saveChat(); scrollDown(); }
    else push(msg);
    setChips(result.chips || []);
    speak(result.reply);
    busy = false;
    panel.classList.remove("is-busy");
    sendBtn.disabled = false;
    refreshBadge();
    return result;
  }

  async function sendClaude(text, typing) {
    // Live bubble with streamed text + subtle tool activity line.
    const live = el("div", { class: "ia-msg ia-assistant" });
    const lb = el("div", { class: "ia-bubble" });
    const act = el("div", { class: "ia-activity" });
    const txt = el("div", { class: "ia-live-text" });
    lb.append(act, txt); live.appendChild(lb);
    let shown = false;
    const show = () => { if (!shown) { typing.replaceWith(live); shown = true; scrollDown(); } };
    const acts = new Map();
    let progress = "";
    try {
      const r = await claude.handle(text, {
        onActivity(label, status, tool) {
          show();
          let item = status === "start" ? null : acts.get(tool + label);
          if (!item) {
            item = el("span", { class: "ia-act" });
            act.appendChild(item);
            acts.set(tool + label, item);
          }
          item.className = `ia-act is-${status}`;
          item.textContent = status === "start" ? `${label}…` : status === "done" ? `${label} ✓` : `${label} ✗`;
          scrollDown();
        },
        onProgress(delta) {
          progress += delta;
          const line = progress.trim().split("\n").filter(Boolean).pop();
          if (line) { show(); txt.innerHTML = `<span class="ia-progress">${esc(line.slice(0, 160))}</span>`; }
        },
        onText(full) { show(); txt.innerHTML = fmt(full); scrollDown(); },
      });
      if (!shown) typing.replaceWith(live);
      return { reply: r.reply, chips: chipsAfter(r), engine: "claude", liveNode: live };
    } catch (e) {
      if (shown) live.remove();
      const why = e instanceof ClaudeError ? e.message : "Claude couldn't answer.";
      if (e && e.cause) console.warn("[assistant] Claude error", e.cause);
      // Fall back to the offline engine for this message.
      const r = await local.handle(text);
      return { ...r, engine: "local", note: `${why} I used the built-in assistant for this one.` };
    }
  }
  function chipsAfter(r) {
    const has = (() => { try { return (app.getState().tattoos || []).length > 0; } catch { return false; } })();
    if (r.refusal) return ["What can you do?"];
    return has ? ["Bigger", "Smaller", "Rotate it a bit", "Mirror to the other side", "Show me the back"] : ["Geometric wolf on my left forearm", "Small rose behind my right ear"];
  }

  /* ── speech ── */
  function speak(text) {
    if (getSetting("ai.speak") !== true || !("speechSynthesis" in window) || !text) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[✦•“”]/g, "")); u.rate = 1.05; speechSynthesis.speak(u); } catch {}
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function setupMic() {
    micBtn.hidden = !SR || getSetting("ai.voice") === false;
  }
  micBtn.innerHTML = ICON.mic;
  micBtn.addEventListener("click", () => {
    if (!SR) return;
    if (listening) { try { rec.stop(); } catch {} return; }
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      input.value = (finalText + interim).trim(); autosize();
    };
    rec.onerror = () => {};
    rec.onend = () => {
      listening = false; micBtn.classList.remove("is-on"); micBtn.setAttribute("aria-label", "Speak");
      if (finalText.trim()) send(finalText.trim());
    };
    try { rec.start(); listening = true; micBtn.classList.add("is-on"); micBtn.setAttribute("aria-label", "Stop listening"); } catch { listening = false; }
  });

  /* ── input ── */
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); if (!settingsBox.hidden) toggleSettings(false); else close(); }
  });

  /* ── header buttons ── */
  $(".ia-close").addEventListener("click", () => close());
  $(".ia-clear").addEventListener("click", () => {
    messages = []; saveChat(); claude.reset(); local.reset(); renderAll(); input.focus();
  });
  function toggleSettings(show = settingsBox.hidden) {
    settingsBox.hidden = !show;
    $(".ia-settings-btn").setAttribute("aria-expanded", String(show));
    if (show) syncSettingsForm();
  }
  $(".ia-settings-btn").addEventListener("click", () => toggleSettings());
  badge.addEventListener("click", () => toggleSettings(true));
  $(".ia-done-set").addEventListener("click", () => { toggleSettings(false); input.focus(); });
  function syncSettingsForm() {
    const eng = getSetting("ai.engine") === "claude" ? "claude" : "local";
    for (const b of settingsBox.querySelectorAll("[data-engine]")) {
      b.setAttribute("aria-checked", String(b.dataset.engine === eng));
      b.classList.toggle("is-on", b.dataset.engine === eng);
    }
    settingsBox.classList.toggle("is-claude", eng === "claude");
    $(".ia-key").value = getSetting("ai.apiKey") || "";
    $(".ia-model").value = getSetting("ai.model") || "claude-opus-5-5";
    $(".ia-effort").value = getSetting("ai.effort") || "medium";
  }
  for (const b of settingsBox.querySelectorAll("[data-engine]")) b.addEventListener("click", () => { setSetting("ai.engine", b.dataset.engine); syncSettingsForm(); refreshBadge(); });
  $(".ia-key").addEventListener("change", (e) => {
    const v = e.target.value.trim();
    setSetting("ai.apiKey", v);
    if (v) setSetting("ai.engine", "claude");
    syncSettingsForm(); refreshBadge();
  });
  $(".ia-model").addEventListener("change", (e) => { setSetting("ai.model", e.target.value); refreshBadge(); });
  $(".ia-effort").addEventListener("change", (e) => setSetting("ai.effort", e.target.value));

  /* ── open / close ── */
  function open() {
    if (isOpen) return;
    isOpen = true;
    root.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    refreshBadge(); setupMic();
    if (!log.childElementCount) renderAll();
    setTimeout(() => input.focus({ preventScroll: true }), 60);
    scrollDown();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
    if (listening) { try { rec.stop(); } catch {} }
    fab.focus({ preventScroll: true });
  }
  function toggle() { isOpen ? close() : open(); }
  fab.addEventListener("click", toggle);

  renderAll();
  refreshBadge();
  setupMic();

  return {
    open, close, toggle,
    /** Post an assistant message (e.g. a tip from the app). */
    say(text, chips) { push({ role: "assistant", text: String(text), engine: "app" }); if (chips) setChips(chips); },
    /** Send a message as if the user typed it; resolves with { reply, chips }. */
    send,
    get isOpen() { return isOpen; },
    element: root,
    engines: { local, claude },
  };
}

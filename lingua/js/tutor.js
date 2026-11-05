/* Optional AI tutor: free conversation and writing correction through the Claude API, with the learner's own key.
   Everything runs in the browser; the key never leaves this device except to api.anthropic.com. */
import { store } from "./store.js";
import { t, getUILang } from "./i18n.js";
import { esc } from "./ui.js";

const MODEL = "claude-opus-5-5";
export const aiAvailable = () => !!(store.setting("aiKey") || "").trim();

async function ask(system, messages, maxTokens = 1500) {
  const key = (store.setting("aiKey") || "").trim();
  if (!key) throw new Error(t("tutor_need_key"));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01", "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, fallbacks: "default", output_config: { effort: "low" }, system, messages }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || `API error ${r.status}`); }
  const j = await r.json();
  if (j.stop_reason === "refusal") throw new Error(j.stop_details?.explanation || "The tutor declined this request.");
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

const baseName = (course) => (course.base === "he" ? "Hebrew" : "English");
const levelOf = (course) => store.lang(course.code).start;

function tutorSystem(course) {
  return `You are a warm, encouraging ${course.info.name} tutor for a learner whose native language is ${baseName(course)} and whose level is about ${levelOf(course)} (CEFR). Converse in ${course.info.name}, keeping vocabulary and grammar at the learner's level. Keep replies short (2–4 sentences) and always end with a question to keep the conversation going. When the learner makes a mistake, first reply naturally, then add one line starting with "✏️" showing the corrected sentence, and one short line starting with "💡" explaining the mistake in ${baseName(course)}. If the learner writes in ${baseName(course)} because they are stuck, reply with the ${course.info.name} they need plus its ${baseName(course)} meaning.`;
}

export async function chat(course, history) {
  return ask(tutorSystem(course), history.map((m) => ({ role: m.role, content: m.text })), 1000);
}

export async function correctWriting(course, text) {
  const out = await ask(
    `You are a ${course.info.name} writing teacher. The learner (native ${baseName(course)}, level ${levelOf(course)}) wrote a short text. Reply in ${baseName(course)} using exactly this structure with these headings: "✅ Corrected version:" followed by the corrected ${course.info.name} text; "✏️ Corrections:" a short list, each item "wrong → right — reason"; "⭐ What you did well:" one sentence; "🎯 Next step:" one concrete tip. Be kind and concise.`,
    [{ role: "user", content: text }], 1500);
  return esc(out).replace(/\n/g, "<br>");
}

/* Tutor chat view */
export function renderTutor(view, course) {
  const code = course.code;
  const history = [];
  const topics = course.base === "he"
    ? ["ספרו לי על היום שלכם", "מה אוהבים לאכול?", "תכניות לסוף השבוע", "העבודה או הלימודים שלכם", "טיול שעשיתם"]
    : ["Tell me about your day", "What do you like to eat?", "Plans for the weekend", "Your work or studies", "A trip you took"];
  view.innerHTML = `<div class="page tutor">
    <div class="page-h"><button class="iconbtn" data-nav="#/practice">←</button><h2>✨ ${t("tutor_title")}</h2></div>
    ${aiAvailable() ? `<p class="muted small">${t("tutor_intro", { lang: course.name })}</p>
    <div class="chat" id="chat"></div>
    <div class="row wrap" id="topics">${topics.map((x) => `<button class="chip" data-topic="${esc(x)}">${esc(x)}</button>`).join("")}</div>
    <form class="row" id="f"><input class="input" id="msg" lang="${code}" dir="${course.dir}" placeholder="${t("type_here")}" autocomplete="off"><button class="iconbtn" id="mic" type="button">🎤</button><button class="btn primary" type="submit">${t("tutor_send")}</button></form>`
    : `<div class="notice">${t("tutor_need_key")} <a href="#/me" class="btn sm">${t("settings")}</a></div>`}
  </div>`;
  if (!aiAvailable()) return;
  const chatEl = view.querySelector("#chat"), form = view.querySelector("#f"), inp = view.querySelector("#msg");
  const add = (role, text) => {
    const d = document.createElement("div"); d.className = `msg ${role}`;
    d.innerHTML = `<div class="bubble" lang="${role === "assistant" ? code : ""}" dir="auto">${esc(text).replace(/\n/g, "<br>")}</div>${role === "assistant" ? `<button class="iconbtn speakbtn" data-say="${esc(text.split("\n")[0])}">🔊</button>` : ""}`;
    chatEl.appendChild(d); chatEl.scrollTop = chatEl.scrollHeight;
  };
  const send = async (text) => {
    text = text.trim(); if (!text) return;
    inp.value = ""; add("user", text); history.push({ role: "user", text });
    const wait = document.createElement("div"); wait.className = "msg assistant"; wait.innerHTML = `<div class="bubble muted">…</div>`; chatEl.appendChild(wait);
    try { const reply = await chat(course, history); wait.remove(); history.push({ role: "assistant", text: reply }); add("assistant", reply); store.addXP(5, code); }
    catch (e) { wait.remove(); add("assistant", `⚠️ ${e.message}`); history.pop(); }
  };
  form.onsubmit = (e) => { e.preventDefault(); send(inp.value); };
  view.querySelectorAll("[data-topic]").forEach((b) => b.onclick = () => send(b.dataset.topic));
  view.querySelector("#mic").onclick = async () => {
    const { listen } = await import("./speech.js");
    const mic = view.querySelector("#mic"); mic.classList.add("on");
    try { const r = await listen(code, { locale: course.stt, onInterim: (s) => { inp.value = s; } }); send(r.text); } catch { /* ignore */ } finally { mic.classList.remove("on"); }
  };
  send(course.base === "he" ? `שלום! בואו נתרגל ${course.info.name}. התחילו בברכה.` : `Hello! Let's practice ${course.info.name}. Please greet me and ask my name.`);
  chatEl.firstChild?.remove(); history.shift();   // hide the kickoff instruction, keep the tutor's reply
}

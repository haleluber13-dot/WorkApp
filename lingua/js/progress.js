/* Progress & settings. */
import { t, bi, levelName } from "./i18n.js";
import { LANGS, lang as langInfo } from "./langs.js";
import { store } from "./store.js";
import { esc, fmtMin, pct, confirm as ask, toast } from "./ui.js";
import { UNITS, LEVELS, estimatedLevel } from "./curriculum.js";
import { voicesFor, speak, ttsSupported } from "./speech.js";
import { renderOnboarding, relocalize, canInstall, doInstall, ctx } from "./app.js";

export function renderMe(view, { applyTheme, refresh }) {
  const code = store.current, L = store.lang(code);
  const stats = store.cardStats(code);
  const days = store.lastDays(14), maxSec = Math.max(60, ...days.map((d) => d.sec));
  const total = store.totalSec(), streak = store.streak(), best = store.setting("bestStreak");
  const doneUnits = UNITS.filter((u) => store.unitDone(code, u.id)).length;
  const lvl = estimatedLevel(code);
  const badges = [
    ["🌱", "First lesson", "שיעור ראשון", doneUnits >= 1], ["📚", "5 units", "5 יחידות", doneUnits >= 5], ["🎓", "A1 complete", "A1 הושלם", UNITS.filter((u) => u.level === "A1").every((u) => store.unitDone(code, u.id))],
    ["🔥", "7-day streak", "רצף 7 ימים", best >= 7], ["💯", "100 words", "100 מילים", stats.learned >= 100], ["🏆", "500 words", "500 מילים", stats.learned >= 500],
    ["⏱", "10 hours", "10 שעות", total >= 36000], ["🗣️", "Polyglot: 2 languages", "פוליגלוט: 2 שפות", store.myLangs().length >= 2], ["⭐", "1000 XP", "1000 נק׳", L.xp >= 1000],
  ];
  const wd = t("weekday").split("|");
  const voices = ttsSupported() ? voicesFor(code, ctx.course?.ttsPrefs) : [];
  const S = store.setting.bind(store);
  view.innerHTML = `<div class="page me">
    <div class="page-h"><h2>👤 ${t("progress")} · ${langInfo(code).flag} ${esc(langInfo(code).native)}</h2></div>
    <div class="stat-row">
      <div class="stat"><b>🔥 ${streak}</b><span>${t("streak")}</span></div><div class="stat"><b>${L.xp}</b><span>${t("xp")}</span></div>
      <div class="stat"><b>${stats.learned}</b><span>${t("words_learned")}</span></div><div class="stat"><b>${fmtMin(total)}</b><span>${t("time_total")}</span></div>
      <div class="stat"><b>${doneUnits}/${UNITS.length}</b><span>${t("unit")}</span></div><div class="stat"><b>${lvl}</b><span>${t("level_est")}</span></div>
    </div>
    <section class="card pad"><h3>${t("last_days")}</h3>
      <div class="chart">${days.map((d) => `<div class="chart__col" title="${d.day}: ${Math.round(d.sec / 60)} ${t("min")}"><i style="height:${Math.max(3, Math.round((100 * d.sec) / maxSec))}%" class="${d.sec >= store.setting("goalMin") * 60 ? "goal" : ""}"></i><small>${wd[d.dow]}</small></div>`).join("")}</div></section>
    <section class="card pad"><h3>${t("badges")}</h3><div class="badges">${badges.map(([ic, en, he, on]) => `<div class="badge ${on ? "on" : ""}"><span>${ic}</span><small>${esc(store.setting("ui") === "he" ? he : en)}</small></div>`).join("")}</div></section>
    <section class="card pad"><h3>${t("my_langs")}</h3>
      <div class="list">${store.myLangs().map((c) => `<div class="listitem ${c === code ? "sel" : ""}"><span>${langInfo(c).flag}</span><div><b>${esc(langInfo(c).native)}</b><small class="muted">${store.lang(c).xp} ${t("xp")} · ${UNITS.filter((u) => store.unitDone(c, u.id)).length}/${UNITS.length}</small></div>${c !== code ? `<button class="btn sm" data-switch="${c}">${t("start")}</button>` : ""}<button class="iconbtn" data-rm="${c}" title="${t("delete_")}">🗑</button></div>`).join("")}</div>
      <button class="btn wide" id="addLang">＋ ${t("add_lang")}</button></section>

    <h2 class="h2">⚙️ ${t("settings")}</h2>
    <section class="card pad settings">
      <label class="srow"><span>${t("s_ui")}</span><select data-s="ui"><option value="en" ${S("ui") === "en" ? "selected" : ""}>English</option><option value="he" ${S("ui") === "he" ? "selected" : ""}>עברית</option></select></label>
      <label class="srow"><span>${t("ob_know")}</span><select data-s="known"><option value="en" ${S("known") === "en" ? "selected" : ""}>English</option><option value="he" ${S("known") === "he" ? "selected" : ""}>עברית</option></select></label>
      <label class="srow"><span>${t("s_theme")}</span><select data-s="theme">${[["auto", "th_auto"], ["dark", "th_dark"], ["light", "th_light"]].map(([v, k]) => `<option value="${v}" ${S("theme") === v ? "selected" : ""}>${t(k)}</option>`).join("")}</select></label>
      <label class="srow"><span>${t("s_goal")}</span><select data-s="goalMin" data-num>${[5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${S("goalMin") === m ? "selected" : ""}>${m} ${t("min")}</option>`).join("")}</select></label>
      <label class="srow"><span>${t("s_rate")}</span><input type="range" min="0.6" max="1.3" step="0.1" value="${S("rate")}" data-s="rate" data-num></label>
      <label class="srow"><span>${t("s_voice")} (${esc(langInfo(code).native)})</span><select data-voice>${voices.length ? voices.map((v) => `<option value="${esc(v.voiceURI)}" ${S("voices")[code] === v.voiceURI ? "selected" : ""}>${esc(v.name)} (${v.lang})</option>`).join("") : `<option>—</option>`}</select></label>
      ${!voices.length && ttsSupported() ? `<p class="notice small">${t("voices_none", { lang: langInfo(code).name })}</p>` : ""}
      <label class="srow"><span>${t("s_auto_audio")}</span><input type="checkbox" data-s="autoAudio" ${S("autoAudio") ? "checked" : ""}></label>
      <label class="srow"><span>${t("s_sounds")}</span><input type="checkbox" data-s="sfx" ${S("sfx") ? "checked" : ""}></label>
      <label class="srow"><span>${t("s_typing")}</span><input type="checkbox" data-s="typing" ${S("typing") ? "checked" : ""}></label>
      <label class="srow"><span>${t("s_speaking")}</span><input type="checkbox" data-s="speaking" ${S("speaking") ? "checked" : ""}></label>
    </section>
    <section class="card pad settings"><h3>🌐 ${t("s_provider")}</h3>
      <label class="srow"><span>${t("s_provider")}</span><select data-s="provider">${[["auto", t("s_provider_auto")], ["google", "Google"], ["mymemory", "MyMemory"], ["lingva", "Lingva"]].map(([v, n]) => `<option value="${v}" ${S("provider") === v ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="scol"><span>${t("s_deepl")}</span><input class="input" type="password" data-s="deeplKey" value="${esc(S("deeplKey"))}" autocomplete="off"></label>
      <label class="scol"><span>${t("s_libre")}</span><input class="input" type="url" data-s="libreUrl" value="${esc(S("libreUrl"))}" placeholder="https://libretranslate.example.com"></label>
      <label class="scol"><span>${t("s_libre_key")}</span><input class="input" type="password" data-s="libreKey" value="${esc(S("libreKey"))}" autocomplete="off"></label>
    </section>
    <section class="card pad settings"><h3>✨ ${t("s_ai")}</h3>
      <label class="scol"><span>${t("s_ai_key")}</span><input class="input" type="password" data-s="aiKey" value="${esc(S("aiKey"))}" placeholder="sk-ant-…" autocomplete="off"></label>
    </section>
    <section class="card pad settings"><h3>💾 ${t("s_data")}</h3>
      <div class="row wrap"><button class="btn" id="exp">⬇ ${t("export_")}</button><label class="btn">⬆ ${t("import_")}<input type="file" id="imp" accept="application/json" hidden></label>
      ${canInstall() ? `<button class="btn" id="inst">📲 ${t("install")}</button>` : ""}<button class="btn danger" id="reset">🗑 ${t("reset")}</button></div>
    </section>
    <p class="muted small center">LinguaPath · ${LANGS.length} ${t("all_langs").toLowerCase()}</p>
  </div>`;

  view.querySelectorAll("[data-s]").forEach((el) => el.onchange = () => {
    const k = el.dataset.s; let v = el.type === "checkbox" ? el.checked : el.value; if (el.dataset.num) v = +v;
    store.setting(k, v);
    if (k === "ui") { relocalize(); refresh(); }
    if (k === "known") { ctx.course = null; refresh(); }
    if (k === "theme") applyTheme();
    if (k === "rate") speak(ctx.course ? ctx.course.text(UNITS[0].vocab[0].id) || "Hola" : "Hola", code);
  });
  view.querySelector("[data-voice]").onchange = (e) => { const v = { ...store.setting("voices"), [code]: e.target.value }; store.setting("voices", v); speak(ctx.course?.text(UNITS[0].phrases[0].id) || "Hello", code); };
  view.querySelectorAll("[data-switch]").forEach((b) => b.onclick = () => { store.setCurrent(b.dataset.switch); ctx.course = null; location.hash = "#/"; });
  view.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (await ask(`${t("delete_")} ${langInfo(b.dataset.rm).native}?`, t("delete_"), t("cancel"))) { store.removeLang(b.dataset.rm); ctx.course = null; if (!store.current) { store.setting("onboarded", false); location.hash = "#/"; } else refresh(); } });
  view.querySelector("#addLang").onclick = () => renderOnboarding(true);
  view.querySelector("#exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([store.exportJSON()], { type: "application/json" })); a.download = `linguapath-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  view.querySelector("#imp").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { store.importJSON(await f.text()); toast(t("done")); location.reload(); } catch (err) { toast(`⚠️ ${err.message}`); } };
  view.querySelector("#inst")?.addEventListener("click", doInstall);
  view.querySelector("#reset").onclick = async () => { if (await ask(t("reset_confirm"), t("reset"), t("cancel"))) { store.reset(); location.hash = "#/"; location.reload(); } };
}

/* Grammar notes, verb tables and the sounds/alphabet guide, rendered from a language pack. */
import { t, bi } from "./i18n.js";
import { esc } from "./ui.js";

const fmtBody = (s) => esc(s).replace(/\n/g, "<br>");

export function grammarHTML(course, u) {
  const code = course.code, dir = course.dir;
  const tgt = (s, cls = "") => `<span class="tgt ${cls}" lang="${code}" dir="${dir}">${esc(s)}</span>`;
  const pts = course.grammar(u.id);
  let html = `<div class="notice"><b>${t("grammar_focus")}:</b> ${esc(bi(u.grammarFocus))}</div>`;
  if (!pts.length) {
    html += `<p class="muted">${course.isMT ? t("mt_note") : ""}</p>`;
    /* no pack: show the unit's sentences as pattern examples */
    html += `<h3>${t("examples")}</h3><div class="examples">${u.sentences.map((s) => `<div class="exm">${tgt(course.text(s.id))} <button class="iconbtn speakbtn" data-say="${esc(course.text(s.id))}">🔊</button><div class="muted small">${esc(course.baseText(s.id))}</div></div>`).join("")}</div>`;
    return html;
  }
  for (const p of pts) {
    html += `<article class="gpoint"><h3>${esc(bi(p.title))}</h3><p>${fmtBody(bi(p.body))}</p>
      <div class="examples">${(p.examples || []).map((e) => `<div class="exm">${tgt(e.t)} <button class="iconbtn speakbtn" data-say="${esc(e.t)}">🔊</button><div class="muted small">${esc(bi(e))}</div></div>`).join("")}</div></article>`;
  }
  return html;
}

export function verbTableHTML(course, verb, tense) {
  const v = course.verbs[verb]; if (!v) return "";
  const forms = v.forms[tense] || v.forms.present;
  return `<table class="vtable" lang="${course.code}" dir="${course.dir}"><tbody>${course.pronouns.map((p, i) => `<tr><td class="muted">${esc(p)}</td><td><b>${esc(forms[i] || "")}</b></td><td><button class="iconbtn speakbtn" data-say="${esc((p.split("/")[0] + " " + (forms[i] || "")).trim())}">🔊</button></td></tr>`).join("")}</tbody></table>`;
}

export function verbsHTML(course, state) {
  const verbs = Object.keys(course.verbs);
  if (!verbs.length) return `<p class="muted">${t("not_available")}</p>`;
  const cur = state.verb && course.verbs[state.verb] ? state.verb : verbs[0];
  const v = course.verbs[cur];
  const tenses = Object.keys(v.forms);
  const tense = tenses.includes(state.tense) ? state.tense : tenses[0];
  return `<div class="row wrap">${verbs.map((k) => `<button class="chip ${k === cur ? "on" : ""}" data-verb="${esc(k)}" lang="${course.code}" dir="${course.dir}">${esc(k)}</button>`).join("")}</div>
    <h3 class="row"><span lang="${course.code}" dir="${course.dir}">${esc(cur)}</span> <small class="muted">${esc(bi(v))}${v.irregular ? " · ⚠︎" : ""}</small> <button class="iconbtn speakbtn" data-say="${esc(cur)}">🔊</button></h3>
    <div class="seg">${tenses.map((k) => `<button class="${k === tense ? "on" : ""}" data-tense="${k}">${esc(bi(course.tenses[k]) || k)}</button>`).join("")}</div>
    ${verbTableHTML(course, cur, tense)}`;
}

export function soundsHTML(course) {
  if (!course.alphabet.length) return `<p class="muted">${t("not_available")}</p>`;
  return `<h3>${t("tips")}</h3><ul class="tips">${course.tips.map((x) => `<li>${esc(bi(x))}</li>`).join("")}</ul>
    <h3>${t("alphabet")}</h3>
    <div class="alpha">${course.alphabet.map((a) => `<button class="alpha__item" data-say="${esc(a.ex)}"><b lang="${course.code}" dir="${course.dir}">${esc(a.ch)}</b><span lang="${course.code}" dir="${course.dir}">${esc(a.ex)}</span><small>${esc(bi(a))}</small></button>`).join("")}</div>`;
}

/* Spaced-repetition review and phrasebook. */
import { t, bi } from "./i18n.js";
import { esc, toast } from "./ui.js";
import { store } from "./store.js";
import { runSession } from "./lesson.js";
import { buildReviewExercises } from "./exercises.js";
import { strength } from "./srs.js";
import { CONCEPTS } from "./curriculum.js";

export function renderReview(view, course) {
  const code = course.code;
  let cleanup = null;
  const draw = () => {
    const due = store.dueCards(code).sort((a, b) => a.due - b.due);
    const stats = store.cardStats(code);
    const L = store.lang(code);
    const all = Object.entries(L.cards).map(([id, c]) => ({ id, ...c })).sort((a, b) => a.due - b.due);
    view.innerHTML = `<div class="page">
      <div class="page-h"><h2>🔁 ${t("review_title")}</h2></div>
      <p class="muted">${t("review_intro")}</p>
      <div class="stat-row"><div class="stat"><b>${stats.due}</b><span>${t("due_now")}</span></div><div class="stat"><b>${stats.learned}</b><span>${t("learned")}</span></div><div class="stat"><b>${stats.mastered}</b><span>${t("mastered")}</span></div></div>
      ${due.length ? `<button class="btn primary big wide" id="go">▶ ${t("start_review")} (${due.length})</button>` : `<div class="notice">${t("review_empty")}</div>`}
      <h3 class="h2">${t("phrasebook")} <small class="muted">${L.phrasebook.length}</small></h3>
      ${L.phrasebook.length ? `<div class="list">${L.phrasebook.slice().reverse().map((p) => `<div class="listitem"><div><b lang="${code}" dir="${course.dir}">${esc(p.t)}</b><div class="muted small">${esc(p.b)}</div></div><button class="iconbtn" data-say="${esc(p.t)}">🔊</button><button class="iconbtn" data-del="${p.id}">🗑</button></div>`).join("")}</div>` : `<p class="muted small">${t("tr_save")} → ${t("tr_title")}</p>`}
      <h3 class="h2">${t("words_learned")} <small class="muted">${all.length}</small></h3>
      <div class="wordgrid">${all.slice(0, 400).map((c) => { const s = strength(c); const txt = c.t || course.text(c.id); const b = c.b || course.baseText(c.id); return `<div class="wchip" style="--s:${s}" title="${esc(b)}" data-say="${esc(txt)}" lang="${code}" dir="${course.dir}">${esc(txt)}<small>${esc(b)}</small></div>`; }).join("")}</div>
    </div>`;
    view.querySelector("#go")?.addEventListener("click", () => {
      const exs = buildReviewExercises(course, due.slice(0, 40));
      document.body.dataset.page = "session";
      cleanup = runSession(view, { course, exercises: exs, title: t("review_title"), onExit: () => { document.body.dataset.page = "review"; draw(); },
        onDone: ({ xp }) => { document.body.dataset.page = "review"; toast(`${t("session_done")} · ${t("xp_earned", { n: xp })}`); draw(); } });
    });
    view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { store.removePhrase(code, b.dataset.del); draw(); });
  };
  draw();
  return () => cleanup?.();
}

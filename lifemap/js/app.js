// Boot: draw the board, wire the header, adapt the UI to the active child's age.
(function () {
  const S = window.Store, E = window.Engine, UI = window.UI, TOPICS = window.LIFEMAP_TOPICS, LEVELS = window.LIFEMAP_LEVELS;
  const $ = (id) => document.getElementById(id);

  function drawBoard() {
    const child = S.child();
    const disabled = new Set(S.setting("disabledTopics") || []);
    const stats = child ? E.topicStats(child.age) : null;
    $("grid").innerHTML = TOPICS.map((t, i) => {
      const s = stats?.find((x) => x.topic.id === t.id);
      const pct = s && s.total ? Math.round((s.done / s.total) * 100) : 0;
      return `<button class="tile tile--${t.color} ${disabled.has(t.id) ? "tile--off" : ""}" data-topic="${t.id}" style="--i:${i}" ${disabled.has(t.id) ? "disabled" : ""}>
        <span class="tile__rings" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="tile__emoji">${t.emoji}</span>
        <span class="tile__name">${t.name}</span>
        ${s ? `<span class="tile__prog" title="${s.done} מתוך ${s.total} לגיל ${child.age}"><i style="width:${pct}%"></i></span>` : ""}
        ${s?.done ? `<span class="tile__stars">${s.done === s.total && s.total ? "🏆" : "⭐" + s.stars}</span>` : ""}
      </button>`;
    }).join("");
    $("grid").querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => UI.viewLevel(E.topic(b.dataset.topic))));
  }

  function refresh() {
    const child = S.child();
    document.body.className = document.body.className.replace(/\bband-\w+/g, "").trim();
    if (child) {
      $("childAvatar").textContent = child.avatar; $("childName").textContent = child.name;
      $("childAge").textContent = `גיל ${child.age} · ${E.bandForAge(child.age).name}`;
      $("starCount").textContent = S.prog().stars;
      document.body.classList.add("band-" + E.bandForAge(child.age).id);
    } else { $("childAvatar").textContent = "🙂"; $("childName").textContent = "מי לומד היום?"; $("childAge").textContent = ""; $("starCount").textContent = "0"; }
    drawBoard();
  }

  const need = (fn) => () => (S.child() ? fn() : UI.viewChild(null));
  $("childChip").addEventListener("click", () => (S.children().length ? UI.viewSwitchChild() : UI.viewChild(null)));
  $("childChip").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") $("childChip").click(); });
  $("starsBtn").addEventListener("click", need(UI.viewStars));
  $("todayBtn").addEventListener("click", need(UI.viewDaily));
  $("favBtn").addEventListener("click", need(UI.viewFavs));
  $("parentBtn").addEventListener("click", need(UI.viewParent));
  document.addEventListener("click", (e) => { if (!S.child() && e.target.closest(".tile")) { e.stopPropagation(); UI.viewChild(null); } }, true);

  // Used by the Android wrapper: hardware back closes the open sheet before leaving the app.
  const handleBack = () => { if (document.getElementById("sheet").hidden) return false; UI.back(); return true; };
  window.App = { refresh, handleBack };
  refresh();
  if (!S.children().length) UI.viewChild(null);

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

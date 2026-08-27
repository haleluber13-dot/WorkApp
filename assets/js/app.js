/* GlobeWatch — app controller: search, filters, views, events. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const state = { query: "", cats: new Set(), favOnly: false, view: "split", country: "" };

  function currentList() {
    return Store.filter({ query: state.query, cats: state.cats, favOnly: state.favOnly })
      .filter((c) => c.lat != null || state.view === "wall"); // globe needs coords
  }

  function refresh() {
    const list = Store.filter({ query: state.query, cats: state.cats,
                               favOnly: state.favOnly, country: state.country });
    UI.renderWall(list);
    if (window.GlobeView) GlobeView.setData(list.filter((c) => c.lat != null));
    $("#statTotal").textContent = Store.all().length.toLocaleString();
    $("#statFav").textContent = Store.favorites.size;
    syncCountries();
  }

  let countrySig = "";
  function syncCountries() {
    const list = Store.countryList();
    const sig = list.map((c) => c.country + c.count).join("|");
    if (sig === countrySig) return;                       // rebuild only when the set changes
    countrySig = sig;
    const sel = $("#countrySel");
    const cur = state.country;
    sel.innerHTML = '<option value="">🌍 All countries (' + Store.all().length.toLocaleString() + ')</option>' +
      list.map((c) => '<option value="' + esc(c.country) + '"' + (c.country === cur ? " selected" : "") +
        '>' + esc(c.country) + " (" + c.count.toLocaleString() + ")</option>").join("");
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

  function buildCategoryBar() {
    const bar = $("#catbar");
    bar.innerHTML = (window.CATEGORIES || []).map((c) =>
      '<button class="cat" data-cat="' + c.id + '" style="--cat:' + c.color + '">' +
      '<span>' + c.icon + '</span>' + c.label + '</button>').join("");
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      const id = b.dataset.cat;
      if (state.cats.has(id)) state.cats.delete(id); else state.cats.add(id);
      b.classList.toggle("on");
      refresh();
    });
  }

  function setView(v) {
    state.view = v;
    document.body.dataset.view = v;
    $$(".viewbtn").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    if (window.GlobeView) setTimeout(() => GlobeView.resize(), 60);
    refresh();
  }

  function wireEvents() {
    // Search (debounced)
    let t;
    $("#search").addEventListener("input", (e) => {
      clearTimeout(t); const v = e.target.value;
      t = setTimeout(() => { state.query = v; refresh(); }, 140);
    });
    $("#search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const first = currentList()[0]; if (first) UI.openFocus(first.id); }
    });

    // Global click delegation
    document.addEventListener("click", (e) => {
      const T = e.target;
      const fav = T.closest("[data-fav]");
      if (fav) { e.stopPropagation(); Store.toggleFav(fav.dataset.fav); refresh();
        if ($("#focus").classList.contains("open")) UI.openFocus(fav.dataset.fav); return; }
      const edit = T.closest("[data-edit]"); if (edit) { UI.openEditor(edit.dataset.edit); return; }
      const del = T.closest("[data-del]"); if (del) {
        if (confirm("Delete this camera?")) { Store.remove(del.dataset.del); UI.closeModal(); UI.closeFocus(); UI.toast("Deleted"); } return; }
      const goto = T.closest("[data-goto]"); if (goto) { UI.openFocus(goto.dataset.goto); return; }
      if (T.closest("[data-close]")) { UI.closeModal(); UI.closeFocus(); return; }
      const tile = T.closest(".tile"); if (tile) { UI.openFocus(tile.dataset.id); return; }
      const view = T.closest(".viewbtn"); if (view) { setView(view.dataset.view); return; }
    });

    // Keyboard: focus tile on Enter, close on Esc, "/" to search
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { UI.closeModal(); UI.closeFocus(); }
      if (e.key === "/" && document.activeElement !== $("#search")) { e.preventDefault(); $("#search").focus(); }
      if (e.key === "Enter") { const el = document.activeElement;
        if (el && el.classList && el.classList.contains("tile")) UI.openFocus(el.dataset.id); }
    });

    $("#countrySel").addEventListener("change", (e) => {
      state.country = e.target.value;
      refresh();
      // fly the globe to that country's cameras
      if (state.country && window.GlobeView) {
        const cams = Store.filter({ country: state.country }).filter((c) => c.lat != null);
        if (cams.length) {
          const lat = cams.reduce((s, c) => s + c.lat, 0) / cams.length;
          const lng = cams.reduce((s, c) => s + c.lng, 0) / cams.length;
          GlobeView.focus({ lat: lat, lng: lng });
        }
      }
    });
    $("#btnAdd").addEventListener("click", () => UI.openEditor());
    $("#btnSettings").addEventListener("click", () => UI.openSettings());
    $("#btnFav").addEventListener("click", (e) => {
      state.favOnly = !state.favOnly; e.currentTarget.classList.toggle("on", state.favOnly); refresh();
    });
  }

  function boot() {
    buildCategoryBar();
    wireEvents();
    setView("split");
    if (window.GlobeView) GlobeView.init($("#globe"), { onSelect: (id) => UI.openFocus(id) });
    Store.onChange(refresh);
    refresh();
    loadLiveCameras();
    // PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  // Auto-load real, working public cameras (keyless providers) as soon as the app opens.
  async function loadLiveCameras() {
    UI.toast("Loading live cameras…");
    try {
      const n = await Store.autoBootstrap((name, count, err) => {
        if (!err && count) UI.toast("Loaded " + count + " " + name + " cameras");
      });
      UI.toast(n > 0 ? ("Live: " + Store.all().length + " cameras online") :
        "Couldn't reach camera providers — check your connection or add feeds in ⚙", n === 0);
    } catch (_) { /* offline / blocked — seed cameras still show */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

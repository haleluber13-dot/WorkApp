// Web library — a searchable bank of openly-licensed tattoo drawings and art.
//
//   mountWebBank(container, { onUse, onCutout, onSave, onPickForGeo?, toast })
//     → { focusSearch(), search(q), destroy() }
//
// Offline: the bundled game-icons.net pack (≈4,200 black-ink drawings, CC BY 3.0).
// Online (when the network allows): Openverse, Wikimedia Commons, natural-history
// plates (BHL on Commons), Art Institute of Chicago, The Met. Every item carries
// title / creator / source / license / licenseUrl / url, shown in the UI and passed
// to the callbacks.

import {
  CATEGORIES, loadPack, searchPack, categoryEntries, featuredEntries, entryToItem, entrySvg, packStats, getCategory,
  queryTerms, stem, entryByName, PACK_LICENSE_FILE,
} from "./pack.js";
import { ONLINE_SOURCES, SOURCE_BY_ID, searchSource, imageItemCanvas, canvasToBlob } from "./sources.js";

/** Render a 512-unit pack path straight to a transparent canvas (no image decode → works under strict CSP). */
function pathCanvas(d, size = 2048, color = "#111111") {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.scale(size / 512, size / 512);
  g.fillStyle = color;
  g.fill(new Path2D(d));
  return c;
}
function copyCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

const CSS_URL = new URL("./webbank.css", import.meta.url).href;
const SUGGEST = ["rose", "skull", "koi", "dragon", "snake", "swallow", "wolf", "lion", "butterfly", "mandala", "japanese wave",
  "anchor", "dagger", "phoenix", "tiger", "moon", "eagle", "compass", "hand", "eye", "octopus", "lotus", "raven", "heart"];
const ANIMALS = ["wolf", "lion", "tiger", "fox", "bear", "deer", "owl", "eagle", "raven", "snake", "koi", "butterfly", "bee",
  "spider", "scorpion", "horse", "cat", "dog", "elephant", "shark", "octopus", "jellyfish", "swallow", "hummingbird"];
const PLANTS = ["rose", "peony", "lotus", "sunflower", "daisy", "lavender", "cherry blossom", "fern", "leaf", "tree", "cactus",
  "mushroom", "vine", "wildflower", "oak", "bamboo"];
const OFFLINE_PAGE = 30;
const OFFLINE_FIRST_MIXED = 12;
const OFFLINE_NOTE = "Online search isn't available here — showing the built-in library.";

let cssInjected = false;
function injectCss() {
  if (cssInjected || document.querySelector(`link[data-webbank-css]`)) { cssInjected = true; return; }
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = CSS_URL; l.dataset.webbankCss = "";
  document.head.appendChild(l);
  cssInjected = true;
}

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const SVGNS = "http://www.w3.org/2000/svg";
function inkSvg(d, cls = "wb-ink") {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 512 512");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", d);
  s.appendChild(p);
  return s;
}
const ICON = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  wand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 11-11M14 4v3M19 9h3M17.5 5.5l2-2M12.5 5.5l-1.5-1.5"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h10l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v6h8M8 21v-7h8v7"/></svg>',
  use: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  geo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M12 3v18M3 8l9 5 9-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
};

// ── masonry: N columns, cards go to the shortest column (by estimated height) ──
class Masonry {
  constructor(el, { minCol = 172, minColPhone = 150, gap = 12 } = {}) {
    this.el = el; this.minCol = minCol; this.minColPhone = minColPhone; this.gap = gap;
    this.cards = []; this.cols = []; this.heights = []; this.n = 0; this.width = 0;
    el.classList.add("wb-masonry");
  }
  setWidth(w) {
    if (!w) return;
    this.width = w;
    const min = w <= 668 ? this.minColPhone : this.minCol;
    const n = Math.max(2, Math.floor((w + this.gap) / (min + this.gap)));
    if (n !== this.n) { this.n = n; this.relayout(); }
  }
  ensureCols() {
    if (this.cols.length === this.n) return;
    this.el.replaceChildren();
    this.cols = []; this.heights = [];
    for (let i = 0; i < this.n; i++) { const c = h("div", { class: "wb-col" }); this.el.append(c); this.cols.push(c); this.heights.push(0); }
  }
  place(card) {
    if (!this.n) return;
    this.ensureCols();
    let k = 0;
    for (let i = 1; i < this.n; i++) if (this.heights[i] < this.heights[k] - 0.01) k = i;
    this.heights[k] += card._est || 1.3;
    card._col = k;
    this.cols[k].append(card);
  }
  add(card, est) { card._est = est; this.cards.push(card); this.place(card); }
  remove(card) {
    const i = this.cards.indexOf(card);
    if (i < 0) return;
    this.cards.splice(i, 1);
    if (card._col != null && this.heights[card._col] != null) this.heights[card._col] -= card._est || 1.3;
    card.remove();
  }
  clear() { this.cards = []; this.cols.forEach((c) => c.replaceChildren()); this.heights = this.heights.map(() => 0); }
  relayout() { this.cols = []; this.ensureCols(); for (const c of this.cards) this.place(c); }
}

// ────────────────────────────────────────────────────────────────────────
export function mountWebBank(container, opts = {}) {
  injectCss();
  const cb = {
    onUse: opts.onUse || (() => {}), onCutout: opts.onCutout || null, onSave: opts.onSave || null,
    onPickForGeo: opts.onPickForGeo || null, toast: opts.toast || ((m) => console.info("[webbank]", m)),
  };
  const uid = "wb" + Math.random().toString(36).slice(2, 8);
  const state = {
    q: "", cat: null, filter: lsGet("webbank.filter", "all"), commercial: !!lsGet("webbank.commercial", false),
    illustrations: !!lsGet("webbank.illustrations", false), mode: "home",
  };
  if (!["all", "offline", "online", "gameicons", ...ONLINE_SOURCES.map((s) => s.id)].includes(state.filter)) state.filter = "all";
  const net = { blocked: false, everOk: false };
  let run = null; // current search run
  let destroyed = false;

  // ── skeleton DOM ──
  const root = h("div", { class: "webbank", "data-webbank": "" });
  const scroller = h("div", { class: "wb-scroll" });
  const input = h("input", {
    type: "search", class: "wb-input", id: uid + "-q", autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    placeholder: "Search drawings, art & photos — rose, koi, dragon…", "aria-label": "Search the web library",
  });
  const clearBtn = h("button", { type: "button", class: "wb-clear", "aria-label": "Clear search", hidden: true, html: ICON.x });
  const form = h("form", { class: "wb-search", role: "search" },
    h("span", { class: "wb-search-ic", html: ICON.search }), input, clearBtn,
    h("button", { type: "submit", class: "wb-go" }, "Search"));
  const suggest = h("div", { class: "wb-chiprow wb-suggest", role: "group", "aria-label": "Suggestions" },
    SUGGEST.map((s) => h("button", { type: "button", class: "wb-chip", dataset: { q: s } }, s)));

  const catTabs = h("div", { class: "wb-chiprow wb-cats", role: "tablist", "aria-label": "Drawing categories" },
    h("button", { type: "button", role: "tab", class: "wb-tab", dataset: { cat: "" } }, "Everything"),
    CATEGORIES.map((c) => h("button", { type: "button", role: "tab", class: "wb-tab", dataset: { cat: c.id } }, c.name)));

  const srcDefs = [
    { id: "all", label: "All" },
    { id: "offline", label: "Drawings", sub: "offline" },
    { id: "online", label: "Photos & art", sub: "online" },
    { id: "gameicons", label: "game-icons.net", src: true },
    ...ONLINE_SOURCES.map((s) => ({ id: s.id, label: s.name, src: true })),
  ];
  const srcChips = {};
  const srcRow = h("div", { class: "wb-chiprow wb-sources", role: "group", "aria-label": "Sources" },
    srcDefs.map((d) => {
      const b = h("button", { type: "button", class: "wb-src" + (d.src ? " wb-src--one" : ""), dataset: { filter: d.id }, "aria-pressed": "false" },
        d.src ? h("span", { class: "wb-dot", "aria-hidden": "true" }) : null,
        h("span", { class: "wb-src-label" }, d.label, d.sub ? h("small", {}, ` (${d.sub})`) : null),
        h("span", { class: "wb-src-count" }));
      srcChips[d.id] = b;
      return b;
    }));
  const tgl = (key, label, hint) => h("label", { class: "wb-toggle", title: hint },
    h("input", { type: "checkbox", dataset: { toggle: key }, checked: state[key] || null }), h("span", { class: "wb-switch", "aria-hidden": "true" }),
    h("span", {}, label));
  const toggles = h("div", { class: "wb-toggles" },
    tgl("illustrations", "Illustrations only", "Favour engravings, prints and drawings (cleaner for tattoos) over photos"),
    tgl("commercial", "Commercial use OK", "Only show items whose licence allows commercial use"));
  const note = h("div", { class: "wb-note", role: "status", hidden: true });

  const head = h("header", { class: "wb-head" },
    h("div", { class: "wb-titlebar" },
      h("h2", { class: "wb-title" }, "Web library"),
      h("span", { class: "wb-tagline" }, "Openly licensed drawings & art — credited, free to adapt")),
    form, suggest, catTabs,
    h("div", { class: "wb-filterbar" }, srcRow, toggles), note);

  // home
  const homeCats = h("div", { class: "wb-catgrid" });
  const homeGridEl = h("div", { class: "wb-grid" });
  const home = h("section", { class: "wb-home", "aria-label": "Featured" },
    h("div", { class: "wb-sechead" }, h("h3", {}, "Browse the built-in library"),
      h("span", { class: "wb-muted wb-packstat" }, "Loading drawings…")),
    homeCats,
    h("div", { class: "wb-sechead" }, h("h3", {}, "Animals")),
    h("div", { class: "wb-chiprow wb-wrap" }, ANIMALS.map((s) => h("button", { type: "button", class: "wb-chip wb-chip--soft", dataset: { q: s } }, s))),
    h("div", { class: "wb-sechead" }, h("h3", {}, "Plants & flowers")),
    h("div", { class: "wb-chiprow wb-wrap" }, PLANTS.map((s) => h("button", { type: "button", class: "wb-chip wb-chip--soft", dataset: { q: s } }, s))),
    h("div", { class: "wb-sechead" }, h("h3", {}, "Popular drawings")),
    homeGridEl);

  // results
  const resTitle = h("h3", { class: "wb-restitle", "aria-live": "polite" });
  const resSub = h("span", { class: "wb-muted wb-ressub" });
  const gridEl = h("div", { class: "wb-grid" });
  const moreBtn = h("button", { type: "button", class: "wb-btn wb-more", hidden: true }, "Load more");
  const sentinel = h("div", { class: "wb-sentinel", "aria-hidden": "true" });
  const empty = h("div", { class: "wb-empty", hidden: true });
  const results = h("section", { class: "wb-results", hidden: true, "aria-label": "Results" },
    h("div", { class: "wb-sechead" }, resTitle, resSub), gridEl, empty, h("div", { class: "wb-morewrap" }, moreBtn), sentinel);

  const foot = h("footer", { class: "wb-foot" },
    h("p", {}, "Only openly licensed or public-domain works are shown, and every item keeps its credit. Built-in drawings: ",
      h("a", { href: "https://game-icons.net", target: "_blank", rel: "noopener" }, "game-icons.net"),
      " by Lorc, Delapouite & contributors (",
      h("a", { href: "https://creativecommons.org/licenses/by/3.0/", target: "_blank", rel: "noopener" }, "CC BY 3.0"),
      ", ", h("a", { href: PACK_LICENSE_FILE, target: "_blank", rel: "noopener" }, "details"),
      "). Online: Openverse, Wikimedia Commons, Biodiversity Heritage Library, Art Institute of Chicago, The Met. Check the licence before commercial use; share-alike works must keep the same licence."));

  scroller.append(head, home, results, foot);

  // detail sheet
  const sheet = h("div", { class: "wb-sheet", hidden: true });
  const sheetPanel = h("div", { class: "wb-sheet-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": uid + "-st", tabindex: "-1" });
  const sheetBackdrop = h("div", { class: "wb-sheet-backdrop" });
  sheet.append(sheetBackdrop, sheetPanel);

  root.append(scroller, sheet);
  container.append(root);

  const homeGrid = new Masonry(homeGridEl);
  const grid = new Masonry(gridEl);

  // ── sizing ──
  const ro = new ResizeObserver(() => {
    const w = gridEl.clientWidth || results.clientWidth || scroller.clientWidth - 32;
    const hw = homeGridEl.clientWidth || home.clientWidth || scroller.clientWidth - 32;
    if (!results.hidden) grid.setWidth(w);
    if (!home.hidden) homeGrid.setWidth(hw);
    root.classList.toggle("wb-narrow", root.clientWidth <= 700);
  });
  ro.observe(root);
  const syncWidths = () => {
    if (!results.hidden) grid.setWidth(gridEl.clientWidth);
    if (!home.hidden) homeGrid.setWidth(homeGridEl.clientWidth);
  };

  // ── pack ──
  let packReady = false;
  const packP = loadPack().then(() => {
    packReady = true;
    if (destroyed) return;
    renderHome();
    updateChips();
  }).catch((e) => {
    console.warn("[webbank] pack failed", e);
    home.querySelector(".wb-packstat").textContent = "The built-in drawings couldn't be loaded.";
  });
  // skeletons while loading
  for (let i = 0; i < 12; i++) homeGrid.add(skeleton(), 1.25);

  function renderHome() {
    const st = packStats();
    home.querySelector(".wb-packstat").textContent = `${st.count.toLocaleString()} drawings · works offline`;
    homeCats.replaceChildren(...CATEGORIES.map((c) => {
      const icons = c.featured.map((n) => entryByName(n)).filter(Boolean).slice(0, 4);
      return h("button", { type: "button", class: "wb-catcard", dataset: { cat: c.id }, "aria-label": `${c.name}, ${c.count} drawings` },
        h("span", { class: "wb-catmosaic" }, icons.map((e) => inkSvg(e.d))),
        h("span", { class: "wb-catname" }, c.name), h("span", { class: "wb-catcount" }, `${c.count}`));
    }));
    homeGrid.clear();
    homeGrid.setWidth(homeGridEl.clientWidth);
    for (const e of featuredEntries()) homeGrid.add(drawingCard(entryToItem(e), e), 1 + CAP);
  }

  // ── cards ──
  const CAP = 0.32; // caption height in column-width units (estimate)
  function skeleton() { return h("div", { class: "wb-card wb-skel", "aria-hidden": "true" }, h("div", { class: "wb-thumb" }), h("div", { class: "wb-cap" }, h("i"), h("i"))); }
  function drawingCard(item, entry) {
    const b = h("button", { type: "button", class: "wb-card wb-card--drawing", "aria-label": `${item.title} — drawing by ${item.creator}, ${item.license}` },
      h("div", { class: "wb-thumb wb-paper" }, inkSvg(entry.d)),
      h("div", { class: "wb-cap" }, h("span", { class: "wb-cap-t" }, item.title),
        h("span", { class: "wb-cap-s" }, `${item.creator} · ${item.license}`)));
    item._entry = entry;
    b._item = item;
    return b;
  }
  function imageCard(item) {
    const ar = item.width && item.height ? Math.min(1.7, Math.max(0.62, item.height / item.width)) : 1.2;
    const img = h("img", { alt: "", loading: "lazy", decoding: "async", crossorigin: "anonymous", referrerpolicy: "no-referrer" });
    const thumb = h("div", { class: "wb-thumb wb-photo is-loading", style: `aspect-ratio:${(1 / ar).toFixed(4)}` }, img);
    if (item.placeholder) thumb.style.backgroundImage = `url("${item.placeholder}")`;
    const b = h("button", { type: "button", class: "wb-card wb-card--image", "aria-label": `${item.title} — by ${item.creator}, ${item.source}, ${item.license}` },
      thumb, h("div", { class: "wb-cap" }, h("span", { class: "wb-cap-t" }, item.title),
        h("span", { class: "wb-cap-s" }, `${shortSource(item)} · ${item.license}`)));
    b._item = item;
    img.onload = () => {
      thumb.classList.remove("is-loading");
      noteImage(item.sourceId, true);
    };
    img.onerror = () => {
      noteImage(item.sourceId, false);
      const m = b._masonry;
      if (m) m.remove(b); else b.remove();
      if (run) run.items = run.items.filter((it) => it !== item);
      updateCounts();
    };
    img.src = item.thumb;
    b._est = ar + CAP;
    return b;
  }
  const shortSource = (it) => ({ openverse: "Openverse", wikimedia: "Wikimedia", bhl: "BHL", aic: "Art Inst. Chicago", met: "The Met" }[it.sourceId] || it.source);

  // ── search run ──
  function newRun(q) {
    if (run) run.ctl.abort();
    run = {
      q, ctl: new AbortController(), items: [], keys: new Set(), offline: [], offShown: 0,
      src: Object.fromEntries(ONLINE_SOURCES.map((s) => [s.id, { status: "idle", next: s.first, hasMore: false, loading: false, count: 0, ran: false, imgOk: 0, imgFail: 0, msg: "" }])),
    };
    return run;
  }

  function wantsOnline(id) {
    const f = state.filter;
    if (f === "offline" || f === "gameicons") return false;
    if (f === id) return true;
    if (f !== "all" && f !== "online") return false;
    const s = SOURCE_BY_ID[id];
    if (s.natural) return isNatural();
    return true;
  }
  function isNatural() {
    if (state.cat === "animals" || state.cat === "plants") return true;
    if (state.illustrations) return true;
    const terms = queryTerms(run?.q || "").map(stem);
    const words = new Set([...getCategory("animals").words, ...getCategory("plants").words].map(stem));
    if (terms.some((t) => words.has(t))) return true;
    const top = (run?.offline || []).slice(0, 8);
    return top.filter((e) => e.cats.includes("animals") || e.cats.includes("plants")).length >= 4;
  }

  async function doSearch(q, { keepCat = true } = {}) {
    q = String(q || "").trim();
    if (!keepCat) state.cat = null;
    state.q = q;
    input.value = q;
    clearBtn.hidden = !q;
    if (!q && !state.cat) { showHome(); return; }
    showResults();
    const r = newRun(q);
    grid.clear();
    empty.hidden = true;
    resTitle.textContent = q ? `Results for “${q}”` : getCategory(state.cat)?.name || "";
    resSub.textContent = "";
    for (let i = 0; i < 8; i++) addSkel("pack");
    try { await packP; } catch { /* pack failed; online may still work */ }
    if (r !== run) return;
    removeSkels("pack");
    if (packReady) {
      r.offline = q ? searchPack(q, { category: state.cat }) : categoryEntries(state.cat);
    }
    const mixed = !!(state.filter === "all" && !net.blocked && q && r.offline.length);
    if (mixed) {
      // hold the first page briefly so drawings and web results can be interleaved
      r.holding = true;
      r.pending = { offline: [] };
      for (let i = 0; i < 10; i++) addSkel("hold");
      setTimeout(() => release(r), 2600);
    }
    showOffline(mixed ? OFFLINE_FIRST_MIXED : OFFLINE_PAGE);
    if (q) {
      for (const s of ONLINE_SOURCES) if (wantsOnline(s.id)) fetchSource(s.id);
    }
    updateChips(); updateCounts(); updateMore();
    if (!q && state.cat) setNote(net.blocked ? OFFLINE_NOTE : "Type a search to include photos and art from the web.", "info");
  }

  function showOffline(n) {
    if (!run) return;
    const slice = run.offline.slice(run.offShown, run.offShown + n);
    run.offShown += slice.length;
    for (const e of slice) {
      const it = entryToItem(e);
      if (run.keys.has(it.id)) continue;
      run.keys.add(it.id);
      it._entry = e;
      if (run.holding) { run.pending.offline.push(it); continue; }
      run.items.push(it);
      if (visible(it)) addCard(it);
    }
  }

  /** End the hold: interleave held drawings with web results (2 drawings, then one from each source…). */
  function release(r) {
    if (r !== run || !r.holding) return;
    r.holding = false;
    removeSkels("hold");
    const lists = [r.pending.offline, ...ONLINE_SOURCES.map((s) => r.pending[s.id] || [])];
    const take = [2, ...ONLINE_SOURCES.map(() => 1)];
    while (lists.some((l) => l.length)) {
      lists.forEach((l, i) => {
        for (const it of l.splice(0, take[i])) { r.items.push(it); if (visible(it)) addCard(it); }
      });
    }
    r.pending = null;
    // few or no web results (offline, rate-limited…) — top the first page up with drawings
    const web = r.items.filter((it) => it.kind === "image").length;
    if (web < 10 && r.offShown < OFFLINE_PAGE) showOffline(OFFLINE_PAGE - r.offShown);
    updateCounts(); updateMore();
  }
  function maybeRelease(r) {
    if (r.holding && !Object.values(r.src).some((s) => s.loading)) release(r);
  }

  async function fetchSource(id) {
    const r = run;
    const st = r.src[id];
    if (!r.q || st.loading) return;
    const src = SOURCE_BY_ID[id];
    st.loading = true; st.ran = true; st.status = "loading"; st.msg = "";
    updateChips();
    const skelKey = "src:" + id;
    if (visibleSource(id) && !r.holding) for (let i = 0; i < 3; i++) addSkel(skelKey);
    try {
      const o = { q: r.q, page: st.next, commercial: state.commercial, illustrations: state.illustrations, signal: r.ctl.signal };
      let res;
      try { res = await searchSource(src, o); }
      catch (e) {
        if (e.kind !== "busy" && e.kind !== "timeout") throw e;
        await new Promise((ok) => setTimeout(ok, 2500)); // one gentle retry
        if (r !== run) return;
        res = await searchSource(src, o);
      }
      if (r !== run) return;
      net.everOk = true;
      if (net.blocked) { net.blocked = false; setNote(""); }
      st.next = res.next; st.hasMore = res.hasMore; st.status = "ok";
      let added = 0;
      removeSkels(skelKey);
      for (const it of res.items) {
        if (r.keys.has(it.dedupe) || r.keys.has(it.id)) continue;
        r.keys.add(it.dedupe); r.keys.add(it.id);
        added++;
        if (r.holding) { (r.pending[id] ||= []).push(it); continue; }
        r.items.push(it);
        if (visible(it)) addCard(it);
      }
      st.count += added;
      if (!res.items.length && st.count === 0) st.msg = "No matches";
    } catch (e) {
      if (r !== run) return;
      removeSkels(skelKey);
      if (e.kind === "aborted") return;
      st.status = e.kind === "offline" ? "off" : "warn";
      st.msg = e.kind === "offline" ? "Not reachable" : e.message;
      st.hasMore = false;
    } finally {
      if (r === run) {
        st.loading = false;
        checkBlocked();
        maybeRelease(r);
        updateChips(); updateCounts(); updateMore();
      }
    }
  }

  function checkBlocked() {
    if (!run) return;
    const ran = Object.values(run.src).filter((s) => s.ran);
    if (!ran.length || ran.some((s) => s.loading)) return;
    if (ran.every((s) => s.status === "off") && !net.everOk) {
      net.blocked = true;
      setNote(OFFLINE_NOTE, "warn");
    }
  }

  function noteImage(id, ok) {
    if (!run || !run.src[id]) return;
    const st = run.src[id];
    ok ? st.imgOk++ : st.imgFail++;
    if (!ok && st.imgOk === 0 && st.imgFail >= 3 && st.status === "ok") {
      st.status = "warn"; st.msg = "Images blocked by the host";
      updateChips();
    }
  }

  // skeleton groups
  const skels = new Map();
  function addSkel(key) {
    const s = skeleton();
    grid.add(s, 1.25);
    if (!skels.has(key)) skels.set(key, []);
    skels.get(key).push(s);
  }
  function removeSkels(key) { for (const s of skels.get(key) || []) grid.remove(s); skels.delete(key); }

  function visibleSource(id) {
    const f = state.filter;
    return f === "all" || f === "online" || f === id;
  }
  function visible(it) {
    const f = state.filter;
    if (f === "all") return true;
    if (f === "offline" || f === "gameicons") return it.kind === "svg";
    if (f === "online") return it.kind === "image";
    return it.sourceId === f;
  }
  function addCard(it) {
    const card = it.kind === "svg" ? drawingCard(it, it._entry) : imageCard(it);
    card._masonry = grid;
    grid.add(card, card._est || 1 + CAP);
  }
  function rerenderGrid() {
    grid.clear();
    for (const [k] of skels) removeSkels(k);
    if (!run) return;
    for (const it of run.items) if (visible(it)) addCard(it);
    for (const [id, st] of Object.entries(run.src)) if (st.loading && visibleSource(id)) for (let i = 0; i < 3; i++) addSkel("src:" + id);
    updateCounts(); updateMore();
  }

  function updateCounts() {
    if (!run) return;
    const shown = run.items.filter(visible).length;
    const loading = Object.values(run.src).some((s) => s.loading);
    const off = run.items.filter((i) => i.kind === "svg").length;
    resSub.textContent = loading ? `${shown} so far — searching the web…` : `${shown} shown`;
    empty.hidden = !!(shown || loading || skels.size);
    if (!empty.hidden) {
      let msg = "Nothing found.";
      const f = state.filter;
      const one = SOURCE_BY_ID[f];
      const failed = Object.entries(run.src).filter(([, s]) => s.ran && (s.status === "warn" || s.status === "off"));
      const onlineView = f === "online" || !!one;
      if (onlineView && !run.q) msg = "Type a search to look for photos and art online.";
      else if (onlineView && net.blocked) msg = OFFLINE_NOTE;
      else if (one && run.src[f].msg && run.src[f].status !== "ok") msg = `${one.name}: ${run.src[f].msg}.`;
      else if (one && run.src[f].status === "ok") msg = `${one.name} has nothing for “${run.q}”.`;
      else if (f === "online" && failed.length) msg = failed.map(([id, s]) => `${SOURCE_BY_ID[id].name}: ${s.msg}`).join(" · ");
      else if (!off && run.q && !onlineView) msg = `No drawings match “${run.q}”. Try a simpler word — e.g. “wolf” instead of “howling wolf at night”.`;
      const kids = [h("p", {}, msg)];
      if (onlineView && off) kids.push(h("button", { type: "button", class: "wb-btn", dataset: { filter: "offline" } }, `Show ${off} matching drawings`));
      empty.replaceChildren(...kids);
    }
    srcChips.offline.querySelector(".wb-src-count").textContent = run.offline.length ? `${run.offline.length}` : "";
    srcChips.gameicons.querySelector(".wb-src-count").textContent = run.offline.length ? `${run.offline.length}` : "";
    const onlineCount = Object.values(run.src).reduce((a, s) => a + s.count, 0);
    srcChips.online.querySelector(".wb-src-count").textContent = onlineCount ? `${onlineCount}` : "";
  }

  function updateChips() {
    for (const [id, b] of Object.entries(srcChips)) {
      b.setAttribute("aria-pressed", String(state.filter === id));
      b.classList.toggle("is-on", state.filter === id);
    }
    const pack = srcChips.gameicons;
    pack.dataset.status = packReady ? "ok" : "loading";
    pack.title = packReady ? `Built-in drawings — ${packStats().count} available offline` : "Loading built-in drawings…";
    for (const s of ONLINE_SOURCES) {
      const b = srcChips[s.id];
      const st = run?.src[s.id];
      let status = st ? st.status : "idle";
      if (net.blocked && status === "idle") status = "off";
      b.dataset.status = status;
      const label = { idle: "not searched yet", loading: "searching…", ok: st?.msg || `${st?.count || 0} results`, warn: st?.msg || "problem", off: st?.msg || "not reachable" }[status];
      b.title = `${s.name}: ${label} — ${s.note}`;
      b.setAttribute("aria-label", `${s.name} (${label})`);
      b.querySelector(".wb-src-count").textContent = st && st.status === "ok" && st.count ? String(st.count) : "";
    }
    srcChips.online.dataset.status = net.blocked ? "off" : "";
    catTabs.querySelectorAll(".wb-tab").forEach((t) => {
      const on = (t.dataset.cat || null) === state.cat;
      t.setAttribute("aria-selected", String(on));
      t.classList.toggle("is-on", on);
      t.tabIndex = on || (!state.cat && !t.dataset.cat) ? 0 : -1;
    });
  }

  function hasMore() {
    if (!run) return false;
    const f = state.filter;
    const offMore = f !== "online" && !ONLINE_SOURCES.some((s) => s.id === f) && run.offShown < run.offline.length;
    const onMore = ONLINE_SOURCES.some((s) => visibleSource(s.id) && run.src[s.id].hasMore && wantsOnlineOrRan(s.id));
    return offMore || onMore;
  }
  const wantsOnlineOrRan = (id) => wantsOnline(id) || run.src[id].ran;
  function updateMore() {
    const loading = run && Object.values(run.src).some((s) => s.loading);
    moreBtn.hidden = !hasMore();
    moreBtn.disabled = !!loading;
    moreBtn.textContent = loading ? "Loading…" : "Load more";
  }
  function loadMore({ auto = false } = {}) {
    if (!run || run.holding) return;
    const loading = Object.values(run.src).some((s) => s.loading);
    if (auto && loading) return;
    const f = state.filter;
    if (f !== "online" && !ONLINE_SOURCES.some((s) => s.id === f) && run.offShown < run.offline.length) showOffline(OFFLINE_PAGE);
    if (run.q) {
      for (const s of ONLINE_SOURCES) {
        const st = run.src[s.id];
        if (!visibleSource(s.id) || st.loading) continue;
        if (!st.ran && wantsOnline(s.id)) { fetchSource(s.id); continue; }
        if (st.hasMore && st.ran) {
          if (auto && (st.autoPages = (st.autoPages || 0) + 1) > 4) continue; // be gentle with public APIs
          fetchSource(s.id);
        }
      }
    }
    updateCounts(); updateMore();
  }
  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting) && !results.hidden && sheet.hidden) loadMore({ auto: true });
  }, { root: scroller, rootMargin: "600px 0px" });
  io.observe(sentinel);

  function setNote(msg, kind = "info") {
    note.hidden = !msg;
    note.textContent = msg || "";
    note.dataset.kind = kind;
  }

  function showHome() {
    state.mode = "home";
    if (run) { run.ctl.abort(); run = null; }
    results.hidden = true; home.hidden = false;
    setNote(net.blocked ? OFFLINE_NOTE : "", "warn");
    updateChips();
    requestAnimationFrame(syncWidths);
  }
  function showResults() {
    state.mode = "results";
    home.hidden = true; results.hidden = false;
    if (!net.blocked) setNote("");
    grid.setWidth(gridEl.clientWidth);
    requestAnimationFrame(syncWidths);
  }

  // ── events ──
  form.addEventListener("submit", (e) => { e.preventDefault(); input.blur(); doSearch(input.value); });
  input.addEventListener("input", () => { clearBtn.hidden = !input.value; });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; clearBtn.hidden = true; } });
  clearBtn.addEventListener("click", () => { input.value = ""; clearBtn.hidden = true; input.focus(); state.cat = null; doSearch(""); });
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-q]");
    if (chip && root.contains(chip)) { doSearch(chip.dataset.q, { keepCat: false }); scroller.scrollTo({ top: 0 }); return; }
    const catBtn = e.target.closest("[data-cat]");
    if (catBtn && root.contains(catBtn)) {
      state.cat = catBtn.dataset.cat || null;
      updateChips();
      doSearch(state.q);
      if (catBtn.classList.contains("wb-catcard")) scroller.scrollTo({ top: 0 });
      return;
    }
    const f = e.target.closest("[data-filter]");
    if (f && root.contains(f)) {
      state.filter = f.dataset.filter; lsSet("webbank.filter", state.filter);
      updateChips();
      if (run) {
        if (run.holding) release(run);
        if (run.q) for (const s of ONLINE_SOURCES) if (wantsOnline(s.id) && !run.src[s.id].ran) fetchSource(s.id);
        rerenderGrid();
      } else if (state.mode === "home" && (state.filter !== "all")) {
        // nothing to filter yet — keep the home screen, hint at searching
      }
      return;
    }
    const card = e.target.closest(".wb-card");
    if (card && card._item) openSheet(card._item, card);
  });
  catTabs.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...catTabs.querySelectorAll(".wb-tab")];
    let i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    i = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[i].focus();
    tabs[i].click();
  });
  toggles.addEventListener("change", (e) => {
    const k = e.target.dataset.toggle;
    if (!k) return;
    state[k] = e.target.checked; lsSet("webbank." + k, state[k]);
    if (run && run.q) doSearch(run.q);
  });
  moreBtn.addEventListener("click", () => loadMore());

  // ── detail sheet ──
  let sheetCtx = null;
  function openSheet(item, fromEl) {
    closeSheet(true);
    const ctl = new AbortController();
    sheetCtx = { item, fromEl, ctl, canvas: null, canvasP: null };
    const isSvg = item.kind === "svg";
    const prev = h("div", { class: "wb-preview" + (isSvg ? " wb-paper" : " wb-preview--photo") });
    if (isSvg) prev.append(inkSvg(item._entry.d, "wb-ink wb-ink--big"));
    else {
      const img = h("img", { alt: item.title, src: item.thumb, crossorigin: "anonymous", referrerpolicy: "no-referrer" });
      prev.append(img);
      // upgrade to the full image (also primes the canvas for the actions)
      sheetCtx.canvasP = imageItemCanvas(item, { signal: ctl.signal }).then((c) => {
        if (sheetCtx?.item !== item) return c;
        sheetCtx.canvas = c;
        // show the full-size canvas itself (no re-encode); callbacks get their own copy
        c.classList.add("wb-preview-canvas");
        c.setAttribute("role", "img");
        c.setAttribute("aria-label", item.title);
        img.replaceWith(c);
        dims.textContent = `${c.width} × ${c.height}px`;
        return c;
      });
      sheetCtx.canvasP.catch(() => {});
    }
    const lic = h("a", { href: item.licenseUrl, target: "_blank", rel: "noopener license" }, item.license);
    const creator = item.creatorUrl ? h("a", { href: item.creatorUrl, target: "_blank", rel: "noopener" }, item.creator) : h("span", {}, item.creator);
    const source = h("a", { href: item.sourceUrl || item.url, target: "_blank", rel: "noopener" }, item.source);
    const badges = h("div", { class: "wb-badges" },
      item.publicDomain ? h("span", { class: "wb-badge wb-badge--ok" }, "Public domain") : h("span", { class: "wb-badge" }, "Credit required"),
      item.commercialOk ? h("span", { class: "wb-badge wb-badge--ok" }, "Commercial use OK") : h("span", { class: "wb-badge wb-badge--warn" }, "Non-commercial only"),
      item.shareAlike ? h("span", { class: "wb-badge wb-badge--warn" }, "Share-alike") : null,
      isSvg ? h("span", { class: "wb-badge" }, "Vector drawing") : null);
    const dims = h("span", { class: "wb-muted wb-dims" }, isSvg ? "Vector · scales to any size" : item.width ? `${item.width} × ${item.height}px original` : "");
    const btn = (cls, icon, label, fn, extra = {}) => h("button", { type: "button", class: "wb-btn " + cls, onclick: fn, ...extra }, h("span", { class: "wb-bi", html: icon }), h("span", {}, label));
    const actions = h("div", { class: "wb-actions" },
      btn("wb-btn--primary", ICON.use, "Use as design", (e) => act("use", e.currentTarget)),
      cb.onCutout ? btn("", ICON.wand, "Cut out in Photo studio", (e) => act("cutout", e.currentTarget)) : null,
      cb.onPickForGeo ? btn("", ICON.geo, "Use in Geometric maker", (e) => act("geo", e.currentTarget)) : null,
      cb.onSave ? btn("", ICON.save, "Save to designs", (e) => act("save", e.currentTarget)) : null,
      h("a", { class: "wb-btn", href: item.url, target: "_blank", rel: "noopener" }, h("span", { class: "wb-bi", html: ICON.ext }), h("span", {}, "Open original")));
    const copyBtn = h("button", { type: "button", class: "wb-linkbtn", onclick: () => copyCredit(item) }, h("span", { class: "wb-bi", html: ICON.copy }), "Copy credit");
    sheetPanel.replaceChildren(
      h("button", { type: "button", class: "wb-close", "aria-label": "Close", html: ICON.x, onclick: () => closeSheet() }),
      h("div", { class: "wb-sheet-grab", "aria-hidden": "true" }),
      h("div", { class: "wb-sheet-body" },
        prev,
        h("div", { class: "wb-info" },
          h("h3", { id: uid + "-st", class: "wb-st" }, item.title),
          h("p", { class: "wb-credit" }, creator, h("span", { class: "wb-sep" }, " — "), source, h("span", { class: "wb-sep" }, " — "), lic),
          badges, dims, actions,
          h("div", { class: "wb-attrib" }, h("div", { class: "wb-attrib-h" }, h("strong", {}, "Credit line"), copyBtn),
            h("p", { class: "wb-attrib-t" }, item.credit)),
          h("p", { class: "wb-muted wb-small" }, "The credit travels with the design. ",
            item.shareAlike ? "Share-alike: anything you publish from this must use the same licence. " : "",
            item.commercialOk ? "" : "Not for commercial use (no paid tattoo work or merch). "))));
    sheet.hidden = false;
    root.classList.add("wb-sheet-open");
    requestAnimationFrame(() => sheet.classList.add("is-open"));
    sheetPanel.querySelector(".wb-btn--primary").focus({ preventScroll: true });
  }
  function closeSheet(silent = false) {
    if (!sheetCtx) return;
    sheetCtx.ctl.abort();
    const from = sheetCtx.fromEl;
    sheetCtx = null;
    sheet.classList.remove("is-open");
    sheet.hidden = true;
    root.classList.remove("wb-sheet-open");
    if (!silent && from && from.isConnected) from.focus({ preventScroll: true });
  }
  sheetBackdrop.addEventListener("click", () => closeSheet());
  const onDocKey = (e) => {
    // focus can fall back to <body> (e.g. after a click elsewhere) — still let Esc close the sheet
    if (e.key === "Escape" && sheetCtx && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); closeSheet(); }
  };
  document.addEventListener("keydown", onDocKey);
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
    if (e.key === "Tab") {
      const f = [...sheetPanel.querySelectorAll("button:not([disabled]), a[href]")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function publicItem(it, extra = {}) {
    const out = {};
    for (const k of ["id", "kind", "title", "creator", "creatorUrl", "source", "sourceUrl", "license", "licenseUrl", "url", "credit",
      "width", "height", "commercialOk", "shareAlike", "publicDomain"]) out[k] = it[k];
    return Object.assign(out, extra);
  }

  async function act(kind, clicked) {
    const ctx = sheetCtx;
    if (!ctx) return;
    const item = ctx.item;
    if (ctx.busy) return;
    ctx.busy = true;
    const btns = [...sheetPanel.querySelectorAll(".wb-actions button")];
    btns.forEach((b) => b.setAttribute("aria-disabled", "true"));
    clicked?.setAttribute("aria-busy", "true");
    clicked?.classList.add("is-busy");
    try {
      if (item.kind === "svg") {
        const svg = entrySvg(item._entry, { item });
        const pub = publicItem(item);
        if (kind === "use") await cb.onUse(pub, svg);
        else if (kind === "save") await cb.onSave(pub, svg);
        else {
          const blob = await canvasToBlob(pathCanvas(item._entry.d, 2048));
          await (kind === "cutout" ? cb.onCutout : cb.onPickForGeo)(pub, blob);
        }
      } else {
        let c = ctx.canvas;
        if (!c) {
          try { c = await (ctx.canvasP || imageItemCanvas(item, { signal: ctx.ctl.signal })); }
          catch (e) {
            if (e.kind !== "aborted") cb.toast(net.blocked ? OFFLINE_NOTE : "Couldn't download this image — the host blocked it. Try another one or open the original.");
            return;
          }
        }
        if (!c) return;
        c = copyCanvas(c);
        const pub = publicItem(item, { width: c.width, height: c.height });
        if (kind === "use") await cb.onUse(pub, c);
        else if (kind === "save") await cb.onSave(pub, c);
        else {
          const blob = await canvasToBlob(c);
          await (kind === "cutout" ? cb.onCutout : cb.onPickForGeo)(pub, blob);
        }
      }
      if (sheetCtx === ctx && (kind === "use" || kind === "cutout" || kind === "geo")) closeSheet();
    } catch (e) {
      console.warn("[webbank] action failed", e);
      cb.toast("Something went wrong — please try again.");
    } finally {
      ctx.busy = false;
      btns.forEach((b) => b.removeAttribute("aria-disabled"));
      clicked?.removeAttribute("aria-busy");
      clicked?.classList.remove("is-busy");
    }
  }

  async function copyCredit(item) {
    try { await navigator.clipboard.writeText(item.credit); cb.toast("Credit copied"); }
    catch {
      const t = sheetPanel.querySelector(".wb-attrib-t");
      if (t) { const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      cb.toast("Select the credit text to copy it");
    }
  }

  const onOffline = () => { net.blocked = true; setNote(OFFLINE_NOTE, "warn"); updateChips(); };
  const onOnline = () => { net.blocked = false; if (note.dataset.kind === "warn") setNote(""); updateChips(); };
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  if (navigator.onLine === false) onOffline();

  updateChips();

  return {
    focusSearch() { input.focus(); input.select(); },
    search(q) { state.cat = null; return doSearch(q); },
    destroy() {
      destroyed = true;
      if (run) run.ctl.abort();
      closeSheet(true);
      ro.disconnect(); io.disconnect();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("keydown", onDocKey);
      root.remove();
    },
  };
}

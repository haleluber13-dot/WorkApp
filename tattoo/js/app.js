/* InkForm 3D — app controller.

   Owns the store, the 3D viewer, the three tabs (Studio / Create / Sketch),
   the settings modal, and the `app` API that the UI and the AI assistant
   drive (see ARCHITECTURE.md). Feature modules are loaded with dynamic
   import so a problem in one never takes the whole app down. */

import * as THREE from "three";
import { Store, idb, uid, exportProject } from "./state.js";
import { SETTINGS, SETTING_BY_KEY, SKIN_TONES, INK_SWATCHES, createSettingsPanel, defaultSettings, coerceSetting } from "./settings.js";
import { Viewer } from "./viewer.js";
import { tattooFrame } from "./decal.js";
import { designCanvas, inkCanvas, forgetDesign } from "./ink.js";
import { isAndroidApp, saveToPhone } from "./android.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const V = (a) => new THREE.Vector3(...a);

const store = new Store();
const S = (k) => store.get(k);

let viewer = null;
let bodyMod = null, designsMod = null, sketchMod = null;
let regions = [];          // computed anchors for the current body
let regionList = [];       // static region metadata
let assistant = null;
let pad = null;            // SketchPad instance
let placingDesignId = null;

/* ════════════════════════════════════════════════════════════════════════
   helpers: theme, toast, units
   ════════════════════════════════════════════════════════════════════════ */
function applyTheme() {
  const root = document.documentElement;
  let theme = S("ui.theme");
  if (theme === "system") theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  root.dataset.theme = theme;
  root.style.setProperty("--accent", S("ui.accent"));
  root.style.setProperty("--fs", S("ui.fontScale"));
  document.body.classList.toggle("reduce-motion", !!S("ui.reduceMotion"));
  $('meta[name="theme-color"]').content = theme === "light" ? "#ffffff" : "#1b1b20";
}

let toastT = 0;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

const inch = () => S("place.units") === "in";
const fmtSize = (cm) => (inch() ? (cm / 2.54).toFixed(1) + " in" : (cm >= 10 ? cm.toFixed(0) : cm.toFixed(1)) + " cm");

const thumbCache = new Map();
const SAFE_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function thumbOf(d) {
  if (!d) return "";
  if (d.image) return SAFE_IMG.test(d.image) ? d.image : "";
  const k = d.id + ":" + (d.version || 0);
  if (!thumbCache.has(k)) thumbCache.set(k, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg || "<svg xmlns='http://www.w3.org/2000/svg'/>"));
  return thumbCache.get(k);
}

/* Files: browsers that allow it download directly; the sheet also shows the
   result so it can be saved by press-and-hold / right-click (embedded viewers
   block downloads). */
function download(name, href, { preview = true, text = null } = {}) {
  const isImg = /\.(png|jpe?g|svg)$/i.test(name);
  // inside claude.ai: use the viewer's own save (works in the Claude apps too)
  if (!isAndroidApp && window.claude?.use) {
    (async () => {
      let dl = null;
      try { dl = await window.claude.use("downloads"); } catch {}
      if (!dl) { showSaveSheet({ name, href, isImg, text }); return; }
      try {
        const blob = await (await fetch(href)).blob();
        await dl.save({ filename: name, data: blob });
        toast("Saved");
      } catch (e) {
        if (e?.code === "declined") return;
        showSaveSheet({ name, href, isImg, text });
      }
    })();
    return;
  }
  if (isAndroidApp) {
    // the Android app saves straight to the phone (Pictures / Downloads)
    saveToPhone(name, href).then((ok) => toast(ok ? (isImg ? "Saved to your Gallery (Pictures/InkForm)" : "Saved to Downloads") : "Couldn't save the file"))
      .catch(() => toast("Couldn't save the file"));
    return;
  }
  try {
    const a = document.createElement("a");
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  } catch {}
  if (preview) showSaveSheet({ name, href, isImg, text });
}
function showSaveSheet({ name, href, isImg, text }) {
  const m = $("#saveModal");
  $("#saveTitle").textContent = isImg ? "Your image" : "Your project file";
  $("#saveBody").innerHTML = isImg
    ? `<img src="${esc(href)}" alt="${esc(name)}"><p class="muted small">If it didn't download, press and hold the picture (phone) or right-click it (computer) and choose “Save image”.</p>`
    : `<textarea readonly rows="8" aria-label="Project file contents"></textarea><p class="muted small">If it didn't download, copy this text and keep it in a note — paste it back with Import.</p>`;
  if (!isImg) $("#saveBody textarea").value = text || "";
  $("#saveCopy").hidden = isImg;
  $("#saveDl").hidden = false;
  $("#saveDl").onclick = () => { try { const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch {} };
  m.hidden = false;
  document.body.classList.add("modal-open");
}
$("#saveClose").addEventListener("click", () => { $("#saveModal").hidden = true; document.body.classList.remove("modal-open"); });
$("#saveCopy").addEventListener("click", async () => {
  const ta = $("#saveBody textarea");
  try { await navigator.clipboard.writeText(ta.value); toast("Copied"); } catch { ta.select(); toast("Selected — press Ctrl+C / Copy"); }
});

/* In-app confirmation (embedded viewers block window.confirm). */
function askConfirm(msg, okLabel = "Yes", danger = true) {
  return new Promise((resolve) => {
    const m = $("#confirmModal");
    $("#confirmMsg").textContent = msg;
    const ok = $("#confirmOk"), no = $("#confirmNo");
    ok.textContent = okLabel;
    ok.className = "btn " + (danger ? "btn--dangerfill" : "btn--accent");
    const done = (v) => { m.hidden = true; document.body.classList.remove("modal-open"); ok.onclick = no.onclick = null; document.removeEventListener("keydown", key, true); resolve(v); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    ok.onclick = () => done(true); no.onclick = () => done(false);
    document.addEventListener("keydown", key, true);
    m.hidden = false;
    document.body.classList.add("modal-open");
    ok.focus();
  });
}
async function confirmIf(msg, okLabel = "Remove") {
  return !S("ui.confirmDelete") || askConfirm(msg, okLabel);
}

/* ════════════════════════════════════════════════════════════════════════
   regions
   ════════════════════════════════════════════════════════════════════════ */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function findRegion(q) {
  if (!q) return null;
  if (typeof q === "object" && q.id) q = q.id;
  const s = String(q);
  let r = regions.find((x) => x.id === s);
  if (r) return r;
  const n = norm(s);
  r = regions.find((x) => norm(x.id) === n || norm(x.label) === n);
  if (r) return r;
  r = regions.find((x) => (x.aliases || []).some((a) => norm(a) === n));
  if (r) return r;
  // whole-word overlap score (side words must agree); unknown words never match
  const STOP = new Set(["left", "right", "my", "the", "on", "of", "a", "an", "and", "side", "part", "body", "area", "spot"]);
  const toks = n.split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
  const side = /\bleft\b|\bl\b/.test(n) ? "left" : /\bright\b|\br\b/.test(n) ? "right" : null;
  if (!toks.length) return null;
  let best = null, bestScore = 0;
  for (const x of regions) {
    if (side && x.side !== side && x.side !== "center") continue;
    const words = new Set(norm([x.id, x.label, ...(x.aliases || [])].join(" ")).split(" "));
    let sc = 0;
    for (const t of toks) if (words.has(t) || words.has(t.replace(/s$/, ""))) sc += t.length;
    if (sc && side && x.side === side) sc += 0.5;
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  // most of the meaningful words must match
  const total = toks.reduce((a, t) => a + t.length, 0);
  return bestScore >= total * 0.6 ? best : null;
}

function nearestRegionId(p, n) {
  if (bodyMod?.nearestRegion) { try { return bodyMod.nearestRegion(regions, p, n); } catch {} }
  let best = null, bd = Infinity;
  for (const r of regions) {
    const d = (r.position[0] - p[0]) ** 2 + (r.position[1] - p[1]) ** 2 + (r.position[2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}
const regionLabel = (id) => regions.find((r) => r.id === id)?.label || regionList.find((r) => r.id === id)?.label || (id ? id.replace(/_/g, " ") : "Body");

/* rotation that makes a design's "up" follow the body part's natural axis */
function rotationForUp(normal, up) {
  if (!up) return 0;
  const fr = tattooFrame(V(normal), 0);
  const n = V(normal).normalize();
  const u = V(up).addScaledVector(n, -V(up).dot(n));
  if (u.lengthSq() < 1e-6) return 0;
  u.normalize();
  return Math.round(Math.atan2(u.dot(fr.right), u.dot(fr.up)) * 180 / Math.PI);
}

/* first body part (default first) that doesn't already carry a tattoo */
function freeRegion() {
  const prefs = [S("designs.defaultRegion"), "left_forearm_inner", "right_forearm_inner", "left_forearm_outer", "right_forearm_outer",
    "left_upper_arm_outer", "right_upper_arm_outer", "left_chest", "right_chest", "upper_back", "left_calf", "right_calf",
    "left_thigh_front", "right_thigh_front", "left_ribs", "right_ribs", "lower_back", "stomach"];
  for (const id of prefs) {
    const r = regions.find((x) => x.id === id);
    if (!r) continue;
    const busy = store.tattoos.some((t) => Math.hypot(t.position[0] - r.position[0], t.position[1] - r.position[1], t.position[2] - r.position[2]) < Math.max(0.05, t.sizeCm / 200));
    if (!busy) return r.id;
  }
  return S("designs.defaultRegion");
}

/* ════════════════════════════════════════════════════════════════════════
   body
   ════════════════════════════════════════════════════════════════════════ */
let bodyBuild = { running: false, pending: false, first: true, snapOnly: false, promise: null };
const wrapDeg = (r) => ((r % 360) + 540) % 360 - 180;

function regionFrame(r) {
  const n = V(r.normal).normalize();
  const up = V(r.up || [0, 1, 0]).addScaledVector(n, -V(r.up || [0, 1, 0]).dot(n)).normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  return { n, up, right };
}

/* Keep a tattoo's on-skin orientation when its normal changes a lot near the
   top of shoulders/feet, where the world-up reference frame swaps. */
function carryRotation(oldN, rot, newN) {
  if (Math.abs(oldN[1]) < 0.85 && Math.abs(newN[1]) < 0.85) return rot;
  return rotationForUp(newN, tattooFrame(V(oldN), rot).up.toArray());
}

/* Rebuild the body mesh for the current settings. Tattoos follow their body
   part (position and orientation relative to it). After undo/import the stored
   positions already belong to the restored body, so they are only snapped. */
function rebuildBody() {
  if (!bodyMod) return Promise.resolve();
  if (bodyBuild.running) { bodyBuild.pending = true; return bodyBuild.promise; }
  bodyBuild.running = true;
  $("#bodyLoading").classList.remove("done");
  bodyBuild.promise = (async () => {
    try {
      do {
        bodyBuild.pending = false;
        const res = await bodyMod.buildBody(store.body());
        if (bodyBuild.pending) continue; // a newer request arrived while building
        const snap = bodyBuild.first || bodyBuild.snapOnly;
        bodyBuild.snapOnly = false;
        // anchors are taken after the await, so no edit can slip in between
        const anchors = new Map();
        if (!snap) {
          for (const t of store.tattoos) {
            const r = regions.find((x) => x.id === t.region) || regions.find((x) => x.id === nearestRegionId(t.position, t.normal));
            if (!r) continue;
            const f = regionFrame(r), d = V(t.position).sub(V(r.position));
            anchors.set(t.id, { id: r.id, a: d.dot(f.right), b: d.dot(f.up), c: d.dot(f.n), rel: t.rotation - rotationForUp(t.normal, r.up) });
          }
        }
        regions = res.regions || [];
        viewer.setBody(res.geometry, regions);
        for (const t of store.tattoos) {
          const an = anchors.get(t.id);
          const r = an && regions.find((x) => x.id === an.id);
          if (!r) {
            const c = viewer.surface.closestPoint(V(t.position));
            if (c) {
              const n = viewer.surface.normalAt(c.point, c.faceIndex).toArray();
              t.rotation = wrapDeg(carryRotation(t.normal, t.rotation, n));
              t.position = c.point.toArray(); t.normal = n;
            }
            continue;
          }
          const f = regionFrame(r);
          const p = V(r.position).addScaledVector(f.right, an.a).addScaledVector(f.up, an.b).addScaledVector(f.n, an.c);
          const c = viewer.surface.closestPoint(p);
          if (c) {
            t.position = c.point.toArray(); t.normal = viewer.surface.normalAt(c.point, c.faceIndex).toArray();
            t.rotation = wrapDeg(rotationForUp(t.normal, r.up) + an.rel);
          }
        }
        viewer.rebuildAll();
        if (bodyBuild.first) { viewer.frameBody(false); bodyBuild.first = false; }
        store.save();
        syncTattoos();
        updateBodyChip();
      } while (bodyBuild.pending);
    } catch (e) {
      console.error(e);
      toast("Couldn't build the 3D body: " + e.message, 5000);
    } finally {
      bodyBuild.running = false;
      $("#bodyLoading").classList.add("done");
    }
  })();
  return bodyBuild.promise;
}
let bodyT = 0;
function scheduleBody(ms = 220) { clearTimeout(bodyT); bodyT = setTimeout(rebuildBody, ms); }

function updateBodyChip() {
  const h = S("body.heightCm");
  const hs = inch() ? `${Math.floor(Math.round(h / 2.54) / 12)}′${Math.round(h / 2.54) % 12}″` : `${h} cm`;
  $("#bodyLabel").textContent = `${S("body.sex") === "female" ? "Female" : "Male"} · ${hs}`;
}

/* ════════════════════════════════════════════════════════════════════════
   tattoo textures
   ════════════════════════════════════════════════════════════════════════ */
const texCache = new Map(); // key → { texture, widthScale, aspect } | { pending: Promise }
const lastTex = new Map();  // tattoo id → last ready texture entry

function lookOf(t) {
  return {
    // opacity is applied by the material; age is quantized so slider drags reuse textures
    ink: t.ink || "original", color: t.color || S("ink.defaultColor"), age: Math.round((t.age || 0) * 20) / 20, opacity: 1,
    blend: S("ink.blend"), saturation: S("ink.saturation"), density: S("ink.density"), softness: S("ink.softness"),
    freshGlow: S("ink.freshGlow"), removeWhite: S("ink.removeWhite"), whiteThreshold: S("ink.whiteThreshold"),
  };
}
function texKey(d, look) {
  return [d.id, d.version || 0, S("ink.textureRes"), look.ink, look.color, look.age.toFixed(2), look.opacity.toFixed(2), look.blend,
    look.saturation, look.density, look.softness, look.freshGlow, look.removeWhite, look.whiteThreshold].join("|");
}
function makeTexture(canvas) {
  const tx = new THREE.CanvasTexture(canvas);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = viewer.renderer.capabilities.getMaxAnisotropy();
  tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
  return tx;
}
function getTexture(d, look) {
  const key = texKey(d, look);
  const hit = texCache.get(key);
  if (hit) { hit.used = performance.now(); return hit.texture ? hit : null; }
  const entry = { used: performance.now(), key };
  texCache.set(key, entry);
  entry.pending = designCanvas(d, +S("ink.textureRes")).then((base) => {
    const c = inkCanvas(base, look);
    entry.texture = makeTexture(c);
    entry.aspect = base.height / base.width;
    entry.widthScale = base.width / base.artW; // padding → physical size
    syncTattoos();
  }).catch((e) => { console.warn("design render failed", e); texCache.delete(key); });
  pruneTextures();
  return null;
}
function ensureTexture(d, look) {
  const e = getTexture(d, look);
  if (e) return Promise.resolve(e);
  const entry = texCache.get(texKey(d, look));
  return (entry?.pending || Promise.reject(new Error("texture failed"))).then(() => entry.texture ? entry : Promise.reject(new Error("texture failed")));
}
/* free a texture nobody shows any more (superseded look of a tattoo) */
function releaseTexture(e) {
  if (!e.texture || [...lastTex.values()].includes(e)) return;
  e.texture.dispose();
  texCache.delete(e.key);
}
function pruneTextures() {
  if (texCache.size < 24) return;
  const inUse = new Set(lastTex.values());
  const old = [...texCache.entries()].filter(([, e]) => e.texture && !inUse.has(e)).sort((a, b) => a[1].used - b[1].used).slice(0, 12);
  for (const [k, e] of old) { e.texture.dispose(); texCache.delete(k); }
}

/* ════════════════════════════════════════════════════════════════════════
   sync: store → 3D + panels
   ════════════════════════════════════════════════════════════════════════ */
let syncQueued = false;
function syncTattoos() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => { syncQueued = false; doSync(); });
}
function doSync() {
  if (!viewer) return;
  const items = [];
  for (const t of store.tattoos) {
    const d = store.design(t.designId);
    if (!d) continue;
    // while a new look is being processed keep showing the previous one
    let e = getTexture(d, lookOf(t));
    const prev = lastTex.get(t.id);
    if (e) { lastTex.set(t.id, e); if (prev && prev !== e) releaseTexture(prev); }
    else e = prev;
    if (!e?.texture) continue;
    const widthM = (t.sizeCm / 100) * e.widthScale;
    items.push({ tattoo: t, texture: e.texture, widthM, heightM: widthM * e.aspect, blend: S("ink.blend"), opacity: t.opacity ?? 1 });
  }
  if (viewer.surface) viewer.syncTattoos(items, store.selectedId);
  if (lastTex.size > store.tattoos.length) for (const id of [...lastTex.keys()]) if (!store.tattoos.some((t) => t.id === id)) lastTex.delete(id);
  pruneTextures();
  renderPlaced();
  renderInspector();
  updateUndo();
  updateInset();
}
/* on phones the inspector / library are bottom sheets over the 3D view */
function updateInset() {
  if (!viewer) return;
  const overlay = matchMedia("(max-width: 900px)").matches;
  let b = 0;
  if (overlay) {
    if (document.body.classList.contains("lib-open")) b = $("#leftPanel").offsetHeight;
    else if (!$("#inspector").hidden) b = $("#inspector").offsetHeight;
  }
  viewer.setInsetBottom(b);
  // keep the camera bar above a bottom sheet
  $(".camerabar").style.bottom = overlay && b && !document.body.classList.contains("lib-open") ? `${b + 10}px` : "";
  layoutFloating();
}
addEventListener("resize", () => updateInset());
// tools inside tabs build their own toolbars: keep the AI button clear of them
{
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(layoutFloating, 150); })
    .observe(document.querySelector(".views"), { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
}

/* Place the floating AI button where it covers nothing: beside side panels,
   above bottom sheets, toolbars and primary buttons. */
function layoutFloating() {
  const fab = document.querySelector(".ink-assistant .ia-fab");
  if (!fab) return;
  const W = innerWidth, H = innerHeight;
  const fw = fab.offsetWidth || 90, fh = fab.offsetHeight || 52;
  let right = 18;
  const side = (el) => el && !el.hidden && el.offsetParent && getComputedStyle(el).position !== "absolute" ? el.getBoundingClientRect() : null;
  // a right-hand side panel (not a full-width bottom sheet) pushes the button left
  const sidePanel = (el) => { const r = el && el.offsetParent && !el.hidden ? el.getBoundingClientRect() : null; return r && r.width < W * 0.6 && r.left > W / 2 && r.height > H * 0.5 ? r : null; };
  const sideRect = currentTab === "studio" ? side($("#inspector"))
    : currentTab === "create" ? (side($(".create__editor")) || sidePanel($("#geoHost .gm-right")))
    : currentTab === "photo" ? sidePanel($("#photoHost .ps-panel")) : null;
  if (sideRect && sideRect.left > W / 2) right = W - sideRect.left + 18;
  const tabs = $(".mobtabs");
  const mob = tabs && getComputedStyle(tabs).display !== "none" ? tabs.offsetHeight : 0;
  let bottom = mob + 14;
  const obstacles = [];
  const add = (sel) => { const el = typeof sel === "string" ? $(sel) : sel; if (el && el.offsetParent && !el.hidden) obstacles.push(el.getBoundingClientRect()); };
  if (currentTab === "studio") { add(".camerabar"); add("#mobLib"); if (!sideRect) add("#inspector"); }
  if (currentTab === "sketch") { add(".sketchbar"); $$(".sketchpad .sp-bottombar, .sketchpad [class*='bottom']").forEach(add); }
  if (currentTab === "create") { add(".create__actions"); $$("#geoHost [class*='toolbar'], #geoHost [class*='outbar'], #geoHost [class*='actions']").forEach(add); }
  if (currentTab === "photo") { add("#photoHost .ps-outbar"); $$("#photoHost [class*='strip']").forEach(add); }
  for (let i = 0; i < 6; i++) {
    const r = { left: W - right - fw, right: W - right, top: H - bottom - fh, bottom: H - bottom };
    const hit = obstacles.find((o) => o.width && o.height && o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top);
    if (!hit) break;
    bottom = H - hit.top + 10;
  }
  document.body.style.setProperty("--fab-right", right + "px");
  document.body.style.setProperty("--fab-bottom", Math.min(bottom, H - fh - 70) + "px");
}

/* ════════════════════════════════════════════════════════════════════════
   the app API (used by UI + AI assistant)
   ════════════════════════════════════════════════════════════════════════ */
function resolveDesign(designId) {
  return store.design(designId) || store.design(store.activeDesignId) || store.designs.find((d) => !d.deleted) || null;
}

function generate(styleId, opts = {}, name) {
  if (!designsMod) throw new Error("Design engine is still loading");
  const out = designsMod.generateDesign(styleId, opts);
  const style = designsMod.STYLES.find((s) => s.id === styleId);
  return {
    id: uid("d"), name: name || out.name || style?.name || "Design", style: styleId, kind: "svg",
    svg: out.svg, width: out.width, height: out.height, params: out.params || { styleId, opts }, createdAt: Date.now(),
  };
}

/* Move a tattoo over the skin by (right, up) cm. "up" follows the body part's
   natural axis (toward the head / along the limb) — or the screen when
   frame === "camera" (arrow keys and nudge buttons). The tattoo keeps its
   orientation on the skin. */
function moveAlongSkin(t, rightCm, upCm, frame) {
  const r = regions.find((x) => x.id === t.region);
  let ref;
  if (frame === "camera") ref = new THREE.Vector3(0, 1, 0).applyQuaternion(viewer.camera.quaternion).toArray();
  else ref = r?.up || [0, 1, 0];
  const walkRot = rotationForUp(t.normal, ref);
  const rel = t.rotation - walkRot;
  const w = viewer.surface.walk(V(t.position), V(t.normal), walkRot, rightCm / 100, upCm / 100);
  const n = w.normal.toArray();
  t.position = w.position.toArray();
  t.rotation = wrapDeg(carryRotation(t.normal, walkRot, n) + rel);
  t.normal = n;
  t.region = nearestRegionId(t.position, t.normal);
}

const app = {
  getState() {
    return {
      body: store.body(),
      tattoos: store.tattoos.map((t) => ({ ...t, regionLabel: regionLabel(t.region), designName: store.design(t.designId)?.name, style: store.design(t.designId)?.style })),
      selectedId: store.selectedId,
      activeDesignId: store.activeDesignId,
      designs: store.designs.filter((d) => !d.deleted).map((d) => ({ id: d.id, name: d.name, style: d.style, kind: d.kind })),
      view: currentTab,
      units: S("place.units"),
    };
  },
  listRegions() {
    return (regions.length ? regions : regionList).map((r) => ({
      id: r.id, label: r.label, group: r.group, side: r.side, aliases: r.aliases || [], sizeCm: r.sizeCm,
      up: r.up, normal: r.normal, defaultRotation: r.normal && r.up ? rotationForUp(r.normal, r.up) : 0,
    }));
  },
  listStyles() {
    return (designsMod?.STYLES || []).map((s) => ({ id: s.id, name: s.name, category: s.category, description: s.description, options: s.options }));
  },
  listSubjects() { return designsMod?.SUBJECTS || []; },
  listSettings() {
    return SETTINGS.filter((s) => s.type !== "action" && s.group !== "hidden").map((s) => ({
      key: s.key, label: s.label, group: s.group, type: s.type, min: s.min, max: s.max, step: s.step, default: s.default,
      choices: s.choices || (s.swatches ? s.swatches.map((c) => ({ value: c.value, label: c.label || c.value })) : undefined),
    }));
  },
  getSetting: (k) => S(k),
  setSetting(k, v) { setSetting(k, v); return S(k); },

  createDesign({ styleId, opts, prompt, name } = {}) {
    let sid = styleId, o = { ...(opts || {}) };
    if (prompt && designsMod) {
      const g = designsMod.designFromPrompt(prompt, o.seed);
      if (!sid) sid = g.styleId;
      o = { ...g.opts, ...o };
    }
    if (!sid) sid = S("designs.defaultStyle");
    if (!designsMod?.STYLES.some((s) => s.id === sid)) sid = designsMod?.STYLES[0]?.id;
    const d = generate(sid, o, name);
    // the same request again: reuse the design already in the library
    const same = store.designs.find((x) => !x.deleted && x.svg === d.svg);
    if (same) { store.activeDesignId = same.id; store.save(); renderLibrary(); return same; }
    store.addDesign(d);
    renderLibrary();
    return d;
  },
  addSvgDesign({ name = "AI design", svg, style = "custom", credit = null }) {
    if (!/<svg[\s>]/i.test(svg || "")) throw new Error("Not an SVG");
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
    const d = { id: uid("d"), name, style, kind: "svg", svg, width: vb ? +vb[1] : 1000, height: vb ? +vb[2] : 1000, createdAt: Date.now(), ...(credit ? { credit } : {}) };
    store.addDesign(d);
    renderLibrary();
    return d;
  },
  addImageDesign({ name = "Image", image, width, height, style = "sketch", credit = null }) {
    const d = { id: uid("d"), name, style, kind: "image", image, width, height, createdAt: Date.now(), ...(credit ? { credit } : {}) };
    store.addDesign(d);
    renderLibrary();
    return d;
  },

  placeTattoo({ designId, region, position, normal, sizeCm, rotation, offsetCm, ink, color, age, opacity } = {}) {
    const d = resolveDesign(designId);
    if (!d) throw new Error("There is no design yet — create one first");
    if (!viewer.surface) throw new Error("The body is still loading");
    let r = null, p, n;
    if (position) {
      const c = viewer.surface.closestPoint(V(position));
      p = c.point; n = normal ? V(normal) : viewer.surface.normalAt(c.point, c.faceIndex);
    } else {
      r = region ? findRegion(region) : (findRegion(freeRegion()) || regions[0]);
      if (!r) throw new Error("I don't know the body part “" + region + "”");
      p = V(r.position); n = V(r.normal);
    }
    const rot = rotation ?? (r ? rotationForUp(n.toArray(), r.up) : 0);
    let size = sizeCm;
    if (size == null) {
      size = r && S("place.useRegionSize") && r.sizeCm ? r.sizeCm : S("place.defaultSizeCm");
      const aspect = (d.height || 1) / (d.width || 1);
      // tall designs: keep the long side within the body part's natural size
      if (aspect > 1.15) size = size / Math.min(aspect, 2.2) * 1.35;
    }
    const t = {
      id: uid("t"), designId: d.id, region: r?.id || nearestRegionId(p.toArray()),
      position: p.toArray(), normal: n.toArray(), rotation: rot, sizeCm: clamp(+size, 0.8, 80),
      opacity: opacity ?? 1, ink: ink || S("ink.defaultMode"), color: color || S("ink.defaultColor"),
      flip: false, age: age ?? S("ink.defaultAge"), visible: true, createdAt: Date.now(),
    };
    if (offsetCm && (offsetCm.right || offsetCm.up)) moveAlongSkin(t, +offsetCm.right || 0, +offsetCm.up || 0);
    if (placingDesignId) stopPlacing();
    store.checkpoint();
    store.tattoos.push(t);
    store.selectedId = t.id;
    store.activeDesignId = d.id;
    store.save();
    syncTattoos();
    if (S("place.focusOnPlace")) viewer.focusOn(t.position, t.normal, t.sizeCm / 100);
    showTip("placed");
    return { ...t, regionLabel: regionLabel(t.region) };
  },

  updateTattoo(id, patch = {}, { checkpoint = true } = {}) {
    const t = store.tattoo(id);
    if (!t) throw new Error("No tattoo selected");
    const pr = patch.region ? findRegion(patch.region) : null;
    if (patch.region && !pr) throw new Error("I don't know the body part “" + patch.region + "”");
    if (patch.designId && !store.design(patch.designId)) throw new Error("Unknown design");
    if (checkpoint) store.checkpoint();
    if (patch.region) {
      const r = pr;
      t.position = [...r.position]; t.normal = [...r.normal]; t.region = r.id;
      if (patch.rotation == null && patch.rotateBy == null) t.rotation = rotationForUp(r.normal, r.up);
    }
    if (patch.position) {
      const c = viewer.surface.closestPoint(V(patch.position));
      if (c) { t.position = c.point.toArray(); t.normal = (patch.normal ? V(patch.normal) : viewer.surface.normalAt(c.point, c.faceIndex)).toArray(); }
      t.region = nearestRegionId(t.position, t.normal);
    }
    if (patch.sizeCm != null) t.sizeCm = clamp(+patch.sizeCm, 0.8, 80);
    if (patch.scaleBy != null) t.sizeCm = clamp(t.sizeCm * +patch.scaleBy, 0.8, 80);
    if (patch.rotation != null) t.rotation = +patch.rotation;
    if (patch.rotateBy != null) t.rotation += +patch.rotateBy;
    t.rotation = ((t.rotation % 360) + 540) % 360 - 180;
    if (patch.moveCm && viewer.surface) moveAlongSkin(t, patch.moveCm.right || 0, patch.moveCm.up || 0, patch.moveCm.frame);
    for (const k of ["opacity", "ink", "color", "flip", "age", "visible", "designId"]) if (patch[k] != null) t[k] = patch[k];
    if (patch.opacity != null) t.opacity = clamp(+t.opacity, 0.05, 1);
    if (patch.age != null) t.age = clamp(+t.age, 0, 1);
    if (patch.designId) store.activeDesignId = patch.designId;
    store.selectedId = t.id;
    store.save();
    syncTattoos();
    return { ...t, regionLabel: regionLabel(t.region) };
  },

  removeTattoo(id) {
    const t = store.tattoo(id);
    if (!t) return false;
    store.checkpoint();
    store.tattoos = store.tattoos.filter((x) => x !== t);
    if (store.selectedId === t.id) store.selectedId = null;
    store.save(); syncTattoos();
    return true;
  },
  clearTattoos() {
    if (!store.tattoos.length) return;
    store.checkpoint();
    store.tattoos = []; store.selectedId = null;
    store.save(); syncTattoos();
  },
  selectTattoo(id) {
    const t = id ? store.tattoo(id) : null;
    store.selectedId = t ? t.id : null;
    if (t) store.activeDesignId = t.designId;
    store.save(); syncTattoos();
    return t || null;
  },
  duplicateTattoo(id, { mirror = false } = {}) {
    const t = store.tattoo(id);
    if (!t) throw new Error("No tattoo selected");
    const c = { ...t, id: uid("t"), position: [...t.position], normal: [...t.normal], createdAt: Date.now() };
    if (mirror) {
      if (Math.abs(t.position[0]) < 0.015) throw new Error("This tattoo is in the middle of the body — there's no other side to copy it to");
      const p = V([-t.position[0], t.position[1], t.position[2]]);
      const hit = viewer.surface.closestPoint(p);
      c.position = hit.point.toArray();
      c.normal = viewer.surface.normalAt(hit.point, hit.faceIndex).toArray();
      c.rotation = -t.rotation;
      c.region = nearestRegionId(c.position, c.normal);
      // a mirrored pair faces each other (but never mirror lettering or drawings)
      const d = store.design(t.designId), o = d?.params?.opts || {};
      const hasText = String(d?.style || "").startsWith("lettering") || (o.text && (o.banner || /lettering/.test(d?.style)));
      if (d && d.kind === "svg" && !hasText) c.flip = !t.flip;
    } else {
      const off = clamp(t.sizeCm * 0.2, 1.5, 4);
      moveAlongSkin(c, off, -off, "camera");
    }
    store.checkpoint();
    store.tattoos.push(c);
    store.selectedId = c.id;
    store.save(); syncTattoos();
    return { ...c, regionLabel: regionLabel(c.region) };
  },
  reorderTattoo(id, dir) {
    const t = store.tattoo(id);
    const i = store.tattoos.indexOf(t), j = clamp(i + dir, 0, store.tattoos.length - 1);
    if (i < 0 || i === j) return;
    store.checkpoint();
    store.tattoos.splice(i, 1); store.tattoos.splice(j, 0, t);
    store.save(); syncTattoos();
  },

  async setBody(params = {}) {
    store.checkpoint();
    const SD = bodyMod?.SEX_DEFAULTS;
    if (SD && params.sex && params.heightCm == null && params.sex !== S("body.sex") && S("body.heightCm") === SD[S("body.sex")]?.heightCm) {
      params = { ...params, heightCm: SD[params.sex]?.heightCm };
    }
    for (const [k, v] of Object.entries(params)) if (SETTING_BY_KEY["body." + k]) store.settings["body." + k] = coerceSetting("body." + k, v);
    store.save(); updateBodyChip(); renderBodyPop();
    await rebuildBody();
    return store.body();
  },
  focus(target) {
    if (/^(my )?face$/i.test(String(target || "")) && viewer.focusFace()) return true;
    const t = target && store.tattoos.find((x) => x.id === target || (target === "selected" && x.id === store.selectedId));
    if (t) { viewer.focusOn(t.position, t.normal, t.sizeCm / 100); return true; }
    const r = findRegion(target);
    if (r) { viewer.focusOn(r.position, r.normal, (r.sizeCm || 10) / 100 * 1.4); return true; }
    viewer.frameBody();
    return false;
  },
  viewFrom(side) { if (side === "fit" || side === "all") viewer.frameBody(); else viewer.viewFrom(side); },
  undo() { const ok = store.undo(); if (!ok) toast("Nothing to undo"); return ok; },
  redo() { const ok = store.redo(); if (!ok) toast("Nothing to redo"); return ok; },
  screenshot(opts) { return viewer.screenshot(opts); },
  openSketch(designId) { showTab("sketch"); if (designId) loadIntoSketch(store.design(designId)); },
  showTab: (t) => showTab(t),
  toast,
};
window.inkApp = app; // handy for debugging & automation

/* ════════════════════════════════════════════════════════════════════════
   settings
   ════════════════════════════════════════════════════════════════════════ */
let lastBodyCheckpoint = 0;
function setSetting(key, value, { live = false } = {}) {
  if (key.startsWith("body.") && performance.now() - lastBodyCheckpoint > 1200) { store.checkpoint(); }
  if (key.startsWith("body.")) lastBodyCheckpoint = performance.now();
  const SD = bodyMod?.SEX_DEFAULTS, prevSex = S("body.sex");
  store.set(key, value);
  // switching body: keep the height typical for it unless the user changed it
  if (key === "body.sex" && SD && S("body.sex") !== prevSex && S("body.heightCm") === SD[prevSex]?.heightCm) store.set("body.heightCm", SD[S("body.sex")].heightCm);
}

function onSettingChanged({ key }) {
  if (key.startsWith("body.")) { scheduleBody(key === "body.detail" ? 0 : 260); updateBodyChip(); if (!$("#bodyPop").contains(document.activeElement)) renderBodyPop(); }
  if (key.startsWith("skin.") || key.startsWith("scene.") || key.startsWith("place.") || key === "ui.reduceMotion") {
    viewer?.applySettings(store.settings);
    $("#camSpin")?.classList.toggle("on", !!S("scene.autoRotate"));
  }
  if (key.startsWith("ink.") || key === "place.units") syncTattoos();
  if (key.startsWith("ui.")) { applyTheme(); viewer?.applySettings(store.settings); photo?.setSettings?.({ theme: document.documentElement.dataset.theme }); }
  if (key === "place.units") { updateBodyChip(); renderBodyPop(); }
  if (key.startsWith("sketch.") && pad) pad.setSettings(sketchSettings());
  if (key === "skin.tone") photo?.setSettings?.({ skinColor: S("skin.tone") });
  if (key === "skin.tone" && !$("#bodyPop").contains(document.activeElement)) renderBodyPop();
}

let settingsPanel = null;
function openSettings(group) {
  if (!settingsPanel) {
    settingsPanel = createSettingsPanel({
      get: S,
      set: (k, v, o) => setSetting(k, v, o),
      act: runAction,
    });
    $("#settingsCard").appendChild(settingsPanel.el);
    settingsPanel.el.querySelector("[data-close]").addEventListener("click", closeSettings);
  }
  settingsPanel.show(group);
  settingsReturnFocus = document.activeElement;
  $("#settingsModal").hidden = false;
  document.body.classList.add("modal-open");
  settingsPanel.el.querySelector(".settings__tabs .on")?.focus();
}
let settingsReturnFocus = null;
function closeSettings() { $("#settingsModal").hidden = true; document.body.classList.remove("modal-open"); settingsReturnFocus?.focus?.(); }

async function runAction(a) {
  switch (a) {
    case "exportProject": {
      const proj = await exportProject(store, pad ? pad.getState?.() : await idb.get("sketch"));
      const json = JSON.stringify(proj);
      const blob = new Blob([json], { type: "application/json" });
      download(`inkform-project-${new Date().toISOString().slice(0, 10)}.json`, URL.createObjectURL(blob), { text: json });
      toast("Project exported");
      break;
    }
    case "importProject": $("#fileImport").click(); break;
    case "saveScreenshot": saveShot(); break;
    case "clearTattoos": if (await confirmIf("Remove every tattoo from the body?")) app.clearTattoos(); break;
    case "resetSettings":
      if (!(await askConfirm("Reset all settings to their defaults? Your designs and tattoos stay.", "Reset settings"))) break;
      store.checkpoint();
      { const keep = store.settings["ai.apiKey"]; store.settings = { ...defaultSettings(), "ai.apiKey": keep }; }
      store.saveNow(); applyTheme(); viewer.applySettings(store.settings); scheduleBody(0); syncTattoos(); updateBodyChip(); renderBodyPop();
      toast("Settings reset");
      break;
    case "resetAll":
      if (!(await askConfirm("Erase everything — designs, tattoos, sketch and settings? This can't be undone.", "Erase everything"))) break;
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("inkform.")) localStorage.removeItem(k); } catch {}
      await idb.del("designs"); await idb.del("sketch"); await idb.del("projects"); await idb.del("avatars");
      location.reload();
      break;
  }
}

/* Validate an imported project file: keep only well-formed designs/tattoos. */
function sanitizeProject(p) {
  if (!p || !Array.isArray(p.tattoos) || !Array.isArray(p.designs)) throw new Error("this isn't an InkForm project file");
  const okId = (x) => typeof x === "string" && /^[\w-]{1,64}$/.test(x);
  const vec = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === "number" && isFinite(x));
  const num = (x) => typeof x === "number" && isFinite(x);
  const designs = p.designs.filter((d) => d && okId(d.id) && (
    (typeof d.svg === "string" && /<svg[\s>]/i.test(d.svg) && !/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(d.svg)) ||
    (typeof d.image === "string" && SAFE_IMG.test(d.image))
  )).map((d) => ({
    id: d.id, name: String(d.name || "Design").slice(0, 80), style: String(d.style || "custom").slice(0, 40),
    kind: d.image ? "image" : "svg", ...(d.image ? { image: d.image } : { svg: d.svg }),
    width: num(d.width) ? d.width : 1000, height: num(d.height) ? d.height : 1000,
    params: d.params && typeof d.params === "object" ? d.params : undefined, createdAt: num(d.createdAt) ? d.createdAt : Date.now(),
    ...(d.credit && typeof d.credit === "object" ? { credit: Object.fromEntries(["title", "creator", "source", "license", "licenseUrl", "url"].map((k) => [k, String(d.credit[k] || "").slice(0, 300)])) } : {}),
  }));
  const ids = new Set(designs.map((d) => d.id));
  const tattoos = p.tattoos.filter((t) => t && okId(t.id) && ids.has(t.designId) && vec(t.position) && vec(t.normal) && num(t.sizeCm) && num(t.rotation))
    .map((t) => ({
      id: t.id, designId: t.designId, region: okId(t.region) ? t.region : null, position: t.position, normal: t.normal,
      rotation: t.rotation, sizeCm: clamp(t.sizeCm, 0.8, 80), opacity: num(t.opacity) ? clamp(t.opacity, 0.05, 1) : 1,
      ink: ["original", "black", "color", "stencil"].includes(t.ink) ? t.ink : "original",
      color: /^#[0-9a-f]{6}$/i.test(t.color || "") ? t.color : "#141414", flip: !!t.flip,
      age: num(t.age) ? clamp(t.age, 0, 1) : 0, visible: t.visible !== false, createdAt: num(t.createdAt) ? t.createdAt : Date.now(),
    }));
  return { designs, tattoos, settings: p.settings && typeof p.settings === "object" ? p.settings : null, sketch: p.sketch || null };
}

$("#fileImport").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const p = sanitizeProject(JSON.parse(await f.text()));
    store.checkpoint();
    const known = new Set(store.designs.map((d) => d.id));
    store.designs = [...p.designs.filter((d) => !known.has(d.id)), ...store.designs];
    store.tattoos = p.tattoos;
    store.selectedId = null;
    if (p.settings) for (const [k, v] of Object.entries(p.settings)) if (SETTING_BY_KEY[k] && SETTING_BY_KEY[k].type !== "action" && k !== "ai.apiKey") store.settings[k] = coerceSetting(k, v);
    if (p.sketch) { await idb.set("sketch", p.sketch); if (pad?.setState) pad.setState(p.sketch); }
    store.saveNow(); await store.saveDesigns();
    applyTheme(); viewer.applySettings(store.settings);
    bodyBuild.snapOnly = true; // stored positions belong to the imported body
    await rebuildBody();
    renderLibrary(); syncTattoos(); updateBodyChip(); renderBodyPop();
    toast(`Imported ${p.tattoos.length} tattoos and ${p.designs.length} designs`);
  } catch (err) {
    toast("Couldn't import: " + err.message, 4000);
  }
});

async function saveShot() {
  try {
    const url = await viewer.screenshot();
    download(`inkform-${Date.now()}.png`, url);
    toast("Image saved");
  } catch (e) { toast("Couldn't save the image"); }
}

/* ════════════════════════════════════════════════════════════════════════
   tabs
   ════════════════════════════════════════════════════════════════════════ */
let currentTab = "studio";
function showTab(tab) {
  if (!["studio", "create", "sketch", "photo"].includes(tab)) tab = "studio";
  currentTab = tab;
  if (tab !== "studio" && placingDesignId) stopPlacing();
  document.body.dataset.tab = tab;
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== tab));
  $$(".tabs [data-tab], .mobtabs [data-tab]").forEach((b) => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
  if (tab === "create") initCreate();
  if (tab === "sketch") initSketch();
  if (tab === "photo") initPhoto();
  if (tab === "studio") viewer?._resize();
  requestAnimationFrame(layoutFloating);
  try { if (location.hash.replace(/^#\/?/, "") !== tab) history.replaceState(null, "", "#" + tab); } catch {}
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$$('[data-open="settings"]').forEach((b) => b.addEventListener("click", () => openSettings()));
$("#btnSettings").addEventListener("click", () => openSettings());
$("#settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
$("#btnUndo").addEventListener("click", () => app.undo());
$("#btnRedo").addEventListener("click", () => app.redo());
$("#btnShot").addEventListener("click", saveShot);
function updateUndo() {
  $("#btnUndo").disabled = !store.undoStack.length;
  $("#btnRedo").disabled = !store.redoStack.length;
}

/* ════════════════════════════════════════════════════════════════════════
   Studio: library, placed list, placing, inspector, body popover
   ════════════════════════════════════════════════════════════════════════ */
$$("[data-ltab]").forEach((b) => b.addEventListener("click", () => {
  $$("[data-ltab]").forEach((x) => x.classList.toggle("on", x === b));
  $$("[data-lpane]").forEach((p) => (p.hidden = p.dataset.lpane !== b.dataset.ltab));
}));

function renderLibrary() {
  const g = $("#libGrid");
  const list = store.designs.filter((d) => !d.deleted);
  g.innerHTML = list.map((d) => `
    <div class="libitem ${d.id === store.activeDesignId ? "on" : ""}" data-id="${esc(d.id)}" role="button" tabindex="0" title="${esc(d.name)} — tap to place on the body">
      <img src="${esc(thumbOf(d))}" alt="${esc(d.name)}" loading="lazy">
      <span class="libitem__name">${esc(d.name)}</span>
      <button class="libitem__del" data-del="${esc(d.id)}" aria-label="Delete design ${esc(d.name)}">✕</button>
    </div>`).join("");
  $("#libEmpty").hidden = list.length > 0;
}
$("#libGrid").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    const id = del.dataset.del;
    const used = store.tattoos.filter((t) => t.designId === id).length;
    if (!(await confirmIf(used ? `This design is used by ${used} tattoo(s) on the body. Delete it and them?` : "Delete this design?"))) return;
    // soft delete: undo can bring back tattoos that use it; purged at next start when unused
    if (used) { store.checkpoint(); store.tattoos = store.tattoos.filter((t) => t.designId !== id); if (!store.tattoos.some((t) => t.id === store.selectedId)) store.selectedId = null; store.save(); }
    store.updateDesign(id, { deleted: true });
    if (store.activeDesignId === id) store.activeDesignId = store.designs.find((d) => !d.deleted)?.id || null;
    renderLibrary(); syncTattoos();
    toast(used ? "Design and its tattoos removed — Ctrl+Z brings the tattoos back" : "Design deleted");
    return;
  }
  const it = e.target.closest(".libitem");
  if (it) startPlacing(it.dataset.id);
});
$("#libGrid").addEventListener("keydown", (e) => {
  if (e.target.closest("[data-del]")) return; // let the delete button handle its own Enter/Space
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.closest(".libitem")?.click(); }
});

$("#quickGen").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#quickPrompt").value.trim();
  if (!q) { $("#quickPrompt").focus(); return; }
  try {
    const d = app.createDesign({ prompt: q });
    $("#quickPrompt").value = "";
    startPlacing(d.id);
    if (!showTip("place")) toast(`“${d.name}” is ready — tap the body to place it`);
  } catch (err) { toast(err.message); }
});

function renderPlaced() {
  $("#placedCount").textContent = store.tattoos.length;
  $("#placedEmpty").hidden = store.tattoos.length > 0;
  $("#placedList").innerHTML = store.tattoos.slice().reverse().map((t) => {
    const d = store.design(t.designId);
    return `<li class="${t.id === store.selectedId ? "on" : ""}" data-id="${esc(t.id)}">
      <img src="${esc(thumbOf(d))}" alt="">
      <div class="meta"><b>${esc(d?.name || "Missing design")}</b><small>${esc(regionLabel(t.region))} · ${fmtSize(t.sizeCm)}</small></div>
      <button class="eye" data-eye="${esc(t.id)}" title="${t.visible === false ? "Show" : "Hide"}" aria-label="${t.visible === false ? "Show" : "Hide"}">${t.visible === false ? "🙈" : "👁"}</button>
    </li>`;
  }).join("");
}
$("#placedList").addEventListener("click", (e) => {
  const eye = e.target.closest("[data-eye]");
  if (eye) { const t = store.tattoo(eye.dataset.eye); app.updateTattoo(t.id, { visible: t.visible === false }); return; }
  const li = e.target.closest("li");
  if (li) { app.selectTattoo(li.dataset.id); app.focus(li.dataset.id); closeLib(); }
});

/* placing mode */
function startPlacing(designId) {
  const d = store.design(designId);
  if (!d || !viewer) return;
  store.activeDesignId = d.id; store.save();
  renderLibrary();
  if (currentTab !== "studio") showTab("studio");
  closeLib();
  placingDesignId = d.id;
  const look = lookOf({ ink: S("ink.defaultMode"), color: S("ink.defaultColor"), age: S("ink.defaultAge"), opacity: 1 });
  look.blend = "vivid";
  const size = S("place.defaultSizeCm");
  const go = (e) => {
    if (placingDesignId !== d.id) return;
    const wm = size / 100 * e.widthScale;
    viewer.startPlacing(e.texture, wm, wm * e.aspect);
  };
  ensureTexture(d, look).then(go).catch(() => toast("Couldn't load that design"));
  $("#placeThumb").src = thumbOf(d);
  $("#placeBar").hidden = false;
  document.body.classList.add("placing");
  $("#placeRegion").value = "";
  showTip("place");
  layoutFloating();
}
function stopPlacing() {
  placingDesignId = null;
  viewer?.stopPlacing();
  $("#placeBar").hidden = true;
  document.body.classList.remove("placing");
}
$("#placeCancel").addEventListener("click", stopPlacing);
$("#placeRegion").addEventListener("change", (e) => {
  if (!e.target.value || !placingDesignId) return;
  const id = placingDesignId;
  stopPlacing();
  try { app.placeTattoo({ designId: id, region: e.target.value }); } catch (err) { toast(err.message); }
});
function fillRegionSelect() {
  const groups = {};
  for (const r of (regions.length ? regions : regionList)) (groups[r.group || "body"] ||= []).push(r);
  const nice = { "head-neck": "Head & neck", arms: "Arms", hands: "Hands", "torso-front": "Chest & stomach", "torso-back": "Back", legs: "Legs", feet: "Feet" };
  $("#placeRegion").innerHTML = `<option value="">Choose a body part…</option>` + Object.entries(groups).map(([g, rs]) =>
    `<optgroup label="${esc(nice[g] || g)}">${rs.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</optgroup>`).join("");
}

/* inspector */
let inspFor = null;
function renderInspector() {
  const el = $("#inspector");
  const t = store.tattoo(store.selectedId);
  if (!store.selectedId || !t) { el.hidden = true; inspFor = null; return; }
  el.hidden = false;
  if (inspFor === t.id + "|" + t.designId + "|" + t.ink + "|" + S("place.units") && el.dataset.ready) { refreshInspector(t); return; }
  inspFor = t.id + "|" + t.designId + "|" + t.ink + "|" + S("place.units");
  el.dataset.ready = "1";
  const d = store.design(t.designId);
  const u = inch();
  el.innerHTML = `<div class="insp">
    <div class="insp__head">
      <img src="${esc(thumbOf(d))}" alt="">
      <div class="meta"><b>${esc(d?.name || "Design")}</b><small class="muted" id="iRegion">${esc(regionLabel(t.region))}</small>${creditHtml(d)}</div>
      <button class="iconbtn insp__min" id="iMin" aria-label="Show more controls" aria-expanded="false">⌃</button>
      <button class="iconbtn closeinsp" id="iClose" aria-label="Deselect">✕</button>
    </div>
    <section>
      <h4>Size</h4>
      <div class="numrow"><input type="range" id="iSize" aria-label="Size" min="${u ? 0.4 : 1}" max="${u ? 31.5 : 80}" step="${u ? 0.1 : 0.5}"><input type="number" id="iSizeN" step="${u ? 0.1 : 0.5}" aria-label="Size"><span class="muted">${u ? "in" : "cm"}</span></div>
    </section>
    <section>
      <h4>Rotation</h4>
      <div class="numrow"><button class="btn btn--small" data-rot="-15" aria-label="Rotate left 15°">⟲</button><input type="range" id="iRot" min="-180" max="180" step="1" aria-label="Rotation"><button class="btn btn--small" data-rot="15" aria-label="Rotate right 15°">⟳</button><input type="number" id="iRotN" step="1" aria-label="Rotation"><span class="muted">°</span></div>
    </section>
    <section>
      <h4>Position</h4>
      <div class="row" style="align-items:flex-start;gap:12px">
        <div class="nudge" aria-label="Nudge">
          <span></span><button data-nudge="0,1" aria-label="Up">▲</button><span></span>
          <button data-nudge="-1,0" aria-label="Left">◀</button><button data-focus title="Zoom to tattoo" aria-label="Zoom to tattoo">◎</button><button data-nudge="1,0" aria-label="Right">▶</button>
          <span></span><button data-nudge="0,-1" aria-label="Down">▼</button><span></span>
        </div>
        <div style="flex:1"><label class="muted small">Move to</label><select id="iRegionSel" style="width:100%" aria-label="Move to body part"></select>
          <p class="muted small" style="margin:6px 0 0">Or drag the tattoo on the body.</p></div>
      </div>
    </section>
    <section>
      <h4>Ink</h4>
      <div class="seg" id="iInk">
        <button data-ink="original">Design</button><button data-ink="black">Black</button><button data-ink="color">Color</button><button data-ink="stencil">Stencil</button>
      </div>
      <div class="tones" id="iColors" style="margin-top:8px" ${t.ink === "color" ? "" : "hidden"}>${INK_SWATCHES.map((c) => `<button class="tone" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("")}<input type="color" id="iColor" aria-label="Custom ink color"></div>
      <div class="field"><div class="lbl"><span>Opacity</span><output id="iOpO"></output></div><input type="range" id="iOp" aria-label="Opacity" min="0.05" max="1" step="0.01"></div>
      <div class="field"><div class="lbl"><span>Age: fresh → healed → old</span><output id="iAgeO"></output></div><input type="range" id="iAge" aria-label="Age" min="0" max="1" step="0.01"></div>
      <label class="check field"><input type="checkbox" id="iFlip"> Mirror the design</label>
    </section>
    <section>
      <h4>Actions</h4>
      <div class="actions">
        <button class="btn" data-act="dup">Duplicate</button>
        <button class="btn" data-act="mirror">Copy to other side</button>
        <button class="btn" data-act="edit">Edit in Sketch</button>
        <button class="btn" data-act="hide">Hide</button>
        <button class="btn" data-act="back">Send back</button>
        <button class="btn" data-act="front">Bring front</button>
        <button class="btn btn--danger" data-act="del" style="grid-column:span 2">Remove tattoo</button>
      </div>
    </section>
  </div>`;
  const rs = el.querySelector("#iRegionSel");
  rs.innerHTML = $("#placeRegion").innerHTML.replace("Choose a body part…", "Body part…");
  refreshInspector(t);
  applyInspMin();
}
/* phones: the inspector opens as a short "peek" sheet (size + rotation); ⌃ shows everything */
let inspMin = true;
function applyInspMin() {
  const el = $("#inspector");
  el.classList.toggle("is-min", inspMin);
  const b = el.querySelector("#iMin");
  if (b) { b.textContent = inspMin ? "⌃" : "⌄"; b.setAttribute("aria-expanded", String(!inspMin)); b.setAttribute("aria-label", inspMin ? "Show more controls" : "Show fewer controls"); }
  requestAnimationFrame(updateInset);
}
function refreshInspector(t) {
  const el = $("#inspector"), u = inch();
  const set = (sel, v) => { const i = el.querySelector(sel); if (i && document.activeElement !== i) i.value = v; };
  const size = u ? +(t.sizeCm / 2.54).toFixed(1) : +t.sizeCm.toFixed(1);
  set("#iSize", size); set("#iSizeN", size);
  set("#iRot", Math.round(t.rotation)); set("#iRotN", Math.round(t.rotation));
  set("#iOp", t.opacity ?? 1); set("#iAge", t.age || 0);
  set("#iColor", t.color || "#b3242f");
  el.querySelector("#iOpO").textContent = Math.round((t.opacity ?? 1) * 100) + "%";
  const a = t.age || 0;
  el.querySelector("#iAgeO").textContent = a < 0.08 ? "Fresh" : a < 0.4 ? "Healed" : a < 0.75 ? "Settled" : "Old";
  el.querySelector("#iFlip").checked = !!t.flip;
  el.querySelector("#iRegion").textContent = regionLabel(t.region);
  set("#iRegionSel", "");
  el.querySelectorAll("[data-ink]").forEach((b) => b.classList.toggle("on", b.dataset.ink === (t.ink || "original")));
  el.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === t.color));
  el.querySelector('[data-act="hide"]').textContent = t.visible === false ? "Show" : "Hide";
}

/* inspector events: live slider changes skip extra undo steps */
let liveCk = null;
function liveUpdate(patch) {
  const t = store.tattoo(store.selectedId);
  if (!t) return;
  if (liveCk !== t.id) { store.checkpoint(); liveCk = t.id; }
  app.updateTattoo(t.id, patch, { checkpoint: false });
}
const insp = $("#inspector");
insp.addEventListener("input", (e) => {
  const id = e.target.id, v = +e.target.value, u = inch();
  if (id === "iSize" || id === "iSizeN") { if (v > 0) liveUpdate({ sizeCm: u ? v * 2.54 : v }); }
  else if (id === "iRot" || id === "iRotN") liveUpdate({ rotation: S("place.snapRotation") ? Math.round(v / 15) * 15 : v });
  else if (id === "iOp") liveUpdate({ opacity: v });
  else if (id === "iAge") liveUpdate({ age: v });
  else if (id === "iColor") liveUpdate({ color: e.target.value, ink: "color" });
});
insp.addEventListener("change", (e) => {
  liveCk = null;
  if (/^i(Size|Rot)N$/.test(e.target.id)) { const t = store.tattoo(store.selectedId); if (t) { e.target.blur(); refreshInspector(t); } }
  if (e.target.id === "iFlip") app.updateTattoo("selected", { flip: e.target.checked });
  if (e.target.id === "iRegionSel" && e.target.value) { app.updateTattoo("selected", { region: e.target.value }); app.focus("selected"); }
});
insp.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const t = store.tattoo(store.selectedId);
  if (!t) return;
  if (b.id === "iClose") { app.selectTattoo(null); return; }
  if (b.id === "iMin") { inspMin = !inspMin; applyInspMin(); return; }
  if (b.dataset.rot) app.updateTattoo(t.id, { rotateBy: +b.dataset.rot });
  if (b.dataset.nudge) { const [x, y] = b.dataset.nudge.split(",").map(Number); app.updateTattoo(t.id, { moveCm: { right: x * 0.5, up: y * 0.5, frame: "camera" } }); }
  if ("focus" in b.dataset) app.focus(t.id);
  if (b.dataset.ink) { app.updateTattoo(t.id, { ink: b.dataset.ink }); }
  if (b.dataset.color) app.updateTattoo(t.id, { color: b.dataset.color, ink: "color" });
  switch (b.dataset.act) {
    case "dup": app.duplicateTattoo(t.id); break;
    case "mirror": try { app.duplicateTattoo(t.id, { mirror: true }); toast("Copied to the other side"); } catch (err) { toast(err.message, 3500); } break;
    case "edit": app.openSketch(t.designId); break;
    case "hide": app.updateTattoo(t.id, { visible: t.visible === false }); break;
    case "back": app.reorderTattoo(t.id, -1); break;
    case "front": app.reorderTattoo(t.id, 1); break;
    case "del": if (await confirmIf("Remove this tattoo?")) app.removeTattoo(t.id); break;
  }
});

/* body popover */
function renderBodyPop() {
  const p = $("#bodyPop");
  if (p.hidden) return;
  const sl = (k, label) => {
    const s = SETTING_BY_KEY[k], v = S(k);
    let o = s.max <= 1 ? Math.round(v * 100) + "%" : v + (s.unit || "");
    if (k === "body.heightCm" && inch()) { const i = Math.round(v / 2.54); o = `${Math.floor(i / 12)}′${i % 12}″`; }
    return `<div class="field"><div class="lbl"><span>${label}</span><output>${o}</output></div><input type="range" aria-label="${label}" data-bk="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"></div>`;
  };
  const avHtml = `<div class="field"><div class="lbl"><span>My avatars</span></div>
      <div class="avatars">${avatars.map((a) => `<div class="avatar ${a.id === S("body.avatarId") ? "on" : ""}"><button class="avatar__use" data-av="${esc(a.id)}" style="all:unset;cursor:pointer;display:block">${a.thumb ? `<img src="${esc(a.thumb)}" alt="">` : `<span class="avatar__ph"></span>`}${esc(a.name)}</button><button class="avatar__del" data-avdel="${esc(a.id)}" aria-label="Delete avatar ${esc(a.name)}">✕</button></div>`).join("") || `<span class="muted small">None yet — scan yourself to make one.</span>`}</div>
      <button class="btn btn--accent scanbtn" data-scan>📷 Scan me — make my avatar</button>
      <button class="btn scanbtn" data-face>🙂 ${currentAvatar()?.face ? "Change my face" : "Add my face (selfie)"}</button>
      ${currentAvatar()?.face ? `<div class="row"><button class="btn btn--small scanbtn" data-seeface>👀 See my face</button><button class="btn btn--small scanbtn" data-noface>Remove face</button></div>` : ""}
      <button class="btn btn--small scanbtn" data-saveav>Save this body as an avatar</button></div>`;
  p.innerHTML = avHtml + `
    <div class="seg"><button data-sex="male" class="${S("body.sex") === "male" ? "on" : ""}">Male</button><button data-sex="female" class="${S("body.sex") === "female" ? "on" : ""}">Female</button></div>
    ${sl("body.heightCm", "Height")}${sl("body.build", "Build")}${sl("body.muscle", "Muscle")}${sl("body.shoulders", "Shoulders")}
    ${sl("body.chest", S("body.sex") === "female" ? "Bust" : "Chest")}${sl("body.hips", "Hips")}${sl("body.legLength", "Leg length")}${sl("body.armPose", "Arm pose")}
    <div class="field"><div class="lbl"><span>Skin tone</span></div><div class="tones">${SKIN_TONES.map((t) => `<button class="tone ${t.value === S("skin.tone") ? "on" : ""}" data-tone="${t.value}" style="--c:${t.value}" title="${t.label}" aria-label="${t.label}"></button>`).join("")}</div></div>
    <div class="field row"><button class="btn btn--small" data-bodyreset>Reset body</button><button class="btn btn--small" data-more>More settings</button></div>`;
}
$("#bodyToggle").addEventListener("click", () => {
  const p = $("#bodyPop");
  p.hidden = !p.hidden;
  $("#bodyToggle").setAttribute("aria-expanded", String(!p.hidden));
  renderBodyPop();
});
document.addEventListener("pointerdown", (e) => {
  if (!$("#bodyPop").hidden && !e.target.closest("#bodyChip")) { $("#bodyPop").hidden = true; $("#bodyToggle").setAttribute("aria-expanded", "false"); }
});
$("#bodyPop").addEventListener("input", (e) => {
  const k = e.target.dataset.bk;
  if (!k) return;
  setSetting(k, +e.target.value, { live: true });
  const o = e.target.previousElementSibling.querySelector("output"), s = SETTING_BY_KEY[k], v = +e.target.value;
  o.textContent = s.max <= 1 ? Math.round(v * 100) + "%" : (k === "body.heightCm" && inch()) ? `${Math.floor(Math.round(v / 2.54) / 12)}′${Math.round(v / 2.54) % 12}″` : v + (s.unit || "");
});
$("#bodyPop").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.sex) { setSetting("body.sex", b.dataset.sex); renderBodyPop(); }
  if (b.dataset.tone) { setSetting("skin.tone", b.dataset.tone); renderBodyPop(); }
  if ("scan" in b.dataset) { openScan(); return; }
  if ("face" in b.dataset) { openFace(); return; }
  if ("seeface" in b.dataset) { $("#bodyPop").hidden = true; $("#bodyToggle").setAttribute("aria-expanded", "false"); viewer.focusFace(); return; }
  if ("noface" in b.dataset) { const a = currentAvatar(); if (a) { delete a.face; await persistAvatars(); refreshFace(); renderBodyPop(); } return; }
  if ("saveav" in b.dataset) { saveBodyAsAvatar(); return; }
  if (b.dataset.av) { const a = avatars.find((x) => x.id === b.dataset.av); if (a) applyAvatar(a); return; }
  if (b.dataset.avdel) {
    const a = avatars.find((x) => x.id === b.dataset.avdel);
    if (a && await askConfirm(`Delete the avatar “${a.name}”?`, "Delete")) {
      avatars = avatars.filter((x) => x !== a); await persistAvatars();
      if (S("body.avatarId") === a.id) { store.settings["body.avatarId"] = ""; store.save(); refreshFace(); }
      renderBodyPop();
    }
    return;
  }
  if ("bodyreset" in b.dataset) {
    store.checkpoint();
    for (const s of SETTINGS) if (s.key.startsWith("body.") && s.key !== "body.sex" && s.key !== "body.detail") store.settings[s.key] = s.default;
    store.save(); scheduleBody(0); updateBodyChip(); renderBodyPop();
  }
  if ("more" in b.dataset) { $("#bodyPop").hidden = true; openSettings("body"); }
});

/* camera bar */
$(".camerabar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cam]");
  if (!b) return;
  const c = b.dataset.cam;
  if (c === "spin") setSetting("scene.autoRotate", !S("scene.autoRotate"));
  else if (c === "shot") saveShot();
  else app.viewFrom(c);
});

/* mobile library sheet */
function closeLib() { document.body.classList.remove("lib-open"); updateInset(); }
$("#mobLib").addEventListener("click", () => { document.body.classList.toggle("lib-open"); updateInset(); });

/* tips */
function showTip(kind) {
  if (!S("ui.hints")) return false;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem("inkform.tips") || "{}"); } catch {}
  if (seen[kind]) return false;
  const msgs = {
    welcome: "Pick a design, then tap the body to place it — or tap ✦ AI and just say what you want.",
    place: "Tap anywhere on the body to place the design. Drag to turn the body; pinch or scroll to zoom.",
    placed: "Drag the tattoo to slide it over the skin · drag the round handle to resize and rotate.",
  };
  const h = $("#studioHint");
  h.textContent = msgs[kind]; h.hidden = false;
  seen[kind] = 1;
  try { localStorage.setItem("inkform.tips", JSON.stringify(seen)); } catch {}
  clearTimeout(showTip.t);
  showTip.t = setTimeout(() => (h.hidden = true), 6500);
  showTip.last = Date.now();
  return true;
}

/* ════════════════════════════════════════════════════════════════════════
   Create tab
   ════════════════════════════════════════════════════════════════════════ */
let createReady = false;
const cur = { styleId: null, opts: {}, svg: "", name: "" };
let catSel = "all";

function initCreate() {
  if (createReady || !designsMod) { if (!designsMod) toast("Loading the design engine…"); return; }
  createReady = true;
  const cats = designsMod.STYLE_CATEGORIES || [...new Set(designsMod.STYLES.map((s) => s.category))].map((c) => ({ id: c, name: c }));
  $("#catBar").innerHTML = `<button data-cat="all" class="on">All styles</button>` + cats.map((c) => {
    const id = c.id ?? c, name = c.name ?? c.label ?? c;
    return `<button data-cat="${esc(id)}">${esc(name)}</button>`;
  }).join("");
  renderStyleGrid();
  selectStyle(S("designs.defaultStyle"));
}
function renderStyleGrid() {
  const list = designsMod.STYLES.filter((s) => catSel === "all" || s.category === catSel);
  $("#styleGrid").innerHTML = list.map((s) => `
    <button class="stylecard ${s.id === cur.styleId ? "on" : ""}" data-style="${s.id}">
      <div class="thumb"><img data-thumb="${s.id}" alt=""></div>
      <b>${esc(s.name)}</b><small>${esc(s.description || "")}</small>
    </button>`).join("");
  // render thumbnails lazily, a few per frame
  const imgs = $$("#styleGrid img[data-thumb]");
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < imgs.length && performance.now() - t0 < 24) {
      const img = imgs[i++];
      if (!img.isConnected) continue;
      try {
        const out = designsMod.generateDesign(img.dataset.thumb, { seed: 7 });
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(out.svg);
      } catch (e) { console.warn("thumb", img.dataset.thumb, e); }
    }
    if (i < imgs.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
$("#catBar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  catSel = b.dataset.cat;
  $$("#catBar button").forEach((x) => x.classList.toggle("on", x === b));
  renderStyleGrid();
});
$("#styleGrid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-style]");
  if (b) selectStyle(b.dataset.style);
});

function selectStyle(id, opts) {
  const style = designsMod.STYLES.find((s) => s.id === id) || designsMod.STYLES[0];
  cur.styleId = style.id;
  cur.opts = {};
  for (const o of style.options || []) cur.opts[o.key] = o.default;
  if (opts) Object.assign(cur.opts, opts);
  $$("#styleGrid .stylecard").forEach((c) => c.classList.toggle("on", c.dataset.style === style.id));
  renderOpts(style);
  regenerate(true);
}
function renderOpts(style) {
  const box = $("#createOpts");
  box.innerHTML = (style.options || []).map((o) => {
    const v = cur.opts[o.key];
    let ctl = "";
    switch (o.type) {
      case "range": ctl = `<div class="lbl"><span>${esc(o.label)}</span><output>${v}</output></div><input type="range" data-o="${o.key}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${v}">`; break;
      case "select": ctl = `<div class="lbl"><span>${esc(o.label)}</span></div><select data-o="${o.key}" style="width:100%">${(o.choices || []).map((c) => { const cv = c.value ?? c, cl = c.label ?? c; return `<option value="${esc(cv)}" ${String(cv) === String(v) ? "selected" : ""}>${esc(cl)}</option>`; }).join("")}</select>`; break;
      case "color": ctl = `<div class="lbl"><span>${esc(o.label)}</span></div><div class="tones">${INK_SWATCHES.map((c) => `<button class="tone ${c === v ? "on" : ""}" data-oc="${o.key}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("")}<input type="color" data-o="${o.key}" value="${esc(v)}"></div>`; break;
      case "text": ctl = `<div class="lbl"><span>${esc(o.label)}</span></div><input type="text" data-o="${o.key}" value="${esc(v)}" style="width:100%">`; break;
      case "bool": ctl = `<label class="check"><input type="checkbox" data-o="${o.key}" ${v ? "checked" : ""}> ${esc(o.label)}</label>`; break;
      case "seed": return "";
      default: return "";
    }
    return `<div class="field">${ctl}</div>`;
  }).join("");
}
let regenT = 0;
function regenerate(now = false) {
  clearTimeout(regenT);
  const run = () => {
    try {
      const out = designsMod.generateDesign(cur.styleId, cur.opts);
      cur.svg = out.svg; cur.w = out.width; cur.h = out.height; cur.params = out.params || { ...cur.opts };
      cur.name = out.name || designsMod.STYLES.find((s) => s.id === cur.styleId)?.name || "Design";
      $("#createPreview").innerHTML = `<img alt="Design preview" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}">`;
      $("#createName").value = cur.name;
    } catch (e) {
      console.error(e);
      $("#createPreview").innerHTML = `<p class="muted">This combination didn't work — try other options.</p>`;
    }
  };
  if (now) run(); else regenT = setTimeout(run, S("designs.liveRegenerate") ? 60 : 400);
}
$("#createOpts").addEventListener("input", (e) => {
  const k = e.target.dataset.o;
  if (!k) return;
  const style = designsMod.STYLES.find((s) => s.id === cur.styleId);
  const o = style.options.find((x) => x.key === k);
  let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  if (o.type === "range") { v = +v; e.target.previousElementSibling.querySelector("output").textContent = v; }
  cur.opts[k] = v;
  if (S("designs.liveRegenerate") || o.type !== "range") regenerate();
});
$("#createOpts").addEventListener("change", () => regenerate());
$("#createOpts").addEventListener("click", (e) => {
  const b = e.target.closest("[data-oc]");
  if (!b) return;
  cur.opts[b.dataset.oc] = b.dataset.c;
  $$(`[data-oc="${b.dataset.oc}"]`).forEach((x) => x.classList.toggle("on", x === b));
  regenerate(true);
});
$("#createShuffle").addEventListener("click", () => {
  const style = designsMod.STYLES.find((s) => s.id === cur.styleId);
  const seedOpt = (style.options || []).find((o) => o.type === "seed");
  cur.opts[seedOpt?.key || "seed"] = Math.floor(Math.random() * 1e6);
  regenerate(true);
});
$("#createPrompt").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#createPromptInput").value.trim();
  if (!q || !designsMod) return;
  const g = designsMod.designFromPrompt(q);
  if (catSel !== "all") { catSel = "all"; $$("#catBar button").forEach((x) => x.classList.toggle("on", x.dataset.cat === "all")); renderStyleGrid(); }
  selectStyle(g.styleId, g.opts);
  $(`#styleGrid [data-style="${g.styleId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
function curDesign() {
  return {
    id: uid("d"), name: $("#createName").value.trim() || cur.name, style: cur.styleId, kind: "svg",
    svg: cur.svg, width: cur.w, height: cur.h, params: { styleId: cur.styleId, opts: { ...cur.opts } }, createdAt: Date.now(),
  };
}
$("#createSave").addEventListener("click", () => { if (!cur.svg) return; store.addDesign(curDesign()); renderLibrary(); toast("Saved to your designs"); });
$("#createPlace").addEventListener("click", () => {
  if (!cur.svg) return;
  const d = store.addDesign(curDesign());
  renderLibrary();
  showTab("studio");
  if (S("designs.autoPlace")) {
    try {
      app.placeTattoo({ designId: d.id, region: freeRegion() });
      if (Date.now() - (showTip.last || 0) > 800) toast("Placed — drag it anywhere on the body");
    } catch (e) { toast(e.message); }
  } else startPlacing(d.id);
});
$("#createSketch").addEventListener("click", () => { if (!cur.svg) return; const d = store.addDesign(curDesign()); renderLibrary(); app.openSketch(d.id); });
$("#createDownload").addEventListener("click", () => {
  if (!cur.svg) return;
  download(`${($("#createName").value || "tattoo").replace(/[^\w-]+/g, "-")}.svg`, URL.createObjectURL(new Blob([cur.svg], { type: "image/svg+xml" })));
});

/* ════════════════════════════════════════════════════════════════════════
   Sketch tab
   ════════════════════════════════════════════════════════════════════════ */
function sketchSettings() {
  return {
    defaultBrush: S("sketch.defaultBrush"), defaultSize: S("sketch.defaultSize"), smoothing: S("sketch.smoothing"),
    pressure: S("sketch.pressure"), symmetry: S("sketch.symmetry"), radialCount: S("sketch.radialCount"),
    showGrid: S("sketch.showGrid"), background: S("sketch.background"), skinColor: S("skin.tone"), canvasSize: +S("sketch.canvasSize"),
  };
}
let sketchInit = null;
function initSketch() {
  if (sketchInit) return sketchInit;
  sketchInit = (async () => {
    try {
      sketchMod = await import("./sketch/sketchpad.js");
      const size = +S("sketch.canvasSize");
      pad = new sketchMod.SketchPad($("#sketchHost"), { width: size, height: size, settings: sketchSettings() });
      pad.onDownload = (canvas, name) => download(name, canvas.toDataURL("image/png"));
      const saved = await idb.get("sketch");
      if (saved && pad.setState) { try { await pad.setState(saved); } catch (e) { console.warn(e); } }
      let t = 0;
      pad.on?.("change", () => { clearTimeout(t); t = setTimeout(() => pad.getState && idb.set("sketch", pad.getState()), 600); });
    } catch (e) {
      console.error(e);
      $("#sketchHost").innerHTML = `<p class="muted" style="padding:20px">The sketch studio couldn't load: ${esc(e.message)}</p>`;
    }
  })();
  return sketchInit;
}
async function loadIntoSketch(d) {
  await initSketch();
  if (!pad || !d) return;
  pad.loadImage(d.image || d.svg);
  $("#sketchName").value = d.name + " (edit)";
  toast("Loaded into a new layer — draw on top");
}
function sketchToDesign() {
  if (!pad || pad.isEmpty?.()) { toast("Draw something first"); return null; }
  const c = (pad.toTrimmedCanvas && pad.toTrimmedCanvas(12)) || pad.toCanvas();
  if (!c) { toast("Draw something first"); return null; }
  return app.addImageDesign({ name: $("#sketchName").value.trim() || "My sketch", image: c.toDataURL("image/png"), width: c.width, height: c.height });
}
$("#sketchSave").addEventListener("click", () => { if (sketchToDesign()) toast("Saved to your designs"); });
$("#sketchUse").addEventListener("click", () => {
  const d = sketchToDesign();
  if (!d) return;
  showTab("studio");
  try { app.placeTattoo({ designId: d.id, region: freeRegion() }); if (Date.now() - (showTip.last || 0) > 800) toast("Placed — drag it anywhere on the body"); }
  catch (e) { toast(e.message); }
});
$("#sketchNew").addEventListener("click", async () => {
  if (!pad) return;
  if (!pad.isEmpty?.() && !(await askConfirm("Start a new sketch? The current drawing will be cleared — save it to your designs first if you want to keep it.", "Start new"))) return;
  pad.clear(); $("#sketchName").value = "My sketch";
});

/* Credit line for designs that came from the web library (license requirement). */
function creditHtml(d) {
  const c = d?.credit;
  if (!c) return "";
  const lic = c.licenseUrl && /^https?:/.test(c.licenseUrl) ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license || "license")}</a>` : esc(c.license || "");
  const src = c.url && /^https?:/.test(c.url) ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.source || "source")}</a>` : esc(c.source || "");
  return `<p class="credit">${esc(c.title || "")}${c.creator ? " — " + esc(c.creator) : ""} · ${src} · ${lic}</p>`;
}

/* ════════════════════════════════════════════════════════════════════════
   Create → Web library (openly licensed drawings, photos and art)
   ════════════════════════════════════════════════════════════════════════ */
let web = null, webInit = null;
function creditOf(item) {
  return { title: item.title || "", creator: item.creator || "", source: item.source || "", license: item.license || "", licenseUrl: item.licenseUrl || "", url: item.url || "" };
}
function webToDesign(item, art) {
  const name = (item.title || "Web design").slice(0, 60);
  if (typeof art === "string") return app.addSvgDesign({ name, svg: art, style: "web", credit: creditOf(item) });
  return app.addImageDesign({ name, image: art.toDataURL("image/png"), width: art.width, height: art.height, style: "web", credit: creditOf(item) });
}
function initWeb() {
  if (webInit) return webInit;
  webInit = (async () => {
    try {
      const m = await import("./webbank/webbank.js");
      web = m.mountWebBank($("#webHost"), {
        toast,
        onUse(item, art) {
          const d = webToDesign(item, art);
          showTab("studio");
          try { app.placeTattoo({ designId: d.id, region: freeRegion() }); toast("Placed — drag it anywhere on the body"); } catch (e) { toast(e.message); }
        },
        onSave(item, art) { webToDesign(item, art); toast("Saved to your designs"); },
        onPickForGeo(item, blob) { sendToGeo(blob, item.title || "Web picture"); },
        async onCutout(item, blob) {
          const f = new File([blob], (item.title || "web-image").replace(/[^\w-]+/g, "-").slice(0, 40) + ".png", { type: blob.type || "image/png" });
          await openInPhoto([f]);
        },
      });
    } catch (e) {
      console.error(e);
      $("#webHost").innerHTML = `<p class="muted" style="padding:20px">The web library couldn't load: ${esc(e.message)}</p>`;
    }
  })();
  return webInit;
}
/* Create → Geometric maker: shapes filled with photos, low-poly / half & half effects */
let geo = null, geoInit = null;
function initGeo() {
  if (geoInit) return geoInit;
  geoInit = (async () => {
    try {
      const m = await import("./geo/geomaker.js");
      const asDesign = (canvas, name) => app.addImageDesign({ name: name || "Geometric", image: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, style: "geometric-maker" });
      geo = m.mountGeoMaker($("#geoHost"), {
        toast,
        onUse(canvas, name) {
          const d = asDesign(canvas, name);
          showTab("studio");
          try { app.placeTattoo({ designId: d.id, region: freeRegion() }); toast("Placed — drag it anywhere on the body"); } catch (e) { toast(e.message); }
        },
        onSave(canvas, name) { asDesign(canvas, name); toast("Saved to your designs"); },
        onSketch(canvas, name) { const d = asDesign(canvas, name); app.openSketch(d.id); },
        onExport(canvas, name) { download(`${(name || "geometric").replace(/[^\w-]+/g, "-")}.png`, canvas.toDataURL("image/png")); },
        getDesigns: () => store.designs.filter((d) => !d.deleted).map((d) => ({ id: d.id, name: d.name, thumb: thumbOf(d) })),
        getDesignCanvas: (id) => designCanvas(store.design(id), 1536),
      });
      window.inkGeo = geo;
    } catch (e) {
      console.error(e);
      $("#geoHost").innerHTML = `<p class="muted" style="padding:20px">The geometric maker couldn't load: ${esc(e.message)}</p>`;
    }
  })();
  return geoInit;
}
async function sendToGeo(blobOrCanvas, name) {
  showTab("create"); setCreateMode("geo");
  await initGeo();
  try { await geo?.addPhoto(blobOrCanvas, name); toast("Added to the geometric maker — put it in a shape"); } catch (e) { toast(e.message || "Couldn't add that picture"); }
}

function setCreateMode(mode) {
  const view = $(".view--create");
  document.body.dataset.cmode = mode;
  view.classList.toggle("is-web", mode === "web");
  view.classList.toggle("is-geo", mode === "geo");
  $("#webHost").hidden = mode !== "web";
  $("#geoHost").hidden = mode !== "geo";
  $$("[data-cmode]").forEach((b) => { b.classList.toggle("on", b.dataset.cmode === mode); b.setAttribute("aria-selected", String(b.dataset.cmode === mode)); });
  if (mode === "web") initWeb(); else if (mode === "geo") initGeo(); else initCreate();
  requestAnimationFrame(layoutFloating);
}
$$("[data-cmode]").forEach((b) => b.addEventListener("click", () => setCreateMode(b.dataset.cmode)));

/* ════════════════════════════════════════════════════════════════════════
   Photo tab: cut out part of a photo, pro adjustments, tattoo looks
   ════════════════════════════════════════════════════════════════════════ */
let photo = null, photoInit = null;
function initPhoto() {
  if (photoInit) return photoInit;
  photoInit = (async () => {
    try {
      const m = await import("./photo/photostudio.js");
      const asDesign = (canvas, name) => app.addImageDesign({ name: name || "Photo tattoo", image: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, style: "photo" });
      photo = new m.PhotoStudio($("#photoHost"), {
        settings: { skinColor: S("skin.tone"), theme: document.documentElement.dataset.theme },
        toast,
        onUse(canvas, name) {
          const d = asDesign(canvas, name);
          showTab("studio");
          try { app.placeTattoo({ designId: d.id, region: freeRegion() }); if (Date.now() - (showTip.last || 0) > 800) toast("Placed — drag it anywhere on the body"); }
          catch (e) { toast(e.message); }
        },
        onSave(canvas, name) { asDesign(canvas, name); toast("Saved to your designs"); },
        onSketch(canvas, name) { const d = asDesign(canvas, name); app.openSketch(d.id); },
        onGeo(canvas, name) { sendToGeo(canvas, name || "Photo"); },
        onExport(canvas, name) { download(`${(name || "photo-tattoo").replace(/[^\w-]+/g, "-")}.png`, canvas.toDataURL("image/png")); },
      });
      window.inkPhoto = photo;
    } catch (e) {
      console.error(e);
      $("#photoHost").innerHTML = `<p class="muted" style="padding:20px">The photo studio couldn't load: ${esc(e.message)}</p>`;
    }
  })();
  return photoInit;
}
$("#fromPhoto").addEventListener("click", () => { closeLib(); showTab("photo"); });

/* Send pictures to the Photo studio (cut out / adjust); several at once. */
async function openInPhoto(files) {
  files = [...files].filter(Boolean);
  if (!files.length) return;
  showTab("photo");
  await initPhoto();
  if (!photo) return;
  try {
    if (photo.loadFiles) await photo.loadFiles(files);
    else await photo.loadFile(files[0]);
  } catch (e) { toast(e.message || "Couldn't open that picture"); }
}

/* Pictures that are already tattoo designs (PNG/JPG/SVG/HEIC…) go straight into the library. */
$("#importDesigns").addEventListener("click", () => $("#fileDesigns").click());
$("#fileDesigns").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  toast(files.length > 1 ? `Importing ${files.length} pictures…` : "Importing…");
  let added = 0, last = null;
  const { decodeImageFile } = await import("./imageio.js");
  for (const f of files) {
    try {
      const name = (f.name || "Picture").replace(/\.[^.]+$/, "").slice(0, 60);
      if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) {
        const svg = await f.text();
        if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(svg)) throw new Error("unsafe svg");
        last = app.addSvgDesign({ name, svg, style: "imported" });
      } else {
        const c = await decodeImageFile(f, { maxSide: 2048 });
        last = app.addImageDesign({ name, image: c.toDataURL("image/png"), width: c.width, height: c.height, style: "imported" });
      }
      added++;
    } catch (err) { toast(`Skipped “${f.name}”: ${err.message || "couldn't read it"}`); }
  }
  if (added) { toast(`Added ${added} design${added > 1 ? "s" : ""} — tap one, then tap the body`); if (last) startPlacing(last.id); }
});

/* Paste a copied photo anywhere (Photo and Sketch handle their own paste). */
addEventListener("paste", (e) => {
  if (currentTab === "photo" || currentTab === "sketch") return;
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  openInPhoto(files);
});

/* Some embedded viewers (e.g. a page opened inside a chat app) block the
   photo picker silently. If tapping an upload button doesn't open anything,
   explain what to do instead of leaving the user wondering. */
if (!isAndroidApp && window.top !== window) {
  let lastAway = 0, hinted = false;
  addEventListener("blur", () => { lastAway = Date.now(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) lastAway = Date.now(); });
  const watch = (input) => {
    const t0 = Date.now();
    let changed = false;
    input.addEventListener("change", () => {
      changed = true;
      // the picker did work after all (slow phone): close the help if it's showing
      if (hinted && $("#saveTitle").textContent.startsWith("Photo picker")) $("#saveClose").click();
    }, { once: true });
    setTimeout(() => {
      if (hinted || changed || lastAway >= t0) return;
      hinted = true;
      showUploadHelp();
    }, 1600);
  };
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file") watch(this);
    return orig.call(this);
  };
  document.addEventListener("click", (e) => { if (e.target instanceof HTMLInputElement && e.target.type === "file") watch(e.target); }, true);
}
function showUploadHelp() {
  $("#saveTitle").textContent = "Photo picker blocked here";
  $("#saveBody").innerHTML = `<p>This view (for example the Claude app) doesn't allow picking photos. You can still add them:</p>
    <ul style="margin:0;padding-left:20px;line-height:1.6">
      <li><b>Open this page in Chrome or Safari</b> — copy the link from the share menu and paste it in your browser; uploads work there.</li>
      <li><b>Paste a photo</b> — copy a photo in your gallery, then come back and paste (long-press → Paste, or Ctrl+V).</li>
      <li><b>Use the InkForm Android app</b> — uploads, the camera and “Share → InkForm 3D” all work.</li>
      <li>Or pick a drawing from <b>Create → Web library</b>.</li>
    </ul>`;
  $("#saveCopy").hidden = true;
  $("#saveDl").hidden = true;
  $("#saveModal").hidden = false;
  document.body.classList.add("modal-open");
}

/* Drag pictures onto the app from the computer. */
addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) e.preventDefault(); });
addEventListener("drop", (e) => {
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|avif|webp|svg)$/i.test(f.name));
  if (!files.length) return;
  e.preventDefault();
  if (currentTab === "sketch" || currentTab === "photo") return; // those tabs handle their own drops
  openInPhoto(files);
});

/* Photos shared into the Android app ("Share → InkForm 3D"). */
window.inkSharedReady = async () => {
  if (!window.InkAndroid?.takeShared) return;
  let list = [];
  try { list = JSON.parse(window.InkAndroid.takeShared() || "[]"); } catch {}
  if (!list.length) return;
  const files = (await Promise.all(list.map(async (o) => {
    try {
      if (o.url) { const blob = await (await fetch(o.url)).blob(); return new File([blob], o.name || "photo", { type: o.type || blob.type || "" }); }
      const bin = atob(o.b64 || ""), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], o.name || "photo", { type: o.type || "" });
    } catch { return null; }
  }))).filter(Boolean);
  if (files.length) openInPhoto(files); else toast("Couldn't open the shared photo");
};


/* ════════════════════════════════════════════════════════════════════════
   Projects (several saved works) & avatars (saved bodies, e.g. from a scan)
   ════════════════════════════════════════════════════════════════════════ */
let projects = [], currentProjectId = null, avatars = [];
const isProjectKey = (k) => k.startsWith("body.") || k.startsWith("skin.");
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

function projectSnapshot() {
  return {
    settings: Object.fromEntries(Object.entries(store.settings).filter(([k]) => isProjectKey(k))),
    tattoos: JSON.parse(JSON.stringify(store.tattoos)),
    selectedId: store.selectedId, activeDesignId: store.activeDesignId,
  };
}
async function persistProjects() { await idb.set("projects", projects); }
async function projectThumb() {
  try { return await viewer.screenshot({ width: 320, height: 240 }); } catch { return null; }
}
async function saveCurrentProject({ thumb = false } = {}) {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;
  p.data = projectSnapshot();
  p.updatedAt = Date.now();
  if (thumb || !p.thumb) { const t = await projectThumb(); if (t) p.thumb = t; }
  await persistProjects();
}
let projSaveT = 0, lastThumbAt = 0;
function scheduleProjectSave() {
  clearTimeout(projSaveT);
  projSaveT = setTimeout(() => {
    const thumb = Date.now() - lastThumbAt > 20000;
    if (thumb) lastThumbAt = Date.now();
    saveCurrentProject({ thumb });
  }, 1500);
}
function renderProjName() {
  const p = projects.find((x) => x.id === currentProjectId);
  $("#projName").textContent = p?.name || "My project";
}
async function initProjects() {
  projects = (await idb.get("projects")) || [];
  avatars = (await idb.get("avatars")) || [];
  currentProjectId = lsGet("inkform.project");
  if (!projects.some((p) => p.id === currentProjectId)) {
    // the work on screen becomes a project
    const p = { id: uid("p"), name: projects.length ? `Project ${projects.length + 1}` : "My first project", createdAt: Date.now(), updatedAt: Date.now(), data: projectSnapshot() };
    projects.unshift(p);
    currentProjectId = p.id;
    lsSet("inkform.project", p.id);
    await persistProjects();
  }
  renderProjName();
  const origSave = store.save.bind(store);
  store.save = () => { origSave(); scheduleProjectSave(); };
}
async function openProject(id) {
  if (id === currentProjectId) { closeProjects(); return; }
  await saveCurrentProject({ thumb: true });
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  const d = p.data || {};
  for (const [k, v] of Object.entries(d.settings || {})) if (SETTING_BY_KEY[k]) store.settings[k] = coerceSetting(k, v);
  store.tattoos = JSON.parse(JSON.stringify(d.tattoos || []));
  store.selectedId = d.selectedId && store.tattoos.some((t) => t.id === d.selectedId) ? d.selectedId : null;
  store.activeDesignId = d.activeDesignId || store.activeDesignId;
  store.undoStack = []; store.redoStack = [];
  currentProjectId = id;
  lsSet("inkform.project", id);
  store.saveNow();
  closeProjects();
  stopPlacing?.();
  viewer.applySettings(store.settings);
  bodyBuild.snapOnly = true;
  bodyBuild.first = true; // frame the camera on the opened body
  await rebuildBody();
  syncTattoos(); updateBodyChip(); renderBodyPop(); renderProjName(); refreshFace();
  showTab("studio");
  toast(`Opened “${p.name}”`);
}
async function newProject() {
  await saveCurrentProject({ thumb: true });
  const n = projects.length + 1;
  const p = { id: uid("p"), name: `Project ${n}`, createdAt: Date.now(), updatedAt: Date.now(),
    data: { settings: projectSnapshot().settings, tattoos: [], selectedId: null, activeDesignId: store.activeDesignId } };
  projects.unshift(p);
  await persistProjects();
  await openProject(p.id);
}
async function duplicateProject(id) {
  if (id === currentProjectId) await saveCurrentProject({ thumb: true });
  const src = projects.find((x) => x.id === id);
  if (!src) return;
  const p = { ...JSON.parse(JSON.stringify(src)), id: uid("p"), name: src.name + " (copy)", createdAt: Date.now(), updatedAt: Date.now() };
  projects.unshift(p);
  await persistProjects();
  renderProjects();
  toast(`Saved “${p.name}”`);
}
async function deleteProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p || !(await askConfirm(`Delete the project “${p.name}”? This can't be undone.`, "Delete project"))) return;
  projects = projects.filter((x) => x.id !== id);
  if (id === currentProjectId) {
    if (projects.length) { currentProjectId = null; await openProject(projects[0].id); }
    else { currentProjectId = null; await newProject(); }
  } else await persistProjects();
  renderProjects();
}
function renderProjects() {
  const fmt = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("#projGrid").innerHTML = projects.map((p) => `
    <div class="projitem ${p.id === currentProjectId ? "on" : ""}" data-pid="${esc(p.id)}">
      <button class="projitem__thumb" data-open="${esc(p.id)}" aria-label="Open ${esc(p.name)}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : `<span class="muted small">No preview yet</span>`}</button>
      <div class="projitem__meta"><b>${esc(p.name)}${p.id === currentProjectId ? `<span class="badge">Open</span>` : ""}</b>
        <small>${(p.data?.tattoos || []).length} tattoo${(p.data?.tattoos || []).length === 1 ? "" : "s"} · ${fmt(p.updatedAt || p.createdAt)}</small></div>
      <div class="projitem__btns">
        ${p.id === currentProjectId ? "" : `<button class="btn btn--accent" data-open="${esc(p.id)}">Open</button>`}
        <button class="btn" data-rename="${esc(p.id)}">Rename</button>
        <button class="btn" data-dup="${esc(p.id)}">Copy</button>
        <button class="btn btn--danger" data-delp="${esc(p.id)}">Delete</button>
      </div>
    </div>`).join("");
}
async function openProjects() {
  await saveCurrentProject({ thumb: true });
  renderProjects();
  $("#projModal").hidden = false;
  document.body.classList.add("modal-open");
}
function closeProjects() { $("#projModal").hidden = true; document.body.classList.remove("modal-open"); }
$("#projBtn").addEventListener("click", openProjects);
$("#projClose").addEventListener("click", closeProjects);
$("#projModal").addEventListener("click", (e) => { if (e.target.id === "projModal") closeProjects(); });
$("#projNew").addEventListener("click", newProject);
$("#projSaveAs").addEventListener("click", () => duplicateProject(currentProjectId));
$("#projGrid").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.open) openProject(b.dataset.open);
  else if (b.dataset.dup) duplicateProject(b.dataset.dup);
  else if (b.dataset.delp) deleteProject(b.dataset.delp);
  else if (b.dataset.rename) {
    const p = projects.find((x) => x.id === b.dataset.rename);
    const meta = b.closest(".projitem").querySelector(".projitem__meta b");
    meta.innerHTML = `<input type="text" value="${esc(p.name)}" maxlength="60" aria-label="Project name" style="width:100%">`;
    const inp = meta.querySelector("input");
    inp.focus(); inp.select();
    const done = async (save) => {
      if (save && inp.value.trim()) { p.name = inp.value.trim(); await persistProjects(); renderProjName(); }
      renderProjects();
    };
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") done(true); if (ev.key === "Escape") { ev.stopPropagation(); done(false); } });
    inp.addEventListener("blur", () => done(true));
  }
});

/* avatars */
async function persistAvatars() { await idb.set("avatars", avatars); }
const currentAvatar = () => avatars.find((a) => a.id === S("body.avatarId")) || null;
let faceJob = null;
function refreshFace() { faceJob = viewer?.setFace(currentAvatar()?.face || null); return faceJob; }
async function applyAvatar(a) {
  store.checkpoint();
  for (const [k, v] of Object.entries(a.body || {})) if (k !== "detail" && SETTING_BY_KEY["body." + k]) store.settings["body." + k] = coerceSetting("body." + k, v);
  if (a.skinTone) store.settings["skin.tone"] = coerceSetting("skin.tone", a.skinTone);
  store.settings["body.avatarId"] = a.id;
  store.save();
  viewer.applySettings(store.settings);
  updateBodyChip(); renderBodyPop();
  refreshFace();
  await rebuildBody();
  toast(`Body set to “${a.name}”`);
}
async function saveBodyAsAvatar(name) {
  const thumb = await (async () => {
    try {
      const url = await viewer.screenshot({ width: 160, height: 160 });
      return url;
    } catch { return null; }
  })();
  const b = store.body(); delete b.detail;
  const a = { id: uid("a"), name: name || `Body ${avatars.length + 1}`, body: b, skinTone: S("skin.tone"), thumb, createdAt: Date.now() };
  avatars.unshift(a);
  await persistAvatars();
  renderBodyPop();
  toast(`Saved avatar “${a.name}”`);
  return a;
}
let scanUI = null;
async function openScan() {
  $("#bodyPop").hidden = true;
  const layer = $("#scanLayer");
  layer.hidden = false;
  document.body.classList.add("modal-open");
  try {
    const m = await import("./scan/scan.js");
    scanUI?.destroy?.();
    layer.innerHTML = "";
    scanUI = m.mountScan(layer, {
      getBody: () => store.body(),
      buildBody: (p) => bodyMod.buildBody(p),
      units: S("place.units"),
      toast,
      async onDone(av) {
        const a = { id: uid("a"), createdAt: Date.now(), ...av };
        if (a.photos) delete a.photos; // keep storage small; the thumbnail stays
        avatars.unshift(a);
        await persistAvatars();
        closeScan();
        await applyAvatar(a);
        toast(`Body done! Now add your face`, 3500);
        setTimeout(() => openFace({ afterScan: true }), 600);
      },
      onCancel: closeScan,
    });
  } catch (e) {
    console.error(e);
    layer.innerHTML = `<div style="padding:24px"><p>The body scan couldn't load: ${esc(e.message)}</p><button class="btn" id="scanCloseErr">Close</button></div>`;
    $("#scanCloseErr").onclick = closeScan;
  }
}
/* "My face": a selfie becomes the avatar's face on the 3D head */
async function openFace({ afterScan = false } = {}) {
  $("#bodyPop").hidden = true;
  const layer = $("#scanLayer");
  layer.hidden = false;
  document.body.classList.add("modal-open");
  try {
    const m = await import("./face/face.js");
    scanUI?.destroy?.();
    layer.innerHTML = "";
    scanUI = m.mountFaceCapture(layer, {
      toast,
      skinTone: S("skin.tone"),
      async onDone(face) {
        let a = currentAvatar();
        if (!a) {
          const b = store.body(); delete b.detail;
          a = { id: uid("a"), name: "Me", body: b, skinTone: face.skinTone || S("skin.tone"), createdAt: Date.now() };
          avatars.unshift(a);
        }
        a.face = face;
        if (face.skinTone) a.skinTone = face.skinTone;
        try { a.thumb = await faceThumb(face); } catch {}
        await persistAvatars();
        closeScan();
        await applyAvatar(a);
        await faceJob;
        viewer.focusFace();
        toast(afterScan ? "Your avatar is ready — with your face!" : "Your face is on the avatar", 4000);
      },
      onCancel: closeScan,
    });
  } catch (e) {
    console.error(e);
    layer.innerHTML = `<div style="padding:24px"><p>The face step couldn't load: ${esc(e.message)}</p><button class="btn" id="scanCloseErr">Close</button></div>`;
    $("#scanCloseErr").onclick = closeScan;
  }
}
/* small round thumbnail of the face photo for the avatar list */
async function faceThumb(face) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = face.image; });
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const s = Math.min(img.width, img.height);
  g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
  return c.toDataURL("image/jpeg", 0.85);
}
function closeScan() {
  scanUI?.destroy?.(); scanUI = null;
  $("#scanLayer").hidden = true; $("#scanLayer").innerHTML = "";
  document.body.classList.remove("modal-open");
}

/* ════════════════════════════════════════════════════════════════════════
   keyboard
   ════════════════════════════════════════════════════════════════════════ */
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === "Escape") {
    if (!$("#saveModal").hidden) { $("#saveClose").click(); return; }
    if (!$("#projModal").hidden) { closeProjects(); return; }
    if (!$("#settingsModal").hidden) { closeSettings(); return; }
    if (!$("#bodyPop").hidden) { $("#bodyPop").hidden = true; $("#bodyToggle").setAttribute("aria-expanded", "false"); $("#bodyToggle").focus(); return; }
    if (placingDesignId) { stopPlacing(); return; }
    if (currentTab === "studio" && store.selectedId && !typing) { app.selectTattoo(null); return; }
  }
  if (typing || currentTab !== "studio" || !$("#settingsModal").hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); app.redo(); return; }
  if (mod && e.key.toLowerCase() === "d" && store.selectedId) { e.preventDefault(); app.duplicateTattoo("selected"); return; }
  const t = store.selectedId ? store.tattoo(store.selectedId) : null;
  if (!t) return;
  const step = e.shiftKey ? 2 : 0.5;
  const moves = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
  if (moves[e.key]) { e.preventDefault(); app.updateTattoo(t.id, { moveCm: { right: moves[e.key][0], up: moves[e.key][1], frame: "camera" } }); }
  else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    confirmIf("Remove this tattoo?").then((ok) => { if (ok) { app.removeTattoo(t.id); toast("Tattoo removed — Ctrl+Z to undo"); } });
  }
  else if (e.key === "[" || e.key === "]") app.updateTattoo(t.id, { rotateBy: e.key === "]" ? 15 : -15 });
  else if (e.key === "+" || e.key === "=") app.updateTattoo(t.id, { scaleBy: 1.08 });
  else if (e.key === "-" || e.key === "_") app.updateTattoo(t.id, { scaleBy: 1 / 1.08 });
  else if (e.key.toLowerCase() === "f") app.focus(t.id);
});

/* Android back button: close the top-most thing; false = nothing left to close. */
window.inkBack = () => {
  if (!$("#scanLayer").hidden) { closeScan(); return true; }
  if (!$("#projModal").hidden) { closeProjects(); return true; }
  if (!$("#confirmModal").hidden) { $("#confirmNo").click(); return true; }
  if (!$("#saveModal").hidden) { $("#saveClose").click(); return true; }
  if (!$("#settingsModal").hidden) { closeSettings(); return true; }
  if (assistant?.isOpen) { assistant.close(); return true; }
  if (!$("#bodyPop").hidden) { $("#bodyPop").hidden = true; return true; }
  if (document.body.classList.contains("lib-open")) { closeLib(); return true; }
  if (placingDesignId) { stopPlacing(); return true; }
  if (currentTab === "studio" && store.selectedId) { app.selectTattoo(null); return true; }
  if (currentTab !== "studio") { showTab("studio"); return true; }
  return false;
};

/* ════════════════════════════════════════════════════════════════════════
   boot
   ════════════════════════════════════════════════════════════════════════ */
async function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (S("ui.theme") === "system") { applyTheme(); viewer?.applySettings(store.settings); } });
  store.on("setting", onSettingChanged);
  store.on("restore", ({ bodyChanged }) => {
    if (bodyChanged) { bodyBuild.snapOnly = true; scheduleBody(0); updateBodyChip(); renderBodyPop(); }
    syncTattoos();
  });
  store.on("designs", () => renderLibrary());
  addEventListener("inkform-storage-error", () => toast("Couldn't save to this browser's storage (private mode or full?) — export a project file to keep your work.", 6000));

  let moveCk = false, tfCk = false;
  viewer = new Viewer($("#viewer"), {
    onSelect(id) {
      if (id) { if (id !== store.selectedId) app.selectTattoo(id); }
      else if (store.selectedId) app.selectTattoo(null);
    },
    onMoveStart() { moveCk = false; },
    onMove(id, position, normal) {
      const t = store.tattoo(id);
      if (!t) return;
      if (!moveCk) { store.checkpoint(); moveCk = true; }
      t.rotation = wrapDeg(carryRotation(t.normal, t.rotation, normal));
      t.position = position; t.normal = normal;
      t.region = nearestRegionId(position, normal);
      syncTattoos();
    },
    onMoveEnd(id, moved) {
      store.save(); syncTattoos();
    },
    onTransformStart() { tfCk = false; },
    onTransform(id, { sizeCm, rotation }) {
      const t = store.tattoo(id);
      if (!t) return;
      if (!tfCk) { store.checkpoint(); tfCk = true; }
      t.sizeCm = sizeCm;
      t.rotation = S("place.snapRotation") ? Math.round(rotation / 15) * 15 : rotation;
      syncTattoos();
    },
    onTransformEnd() { store.save(); syncTattoos(); },
    onPlaceMiss() { toast("Tap on the body to place it — or pick a body part at the top"); },
    onPlace(position, normal) {
      const id = placingDesignId;
      stopPlacing();
      try { app.placeTattoo({ designId: id, position, normal }); } catch (e) { toast(e.message); }
    },
    onWheelScale(id, k) { app.updateTattoo(id, { scaleBy: k }); },
    onWheelRotate(id, d) { app.updateTattoo(id, { rotateBy: d }); },
    onRegionClick(r) {
      if (placingDesignId) { const id = placingDesignId; stopPlacing(); app.placeTattoo({ designId: id, region: r.id }); }
      else if (store.selectedId) app.updateTattoo("selected", { region: r.id });
      else app.focus(r.id);
    },
  });
  viewer.applySettings(store.settings);
  window.inkViewer = viewer;
  $("#camSpin").classList.toggle("on", !!S("scene.autoRotate"));
  updateBodyChip();
  showTab((location.hash.match(/^#\/?(\w+)/) || [])[1] || "studio");

  await store.loadDesigns();
  renderLibrary();

  // feature modules (independent: one failing never blocks the others)
  const [b, d] = await Promise.allSettled([import("./body/index.js"), import("./designs/index.js")]);
  if (d.status === "fulfilled") {
    designsMod = d.value;
    designsMod.loadFonts?.().then(() => { if (currentTab === "create") regenerate(true); }).catch(() => {});
    const sd = SETTING_BY_KEY["designs.defaultStyle"];
    sd.choices = designsMod.STYLES.map((s) => ({ value: s.id, label: s.name }));
    if (!sd.choices.some((c) => c.value === S("designs.defaultStyle"))) store.settings["designs.defaultStyle"] = sd.choices[0]?.value;
    if (currentTab === "create") initCreate();
  } else {
    console.error(d.reason);
    toast("The design engine failed to load", 4000);
  }
  if (b.status === "fulfilled") {
    bodyMod = b.value;
    regionList = bodyMod.REGION_LIST || [];
    const sr = SETTING_BY_KEY["designs.defaultRegion"];
    sr.choices = regionList.map((r) => ({ value: r.id, label: r.label }));
    fillRegionSelect();
    await rebuildBody();
    fillRegionSelect();
  } else {
    console.error(b.reason);
    $("#bodyLoading").innerHTML = "The 3D body couldn't load. Try reloading the page.";
  }

  // first run: a few starter designs so the library isn't empty
  if (!store.designs.length && designsMod) {
    const starters = [
      ["mandala"], ["floral"], ["geometric"], ["lettering-script"], ["traditional"],
      ["tribal"], ["japanese"], ["minimal-line"], ["dotwork"], ["animals"],
    ];
    for (const [sid] of starters.reverse()) {
      const style = designsMod.STYLES.find((s) => s.id === sid) || designsMod.STYLES.find((s) => s.id.includes(sid) || s.category?.toLowerCase().includes(sid));
      if (!style || store.designs.some((x) => x.style === style.id)) continue;
      try { store.designs.unshift(generate(style.id, { seed: 11 })); } catch (e) { console.warn("starter", sid, e); }
    }
    store.activeDesignId = store.designs[0]?.id || null;
    await store.saveDesigns(); store.save();
    renderLibrary();
  }

  // AI assistant
  import("./agent/chat.js").then((m) => { assistant = m.mountAssistant(document.body, app); window.inkAssistant = assistant; setTimeout(layoutFloating, 50); })
    .catch((e) => console.error("assistant failed to load", e));

  await initProjects();
  refreshFace();
  syncTattoos();
  if (!store.tattoos.length && currentTab === "studio") setTimeout(() => showTip("welcome"), 900);
  window.inkSharedReady?.();
  window.inkReady = true;
}

boot();

try {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => { try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch {} });
  }
} catch {}

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
function thumbOf(d) {
  if (!d) return "";
  if (d.image) return d.image;
  const k = d.id + ":" + (d.version || 0);
  if (!thumbCache.has(k)) thumbCache.set(k, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg || "<svg xmlns='http://www.w3.org/2000/svg'/>"));
  return thumbCache.get(k);
}

function download(name, href) {
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

async function confirmIf(msg) {
  return !S("ui.confirmDelete") || confirm(msg);
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
  // token overlap score (side words must agree)
  const toks = n.split(" ").filter(Boolean);
  const side = toks.includes("left") ? "left" : toks.includes("right") ? "right" : null;
  let best = null, bestScore = 0;
  for (const x of regions) {
    if (side && x.side !== side && x.side !== "center") continue;
    const hay = norm([x.id, x.label, ...(x.aliases || [])].join(" "));
    let sc = 0;
    for (const t of toks) if (t !== "left" && t !== "right" && t !== "my" && t !== "the" && hay.includes(t)) sc += t.length;
    if (side && x.side === side) sc += 0.5;
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  return best;
}

function nearestRegionId(p) {
  if (bodyMod?.nearestRegion) { try { return bodyMod.nearestRegion(regions, p); } catch {} }
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
let bodyBuild = { running: false, pending: false, first: true };

function regionFrame(r) {
  const n = V(r.normal).normalize();
  const up = V(r.up || [0, 1, 0]).addScaledVector(n, -V(r.up || [0, 1, 0]).dot(n)).normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  return { n, up, right };
}

async function rebuildBody() {
  if (!bodyMod) return;
  if (bodyBuild.running) { bodyBuild.pending = true; return; }
  bodyBuild.running = true;
  $("#bodyLoading").classList.remove("done");
  try {
    do {
      bodyBuild.pending = false;
      const oldRegions = regions;
      // remember each tattoo relative to its body part, so it follows the new body shape
      const anchors = store.tattoos.map((t) => {
        const r = oldRegions.find((x) => x.id === t.region) || oldRegions.find((x) => x.id === nearestRegionId(t.position));
        if (!r || bodyBuild.first) return null;
        const f = regionFrame(r), d = V(t.position).sub(V(r.position));
        return { id: r.id, a: d.dot(f.right), b: d.dot(f.up), c: d.dot(f.n) };
      });
      const res = await bodyMod.buildBody(store.body());
      if (bodyBuild.pending) continue; // a newer request arrived while building
      regions = res.regions || [];
      viewer.setBody(res.geometry, regions);
      store.tattoos.forEach((t, i) => {
        const an = anchors[i];
        const r = an && regions.find((x) => x.id === an.id);
        if (!r) {
          // first build or unknown region: snap the stored point onto the surface
          const c = viewer.surface.closestPoint(V(t.position));
          if (c) { t.position = c.point.toArray(); t.normal = viewer.surface.normalAt(c.point, c.faceIndex).toArray(); }
          return;
        }
        const f = regionFrame(r);
        const p = V(r.position).addScaledVector(f.right, an.a).addScaledVector(f.up, an.b).addScaledVector(f.n, an.c);
        const c = viewer.surface.closestPoint(p);
        if (c) { t.position = c.point.toArray(); t.normal = viewer.surface.normalAt(c.point, c.faceIndex).toArray(); }
      });
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
    ink: t.ink || "original", color: t.color || S("ink.defaultColor"), age: t.age || 0, opacity: t.opacity ?? 1,
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
  const entry = { used: performance.now() };
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
function pruneTextures() {
  if (texCache.size < 90) return;
  const inUse = new Set(lastTex.values());
  const old = [...texCache.entries()].filter(([, e]) => e.texture && !inUse.has(e)).sort((a, b) => a[1].used - b[1].used).slice(0, 30);
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
    if (e) lastTex.set(t.id, e);
    else e = lastTex.get(t.id);
    if (!e?.texture) continue;
    const widthM = (t.sizeCm / 100) * e.widthScale;
    items.push({ tattoo: t, texture: e.texture, widthM, heightM: widthM * e.aspect, blend: S("ink.blend") });
  }
  if (viewer.surface) viewer.syncTattoos(items, store.selectedId);
  if (lastTex.size > store.tattoos.length) for (const id of [...lastTex.keys()]) if (!store.tattoos.some((t) => t.id === id)) lastTex.delete(id);
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
}
addEventListener("resize", () => updateInset());

/* ════════════════════════════════════════════════════════════════════════
   the app API (used by UI + AI assistant)
   ════════════════════════════════════════════════════════════════════════ */
function resolveDesign(designId) {
  return store.design(designId) || store.design(store.activeDesignId) || store.designs[0] || null;
}

function generate(styleId, opts = {}, name) {
  if (!designsMod) throw new Error("Design engine is still loading");
  const out = designsMod.generateDesign(styleId, opts);
  const style = designsMod.STYLES.find((s) => s.id === styleId);
  return {
    id: uid("d"), name: name || out.name || style?.name || "Design", style: styleId, kind: "svg",
    svg: out.svg, width: out.width, height: out.height, params: { styleId, opts: out.params || opts }, createdAt: Date.now(),
  };
}

const app = {
  getState() {
    return {
      body: store.body(),
      tattoos: store.tattoos.map((t) => ({ ...t, regionLabel: regionLabel(t.region), designName: store.design(t.designId)?.name, style: store.design(t.designId)?.style })),
      selectedId: store.selectedId,
      activeDesignId: store.activeDesignId,
      designs: store.designs.map((d) => ({ id: d.id, name: d.name, style: d.style, kind: d.kind })),
      view: currentTab,
      units: S("place.units"),
    };
  },
  listRegions() {
    return (regions.length ? regions : regionList).map((r) => ({ id: r.id, label: r.label, group: r.group, side: r.side, aliases: r.aliases || [], sizeCm: r.sizeCm }));
  },
  listStyles() {
    return (designsMod?.STYLES || []).map((s) => ({ id: s.id, name: s.name, category: s.category, description: s.description, options: s.options }));
  },
  listSubjects() { return designsMod?.SUBJECTS || []; },
  listSettings() {
    return SETTINGS.filter((s) => s.type !== "action").map((s) => ({
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
    store.addDesign(d);
    renderLibrary();
    return d;
  },
  addSvgDesign({ name = "AI design", svg, style = "custom" }) {
    if (!/<svg[\s>]/i.test(svg || "")) throw new Error("Not an SVG");
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
    const d = { id: uid("d"), name, style, kind: "svg", svg, width: vb ? +vb[1] : 1000, height: vb ? +vb[2] : 1000, createdAt: Date.now() };
    store.addDesign(d);
    renderLibrary();
    return d;
  },
  addImageDesign({ name = "Image", image, width, height, style = "sketch" }) {
    const d = { id: uid("d"), name, style, kind: "image", image, width, height, createdAt: Date.now() };
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
      r = findRegion(region || freeRegion()) || regions[0];
      if (!r) throw new Error("Unknown body part: " + region);
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
    if (offsetCm && (offsetCm.right || offsetCm.up)) {
      const w = viewer.surface.walk(V(t.position), V(t.normal), t.rotation, (offsetCm.right || 0) / 100, (offsetCm.up || 0) / 100);
      t.position = w.position.toArray(); t.normal = w.normal.toArray();
    }
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
    if (checkpoint) store.checkpoint();
    if (patch.region) {
      const r = findRegion(patch.region);
      if (!r) throw new Error("Unknown body part: " + patch.region);
      t.position = [...r.position]; t.normal = [...r.normal]; t.region = r.id;
      if (patch.rotation == null && patch.rotateBy == null) t.rotation = rotationForUp(r.normal, r.up);
    }
    if (patch.position) {
      const c = viewer.surface.closestPoint(V(patch.position));
      if (c) { t.position = c.point.toArray(); t.normal = (patch.normal ? V(patch.normal) : viewer.surface.normalAt(c.point, c.faceIndex)).toArray(); }
      t.region = nearestRegionId(t.position);
    }
    if (patch.sizeCm != null) t.sizeCm = clamp(+patch.sizeCm, 0.8, 80);
    if (patch.scaleBy != null) t.sizeCm = clamp(t.sizeCm * +patch.scaleBy, 0.8, 80);
    if (patch.rotation != null) t.rotation = +patch.rotation;
    if (patch.rotateBy != null) t.rotation += +patch.rotateBy;
    t.rotation = ((t.rotation % 360) + 540) % 360 - 180;
    if (patch.moveCm && viewer.surface) {
      const w = viewer.surface.walk(V(t.position), V(t.normal), t.rotation, (patch.moveCm.right || 0) / 100, (patch.moveCm.up || 0) / 100);
      t.position = w.position.toArray(); t.normal = w.normal.toArray();
      t.region = nearestRegionId(t.position);
    }
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
      const p = V([-t.position[0], t.position[1], t.position[2]]);
      const hit = viewer.surface.closestPoint(p);
      c.position = hit.point.toArray();
      c.normal = viewer.surface.normalAt(hit.point, hit.faceIndex).toArray();
      c.rotation = -t.rotation;
      c.region = nearestRegionId(c.position);
    } else {
      const w = viewer.surface.walk(V(t.position), V(t.normal), t.rotation, t.sizeCm * 0.012, -t.sizeCm * 0.012);
      c.position = w.position.toArray(); c.normal = w.normal.toArray();
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
    for (const [k, v] of Object.entries(params)) if (SETTING_BY_KEY["body." + k]) store.settings["body." + k] = coerceSetting("body." + k, v);
    store.save(); updateBodyChip(); renderBodyPop();
    await rebuildBody();
    return store.body();
  },
  focus(target) {
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
  store.set(key, value);
}

function onSettingChanged({ key }) {
  if (key.startsWith("body.")) { scheduleBody(key === "body.detail" ? 0 : 260); updateBodyChip(); renderBodyPop(); }
  if (key.startsWith("skin.") || key.startsWith("scene.") || key.startsWith("place.") || key === "ui.reduceMotion") {
    viewer?.applySettings(store.settings);
    $("#camSpin")?.classList.toggle("on", !!S("scene.autoRotate"));
  }
  if (key.startsWith("ink.") || key === "place.units") syncTattoos();
  if (key.startsWith("ui.")) { applyTheme(); viewer?.applySettings(store.settings); }
  if (key === "place.units") { updateBodyChip(); renderBodyPop(); }
  if (key.startsWith("sketch.") && pad) pad.setSettings(sketchSettings());
  if (key === "skin.tone") renderBodyPop();
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
  $("#settingsModal").hidden = false;
}
function closeSettings() { $("#settingsModal").hidden = true; }

async function runAction(a) {
  switch (a) {
    case "exportProject": {
      const proj = await exportProject(store, pad ? pad.getState?.() : await idb.get("sketch"));
      const blob = new Blob([JSON.stringify(proj)], { type: "application/json" });
      download(`inkform-project-${new Date().toISOString().slice(0, 10)}.json`, URL.createObjectURL(blob));
      toast("Project exported");
      break;
    }
    case "importProject": $("#fileImport").click(); break;
    case "saveScreenshot": saveShot(); break;
    case "clearTattoos": if (await confirmIf("Remove every tattoo from the body?")) app.clearTattoos(); break;
    case "resetSettings":
      if (!confirm("Reset all settings to their defaults? (Your designs and tattoos stay.)")) break;
      store.checkpoint();
      { const keep = store.settings["ai.apiKey"]; store.settings = { ...defaultSettings(), "ai.apiKey": keep }; }
      store.saveNow(); applyTheme(); viewer.applySettings(store.settings); scheduleBody(0); syncTattoos(); updateBodyChip(); renderBodyPop();
      toast("Settings reset");
      break;
    case "resetAll":
      if (!confirm("Erase everything — designs, tattoos, sketch and settings? This cannot be undone.")) break;
      localStorage.removeItem("inkform.v1");
      localStorage.removeItem("inkform.tips");
      await idb.del("designs"); await idb.del("sketch");
      location.reload();
      break;
  }
}

$("#fileImport").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.tattoos) || !Array.isArray(p.designs)) throw new Error("not an InkForm project");
    store.checkpoint();
    const known = new Set(store.designs.map((d) => d.id));
    store.designs = [...p.designs.filter((d) => !known.has(d.id)), ...store.designs];
    store.tattoos = p.tattoos;
    store.selectedId = null;
    if (p.settings) for (const [k, v] of Object.entries(p.settings)) if (SETTING_BY_KEY[k] && k !== "ai.apiKey") store.settings[k] = v;
    if (p.sketch) { await idb.set("sketch", p.sketch); if (pad?.setState) pad.setState(p.sketch); }
    store.saveNow(); await store.saveDesigns();
    applyTheme(); viewer.applySettings(store.settings);
    bodyBuild.first = true; // stored positions belong to the imported body
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
  if (!["studio", "create", "sketch"].includes(tab)) tab = "studio";
  currentTab = tab;
  document.body.dataset.tab = tab;
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== tab));
  $$(".tabs [data-tab], .mobtabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  if (tab === "create") initCreate();
  if (tab === "sketch") initSketch();
  if (tab === "studio") viewer?._resize();
  if (location.hash.slice(2) !== tab) history.replaceState(null, "", "#/" + tab);
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
  g.innerHTML = store.designs.map((d) => `
    <div class="libitem ${d.id === store.activeDesignId ? "on" : ""}" data-id="${d.id}" role="button" tabindex="0" title="${esc(d.name)} — tap to place on the body">
      <img src="${thumbOf(d)}" alt="${esc(d.name)}" loading="lazy">
      <span class="libitem__name">${esc(d.name)}</span>
      <button class="libitem__del" data-del="${d.id}" aria-label="Delete design">✕</button>
    </div>`).join("");
  $("#libEmpty").hidden = store.designs.length > 0;
}
$("#libGrid").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    const id = del.dataset.del;
    const used = store.tattoos.filter((t) => t.designId === id).length;
    if (!(await confirmIf(used ? `This design is used by ${used} tattoo(s) on the body. Delete it and them?` : "Delete this design?"))) return;
    if (used) { store.checkpoint(); store.tattoos = store.tattoos.filter((t) => t.designId !== id); if (!store.tattoo(store.selectedId)) store.selectedId = null; store.save(); }
    store.removeDesign(id); forgetDesign(id);
    renderLibrary(); syncTattoos();
    return;
  }
  const it = e.target.closest(".libitem");
  if (it) startPlacing(it.dataset.id);
});
$("#libGrid").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.closest(".libitem")?.click(); });

$("#quickGen").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#quickPrompt").value.trim();
  if (!q) { $("#quickPrompt").focus(); return; }
  try {
    const d = app.createDesign({ prompt: q });
    $("#quickPrompt").value = "";
    startPlacing(d.id);
    toast(`Made “${d.name}” — tap the body to place it`);
  } catch (err) { toast(err.message); }
});

function renderPlaced() {
  $("#placedCount").textContent = store.tattoos.length;
  $("#placedEmpty").hidden = store.tattoos.length > 0;
  $("#placedList").innerHTML = store.tattoos.slice().reverse().map((t) => {
    const d = store.design(t.designId);
    return `<li class="${t.id === store.selectedId ? "on" : ""}" data-id="${t.id}">
      <img src="${thumbOf(d)}" alt="">
      <div class="meta"><b>${esc(d?.name || "Missing design")}</b><small>${esc(regionLabel(t.region))} · ${fmtSize(t.sizeCm)}</small></div>
      <button class="eye" data-eye="${t.id}" title="${t.visible === false ? "Show" : "Hide"}" aria-label="${t.visible === false ? "Show" : "Hide"}">${t.visible === false ? "🙈" : "👁"}</button>
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
  $("#placeRegion").value = "";
  showTip("place");
}
function stopPlacing() {
  placingDesignId = null;
  viewer?.stopPlacing();
  $("#placeBar").hidden = true;
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
      <img src="${thumbOf(d)}" alt="">
      <div class="meta"><b>${esc(d?.name || "Design")}</b><small class="muted" id="iRegion">${esc(regionLabel(t.region))}</small></div>
      <button class="iconbtn closeinsp" id="iClose" aria-label="Deselect">✕</button>
    </div>
    <section>
      <h4>Size</h4>
      <div class="numrow"><input type="range" id="iSize" min="${u ? 0.4 : 1}" max="${u ? 24 : 60}" step="${u ? 0.1 : 0.5}"><input type="number" id="iSizeN" step="${u ? 0.1 : 0.5}" aria-label="Size"><span class="muted">${u ? "in" : "cm"}</span></div>
    </section>
    <section>
      <h4>Rotation</h4>
      <div class="numrow"><button class="btn btn--small" data-rot="-15">⟲</button><input type="range" id="iRot" min="-180" max="180" step="1"><button class="btn btn--small" data-rot="15">⟳</button><input type="number" id="iRotN" step="1" aria-label="Rotation"><span class="muted">°</span></div>
    </section>
    <section>
      <h4>Position</h4>
      <div class="row" style="align-items:flex-start;gap:12px">
        <div class="nudge" aria-label="Nudge">
          <span></span><button data-nudge="0,1" aria-label="Up">▲</button><span></span>
          <button data-nudge="-1,0" aria-label="Left">◀</button><button data-focus title="Zoom to tattoo" aria-label="Zoom to tattoo">◎</button><button data-nudge="1,0" aria-label="Right">▶</button>
          <span></span><button data-nudge="0,-1" aria-label="Down">▼</button><span></span>
        </div>
        <div style="flex:1"><label class="muted small">Move to</label><select id="iRegionSel" style="width:100%"></select>
          <p class="muted small" style="margin:6px 0 0">Or drag the tattoo on the body.</p></div>
      </div>
    </section>
    <section>
      <h4>Ink</h4>
      <div class="seg" id="iInk">
        <button data-ink="original">Design</button><button data-ink="black">Black</button><button data-ink="color">Color</button><button data-ink="stencil">Stencil</button>
      </div>
      <div class="tones" id="iColors" style="margin-top:8px" ${t.ink === "color" ? "" : "hidden"}>${INK_SWATCHES.map((c) => `<button class="tone" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join("")}<input type="color" id="iColor" aria-label="Custom ink color"></div>
      <div class="field"><div class="lbl"><span>Opacity</span><output id="iOpO"></output></div><input type="range" id="iOp" min="0.05" max="1" step="0.01"></div>
      <div class="field"><div class="lbl"><span>Age: fresh → healed → old</span><output id="iAgeO"></output></div><input type="range" id="iAge" min="0" max="1" step="0.01"></div>
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
  if (e.target.id === "iFlip") app.updateTattoo("selected", { flip: e.target.checked });
  if (e.target.id === "iRegionSel" && e.target.value) { app.updateTattoo("selected", { region: e.target.value }); app.focus("selected"); }
});
insp.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const t = store.tattoo(store.selectedId);
  if (!t) return;
  if (b.id === "iClose") { app.selectTattoo(null); return; }
  if (b.dataset.rot) app.updateTattoo(t.id, { rotateBy: +b.dataset.rot });
  if (b.dataset.nudge) { const [x, y] = b.dataset.nudge.split(",").map(Number); app.updateTattoo(t.id, { moveCm: { right: x * 0.5, up: y * 0.5 } }); }
  if ("focus" in b.dataset) app.focus(t.id);
  if (b.dataset.ink) { app.updateTattoo(t.id, { ink: b.dataset.ink }); }
  if (b.dataset.color) app.updateTattoo(t.id, { color: b.dataset.color, ink: "color" });
  switch (b.dataset.act) {
    case "dup": app.duplicateTattoo(t.id); break;
    case "mirror": app.duplicateTattoo(t.id, { mirror: true }); toast("Copied to the other side"); break;
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
    return `<div class="field"><div class="lbl"><span>${label}</span><output>${o}</output></div><input type="range" data-bk="${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"></div>`;
  };
  p.innerHTML = `
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
$("#bodyPop").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.sex) { setSetting("body.sex", b.dataset.sex); renderBodyPop(); }
  if (b.dataset.tone) { setSetting("skin.tone", b.dataset.tone); renderBodyPop(); }
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
  else app.viewFrom(c);
});

/* mobile library sheet */
function closeLib() { document.body.classList.remove("lib-open"); updateInset(); }
$("#mobLib").addEventListener("click", () => { document.body.classList.toggle("lib-open"); updateInset(); });

/* tips */
function showTip(kind) {
  if (!S("ui.hints")) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem("inkform.tips") || "{}"); } catch {}
  if (seen[kind]) return;
  const msgs = {
    place: "Tap anywhere on the body to place the design. Drag to turn the body; pinch or scroll to zoom.",
    placed: "Drag the tattoo to slide it over the skin · drag the round handle to resize and rotate.",
  };
  const h = $("#studioHint");
  h.textContent = msgs[kind]; h.hidden = false;
  seen[kind] = 1;
  localStorage.setItem("inkform.tips", JSON.stringify(seen));
  setTimeout(() => (h.hidden = true), 6500);
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
      toast("Placed — drag it anywhere on the body");
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
  const c = pad.toTrimmedCanvas ? pad.toTrimmedCanvas(12) : pad.toCanvas();
  return app.addImageDesign({ name: $("#sketchName").value.trim() || "My sketch", image: c.toDataURL("image/png"), width: c.width, height: c.height });
}
$("#sketchSave").addEventListener("click", () => { if (sketchToDesign()) toast("Saved to your designs"); });
$("#sketchUse").addEventListener("click", () => {
  const d = sketchToDesign();
  if (!d) return;
  showTab("studio");
  try { app.placeTattoo({ designId: d.id, region: freeRegion() }); toast("Placed — drag it anywhere on the body"); }
  catch (e) { toast(e.message); }
});
$("#sketchNew").addEventListener("click", async () => {
  if (!pad) return;
  if (!pad.isEmpty?.() && !confirm("Start a new sketch? The current drawing will be cleared (save it to your designs first if you want to keep it).")) return;
  pad.clear(); $("#sketchName").value = "My sketch";
});

/* ════════════════════════════════════════════════════════════════════════
   keyboard
   ════════════════════════════════════════════════════════════════════════ */
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === "Escape") {
    if (!$("#settingsModal").hidden) { closeSettings(); return; }
    if (placingDesignId) { stopPlacing(); return; }
    if (currentTab === "studio" && store.selectedId && !typing) { app.selectTattoo(null); return; }
  }
  if (typing || currentTab !== "studio" || !$("#settingsModal").hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); app.redo(); return; }
  if (mod && e.key.toLowerCase() === "d" && store.selectedId) { e.preventDefault(); app.duplicateTattoo("selected"); return; }
  const t = store.tattoo(store.selectedId);
  if (!t) return;
  const step = e.shiftKey ? 2 : 0.5;
  const moves = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
  if (moves[e.key]) { e.preventDefault(); app.updateTattoo(t.id, { moveCm: { right: moves[e.key][0], up: moves[e.key][1] } }); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); app.removeTattoo(t.id); toast("Tattoo removed — Ctrl+Z to undo"); }
  else if (e.key === "[" || e.key === "]") app.updateTattoo(t.id, { rotateBy: e.key === "]" ? 15 : -15 });
  else if (e.key === "+" || e.key === "=") app.updateTattoo(t.id, { scaleBy: 1.08 });
  else if (e.key === "-" || e.key === "_") app.updateTattoo(t.id, { scaleBy: 1 / 1.08 });
  else if (e.key.toLowerCase() === "f") app.focus(t.id);
});

/* ════════════════════════════════════════════════════════════════════════
   boot
   ════════════════════════════════════════════════════════════════════════ */
async function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => S("ui.theme") === "system" && applyTheme());
  store.on("setting", onSettingChanged);
  store.on("restore", ({ bodyChanged }) => {
    if (bodyChanged) { scheduleBody(0); updateBodyChip(); renderBodyPop(); }
    syncTattoos();
  });
  store.on("designs", () => renderLibrary());

  let moveCk = false;
  viewer = new Viewer($("#viewer"), {
    onSelect(id) {
      if (id) { if (id !== store.selectedId) app.selectTattoo(id); }
      else if (store.selectedId) app.selectTattoo(null);
    },
    onMoveStart() { moveCk = store.checkpoint(); },
    onMove(id, position, normal) {
      const t = store.tattoo(id);
      if (!t) return;
      t.position = position; t.normal = normal;
      t.region = nearestRegionId(position);
      syncTattoos();
    },
    onMoveEnd(id, moved) {
      if (!moved && moveCk) store.undoStack.pop(); // a simple click: no undo step
      store.save(); syncTattoos();
    },
    onTransformStart() { store.checkpoint(); },
    onTransform(id, { sizeCm, rotation }) {
      const t = store.tattoo(id);
      if (!t) return;
      t.sizeCm = sizeCm;
      t.rotation = S("place.snapRotation") ? Math.round(rotation / 15) * 15 : rotation;
      syncTattoos();
    },
    onTransformEnd() { store.save(); syncTattoos(); },
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
  showTab((location.hash.match(/^#\/(\w+)/) || [])[1] || "studio");

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
  import("./agent/chat.js").then((m) => { assistant = m.mountAssistant(document.body, app); window.inkAssistant = assistant; })
    .catch((e) => console.error("assistant failed to load", e));

  syncTattoos();
  window.inkReady = true;
}

boot();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

/* "My face" capture screen: selfie / photo → landmarks shown over the photo →
   hair options → live 3D preview on a mannequin head → onDone(face). */

import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";
import { MeshBVH } from "../../vendor/bvh/three-mesh-bvh.js";
import { IMAGE_ACCEPT, decodeImageFile } from "../imageio.js";
import { buildBody } from "../body/index.js";
import { loadLandmarker, timings } from "./detect.js";
import { findFaces, checkFace, buildFace, drawMesh } from "./analyze.js";
import { TRIANGLES, FACE_OVAL } from "./canonical.js";
import { createFaceObject, fitFaceToHead, setFaceHair } from "./mesh.js";

const CSS_HREF = new URL("./face.css", import.meta.url).href;
function injectCss() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === CSS_HREF)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = CSS_HREF;
  document.head.appendChild(l);
}

const ICON = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.3" r="3.6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  hair: '<path d="M5 13c0-5 3-8.5 7-8.5s7 3.5 7 8.5"/><path d="M8 12c1.5-1.2 2.5-3 3-5 1 2.3 3 4 5 5"/><path d="M7 13v3.5a5 5 0 0 0 10 0V13"/>',
  glasses: '<circle cx="7" cy="13" r="3.5"/><circle cx="17" cy="13" r="3.5"/><path d="M10.5 13h3M3.5 12l-1-3M20.5 12l1-3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
};
const icon = (name, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const HERO = `<svg class="facecap__hero" viewBox="0 0 160 160" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M30 18H18v12M130 18h12v12M30 142H18v-12M130 142h12v-12" />
  <path d="M80 30c-21 0-34 16-34 40 0 26 15 50 34 50s34-24 34-50c0-24-13-40-34-40z" opacity=".9"/>
  <path d="M64 70h.1M96 70h.1" stroke-width="6"/>
  <path d="M80 74v14l-5 3M70 100c6 4 14 4 20 0" opacity=".85"/>
  <path d="M46 66c6-14 20-22 34-22s28 8 34 22" opacity=".45" stroke-dasharray="2 6"/>
</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const HAIR_STYLES = [["none", "None"], ["buzz", "Buzz"], ["short", "Short"], ["medium", "Medium"]];

/**
 * Mount the full-screen capture UI.
 * @returns {{ destroy(): void }}
 */
export function mountFaceCapture(container, { onDone, onCancel, toast, skinTone } = {}) {
  injectCss();
  const say = (m) => { try { toast?.(m); } catch { /* ignore */ } };
  const root = document.createElement("div");
  root.className = "facecap";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "facecap-title");
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="facecap__bar">
      <button class="facecap__iconbtn" data-act="close" aria-label="Close">${icon("close", 22)}</button>
      <h2 id="facecap-title">My face</h2>
    </div>
    <div class="facecap__main"><div class="facecap__step" aria-live="polite"></div></div>`;
  (container || document.body).appendChild(root);
  const stepEl = root.querySelector(".facecap__step");
  const mainEl = root.querySelector(".facecap__main");

  let destroyed = false;
  let runId = 0;              // cancels stale async work
  let src = null;             // decoded photo canvas
  let faces = [];             // detections on src
  let chosen = 0;
  let result = null;          // buildFace result
  let face = null;            // the face record being edited
  let check = null;
  const preview = { renderer: null, ok: true };

  // warm up the detector in the background (errors surface when a photo is chosen)
  loadLandmarker().catch(() => {});

  /* ---------------------------------------------------------------- helpers */
  function fileButton(label, iconName, { selfie = false, accent = false } = {}) {
    const l = document.createElement("label");
    l.className = "facecap__btn" + (accent ? " facecap__btn--accent" : "");
    l.innerHTML = `${icon(iconName)}<span>${esc(label)}</span>`;
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = selfie ? "image/*" : IMAGE_ACCEPT;
    if (selfie) inp.setAttribute("capture", "user");
    inp.setAttribute("aria-label", label);
    inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; inp.value = ""; if (f) onFile(f); });
    l.appendChild(inp);
    return l;
  }
  function photoButtons(el, primarySelfie = true) {
    el.appendChild(fileButton("Take a selfie", "camera", { selfie: true, accent: primarySelfie }));
    el.appendChild(fileButton("Choose a photo", "image", { accent: !primarySelfie }));
  }
  function setStep(html) {
    stepEl.innerHTML = html;
    mainEl.scrollTop = 0;
  }

  /* ---------------------------------------------------------------- steps */
  function showIntro() {
    runId++;
    setStep(`
      <div class="facecap__intro facecap__drop">
        ${HERO}
        <h3>Put your face on your avatar</h3>
        <p class="lead">One clear selfie is all it takes.</p>
        <ul class="facecap__tips">
          <li>${icon("eye")}<span>Look straight at the camera, head level</span></li>
          <li>${icon("sun")}<span>Even, soft light — face a window</span></li>
          <li>${icon("hair")}<span>Hair off your face and forehead</span></li>
          <li>${icon("glasses")}<span>No glasses, if you can</span></li>
        </ul>
        <div class="facecap__actions"></div>
        <p class="facecap__privacy">${icon("lock", 16)}<span>Your photo stays on this device.</span></p>
      </div>`);
    photoButtons(stepEl.querySelector(".facecap__actions"));
    stepEl.querySelector(".facecap__actions label")?.focus?.();
  }

  function showWorking(text, thumb) {
    setStep(`
      <div class="facecap__working">
        ${thumb ? `<img class="facecap__thumb" alt="" src="${thumb}">` : ""}
        <div class="facecap__spinner" aria-hidden="true"></div>
        <div class="facecap__bar-progress" hidden><i></i></div>
        <p class="facecap__status">${esc(text)}</p>
      </div>`);
  }
  function setStatus(text, progress) {
    const p = stepEl.querySelector(".facecap__status");
    if (p && text) p.textContent = text;
    const bar = stepEl.querySelector(".facecap__bar-progress");
    if (bar && typeof progress === "number") { bar.hidden = progress >= 1; bar.firstElementChild.style.width = `${Math.round(progress * 100)}%`; }
  }

  function showError(title, msg, { retry = true } = {}) {
    setStep(`
      <div class="facecap__error">
        <div class="facecap__erricon">${icon("warn", 64)}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(msg)}</p>
        <div class="facecap__actions"></div>
        <p class="facecap__privacy">${icon("lock", 16)}<span>Your photo stays on this device.</span></p>
      </div>`);
    const a = stepEl.querySelector(".facecap__actions");
    if (retry) photoButtons(a);
    const back = document.createElement("button");
    back.className = "facecap__btn facecap__btn--ghost";
    back.textContent = retry ? "Back to tips" : "Close";
    back.onclick = () => (retry ? showIntro() : cancel());
    a.appendChild(back);
  }

  /* ---------------------------------------------------------------- pipeline */
  async function onFile(file) {
    const my = ++runId;
    showWorking("Opening your photo…");
    try {
      src = await decodeImageFile(file, { maxSide: 2560 });
    } catch (e) {
      if (my === runId) showError("Couldn't open that photo", e.message || "Try a JPG or PNG photo.");
      return;
    }
    if (my !== runId) return;
    let thumb = null;
    try { const t = document.createElement("canvas"); const k = 240 / Math.max(src.width, src.height); t.width = Math.round(src.width * k); t.height = Math.round(src.height * k); t.getContext("2d").drawImage(src, 0, 0, t.width, t.height); thumb = t.toDataURL("image/jpeg", 0.7); } catch { /* ignore */ }
    showWorking("Getting the face finder ready…", thumb);
    try {
      await loadLandmarker({ onProgress: (p) => my === runId && setStatus("Getting the face finder ready…", p) });
      if (my !== runId) return;
      setStatus("Finding your face…", 1);
      const r = await findFaces(src, { onStatus: (t) => my === runId && setStatus(t) });
      if (my !== runId) return;
      faces = r.faces;
    } catch (e) {
      if (my !== runId) return;
      if (e.friendly) showError("Face detection isn't available here", e.message, { retry: false });
      else showError("Something went wrong", "Face detection failed on this photo. Try another one.");
      return;
    }
    if (!faces.length) {
      showError("No face found", "Make sure your whole face is in the picture, well lit, looking at the camera — or try another photo.");
      return;
    }
    chosen = 0;
    await useFace(chosen, my);
  }

  async function useFace(idx, my = ++runId) {
    const det = faces[idx];
    check = checkFace(det, src);
    if (!check.ok) { showError("Your face is too small", check.warnings[0]); return; }
    if (!stepEl.querySelector(".facecap__working")) showWorking("Mapping your face…");
    else setStatus("Mapping your face…");
    try {
      result = await buildFace(src, det, { onStatus: (t) => my === runId && setStatus(t) });
    } catch (e) {
      if (my === runId) showError("Something went wrong", e.friendly ? e.message : "Couldn't map the face on this photo. Try another one.");
      return;
    }
    if (my !== runId) return;
    face = result.face;
    showReview();
  }

  /* ---------------------------------------------------------------- review */
  function showReview() {
    const msgs = [];
    msgs.push(["ok", faces.length > 1 ? `Found ${faces.length} faces — using the ${chosen === 0 ? "largest" : "one you picked"}. Tap a face to switch.` : "Found your face."]);
    for (const w of check.warnings) msgs.push(["warn", w]);
    if (result.hairAuto && result.hairAuto.style === "none") msgs.push(["ok", "No hair detected. Pick a hair style below if you like."]);
    setStep(`
      <div class="facecap__review">
        <div class="facecap__side">
          <div class="facecap__card${faces.length > 1 ? " is-multi" : ""}">
            <div class="facecap__cardhead"><h4>Your photo</h4><span class="facecap__skin" title="Skin tone from your face">Skin <i style="background:${esc(face.skinTone)}"></i></span></div>
            <div class="facecap__photo${faces.length > 1 ? " is-pick" : ""}"><canvas width="720" height="720" aria-label="Your photo with the detected face mesh"></canvas></div>
            <ul class="facecap__msgs" style="padding-top:12px">${msgs.map(([k, t]) => `<li class="${k}">${icon(k === "ok" ? "check" : "warn", 18)}<span>${esc(t)}</span></li>`).join("")}</ul>
          </div>
        </div>
        <div>
          <div class="facecap__card">
            <div class="facecap__cardhead"><h4>On your avatar</h4>
              <div class="facecap__sex" role="group" aria-label="Preview body">
                <button class="facecap__chip" data-sex="male" aria-pressed="${previewSex === "male"}">Male</button>
                <button class="facecap__chip" data-sex="female" aria-pressed="${previewSex === "female"}">Female</button>
              </div></div>
            <div class="facecap__preview"><div class="facecap__hint">Drag to turn the head</div></div>
            <div class="facecap__section">
              <h4>Hair</h4>
              <div class="facecap__row" role="group" aria-label="Hair style">
                ${HAIR_STYLES.map(([v, l]) => `<button class="facecap__chip" data-hair="${v}" aria-pressed="${face.hair === v}">${l}</button>`).join("")}
                <label class="facecap__swatch" title="Hair colour"><i style="background:${esc(face.hairColor || "#3a2a20")}"></i><span>Colour</span><input type="color" value="${esc(face.hairColor || "#3a2a20")}" aria-label="Hair colour"></label>
              </div>
            </div>
          </div>
          <div class="facecap__foot" style="margin-top:14px">
            <span class="grow"></span>
            <button class="facecap__btn" data-act="retake">${icon("camera")}<span>Retake</span></button>
            <button class="facecap__btn facecap__btn--accent" data-act="done">${icon("check")}<span>Use my face</span></button>
          </div>
        </div>
      </div>`);
    drawPhoto();
    const cv = stepEl.querySelector(".facecap__photo canvas");
    cv.addEventListener("click", onPhotoTap);
    stepEl.querySelectorAll("[data-hair]").forEach((b) => b.addEventListener("click", () => setHair(b.dataset.hair)));
    stepEl.querySelectorAll("[data-sex]").forEach((b) => b.addEventListener("click", () => setSex(b.dataset.sex)));
    const col = stepEl.querySelector(".facecap__swatch input");
    col.addEventListener("input", () => setHairColor(col.value));
    mountPreview(stepEl.querySelector(".facecap__preview"));
  }

  let view = null; // photo → canvas mapping
  function drawPhoto() {
    const cv = stepEl.querySelector(".facecap__photo canvas");
    if (!cv || !src) return;
    const g = cv.getContext("2d");
    const S = cv.width;
    // view: the chosen face with room around it, or every face when there are several
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of faces.length > 1 ? faces : [faces[chosen]]) { x0 = Math.min(x0, f.box.x0); y0 = Math.min(y0, f.box.y0); x1 = Math.max(x1, f.box.x1); y1 = Math.max(y1, f.box.y1); }
    const side = Math.min(Math.max(src.width, src.height), Math.max(x1 - x0, y1 - y0) * (faces.length > 1 ? 1.25 : 1.7));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const k = S / side;
    view = { k, ox: cx - side / 2, oy: cy - side / 2 };
    g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
    g.imageSmoothingQuality = "high";
    g.drawImage(src, view.ox, view.oy, side, side, 0, 0, S, S);
    const accent = getComputedStyle(root).getPropertyValue("--fc-accent").trim() || "#e0455f";
    if (window.__faceDebug === true) window.__faceBoxes = faces.map((f) => [((f.box.x0 + f.box.x1) / 2 - view.ox) * k / S, ((f.box.y0 + f.box.y1) / 2 - view.oy) * k / S]);
    faces.forEach((f, i) => {
      const pts = new Float32Array(f.pts.length);
      for (let q = 0; q < f.pts.length; q += 3) { pts[q] = (f.pts[q] - view.ox) * k; pts[q + 1] = (f.pts[q + 1] - view.oy) * k; }
      if (i === chosen) {
        g.globalAlpha = 0.9;
        drawMesh(g, pts, TRIANGLES, { color: "rgba(255,255,255,0.38)", width: Math.max(0.6, S / 900) });
        g.globalAlpha = 1;
        g.strokeStyle = accent; g.lineWidth = Math.max(2, S / 260);
        g.beginPath();
        FACE_OVAL.forEach((id, j) => (j ? g.lineTo(pts[id * 3], pts[id * 3 + 1]) : g.moveTo(pts[id * 3], pts[id * 3 + 1])));
        g.closePath(); g.stroke();
      } else {
        g.setLineDash([8, 6]); g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 2;
        g.strokeRect((f.box.x0 - view.ox) * k, (f.box.y0 - view.oy) * k, (f.box.x1 - f.box.x0) * k, (f.box.y1 - f.box.y0) * k);
        g.setLineDash([]);
      }
    });
  }
  function onPhotoTap(e) {
    if (faces.length < 2 || !view) return;
    const cv = e.currentTarget, r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width / view.k + view.ox;
    const y = ((e.clientY - r.top) / r.height) * cv.height / view.k + view.oy;
    const i = faces.findIndex((f) => x >= f.box.x0 && x <= f.box.x1 && y >= f.box.y0 && y <= f.box.y1);
    if (i < 0 || i === chosen) return;
    chosen = i;
    showWorking("Mapping your face…");
    useFace(i);
  }

  function setHair(style) {
    if (!face) return;
    face = { ...face, hair: style };
    if (style !== "none" && !face.hairColor) face.hairColor = "#3a2a20";
    stepEl.querySelectorAll("[data-hair]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hair === style)));
    if (preview.obj) { setFaceHair(preview.obj, style, face.hairColor); preview.dirty = true; }
  }
  function setHairColor(c) {
    if (!face) return;
    face = { ...face, hairColor: c };
    const sw = stepEl.querySelector(".facecap__swatch i");
    if (sw) sw.style.background = c;
    if (face.hair === "none") setHair("short");
    else if (preview.obj) { setFaceHair(preview.obj, face.hair, c); preview.dirty = true; }
  }

  /* ---------------------------------------------------------------- 3D preview */
  let previewSex = "male";
  function setSex(sex) {
    if (sex === previewSex) return;
    previewSex = sex;
    stepEl.querySelectorAll("[data-sex]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sex === sex)));
    loadBody().then(() => placeFace());
  }

  function mountPreview(host) {
    if (!preview.ok) { host.innerHTML = `<div class="facecap__nogl">3D preview isn't available on this device — your face will still be used.</div>`; return; }
    if (!preview.renderer) {
      try { initRenderer(); }
      catch {
        preview.ok = false;
        host.innerHTML = `<div class="facecap__nogl">3D preview isn't available on this device — your face will still be used.</div>`;
        say("3D preview isn't available here");
        return;
      }
    }
    host.prepend(preview.renderer.domElement);
    preview.host = host;
    preview.ro?.disconnect();
    preview.ro = new ResizeObserver(resizePreview);
    preview.ro.observe(host);
    resizePreview();
    preview.swing = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; preview.t0 = performance.now();
    const hint = host.querySelector(".facecap__hint");
    if (hint) setTimeout(() => { hint.style.opacity = "0"; }, 4000);
    (preview.body ? Promise.resolve() : loadBody()).then(() => placeFace());
  }

  function initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;
    // the app's "studio" lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 0.55));
    for (const [c, i, p] of [[0xfff4ea, 2.4, [1.1, 4.4, 1.9]], [0xdfe8ff, 0.9, [-2.4, 1.6, 1.6]], [0xffffff, 1.6, [-0.8, 2.6, -2.6]]]) {
      const d = new THREE.DirectionalLight(c, i); d.position.set(...p).multiplyScalar(1.4); scene.add(d);
    }
    const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
    const controls = new OrbitControls(camera, r.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8;
    controls.minPolarAngle = 0.6; controls.maxPolarAngle = 2.3;
    controls.addEventListener("start", () => { preview.swing = false; });
    controls.addEventListener("change", () => { preview.dirty = true; });
    const skin = new THREE.MeshPhysicalMaterial({
      color: 0xd09a74, roughness: 0.58, metalness: 0, sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xff9a80),
      clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.55,
    });
    Object.assign(preview, { renderer: r, scene, camera, controls, skin, envTex, dirty: true });
    const loop = (t) => {
      if (destroyed) return;
      preview.raf = requestAnimationFrame(loop);
      if (!preview.host || !preview.host.isConnected) return;
      if (preview.swing && preview.target) {
        const el = (t - preview.t0) / 1000;
        if (el > 7.85) preview.swing = false;   // one and a bit swings, then rest (saves battery)
        const a = Math.sin(el * 0.8) * 0.5;
        const d = preview.dist;
        camera.position.set(preview.target.x + Math.sin(a) * d, preview.target.y + 0.01, preview.target.z + Math.cos(a) * d);
        preview.dirty = true;
      }
      const moved = controls.update();
      if (moved || preview.dirty) { r.render(scene, camera); preview.dirty = false; }
    };
    preview.raf = requestAnimationFrame(loop);
  }

  function resizePreview() {
    const h = preview.host;
    if (!h || !preview.renderer) return;
    const w = h.clientWidth || 300, hh = h.clientHeight || 300;
    preview.renderer.setSize(w, hh, false);
    preview.camera.aspect = w / hh; preview.camera.updateProjectionMatrix();
    preview.dirty = true;
  }

  async function loadBody() {
    const sex = previewSex;
    const { geometry, regions, bounds } = await buildBody({ sex, heightCm: sex === "female" ? 166 : 178, detail: "low" });
    if (destroyed || sex !== previewSex) return;
    if (geometry.index) geometry.setIndex(geometry.index.clone());
    geometry.boundsTree = new MeshBVH(geometry);
    if (preview.body) { preview.scene.remove(preview.body); preview.body.geometry.boundsTree = null; preview.body.geometry.dispose(); }
    const m = new THREE.Mesh(geometry, preview.skin);
    preview.scene.add(m);
    Object.assign(preview, { body: m, regions, bounds });
  }

  function placeFace() {
    if (destroyed || !preview.body || !face) return;
    if (preview.obj) { disposeObj(preview.obj); preview.scene.remove(preview.obj); preview.obj = null; }
    const tone = new THREE.Color(face.skinTone);
    preview.skin.color.copy(tone);
    preview.skin.sheenColor.copy(tone).lerp(new THREE.Color(0xff6a50), 0.62);
    preview.skin.emissive.copy(tone).lerp(new THREE.Color(0xc0402a), 0.6).multiplyScalar(0.028);
    const obj = createFaceObject(face, THREE);
    preview.scene.add(obj);
    try { fitFaceToHead(obj, { bodyMesh: preview.body, regions: preview.regions, bounds: preview.bounds, THREE }); }
    catch (e) { console.error(e); }
    preview.obj = obj;
    const fit = obj.userData.fit;
    if (fit) {
      const u = fit.head.u;
      preview.target = new THREE.Vector3(0, fit.head.eyeY - 0.025 * u, fit.head.center[2] + 0.03 * u);
      preview.dist = 0.62 * u;
      preview.controls.target.copy(preview.target);
      preview.controls.minDistance = 0.3 * u; preview.controls.maxDistance = 1.4 * u;
      if (!preview.swing) {
        preview.camera.position.set(preview.target.x, preview.target.y + 0.01, preview.target.z + preview.dist);
      }
      preview.controls.update();
    }
    // re-render once the face texture has decoded
    const tex = obj.userData.mask.material.map;
    const iv = setInterval(() => { if (destroyed || tex.image) { preview.dirty = true; clearInterval(iv); } }, 60);
    preview.dirty = true;
  }

  function disposeObj(o) {
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) { for (const k of ["map", "emissiveMap", "bumpMap"]) c.material[k]?.dispose?.(); c.material.dispose(); }
    });
  }

  /* ---------------------------------------------------------------- finish */
  function done() {
    if (!face) return;
    const out = { ...face };
    if (out.hair !== "none" && !out.hairColor) out.hairColor = "#3a2a20";
    try { onDone?.(out); } catch (e) { console.error(e); }
  }
  function cancel() { try { onCancel?.(); } catch (e) { console.error(e); } }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "close") cancel();
    else if (a === "retake") showIntro();
    else if (a === "done") done();
  });
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } };
  root.addEventListener("keydown", onKey);
  // drag & drop a photo (desktop)
  const onDrag = (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); root.classList.add("is-dragging"); } };
  const onLeave = (e) => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove("is-dragging"); };
  const onDrop = (e) => { e.preventDefault(); root.classList.remove("is-dragging"); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); };
  root.addEventListener("dragover", onDrag);
  root.addEventListener("dragleave", onLeave);
  root.addEventListener("drop", onDrop);

  void skinTone; void timings;
  showIntro();
  root.focus({ preventScroll: true });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true; runId++;
      cancelAnimationFrame(preview.raf);
      preview.ro?.disconnect();
      if (preview.obj) disposeObj(preview.obj);
      if (preview.body) preview.body.geometry.dispose();
      preview.skin?.dispose(); preview.envTex?.dispose(); preview.controls?.dispose();
      if (preview.renderer) { preview.renderer.dispose(); preview.renderer.forceContextLoss?.(); }
      root.remove();
    },
  };
}

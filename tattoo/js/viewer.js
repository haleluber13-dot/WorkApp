/* 3D studio: body, lights, camera, tattoos on the skin, and direct
   manipulation (drag a tattoo to move it over the body, drag the corner
   handle to resize / rotate, click to place a new design). */

import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";
import { SkinSurface, tattooFrame } from "./decal.js";
import { selectionCanvas } from "./ink.js";

const BACKGROUNDS = {
  charcoal: { css: "radial-gradient(120% 90% at 50% 30%, #3a3b42 0%, #1d1e23 55%, #111114 100%)", floor: 0x000000, shot: ["#33343a", "#141417"] },
  midnight: { css: "radial-gradient(120% 90% at 50% 30%, #26324f 0%, #141a2c 55%, #0a0d17 100%)", floor: 0x000000, shot: ["#26324f", "#0b0e19"] },
  warm: { css: "radial-gradient(120% 90% at 50% 30%, #5a4537 0%, #2c211b 55%, #17110e 100%)", floor: 0x000000, shot: ["#5a4537", "#1a130f"] },
  light: { css: "radial-gradient(120% 90% at 50% 30%, #f4f4f6 0%, #d9dadf 60%, #c4c5cc 100%)", floor: 0x000000, shot: ["#f4f4f6", "#c9cad1"] },
  white: { css: "#ffffff", floor: 0x000000, shot: ["#ffffff", "#ffffff"] },
  black: { css: "#000000", floor: 0x000000, shot: ["#000000", "#000000"] },
};

const LIGHTING = {
  studio:   { env: 0.55, hemi: [0xffffff, 0x404048, 0.55], key: [0xfff4ea, 2.4, [1.1, 4.4, 1.9]], fill: [0xdfe8ff, 0.9, [-2.4, 1.6, 1.6]], rim: [0xffffff, 1.6, [-0.8, 2.6, -2.6]] },
  daylight: { env: 0.8, hemi: [0xdfefff, 0x6a5a4a, 0.9], key: [0xffffff, 2.8, [1.6, 4.6, 1.4]], fill: [0xcfe0ff, 0.6, [-2.0, 1.5, 2.0]], rim: [0xffffff, 0.8, [0, 3, -3]] },
  shop:     { env: 0.45, hemi: [0xffe2c4, 0x3a2a20, 0.6], key: [0xffd6a8, 2.6, [0.9, 4.4, 1.7]], fill: [0xffb98a, 0.5, [-2.2, 1.2, 1.2]], rim: [0xffe8cc, 1.4, [-1.2, 2.4, -2.4]] },
  dramatic: { env: 0.2, hemi: [0xffffff, 0x101014, 0.18], key: [0xffffff, 3.6, [2.0, 4.0, 1.0]], fill: [0x8fa8ff, 0.18, [-2.4, 1.2, 1.6]], rim: [0xa8c8ff, 2.6, [-1.6, 2.2, -2.4]] },
  rim:      { env: 0.35, hemi: [0xffffff, 0x202028, 0.35], key: [0xfff0e0, 1.6, [1.0, 4.2, 2.0]], fill: [0xffffff, 0.4, [-2, 1.4, 2]], rim: [0xffffff, 4.0, [0, 2.2, -2.8]] },
  flat:     { env: 1.0, hemi: [0xffffff, 0xd0d0d0, 1.6], key: [0xffffff, 0.6, [0, 3, 3]], fill: [0xffffff, 0.3, [-2, 1, 2]], rim: [0xffffff, 0.0, [0, 2, -3]] },
};

const QUALITY = { low: 1, auto: Math.min(2, window.devicePixelRatio || 1), high: Math.min(2.5, (window.devicePixelRatio || 1) * 1.25), ultra: 3 };

export class Viewer {
  constructor(container, opts = {}) {
    this.container = container;
    this.cb = opts; // callbacks: onSelect, onMove, onMoveEnd, onTransform, onTransformEnd, onPlace, onHover
    this.settings = {};
    this.tattooObjs = new Map();
    this.placing = null;
    this.dirty = true;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    r.setPixelRatio(QUALITY.auto);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = "viewer__canvas";
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.03, 60);
    this.camera.position.set(0, 1.1, 4.2);

    // pointer handling registered BEFORE OrbitControls so we can claim drags on tattoos
    this._bindPointer();
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.target.set(0, 0.95, 0);
    c.enableDamping = true; c.dampingFactor = 0.09;
    c.minDistance = 0.18; c.maxDistance = 9;
    c.zoomSpeed = 0.9; c.rotateSpeed = 0.8;
    c.addEventListener("change", () => { this.dirty = true; this._updateOverlay(); });

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.5);
    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -1.3, right: 1.3, top: 2.3, bottom: -0.2, near: 0.5, far: 12 });
    this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.025; this.key.shadow.radius = 4;
    this.fill = new THREE.DirectionalLight(0xffffff, 0.6);
    this.rim = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.hemi, this.key, this.fill, this.rim);

    // floor: shadow catcher + soft contact glow
    const floorGeo = new THREE.CircleGeometry(2.4, 64).rotateX(-Math.PI / 2);
    this.floorShadow = new THREE.Mesh(floorGeo, new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.floorShadow.receiveShadow = true;
    const gc = document.createElement("canvas"); gc.width = gc.height = 256;
    const gg = gc.getContext("2d"), grad = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.38)"); grad.addColorStop(0.45, "rgba(0,0,0,0.16)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    gg.fillStyle = grad; gg.fillRect(0, 0, 256, 256);
    this.floorGlow = new THREE.Mesh(floorGeo.clone().scale(0.42, 1, 0.42), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false }));
    this.floorGlow.position.y = 0.001;
    this.floor = new THREE.Group();
    this.floor.add(this.floorShadow, this.floorGlow);
    this.scene.add(this.floor);

    // skin
    this.skin = new THREE.MeshPhysicalMaterial({
      color: 0xd09a74, roughness: 0.58, metalness: 0,
      sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xff9a80),
      clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.55,
    });

    this.bodyMesh = null;
    this.surface = null;
    this.regionGroup = new THREE.Group();
    this.scene.add(this.regionGroup);

    // selection frame texture (shares the tattoo's geometry)
    this.selTex = new THREE.CanvasTexture(selectionCanvas());
    this.selTex.colorSpace = THREE.SRGBColorSpace;
    this.selMat = new THREE.MeshBasicMaterial({ map: this.selTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, toneMapped: false });
    this.selMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.selMat);
    this.selMesh.renderOrder = 999; this.selMesh.visible = false;
    this.scene.add(this.selMesh);

    // ghost preview while placing
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, toneMapped: false }));
    this.ghost.visible = false; this.ghost.renderOrder = 998;
    this.scene.add(this.ghost);

    // HTML overlay: transform handle
    this.overlay = document.createElement("div");
    this.overlay.className = "viewer__overlay";
    this.overlay.innerHTML = `<button class="handle" aria-label="Drag to resize and rotate" title="Drag to resize & rotate"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M18 2.5v4.5h-4.5M6 21.5V17h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="markers"></div>`;
    container.appendChild(this.overlay);
    this.handle = this.overlay.querySelector(".handle");
    this.markersEl = this.overlay.querySelector(".markers");
    this._bindHandle();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;

    this.insetBottom = 0;
    this._resize = () => {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // keep the orbit target centered in the part of the view not covered by bottom sheets
      if (this.insetBottom > 0) this.camera.setViewOffset(w, h, 0, Math.round(this.insetBottom / 2), w, h);
      else this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
      this.dirty = true; this._updateOverlay();
    };
    new ResizeObserver(this._resize).observe(container);
    this._resize();

    this.tween = null;
    const loop = (t) => {
      requestAnimationFrame(loop);
      if (this.tween) this._stepTween(t);
      const moved = this.controls.update();
      if (moved || this.dirty || this.controls.autoRotate) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
        if (moved || this.controls.autoRotate) this._updateOverlay();
      }
    };
    requestAnimationFrame(loop);
  }

  /* ── settings ─────────────────────────────────────────────────────── */
  applySettings(s) {
    this.settings = s;
    const bg = BACKGROUNDS[s["scene.background"]] || BACKGROUNDS.charcoal;
    this.container.style.background = bg.css;
    this.bg = bg;
    const L = LIGHTING[s["scene.lighting"]] || LIGHTING.studio;
    this.scene.environmentIntensity = L.env;
    this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    for (const [light, cfg] of [[this.key, L.key], [this.fill, L.fill], [this.rim, L.rim]]) {
      light.color.set(cfg[0]); light.intensity = cfg[1];
      light.position.set(...cfg[2]).multiplyScalar(1.4);
    }
    this.renderer.toneMappingExposure = s["scene.exposure"] ?? 1;
    this.renderer.shadowMap.enabled = !!s["scene.shadows"];
    this.key.castShadow = !!s["scene.shadows"];
    this.floor.visible = !!s["scene.floor"];
    this.floorShadow.visible = !!s["scene.shadows"];
    this.camera.fov = s["scene.fov"] || 35; this.camera.updateProjectionMatrix();
    this.controls.autoRotate = !!s["scene.autoRotate"] && !this.dragging;
    this.controls.autoRotateSpeed = s["scene.autoRotateSpeed"] || 1.2;
    const pr = QUALITY[s["scene.quality"]] || QUALITY.auto;
    if (this.renderer.getPixelRatio() !== pr) { this.renderer.setPixelRatio(pr); this._resize(); }
    // skin
    const tone = new THREE.Color(s["skin.tone"] || "#d09a74");
    this.skin.color.copy(tone);
    this.skin.roughness = s["skin.roughness"] ?? 0.58;
    this.skin.sheen = s["skin.sheen"] ?? 0.35;
    this.skin.clearcoat = s["skin.oil"] ?? 0.12;
    this.skin.clearcoatRoughness = 0.55 - (s["skin.oil"] ?? 0.12) * 0.3;
    const warm = s["skin.warmth"] ?? 0.4;
    this.skin.sheenColor.copy(tone).lerp(new THREE.Color(0xff6a50), 0.5 + warm * 0.3);
    this.skin.emissive.copy(tone).lerp(new THREE.Color(0xc0402a), 0.6).multiplyScalar(warm * 0.07);
    this.skin.needsUpdate = true;
    this.selTex.image = selectionCanvas(getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e0455f");
    this.selTex.needsUpdate = true;
    this.selMesh.visible = this.selMesh.visible && s["place.showOutline"] !== false;
    this._renderMarkers();
    this.dirty = true;
    this._updateOverlay();
  }

  /* ── body ─────────────────────────────────────────────────────────── */
  setBody(geometry, regions) {
    if (this.bodyMesh) { this.scene.remove(this.bodyMesh); this.bodyMesh.geometry.dispose(); }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    this.surface = new SkinSurface(geometry);
    const m = this.bodyMesh = new THREE.Mesh(geometry, this.skin);
    SkinSurface.enableFastRaycast(m);
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.regions = regions || [];
    geometry.computeBoundingBox();
    this.bounds = geometry.boundingBox.clone();
    this._renderMarkers();
    this.dirty = true;
  }

  frameBody(animate = true) {
    if (!this.bounds) return;
    const b = this.bounds, h = b.max.y - b.min.y;
    const target = new THREE.Vector3(0, b.min.y + h * 0.53, 0);
    const halfW = Math.max(h * 0.58, (b.max.x - b.min.x) * 0.62);
    const v = (this.camera.fov * Math.PI) / 360;
    const dist = Math.max((h * 0.58) / Math.tan(v), halfW / Math.tan(Math.atan(Math.tan(v) * this.camera.aspect)));
    const dir = this.camera.position.clone().sub(this.controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(dist).add(new THREE.Vector3(0, h * 0.06, 0));
    this.moveCamera(target.clone().add(dir), target, animate);
  }

  /* ── camera ───────────────────────────────────────────────────────── */
  moveCamera(pos, target, animate = true) {
    if (!animate || this.settings["ui.reduceMotion"]) {
      this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.dirty = true; this._updateOverlay(); return;
    }
    this.tween = { t0: performance.now(), dur: 650, p0: this.camera.position.clone(), p1: pos.clone(), q0: this.controls.target.clone(), q1: target.clone() };
  }
  _stepTween(now) {
    const tw = this.tween;
    let k = Math.min(1, (now - tw.t0) / tw.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    this.camera.position.lerpVectors(tw.p0, tw.p1, e);
    this.controls.target.lerpVectors(tw.q0, tw.q1, e);
    this.dirty = true;
    if (k >= 1) this.tween = null;
    this._updateOverlay();
  }
  setInsetBottom(px) {
    px = Math.max(0, Math.round(px));
    if (px === this.insetBottom) return;
    this.insetBottom = px;
    this._resize();
  }
  /* half of the narrower field of view (portrait phones are narrow) */
  _halfFov() {
    const v = (this.camera.fov * Math.PI) / 360;
    const visH = Math.max(0.3, 1 - this.insetBottom / Math.max(1, this.container.clientHeight));
    const hz = Math.atan(Math.tan(v) * this.camera.aspect);
    return Math.min(Math.atan(Math.tan(v) * visH), hz);
  }
  focusOn(point, normal, sizeM = 0.12) {
    const p = new THREE.Vector3(...point), n = new THREE.Vector3(...normal).normalize();
    const span = Math.max(sizeM * 2.6, 0.3);
    const dist = THREE.MathUtils.clamp(span / 2 / Math.tan(this._halfFov()), 0.35, 3);
    const dir = n.clone(); dir.y = dir.y * 0.6 + 0.12; dir.normalize();
    this.moveCamera(p.clone().addScaledVector(dir, dist), p);
  }
  viewFrom(side) {
    if (!this.bounds) return;
    const b = this.bounds, h = b.max.y - b.min.y;
    const target = new THREE.Vector3(0, b.min.y + h * 0.53, 0);
    const v = (this.camera.fov * Math.PI) / 360;
    const dist = Math.max((h * 0.58) / Math.tan(v), (b.max.x - b.min.x) * 0.62 / Math.tan(Math.atan(Math.tan(v) * this.camera.aspect)));
    const dirs = { front: [0, 0.06, 1], back: [0, 0.06, -1], left: [1, 0.06, 0], right: [-1, 0.06, 0], top: [0, 1, 0.35], threequarter: [0.7, 0.12, 0.7] };
    const d = new THREE.Vector3(...(dirs[side] || dirs.front)).normalize().multiplyScalar(dist);
    this.moveCamera(target.clone().add(d), target);
  }

  /* ── tattoos ──────────────────────────────────────────────────────── */
  /* items: [{ tattoo, texture: THREE.Texture, widthM, heightM, blend }] (sizes include the texture's padding) */
  syncTattoos(items, selectedId) {
    const seen = new Set();
    items.forEach((it, order) => {
      const t = it.tattoo;
      seen.add(t.id);
      let o = this.tattooObjs.get(t.id);
      if (!o) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false });
        o = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), geoKey: "", tex: null, blend: "" };
        o.mesh.userData.tattooId = t.id;
        this.scene.add(o.mesh);
        this.tattooObjs.set(t.id, o);
      }
      o.mesh.renderOrder = 10 + order;
      o.mesh.visible = t.visible !== false;
      const geoKey = this._geoKey(t, it);
      if (geoKey !== o.geoKey && this.surface) {
        const g = this._decalGeometry(t, it);
        if (g) { o.mesh.geometry.dispose(); o.mesh.geometry = g; }
        o.geoKey = geoKey;
      }
      if (o.tex !== it.texture || o.blend !== it.blend) {
        const m = o.mesh.material;
        m.map = it.texture; o.tex = it.texture; o.blend = it.blend;
        if (it.blend === "vivid") {
          m.blending = THREE.NormalBlending; m.transparent = true;
        } else {
          // multiply the lit skin by the ink color: ink takes the skin's own shading
          m.blending = THREE.CustomBlending;
          m.blendEquation = THREE.AddEquation;
          m.blendSrc = THREE.DstColorFactor; m.blendDst = THREE.ZeroFactor;
          m.transparent = true;
        }
        m.needsUpdate = true;
      }
    });
    for (const [id, o] of this.tattooObjs) {
      if (!seen.has(id)) { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); this.tattooObjs.delete(id); }
    }
    this.selectedId = selectedId;
    const sel = selectedId && this.tattooObjs.get(selectedId);
    this.selMesh.visible = !!sel && this.settings["place.showOutline"] !== false && sel.mesh.visible;
    if (sel) this.selMesh.geometry = sel.mesh.geometry;
    this.selItem = items.find((i) => i.tattoo.id === selectedId) || null;
    this.dirty = true;
    this._updateOverlay();
  }
  _geoKey(t, it) {
    return [t.position.map((v) => v.toFixed(5)).join(","), t.normal.map((v) => v.toFixed(4)).join(","), t.rotation.toFixed(2), it.widthM.toFixed(5), it.heightM.toFixed(5), !!t.flip, this.surface?.nv, this.bodyVersion].join("|");
  }
  _decalGeometry(t, it) {
    return this.surface.buildDecal({
      position: new THREE.Vector3(...t.position), normal: new THREE.Vector3(...t.normal),
      rotation: t.rotation, width: it.widthM, height: it.heightM, flip: t.flip,
    });
  }
  /* Rebuild every decal (after the body mesh changed). */
  rebuildAll() { this.bodyVersion = (this.bodyVersion || 0) + 1; for (const o of this.tattooObjs.values()) o.geoKey = ""; }

  /* ── placing mode: a ghost of the design follows the pointer ──────── */
  startPlacing(texture, widthM, heightM, rotation = 0) {
    this.placing = { texture, widthM, heightM, rotation };
    this.ghost.material.map = texture; this.ghost.material.needsUpdate = true;
    this.container.classList.add("is-placing");
  }
  stopPlacing() {
    this.placing = null; this.ghost.visible = false; this.container.classList.remove("is-placing"); this.dirty = true;
  }

  /* ── picking ──────────────────────────────────────────────────────── */
  _ndc(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  pickBody(x, y) {
    if (!this.bodyMesh) return null;
    this.raycaster.setFromCamera(this._ndc(x, y), this.camera);
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0];
    if (!hit) return null;
    const n = this.surface.normalAt(hit.point, hit.faceIndex);
    return { point: hit.point, normal: n, faceIndex: hit.faceIndex };
  }
  pickTattoo(x, y) {
    const meshes = [...this.tattooObjs.values()].map((o) => o.mesh).filter((m) => m.visible);
    if (!meshes.length) return null;
    this.raycaster.setFromCamera(this._ndc(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    // the body may occlude: only accept if no body hit is clearly in front
    const body = this.bodyMesh && this.raycaster.intersectObject(this.bodyMesh, false)[0];
    // prefer the top-most (highest renderOrder) among hits near the first distance
    const d0 = hits[0].distance;
    const near = hits.filter((h) => h.distance < d0 + 0.004).sort((a, b) => b.object.renderOrder - a.object.renderOrder);
    if (body && body.distance < d0 - 0.01) return null;
    return near[0].object.userData.tattooId;
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.tween = null;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), moved: false, drag: null };
      if (this.placing) return; // click places; drags still orbit
      const tid = this.pickTattoo(e.clientX, e.clientY);
      if (tid) {
        this.controls.enabled = false;
        down.drag = tid;
        this.dragging = true;
        this.controls.autoRotate = false;
        el.setPointerCapture(e.pointerId);
        this.cb.onSelect?.(tid);
        this.cb.onMoveStart?.(tid);
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
      if (down?.drag) {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          const hit = this.pickBody(e.clientX, e.clientY);
          if (hit) this.cb.onMove?.(down?.drag || this.selectedId, hit.point.toArray(), hit.normal.toArray());
        });
        return;
      }
      if (this.placing && e.pointerType !== "touch") this._updateGhost(e.clientX, e.clientY);
      if (!down && !this.placing && e.pointerType === "mouse") {
        const over = this.pickTattoo(e.clientX, e.clientY);
        el.style.cursor = over ? "grab" : "";
      }
    });
    const end = (e) => {
      if (!down) return;
      const d = down; down = null;
      if (d.drag) {
        this.controls.enabled = true;
        this.dragging = false;
        this.controls.autoRotate = !!this.settings["scene.autoRotate"];
        try { el.releasePointerCapture(e.pointerId); } catch {}
        this.cb.onMoveEnd?.(d.drag, d.moved);
        return;
      }
      if (d.moved || e.type === "pointercancel") return;
      // a click / tap
      const hit = this.pickBody(e.clientX, e.clientY);
      if (this.placing) {
        if (hit) this.cb.onPlace?.(hit.point.toArray(), hit.normal.toArray());
        return;
      }
      this.cb.onSelect?.(null, hit ? { point: hit.point.toArray(), normal: hit.normal.toArray() } : null);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("pointerleave", () => { if (this.placing) { this.ghost.visible = false; this.dirty = true; } });
    el.addEventListener("wheel", (e) => {
      if (!this.selectedId || this.settings["place.wheel"] === false || !(e.shiftKey || e.altKey)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const dy = e.deltaY || e.deltaX;
      if (e.shiftKey) this.cb.onWheelScale?.(this.selectedId, Math.exp(-dy * 0.0015));
      else this.cb.onWheelRotate?.(this.selectedId, dy > 0 ? 5 : -5);
    }, { passive: false, capture: true });
  }
  _updateGhost(x, y) {
    const hit = this.pickBody(x, y);
    if (!hit) { this.ghost.visible = false; this.dirty = true; return; }
    const p = this.placing;
    const g = this.surface.buildDecal({ position: hit.point, normal: hit.normal, rotation: p.rotation, width: p.widthM, height: p.heightM });
    if (g) { this.ghost.geometry.dispose(); this.ghost.geometry = g; this.ghost.visible = true; }
    this.dirty = true;
  }

  /* ── transform handle (HTML overlay) ──────────────────────────────── */
  _project(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement;
    return { x: (p.x * 0.5 + 0.5) * r.clientWidth, y: (-p.y * 0.5 + 0.5) * r.clientHeight, z: p.z };
  }
  /* Screen position for the handle: top-right of the visible part of the
     tattoo as drawn on the skin (works for designs wrapped around limbs). */
  _handlePos(id) {
    const o = this.tattooObjs.get(id);
    const g = o?.mesh.geometry, pa = g?.attributes.position, na = g?.attributes.normal;
    if (!pa || !pa.count) return null;
    const step = Math.max(1, Math.floor(pa.count / 600));
    let best = null, bestScore = -Infinity;
    const v = new THREE.Vector3(), n = new THREE.Vector3(), toCam = new THREE.Vector3();
    for (let i = 0; i < pa.count; i += step) {
      v.fromBufferAttribute(pa, i); n.fromBufferAttribute(na, i);
      if (n.dot(toCam.copy(this.camera.position).sub(v)) <= 0) continue;
      const s = this._project(v);
      if (s.z > 1) continue;
      const score = s.x - s.y;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }
  _updateOverlay() {
    const it = this.selItem;
    const show = it && this.settings["place.showHandles"] !== false && it.tattoo.visible !== false && !this.placing;
    if (!show) { this.handle.style.display = "none"; }
    else {
      const c = this._handlePos(it.tattoo.id);
      const W = this.renderer.domElement.clientWidth, H = this.renderer.domElement.clientHeight;
      const inView = c && c.x > -20 && c.y > -20 && c.x < W + 20 && c.y < H + 20;
      this.handle.style.display = inView ? "" : "none";
      if (inView) this.handle.style.transform = `translate(${Math.min(W - 20, c.x + 10)}px, ${Math.max(20, c.y - 10)}px)`;
    }
    if (this.markerEls) this._positionMarkers();
  }
  _bindHandle() {
    let st = null;
    this.handle.addEventListener("pointerdown", (e) => {
      const it = this.selItem;
      if (!it) return;
      e.preventDefault(); e.stopPropagation();
      this.handle.setPointerCapture(e.pointerId);
      const t = it.tattoo;
      const c = this._project(new THREE.Vector3(...t.position));
      const r = this.renderer.domElement.getBoundingClientRect();
      const v0 = { x: e.clientX - r.left - c.x, y: e.clientY - r.top - c.y };
      st = { c, r, len0: Math.hypot(v0.x, v0.y) || 1, ang0: Math.atan2(v0.y, v0.x), size0: t.sizeCm, rot0: t.rotation, id: t.id };
      this.controls.enabled = false;
      this.cb.onTransformStart?.(t.id);
    });
    this.handle.addEventListener("pointermove", (e) => {
      if (!st) return;
      const vx = e.clientX - st.r.left - st.c.x, vy = e.clientY - st.r.top - st.c.y;
      const len = Math.hypot(vx, vy), ang = Math.atan2(vy, vx);
      let dA = (ang - st.ang0) * 180 / Math.PI;
      // screen-clockwise drag = clockwise rotation when the tattoo faces the camera
      const sizeCm = Math.max(0.8, Math.min(80, st.size0 * len / st.len0));
      let rot = st.rot0 + dA;
      rot = ((rot % 360) + 540) % 360 - 180;
      this.cb.onTransform?.(st.id, { sizeCm, rotation: rot });
    });
    const end = () => {
      if (!st) return;
      const id = st.id; st = null;
      this.controls.enabled = true;
      this.cb.onTransformEnd?.(id);
    };
    this.handle.addEventListener("pointerup", end);
    this.handle.addEventListener("pointercancel", end);
  }

  /* ── body-part markers ───────────────────────────────────────────── */
  _renderMarkers() {
    const on = this.settings["place.showRegions"] && this.regions?.length;
    this.markersEl.innerHTML = "";
    this.markerEls = null;
    if (!on) return;
    this.markerEls = this.regions.map((r) => {
      const b = document.createElement("button");
      b.className = "marker"; b.title = r.label; b.setAttribute("aria-label", r.label);
      b.innerHTML = `<span>${r.label}</span>`;
      b.addEventListener("click", () => this.cb.onRegionClick?.(r));
      this.markersEl.appendChild(b);
      return { el: b, r };
    });
    this._positionMarkers();
  }
  _positionMarkers() {
    for (const { el, r } of this.markerEls) {
      const p = new THREE.Vector3(...r.position), n = new THREE.Vector3(...r.normal);
      const toCam = this.camera.position.clone().sub(p).normalize();
      const s = this._project(p);
      const vis = n.dot(toCam) > 0.15 && s.z < 1;
      el.style.display = vis ? "" : "none";
      el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    }
  }

  /* ── output ───────────────────────────────────────────────────────── */
  async screenshot({ width, height, transparent = false } = {}) {
    const r = this.renderer, canvas = r.domElement;
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight;
    const W = width || Math.round(w0 * r.getPixelRatio()), H = height || Math.round(h0 * r.getPixelRatio());
    const selVis = this.selMesh.visible, ghostVis = this.ghost.visible;
    this.selMesh.visible = false; this.ghost.visible = false;
    const prevPR = r.getPixelRatio();
    if (width || height) {
      r.setPixelRatio(1); r.setSize(W, H, false);
      this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    }
    r.render(this.scene, this.camera);
    const out = document.createElement("canvas");
    out.width = canvas.width; out.height = canvas.height;
    const g = out.getContext("2d");
    if (!transparent) {
      const grad = g.createRadialGradient(out.width / 2, out.height * 0.3, 0, out.width / 2, out.height * 0.3, Math.max(out.width, out.height) * 0.9);
      grad.addColorStop(0, this.bg?.shot[0] || "#333"); grad.addColorStop(1, this.bg?.shot[1] || "#111");
      g.fillStyle = grad; g.fillRect(0, 0, out.width, out.height);
    }
    g.drawImage(canvas, 0, 0);
    if (width || height) { r.setPixelRatio(prevPR); this._resize(); }
    this.selMesh.visible = selVis; this.ghost.visible = ghostVis;
    this.dirty = true;
    return out.toDataURL("image/png");
  }
}

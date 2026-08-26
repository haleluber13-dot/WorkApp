/* MotorLab — the 3D workspace: scene, camera, picking, ghosting, exploded
 * view, cutaway sectioning, floating labels and the animation loop. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewport {
  constructor(canvas, labelHost){
    this.canvas = canvas; this.labelHost = labelHost;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 6, 26);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 200);
    this.camera.position.set(1.6, 1.1, 2.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.92;

    this._lights();
    this._ground();

    this.model = null;
    this.explode = 0;
    this.ghost = true;
    this.showLabels = false;
    this.wire = false;
    this.cutaway = false;
    this.installed = new Set();
    this.selected = null;
    this.hovered = null;
    this.highlight = new Set();
    this.labelEls = new Map();

    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.onPick = null; this.onContext = null; this.onHover = null;
    this._bindInput();

    this.state = { crankAngle:0, rpm:0, boost:0, running:false, time:0,
                   wheelAngle:0, steer:0, suspTravel:0, speed:0 };
    this._clock = new THREE.Clock();
    this._raf = null;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.start();
  }

  _lights(){
    this.scene.add(new THREE.HemisphereLight(0xa8c0e0, 0x232833, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(3.4, 5.2, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 5;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d;  key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0006;
    this.scene.add(key); this.key = key;
    const rim = new THREE.DirectionalLight(0x7fb4ff, 1.15); rim.position.set(-4, 2.4, -3.4);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffb070, 0.8, 16); fill.position.set(0, 1.4, 3.2);
    this.scene.add(fill);
  }

  _ground(){
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({ color:0x11141b, roughness:.95, metalness:.05 }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; g.add(floor);
    const grid = new THREE.GridHelper(24, 48, 0x2a3446, 0x1a212c);
    grid.material.transparent = true; grid.material.opacity = .55;
    grid.position.y = 0.001; g.add(grid);
    this.ground = g; this.scene.add(g);
  }

  _bindInput(){
    let downAt = null, moved = 0;
    const toPointer = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left)/r.width)*2 - 1, -((ev.clientY - r.top)/r.height)*2 + 1);
    };
    this.canvas.addEventListener('pointerdown', (ev) => { downAt = { x:ev.clientX, y:ev.clientY }; moved = 0; });
    this.canvas.addEventListener('pointermove', (ev) => {
      if (downAt) moved = Math.max(moved, Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y));
      toPointer(ev);
      const hit = this._raycast();
      const id = hit?.object?.userData?.partId || null;
      if (id !== this.hovered){ this.hovered = id; this._applyMaterials(); this.onHover?.(id); }
      this.canvas.style.cursor = id ? 'pointer' : 'default';
    });
    this.canvas.addEventListener('pointerup', (ev) => {
      if (downAt && moved < 5){
        toPointer(ev);
        const hit = this._raycast();
        const id = hit?.object?.userData?.partId || null;
        this.onPick?.(id, hit, ev);
      }
      downAt = null;
    });
    this.canvas.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      toPointer(ev);
      const hit = this._raycast();
      this.onContext?.(hit?.object?.userData?.partId || null, hit, ev);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (this.hovered){ this.hovered = null; this._applyMaterials(); this.onHover?.(null); }
    });
  }

  _raycast(){
    if (!this.model) return null;
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObject(this.model.root, true);
    for (const h of hits){
      const id = h.object.userData.partId;
      if (!id) continue;
      if (h.object.visible === false) continue;
      if (!this.installed.has(id) && !this.ghost) continue;
      return h;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  load(model, opts = {}){
    if (this.model) this.scene.remove(this.model.root);
    this.model = model;
    this.scene.add(model.root);
    this._origMats = new Map();
    model.root.traverse(o => { if (o.isMesh) this._origMats.set(o, o.material); });
    this.selected = null; this.hovered = null;
    this._clearLabels();
    if (opts.fit !== false) this.frame();
    this.applyInstalled(this.installed);
  }

  frame(){
    if (!this.model) return;
    const b = new THREE.Box3().setFromObject(this.model.root);
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const dist = r / Math.tan((this.camera.fov * Math.PI/180)/2) * 1.25;
    this.controls.target.copy(c);
    const dir = new THREE.Vector3(0.82, 0.46, 0.95).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist/220); this.camera.far = dist*24;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.ground.position.y = Math.min(0, b.min.y);
    this.clipPlane.constant = c.z;
  }

  focusPart(id){
    if (!this.model) return;
    const objs = this.model.nodes.get(id); if (!objs?.length) return;
    const b = new THREE.Box3();
    objs.forEach(o => b.expandByObject(o));
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const r = Math.max(0.08, Math.max(size.x, size.y, size.z));
    const dist = r * 3.1;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._tween(c, c.clone().addScaledVector(dir, dist));
  }

  _tween(target, pos){
    const t0 = performance.now(), from = this.controls.target.clone(), fp = this.camera.position.clone();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0)/420);
      const e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2;
      this.controls.target.lerpVectors(from, target, e);
      this.camera.position.lerpVectors(fp, pos, e);
      this.controls.update();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  applyInstalled(installedSet){
    this.installed = installedSet;
    this._applyMaterials();
  }

  setExplode(f){ this.explode = f; this.model?.setExplode(f); }
  setGhost(on){ this.ghost = on; this._applyMaterials(); }
  setWire(on){ this.wire = on; this._applyMaterials(); }
  setCutaway(on){
    this.cutaway = on;
    const planes = on ? [this.clipPlane] : [];
    this.model?.root.traverse(o => { if (o.isMesh && o.material){ 
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = planes; m.needsUpdate = true; });
    }});
  }
  setLabels(on){ this.showLabels = on; if (!on) this._clearLabels(); }
  select(id){ this.selected = id; this._applyMaterials(); }
  setHighlight(ids){ this.highlight = new Set(ids || []); this._applyMaterials(); }

  _applyMaterials(){
    if (!this.model) return;
    const ghostMat = this._ghostMat || (this._ghostMat = new THREE.MeshBasicMaterial({
      color:0x5d7ea8, wireframe:true, transparent:true, opacity:0.20 }));
    for (const [id, objs] of this.model.nodes){
      const inst = this.installed.has(id);
      const sel  = this.selected === id;
      const hov  = this.hovered === id;
      const hl   = this.highlight.has(id);
      for (const root of objs) root.traverse(o => {
        if (!o.isMesh) return;
        if (!inst){
          o.visible = this.ghost;
          o.material = ghostMat;
          o.castShadow = false;
          return;
        }
        o.visible = true; o.castShadow = true;
        const base = this._origMats.get(o);
        if (!base) return;
        if (sel || hov || hl){
          let m = o.userData._hi;
          if (!m){ m = base.clone(); o.userData._hi = m; }
          m.copy(base);
          m.emissive = new THREE.Color(sel ? 0xff7a1a : hl ? 0x22d3ee : 0x2f5f9f);
          m.emissiveIntensity = sel ? 0.65 : hl ? 0.5 : 0.32;
          m.wireframe = this.wire;
          m.clippingPlanes = this.cutaway ? [this.clipPlane] : [];
          o.material = m;
        } else {
          base.wireframe = this.wire;
          base.clippingPlanes = this.cutaway ? [this.clipPlane] : [];
          o.material = base;
        }
      });
    }
  }

  /* ---- floating labels ------------------------------------------------ */
  _clearLabels(){ this.labelEls.forEach(el => el.remove()); this.labelEls.clear(); }
  setLabelSource(fn){ this.labelFn = fn; }

  _updateLabels(){
    if (!this.showLabels || !this.model || !this.labelHost){ if (this.labelEls.size) this._clearLabels(); return; }
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const seen = new Set();
    const placed = [];            // screen boxes already used, to avoid a wall of text
    const MAXLABELS = 26;
    /* nearest first, so the labels you keep are the ones closest to the camera */
    const entries = [...this.model.nodes.entries()].map(([id, objs]) => {
      const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o));
      return b.isEmpty() ? null : { id, objs, centre:b.getCenter(new THREE.Vector3()) };
    }).filter(Boolean).sort((a, b) =>
      a.centre.distanceToSquared(this.camera.position) - b.centre.distanceToSquared(this.camera.position));
    for (const { id, objs, centre } of entries){
      const info = this.labelFn ? this.labelFn(id) : { name:id, installed:this.installed.has(id) };
      if (!info) continue;
      v.copy(centre);
      const p = v.clone().project(this.camera);
      if (p.z > 1 || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) continue;
      const sx = (p.x*0.5 + 0.5) * rect.width, sy = (-p.y*0.5 + 0.5) * rect.height;
      const wEst = 20 + info.name.length * 5.6, hEst = 20;
      const clash = placed.some(q => Math.abs(q.x - sx) < (q.w + wEst)/2 && Math.abs(q.y - sy) < hEst);
      const keep = this.selected === id || this.highlight.has(id);
      if ((clash || placed.length >= MAXLABELS) && !keep) continue;
      placed.push({ x:sx, y:sy, w:wEst });
      seen.add(id);
      let el = this.labelEls.get(id);
      if (!el){
        el = document.createElement('button');
        el.className = 'plabel';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.onPick?.(id, null, ev); });
        this.labelHost.appendChild(el);
        this.labelEls.set(id, el);
      }
      el.textContent = info.name;
      el.classList.toggle('on', this.selected === id);
      el.classList.toggle('miss', !info.installed);
      el.style.left = sx + 'px';
      el.style.top  = sy + 'px';
    }
    for (const [id, el] of this.labelEls) if (!seen.has(id)){ el.remove(); this.labelEls.delete(id); }
  }

  /* ---- loop ----------------------------------------------------------- */
  resize(){
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  start(){
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      const s = this.state;
      s.time += dt;
      if (s.rpm > 0) s.crankAngle = (s.crankAngle + (s.rpm/60) * Math.PI * 2 * dt) % (Math.PI*2*2);
      if (s.speed) s.wheelAngle = (s.wheelAngle + s.speed * dt) % (Math.PI*2);
      this.model?.update?.(s);
      this.controls.update();
      this._updateLabels();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  stop(){ cancelAnimationFrame(this._raf); this._raf = null; }
}

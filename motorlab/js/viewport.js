/* MotorLab — the 3D workspace: scene, camera, picking, ghosting, exploded
 * view, cutaway sectioning, floating labels and the animation loop. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

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

    this._environment();
    this._lights();
    this._ground();
    this._buildComposer('high');

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

    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.onPick = null; this.onContext = null; this.onHover = null;
    this._bindInput();

    this.state = { crankAngle:0, rpm:0, targetRpm:0, boost:0, running:false, time:0, dt:0.016,
                   load:0.55, cranking:0, idleRpm:800, redline:7000, spoolRpm:2200,
                   inertia:1, turboSpin:0, wheelAngle:0, steer:0, suspTravel:0, speed:0,
                   pitch:0, roll:0 };
    this._clock = new THREE.Clock();
    this._raf = null;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.start();
  }

  /* Image-based lighting. Metal with nothing to reflect reads as grey plastic —
   * this is the single biggest difference between a CG part and a real one. */
  _environment(){
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.03).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.85;
    room.dispose?.();
    pmrem.dispose();
  }

  /* Ambient occlusion darkens the creases where parts meet, which is what makes
   * an assembly look solid rather than like floating shapes. */
  _buildComposer(quality){
    this.composer?.dispose?.();
    this.composer = null;
    this.ssaoPass = null;
    this._verified = false;
    /* Only the top tier goes through a render pipeline. Everything below it
     * renders straight to the canvas, which always works — the realism comes
     * from the environment map and the materials, not from the post-passes. */
    if (quality !== 'high') return;
    try {
      const r = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(2, r.width | 0), h = Math.max(2, r.height | 0);
      const composer = new EffectComposer(this.renderer);
      composer.setPixelRatio(1);
      composer.setSize(w, h);
      const ssao = new SSAOPass(this.scene, this.camera, w, h);
      ssao.kernelRadius = 0.05;
      ssao.minDistance = 0.0008;
      ssao.maxDistance = 0.08;
      composer.addPass(ssao);
      this.ssaoPass = ssao;
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.30, 0.7, 0.92);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.addPass(new SMAAPass(w, h));
      this.composer = composer;
      this.bloomPass = bloom;
    } catch (err){
      console.warn('Post-processing unavailable, falling back to direct rendering', err);
      this.composer = null;
    }
  }

  setQuality(quality){
    this.quality = quality;
    this.renderer.setPixelRatio(quality === 'fast' ? 1 : Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = quality !== 'fast';
    this._buildComposer(quality);
    this.resize();
  }

  _lights(){
    this.scene.add(new THREE.HemisphereLight(0xa8c0e0, 0x232833, 0.45));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.9);
    key.position.set(3.4, 5.2, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 5;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d;  key.shadow.camera.bottom = -d;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 3;
    this.scene.add(key); this.key = key;
    const rim = new THREE.DirectionalLight(0x86b6ff, 1.5); rim.position.set(-4.2, 2.4, -3.6);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffb070, 0.6, 16); fill.position.set(0, 1.4, 3.2);
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
    this.clipPlane.constant = c.z;   // section straight down the cylinder axis
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
  /* Only the castings get sectioned. The crank, rods, pistons, cams and valves
   * stay whole inside the cut, which is the whole point of a cutaway. */
  static CASTINGS = new Set(['block','head','headgasket','valvecover','oilpan','frontcover',
    'intake','rotorhousing','stationary','clutch','flywheel','radiator','intercooler',
    'exmanifold','exhaust','turbo','blower','body','chassis','cage','tank','gearbox','diff']);
  planesFor(id){
    return (this.cutaway && Viewport.CASTINGS.has(id)) ? [this.clipPlane] : [];
  }
  setCutaway(on){
    this.cutaway = on;
    if (!this.model) return;
    for (const [id, objs] of this.model.nodes){
      const planes = this.planesFor(id);
      for (const root of objs) root.traverse(o => {
        if (!o.isMesh || !o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          m.clippingPlanes = planes; m.side = on ? THREE.DoubleSide : m.side; m.needsUpdate = true;
        });
      });
    }
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
          m.clippingPlanes = this.planesFor(id);
          o.material = m;
        } else {
          base.wireframe = this.wire;
          base.clippingPlanes = this.planesFor(id);
          o.material = base;
        }
      });
    }
  }

  /* ---- floating labels ------------------------------------------------ */
  _clearLabels(){ this.labelEls.forEach(el => el.remove()); this.labelEls.clear(); }
  setLabelSource(fn){ this.labelFn = fn; }

  _updateLabels(){
    if (!this.model || !this.labelHost){ if (this.labelEls.size) this._clearLabels(); return; }
    /* A part names itself when you touch it — hover or selection. The pin
     * button is there for when you deliberately want the whole map at once. */
    const want = new Set();
    if (this.hovered) want.add(this.hovered);
    if (this.selected) want.add(this.selected);
    for (const id of this.highlight) want.add(id);
    if (this.showLabels) for (const id of this.model.nodes.keys()) want.add(id);
    if (!want.size){ if (this.labelEls.size) this._clearLabels(); return; }

    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const seen = new Set();
    const placed = [];
    for (const id of want){
      const objs = this.model.nodes.get(id);
      if (!objs?.length) continue;
      const info = this.labelFn ? this.labelFn(id) : { name:id, installed:this.installed.has(id) };
      if (!info) continue;
      const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o));
      if (b.isEmpty()) continue;
      b.getCenter(v);
      const p = v.project(this.camera);
      if (p.z > 1 || p.x < -1.05 || p.x > 1.05 || p.y < -1.05 || p.y > 1.05) continue;
      const sx = (p.x*0.5 + 0.5) * rect.width, sy = (-p.y*0.5 + 0.5) * rect.height;
      if (this.showLabels && id !== this.hovered && id !== this.selected){
        const wEst = 20 + info.name.length * 5.6;
        if (placed.some(q => Math.abs(q.x - sx) < (q.w + wEst)/2 && Math.abs(q.y - sy) < 20)) continue;
        placed.push({ x:sx, y:sy, w:wEst });
      }
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
    this.composer?.setSize(r.width, r.height);
    this.ssaoPass?.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  start(){
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      const s = this.state;
      s.time += dt; s.dt = dt;
      this._engineDynamics(dt, s);
      if (s.rpm > 0) s.crankAngle = (s.crankAngle + (s.rpm/60) * Math.PI * 2 * dt) % (Math.PI*2*2);
      if (s.speed) s.wheelAngle = (s.wheelAngle + s.speed * dt) % (Math.PI*2);
      this.model?.update?.(s);
      this.controls.update();
      this._updateLabels();
      if (this.composer){ this.composer.render(dt); this._verifyComposer(); }
      else this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  stop(){ cancelAnimationFrame(this._raf); this._raf = null; }

  /* Some drivers cannot give us the float render targets the pipeline needs and
   * quietly hand back an empty frame. Check once, and fall back rather than
   * leaving somebody staring at a black viewport. */
  _verifyComposer(){
    if (!this.composer || this._verified) return;
    this._checks = (this._checks || 0) + 1;
    if (this._checks < 6) return;
    this._verified = true;
    try {
      const gl = this.renderer.getContext();
      const w = this.renderer.domElement.width, h = this.renderer.domElement.height;
      if (!w || !h) return;
      const px = new Uint8Array(4 * 256);
      gl.readPixels((w >> 1) - 8, (h >> 1) - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i+1] + px[i+2];
      if (sum === 0){
        console.warn('MotorLab: this GPU returned an empty frame from the render pipeline — using direct rendering instead.');
        this.composer = null; this.ssaoPass = null;
        this.onQualityFallback?.();
      }
    } catch { /* readPixels unavailable; leave the pipeline alone */ }
  }

  /* A real engine does not step between speeds: the starter drags it over, it
   * catches, it settles to a hunting idle, and the flywheel resists every
   * change after that. The turbo shaft lags behind all of it. */
  _engineDynamics(dt, s){
    /* wall-clock, so the start sequence takes the same time on any frame rate */
    if (s.crankEnd && performance.now() < s.crankEnd){
      s.cranking = (s.crankEnd - performance.now()) / 1000;
      s.rpm += ((s.crankSpeed || 240) - s.rpm) * Math.min(1, dt * 7);
    } else if (s.crankEnd){
      s.crankEnd = 0; s.cranking = 0;
      s.rpm = s.idleRpm * 1.35;                      // it catches and flares
      s.targetRpm = s.idleRpm;
    } else if (s.targetRpm != null){
      /* a heavy flywheel picks up slowly and holds revs on the way down */
      const rising = s.targetRpm > s.rpm;
      const rate = (rising ? 2.6 : 1.9) / Math.max(0.35, s.inertia);
      s.rpm += (s.targetRpm - s.rpm) * Math.min(1, dt * rate);
      if (s.targetRpm > 0 && Math.abs(s.rpm - s.targetRpm) < s.targetRpm * 0.06){
        const hunt = s.targetRpm <= s.idleRpm * 1.15 ? 18 : 5;
        s.rpm = s.targetRpm + Math.sin(s.time * 5.7) * hunt + Math.sin(s.time * 13.1) * hunt * 0.4;
      }
      if (s.rpm < 30) s.rpm = s.targetRpm > 0 ? s.rpm : 0;
    }
    s.running = s.rpm > 40;
    s.load = Math.min(1, 0.25 + 0.75 * (s.rpm / Math.max(1000, s.redline)));
    /* compressor inertia: spins up with exhaust energy, coasts back down */
    const want = s.running && s.boost >= 0
      ? Math.min(62, (s.rpm / Math.max(600, s.spoolRpm)) * 26 * (1 + (s.boost || 0)))
      : 0;
    s.turboSpin += (want - s.turboSpin) * Math.min(1, dt * (want > s.turboSpin ? 1.5 : 0.8));
    /* the body settles back after a launch or a corner */
    s.pitch += (0 - s.pitch) * Math.min(1, dt * 2.0);
    s.roll  += (0 - s.roll)  * Math.min(1, dt * 2.4);
  }

  /** Weight transfer for the vehicle view: +1 squats the rear, −1 dives the nose. */
  setAttitude(pitch, roll = 0){ this.state.pitch = pitch; this.state.roll = roll; }

  /** Turn it over: the starter, then it catches. */
  startEngine(idleRpm, opts = {}){
    const s = this.state;
    s.idleRpm = idleRpm;
    s.redline = opts.redline ?? s.redline;
    s.spoolRpm = opts.spoolRpm ?? s.spoolRpm;
    s.inertia = opts.inertia ?? 1;
    s.crankSpeed = Math.max(180, idleRpm * 0.3);
    s.crankEnd = performance.now() + 900;
    s.cranking = 0.9;
    s.targetRpm = idleRpm;
  }
  stopEngine(){ const s = this.state; s.cranking = 0; s.crankEnd = 0; s.targetRpm = 0; }
  revTo(rpm){ const s = this.state; s.cranking = 0; s.crankEnd = 0; s.targetRpm = rpm; }
}

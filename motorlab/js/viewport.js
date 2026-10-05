/* MotorLab — the 3D workspace: scene, camera, picking, ghosting, exploded
 * view, cutaway sectioning, floating labels and the animation loop. */
import * as THREE from 'three';
import { baseId } from './data/parts.js';
import { assetBytes } from './lib/assets.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { surface, whenTextures } from './lib/textures.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { TIERS, LOOK, buildRig, fitRig, buildFloor, fitFloor, ssaoFor, preToneMapped } from './lib/studio.js';

/* Ambient occlusion reads a normal+depth pass of the scene. A ghosted part is
 * drawn as a faint wireframe, but the normal pass would draw it solid and it
 * would then shade the parts around it as if it were still there; the glass
 * shell and the contact blob are see-through for the same reason. Leave them
 * out of that one pass. */
class StudioSSAOPass extends SSAOPass {
  overrideVisibility(){
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      if (m.wireframe || (m.transparent && m.opacity < 0.5)) o.visible = false;
    });
  }
}

export class Viewport {
  constructor(canvas, labelHost){
    this.canvas = canvas; this.labelHost = labelHost;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
    /* a phone that runs out of graphics memory drops the context and shows a
       black canvas with no explanation — say what happened instead */
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); dispatchEvent(new CustomEvent('motorlab:gl-lost')); });
    canvas.addEventListener('webglcontextrestored', () => dispatchEvent(new CustomEvent('motorlab:gl-restored')));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;

    this.scene = new THREE.Scene();
    this.bgColor = new THREE.Color(LOOK.background);
    this.scene.background = this.bgColor.clone();
    this.scene.fog = new THREE.Fog(LOOK.background, 6, 26);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 200);
    this.camera.position.set(1.6, 1.1, 2.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.92;

    this._environment();
    this._studio();
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

    /* The bench: parts you have taken off and set down. Keyed by part id, the
       value is an offset from where that part lives on the machine, so it
       survives an explode and an animation frame without either fighting it. */
    this.bench = new Map();
    this.benchNode = null;
    this.dragging = null;
    this.holdMs = 420;
    this.benchSnap = true;

    this.onPick = null; this.onContext = null; this.onHover = null;
    this.onLift = null; this.onDrop = null;
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
    /* the generated room is the floor: it always works, needs no download, and
       is what everything falls back to */
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.03).texture;
    this.roomEnv = this.envMap;
    this.scene.environment = this.envMap;
    room.dispose?.();
    pmrem.dispose();
    /* Two things set the environment level: the per-environment gain (a
       photograph of a room is as bright as that room was) and the Reflections
       setting, which writes scene.environmentIntensity directly. Make the
       property the product of the two, so switching rooms keeps the setting
       and the setting keeps the room's gain. 0.85 is the setting's default. */
    this._envGain = LOOK.envGain.neutral;
    this._envUser = 1;
    Object.defineProperty(this.scene, 'environmentIntensity', {
      configurable: true,
      get: () => this._envGain * this._envUser,
      set: (v) => { this._envUser = (Number(v) || 0) / 0.85; },
    });
  }

  /** Light the scene with a real place.
   *
   *  Chrome, clearcoat paint and glass do not look like anything on their own —
   *  they look like whatever they are reflecting. A procedural room gives soft
   *  studio light and nothing to reflect; a photographed environment gives the
   *  strip lights, the roller door and the far wall, and suddenly a polished
   *  rim reads as metal. These are equirectangular HDRs, prefiltered once into
   *  a radiance map and then just used.
   */
  setEnvironment(id, base = ''){
    if (id === this._envId) return Promise.resolve(true);
    /* these are photographs of real rooms, so they arrive at whatever
       brightness that room happened to be; each is scaled to sit at the same
       working level as the generated one */
    const GAIN = LOOK.envGain;
    const fall = () => {
      this._envId = 'neutral';
      this.scene.environment = this.roomEnv;
      this._envGain = GAIN.neutral;
      this._floorEnv(this.roomEnv);
      this._applyBackdrop();
      this.needsRender = true;
      return false;
    };
    if (!id || id === 'neutral') return Promise.resolve(fall());

    const cached = (this._envCache ||= new Map()).get(id);
    const apply = (tex) => {
      this._envId = id;
      this.scene.environment = tex;
      this._envGain = GAIN[id] ?? GAIN.other;
      this._floorEnv(tex);
      this._applyBackdrop();
      this.needsRender = true;
      return true;
    };
    if (cached) return Promise.resolve(apply(cached));

    const finish = (hdr, res) => {
      const pm = new THREE.PMREMGenerator(this.renderer);
      pm.compileEquirectangularShader();
      const tex = pm.fromEquirectangular(hdr).texture;
      pm.dispose();
      hdr.dispose();
      this._envCache.set(id, tex);
      res(apply(tex));
    };
    /* In the single-file build the map is inlined: decode it here rather than
       fetch()ing a data: URI, which a sandboxed host may refuse — and losing
       the light is losing what makes the paint read as paint. */
    const local = assetBytes(`env/${id}.hdr`);
    if (local !== null){
      return new Promise((res) => {
        try {
          const rl = new RGBELoader();
          const d = rl.parse(local);
          if (!d) return res(fall());
          const hdr = new THREE.DataTexture(d.data, d.width, d.height, d.format, d.type);
          hdr.colorSpace = THREE.LinearSRGBColorSpace;
          hdr.flipY = true;
          hdr.magFilter = THREE.LinearFilter;
          hdr.needsUpdate = true;
          finish(hdr, res);
        } catch { res(fall()); }
      });
    }
    const mgr = new THREE.LoadingManager();
    const inlined = globalThis.__MOTORLAB_ASSETS;
    if (inlined) mgr.setURLModifier((url) => {
      const key = './assets/' + String(url).split('/assets/').pop();
      return inlined[key] || url;
    });
    return new Promise((res) => {
      new RGBELoader(mgr).load(`${base}./assets/env/${id}.hdr`, (hdr) => finish(hdr, res),
                               undefined, () => res(fall()));
    });
  }

  /* In this three.js a material that leans on scene.environment gets the
   * scene's intensity, not its own: the floor would mirror the room as hard
   * as the chrome does and the whole scene would read as ice. The floor
   * carries its own copy of the map, so its own, much lower, intensity
   * applies. */
  _floorEnv(tex){
    const mat = this.floorRig?.floorMat;
    if (!mat) return;
    mat.envMap = tex;
    mat.needsUpdate = true;
  }

  /** Show the environment behind the model as well as in its reflections. */
  setBackdrop(on){
    this.envBackdrop = !!on;
    this._applyBackdrop();
    this.needsRender = true;
  }

  /** What is behind the model: the blurred room when the backdrop is on and
   *  the room has loaded, the studio colour otherwise. The studio colour is
   *  display-referred; when the frame goes through the composer it is cleared
   *  into a linear buffer and tone-mapped on the way out, so it has to go in
   *  as the colour that comes OUT as the one we want. */
  _applyBackdrop(){
    const tex = this.envBackdrop ? this._envCache?.get(this._envId) : null;
    if (tex){
      this.scene.background = tex;
      this.scene.backgroundBlurriness = 0.55;
      return;
    }
    this.scene.background = this.composer ? this._fogColor() : this.bgColor.clone();
  }

  /** The fog colour. Drawn straight to the canvas, three mixes fog in after
   *  tone mapping, in display colour, so it is simply the backdrop colour.
   *  Through the composer the frame is linear until the OutputPass, fog and
   *  clear colour included, so both go in as the colour the tone mapper will
   *  turn INTO the backdrop colour. */
  _fogColor(){
    if (!this.composer) return this.bgColor.clone();
    const exp = this.renderer.toneMappingExposure;
    const tm = this.renderer.toneMapping;
    if (!this._fogCache || this._fogCache.exp !== exp || this._fogCache.tm !== tm || !this._fogCache.bg.equals(this.bgColor)){
      this._fogCache = { exp, tm, bg: this.bgColor.clone(), color: preToneMapped(this.bgColor, exp, tm) };
    }
    return this._fogCache.color.clone();
  }

  /* Ambient occlusion darkens the creases where parts meet, which is what makes
   * an assembly look solid rather than like floating shapes. */
  _buildComposer(quality){
    this.composer?.dispose?.();
    this.composer = null;
    this.ssaoPass = null;
    this.bloomPass = null;
    this._verified = false;
    this._checks = 0;
    const tier = TIERS[quality] || TIERS.balanced;
    /* 'fast' renders straight to the canvas, which always works. The other two
     * go through a pipeline: scene → (ambient occlusion) → tone mapping → SMAA.
     * The realism still comes from the lights, the environment map and the
     * materials; the passes are what stop it looking like a game. */
    if (!tier.composer) { this._applyBackdrop(); return; }
    try {
      const r = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(2, r.width | 0), h = Math.max(2, r.height | 0);
      const pr = this.renderer.getPixelRatio();
      /* a multisampled colour buffer keeps the geometry edges clean before SMAA
         ever sees them; the half-float type keeps the highlights for the tone
         mapper */
      const target = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType, samples: this.renderer.capabilities.isWebGL2 ? tier.msaa : 0 });
      const composer = new EffectComposer(this.renderer, target);
      composer.setPixelRatio(pr);        // (re)sizes the targets to w·pr × h·pr
      composer.addPass(new RenderPass(this.scene, this.camera));
      if (tier.ssao){
        /* SSAOPass multiplies its occlusion over whatever the RenderPass left
           in the buffer — it does not draw the scene itself */
        const ssao = new StudioSSAOPass(this.scene, this.camera, w, h);
        ssao.kernelRadius = 0.05;
        ssao.minDistance = 0.00002;
        ssao.maxDistance = 0.0015;
        composer.addPass(ssao);
        this.ssaoPass = ssao;
      }
      composer.addPass(new OutputPass());
      if (tier.smaa) composer.addPass(new SMAAPass(w, h));
      this.composer = composer;
      this._syncSSAO();
    } catch (err){
      console.warn('Post-processing unavailable, falling back to direct rendering', err);
      this.composer = null;
      this.ssaoPass = null;
    }
    this._applyBackdrop();
    this.scene.fog.color.copy(this._fogColor());
  }

  /** 'fast' | 'balanced' | 'high' — see TIERS in lib/studio.js. */
  setQuality(quality){
    const tier = TIERS[quality] || TIERS.balanced;
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.pixelRatio));
    this.renderer.shadowMap.enabled = tier.shadows;
    this._buildComposer(quality);
    this._fitStudio();
    this.resize();
  }

  /** The current tier's settings. */
  tier(){ return TIERS[this.quality] || TIERS.high; }

  /* The studio: a three-point rig plus an overhead pool of light, and a dark
   * floor that takes the shadows. Both are re-fitted to every model that is
   * set, so an engine and a car each get a rig and a shadow map scaled to
   * themselves. `ground` is the whole floor group (main.js and the track hide
   * it as one); `grid` is just the grid inside it. */
  _studio(){
    this.rig = buildRig();
    this.scene.add(this.rig.group);
    this.key = this.rig.key;
    this.floorRig = buildFloor();
    this.ground = this.floorRig.group;
    this.grid = this.floorRig.gridHolder;
    this.scene.add(this.ground);
    this._floorEnv(this.scene.environment);
    /* a scanned concrete surface, used only for its grain: a faint normal map
       breaks the sheen up so the floor reads as a real surface, not a mirror */
    whenTextures(() => {
      const maps = surface('floor', 40, false);
      const mat = this.floorRig.floorMat;
      if (maps.normalMap){ mat.normalMap = maps.normalMap; mat.normalScale = new THREE.Vector2(0.04, 0.04); }
      if (maps.roughnessMap) mat.roughnessMap = maps.roughnessMap;
      mat.needsUpdate = true;
      if (this._subject) fitFloor(this.floorRig, this._subject.box, this._subject.floorY);
      this.needsRender = true;
    });
    this._fitStudio();
  }

  /** Fit lights, shadow camera, floor and fog to the current model (or to a
   *  default engine-sized subject when there is none). */
  _fitStudio(){
    let box;
    if (this.model){
      box = new THREE.Box3().setFromObject(this.model.root);
      if (box.isEmpty()) box = null;
    }
    if (!box) box = new THREE.Box3(new THREE.Vector3(-0.5, -0.4, -0.35), new THREE.Vector3(0.5, 0.4, 0.35));
    const rootY = this.model?.root.position.y || 0;
    /* the car on the lift has been raised: the floor stays where it was */
    const base = box.clone().translate(new THREE.Vector3(0, -rootY, 0));
    const floorY = Math.min(0, base.min.y);
    const sub = fitRig(this.rig, box, floorY, this.tier());
    const floorRadius = fitFloor(this.floorRig, base, floorY);
    this._subject = { box: base, floorY, c: sub.c, r: sub.r, size: sub.size, floorRadius, rootY };
    /* the fog closes in at the edge of the slab, so the floor melts into the
       backdrop instead of ending */
    this.scene.fog.near = Math.max(1.2, sub.r * 3.5);
    this.scene.fog.far = floorRadius * 0.85;
    this.scene.fog.color.copy(this._fogColor());
    this._syncSSAO();
    this.needsRender = true;
  }

  /** Ambient occlusion measures in the camera's depth range and uses its
   *  projection; both change with the subject and the zoom. */
  _syncSSAO(){
    const ssao = this.ssaoPass;
    if (!ssao) return;
    const r = this._subject?.r || 0.6;
    const s = ssaoFor(r, this.camera.near, this.camera.far);
    ssao.kernelRadius = s.kernelRadius;
    ssao.minDistance = s.minDistance;
    ssao.maxDistance = s.maxDistance;
    const u = ssao.ssaoMaterial.uniforms;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    u.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    u.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    const d = ssao.depthRenderMaterial.uniforms;
    d.cameraNear.value = this.camera.near;
    d.cameraFar.value = this.camera.far;
  }

  _bindInput(){
    let downAt = null, moved = 0, holdTimer = null;
    const toPointer = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left)/r.width)*2 - 1, -((ev.clientY - r.top)/r.height)*2 + 1);
    };
    const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };

    this.canvas.addEventListener('pointerdown', (ev) => {
      downAt = { x:ev.clientX, y:ev.clientY }; moved = 0;
      if (ev.button !== 0) return;
      toPointer(ev);
      const hit = this._raycast();
      const id = hit?.object?.userData?.partId || null;
      if (!id) return;
      /* Press and hold to pick a part up. A plain click still selects, and a
         drag still orbits — the hold only fires if neither happened first. */
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (moved >= 6) return;
        if (this.onLift && this.onLift(id) === false) return;
        this._beginDrag(id, hit.point);
      }, this.holdMs ?? 420);
    });

    this.canvas.addEventListener('pointermove', (ev) => {
      if (downAt) moved = Math.max(moved, Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y));
      if (moved >= 6 && holdTimer) cancelHold();
      toPointer(ev);
      if (this.dragging){ this._dragTo(); return; }
      const hit = this._raycast();
      const id = hit?.object?.userData?.partId || null;
      if (id !== this.hovered){ this.hovered = id; this._applyMaterials(); this.onHover?.(id); }
      this.canvas.style.cursor = id ? 'pointer' : 'default';
    });

    this.canvas.addEventListener('pointerup', (ev) => {
      cancelHold();
      if (this.dragging){ this._endDrag(); downAt = null; return; }
      if (downAt && moved < 5){
        toPointer(ev);
        const hit = this._raycast();
        const id = hit?.object?.userData?.partId || null;
        this.onPick?.(id, hit, ev);
      }
      downAt = null;
    });
    this.canvas.addEventListener('pointercancel', () => { cancelHold(); if (this.dragging) this._endDrag(); });
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
      if (!this.installed.has(id) && !this.bench.has(id) && !this.ghost) continue;
      if (h.object.visible === false) continue;
      return h;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  load(model, opts = {}){
    if (this.model) this.scene.remove(this.model.root);
    /* the bench is sized and placed from the machine, so it belongs to it */
    if (this.benchNode){ this.scene.remove(this.benchNode); this.benchNode = null; }
    this.dragging = null; this.controls.enabled = true;
    this.model = model;
    this.scene.add(model.root);
    if (this.service && this.service !== 'ground'){
      model.root.position.y = this.service === 'lift' ? this._liftY() : 0;
      this._applyBayClip(this.service === 'bay');
    }
    this._origMats = new Map();
    model.root.traverse(o => { if (o.isMesh) this._origMats.set(o, o.material); });
    this.selected = null; this.hovered = null;
    this._clearLabels();
    if (opts.fit !== false) this.frame();
    this._fitStudio();
    this.applyInstalled(this.installed);
    if (this.bench.size){ this._ensureBench(); this.benchNode.visible = true; this._applyBench(); }
  }

  frame(){
    /* seated in the car: the model reloading behind us must not yank the
       camera back out to the orbit framing */
    if (this.interior) return;
    if (!this.model) return;
    const b = new THREE.Box3().setFromObject(this.model.root);
    if (b.isEmpty()) return;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    /* fit the bounding sphere into the narrower of the two fields of view,
       with a little air around it */
    const R = Math.max(0.1, size.length() / 2);
    const vFov = this.camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (this.camera.aspect || 1));
    const dist = R / Math.sin(Math.min(vFov, hFov) / 2) * 0.90;   // the box diagonal over-states the sphere
    this.controls.target.copy(c);
    /* A three-quarter view. An engine is looked at from a little above, the
       way it sits on a stand in front of you; a car from about chest height —
       higher than that and every car reads as a floor plan of itself, the roof
       fills the frame and the shape of the flanks, which is what you actually
       recognise a car by, goes flat. */
    const vehicle = Math.max(size.x, size.z) > 2.4;
    const dir = vehicle ? new THREE.Vector3(0.94, 0.30, 0.80) : new THREE.Vector3(0.90, 0.46, 0.80);
    dir.normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    /* aim a little below the centre: the model rides higher in the frame,
       clear of the controls along the bottom of the view */
    this.controls.target.y -= size.y * 0.06;
    /* near is set from the subject, not the distance: zooming in on a bolt
       must not clip the engine behind it, and the far plane has to reach the
       far edge of the floor and the fog */
    this.camera.near = THREE.MathUtils.clamp(R * 0.012, 0.005, 0.05);
    this.camera.far = Math.max(60, R * 120);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.clipPlane.constant = c.z;   // section straight down the cylinder axis
  }

  /** The objects of one part — or of every piece of a part, when given the
   *  whole ("pistons" → pistons.1 … pistons.6). */
  nodesFor(id){
    if (!this.model) return [];
    const direct = this.model.nodes.get(id);
    if (direct?.length) return direct;
    const out = [];
    for (const [k, objs] of this.model.nodes) if (k.startsWith(id + '.')) out.push(...objs);
    return out;
  }

  focusPart(id){
    if (!this.model) return;
    const objs = this.nodesFor(id); if (!objs?.length) return;
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

  setExplode(f){ this.explode = f; this.model?.setExplode(f); this._applyBench(); }

  /* ------------------------------------------------------------------
   * The bench.
   *
   * Taking a part off and reading about it are two different things, and the
   * second one is much easier when the part is in front of you instead of
   * buried in the machine. Press and hold a part and it comes off in your
   * hand; drag it to the bench and let go and it stays there, at whatever
   * angle you left it, while everything else carries on being a car.
   *
   * A benched part is stored as an offset from where it lives on the machine
   * rather than as an absolute position, so an explode, an animation frame or
   * a rebuild cannot leave it somewhere it was never put.
   * ------------------------------------------------------------------ */
  _applyBench(){
    if (!this.model?.home) return;
    for (const [id, off] of this.bench){
      const objs = this.model.nodes.get(id);
      if (!objs) continue;
      for (const o of objs){
        const h = this.model.home.get(o);
        if (h) o.position.copy(h).add(off);
      }
    }
  }

  /** The height a part rests at once it is put down. */
  _benchY(){
    const b = this.model ? new THREE.Box3().setFromObject(this.model.root) : null;
    return b && isFinite(b.min.y) ? Math.max(0, b.min.y) + 0.02 : 0.02;
  }

  /** Make the bench itself: a plain top beside the machine, so there is
   *  somewhere obvious to put things and a sense of scale next to them. */
  _ensureBench(){
    if (this.benchNode || !this.model) return;
    const b = new THREE.Box3().setFromObject(this.model.root);
    const size = b.getSize(new THREE.Vector3());
    /* Deliberately low and off to one side. A bench at working height, beside
       an engine, is nearly as big as the engine and sits between it and the
       camera — so the thing you came to look at ends up behind a slab. This
       one is knee height and stands clear. */
    const w = Math.max(size.x, size.z) * 0.52, d = w * 0.58, t = w * 0.018;
    const legH = Math.max(0.12, size.y * 0.20);
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color:0x232b39, roughness:0.78, metalness:0.04 });
    const steel = new THREE.MeshStandardMaterial({ color:0x2f394d, roughness:0.5, metalness:0.65 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), wood);
    top.receiveShadow = true;
    g.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(t * 1.3, legH, t * 1.3), steel);
      leg.position.set(sx * (w/2 - t), -legH/2 - t/2, sz * (d/2 - t));
      g.add(leg);
    }
    g.position.set(-size.x * 0.10, this._benchY() + legH, b.max.z + d * 0.80);
    g.userData.benchTopY = g.position.y + t / 2;
    g.userData.benchW = w; g.userData.benchD = d;
    g.visible = false;
    this.benchNode = g;
    this.scene.add(g);
  }

  /** Where the bench top is, in world units. */
  benchSpot(){
    this._ensureBench();
    const g = this.benchNode;
    if (!g) return new THREE.Vector3(0, 0.4, 0);
    return new THREE.Vector3(g.position.x, g.userData.benchTopY, g.position.z);
  }

  _beginDrag(id, grabPoint){
    const objs = this.model?.nodes.get(id);
    if (!objs?.length) return;
    this._ensureBench();
    if (this.benchNode) this.benchNode.visible = true;
    this.controls.enabled = false;
    this.canvas.style.cursor = 'grabbing';
    const y = this.benchNode ? this.benchNode.userData.benchTopY : this._benchY();
    /* pop it clear of the machine straight away — a part that comes off and
       does not move has not visibly come off */
    const box = new THREE.Box3().setFromObject(this.model.root);
    const lift = Math.max(0.05, box.getSize(new THREE.Vector3()).y * 0.16);
    const start = (this.bench.get(id)?.clone() || new THREE.Vector3()).add(new THREE.Vector3(0, lift, 0));
    this.bench.set(id, start);
    this.dragging = {
      id,
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -Math.max(y, grabPoint.y + lift)),
      start: start.clone(),
      grab: grabPoint.clone().setY(grabPoint.y + lift),
    };
    this._applyBench();
    this._applyMaterials();
    this.select(id);
  }

  _dragTo(){
    const d = this.dragging;
    if (!d) return;
    this.ray.setFromCamera(this.pointer, this.camera);
    const at = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(d.plane, at)) return;
    const off = d.start.clone().add(at).sub(d.grab);
    this.bench.set(d.id, off);
    this._applyBench();
  }

  _endDrag(){
    const d = this.dragging;
    this.dragging = null;
    this.controls.enabled = true;
    this.canvas.style.cursor = 'default';
    if (!d) return;
    /* let go anywhere near the bench and it settles onto it squarely, which is
       much easier than landing it by hand */
    const spot = this.benchSpot();
    const objs = this.model?.nodes.get(d.id) || [];
    const box = new THREE.Box3();
    objs.forEach(o => box.expandByObject(o));
    if (!box.isEmpty()){
      const c = box.getCenter(new THREE.Vector3());
      const near = Math.hypot(c.x - spot.x, c.z - spot.z);
      const reach = Math.max(0.4, (this.benchNode?.userData.benchW || 1.2) * 0.5);
      if (this.benchSnap !== false && near < reach * 1.4){
        const off = this.bench.get(d.id) || new THREE.Vector3();
        off.y += spot.y - box.min.y;
        this.bench.set(d.id, off);
        this._applyBench();
      }
    }
    this.onDrop?.(d.id, this.bench.get(d.id));
  }

  /** Put one part, or everything, back where it came from. */
  clearBench(id){
    if (id) this.bench.delete(id); else this.bench.clear();
    if (!this.bench.size && this.benchNode) this.benchNode.visible = false;
    this.setExplode(this.explode);
  }

  /** Restore a saved bench — [[partId, [x,y,z]], …]. */
  setBench(entries){
    this.bench.clear();
    for (const [id, xyz] of entries || []) this.bench.set(id, new THREE.Vector3(...xyz));
    if (this.bench.size){ this._ensureBench(); if (this.benchNode) this.benchNode.visible = true; }
    else if (this.benchNode) this.benchNode.visible = false;
    this._applyBench();
  }

  benchEntries(){
    return [...this.bench].map(([id, v]) => [id, [v.x, v.y, v.z]]);
  }

  setGhost(on){ this.ghost = on; this._applyMaterials(); }
  setWire(on){ this.wire = on; this._applyMaterials(); }
  /* Only the castings get sectioned. The crank, rods, pistons, cams and valves
   * stay whole inside the cut, which is the whole point of a cutaway. */
  static CASTINGS = new Set(['block','head','headgasket','valvecover','oilpan','frontcover',
    'intake','rotorhousing','stationary','clutch','flywheel','radiator','intercooler',
    'exmanifold','exhaust','turbo','blower','body','chassis','cage','tank','gearbox','diff']);
  planesFor(id){
    const planes = [];
    if (this.cutaway && Viewport.CASTINGS.has(baseId(id))) planes.push(this.clipPlane);
    /* front clip off: the shell alone is cut open ahead of the firewall */
    if (this._bayPlane && id === this.model?.shellId) planes.push(this._bayPlane);
    return planes;
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

  /* ---- service states: on the ground, on the lift, front clip off ------ */
  static LIFT_IDS = new Set(['chassis','subfront','subrear','mounts','exhaustsys','prop','diff',
    'axles','final','lcaf','lcar','ucaf','ucar','dampf','dampr','strutf','strutr','arbf','arbr',
    'uprf','uprr','discf','discr','calf','calr','rack','tank','hbrake','abs','mcyl','gearbox',
    'transfer','wheels']);
  static BAY_IDS = new Set(['engine','gearbox','rad','intake','battery','mcyl','abs','subfront',
    'mounts','fusebox','harness']);

  /** 'ground' | 'lift' | 'bay'. The lift raises the whole car on a two-post
   *  rig and shows the underside running gear the scan is hiding; 'bay' takes
   *  the front clip off the shell so the engine sits in the open. */
  setService(mode = 'ground', dims = {}){
    this.service = mode;
    this._serviceDims = dims;
    /* the rig */
    if (mode === 'lift' && !this._liftRig){
      const rig = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, metalness: 0.6, roughness: 0.5 });
      const post = new THREE.BoxGeometry(0.28, 2.6, 0.20);
      const w = (dims.widthMm || 1800) / 1000;
      for (const zs of [-1, 1]){
        const pMesh = new THREE.Mesh(post, steel);
        pMesh.position.set(0, 1.3, zs * (w / 2 + 0.55));
        rig.add(pMesh);
        for (const xs of [-1, 1]){
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.12), steel);
          arm.position.set(xs * 0.55, this._liftY() - 0.10, zs * (w / 2 + 0.18));
          arm.rotation.y = zs * xs * -0.5;
          rig.add(arm);
        }
      }
      this._liftRig = rig;
      this.scene.add(rig);
    } else if (mode !== 'lift' && this._liftRig){
      this.scene.remove(this._liftRig);
      this._liftRig = null;
    }
    this._applyBayClip(mode === 'bay');
    this.liftReveal = mode === 'lift' ? Viewport.LIFT_IDS
                    : mode === 'bay' ? Viewport.BAY_IDS : null;
    this._animateRootY(mode === 'lift' ? this._liftY() : 0);
    this._applyMaterials();
    this.needsRender = true;
  }

  _liftY(){ return 1.35; }

  _animateRootY(to){
    const root = this.model?.root;
    if (!root) return;
    const from = root.position.y, t0 = performance.now(), ms = 900;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      root.position.y = from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      this.needsRender = true;
      if (k < 1 && this.service !== undefined) requestAnimationFrame(step);
      else this._fitStudio();          // the shadow camera follows the car up the lift
    };
    step();
  }

  _applyBayClip(on){
    /* the plane itself lives here; planesFor() hands it to every material
       pass, so nothing can quietly wipe it off again */
    const wb = (this._serviceDims?.wheelbase || 2600) / 1000;
    this._bayPlane = on ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), wb * 0.22) : null;
    if (this.model) this.setCutaway(this.cutaway);   // re-walk materials with the new plane set
  }

  setLabels(on){ this.showLabels = on; if (!on) this._clearLabels(); }
  select(id){ this.selected = id; this._applyMaterials(); }
  setHighlight(ids){ this.highlight = new Set(ids || []); this._applyMaterials(); }

  _applyMaterials(){
    if (!this.model) return;
    const ghostMat = this._ghostMat || (this._ghostMat = new THREE.MeshBasicMaterial({
      color:0x7ea3d4, wireframe:true, transparent:true, opacity:0.26, fog:false }));
    /* An engine with a real model wears it as a shell over the generated one.
       Rendering both leaves a scan and the machine it was scanned from in the
       same cubic foot of space, tangled together. While the shell is on, it
       is what you see; take it off and the whole teardown is underneath,
       exactly as it was. */
    const shellId = this.model.shellId;
    const shelled = !!shellId && this.installed.has(shellId);
    /* The moment anything beneath the shell comes off, the shell turns to
       glass: you see the generated engine with that part missing, instead of
       an unchanged skin over an invisible teardown. Fully assembled, the
       shell is the solid real model again. */
    const anyRemoved = shelled && [...this.model.nodes.keys()].some(id => id !== shellId && !this.installed.has(id) && !this.bench.has(id));
    const shellSee = shelled && anyRemoved;
    /* parts the model is known not to cover stay out in the open — and so
       does the running gear a service state is there to show */
    const keep = this.model.keepIds || new Set();
    const reveal = this.liftReveal;

    for (const [id, objs] of this.model.nodes){
      /* A part on the bench is off the machine but very much still in the
         room: it has to stay solid and visible, or picking one up would look
         like destroying it. */
      const inst = this.installed.has(id) || this.bench.has(id);
      const bid  = baseId(id);
      const under = shelled && !shellSee && id !== shellId && !keep.has(id) && !keep.has(bid)
                 && !reveal?.has(id) && !reveal?.has(bid) && !this.bench.has(id);
      const sel  = this.selected === id || (bid !== id && this.selected === bid);
      const hov  = this.hovered === id;
      const hl   = this.highlight.has(id) || (bid !== id && this.highlight.has(bid));
      for (const root of objs) root.traverse(o => {
        if (!o.isMesh) return;
        if (under){
          /* under the shell, but still shown as a wireframe if ghosting is on,
             so you can see what the skin is covering */
          o.visible = this.ghost && !inst;
          if (o.visible){ o.material = ghostMat; o.castShadow = false; }
          return;
        }
        if (!inst){
          o.visible = this.ghost;
          o.material = ghostMat;
          o.castShadow = false;
          return;
        }
        o.visible = true; o.castShadow = true;
        const base = this._origMats.get(o);
        if (!base) return;
        if (id === shellId && shellSee){
          let m = o.userData._see;
          if (!m){ m = new THREE.MeshBasicMaterial({ color:0x8fa6bf, transparent:true, opacity:0.09, depthWrite:false, side:THREE.DoubleSide }); o.userData._see = m; }
          o.material = m; o.castShadow = false; o.renderOrder = 20;
          return;
        }
        if (id === shellId) o.renderOrder = 0;
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
    if (this.composer){
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(r.width, r.height);
    }
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this._syncSSAO();
  }

  /* Per-frame housekeeping for the look: the occlusion pass follows the
   * camera, the fog follows the exposure slider, and the contact shadow lets
   * go of a car that has been lifted off the floor. */
  _syncLook(){
    if (this.ssaoPass){
      const u = this.ssaoPass.ssaoMaterial.uniforms;
      if (u.cameraNear.value !== this.camera.near || u.cameraFar.value !== this.camera.far
          || !u.cameraProjectionMatrix.value.equals(this.camera.projectionMatrix)) this._syncSSAO();
    }
    if (this._lookExposure !== this.renderer.toneMappingExposure){
      this._lookExposure = this.renderer.toneMappingExposure;
      this.scene.fog.color.copy(this._fogColor());
      if (this.scene.background?.isColor) this._applyBackdrop();
    }
    const sub = this._subject;
    if (sub && this.model){
      const y = this.model.root.position.y;
      if (y !== sub.rootY){
        /* the lift: shadow camera and rig follow, floor and fog stay */
        if (!this._liftFitAt || performance.now() - this._liftFitAt > 120){
          this._liftFitAt = performance.now();
          this._fitStudio();
        }
      }
      const lift = Math.max(0, y - (sub.rootY || 0));
      this.floorRig.contact.material.opacity = LOOK.contactOpacity * THREE.MathUtils.clamp(1 - lift / (sub.r * 1.2), 0, 1);
    }
  }

  start(){
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, this._clock.getDelta());
      const s = this.state;
      s.time += dt; s.dt = dt;
      this._engineDynamics(dt, s);
      this._trackStep?.(dt);                 // drive the car around the circuit
      this.onTick?.(s);
      if (s.rpm > 0) s.crankAngle = (s.crankAngle + (s.rpm/60) * Math.PI * 2 * dt) % (Math.PI*2*2);
      if (s.speed) s.wheelAngle = (s.wheelAngle + s.speed * dt) % (Math.PI*2);
      this.model?.update?.(s);
      this.controls.update();
      this._updateLabels();
      this._syncLook();
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
      const px = new Uint8Array(4 * 1024);
      gl.readPixels((w >> 1) - 16, (h >> 1) - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i+1] + px[i+2];
      if (sum === 0){
        console.warn('MotorLab: this GPU returned an empty frame from the render pipeline — using direct rendering instead.');
        this.composer?.dispose?.();
        this.composer = null; this.ssaoPass = null;
        this._applyBackdrop();
        this.scene.fog.color.copy(this._fogColor());
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

  /** Sit in the driver's seat: near clip in, camera at eye height, looking
   *  down the bonnet. The saved orbit comes back exactly on exit. */
  enterInterior(dims = {}, opts = {}){
    if (this._intSaved) this.exitInterior();
    const cam = this.camera, ct = this.controls;
    this._intSaved = { pos: cam.position.clone(), target: ct.target.clone(),
                       near: cam.near, fov: cam.fov, min: ct.minDistance };
    const wb = (dims.wheelbase || 2600) / 1000;
    const bike = dims.class === 'bike' || dims.class === 'kart' && false;
    const w = (dims.widthMm || 1800) / 1000;
    const hgt = (dims.heightMm || 1350) / 1000;
    const side = opts.side === 'right' ? 1 : -1;
    const seat = bike
      ? new THREE.Vector3(-wb * 0.20, hgt * 0.95 + 0.30, 0)
      : new THREE.Vector3(wb * 0.03, hgt * 0.78, side * w * 0.17);
    cam.near = 0.04;
    /* a scan's cabin is lit only by what leaks through the glass; give the
       seated view the soft dome light every real interior shot gets */
    this._cabinLight = new THREE.PointLight(0xfff1dd, 28, 3.4, 1.6);
    this._cabinLight.position.set(0.15, 0.42, 0);
    cam.add(this._cabinLight);
    if (!cam.parent) this.scene.add(cam);
    if (opts.fov) cam.fov = opts.fov;
    cam.updateProjectionMatrix();
    cam.position.copy(seat);
    ct.target.copy(seat).add(new THREE.Vector3(1.7, -0.16, 0));
    ct.minDistance = 0.01;
    ct.update();
    this.interior = true;
    this.needsRender = true;
  }

  exitInterior(){
    const sv = this._intSaved;
    if (!sv) return;
    this._intSaved = null;
    if (this._cabinLight){ this._cabinLight.parent?.remove(this._cabinLight); this._cabinLight = null; }
    this.camera.near = sv.near; this.camera.fov = sv.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(sv.pos);
    this.controls.target.copy(sv.target);
    this.controls.minDistance = sv.min;
    this.controls.update();
    this.interior = false;
    this.needsRender = true;
  }

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

/* MotorLab — a track you actually drive on.
 *
 * The rolling-road cockpit revs the engine in place; this puts the same car on
 * a real circuit and lets it move: throttle and brake, forward and reverse,
 * steer left and right, shift up and down, and slide it with the handbrake.
 * The physics is a light arcade model — a bicycle with a grip term for the
 * drift — fed by the car's real mass, wheelbase, gearing and power, and it
 * drives the same engine state (rpm, throttle demand) everything else follows,
 * so the tachometer and the recorded engine sound track what the car is doing.
 */
import * as THREE from 'three';

const G = 9.81;

export class TrackDrive {
  constructor(viewport){ this.vp = viewport; this.on = false; }

  /* ---- build the world -------------------------------------------------- */
  enter(vehicle, engine){
    if (this.on) this.exit();
    this.v = vehicle; this.e = engine;
    this.node = new THREE.Group();
    this.node.name = 'trackworld';
    this._buildTrack(this.node);
    this.vp.scene.add(this.node);

    /* state */
    this.pos = new THREE.Vector2(this._start.x, this._start.z);
    this.yaw = this._startYaw;            // car body heading (rad)
    this.velDir = this.yaw;               // direction of travel
    this.speed = 0;                       // m/s, signed (+forward)
    this.gear = 1; this.auto = true;
    this.rpm = engine.idle || 850;
    this.input = { throttle: 0, brake: 0, steer: 0, hand: false };
    this._camPos = new THREE.Vector3();
    this._camAim = new THREE.Vector3();

    /* park the car on the model root and hide the ground/service rig */
    this.car = this.vp.model?.root || null;
    this._rootY = 0;
    this._angleKit = !!(vehicle.fitted || []).includes?.('angle-kit');
    this._prevControls = this.vp.controls.enabled;
    this.vp.controls.enabled = false;
    if (this.vp.ground) this.vp.ground.visible = false;
    this.vp.setService?.('ground', vehicle);

    this.vp.state.running = true;
    this.vp.state.cranking = 0;
    this.vp.state.idleRpm = engine.idle || 850;
    this.vp.state.redline = engine.redline || 7000;

    this.on = true;
    this.vp._trackStep = (dt) => this.step(dt);
    /* snap the camera behind the car straight away */
    this._placeCar(); this._camera(1);
    return this;
  }

  setInput(i){ Object.assign(this.input, i); }

  /* ---- per-frame physics ----------------------------------------------- */
  step(dt){
    if (!this.on) return;
    dt = Math.min(0.05, dt || 0.016);
    const v = this.v, e = this.e, inp = this.input;

    /* --- longitudinal: power in, drag + brakes out --- */
    const mass = v.massKg || 1400;
    const hp = e.hpPeak ? e.hpPeak * 0.9 : (e.power || 300);   // crude peak power
    const wR = wheelR(v);
    /* available forward force scales with power and falls off with speed */
    const maxForce = Math.min(mass * 9, (hp * 735.5) / Math.max(3, Math.abs(this.speed)) * 0.5 + mass * 3);
    const grippyLaunch = this.speed < 6 ? 0.75 : 1;           // no infinite launch
    let force = 0;
    if (inp.throttle > 0 && this.speed > -0.5)
      force += inp.throttle * maxForce * grippyLaunch;
    /* brake, and roll into reverse when stopped with the brake down */
    if (inp.brake > 0){
      if (this.speed > 0.4) force -= inp.brake * mass * 11;
      else force -= inp.brake * mass * 4;                     // push backward
    }
    const drag = 0.5 * 1.2 * (v.cd || 0.34) * ((v.widthMm||1800)/1000 * (v.heightMm||1350)/1000) * this.speed * Math.abs(this.speed);
    const roll = (this._onTrack ? 12 : 90) * this.speed;      // grass drags hard
    force -= drag + roll;
    this.speed += (force / mass) * dt;
    if (inp.throttle === 0 && inp.brake === 0 && Math.abs(this.speed) < 0.15) this.speed = 0;
    this.speed = Math.max(-7, Math.min(velCap(v), this.speed));

    /* --- steering + drift --- */
    const maxSteer = 0.55 * (this._angleKit ? 1.6 : 1);
    const steerAng = inp.steer * maxSteer * (1 / (1 + Math.abs(this.speed) * 0.03));
    const wb = (v.wheelbase || 2600) / 1000;
    let yawRate = (this.speed / wb) * Math.tan(steerAng);
    this.yaw += yawRate * dt;
    /* travel direction eases toward the body heading at a rate set by grip;
       the handbrake and hard cornering drop grip, so the car slides */
    const slide = (inp.hand ? 4.0 : 0) + Math.abs(steerAng) * Math.abs(this.speed) * 0.5;
    const grip = Math.max(1.2, 8 - slide);
    let d = angDiff(this.yaw, this.velDir);
    this.velDir += d * Math.min(1, grip * dt);
    this.drift = Math.abs(angDiff(this.yaw, this.velDir));

    /* --- integrate position --- */
    this.pos.x += Math.cos(this.velDir) * this.speed * dt;
    this.pos.y += Math.sin(this.velDir) * this.speed * dt;   // Vector2.y == world z
    this._onTrack = this._nearTrack(this.pos);

    /* --- engine rpm from wheel speed through the gearbox --- */
    this._gearbox();
    this.vp.state.rpm = this.rpm;
    this.vp.state.demand = inp.throttle;
    this.vp.state.speed = Math.abs(this.speed) / Math.max(0.05, wR);  // wheel spin for the animator

    this._placeCar();
    this._camera(dt);
  }

  _gearbox(){
    const v = this.v, e = this.e;
    const ratios = v.gears || [3.6, 2.1, 1.4, 1.0, 0.8];
    const wR = wheelR(v);
    const wheelRps = Math.abs(this.speed) / (2 * Math.PI * wR);
    if (this.auto){
      /* pick the gear that keeps rpm sensible */
      const redline = e.redline || 7000, idle = e.idle || 850;
      let g = this.gear;
      const rpmAt = (gear) => wheelRps * ratios[gear-1] * (v.final||3.7) * 60;
      if (g < ratios.length && rpmAt(g) > redline * 0.92) g++;
      else if (g > 1 && rpmAt(g) < (idle + 900) && rpmAt(g-1) < redline * 0.9) g--;
      this.gear = Math.max(1, Math.min(ratios.length, g));
    }
    const r = ratios[this.gear-1] * (v.final || 3.7);
    let rpm = wheelRps * r * 60;
    rpm = Math.max(e.idle || 850, rpm + (this.input.throttle && this.speed < 0.5 ? this.input.throttle * 3500 : 0));
    this.rpm = Math.min((e.redline || 7000) + 300, rpm);
  }

  shift(dir){
    this.auto = false;
    const n = (this.v.gears || [1,2,3,4,5]).length;
    this.gear = Math.max(1, Math.min(n, this.gear + dir));
  }
  setAuto(on){ this.auto = on; }

  /* ---- placement + camera ---------------------------------------------- */
  _placeCar(){
    /* read the live root every frame — the real scan loads async and replaces
       the model after we enter, so a cached reference would be left behind */
    const car = this.vp.model?.root;
    if (!car) return;
    car.position.set(this.pos.x, this._rootY || 0, this.pos.y);
    /* models face +X (nose along +X); yaw 0 = heading +X */
    car.rotation.y = -this.yaw;
  }

  _camera(dt){
    const cam = this.vp.camera;
    const k = Math.min(1, dt * 3.2);
    /* sit behind the travel direction so drifts read; look a little ahead */
    const behind = this.velDir - Math.PI;
    const back = 6.2, up = 2.4, ahead = 4;
    const tx = this.pos.x + Math.cos(behind) * back;
    const tz = this.pos.y + Math.sin(behind) * back;
    this._camPos.lerp(new THREE.Vector3(tx, up, tz), this._camReady ? k : 1);
    cam.position.copy(this._camPos);
    const ax = this.pos.x + Math.cos(this.velDir) * ahead;
    const az = this.pos.y + Math.sin(this.velDir) * ahead;
    this._camAim.lerp(new THREE.Vector3(ax, 0.6, az), this._camReady ? k : 1);
    cam.lookAt(this._camAim);
    cam.near = 0.1; cam.far = 800; cam.updateProjectionMatrix();
    this._camReady = true;
  }

  /* ---- the circuit ----------------------------------------------------- */
  _buildTrack(root){
    /* ground */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({ color: 0x33502f, roughness: 1 }));
    ground.rotation.x = -Math.PI/2; ground.position.y = -0.02; ground.receiveShadow = true;
    root.add(ground);

    /* centreline: a rounded-rectangle circuit */
    const pts = this._centreline = trackLine();
    this._trackWidth = 11;

    /* asphalt ribbon built from quads along the centreline */
    const road = ribbon(pts, this._trackWidth, 0x22252b, 0.02);
    root.add(road);
    /* white edge lines + kerbs */
    root.add(ribbon(pts, this._trackWidth, 0xf2f2f2, 0.03, this._trackWidth - 0.5));
    root.add(ribbon(pts, this._trackWidth, 0x22252b, 0.031, this._trackWidth - 0.9));
    /* start/finish line */
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(this._trackWidth, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }));
    sf.rotation.x = -Math.PI/2; sf.position.set(pts[0].x, 0.04, pts[0].z);
    const tang = Math.atan2(pts[1].z - pts[0].z, pts[1].x - pts[0].x);
    sf.rotation.z = -tang; root.add(sf);

    this._start = { x: pts[0].x, z: pts[0].z };
    this._startYaw = tang;

    /* a few markers so speed is felt */
    for (let i = 0; i < pts.length; i += 6){
      const p = pts[i], n = pts[(i+1) % pts.length];
      const t = Math.atan2(n.z - p.z, n.x - p.x);
      for (const side of [-1, 1]){
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10),
          new THREE.MeshStandardMaterial({ color: side > 0 ? 0xff5a1a : 0xffffff }));
        cone.position.set(p.x + Math.cos(t + Math.PI/2) * side * (this._trackWidth/2 + 0.9), 0.35,
                          p.z + Math.sin(t + Math.PI/2) * side * (this._trackWidth/2 + 0.9));
        root.add(cone);
      }
    }
  }

  _nearTrack(p){
    let best = 1e9;
    const pts = this._centreline;
    for (let i = 0; i < pts.length; i++){
      const dx = p.x - pts[i].x, dz = p.y - pts[i].z;
      const d = dx*dx + dz*dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best) < this._trackWidth/2 + 1.5;
  }

  /* ---- teardown -------------------------------------------------------- */
  exit(){
    if (!this.on) return;
    this.on = false;
    this.vp._trackStep = null;
    if (this.node){ this.vp.scene.remove(this.node); disposeTree(this.node); this.node = null; }
    const car = this.vp.model?.root;
    if (car){ car.position.set(0, 0, 0); car.rotation.set(0, 0, 0); }
    if (this.vp.ground) this.vp.ground.visible = true;
    this.vp.controls.enabled = this._prevControls !== false;
    this.vp.state.speed = 0;
    this.vp.frame?.();
  }
}

/* ---- helpers ----------------------------------------------------------- */
function wheelR(v){
  const rim = (v.rimF || 17) * 25.4 / 2;
  const wall = (v.tyreF || 225) * 0.45;
  return (rim + wall) / 1000;
}
function velCap(v){
  /* top speed guess from gearing so the number on the dial is believable */
  return v.class === 'kart' ? 38 : v.class === 'bike' ? 92 : 88;
}
function angDiff(a, b){
  let d = a - b;
  while (d > Math.PI) d -= Math.PI*2;
  while (d < -Math.PI) d += Math.PI*2;
  return d;
}

/* a rounded-rectangle circuit centreline, closed */
function trackLine(){
  const W = 120, H = 78, r = 34, seg = 90;
  const pts = [];
  const straightsX = W - 2*r, straightsZ = H - 2*r;
  const push = (x, z) => pts.push({ x, z });
  const corner = (cx, cz, a0, a1) => {
    for (let i = 0; i <= seg/4; i++){
      const a = a0 + (a1 - a0) * (i/(seg/4));
      push(cx + Math.cos(a)*r, cz + Math.sin(a)*r);
    }
  };
  /* build clockwise: bottom straight → BR corner → right → TR → top → TL → left → BL */
  push(-straightsX/2, -H/2);
  push( straightsX/2, -H/2);
  corner( straightsX/2, -straightsZ/2, -Math.PI/2, 0);
  push( W/2,  straightsZ/2);
  corner( straightsX/2,  straightsZ/2, 0, Math.PI/2);
  push(-straightsX/2, H/2);
  corner(-straightsX/2,  straightsZ/2, Math.PI/2, Math.PI);
  push(-W/2, -straightsZ/2);
  corner(-straightsX/2, -straightsZ/2, Math.PI, Math.PI*1.5);
  return pts;
}

/* an asphalt strip of the given width along a closed centreline */
function ribbon(pts, width, color, y, innerW){
  const n = pts.length;
  const verts = [], idx = [];
  const half = width/2, innerHalf = innerW ? innerW/2 : 0;
  for (let i = 0; i < n; i++){
    const p = pts[i], nx = pts[(i+1)%n], pv = pts[(i-1+n)%n];
    const tx = nx.x - pv.x, tz = nx.z - pv.z;
    const L = Math.hypot(tx, tz) || 1;
    const px = -tz/L, pz = tx/L;               // left normal
    if (innerW){
      verts.push(p.x + px*half, y, p.z + pz*half,   p.x + px*innerHalf, y, p.z + pz*innerHalf,
                 p.x - px*innerHalf, y, p.z - pz*innerHalf, p.x - px*half, y, p.z - pz*half);
    } else {
      verts.push(p.x + px*half, y, p.z + pz*half,  p.x - px*half, y, p.z - pz*half);
    }
  }
  const stride = innerW ? 4 : 2;
  for (let i = 0; i < n; i++){
    const a = i*stride, b = ((i+1)%n)*stride;
    if (innerW){
      // two edge bands (outer..inner each side)
      idx.push(a,b,b+1, a,b+1,a+1);
      idx.push(a+2,b+2,b+3, a+2,b+3,a+3);
    } else {
      idx.push(a,b,b+1, a,b+1,a+1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
}

function disposeTree(o){
  o.traverse(n => { if (n.isMesh){ n.geometry?.dispose?.();
    (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m?.dispose?.()); } });
}

/* rotary — geometry for the parts declared in js/data/extra/rotary.js.
 * Frame (from buildRotary): e-shaft on X, front of the engine at −X, Y up,
 * exhaust side +Z (peripheral port at z = R·1.06), intake side −Z. Rotor i is
 * centred at x = xOf(i); each rotor housing is `width` thick, so the stack is
 *   front iron | RH 1 | centre iron | RH 2 | … | rear iron
 * and every iron fills the gap between two housing faces exactly. */
import * as THREE from 'three';
import { braidedLine, coreMesh, velocityStack } from '../../lib/geo.js';

const Y = new THREE.Vector3(0, 1, 0);

export function build(ctx){
  const { e, has, MAT, M, rotary, anim, nodes, root } = ctx;
  if (e.kind !== 'rotary' || !rotary) return;
  const { box, roundBox, cyl, tubeMesh, torus, pipe, hexPrism, lathe, group, at, rot, V3, TAU } = ctx.geo;
  const { n, R, pitch, width, xOf } = rotary;
  const ecc = M(15);
  const FX = xOf(0) - width / 2;          // front face of rotor housing 1
  const RX = xOf(n - 1) + width / 2;      // rear face of the last rotor housing
  const END = M(19);                      // front / rear iron thickness
  const HZ = R * 1.18, HY = R * 1.02;     // housing outline half-sizes (match the rotor housings)
  const sidePorts = e.ignition !== 'triple-plug';   // the R26B is peripheral-ported

  /* a cylinder from a to b */
  const rod = (a, b, r, mat, seg = 10) => {
    const d = new THREE.Vector3().subVectors(b, a), m = cyl(r, r, d.length(), mat, seg);
    m.quaternion.setFromUnitVectors(Y, d.clone().normalize());
    m.position.copy(a).addScaledVector(d, 0.5);
    return m;
  };
  /* a closed tube through points (a seal ring, a chain) */
  const loop = (pts, r, mat) => {
    const c = new THREE.CatmullRomCurve3(pts, true);
    return new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(48, pts.length * 2), r, 6, true), mat);
  };
  /* a plate in the YZ plane from x0 to x1, outlined like the housings */
  const ironPlate = (x0, x1, mat) => {
    const s = new THREE.Shape(), r = M(22);
    const pts = [];
    if (sidePorts){
      /* the side intake port runs out through the −Z edge of the iron to the
         manifold: a slot where the core's port flange sits */
      const py0 = R * 0.10 - M(44), py1 = R * 0.10 + M(44), pz1 = -R * 0.62 + M(38);
      s.moveTo(-HZ, -HY + r);
      s.lineTo(-HZ, py0); s.lineTo(pz1, py0); s.lineTo(pz1, py1); s.lineTo(-HZ, py1);
    } else s.moveTo(-HZ, -HY + r);
    s.lineTo(-HZ, HY - r); s.quadraticCurveTo(-HZ, HY, -HZ + r, HY);
    s.lineTo(HZ - r, HY); s.quadraticCurveTo(HZ, HY, HZ, HY - r);
    s.lineTo(HZ, -HY + r); s.quadraticCurveTo(HZ, -HY, HZ - r, -HY);
    s.lineTo(-HZ + r, -HY); s.quadraticCurveTo(-HZ, -HY, -HZ, -HY + r);
    const hole = new THREE.Path(); hole.absarc(0, 0, M(41), 0, TAU, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled:false, curveSegments:10 });
    g.rotateY(-Math.PI / 2);                // shape x → world z, extrusion → −x
    g.translate(x1, 0, 0);
    return new THREE.Mesh(g, mat);
  };

  /* ---------------- the irons ---------------- */
  if (has('fronthousing')){
    const g = group('fronthousing');
    g.add(ironPlate(FX - END, FX, MAT.iron()));
    ctx.add('fronthousing', g);
  }
  if (has('interhousing')){
    for (let i = 1; i < n; i++)
      ctx.each('interhousing', i - 1, ironPlate(xOf(i - 1) + width / 2, xOf(i) - width / 2, MAT.iron()));
    ctx.flush('interhousing');
  }
  if (has('rearhousing')){
    const g = group('rearhousing');
    g.add(ironPlate(RX, RX + END, MAT.iron()));
    /* the oil-filter pedestal cast on its lower rear face */
    g.add(at(roundBox(M(14), M(34), M(40), M(4), MAT.iron()), RX + END + M(7), -R * 0.52, -R * 0.30));
    ctx.add('rearhousing', g);
  }

  /* ---------------- seals on the rotors ----------------
     They ride in grooves in the rotor faces, so each is parented to its rotor
     and moves with it; registered with `attached` so they stay their own part. */
  const rotors = anim.rotors || [];
  const rr = R - ecc, faceX = width * 0.47;
  const rad = (t) => rr * (1 + 0.16 * Math.cos(3 * t));
  /* the rotor profile is drawn in its own (y, z) as (rad·sinθ, −rad·cosθ) */
  const onRotor = (t, k) => [rad(t) * k * Math.sin(t), -rad(t) * k * Math.cos(t)];
  if (has('sideseals') || has('cornerseals') || has('oilseals')){
    rotors.forEach((rg, i) => {
      let s6 = 0, c6 = 0, o4 = 0;
      for (const s of [-1, 1]){
        const x = s * (faceX + M(0.4));
        for (let a = 0; a < 3; a++){
          const t0 = (a / 3) * TAU;
          /* corner seal at the apex */
          const [cy, cz] = onRotor(t0, 0.955);
          const cs = rot(cyl(M(3.4), M(3.4), M(3), MAT.steel(), 12), 0, 0, Math.PI / 2);
          at(cs, s * (faceX - M(1.0)), cy, cz);
          rg.add(cs); ctx.each('cornerseals', i * 6 + c6++, cs, true);
          /* side seal along the flank to the next apex */
          const pts = [];
          for (let k = 0; k <= 16; k++){
            const t = t0 + TAU / 3 * (0.07 + 0.86 * k / 16);
            const [py, pz] = onRotor(t, 0.93);
            pts.push(V3(x, py, pz));
          }
          const ss = pipe(pts, M(0.9), MAT.steel(), 5);
          rg.add(ss); ctx.each('sideseals', i * 6 + s6++, ss, true);
        }
        /* inner and outer oil seal rings round the bore */
        for (const r of [M(58), M(64)]){
          const os = rot(torus(r, M(1.0), MAT.steel(), 48), 0, Math.PI / 2, 0);
          at(os, x, 0, 0);
          rg.add(os); ctx.each('oilseals', i * 4 + o4++, os, true);
        }
      }
    });
    ctx.flush('sideseals'); ctx.flush('cornerseals'); ctx.flush('oilseals');
  }

  /* ---------------- coolant seals at every housing joint ---------------- */
  if (has('coolantseals')){
    const inner = [], outer = [];
    for (let k = 0; k < 96; k++){
      const p = (k / 96) * TAU, Rr = R + M(0.5);
      const sx = ecc * Math.cos(3 * p) + Rr * Math.cos(p), sy = ecc * Math.sin(3 * p) + Rr * Math.sin(p);
      inner.push([sy, -sx]);                       // housing shape (x,y) → world (z = −x, y)
    }
    const oz = HZ - M(1.0), oy = HY - M(3);
    for (let k = 0; k < 64; k++){                 // rounded-rectangle O-ring round the jacket
      const t = (k / 64) * TAU, c = Math.cos(t), s = Math.sin(t);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.25), ey = Math.sign(s) * Math.pow(Math.abs(s), 0.25);
      outer.push([oy * ey, oz * ex]);
    }
    for (let i = 0; i < n; i++) for (const s of [-1, 1]){
      const x = xOf(i) + s * (width / 2 - M(0.5));
      const g = group('coolantseal');
      g.add(loop(inner.map(([y, z]) => V3(x, y, z)), M(0.9), MAT.rubber()));
      g.add(loop(outer.map(([y, z]) => V3(x, y, z)), M(0.9), MAT.rubber()));
      ctx.each('coolantseals', i * 2 + (s > 0 ? 1 : 0), g);
    }
    ctx.flush('coolantseals');
  }

  /* ---------------- front end ---------------- */
  const eshaft = anim.crank;
  if (has('thrustbearing')){
    const g = group('thrust');
    const x0 = FX - END - M(16);
    g.add(at(rot(tubeMesh(M(44), M(25), M(3), MAT.steel(), 28), 0, 0, Math.PI / 2), x0, 0, 0));
    g.add(at(rot(tubeMesh(M(40), M(27), M(3), MAT.bearing(), 28), 0, 0, Math.PI / 2), x0 - M(3), 0, 0));
    ctx.add('thrustbearing', g);
  }
  if (has('oilpumpdrive')){
    const g = group('oilpumpdrive');
    const x = FX - END - M(25);
    const c1 = { y:0, z:0, r:M(30) }, c2 = { y:-R * 0.6, z:R * 0.5, r:M(22) };   // to the core's oil pump
    g.add(at(rot(tubeMesh(c1.r, M(25), M(7), MAT.steel(), 24), 0, 0, Math.PI / 2), x, c1.y, c1.z));
    g.add(at(rot(tubeMesh(c2.r, M(8), M(7), MAT.steel(), 24), 0, 0, Math.PI / 2), x, c2.y, c2.z));
    /* the chain: a loop round both sprockets */
    const dy = c2.y - c1.y, dz = c2.z - c1.z, L = Math.hypot(dy, dz), ang = Math.atan2(dz, dy);
    const beta = Math.asin((c1.r - c2.r) / L);
    const pts = [], r1 = c1.r + M(2), r2 = c2.r + M(2);
    for (let k = 0; k <= 18; k++){             // round the far side of the shaft sprocket
      const a = ang + Math.PI / 2 - beta + (k / 18) * (Math.PI + 2 * beta);
      pts.push(V3(x, c1.y + r1 * Math.cos(a), c1.z + r1 * Math.sin(a)));
    }
    for (let k = 1; k < 12; k++){              // and the near side of the pump sprocket
      const a = ang - Math.PI / 2 + beta + (k / 12) * (Math.PI - 2 * beta);
      pts.push(V3(x, c2.y + r2 * Math.cos(a), c2.z + r2 * Math.sin(a)));
    }
    g.add(loop(pts, M(2.6), MAT.black()));
    ctx.add('oilpumpdrive', g);
  }
  if (has('counterweights')){
    /* half-discs keyed to the e-shaft, so they turn with it */
    const cw = (r, t) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r, Math.PI * 0.05, Math.PI * 0.95, false);
      s.lineTo(Math.cos(Math.PI * 0.95) * M(28), Math.sin(Math.PI * 0.95) * M(28));
      s.absarc(0, 0, M(28), Math.PI * 0.95, Math.PI * 0.05, true);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth:t, bevelEnabled:false, curveSegments:18 });
      g.rotateY(-Math.PI / 2);                // shape (x,y) → world (z,y), thickness on −x
      g.rotateX(Math.PI);                     // heavy side down, opposite the core's lobes (+y)
      const m = new THREE.Mesh(g, MAT.iron());
      const hub = rot(tubeMesh(M(32), M(24), t * 1.2, MAT.steel(), 20), 0, 0, Math.PI / 2);
      hub.position.x = -t / 2;
      return group('cw', m, hub);
    };
    const front = cw(M(56), M(12)); front.position.x = FX - END - M(32);
    const rear = cw(M(66), M(12)); rear.position.x = RX + END + M(15);
    for (const [k, o] of [[0, front], [1, rear]]){
      if (eshaft){ eshaft.add(o); ctx.each('counterweights', k, o, true); }
      else ctx.each('counterweights', k, o);
    }
    ctx.flush('counterweights');
  }
  if (has('frontcover')){
    const g = group('frontcover');
    const x1 = FX - END, x0 = x1 - M(46);
    const cover = rot(tubeMesh(M(96), M(27), x1 - x0, MAT.alloy(), 40), 0, 0, Math.PI / 2);
    at(cover, (x0 + x1) / 2, 0, 0);
    g.add(cover);
    /* the front oil seal the pulley hub runs in, and the perimeter bolts */
    g.add(at(rot(tubeMesh(M(30), M(24.5), M(6), MAT.rubber(), 24), 0, 0, Math.PI / 2), x0 - M(3), 0, 0));
    for (let k = 0; k < 12; k++){
      const t = (k / 12) * TAU;
      g.add(at(rot(hexPrism(M(10), M(5), MAT.plated()), 0, 0, Math.PI / 2), x0 - M(2.5), Math.sin(t) * M(88), Math.cos(t) * M(88)));
    }
    ctx.add('frontcover', g);
  }
  /* oil metering pump on the side of the front cover, lines up to the housings */
  const ompAt = V3(FX - END - M(23), -M(50), -M(98));
  if (has('omp')){
    const g = group('omp');
    g.add(at(roundBox(M(26), M(32), M(26), M(4), MAT.alloyDark()), ompAt.x, ompAt.y, ompAt.z));
    /* stepper motor and its connector */
    g.add(at(cyl(M(13), M(13), M(22), MAT.black(), 16), ompAt.x, ompAt.y - M(27), ompAt.z));
    g.add(at(box(M(10), M(8), M(12), MAT.plastic()), ompAt.x, ompAt.y - M(40), ompAt.z));
    g.add(at(rot(cyl(M(5), M(5), M(10), MAT.steel(), 8), 0, 0, Math.PI / 2), ompAt.x + M(16), ompAt.y, ompAt.z));
    ctx.add('omp', g);
  }
  if (has('ompnozzles')){
    for (let i = 0; i < n; i++){
      const g = group('nozzle');
      const nz = V3(xOf(i) + M(8), HY, -R * 0.56);
      g.add(at(hexPrism(M(12), M(8), MAT.brass()), nz.x, nz.y + M(4), nz.z));
      g.add(at(cyl(M(4), M(4), M(8), MAT.brass(), 8), nz.x, nz.y + M(11), nz.z));
      /* clear MOP line, from the pump up past the intake side to the nozzle */
      const y = HY + M(2), zRun = -R * 1.38;
      const pts = [
        V3(ompAt.x, ompAt.y + M(16), ompAt.z - M(6) - i * M(5)),
        V3(ompAt.x + M(6), ompAt.y + M(30), zRun + i * M(5)),
        V3(FX - END - M(10) + i * M(4), y - M(20), zRun + i * M(5)),
        V3(FX - END + M(10) + i * M(4), y, zRun + M(6) + i * M(5)),
        V3(nz.x, y, nz.z - M(32)),
        V3(nz.x, nz.y + M(15), nz.z - M(6)),
        V3(nz.x, nz.y + M(15), nz.z),
      ];
      g.add(pipe(pts, M(2.2), MAT.glass ? MAT.glass() : MAT.plastic(), 6));
      ctx.each('ompnozzles', i, g);
    }
    ctx.flush('ompnozzles');
  }

  /* ---------------- rear housing: pellet and oil coolers ---------------- */
  const pelletAt = V3(RX + END, -M(50), -M(80));
  if (has('thermalpellet')){
    const g = group('pellet');
    g.add(at(rot(hexPrism(M(19), M(8), MAT.plated()), 0, 0, Math.PI / 2), pelletAt.x + M(4), pelletAt.y, pelletAt.z));
    g.add(at(rot(cyl(M(7), M(7), M(14), MAT.brass(), 14), 0, 0, Math.PI / 2), pelletAt.x - M(4), pelletAt.y, pelletAt.z));
    ctx.add('thermalpellet', g);
  }
  if (has('oilcoolers')){
    /* in the nose either side of the radiator (the builder hangs the radiator
       across the −Z side at z = −R·2.4) */
    const radHalf = pitch * (n + 1.6) / 2;
    for (const [k, s] of [[0, -1], [1, 1]]){
      const g = group('oilcooler');
      const cx = s * (radHalf + M(70)), cy = R * 0.05, cz = -R * 2.4;
      const core = coreMesh(M(110), M(130), M(34), {}, 14);
      rot(core, 0, Math.PI / 2, 0);
      g.add(at(core, cx, cy, cz));
      for (const [dy, dz] of [[M(30), 0], [-M(30), M(14)]])
        g.add(braidedLine([V3(cx - s * M(40), cy + dy, cz + M(20)),
                           V3(cx - s * M(60), -R * 0.95, -R * 1.45 + dz),
                           V3(RX - M(20), -R * 0.95, -R * 1.05 + dz),
                           V3(pelletAt.x + M(14), pelletAt.y - M(18) + dy * 0.2, pelletAt.z - M(12) + dz * 0.4)], M(5)));
      ctx.each('oilcoolers', k, g);
    }
    ctx.flush('oilcoolers');
  }

  /* ---------------- sequential twin-turbo control ---------------- */
  if (has('precontrolvalve') || has('seqsolenoids')){
    /* the two turbos as the builder placed them */
    const tg = nodes.get('turbo')?.[0];
    const T = tg ? tg.children.map(t => t.position.clone()) : [];
    const T1 = T[0] || V3(xOf(n - 1) + pitch * 0.5, -R * 0.15, R * 1.05);
    const T2 = T[1] || V3(xOf(n - 1) + pitch * 1.05, R * 0.40, R * 1.05);
    const sz = R * 0.62;
    /* a diaphragm actuator canister with its rod down to a valve boss */
    const actuator = (can, boss, canR = M(22)) => {
      const g = group('actuator');
      const c = lathe([[0, -M(9)], [canR * 0.95, -M(9)], [canR, -M(4)], [canR, M(4)], [canR * 0.95, M(9)], [0, M(9)]], MAT.plated(), 24);
      const dir = new THREE.Vector3().subVectors(boss, can).normalize();
      c.quaternion.setFromUnitVectors(Y, dir); c.position.copy(can);
      g.add(c);
      g.add(rod(can.clone().addScaledVector(dir, M(9)), boss, M(2.5), MAT.steel(), 8));
      g.add(at(cyl(M(9), M(9), M(12), MAT.alloyDark(), 14), boss.x, boss.y, boss.z));
      /* the vacuum nipple on the can */
      g.add(rod(can.clone().addScaledVector(dir, -M(9)), can.clone().addScaledVector(dir, -M(18)), M(2.5), MAT.plated(), 8));
      g.userData.nipple = can.clone().addScaledVector(dir, -M(18));
      return g;
    };
    const parts = {};
    /* exhaust side: turbine housings face the engine (−Z of each turbo) */
    if (has('precontrolvalve')){
      const boss = V3((T1.x + T2.x) / 2, (T1.y + T2.y) / 2 - sz * 0.25, T1.z - sz * 0.44);
      parts.precontrolvalve = actuator(V3(boss.x + M(10), boss.y - sz * 0.30, boss.z + sz * 1.55), boss);
      ctx.add('precontrolvalve', parts.precontrolvalve);
    }
    if (has('turbocontrolvalve')){
      const boss = V3(T2.x + sz * 0.55, T2.y - sz * 0.55, T2.z - sz * 0.44);
      parts.turbocontrolvalve = actuator(V3(T2.x + sz * 1.25, T2.y - sz * 0.75, T2.z + sz * 0.70), boss, M(26));
      ctx.add('turbocontrolvalve', parts.turbocontrolvalve);
    }
    if (has('wastegate')){
      const boss = V3(T1.x - sz * 0.55, T1.y - sz * 0.60, T1.z - sz * 0.44);
      parts.wastegate = actuator(V3(T1.x - sz * 0.95, T1.y - sz * 0.20, T1.z + sz * 0.95), boss, M(20));
      ctx.add('wastegate', parts.wastegate);
    }
    /* cold side: the Y-pipe joining the two compressor outlets (+Z faces) */
    const yPipe = V3((T1.x + T2.x) / 2 + sz * 0.2, T2.y + sz * 1.05, T1.z + sz * 0.60);
    if (has('chargecontrolvalve')){
      const g = group('ccv');
      g.add(rod(V3(T2.x, T2.y + sz * 0.70, T2.z + sz * 0.44), yPipe, M(16), MAT.alloy(), 18));
      g.add(at(rot(cyl(M(21), M(21), M(20), MAT.alloyDark(), 20), 0, 0, Math.PI / 2), yPipe.x, yPipe.y, yPipe.z));
      const a = actuator(V3(yPipe.x, yPipe.y + M(42), yPipe.z + M(28)), V3(yPipe.x, yPipe.y + M(12), yPipe.z + M(10)), M(20));
      g.add(a); g.userData.nipple = a.userData.nipple;
      parts.chargecontrolvalve = g;
      ctx.add('chargecontrolvalve', g);
    }
    if (has('chargereliefvalve')){
      const g = group('crv');
      const p = V3(yPipe.x + M(48), yPipe.y + M(4), yPipe.z - M(6));
      g.add(rod(V3(yPipe.x + M(18), yPipe.y, yPipe.z), p, M(8), MAT.alloy(), 14));
      g.add(at(lathe([[0, -M(14)], [M(17), -M(14)], [M(19), -M(6)], [M(19), M(6)], [M(12), M(14)], [0, M(14)]], MAT.alloyDark(), 20), p.x + M(8), p.y + M(12), p.z));
      g.userData.nipple = V3(p.x + M(8), p.y + M(28), p.z);
      g.add(rod(V3(p.x + M(8), p.y + M(26), p.z), g.userData.nipple, M(2.5), MAT.plated(), 8));
      parts.chargereliefvalve = g;
      ctx.add('chargereliefvalve', g);
    }
    /* the solenoid rack, on a bracket off the top of the rear iron */
    const rackX0 = RX + M(2), rackY = HY + M(2), rackZ = -M(34);
    const sol = [];
    if (has('seqsolenoids')){
      const bracket = at(box(M(100), M(4), M(54), MAT.black()), rackX0 + M(50), rackY + M(2), rackZ);
      for (let k = 0; k < 5; k++){
        const g = group('sol');
        const x = rackX0 + M(12) + k * M(19);
        g.add(at(cyl(M(8.5), M(8.5), M(26), MAT.black(), 14), x, rackY + M(17), rackZ));
        g.add(at(box(M(12), M(10), M(14), MAT.plastic()), x, rackY + M(34), rackZ - M(10)));
        g.add(at(cyl(M(2.4), M(2.4), M(12), MAT.plated(), 8), x, rackY + M(36), rackZ + M(6)));
        if (k === 0) g.add(bracket);          // the bracket comes off with the first one
        sol.push(V3(x, rackY + M(42), rackZ + M(6)));
        ctx.each('seqsolenoids', k, g);
      }
      ctx.flush('seqsolenoids');
    }
    if (has('vacuumhoses')){
      const g = group('vac');
      const targets = ['precontrolvalve', 'turbocontrolvalve', 'chargecontrolvalve', 'chargereliefvalve', 'wastegate'];
      targets.forEach((id, k) => {
        const tgt = parts[id]?.userData.nipple; if (!tgt || !sol[k]) return;
        const a = sol[k], mid = V3((a.x + tgt.x) / 2 + M(10), Math.max(a.y, tgt.y) + M(20 + k * 6), (a.z + tgt.z) / 2);
        g.add(pipe([a, V3(a.x, a.y + M(14), a.z), mid, tgt], M(2.3), MAT.rubber(), 6));
      });
      /* vacuum and pressure chambers and the check valves, on the rack */
      const ch = V3(rackX0 + M(50), rackY + M(30), rackZ - M(46));
      g.add(at(rot(cyl(M(16), M(16), M(56), MAT.black(), 16), 0, 0, Math.PI / 2), ch.x, ch.y, ch.z));
      g.add(at(rot(cyl(M(13), M(13), M(44), MAT.black(), 16), 0, 0, Math.PI / 2), ch.x, ch.y + M(30), ch.z));
      for (const s of [-1, 1]) g.add(at(rot(cyl(M(4), M(5), M(14), MAT.plastic(), 10), 0, 0, Math.PI / 2), ch.x + s * M(40), ch.y + M(15), ch.z));
      sol.forEach((a, k) => g.add(pipe([V3(a.x, a.y, a.z - M(4)), V3(a.x, a.y + M(8), rackZ - M(22)), V3(ch.x + (k - 2) * M(9), ch.y + M(16), ch.z + M(14))], M(2.0), MAT.rubber(), 6)));
      ctx.add('vacuumhoses', g);
    }
  }

  /* ---------------- R26B: third plug & coil per rotor, telescopic trumpets ---------------- */
  if (has('plugs3')){
    for (let i = 0; i < n; i++){
      const p = rot(cyl(M(7), M(7), M(40), MAT.steel(), 10), Math.PI / 2 - 0.35, 0, 0);
      ctx.each('plugs3', i, at(p, xOf(i), -R * 0.42, -R * 0.98));
    }
    ctx.flush('plugs3');
  }
  if (has('coils3')){
    for (let i = 0; i < n; i++)
      ctx.each('coils3', i, at(roundBox(M(22), M(50), M(30), .006, MAT.plastic()), xOf(i), R * 0.9, -R * 0.3));
    ctx.flush('coils3');
  }
  if (has('teletrumpets')){
    /* out of the side of the plenum, toward the −Z (intake) side */
    const y = R * 0.55, z0 = -R * 0.75 - M(60);
    for (let i = 0; i < n; i++){
      const g = group('trumpet');
      g.add(at(rot(cyl(M(26), M(26), M(46), MAT.alloy(), 22), Math.PI / 2, 0, 0), xOf(i), y, z0 - M(23)));
      g.add(at(rot(cyl(M(23), M(23), M(40), MAT.alloyDark(), 22), Math.PI / 2, 0, 0), xOf(i), y, z0 - M(60)));
      const vs = rot(velocityStack(M(46), M(26), MAT.alloy()), -Math.PI / 2, 0, 0);
      g.add(at(vs, xOf(i), y, z0 - M(88)));
      ctx.each('teletrumpets', i, g);
    }
    ctx.flush('teletrumpets');
    if (has('trumpetactuator')){
      const g = group('tact');
      const zl = z0 - M(70);
      g.add(at(roundBox(M(50), M(40), M(40), M(6), MAT.black()), xOf(0) - pitch * 0.62, y + M(36), zl));
      g.add(rod(V3(xOf(0) - pitch * 0.62 + M(25), y + M(36), zl), V3(xOf(n - 1) + M(10), y + M(36), zl), M(4), MAT.steel(), 10));
      for (let i = 0; i < n; i++) g.add(rod(V3(xOf(i), y + M(36), zl), V3(xOf(i), y + M(24), zl), M(3), MAT.steel(), 8));
      ctx.add('trumpetactuator', g);
    }
  }
}

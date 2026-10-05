/* bottomEnd — geometry for the parts declared in js/data/extra/bottomEnd.js,
 * plus geometry for three parts the base tree already lists but never drew:
 * the pilot bearing, the release bearing and the bellhousing adapter plate.
 *
 * Pieces that live on a moving part ride with it: ring sets and pin sets are
 * registered in anim.pistons with their piston's own parameters, big-end shells
 * in anim.rods with their rod's, and anything bolted to the crank nose or the
 * flywheel spins in anim.pulleys at crank speed. Each is also posed at crank
 * angle 0 when it is built, so it sits right before the first frame runs. */
import * as THREE from 'three';
import { slider } from '../../lib/geo.js';
import { headBoltPlan } from '../../data/extra/bottomEnd.js';

export function build(ctx){
  const { e, L, M, MAT, has, add, each, flush, anim, cylPosition, fires, frontX, inSide } = ctx;
  if (e.kind === 'rotary') return;
  const { cyl, tubeMesh, torus, hexPrism, box, group, at, rot, TAU } = ctx.geo;
  const B = L.bore;

  /* the same crank-slider pose animate() gives a piston / rod at crank angle 0 */
  const posePiston = (node, x, angle, fire) => {
    const y = slider(L.crankR, L.rodLen, -fire);
    node.position.set(x, y * Math.cos(angle), -y * Math.sin(angle));
    node.rotation.x = angle;
  };
  const poseRod = (node, x, angle, fire) => {
    const t = -fire, y = slider(L.crankR, L.rodLen, t);
    const pinY = L.crankR * Math.cos(t), pinZ = L.crankR * Math.sin(t);
    const lY = pinY * Math.cos(-angle) - pinZ * Math.sin(-angle);
    const lZ = pinY * Math.sin(-angle) + pinZ * Math.cos(-angle);
    node.position.set(x, y * Math.cos(angle), -y * Math.sin(angle));
    node.rotation.set(angle, 0, 0);
    node.rotateX(-Math.atan2(lZ, y - lY));
  };

  /* a ring with a real end gap, revolved about the piston axis (Y) */
  const gappedRing = (ri, ro, h, mat, gapAt, gap = 0.10) => {
    const pts = [[ri, -h / 2], [ro, -h / 2], [ro, h / 2], [ri, h / 2], [ri, -h / 2]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 40, gapAt + gap / 2, TAU - gap);
    return new THREE.Mesh(g, mat);
  };

  /* ---- ring sets: top, second, oil (rail + expander + rail) ---- */
  if (has('rings')){
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const g = group('ringset' + i);
      const top = MAT.chrome(), iron = MAT.iron(), rail = MAT.steel();
      g.add(at(gappedRing(B * 0.468, B * 0.4985, B * 0.024, top, 0), 0, B * 0.156, 0));
      g.add(at(gappedRing(B * 0.468, B * 0.4985, B * 0.024, iron, TAU / 3), 0, B * 0.083, 0));
      g.add(at(gappedRing(B * 0.470, B * 0.4985, B * 0.005, rail, TAU * 2 / 3 + 0.35), 0, B * 0.019, 0));
      g.add(at(gappedRing(B * 0.462, B * 0.490, B * 0.010, MAT.plated(), TAU * 2 / 3 + 1.2, 0.06), 0, B * 0.0115, 0));
      g.add(at(gappedRing(B * 0.470, B * 0.4985, B * 0.005, rail, TAU * 2 / 3 - 0.35), 0, B * 0.004, 0));
      posePiston(g, p.x, p.angle, fires[i]);
      anim.pistons.push({ node:g, i, x:p.x, angle:p.angle, fire:fires[i] });
      each('rings', i, g);
    }
    flush('rings');
  }

  /* ---- piston pins + circlips ---- */
  if (has('pins')){
    const pinR = B * 0.105, pinLen = B * 0.68;
    const clips = !(e.id === 'v8-57-sb');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const g = group('pinset' + i);
      const pin = tubeMesh(pinR * 1.01, pinR * 0.58, pinLen, MAT.chrome(), 18);
      rot(pin, 0, 0, Math.PI / 2);
      g.add(at(pin, 0, -B * 0.045, 0));
      if (clips) for (const s of [-1, 1]){
        const c = torus(pinR * 0.86, Math.max(M(0.6), B * 0.008), MAT.steel(), 18);
        rot(c, 0, Math.PI / 2, 0);
        g.add(at(c, s * (pinLen / 2 + B * 0.012), -B * 0.045, 0));
      }
      posePiston(g, p.x, p.angle, fires[i]);
      anim.pistons.push({ node:g, i, x:p.x, angle:p.angle, fire:fires[i] });
      each('pins', i, g);
    }
    flush('pins');
  }

  /* ---- big-end shells: upper in the rod, lower in the cap ---- */
  if (has('rodbearings')){
    const bigR = L.crankR * 0.66;
    const r = bigR * 0.672, len = bigR * 1.5 * 1.05;   // between the crank pin and the eye
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      for (const [k, start] of [[0, 0], [1, Math.PI]]){
        const m = MAT.bearing(); m.side = THREE.DoubleSide;
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18, 1, true, start, Math.PI), m);
        rot(shell, 0, 0, Math.PI / 2);
        const g = group('rodshell' + i + k);
        g.add(at(shell, 0, -L.rodLen, 0));
        poseRod(g, p.x, p.angle, fires[i]);
        anim.rods.push({ node:g, i, x:p.x, angle:p.angle, fire:fires[i] });
        each('rodbearings', i * 2 + k, g);
      }
    }
    flush('rodbearings');
  }

  /* ---- head bolts + dowels, in each bank's frame ---- */
  const nHeads = L.banks === 4 ? 2 : L.banks;
  const perHead = Math.ceil(e.cyl / nHeads);
  const gridX = Array.from({ length: L.perBank + 1 }, (_, i) => (i - L.perBank / 2) * L.pitch);
  const rB = Math.min(M(6.5), Math.max(M(4), B * 0.062));          // ~M11 on an 86 mm bore
  const headTop = L.deckH + B * 1.32;
  const headBolt = (r, mat) => {
    const g = group('hbolt');
    const shankLen = B * 1.32 + B * 0.45;
    g.add(at(cyl(r, r, shankLen, MAT.steel(), 10), 0, -shankLen / 2, 0));
    g.add(at(tubeMesh(r * 2.1, r * 1.05, M(2), MAT.steel(), 18), 0, M(1), 0));   // plate washer
    g.add(at(hexPrism(r * 2.9, r * 1.4, mat), 0, M(2) + r * 0.7, 0));
    return g;
  };
  if (has('headbolts')){
    const { n } = headBoltPlan(e, perHead);
    for (let b = 0; b < nHeads; b++){
      const a = L.bankAngles[b] ?? 0, s = inSide(b);
      const pos = [];
      for (const z of [-1, 1]) for (const x of gridX) pos.push([x, z * B * 0.62, rB]);
      pos.length = Math.min(pos.length, n);
      /* bolts beyond the two outer rows (LS M8 row, the Chevrolet middle row,
         diesel extra rows) go in inner rows, clear of the plug wells on the centreline */
      let extra = n - pos.length, row = 0;
      const cap = 2 * L.perBank + 1;
      while (extra > 0){
        const m = Math.min(cap, extra);
        const z = (row % 2 ? -s : s) * B * (0.30 + Math.floor(row / 2) * 0.12);
        for (let j = 0; j < m; j++){
          const x = m === 1 ? 0 : gridX[0] + (j / (m - 1)) * (gridX[gridX.length - 1] - gridX[0]);
          pos.push([x, z, rB * 0.75]);
        }
        extra -= m; row++;
      }
      const g = group('headbolts' + b);
      for (const [x, z, r] of pos) g.add(at(headBolt(r, MAT.steel()), x, headTop, z));
      g.rotation.x = a;
      each('headbolts', b, g);
    }
    flush('headbolts');
  }
  if (has('headdowels')){
    for (let b = 0; b < nHeads; b++){
      const a = L.bankAngles[b] ?? 0;
      const spots = [[gridX[0], -B * 0.62], [gridX[gridX.length - 1], B * 0.62]];
      spots.forEach(([x, z], k) => {
        const d = tubeMesh(rB * 1.55, rB * 1.12, M(14), MAT.steel(), 16);
        const g = group('dowel');
        g.add(at(d, x, L.deckH, z));
        g.rotation.x = a;
        each('headdowels', b * 2 + k, g);
      });
    }
    flush('headdowels');
  }

  /* ---- crank nose: key and pulley bolt (spin with the crank) ---- */
  const spinner = (x) => { const g = group('spin'); g.position.set(x, 0, 0); return g; };
  if (has('crankkey')){
    const g = spinner(frontX - M(40));
    g.add(at(box(M(16), M(5), M(4.5), MAT.steel()), 0, L.crankR * 0.36 + M(1), 0));
    anim.pulleys.push({ node:g, ratio:1 });
    add('crankkey', g);
  }
  if (has('crankbolt')){
    const hubFace = frontX - M(46) - M(46) * 0.10;     // front of the damper hub
    const g = spinner(hubFace);
    const b = group('crankbolt');
    b.add(at(tubeMesh(L.crankR * 0.32, L.crankR * 0.12, M(3), MAT.steel(), 24), 0, M(1.5), 0));   // washer
    b.add(at(hexPrism(L.crankR * 0.40, M(11), MAT.plated()), 0, M(3) + M(5.5), 0));
    b.add(at(cyl(L.crankR * 0.11, L.crankR * 0.11, M(60), MAT.steel(), 10), 0, -M(30), 0));    // into the nose
    rot(b, 0, 0, Math.PI / 2);                           // +Y → −X: head faces forward
    g.add(b);
    anim.pulleys.push({ node:g, ratio:1 });
    add('crankbolt', g);
  }

  /* ---- rear of the crank: flywheel bolts, pilot bearing, adapter plate, release bearing ---- */
  const rear = L.len / 2;
  if (has('flywheelbolts')){
    const hubFace = rear + M(28) + M(34) * 0.5;          // flywheel's clutch-side hub face
    const g = spinner(hubFace);
    const n = 8, R = B * 0.38;
    for (let k = 0; k < n; k++){
      const t = (k / n) * TAU + TAU / 16;
      const b = group('fwbolt');
      b.add(at(hexPrism(M(14), M(7), MAT.plated()), 0, M(3.5), 0));
      b.add(at(cyl(M(5), M(5), M(30), MAT.steel(), 8), 0, -M(15), 0));
      rot(b, 0, 0, -Math.PI / 2);                        // +Y → +X: head faces the clutch
      g.add(at(b, 0, Math.cos(t) * R, Math.sin(t) * R));
    }
    anim.pulleys.push({ node:g, ratio:1 });
    add('flywheelbolts', g);
  }
  if (has('pilotbearing')){
    const g = group('pilot');
    const outer = tubeMesh(B * 0.13, B * 0.098, M(14), MAT.steel(), 24);
    const inner = tubeMesh(B * 0.085, B * 0.062, M(14), MAT.chrome(), 20);
    const seal = tubeMesh(B * 0.098, B * 0.085, M(2), MAT.rubber(), 20);
    for (const m of [outer, inner]) g.add(rot(m, 0, 0, Math.PI / 2));
    g.add(at(rot(seal, 0, 0, Math.PI / 2), M(6), 0, 0));
    add('pilotbearing', at(g, rear + M(20), 0, 0));
  }
  if (has('adapterplate')){
    const s = new THREE.Shape(); s.absarc(0, 0, B * 1.36, 0, TAU, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, B * 1.12, 0, TAU, true); s.holes.push(hole);
    for (const t of [0.4, 2.6, 3.9]){                 // dowel and starter-locating holes
      const h = new THREE.Path(); h.absarc(Math.cos(t) * B * 1.25, Math.sin(t) * B * 1.25, B * 0.04, 0, TAU, true);
      s.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth:M(2.5), bevelEnabled:false, curveSegments:40 });
    geo.rotateY(Math.PI / 2);                          // plate faces along the crank
    add('adapterplate', at(new THREE.Mesh(geo, MAT.steel()), rear + M(16.2), 0, 0));
  }
  if (has('releasebearing')){
    const g = group('release');
    const brg = tubeMesh(B * 0.24, B * 0.13, M(16), MAT.steel(), 26);
    g.add(at(rot(brg, 0, 0, Math.PI / 2), M(8), 0, 0));
    const face = tubeMesh(B * 0.20, B * 0.14, M(2), MAT.chrome(), 24);
    g.add(at(rot(face, 0, 0, Math.PI / 2), -M(1), 0, 0));
    const carrier = tubeMesh(B * 0.17, B * 0.115, M(22), MAT.alloyDark(), 20);
    g.add(at(rot(carrier, 0, 0, Math.PI / 2), M(27), 0, 0));
    /* the fork: two fingers either side of the carrier, an arm out to its pivot */
    for (const sy of [-1, 1]) g.add(at(box(M(6), B * 0.10, M(10), MAT.steel()), M(30), sy * B * 0.20, B * 0.12));
    g.add(at(box(M(6), B * 0.50, M(10), MAT.steel()), M(34), 0, B * 0.20));
    g.add(at(rot(box(M(6), M(14), B * 0.95, MAT.steel()), 0.35, 0, 0), M(36), -B * 0.10, B * 0.62));
    add('releasebearing', at(g, rear + M(98), 0, 0));
  }
}

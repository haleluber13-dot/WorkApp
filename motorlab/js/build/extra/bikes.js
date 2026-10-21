/* bikes — geometry for the parts declared in js/data/extra/bikes.js.
 *
 * Frame: the crank runs along X, Y is up. On a transverse bike engine (every
 * bike here but the BMW) the gearbox shafts are PARALLEL to the crank, behind
 * it and lower — behind the crank in bike terms is −Z (the intake side, the
 * same side the rear cylinder of a vee leans to). Facing the front of the bike
 * (+Z) the rider's RIGHT is −X and LEFT is +X:
 *   right (−X): clutch, primary drive, clutch cover (Harley: cam chest, belt pulley)
 *   left  (+X): generator rotor, stator, starter clutch, front sprocket
 *               (Harley: primary chain, clutch, primary cover)
 * The BMW boxer's crank runs along the bike: front is −X, its dry clutch is on
 * the back of the crank (+X) and the separate gearbox is bolted behind that.
 * Placement source: scratchpad/parts-research/special.md §3.
 */
import * as THREE from 'three';
import { gearMesh, springMesh, alternatorMesh, serpentineBelt } from '../../lib/geo.js';
import { bikeSpec } from '../../data/extra/bikes.js';

const LEFT = 1, RIGHT = -1;

export function build(ctx){
  const s = bikeSpec(ctx.e);
  if (!s || !ctx.L) return;
  const K = kit(ctx);
  if (s.bmw) buildBmw(ctx, s, K);
  else buildUnit(ctx, s, K);
  /* 'desmorockers' is declared by the bikes tree but drawn by
     js/build/extra/valvetrain.js against its own cam/pivot layout */
  if (ctx.has('tappetblocks')) buildTappetBlocks(ctx, K);
}

/* ---------------------------------------------------------------------- */
/* shared helpers                                                          */
/* ---------------------------------------------------------------------- */
function kit(ctx){
  const { M, MAT, anim, has, add } = ctx;
  const g = ctx.geo;
  const A = (id, obj) => { if (obj && has(id)) add(id, obj); };
  /* Y-axis primitives turned onto X */
  const ax = (m) => { m.rotation.z = Math.PI / 2; return m; };
  const shaft = (r, len, mat) => ax(g.cyl(r, r, len, mat || MAT.steel(), 16));
  const disc = (rO, rI, t, mat) => ax(g.tubeMesh(rO, rI, t, mat, 36));
  const gearX = (r, teeth, w, mat) => {
    const m = gearMesh(r, Math.max(6, Math.round(teeth)), w, mat || MAT.steel(), Math.max(M(1.6), r * 0.07));
    m.rotation.y = Math.PI / 2;
    return m;
  };
  /* a holder on the rotation axis, so the animator can spin it about X */
  const spin = (obj, x, y, z, ratio) => {
    const h = g.group('spin'); h.add(obj); h.position.set(x, y, z);
    if (ratio) anim.pulleys.push({ node:h, ratio });
    return h;
  };
  const place = (obj, x, y, z) => g.at(obj, x, y, z);
  /* a thin plate lying in the YZ plane, rounded corners */
  const plateYZ = (dz, dy, t, r, mat) => {
    const p = g.roundBox(dz, dy, t, Math.min(r, dz * 0.49, dy * 0.49), mat);
    p.rotation.y = Math.PI / 2;
    return p;
  };
  /* a hollow cover standing off the case face: a skirt from xIn to xOut and
     a rounded outer plate; side = +1 for a left cover, −1 for a right one */
  const cover = (side, xIn, xOut, yLo, yHi, zLo, zHi, mat, bolts = 12) => {
    const grp = g.group('cover');
    const t = M(4), depth = Math.abs(xOut - xIn), xm = (xIn + xOut) / 2;
    const dy = yHi - yLo, dz = zHi - zLo, ym = (yLo + yHi) / 2, zm = (zLo + zHi) / 2;
    const r = Math.min(dy, dz) * 0.32;
    grp.add(place(plateYZ(dz, dy, t, r, mat), xOut, ym, zm));
    /* the skirt, inset by the corner radius so it meets the rounded plate */
    grp.add(place(g.box(depth, t, dz - r * 1.2, mat), xm, yHi - t / 2, zm));
    grp.add(place(g.box(depth, t, dz - r * 1.2, mat), xm, yLo + t / 2, zm));
    grp.add(place(g.box(depth, dy - r * 1.2, t, mat), xm, ym, zHi - t / 2));
    grp.add(place(g.box(depth, dy - r * 1.2, t, mat), xm, ym, zLo + t / 2));
    /* the gasket flange: a slightly larger rim on the case face */
    grp.add(place(plateYZ(dz + M(6), dy + M(6), M(2), r, MAT.gasket()), xIn + side * M(1), ym, zm));
    /* perimeter bolts, heads outboard */
    const inset = M(7);
    const per = 2 * (dy + dz);
    for (let k = 0; k < bolts; k++){
      let d = (k / bolts) * per, y, z;
      if (d < dz){ y = yHi - inset; z = zLo + d; }
      else if ((d -= dz) < dy){ z = zHi - inset; y = yHi - d; }
      else if ((d -= dy) < dz){ y = yLo + inset; z = zHi - d; }
      else { d -= dz; z = zLo + inset; y = yLo + d; }
      z = Math.max(zLo + inset, Math.min(zHi - inset, z));
      y = Math.max(yLo + inset, Math.min(yHi - inset, y));
      const b = g.bolt(M(3), M(8), MAT.plated());
      b.rotation.z = -side * Math.PI / 2;
      grp.add(place(b, xOut + side * M(1), y, z));
    }
    return grp;
  };
  /* a closed cup (dome) on X: wall from x0 outward by depth, end cap at the far end */
  const cup = (side, x0, depth, rO, mat) => {
    const grp = g.group('cup');
    grp.add(place(disc(rO, rO - M(4), depth, mat), x0 + side * depth / 2, 0, 0));
    grp.add(place(disc(rO, M(0.5), M(4), mat), x0 + side * (depth - M(2)), 0, 0));
    return grp;
  };
  /* a box shell: the listed faces only, so what is inside can be seen through
     whichever side is left open */
  const shell = (x0, x1, y0, y1, z0, z1, t, faces, mat) => {
    const grp = g.group('shell');
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2, zm = (z0 + z1) / 2;
    if (faces.includes('top'))    grp.add(place(g.box(w, t, d, mat), xm, y1 - t / 2, zm));
    if (faces.includes('bottom')) grp.add(place(g.box(w, t, d, mat), xm, y0 + t / 2, zm));
    if (faces.includes('zmin'))   grp.add(place(g.box(w, h, t, mat), xm, ym, z0 + t / 2));
    if (faces.includes('zmax'))   grp.add(place(g.box(w, h, t, mat), xm, ym, z1 - t / 2));
    if (faces.includes('xmin'))   grp.add(place(g.box(t, h, d, mat), x0 + t / 2, ym, zm));
    if (faces.includes('xmax'))   grp.add(place(g.box(t, h, d, mat), x1 - t / 2, ym, zm));
    return grp;
  };
  /* a C-shaped shift fork: half ring round a shaft opening away from the drum,
     with its stem running back to the drum */
  const fork = (x, shaftY, shaftZ, ringR, drumY, drumZ, drumR) => {
    const grp = g.group('fork');
    const dy = drumY - shaftY, dz = drumZ - shaftZ, dist = Math.hypot(dy, dz);
    const psi = Math.atan2(dz / dist, dy / dist);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, M(3), 6, 18, Math.PI), MAT.steel());
    ring.rotation.y = Math.PI / 2;
    const rh = g.group('ring'); rh.add(ring); rh.rotation.x = psi;
    grp.add(place(rh, x, shaftY, shaftZ));
    const len = Math.max(M(6), dist - ringR - drumR + M(4));
    const stem = g.box(M(5), len, M(9), MAT.steel());
    const sh = g.group('stem'); sh.add(stem); sh.rotation.x = psi;
    const mid = ringR + len / 2;
    grp.add(place(sh, x, shaftY + dy / dist * mid, shaftZ + dz / dist * mid));
    /* the pin that rides in the drum groove */
    const pin = g.cyl(M(3.5), M(3.5), M(10), MAT.plated(), 8);
    const ph = g.group('pin'); ph.add(pin); ph.rotation.x = psi;
    grp.add(place(ph, x, drumY - dy / dist * (drumR + M(2)), drumZ - dz / dist * (drumR + M(2))));
    return grp;
  };
  /* gear ratios, first to top, spread geometrically */
  const ratios = (S, r1 = 2.4, rTop = 1.0) =>
    Array.from({ length:S }, (_, k) => r1 * Math.pow(rTop / r1, S > 1 ? k / (S - 1) : 0));
  return { g, A, ax, shaft, disc, gearX, spin, place, plateYZ, cover, cup, shell, fork, ratios };
}

/* ---------------------------------------------------------------------- */
/* transverse unit-construction engines (wet clutch, integral gearbox)     */
/* ---------------------------------------------------------------------- */
function buildUnit(ctx, s, K){
  const { e, L, M, MAT, has, each, flush, wCase } = ctx;
  const { g, A, shaft, disc, gearX, spin, place, cover, shell, fork } = K;
  const halfL = L.len / 2;
  const cs = s.harley ? LEFT : RIGHT;       // clutch / primary side
  const ss = s.harley ? RIGHT : LEFT;       // final-drive side
  const rCl = M(s.rCl), sep = M(s.sep);
  const aUp = s.mainUp * Math.PI / 180;

  /* primary drive: gear pair on everything but the Harley's chain */
  let rp, rg, cd;
  if (s.primary === 'gear'){ rg = rCl * 0.95; rp = rg / s.ratio; cd = rp + rg; }
  else { rp = M(48); rg = rp * s.ratio; cd = M(s.cd || 190); }
  const ym = cd * Math.sin(aUp), zm = -cd * Math.cos(aUp);          // mainshaft axis
  const yc = ym - sep * 0.82,     zc = zm - sep * 0.57;              // countershaft axis
  const R = K.ratios(s.S, s.S === 5 ? 2.3 : 2.4, s.S === 5 ? 1.05 : 1.0);
  const rMain = R.map(r => sep / (1 + r)), rCnt = R.map((r, k) => sep - rMain[k]);
  const rmMax = Math.max(...rMain), rcMax = Math.max(...rCnt);
  const step = M(20), gw = M(12), span = (s.S - 1) * step;
  const xg = (k) => (k - (s.S - 1) / 2) * step;
  const drumR = M(17);
  const yd = yc - sep * 1.05, zd = zc + sep * 0.25;                  // shift drum, below the shafts
  const pr = s.primary === 'gear' ? -1 / s.ratio : 1 / s.ratio;      // basket/mainshaft speed vs crank

  /* ---- the gearbox end of the crankcases ----
     A bike's crankcase is also its gearbox housing (special.md 3a, "It is the
     gearbox housing too"). The car block stops a bore's width behind the crank,
     so the cases are carried back here round the shafts, as part of the same
     casting. The clutch-side end is left open: the clutch cover closes it. */
  const zFront = Math.max(zm + rmMax + M(8), -wCase * 0.95);
  const zBack = Math.min(zc - rcMax, zm - rmMax, zd - drumR) - M(14);
  const yHi = Math.max(ym + rmMax, yc + rcMax) + M(14);
  const yLo = Math.min(yc - rcMax, ym - rmMax, yd - drumR) - M(14);
  const faces = ['top', 'bottom', 'zmin', 'zmax', ss === LEFT ? 'xmax' : 'xmin'];
  ctx.add('block', shell(-halfL, halfL, yLo, yHi, zBack, zFront, M(6), faces, MAT.cast()));

  /* ---- gearbox shafts ---- */
  const clW = s.pairs * M(4.8) + M(30);                 // basket depth, outboard of the case face
  const xCl0 = cs * (halfL + M(8));                     // basket back face
  {
    const xa = cs * (halfL + clW + M(10)), xb = -cs * (span / 2 + M(18));
    const grp = g.group('mainshaft');
    grp.add(place(shaft(M(11), Math.abs(xa - xb), MAT.steel()), (xa + xb) / 2, 0, 0));
    /* the bearing where it passes the case wall, and the hub nut on the end */
    grp.add(place(disc(M(22), M(11), M(12), MAT.bearing()), cs * (halfL - M(8)), 0, 0));
    grp.add(place(K.ax(g.hexPrism(M(24), M(9), MAT.plated())), xa - cs * M(4), 0, 0));
    A('mainshaft', spin(grp, 0, ym, zm, pr));
  }
  {
    const xa = cs * (span / 2 + M(18)), xb = ss * (halfL + M(36));
    const grp = g.group('countershaft');
    grp.add(place(shaft(M(12), Math.abs(xa - xb), MAT.steel()), (xa + xb) / 2, 0, 0));
    grp.add(place(disc(M(24), M(12), M(12), MAT.bearing()), ss * (halfL - M(8)), 0, 0));
    /* the output seal in the case wall */
    grp.add(place(disc(M(20), M(12), M(6), MAT.rubber()), ss * (halfL + M(3)), 0, 0));
    A('countershaft', spin(grp, 0, yc, zc, pr / R[R.length - 1]));
  }
  /* one piece per gear pair: the mainshaft gear and its countershaft partner */
  for (let k = 0; k < s.S; k++){
    const grp = g.group('pair');
    const gm = spin(gearX(rMain[k] + M(1.5), rMain[k] * 2 / M(2.5), gw, MAT.steel()), xg(k), ym, zm, pr);
    const gc = spin(gearX(rCnt[k] + M(1.5), rCnt[k] * 2 / M(2.5), gw, MAT.plated()), xg(k), yc, zc, pr / R[k]);
    /* the dogs on the sliding gear's face */
    for (let d = 0; d < 4; d++){
      const t = d / 4 * Math.PI * 2;
      gm.add(place(g.box(M(4), M(5), M(5), MAT.steel()), gw / 2 + M(1.5),
                   Math.cos(t) * rMain[k] * 0.55, Math.sin(t) * rMain[k] * 0.55));
    }
    grp.add(gm, gc);
    each('gears', k, grp);
  }
  flush('gears');

  /* ---- selector: drum, forks, spindle ---- */
  {
    const grp = g.group('drum');
    const dLen = span + M(40);
    grp.add(place(shaft(drumR, dLen, MAT.alloyDark()), 0, yd, zd));
    /* the cam tracks cut round it */
    for (const x of [-dLen * 0.30, 0, dLen * 0.30])
      grp.add(place(K.ax(g.torus(drumR, M(1.6), MAT.black(), 24)), x, yd, zd));
    /* the detent star on the right-hand end, and the neutral switch boss on the left */
    grp.add(place(gearX(M(15), 6, M(5), MAT.steel()), RIGHT * (dLen / 2 + M(4)), yd, zd));
    grp.add(place(shaft(M(6), M(14), MAT.plastic()), LEFT * (dLen / 2 + M(8)), yd, zd));
    A('shiftdrum', grp);
  }
  /* three forks: two on the countershaft, one on the mainshaft (special.md 3a) */
  const forkAt = [{ gap:0, main:false }, { gap:Math.max(0, Math.floor((s.S - 1) / 2)), main:true },
                  { gap:Math.max(0, s.S - 2), main:false }];
  forkAt.forEach((f, k) => {
    const x = xg(Math.min(f.gap, s.S - 1)) + step / 2;
    each('shiftforks', k, fork(x, f.main ? ym : yc, f.main ? zm : zc, M(17), yd, zd, drumR));
  });
  flush('shiftforks');
  {
    /* the spindle crosses the case and comes out on the left for the lever */
    const grp = g.group('spindle');
    const ys = yd - M(8), zs = zd + M(36);
    const xa = RIGHT * (span / 2 + M(26)), xb = LEFT * (halfL + M(46));
    grp.add(place(shaft(M(7), Math.abs(xa - xb), MAT.steel()), (xa + xb) / 2, ys, zs));
    grp.add(place(shaft(M(8), M(16), MAT.plated()), xb - LEFT * M(8), ys, zs));       // splined end
    /* ratchet arm up to the drum star, and its return spring */
    const arm = g.box(M(5), Math.hypot(yd - ys, zd - zs) + M(6), M(10), MAT.steel());
    const ah = g.group('arm'); ah.add(arm); ah.rotation.x = Math.atan2(zd - zs, yd - ys);
    grp.add(place(ah, xa, (ys + yd) / 2, (zs + zd) / 2));
    grp.add(place(K.ax(springMesh(M(7), M(10), 3, M(1.2), MAT.steel())), xa + RIGHT * M(8), ys, zs));
    /* the seal where it leaves the case */
    grp.add(place(disc(M(12), M(7), M(5), MAT.rubber()), LEFT * (halfL + M(2)), ys, zs));
    A('shiftshaft', grp);
  }

  /* ---- primary drive ---- */
  const xPri = cs * (halfL + M(14));                     // primary gear plane
  if (s.primary === 'gear'){
    const grp = g.group('primary');
    grp.add(gearX(rp + M(1.5), rp * 2 / M(2.6), M(14), MAT.steel()));
    grp.add(place(K.ax(g.hexPrism(M(22), M(10), MAT.plated())), cs * M(12), 0, 0));
    A('primarygear', spin(grp, xPri, 0, 0, 1));
  }

  /* ---- clutch ---- */
  {
    const grp = g.group('basket');
    /* the driven half of the primary: gear (or the Harley's chain sprocket) on the back */
    if (s.primary === 'gear') grp.add(place(gearX(rg + M(1.5), rg * 2 / M(2.6), M(14), MAT.steel()), xPri, 0, 0));
    else {
      grp.add(place(gearX(rg, 57, M(10), MAT.steel()), cs * (halfL + M(30)), 0, 0));
      /* the starter ring gear on the shell */
      grp.add(place(gearX(rg + M(10), 102, M(8), MAT.steel()), cs * (halfL + M(18)), 0, 0));
    }
    const wallX = xCl0 + cs * (clW - M(8)) / 2 + cs * M(4);
    grp.add(place(disc(rCl, rCl - M(4), clW - M(8), MAT.alloy()), wallX, 0, 0));
    grp.add(place(disc(rCl, M(14), M(4), MAT.alloy()), xCl0 + cs * M(2), 0, 0));
    /* the slots the friction-plate tangs ride in */
    for (let k = 0; k < 8; k++){
      const t = k / 8 * Math.PI * 2;
      grp.add(place(g.box(clW - M(14), M(7), M(7), MAT.black()), wallX + cs * M(2),
                    Math.cos(t) * (rCl - M(1)), Math.sin(t) * (rCl - M(1))));
    }
    /* the cush rubbers between gear and basket */
    for (let k = 0; k < 6; k++){
      const t = (k + 0.5) / 6 * Math.PI * 2;
      grp.add(place(K.ax(g.cyl(M(5), M(5), M(8), MAT.rubber(), 10)), xCl0 + cs * M(1),
                    Math.cos(t) * rCl * 0.55, Math.sin(t) * rCl * 0.55));
    }
    A('clutchbasket', spin(grp, 0, ym, zm, pr));
  }
  const xPack0 = xCl0 + cs * M(16);
  const packLen = s.pairs * M(4.8);
  {
    const grp = g.group('hub');
    grp.add(place(disc(rCl * 0.60, M(11), packLen + M(4), MAT.alloyDark()), xPack0 + cs * (packLen / 2), 0, 0));
    grp.add(place(disc(rCl * 0.66, M(11), M(4), MAT.alloyDark()), xPack0, 0, 0));
    A('clutchhub', spin(grp, 0, ym, zm, pr));
  }
  for (let k = 0; k < s.pairs; k++){
    const grp = g.group('pair');
    const x = xPack0 + cs * (M(2) + k * M(4.8));
    grp.add(place(disc(rCl * 0.95, rCl * 0.63, M(2.9), MAT.friction()), x, 0, 0));
    grp.add(place(disc(rCl * 0.90, rCl * 0.60, M(1.6), MAT.steel()), x + cs * M(3.0), 0, 0));
    /* the friction plate's tangs into the basket slots */
    for (let t = 0; t < 8; t++){
      const a = t / 8 * Math.PI * 2;
      grp.add(place(g.box(M(2.9), M(6), M(6), MAT.friction()), x, Math.cos(a) * (rCl - M(1)), Math.sin(a) * (rCl - M(1))));
    }
    each('clutchplates', k, spin(grp, 0, ym, zm, pr));
  }
  flush('clutchplates');
  let xNext = xPack0 + cs * (packLen + M(3));
  if (s.slipper){
    const grp = g.group('slipper');
    grp.add(place(disc(rCl * 0.52, rCl * 0.30, M(6), MAT.alloyDark()), xNext + cs * M(3), 0, 0));
    for (let k = 0; k < 3; k++){                          // the ramps
      const t = k / 3 * Math.PI * 2;
      const r = g.box(M(8), M(10), M(14), MAT.steel());
      r.rotation.x = t;
      grp.add(place(r, xNext + cs * M(6), Math.cos(t) * rCl * 0.42, Math.sin(t) * rCl * 0.42));
    }
    A('slipper', spin(grp, 0, ym, zm, pr));
    xNext += cs * M(7);
  }
  {
    const grp = g.group('pressure');
    grp.add(place(disc(rCl * 0.92, rCl * 0.14, M(6), MAT.alloy()), xNext + cs * M(3), 0, 0));
    /* spring towers, and the release bearing in the middle */
    grp.add(place(disc(rCl * 0.14, M(4), M(10), MAT.bearing()), xNext + cs * M(9), 0, 0));
    A('pressureplate', spin(grp, 0, ym, zm, pr));
    xNext += cs * M(6);
  }
  if (s.springs){
    for (let k = 0; k < s.springs; k++){
      const t = k / s.springs * Math.PI * 2;
      const grp = g.group('spring');
      const sp = K.ax(springMesh(M(7.5), M(24), 6, M(1.6), MAT.steel()));
      grp.add(place(sp, xNext + cs * M(12), Math.cos(t) * rCl * 0.46, Math.sin(t) * rCl * 0.46));
      const b = g.bolt(M(3), M(8), MAT.plated());
      b.rotation.z = -cs * Math.PI / 2;
      grp.add(place(b, xNext + cs * M(26), Math.cos(t) * rCl * 0.46, Math.sin(t) * rCl * 0.46));
      each('clutchsprings', k, spin(grp, 0, ym, zm, pr));
    }
    flush('clutchsprings');
  } else {
    /* one diaphragm spring, dished, held by its adjuster plate */
    const grp = g.group('diaphragm');
    const cone = g.lathe([[rCl * 0.20, 0], [rCl * 0.86, -M(7)], [rCl * 0.86, -M(5)], [rCl * 0.20, M(2)]], MAT.steel(), 36);
    cone.rotation.z = cs * Math.PI / 2;
    grp.add(place(cone, xNext + cs * M(8), 0, 0));
    grp.add(place(disc(rCl * 0.24, M(5), M(6), MAT.plated()), xNext + cs * M(12), 0, 0));
    each('clutchsprings', 0, spin(grp, 0, ym, zm, pr));
    flush('clutchsprings');
  }
  const xClutchEnd = Math.abs(xNext) + M(30);           // outermost clutch hardware, |x|

  /* ---- covers on the clutch side ---- */
  if (s.harley){
    /* left primary case: engine sprocket/compensator, generator, chain, clutch */
    const rRot = M(s.rotorR);
    const xIn = halfL, xOut = Math.max(xClutchEnd, halfL + M(84)) + M(4);
    const rBig = Math.max(rCl, rg + M(10));
    const grp = cover(LEFT, xIn, xOut, Math.min(-rRot, ym - rBig) - M(12), Math.max(rRot, ym + rBig) + M(12),
                      zm - rBig - M(12), rRot + M(16), MAT.chrome(), 16);
    /* the derby cover over the clutch and the chain inspection cover */
    grp.add(place(disc(rCl * 0.62, M(1), M(6), MAT.chrome()), xOut + M(3), ym, zm));
    grp.add(place(g.roundBox(M(60), M(34), M(6), M(10), MAT.chrome()), xOut + M(3), ym * 0.5 - M(40), zm * 0.5));
    grp.children[grp.children.length - 1].rotation.y = Math.PI / 2;
    A('primarycover', grp);
  } else {
    const yTop = Math.max(yHi, ym + rCl + M(10));
    const zTop = Math.max(rp + M(18), M(30));
    const xIn = cs * halfL, xOut = cs * (Math.abs(xCl0) + clW + M(4));
    const grp = cover(cs, xIn, xOut, yLo, yTop, zBack, zTop, MAT.alloy(), 16);
    /* the dome over the clutch springs */
    const dome = g.group('dome');
    const dd = Math.max(M(8), xClutchEnd - Math.abs(xOut));
    dome.add(place(disc(rCl + M(6), rCl + M(2), dd, MAT.alloy()), xOut + cs * dd / 2, 0, 0));
    dome.add(place(disc(rCl + M(6), M(1), M(4), MAT.alloy()), xOut + cs * (dd - M(2)), 0, 0));
    grp.add(place(dome, 0, ym, zm));
    /* the oil filler and sight glass every right cover carries */
    grp.add(place(disc(M(12), M(7), M(4), MAT.glass ? MAT.glass() : MAT.plated()), xOut + cs * M(2), yLo + M(28), zBack * 0.45));
    A('clutchcover', grp);
  }

  /* ---- Harley: engine sprocket, compensator, generator, primary chain ---- */
  if (s.harley){
    const rRot = M(s.rotorR);
    {
      const grp = g.group('stator');
      grp.add(place(disc(rRot * 0.80, rRot * 0.36, M(10), MAT.steel()), halfL + M(9), 0, 0));
      for (let k = 0; k < 18; k++){
        const t = k / 18 * Math.PI * 2;
        grp.add(place(g.box(M(10), M(9), M(6), MAT.copper()), halfL + M(9), Math.cos(t) * rRot * 0.66, Math.sin(t) * rRot * 0.66));
      }
      A('stator', grp);
    }
    {
      const grp = g.group('rotor');
      grp.add(place(disc(rRot, rRot - M(5), M(16), MAT.steel()), M(8), 0, 0));
      grp.add(place(disc(rRot, M(14), M(3), MAT.steel()), M(17), 0, 0));
      A('genrotor', spin(grp, halfL, 0, 0, 1));
    }
    {
      const grp = g.group('compensator');
      grp.add(place(gearX(rp, 34, M(10), MAT.steel()), M(30), 0, 0));
      grp.add(place(shaft(M(24), M(18), MAT.plated()), M(44), 0, 0));
      grp.add(place(K.ax(springMesh(M(17), M(18), 4, M(2.5), MAT.steel())), M(62), 0, 0));
      grp.add(place(K.ax(g.hexPrism(M(30), M(10), MAT.plated())), M(76), 0, 0));
      A('compensator', spin(grp, halfL, 0, 0, 1));
    }
    {
      /* the chain loop round both sprockets, in the primary plane */
      const xp = halfL + M(30), d = Math.hypot(ym, zm);
      const uy = ym / d, uz = zm / d, ny = -uz, nz = uy;
      const r1 = rp + M(2), r2 = rg + M(2);
      const phi = Math.PI / 2 + Math.asin((r2 - r1) / d);
      const pts = [];
      const on = (cy, cz, r, th) => new THREE.Vector3(xp, cy + r * (Math.cos(th) * uy + Math.sin(th) * ny),
                                                          cz + r * (Math.cos(th) * uz + Math.sin(th) * nz));
      for (let k = 0; k <= 12; k++) pts.push(on(0, 0, r1, phi + (2 * Math.PI - 2 * phi) * k / 12));
      for (let k = 0; k <= 12; k++) pts.push(on(ym, zm, r2, -phi + 2 * phi * k / 12));
      pts.push(pts[0].clone());
      const grp = g.group('chain');
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, M(4.5), 6, true), MAT.steel()));
      /* the adjuster shoe under the lower run */
      const low = Math.sign(ny) < 0 ? 1 : -1;
      const mid = on(ym / 2, zm / 2, 0, 0);
      const shoe = g.box(M(14), M(10), d * 0.35, MAT.plastic());
      const sh = g.group('shoe'); sh.add(shoe); sh.rotation.x = Math.atan2(uy, uz) * -1;
      grp.add(place(sh, xp, mid.y - low * ny * (Math.max(r1, r2) * 0.62), mid.z - low * nz * (Math.max(r1, r2) * 0.62)));
      A('primarychain', grp);
    }
  }

  /* ---- generator side (all gear-primary bikes) ---- */
  if (!s.harley){
    const rRot = M(s.rotorR);
    const rSd = rRot * 0.86, rIdl = M(17);
    /* The idler sits between the core tree's starter pinion and the starter
       clutch's driven gear: its small gear meshes the driven gear, its large
       gear the pinion. The pinion is read off the core starter node (built
       by engineModel as starterMesh(L.bore*1.6), pinion at +0.80·size on X). */
    const rIs = rIdl * 0.55;
    let yI, zI, xPin = halfL + M(8);
    const st = ctx.nodes.get('starter')?.[0];
    if (st){
      const size = L.bore * 1.6, rPin = size * 0.12;
      xPin = st.position.x + size * 0.80;
      const py = st.position.y, pz = st.position.z, dP = Math.hypot(py, pz);
      const a = rSd + rIs + M(1), b = rIdl + rPin + M(1);
      /* triangle crank–idler–pinion: place the idler on the side away from the crank's top */
      const cosA = Math.max(-1, Math.min(1, (a * a + dP * dP - b * b) / (2 * a * dP)));
      const base = Math.atan2(py, pz), off = Math.acos(cosA);
      const t = base + off;
      yI = a * Math.sin(t); zI = a * Math.cos(t);
    } else {
      const dI = rSd + rIdl + M(2), tI = 60 * Math.PI / 180;
      yI = dI * Math.sin(tI); zI = -dI * Math.cos(tI);
    }
    if (has('starterclutch')){
      const grp = g.group('starterclutch');
      grp.add(place(gearX(rSd, 52, M(8), MAT.steel()), halfL + M(8), 0, 0));       // driven gear
      grp.add(place(disc(rRot * 0.70, rRot * 0.30, M(10), MAT.bearing()), halfL + M(17), 0, 0));  // sprag outer
      A('starterclutch', grp);
      const ig = g.group('idler');
      /* small gear in the driven-gear plane, large gear in the pinion plane */
      const xS = halfL + M(8), xL = Math.max(xS + M(10), xPin);
      ig.add(place(gearX(rIs, 14, M(8), MAT.steel()), xS, 0, 0));
      ig.add(place(gearX(rIdl, 24, M(8), MAT.steel()), xL, 0, 0));
      ig.add(place(shaft(M(5), xL - xS + M(12), MAT.plated()), (xS + xL) / 2, 0, 0));
      A('starteridler', place(ig, 0, yI, zI));
    }
    {
      const grp = g.group('rotor');
      grp.add(place(disc(rRot, rRot - M(5), M(28), MAT.steel()), M(14), 0, 0));
      grp.add(place(disc(rRot, M(13), M(4), MAT.steel()), M(2), 0, 0));
      grp.add(place(shaft(M(16), M(12), MAT.steel()), M(6), 0, 0));                 // boss on the taper
      /* the reluctor bumps the pick-up coil reads */
      for (let k = 0; k < 6; k++){
        const t = k / 6 * Math.PI * 2;
        grp.add(place(g.box(M(10), M(4), M(8), MAT.steel()), M(22), Math.cos(t) * (rRot + M(2)), Math.sin(t) * (rRot + M(2))));
      }
      A('genrotor', spin(grp, halfL + M(20), 0, 0, 1));
    }
    {
      const grp = g.group('stator');
      grp.add(place(disc(rRot * 0.80, rRot * 0.34, M(16), MAT.steel()), halfL + M(36), 0, 0));
      for (let k = 0; k < 18; k++){
        const t = k / 18 * Math.PI * 2;
        grp.add(place(g.box(M(16), M(9), M(6), MAT.copper()), halfL + M(36), Math.cos(t) * rRot * 0.66, Math.sin(t) * rRot * 0.66));
      }
      /* the pick-up coil just outside the rotor rim */
      grp.add(place(g.roundBox(M(14), M(16), M(12), M(3), MAT.black()), halfL + M(42), rRot + M(12), 0));
      A('stator', grp);
    }
    {
      const depth = M(58);
      const grp = K.cup(LEFT, halfL, depth, rRot + M(14), MAT.alloy());
      grp.position.set(0, 0, 0);
      const wrap = g.group('statorcover'); wrap.add(grp);
      if (has('starteridler')){
        const ic = K.cup(LEFT, halfL, Math.max(M(30), xPin - halfL + M(12)), rIdl + M(10), MAT.alloy());
        wrap.add(place(ic, 0, yI, zI));
      }
      for (let k = 0; k < 10; k++){
        const t = k / 10 * Math.PI * 2;
        const b = g.bolt(M(3), M(8), MAT.plated()); b.rotation.z = -Math.PI / 2;
        wrap.add(place(b, halfL + M(6), Math.cos(t) * (rRot + M(19)), Math.sin(t) * (rRot + M(19))));
      }
      wrap.add(place(disc(rRot + M(19), rRot + M(10), M(2), MAT.gasket()), halfL + M(1), 0, 0));
      A('statorcover', wrap);
    }
  }

  /* ---- final drive ---- */
  {
    const T = s.sprocketT;
    const r = s.harley ? T * M(14) / (2 * Math.PI) : M(15.875) / (2 * Math.sin(Math.PI / T));
    const w = s.harley ? M(28) : M(8);
    const grp = g.group('sprocket');
    grp.add(gearX(r, T, w, s.harley ? MAT.alloyDark() : MAT.steel()));
    grp.add(place(K.ax(g.hexPrism(M(26), M(10), MAT.plated())), ss * (w / 2 + M(5)), 0, 0));
    A('frontsprocket', spin(grp, ss * (halfL + M(22) + w / 2), yc, zc, pr / R[R.length - 1]));
  }
}

/* ---------------------------------------------------------------------- */
/* BMW R1200 Hexhead: separate gearbox behind the dry clutch               */
/* ---------------------------------------------------------------------- */
function buildBmw(ctx, s, K){
  const { L, M, MAT, each, flush } = ctx;
  const { g, A, shaft, disc, gearX, spin, place, shell, fork } = K;
  const halfL = L.len / 2;
  /* the car-style dry clutch the base tree already draws ends ~96 mm behind
     the block; the gearbox housing bolts on behind it (special.md 3d) */
  const x0 = halfL + M(102), len = M(250), x1 = x0 + len;
  const sep = M(78), yc = -sep;
  const R = K.ratios(s.S, 2.3, 0.95);
  const rMain = R.map(r => sep / (1 + r)), rCnt = R.map((r, k) => sep - rMain[k]);
  const step = M(30), gw = M(14);
  const xg = (k) => x0 + M(45) + k * step;
  const drumR = M(17), yd = -M(39), zd = M(64);

  /* ---- dry single-plate clutch on the back of the crank ---- */
  {
    /* built here rather than with geo's flywheelMesh/clutchMesh, whose bolt
       circles are laid in the XY plane and stick out along the crank axis */
    const rH = L.bore * 1.02;
    const hg = g.group('housing');
    hg.add(disc(rH * 0.92, M(14), M(12), MAT.iron()));
    hg.add(place(disc(rH * 0.92, rH * 0.80, M(26), MAT.iron()), M(13), 0, 0));
    hg.add(place(gearX(rH, Math.round(rH * 720), M(10), MAT.steel()), -M(2), 0, 0));   // starter ring gear
    for (let k = 0; k < 6; k++){
      const t = k / 6 * Math.PI * 2;
      hg.add(place(K.ax(g.hexPrism(M(12), M(6), MAT.plated())), -M(8), Math.cos(t) * rH * 0.24, Math.sin(t) * rH * 0.24));
    }
    A('clutchhousing', spin(hg, halfL + M(24), 0, 0, 1));
    const dg = g.group('disc');
    dg.add(disc(L.bore * 0.80, L.bore * 0.26, M(8), MAT.friction()));
    dg.add(disc(L.bore * 0.26, M(13), M(22), MAT.steel()));                     // splined hub
    for (let k = 0; k < 6; k++){                                                  // torsion springs
      const t = k / 6 * Math.PI * 2;
      dg.add(place(K.ax(g.cyl(M(5), M(5), M(14), MAT.steel(), 8)), 0, Math.cos(t) * L.bore * 0.36, Math.sin(t) * L.bore * 0.36));
    }
    A('clutchdisc', spin(dg, halfL + M(44), 0, 0, 1));
    const pg = g.group('pressure');
    pg.add(disc(L.bore * 0.86, L.bore * 0.30, M(8), MAT.steel()));
    pg.add(place(disc(L.bore * 0.90, L.bore * 0.84, M(18), MAT.steel()), -M(6), 0, 0));
    for (let k = 0; k < 18; k++){                                                 // diaphragm fingers
      const t = k / 18 * Math.PI * 2;
      const f = g.box(M(2), L.bore * 0.40, L.bore * 0.07, MAT.plated());
      f.rotation.x = -t;
      pg.add(place(f, M(7), Math.cos(t) * L.bore * 0.40, Math.sin(t) * L.bore * 0.40));
    }
    for (let k = 0; k < 6; k++){
      const t = (k + 0.5) / 6 * Math.PI * 2;
      const b = g.bolt(M(3.5), M(10), MAT.plated()); b.rotation.z = -Math.PI / 2;
      pg.add(place(b, M(2), Math.cos(t) * L.bore * 0.88, Math.sin(t) * L.bore * 0.88));
    }
    A('drypressureplate', spin(pg, halfL + M(56), 0, 0, 1));
  }
  /* ---- alternator on the ELAST belt, top front ---- */
  {
    const frontX = ctx.frontX;
    const xb = frontX - M(26);                    // belt plane, ahead of the timing cover
    const r1 = M(38), r2 = M(26);
    const yA = M(195);                            // 4PK592: 592 mm ≈ 2·d + π(r1 + r2)
    const size = M(112);
    const alt = alternatorMesh(size);
    if (alt.userData.pulley) ctx.anim.pulleys.push({ node:alt.userData.pulley, ratio:r1 / r2 });
    A('topalternator', place(alt, xb + size * 0.56, yA, 0));
    const bg = g.group('altbelt');
    const pul = g.group('crankpulley');
    pul.add(g.lathe([[r1 * 0.3, -M(9)], [r1, -M(9)], [r1 * 0.94, -M(5)], [r1, 0], [r1 * 0.94, M(5)], [r1, M(9)], [r1 * 0.3, M(9)]], MAT.steel(), 36));
    pul.children[0].rotation.z = Math.PI / 2;
    bg.add(spin(pul, xb, 0, 0, 1));
    const belt = serpentineBelt([{ y:0, z:0, r:r1 }, { y:yA, z:0, r:r2 }], xb, M(14), MAT.rubber());
    if (belt) bg.add(belt);
    A('altbelt', bg);
    A('beltcover', K.cover(RIGHT, xb + M(14), xb - M(22), -r1 - M(16), yA + r2 + M(20), -r1 - M(14), r1 + M(14), MAT.alloy(), 8));
  }
  {
    const grp = g.group('gearbox');
    grp.add(shell(x0, x1, -M(152), M(86), -M(102), M(102), M(5), ['top', 'bottom', 'zmin', 'zmax', 'xmax'], MAT.alloy()));
    /* the bell that reaches forward round the clutch to the engine's flange */
    const bl = x0 - (halfL + M(14));
    grp.add(place(disc(L.bore * 1.20, L.bore * 1.13, bl, MAT.alloy()), halfL + M(14) + bl / 2, 0, 0));
    grp.add(place(disc(M(104), L.bore * 0.5, M(5), MAT.alloy()), x0 + M(2), -M(30), 0));
    /* bolts round the bell flange */
    for (let k = 0; k < 8; k++){
      const t = k / 8 * Math.PI * 2;
      const b = g.bolt(M(4), M(10), MAT.plated()); b.rotation.z = -Math.PI / 2;
      grp.add(place(b, halfL + M(22), Math.cos(t) * L.bore * 1.24, Math.sin(t) * L.bore * 1.24));
    }
    /* drain and filler plugs */
    grp.add(place(K.ax(g.hexPrism(M(17), M(8), MAT.plated())), x1 - M(30), -M(152) - M(3), 0));
    grp.children[grp.children.length - 1].rotation.set(0, 0, 0);
    A('gearboxhousing', grp);
  }
  {
    const grp = g.group('input');
    const xa = halfL + M(40), xb = x1 - M(6);
    grp.add(place(shaft(M(13), xb - xa, MAT.steel()), (xa + xb) / 2, 0, 0));
    grp.add(place(disc(M(24), M(13), M(12), MAT.bearing()), x0 + M(10), 0, 0));
    A('mainshaft', spin(grp, 0, 0, 0, 1));
  }
  {
    const grp = g.group('output');
    const xa = x0 + M(14), xb = x1 + M(26);
    grp.add(place(shaft(M(14), xb - xa, MAT.steel()), (xa + xb) / 2, 0, 0));
    /* the output flange to the shaft drive */
    grp.add(place(disc(M(34), M(8), M(8), MAT.steel()), xb, 0, 0));
    A('countershaft', spin(grp, 0, yc, 0, 1 / R[R.length - 1]));
  }
  for (let k = 0; k < s.S; k++){
    const grp = g.group('pair');
    grp.add(spin(gearX(rMain[k] + M(1.5), rMain[k] * 2 / M(2.5), gw, MAT.steel()), xg(k), 0, 0, 1));
    grp.add(spin(gearX(rCnt[k] + M(1.5), rCnt[k] * 2 / M(2.5), gw, MAT.plated()), xg(k), yc, 0, -1 / R[k]));
    each('gears', k, grp);
  }
  flush('gears');
  {
    const grp = g.group('drum');
    const xa = xg(0) - M(16), xb = xg(s.S - 1) + M(16);
    grp.add(place(shaft(drumR, xb - xa, MAT.alloyDark()), (xa + xb) / 2, yd, zd));
    grp.add(place(gearX(M(15), 6, M(5), MAT.steel()), xb + M(5), yd, zd));
    A('shiftdrum', grp);
  }
  [[0, false], [2, true], [4, false]].forEach(([gap, main], k) => {
    const x = xg(Math.min(gap, s.S - 2)) + step / 2;
    each('shiftforks', k, fork(x, main ? 0 : yc, 0, M(18), yd, zd, drumR));
  });
  flush('shiftforks');
  {
    /* the spindle comes out of the left of the box (+Z) for the shift linkage */
    const grp = g.group('spindle');
    const sp = g.cyl(M(7), M(7), M(130), MAT.steel(), 14);
    sp.rotation.x = Math.PI / 2;
    grp.add(place(sp, xg(1), -M(118), M(50)));
    grp.add(place(g.box(M(8), M(70), M(10), MAT.steel()), xg(1), -M(84), M(64)));
    A('shiftshaft', grp);
  }
  {
    const grp = g.group('slave');
    grp.add(place(shaft(M(20), M(42), MAT.alloyDark()), x1 + M(22), 0, 0));
    grp.add(place(shaft(M(3), x1 - (halfL + M(50)), MAT.steel()), (x1 + halfL + M(50)) / 2, 0, 0));  // pushrod in the input shaft
    grp.add(ctx.geo.pipe([[x1 + M(30), M(18), 0], [x1 + M(34), M(70), M(30)], [x1 - M(40), M(130), M(60)]], M(4), MAT.black(), 8));
    A('clutchslave', grp);
  }
}

/* the lifter blocks: the base builder casts one into the crankcase at
   engineModel's OHV section; on the Sportster it is a separate bolted block,
   so it is drawn here over the same spot (a hair larger, so it is the visible one) */
function buildTappetBlocks(ctx, K){
  const { e, L, M, MAT, portAt, cylPosition, cylSlot, each, flush } = ctx;
  const { g, place } = K;
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [ly, lz] = portAt(b, L.deckH * 0.44, L.bore * 0.66);
    const grp = g.group('tappetblock');
    const blk = g.roundBox(L.bore * 0.62, L.bore * 0.33, L.bore * 0.37, .006, MAT.alloy());
    grp.add(blk);
    for (const sx of [-1, 1]){
      const bt = g.bolt(M(3), M(10), MAT.plated());
      grp.add(place(bt, sx * L.bore * 0.24, L.bore * 0.17, 0));
    }
    grp.rotation.x = L.bankAngles[b] || 0;
    each('tappetblocks', i, place(grp, p.x, ly, lz));
  }
  flush('tappetblocks');
}

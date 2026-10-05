/* fuelIgnition — geometry for the parts declared in js/data/extra/fuelIgnition.js,
 * plus the tree's own pspump / accomp / grounds / airbox / tps / iscv, which
 * pistonTree lists but the main builder never drew. See js/build/extra/index.js.
 *
 * Everything is placed off the same frame the main builder uses. A few of its
 * locals are not passed in ctx (inducY, the plenum box, thrAt, the ITB rule);
 * they are recomputed here with the same formulas — keep them in step with
 * buildPiston() in js/build/engineModel.js.
 */
import { groundStrap, sensorMesh, hoseClamp, serpentineBelt, connectorShell } from '../../lib/geo.js';

export function build(ctx){
  const { e, L, M, MAT, has, add, each, flush, geo } = ctx;
  if (!L || e.kind === 'rotary') return;            // the rotary builder has no piston frame
  const { box, roundBox, cyl, tubeMesh, torus, pipe, hexPrism, lathe, group, at, rot, V3, TAU } = geo;
  const { frontX, beltX, wCase, outerZ, portAt, railAt, inSide, exSide, cylPosition, cylSlot } = ctx;
  const B = L.bore;
  const flat = e.layout === 'F';

  /* ---- the main builder's induction frame, recomputed ---- */
  /* taken from the main builder when it hands them over (ctx.inducY / ctx.thrAt),
     so the module cannot drift from where the plenum and throttle really are */
  const vAngle = Math.abs(L.bankAngles[0] || 0);
  const inducY = ctx.inducY ?? (L.banks >= 2 ? L.deckH * Math.cos(vAngle) * 1.04 + B * 0.70 : L.deckH + B * 1.42);
  const plenZ = ctx.thrAt ? ctx.thrAt.z : (L.banks >= 2 ? 0 : -B * 1.12);
  const plenH = B * (L.banks >= 2 ? 0.72 : 0.46);
  const plenW = L.banks >= 2 ? B * 1.45 : B * 0.70;
  const thrAt = ctx.thrAt ? ctx.thrAt.clone() : V3(-L.len * 0.48, inducY, plenZ);

  /* ---- small helpers ---- */
  const UP = V3(0, 1, 0);
  /** turn an object's +Y onto a direction */
  const alignY = (obj, dir) => { obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); return obj; };
  /** a round bar from a to b */
  const rod = (a, b, r, mat, seg = 10) => {
    const d = b.clone().sub(a);
    const m = cyl(r, r, d.length(), mat, seg);
    alignY(m, d); m.position.copy(a).addScaledVector(d, 0.5);
    return m;
  };
  /** a ribbed (poly-V) pulley in the YZ plane, axis along X, centred on its origin */
  const ribbedPulley = (r, w, mat = MAT.black(), ribs = 6) => {
    const p = [[r * 0.30, -w / 2]];
    for (let i = 0; i < ribs; i++){
      const z0 = -w * 0.45 + (i / ribs) * w * 0.9, zw = (w * 0.9) / ribs;
      p.push([r, z0], [r * 0.93, z0 + zw * 0.5], [r, z0 + zw]);
    }
    p.push([r * 0.30, w / 2]);
    const g = group('pulley');
    g.add(rot(lathe(p, mat, 30), 0, 0, Math.PI / 2));
    g.add(rot(cyl(r * 0.32, r * 0.32, w * 1.05, MAT.steel(), 18), 0, 0, Math.PI / 2));
    g.add(at(rot(hexPrism(r * 0.34, w * 0.30, MAT.plated()), 0, 0, Math.PI / 2), -w * 0.62, 0, 0));
    return g;
  };
  /** a body of revolution lying along +X from x0 (a cylinder with chamfered ends) */
  const canAlongX = (r, len, mat) =>
    rot(lathe([[0, 0], [r * 0.86, 0], [r, r * 0.12], [r, len - r * 0.12], [r * 0.86, len], [0, len]], mat, 30),
        0, 0, -Math.PI / 2);

  /* ================================================================== */
  /* Accessory drive: power-steering pump and A/C compressor            */
  /* ================================================================== */
  /* Inline and vee: both hang low on the front of the block, below the crank
     axis, steering pump on the alternator's side and the compressor on the
     other (realism §2.3). On a boxer the banks fill that space, so both sit up
     on top of the crankcase at the front, the way a Subaru's do. Their pulleys
     run on a second belt in a plane just ahead of the main serpentine, off an
     extra groove on the crank damper — the separate A/C and steering belts an
     older engine wears. */
  const plane2 = beltX - M(34);
  const accY = flat ? B * 1.50 : L.banks >= 2 ? -B * 0.85 : -B * 0.40;   /* a vee's compressor sits below the core plugs on the bank face */
  const psSide = -1, acSide = 1;
  const second = [];                                 // pulleys on the second belt

  if (has('pspump')){
    const Rb = B * 0.36, Lb = B * 0.95, rP = B * 0.42;
    const zc = flat ? psSide * B * 2.45 : psSide * (wCase + Rb + M(10));   /* a boxer's PS pump sits outboard of its alternator */
    const g = group('pspump');
    g.add(at(ribbedPulley(rP, M(22)), plane2, accY, zc));
    g.add(at(rot(cyl(B * 0.10, B * 0.10, M(34), MAT.steel(), 14), 0, 0, Math.PI / 2), plane2 + M(17), accY, zc));
    const x0 = plane2 + M(30);
    g.add(at(canAlongX(Rb, Lb, MAT.alloyDark()), x0, accY, zc));
    /* the cam ring housing bulges at the back, where the pressure outlet is */
    g.add(at(rot(cyl(Rb * 1.08, Rb * 1.08, Lb * 0.30, MAT.alloy(), 24), 0, 0, Math.PI / 2), x0 + Lb * 0.70, accY, zc));
    /* the reservoir on top, with its dipstick cap */
    const resX = x0 + Lb * 0.55, resY = accY + Rb + B * 0.24;
    g.add(at(cyl(B * 0.22, B * 0.22, B * 0.40, MAT.plastic(), 22), resX, resY, zc));
    g.add(at(cyl(B * 0.15, B * 0.15, B * 0.08, MAT.black(), 16), resX, resY + B * 0.24, zc));
    g.add(rod(V3(resX, resY - B * 0.20, zc), V3(resX, accY + Rb * 0.6, zc), B * 0.06, MAT.alloyDark()));
    /* the cast bracket back to the engine, and its three bolts */
    if (!flat){
      const zIn = psSide * wCase, zOut = zc - psSide * Rb * 0.55;
      const br = box(Lb * 0.70, Rb * 1.50, Math.abs(zOut - zIn), MAT.alloyDark());
      g.add(at(br, x0 + Lb * 0.45, accY, (zIn + zOut) / 2));
      for (const [dx, dy] of [[0.2, 0.5], [0.7, 0.5], [0.45, -0.5]])
        g.add(at(rot(hexPrism(M(13), M(8), MAT.plated()), Math.PI / 2, 0, 0),
                 x0 + Lb * dx, accY + Rb * dy, zOut - psSide * M(2)));
    } else {
      g.add(at(box(Lb * 0.7, B * 0.40, Rb * 1.2, MAT.alloyDark()), x0 + Lb * 0.45, accY - Rb - B * 0.18, zc));
    }
    /* high-pressure line (braided) and return hose, off towards the rack */
    g.add(pipe([V3(x0 + Lb * 0.85, accY - Rb * 0.5, zc), V3(x0 + Lb * 1.15, accY - Rb * 1.6, zc + psSide * B * 0.10),
                V3(x0 + Lb * 0.90, accY - Rb * 2.8, zc + psSide * B * 0.30)], M(6), MAT.braid(), 8));
    g.add(pipe([V3(resX + B * 0.15, resY - B * 0.05, zc + psSide * B * 0.12),
                V3(resX + B * 0.45, resY - B * 0.30, zc + psSide * B * 0.30),
                V3(resX + B * 0.55, accY - Rb * 2.6, zc + psSide * B * 0.40)], M(7), MAT.rubber(), 8));
    add('pspump', g);
    second.push({ y:accY, z:zc, r:rP });
  }

  if (has('accomp')){
    const Rb = B * 0.50, Lb = B * 1.30, rP = B * 0.48;
    const zc = flat ? acSide * B * 0.84 : acSide * (wCase + Rb + M(10));
    const g = group('accomp');
    /* the electromagnetic clutch: pulley, the coil housing behind it, the
       armature plate on the nose */
    g.add(at(ribbedPulley(rP, M(24), MAT.steel()), plane2, accY, zc));
    g.add(at(rot(cyl(rP * 0.80, rP * 0.80, M(4), MAT.plated(), 26), 0, 0, Math.PI / 2), plane2 - M(14), accY, zc));
    g.add(at(rot(tubeMesh(rP * 0.82, rP * 0.40, M(18), MAT.black(), 26), 0, 0, Math.PI / 2), plane2 + M(22), accY, zc));
    const x0 = plane2 + M(30);
    g.add(at(canAlongX(Rb, Lb, MAT.alloy()), x0, accY, zc));
    /* the four mounting ears, bored through for the long bolts */
    for (const sy of [-1, 1]) for (const fx of [0.12, 0.86]){
      g.add(at(rot(tubeMesh(B * 0.12, B * 0.06, Lb * 0.12, MAT.alloy(), 14), 0, 0, Math.PI / 2),
               x0 + Lb * fx, accY + sy * Rb * 0.98, zc - acSide * Rb * 0.45));
    }
    /* the rear head with its suction and discharge ports, and the hoses —
       which stay connected: the compressor is unbolted and hung aside */
    const headX = x0 + Lb + M(4);
    g.add(at(roundBox(M(30), Rb * 1.5, Rb * 1.2, M(4), MAT.alloyDark()), headX, accY, zc));
    for (const [k, dy] of [[0, 0.35], [1, -0.20]]){
      const pA = V3(headX, accY + Rb * (0.55 + dy), zc + acSide * Rb * 0.1);
      g.add(at(roundBox(M(26), M(22), M(30), M(3), MAT.alloyDark()), pA.x, pA.y, pA.z));
      g.add(pipe([pA, V3(pA.x + B * 0.30, pA.y + B * 0.35, pA.z + acSide * B * 0.10),
                  V3(pA.x + B * 0.55, pA.y + B * 0.80, pA.z + acSide * B * (0.45 + k * 0.15))],
                 k ? M(8) : M(10), MAT.rubber(), 8));
    }
    /* clutch lead to the loom */
    g.add(at(connectorShell(M(18), M(14), M(16)), x0 + Lb * 0.10, accY + Rb + M(10), zc));
    if (!flat){
      const zIn = acSide * wCase, zOut = zc - acSide * Rb * 0.55;
      g.add(at(box(Lb * 0.75, Rb * 1.30, Math.abs(zOut - zIn), MAT.alloyDark()), x0 + Lb * 0.48, accY, (zIn + zOut) / 2));
    } else {
      g.add(at(box(Lb * 0.75, B * 0.36, Rb * 1.1, MAT.alloyDark()), x0 + Lb * 0.48, accY - Rb - B * 0.16, zc));
    }
    add('accomp', g);
    second.push({ y:accY, z:zc, r:rP });
  }

  if (second.length && has('accbelt')){
    /* the second groove on the crank damper, and the belt round it */
    const rC = L.crankR * 1.0;
    add('crankpulley', at(ribbedPulley(rC, M(22), MAT.iron()), plane2, 0, 0));
    const belt2 = serpentineBelt([{ y:0, z:0, r:rC }, ...second], plane2, M(18), MAT.rubber());
    if (belt2) add('accbelt', belt2);
  }

  /* the alternator's pivot bolt and slotted adjusting bracket: where the main
     builder hung the alternator, and where its two mounting ears are */
  if (has('altbracket') && has('alternator')){
    const size = B * 1.35, R = size * 0.56;
    /* exactly where the core builder put the alternator (ctx.altAt) */
    const ax = ctx.altAt ? ctx.altAt.x : beltX + size * 0.56, ay = ctx.altAt ? ctx.altAt.y : L.deckH * 0.78, az = ctx.altAt ? ctx.altAt.z : -(outerZ + size * 0.30);
    const g = group('altbracket');
    /* the pivot bolt through the lower lug, with its nut on the far side */
    const piv = V3(ax - size * 0.30, ay - R * 0.92, az);
    g.add(at(rot(cyl(M(5), M(5), size * 0.36, MAT.steel(), 10), 0, 0, Math.PI / 2), piv.x, piv.y, piv.z));
    g.add(at(rot(hexPrism(M(14), M(8), MAT.plated()), 0, 0, Math.PI / 2), piv.x - size * 0.16, piv.y, piv.z));
    g.add(at(rot(hexPrism(M(14), M(9), MAT.plated()), 0, 0, Math.PI / 2), piv.x + size * 0.16, piv.y, piv.z));
    /* the cast foot the pivot bolt passes through, back to the block */
    const footZ = -(Math.max(wCase, outerZ - B * 0.30) + M(6));
    g.add(at(box(M(18), R * 0.55, Math.abs(piv.z - footZ) + M(6), MAT.alloyDark()),
             piv.x + size * 0.12, piv.y, (piv.z + footZ) / 2));
    /* the slotted strap from the top ear across to its boss on the engine */
    const eye = V3(ax + size * 0.34, ay + R * 0.94, az);
    const inner = V3(eye.x, eye.y - R * 0.10, az + B * 0.62);
    const sdir = inner.clone().sub(eye);
    const strap = box(M(5), M(20), sdir.length() + M(14), MAT.steel());
    strap.position.copy(eye).addScaledVector(sdir, 0.5);
    strap.rotation.x = Math.atan2(-sdir.y, sdir.z);
    g.add(strap);
    for (const p of [eye, inner])
      g.add(at(rot(hexPrism(M(13), M(7), MAT.plated()), 0, 0, Math.PI / 2), p.x - M(8), p.y, p.z));
    g.add(at(rot(cyl(M(9), M(9), M(28), MAT.alloyDark(), 12), 0, 0, Math.PI / 2), inner.x + M(14), inner.y, inner.z));
    add('altbracket', g);
  }

  /* the oil filter bracket: the casting the spin-on filter threads onto, out
     from the block flank — the main builder hangs the filter at
     (0.2·len, −0.9·crankR, outerZ + 50 mm), axis along the crank, seal face aft */
  if (has('filterbracket')){
    /* the filter is wherever the core builder put it (ctx.oilFilterAt), on
       either side of the block — the bracket reaches from the flank on that side */
    const F = ctx.oilFilterAt ? ctx.oilFilterAt.clone()
            : V3(L.len * 0.20, -L.crankR * 0.90, (/bmw|mercedes|porsche|audi|volkswagen/i.test(e.maker || '') ? -1 : 1) * (L.banks >= 2 ? wCase + M(70) : outerZ + M(50)));
    const face = F.x + M(115) * 0.58;
    const g = group('filterbracket');
    g.add(at(rot(cyl(M(40), M(40), M(18), MAT.alloyDark(), 26), 0, 0, Math.PI / 2), face + M(9), F.y, F.z));
    g.add(at(rot(cyl(M(11), M(11), M(10), MAT.steel(), 12), 0, 0, Math.PI / 2), face - M(2), F.y, F.z));   // the threaded spigot
    const sgn = Math.sign(F.z) || 1;
    const zA = sgn * (wCase + M(6)), zB = F.z;
    g.add(at(box(M(28), M(58), Math.max(M(10), Math.abs(zB - zA)), MAT.alloyDark()), face + M(12), F.y, (zA + zB) / 2));
    g.add(at(roundBox(M(70), M(80), M(12), M(3), MAT.alloyDark()), face + M(12), F.y, zA));
    g.add(at(rot(hexPrism(M(19), M(10), MAT.plated()), Math.PI / 2, 0, 0), face + M(12), F.y + M(26), zA + sgn * M(10)));
    add('filterbracket', g);
  }

  /* ================================================================== */
  /* Earth straps                                                       */
  /* ================================================================== */
  if (has('grounds')){
    const g = group('grounds');
    const r = e.class === 'bike' ? M(3.5) : M(5);
    /* 1. back of the head up to the bulkhead */
    const [hy, hz] = portAt(0, L.deckH + B * 0.75, inSide(0) * B * 0.62);
    const hA = V3(L.len / 2 + M(6), hy, hz);
    g.add(groundStrap(hA, V3(hA.x + B * 1.1, hA.y + B * 0.30, hz * 1.15), r));
    /* 2. block flank down to the chassis rail */
    const bA = flat ? V3(L.len * 0.18, -L.crankR * 1.30, -B * 0.55)
                    : V3(L.len * 0.18, L.deckH * 0.28, -(wCase + M(2)));
    g.add(groundStrap(bA, V3(bA.x + B * 0.35, -L.crankR * 1.9, bA.z - B * 0.95), r));
    /* 3. rear corner of the block to the body, gearbox end */
    const cA = flat ? V3(L.len / 2 - M(14), -L.crankR * 1.20, B * 0.55)
                    : V3(L.len / 2 - M(14), L.deckH * 0.42, wCase + M(2));
    g.add(groundStrap(cA, V3(cA.x + B * 0.75, cA.y - B * 0.20, cA.z + B * 0.95), r));
    add('grounds', g);
  }

  /* ================================================================== */
  /* Induction                                                          */
  /* ================================================================== */
  /** a moulded airbox: tray, lid, clips and the snorkel mouth facing forward */
  const airboxMesh = (bx, by, bz) => {
    const g = group('airbox');
    g.add(at(roundBox(bx, by * 0.58, bz, M(10), MAT.black()), 0, -by * 0.21, 0));
    g.add(at(roundBox(bx * 1.02, M(6), bz * 1.02, M(3), MAT.plastic()), 0, by * 0.08, 0));   // the seam
    g.add(at(roundBox(bx * 0.97, by * 0.40, bz * 0.97, M(12), MAT.black()), 0, by * 0.30, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(at(box(M(14), M(24), M(6), MAT.steel()), sx * bx * 0.30, by * 0.08, sz * bz * 0.51));
    const mouth = lathe([[M(30), 0], [M(30), B * 0.40], [M(42), B * 0.55], [M(44), B * 0.60]], MAT.black(), 22);
    g.add(at(rot(mouth, 0, 0, Math.PI / 2), -bx * 0.50, -by * 0.18, 0));
    return g;
  };

  if (has('airbox')){
    const g = group('airbox');
    const tbs = ctx.turbos || [];
    if (tbs.length){
      /* Turbo: the filter lives out in the cold air ahead of the compressor(s),
         and a rubber hose runs from it to each compressor inlet stub — the stub
         and its boot are where the main builder stopped (tb.coldIn). One box
         per side of the engine; a pair on that side shares it. */
      const sides = new Map();
      for (const tb of tbs){ const s = Math.sign(tb.pos.z) || 1; if (!sides.has(s)) sides.set(s, []); sides.get(s).push(tb); }
      for (const [s, list] of sides){
        const ends = list.map(tb => {
          const axis = tb.coldIn.clone().sub(tb.pos).normalize();
          return { tb, axis, end: tb.coldIn.clone().addScaledVector(axis, tb.size * 0.38) };
        });
        const bx = B * 1.55, by = B * 0.90, bz = B * 1.00;
        const minX = Math.min(...ends.map(o => o.end.x));
        const maxZ = Math.max(...ends.map(o => Math.abs(o.end.z)));
        const avgY = ends.reduce((a, o) => a + o.end.y, 0) / ends.length;
        /* An F1 unit's rear-centre turbo breathes from the airbox over the
           engine (the roll-hoop intake), so the box sits above the plenum at
           the back; a flat's box sits on top of the engine, over the heads,
           since beside the heads there is nothing to bolt it to. Anything
           else: out ahead of the engine on the compressor's side. */
        const rearCentre = e.turboLayout === 'rearCentre';
        const c = rearCentre ? V3(minX - B * 0.60, avgY + B * 1.55, 0)
                : ctx.flat   ? V3(Math.min(frontX - B * 1.10, minX - B * 1.30), Math.max(avgY + B * 0.25, B * 1.55), s * (maxZ + B * 0.45))
                : V3(Math.min(frontX - B * 1.10, minX - B * 1.30), avgY + B * 0.25, s * (maxZ + B * 0.45));
        g.add(at(airboxMesh(bx, by, bz), c.x, c.y, c.z));
        ends.forEach((o, k) => {
          const out = V3(c.x + bx * 0.50, c.y - by * 0.05, c.z - s * bz * (ends.length > 1 ? (k ? 0.20 : -0.20) : 0));
          const r = o.tb.axialTube * 1.12;
          g.add(at(rot(cyl(r * 1.05, r * 1.05, M(24), MAT.black(), 18), 0, 0, Math.PI / 2), out.x + M(10), out.y, out.z));
          const lead = o.end.clone().addScaledVector(o.axis, o.tb.size * 0.55);
          g.add(pipe([o.end, lead, V3((lead.x + out.x) / 2, Math.max(lead.y, out.y) + B * 0.15, (lead.z + out.z) / 2),
                      V3(out.x + M(20), out.y, out.z)], r, MAT.rubber(), 14));
          const cl = hoseClamp(r * 1.02);
          alignY(cl, o.axis); cl.position.copy(o.end.clone().addScaledVector(o.axis, M(8)));
          g.add(cl);
        });
      }
    } else {
      /* Atmospheric / supercharged: a remote moulded airbox beside the engine
         on the intake side at plenum height, and a rubber duct forward off the
         throttle mouth and across to it — which is where every one of these
         engines (4A-GE, F20C, 2GR, LS3, F136) actually breathes. The 168 mm
         drum that used to hang off the throttle snout stood on the thermostat
         housing and in the fan on a vee. Take the box off and the throttle's
         own element is what is left. */
      const bx = B * 1.55, by = B * 0.90, bz = B * 1.00;
      const side = L.banks >= 2 ? -1 : inSide(0);
      /* outboard of the cam cover and its coils: a vee's cover reaches
         sin(a)·(deckH + 1.6·B) plus most of its own half-width */
      const reach = Math.max(...L.bankAngles.map(a => Math.abs(Math.sin(a)) * (L.deckH + B * 1.60) + Math.abs(Math.cos(a)) * B * 0.80));
      const vee = L.banks >= 2;
      const c = V3(-L.len * 0.30, thrAt.y + (vee ? B * 0.50 : 0), side * (vee ? reach + B * 1.00 : outerZ + B * 1.30));
      g.add(at(airboxMesh(bx, by, bz), c.x, c.y, c.z));
      /* the duct: off the throttle mouth, forward, then across into the box's
         inner face — on a vee it climbs over the cam cover and its coils (and
         the phasers at the head's front) rather than cutting through them */
      const mouth = V3(thrAt.x - M(40), thrAt.y, thrAt.z);
      const out = vee ? V3(c.x, c.y + by * 0.30, c.z - side * bz * 0.5)
                      : V3(c.x - bx * 0.5 + M(30), c.y, c.z - side * bz * 0.5);
      g.add(pipe(vee ? [mouth, V3(mouth.x - B * 0.30, mouth.y + B * 0.10, mouth.z),
                        V3(c.x, thrAt.y + B * 0.95, side * reach * 0.70), out]
                     : [mouth, V3(mouth.x - B * 0.55, mouth.y, mouth.z),
                        V3(out.x - B * 0.45, out.y, out.z + (mouth.z - out.z) * 0.45), out], M(36), MAT.rubber(), 14));
      g.add(at(rot(cyl(M(40), M(40), M(24), MAT.black(), 20), Math.PI / 2, 0, 0), out.x, out.y, out.z - side * M(8)));   // the box's outlet stub
      const cl = hoseClamp(M(37)); alignY(cl, V3(1, 0, 0)); cl.position.copy(mouth).add(V3(-M(8), 0, 0)); g.add(cl);
    }
    add('airbox', g);
  }

  /* the upper chamber over the lower manifold's plenum box: a cast lid that
     overlaps the top of it, with its flange and the bolts round the joint */
  if (has('plenum')){
    const g = group('plenum');
    const h2 = plenH * 0.64, w2 = plenW * 1.08, l2 = L.len * 0.84;
    const yc = inducY + plenH / 2 - h2 / 2 + M(3);
    g.add(at(roundBox(l2, h2, w2, M(10), ctx.FIN?.plenum || MAT.alloy()), 0, yc, plenZ));
    const fy = yc - h2 / 2 + M(3);
    g.add(at(roundBox(l2 * 1.02, M(7), w2 * 1.06, M(2), ctx.FIN?.plenum || MAT.alloy()), 0, fy, plenZ));
    g.add(at(box(l2 * 1.01, M(2), w2 * 1.05, MAT.gasket()), 0, fy - M(4.5), plenZ));
    const nb = 7;
    for (let k = 0; k < nb; k++){
      const x = (k / (nb - 1) - 0.5) * l2 * 0.92, zs = k % 2 ? 1 : -1;
      g.add(at(hexPrism(M(12), M(7), MAT.plated()), x, fy + M(6), plenZ + zs * w2 * 0.51));
    }
    /* the throttle-body flange on the front face */
    g.add(at(rot(tubeMesh(M(48), M(36), M(12), MAT.alloy(), 24), 0, 0, Math.PI / 2), -l2 / 2 - M(4), inducY, plenZ));
    add('plenum', g);
  }

  /* throttle position sensor on the throttle shaft end, idle-air valve on the
     side of the plenum with its air hose back to the throttle inlet */
  const outward = plenZ < 0 ? -1 : (L.banks >= 2 ? -1 : 1);
  if (has('tps')){
    const n = V3(0, 0, outward);
    const m = alignY(sensorMesh('boss', B * 0.30), n);
    m.position.copy(thrAt).add(V3(M(4), 0, outward * (M(38) + M(5))));
    add('tps', m);
  }
  if (has('iscv')){
    const g = group('iscv');
    const face = plenZ + outward * (plenW * (has('plenum') ? 0.54 : 0.50));
    const p = V3(-L.len * 0.18, inducY - plenH * 0.10, face);
    g.add(at(rot(roundBox(M(60), M(52), M(8), M(2), MAT.alloy()), 0, 0, 0), p.x, p.y, p.z + outward * M(4)));
    g.add(at(rot(cyl(M(24), M(24), M(56), MAT.alloyDark(), 20), Math.PI / 2, 0, 0), p.x, p.y, p.z + outward * M(36)));
    g.add(at(rot(cyl(M(18), M(18), M(14), MAT.black(), 16), Math.PI / 2, 0, 0), p.x, p.y, p.z + outward * M(70)));
    g.add(at(connectorShell(M(20), M(16), M(18)), p.x, p.y + M(30), p.z + outward * M(44)));
    /* the bypass air hose to the throttle inlet, and the two coolant hoses
       that keep it from icing */
    g.add(pipe([V3(p.x - M(24), p.y + M(10), p.z + outward * M(20)),
                V3((p.x + thrAt.x) / 2, p.y + B * 0.45, p.z + outward * M(40)),
                V3(thrAt.x - M(40), thrAt.y + M(30), thrAt.z + outward * M(30))], M(8), MAT.rubber(), 10));
    for (const dy of [-M(16), M(16)])
      g.add(pipe([V3(p.x + M(26), p.y + dy, p.z + outward * M(30)),
                  V3(p.x + B * 0.6, p.y + dy - B * 0.30, p.z + outward * M(50)),
                  V3(p.x + B * 0.9, p.y + dy - B * 0.80, p.z + outward * M(40))], M(5), MAT.rubber(), 8));
    add('iscv', g);
  }

  /* ================================================================== */
  /* Carburettor, its dress, and the fuel line up from the pump         */
  /* ================================================================== */
  if (has('carb')){
    const top = inducY + plenH / 2;
    const cz = plenZ;
    const g = group('carb');
    g.add(at(box(B * 1.32, M(5), B * 1.32, MAT.gasket()), 0, top + M(2.5), cz));          // base gasket
    const yB = top + M(5);
    g.add(at(roundBox(B * 1.25, B * 0.24, B * 1.25, M(4), MAT.alloy()), 0, yB + B * 0.12, cz));   // throttle-plate base
    const yM = yB + B * 0.24;
    g.add(at(roundBox(B * 1.02, B * 0.52, B * 1.10, M(6), MAT.alloy()), 0, yM + B * 0.26, cz));   // main body
    for (const sx of [-1, 1])                                                          // float bowls, front and rear
      g.add(at(roundBox(B * 0.34, B * 0.58, B * 1.14, M(8), MAT.alloy()), sx * B * 0.68, yM + B * 0.27, cz));
    /* the air horn and its choke flap housing on top */
    const yH = yM + B * 0.52;
    g.add(at(roundBox(B * 1.00, M(8), B * 1.00, M(3), MAT.alloy()), 0, yH + M(4), cz));
    g.add(at(tubeMesh(B * 0.50, B * 0.44, B * 0.20, MAT.alloy(), 30), 0, yH + M(8) + B * 0.10, cz));
    /* the fuel inlet fitting on the front bowl */
    const inlet = V3(-B * 0.88, yM + B * 0.40, cz + B * 0.36);
    g.add(at(rot(hexPrism(M(16), M(14), MAT.brass()), 0, 0, Math.PI / 2), inlet.x, inlet.y, inlet.z));
    /* the four studs and nuts on the base */
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(at(hexPrism(M(13), M(8), MAT.plated()), sx * B * 0.56, yB + B * 0.26, cz + sz * B * 0.56));
    add('carb', g);

    const airTop = yH + M(8) + B * 0.20;
    if (has('choke')){
      const ch = group('choke');
      const pc = V3(B * 0.10, yH + B * 0.10, cz + B * 0.56);
      ch.add(at(rot(cyl(B * 0.20, B * 0.20, B * 0.14, MAT.black(), 22), Math.PI / 2, 0, 0), pc.x, pc.y, pc.z + B * 0.07));
      ch.add(at(rot(cyl(B * 0.14, B * 0.14, B * 0.06, MAT.brass(), 18), Math.PI / 2, 0, 0), pc.x, pc.y, pc.z + B * 0.17));
      ch.add(rod(V3(pc.x, pc.y, pc.z), V3(pc.x - B * 0.40, yM + B * 0.10, cz + B * 0.62), M(1.8), MAT.steel(), 6));
      ch.add(at(box(B * 0.16, B * 0.20, M(4), MAT.steel()), pc.x - B * 0.42, yM + B * 0.10, cz + B * 0.62));  // fast-idle cam
      ch.add(at(rot(cyl(B * 0.40, B * 0.40, M(2), MAT.plated(), 24), 0, 0, 0), 0, airTop - M(30), cz));       // the flap itself
      add('choke', ch);
    }
    if (has('carblinkage')){
      const lk = group('carblinkage');
      const zs = cz - B * 0.70;
      const lever = V3(B * 0.20, yB + B * 0.14, zs);
      lk.add(at(box(B * 0.42, B * 0.10, M(4), MAT.steel()), lever.x, lever.y, lever.z));
      lk.add(at(rot(cyl(M(9), M(9), M(14), MAT.steel(), 12), Math.PI / 2, 0, 0), B * 0.02, yB + B * 0.14, zs + M(8)));
      /* the bracket the springs and cables anchor to, on the manifold */
      const brk = V3(B * 1.15, yB + B * 0.05, zs - M(6));
      lk.add(at(box(M(5), B * 0.70, B * 0.40, MAT.steel()), brk.x, brk.y + B * 0.20, brk.z));
      /* two independent return springs */
      for (const dz of [-M(8), M(8)]){
        const a = V3(lever.x + B * 0.18, lever.y, lever.z + dz), b = V3(brk.x, brk.y + B * 0.30, brk.z + dz);
        const d = b.clone().sub(a);
        const coils = 12, pts = [];
        for (let k = 0; k <= coils * 8; k++){
          const t = k / (coils * 8), ang = t * coils * TAU;
          pts.push(a.clone().addScaledVector(d, t).add(V3(0, Math.cos(ang) * M(4), Math.sin(ang) * M(4))));
        }
        lk.add(pipe(pts, M(0.9), MAT.steel(), 4));
      }
      /* throttle cable and the kickdown cable, back off the bracket */
      lk.add(pipe([V3(brk.x, brk.y + B * 0.45, brk.z), V3(brk.x + B * 0.9, brk.y + B * 0.30, brk.z - B * 0.20),
                   V3(brk.x + B * 1.8, brk.y + B * 0.50, brk.z - B * 0.50)], M(3), MAT.black(), 6));
      lk.add(pipe([V3(brk.x, brk.y - B * 0.05, brk.z), V3(brk.x + B * 0.7, brk.y - B * 0.30, brk.z - B * 0.10),
                   V3(brk.x + B * 1.4, brk.y - B * 0.80, brk.z - B * 0.20)], M(3), MAT.black(), 6));
      add('carblinkage', lk);
    }
    if (has('aircleaner')){
      const ac = group('aircleaner');
      const R = B * 1.70, y0 = airTop + M(2);
      ac.add(at(lathe([[B * 0.50, 0], [R, M(3)], [R * 1.01, M(26)], [R * 0.98, M(30)]], MAT.black(), 48), 0, y0, cz));
      ac.add(at(tubeMesh(R * 0.95, R * 0.72, B * 0.52, MAT.airFilter(), 48), 0, y0 + M(26) + B * 0.26, cz));
      ac.add(at(lathe([[0, 0], [R * 1.00, 0], [R * 1.02, -M(12)], [R * 0.98, -M(14)]], MAT.black(), 48),
                0, y0 + M(28) + B * 0.52 + M(6), cz));
      ac.add(at(cyl(M(4), M(4), B * 0.80, MAT.steel(), 8), 0, y0 + B * 0.40, cz));               // the stud
      const wn = group('wingnut');
      wn.add(cyl(M(9), M(11), M(14), MAT.plated(), 12));
      for (const s of [-1, 1]) wn.add(at(box(M(16), M(16), M(3), MAT.plated()), s * M(14), M(4), 0));
      ac.add(at(wn, 0, y0 + M(34) + B * 0.52 + M(8), cz));
      /* the snorkel, forward to the cold air */
      ac.add(at(rot(roundBox(B * 1.10, B * 0.42, B * 0.62, M(6), MAT.black()), 0, 0, 0), -R - B * 0.45, y0 + M(20) + B * 0.20, cz));
      add('aircleaner', ac);
    }
    /* the steel line from the mechanical pump at the front of the block up
       the front of the head to the carburettor inlet */
    if (has('fuelpump')){
      const pump = V3(-L.len * 0.30, L.crankR * 0.6, B * 1.16);
      add('fuelpump', pipe([V3(pump.x - M(20), pump.y + M(25), pump.z),
                            V3(frontX + M(30), L.deckH * 0.45, B * 1.05),
                            V3(frontX + M(20), L.deckH * 0.95, B * 0.75),
                            V3(-B * 1.40, inlet.y + B * 0.30, inlet.z + B * 0.10),
                            V3(inlet.x - M(10), inlet.y, inlet.z)], M(4), MAT.steel(), 8));
    }
  }

  /* ================================================================== */
  /* Injector seals                                                     */
  /* ================================================================== */
  const injLine = (i) => {
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [ry, rz] = railAt(b);
    const [py, pz] = portAt(b, L.deckH + B * 0.44, inSide(b) * B * 0.62);
    const A = V3(p.x, ry, rz), C = V3(p.x, py, pz);
    return { A, C, dir: C.clone().sub(A).normalize(), len: C.distanceTo(A) };
  };
  if (has('injseals') && has('injectors')){
    const di = e.injection === 'direct';
    for (let i = 0; i < e.cyl; i++){
      const { A, dir, len } = injLine(i);
      const g = group('injseal');
      const ringAt = (t, r, mat) => {
        const o = torus(r, M(2.0), mat, 18);
        o.quaternion.setFromUnitVectors(V3(0, 0, 1), dir);
        o.position.copy(A).addScaledVector(dir, t);
        return o;
      };
      g.add(ringAt(M(17), M(10.5), MAT.rubber()));                     // the rail-cup O-ring
      const tip = Math.max(M(30), len - M(26));
      g.add(ringAt(tip, M(10), di ? MAT.plastic() : MAT.rubber()));    // nozzle O-ring / PTFE tip seal
      const ins = tubeMesh(M(13.5), M(9.4), M(4), di ? MAT.steel() : MAT.gasket(), 18);
      alignY(ins, dir); ins.position.copy(A).addScaledVector(dir, tip + M(6));
      g.add(ins);
      each('injseals', i, g);
    }
    flush('injseals');
  }
  /* ================================================================== */
  /* Exhaust manifold studs and nuts, two per port                      */
  /* ================================================================== */
  if (has('manifoldstuds')){
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const side = L.banks >= 2 ? exSide(b) : 1;
      const [ny, nz] = portAt(b, 0, side);
      const n = V3(0, ny, nz);
      const g = group('studpair');
      for (const off of [-0.31, 0.31]){
        const [fy, fz] = portAt(b, L.deckH + B * (0.34 + off), side * B * 0.78);
        const f = V3(p.x, fy, fz);
        g.add(rod(f.clone().addScaledVector(n, -M(6)), f.clone().addScaledVector(n, M(30)), M(4), MAT.steel(), 8));
        const nut = alignY(hexPrism(M(13), M(8), MAT.copper()), n);
        nut.position.copy(f).addScaledVector(n, M(18));
        g.add(nut);
        const wsh = alignY(cyl(M(9), M(9), M(1.6), MAT.steel(), 14), n);
        wsh.position.copy(f).addScaledVector(n, M(13.2));
        g.add(wsh);
      }
      each('manifoldstuds', i, g);
    }
    flush('manifoldstuds');
  }
}

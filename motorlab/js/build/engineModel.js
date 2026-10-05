/* MotorLab — procedural 3D engine builder.
 * Reads an engine spec and constructs the whole assembly in metres, tagging
 * every mesh with its part id so the viewport can pick, hide, ghost, explode
 * and animate it. Nothing here is a downloaded model — it is all derived from
 * bore, stroke, cylinder count and layout.
 */
import * as THREE from 'three';
import { INSTANCED, baseId } from '../data/parts.js';
import { buildExtraParts } from './extra/index.js';
import { MAT, box, roundBox, cyl, tubeMesh, sphere, torus, pipe, bolt, group, tag, at, rot,
         boundsOf, slider, epitrochoid, deg, TAU,
         lathe, pistonMesh, rodMesh, counterweight, camLobe, lobeLift, valveMesh, springMesh,
         volute, bladedWheel, flameMesh, puffMesh, imbalance,
         turboUnit, coreMesh, alternatorMesh, starterMesh, filterElement,
         sparkPlug, coilPack, camCoverMesh, oilPanMesh, crankDamper, flywheelMesh,
         clutchMesh, waterPumpMesh, velocityStack, portFlange, hexPrism,
         superchargerMesh, oilFilterMesh, serpentineBelt,
         connectorShell, sensorMesh, loomMesh, hoseClamp, braidedLine, dipstickMesh,
         fillerCap, thermostatMesh, groundStrap, canBody, heatShield, pcvValve,
         engineMount } from '../lib/geo.js';
import { firingOrder } from '../data/engines.js';
import { partMesh } from '../lib/partModels.js';
import { modelFor, fitToLength } from '../lib/importModel.js';

const M = (mm) => mm / 1000;   // spec is in millimetres, scene is in metres

export function buildEngine(e, tree){
  return e.kind === 'rotary' ? buildRotary(e, tree) : buildPiston(e, tree);
}

/* ====================================================================== */
/* geometry layout helpers                                                 */
/* ====================================================================== */
function layout(e){
  const bore = M(e.bore), stroke = M(e.stroke);
  /* A W is two narrow-angle vees sharing a crank. Drawing it as four separate
     banks left the outer two without heads — cylinders poking through open
     arches with their valve gear floating alongside. Drawn as one wide vee
     with the bores interleaved VR-style (tighter pitch, eight a side), it has
     the two broad cam covers and the stumpy block the real engine is famous
     for, and every part generator that knows how to dress a vee just works. */
  const pitch = bore * 1.32 * (e.layout === 'W' ? 0.62 : 1);  // bore spacing
  const banks = (e.layout === 'V' || e.layout === 'F' || e.layout === 'W') ? 2 : 1;
  const perBank = Math.ceil(e.cyl / banks);
  const half = deg(e.bankAngle) / 2;
  const bankAngles = e.layout === 'I' ? [0]
    : e.layout === 'F' ? [deg(90), deg(-90)]
    : [ -half, half ];
  const rodLen = stroke * 1.75;
  const crankR = stroke / 2;
  const deckH  = crankR + rodLen + bore * 0.55;               // crank axis -> deck
  const len = perBank * pitch + pitch * 0.55;
  return { bore, stroke, pitch, banks, perBank, bankAngles, rodLen, crankR, deckH, len };
}

/** Which bank a cylinder sits in, and its index along that bank. */
function cylSlot(e, i, L){
  if (L.banks === 1) return { bank:0, idx:i };
  return { bank: i % 2, idx: Math.floor(i / 2) };
}

/** Crank angle at which each cylinder fires, over the full cycle (0…720°). */
function fireAngles(e){
  const fo = firingOrder(e);
  const per = (360 * e.revsPerCycle) / e.cyl;
  const out = new Array(e.cyl).fill(0);
  fo.forEach((cylNo, k) => { out[cylNo - 1] = deg(k * per); });
  return out;
}
/** The same angles reduced to one crank revolution — where the rod journal sits. */
function pinAngles(e){ return fireAngles(e).map(a => a % TAU); }

/** Valve event centres and duration, in crank degrees of the 720° cycle. */
function camTiming(e){
  const duration = deg(e.class === 'race' ? 285 : e.camProfile === 'aggressive' ? 255 : 228);
  /* boosted engines run a wider lobe separation, so less overlap around TDC */
  const spread = e.aspiration === 'na' ? 0 : deg(9);
  return { duration, intake: deg(450) + spread, exhaust: deg(270) - spread };
}

function cylPosition(e, i, L){
  const { bank, idx } = cylSlot(e, i, L);
  const x = (idx - (L.perBank - 1) / 2) * L.pitch;
  return { x, angle: L.bankAngles[bank] ?? 0, bank };
}

/* ====================================================================== */
/* piston engines                                                          */
/* ====================================================================== */
/* The maker's signature finish from engines.js: what colour and texture the
   cam cover, the block and the plenum actually are on the real engine. */
export function finishMaterials(e){
  const f = e.finish || {};
  const hex = (t) => t ? parseInt(String(t).replace('#', ''), 16) : null;
  const c = f.cover || '', b = f.block || 'alu', pl = f.plenum || '';
  const ch = hex(f.coverHex);
  let cover;
  if (c === 'red' || c === 'black-red') cover = MAT.gloss(ch ?? 0xb0161a);
  else if (c === 'crackle-red' || c === 'wrinkle-red') cover = MAT.wrinkle(ch ?? 0xa51c17);
  else if (c === 'wrinkle-black' || c === 'satin-black' || c === 'magnesium-black') cover = MAT.wrinkle(0x1a1c20);
  else if (c === 'wrinkle-silver') cover = MAT.wrinkle(0x9ea3a9);
  else if (c === 'crinkle-grey' || c === 'wrinkle-grey' || c === 'textured-dark-grey') cover = MAT.wrinkle(0x5a5e64);
  else if (c === 'plastic-black') cover = MAT.composite();
  else if (c === 'black' || c === 'black-grey' || c === 'black-carbon' || c === 'black-billet') cover = MAT.satin(0x1d2025);
  else if (c === 'chrome') cover = MAT.chrome();
  else if (c === 'carbon' || c === 'carbon-silver') cover = MAT.carbon();
  else if (c === 'billet-alu') cover = MAT.steel();
  else if (c === 'silver' || c === 'natural-alu' || c === 'silver-cast' || c === 'finned-alu' || c === 'silver-housings') cover = MAT.alloy();
  else if (c === 'beige') cover = MAT.gloss(ch ?? 0xcdbb97);
  else cover = MAT.alloyDark();
  let block;
  const bh = hex(f.blockHex);
  if (b === 'iron-orange') block = MAT.gloss(bh ?? 0xd9531e);
  else if (b === 'iron-painted') block = MAT.satin(bh ?? 0x2a2d31);
  else if (b.startsWith('iron')) block = MAT.iron();
  else if (b === 'billet-alu') block = MAT.steel();
  else block = MAT.cast();
  let plenum = null;
  if (pl.startsWith('composite') || pl === 'black' || pl === 'airbox' || pl === 'blower-black' || pl === 'bean-can-tb') plenum = MAT.composite();
  else if (pl === 'carbon') plenum = MAT.carbon();
  else if (pl === 'red') plenum = MAT.gloss(ch ?? 0xb0161a);
  else if (pl === 'iron') plenum = MAT.iron();
  else if (pl === 'iron-orange') plenum = MAT.gloss(bh ?? 0xd9531e);
  else if (pl === 'chrome-air-cleaner') plenum = MAT.chrome();
  else if (pl === 'magnesium-hat') plenum = MAT.alloyDark();
  else if (pl === 'alu-cast' || pl === 'alu' || pl === 'trumpets' || pl === 'slide-polished-trumpets') plenum = MAT.alloy();
  const heads = f.heads === 'alu-bare' ? MAT.alloy() : null;
  /* fastener finish by region: gold zinc-chromate on 1990s Japan, black oxide
     on German engines, bright zinc on everything else */
  const jp = /toyota|nissan|mazda|honda|subaru|mitsubishi|suzuki|kawasaki|yamaha/i.test(e.maker || '');
  const de = /bmw|mercedes|porsche|audi|volkswagen|vw/i.test(e.maker || '');
  const hardware = f.hardware === 'zincYellow' || (f.hardware == null && jp && (e.year || 2000) < 2005) ? MAT.zincYellow()
                 : f.hardware === 'gold-anodised' ? MAT.brass()
                 : de ? MAT.black() : MAT.plated();
  return { cover, block, plenum, heads, hardware, letters: f.letters || 'none', lettersHex: hex(f.lettersHex) };
}

function buildPiston(e, tree){
  const L = layout(e);
  const FIN = finishMaterials(e);
  const root = group('engine');
  const nodes = new Map();
  const add = (id, obj) => {
    if (!obj) return;
    /* a part this engine's tree does not list is not drawn: the tree decides
       what the engine is made of, and geometry nobody can take off is a lie */
    if (!tree.byId[id]){ (root.userData.orphans ||= []).push(id); return; }
    tag(obj, id);
    root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []);
    nodes.get(id).push(obj);
  };
  /* piece n of a quantity part: its own part `<id>.<n>` when the tree lists
     the id as instanced, otherwise folded into one part under `id` */
  const bucket = new Map();
  const each = (id, i, obj) => {
    if (!obj) return;
    if (!(has(id) || has(`${id}.1`))) return;        // this engine has no such part
    if (INSTANCED.has(id)) add(`${id}.${i + 1}`, obj);
    else { if (!bucket.has(id)) bucket.set(id, group(id)); bucket.get(id).add(obj); }
  };
  const flush = (id) => { if (bucket.has(id)){ add(id, bucket.get(id)); bucket.delete(id); } };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const has = (id) => !!(tree.byId[id] || tree.byId[`${id}.1`]);
  const qtyOf = (id) => tree.byId[id]?.qty || Object.keys(tree.byId).filter(k => k.startsWith(id + '.')).length;
  const airCooled = (e.coolant || '').startsWith('air');
  const ohv = e.cam === 'OHV';
  /* a boxer: the banks lie flat, so "up the bank" is sideways and anything
     placed in world Y from deckH lands inside the crankcase */
  const flat = L.banks >= 2 && Math.abs(Math.abs(L.bankAngles[0] || 0) - Math.PI / 2) < 0.2;
  const nitro = e.fuel === 'nitro';
  const pins = pinAngles(e);
  const fires = fireAngles(e);
  const CAM = camTiming(e);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* Inlet on top, exhaust out the side: the inlet ports are cut into the
     valley face of each head and the exhaust into the outer face, so the
     manifold sits over the engine and the headers, the collectors and the
     turbochargers all hang off its flanks where you can reach them. */
  const bankSign = (b) => (L.bankAngles[b] || 0) >= 0 ? 1 : -1;
  const exSide = (b) => bankSign(b);
  const inSide = (b) => -bankSign(b);
  /* A port lives on the head, so its position has to be rotated with the bank
     it is cut into. Placing it in the untilted frame is what left the headers
     starting in mid-air inside the vee instead of on the outside of the head. */
  const portAt = (b, y, z) => {
    const a = L.bankAngles[b] || 0;
    return [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  };

  /* ---- block ----
   * One casting, not a slab per bank. A block's cross-section is the shape
   * that makes an engine recognisable from the end: crankcase skirts down
   * either side of the crank, walls rising and spreading out to the decks,
   * and — on a vee — the valley between the two banks. Two floating slabs
   * with a gap down to the crank is what made this read as parts in mid-air.
   */
  const blockG = group('block');
  const yCase = -L.crankR * 1.30;                       // pan rail
  const wCase = L.bore * 0.92;
  /* How far out the engine actually reaches. A vee's heads are flung sideways
     by the bank angle and a W's outer banks further still, so bolting an
     accessory at a fixed fraction of the bore buried it in the casting on
     everything except an inline four. Anything that lives outside the engine
     is placed against this. */
  const outerZ = Math.max(wCase,
    ...L.bankAngles.map(a => Math.abs(Math.sin(a)) * L.deckH + L.bore * 0.62));
  /* The bores run across the extrusion direction, so they cannot be cut out of
     the block profile. Instead the cylinder case is its own piece, extruded
     along the bank axis with a hole per bore straight through it, and the
     profile below stops where that case begins. That is what lets you look
     down a bore and see the liner rather than a flat lid. */
  const caseBot = L.banks >= 2 ? L.crankR * 1.55 : L.crankR * 1.30;
  const prof = [];
  if (L.banks >= 2){
    const half = L.bore * 0.775;
    const deck = (a, h) => {
      const c = [Math.sin(a) * h, Math.cos(a) * h];                  // [z, y]
      const t = [Math.cos(a) * half, -Math.sin(a) * half];
      return { outer:[c[0] + t[0], c[1] + t[1]], inner:[c[0] - t[0], c[1] - t[1]] };
    };
    const dR = deck(Math.abs(L.bankAngles[0] || Math.PI / 4), caseBot);
    const yValley = caseBot * 0.62;
    prof.push([-wCase, yCase], [-wCase, L.crankR * 0.55],
              [-dR.outer[0], dR.outer[1]], [-dR.inner[0], dR.inner[1]],
              [-dR.inner[0] * 0.86, yValley], [dR.inner[0] * 0.86, yValley],
              [dR.inner[0], dR.inner[1]], [dR.outer[0], dR.outer[1]],
              [wCase, L.crankR * 0.55], [wCase, yCase]);
  } else {
    /* An inline block is not a monolith: the pan rail is wider than the
       cylinder case above it, and the step between them is most of what you
       recognise. A single full-width slab swallowed the head. */
    const half = L.bore * 0.66;
    prof.push([-wCase, yCase], [-wCase, L.crankR * 0.72],
              [-half * 1.10, L.crankR * 0.86], [-half, L.crankR * 1.20],
              [-half, caseBot], [half, caseBot],
              [half, L.crankR * 1.20], [half * 1.10, L.crankR * 0.86],
              [wCase, L.crankR * 0.72], [wCase, yCase]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(prof[0][0], prof[0][1]);
  for (let i = 1; i < prof.length; i++) shape.lineTo(prof[i][0], prof[i][1]);
  shape.closePath();
  const bgeo = new THREE.ExtrudeGeometry(shape, { depth:L.len, bevelEnabled:true,
    bevelThickness:M(4), bevelSize:M(4), bevelSegments:1, curveSegments:1 });
  bgeo.rotateY(Math.PI / 2);                 // extruded along Z; the block runs on X
  bgeo.translate(-L.len / 2, 0, 0);
  blockG.add(new THREE.Mesh(bgeo, FIN.block));

  /* the cylinder walls, which show once the block is cut away */
  for (const bank of L.bankAngles.keys()){
    const a = L.bankAngles[bank];
    const bg = group('bank');
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if (s.bank !== bank) continue;
      const p = cylPosition(e, i, L);
      /* A liner runs from just clear of the crank throw all the way up to the
         deck face — it has to, because the deck's bore opening IS the top of
         the liner. Stopping it short left you looking at solid casting through
         the bore. */
      const lTop = L.deckH, lBot = L.crankR * 0.85;
      const liner = tubeMesh(L.bore/2 * 1.06, L.bore/2, lTop - lBot, MAT.iron(), 22);
      liner.position.set(p.x, (lTop + lBot) / 2, 0);
      bg.add(liner);
      if (airCooled) for (let f = 0; f < 7; f++){
        const fin = tubeMesh(L.bore/2*1.5, L.bore/2*1.1, M(3), MAT.alloyDark(), 20);
        fin.position.set(p.x, L.crankR*0.95 + L.stroke*0.45 + f * M(11), 0);
        bg.add(fin);
      }
    }
    bg.rotation.x = a;
    blockG.add(bg);
  }
  /* The deck: the face the head bolts to, with a hole through it for every
     bore. It is the one surface of a block everybody recognises, and it is the
     reason a block photographs as a block and not as a box. */
  for (let bank = 0; bank < L.bankAngles.length; bank++){
    const dShape = new THREE.Shape();
    const halfD = L.bore * (L.banks >= 2 ? 0.80 : 0.72), halfL = L.len / 2;
    dShape.moveTo(-halfL, -halfD); dShape.lineTo(halfL, -halfD);
    dShape.lineTo(halfL, halfD);   dShape.lineTo(-halfL, halfD); dShape.closePath();
    let bores = 0;
    for (let i = 0; i < e.cyl; i++){
      if (cylSlot(e, i, L).bank !== bank) continue;
      const h = new THREE.Path();
      h.absarc(cylPosition(e, i, L).x, 0, L.bore * 0.535, 0, TAU, true);
      dShape.holes.push(h); bores++;
      /* the head-bolt holes and coolant transfer passages around each bore */
      for (let k = 0; k < 6; k++){
        const t = (k / 6) * TAU + 0.5;
        const j = new THREE.Path();
        j.absarc(cylPosition(e, i, L).x + Math.cos(t) * L.bore * 0.60,
                 Math.sin(t) * L.bore * 0.60, L.bore * 0.035, 0, TAU, true);
        dShape.holes.push(j);
      }
    }
    if (!bores) continue;
    const dg = new THREE.ExtrudeGeometry(dShape, { depth:L.deckH - caseBot,
                                                  bevelEnabled:false, curveSegments:16 });
    dg.rotateX(-Math.PI / 2);                    // shape lies flat, thickness up
    const dm = new THREE.Mesh(dg, FIN.block);
    const dGrp = group('deck');
    dm.position.y = caseBot;
    dGrp.add(dm);
    dGrp.rotation.x = L.bankAngles[bank] ?? 0;
    blockG.add(dGrp);
  }

  /* Core plugs — the "freeze plugs" — are pressed into the sand-core holes left
     in the water jacket. They are the first thing you look for on a block that
     has been left out in the cold, and they are on the side of every one. */
  if (!airCooled && has('coreplugs')){
    const nCore = qtyOf('coreplugs');
    const sides = 2;
    const perSide = Math.ceil(nCore / sides);
    for (let k = 0; k < nCore; k++){
      const sideIdx = k % sides, slot = Math.floor(k / sides);
      const cx = perSide > 1 ? (slot - (perSide - 1) / 2) * (L.len * 0.78 / (perSide - 1)) : 0;
      const cp = cyl(L.bore * 0.22, L.bore * 0.22, M(6), MAT.plated(), 18);
      rot(cp, Math.PI / 2, 0, 0);
      /* in the water jacket beside the bores — on a vee that is up the outer
         face of each bank, on an inline it is the block's two flanks */
      if (L.banks >= 2){
        const b = sideIdx;
        const [py, pz] = portAt(b, L.deckH * 0.55, exSide(b) * L.bore * 0.80);
        cp.rotation.x += (L.bankAngles[b] ?? 0);
        each('coreplugs', k, at(cp, cx, py, pz));
      } else {
        each('coreplugs', k, at(cp, cx, L.deckH - L.crankR * 1.3, (sideIdx ? 1 : -1) * (wCase - M(3))));
      }
    }
  }
  /* casting ribs down the sides of the crankcase */
  for (let i = 0; i <= L.perBank; i++){
    const rx = (i - L.perBank / 2) * L.pitch;
    for (const zs of [-1, 1])
      blockG.add(at(box(M(9), L.crankR * 0.70, M(10), FIN.block),
                    rx, yCase + L.crankR * 0.45, zs * (wCase + M(3))));
  }
  /* the bellhousing flange at the back, where the gearbox bolts on */
  const bh = tubeMesh(L.bore * 1.90, L.bore * 1.62, M(16), MAT.machined(), 30);
  rot(bh, 0, 0, Math.PI / 2);
  /* a bike has no bellhousing: its gearbox lives inside the same cases */
  if (e.class !== 'bike') blockG.add(at(bh, L.len / 2 + M(8), 0, 0));
  for (let k = 0; k < 8 && e.class !== 'bike'; k++){
    const t = (k / 8) * TAU;
    blockG.add(at(rot(bolt(M(8), M(20), MAT.steel()), 0, 0, -Math.PI / 2),
                  L.len / 2 + M(16), Math.sin(t) * L.bore * 1.76, Math.cos(t) * L.bore * 1.76));
  }

  /* the sump rail and main-bearing bulkheads below the crank */
  const cc = roundBox(L.len, L.crankR * 0.5, wCase * 2.0, 0.02, FIN.block);
  cc.position.y = yCase + L.crankR * 0.22;
  blockG.add(cc);
  add('block', blockG);

  /* ---- main bearings + caps ---- */
  const nMains = L.banks >= 2 ? e.cyl / 2 + 1 : e.cyl + 1;
  for (let i = 0; i < nMains; i++){
    const x = (i - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    /* two half-shells per main: the upper sits in the block saddle, the lower
       in the cap — a tri-metal shell is exactly this, a thin steel-backed arc */
    for (const [k, start] of [[0, 0], [1, Math.PI]]){
      const shellMat = MAT.bearing(); shellMat.side = THREE.DoubleSide;
      const half = new THREE.Mesh(
        new THREE.CylinderGeometry(L.crankR * 0.60, L.crankR * 0.60, M(16), 18, 1, true, start, Math.PI), shellMat);
      rot(half, 0, 0, Math.PI / 2);
      at(half, x, 0, 0);
      each('mainbearings', i * 2 + k, half);
    }
    const cg = group('cap');
    const cap = roundBox(M(38), L.crankR * 0.9, L.bore * 0.95, 0.01, MAT.alloyDark());
    at(cap, x, -L.crankR * 0.62, 0); cg.add(cap);
    for (const sgn of [-1, 1]){
      const b = bolt(M(5), M(34), MAT.steel());
      at(b, x, -L.crankR * 1.05, sgn * L.bore * 0.36); cg.add(b);
    }
    each('maincaps', i, cg);
  }
  flush('mainbearings'); flush('maincaps');
  if (has('thrust')){
    /* two half-moon washers either side of the centre main take the crank's
       end float — the load the clutch pedal puts through the release bearing */
    const ci = Math.floor(nMains / 2);
    const cx = (ci - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    for (const [k, sgn] of [-1, 1].entries()){
      const wm = MAT.bearing(); wm.side = THREE.DoubleSide;
      const w = new THREE.Mesh(new THREE.RingGeometry(L.crankR * 0.62, L.crankR * 0.82, 20, 1, 0, Math.PI), wm);
      w.rotation.y = Math.PI / 2;
      each('thrust', k, at(w, cx + sgn * M(9.5), 0, 0));
    }
    flush('thrust');
  }
  if (has('oilsquirters')) for (let i = 0; i < e.cyl; i++){
    /* a jet in the bottom of each bore, on the intake side of the main
       gallery, aimed up at the underside of the piston crown */
    const p = cylPosition(e, i, L), b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [jy, jz] = portAt(b, L.deckH * 0.30, inSide(b) * L.bore * 0.50);
    const jg = group('jet');
    jg.add(cyl(M(7), M(7), M(22), MAT.steel(), 10));
    const noz = cyl(M(2.5), M(2.5), M(28), MAT.steel(), 8);
    rot(noz, 0, 0, inSide(b) * 0.55); noz.position.set(0, M(20), 0); jg.add(noz);
    each('oilsquirters', i, at(jg, p.x, jy, jz));
  }
  flush('oilsquirters');

  /* ---- crankshaft: main journals, rod throws, counterweights ---- */
  const crankG = group('crank');
  const jR = L.crankR * 0.52, pinR = L.crankR * 0.44;
  for (let i = 0; i < nMains; i++){
    const x = (i - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    const j = cyl(jR, jR, M(26), MAT.steel(), 20);
    rot(j, 0, 0, Math.PI/2); j.position.x = x; crankG.add(j);
  }
  crankG.add(rot(cyl(jR * 0.62, jR * 0.62, L.len * 0.99, MAT.steel(), 14), 0, 0, Math.PI/2));
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const throwG = group('throw');
    const pin = cyl(pinR, pinR, L.pitch * 0.46, MAT.steel(), 18);
    rot(pin, 0, 0, Math.PI/2); pin.position.set(p.x, L.crankR, 0);
    throwG.add(pin);
    for (const side of [-1, 1]){
      /* only the journals and pins are ground: the webs stay as-forged, dark */
      const web = box(M(15), L.crankR * 1.5, L.crankR * 1.15, MAT.forged());
      web.position.set(p.x + side * L.pitch * 0.28, L.crankR * 0.45, 0);
      throwG.add(web);
      const cw = counterweight(L.crankR * 1.62, M(17), MAT.forged());
      cw.rotation.x = Math.PI;                       // opposite the pin
      cw.position.set(p.x + side * L.pitch * 0.30, 0, 0);
      throwG.add(cw);
    }
    throwG.rotation.x = pins[i];
    crankG.add(throwG);
  }
  const snout = cyl(L.crankR * 0.36, L.crankR * 0.36, M(70), MAT.steel(), 16);
  rot(snout, 0, 0, Math.PI/2); snout.position.x = -L.len/2 - M(30); crankG.add(snout);
  anim.crank = crankG;
  add('crank', crankG);

  /* ---- pistons + rods ---- */
  const pistG = group('pistons'), rodG = group('rods');
  const pinBoreR = L.bore * 0.105;
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const pg = group('p' + i);
    pg.add(pistonMesh(L.bore, MAT.alloy(), { dish: e.injection === 'direct' ? 0.12 : e.cr > 11 ? 0.02 : 0.07 }));
    /* the rings and the wrist pin are their own parts when the tree lists
       them (bottom-end module); otherwise they ride on the piston */
    if (!has('rings')) for (let r = 0; r < 3; r++){
      const ring = torus(L.bore/2 * 0.995, M(1.7), r === 2 ? MAT.iron() : MAT.steel(), 26);
      rot(ring, Math.PI/2, 0, 0);
      ring.position.y = L.bore * (0.146 - r * 0.062);
      pg.add(ring);
    }
    if (!has('pins')){
      const wrist = cyl(pinBoreR, pinBoreR, L.bore * 0.66, MAT.steel(), 14);
      rot(wrist, 0, 0, Math.PI/2); wrist.position.y = -L.bore * 0.045; pg.add(wrist);
    }
    pg.userData.cylIndex = i;
    each('pistons', i, pg);

    const rg = group('r' + i);
    /* a forged rod is dark and scaly along the beam; only the bores are machined */
    rg.add(rodMesh(L.rodLen, L.crankR * 0.66, pinBoreR, e.rods === 'aluminium' ? MAT.alloy() : e.class === 'race' ? MAT.steel() : MAT.forged()));
    each('rods', i, rg);

    anim.pistons.push({ node:pg, i, x:p.x, angle:p.angle, fire:fires[i] });
    anim.rods.push({ node:rg, i, x:p.x, angle:p.angle, fire:fires[i] });

    /* combustion flash, drawn through the casting so the firing order is visible */
    const flame = flameMesh(L.bore * 0.42);
    flame.material.depthTest = false;
    flame.position.set(p.x, L.deckH - L.bore * 0.10, 0);
    const fh = group('flame'); fh.add(flame); fh.rotation.x = p.angle;
    root.add(fh);
    anim.flames.push({ node:flame, mat:flame.material, fire:fires[i] });
  }
  flush('pistons'); flush('rods');

  /* ---- head gasket + heads ---- */
  const hgG = group('hg'), headG = group('heads'), vcG = group('vc');
  const camG = group('cams'), capG = group('camcaps'), valG = group('valves');
  const plugG = group('plugs'), coilG = group('coils'), injG = group('inj'), railG = group('rail');
  const nBanksHead = L.banks === 4 ? 2 : L.banks;
  let capIdx = 0;
  for (let b = 0; b < nBanksHead; b++){
    const a = L.bankAngles[b] ?? 0;
    /* place a part in this bank's frame, keeping whatever cylinder position it
       was already given along the crank axis */
    const mk = (obj, y, z = 0) => {
      const g = group('h');
      g.add(obj);
      obj.position.set(obj.position.x, y, z);
      g.rotation.x = a;
      return g;
    };

    const hb = group('head' + b);
    /* the machined deck face: a bright line where the casting was milled flat
       for the gasket — what makes the block and the head read as two parts */
    blockG.add(mk(box(L.len * 1.002, M(2.4), L.bore * 1.5 * 1.004, MAT.machined()), L.deckH - M(2.2)));
    each('headgasket', b, mk(box(L.len, M(2.2), L.bore*1.5, e.class === 'race' ? MAT.gasket() : MAT.mls()), L.deckH));
    /* The head is not a block of metal: its underside is the fire deck, and cut
       into it is a combustion chamber per cylinder with the valves sitting in
       the roof. Pull the head off a real engine and that is the first thing you
       look at — the chamber shape and the carbon pattern in it. So the fire
       deck is its own plate with a chamber opening per bore, and behind each
       opening sits the chamber roof the valves seal against. */
    const fireT = L.bore * 0.26, chamR = L.bore * 0.46;
    const fShape = new THREE.Shape();
    const fHalfD = L.bore * 0.75, fHalfL = L.len / 2;
    fShape.moveTo(-fHalfL, -fHalfD); fShape.lineTo(fHalfL, -fHalfD);
    fShape.lineTo(fHalfL, fHalfD);   fShape.lineTo(-fHalfL, fHalfD); fShape.closePath();
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1) / 2) * L.pitch;
      const h = new THREE.Path(); h.absarc(px, 0, chamR, 0, TAU, true);
      fShape.holes.push(h);
    }
    const fgeo = new THREE.ExtrudeGeometry(fShape, { depth:fireT, bevelEnabled:false, curveSegments:16 });
    fgeo.rotateX(-Math.PI / 2);
    const fire = new THREE.Mesh(fgeo, MAT.alloy());
    hb.add(mk(fire, L.deckH));
    /* the chamber roof: a shallow dish, pent-roof on a four-valve head and a
       wedge-ish bowl on a two-valve, that the valves close against */
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1) / 2) * L.pitch;
      /* The roof is highest on the axis and falls away to the rim, so seen from
         underneath it is a dish, not a bump. Rim on the deck face, crown up
         inside the casting. */
      const cr = L.bore * (e.valvesPerCyl >= 4 ? 0.14 : 0.11);   // pent roof is deeper
      const dome = lathe([[0, cr], [chamR * 0.42, cr * 0.92], [chamR * 0.74, cr * 0.66],
                          [chamR * 0.93, cr * 0.30], [chamR, 0],
                          [chamR, cr * 1.5], [0, cr * 1.5]], MAT.alloy(), 26);
      dome.position.x = px;
      hb.add(mk(dome, L.deckH));
    }
    /* the rest of the casting sits on top of the fire deck */
    /* The casting is solid up to the spring pockets; above that it is an open
       tub — a rail round the edge up to the cover face — so that with the cam
       cover off the camshafts, caps and followers are what you see, not a slab. */
    const solidTop = L.bore * (ohv ? 1.05 : 0.80);
    const headBody = roundBox(L.len, solidTop - fireT, L.bore * 1.5, 0.03, FIN.heads || MAT.alloy());
    hb.add(mk(headBody, L.deckH + fireT + (solidTop - fireT) / 2));
    if (!ohv){
      const railTop = L.bore * 1.26, railH = railTop - solidTop, wall = L.bore * 0.09;
      for (const sz of [-1, 1]) hb.add(mk(at(box(L.len, railH, wall, FIN.heads || MAT.alloy()), 0, 0, 0), L.deckH + solidTop + railH / 2, sz * (L.bore * 0.75 - wall / 2)));
      for (const sx of [-1, 1]) hb.add(mk(at(box(wall, railH, L.bore * 1.5, FIN.heads || MAT.alloy()), sx * (L.len / 2 - wall / 2), 0, 0), L.deckH + solidTop + railH / 2));
    }
    /* port bosses on each face — the lumps you actually see on a head */
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1)/2) * L.pitch;
      for (const [zf, mat] of [[inSide(b) * 0.80, MAT.alloy()], [exSide(b) * 0.80, MAT.hot()]]){
        const port = cyl(L.bore * 0.19, L.bore * 0.22, L.bore * 0.22, mat, 16);
        rot(port, Math.PI/2, 0, 0);
        hb.add(mk(at(port, px, 0, zf * L.bore), L.deckH + L.bore * 0.46, zf * L.bore));
      }
      /* spark plug well sunk into the casting */
      hb.add(mk(at(cyl(L.bore*0.13, L.bore*0.13, L.bore*0.34, MAT.black(), 14), px, 0, 0),
                   L.deckH + L.bore * 1.02));
    }
    /* head bolts: their own part when the tree lists them, else cast here.
       mk() keeps the x it is given but takes y and z itself, so the offset
       across the head has to go through its z argument. */
    if (!has('headbolts')) for (let i = 0; i < L.perBank + 1; i++){
      for (const sgn of [-1, 1]){
        const bl = bolt(M(6), M(30), MAT.steel());
        const x = (i - L.perBank / 2) * L.pitch;
        hb.add(mk(at(bl, x, 0, 0), L.deckH + L.bore * 1.22, sgn * L.bore * 0.62));
      }
    }
    each('head', b, hb);
    if (!ohv){
      const nCams = e.cam === 'SOHC' ? 1 : 2;
      const lobesPer = Math.max(1, Math.floor(e.valvesPerCyl / 2));
      const baseR = L.bore * 0.135, liftR = L.bore * 0.062, lobeW = L.bore * 0.11;
      const inBank = [...Array(e.cyl).keys()].filter(i => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0) === b);
      for (let c = 0; c < nCams; c++){
        const zc = nCams === 1 ? 0 : (c ? 1 : -1) * L.bore * 0.34;
        const camY = L.deckH + L.bore * 1.00;
        const cg = group('cam');
        cg.add(rot(cyl(baseR * 0.52, baseR * 0.52, L.len * 0.94, MAT.steel(), 16), 0, 0, Math.PI/2));
        /* one cam serves both sides on a SOHC head, so it carries both events */
        const events = nCams === 1 ? ['intake', 'exhaust'] : [c === 0 ? 'intake' : 'exhaust'];
        for (const i of inBank){
          const px = cylPosition(e, i, L).x;
          for (const ev of events){
            const centre = ev === 'intake' ? CAM.intake : CAM.exhaust;
            const phase = -(fires[i] + centre) / 2;
            for (let j = 0; j < lobesPer; j++){
              const lobe = camLobe(baseR, liftR, CAM.duration, lobeW, MAT.steel());
              const holder = group('lobe');
              holder.add(lobe);
              holder.position.x = px + (j - (lobesPer - 1)/2) * lobeW * 1.7
                                + (events.length > 1 ? (ev === 'intake' ? -lobeW : lobeW) * 1.9 : 0);
              cg.add(holder);
              anim.lobes.push({ node:holder, phase, up:false });
            }
          }
        }
        camG.add(mk(cg, camY, zc));
        anim.cams.push({ node:cg, bank:b, index:c });
        for (let i = 0; i < L.perBank + 1; i++){
          const cap = roundBox(M(30), M(16), M(34), 0.006, MAT.alloyDark());
          each('camcaps', capIdx++, mk(at(cap, (i - L.perBank/2) * L.pitch, 0, zc), L.deckH + L.bore*1.12, zc));
        }
      }
    }
    /* valves */
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if ((L.banks >= 2 ? s.bank % 2 : 0) !== b) continue;
      const p = cylPosition(e, i, L);
      const nv = Math.max(2, e.valvesPerCyl);
      const perSide = Math.max(1, Math.floor(nv / 2));
      const maxLift = L.bore * 0.105;
      for (let v = 0; v < nv; v++){
        const intake = v < perSide;
        const j = intake ? v : v - perSide;
        const zoff = (intake ? -1 : 1) * L.bore * 0.21
                   + (perSide > 1 ? (j - (perSide - 1)/2) * L.bore * 0.19 : 0);
        const headR = L.bore * (intake ? 0.20 : 0.175);
        const vg = group('v');
        /* A closed valve sits on its seat in the chamber roof, not hanging down
           into the bore — it was doing the latter, which is why the head face
           looked wrong the moment the chambers became real. Shorten the valve
           and lift it so the seat lands in the roof while the stem tip stays
           where the cam expects it. */
        vg.add(valveMesh(headR, L.bore * 0.038, L.bore * 0.695, intake ? MAT.steel() : MAT.hot()));
        const va = group('valve');
        va.add(mk(at(vg, p.x, 0, zoff), L.deckH + L.bore * 0.4025, zoff));
        /* the spring seats on the head and is compressed by the retainer */
        const sp = springMesh(L.bore * 0.115, L.bore * 0.30, 6, L.bore * 0.020, MAT.steel());
        const spHolder = mk(at(sp, p.x, 0, zoff), L.deckH + L.bore * 0.52, zoff);
        va.add(spHolder);
        each('valves', i * nv + v, va);
        /* the stem seal on top of the guide, and on a DOHC head the bucket the
           lobe presses on — both sit on this exact valve */
        each('stemseals', i * nv + v, mk(at(tubeMesh(L.bore * 0.062, L.bore * 0.040, M(7), MAT.rubber(), 12), p.x, 0, zoff), L.deckH + L.bore * 0.50, zoff));
        if (!ohv) each('buckets', i * nv + v, mk(at(cyl(L.bore * 0.105, L.bore * 0.105, L.bore * 0.085, MAT.steel(), 16), p.x, 0, zoff), L.deckH + L.bore * 0.90, zoff));
        const centre = intake ? CAM.intake : CAM.exhaust;
        anim.valves.push({ node:vg, cyl:i, intake, bank:b, lift:maxLift,
                           phase:-(fires[i] + centre) / 2, duration:CAM.duration,
                           home:vg.position.y, spring:sp, springHome:sp.position.y });
      }
      /* spark plug / injector / coil */
      if (e.fuel !== 'diesel'){
        /* a real plug: terminal, ribbed insulator, hex, thread, ground strap */
        /* the plug is screwed into the chamber, so it sits low enough that
           only its terminal reaches up the well */
        const preCh = e.ignition === 'pre-chamber';
        const nPlug = (e.ignition === 'dual-mag' || preCh) ? 2 : 1;
        for (let k = 0; k < nPlug; k++){
          /* the pre-chamber plug is a smaller, offset unit beside the main one */
          const pl = sparkPlug(L.bore * (preCh && k ? 0.74 : 0.98));
          if (ohv && !airCooled){
            /* a pushrod head's plugs screw into its outboard face, angled up */
            pl.rotation.x = exSide(b) * deg(55);
            const pz = exSide(b) * L.bore * 0.80;
            each('plugs', i * nPlug + k, mk(at(pl, p.x, 0, pz), L.deckH + L.bore * 0.42, pz));
            continue;
          }
          const pz = nPlug === 2 ? (k ? 1 : -1) * L.bore * (preCh ? 0.20 : 0.26) : 0;
          each('plugs', i * nPlug + k, mk(at(pl, p.x, 0, pz), L.deckH + L.bore * 0.56, pz));
        }
        /* the tube the plug lives down on a DOHC head, sealed into the cover */
        if (!ohv) each('plugtubes', i, mk(at(tubeMesh(L.bore * 0.165, L.bore * 0.145, L.bore * 0.56, MAT.alloy(), 16), p.x, 0, 0), L.deckH + L.bore * 0.70));
        /* Coil-on-plug drops down the well onto that terminal, standing about
           a finger's width proud of the cover. A distributor engine has no coil
           here at all — it has eight leads coming from one cap, which is built
           after the heads because it needs to know where every plug ended up. */
        if (e.ignition !== 'distributor' && e.ignition !== 'dual-mag' && e.ignition !== 'wasted-spark'){
          for (let k = 0; k < nPlug; k++){
            if (ohv && !airCooled){
              /* LS/LT style: the plugs are in the outboard face of a pushrod
                 head, so the coils sit on a bracket along the rocker-cover
                 edge with a short lead down to each plug */
              const cz = exSide(b) * L.bore * 0.62;
              const cg = group('cnp');
              cg.add(at(box(L.pitch * 0.9, M(3), M(60), MAT.steel()), 0, -M(28), 0));
              cg.add(coilPack(L.bore * 0.80));
              cg.add(pipe([[0, -M(10), M(20)], [0, -L.bore * 0.40, L.bore * 0.26], [0, -L.bore * 0.86, L.bore * 0.20]], M(5), MAT.red(), 8));
              each('coils', i * nPlug + k, mk(at(cg, p.x, 0, cz), L.deckH + L.bore * 1.30, cz));
            } else {
              const co = coilPack(L.bore * (preCh && k ? 0.66 : 0.88));
              const pz = nPlug === 2 ? (k ? 1 : -1) * L.bore * 0.20 : 0;
              each('coils', i * nPlug + k, mk(at(co, p.x, 0, pz), L.deckH + L.bore * 1.04, pz));
            }
          }
        }
      } else {
        const inj = cyl(M(9), M(9), L.bore*0.4, MAT.steel(), 10);
        each('injectors', i, mk(at(inj, p.x, 0, 0), L.deckH + L.bore*0.90));
        /* glow plug: a slim pencil heater screwed in beside the injector on the
           intake side, with its hex and terminal standing proud of the head */
        const gp = group('glow');
        gp.add(cyl(M(5), M(5), L.bore * 0.46, MAT.steel(), 10));
        gp.add(at(hexPrism(M(10), M(9), MAT.plated()), 0, L.bore * 0.20, 0));
        gp.add(at(cyl(M(2.5), M(2.5), M(12), MAT.plated(), 8), 0, L.bore * 0.30, 0));
        /* glow plugs go in beside the injector on the outboard face of the head */
        each('glow', i, mk(at(gp, p.x, 0, exSide(b) * L.bore * 0.30), L.deckH + L.bore * 0.72, exSide(b) * L.bore * 0.30));
      }
    }
    if (ohv && airCooled){
      /* An air-cooled OHV twin has no cam cover: it has a rocker box per
         cylinder, cast with its own cooling fins and bolted to the head, and
         the barrels are separate castings so the boxes never join up. */
      for (let i = 0; i < L.perBank; i++){
        const px = (i - (L.perBank - 1)/2) * L.pitch;
        const rbW = L.pitch * 0.86, rbH = L.bore * 0.40, rbD = L.bore * 1.34;
        /* mk() keeps whatever x the mesh already carries, so every piece is
           placed at its cylinder before it is handed over */
        const put = (obj, y, z = 0) => { obj.position.x = px; return vcG.add(mk(obj, y, z)); };
        put(roundBox(rbW, rbH, rbD, .012, FIN.cover), L.deckH + L.bore * 1.18);
        for (let f = 0; f < 4; f++)
          put(box(rbW * 0.92, M(4), rbD + L.bore * 0.10, MAT.alloyDark()),
              L.deckH + L.bore * (1.06 + f * 0.10));
        /* the rocker-box lid and its four cap screws */
        put(roundBox(rbW * 0.80, L.bore * 0.09, rbD * 0.84, .010, FIN.cover),
            L.deckH + L.bore * 1.42);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]){
          const bt = bolt(M(9), M(11), MAT.steel());
          bt.position.x = px + sx * rbW * 0.34;
          vcG.add(mk(bt, L.deckH + L.bore * 1.48, sz * rbD * 0.36));
        }
      }
    } else {
      /* valve cover: a real casting with its bolt rail, ribs and filler cap */
      const vc = camCoverMesh(L.len * 0.98, L.bore * 1.36, L.bore * 0.34, FIN.cover,
                              Math.max(4, e.cyl + 2), FIN.hardware);
      vcG.add(mk(vc, L.deckH + L.bore * 1.34));
    }
  }
  /* A distributor engine wears the most recognisable thing on an old V8: one
     cap at the back of the vee with a lead arcing out of it to every plug. The
     rotor inside it points at each terminal in the firing order, which is
     exactly why the leads have to be routed in that order and not in a circle. */
  if ((e.ignition === 'distributor' || e.ignition === 'dual-mag') && e.fuel !== 'diesel'){
    const dR = L.bore * 0.34;
    const dAt = new THREE.Vector3((e.camDrive === 'gear' && e.class === 'race' ? -1 : 1) * L.len * 0.46, L.banks >= 2 ? L.deckH * 0.95 : L.deckH + L.bore * 0.30,
                                  L.banks >= 2 ? 0 : -L.bore * 0.86);
    const dg = group('dist');
    dg.add(at(cyl(dR * 0.72, dR * 0.72, L.bore * 0.72, MAT.alloyDark(), 20), dAt.x, dAt.y, dAt.z));
    /* the O-ring on the distributor shank, which every exploded view draws as a
       separate orange circle because it is the one part people leave out */
    dg.add(at(rot(torus(dR * 0.76, L.bore * 0.022, MAT.rubber(), 22), Math.PI / 2, 0, 0),
              dAt.x, dAt.y - L.bore * 0.34, dAt.z));
    dg.add(at(lathe([[0, 0], [dR, M(4)], [dR, L.bore * 0.24], [dR * 0.62, L.bore * 0.34],
                     [dR * 0.34, L.bore * 0.36], [0, L.bore * 0.36]], MAT.plastic(), 22),
              dAt.x, dAt.y + L.bore * 0.36, dAt.z));
    /* the cap's towers, one per cylinder, round the crown */
    const towers = [];
    for (let i = 0; i < e.cyl; i++){
      const a = (i / e.cyl) * TAU;
      const t = new THREE.Vector3(dAt.x + Math.cos(a) * dR * 0.74,
                                  dAt.y + L.bore * 0.60,
                                  dAt.z + Math.sin(a) * dR * 0.74);
      dg.add(at(cyl(dR * 0.20, dR * 0.22, L.bore * 0.20, MAT.plastic(), 10), t.x, t.y, t.z));
      towers.push(t);
    }
    /* and a lead from each tower to its own plug, in firing order */
    const order = firingOrder(e);
    order.forEach((cylNo, k) => {
      const i = cylNo - 1;
      if (i >= e.cyl) return;
      const pcyl = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const [ty, tz] = portAt(b, L.deckH + L.bore * 1.42, 0);
      const t = towers[k % towers.length];
      dg.add(pipe([[t.x, t.y + L.bore * 0.10, t.z],
                   [(t.x + pcyl.x) / 2, Math.max(t.y, ty) + L.bore * 0.28, (t.z + tz) / 2],
                   [pcyl.x, ty + L.bore * 0.08, tz]], M(6), MAT.red(), 8));
      dg.add(at(lathe([[M(11), 0], [M(11), M(20)], [M(7), M(26)]], MAT.rubber(), 12),
                pcyl.x, ty, tz));
    });
    /* the coil canister it fires through */
    dg.add(at(rot(cyl(L.bore * 0.20, L.bore * 0.20, L.bore * 0.44, MAT.black(), 16), 0, 0, deg(8)),
              dAt.x - L.bore * 0.55, dAt.y + L.bore * 0.52, dAt.z + L.bore * 0.55));
    each('coils', 0, dg);
  }
  /* Wasted spark on a twin: one dual-output coil under the tank, a lead to
     each plug, both plugs firing together once a revolution. */
  if (e.ignition === 'wasted-spark' && e.fuel !== 'diesel'){
    const wg = group('wcoil');
    const cAt = V3(-L.len * 0.10, L.deckH + L.bore * 1.70, -L.bore * 0.55);
    wg.add(at(roundBox(L.bore * 0.46, L.bore * 0.28, L.bore * 0.34, 0.006, MAT.black()), cAt.x, cAt.y, cAt.z));
    for (let i = 0; i < e.cyl; i++){
      const pcyl = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const [ty, tz] = portAt(b, L.deckH + L.bore * 1.42, 0);
      const tx = cAt.x + (i - (e.cyl - 1) / 2) * L.bore * 0.14;
      wg.add(at(cyl(M(6), M(7), M(16), MAT.plastic(), 10), tx, cAt.y + L.bore * 0.18, cAt.z));
      wg.add(pipe([[tx, cAt.y + L.bore * 0.24, cAt.z],
                   [(tx + pcyl.x) / 2, Math.max(cAt.y, ty) + L.bore * 0.30, (cAt.z + tz) / 2],
                   [pcyl.x, ty + L.bore * 0.08, tz]], M(6), MAT.red(), 8));
      wg.add(at(lathe([[M(11), 0], [M(11), M(20)], [M(7), M(26)]], MAT.rubber(), 12), pcyl.x, ty, tz));
    }
    each('coils', 0, wg);
  }

  flush('headgasket'); flush('head');
  flush('camcaps');
  add('cam', camG); flush('valves'); flush('stemseals'); flush('buckets'); add('valvecover', vcG);
  flush('plugs'); flush('plugtubes'); flush('glow'); flush('coils');

  /* ---- OHV valvetrain ---- */
  if (ohv){
    /* On a liquid-cooled pushrod V8 the lifters and pushrods live in the valley,
       hidden inside the block, and stand near enough vertical.  On an air-cooled
       OHV twin they are outside the engine: each pushrod runs up the side of the
       finned barrel inside a chromed tube with a rubber boot at either end, into
       a rocker box bolted on top of the head.  Those tubes are half of what makes
       a big twin look like a big twin, so they are built, not implied. */
    const openAir = airCooled;
    const camIn = group('camin');
    const baseR = L.bore * 0.15, liftR = L.bore * 0.055, lobeW = L.bore * 0.12;
    camIn.add(rot(cyl(baseR * 0.55, baseR * 0.55, L.len * 0.96, MAT.steel(), 16), 0, 0, Math.PI/2));
    const camY = L.crankR * 1.55;
    const liftG = group('lifters'), prG = group('pushrods'), rkG = group('rockers');
    const tubeG = openAir ? group('pushrodtubes') : null;
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const side = L.banks >= 2 ? (cylSlot(e, i, L).bank ? 1 : -1) : 1;
      for (const which of ['intake', 'exhaust']){
        const centre = which === 'intake' ? CAM.intake : CAM.exhaust;
        const phase = -(fires[i] + centre) / 2;
        const sgn = which === 'intake' ? -1 : 1;
        const vi = i * 2 + (which === 'intake' ? 0 : 1);     // piece index: cyl n intake, cyl n exhaust
        const lobe = camLobe(baseR, liftR, CAM.duration, lobeW, MAT.steel());
        const holder = group('lobe'); holder.add(lobe);
        holder.position.set(p.x + sgn * lobeW * 0.9, 0, 0);
        camIn.add(holder);
        anim.lobes.push({ node:holder, phase, up:true });

        /* the pushrod axis: straight up out of the block on a V8, along the
           cylinder axis on an air-cooled twin.  Everything below is written in
           the bank's own frame — a height up the cylinder axis and a lateral
           stand-off — and portAt() turns that into scene coordinates. */
        const ang = openAir ? (L.bankAngles[b] || 0) : 0;
        const dir = V3(0, Math.cos(ang), Math.sin(ang));
        const zLoc = openAir ? L.bore * 0.66 : 0;
        const px   = p.x + sgn * (openAir ? L.bore * 0.19 : lobeW * 0.9);
        /* the tube runs from the lifter block on the crankcase deck up to the
           underside of the rocker box, so anchor it to both ends, not to a
           length guessed off the deck height */
        const yBot = openAir ? L.deckH * 0.47 : camY + baseR + L.bore * 0.14;
        const yTop = openAir ? L.deckH + L.bore * 0.94 : 0;
        const [fy, fz] = openAir ? portAt(b, yBot, zLoc)
                                 : [yBot, sgn * L.bore * 0.18 * (L.banks >= 2 ? side : 1)];

        const lf = cyl(L.bore * 0.062, L.bore * 0.062, L.bore * 0.24, MAT.steel(), 12);
        lf.rotation.x = ang;
        at(lf, px, fy, fz);
        each('lifters', vi, lf);

        const onHead = openAir || L.banks >= 2;      // the rocker sits on a tilted head
        const prLen = openAir ? yTop - yBot : L.deckH * 0.66;
        let pr;
        if (!openAir){
          /* a pushrod engine: the lifter stands over the cam and the
             rod leans out to the rocker on the tilted head, so it runs between
             those two points rather than straight up the middle of the vee */
          const [ty, tz] = portAt(b, L.deckH + L.bore * 0.86, sgn * L.bore * 0.22);
          const bot = V3(px, fy + L.bore * 0.12, fz), top = V3(px, ty, tz);
          const d = top.clone().sub(bot);
          pr = cyl(L.bore * 0.024, L.bore * 0.024, d.length(), MAT.steel(), 8);
          pr.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
          pr.position.copy(bot).addScaledVector(d, 0.5);
        } else {
          const prMid = openAir ? (yBot + yTop) / 2 : yBot + L.bore * 0.12 + prLen / 2;
          const [my, mz] = openAir ? portAt(b, prMid, zLoc) : [prMid, fz];
          pr = cyl(L.bore * 0.024, L.bore * 0.024, prLen, MAT.steel(), 8);
          pr.rotation.x = ang;
          at(pr, px, my, mz);
        }
        each('pushrods', vi, pr);

        if (openAir){
          /* each piece is placed by its centre, in the bank's own frame */
          const tg = group('tube');
          const stand = (obj, yMid) => {
            const [ay, az] = portAt(b, yMid, zLoc);
            obj.rotation.x = ang;
            return tg.add(at(obj, px, ay, az));
          };
          const bootH = L.bore * 0.10;
          stand(tubeMesh(L.bore * 0.100, L.bore * 0.082, prLen - bootH * 1.6, MAT.chrome(), 16),
                (yBot + yTop) / 2);
          stand(tubeMesh(L.bore * 0.130, L.bore * 0.094, bootH, MAT.rubber(), 14), yBot + bootH * 0.5);
          stand(tubeMesh(L.bore * 0.130, L.bore * 0.094, bootH, MAT.rubber(), 14), yTop - bootH * 0.5);
          each('pushrodtubes', vi, tg);
        }

        const rockR = openAir ? L.deckH + L.bore * 1.06 : L.deckH + L.bore * 0.95;
        const [ry, rz] = onHead ? portAt(b, rockR, sgn * L.bore * 0.24)
                                : [rockR, fz * 1.4];
        const rk = box(L.bore * 0.30, L.bore * 0.075, L.bore * 0.09, MAT.steel());
        const rkH = group('rk'); rkH.add(rk);
        rk.position.x = -sgn * L.bore * 0.12;
        rkH.position.set(px, ry, rz);
        rkH.rotation.x = onHead ? (L.bankAngles[b] || 0) : ang;
        each('rockers', vi, rkH);
        anim.followers.push({ lifter:lf, pushrod:pr, rocker:rkH, phase, duration:CAM.duration,
                              travel:L.bore * 0.055, rockSign:sgn, dir,
                              lifterHome:lf.position.clone(), pushrodHome:pr.position.clone() });
      }
      if (openAir){
        /* the lifter block: the finned casting the two tubes stand in */
        const [ly, lz2] = portAt(b, L.deckH * 0.44, L.bore * 0.66);
        const lb = roundBox(L.bore * 0.58, L.bore * 0.30, L.bore * 0.34, .006, MAT.alloyDark());
        lb.rotation.x = L.bankAngles[b] || 0;
        if (!has('tappetblocks')) add('block', at(lb, p.x, ly, lz2));   // the lifter block is part of the crankcase casting
      }
    }
    camIn.position.y = camY;
    anim.cams.push({ node:camIn, bank:0, index:0 });
    add('cam', camIn);
    flush('lifters'); flush('pushrods'); flush('rockers'); flush('pushrodtubes');
  }

  /* ---- timing drive ---- */
  const tG = group('timing');
  const frontX = -L.len/2 - M(18);
  const crankSpr = tubeMesh(L.crankR * 0.7, L.crankR * 0.4, M(12), MAT.steel(), 20);
  rot(crankSpr, 0, 0, Math.PI/2); crankSpr.position.x = frontX;
  if (has('crksprocket')) add('crksprocket', crankSpr); else tG.add(crankSpr);
  let sprIdx = 0;
  if (!ohv){
    for (let b = 0; b < nBanksHead; b++){
      const a = L.bankAngles[b] ?? 0;
      const nCams = e.cam === 'SOHC' ? 1 : 2;
      for (let c = 0; c < nCams; c++){
        const zc = nCams === 1 ? 0 : (c ? 1 : -1) * L.bore * 0.34;
        const g = group('spr');
        const spr = tubeMesh(L.crankR * 1.3, L.crankR * 0.5, M(11), MAT.steel(), 24);
        rot(spr, 0, 0, Math.PI/2);
        spr.position.set(frontX, L.deckH + L.bore * 1.00, zc);
        g.add(spr); g.rotation.x = a;
        if (has('camsprockets')) each('camsprockets', sprIdx, g); else tG.add(g);
        if (has('camseals')){
          /* the lip seal behind the sprocket, where the cam nose comes through the head */
          const cs = group('camseal');
          const sr = tubeMesh(L.crankR * 0.56, L.crankR * 0.42, M(7), MAT.rubber(), 20);
          rot(sr, 0, 0, Math.PI / 2); sr.position.set(frontX + M(13), L.deckH + L.bore * 1.00, zc);
          cs.add(sr); cs.rotation.x = a;
          each('camseals', sprIdx, cs);
        }
        sprIdx++;
        /* the chain runs from the crank sprocket on the centreline up to the
           cam sprocket in the bank's own frame, so its top end is rotated into
           world space by the bank angle rather than the whole run being
           half-rotated and meeting neither sprocket */
        const w = (y, z) => [frontX, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
        if (!has('timingbelt') && e.camDrive !== 'gear' && !has('geartrain')){
          const chain = pipe([[frontX, L.crankR*0.7, 0],
                              w(L.deckH*0.6, L.bore*0.5*Math.sign(zc||1)),
                              w(L.deckH + L.bore*1.00, zc)], M(4), MAT.steel(), 6);
          tG.add(chain);
        }
      }
    }
  } else {
    /* the cam sprocket is a scan of a real timing gear where one is available */
    const camSpr = partMesh('camGear', { dia: L.crankR * 2.0, depth: M(14), axis:'x', mat: MAT.steel() })
                 || rot(tubeMesh(L.crankR * 1.0, L.crankR*0.4, M(11), MAT.steel(), 22), 0, 0, Math.PI/2);
    camSpr.position.set(frontX, L.crankR*1.55, 0); tG.add(camSpr);
  }
  add('timing', tG); flush('camsprockets'); flush('camseals');
  add('tensioner', at(box(M(20), M(70), M(16), MAT.plastic()), frontX, L.deckH * 0.55, L.bore * 0.5));
  /* Belt-driven DOHC: two smooth idler pulleys steer the belt on the side the
     tensioner is not, one above the other on the long span; then the upper and
     lower plastic covers, split at the crank-pulley height. */
  if (has('idlers')){
    const idler = (r) => { const g = group('idler');
      g.add(rot(tubeMesh(r, r * 0.42, M(22), MAT.steel(), 24), 0, 0, Math.PI / 2));
      g.add(rot(cyl(r * 0.40, r * 0.40, M(28), MAT.plated(), 14), 0, 0, Math.PI / 2));
      g.add(at(rot(hexPrism(M(7), M(7), MAT.plated()), 0, 0, Math.PI / 2), -M(16), 0, 0));
      return g; };
    each('idlers', 0, at(idler(M(26)), frontX, L.deckH * 0.78, -L.bore * 0.55));
    each('idlers', 1, at(idler(M(21)), frontX, L.deckH * 0.26, -L.bore * 0.62));
    flush('idlers');
  }
  if (has('timingcovers')){
    const tcX = frontX - M(8), split = L.deckH * 0.42;
    const upper = roundBox(M(12), L.deckH + L.bore * 1.25 - split, L.bore * 1.55, 0.015, MAT.plastic());
    const lower = roundBox(M(12), split - (-L.crankR * 0.4), L.bore * 1.45, 0.015, MAT.plastic());
    each('timingcovers', 0, at(upper, tcX, (split + L.deckH + L.bore * 1.25) / 2, 0));
    each('timingcovers', 1, at(lower, tcX, (split - L.crankR * 0.4) / 2, 0));
    flush('timingcovers');
  }
  {
    const aMax = Math.max(...L.bankAngles.map(a => Math.abs(a || 0)), 0);
    const flat = L.banks >= 2 && Math.abs(aMax - Math.PI / 2) < 0.2;
    let fcW = L.bore * 1.5, fcH = L.deckH * 1.5, fcY = L.deckH * 0.5;
    if (flat){ fcW = L.bore * 1.9; fcH = L.bore * 1.9; fcY = L.bore * 0.35; }
    else if (L.banks >= 2){ fcW = 2 * ((L.deckH + L.bore * 1.05) * Math.sin(aMax) + L.bore * 0.6); fcH = (L.deckH + L.bore * 1.05) * Math.cos(aMax) + L.crankR * 1.3; fcY = fcH / 2 - L.crankR * 1.3; }
    if (has('timingcovers')){
      /* behind a belt the alloy casting is just the seal plate / pump face */
      add('frontcover', at(roundBox(M(10), fcH * 0.6, fcW * 0.9, 0.02, MAT.alloyDark()), frontX + M(4), fcY, 0));
    } else {
      add('frontcover', at(roundBox(M(24), fcH, fcW, 0.02, MAT.alloyDark()), frontX - M(14), fcY, 0));
    }
  }

  /* ---- lubrication ---- */
  const opG = group('oilpump');
  opG.add(at(roundBox(M(70), M(70), M(50), .01, MAT.alloyDark()), frontX + M(40), -L.crankR * 0.6, L.bore * 0.5));
  /* The pressure relief valve: a spring behind a plunger that dumps oil back to
     the pan above about 5 bar. It is why a cold engine on a winter morning does
     not split its own filter, and why oil pressure stops climbing with revs. */
  const rv = group('relief');
  rv.add(at(rot(cyl(M(13), M(13), M(46), MAT.alloyDark(), 14), 0, 0, Math.PI/2),
            frontX + M(40) + M(46), -L.crankR * 0.6, L.bore * 0.5));
  rv.add(at(rot(hexPrism(M(15), M(12), MAT.plated()), 0, 0, Math.PI/2),
            frontX + M(40) + M(74), -L.crankR * 0.6, L.bore * 0.5));
  opG.add(rv);
  add('oilpump', opG);
  add('pickup', pipe([[0,-L.crankR*0.9,0],[0,-L.crankR*1.6,L.bore*0.25],[L.len*0.15,-L.crankR*1.9,L.bore*0.3]], M(9), MAT.steel()));
  const pan = oilPanMesh(L.len * 0.94, L.bore * 1.35, L.crankR * (e.drySump ? 0.6 : 1.5), MAT.alloyDark());
  add('oilpan', at(pan, 0, -L.crankR * (e.drySump ? 1.45 : 1.9), 0));
  /* the filter screws into a boss on the block's flank, so it stands clear of
     it — you have to get a strap wrench round one */
  const deMaker = /bmw|mercedes|porsche|audi|volkswagen/i.test(e.maker || '');
  const filterZ = (deMaker ? -1 : 1) * (L.banks >= 2 ? wCase + M(70) : outerZ + M(50));
  if (flat) add('oilfilter', at(oilFilterMesh(M(92), M(115), MAT.black()), -L.len * 0.30, L.bore * 0.85, L.bore * 0.55));
  else add('oilfilter', at(oilFilterMesh(M(92), M(115), e.class === 'race' ? MAT.blue() : MAT.black()),
                      L.len * 0.20, -L.crankR * 0.90, filterZ));
  if (has('oilpsensor')){
    /* the pressure sender screws into the main gallery a hand's width from the
       filter, its connector pointing out of the block */
    const ps = group('oilpsensor');
    ps.add(rot(cyl(M(11), M(13), M(22), MAT.plated(), 12), Math.PI / 2, 0, 0));
    ps.add(at(roundBox(M(16), M(14), M(14), .003, MAT.black()), 0, 0, M(20)));
    add('oilpsensor', at(ps, L.len * 0.30, -L.crankR * 0.55, outerZ + M(8)));
  }
  if (has('rearhousing')){
    /* the retainer plate the rear main seal presses into, bolted to the back face */
    const rh = group('rearhousing');
    rh.add(roundBox(M(10), L.crankR * 2.3, L.crankR * 2.3, .02, MAT.alloyDark()));
    for (let k = 0; k < 6; k++){
      const t = (k / 6) * TAU;
      rh.add(at(rot(bolt(M(4), M(14), MAT.steel()), 0, 0, -Math.PI / 2), M(6), Math.sin(t) * L.crankR * 0.98, Math.cos(t) * L.crankR * 0.98));
    }
    add('rearhousing', at(rh, L.len / 2 + M(20), 0, 0));
  }

  /* Where each bank's primaries collect. On a turbocharged engine the turbine
     housing bolts straight onto this, so the turbo is positioned from it too —
     which is the whole point of naming it once instead of twice. */
  /* A turbocharged engine's headers run FORWARD, not back: the turbos hang off
     the front corners of the engine ahead of the heads, and every primary
     sweeps down the side of the block and forward into the turbine bolted to
     the end of it. That is the shape of a front-mount twin-turbo V8, and it is
     what makes one recognisable across a workshop. Anything atmospheric keeps
     its collector at the back, where the rest of the exhaust goes. */
  const boosted = e.aspiration !== 'na';
  const hasTurbo = boosted && !!tree.byId['turbo'];
  /* A vee's turbos go on the front corners, ahead of the heads, because that
     is the only place two of them and their manifolds fit. An inline engine
     hangs its turbo off the exhaust manifold at head height, halfway along —
     which is where every diesel six and every modern four puts it, and why
     you can see the whole hot side of one from the wing. */
  const frontTurbo = hasTurbo && L.banks >= 2;
  const sideTurbo  = hasTurbo && L.banks < 2;
  /* a modern vee hangs its turbos low and outboard, toward the gearbox */
  const tlOut = frontTurbo && ['outboardLow', 'rearOutboard', 'boxerRear', 'rearCentre', 'valley'].includes(e.turboLayout);
  const turboX = e.turboLayout === 'rearOutboard' ? L.len * 0.22 : e.turboLayout === 'boxerRear' ? L.len * 0.25
               : e.turboLayout === 'rearCentre' ? L.len * 0.50 + L.bore * 0.9
               : e.turboLayout === 'valley' ? (e.cyl >= 8 && e.aspiration === 'turbo' ? L.len * 0.30 : 0) : L.len * 0.14;
  const colX = tlOut ? turboX - L.bore * 0.3
             : frontTurbo ? frontX - L.len * 0.04
             : sideTurbo ? L.len * 0.06
             : L.banks >= 2 ? L.len * 0.30 : L.len * 0.35;
  const colY = flat ? -L.crankR * 1.5
             : tlOut ? L.crankR * 0.55
             : frontTurbo ? L.crankR * 0.95
             : sideTurbo ? L.deckH + L.bore * 0.02
             : L.crankR * 0.5;
  /* on a vee the exhaust ports are a long way outboard, because the head is
     tilted away from the crank — so the collector has to be out there too */
  const colZ = flat ? L.deckH * 0.75 : L.bore * (L.banks >= 2 ? 1.62 : 1.20);

  /* ---- induction ---- */
  /* On a vee the manifold sits down in the valley between the heads. The deck
     is measured along the bank axis, so its actual height above the crank is
     deckH·cos(bank angle) — using deckH directly floated the plenum well clear
     of the engine. */
  const vAngle = Math.abs(L.bankAngles[0] || 0);
  /* the valley floor is the inner edge of the two decks; a plenum that sits
     below that line is buried in the vee instead of filling it */
  const inducY = flat ? L.crankR * 1.2 + L.bore * 1.15            /* on top of the crankcase, between the heads */
                : L.banks >= 2 ? L.deckH * Math.cos(vAngle) * 1.04 + L.bore * 0.70
                              : L.deckH + L.bore * 1.42;      /* beside the cam cover, not above it */
  /* where the fuel rail runs on each bank, in the engine's own frame */
  const railAt = (b) => flat ? portAt(b, L.deckH + L.bore * 0.52, inSide(b) * L.bore * 0.95) : L.banks >= 2
    ? [inducY - L.bore * 0.34, (b ? 1 : -1) * L.bore * 0.96]
    : [L.deckH + L.bore * 0.92, -L.bore * 1.02];
  const intakeG = group('intake');
  /* a high-revving atmospheric engine runs individual throttles with a trumpet
     on each one; everything else runs a plenum and a single throttle body */
  const itb = e.intake ? (e.intake === 'itb' || e.intake === 'slide') : (e.aspiration === 'na' && e.redline >= 7600);
  /* a plenum and its runners are moulded nylon on anything modern; individual
     throttles and their trumpets are machined alloy, and look it */
  const inletMat = itb ? MAT.alloy() : (FIN.plenum || MAT.composite());   /* throttle bodies are machined alloy whatever the plenum is */
  /* where a runner has to reach the plenum from */
  const plenumMouth = () => [inducY, L.banks >= 2 ? 0 : -L.bore * 1.12];
  if ((!itb || (boosted && L.banks < 2)) && e.id !== 'i6-30-legend' && !has('blower')){   /* boosted ITBs (RB26) breathe from a collector; the 2JZ's chamber is a factory part; a blower is its own plenum */
    const plenum = roundBox(L.len * 0.80, L.bore * (L.banks >= 2 ? 0.72 : 0.46),
                           flat ? L.bore * 1.0 : L.banks >= 2 ? L.bore * 1.45 : L.bore * 0.70, 0.03, inletMat);
    at(plenum, 0, inducY, L.banks >= 2 ? 0 : -L.bore * 1.12);
    intakeG.add(plenum);
  }
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.34, inSide(b) * L.bore * 0.70);
    const [my, mz] = plenumMouth();
    if (itb && L.banks < 2){
      /* Individual throttles on an inline engine come straight off the intake
         face of the head and lean out over the intake side — the row of
         trumpets on an RB26 or an S54 stands beside the cam cover, not on it. */
      const lean = deg(40), sgn = inSide(b);
      const dir = V3(0, Math.cos(lean), sgn * Math.sin(lean));
      const root = V3(p.x, py, pz);
      const body = root.clone().addScaledVector(dir, L.bore * 0.46);
      const mouth = root.clone().addScaledVector(dir, L.bore * (boosted ? 1.05 : 0.80));
      intakeG.add(pipe([[root.x, root.y, root.z], [body.x, body.y, body.z]], M(17), inletMat, 8));
      const tb = cyl(M(23), M(23), L.bore * 0.22, MAT.alloyDark(), 20);
      tb.rotation.x = sgn * lean; tb.position.copy(body); intakeG.add(tb);
      const vs = velocityStack(M(46), L.bore * 0.34, MAT.alloy());
      vs.rotation.x = sgn * lean; vs.position.copy(mouth); intakeG.add(vs);
      continue;
    }
    const topY = itb ? inducY + L.bore * 0.35 : my;      /* trumpets just above the valley floor */
    const zEnd = itb ? pz * 0.75 : mz;
    intakeG.add(pipe([
      [p.x, topY, zEnd],
      [p.x, (topY + py) / 2, (zEnd + pz) / 2 * 1.25],
      [p.x, py, pz],
    ], M(17), inletMat, 8));
    if (itb){
      /* the throttle body, and the bellmouth above it */
      intakeG.add(at(cyl(M(23), M(23), L.bore * 0.20, MAT.alloyDark(), 20),
                     p.x, topY + L.bore * 0.10, zEnd));
      intakeG.add(at(velocityStack(M(46), L.bore * 0.34, MAT.alloy()),
                     p.x, topY + L.bore * 0.38, zEnd));
    }
  }
  add('intake', intakeG);
  /* the throttle body sits on the front of the plenum, where the charge pipe
     or the airbox reaches it */
  const thrAt = V3(-L.len * 0.48, inducY, L.banks >= 2 ? 0 : -L.bore * 1.12);
  /* the blow-off valve sits on the cold side just before the throttle, which
     is the only place the trapped charge has anywhere to go */
  /* a top-mount or air-to-water charge cooler sits on the engine itself,
     above the plenum; a front-mount core is out ahead of the radiator */
  const icTop = e.intercooler === 'water' || e.intercooler === 'top';
  /* the blow-off valve sits ON the cold pipe back from the cooler, just before
     the throttle — the one place the trapped charge has anywhere to go */
  const bovAt = icTop ? V3(-L.len * 0.05 - L.bore * 0.9, inducY + L.bore * 0.42, 0)
                      : V3(frontX - L.bore * 0.10, thrAt.y + L.bore * 0.28, -L.bore * 0.90);
  if (has('throttle')){
    const tG = group('throttle');
    tG.add(at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 18), 0, 0, Math.PI/2),
              thrAt.x, thrAt.y, thrAt.z));
    /* On a boosted engine the throttle is fed by the charge pipe coming back
       from the intercooler; the filter is out at the front of the car on the
       compressor's inlet, not bolted to the throttle body. An atmospheric
       engine draws straight through the filter here, so that is where it goes. */
    if (!boosted && !has('airbox'))
      tG.add(at(filterElement(M(72), M(150), MAT.alloyDark()), thrAt.x - M(115), thrAt.y, thrAt.z));
    add('throttle', tG);
  }
  if (has('injectors') && e.fuel !== 'diesel'){
    /* An injector feeds the inlet side, so it goes where the inlet is: in the
       valley beside the plenum on an ordinary vee, out on the head's outer face
       on a hot-V, and along the head on an inline. Never on the exhaust side. */
    for (let b = 0; b < nBanksHead; b++){
      const [ry, rz] = railAt(b);
      railG.add(at(rot(cyl(M(13), M(13), L.len * 0.9, MAT.steel(), 12), 0, 0, Math.PI/2), 0, ry, rz));
    }
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const [ry, rz] = railAt(b);
      const [py, pz] = portAt(b, L.deckH + L.bore * 0.44, inSide(b) * L.bore * 0.62);
      each('injectors', i, pipe([[p.x, ry, rz], [p.x, (ry + py) / 2, (rz + pz) / 2], [p.x, py, pz]],
                    M(9), MAT.plastic(), 8));
    }
    flush('injectors');
    add('fuelrail', railG);
    if (has('fpr')){
      /* the regulator on the end of the rail, its vacuum nipple on top */
      const [ry, rz] = railAt(0);
      const fp = group('fpr');
      fp.add(lathe([[0, 0], [M(26), 0], [M(30), M(14)], [M(30), M(30)], [M(18), M(40)], [0, M(40)]], MAT.alloy(), 20));
      fp.add(at(cyl(M(3), M(3), M(12), MAT.plated(), 8), 0, M(44), 0));
      add('fpr', at(fp, L.len * 0.47, ry + M(2), rz));
    }
    if (has('fuellines')){
      const [ry, rz] = railAt(0);
      const sz = Math.sign(rz || -1);
      add('fuellines', pipe([[-L.len * 0.46, ry, rz], [-L.len * 0.52, ry - L.bore * 0.6, rz + sz * L.bore * 0.2],
                             [-L.len * 0.40, -L.crankR * 0.3, sz * (outerZ + M(10))]], M(5), MAT.rubber(), 8));
      add('fuellines', pipe([[L.len * 0.47, ry + M(42), rz], [L.len * 0.52, ry - L.bore * 0.5, rz + sz * L.bore * 0.2],
                             [L.len * 0.42, -L.crankR * 0.3, sz * (outerZ + M(10))]], M(5), MAT.rubber(), 8));
    }
  }
  if (has('hpfp')){
    const [hy, hz] = L.banks >= 2 ? [inducY - L.bore * 0.30, -L.bore * 0.55]
                                  : [L.deckH + L.bore * 0.70, -L.bore * 1.02];
    add('hpfp', at(roundBox(M(60), M(60), M(60), .01, MAT.alloyDark()), -L.len * 0.38, hy, hz));
  }
  if (has('fuelpump'))
    add('fuelpump', at(roundBox(M(60), M(50), M(50), .01, MAT.alloyDark()),
                       -L.len * 0.30, L.crankR * 0.6, L.bore * 1.16));

  /* turbo / blower */
  const turbos = [];              /* where each one ended up, for the pipework */
  if (has('turbo')){
    const n = { turbo:1, twinturbo:2, quadturbo:4 }[e.aspiration] || 1;
    const tg = group('turbos');
    /* size scales with how much air it has to move — a big single on a 2-litre
       is physically enormous next to a pair of small twins on a V8 */
    /* turboUnit() draws its housings out to size × 0.98, so the unit ends up
       about 2 × size across. Real numbers: a 2.0-litre runs a compressor
       housing about 130 mm in diameter, so size ≈ 65 mm — three quarters of an
       86 mm bore, not one and a quarter of it. It was drawing a turbo half the
       height of the engine it was bolted to. */
    const size = L.bore * (n === 1 ? 0.72 : n === 2 ? 0.62 : 0.43)
               * (1 + (e.boostTarget || 0) * 0.08);
    /* One turbo per front corner, turned out at forty-five degrees so the
       compressor looks forward into the air and the turbine looks back down
       the headers coming to meet it. The housings are then rolled so the
       compressor's outlet points straight up — because the big charge pipe
       leaving it has to clear the engine and come back over the top, and that
       arc is the most recognisable thing on a twin-turbo V8. */
    const perBank = L.banks >= 2 && n >= 2;
    for (let i = 0; i < n; i++){
      const side = perBank ? (i % 2 ? 1 : -1) : 1;
      const rank = perBank ? Math.floor(i / 2) - (n / 2 - 1) / 2 : i - (n - 1) / 2;
      const t = turboUnit(size);
      /* Whatever else is true, the housings have to sit outside the engine.
         The crankcase is bore × 0.92 either side of the crank and a vee's heads
         reach half a bore further again; a turbo centred any closer than that
         plus its own radius is buried in the block. */
      const clearZ = outerZ + size * 1.10;
      /* Where the maker actually hangs them (engines.js turboLayout, from
         realism.md §2.4): a modern vee carries one turbo per bank low and
         outboard of the head — toward the gearbox end on a mid-engined car —
         and only the old front-corner layout puts them out ahead of the block. */
      const tl = e.turboLayout || '';
      const outboard = frontTurbo && ['outboardLow', 'rearOutboard', 'boxerRear', 'rearCentre', 'valley'].includes(tl);
      const pos = tl === 'valley' && frontTurbo
        /* hot-vee or pedestal: the turbo(s) sit in the valley between the heads */
        ? new THREE.Vector3(turboX + rank * size * 1.8, L.deckH * Math.cos(vAngle) * 1.0 + size * 0.75, 0)
        : tl === 'boxerRear' && frontTurbo
        /* a Subaru's single turbo sits behind the right head, low, fed by an up-pipe */
        ? new THREE.Vector3(turboX, -L.crankR * 0.1, L.deckH * 0.55)
        : tl === 'rearCentre' && frontTurbo
        /* an F1 power unit's turbo sits on the crank axis at the back of the vee */
        ? new THREE.Vector3(turboX, L.deckH * Math.cos(vAngle) * 0.9 + size * 0.3, 0)
        : outboard
        ? new THREE.Vector3(turboX + rank * size * 1.6,
                            L.crankR * 0.55,
                            side * (outerZ + size * 0.95))
        : frontTurbo
        ? new THREE.Vector3(frontX - size * 1.15 + rank * size * (n >= 4 ? 2.3 : 0.55),
                            L.crankR * 0.95,
                            side * clearZ)
        : sideTurbo
        /* An inline engine's turbo bolts to the log manifold: hung just below
           it, tight against the head. One turbo sits mid-engine; twins sit at
           the quarter points, a quarter of the engine's length apart — spacing
           taken off the ENGINE, not off the turbo, because spacing twins by
           their own diameter is how two of them ended up drawn through each
           other as one double-decked lump. */
        ? new THREE.Vector3(n === 1 ? L.len * 0.02 : rank * L.len * 0.46,
                            colY - size * 0.62,
                            colZ + size * 0.85)
        : new THREE.Vector3(colX + L.len * 0.10 + rank * size * 1.55,
                            colY + size * 0.52,
                            side * clearZ);
      at(t, pos.x, pos.y, pos.z);
      const P0 = t.userData.ports;
      const yaw = outboard ? (side > 0 ? 0 : Math.PI)
                : frontTurbo ? (side > 0 ? deg(-45) : deg(-135))
                : sideTurbo ? 0
                : (side < 0 ? Math.PI : 0);
      /* the compressor's outlet is rolled to point forward on a side-mounted
         turbo and straight up on a front-mounted one, because that is the way
         the charge pipe has to leave to reach the intercooler */
      const roll = outboard
        ? Math.PI - Math.atan2(P0.compressorOut.y, P0.compressorOut.x)
        : frontTurbo
        ? Math.PI / 2 - Math.atan2(P0.compressorOut.y, P0.compressorOut.x)
        : sideTurbo
        ? Math.PI - Math.atan2(P0.compressorOut.y, P0.compressorOut.x)
        : deg(-120) - Math.atan2(P0.turbineIn.y, P0.turbineIn.x);
      /* Only the housings are clocked. The bearing housing between them keeps
         its oil feed on top and its drain underneath, because the drain is
         gravity-fed — rolling it over with the volutes is what made the turbo
         look like it had been dropped in sideways. */
      t.rotation.set(0, yaw, 0);
      t.userData.clock.rotation.z = roll;
      anim.turbos.push(t.userData.shaft);
      tg.add(t);
      /* the housings are placed in the turbo's own frame, so put its
         connections back into the engine's before anything joins onto them.
         The hot and cold ports ride the clock; the oil ports do not. */
      const spin = new THREE.Euler(0, yaw, 0);
      const clocked = (v) => v.clone().applyEuler(new THREE.Euler(0, 0, roll)).applyEuler(spin).add(pos);
      const fixed = (v) => v.clone().applyEuler(spin).add(pos);
      const P = t.userData.ports;
      turbos.push({ pos, side, size,
                    hotIn: clocked(P.turbineIn), hotOut: clocked(P.turbineOut),
                    coldOut: clocked(P.compressorOut), coldIn: clocked(P.compressorIn),
                    oilIn: fixed(P.oilIn), oilOut: fixed(P.oilOut),
                    wgSignal: clocked(P.wgSignal),
                    hotTube:P.hotTube, coldTube:P.coldTube, axialTube:P.axialTube });
    }
    add('turbo', tg);

    /* The wastegate: the actuator canister every road turbo actually wears,
       bolted to the compressor housing with one short rod across to the arm
       on the turbine housing. The old external gate hung a valve body out on
       a pipe in mid-air with its plumbing radiating off it — which from a
       step back read as the engine's own connecting rods fallen out of it. */
    const wgG = group('wg');
    for (const wt of turbos){
      /* canister on the compressor housing's shoulder, rod across the
         cartridge to the little arm on the turbine housing — the whole thing
         lives within the turbo's own silhouette */
      const can = wt.pos.clone().add(V3(0, wt.size * 0.62, wt.size * 0.42));
      const arm = wt.pos.clone().add(V3(0, wt.size * 0.52, -wt.size * 0.30));
      wgG.add(at(lathe([[0, -M(11)], [M(15), -M(11)], [M(17), -M(4)], [M(17), M(5)],
                        [M(12), M(11)], [0, M(11)]], MAT.steel(), 20),
                 can.x, can.y, can.z));
      const rod = new THREE.Vector3().subVectors(arm, can);
      const rm = cyl(M(3), M(3), rod.length(), MAT.plated(), 8);
      rm.position.copy(can).addScaledVector(rod, 0.5);
      rm.quaternion.setFromUnitVectors(V3(0, 1, 0), rod.clone().normalize());
      wgG.add(rm);
      wgG.add(at(box(M(14), M(5), M(6), MAT.steel()), arm.x, arm.y, arm.z));
    }
    add('wastegate', wgG);

    /* Sequential twins (2JZ-GTE): the hardware that hands over from one turbo
       to two. The exhaust gas control valve is a butterfly in the manifold at
       the second turbine's mouth, the smaller exhaust bypass valve sits on the
       same housing, the intake air control valve blanks the second compressor's
       outlet, and four VSV solenoids on one bracket beside the throttle switch
       the vacuum that works the three actuators. */
    if (turbos.length === 2 && e.sequential && has('egcv')){
      const t2 = turbos[1];
      const actuator = (r) => lathe([[0, -M(9)], [r, -M(9)], [r + M(2), -M(3)], [r + M(2), M(4)], [r * 0.7, M(9)], [0, M(9)]], MAT.steel(), 18);
      const flapValve = (dia, len, matBody) => { const g = group('valve');
        g.add(rot(cyl(dia / 2 + M(4), dia / 2 + M(4), len, matBody, 18), 0, 0, Math.PI / 2));
        g.add(at(rot(cyl(M(4), M(4), dia + M(30), MAT.steel(), 8), Math.PI / 2, 0, 0), 0, 0, 0));
        g.add(at(box(M(10), M(26), M(5), MAT.steel()), 0, M(8), dia / 2 + M(14)));
        return g; };
      /* EGCV: in the last run of manifold before turbine #2 */
      const eg = flapValve(t2.hotTube * 1.6, M(44), MAT.hot());
      const egAt = t2.hotIn.clone().add(V3(M(42), M(10), 0));
      eg.add(at(actuator(M(22)), 0, M(14), t2.hotTube * 0.8 + M(28)));
      add('egcv', at(eg, egAt.x, egAt.y, egAt.z));
      /* EBV: a small bypass on the turbine housing, above the EGCV */
      const eb = flapValve(t2.hotTube * 0.7, M(30), MAT.hot());
      eb.add(at(actuator(M(15)), 0, M(10), t2.hotTube * 0.35 + M(20)));
      add('ebv', at(eb, egAt.x + M(8), egAt.y + t2.size * 0.70, egAt.z + t2.side * M(6)));
      /* IACV: blanking valve on compressor #2's outlet pipe */
      const ia = flapValve(t2.coldTube * 1.5, M(40), MAT.alloy());
      ia.add(at(actuator(M(20)), 0, M(12), t2.coldTube * 0.75 + M(26)));
      const iaAt = t2.coldOut.clone().add(V3(0, M(46), 0));
      add('iacv', at(rot(ia, 0, 0, Math.PI / 2), iaAt.x, iaAt.y, iaAt.z));
      /* VSVs: four black solenoids in a row on one bracket by the throttle */
      const vsvAt = thrAt.clone().add(V3(M(60), -L.bore * 0.55, -L.bore * 0.40));
      for (let k = 0; k < 4; k++){
        const g = group('vsv');
        /* the shared bracket comes off with the first solenoid */
        if (k === 0) g.add(at(box(M(120), M(3), M(34), MAT.steel()), M(45), -M(18), 0));
        g.add(roundBox(M(22), M(34), M(24), 0.004, MAT.plastic()));
        g.add(at(cyl(M(4), M(4), M(14), MAT.plastic(), 8), 0, M(20), M(6)));
        g.add(at(rot(cyl(M(4), M(4), M(14), MAT.plastic(), 8), Math.PI / 2, 0, 0), 0, -M(4), M(18)));
        each('vsv', k, at(g, vsvAt.x - M(45) + k * M(30), vsvAt.y + M(18), vsvAt.z));
      }
      flush('vsv');
    }

    /* The charge-air path, as the bi-turbo diagrams draw it: both compressors
       feed ONE intercooler, and ONE pipe comes back off the core to the
       throttle body. Two hot pipes in, one cold pipe out — a second return
       would be two engines' worth of plumbing on one engine. The compressor
       inlets are left open on bellmouths, which is how these are built. */
    /* A front-mount intercooler is the front-most thing on the car: ahead of
       the radiator, low, in clean air. It was sitting on top of the engine and
       reaching back over the block, which is not where any of them live. */
    /* a top-mount or air-to-water charge cooler sits on the engine itself,
       above the plenum; a front-mount core is out ahead of the radiator */
    const icY = icTop ? inducY + L.bore * 0.42 : L.crankR * 0.10;
    const icX = icTop ? -L.len * 0.05 : frontX - L.bore * 4.60;
    const icZ = icTop ? L.bore * 0.72 : L.bore * 1.70;
    const icG = group('ic');
    const cpG = has('chargepipes') ? group('chargepipes') : icG;
    /* a mid- or rear-engined car cools each bank's charge in a core beside the
       engine, in the side intake, one per turbo */
    const icSide = e.intercooler === 'side' && L.banks >= 2 && turbos.length > 0;
    const sideCore = (tb) => V3(tb.pos.x + L.bore * 0.2, L.deckH * 0.62, Math.sign(tb.pos.z || 1) * (outerZ + L.bore * 1.15));
    if (icSide) for (const tb of turbos){ const c = sideCore(tb); icG.add(at(rot(coreMesh(L.bore * 1.5, L.bore * 1.1, M(70)), 0, Math.PI / 2, 0), c.x, c.y, c.z)); }
    else if (icTop) icG.add(at(coreMesh(L.bore * 1.6, L.bore * 0.40, L.bore * 0.80), icX, icY, 0));
    else icG.add(at(coreMesh(L.bore * 3.60, L.bore * 1.05, M(76)), icX, icY, 0));
    const inTank  = V3(icX + L.bore * 0.05,  icY + L.bore * 0.34,  icZ * 0.86);
    const outTank = V3(icX + L.bore * 0.05,  icY + L.bore * 0.34, -icZ * 0.86);
    for (const tb of turbos){
      const sgn = Math.sign(tb.pos.z) || 1;
      if (icSide){
        const c = sideCore(tb);
        cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                      [(tb.coldOut.x + c.x) / 2, Math.max(tb.coldOut.y, c.y - L.bore * 0.3), (tb.coldOut.z + c.z) / 2],
                      [c.x, c.y - L.bore * 0.45, c.z]], tb.coldTube * 1.05, MAT.alloy(), 12));
        /* and from the top of the core forward to the throttle */
        cpG.add(pipe([[c.x, c.y + L.bore * 0.50, c.z], [c.x - L.bore * 0.6, thrAt.y + L.bore * 0.2, sgn * L.bore * 1.1],
                      [thrAt.x - M(70), thrAt.y, thrAt.z + sgn * M(30)]], L.bore * 0.13, MAT.alloy(), 12));
        continue;
      }
      if (icTop){
        /* straight up from the compressor into the tank on its own side */
        cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                      [(tb.coldOut.x + icX) / 2, Math.max(tb.coldOut.y, icY) + L.bore * 0.25, sgn * icZ * 1.3],
                      [icX, icY + L.bore * 0.10, sgn * icZ * 0.9]], tb.coldTube * 1.05, MAT.alloy(), 12));
        continue;
      }
      if (sideTurbo){
        /* down at the turbo, forward low along the block, into the core — a
           charge pipe is plumbing that hugs the engine, not a brace across it */
        const lowY = L.crankR * 0.45;
        const runZ = Math.abs(tb.pos.z) + tb.size * 0.35;
        const stub2 = tubeMesh(tb.axialTube * 1.16, tb.axialTube * 0.98,
                               tb.size * 0.34, MAT.alloy(), 20);
        const axis2 = tb.coldIn.clone().sub(tb.pos).normalize();
        stub2.quaternion.setFromUnitVectors(V3(0, 1, 0), axis2);
        icG.add(at(stub2, tb.coldIn.x, tb.coldIn.y, tb.coldIn.z));
        cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                      [tb.coldOut.x - L.bore * 0.50, lowY + L.bore * 0.35, runZ],
                      [tb.coldOut.x - L.bore * 1.10, lowY, runZ],
                      [frontX - L.bore * 0.40, lowY, runZ],
                      [icX + L.bore * 0.70, (lowY + icY) / 2, icZ * 0.9],
                      [inTank.x, inTank.y, Math.abs(inTank.z)]],
                     tb.coldTube * 1.05, MAT.alloy(), 12));
        continue;
      }
      /* The compressor draws through a hose from the airbox, so what is on its
         mouth is an inlet stub and a hose clamp — not a trumpet. A bellmouth
         the size of the housing reads as an air filter, and an engine with a
         turbo does not have one sitting on the engine. */
      const axis = tb.coldIn.clone().sub(tb.pos).normalize();
      const stub = tubeMesh(tb.axialTube * 1.16, tb.axialTube * 0.98,
                            tb.size * 0.34, MAT.alloy(), 20);
      stub.quaternion.setFromUnitVectors(V3(0, 1, 0), axis);
      icG.add(at(stub, tb.coldIn.x, tb.coldIn.y, tb.coldIn.z));
      const boot = tubeMesh(tb.axialTube * 1.30, tb.axialTube * 1.10,
                            tb.size * 0.16, MAT.rubber(), 18);
      boot.quaternion.setFromUnitVectors(V3(0, 1, 0), axis);
      icG.add(at(boot, tb.coldIn.x + axis.x * tb.size * 0.30,
                       tb.coldIn.y + axis.y * tb.size * 0.30,
                       tb.coldIn.z + axis.z * tb.size * 0.30));
      /* out of the compressor, round the front of the engine, into the core */
      icG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                    [tb.coldOut.x - L.bore * 0.45,
                     tb.coldOut.y + L.bore * (frontTurbo ? 0.70 : 0.10),
                     tb.coldOut.z + sgn * L.bore * 0.35],
                    [icX + L.bore * 0.70, (tb.coldOut.y + icY) / 2, sgn * icZ],
                    [inTank.x, inTank.y, sgn * Math.abs(inTank.z)]],
                   tb.coldTube * 1.05, MAT.alloy(), 12));
    }
    /* and the single cold pipe back from the core to the throttle body */
    if (icSide){ /* each side core already runs to the throttle */ }
    else if (icTop) cpG.add(pipe([[icX - L.bore * 0.9, icY, 0], [thrAt.x - M(40), (icY + thrAt.y) / 2, thrAt.z * 0.5], [thrAt.x - M(70), thrAt.y, thrAt.z]], L.bore * 0.150, MAT.alloy(), 12));
    else cpG.add(pipe([[outTank.x, outTank.y, outTank.z],
                  [frontX - L.bore * 0.70, L.deckH * 0.62, -icZ * 1.02],
                  [frontX - L.bore * 0.10, thrAt.y + L.bore * 0.28, -L.bore * 0.90],
                  [thrAt.x - M(70), thrAt.y, thrAt.z]],
                 L.bore * 0.150, MAT.alloy(), 12));
    add('intercooler', icG);
    if (cpG !== icG) add('chargepipes', cpG);

    /* the blow-off valve sits on that cold pipe, right before the throttle,
       because that is the only place the trapped charge has to go */
    const bovG = group('bov');
    bovG.add(at(lathe([[0, -M(24)], [M(30), -M(24)], [M(33), -M(10)], [M(33), M(16)],
                       [M(26), M(26)], [0, M(26)]], MAT.blue(), 22),
                bovAt.x, bovAt.y + M(26), bovAt.z));
    bovG.add(at(cyl(M(16), M(16), M(34), MAT.alloyDark(), 16), bovAt.x, bovAt.y + M(2), bovAt.z));
    add('bov', bovG);
  }
  if (has('blower')){
    /* a Roots blower sits on the vee and is driven off the crank nose */
    const bg = superchargerMesh(L.len * 0.78, L.bore * 0.98, L.bore * 0.60, MAT.alloyDark());
    at(bg, -L.len * 0.02, inducY - L.bore * 0.10, 0);
    anim.pulleys.push({ node:bg.userData.pulley, ratio:2.2 });
    add('blower', bg);
    /* the charge cooler in the lid, between the rotors and the ports */
    add('intercooler', at(coreMesh(L.bore * 0.86, M(56), L.len * 0.66,
                                   { body:MAT.alloy() }, 20),
                          0, inducY - L.bore * 0.26, 0));
  }

  /* a road engine casts its manifold in iron, which goes brown-grey and rusty; a
     race or bike engine runs fabricated tube headers that scale and tint */
  const exMat = (e.class === 'race' || e.class === 'bike' || e.exhaust === 'headers') ? MAT.hot() : MAT.ironHot();
  /* ---- exhaust ---- */
  const exG = group('ex');
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const side = L.banks >= 2 ? exSide(b) : 1;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.34, side * L.bore * 0.70);
    if (nitro){
      /* zoomies: one short upswept pipe per port, nothing collected */
      exG.add(pipe([[p.x, py, pz],
                    [p.x + L.bore * 0.25, py + L.bore * 0.35, pz + side * L.bore * 0.45],
                    [p.x + L.bore * 0.75, py + L.bore * 1.30, pz + side * L.bore * 0.95]], M(28), MAT.hot(), 10));
      continue;
    }
    /* out of the port, down the outside of the engine, then in to the
       collector. Every waypoint is taken off the port's own position — a
       primary that heads for a fixed z runs back through the block. */
    if (sideTurbo){
      /* An inline engine's manifold is a log along the head with a short
         primary dropping into it from each port, and the turbine bolted to the
         middle of it. The whole hot side sits at head height — which is what
         you see on a diesel six or a modern four, and why the turbo is the
         first thing on the engine you can reach. */
      exG.add(pipe([
        [p.x, py, pz],
        [p.x, py - L.bore * 0.06, pz + side * L.bore * 0.30],
        [p.x, colY + L.bore * 0.06, side * colZ * 0.94],
        [p.x, colY, side * colZ],
      ], M(19), exMat, 8));
      continue;
    }
    const outZ = pz + side * L.bore * 0.34;
    const runZ = side * Math.max(Math.abs(outZ), colZ * 1.18);
    /* a turbocharged vee's primaries sweep forward into the turbine bolted to
       the front corner; everything atmospheric collects at the back */
    const tb = frontTurbo ? (turbos[b % turbos.length] || turbos[0]) : null;
    exG.add(pipe([
      [p.x, py, pz],
      [p.x, py - L.bore * 0.38, outZ],
      [p.x, flat ? -L.bore * 0.55 : L.crankR * 1.45, runZ],
      [(p.x + colX) / 2, flat ? -L.crankR * 1.3 : L.crankR * (frontTurbo ? 1.15 : 0.95), side * colZ * 1.08],
      [colX + (frontTurbo ? L.bore * 0.30 : 0), colY, side * colZ * (frontTurbo ? 0.92 : 1)],
      tb ? [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z] : [colX, colY, side * colZ],
    ], M(16), exMat, 8));
  }
  if (sideTurbo && turbos.length){
    /* the log, and one short pipe out of it into each turbine — dropped
       straight down from the log above the turbo, not reached across from
       somewhere else on the engine */
    exG.add(at(rot(cyl(M(32), M(32), L.len * 0.88, exMat, 18), 0, 0, Math.PI / 2),
               0, colY, colZ));
    for (const tb of turbos)
      exG.add(pipe([[tb.pos.x, colY, colZ],
                    [(tb.pos.x + tb.hotIn.x) / 2, (colY + tb.hotIn.y) / 2, (colZ + tb.hotIn.z) / 2],
                    [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z]], tb.hotTube * 0.94, exMat, 10));
  }
  /* the collector itself: a cone that gathers the primaries and hands them on */
  if (!frontTurbo && !sideTurbo && !nitro)
   for (const side of (L.banks >= 2 ? [-1, 1] : [1]))
    exG.add(at(lathe([[M(26), -M(34)], [M(30), -M(10)], [M(24), M(22)], [M(24), M(34)]],
                     exMat, 22).rotateZ(Math.PI / 2),
               colX + M(30), colY, side * colZ));
  /* the manifold bolts to a real port flange, not to thin air */
  for (const bk of (L.banks >= 2 ? [-1, 1] : [1])){
    const fl = portFlange(Math.max(1, Math.round(e.cyl / L.banks)), L.bore * 0.26,
                          L.len / Math.max(1, e.cyl / L.banks), M(11), MAT.iron());
    rot(fl, 0, 0, 0);
    fl.rotation.y = Math.PI / 2;
    const bIdx = L.banks >= 2 ? (bk > 0 ? (bankSign(0) > 0 ? 0 : 1) : (bankSign(0) > 0 ? 1 : 0)) : 0;
    const [fy, fz] = portAt(bIdx, L.deckH + L.bore * 0.34, bk * L.bore * 0.70);
    fl.rotation.x = L.bankAngles[bIdx] || 0;
    at(fl, 0, fy, fz);
    exG.add(fl);
  }
  /* on a turbo engine the collector hands the gas to the turbine, so the last
     length of manifold is the pipe that reaches the housing */
  for (const tb of turbos)
    exG.add(pipe([[colX + M(30), colY, tb.side * colZ],
                    [(colX + tb.hotIn.x) / 2, (colY + tb.hotIn.y) / 2, tb.side * colZ * 1.04],
                    [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z]], tb.hotTube * 0.92, exMat, 10));
  add('exmanifold', exG);

  /* The downpipe starts where the gas actually leaves: the turbine's axial
     mouth on a turbo engine, the collector on everything else. A vee collects
     twice, so the second side crosses under the sump and joins the first. */
  const dpG = group('dp');
  const tail = frontTurbo ? new THREE.Vector3(L.len * 0.78, -L.crankR * 1.15, colZ * 0.62)
             : sideTurbo  ? new THREE.Vector3(L.len * 0.72, -L.crankR * 1.30, colZ * 0.72)
             : new THREE.Vector3(colX + L.len * 0.46, L.crankR * 0.05, colZ * 1.05);
  const starts = turbos.length
    ? turbos.map(tb => ({ p:tb.hotOut, r:tb.axialTube * 0.86 }))
    : (L.banks >= 2 ? [-1, 1] : [1]).map(side =>
        ({ p:new THREE.Vector3(colX + M(30), colY, side * colZ), r:M(24) }));
  const join = frontTurbo ? new THREE.Vector3(L.len * 0.40, -L.crankR * 1.05, colZ * 0.70)
             : sideTurbo  ? new THREE.Vector3(L.len * 0.34, -L.crankR * 1.10, colZ * 0.88)
             : new THREE.Vector3(colX + L.len * 0.30, L.crankR * 0.15, colZ * 1.02);
  for (const st of starts)
    dpG.add(pipe([[st.p.x, st.p.y, st.p.z],
                  [st.p.x + L.len * (frontTurbo ? 0.26 : 0.10),
                   st.p.y - L.bore * (frontTurbo ? 0.55 : sideTurbo ? 1.30 : 0.28),
                   st.p.z * (frontTurbo ? 1.12 : sideTurbo ? 1.02 : 0.86)],
                  [join.x, join.y, join.z]], st.r, MAT.iron(), 10));
  dpG.add(pipe([[join.x, join.y, join.z], [tail.x, tail.y, tail.z]], M(26), MAT.iron(), 10));
  add('exhaust', dpG);
  addPuffs(root, anim, tail, L.bore);

  /* ---- gaskets, seals and the small hardware that goes with them ----------
     Every exploded-view diagram of an engine spends half its labels on these:
     head cover gasket and its rubber grommets, intake and exhaust manifold
     gaskets, water pump gasket, pan gasket with its drain bolt and crush
     washer, the front and rear crank seals.  They are the parts a rebuild is
     actually made of — you never re-use one — so they are modelled, named and
     removable rather than assumed.  Each is built off the same numbers as the
     part it seals, so it lands on the joint and not near it. */
  {
    const gk = (id) => { const g = group(id); return g; };
    const plate = (w, h, d) => box(w, h, d, MAT.gasket());

    /* --- cylinder head cover gasket, and the grommets under its bolts --- */
    if (!ohv || !airCooled){
      const vgG = gk('vcgasket');
      for (let b = 0; b < nBanksHead; b++){
        const a = L.bankAngles[b] ?? 0;
        const hold = (obj, y, z = 0) => {
          const g = group('g'); g.add(obj);
          obj.position.set(obj.position.x, y, z); g.rotation.x = a; return g;
        };
        /* the gasket is a frame, not a slab: two rails and two ends */
        const gw = L.len * 0.98, gd = L.bore * 1.36, lip = L.bore * 0.10;
        for (const zs of [-1, 1])
          vgG.add(hold(plate(gw, M(4), lip), L.deckH + L.bore * 1.17, zs * (gd - lip) / 2));
        for (const xs of [-1, 1]){
          const end = plate(lip, M(4), gd - lip * 2);
          end.position.x = xs * (gw - lip) / 2;
          vgG.add(hold(end, L.deckH + L.bore * 1.17));
        }
        /* the rubber grommets the cover bolts pull down through */
        const nb = Math.max(4, e.cyl + 2);
        for (let i = 0; i < nb; i++){
          const gx = (i / (nb - 1) - 0.5) * gw * 0.92;
          for (const zs of [-1, 1]){
            const gm = tubeMesh(M(11), M(5.5), M(9), MAT.rubber(), 12);
            gm.position.x = gx;
            vgG.add(hold(gm, L.deckH + L.bore * 1.20, zs * (gd - lip) / 2));
          }
        }
      }
      add('vcgasket', vgG);
    }

    /* --- intake and exhaust manifold gaskets, on the two port faces --- */
    const igG = gk('intgasket'), egG = gk('exgasket');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      const a = L.bankAngles[b] ?? 0;
      for (const [side, grp, r] of [[inSide(b), igG, L.bore * 0.24],
                                    [exSide(b), egG, L.bore * 0.21]]){
        const [gy, gz] = portAt(b, L.deckH + L.bore * 0.34, side * L.bore * 0.78);
        /* a flat plate with the port cut through it */
        const ring = tubeMesh(r * 1.62, r, M(3), MAT.gasket(), 20);
        ring.rotation.set(Math.PI / 2 + a, 0, 0);
        grp.add(at(ring, p.x, gy, gz));
      }
    }
    add('intgasket', igG); add('exgasket', egG);

    /* --- oil pan gasket, drain bolt and its crush washer --- */
    const pgG = gk('pangasket');
    const pw = L.len * 0.94, pd = L.bore * 1.35, prail = -L.crankR * 1.9 + L.crankR * 0.75;
    for (const zs of [-1, 1])
      pgG.add(at(plate(pw, M(4), M(14)), 0, prail, zs * (pd - M(14)) / 2));
    for (const xs of [-1, 1])
      pgG.add(at(plate(M(14), M(4), pd - M(28)), xs * (pw - M(14)) / 2, prail, 0));
    /* the drain bolt hangs out of the lowest corner of the pan, with a soft
       copper washer under its head that is meant to be crushed once */
    const dx = pw * 0.40, dy = -L.crankR * 1.9 - L.crankR * 0.74, dz = pd * 0.30;
    pgG.add(at(rot(bolt(M(11), M(18), MAT.steel()), Math.PI, 0, 0), dx, dy, dz));
    pgG.add(at(tubeMesh(M(11), M(6), M(2.5), MAT.copper(), 16),
               dx, dy + M(3), dz));
    add('pangasket', pgG);

    /* --- crank seals: one in the front cover, one behind the flywheel --- */
    const slG = gk('seals');
    const sealR = L.crankR * 0.62;
    for (const [k, [sx, depth]] of [[frontX - M(14), M(12)], [L.len / 2 + M(26), M(14)]].entries()){
      const sl = tubeMesh(sealR * 1.34, sealR, depth, MAT.rubber(), 24);
      sl.rotation.z = Math.PI / 2;
      each('seals', k, at(sl, sx, 0, 0));
    }
    flush('seals');
  }

  /* ---- cooling / accessories ---- */
  /* the accessories all drive off one belt, so their pulleys have to land on
     one plane — that plane is the crank damper's */
  const beltX = frontX - M(46);
  const beltRun = [{ y:0, z:0, r:L.bore * 0.85 }];
  if (has('waterpump')){
    const wpSize = L.bore * 1.15;
    const wp = waterPumpMesh(wpSize);
    anim.pulleys.push({ node:wp.userData.pulley, ratio:1.5 });
    /* a vee's pump sits on the centreline of the front cover; an inline's is
       offset toward the intake side (realism.md §2.2) */
    const wpZ = L.banks >= 2 ? 0 : -L.bore * 0.4, wpY = flat ? L.bore * 0.55 : L.deckH * 0.55;
    add('waterpump', at(wp, beltX + wpSize * 0.34, wpY, wpZ));
    if (has('fanclutch')){
      /* the viscous coupling on the pump nose, and the seven-blade fan it drives */
      const fc = group('fanclutch');
      fc.add(rot(cyl(M(55), M(46), M(40), MAT.alloyDark(), 20), 0, 0, Math.PI / 2));
      const fb = bladedWheel(L.deckH * 0.48, 7, M(40), MAT.black(), 0.7);
      rot(fb, 0, 0, Math.PI / 2); fb.position.x = -M(30); fc.add(fb); anim.fans.push(fb);
      add('fanclutch', at(fc, beltX - M(34), wpY, wpZ));
    }
    /* the pump bolts to the block through its own paper gasket — the one every
       diagram draws as a separate orange outline beside the pump */
    const wg = tubeMesh(wpSize * 0.46, wpSize * 0.30, M(3), MAT.gasket(), 24);
    wg.rotation.z = Math.PI / 2;
    add('wpgasket', at(wg, beltX + wpSize * 0.60, wpY, wpZ));
    beltRun.push({ y:wpY, z:wpZ, r:wpSize * 0.42 });
  }
  if (has('radiator')){
    /* A radiator is not bolted to the front of the engine. It is at the nose of
       the car with the belt drive, the fan and a hand's width of air between
       the two — this was standing nine millimetres off the block face, with the
       fan cutting into the crank pulley. */
    const rad = group('rad');
    rad.add(coreMesh(L.bore * 3.9, L.deckH * 1.15, M(44), {}, 30));
    const fan = bladedWheel(L.deckH * 0.52, 7, M(52), MAT.black(), 0.7);
    rot(fan, 0, Math.PI/2, 0);
    fan.position.x = M(56);                       // on the engine side of the core
    /* the fan on the core only when the engine has no fan of its own */
    if (!has('fanclutch') && !has('efans')){ rad.add(fan); anim.fans.push(fan); }
    /* a transverse bike engine's radiator hangs ahead of the cylinders (+Z) */
    if (e.class === 'bike') add('radiator', at(rot(rad, 0, Math.PI / 2, 0), 0, L.deckH * 0.95, L.bore * 2.3));
    else add('radiator', at(rad, frontX - L.bore * 3.10, L.deckH * 0.58, 0));
  }
  if (has('fins')){
    /* Air-cooled means the fin area IS the cooling system, and on a flat six it
       means a belt-driven axial fan sitting on top of the crankcase behind a
       shroud that ducts its air down over the barrels. Take the fan off a 911
       motor and you are looking at the same engine with a hole in the top. */
    const fg = group('fins');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
      /* fins on the head as well as the barrel — the head is the hot end */
      for (let f = 0; f < 5; f++){
        const [fy, fz] = portAt(b, L.deckH + L.bore * (0.30 + f * 0.16), 0);
        const fin = tubeMesh(L.bore * 0.78, L.bore * 0.56, M(4), MAT.alloyDark(), 20);
        fin.rotation.x = Math.PI / 2 + (L.bankAngles[b] || 0);
        fg.add(at(fin, p.x, fy, fz));
      }
    }
    if (L.banks >= 2 && Math.abs(deg(90) - Math.abs(L.bankAngles[0] || 0)) < 0.2 && e.class !== 'bike'){
      /* the fan and its shroud, on a flat engine (a boxer bike has no fan) */
      const fanR = L.bore * 0.86;
      const fan = bladedWheel(fanR, 11, M(46), MAT.red(), 0.55);
      rot(fan, 0, 0, Math.PI / 2);
      at(fan, -L.len * 0.42, L.deckH * 0.30 + fanR * 0.30, 0);
      anim.fans.push(fan);
      fg.add(fan);
      fg.add(at(rot(tubeMesh(fanR * 1.16, fanR * 1.02, M(70), MAT.alloyDark(), 26), 0, 0, Math.PI/2),
                -L.len * 0.42, L.deckH * 0.30 + fanR * 0.30, 0));
      /* the belt from the crank nose up to the fan */
      for (const sgn of [-1, 1])
        fg.add(pipe([[-L.len * 0.42, L.deckH * 0.30 + fanR * 0.30, sgn * fanR * 1.04],
                     [frontX * 0.86, L.crankR * 0.80, sgn * L.crankR * 1.10],
                     [frontX - M(30), 0, sgn * L.crankR * 1.16]], M(9), MAT.rubber(), 8));
    } else {
      /* no fan on a vee or single: the barrel and head fins carry the part */
    }
    add('fins', fg);
  }

  /* a harmonic damper, not a disc: V-ribs, bonded rubber ring, bolt circle */
  /* 150–170 mm across on a road engine: 0.85 of a bore in radius, not half */
  const pulley = crankDamper(L.bore * 0.85, M(46), MAT.iron());
  at(pulley, frontX - M(46), 0, 0);
  anim.pulleys.push({ node:pulley, ratio:1 });
  add('crankpulley', pulley);

  const altSize = L.bore * 1.35;
  const alt = alternatorMesh(altSize);
  anim.pulleys.push({ node:alt.userData.pulley, ratio:2.6 });
  /* the alternator hangs off the front of the engine on its own bracket, out
     past the widest point of the casting — not tucked into the vee */
  const altY = flat ? L.bore * 1.25 : L.deckH * 0.78, altZ = flat ? -L.bore * 0.4 : -(outerZ + altSize * 0.30);
  add('alternator', at(alt, beltX + altSize * 0.56, altY, altZ));
  beltRun.push({ y:altY, z:flat ? altZ : -L.bore * 0.92, r:altSize * 0.34 });

  /* an idler and a spring-loaded tensioner, which is what makes the run work */
  for (const [y, z, r, id] of [[L.deckH * 0.24, -L.bore * 1.00, L.bore * 0.24, 'idler'],
                               [L.deckH * 0.96, -L.bore * 0.20, L.bore * 0.21, 'tensioner']]){
    const idl = lathe([[r * 0.30, -M(13)], [r, -M(13)], [r, M(13)], [r * 0.30, M(13)]],
                      MAT.black(), 26);
    rot(idl, 0, 0, Math.PI / 2);
    const arm = box(r * 1.5, r * 0.42, M(14), MAT.steel());
    at(arm, M(16), 0, 0);
    const grp = group(id, idl, arm);
    at(grp, beltX, y, z);
    anim.pulleys.push({ node:idl, ratio:2.0 });
    add(tree.byId['accbelt'] ? 'accbelt' : 'crankpulley', grp);
    beltRun.push({ y, z, r });
  }

  /* and the belt itself, run round the outside of the whole set */
  const belt = serpentineBelt(beltRun, beltX, M(26), MAT.rubber());
  if (belt) add(tree.byId['accbelt'] ? 'accbelt' : 'crankpulley', belt);

  /* a bike's starter lies behind the cylinders on top of the crankcase; a
     car's hangs off the bellhousing flank with its pinion on the ring gear */
  add('starter', e.class === 'bike'
    ? at(starterMesh(L.bore * 1.3), L.len * 0.05, L.crankR * 1.75, -L.bore * 1.15)
    : flat ? at(starterMesh(L.bore * 1.6), L.len * 0.42, L.bore * 0.95, -L.bore * 0.55)
    : at(starterMesh(L.bore * 1.6), L.len * 0.42, -L.bore * 0.52, (/toyota|nissan|honda|mazda|subaru|bmw|mercedes|porsche|audi|volkswagen|lexus/i.test(e.maker || '') ? -1 : 1) * L.bore * 1.42));
  if (has('mounts')){
    /* a bracket off each flank of the block onto a rubber mount — the two
       points the whole engine hangs from */
    for (const [k, zs] of [-1, 1].entries()){
      const mg = group('mount');
      mg.add(roundBox(M(70), M(36), M(26), .006, MAT.alloyDark()));
      mg.add(at(box(M(60), M(30), M(40), MAT.rubber()), 0, -M(28), zs * M(20)));
      mg.add(at(roundBox(M(70), M(8), M(80), .004, MAT.steel()), 0, -M(46), zs * M(20)));
      each('mounts', k, at(mg, L.len * 0.04, L.crankR * 0.35, zs * (wCase + M(28))));
    }
    flush('mounts');
  }

  /* the flywheel carries a real starter ring gear — that is what the starter
     pinion engages, and its tooth count sets the cranking ratio */
  /* a ring gear is 280–300 mm across on a car engine: 1.55 bores in radius,
     not one — and the starter pinion has to sit on it, outside the block */
  const fwR = L.bore * (e.class === 'bike' ? 1.05 : 1.55);
  const fw = flywheelMesh(fwR, M(34), MAT.iron(), Math.round(fwR * 720), !has('flywheelbolts'));
  at(fw, L.len/2 + M(28), 0, 0);
  anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  const cl = clutchMesh(fwR * 0.82, M(52), MAT.steel());
  add('clutch', at(cl, L.len/2 + M(70), 0, 0));

  /* ---- sensors, wiring, plumbing ----
   * From here down is everything that actually covers an engine: the sensors
   * screwed into it, the loom that joins every one of them back to the ECU,
   * the coolant and oil lines, the vacuum runs and the shields over the hot
   * parts. Each is placed against the face it really mounts to, and each one
   * that has a plug has its lead run to the loom rather than left dangling.
   */
  const caseZ = L.bore * 0.92;                       // the block's own half-width
  const sensorSize = L.bore * 0.34;
  /* the outward normal of a bank's outer face, and of its inner (valley) face */
  const bankOut = (b) => { const [ny, nz] = portAt(b, 0, bankSign(b)); return V3(0, ny, nz); };
  const bankUp  = (b) => { const [ny, nz] = portAt(b, 1, 0); return V3(0, ny, nz); };

  /* stand a part on a surface so its own +Y becomes that surface's normal */
  const standOn = (obj, n) => {
    obj.quaternion.setFromUnitVectors(V3(0, 1, 0), n.clone().normalize());
    return obj;
  };
  /* every device the harness has to reach, in the order the loom meets them */
  const plugs = [];
  /* Every bolt-on part stands a few millimetres proud of the face it bolts to.
     A sensor sunk flush into a casting is invisible, and this is a workshop you
     are meant to be able to point at things in. */
  const STANDOFF = M(5);
  const fitSensor = (id, kind, pos, normal) => {
    const m = standOn(sensorMesh(kind, sensorSize), normal);
    const seat = pos.clone().addScaledVector(normal.clone().normalize(), STANDOFF);
    m.position.copy(seat);
    plugs.push(m.userData.lead.clone().applyQuaternion(m.quaternion).add(seat));
    add(id, m);
    return m;
  };

  if (has('crksensor')){
    /* crank position reads the reluctor on the damper, so it bolts to the
       block flank right beside it; cam position reads the wheel on the front
       of the camshaft and bolts to the head */
    fitSensor('crksensor', 'flange', V3(frontX + L.len * 0.10, -L.crankR * 0.45, caseZ), V3(0, 0, 1));
    for (let b = 0; b < nBanksHead; b++){
      const [py, pz] = portAt(b, L.deckH + L.bore * 0.95, bankSign(b) * L.bore * 0.72);
      fitSensor('crksensor', 'flange', V3(frontX + L.len * 0.07, py, pz), bankOut(b));
    }
  }
  const thrZone = thrAt.z;
  if (has('mapsensor')){
    /* manifold pressure is read where the manifold is: on top of the plenum on
       a single-manifold engine, on the outboard one on a hot-V */
    const top = inducY + L.bore * (L.banks >= 2 ? 0.36 : 0.23);
    fitSensor('mapsensor', 'boss', V3(-L.len * 0.10, top, thrZone), V3(0, 1, 0));
    if (e.aspiration !== 'na')
      fitSensor('mapsensor', 'screw', V3(-L.len * 0.30, top, thrZone), V3(0, 1, 0));
  }
  if (has('knock')){
    /* a knock sensor is a bolted-down accelerometer listening to the block
       itself — one per bank, between the middle cylinders */
    for (const sgn of (L.banks >= 2 ? [-1, 1] : [1]))
      fitSensor('knock', 'screw', V3(-L.len * 0.06, L.crankR * 1.15, sgn * caseZ), V3(0, 0, sgn));
  }
  if (has('o2')){
    /* lambda goes in the stream: after the turbine on a turbo engine, in the
       collector on everything else, and a second one after the catalyst */
    const first = turbos.length
      ? turbos[0].hotOut.clone().lerp(join, 0.45)
      : V3(colX + M(70), colY, colZ);
    fitSensor('o2', 'screw', first, V3(0, 0.6, turbos.length ? 0.8 : 1).normalize());
    fitSensor('o2', 'screw', tail.clone().lerp(join, 0.25), V3(0, 0.7, 0.7).normalize());
  }
  if (has('waterpump')){
    /* coolant temperature lives in the flow leaving the head, which is the one
       place the ECU can trust it */
    fitSensor('waterpump', 'screw', V3(frontX + M(26), L.deckH * 0.86, -L.bore * 0.16),
              V3(-0.2, 1, 0).normalize());
  }
  if (has('oilfilter'))
    fitSensor('oilfilter', 'screw', V3(L.len * 0.16, -L.crankR * 0.55, caseZ), V3(0, 0, 1));
  if (has('vvt'))
    for (let b = 0; b < nBanksHead; b++){
      const [py, pz] = portAt(b, L.deckH + L.bore * 1.10, -bankSign(b) * L.bore * 0.36);
      fitSensor('vvt', 'boss', V3(frontX + L.len * 0.14, py, pz), bankUp(b));
    }
  if (has('throttle'))
    plugs.push(thrAt.clone().add(V3(-M(30), L.bore * 0.20, 0)));
  /* The coils and the injectors are not wired one branch each from the ECU.
     Each bank gets a loom that runs the length of its cam cover, and each
     device taps off that with a lead a few centimetres long — which is both how
     it is done and the only way the engine does not end up inside a bird's
     nest. These are collected here and run in the harness below. */
  const runs = [];
  if (has('coils') && e.fuel !== 'diesel')
    for (let b = 0; b < nBanksHead; b++){
      const [ay, az] = portAt(b, L.deckH + L.bore * 1.66, -bankSign(b) * L.bore * 0.40);
      runs.push({ y:ay, z:az, r:M(9),
        taps: [...Array(e.cyl).keys()]
          .filter(i => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0) === b % 2)
          .map(i => { const [ty, tz] = portAt(b, L.deckH + L.bore * 1.62, 0);
                      return V3(cylPosition(e, i, L).x, ty, tz); }) });
    }
  if (has('injectors') && e.fuel !== 'diesel')
    for (let b = 0; b < nBanksHead; b++){
      const [ry0, rz0] = railAt(b);
      const up = L.banks >= 2 ? bankUp(b) : V3(0, 1, 0);
      const off = up.clone().multiplyScalar(M(34));
      runs.push({ y:ry0 + off.y, z:rz0 + off.z, r:M(8),
        taps: [...Array(e.cyl).keys()]
          .filter(i => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0) === b % 2)
          .map(i => V3(cylPosition(e, i, L).x, ry0, rz0)) });
    }
  if (has('alternator')) plugs.push(V3(beltX + L.bore * 0.70, L.deckH * 0.78, -L.bore * 1.20));
  if (has('starter'))    plugs.push(V3(L.len * 0.42, L.crankR * 0.30, L.bore * 1.05));

  if (has('ecu')){
    /* on a bracket off the side of the block, where one actually lives */
    const eg = group('ecu');
    const ez = -(L.bore * 0.92 + M(120)), ey = L.deckH * 0.42, ex = -L.len * 0.18;
    eg.add(roundBox(M(190), M(45), M(150), .01, MAT.plastic()));
    for (const dx of [-M(70), M(70)])                       // the mounting feet
      eg.add(at(box(M(26), M(8), M(150), MAT.alloyDark()), dx, -M(27), 0));
    eg.add(at(rot(box(M(150), M(10), M(70), MAT.alloyDark()), 0, 0, deg(-16)),
              0, -M(52), M(46)));                           // the bracket to the block
    /* the two header plugs, which is where the harness actually terminates */
    for (const dz of [-M(38), M(38)])
      eg.add(at(rot(connectorShell(M(64), M(30), M(52)), 0, 0, deg(-90)), M(100), 0, dz));
    add('ecu', at(eg, ex, ey, ez));

    /* The harness. A trunk leaves the ECU, runs up the side of the block and
       along the engine, and every plug on it is reached by a branch off the
       nearest point of that trunk — which is how a loom is actually built, and
       why an engine looks like an engine rather than a display model. */
    const trunk = [
      V3(ex + M(120), ey, ez),
      V3(ex + L.len * 0.10, ey + L.bore * 0.30, ez * 0.90),
      V3(L.len * 0.02, inducY - L.bore * 0.55, ez * 0.62),
      V3(L.len * 0.30, inducY - L.bore * 0.45, ez * 0.40),
    ];
    const hg = group('harness');
    hg.add(loomMesh(trunk, M(13)));
    const curve = new THREE.CatmullRomCurve3(trunk);
    /* branch from wherever on the trunk is nearest, so no branch crosses the
       engine to get somewhere the trunk already passes */
    const nearestOnTrunk = (target) => {
      let best = null, bestD = Infinity;
      for (let i = 0; i <= 24; i++){
        const q = curve.getPointAt(i / 24), d = q.distanceTo(target);
        if (d < bestD){ bestD = d; best = q; }
      }
      return { point:best, dist:bestD };
    };
    const branch = (target, r) => {
      const { point, dist } = nearestOnTrunk(target);
      const mid = point.clone().lerp(target, 0.55);
      mid.y -= dist * 0.14;                                 // looms sag
      const br = loomMesh([point, mid, target], r);
      if (br) hg.add(br);
    };
    for (const target of plugs) branch(target, M(6));
    /* the bank runs, each fed once and then tapped along its length */
    for (const run of runs){
      const x0 = -L.len * 0.42, x1 = L.len * 0.42;
      const a = V3(x0, run.y, run.z), b = V3(x1, run.y, run.z);
      hg.add(loomMesh([a, V3(0, run.y, run.z), b], run.r));
      branch(a, run.r * 0.85);
      for (const t of run.taps){
        const on = V3(t.x, run.y, run.z);
        hg.add(loomMesh([on, on.clone().lerp(t, 0.55), t], M(5)));
        hg.add(at(standOn(connectorShell(M(26), M(18), M(20)),
                          t.clone().sub(on).normalize().negate()), t.x, t.y, t.z));
      }
    }
    /* and the earth straps, which are the half of the electrical system people
       forget until nothing works */
    hg.add(groundStrap(V3(ex + M(60), ey - M(40), ez + M(20)),
                       V3(-L.len * 0.30, L.crankR * 0.60, -caseZ), M(6)));
    for (let b = 0; b < nBanksHead; b++){
      const [py, pz] = portAt(b, L.deckH + L.bore * 0.30, -bankSign(b) * L.bore * 0.70);
      if (b === 0) hg.add(groundStrap(V3(-L.len * 0.34, py, pz),
                                      V3(-L.len * 0.40, L.crankR * 1.20, -caseZ), M(5)));
    }
    add('ecu', hg);
  }
  if (has('vvt')){
    const vg = group('vvt');
    for (let b = 0; b < nBanksHead; b++){
      const a = L.bankAngles[b] ?? 0;
      const g = group('x');
      g.add(at(rot(tubeMesh(L.crankR*1.15, L.crankR*0.4, M(30), MAT.alloy(), 22), 0,0,Math.PI/2), frontX + M(4), L.deckH + L.bore*1.00, 0));
      g.rotation.x = a; vg.add(g);
    }
    add('vvt', vg);
  }

  /* ---- plumbing ----
   * Coolant, oil, fuel and vacuum. Each run starts on the fitting it leaves
   * and ends on the fitting it reaches, with a clamp at both ends, because a
   * hose that stops short of its stub is the single loudest tell that a model
   * was assembled by eye.
   */
  const hoseRun = (pts, r, mat) => {
    const v = pts.map(q => q.isVector3 ? q : V3(...q));
    const g = group('hose');
    g.add(pipe(v, r, mat || MAT.rubber(), 10));
    const c = new THREE.CatmullRomCurve3(v);
    for (const t of [0.035, 0.965]){
      const cl = hoseClamp(r * 1.06);
      cl.quaternion.setFromUnitVectors(V3(0, 1, 0), c.getTangentAt(t).normalize());
      cl.position.copy(c.getPointAt(t));
      g.add(cl);
    }
    return g;
  };

  /* coolant: out of the head through the thermostat, round the radiator, back
     into the pump — plus the heater circuit that taps off the same flow */
  let statOut = V3(frontX, L.deckH * 0.86, -L.bore * 0.16);
  if (has('waterpump')){
    const st = thermostatMesh(L.bore * 0.30);
    st.rotation.y = Math.PI;                            // the neck faces forward
    at(st, frontX + M(14), L.deckH * 0.86, -L.bore * 0.16);
    statOut = st.userData.outlet.clone().applyEuler(st.rotation).add(st.position);
    add(tree.byId['thermostat'] ? 'thermostat' : 'waterpump', st);
    if (has('ect'))
      add('ect', at(rot(cyl(M(7), M(9), M(26), MAT.plated(), 10), 0, 0, Math.PI / 2),
                    st.position.x - M(38), st.position.y + M(8), st.position.z));
    const pumpIn = V3(beltX + L.bore * 0.30, L.deckH * 0.36, -L.bore * 0.82);
    if (has('radiator') && e.class !== 'bike'){
      const radX = frontX - L.bore * 3.10;      // where the core actually is
      add('radiator', hoseRun([statOut,
                               V3(statOut.x - L.bore * 0.55, L.deckH * 1.00, -L.bore * 0.55),
                               V3(radX + M(30), L.deckH * 1.02, -L.bore * 0.95)],
                              L.bore * 0.115));
      add('radiator', hoseRun([V3(radX + M(30), L.deckH * 0.16, L.bore * 0.85),
                               V3(radX + L.bore * 0.60, L.deckH * 0.22, L.bore * 0.40),
                               pumpIn],
                              L.bore * 0.115));
      /* the coolant expansion bottle, and the little hose off the neck to it */
      const bot = group('bottle');
      bot.add(lathe([[0, 0], [L.bore * 0.36, M(6)], [L.bore * 0.36, L.bore * 0.72],
                     [L.bore * 0.20, L.bore * 0.80], [L.bore * 0.20, L.bore * 0.92],
                     [0, L.bore * 0.92]], MAT.plastic(), 20));
      at(bot, frontX - L.bore * 0.30, L.deckH * 0.92, -L.bore * 1.45);
      add('radiator', bot);
      add('radiator', hoseRun([statOut.clone().add(V3(0, M(18), 0)),
                               V3(frontX - L.bore * 0.34, L.deckH * 1.30, -L.bore * 1.05),
                               V3(frontX - L.bore * 0.30, L.deckH * 1.42, -L.bore * 1.45)],
                              L.bore * 0.045));
    }
    /* heater feed and return, off the back of the head and into the pump */
    const [hy, hz] = portAt(0, L.deckH + L.bore * 0.18, -bankSign(0) * L.bore * 0.40);
    for (const [i, dz] of [[0, -M(34)], [1, M(34)]])
      add(tree.byId['bypasspipe'] ? 'bypasspipe' : 'waterpump', hoseRun([V3(L.len * 0.40, hy - i * M(46), hz + dz),
                                V3(L.len * 0.24, L.deckH * 0.72, hz * 0.6 + dz * 2),
                                V3(beltX + L.bore * 0.42, L.deckH * 0.50 - i * M(30), -L.bore * 0.62)],
                               L.bore * 0.055));
  }

  /* oil: the turbo has to be fed from the gallery and drained to the sump, and
     the engine has to be dipped and filled */
  for (const tb of turbos){
    if (has('turbo')){
      const tl = group('turbolines');
      /* The feed is a braided line off a gallery boss on the block, and it
         ends on the top of the bearing housing. The drain is a fat hose off
         the bottom of the same housing into the side of the sump, and it has
         to fall the whole way — a turbo drains by gravity, so a drain that
         loops up anywhere is a turbo that smokes. Both ends land on something:
         a boss on the block, a flange on the pan. */
      /* the feed boss sits on the block beside its own turbo, so the line is
         a short drop — one per turbo, not two lines reaching across the log
         from the same spot like rigging */
      const feedAt = V3(tb.pos.x + L.bore * 0.30, L.crankR * 0.55, tb.side * caseZ);
      tl.add(at(rot(cyl(M(11), M(11), M(20), MAT.plated(), 12), 0, 0, Math.PI / 2),
                      feedAt.x, feedAt.y, feedAt.z + tb.side * M(9)));
      tl.add(braidedLine([feedAt,
                                V3((feedAt.x + tb.oilIn.x) / 2, (feedAt.y + tb.oilIn.y) / 2,
                                   tb.side * (caseZ + L.bore * 0.45)),
                                tb.oilIn], M(5)));
      tl.add(at(hexPrism(M(13), M(11), MAT.plated()), tb.oilIn.x, tb.oilIn.y, tb.oilIn.z));

      /* the drain flange, on the sump wall below and inboard of the turbo */
      const drainAt = V3(tb.oilOut.x - L.len * 0.06, -L.crankR * 1.42, tb.side * L.bore * 0.58);
      tl.add(hoseRun([tb.oilOut,
                            V3((tb.oilOut.x + drainAt.x) / 2,
                               (tb.oilOut.y + drainAt.y) / 2,
                               (tb.oilOut.z + drainAt.z) / 2 + tb.side * L.bore * 0.06),
                            drainAt], L.bore * 0.075));
      tl.add(at(rot(cyl(L.bore * 0.13, L.bore * 0.13, M(10), MAT.alloyDark(), 16),
                          Math.PI / 2, 0, 0),
                      drainAt.x, drainAt.y, drainAt.z));
          each('turbolines', turbos.indexOf(tb), tl);
      if (has('heatshields')){
        /* a stamped shield over the turbine housing so the bonnet and the loom do not cook */
        const hs = new THREE.Mesh(new THREE.CylinderGeometry(tb.size * 0.98, tb.size * 0.98, tb.size * 1.1, 18, 1, true, -Math.PI * 0.55, Math.PI * 1.1), MAT.plated());
        hs.material = hs.material.clone(); hs.material.side = THREE.DoubleSide;
        rot(hs, 0, 0, Math.PI / 2);
        each('heatshields', turbos.indexOf(tb), at(hs, tb.pos.x, tb.pos.y + tb.size * 0.08, tb.pos.z));
      }
    }
    if (has('wastegate'))
      add('wastegate', hoseRun([tb.wgSignal,
                                tb.pos.clone().add(V3(0, tb.size * 0.62, tb.size * 0.42))],
                               M(4)));
  }
  flush('turbolines'); flush('heatshields');
  if (has('oilpan'))
    add('dipstick', dipstickMesh([V3(-L.len * 0.30, L.deckH * 0.62, -caseZ - M(26)),
                                V3(-L.len * 0.26, L.crankR * 0.40, -caseZ - M(16)),
                                V3(-L.len * 0.20, -L.crankR * 1.55, -L.bore * 0.55)], M(7)));
  if (has('oilfilter') && has('oilcooler')){
    /* the oil cooler: a stacked-plate core on the filter housing, fed and
       returned by two hoses off the block's gallery — the part the tree has
       been calling "filter & cooler" without ever drawing the cooler */
    const cool = coreMesh(L.bore * 1.30, L.bore * 0.72, M(52), { body:MAT.alloyDark() }, 14);
    const coolZ = outerZ + L.bore * 0.55;
    add('oilcooler', at(cool, L.len * 0.06, -L.crankR * 0.75, coolZ));
    add('oilcooler', hoseRun([V3(L.len * 0.20, -L.crankR * 0.90, outerZ + M(20)),
                              V3(L.len * 0.16, -L.crankR * 0.72, coolZ),
                              V3(L.len * 0.06 + L.bore * 0.55, -L.crankR * 0.62, coolZ)],
                             L.bore * 0.055));
    add('oilcooler', hoseRun([V3(L.len * 0.06 - L.bore * 0.55, -L.crankR * 0.62, coolZ),
                              V3(L.len * 0.00, -L.crankR * 0.20, coolZ * 0.92),
                              V3(L.len * 0.06, L.crankR * 0.45, caseZ + M(4))], L.bore * 0.055));
  }
  if (has('valvecover')){
    /* the filler cap and the breather both live on the cam cover, because that
       is the top of the crankcase once the engine is together */
    const [cy, cz] = portAt(0, L.deckH + L.bore * 1.52, -bankSign(0) * L.bore * 0.34);
    add('valvecover', at(standOn(fillerCap(L.bore * 0.22), bankUp(0)), -L.len * 0.34, cy, cz));
    const [vy, vz] = portAt(0, L.deckH + L.bore * 1.52, -bankSign(0) * L.bore * 0.10);
    const pcvAt = V3(L.len * 0.26, vy, vz);
    add('pcv', at(standOn(pcvValve(L.bore * 0.20), bankUp(0)), pcvAt.x, pcvAt.y, pcvAt.z));
    if (has('intake')){
      /* the breather hose goes back into the inlet tract, which on a hot-V is
         the plenum on that same bank rather than something in the middle */
      const [my, mz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.70 : 0.34)];
      add('pcv', hoseRun([pcvAt.clone().add(bankUp(0).multiplyScalar(L.bore * 0.24)),
                                 V3(L.len * 0.14, (pcvAt.y + my) / 2 + L.bore * 0.20, (pcvAt.z + mz) / 2),
                                 V3(-L.len * 0.02, my, mz)], L.bore * 0.055));
    }
  }
  if (has('intake')){
    /* the brake servo take-off: the biggest vacuum line on the engine */
    const [sy, sz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.72 : 0.36)];
    if (e.class !== 'bike'){
      const end = V3(L.len * 0.44, sy + L.bore * 0.28, sz * 1.45 + L.bore * 0.50);
      add('intake', hoseRun([V3(L.len * 0.24, sy, sz),
                             V3(L.len * 0.36, sy + L.bore * 0.40, sz * 1.25 + L.bore * 0.30), end],
                            L.bore * 0.075));
      /* the one-way valve the servo line runs through */
      add('intake', at(rot(cyl(M(13), M(13), M(42), MAT.plastic(), 12), Math.PI / 2, 0, 0), end.x, end.y, end.z + Math.sign(sz) * M(20)));
    }
  }
  if (has('fuelrail')){
    const [railY, railZ] = railAt(0);
    add('fuelrail', braidedLine([V3(L.len * 0.42, L.crankR * 1.10, railZ * 1.30),
                                 V3(L.len * 0.48, railY - L.bore * 0.30, railZ * 1.05),
                                 V3(L.len * 0.44, railY, railZ)], M(5)));
    if (has('hpfp')){
      const [hy, hz] = L.banks >= 2 ? [inducY - L.bore * 0.30, -L.bore * 0.55]
                                    : [L.deckH + L.bore * 0.70, -L.bore * 1.02];
      add('hpfp', braidedLine([V3(-L.len * 0.38 + M(30), hy, hz),
                               V3(-L.len * 0.30, (hy + railY) / 2 + L.bore * 0.20, (hz + railZ) / 2),
                               V3(-L.len * 0.42, railY, railZ)], M(5)));
    }
  }
  if (has('bov'))
    /* the signal line that tells it the throttle has shut */
    add('bov', hoseRun([bovAt.clone().add(V3(0, M(58), 0)),
                        bovAt.clone().lerp(thrAt, 0.5).add(V3(0, L.bore * 0.34, 0)),
                        thrAt.clone().add(V3(M(40), M(46), 0))], M(4)));

  /* the catalyst, in the downpipe where it has to be to light off, with the
     lambda sensors already sitting either side of it */
  if (has('exhaust')){
    const catAt = join.clone().lerp(tail, 0.30);
    const dir = tail.clone().sub(join).normalize();
    const catLen = L.len * 0.22, catR = L.bore * 0.34;
    const turn = new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), dir);
    const cat = canBody(catLen, catR);
    cat.quaternion.copy(turn);
    cat.position.copy(catAt);
    add('exhaust', cat);
    /* and its shield, wrapped on the can and turned with it */
    const sh = heatShield(catR * 1.22, catLen * 0.76, deg(200));
    sh.quaternion.copy(turn);
    sh.position.copy(catAt).addScaledVector(dir, catLen * 0.5);
    add('exhaust', sh);
  }
  /* the mounts the whole thing hangs on */
  if (has('block'))
    for (const sgn of [-1, 1]){
      const mt = engineMount(L.bore * 0.62);
      mt.rotation.y = sgn > 0 ? 0 : Math.PI;
      add('block', at(mt, frontX + L.len * 0.22, L.crankR * 0.55, sgn * caseZ));
    }

  /* Extra part modules (js/build/extra/*.js) add geometry for the parts they
     declare in js/data/extra/*.js, using the same helpers and the same frame
     as everything above, so a part they add lands where the tree says it is. */
  buildExtraParts({
    e, L, tree, nodes, root, anim, M, MAT, FIN, has, qtyOf, add, each, flush, inducY, thrAt, bovAt, itb,
    portAt, railAt, inSide, exSide, bankSign, cylPosition, cylSlot, firingOrder, fires,
    frontX, beltX, outerZ, wCase, ohv, airCooled, boosted, turbos: (typeof turbos !== 'undefined' ? turbos : []),
    geo: { box, roundBox, cyl, tubeMesh, sphere, torus, pipe, bolt, hexPrism, lathe, group, tag, at, rot, V3, TAU, hoseRun, braidedLine },
  });
  return finalize(e, root, nodes, anim, L);
}

/* ====================================================================== */
/* rotary                                                                  */
/* ====================================================================== */
function buildRotary(e, tree){
  const R = M(105), ecc = M(15), width = M(80), pitch = width * 1.55;
  const root = group('engine'); const nodes = new Map();
  const rBucket = new Map(), rotorSeals = [];
  const rHas = (id) => !!(tree.byId[id] || tree.byId[`${id}.1`]);
  /* like the piston builder's each(): a piece becomes its own part when the
     tree lists the id as instanced. `attached` pieces already hang off another
     node (a seal on its rotor) and are only registered, not re-parented. */
  const rEach = (id, i, obj, attached = false) => {
    if (!obj || !rHas(id)) return;
    if (INSTANCED.has(id)){
      const pid = `${id}.${i + 1}`;
      tag(obj, pid);
      if (!attached) root.add(obj);
      if (!nodes.has(pid)) nodes.set(pid, []);
      nodes.get(pid).push(obj);
    } else {
      if (!rBucket.has(id)) rBucket.set(id, group(id));
      if (attached){ tag(obj, id); if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); }
      else rBucket.get(id).add(obj);
    }
  };
  const rFlush = (id) => { if (rBucket.has(id)){ add(id, rBucket.get(id)); rBucket.delete(id); } };
  const add = (id, obj) => { if (!obj) return; if (!tree.byId[id]){ (root.userData.orphans ||= []).push(id); return; } tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const n = e.cyl;
  const has = (id) => !!(tree.byId[id] || tree.byId[`${id}.1`]);
  const xOf = (i) => (i - (n-1)/2) * pitch;

  /* side + rotor housings */
  const sideG = group('side'), rhG = group('rh');
  const rhPieces = Array.from({ length: n }, () => group('rotorhousing'));
  for (let i = 0; i <= n && !has('fronthousing'); i++){
    const plate = roundBox(M(14), R*2.3, R*2.0, .02, MAT.iron());
    /* a side housing is a plate across the shaft (YZ), not a wall along it */
    at(plate, xOf(i) - pitch/2, 0, 0);
    sideG.add(plate);
  }
  for (let i = 0; i < n; i++){
    const shape = new THREE.Shape();
    shape.moveTo(-R*1.18, -R*1.02);
    shape.lineTo(R*1.18, -R*1.02); shape.lineTo(R*1.18, R*1.02);
    shape.lineTo(-R*1.18, R*1.02); shape.closePath();
    const hole = new THREE.Path();
    const pts = epitrochoid(R, ecc, 140);
    hole.moveTo(pts[0].x, pts[0].y);
    for (let k = pts.length - 1; k >= 0; k--) hole.lineTo(pts[k].x, pts[k].y);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled:false, curveSegments:8 });
    g.rotateY(Math.PI/2); g.translate(xOf(i) - width/2, 0, 0);
    rhPieces[i].add(new THREE.Mesh(g, MAT.alloy()));   /* rotor housings are aluminium; the irons are iron */
  }
  /* The housings are the whole story on a Wankel: the intake is a hole in the
     side plate (side port) and the exhaust is a hole in the rotor housing's
     trochoid wall (peripheral port), which is why a rotary has no valves and no
     camshaft at all.  Cut both, put a flange on each, and rib the outside of the
     rotor housing where the coolant runs. */
  for (let i = 0; i < n; i++){
    for (const s2 of ((e.ports || '').includes('peripheral-intake') ? [] : [-1, 1])){
      /* portFlange is built facing +X, so a side port needs no turning at all */
      const sp = portFlange(1, M(30), M(74), M(9), MAT.alloy());
      sp.rotation.y = s2 > 0 ? 0 : Math.PI;
      sideG.add(at(sp, xOf(i) + s2 * width * 0.60, R * 0.10, -R * 0.62));
    }
    /* peripheral exhaust port, out through the trochoid wall */
    const ep = portFlange(1, M(27), M(66), M(10), MAT.hot());
    ep.rotation.y = -Math.PI / 2;                    // face out through the wall
    rhPieces[i].add(at(ep, xOf(i), 0, R * 1.06));
    /* cooling ribs across the top of the housing casting */
    for (let f = 0; f < 5; f++)
      rhPieces[i].add(at(box(width * 0.92, M(5), R * 0.30, MAT.iron()),
                 xOf(i), R * (0.86 + f * 0.045), 0));
  }
  add('block', sideG);
  for (let i = 0; i < n; i++) rEach('rotorhousing', i, rhPieces[i]);
  rFlush('rotorhousing');
  /* one stationary gear per rotor, pressed into the side housing it runs against */
  for (let i = 0; i < n; i++)
    rEach('stationary', i, at(rot(tubeMesh(M(40), M(26), M(20), MAT.steel(), 20), 0,0,Math.PI/2), xOf(i) - pitch/2, 0, 0));
  rFlush('stationary');

  /* eccentric shaft */
  const eg = group('eshaft');
  const shaft = cyl(M(24), M(24), pitch * (n + 1.2), MAT.steel(), 18);
  rot(shaft, 0, 0, Math.PI/2); eg.add(shaft);
  for (let i = 0; i < n; i++){
    const lobeG = group('lobe');
    const lobe = cyl(M(45), M(45), width * 0.9, MAT.steel(), 20);
    rot(lobe, 0, 0, Math.PI/2);
    lobe.position.set(xOf(i), ecc, 0);
    lobeG.add(lobe);
    lobeG.userData.phase = (i / n) * TAU;
    /* clock the lobe to its rotor: the rotor orbits at (sin φ, cos φ), so the
       +y lobe is turned to point the same way */
    lobeG.rotation.x = Math.PI / 2 - lobeG.userData.phase;
    eg.add(lobeG);
  }
  anim.crank = eg;
  add('crank', eg);

  /* rotors */
  const rotG = group('rotors'), apexG = group('apex');
  for (let i = 0; i < n; i++){
    const rg = group('rotor');
    const shape = new THREE.Shape();
    const rr = R - ecc * 1.0;
    for (let k = 0; k <= 120; k++){
      const t = (k/120) * TAU;
      /* Reuleaux-ish triangle: three flanks bulging outward */
      const rad = rr * (1 + 0.16 * Math.cos(3 * t));
      const x = rad * Math.cos(t), y = rad * Math.sin(t);
      k ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, M(48), 0, TAU, true); shape.holes.push(hole);
    /* the internal gear in the rotor's bore meshes with the fixed stationary
       gear on the side housing; the 3:2 tooth ratio is what holds the rotor to
       one turn for every three of the eccentric shaft */
    const ring = tubeMesh(M(54), M(46), width * 0.30, MAT.steel(), 30);
    rot(ring, 0, 0, Math.PI/2);
    ring.position.x = width * 0.15;      // tubeMesh stands on its base, so re-centre
    rg.add(ring);
    const g = new THREE.ExtrudeGeometry(shape, { depth: width * 0.94, bevelEnabled:false, curveSegments:6 });
    g.rotateY(Math.PI/2); g.translate(-width*0.47, 0, 0);
    const body = new THREE.Mesh(g, MAT.alloyDark());
    rg.add(body);
    for (let a = 0; a < 3; a++){
      const seal = box(width * 0.94, M(9), M(4), MAT.steel());
      const t = (a/3) * TAU;
      const rad = rr * 1.16;
      /* the rotor profile was extruded and turned onto the shaft axis, which
         puts its tip for angle t at (y, z) = (sin t, -cos t): the seal has to
         sit on that tip, not on its mirror image mid-flank */
      at(seal, 0, rad * Math.sin(t), -rad * Math.cos(t));
      seal.rotation.x = t;
      /* the seal rides in its slot on the rotor, so it moves with the rotor
         and is its own part — rotor n, apex a */
      const sh = group('apex'); sh.add(seal);
      sh.userData.rotorIndex = i; sh.userData.apexIndex = a;
      rotorSeals.push([i * 3 + a, sh, rg]);
    }
    rg.userData.phase = (i / n) * TAU;
    rg.userData.baseX = xOf(i);
    rEach('pistons', i, rg);
    anim.rotors.push(rg);
    /* each rotor face fires once per shaft revolution */
    const flame = flameMesh(R * 0.30);
    flame.material.depthTest = false;
    flame.position.set(xOf(i), 0, R * 0.55);
    root.add(flame);
    anim.flames.push({ node:flame, mat:flame.material, fire:(i / n) * TAU, cycle:TAU });
  }
  rFlush('pistons');
  /* apex seals follow their rotor: parent each to its rotor so the animation
     carries them, but register them as their own parts */
  for (const [idx, sh, rg] of rotorSeals){ rg.add(sh); rEach('apex', idx, sh, true); }
  rFlush('apex');

  /* tension bolts: the long studs that clamp the housing stack together */
  const NTB = 18;
  for (let k = 0; k < NTB; k++){
    const t = (k/NTB) * TAU;
    const b = cyl(M(6), M(6), pitch * (n + 0.9), MAT.steel(), 8);
    rot(b, 0, 0, Math.PI/2);
    at(b, 0, Math.sin(t) * R * 1.05, Math.cos(t) * R * 1.05);
    rEach('maincaps', k, b);
  }
  rFlush('maincaps');

  add('oilpump', at(roundBox(M(80), M(80), M(60), .01, MAT.alloyDark()), xOf(0) - pitch*0.8, -R*0.6, R*0.5));
  add('oilpan', at(roundBox(pitch*(n+0.6), M(90), R*1.4, .02, MAT.alloyDark()), 0, -R*1.15, 0));

  if (has('turbo')){
    const tg = group('turbos');
    const cnt = e.aspiration === 'twinturbo' ? 2 : 1;
    for (let i = 0; i < cnt; i++){
      const t = turboUnit(R * (cnt > 1 ? 0.62 : 0.80));
      anim.turbos.push(t.userData.shaft);
      at(t, xOf(0) + i * pitch * 0.9, -R*0.15 + i*R*0.55, R*1.30);
      tg.add(t);
    }
    add('turbo', tg);
    const ric = coreMesh(pitch*(n+1.4), R*0.8, M(76));
    add('intercooler', at(ric, xOf(0) - pitch * 1.9, -R*0.1, 0));
  }

  const intakeG = group('intake');
  intakeG.add(at(roundBox(pitch*n*0.9, M(90), M(120), .02, MAT.alloy()), 0, R*0.55, -R*0.75));
  for (let i = 0; i < n; i++)
    intakeG.add(pipe([[xOf(i), R*0.5, -R*0.75],[xOf(i), R*0.2, -R*0.5],[xOf(i)-pitch*0.4, 0, -R*0.35]], M(19), MAT.alloy(), 8));
  add('intake', intakeG);
  add('throttle', at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 16), 0,0,Math.PI/2), -pitch*(n/2+0.4), R*0.55, -R*0.75));

  const injG = group('inj'), railG = group('rail');
  for (let i = 0; i < n*2; i++)
    rEach('injectors', i, at(cyl(M(8), M(8), M(52), MAT.plastic(), 10), xOf(Math.floor(i/2)) + (i%2?M(24):-M(24)), R*0.25, -R*0.55));
  rFlush('injectors');
  railG.add(at(rot(cyl(M(13), M(13), pitch*n, MAT.steel(), 12), 0,0,Math.PI/2), 0, R*0.42, -R*0.62));
  add('fuelrail', railG);

  const plugG = group('plugs'), coilG = group('coils');
  for (let i = 0; i < n; i++) for (const [k, s] of [-1, 1].entries()){
    /* leading plug low, trailing plug high on each rotor housing */
    rEach('plugs', i * 2 + k, at(rot(cyl(M(7), M(7), M(40), MAT.steel(), 10), 0, 0, Math.PI/2 - s*0.3), xOf(i) + s*M(22), M(10) + s * M(30), R*1.0));
    rEach('coils', i * 2 + k, at(roundBox(M(26), M(50), M(30), .006, MAT.plastic()), xOf(i) + s*M(26), R*0.55, R*1.10));
  }
  rFlush('plugs'); rFlush('coils');

  const exG = group('ex');
  for (let i = 0; i < n; i++)
    exG.add(pipe([[xOf(i), 0, R*1.0],[xOf(i), -R*0.3, R*1.3],[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35]], M(20), MAT.hot(), 8));
  add('exmanifold', exG);
  add('exhaust', pipe([[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35],[xOf(n-1)+pitch*1.6, -R*0.5, R*1.2]], M(30), MAT.iron(), 10));
  addPuffs(root, anim, new THREE.Vector3(xOf(n-1)+pitch*1.65, -R*0.5, R*1.2), R*0.6);

  add('waterpump', at(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 16), 0,0,Math.PI/2), xOf(0)-pitch*0.9, R*0.3, -R*0.4));
  const rad = group('rad');
  const rcore = coreMesh(pitch*(n+1.6), R*1.3, M(46), {}, 30);
  rad.add(rcore);
  const fan = group('fan');
  for (let i = 0; i < 7; i++){ const b = box(M(16), R*0.5, M(6), MAT.black()); b.rotation.z = (i/7)*TAU; fan.add(b); }
  fan.rotation.y = Math.PI / 2; fan.position.x = M(40); rad.add(fan); anim.fans.push(fan);
  add('radiator', at(rad, xOf(0) - pitch * 2.5, R*0.1, 0));

  const pul = group('pul');
  pul.add(rot(tubeMesh(M(70), M(26), M(34), MAT.iron(), 22), 0,0,Math.PI/2));
  at(pul, xOf(0) - pitch*1.1, 0, 0); anim.pulleys.push({ node:pul, ratio:1 });
  add('crankpulley', pul);
  add('alternator', at(alternatorMesh(R*0.55), xOf(0)-pitch*0.9, R*0.75, -R*0.6));
  add('starter', at(starterMesh(R*0.62), xOf(n-1)+pitch*0.3, -R*0.45, -R*1.25));
  const fw = group('fw'); fw.add(rot(tubeMesh(R*0.95, M(30), M(30), MAT.iron(), 30), 0,0,Math.PI/2));
  at(fw, xOf(n-1) + pitch*0.75, 0, 0); anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  add('clutch', at(rot(tubeMesh(R*0.85, M(34), M(46), MAT.steel(), 26), 0,0,Math.PI/2), xOf(n-1)+pitch*1.05, 0, 0));

  for (const [id,x,y,z] of [['crksensor', xOf(0)-pitch*0.75, -R*0.5, R*0.4],
                            ['mapsensor', 0, R*0.75, -R*0.8],
                            ['knock', 0, -R*0.3, -R*0.9],
                            ['o2', xOf(n-1)+pitch*1.2, -R*0.5, R*1.2]])
    if (has(id)) add(id, at(cyl(M(11), M(11), M(46), MAT.plastic(), 10), x, y, z));
  if (has('ecu')) add('ecu', at(roundBox(M(190), M(45), M(150), .01, MAT.plastic()), 0, R*1.3, -R*1.4));

  buildExtraParts({
    e, tree, nodes, root, anim, M, MAT, has, qtyOf: (id) => tree.byId[id]?.qty || Object.keys(tree.byId).filter(k => k.startsWith(id + '.')).length,
    add, each: rEach, flush: rFlush, rotary: { n, R, pitch, width, xOf },
    geo: { box, roundBox, cyl, tubeMesh, sphere, torus, pipe, bolt, hexPrism, lathe, group, tag, at, rot, V3:(x,y,z)=>new THREE.Vector3(x,y,z), TAU },
  });
  return finalize(e, root, nodes, anim, { bore:R, deckH:R, len:pitch*n, crankR:ecc, rodLen:R, stroke:M(80) });
}

function addPuffs(root, anim, at3, scale){
  for (let i = 0; i < 5; i++){
    const m = puffMesh(scale * 0.16);
    m.position.copy(at3);
    root.add(m);
    anim.puffs.push({ node:m, mat:m.material, home:at3.clone(), offset:i / 5 });
  }
}

/* ====================================================================== */
function finalize(e, root, nodes, anim, L){
  /* An imported model goes on as a shell over the generated engine: you get the
     real thing to look at, and stripping the shell off leaves the teachable one
     underneath with every part still where it belongs. It is sized to the
     engine's own bounding length so a model authored at any scale lands right. */
  const imported = modelFor('eng', e.id);
  if (imported){
    const b = boundsOf(root);
    const shell = group('shell');
    const fit = e.modelFit || {};
    shell.add(fitToLength(imported.group, (b.size?.x || b.radius * 1.6) * (fit.scale ?? 1),
                          { ground:false, lift:b.center.y + (fit.lift ?? 0),
                            rotX:fit.rotX, rotZ:fit.rotZ, spin:fit.spin }));
    tag(shell, 'shell');
    root.add(shell);
    if (!nodes.has('shell')) nodes.set('shell', []);
    nodes.get('shell').push(shell);
  }
  /* remember home transforms + choose an explode direction per part */
  const home = new Map();
  for (const [id, objs] of nodes){
    for (const o of objs){
      home.set(o, o.position.clone());
      o.userData.explodeDir = explodeDir(id, o, L);
    }
  }
  const bounds = boundsOf(root);
  anim.rootNode = root;
  anim.homePos = root.position.clone();
  return {
    root, nodes, anim, home, bounds, layout:L,
    /* the imported model, when there is one, stands in for the whole engine */
    shellId: nodes.has('shell') ? 'shell' : null,
    partIds: [...nodes.keys()],
    setExplode(f){
      for (const [id, objs] of nodes) for (const o of objs){
        const h = home.get(o), d = o.userData.explodeDir;
        o.position.copy(h).addScaledVector(d, f);
      }
    },
    update(state){ animate(e, anim, state, L); },
  };
}

const UP = new THREE.Vector3(0,1,0);
function explodeDir(id, obj, L){
  const up   = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const fwd  = new THREE.Vector3(-1, 0, 0);
  const back = new THREE.Vector3(1, 0, 0);
  const outZ = new THREE.Vector3(0, 0.15, -1).normalize();
  const map = {
    shell:up.clone().multiplyScalar(2.6),
    valvecover:up.clone().multiplyScalar(1.55), camcaps:up.clone().multiplyScalar(1.25),
    vcgasket:up.clone().multiplyScalar(1.42), intgasket:new THREE.Vector3(0,1.0,-0.42),
    exgasket:new THREE.Vector3(0,0.1,1.10), pangasket:down.clone().multiplyScalar(0.95),
    wpgasket:new THREE.Vector3(-1.2,0.4,-0.4), seals:fwd.clone().multiplyScalar(0.5),
    cam:up.clone().multiplyScalar(1.05), vvt:fwd.clone().multiplyScalar(1.3),
    rockers:up.clone().multiplyScalar(1.3), pushrods:up.clone().multiplyScalar(0.95),
    pushrodtubes:new THREE.Vector3(0, 0.75, 1.05),
    lifters:up.clone().multiplyScalar(0.6),
    valves:up.clone().multiplyScalar(0.8), head:up.clone().multiplyScalar(0.62),
    headgasket:up.clone().multiplyScalar(0.45), plugs:up.clone().multiplyScalar(1.5),
    glow:up.clone().multiplyScalar(1.5),
    coils:up.clone().multiplyScalar(1.85), intake:new THREE.Vector3(0,1.1,-0.5),
    throttle:new THREE.Vector3(-0.6,1.2,-0.7), injectors:new THREE.Vector3(0,1.35,-0.35),
    fuelrail:new THREE.Vector3(0,1.5,-0.4), hpfp:new THREE.Vector3(-0.5,1.2,0.5),
    turbo:new THREE.Vector3(0.3,0.7,1.1), wastegate:new THREE.Vector3(0.6,0.5,1.0),
    bov:new THREE.Vector3(-0.6,0.9,0.9), intercooler:new THREE.Vector3(0,0.2,-1.5),
    blower:up.clone().multiplyScalar(1.6),
    exmanifold:new THREE.Vector3(0,0.1,1.25), exhaust:new THREE.Vector3(0.8,-0.1,1.35),
    oilpan:down.clone().multiplyScalar(1.15), pickup:down.clone().multiplyScalar(0.75),
    oilpump:new THREE.Vector3(-0.7,-0.7,0.5), oilfilter:new THREE.Vector3(0.4,-0.6,1.0),
    maincaps:down.clone().multiplyScalar(0.72), mainbearings:down.clone().multiplyScalar(0.4),
    crank:down.clone().multiplyScalar(0.15), pistons:up.clone().multiplyScalar(0.3),
    rods:up.clone().multiplyScalar(0.12), apex:up.clone().multiplyScalar(0.7),
    rotorhousing:outZ.clone().multiplyScalar(0.5), stationary:fwd.clone().multiplyScalar(0.9),
    timing:fwd.clone().multiplyScalar(1.15), tensioner:fwd.clone().multiplyScalar(1.35),
    frontcover:fwd.clone().multiplyScalar(1.5), crankpulley:fwd.clone().multiplyScalar(1.75),
    waterpump:new THREE.Vector3(-1.3,0.35,-0.4), radiator:new THREE.Vector3(0,0,-1.7),
    fins:up.clone().multiplyScalar(1.2),
    alternator:new THREE.Vector3(-1.2,0.65,-0.7), starter:new THREE.Vector3(1.1,-0.3,0.7),
    flywheel:back.clone().multiplyScalar(1.4), clutch:back.clone().multiplyScalar(1.75),
    ecu:new THREE.Vector3(-0.4,1.7,-1.0), crksensor:new THREE.Vector3(-1.0,-0.5,0.7),
    mapsensor:new THREE.Vector3(0,1.6,-0.6), knock:new THREE.Vector3(0,0.4,-1.1),
    o2:new THREE.Vector3(1.0,-0.2,1.2), fuelpump:new THREE.Vector3(-0.8,0.4,0.9),
    block:new THREE.Vector3(0,0,0),
  };
  const v = (map[baseId(id)] || new THREE.Vector3(0, 0.8, 0)).clone();
  return v.multiplyScalar(L.bore * 1.9);
}

/* ---------------------------------------------------------------------- */
function animate(e, anim, state, L){
  const th = state.crankAngle || 0;                 // 0…4π, one full four-stroke cycle
  const rpm = state.rpm || 0;
  const running = rpm > 1;
  const load = state.load ?? 0.5;
  const dt = state.dt ?? 0.016;
  const CYCLE = Math.PI * 4;

  if (anim.crank) anim.crank.rotation.x = th;

  /* rotors orbit the eccentric shaft at a third of its speed */
  for (const r of anim.rotors){
    const ph = r.userData.phase - th;          /* same sense as the e-shaft's own spin */
    r.position.set(r.userData.baseX, L.crankR * Math.sin(ph), L.crankR * Math.cos(ph));
    r.rotation.x = -ph / 3;
  }

  /* crank–slider: each cylinder is offset by where it sits in the firing order */
  for (const p of anim.pistons){
    const t = th - p.fire;
    const y = slider(L.crankR, L.rodLen, t);
    /* the bank frame everything else uses: rotation +a about X puts the
       bore axis along (cos a, sin a) in (y, z), and the piston has to slide
       along that same axis or it sits ninety degrees across its own bore */
    p.node.position.set(p.x, y * Math.cos(p.angle), y * Math.sin(p.angle));
    p.node.rotation.x = p.angle;
  }
  for (const r of anim.rods){
    const t = th - r.fire;
    const y = slider(L.crankR, L.rodLen, t);
    const pinY = L.crankR * Math.cos(t), pinZ = L.crankR * Math.sin(t);
    /* the rod leans in its own bank plane, chasing the crank pin */
    const localPinY = pinY * Math.cos(-r.angle) - pinZ * Math.sin(-r.angle);
    const localPinZ = pinY * Math.sin(-r.angle) + pinZ * Math.cos(-r.angle);
    const tilt = Math.atan2(localPinZ, y - localPinY);
    r.node.position.set(r.x, y * Math.cos(r.angle), y * Math.sin(r.angle));
    r.node.rotation.set(r.angle, 0, 0);
    r.node.rotateX(-tilt);
  }

  /* camshafts turn at half crank speed; the lobe you can see is the lobe that lifts */
  const camRot = th / 2;
  for (const c of anim.cams) if (c.spin) c.node.rotation.x = camRot;
  for (const lo of anim.lobes)
    lo.node.rotation.x = camRot + lo.phase + (lo.up ? Math.PI : 0);
  for (const v of anim.valves){
    const lift = lobeLift(camRot + v.phase, v.duration) * v.lift;
    /* lift is a displacement off the seat, not an absolute height — setting it
       absolutely dropped every valve out of its chamber down to crank level the
       first time the model updated */
    v.node.position.y = v.home - lift;
    if (v.spring){
      const f = lift / v.lift;
      v.spring.scale.y = 1 - f * 0.30;
      v.spring.position.y = v.springHome - lift * 0.5;
    }
  }
  for (const f of anim.followers){
    const lift = lobeLift(camRot + f.phase, f.duration) * f.travel;
    /* the lifter and pushrod ride along the pushrod axis, which is the cylinder
       axis on an air-cooled twin and straight up on a V8 */
    f.lifter.position.copy(f.lifterHome).addScaledVector(f.dir, lift);
    f.pushrod.position.copy(f.pushrodHome).addScaledVector(f.dir, lift);
    f.rocker.rotation.z = f.rockSign * (lift / f.travel) * 0.16;
  }

  /* combustion: a flash in the cylinder that is on its power stroke */
  for (const fl of anim.flames){
    const cycle = fl.cycle || CYCLE;
    let psi = (th - fl.fire) % cycle;
    if (psi < 0) psi += cycle;
    const win = deg(70);
    const k = psi < win ? 1 - psi / win : 0;
    const inten = running ? k * (0.30 + 0.70 * load) : 0;
    fl.mat.opacity = inten * 0.5;
    fl.node.scale.setScalar(0.5 + inten * 0.9);
  }

  /* exhaust leaving the tailpipe */
  const time = state.time || 0;
  for (const p of anim.puffs){
    if (!running){ p.mat.opacity = 0; continue; }
    const t = ((time * (0.7 + rpm / 2600) + p.offset) % 1);
    p.mat.opacity = (1 - t) * 0.22 * Math.min(1, load + 0.25);
    p.node.position.set(p.home.x + t * L.bore * 2.4, p.home.y + t * L.bore * 0.55, p.home.z);
    p.node.scale.setScalar(0.5 + t * 2.4);
  }

  /* belt drive and cooling fan */
  for (const p of anim.pulleys) p.node.rotation.x = th * (p.ratio ?? 1);
  for (const f of anim.fans) f.rotation.z = time * (running ? 6 + rpm / 900 : 0);
  for (const f of anim.fans) if (f.parent) f.rotation.x = time * (running ? 6 + rpm / 900 : 0);

  /* the turbo shaft has real inertia — it does not stop when you lift */
  anim.turboAngle = (anim.turboAngle || 0) + (state.turboSpin || 0) * dt;
  for (const t of anim.turbos) t.rotation.z = anim.turboAngle;

  /* vibration: primary and secondary imbalance, which is why an inline-6 is smooth
     and a big single is not */
  if (anim.rootNode && anim.homePos){
    const [p1, p2] = anim.shake || [0, 0];
    const amp = running ? Math.min(1, rpm / 3500) * L.bore * 0.035 : 0;
    const dy = (Math.cos(th) * p1 * 0.7 + Math.cos(th * 2) * p2) * amp;
    const dz = (Math.sin(th) * p1 + Math.sin(th * 2) * p2 * 0.6) * amp * 0.6;
    anim.rootNode.position.set(anim.homePos.x, anim.homePos.y + dy, anim.homePos.z + dz);
  }
}

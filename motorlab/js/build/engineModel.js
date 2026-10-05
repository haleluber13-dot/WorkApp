/* MotorLab — procedural 3D engine builder.
 * Reads an engine spec and constructs the whole assembly in metres, tagging
 * every mesh with its part id so the viewport can pick, hide, ghost, explode
 * and animate it. Nothing here is a downloaded model — it is all derived from
 * bore, stroke, cylinder count and layout.
 */
import * as THREE from 'three';
import { INSTANCED, baseId } from '../data/parts.js';
import { buildExtraParts } from './extra/index.js';
import { mergeStatic } from './mergeStatic.js';
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
         engineMount, letterPlate, nutOnStud, machinedPad, castRib, camCoverTopAt } from '../lib/geo.js';
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

/* The casting number raised on the block's flank: the engine's own code and a
   part number derived from it, so it is stable from build to build. */
export function castingNumber(e){
  const code = String(e.name || e.id || '').split(/\s+/)[0].toUpperCase();
  let h = 7;
  for (const ch of String(e.id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const num = String(10000 + (h % 90000));
  return `${code}  ${num.slice(0, 5)}-${String(h % 100).padStart(2, '0')}`;
}
/* What the cam cover says. engines.js names the lettering style (bare metal,
   painted, the M stripes, the Chevrolet script…); the words come from the
   maker and the engine, the way they are cast on the real cover. */
export function coverLegend(e, FIN){
  const lt = FIN.letters || 'none';
  if (lt === 'none') return null;
  const maker = String(e.maker || '').toUpperCase();
  const nv = (e.valvesPerCyl || 2) * (e.cyl || 1);
  const dohc = e.cam === 'DOHC';
  const tri = String(e.finish?.tricolour || '#0066B1 #1C3E94 #E22718').split(/\s+/);
  const styleHex = { red:0xc8202a, 'paint-red':0xb22222, silver:0xd9dde0, grey:0x9a9ea3,
                     'chrome-blue':0x8fc1f0, bare:0xd4d8dc, cast:0xb4b8bc }[lt];
  const hex = FIN.lettersHex ?? styleHex ?? 0xd4d8dc;
  const metalStyle = ['bare', 'cast', 'silver', 'chrome-blue'].includes(lt) ? lt : 'paint';
  switch (lt){
    case 'm-tricolour': return { lines:['M TwinPower Turbo'], hex:0xd9dde0, style:'silver', stripes:tri };
    case 'script':      return { lines:['Chevrolet'], hex:0xe8ecef, style:'chrome', script:true };
    case 'builder-plaque': return { lines:[maker, 'HANDCRAFTED'], hex:0xd9dde0, style:'silver' };
    case 'trident':     return { lines:['MASERATI'], hex, style:'bare' };
    case 'TDI':         return { lines:['TDI'], hex:0xd9dde0, style:'silver' };
    case 'COSWORTH': case 'PORSCHE': case 'BMW': return { lines:[lt], hex, style:'bare' };
  }
  if (/bmw/i.test(maker)) return { lines:['BMW', 'M POWER'], hex, style:metalStyle, stripes:e.finish?.tricolour ? tri : null };
  if (/toyota|lexus/i.test(maker)) return { lines:['TOYOTA', dohc ? `TWIN CAM ${nv}` : `${nv} VALVE`], hex, style:metalStyle };
  if (/nissan/i.test(maker)) return { lines:['NISSAN', dohc ? `TWIN CAM ${nv} VALVE` : `${nv} VALVE`], hex, style:metalStyle };
  if (/honda/i.test(maker)) return { lines:[/vtec/i.test(e.name || '') ? 'VTEC' : 'HONDA', dohc ? 'DOHC' : 'SOHC'], hex, style:metalStyle };
  if (/mazda/i.test(maker)) return { lines:['MAZDA', dohc ? `DOHC ${nv} VALVE` : ''], hex, style:metalStyle };
  if (/subaru/i.test(maker)) return { lines:['SUBARU', 'BOXER'], hex, style:metalStyle };
  if (/audi|volkswagen|vw/i.test(maker)) return { lines:[/tfsi|fsi/i.test(e.name || '') ? (e.name.match(/T?FSI/i) || ['FSI'])[0].toUpperCase() : maker], hex, style:metalStyle };
  if (/mercedes/i.test(maker)) return { lines:['AMG'], hex, style:metalStyle };
  if (/chevrolet|gm/i.test(maker)) return { lines:[/corvette|ls|lt/i.test(e.name || '') ? 'CORVETTE' : 'CHEVROLET'], hex, style:metalStyle };
  if (/ford/i.test(maker)) return { lines:[/cosworth/i.test(e.name || '') ? 'COSWORTH' : /coyote/i.test(e.name || '') ? 'COYOTE' : 'FORD'], hex, style:metalStyle };
  if (/formula|group|top fuel/i.test(maker)) return null;
  return { lines:[maker], hex, style:metalStyle };
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
  /* A flat's banks lie along ±Z, so its reach is the whole head and cam cover
     (deckH + 1.5 bores), not half a head's width past the deck. */
  const outerZ = Math.max(wCase,
    ...L.bankAngles.map(a => Math.abs(Math.sin(a)) * L.deckH + L.bore * (Math.abs(Math.abs(a) - Math.PI / 2) < 0.2 ? 1.60 : 0.62)));
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
    if (flat)
      /* a boxer's crankcase: a box from the pan rail up to the top of the
         barrel band, the barrels (the deck slabs) leaving its flanks. The
         vee profile dipped half a bore BELOW the pan rail here and swallowed
         the sump, the filter and the mounts. */
      prof.push([-wCase, yCase], [-wCase, half], [-caseBot * 0.86, Math.max(yValley, half * 0.7)],
                [caseBot * 0.86, Math.max(yValley, half * 0.7)], [wCase, half], [wCase, yCase]);
    else
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
  /* the cylinder case's flank: the deck slab's outer face, in the bank frame */
  const halfD = L.bore * (L.banks >= 2 ? 0.80 : 0.72);
  const caseH = L.deckH - caseBot;
  if (!airCooled && has('coreplugs')){
    const nCore = qtyOf('coreplugs');
    const sides = 2;
    const perSide = Math.ceil(nCore / sides);
    for (let k = 0; k < nCore; k++){
      const sideIdx = k % sides, slot = Math.floor(k / sides);
      /* between the bores, where the water jacket is cored — never on a bore
         centre, which is where the exhaust primary drops down the flank */
      const cx = (slot - (perSide - 1) / 2) * L.pitch - ((perSide + L.perBank) % 2 === 0 ? L.pitch / 2 : 0);
      const cp = cyl(L.bore * 0.22, L.bore * 0.22, M(6), MAT.plated(), 18);
      rot(cp, Math.PI / 2, 0, 0);
      /* the boss the plug is pressed into stays on the block when the plug
         comes out — a ring of casting round a hole into the water jacket */
      const boss = tubeMesh(L.bore * 0.275, L.bore * 0.215, M(8), FIN.block, 18);
      rot(boss, Math.PI / 2, 0, 0);
      /* in the water jacket beside the bores — on a vee that is up the outer
         face of each bank, on an inline it is the block's two flanks */
      if (L.banks >= 2){
        const b = sideIdx;
        /* low on the bank's outer face, under the primaries' sweep to the collector */
        const [py, pz] = portAt(b, L.deckH * 0.30, exSide(b) * (halfD + M(1)));
        const [by, bz] = portAt(b, L.deckH * 0.30, exSide(b) * (halfD - M(1)));
        cp.rotation.x += (L.bankAngles[b] ?? 0);
        boss.rotation.x += (L.bankAngles[b] ?? 0);
        blockG.add(at(boss, cx, by, bz));
        each('coreplugs', k, at(cp, cx, py, pz));
      } else {
        const zs = sideIdx ? 1 : -1;
        blockG.add(at(boss, cx, caseBot + caseH * 0.60, zs * (halfD - M(1))));
        each('coreplugs', k, at(cp, cx, caseBot + caseH * 0.60, zs * (halfD + M(1))));
      }
    }
  }

  /* ---- the casting dressed as a casting ----
   * A block is not a smooth extrusion. It is webbed and ribbed wherever the
   * foundry needed stiffness or the cores needed support, swollen where the
   * water jacket runs, and bright only where something bolts to it. All of
   * this is cast-in detail on the one block part — none of it comes off. */
  const bike = e.class === 'bike';
  const nMainsB = L.banks >= 2 ? e.cyl / 2 + 1 : e.cyl + 1;
  const mainX = (i) => (i - (nMainsB - 1) / 2) * (L.len / Math.max(1, nMainsB - 1)) * 0.92;
  const skirtTop = L.crankR * 0.55, skirtH = skirtTop - yCase;
  /* main-bearing bulkheads: a vertical swelling down each skirt at every main,
     where the saddle's load is carried down into the pan rail */
  for (let i = 0; i < nMainsB; i++){
    const rx = mainX(i);
    for (const zs of [-1, 1]){
      blockG.add(at(box(M(26), skirtH * 0.94, M(8), FIN.block), rx, yCase + skirtH * 0.5, zs * (wCase + M(3))));
      blockG.add(at(cyl(M(11), M(13), skirtH * 0.94, FIN.block, 10), rx, yCase + skirtH * 0.5, zs * (wCase + M(5))));
    }
  }
  /* the pan rail: a flange along the bottom of the skirts, a cast lug above
     every pan bolt, and the machined face the pan gasket seals against */
  const railW = wCase + M(8);
  const panW = L.bore * (flat ? 1.10 : 1.70), panLen = L.len * 0.94;   /* a boxer's sump is narrower than the gap between its barrel decks */
  blockG.add(at(box(L.len, M(14), railW * 2, FIN.block), 0, yCase + M(7), 0));
  blockG.add(at(machinedPad(L.len * 1.002, railW * 2 * 1.004, M(2)), 0, yCase - M(0.5), 0));
  {
    const nPan = Math.max(4, Math.round(panLen / 0.085));
    for (let i = 0; i < nPan; i++){
      const x = (i / (nPan - 1) - 0.5) * panLen * 0.92;
      for (const zs of [-1, 1])
        blockG.add(at(cyl(M(8), M(10), M(24), FIN.block, 10), x, yCase + M(24), zs * (wCase + M(3))));
    }
  }
  /* the cylinder case flanks: a cast web at every bore boundary, the belly
     line where the water jacket swells the wall, a ledge along the join to
     the skirt, and the casting number raised on its own pad */
  for (let b = 0; b < L.bankAngles.length; b++){
    const fg = group('flank');
    fg.rotation.x = L.bankAngles[b] ?? 0;
    const sides = L.banks >= 2 ? [exSide(b)] : [-1, 1];
    for (const zs of sides){
      const zf = zs * halfD;
      for (let i = 0; i <= L.perBank; i++){
        const rx = (i - L.perBank / 2) * L.pitch;
        fg.add(at(box(M(12), caseH * 0.74, M(12), FIN.block), rx, caseBot + caseH * 0.40, zf + zs * M(4)));
        fg.add(at(cyl(M(6), M(6), caseH * 0.74, FIN.block, 8), rx, caseBot + caseH * 0.40, zf + zs * M(10)));
      }
      fg.add(at(cyl(M(9), M(9), L.len * 0.97, FIN.block, 8).rotateZ(Math.PI / 2), 0, caseBot + caseH * 0.26, zf + zs * M(4)));
      fg.add(at(box(L.len * 0.97, M(6), M(9), FIN.block), 0, caseBot + caseH * 0.78, zf + zs * M(3)));
    }
    if (L.banks < 2 || b === L.bankAngles.length - 1){
      const zs = L.banks >= 2 ? exSide(b) : 1;
      const pad = letterPlate([castingNumber(e)], L.bore * 0.62, L.bore * 0.12, FIN.block,
                              { hex:0xcfd3d6, style:'cast', thickness:M(2.5), flip: zs < 0, align:'left', barMat:FIN.block });
      pad.rotation.x = zs * Math.PI / 2;
      fg.add(at(pad, -L.len * 0.24, caseBot + caseH * 0.60, zs * (halfD + M(1))));
    }
    blockG.add(fg);
  }
  /* the front face is milled flat for the front cover; a bright line shows
     between the two castings where the gasket sits */
  blockG.add(at(machinedPad(caseBot - yCase, wCase * 2 * 1.004, M(2.4)).rotateZ(Math.PI / 2),
                -L.len / 2 - M(1.2), (yCase + caseBot) / 2, 0));
  /* the bellhousing flange at the back, where the gearbox bolts on: a cast
     plate round over the crank and tapering to the pan rail, webbed back onto
     the block, with its machined face and the ring of bolts */
  if (!bike){
    const Rf = L.bore * 1.90;
    const s2 = new THREE.Shape();
    s2.absarc(0, 0, Rf, deg(-12), deg(192), false);
    s2.lineTo(-wCase * 1.04, yCase); s2.lineTo(wCase * 1.04, yCase); s2.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, L.crankR * 0.70, 0, TAU, true); s2.holes.push(hole);
    const pg = new THREE.ExtrudeGeometry(s2, { depth:M(14), bevelEnabled:false, curveSegments:20 });
    pg.rotateY(Math.PI / 2);
    blockG.add(at(new THREE.Mesh(pg, FIN.block), L.len / 2 - M(2), 0, 0));
    const bh = tubeMesh(Rf, Rf * 0.84, M(3), MAT.machined(), 30);
    rot(bh, 0, 0, Math.PI / 2);
    blockG.add(at(bh, L.len / 2 + M(13.5), 0, 0));
    for (const t of [-72, -36, 0, 36, 72].map(deg)){
      const rIn = L.crankR * 1.2, rOut = Rf * 0.94;
      const web = box(M(64), rOut - rIn, M(10), FIN.block);
      web.position.set(L.len / 2 - M(34), Math.cos(t) * (rIn + rOut) / 2, Math.sin(t) * (rIn + rOut) / 2);
      web.rotation.x = t;
      blockG.add(web);
    }
    for (let k = 0; k < 8; k++){
      const t = (k / 8) * TAU + Math.PI / 8;
      blockG.add(at(rot(bolt(M(6), M(20), FIN.hardware), 0, 0, -Math.PI / 2),
                    L.len / 2 + M(12), Math.sin(t) * L.bore * 1.76, Math.cos(t) * L.bore * 1.76));
    }
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
    const headMat = FIN.heads || MAT.alloy();
    const headBody = roundBox(L.len, solidTop - fireT, L.bore * 1.5, 0.03, headMat);
    hb.add(mk(headBody, L.deckH + fireT + (solidTop - fireT) / 2));
    /* The cam box: an open tub above the spring pockets, its rail milled flat
       for the cover with a bolt boss at every cover fixing. A pushrod head
       gets the same tub for its rockers; an air-cooled twin has rocker boxes
       instead and no rail at all. */
    const railTop = L.bore * 1.32, wall = L.bore * 0.09;
    const nCoverBolts = Math.max(4, e.cyl + 2), coverLen = L.len * 0.98;
    if (!(ohv && airCooled)){
      const railH = railTop - solidTop;
      for (const sz of [-1, 1]){
        hb.add(mk(at(box(L.len, railH, wall, headMat), 0, 0, 0), L.deckH + solidTop + railH / 2, sz * (L.bore * 0.75 - wall / 2)));
        hb.add(mk(at(machinedPad(L.len * 1.002, wall * 1.05, M(2)), 0, 0, 0), L.deckH + railTop - M(1), sz * (L.bore * 0.75 - wall / 2)));
        /* a cast web from the rail down the outer face at every cover bolt */
        for (let i = 0; i < nCoverBolts; i++){
          const bx = (i / (nCoverBolts - 1) - 0.5) * coverLen * 0.92;
          hb.add(mk(at(cyl(L.bore * 0.065, L.bore * 0.075, railH * 0.98, headMat, 10), bx, 0, 0), L.deckH + solidTop + railH * 0.49, sz * L.bore * 0.612));
        }
      }
      for (const sx of [-1, 1]){
        hb.add(mk(at(box(wall, railH, L.bore * 1.5, headMat), sx * (L.len / 2 - wall / 2), 0, 0), L.deckH + solidTop + railH / 2));
        hb.add(mk(at(machinedPad(wall * 1.05, L.bore * 1.5 * 1.002, M(2)), sx * (L.len / 2 - wall / 2), 0, 0), L.deckH + railTop - M(1)));
      }
      /* the spring pockets: a raised rim round every valve in the tub floor */
      const nvv = Math.max(2, e.valvesPerCyl), perSideV = Math.max(1, Math.floor(nvv / 2));
      for (let i = 0; i < L.perBank; i++){
        const px = (i - (L.perBank - 1) / 2) * L.pitch;
        for (let v = 0; v < nvv; v++){
          const intake = v < perSideV, j = intake ? v : v - perSideV;
          const zoff = (intake ? -1 : 1) * L.bore * 0.21 + (perSideV > 1 ? (j - (perSideV - 1) / 2) * L.bore * 0.19 : 0);
          hb.add(mk(at(tubeMesh(L.bore * 0.14, L.bore * 0.12, L.bore * 0.035, headMat, 14), px, 0, 0), L.deckH + solidTop + L.bore * 0.0175, zoff));
        }
      }
    }
    /* the port faces: the inlet ports swell the intake face into a row of
       rounded bulges, the exhaust ports stand out as square bosses, and both
       faces are milled flat along the ports for their manifold flanges */
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1)/2) * L.pitch;
      for (const [zf, mat, ex] of [[inSide(b), MAT.alloy(), false], [exSide(b), MAT.hot(), true]]){
        const port = cyl(L.bore * 0.19, L.bore * 0.22, L.bore * 0.22, mat, 16);
        rot(port, Math.PI/2, 0, 0);
        hb.add(mk(at(port, px, 0, 0), L.deckH + L.bore * 0.40, zf * L.bore * 0.84));
        const lump = ex ? roundBox(L.bore * 0.46, L.bore * 0.44, L.bore * 0.12, L.bore * 0.03, headMat)
                        : roundBox(L.bore * 0.42, L.bore * 0.40, L.bore * 0.12, L.bore * 0.14, headMat);
        hb.add(mk(at(lump, px, 0, 0), L.deckH + L.bore * 0.40, zf * (L.bore * 0.75 + L.bore * 0.06)));
      }
      /* cast ribs between the ports on both faces */
      if (i + 1 < L.perBank) for (const zf of [inSide(b), exSide(b)])
        hb.add(mk(at(box(M(7), (solidTop - fireT) * 0.72, M(8), headMat), px + L.pitch / 2, 0, 0),
                  L.deckH + fireT + (solidTop - fireT) * 0.5, zf * (L.bore * 0.75 + M(3))));
      /* spark plug well sunk into the casting */
      hb.add(mk(at(cyl(L.bore*0.13, L.bore*0.13, L.bore*0.34, MAT.black(), 14), px, 0, 0),
                   L.deckH + L.bore * 1.02));
    }
    for (const zf of [inSide(b), exSide(b)])
      hb.add(mk(at(machinedPad(L.len * 0.97, L.bore * 0.48, M(2.5)).rotateX(Math.PI / 2), 0, 0, 0),
                L.deckH + L.bore * 0.40, zf * (L.bore * 0.87 + M(1.25))));
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
            /* between the exhaust ports and below them, as on a small-block —
               on the port centre it stood inside the primary */
            each('plugs', i * nPlug + k, mk(at(pl, p.x + L.pitch * 0.45, 0, pz), L.deckH + L.bore * 0.22, pz));
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
      /* valve cover: a real casting — twin humps over the cams with the plug
         wells in a trough between them on a twin-cam, one raised centre on
         anything else — with its bolt rail, breather box and the maker's
         lettering on top. The legend reads from the side you would stand on. */
      const wells = [...Array(e.cyl).keys()]
        .filter(i => (L.banks >= 2 ? cylSlot(e, i, L).bank % 2 : 0) === b)
        .map(i => cylPosition(e, i, L).x);
      const vc = camCoverMesh(L.len * 0.98, L.bore * 1.36, L.bore * 0.34, FIN.cover,
                              Math.max(4, e.cyl + 2), FIN.hardware,
                              { dohc: !ohv && e.cam !== 'SOHC', wells, legend: coverLegend(e, FIN),
                                flip: L.banks >= 2 ? bankSign(b) < 0 : false, flipSides: L.banks < 2 });
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
  /* the chain tensioner on the block face beside the chain: outboard of the
     water pump's neck on a vee (the pump is on the centreline there), out
     along the run to the right-hand head on a flat */
  add('tensioner', flat ? at(box(M(20), M(70), M(16), MAT.plastic()), frontX, L.bore * 0.30, L.bore * 1.5)
                        : at(box(M(20), M(70), M(16), MAT.plastic()), frontX, L.deckH * 0.55, L.bore * (L.banks >= 2 ? 0.95 : 0.5)));
  /* Belt-driven DOHC: two smooth idler pulleys steer the belt on the side the
     tensioner is not, one above the other on the long span; then the upper and
     lower plastic covers, split at the crank-pulley height. */
  if (has('idlers')){
    const idler = (r) => { const g = group('idler');
      g.add(rot(tubeMesh(r, r * 0.42, M(22), MAT.steel(), 24), 0, 0, Math.PI / 2));
      g.add(rot(cyl(r * 0.40, r * 0.40, M(28), MAT.plated(), 14), 0, 0, Math.PI / 2));
      g.add(at(rot(hexPrism(M(7), M(7), MAT.plated()), 0, 0, Math.PI / 2), -M(16), 0, 0));
      return g; };
    /* clear of the water pump body (0.55·deckH, −0.4·B, r ≈ 0.6·B) */
    each('idlers', 0, at(idler(M(26)), frontX, L.deckH * 1.05, -L.bore * 0.40));
    each('idlers', 1, at(idler(M(21)), frontX, L.deckH * 0.20, -L.bore * 1.00));
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
  /* the pan hangs off the block's pan rail through its gasket: flange top a
     gasket's thickness under the rail, as wide as the skirts it bolts under */
  const panDepth = L.crankR * (e.drySump ? 0.6 : 1.38);
  const panY = yCase - M(3) - panDepth * 0.50;
  const pan = oilPanMesh(panLen, panW, panDepth, MAT.alloyDark());
  add('oilpan', at(pan, 0, panY, 0));
  /* the filter screws into a boss on the block's flank, so it stands clear of
     it — you have to get a strap wrench round one */
  const deMaker = /bmw|mercedes|porsche|audi|volkswagen/i.test(e.maker || '');
  /* the starter's side decides the filter's on a vee: both hang low off the
     flank behind the middle of the block, and on the same side the filter
     bracket ran into the starter body */
  const starterSide = /toyota|nissan|honda|mazda|subaru|bmw|mercedes|porsche|audi|volkswagen|lexus|hyundai|kia/i.test(e.maker || '') ? -1 : 1;
  /* a twin-turbo inline has a turbo on the exhaust flank where the filter would
     go, so its filter stays on the intake side */
  const filterSide = (L.banks < 2 && e.aspiration === 'twinturbo') ? inSide(0) : -starterSide;
  const filterZ = filterSide * (L.banks >= 2 ? wCase + M(95) : outerZ + M(60));
  /* a flat's filter hangs under the barrel band (|y| < 0.775·B) off the
     crankcase flank — on the case top it stood inside the first barrel; a
     bike's is on the front of the cases under the (front) cylinder */
  const oilFilterAt = flat ? V3(-L.len * 0.30, -(L.bore * 0.80 + M(66)), -(wCase + M(95)))
                    : e.class === 'bike' ? V3(0, -L.crankR * 0.90, wCase + M(60))
                    /* an inline's is forward on the flank: between the mount and the downpipe there is no room */
                    /* a vee's at the rear corner of the pan rail, behind the Y-pipe's drop */
                    : V3(L.banks >= 2 ? L.len / 2 + M(20) : -L.len * 0.28, -L.crankR * 0.90, filterZ);
  /* at a vee's rear corner the can points forward (seal face aft would put the
     housing in the clutch) */
  const filterFwd = L.banks >= 2 && !flat;
  const ofm = oilFilterMesh(M(92), M(115), e.class === 'race' && !flat ? MAT.blue() : MAT.black());
  if (filterFwd) ofm.rotation.y = Math.PI;
  add('oilfilter', at(ofm, oilFilterAt.x, oilFilterAt.y, oilFilterAt.z));
  if (has('oilpsensor')){
    /* the pressure sender screws into the main gallery a hand's width from the
       filter, its connector pointing out of the block */
    const ps = group('oilpsensor');
    ps.add(rot(cyl(M(11), M(13), M(22), MAT.plated(), 12), Math.PI / 2, 0, 0));
    ps.add(at(roundBox(M(16), M(14), M(14), .003, MAT.black()), 0, 0, M(20)));
    const psSgn = Math.sign(oilFilterAt.z) || 1;
    if (psSgn < 0 && !flat) ps.rotation.y = Math.PI;                       // connector out, on the filter's side
    add('oilpsensor', flat ? at(ps, L.len * 0.30, -(L.bore * 0.80 + M(40)), wCase + M(22))      /* under the barrels on a flat */
                    /* on a vee outerZ is the head's reach: the sender goes on the block's own flank, by the filter */
                    : L.banks >= 2 ? at(ps, L.len / 2 - M(40), -L.crankR * 0.55, psSgn * (wCase + M(8)))
                                   : at(ps, L.len * 0.30, -L.crankR * 0.55, outerZ + M(8)));
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
               /* a single pedestal turbo sits on a bore pitch, between two pushrod pairs */
               : e.turboLayout === 'valley' ? (e.cyl >= 8 && e.aspiration === 'turbo' ? L.pitch * 1.0 : 0) : L.len * 0.14;
  /* a valley turbo is fed by up-pipes from collectors at the BACK of each bank
     (a Power Stroke), so the collector sits at the rear corner */
  const valleyT = frontTurbo && e.turboLayout === 'valley';
  const colX = valleyT ? L.len / 2 - L.bore * 0.30
             : tlOut ? turboX - L.bore * 0.3
             : frontTurbo ? frontX - L.len * 0.04
             : sideTurbo ? L.len * 0.06
             /* a vee's collector sits on a bore centre (the core plugs are between the bores) */
             : L.banks >= 2 ? (Math.ceil(L.perBank / 2) - (L.perBank - 1) / 2) * L.pitch - M(30) : L.len * 0.35;   /* (the cone is drawn 30 mm behind colX) */
  const colY = flat ? -L.bore * 1.05                 /* under the barrel band, not in it */
             : tlOut ? L.crankR * 0.55
             : frontTurbo ? L.crankR * 0.95
             : sideTurbo ? L.deckH + L.bore * 0.02
             : L.crankR * 0.5;
  /* on a vee the exhaust ports are a long way outboard, because the head is
     tilted away from the crank — so the collector has to be out there too */
  const colZ = flat ? L.deckH * 0.75 : L.bore * (L.banks >= 2 ? 1.62 : 1.20);
  /* a V bike's rear bank sits over the gearbox, so its primaries and collector
     run down BEHIND the cases, not through them */
  const bikeV = e.class === 'bike' && L.banks >= 2;
  const czOf = (side) => (bikeV && side < 0 ? L.bore * 3.0 : colZ);

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
  /* on a vee the rail runs just off the head's INNER face above the injector
     bosses, in the head's own frame — a fixed valley position put it inside
     the head on a 60° vee */
  const railAt = (b) => flat ? portAt(b, L.deckH + L.bore * 0.52, inSide(b) * L.bore * 0.95) : L.banks >= 2
    ? portAt(b, L.deckH + L.bore * 0.72, inSide(b) * L.bore * 1.02)
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
  /* what the plenum is made of decides how it is shaped: glass-filled nylon
     is moulded in two halves and vibration-welded along a seam, with ribs
     over the thin faces; a cast-alloy log carries its runners as bulges off
     a ribbed body with the maker's badge cast into a pad on top */
  const plenumStyle = inletMat === MAT.composite() ? 'composite'
                    : (inletMat === MAT.alloy() || inletMat === MAT.alloyDark()) ? 'cast'
                    : inletMat === MAT.carbon() ? 'carbon' : 'paint';
  const hasPlenum = (!itb || (boosted && L.banks < 2)) && e.id !== 'i6-30-legend' && !has('blower');
  /* a vee's throttle rides on the plenum's top front edge (see thrAt) */
  const thrLift = L.banks >= 2 && !flat ? L.bore * 0.50 : 0;
  /* a single valley turbo on a pedestal (Power Stroke) shares the valley with
     the plenum, so the plenum stops short of it */
  const valleyTurbo = frontTurbo && e.turboLayout === 'valley' && (e.aspiration === 'turbo');
  const plenumBox = { w:L.len * (valleyTurbo ? 0.46 : 0.80), h:L.bore * (L.banks >= 2 ? 0.72 : 0.46),
                      d: flat ? L.bore * 1.0 : L.banks >= 2 ? L.bore * 1.45 : L.bore * 0.70,
                      x: valleyTurbo ? -L.len * 0.22 : 0, y:inducY, z: L.banks >= 2 ? 0 : -L.bore * 1.12 };
  if (hasPlenum){   /* boosted ITBs (RB26) breathe from a collector; the 2JZ's chamber is a factory part; a blower is its own plenum */
    const { w:pw, h:ph, d:pd, x:px0, y:py0, z:pz0 } = plenumBox;
    const plenum = roundBox(pw, ph, pd, 0.03, inletMat);
    at(plenum, px0, py0, pz0);
    intakeG.add(plenum);
    const topY = py0 + ph / 2;
    const badge = coverLegend(e, FIN);
    const badgeText = badge?.lines?.[0] || String(e.maker || '').toUpperCase();
    if (plenumStyle === 'composite'){
      /* the weld seam round the middle, where the two mouldings meet */
      const sy = py0 + ph * 0.10;
      for (const zs of [-1, 1]) intakeG.add(at(box(pw + M(4), M(3), M(4), inletMat), px0, sy, pz0 + zs * pd / 2));
      for (const xs of [-1, 1]) intakeG.add(at(box(M(4), M(3), pd + M(4), inletMat), px0 + xs * pw / 2, sy, pz0));
      /* ribs across the top at every runner, and two along it */
      for (let i = 0; i < e.cyl; i++){
        const rx = cylPosition(e, i, L).x;
        if (Math.abs(rx - px0) < pw / 2 - M(10)) intakeG.add(at(box(M(4), M(7), pd * 0.84, inletMat), rx, topY + M(2), pz0));
      }
      for (const zs of [-0.30, 0.30]) intakeG.add(at(box(pw * 0.92, M(7), M(4), inletMat), px0, topY + M(2), pz0 + zs * pd));
      /* the moulded-in name, flush and the same colour as the plastic */
      intakeG.add(at(letterPlate([badgeText], pw * 0.26, Math.min(ph * 0.34, pd * 0.20), inletMat,
                                 { hex:0x5a6068, style:'paint', thickness:M(1.5), flip: L.banks < 2, shadow:false, barMat:inletMat }),
                     px0 + pw * 0.14, topY + M(6), pz0 + pd * (L.banks < 2 ? -0.02 : 0.0)));
    } else if (plenumStyle === 'cast'){
      /* longitudinal cast ribs over the top and down the outer face */
      for (const zs of [-0.32, 0, 0.32]) intakeG.add(at(box(pw * 0.94, M(6), M(7), inletMat), px0, topY + M(2), pz0 + zs * pd));
      for (const [k, yy] of [-0.22, 0.12].entries()) intakeG.add(at(box(pw * 0.94, M(7), M(6), inletMat), px0, py0 + yy * ph, pz0 + (L.banks < 2 ? -1 : 1) * (pd / 2 + M(2))));
      /* the maker's badge cast proud on a pad */
      intakeG.add(at(letterPlate([badgeText], pw * 0.30, Math.min(ph * 0.36, pd * 0.22), inletMat,
                                 { hex:0xc8ccd0, style:'cast', thickness:M(3), flip: L.banks < 2 }),
                     px0 + pw * 0.12, topY + M(6), pz0));
      /* the throttle flange face at the front end is milled bright */
      intakeG.add(at(machinedPad(ph * 0.78, pd * 0.78, M(2)).rotateZ(Math.PI / 2), px0 - pw / 2 - M(1), py0 + thrLift, pz0));
    } else if (plenumStyle === 'paint'){
      intakeG.add(at(letterPlate([badgeText], pw * 0.30, Math.min(ph * 0.36, pd * 0.22), inletMat,
                                 { hex:0xd9dde0, style:'silver', thickness:M(2), flip: L.banks < 2 }),
                     px0 + pw * 0.12, topY + M(4), pz0));
    }
  }
  /* where a runner leaves the plenum body: a flared collar (the cast runner
     root, or the moulded joint) sitting on the surface it comes out of */
  const runnerCollar = (pts, r) => {
    if (!hasPlenum) return null;
    const { w:pw, h:ph, d:pd, x:px0, y:py0, z:pz0 } = plenumBox;
    const c = new THREE.CatmullRomCurve3(pts.map(q => q.isVector3 ? q : V3(...q)));
    const inside = (q) => Math.abs(q.x - px0) < pw / 2 && Math.abs(q.y - py0) < ph / 2 && Math.abs(q.z - pz0) < pd / 2;
    let t = 0;
    for (let k = 0; k <= 40; k++){ const q = c.getPointAt(k / 40); if (!inside(q)){ t = k / 40; break; } }
    const tan = c.getTangentAt(Math.min(1, t + 0.02)).normalize();
    const col = plenumStyle === 'composite'
      ? lathe([[r * 1.00, -M(6)], [r * 1.30, -M(6)], [r * 1.30, M(8)], [r * 1.12, M(12)], [r * 1.12, M(30)], [r * 1.02, M(34)]], inletMat, 14)
      : lathe([[r * 1.00, -M(4)], [r * 1.60, -M(4)], [r * 1.42, M(12)], [r * 1.18, M(26)], [r * 1.02, M(32)]], inletMat, 14);
    col.quaternion.setFromUnitVectors(V3(0, 1, 0), tan);
    col.position.copy(c.getPointAt(t)).addScaledVector(tan, -M(4));
    return col;
  };
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.40, inSide(b) * L.bore * 0.70);
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
    const runPts = [
      [p.x, topY, zEnd],
      [p.x, (topY + py) / 2, (zEnd + pz) / 2 * 1.25],
      [p.x, py, pz],
    ];
    intakeG.add(pipe(runPts, M(17), inletMat, 8));
    if (!itb){
      const col = runnerCollar(runPts, M(17));
      if (col) intakeG.add(col);
    }
    if (itb){
      /* the throttle body, and the bellmouth above it */
      intakeG.add(at(cyl(M(23), M(23), L.bore * 0.20, MAT.alloyDark(), 20),
                     p.x, topY + L.bore * 0.10, zEnd));
      intakeG.add(at(velocityStack(M(46), L.bore * 0.34, MAT.alloy()),
                     p.x, topY + L.bore * 0.38, zEnd));
    }
  }
  /* the manifold's flange on the head's milled intake face, on its gasket */
  if (!itb) for (let b = 0; b < nBanksHead; b++){
    const sgn = inSide(b);
    const fl = portFlange(L.perBank, L.bore * 0.27, L.pitch, M(12), plenumStyle === 'composite' ? MAT.composite() : MAT.alloy());
    fl.rotation.y = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
    const [fy, fz] = portAt(b, L.deckH + L.bore * 0.40, sgn * (L.bore * 0.87 + M(5.5)));
    fl.rotation.x = L.bankAngles[b] || 0;
    intakeG.add(at(fl, 0, fy, fz));
  }
  add('intake', intakeG);
  /* the throttle body sits on the front of the plenum, where the charge pipe
     or the airbox reaches it */
  /* a vee's throttle sits on the plenum's top front edge, clear of the water
     pump on the front cover below it */
  const thrAt = V3(-L.len * 0.48, inducY + thrLift, L.banks >= 2 ? 0 : -L.bore * 1.12);
  /* the blow-off valve sits on the cold side just before the throttle, which
     is the only place the trapped charge has anywhere to go */
  /* a top-mount or air-to-water charge cooler sits on the engine itself,
     above the plenum; a front-mount core is out ahead of the radiator */
  const icTop = e.intercooler === 'water' || e.intercooler === 'top';
  /* the blow-off valve sits ON the cold pipe back from the cooler, just before
     the throttle — the one place the trapped charge has anywhere to go */
  /* (a side-core engine moves it onto its own cold pipe below; a boxer's front
     cold pipe runs up the centre, between the alternator and the compressor) */
  let bovAt = icTop ? V3(-L.len * 0.05 - L.bore * 0.9, inducY + L.bore * (L.banks >= 2 ? 0.62 : 0.80), 0)
                    : V3(frontX - L.bore * 0.10, thrAt.y + L.bore * 0.28, flat ? 0 : -L.bore * 0.90);
  if (has('throttle')){
    const tG = group('throttle');
    /* a real throttle body: the bore, a square flange with four bolts and a
       gasket onto the plenum, the butterfly shaft through it with the drive
       motor and position sensor hung on the outboard end, and the inlet lip
       the duct clamps to */
    const side = Math.sign(thrAt.z || -1);
    const tb = group('tb');
    tb.add(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 18), 0, 0, Math.PI / 2));
    tb.add(at(roundBox(M(8), M(102), M(102), M(12), MAT.alloy()), M(34), 0, 0));
    tb.add(at(machinedPad(M(98), M(98), M(1.5)).rotateZ(Math.PI / 2), M(30), 0, 0));
    tb.add(at(box(M(2), M(98), M(98), MAT.gasket()), M(39), 0, 0));
    for (const sy of [-1, 1]) for (const sz of [-1, 1])
      tb.add(at(rot(bolt(M(4), M(18), FIN.hardware), 0, 0, Math.PI / 2), M(34), sy * M(40), sz * M(40)));
    tb.add(at(rot(cyl(M(9), M(9), M(96), MAT.alloyDark(), 10), Math.PI / 2, 0, 0), 0, 0, 0));
    tb.add(at(roundBox(M(48), M(60), M(42), M(6), MAT.plastic()), 0, -M(4), side * M(66)));
    tb.add(at(rot(cyl(M(10), M(10), M(6), MAT.alloy(), 10), Math.PI / 2, 0, 0), 0, 0, -side * M(50)));
    tb.add(at(rot(tubeMesh(M(41), M(36), M(10), MAT.alloy(), 20), 0, 0, Math.PI / 2), -M(35), 0, 0));
    if (boosted) tb.add(at(rot(hoseClamp(M(43)), 0, 0, Math.PI / 2), -M(46), 0, 0));
    tG.add(at(tb, thrAt.x, thrAt.y, thrAt.z));
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
      /* the feed fitting on the front end, a blanked boss on the back */
      railG.add(at(hexPrism(M(19), M(14), MAT.steel()).rotateZ(Math.PI / 2), -L.len * 0.45 - M(7), ry, rz));
      railG.add(at(cyl(M(6), M(6), M(28), MAT.steel(), 10).rotateZ(Math.PI / 2), -L.len * 0.45 - M(26), ry, rz));
      railG.add(at(hexPrism(M(17), M(10), MAT.steel()).rotateZ(Math.PI / 2), L.len * 0.45 + M(5), ry, rz));
      /* two brackets a bank, a flat strap from a clamp round the rail down to
         a bolt in the head's intake face */
      for (const bx of [-L.len * 0.26, L.len * 0.26]){
        const [fy, fz] = portAt(b, L.deckH + L.bore * 0.72, inSide(b) * L.bore * 0.84);
        const A = V3(bx, ry, rz), B = V3(bx, fy, fz);
        const d = B.clone().sub(A);
        if (d.length() < M(20)) continue;
        const bar = box(M(18), d.length(), M(4), MAT.steel());
        bar.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
        bar.position.copy(A).addScaledVector(d, 0.5);
        railG.add(bar);
        railG.add(at(tubeMesh(M(16), M(13), M(18), MAT.steel(), 12).rotateZ(Math.PI / 2), A.x, A.y, A.z));
        const bt = bolt(M(3.5), M(12), FIN.hardware);
        bt.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize().negate());
        bt.position.copy(B);
        railG.add(bt);
      }
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
  let hpfpAt = null;
  if (has('hpfp')){
    /* cam-driven, so it sits on the END of the head where the cam stops: behind
       the plenum on a vee, on the rear face of the head on an inline — not
       inside the runners */
    const [hy, hz] = L.banks >= 2 ? [inducY - L.bore * 0.30, -L.bore * 0.55]
                                  : [L.deckH + L.bore * 0.95, -L.bore * 0.30];
    hpfpAt = V3(L.len * 0.5 + M(40), hy, hz);
    add('hpfp', at(roundBox(M(60), M(60), M(60), .01, MAT.alloyDark()), hpfpAt.x, hpfpAt.y, hpfpAt.z));
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
      /* four turbos (W16) cannot share the front corners: they sit two a side,
         outboard of the banks */
      const outboard = frontTurbo && (n >= 4 || ['outboardLow', 'rearOutboard', 'boxerRear', 'rearCentre', 'valley'].includes(tl));
      const pos = tl === 'valley' && frontTurbo
        /* hot-vee or pedestal: the turbo(s) sit in the valley between the heads */
        ? new THREE.Vector3(turboX + rank * size * 1.8, L.deckH * Math.cos(vAngle) * 1.0 + size * 0.75, 0)
        : tl === 'boxerRear' && frontTurbo
        /* a Subaru's single turbo sits on top of the right head at the back,
           beside the plenum, fed by an up-pipe — not down in the barrels */
        ? new THREE.Vector3(turboX, inducY - L.bore * 0.10, L.deckH * 0.70)
        : tl === 'rearCentre' && frontTurbo
        /* an F1 power unit's turbo sits on the crank axis at the back of the vee */
        ? new THREE.Vector3(turboX, L.deckH * Math.cos(vAngle) * 0.9 + size * 0.3, 0)
        : outboard
        ? new THREE.Vector3((n >= 4 ? -L.len * 0.10 : turboX) + rank * size * (n >= 4 ? 3.0 : 1.6),
                            flat ? -L.bore * 1.15 : L.crankR * 0.55,       /* a flat's hang under the barrel band, outboard of the heads */
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
      turbos.push({ pos, side, size, outboard,
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
      /* mirrored with the turbo: the canister stays on the compressor side,
         out from the engine, not pointing back into the block on the far bank */
      const can = wt.pos.clone().add(V3(0, wt.size * 0.62, (wt.side || 1) * wt.size * 0.42));
      const arm = wt.pos.clone().add(V3(0, wt.size * 0.52, -(wt.side || 1) * wt.size * 0.30));
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
    /* a top-mount core stands clear of the plenum lid (0.36·B on a vee) and of
       the coils on an inline's cover */
    const icY = icTop ? inducY + L.bore * (L.banks >= 2 ? 0.62 : 0.80) : L.crankR * 0.10;
    const icX = icTop ? -L.len * 0.05 : frontX - L.bore * 4.60;
    const icZ = icTop ? L.bore * 0.72 : L.bore * 1.70;
    const icG = group('ic');
    const cpG = has('chargepipes') ? group('chargepipes') : icG;
    /* a mid- or rear-engined car cools each bank's charge in a core beside the
       engine, in the side intake, one per turbo */
    const icSide = e.intercooler === 'side' && L.banks >= 2 && turbos.length > 0;
    /* an F1 unit's core is in the sidepod beside the engine, not behind it with the turbo */
    const rearCentre = e.turboLayout === 'rearCentre';
    const sideCore = (tb) => V3(rearCentre ? L.len * 0.05 : tb.pos.x + L.bore * 0.2, L.deckH * 0.62, Math.sign(tb.pos.z || 1) * (outerZ + L.bore * 1.15));
    if (icSide) for (const tb of turbos){ const c = sideCore(tb); icG.add(at(rot(coreMesh(L.bore * 1.5, L.bore * 1.1, M(70)), 0, Math.PI / 2, 0), c.x, c.y, c.z)); }
    else if (icTop) icG.add(at(coreMesh(L.bore * 1.6, L.bore * 0.40, L.bore * 0.80), icX, icY, 0));
    else icG.add(at(coreMesh(L.bore * 3.60, L.bore * 1.05, M(76)), icX, icY, 0));
    const inTank  = V3(icX + L.bore * 0.05,  icY + L.bore * 0.34,  icZ * 0.86);
    const outTank = V3(icX + L.bore * 0.05,  icY + L.bore * 0.34, -icZ * 0.86);
    for (const tb of turbos){
      const sgn = Math.sign(tb.pos.z) || 1;
      if (icSide){
        const c = sideCore(tb);
        if (rearCentre){
          /* out of the rear-centre compressor, round the back of the engine
             and forward into the sidepod core; then back over the cam cover
             and the coils to the throttle — straight lines ran through the head */
          cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                        [L.len / 2 + L.bore * 0.6, tb.coldOut.y + L.bore * 0.2, tb.coldOut.z + sgn * L.bore * 0.5],
                        [L.len / 2 + L.bore * 0.3, c.y, c.z],
                        [c.x + L.bore * 0.6, c.y - L.bore * 0.45, c.z]], tb.coldTube * 1.05, MAT.alloy(), 12));
          const over = V3(thrAt.x + L.bore * 0.3, thrAt.y + L.bore * 0.55, sgn * L.bore * 0.6);
          cpG.add(pipe([[c.x, c.y + L.bore * 0.50, c.z], [c.x - L.bore * 0.2, over.y, c.z],      /* straight up beside the core first */
                        [c.x - L.bore * 0.4, over.y, sgn * outerZ * 0.55],
                        [over.x, over.y, over.z], [thrAt.x - M(70), thrAt.y, thrAt.z + sgn * M(30)]], L.bore * 0.13, MAT.alloy(), 12));
          bovAt = over;
          continue;
        }
        cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                      [(tb.coldOut.x + c.x) / 2, Math.max(tb.coldOut.y, c.y - L.bore * 0.3), (tb.coldOut.z + c.z) / 2],
                      [c.x, c.y - L.bore * 0.45, c.z]], tb.coldTube * 1.05, MAT.alloy(), 12));
        /* and from the top of the core forward to the throttle */
        cpG.add(pipe([[c.x, c.y + L.bore * 0.50, c.z], [c.x - L.bore * 0.6, thrAt.y + L.bore * 0.2, sgn * L.bore * 1.1],
                      [thrAt.x - M(70), thrAt.y, thrAt.z + sgn * M(30)]], L.bore * 0.13, MAT.alloy(), 12));
        if (sgn < 0 || turbos.length === 1) bovAt = V3(c.x - L.bore * 0.6, thrAt.y + L.bore * 0.2, sgn * L.bore * 1.1);
        continue;
      }
      if (icTop){
        /* straight up from the compressor into the tank on its own side; a
           boxer's climbs outboard of its head first, then crosses over the
           heads to the core on top (a straight line cut through the head) */
        cpG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                      ...(flat ? [[tb.coldOut.x, Math.max(L.bore * 2.0, icY + L.bore * 0.25), sgn * (outerZ + tb.size * 0.3)],
                                  [(tb.coldOut.x + icX) / 2, Math.max(L.bore * 2.0, icY + L.bore * 0.25), sgn * (L.deckH + L.bore * 0.6)]]
                                : [[(tb.coldOut.x + icX) / 2, Math.max(tb.coldOut.y, icY) + L.bore * 0.25, sgn * icZ * 1.3]]),
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
                    /* a turbo beside or in the vee is behind the heads' front
                       corners: the pipe stays outboard (or over the valley) until
                       it is ahead of the engine, then drops to the core */
                    ...(tb.outboard && !valleyT ? [[tb.coldOut.x - L.bore * 0.2, tb.coldOut.y + L.bore * 0.3, sgn * (outerZ + tb.size * 1.2)]] : []),
                    ...(tb.outboard ? [[frontX - L.bore * 0.8, tb.coldOut.y + L.bore * 0.6, sgn * (valleyT ? Math.max(icZ * 0.9, L.bore * 0.5) : Math.max(outerZ + L.bore * 0.3, icZ))]] : []),
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
    /* bovAt is a point ON the cold pipe's centreline, so the valve stands on a
       flange welded to the top of that pipe: a saddle flange at the pipe's
       surface, the body above it */
    const pipeR = icSide ? L.bore * 0.13 : L.bore * 0.150;
    const seat = bovAt.y + pipeR;
    bovG.add(at(lathe([[0, 0], [M(34), 0], [M(34), M(5)], [M(20), M(5)], [M(20), M(16)], [0, M(16)]], MAT.alloy(), 22),
                bovAt.x, seat, bovAt.z));
    for (let k = 0; k < 4; k++){ const t = (k / 4) * TAU + Math.PI / 4;
      bovG.add(at(hexPrism(M(5), M(4), MAT.plated()), bovAt.x + Math.cos(t) * M(27), seat + M(5), bovAt.z + Math.sin(t) * M(27))); }
    bovG.add(at(lathe([[0, -M(24)], [M(30), -M(24)], [M(33), -M(10)], [M(33), M(16)],
                       [M(26), M(26)], [0, M(26)]], MAT.blue(), 22),
                bovAt.x, seat + M(16) + M(24), bovAt.z));
    bovAt = V3(bovAt.x, seat + M(16), bovAt.z);           // the signal line starts on the body
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
  const tubular = (e.class === 'race' || e.class === 'bike' || e.exhaust === 'headers');
  const exMat = tubular ? MAT.hot() : MAT.ironHot();
  /* a fabricated header shows its welds: a bead where each primary meets the
     flange and where it enters the collector. A cast log has none — it is
     one piece — but its runners are fatter and its outlet is a bolted flange. */
  const exR = tubular ? M(16) : M(19);
  const weldBead = (pts, t, r) => {
    const c = new THREE.CatmullRomCurve3(pts.map(q => q.isVector3 ? q : V3(...q)));
    const bead = torus(r * 1.04, r * 0.13, MAT.hot(), 18);
    bead.quaternion.setFromUnitVectors(V3(0, 0, 1), c.getTangentAt(t).normalize());
    bead.position.copy(c.getPointAt(t));
    return bead;
  };
  const primary = (pts, r, seg = 8) => {
    const g = group('primary');
    g.add(pipe(pts, r, exMat, seg));
    if (tubular){ g.add(weldBead(pts, 0.05, r)); g.add(weldBead(pts, 0.95, r)); }
    return g;
  };
  /* ---- exhaust ---- */
  const exG = group('ex');
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const side = L.banks >= 2 ? exSide(b) : 1;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.40, side * L.bore * 0.70);
    if (nitro){
      /* zoomies: one short upswept pipe per port, nothing collected */
      /* out past the head's face first, then up — straight up from the port
         it climbed through the head beside the rockers */
      exG.add(pipe([[p.x, py, pz],
                    [p.x + L.bore * 0.15, py + L.bore * 0.05, pz + side * L.bore * 0.70],
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
      exG.add(primary([
        [p.x, py, pz],
        [p.x, py - L.bore * 0.06, pz + side * L.bore * 0.30],
        [p.x, colY + L.bore * 0.06, side * colZ * 0.94],
        [p.x, colY, side * colZ],
      ], M(19)));
      continue;
    }
    const outZ = pz + side * L.bore * 0.34;
    const runZ = side * Math.max(Math.abs(outZ), czOf(side) * 1.18);
    /* a turbocharged vee's primaries sweep forward into the turbine bolted to
       the front corner; everything atmospheric collects at the back */
    /* the turbo on this bank's own side (a boxer's bank 0 is +Z, a vee's −Z);
       valley turbos and a boxer's single turbo are fed from the collectors by
       their own up-pipes, so those primaries stop at the collector */
    const tb = frontTurbo && !valleyT && !(flat && turbos.length === 1)
      ? (turbos.find(t => t.side === side) || turbos[0]) : null;
    /* a flat's primaries run UNDER the barrel band (|y| < 0.775·B): at −0.55·B
       they ran through the cylinders */
    exG.add(primary([
      [p.x, py, pz],
      [p.x, py - L.bore * 0.38, outZ],
      [p.x, flat ? -L.bore * 1.02 : L.crankR * 1.45, runZ],
      /* a vee's sweep runs a little further out, clear of the core plugs on the bank face */
      /* an inline's stays above the engine-mount bracket on the flank */
      [(p.x + colX) / 2, flat ? -L.bore * 1.05 : L.crankR * (frontTurbo ? 1.15 : L.banks < 2 ? 1.60 : 0.95), side * czOf(side) * (L.banks >= 2 && !flat ? 1.25 : 1.08)],
      [colX + (tb ? L.bore * 0.30 : 0), colY, side * czOf(side) * (tb ? 0.92 : 1)],
      tb ? [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z] : [colX, colY, side * czOf(side)],
    ], exR));
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
   for (const side of (L.banks >= 2 ? [-1, 1] : [1])){
    const colZs = czOf(side);
    exG.add(at(lathe([[M(26), -M(34)], [M(30), -M(10)], [M(24), M(22)], [M(24), M(34)]],
                     exMat, 22).rotateZ(Math.PI / 2),
               colX + M(30), colY, side * colZs));
    if (tubular){
      /* the merge collar where the primaries are welded into the cone, and
         the slip joint the downpipe pushes onto */
      exG.add(at(tubeMesh(M(33), M(29), M(14), MAT.hot(), 22).rotateZ(Math.PI / 2), colX + M(2), colY, side * colZ));
      exG.add(at(tubeMesh(M(27), M(24), M(18), MAT.steel(), 22).rotateZ(Math.PI / 2), colX + M(58), colY, side * colZ));
    } else {
      /* a cast log ends in a three-stud outlet flange the downpipe bolts to */
      const of = group('outlet');
      of.add(tubeMesh(M(44), M(24), M(12), MAT.iron(), 6).rotateZ(Math.PI / 2));
      for (let k = 0; k < 3; k++){
        const t = (k / 3) * TAU + Math.PI / 6;
        of.add(at(rot(nutOnStud(M(13), M(9), FIN.hardware), 0, 0, -Math.PI / 2), M(6), Math.cos(t) * M(36), Math.sin(t) * M(36)));
      }
      exG.add(at(of, colX + M(60), colY, side * colZ));
    }
   }
  /* the manifold bolts to a real port flange, not to thin air */
  for (const bk of (L.banks >= 2 ? [-1, 1] : [1])){
    const fl = portFlange(Math.max(1, Math.round(e.cyl / L.banks)), L.bore * 0.26,
                          L.len / Math.max(1, e.cyl / L.banks), tubular ? M(10) : M(14), tubular ? MAT.steel() : MAT.iron());
    rot(fl, 0, 0, 0);
    /* the plate is built facing +X; turned to face out of its own side so it
       sits ON the gasket on the head's machined port face, not inside the head */
    fl.rotation.y = bk > 0 ? -Math.PI / 2 : Math.PI / 2;
    const bIdx = L.banks >= 2 ? (bk > 0 ? (bankSign(0) > 0 ? 0 : 1) : (bankSign(0) > 0 ? 1 : 0)) : 0;
    const [fy, fz] = portAt(bIdx, L.deckH + L.bore * 0.40, bk * (L.bore * 0.87 + M(5.5)));
    fl.rotation.x = L.bankAngles[bIdx] || 0;
    at(fl, 0, fy, fz);
    exG.add(fl);
  }
  /* on a turbo engine the collector hands the gas to the turbine, so the last
     length of manifold is the pipe that reaches the housing */
  for (const tb of turbos)
    exG.add(pipe(flat && turbos.length === 1
      /* a boxer's single turbo sits over the right head: the up-pipe climbs
         outboard of that head's cam cover and comes in over the top */
      ? [[colX + M(30), colY, tb.side * colZ], [colX + L.bore * 0.2, -L.bore * 0.6, tb.side * (L.deckH + L.bore * 1.75)],
         [colX + L.bore * 0.2, tb.hotIn.y - L.bore * 0.3, tb.side * (L.deckH + L.bore * 1.75)], [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z]]
      : [[colX + M(30), colY, tb.side * colZ],
                    /* a valley turbo's up-pipe climbs behind the block into the vee, outside the bellhousing plate */
                    valleyT ? [L.len / 2 + L.bore * 0.45, (colY + tb.hotIn.y) / 2, tb.side * colZ * 1.05]
                            : [(colX + tb.hotIn.x) / 2, (colY + tb.hotIn.y) / 2, tb.side * colZ * 1.04],
                    [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z]], tb.hotTube * 0.92, exMat, 10));
  /* and the crossover that brings the other bank's gas to that single turbo, under the crankcase */
  if (flat && turbos.length === 1)
    exG.add(pipe([[colX + M(30), colY, -turbos[0].side * colZ], [colX + M(30), colY - L.bore * 0.25, 0],
                  [colX + M(30), colY, turbos[0].side * colZ]], turbos[0].hotTube * 0.92, exMat, 10));
  add('exmanifold', exG);

  /* The downpipe starts where the gas actually leaves: the turbine's axial
     mouth on a turbo engine, the collector on everything else. A vee collects
     twice, so the second side crosses under the sump and joins the first. */
  const dpG = group('dp');
  /* an atmospheric vee's Y-pipe crosses UNDER the sump, so the join and the
     tail are below the pan — at crank height it ran through the crankcase */
  const veeNA = L.banks >= 2 && !flat && !frontTurbo && !sideTurbo && !bikeV;
  const underPan = yCase - M(3) - L.crankR * (e.drySump ? 0.6 : 1.38) - M(50);
  /* Every tail passes the flywheel plane, so it has to be outside the ring
     gear: below and outboard of it (radius > 1.55·B + the pipe) — at crank
     height it ran through the flywheel and the clutch. A V bike's pipes come
     down the right side of the cases and run forward under them (a Y under
     the sump went through the gearbox); a valley turbo's downpipe leaves over
     the back of the engine. */
  const bikeX = -(L.len / 2 + L.bore * 0.8);
  const tail = bikeV      ? new THREE.Vector3(bikeX, -L.crankR * 2.2, colZ * 2.0)
             : valleyT    ? new THREE.Vector3(L.len / 2 + L.bore * 1.5, underPan, colZ * 1.1)
             : frontTurbo ? new THREE.Vector3(L.len * 0.78, underPan + L.crankR * 0.3, colZ * 0.90)
             : sideTurbo  ? new THREE.Vector3(L.len * 0.72, -L.crankR * 2.4, colZ * 1.25)
             : new THREE.Vector3(colX + L.len * 0.46, veeNA ? underPan + L.crankR * 0.3 : -L.crankR * 2.2, (veeNA ? starterSide : 1) * colZ * (veeNA ? 1.05 : 1.30));
  const starts = turbos.length
    ? turbos.map(tb => ({ p:tb.hotOut, r:tb.axialTube * 0.86, side:tb.side }))
    : (L.banks >= 2 ? [-1, 1] : [1]).map(side =>
        ({ p:new THREE.Vector3(colX + M(30), colY, side * czOf(side)), r:M(24), side }));
  const join = bikeV      ? new THREE.Vector3(bikeX, -L.crankR * 1.8, colZ * 1.10)
             : valleyT    ? new THREE.Vector3(L.len / 2 + L.bore * 0.7, underPan, colZ * 1.10)
             : frontTurbo ? new THREE.Vector3(L.len * 0.40, underPan, colZ * 1.10)      /* under the pan and the starter, outside the skirt */
             : sideTurbo  ? new THREE.Vector3(L.len * 0.34, -L.crankR * 1.80, colZ * 1.10)
             /* the Y joins on the starter's side, away from the filter and its bracket */
             : veeNA      ? new THREE.Vector3(colX + L.len * 0.30, underPan, starterSide * colZ * 1.02)
             /* an inline's single pipe drops beside the block before the rear face */
             : new THREE.Vector3(L.len * 0.40, -L.crankR * 2.0, colZ * 1.10);
  for (const st of starts)
    dpG.add(pipe(bikeV
      /* straight down past the cases first, then forward under them to the right side */
      ? [[st.p.x, st.p.y, st.p.z], [st.p.x, -L.crankR * 2.0, st.p.z * 1.1], [bikeX + L.bore * 0.2, -L.crankR * 1.9, st.p.z * 0.8], [join.x, join.y, join.z]]
      : valleyT
      ? [[st.p.x, st.p.y, st.p.z], [L.len / 2 + L.bore * 0.6, st.p.y + L.bore * 0.1, st.p.z + (st.side || 1) * L.bore * 0.25],
         [L.len / 2 + L.bore * 0.7, underPan, (st.side || 1) * colZ * 0.8], [join.x, join.y, join.z]]
      : [[st.p.x, st.p.y, st.p.z],
                  [st.p.x + L.len * (frontTurbo ? 0.26 : 0.10),
                   st.p.y - L.bore * (frontTurbo ? 0.55 : sideTurbo ? 1.30 : 0.28),
                   st.p.z * (frontTurbo ? 1.12 : sideTurbo ? 1.25 : veeNA ? 1.0 : 0.86)],      /* an inline turbo's drop clears the mount bracket; a vee's stays off the core plugs */
                  /* a vee's pipe drops beside the pan before it crosses under it */
                  ...(veeNA ? [[st.p.x + L.len * 0.08, underPan, st.p.z * 1.30]] : []),
                  ...(frontTurbo ? [[st.p.x + L.len * 0.34, underPan, st.p.z * 1.15]] : []),
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
        /* the gasket is a frame, not a slab: two rails and two ends, lying on
           the head's milled cam-box rail under the cover's foot */
        const gw = L.len * 0.98, gd = L.bore * 1.50, lip = L.bore * 0.09;
        const gy = L.deckH + L.bore * 1.33;
        for (const zs of [-1, 1])
          vgG.add(hold(plate(gw, M(3), lip), gy, zs * (gd - lip) / 2));
        for (const xs of [-1, 1]){
          const end = plate(lip, M(3), gd - lip * 2);
          end.position.x = xs * (gw - lip) / 2;
          vgG.add(hold(end, gy));
        }
        /* the rubber grommets the cover bolts pull down through: one on top
           of every bolt boss on the cover rail, under the flanged head */
        const nb = Math.max(4, e.cyl + 2);
        const bossTop = L.deckH + L.bore * 1.34 + L.bore * 0.34 * 0.26;
        for (let i = 0; i < nb; i++){
          const gx = (i / (nb - 1) - 0.5) * gw * 0.92;
          for (const zs of [-1, 1]){
            const gm = tubeMesh(M(7.5), M(3.3), M(6), MAT.rubber(), 12);
            gm.position.x = gx;
            vgG.add(hold(gm, bossTop + M(3), zs * L.bore * 0.68 * 0.90));
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
        const [gy, gz] = portAt(b, L.deckH + L.bore * 0.40, side * (L.bore * 0.87 + M(4)));
        /* a flat plate with the port cut through it */
        const ring = tubeMesh(r * 1.62, r, M(3), MAT.gasket(), 20);
        ring.rotation.set(Math.PI / 2 + a, 0, 0);
        grp.add(at(ring, p.x, gy, gz));
      }
    }
    add('intgasket', igG); add('exgasket', egG);

    /* --- oil pan gasket, drain bolt and its crush washer --- */
    const pgG = gk('pangasket');
    const pw = panLen, pd = panW * 1.10, prail = yCase - M(1.5);
    for (const zs of [-1, 1])
      pgG.add(at(plate(pw, M(3), M(16)), 0, prail, zs * (pd - M(16)) / 2));
    for (const xs of [-1, 1])
      pgG.add(at(plate(M(16), M(3), pd - M(32)), xs * (pw - M(16)) / 2, prail, 0));
    /* the drain bolt hangs out of the lowest corner of the pan, with a soft
       copper washer under its head that is meant to be crushed once */
    const dx = pw * 0.40, dy = panY - panDepth * 0.49, dz = panW * 0.30;
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
  /* a vee's pump sits on the cover centreline right over the timing set, so its
     belt plane is a little further out, which keeps the pump's neck off the
     chain and the damper ahead of the cover */
  const beltX = frontX - M(L.banks >= 2 && !flat ? 80 : 46);
  const beltRun = [{ y:0, z:0, r:L.bore * 0.85 }];
  if (has('waterpump')){
    const wpSize = L.bore * 1.15;
    const wp = waterPumpMesh(wpSize);
    anim.pulleys.push({ node:wp.userData.pulley, ratio:1.5 });
    /* a vee's pump sits on the centreline of the front cover; an inline's is
       offset toward the intake side (realism.md §2.2) */
    /* a flat's clears the crank sprocket; a vee's lower hose snout clears the OHV timing set */
    const wpZ = L.banks >= 2 ? 0 : -L.bore * 0.4, wpY = flat ? L.bore * 0.95 : L.deckH * (L.banks >= 2 ? 0.62 : 0.55);
    /* a bike's pump is low on the right-hand case ahead of the cylinders,
       driven off the oil pump — at belt height it sat inside the clutch basket */
    if (e.class === 'bike') add('waterpump', at(wp, frontX - M(20), -L.crankR * 0.6, L.bore * 1.3));
    else add('waterpump', at(wp, beltX + wpSize * 0.34, wpY, wpZ));
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
    if (e.class === 'bike'){
      /* ahead of the forward head's top corner — a V's front bank reaches a
         long way forward */
      const reach = Math.max(...L.bankAngles.map(a => Math.abs(Math.sin(a)) * (L.deckH + L.bore * 1.55) + Math.abs(Math.cos(a)) * L.bore * 0.80));
      add('radiator', at(rot(rad, 0, Math.PI / 2, 0), 0, L.deckH * 0.95, Math.max(L.bore * 2.3, reach + M(60))));
    }
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
        /* a tube's axis is Y; rotating it by the bank angle lays it along the
           bore axis, so the fin is a ring round the barrel — the extra quarter
           turn stood it on edge and, on a boxer, pushed it into the crankcase */
        fin.rotation.x = (L.bankAngles[b] || 0);
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
  at(pulley, beltX, 0, 0);
  anim.pulleys.push({ node:pulley, ratio:1 });
  add('crankpulley', pulley);

  const altSize = L.bore * 1.35;
  const alt = alternatorMesh(altSize);
  anim.pulleys.push({ node:alt.userData.pulley, ratio:2.6 });
  /* the alternator hangs off the front of the engine on its own bracket, out
     past the widest point of the casting — not tucked into the vee */
  /* On a vee it sits against the OUTER face of the intake-side bank, low on
     the cylinder case under the head's overhang — at 0.78·deckH it was inside
     the leaning head, around the cam caps. */
  const altR = altSize * 0.56;
  /* a flat's sits on top of the crankcase beside the plenum, above the barrel band */
  let altY = flat ? L.bore * 1.75 : L.deckH * 0.78, altZ = flat ? -L.bore * 1.20 : -(outerZ + altSize * 0.50);
  let altFootZ = -(wCase + M(6));                                           // where the pivot bracket's foot meets the casting
  let altFace = null;                                                       // the bank face the bracket bolts to: z at a given y
  if (L.banks >= 2 && !flat){
    const [fy, fz] = portAt(0, L.deckH * 0.80, exSide(0) * halfD);        // a point on bank 0's outer face
    const [ny, nz] = portAt(0, 0, exSide(0));                              // that face's outward normal
    altY = fy + ny * (altR + M(12)); altZ = fz + nz * (altR + M(12));
    altFace = (y) => fz - ny * (y - fy) / nz;
    altFootZ = altFace(altY - altR * 0.92);                                // the bank face at the pivot lug's height
  }
  const altAt = V3(beltX + altSize * 0.56, altY, altZ);
  add('alternator', at(alt, altAt.x, altAt.y, altAt.z));
  beltRun.push({ y:altY, z:altZ, r:altSize * 0.34 });

  /* an idler and a spring-loaded tensioner, which is what makes the run work */
  /* a vee's pump sits on the centreline, so its tensioner goes out beside it
     (at −0.2·B it was inside the pump body); a flat's pump is low, so the
     tensioner stays up where the compressor is not */
  const tensAt = L.banks >= 2 && !flat ? [L.deckH * 0.85, -L.bore * 0.95]
               : flat ? [L.bore * 1.90, -L.bore * 0.20]
               : [L.deckH * 0.96, -L.bore * 0.20];
  for (const [y, z, r, id] of [[L.deckH * 0.24, -L.bore * 1.00, L.bore * 0.24, 'idler'],
                               [tensAt[0], tensAt[1], L.bore * 0.21, 'tensioner']]){
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
  /* a bike's sits on top of the gearbox section of the cases behind the
     cylinders (the gear cluster is under 1.2 bores behind the crank); a flat's
     is on the gearbox bellhousing behind the clutch, pinion forward onto the
     ring gear — on top of the crankcase it stood in the barrels */
  const flatStarter = rot(starterMesh(L.bore * 1.6), 0, Math.PI, 0);
  add('starter', e.class === 'bike' && !flat                      /* (a boxer bike's is on the gearbox behind the engine, like a car's) */
    /* a V bike's rear head leans back over the gearbox, so its starter sits lower, behind the gear cluster */
    ? at(starterMesh(L.bore * 1.3), L.len * 0.05, L.banks >= 2 ? L.bore * 0.75 : L.bore * 1.7, L.banks >= 2 ? -L.bore * 3.2 : -L.bore * 3.0)
    : flat ? at(flatStarter, L.len / 2 + M(100) + L.bore * 0.72, -L.bore * 0.5, -L.bore * 1.55)
    /* a W's core plugs are on a tight pitch, so its starter hangs a little lower to clear the last one */
    : at(starterMesh(L.bore * 1.6), L.len * 0.42, -L.bore * (e.layout === 'W' ? 0.70 : 0.52), starterSide * L.bore * 1.42));
  if (has('mounts')){
    /* a bracket off each flank of the block onto a rubber mount — the two
       points the whole engine hangs from */
    for (const [k, zs] of [-1, 1].entries()){
      const mg = group('mount');
      mg.add(roundBox(M(70), M(36), M(26), .006, MAT.alloyDark()));
      mg.add(at(box(M(60), M(30), M(40), MAT.rubber()), 0, -M(28), zs * M(20)));
      mg.add(at(roundBox(M(70), M(8), M(80), .004, MAT.steel()), 0, -M(46), zs * M(20)));
      /* a flat's barrels occupy the flank at crank height, so its mounts sit
         under the barrel band on the lower case */
      /* between two core plugs (they sit on the pitch grid, offset half a pitch
         when the counts allow) rather than on one */
      const nCp = has('coreplugs') ? qtyOf('coreplugs') : 0, perSideCp = Math.ceil(nCp / 2);
      const cpEven = (perSideCp + L.perBank) % 2 === 0;            // the plug grid is shifted half a pitch when this holds
      const mountX = nCp && ((perSideCp % 2 === 1) !== cpEven) ? L.pitch * 0.5 : 0;
      each('mounts', k, at(mg, mountX, flat ? -(L.bore * 0.80 + M(50)) : L.crankR * 0.35, zs * (wCase + M(28))));
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
    /* on a vee the bank casting leans out over the skirt at that height, so
       the sensors go lower, on the skirt itself */
    for (const sgn of (L.banks >= 2 ? [-1, 1] : [inSide(0)]))          /* an inline's is on the intake flank, under the manifold */
      fitSensor('knock', 'screw', V3(L.banks >= 2 && !flat ? -L.pitch : e.class === 'bike' ? -L.len * 0.30 : -L.len * 0.06,       /* a vee's a pitch ahead of the mount bracket; a bike's ahead of the gear cluster */
                                     L.banks >= 2 && !flat ? L.crankR * 0.45 : L.crankR * 1.15, sgn * caseZ), V3(0, 0, sgn));
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
  if (has('waterpump') && !has('ect')){
    /* coolant temperature lives in the flow leaving the head, which is the one
       place the ECU can trust it (when the tree lists the ECT as its own part,
       that part is the sensor — this one sat inside it) */
    fitSensor('waterpump', 'screw', V3(frontX + M(26), L.deckH * 0.86, -L.bore * 0.16),
              V3(-0.2, 1, 0).normalize());
  }
  if (has('oilfilter'))
    /* a flat's flank at crank height is the barrels, so its sender hangs under the pan rail */
    fitSensor('oilfilter', 'screw', flat ? V3(L.len * 0.16, yCase - M(16), -(L.bore * 0.55 + M(30))) : V3(L.len * 0.16, -L.crankR * 0.55, (Math.sign(oilFilterAt.z) || 1) * (caseZ + M(10))),
              flat ? V3(0, -1, 0) : V3(0, 0, Math.sign(oilFilterAt.z) || 1));       /* on the filter's side of the block, off the casting's bevel */
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
  if (has('alternator')) plugs.push(V3(altAt.x + L.bore * 0.14, altAt.y, altAt.z + altR * 0.9));
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
    /* on a vee the housing is on top of the water pump on the front cover
       (an LS, a Ferrari V8); on an inline it is on the head's front face */
    if (L.banks >= 2 && !flat) at(st, beltX + L.bore * 1.15 * 0.34 + M(6), L.deckH * 0.62 + L.bore * 1.15 * 0.50 + M(12), 0);
    /* a boxer's is beside the pump on the case front (the head's front face is
       a long way out sideways, and over the pump is the throttle) */
    else if (flat) at(st, beltX + L.bore * 1.15 * 0.34 - M(20), L.bore * 0.55, -L.bore * 0.95);   /* ahead of the timing belt plane */
    else at(st, frontX + M(14), L.deckH * 0.86, -L.bore * 0.16);
    statOut = st.userData.outlet.clone().applyEuler(st.rotation).add(st.position);
    add(tree.byId['thermostat'] ? 'thermostat' : 'waterpump', st);
    if (has('ect'))
      /* screwed into the top of the housing (its flank on a boxer, under the
         alternator), not standing in the top hose or the belt */
      add('ect', flat ? at(rot(cyl(M(7), M(9), M(26), MAT.plated(), 10), Math.PI / 2, 0, 0),
                           st.position.x, st.position.y, st.position.z - L.bore * 0.30 - M(13))
                 /* under a blower's snout the sensor goes in the housing's flank */
                 : has('blower') ? at(rot(cyl(M(7), M(9), M(26), MAT.plated(), 10), Math.PI / 2, 0, 0),
                           st.position.x, st.position.y - M(4), st.position.z + L.bore * 0.30 + M(13))
                      : at(cyl(M(7), M(9), M(26), MAT.plated(), 10),
                           st.position.x, st.position.y + L.bore * 0.30 + M(13), st.position.z));
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
    /* They leave the REAR FACE of the head and run outside the casting: down
       the valley floor under the plenum on a vee, along the intake flank of
       the block on an inline. Started inside the head and routed through the
       block they passed through the valve seats and the bores. */
    const vee = L.banks >= 2 && !flat;
    const [hy, hz] = portAt(0, L.deckH + L.bore * 0.55, inSide(0) * L.bore * (vee ? 0.45 : 0.35));
    const midZ = vee ? -L.bore * 0.06 : -(wCase + L.bore * 0.30);
    const midY = vee ? inducY - L.bore * 0.55 : L.deckH * 0.72;
    for (const [i, dz] of [[0, -M(34)], [1, M(34)]])
      add(tree.byId['bypasspipe'] ? 'bypasspipe' : 'waterpump', hoseRun([V3(L.len / 2 + M(6), hy - i * M(40), hz + dz),
                                /* out behind the head, then round its rear corner to the outside */
                                V3(L.len / 2 + L.bore * 0.45, hy - i * M(40) - L.bore * 0.10, (hz + midZ) / 2 + dz),
                                V3(L.len / 2 - L.bore * 0.30, midY + (hy - midY) * 0.35, midZ + dz),
                                V3(L.len * 0.24, midY, midZ + dz),
                                ...(vee ? [] : [V3(-L.len * 0.30, L.deckH * 0.60, midZ + L.bore * 0.05 + dz)]),
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
  if (has('oilpan')){
    /* on a vee the tube stands against the outer face of the bank, between the
       first two primaries, and drops to the skirt — at the inline's position it
       stood inside the leaning bank casting */
    const vee = L.banks >= 2 && !flat;
    const dipX = vee ? -(L.perBank - 2) / 2 * L.pitch + L.pitch * 0.25 : -L.len * 0.30;   /* a quarter pitch off the core plug between the bores */
    const [dy, dz] = vee ? portAt(0, L.deckH * 0.90, exSide(0) * (halfD + M(30))) : [L.deckH * 0.62, -caseZ - M(26)];
    add('dipstick', dipstickMesh([V3(dipX, dy, dz),
                                V3(dipX + L.len * 0.04, L.crankR * 0.40, -caseZ - M(16)),
                                V3(dipX + L.len * 0.10, -L.crankR * 1.55, -L.bore * 0.55)], M(7)));
  }
  if (has('oilfilter') && has('oilcooler')){
    /* the oil cooler: a stacked-plate core on the filter housing, fed and
       returned by two hoses off the block's gallery — the part the tree has
       been calling "filter & cooler" without ever drawing the cooler */
    const cool = coreMesh(L.bore * 1.30, L.bore * 0.72, M(52), { body:MAT.alloyDark() }, 14);
    /* on the filter's side of the block (the filter's own hoses feed it) */
    const cs = Math.sign(oilFilterAt.z) || 1;
    const coolZ = cs * (outerZ + L.bore * 0.55);
    add('oilcooler', at(cool, L.len * 0.06, -L.crankR * 0.75, coolZ));
    add('oilcooler', hoseRun([V3(oilFilterAt.x, -L.crankR * 0.90, cs * (outerZ + M(20))),
                              V3(L.len * 0.16, -L.crankR * 0.72, coolZ),
                              V3(L.len * 0.06 + L.bore * 0.55, -L.crankR * 0.62, coolZ)],
                             L.bore * 0.055));
    add('oilcooler', hoseRun([V3(L.len * 0.06 - L.bore * 0.55, -L.crankR * 0.62, coolZ),
                              V3(L.len * 0.00, -L.crankR * 0.20, coolZ * 0.92),
                              V3(L.len * 0.06, L.crankR * 0.45, cs * (caseZ + M(4)))], L.bore * 0.055));
  }
  if (has('valvecover')){
    /* the filler cap and the breather both live on the cam cover, because that
       is the top of the crankcase once the engine is together */
    /* both stand on the cover's own top surface: the cap on the intake-side
       hump, the valve down in the plug-well trough of a twin-cam cover */
    const dohcCover = !ohv && e.cam !== 'SOHC';
    const topAt = (z) => (ohv && airCooled) ? L.bore * 1.52
                       : L.bore * 1.34 + camCoverTopAt(L.bore * 1.36, L.bore * 0.34, z, dohcCover);
    const [cy, cz] = portAt(0, L.deckH + topAt(L.bore * 0.34), -bankSign(0) * L.bore * 0.34);
    add('valvecover', at(standOn(fillerCap(L.bore * 0.22), bankUp(0)), -L.len * 0.34, cy, cz));
    const [vy, vz] = portAt(0, L.deckH + topAt(L.bore * 0.10), -bankSign(0) * L.bore * 0.10);
    const pcvAt = V3(L.len * 0.26, vy, vz);
    add('pcv', at(standOn(pcvValve(L.bore * 0.20), bankUp(0)), pcvAt.x, pcvAt.y, pcvAt.z));
    if (has('intake')){
      /* the breather hose goes back into the inlet tract, which on a hot-V is
         the plenum on that same bank rather than something in the middle */
      const [my, mz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.70 : 0.34)];
      add('pcv', hoseRun([pcvAt.clone().add(bankUp(0).multiplyScalar(L.bore * 0.24)),
                                 V3(L.len * 0.14, (pcvAt.y + my) / 2 + L.bore * (flat ? 0.70 : 0.20), (pcvAt.z + mz) / 2),   /* a boxer's hose clears the injectors on the head's top face */
                                 V3(-L.len * 0.02, my, mz)], L.bore * 0.055));
    }
  }
  if (has('intake')){
    /* the brake servo take-off: the biggest vacuum line on the engine */
    const [sy, sz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.72 : 0.36)];
    if (e.class !== 'bike'){
      /* on a vee the line stays over the valley — reaching out to 1.45·sz put
         its check valve on the rear cam cap of a 60° engine */
      const vee = L.banks >= 2 && !flat;
      const end = V3(L.len * 0.44, sy + L.bore * 0.28, vee ? sz * 0.85 : sz * 1.45 + L.bore * 0.50);
      add('intake', hoseRun([V3(L.len * 0.24, sy, sz),
                             V3(L.len * 0.36, sy + L.bore * 0.40, vee ? sz * 0.95 : sz * 1.25 + L.bore * 0.30), end],
                            L.bore * 0.075));
      /* the one-way valve the servo line runs through */
      add('intake', at(rot(cyl(M(13), M(13), M(42), MAT.plastic(), 12), Math.PI / 2, 0, 0), end.x, end.y, end.z + Math.sign(sz) * M(20)));
    }
  }
  if (has('fuelrail')){
    const [railY, railZ] = railAt(0);
    /* the feed comes up to the rail's rear end: from behind the block on a vee
       (a line rising out of the valley casting is not a line), up the flank
       on an inline */
    add('fuelrail', braidedLine([L.banks >= 2 && !flat ? V3(L.len / 2 + L.bore * 0.30, railY - L.bore * 1.00, railZ * 1.30)
                                                       : V3(L.len * 0.42, L.crankR * 1.10, railZ * 1.30),
                                 V3(L.len * 0.48, railY - L.bore * 0.30, railZ * 1.05),
                                 V3(L.len * 0.44, railY, railZ)], M(5)));
    if (has('hpfp') && hpfpAt){
      /* the high-pressure line from the pump on the rear of the head to the rail's rear end */
      const hy = hpfpAt.y, hz = hpfpAt.z;
      add('hpfp', braidedLine([V3(hpfpAt.x - M(30), hy, hz),
                               V3(L.len * 0.48, (hy + railY) / 2 + L.bore * 0.10, (hz + railZ) / 2),
                               V3(L.len * 0.42, railY, railZ)], M(5)));
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
    altAt, altFootZ, altFace, oilFilterAt, filterFwd, flat,
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
    const px = xOf(i) - pitch/2;
    at(plate, px, 0, 0);
    sideG.add(plate);
    /* an iron is machined where the rotor housing seals against it: a bright
       face on both sides of every intermediate plate and the inner side of
       each end plate; the end plates' outer faces carry cast webs out to the
       stud bosses instead */
    const ends = (i === 0 ? [1] : i === n ? [-1] : [-1, 1]);
    for (const sx of ends)
      sideG.add(at(tubeMesh(R * 1.26, R * 0.34, M(1.5), MAT.machined(), 36).rotateZ(Math.PI / 2), px + sx * M(7.5), 0, 0));
    if (i === 0 || i === n){
      const sx = i === 0 ? -1 : 1;
      for (let k = 0; k < 8; k++){
        const t = (k / 8) * TAU + Math.PI / 8;
        const web = box(M(12), R * 0.80, M(11), MAT.iron());
        web.position.set(px + sx * M(13), Math.cos(t) * R * 0.62, Math.sin(t) * R * 0.62);
        web.rotation.x = t;
        sideG.add(web);
      }
      sideG.add(at(tubeMesh(R * 0.36, R * 0.22, M(12), MAT.iron(), 24).rotateZ(Math.PI / 2), px + sx * M(13), 0, 0));
    }
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
    /* the housing's cast exterior: cooling fins standing along the top and
       lying along both flanks, a boss cast round every tension bolt where it
       passes the edge of the casting, and the coolant-passage swell low on
       each flank where the water runs past the hot side */
    for (let f = -4; f <= 4; f++)
      rhPieces[i].add(at(box(width * 0.92, R * 0.20, M(5), MAT.alloy()), xOf(i), R * 1.02 + R * 0.10, f * R * 0.24));
    for (const zs of [-1, 1]) for (let f = 0; f < 5; f++)
      rhPieces[i].add(at(box(width * 0.92, M(5), R * 0.16, MAT.alloy()), xOf(i), R * (0.10 + f * 0.19), zs * (R * 1.18 + R * 0.08)));
    for (let k = 0; k < 18; k++){
      const t = (k / 18) * TAU;
      rhPieces[i].add(at(tubeMesh(M(14), M(7), width * 0.98, MAT.alloy(), 10).rotateZ(Math.PI / 2),
                         xOf(i), Math.sin(t) * R * 1.05, Math.cos(t) * R * 1.05));
    }
    for (const zs of [-1, 1])
      rhPieces[i].add(at(roundBox(width * 0.84, R * 0.34, M(16), M(7), MAT.alloy()), xOf(i), -R * 0.40, zs * (R * 1.18 + M(6))));
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
    /* as long as the housing stack plus a nut each end — not half a housing
       further, where they ran through the alternator and the throttle */
    const b = cyl(M(6), M(6), pitch * n + M(14) + M(28), MAT.steel(), 8);
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
      /* outboard of the housings' exhaust face and the plugs (which sit at ~1.1·R) */
      at(t, xOf(0) + i * pitch * 0.9, -R*0.15 + i*R*0.55, R*2.05);
      tg.add(t);
    }
    add('turbo', tg);
    const ric = coreMesh(pitch*(n+1.4), R*0.8, M(76));
    add('intercooler', at(ric, xOf(0) - pitch * 1.9, -R*0.1, 0));
  }

  const intakeG = group('intake');
  /* the plenum sits outside the tension bolts (1.05·R), its runners dive in
     between them to the side ports */
  intakeG.add(at(roundBox(pitch*n*0.9, M(90), M(120), .02, MAT.alloy()), 0, R*0.65, -R*1.00));
  for (let i = 0; i < n; i++)
    intakeG.add(pipe([[xOf(i), R*0.6, -R*0.95],[xOf(i), R*0.3, -R*0.6],[xOf(i)-pitch*0.4, 0, -R*0.35]], M(19), MAT.alloy(), 8));
  add('intake', intakeG);
  /* ahead of the front iron and the tension-bolt nuts (stack end + 21 mm) */
  add('throttle', at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 16), 0,0,Math.PI/2), -(pitch*n/2 + M(55)), R*0.65, -R*1.00));

  const injG = group('inj'), railG = group('rail');
  for (let i = 0; i < n*2; i++)
    rEach('injectors', i, at(cyl(M(8), M(8), M(52), MAT.plastic(), 10), xOf(Math.floor(i/2)) + (i%2?M(24):-M(24)), R*0.42, -R*0.62));   /* at the side-port runners, not on the e-shaft */
  rFlush('injectors');
  railG.add(at(rot(cyl(M(13), M(13), pitch*n, MAT.steel(), 12), 0,0,Math.PI/2), 0, R*0.42, -R*0.62));
  add('fuelrail', railG);

  const plugG = group('plugs'), coilG = group('coils');
  for (let i = 0; i < n; i++) for (const [k, s] of [-1, 1].entries()){
    /* leading plug low, trailing plug high on each rotor housing */
    rEach('plugs', i * 2 + k, at(rot(cyl(M(7), M(7), M(40), MAT.steel(), 10), 0, 0, Math.PI/2 - s*0.3), xOf(i) + s*M(22), M(10) + s * M(30), R*1.0));
    /* on the plug tops, outside the finned housing (the plugs reach R + 20 mm) */
    rEach('coils', i * 2 + k, at(roundBox(M(26), M(50), M(30), .006, MAT.plastic()), xOf(i) + s*M(26), R*0.55, R*1.0 + M(42)));
  }
  rFlush('plugs'); rFlush('coils');

  const exG = group('ex');
  for (let i = 0; i < n; i++)
    /* the exhaust port is below the plug pair on the housing's exhaust face */
    exG.add(pipe([[xOf(i), -R*0.45, R*0.90],[xOf(i), -R*0.45, R*1.35],[xOf(n-1)+pitch*0.4, -R*0.35, R*1.50]], M(20), MAT.hot(), 8));
  add('exmanifold', exG);
  add('exhaust', pipe([[xOf(n-1)+pitch*0.4, -R*0.35, R*1.50],[xOf(n-1)+pitch*1.6, -R*0.5, R*1.45]], M(30), MAT.iron(), 10));
  addPuffs(root, anim, new THREE.Vector3(xOf(n-1)+pitch*1.65, -R*0.5, R*1.45), R*0.6);

  add('waterpump', at(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 16), 0,0,Math.PI/2), -(pitch*n/2 + M(48)), R*0.05, -R*0.72));   /* ahead of the bolt nuts, under the alternator */
  const rad = group('rad');
  const rcore = coreMesh(pitch*(n+1.6), R*1.3, M(46), {}, 30);
  rad.add(rcore);
  const fan = group('fan');
  for (let i = 0; i < 7; i++){ const b = box(M(16), R*0.5, M(6), MAT.black()); b.rotation.z = (i/7)*TAU; fan.add(b); }
  fan.rotation.y = Math.PI / 2; fan.position.x = M(40); rad.add(fan); anim.fans.push(fan);
  add('radiator', at(rad, xOf(0) - pitch * (has('turbo') ? 2.5 : 1.9), R*0.1, 0));   /* an NA rotary has no intercooler ahead of it: the core sits closer */

  const pul = group('pul');
  pul.add(rot(tubeMesh(M(70), M(26), M(34), MAT.iron(), 22), 0,0,Math.PI/2));
  at(pul, xOf(0) - pitch*1.1, 0, 0); anim.pulleys.push({ node:pul, ratio:1 });
  add('crankpulley', pul);
  add('alternator', at(alternatorMesh(R*0.55), -(pitch*n/2 + M(21) + R*0.55*0.36), R*0.95, -R*0.40));
  add('starter', at(starterMesh(R*0.62), xOf(n-1)+pitch*0.3, -R*0.45, -R*1.25));
  const fw = group('fw'); fw.add(rot(tubeMesh(R*0.95, M(30), M(30), MAT.iron(), 30), 0,0,Math.PI/2));
  at(fw, xOf(n-1) + pitch*0.75, 0, 0); anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  add('clutch', at(rot(tubeMesh(R*0.85, M(34), M(46), MAT.steel(), 26), 0,0,Math.PI/2), xOf(n-1)+pitch*1.05, 0, 0));

  for (const [id,x,y,z] of [['crksensor', xOf(0)-pitch*0.75, -R*0.5, R*0.4],
                            ['mapsensor', 0, R*0.75, -R*0.8],
                            ['knock', 0, -R*0.35, -R*1.14],      /* on the housing's outer wall, outside the rotor's sweep */
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
  /* bake the static meshes of every part into as few draw calls as possible */
  try { mergeStatic(nodes, anim); } catch (err){ console.warn('mergeStatic', err); }
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

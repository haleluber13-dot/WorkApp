/* MotorLab — procedural 3D engine builder.
 * Reads an engine spec and constructs the whole assembly in metres, tagging
 * every mesh with its part id so the viewport can pick, hide, ghost, explode
 * and animate it. Nothing here is a downloaded model — it is all derived from
 * bore, stroke, cylinder count and layout.
 */
import * as THREE from 'three';
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

const M = (mm) => mm / 1000;   // spec is in millimetres, scene is in metres

export function buildEngine(e, tree){
  return e.kind === 'rotary' ? buildRotary(e, tree) : buildPiston(e, tree);
}

/* ====================================================================== */
/* geometry layout helpers                                                 */
/* ====================================================================== */
function layout(e){
  const bore = M(e.bore), stroke = M(e.stroke);
  const pitch = bore * 1.32;                                  // bore spacing
  const banks = (e.layout === 'V' || e.layout === 'F') ? 2 : (e.layout === 'W' ? 4 : 1);
  const perBank = Math.ceil(e.cyl / banks);
  const half = deg(e.bankAngle) / 2;
  const bankAngles = e.layout === 'I' ? [0]
    : e.layout === 'F' ? [deg(90), deg(-90)]
    : e.layout === 'W' ? [half*0.35, -half*0.35, half*1.5, -half*1.5].slice(0,4)
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
  if (e.layout === 'W') return { bank: i % 4, idx: Math.floor(i / 4) };
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
function buildPiston(e, tree){
  const L = layout(e);
  const root = group('engine');
  const nodes = new Map();
  const add = (id, obj) => {
    if (!obj) return;
    tag(obj, id);
    root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []);
    nodes.get(id).push(obj);
  };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const has = (id) => !!tree.byId[id];
  const airCooled = (e.coolant || '').startsWith('air');
  const ohv = e.cam === 'OHV';
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
  const prof = [];
  if (L.banks >= 2){
    const half = L.bore * 0.775;
    const deck = (a) => {
      const c = [Math.sin(a) * L.deckH, Math.cos(a) * L.deckH];      // [z, y]
      const t = [Math.cos(a) * half, -Math.sin(a) * half];
      return { outer:[c[0] + t[0], c[1] + t[1]], inner:[c[0] - t[0], c[1] - t[1]] };
    };
    const dR = deck(Math.abs(L.bankAngles[0] || Math.PI / 4));
    const yValley = L.deckH * 0.52;
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
              [-half, L.deckH], [half, L.deckH],
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
  blockG.add(new THREE.Mesh(bgeo, MAT.cast()));

  /* the cylinder walls, which show once the block is cut away */
  for (const bank of L.bankAngles.keys()){
    const a = L.bankAngles[bank];
    const bg = group('bank');
    for (let i = 0; i < e.cyl; i++){
      const s = cylSlot(e, i, L); if (s.bank !== bank) continue;
      const p = cylPosition(e, i, L);
      const liner = tubeMesh(L.bore/2 * 1.06, L.bore/2, L.stroke * 1.35, MAT.iron(), 20);
      liner.position.set(p.x, L.crankR * 0.95 + L.stroke * 0.9, 0);
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
  /* the sump rail and main-bearing bulkheads below the crank */
  const cc = roundBox(L.len, L.crankR * 0.5, wCase * 2.0, 0.02, MAT.cast());
  cc.position.y = yCase + L.crankR * 0.22;
  blockG.add(cc);
  add('block', blockG);

  /* ---- main bearings + caps ---- */
  const nMains = L.banks >= 2 ? e.cyl / 2 + 1 : e.cyl + 1;
  const mbG = group('mains'), mcG = group('maincaps');
  for (let i = 0; i < nMains; i++){
    const x = (i - (nMains - 1) / 2) * (L.len / Math.max(1, nMains - 1)) * 0.92;
    const sh = tubeMesh(L.crankR * 0.62, L.crankR * 0.52, M(16), MAT.bearing(), 18);
    at(rot(sh, 0, 0, Math.PI/2), x, 0, 0); mbG.add(sh);
    const cap = roundBox(M(38), L.crankR * 0.9, L.bore * 0.95, 0.01, MAT.alloyDark());
    at(cap, x, -L.crankR * 0.62, 0); mcG.add(cap);
    for (const sgn of [-1, 1]){
      const b = bolt(M(5), M(34), MAT.steel());
      at(b, x, -L.crankR * 1.05, sgn * L.bore * 0.36); mcG.add(b);
    }
  }
  add('mainbearings', mbG); add('maincaps', mcG);

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
      const web = box(M(15), L.crankR * 1.5, L.crankR * 1.15, MAT.steel());
      web.position.set(p.x + side * L.pitch * 0.28, L.crankR * 0.45, 0);
      throwG.add(web);
      const cw = counterweight(L.crankR * 1.62, M(17), MAT.steel());
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
    for (let r = 0; r < 3; r++){
      const ring = torus(L.bore/2 * 0.995, M(1.7), r === 2 ? MAT.iron() : MAT.steel(), 26);
      rot(ring, Math.PI/2, 0, 0);
      ring.position.y = L.bore * (0.146 - r * 0.062);
      pg.add(ring);
    }
    const wrist = cyl(pinBoreR, pinBoreR, L.bore * 0.66, MAT.steel(), 14);
    rot(wrist, 0, 0, Math.PI/2); wrist.position.y = -L.bore * 0.045; pg.add(wrist);
    pg.userData.cylIndex = i;
    pistG.add(pg);

    const rg = group('r' + i);
    rg.add(rodMesh(L.rodLen, L.crankR * 0.66, pinBoreR, MAT.steel()));
    rodG.add(rg);

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
  add('pistons', pistG); add('rods', rodG);

  /* ---- head gasket + heads ---- */
  const hgG = group('hg'), headG = group('heads'), vcG = group('vc');
  const camG = group('cams'), capG = group('camcaps'), valG = group('valves');
  const plugG = group('plugs'), coilG = group('coils'), injG = group('inj'), railG = group('rail');
  const nBanksHead = L.banks === 4 ? 2 : L.banks;
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

    hgG.add(mk(box(L.len, M(2.2), L.bore*1.5, MAT.gasket()), L.deckH));
    const headBody = roundBox(L.len, L.bore * 1.32, L.bore * 1.5, 0.03, MAT.alloy());
    headG.add(mk(headBody, L.deckH + L.bore * 0.66));
    /* port bosses on each face — the lumps you actually see on a head */
    for (let i = 0; i < L.perBank; i++){
      const px = (i - (L.perBank - 1)/2) * L.pitch;
      for (const [zf, mat] of [[-0.80, MAT.alloy()], [0.80, MAT.hot()]]){
        const port = cyl(L.bore * 0.19, L.bore * 0.22, L.bore * 0.22, mat, 16);
        rot(port, Math.PI/2, 0, 0);
        headG.add(mk(at(port, px, 0, zf * L.bore), L.deckH + L.bore * 0.46, zf * L.bore));
      }
      /* spark plug well sunk into the casting */
      headG.add(mk(at(cyl(L.bore*0.13, L.bore*0.13, L.bore*0.34, MAT.black(), 14), px, 0, 0),
                   L.deckH + L.bore * 1.02));
    }
    /* head bolts */
    for (let i = 0; i < e.cyl / (L.banks >= 2 ? 2 : 1) + 1; i++){
      for (const sgn of [-1, 1]){
        const bl = bolt(M(6), M(30), MAT.steel());
        const x = (i - (L.perBank) / 2) * L.pitch + L.pitch/2;
        headG.add(mk(at(bl, x, 0, sgn * L.bore * 0.62), L.deckH + L.bore * 1.22));
      }
    }
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
          capG.add(mk(at(cap, (i - L.perBank/2) * L.pitch, 0, zc), L.deckH + L.bore*1.12, zc));
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
        vg.add(valveMesh(headR, L.bore * 0.038, L.bore * 0.86, intake ? MAT.steel() : MAT.hot()));
        valG.add(mk(at(vg, p.x, 0, zoff), L.deckH + L.bore * 0.32, zoff));
        /* the spring seats on the head and is compressed by the retainer */
        const sp = springMesh(L.bore * 0.115, L.bore * 0.30, 6, L.bore * 0.020, MAT.steel());
        const spHolder = mk(at(sp, p.x, 0, zoff), L.deckH + L.bore * 0.52, zoff);
        valG.add(spHolder);
        const centre = intake ? CAM.intake : CAM.exhaust;
        anim.valves.push({ node:vg, cyl:i, intake, bank:b, lift:maxLift,
                           phase:-(fires[i] + centre) / 2, duration:CAM.duration,
                           spring:sp, springHome:sp.position.y });
      }
      /* spark plug / injector / coil */
      if (e.fuel !== 'diesel'){
        /* a real plug: terminal, ribbed insulator, hex, thread, ground strap */
        /* the plug is screwed into the chamber, so it sits low enough that
           only its terminal reaches up the well */
        const pl = sparkPlug(L.bore * 0.98);
        plugG.add(mk(at(pl, p.x, 0, 0), L.deckH + L.bore * 0.56));
        /* and the coil drops down the well onto that terminal, standing about
           a finger's width proud of the cam cover — not half a head above it */
        const co = coilPack(L.bore * 0.88);
        coilG.add(mk(at(co, p.x, 0, 0), L.deckH + L.bore * 1.04));
      } else {
        const inj = cyl(M(9), M(9), L.bore*0.4, MAT.steel(), 10);
        injG.add(mk(at(inj, p.x, 0, 0), L.deckH + L.bore*0.90));
      }
    }
    /* valve cover: a real casting with its bolt rail, ribs and filler cap */
    const vc = camCoverMesh(L.len * 0.98, L.bore * 1.36, L.bore * 0.34, MAT.alloyDark(),
                            Math.max(4, e.cyl + 2));
    vcG.add(mk(vc, L.deckH + L.bore * 1.34));
  }
  add('headgasket', hgG); add('head', headG);
  if (has('camcaps')) add('camcaps', capG);
  add('cam', camG); add('valves', valG); add('valvecover', vcG);
  if (has('plugs')) add('plugs', plugG);
  if (has('glow'))  add('glow', plugG);
  if (has('coils')) add('coils', coilG);

  /* ---- OHV valvetrain ---- */
  if (ohv){
    const camIn = group('camin');
    const baseR = L.bore * 0.15, liftR = L.bore * 0.055, lobeW = L.bore * 0.12;
    camIn.add(rot(cyl(baseR * 0.55, baseR * 0.55, L.len * 0.96, MAT.steel(), 16), 0, 0, Math.PI/2));
    const camY = L.crankR * 1.55;
    const liftG = group('lifters'), prG = group('pushrods'), rkG = group('rockers');
    for (let i = 0; i < e.cyl; i++){
      const p = cylPosition(e, i, L);
      const side = L.banks >= 2 ? (cylSlot(e, i, L).bank ? 1 : -1) : 1;
      for (const which of ['intake', 'exhaust']){
        const centre = which === 'intake' ? CAM.intake : CAM.exhaust;
        const phase = -(fires[i] + centre) / 2;
        const sgn = which === 'intake' ? -1 : 1;
        const lobe = camLobe(baseR, liftR, CAM.duration, lobeW, MAT.steel());
        const holder = group('lobe'); holder.add(lobe);
        holder.position.set(p.x + sgn * lobeW * 0.9, 0, 0);
        camIn.add(holder);
        anim.lobes.push({ node:holder, phase, up:true });

        const lz = sgn * L.bore * 0.18 * (L.banks >= 2 ? side : 1);
        const lf = cyl(L.bore * 0.062, L.bore * 0.062, L.bore * 0.24, MAT.steel(), 12);
        at(lf, p.x + sgn * lobeW * 0.9, camY + baseR + L.bore * 0.14, lz);
        liftG.add(lf);
        const prLen = L.deckH * 0.66;
        const pr = cyl(L.bore * 0.024, L.bore * 0.024, prLen, MAT.steel(), 8);
        at(pr, p.x + sgn * lobeW * 0.9, camY + baseR + L.bore * 0.26 + prLen/2, lz);
        prG.add(pr);
        const rk = box(L.bore * 0.30, L.bore * 0.075, L.bore * 0.09, MAT.steel());
        const rkH = group('rk'); rkH.add(rk);
        rk.position.x = -sgn * L.bore * 0.12;
        rkH.position.set(p.x + sgn * lobeW * 0.9, L.deckH + L.bore * 0.95, lz * 1.4);
        rkG.add(rkH);
        anim.followers.push({ lifter:lf, pushrod:pr, rocker:rkH, phase, duration:CAM.duration,
                              travel:L.bore * 0.055, rockSign:sgn,
                              lifterHome:lf.position.y, pushrodHome:pr.position.y });
      }
    }
    camIn.position.y = camY;
    anim.cams.push({ node:camIn, bank:0, index:0 });
    add('cam', camIn);
    add('lifters', liftG); add('pushrods', prG); add('rockers', rkG);
  }

  /* ---- timing drive ---- */
  const tG = group('timing');
  const frontX = -L.len/2 - M(18);
  const crankSpr = tubeMesh(L.crankR * 0.7, L.crankR * 0.4, M(12), MAT.steel(), 20);
  rot(crankSpr, 0, 0, Math.PI/2); crankSpr.position.x = frontX; tG.add(crankSpr);
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
        g.add(spr); g.rotation.x = a; tG.add(g);
        const chain = pipe([[frontX, L.crankR*0.7, 0],
                            [frontX, L.deckH*0.6, L.bore*0.5*Math.sign(zc||1)],
                            [frontX, L.deckH + L.bore*1.00, zc]], M(4), MAT.steel(), 6);
        const cg = group('ch'); cg.add(chain); cg.rotation.x = a * 0.5; tG.add(cg);
      }
    }
  } else {
    /* the cam sprocket is a scan of a real timing gear where one is available */
    const camSpr = partMesh('camGear', { dia: L.crankR * 2.0, depth: M(14), axis:'x', mat: MAT.steel() })
                 || rot(tubeMesh(L.crankR * 1.0, L.crankR*0.4, M(11), MAT.steel(), 22), 0, 0, Math.PI/2);
    camSpr.position.set(frontX, L.crankR*1.55, 0); tG.add(camSpr);
  }
  add('timing', tG);
  add('tensioner', at(box(M(20), M(70), M(16), MAT.plastic()), frontX, L.deckH * 0.55, L.bore * 0.5));
  const fc = roundBox(M(24), L.deckH * 1.5, L.bore * 1.5, 0.02, MAT.alloyDark());
  add('frontcover', at(rot(fc, 0, Math.PI/2, 0), frontX - M(14), L.deckH * 0.5, 0));

  /* ---- lubrication ---- */
  add('oilpump', at(roundBox(M(70), M(70), M(50), .01, MAT.alloyDark()), frontX + M(40), -L.crankR * 0.6, L.bore * 0.5));
  add('pickup', pipe([[0,-L.crankR*0.9,0],[0,-L.crankR*1.6,L.bore*0.25],[L.len*0.15,-L.crankR*1.9,L.bore*0.3]], M(9), MAT.steel()));
  const pan = oilPanMesh(L.len * 0.94, L.bore * 1.35, L.crankR * 1.5, MAT.alloyDark());
  add('oilpan', at(pan, 0, -L.crankR * 1.9, 0));
  /* the filter screws into a boss on the block's flank, so it stands clear of
     it — you have to get a strap wrench round one */
  add('oilfilter', at(oilFilterMesh(M(92), M(115), MAT.blue()),
                      L.len * 0.20, -L.crankR * 0.90, L.bore * 0.92 + M(64)));

  /* Where each bank's primaries collect. On a turbocharged engine the turbine
     housing bolts straight onto this, so the turbo is positioned from it too —
     which is the whole point of naming it once instead of twice. */
  const colX = L.banks >= 2 ? L.len * 0.30 : L.len * 0.35;
  const colY = L.crankR * 0.5;
  /* on a vee the exhaust ports are a long way outboard, because the head is
     tilted away from the crank — so the collector has to be out there too */
  const colZ = L.bore * (L.banks >= 2 ? 1.62 : 1.20);

  /* ---- induction ---- */
  /* On a vee the manifold sits down in the valley between the heads. The deck
     is measured along the bank axis, so its actual height above the crank is
     deckH·cos(bank angle) — using deckH directly floated the plenum well clear
     of the engine. */
  const vAngle = Math.abs(L.bankAngles[0] || 0);
  /* the valley floor is the inner edge of the two decks; a plenum that sits
     below that line is buried in the vee instead of filling it */
  const inducY = L.banks >= 2 ? L.deckH * Math.cos(vAngle) * 1.04 + L.bore * 0.70
                              : L.deckH + L.bore * 1.95;
  /* where the fuel rail runs on each bank, in the engine's own frame */
  const railAt = (b) => L.banks >= 2
    ? [inducY - L.bore * 0.34, (b ? 1 : -1) * L.bore * 0.96]
    : [L.deckH + L.bore * 0.92, -L.bore * 1.02];
  const intakeG = group('intake');
  /* a high-revving atmospheric engine runs individual throttles with a trumpet
     on each one; everything else runs a plenum and a single throttle body */
  const itb = e.aspiration === 'na' && e.redline >= 7600;
  /* a plenum and its runners are moulded nylon on anything modern; individual
     throttles and their trumpets are machined alloy, and look it */
  const inletMat = itb ? MAT.alloy() : MAT.composite();
  /* where a runner has to reach the plenum from */
  const plenumMouth = () => [inducY, L.banks >= 2 ? 0 : -L.bore * 0.95];
  if (!itb){
    const plenum = roundBox(L.len * 0.80, L.bore * (L.banks >= 2 ? 0.72 : 0.46),
                           L.banks >= 2 ? L.bore * 1.45 : L.bore * 0.70, 0.03, inletMat);
    at(plenum, 0, inducY, L.banks >= 2 ? 0 : -L.bore * 0.95);
    intakeG.add(plenum);
  }
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.34, inSide(b) * L.bore * 0.70);
    const [my, mz] = plenumMouth();
    const topY = itb ? L.deckH + L.bore * 1.62 : my;
    const zEnd = itb ? pz * 0.55 : mz;
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
  const thrAt = V3(-L.len * 0.48, inducY, L.banks >= 2 ? 0 : -L.bore * 0.95);
  /* the blow-off valve sits on the cold side just before the throttle, which
     is the only place the trapped charge has anywhere to go */
  const bovAt = V3(-L.len * 0.34, inducY - L.bore * 0.10, thrAt.z - L.bore * 1.30);
  const boosted = e.aspiration !== 'na';
  if (has('throttle')){
    const tG = group('throttle');
    tG.add(at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 18), 0, 0, Math.PI/2),
              thrAt.x, thrAt.y, thrAt.z));
    /* On a boosted engine the throttle is fed by the charge pipe coming back
       from the intercooler; the filter is out at the front of the car on the
       compressor's inlet, not bolted to the throttle body. An atmospheric
       engine draws straight through the filter here, so that is where it goes. */
    if (!boosted)
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
      injG.add(pipe([[p.x, ry, rz], [p.x, (ry + py) / 2, (rz + pz) / 2], [p.x, py, pz]],
                    M(9), MAT.plastic(), 8));
    }
    add('injectors', injG);
    add('fuelrail', railG);
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
    const size = L.bore * (n === 1 ? 1.05 : n === 2 ? 0.82 : 0.62)
               * (1 + (e.boostTarget || 0) * 0.18);
    /* A turbine housing bolts to the end of an exhaust manifold. On a hot-V
       that manifold is inside the vee, so the turbo is too: one per bank, shaft
       along the crank with the compressor facing forward into the airstream and
       the turbine at the back, rolled so its inlet looks out at the bank it is
       fed by. On everything else the manifold runs down the outside, and the
       turbo sits just outboard of the collector, low beside the sump. */
    const perBank = L.banks >= 2 && n >= 2;
    for (let i = 0; i < n; i++){
      const side = perBank ? (i % 2 ? 1 : -1) : 1;
      const rank = perBank ? Math.floor(i / 2) - (n / 2 - 1) / 2 : i - (n - 1) / 2;
      const t = turboUnit(size);
      /* level with the block and out on its flank, where a turbo is bolted and
         where you can get a spanner to it — not tucked under the sump */
      const pos = new THREE.Vector3(colX + L.len * 0.10 + rank * size * 1.55,
                                    colY + size * 0.52,
                                    side * (colZ + size * 0.82));
      at(t, pos.x, pos.y, pos.z);
      /* the compressor faces out to the air, the turbine in at the collector,
         and the housings are rolled so the turbine's throat looks down the
         manifold rather than at the sky. The roll is worked out from where the
         scroll actually put its throat, not guessed. */
      const P0 = t.userData.ports;
      const yaw = side < 0 ? Math.PI : 0;
      const roll = deg(-120) - Math.atan2(P0.turbineIn.y, P0.turbineIn.x);
      t.rotation.set(0, yaw, roll);
      anim.turbos.push(t.userData.shaft);
      tg.add(t);
      /* the housings are placed in the turbo's own frame, so put its four
         connections back into the engine's before anything joins onto them */
      const turn = new THREE.Euler(0, yaw, roll);
      const world = (v) => v.clone().applyEuler(turn).add(pos);
      const P = t.userData.ports;
      turbos.push({ pos, side, size,
                    hotIn: world(P.turbineIn), hotOut: world(P.turbineOut),
                    coldOut: world(P.compressorOut), coldIn: world(P.compressorIn),
                    oilIn: world(P.oilIn), oilOut: world(P.oilOut), wgSignal: world(P.wgSignal),
                    hotTube:P.hotTube, coldTube:P.coldTube, axialTube:P.axialTube });
    }
    add('turbo', tg);

    /* the external wastegate: a valve body teed off the manifold ahead of the
       turbine, its actuator canister above it, and the dump pipe back in past
       the turbine wheel */
    const wgG = group('wg');
    const wt = turbos[0];
    const gate = wt.hotIn.clone().lerp(wt.pos, -0.55);
    wgG.add(pipe([wt.hotIn, gate], M(15), MAT.hot(), 8));
    wgG.add(at(lathe([[0, -M(26)], [M(34), -M(26)], [M(38), -M(14)], [M(38), M(14)],
                      [M(34), M(26)], [0, M(26)]], MAT.steel(), 24),
               gate.x, gate.y + L.bore * 0.30, gate.z));
    wgG.add(at(cyl(M(7), M(7), M(46), MAT.plated(), 10), gate.x, gate.y + L.bore * 0.20, gate.z));
    wgG.add(pipe([gate, gate.clone().lerp(wt.hotOut, 0.55).add(V3(0, -L.bore * 0.20, 0)),
                  wt.hotOut], M(12), MAT.hot(), 8));
    add('wastegate', wgG);

    /* The charge-air path, end to end. Air is drawn in through the filter at
       the front of the car, down the inlet pipe to the compressor; out of the
       compressor it is hot, so it goes forward again through the intercooler
       sitting in front of the radiator, and only then does it come back to the
       throttle body and the plenum. Those four runs are most of what you see
       when you open the bonnet on a turbo car, and the engine looked wrong
       without them. */
    const icX = frontX - L.bore * 1.55;
    const icZ = L.bore * 1.70;
    const icY = L.deckH * 0.56;
    const icG = group('ic');
    icG.add(at(coreMesh(L.bore * 4.0, L.bore * 1.20, M(76)), icX, icY, 0));
    const tank = (z) => V3(icX + M(34), icY, z);
    for (const tb of turbos){
      const sgn = tb.side;
      /* the induction pipe: filter, then back to the compressor's mouth */
      const filterAt = V3(icX - L.bore * 0.30, icY + L.bore * 1.05, sgn * icZ * 0.80);
      icG.add(at(rot(filterElement(M(76), M(160), MAT.alloyDark()), 0, 0, Math.PI / 2),
                 filterAt.x, filterAt.y, filterAt.z));
      icG.add(pipe([[filterAt.x + M(90), filterAt.y, filterAt.z],
                    [frontX * 0.55, icY + L.bore * 1.15, sgn * icZ * 0.95],
                    [tb.coldIn.x - L.len * 0.10, tb.coldIn.y + L.bore * 0.55, sgn * icZ * 1.02],
                    [tb.coldIn.x, tb.coldIn.y, tb.coldIn.z]],
                   tb.axialTube * 0.95, MAT.rubber(), 10));
      /* the hot side: compressor outlet forward to the core's end tank */
      icG.add(pipe([[tb.coldOut.x, tb.coldOut.y, tb.coldOut.z],
                    [tb.coldOut.x + L.len * 0.06, tb.coldOut.y - L.bore * 0.30, sgn * icZ],
                    [frontX * 0.60, icY - L.bore * 0.25, sgn * icZ],
                    [tank(sgn * L.bore * 1.65).x, icY, sgn * L.bore * 1.65]],
                   tb.coldTube * 0.90, MAT.alloy(), 10));
    }
    /* the cold side: out of the other end tank, up and back to the throttle */
    const back = turbos.length > 1 ? -1 : -1;
    icG.add(pipe([[tank(back * L.bore * 1.10).x, icY, back * L.bore * 1.10],
                  [frontX * 0.70, icY + L.bore * 0.55, back * L.bore * 1.75],
                  [thrAt.x - L.bore * 1.30, (thrAt.y + icY) / 2 + L.bore * 0.30,
                   thrAt.z + back * L.bore * 1.20],
                  [thrAt.x - M(150), thrAt.y, thrAt.z]],
                 L.bore * 0.135, MAT.alloy(), 10));
    add('intercooler', icG);

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

  /* ---- exhaust ---- */
  const exG = group('ex');
  for (let i = 0; i < e.cyl; i++){
    const p = cylPosition(e, i, L);
    const b = L.banks >= 2 ? cylSlot(e, i, L).bank : 0;
    const side = L.banks >= 2 ? exSide(b) : 1;
    const [py, pz] = portAt(b, L.deckH + L.bore * 0.34, side * L.bore * 0.70);
    /* out of the port, down the outside of the engine, then in to the
       collector. Every waypoint is taken off the port's own position — a
       primary that heads for a fixed z runs back through the block. */
    const outZ = pz + side * L.bore * 0.34;
    const runZ = side * Math.max(Math.abs(outZ), colZ * 1.18);
    exG.add(pipe([
      [p.x, py, pz],
      [p.x, py - L.bore * 0.38, outZ],
      [p.x, L.crankR * 1.45, runZ],
      [(p.x + colX) / 2, L.crankR * 0.95, side * colZ * 1.08],
      [colX, colY, side * colZ],
    ], M(16), MAT.hot(), 8));
  }
  /* the collector itself: a cone that gathers the primaries and hands them on */
  for (const side of (L.banks >= 2 ? [-1, 1] : [1]))
    exG.add(at(lathe([[M(26), -M(34)], [M(30), -M(10)], [M(24), M(22)], [M(24), M(34)]],
                     MAT.hot(), 22).rotateZ(Math.PI / 2),
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
                    [tb.hotIn.x, tb.hotIn.y, tb.hotIn.z]], tb.hotTube * 0.92, MAT.hot(), 10));
  add('exmanifold', exG);

  /* The downpipe starts where the gas actually leaves: the turbine's axial
     mouth on a turbo engine, the collector on everything else. A vee collects
     twice, so the second side crosses under the sump and joins the first. */
  const dpG = group('dp');
  const tail = new THREE.Vector3(colX + L.len * 0.46, L.crankR * 0.05, colZ * 1.05);
  const starts = turbos.length
    ? turbos.map(tb => ({ p:tb.hotOut, r:tb.axialTube * 0.86 }))
    : (L.banks >= 2 ? [-1, 1] : [1]).map(side =>
        ({ p:new THREE.Vector3(colX + M(30), colY, side * colZ), r:M(24) }));
  const join = new THREE.Vector3(colX + L.len * 0.30, L.crankR * 0.15, colZ * 1.02);
  for (const st of starts)
    dpG.add(pipe([[st.p.x, st.p.y, st.p.z],
                  [st.p.x + L.len * 0.10, st.p.y - L.bore * 0.28, st.p.z * 0.86],
                  [join.x, join.y, join.z]], st.r, MAT.iron(), 10));
  dpG.add(pipe([[join.x, join.y, join.z], [tail.x, tail.y, tail.z]], M(26), MAT.iron(), 10));
  add('exhaust', dpG);
  addPuffs(root, anim, tail, L.bore);

  /* ---- cooling / accessories ---- */
  /* the accessories all drive off one belt, so their pulleys have to land on
     one plane — that plane is the crank damper's */
  const beltX = frontX - M(46);
  const beltRun = [{ y:0, z:0, r:L.crankR * 1.15 }];
  if (has('waterpump')){
    const wpSize = L.bore * 1.15;
    const wp = waterPumpMesh(wpSize);
    anim.pulleys.push({ node:wp.userData.pulley, ratio:1.5 });
    add('waterpump', at(wp, beltX + wpSize * 0.34, L.deckH * 0.55, -L.bore * 0.4));
    beltRun.push({ y:L.deckH * 0.55, z:-L.bore * 0.4, r:wpSize * 0.42 });
  }
  if (has('radiator')){
    const rad = group('rad');
    rad.add(coreMesh(L.bore * 3.9, L.deckH * 1.15, M(44), {}, 30));
    const fan = bladedWheel(L.deckH * 0.52, 7, M(52), MAT.black(), 0.7);
    rot(fan, 0, Math.PI/2, 0);
    fan.position.x = M(56);
    rad.add(fan); anim.fans.push(fan);
    add('radiator', at(rad, frontX - L.bore * 1.15, L.deckH * 0.58, 0));
  }
  if (has('fins')) add('fins', at(box(L.len, M(20), L.bore*1.6, MAT.alloyDark()), 0, L.deckH*1.15, 0));

  /* a harmonic damper, not a disc: V-ribs, bonded rubber ring, bolt circle */
  const pulley = crankDamper(L.crankR * 1.15, M(46), MAT.iron());
  at(pulley, frontX - M(46), 0, 0);
  anim.pulleys.push({ node:pulley, ratio:1 });
  add('crankpulley', pulley);

  const altSize = L.bore * 1.35;
  const alt = alternatorMesh(altSize);
  anim.pulleys.push({ node:alt.userData.pulley, ratio:2.6 });
  add('alternator', at(alt, beltX + altSize * 0.56, L.deckH * 0.78, -L.bore * 0.92));
  beltRun.push({ y:L.deckH * 0.78, z:-L.bore * 0.92, r:altSize * 0.34 });

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
    add('crankpulley', grp);
    beltRun.push({ y, z, r });
  }

  /* and the belt itself, run round the outside of the whole set */
  const belt = serpentineBelt(beltRun, beltX, M(26), MAT.rubber());
  if (belt) add('crankpulley', belt);

  add('starter', at(starterMesh(L.bore * 1.6), L.len * 0.42, -L.crankR * 0.1, L.bore * 0.85));

  /* the flywheel carries a real starter ring gear — that is what the starter
     pinion engages, and its tooth count sets the cranking ratio */
  const fw = flywheelMesh(L.bore * 1.05, M(34), MAT.iron(), Math.round(L.bore * 1.05 * 720));
  at(fw, L.len/2 + M(28), 0, 0);
  anim.pulleys.push({ node:fw, ratio:1 });
  add('flywheel', fw);
  const cl = clutchMesh(L.bore * 0.95, M(52), MAT.steel());
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
    add('waterpump', st);
    const pumpIn = V3(beltX + L.bore * 0.30, L.deckH * 0.36, -L.bore * 0.82);
    if (has('radiator')){
      const radX = frontX - L.bore * 1.15;
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
      add('waterpump', hoseRun([V3(L.len * 0.40, hy - i * M(46), hz + dz),
                                V3(L.len * 0.24, L.deckH * 0.72, hz * 0.6 + dz * 2),
                                V3(beltX + L.bore * 0.42, L.deckH * 0.50 - i * M(30), -L.bore * 0.62)],
                               L.bore * 0.055));
  }

  /* oil: the turbo has to be fed from the gallery and drained to the sump, and
     the engine has to be dipped and filled */
  for (const tb of turbos){
    if (has('turbo')){
      add('turbo', braidedLine([V3(L.len * 0.22, L.crankR * 0.30, tb.side * caseZ),
                                V3(L.len * 0.30, tb.oilIn.y + L.bore * 0.35, tb.side * (caseZ + L.bore * 0.30)),
                                tb.oilIn], M(5)));
      add('turbo', hoseRun([tb.oilOut,
                            V3(tb.oilOut.x - L.len * 0.10, -L.crankR * 1.20, tb.oilOut.z * 0.72),
                            V3(L.len * 0.10, -L.crankR * 1.55, tb.side * L.bore * 0.70)],
                           L.bore * 0.075));
    }
    if (has('wastegate'))
      add('wastegate', hoseRun([tb.wgSignal,
                                V3(tb.wgSignal.x - L.len * 0.10, tb.wgSignal.y + L.bore * 0.40, tb.wgSignal.z),
                                V3(tb.coldOut.x, tb.coldOut.y + L.bore * 0.10, tb.coldOut.z)],
                               M(4)));
  }
  if (has('oilpan'))
    add('oilpan', dipstickMesh([V3(-L.len * 0.30, L.deckH * 0.62, -caseZ - M(26)),
                                V3(-L.len * 0.26, L.crankR * 0.40, -caseZ - M(16)),
                                V3(-L.len * 0.20, -L.crankR * 1.55, -L.bore * 0.55)], M(7)));
  if (has('oilfilter')){
    /* the oil cooler: a stacked-plate core on the filter housing, fed and
       returned by two hoses off the block's gallery — the part the tree has
       been calling "filter & cooler" without ever drawing the cooler */
    const cool = coreMesh(L.bore * 1.30, L.bore * 0.72, M(52), { body:MAT.alloyDark() }, 14);
    add('oilfilter', at(cool, L.len * 0.06, -L.crankR * 0.75, L.bore * 0.92 + M(78)));
    const coolZ = L.bore * 0.92 + M(78);
    add('oilfilter', hoseRun([V3(L.len * 0.20, -L.crankR * 0.90, L.bore * 0.92 + M(30)),
                              V3(L.len * 0.16, -L.crankR * 0.72, coolZ),
                              V3(L.len * 0.06 + L.bore * 0.55, -L.crankR * 0.62, coolZ)],
                             L.bore * 0.055));
    add('oilfilter', hoseRun([V3(L.len * 0.06 - L.bore * 0.55, -L.crankR * 0.62, coolZ),
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
    add('valvecover', at(standOn(pcvValve(L.bore * 0.20), bankUp(0)), pcvAt.x, pcvAt.y, pcvAt.z));
    if (has('intake')){
      /* the breather hose goes back into the inlet tract, which on a hot-V is
         the plenum on that same bank rather than something in the middle */
      const [my, mz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.70 : 0.34)];
      add('valvecover', hoseRun([pcvAt.clone().add(bankUp(0).multiplyScalar(L.bore * 0.24)),
                                 V3(L.len * 0.14, (pcvAt.y + my) / 2 + L.bore * 0.20, (pcvAt.z + mz) / 2),
                                 V3(-L.len * 0.02, my, mz)], L.bore * 0.055));
    }
  }
  if (has('intake')){
    /* the brake servo take-off: the biggest vacuum line on the engine */
    const [sy, sz] = [inducY, thrZone + L.bore * (L.banks >= 2 ? 0.72 : 0.36)];
    add('intake', hoseRun([V3(L.len * 0.24, sy, sz),
                           V3(L.len * 0.36, sy + L.bore * 0.40, sz * 1.25 + L.bore * 0.30),
                           V3(L.len * 0.44, sy + L.bore * 0.28, sz * 1.45 + L.bore * 0.50)],
                          L.bore * 0.075));
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

  return finalize(e, root, nodes, anim, L);
}

/* ====================================================================== */
/* rotary                                                                  */
/* ====================================================================== */
function buildRotary(e, tree){
  const R = M(105), ecc = M(15), width = M(80), pitch = width * 1.55;
  const root = group('engine'); const nodes = new Map();
  const add = (id, obj) => { if (!obj) return; tag(obj, id); root.add(obj);
    if (!nodes.has(id)) nodes.set(id, []); nodes.get(id).push(obj); };
  const anim = { pistons:[], rods:[], crank:null, cams:[], lobes:[], valves:[], springs:[],
                 followers:[], pulleys:[], fans:[], flames:[], puffs:[], turbos:[], rotors:[],
                 shake: imbalance(e) };
  const n = e.cyl;
  const has = (id) => !!tree.byId[id];
  const xOf = (i) => (i - (n-1)/2) * pitch;

  /* side + rotor housings */
  const sideG = group('side'), rhG = group('rh');
  for (let i = 0; i <= n; i++){
    const plate = roundBox(M(14), R*2.3, R*2.0, .02, MAT.alloy());
    at(rot(plate, 0, Math.PI/2, 0), xOf(i) - pitch/2, 0, 0);
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
    rhG.add(new THREE.Mesh(g, MAT.iron()));
  }
  add('block', sideG); add('stationary', at(rot(tubeMesh(M(40), M(26), M(20), MAT.steel(), 20), 0,0,Math.PI/2), xOf(0)-pitch/2, 0, 0));
  add('rotorhousing', rhG);

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
    const g = new THREE.ExtrudeGeometry(shape, { depth: width * 0.94, bevelEnabled:false, curveSegments:6 });
    g.rotateY(Math.PI/2); g.translate(-width*0.47, 0, 0);
    const body = new THREE.Mesh(g, MAT.alloyDark());
    rg.add(body);
    for (let a = 0; a < 3; a++){
      const seal = box(width * 0.94, M(9), M(4), MAT.steel());
      const t = (a/3) * TAU;
      const rad = rr * 1.16;
      at(rot(seal, t, 0, 0), 0, rad * Math.sin(t), rad * Math.cos(t));
      seal.rotation.x = -t;
      apexG.add(seal);
      rg.userData.seals = rg.userData.seals || [];
    }
    rg.userData.phase = (i / n) * TAU;
    rg.userData.baseX = xOf(i);
    rotG.add(rg);
    anim.rotors.push(rg);
    /* each rotor face fires once per shaft revolution */
    const flame = flameMesh(R * 0.30);
    flame.material.depthTest = false;
    flame.position.set(xOf(i), 0, R * 0.55);
    root.add(flame);
    anim.flames.push({ node:flame, mat:flame.material, fire:(i / n) * TAU, cycle:TAU });
  }
  add('pistons', rotG); add('apex', apexG);

  /* tension bolts */
  const tb = group('tb');
  for (let k = 0; k < 12; k++){
    const t = (k/12) * TAU;
    const b = cyl(M(6), M(6), pitch * (n + 0.9), MAT.steel(), 8);
    rot(b, 0, 0, Math.PI/2);
    at(b, 0, Math.sin(t) * R * 1.05, Math.cos(t) * R * 1.05);
    tb.add(b);
  }
  add('maincaps', tb);

  add('oilpump', at(roundBox(M(80), M(80), M(60), .01, MAT.alloyDark()), xOf(0) - pitch*0.8, -R*0.6, R*0.5));
  add('oilpan', at(roundBox(pitch*(n+0.6), M(90), R*1.4, .02, MAT.alloyDark()), 0, -R*1.15, 0));

  if (has('turbo')){
    const tg = group('turbos');
    const cnt = e.aspiration === 'twinturbo' ? 2 : 1;
    for (let i = 0; i < cnt; i++){
      const t = turboUnit(R * (cnt > 1 ? 0.62 : 0.80));
      anim.turbos.push(t.userData.shaft);
      at(t, xOf(n-1) + pitch*(0.5 + i*0.55), -R*0.15 + i*R*0.55, R*1.05);
      tg.add(t);
    }
    add('turbo', tg);
    const ric = coreMesh(pitch*(n+1.4), R*0.8, M(76));
    rot(ric, 0, Math.PI/2, 0);
    add('intercooler', at(ric, 0, -R*0.1, -R*1.9));
  }

  const intakeG = group('intake');
  intakeG.add(at(roundBox(pitch*n*0.9, M(90), M(120), .02, MAT.alloy()), 0, R*0.55, -R*0.75));
  for (let i = 0; i < n; i++)
    intakeG.add(pipe([[xOf(i), R*0.5, -R*0.75],[xOf(i), R*0.2, -R*0.5],[xOf(i)-pitch*0.4, 0, -R*0.35]], M(19), MAT.alloy(), 8));
  add('intake', intakeG);
  add('throttle', at(rot(cyl(M(38), M(38), M(60), MAT.alloyDark(), 16), 0,0,Math.PI/2), -pitch*(n/2+0.4), R*0.55, -R*0.75));

  const injG = group('inj'), railG = group('rail');
  for (let i = 0; i < n*2; i++)
    injG.add(at(cyl(M(8), M(8), M(52), MAT.plastic(), 10), xOf(Math.floor(i/2)) + (i%2?M(24):-M(24)), R*0.25, -R*0.55));
  add('injectors', injG);
  railG.add(at(rot(cyl(M(13), M(13), pitch*n, MAT.steel(), 12), 0,0,Math.PI/2), 0, R*0.42, -R*0.62));
  add('fuelrail', railG);

  const plugG = group('plugs'), coilG = group('coils');
  for (let i = 0; i < n; i++) for (const s of [-1, 1]){
    plugG.add(at(rot(cyl(M(7), M(7), M(40), MAT.steel(), 10), 0, 0, Math.PI/2 + s*0.3), xOf(i) + s*M(22), M(10), -R*1.0));
    coilG.add(at(roundBox(M(26), M(50), M(30), .006, MAT.plastic()), xOf(i) + s*M(26), R*0.9, -R*0.3));
  }
  add('plugs', plugG); add('coils', coilG);

  const exG = group('ex');
  for (let i = 0; i < n; i++)
    exG.add(pipe([[xOf(i), 0, R*1.0],[xOf(i), -R*0.3, R*1.3],[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35]], M(20), MAT.hot(), 8));
  add('exmanifold', exG);
  add('exhaust', pipe([[xOf(n-1)+pitch*0.4, -R*0.35, R*1.35],[xOf(n-1)+pitch*1.6, -R*0.5, R*1.2]], M(30), MAT.iron(), 10));
  addPuffs(root, anim, new THREE.Vector3(xOf(n-1)+pitch*1.65, -R*0.5, R*1.2), R*0.6);

  add('waterpump', at(rot(cyl(M(50), M(50), M(46), MAT.alloyDark(), 16), 0,0,Math.PI/2), xOf(0)-pitch*0.9, R*0.3, -R*0.4));
  const rad = group('rad');
  const rcore = coreMesh(pitch*(n+1.6), R*1.3, M(46), {}, 30);
  rot(rcore, 0, Math.PI/2, 0); rad.add(rcore);
  const fan = group('fan');
  for (let i = 0; i < 7; i++){ const b = box(M(16), R*0.5, M(6), MAT.black()); b.rotation.z = (i/7)*TAU; fan.add(b); }
  fan.position.z = M(40); rad.add(fan); anim.fans.push(fan);
  add('radiator', at(rad, 0, R*0.1, -R*2.4));

  const pul = group('pul');
  pul.add(rot(tubeMesh(M(70), M(26), M(34), MAT.iron(), 22), 0,0,Math.PI/2));
  at(pul, xOf(0) - pitch*1.1, 0, 0); anim.pulleys.push({ node:pul, ratio:1 });
  add('crankpulley', pul);
  add('alternator', at(alternatorMesh(R*0.55), xOf(0)-pitch*0.9, R*0.75, -R*0.6));
  add('starter', at(starterMesh(R*0.62), xOf(n-1)+pitch*0.6, -R*0.35, -R*0.5));
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
    valvecover:up.clone().multiplyScalar(1.55), camcaps:up.clone().multiplyScalar(1.25),
    cam:up.clone().multiplyScalar(1.05), vvt:fwd.clone().multiplyScalar(1.3),
    rockers:up.clone().multiplyScalar(1.3), pushrods:up.clone().multiplyScalar(0.95),
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
  const v = (map[id] || new THREE.Vector3(0, 0.8, 0)).clone();
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
    const ph = th + r.userData.phase;
    r.position.set(r.userData.baseX, L.crankR * Math.sin(ph), L.crankR * Math.cos(ph));
    r.rotation.x = -ph / 3;
  }

  /* crank–slider: each cylinder is offset by where it sits in the firing order */
  for (const p of anim.pistons){
    const t = th - p.fire;
    const y = slider(L.crankR, L.rodLen, t);
    p.node.position.set(p.x, y * Math.cos(p.angle), -y * Math.sin(p.angle));
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
    r.node.position.set(r.x, y * Math.cos(r.angle), -y * Math.sin(r.angle));
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
    v.node.position.y = -lift;
    if (v.spring){
      const f = lift / v.lift;
      v.spring.scale.y = 1 - f * 0.30;
      v.spring.position.y = v.springHome - lift * 0.5;
    }
  }
  for (const f of anim.followers){
    const lift = lobeLift(camRot + f.phase, f.duration) * f.travel;
    f.lifter.position.y = f.lifterHome + lift;
    f.pushrod.position.y = f.pushrodHome + lift;
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

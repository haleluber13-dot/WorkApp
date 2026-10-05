/* MotorLab — cutting a one-piece car scan into its panels.
 *
 * Most of the bundled vehicle models are a handful of meshes — "Body",
 * "glass", "TireWheel" — and a body that is one mesh cannot come apart. So it
 * is cut, triangle by triangle: every triangle is classified by where it sits
 * on the car (how far along, how high, how far out) and which way it faces,
 * against the same panel lines the generated body is built from, and the
 * triangles of each panel are gathered into a mesh of their own that keeps
 * the scan's material. Materials and textures are shared, so the cost is a
 * few extra draw calls and nothing in GPU memory to speak of.
 *
 * The panel ids are the ones data/vehicleParts.js uses: 'bonnet', 'wingF.1',
 * 'doorF.2', 'roof', 'bootlid', 'bumperF', 'windscreen', 'headlamp.1',
 * 'wheels.3' … so a split scan is stripped exactly like a generated car. */
import * as THREE from 'three';
import { wheelRadius } from '../data/vehicles.js';

/* ------------------------------------------------------------------------ */
/** Which exterior panel a point on the body skin belongs to.
 *
 *  P describes the car at that station, in metres, in the vehicle frame
 *  (nose at +x, t = 0 at the nose and 1 at the tail, left side at −z):
 *    t, y, z           the point
 *    nx, ny, nz        its outward normal
 *    waist, sill       the shoulder line and the door bottom line here
 *    cabin             is there a greenhouse at this station
 *    cuts              { bonnet, doorF, doorR, boot, B, bumperF, bumperR } in t
 *    doors4, pickup    body style
 */
export function panelFor(P){
  const { t, y, z, nx, ny, nz, waist, sill, cabin, cuts, doors4, pickup } = P;
  const side = z < 0 ? 1 : 2;
  const up = ny > 0.55, down = ny < -0.45;
  const door = () => doors4 ? (t < cuts.B ? 'doorF.' + side : 'doorR.' + side) : 'doorF.' + side;
  if (down && y < sill + 0.03) return 'chassis';                 // the floor pan
  if (t < cuts.bumperF) return (up && nx < 0.6 && y > waist - 0.02) ? 'bonnet' : 'bumperF';
  if (t > cuts.bumperR){
    if (y >= waist - 0.03 && (up || nx < -0.35)) return pickup && up ? 'bed' : 'bootlid';
    return 'bumperR';
  }
  /* tops, and the sloping surfaces of the greenhouse that face mostly up */
  if (up || (cabin && y > waist + 0.01 && ny > 0.25 && Math.abs(nz) < 0.85)){
    if (t < cuts.bonnet) return 'bonnet';
    if (t >= cuts.boot) return pickup ? 'bed' : 'bootlid';
    return 'roof';
  }
  if (y > waist + 0.005){                                         // the greenhouse flanks
    if (t < cuts.doorF) return 'roof';                            // A-pillar and cowl
    if (t < cuts.doorR) return door();                            // door frames
    return 'quarters.' + side;                                    // C-pillar
  }
  if (y > sill || t < cuts.doorF || t > cuts.doorR){              // the flanks
    if (t < cuts.doorF) return 'wingF.' + side;
    if (t < cuts.doorR) return door();
    return 'quarters.' + side;
  }
  return 'sills.' + side;
}

/* ------------------------------------------------------------------------ */
/* Names a scan's author gave its meshes and materials are the best evidence
   there is. A definite hint (a door, the hood) settles the whole mesh; a
   category hint (glass, a light) narrows the triangle rules. */
const HINTS = [
  [/wind(shield|screen)|front.?glass/i, 'windscreen'], [/rear.?(glass|window|screen)|back.?glass/i, 'rearscreen'],
  [/glass|window|glas\b|clearglass/i, '@glass'],
  [/head.?l(ight|amp)|headlight/i, '@headlamp'], [/tail.?l(ight|amp)|brake.?light|reverse|rear.?light|redglass/i, '@taillamp'],
  [/turn.?signal|indicator|light|lamp|lens/i, '@light'],
  [/mirror/i, '@mirror'],
  [/\btire|tyre|wheel(?!.?brake)|\brim\b|rims|hub.?cap|lug|caps_silver|gum\d/i, '@wheel'],
  [/brake|rotor|caliper|disc|disk/i, '@brake'],
  [/exhaust|muffler|tail.?pipe/i, 'rearbox'],
  [/grill/i, 'grille'], [/wiper/i, 'wipers'],
  [/\bhood\b|bonnet/i, 'bonnet'], [/trunk|boot.?lid|tailgate|deck.?lid/i, 'bootlid'], [/\broof\b/i, 'roof'],
  [/spoiler|rear.?wing|\bwing\b(?!.*(front|ft))/i, 'spoiler'],
  [/bumper.*(ft|front|fr\b)|front.?bumper|(ft|front).*bumper/i, 'bumperF'], [/bumper.*(rr|rear|bk|back)|rear.?bumper|(rr|rear|bk).*bumper/i, 'bumperR'],
  [/fender|front.?wing|wing.*(ft|front)/i, '@wingF'],
  [/door/i, '@door'], [/sill|skirt|rocker/i, '@sill'], [/quarter/i, '@quarter'],
  [/seat/i, '@seat'], [/dash|gauge|instrument|console|visor|carpet|floor.?mat/i, '@interior'],
  [/steer/i, 'steeringwheel'], [/pedal/i, 'pedals'],
  [/engine|supercharger|intake|radiator/i, 'engine'],
  [/spring|strut|shock|damper|coil/i, '@damper'], [/subframe|crossmember|arm\b|lowrarm|wishbone|link/i, '@susp'],
  [/interior|leather|fabric|cloth|alcantara/i, '@interior'],
  [/plate|licen|number/i, '@plate'],
  [/shadow|ao\b|blob/i, '@drop'],
];
function hintFor(names){
  for (const nm of names) if (nm) for (const [re, id] of HINTS) if (re.test(nm)) return id;
  return null;
}
/* a see-through material — by its blend mode, not by KHR transmission, which
   some scans switch on for every opaque material they have */
const GLASSY_MAT = (m) => !!m && m.transparent && (m.opacity ?? 1) < 0.95;
const LAMPY_MAT  = (m) => !!m && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3 && !m.map && !m.userData?.hadMap
                       && !/body|paint|carpaint|main|lambert|material/i.test(m.name || '');

/* ------------------------------------------------------------------------ */
/** Cut a fitted scan into part buckets.
 *
 *  `wrap` is the group fitToLength() returned, already in the vehicle frame
 *  (nose along +x, ground at y = 0, left at −z). `v` is the vehicle spec and
 *  `L` its BODY_LINES entry (for the panel cuts), `dims` the builder's frame
 *  ({ len, axF, axR, tf, tr, rF, rR }).
 *
 *  Returns { buckets: Map<id, THREE.Group>, counts: Map<id, triangles>,
 *            empty: string[] } — a bucket group holds one mesh per source
 *  material, with its geometry baked into the vehicle frame. Wheel buckets are
 *  re-centred on their hub so they can spin and steer: the group sits at the
 *  hub and the geometry is around the origin. */
export function splitScan(wrap, v, L, dims, opts = {}){
  const kind = opts.kind || (v.class === 'kart' ? 'kart' : ['formula', 'dragster'].includes(v.id) || v.body === 'formula' ? 'open' : 'car');
  wrap.updateMatrixWorld(true);

  /* ---- 1. every triangle, in the vehicle frame ------------------------- */
  const srcs = [];                      // { mesh, geo, matIndex, material, hint, start, count }
  wrap.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const names = [o.name, o.parent?.name, o.parent?.parent?.name];
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const geo = o.geometry;
    const groups = geo.groups?.length ? geo.groups : [{ start:0, count:Infinity, materialIndex:0 }];
    for (const g of groups){
      const m = mats[g.materialIndex] || mats[0];
      srcs.push({ mesh:o, geo, material:m, start:g.start, count:g.count,
                  hint:hintFor([...names, m?.name]) || (GLASSY_MAT(m) ? '@glass' : LAMPY_MAT(m) ? '@light' : null) });
    }
  });
  let total = 0;
  for (const s of srcs){
    const idx = s.geo.index, n = idx ? idx.count : s.geo.attributes.position.count;
    const count = Math.min(s.count, n - s.start);
    s.count = count; total += Math.floor(count / 3);
  }
  const C = new Float32Array(total * 3), N = new Float32Array(total * 3);
  const SRC = new Int32Array(total), TRI = new Int32Array(total);
  const V = new Float32Array(total * 9);          // the three corners, for adjacency
  const m4 = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let k = 0;
  srcs.forEach((s, si) => {
    const pos = s.geo.attributes.position, idx = s.geo.index;
    m4.copy(s.mesh.matrixWorld);
    const flip = m4.determinant() < 0;
    for (let i = s.start; i + 2 < s.start + s.count; i += 3){
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m4);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m4);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m4);
      e1.subVectors(b, a); e2.subVectors(c, a); nrm.crossVectors(e1, e2);
      if (flip) nrm.negate();
      const len = nrm.length();
      if (len > 0) nrm.divideScalar(len);
      C[k*3] = (a.x + b.x + c.x) / 3; C[k*3+1] = (a.y + b.y + c.y) / 3; C[k*3+2] = (a.z + b.z + c.z) / 3;
      N[k*3] = nrm.x; N[k*3+1] = nrm.y; N[k*3+2] = nrm.z;
      V[k*9] = a.x; V[k*9+1] = a.y; V[k*9+2] = a.z; V[k*9+3] = b.x; V[k*9+4] = b.y; V[k*9+5] = b.z; V[k*9+6] = c.x; V[k*9+7] = c.y; V[k*9+8] = c.z;
      SRC[k] = si; TRI[k] = i; k++;
    }
  });
  const nT = k;
  if (!nT) return { buckets:new Map(), counts:new Map(), empty:[] };

  /* ---- 2. the silhouette, slice by slice -------------------------------- */
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, maxZ = 0;
  for (let i = 0; i < nT; i++){
    const x = C[i*3], y = C[i*3+1], z = Math.abs(C[i*3+2]);
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  const NS = 72, NB = 36, NY = 20;
  const span = Math.max(1e-3, maxX - minX), H = Math.max(1e-3, maxY - minY);
  const sliceOf = (x) => Math.max(0, Math.min(NS - 1, Math.floor((maxX - x) / span * NS)));   // 0 at the nose
  const sMinY = new Float32Array(NS).fill(1e9), sMaxY = new Float32Array(NS).fill(-1e9), sMaxZ = new Float32Array(NS);
  const hwY = new Float32Array(NS * NY);           // half width per (slice, height band)
  for (let i = 0; i < nT; i++){
    const s = sliceOf(C[i*3]), y = C[i*3+1], z = Math.abs(C[i*3+2]);
    if (y < sMinY[s]) sMinY[s] = y; if (y > sMaxY[s]) sMaxY[s] = y; if (z > sMaxZ[s]) sMaxZ[s] = z;
    const yb = Math.max(0, Math.min(NY - 1, Math.floor((y - minY) / H * NY)));
    if (z > hwY[s*NY + yb]) hwY[s*NY + yb] = z;
  }
  for (let s = 0; s < NS; s++) if (sMinY[s] > sMaxY[s]){ sMinY[s] = minY; sMaxY[s] = minY; }
  /* a polar silhouette round each slice's centre: what is the outermost
     surface in each direction. Anything well inside it is interior. */
  const rho = new Float32Array(NS * NB);
  const binOf = (s, y, z) => { const yc = (sMinY[s] + sMaxY[s]) / 2; return Math.max(0, Math.min(NB - 1, Math.floor((Math.atan2(y - yc, z) + Math.PI) / (2 * Math.PI) * NB))); };
  const rhoOf = (s, y, z) => { const yc = (sMinY[s] + sMaxY[s]) / 2; return Math.hypot(y - yc, z); };
  for (let i = 0; i < nT; i++){
    const s = sliceOf(C[i*3]), y = C[i*3+1], z = C[i*3+2];
    const bb = binOf(s, y, z), r = rhoOf(s, y, z);
    if (r > rho[s*NB + bb]) rho[s*NB + bb] = r;
  }
  const rhoMax = (s, bb) => Math.max(rho[s*NB + bb], rho[s*NB + (bb + 1) % NB] * 0.92, rho[s*NB + (bb + NB - 1) % NB] * 0.92);

  /* the wheels, so they can be kept out of the silhouette's idea of the floor */
  const { axF, axR, tf, tr, rF, rR } = dims;
  const corners = [
    { id:'wheels.1', x:axF, z:-tf/2, r:rF, w:(v.tyreF || 200) / 1000, end:'F' }, { id:'wheels.2', x:axF, z:tf/2, r:rF, w:(v.tyreF || 200) / 1000, end:'F' },
    { id:'wheels.3', x:axR, z:-tr/2, r:rR, w:(v.tyreR || 200) / 1000, end:'R' }, { id:'wheels.4', x:axR, z:tr/2, r:rR, w:(v.tyreR || 200) / 1000, end:'R' },
  ];
  /* the scan's own wheel radius: the lowest point of the scan is the tyre, and
     its rims sit roughly where the spec says. Use the larger of spec and scan. */
  const wheelOf = (x, y, z, loose) => {
    for (const w of corners){
      const d = Math.hypot(x - w.x, y - w.r);
      if (d > w.r * (loose ? 1.25 : 1.04)) continue;
      if (Math.sign(z) !== Math.sign(w.z)) continue;
      if (Math.abs(z) < Math.abs(w.z) - w.w * (loose ? 1.2 : 0.75)) continue;
      return w;
    }
    return null;
  };

  /* ---- 3. the body lines in the scan's own proportions ------------------ */
  const sliceTop = (s) => sMaxY[s];
  const yFloorMid = Math.min(...Array.from({ length:8 }, (_, i) => sMinY[Math.floor(NS * (0.42 + i * 0.02))]).filter(y => y < 1e8), minY + 0.3 * H);
  const bodyBottom = Math.max(minY, Math.min(yFloorMid, minY + 0.35 * H));
  /* the greenhouse: where the top rises well above the bonnet and deck */
  const yBonnet = sliceTop(Math.floor(NS * 0.18)), yDeck = sliceTop(Math.floor(NS * 0.93));
  let tA = 0.3, tC = 0.85;
  for (let s = 0; s < NS; s++) if (sliceTop(s) > yBonnet + 0.30 * (maxY - yBonnet)){ tA = s / NS; break; }
  for (let s = NS - 1; s >= 0; s--) if (sliceTop(s) > yDeck + 0.30 * (maxY - yDeck)){ tC = (s + 1) / NS; break; }
  if (!(tC > tA + 0.15)){ tA = L?.pillars?.[0]?.[0] ?? 0.32; tC = L?.pillars?.[L.pillars.length - 1]?.[0] ?? 0.85; }
  const A0 = L?.pillars?.[0]?.[0] ?? 0.32, C0 = L?.pillars?.[L.pillars.length - 1]?.[0] ?? 0.85;
  const scale = Math.max(0.8, Math.min(1.25, (tC - tA) / Math.max(0.05, C0 - A0)));
  const remap = (c) => tA + (c - A0) * scale;
  const lc = L?.cuts || { bonnet:0.30, doorF:0.34, doorR:0.72, boot:0.86 };
  const doors4 = ['sedan','hatch','suv','rally','pickup'].includes(v.body);
  const pickup = v.body === 'pickup';
  const cuts = { bonnet:remap(lc.bonnet), doorF:remap(lc.doorF), doorR:remap(lc.doorR), boot:remap(lc.boot),
                 B: remap(L?.pillars?.[1]?.[0] ?? (lc.doorF + lc.doorR) / 2), bumperF:0.068, bumperR:0.935 };
  cuts.bonnet = Math.max(0.12, Math.min(cuts.bonnet, 0.45)); cuts.doorF = Math.max(cuts.bonnet + 0.01, Math.min(cuts.doorF, 0.5));
  cuts.doorR = Math.max(cuts.doorF + 0.15, Math.min(cuts.doorR, 0.9)); cuts.boot = Math.max(cuts.doorR + 0.02, Math.min(cuts.boot, 0.93));
  cuts.B = Math.max(cuts.doorF + 0.08, Math.min(cuts.B, cuts.doorR - 0.08));
  /* the shoulder line per slice: the top of the wide part of the section */
  const waistAt = new Float32Array(NS), sillAt = new Float32Array(NS), hwAt = new Float32Array(NS);
  for (let s = 0; s < NS; s++){
    let hwMax = 0; for (let yb = 0; yb < NY; yb++) hwMax = Math.max(hwMax, hwY[s*NY + yb]);
    let w = sliceTop(s);
    for (let yb = NY - 1; yb >= 0; yb--){
      const yTop = minY + (yb + 1) / NY * H;
      if (hwY[s*NY + yb] >= hwMax * 0.86){ w = Math.min(sliceTop(s), yTop); break; }
    }
    waistAt[s] = w; hwAt[s] = hwMax;
    sillAt[s] = bodyBottom + 0.085 * H;
  }
  /* smooth the waist a little so the door/roof seam does not step */
  for (let pass = 0; pass < 2; pass++) for (let s = 1; s < NS - 1; s++) waistAt[s] = (waistAt[s-1] + 2*waistAt[s] + waistAt[s+1]) / 4;
  const cabinAt = (s) => sliceTop(s) > waistAt[s] + 0.10 * H;

  /* ---- 4. classify every triangle ---------------------------------------- */
  const label = new Array(nT);
  const sideOf = (z) => z < 0 ? 1 : 2;
  const seatsN = v.seats || 2;
  for (let i = 0; i < nT; i++){
    const x = C[i*3], y = C[i*3+1], z = C[i*3+2], nx = N[i*3], ny = N[i*3+1], nz = N[i*3+2];
    const t = (maxX - x) / span, s = sliceOf(x);
    const hint = srcs[SRC[i]].hint;
    if (hint === '@drop'){ label[i] = null; continue; }           // a baked shadow card
    const side = sideOf(z);
    const wheel = wheelOf(x, y, z, hint === '@wheel' || hint === '@brake');
    if (hint === '@brake' && wheel){ label[i] = 'disc' + wheel.end.toLowerCase() + '.' + (side); continue; }
    if (wheel && (hint === '@wheel' || hint == null || hint === '@drop')){ label[i] = wheel.id; continue; }
    /* a wheel mesh nowhere near a hub is a scan's stray — the Mustang ships
       its wheels folded inside the body — and is better not drawn at all */
    if (hint === '@wheel'){ label[i] = wheelOf(x, y, z, true)?.id || null; continue; }

    if (kind === 'open'){ label[i] = openWheelerPart(t, y, z, nx, ny, nz, minY, H, maxZ, hint); continue; }
    if (kind === 'kart'){ label[i] = kartPart(t, y, z, minY, H, maxZ, hint); continue; }

    const waist = waistAt[s], sill = sillAt[s], cabin = cabinAt(s);
    const P = { t, y, z, nx, ny, nz, waist, sill, cabin, cuts, doors4, pickup };
    /* definite names first */
    if (hint && !hint.startsWith('@')){
      label[i] = hint === 'bootlid' && pickup && ny > 0.5 ? 'bed' : hint === 'spoiler' ? 'spoiler' : hint;
      continue;
    }
    if (hint === '@glass' || hint === '@headlamp' || hint === '@taillamp' || hint === '@light'){
      const lampish = hint !== '@glass' || ((t < 0.12 || t > 0.88) && y < waist + 0.02);
      if (lampish){
        label[i] = (hint === '@headlamp' || (hint !== '@taillamp' && t < 0.5)) ? 'headlamp.' + side : 'taillamp.' + side;
        continue;
      }
      if (nx > 0.3 && t < 0.55) label[i] = 'windscreen';
      else if (nx < -0.3 && t > 0.45) label[i] = /Tailgate/.test(v.body) || ['hatch','suv','rally','pickup'].includes(v.body) ? 'rearscreen' : 'rearscreen';
      else if (ny > 0.8 && t > cuts.doorF && t < cuts.boot) label[i] = 'roof';   // a sunroof pane
      else label[i] = doors4 ? (t < cuts.B ? 'glassF.' + side : 'glassR.' + side)
                    : (t < cuts.doorR ? 'glassF.' + side : (v.body === 'roadster' ? 'roof' : 'glassQ.' + side));
      continue;
    }
    if (hint === '@mirror'){ label[i] = 'mirrors.' + side; continue; }
    if (hint === '@wingF'){ label[i] = 'wingF.' + side; continue; }
    if (hint === '@door'){ label[i] = doors4 ? (t < cuts.B ? 'doorF.' + side : 'doorR.' + side) : 'doorF.' + side; continue; }
    if (hint === '@sill'){ label[i] = 'sills.' + side; continue; }
    if (hint === '@quarter'){ label[i] = 'quarters.' + side; continue; }
    if (hint === '@plate'){ label[i] = t < 0.5 ? 'bumperF' : 'bumperR'; continue; }
    if (hint === '@damper'){ label[i] = (t < 0.5 ? (v.suspF === 'macpherson' ? 'strutf.' : 'dampf.') : 'dampr.') + side; continue; }
    if (hint === '@susp'){ label[i] = t < 0.5 ? 'subfront' : 'subrear'; continue; }
    if (hint === '@seat'){ label[i] = t > cuts.B + 0.04 && seatsN > 2 ? 'seatR' : 'seatsF.' + (seatsN === 1 ? 1 : side); continue; }

    /* exterior or interior? compare with the polar silhouette of this slice */
    const r = rhoOf(s, y, z), rmax = rhoMax(s, binOf(s, y, z));
    const exterior = r >= rmax * 0.84 || hint === '@body';
    if (!exterior || hint === '@interior'){
      label[i] = interiorPart(t, y, z, nx, ny, nz, { waist, sill, top:sliceTop(s), hw:hwAt[s], cuts, doors4, seatsN, H, cabin, hint, minY, bodyBottom });
      continue;
    }
    /* mirrors: the only thing standing proud of the door skin at waist height */
    if (y > waist && y < waist + 0.28 * H && t > cuts.doorF - 0.04 && t < cuts.doorF + 0.16 && Math.abs(z) > hwAt[s] * 0.985 && Math.abs(z) > hwY[s*NY + Math.max(0, Math.min(NY - 1, Math.floor((waist - 0.03 - minY) / H * NY)))] + 0.02){
      label[i] = 'mirrors.' + side; continue;
    }
    label[i] = panelFor(P);
  }

  /* ---- 5. tidy the cut: small islands join their neighbours -------------- */
  smooth(label, V, nT);

  /* ---- 6. one geometry per (bucket, source material) -------------------- */
  const counts = new Map();
  for (let i = 0; i < nT; i++) if (label[i]) counts.set(label[i], (counts.get(label[i]) || 0) + 1);
  const byKey = new Map();                 // `${label}|${src}` -> [tri indices]
  for (let i = 0; i < nT; i++){
    if (!label[i]) continue;
    const key = label[i] + '|' + SRC[i];
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(i);
  }
  const buckets = new Map();
  const nm3 = new THREE.Matrix3();
  for (const [key, tris] of byKey){
    const [id, siS] = key.split('|');
    const s = srcs[Number(siS)];
    const pos = s.geo.attributes.position, nor = s.geo.attributes.normal, uv = s.geo.attributes.uv, uv1 = s.geo.attributes.uv1 || s.geo.attributes.uv2, col = s.geo.attributes.color;
    const idx = s.geo.index;
    m4.copy(s.mesh.matrixWorld); nm3.getNormalMatrix(m4);
    const n = tris.length * 3;
    const P3 = new Float32Array(n * 3), N3 = new Float32Array(n * 3);
    const UV = uv ? new Float32Array(n * 2) : null, UV1 = uv1 ? new Float32Array(n * 2) : null, CO = col ? new Float32Array(n * col.itemSize) : null;
    let w = 0;
    for (const ti of tris){
      const i = TRI[ti];
      for (let q = 0; q < 3; q++){
        const vi = idx ? idx.getX(i + q) : i + q;
        a.fromBufferAttribute(pos, vi).applyMatrix4(m4);
        P3[w*3] = a.x; P3[w*3+1] = a.y; P3[w*3+2] = a.z;
        if (nor){ nrm.fromBufferAttribute(nor, vi).applyMatrix3(nm3).normalize(); }
        else { nrm.set(N[ti*3], N[ti*3+1], N[ti*3+2]); }
        N3[w*3] = nrm.x; N3[w*3+1] = nrm.y; N3[w*3+2] = nrm.z;
        if (UV){ UV[w*2] = uv.getX(vi); UV[w*2+1] = uv.getY(vi); }
        if (UV1){ UV1[w*2] = uv1.getX(vi); UV1[w*2+1] = uv1.getY(vi); }
        if (CO) for (let cI = 0; cI < col.itemSize; cI++) CO[w*col.itemSize + cI] = col.array[vi*col.itemSize + cI];
        w++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P3, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
    if (UV) g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    if (UV1) g.setAttribute('uv1', new THREE.BufferAttribute(UV1, 2));
    if (CO) g.setAttribute('color', new THREE.BufferAttribute(CO, col.itemSize));
    const mesh = new THREE.Mesh(g, s.material);
    mesh.name = `${id}:${s.mesh.name || 'scan'}`;
    mesh.castShadow = mesh.receiveShadow = true;
    if (!buckets.has(id)){ const grp = new THREE.Group(); grp.name = 'scan:' + id; buckets.set(id, grp); }
    buckets.get(id).add(mesh);
  }
  /* wheels (and anything else asked for) re-centred on their own hub */
  const recentre = new Set(opts.recentre || corners.map(c => c.id));
  for (const [id, grp] of buckets){
    if (!recentre.has(id)) continue;
    const box = new THREE.Box3().setFromObject(grp);
    const ctr = box.getCenter(new THREE.Vector3());
    const corner = corners.find(c => c.id === id);
    if (corner){ ctr.x = corner.x; ctr.y = (box.min.y + box.max.y) / 2; }   // spin about the real axle
    for (const m of grp.children) m.geometry.translate(-ctr.x, -ctr.y, -ctr.z);
    grp.position.copy(ctr);
    grp.userData.radius = (box.max.y - box.min.y) / 2;
  }
  const want = opts.expected || [];
  const empty = want.filter(id => !buckets.has(id));
  return { buckets, counts, empty, cuts, tA, tC };
}

/* ------------------------------------------------------------------------ */
function interiorPart(t, y, z, nx, ny, nz, Q){
  const { waist, sill, top, hw, cuts, doors4, seatsN, H, cabin, hint, bodyBottom } = Q;
  const side = z < 0 ? 1 : 2;
  const az = Math.abs(z);
  if (hint === '@interior' || cabin){
    if (t < cuts.doorF - 0.02 && !cabin) return 'chassis';                // engine bay innards
    if (t > cuts.boot + 0.02 && !cabin) return 'chassis';                 // boot floor
    if (y < sill) return 'chassis';                                       // floor pan and underbody
    if (y > top - 0.09 * H && ny < 0.2) return 'headliner';
    if (az > hw * 0.80 && y > sill) return doors4 ? (t < cuts.B ? 'doorcardsF.' + side : 'doorcardsR.' + side) : (t < cuts.doorR ? 'doorcardsF.' + side : 'quarters.' + side);
    if (y < sill + 0.03 * H && ny > 0.3) return 'carpet';
    if (t < cuts.doorF + 0.10) return y > waist - 0.30 * H ? 'dash' : (az < hw * 0.18 ? 'console' : 'pedals');
    const seatEnd = doors4 ? cuts.B + 0.02 : cuts.doorR - 0.02;
    if (t < seatEnd + 0.06){
      if (az < hw * 0.16 && y < waist - 0.12 * H) return 'console';
      return 'seatsF.' + (seatsN === 1 ? 1 : side);
    }
    if (seatsN > 2) return 'seatR';
    return 'carpet';
  }
  return 'chassis';
}

function openWheelerPart(t, y, z, nx, ny, nz, minY, H, maxZ, hint){
  const yr = (y - minY) / H, az = Math.abs(z) / maxZ;
  const side = z < 0 ? 1 : 2;
  if (hint === '@seat' || hint === '@interior') return 'seatsF.1';
  if (hint === 'steeringwheel') return 'steeringwheel';
  if (t < 0.17 && yr < 0.42 && az > 0.28) return 'splitter';          // front wing
  if (t < 0.30 && az < 0.30) return 'nosecone';
  if (t > 0.86 && yr > 0.55) return 'rearwing';
  if (t > 0.78 && yr < 0.30 && az > 0.25) return 'floor';              // diffuser
  if (yr < 0.14 && az > 0.18) return 'floor';
  if (az > 0.26 && t > 0.30 && t < 0.86 && yr < 0.62) return 'sidepods.' + side;
  if (t > 0.34 && t < 0.60 && yr > 0.72 && az < 0.3) return 'halo';
  if (t > 0.55 && yr > 0.4 && az < 0.3) return 'enginecover';
  if (t > 0.3 && t < 0.6 && yr > 0.3 && az < 0.25 && ny < -0.2) return 'seatsF.1';
  return 'chassis';
}

function kartPart(t, y, z, minY, H, maxZ, hint){
  const yr = (y - minY) / H, az = Math.abs(z) / maxZ;
  const side = z < 0 ? 1 : 2;
  if (hint === '@seat') return 'seats';
  if (hint === 'engine') return 'engine';
  if (t < 0.14) return yr > 0.42 ? 'nosecone' : 'bumperF';
  if (t > 0.90 && yr < 0.5) return 'bumperR';
  if (az > 0.55 && yr < 0.55 && t > 0.3 && t < 0.86) return 'sidepods.' + side;
  if (t > 0.45 && t < 0.85 && az < 0.42 && yr > 0.28) return 'seats';
  if (t > 0.52 && t < 0.9 && z > 0.22 * maxZ && yr > 0.15 && yr < 0.95) return 'engine';
  if (t > 0.16 && t < 0.42 && az < 0.3 && yr > 0.36 && yr < 0.75) return 'nassau';
  if (t > 0.26 && t < 0.52 && az < 0.22 && yr > 0.72) return 'steeringwheel';
  if (t > 0.3 && t < 0.5 && az < 0.3 && yr > 0.2 && yr < 0.5) return 'tank';
  if (yr < 0.16 && t > 0.2 && t < 0.86 && az < 0.5) return 'floortray';
  return 'chassis';
}

/* ------------------------------------------------------------------------ */
/* A cut that lands on a triangle edge leaves confetti: a few triangles of
   door in the wing, a sliver of roof in the windscreen. Islands of a label —
   connected sets of triangles sharing vertices — that are tiny compared with
   the rest of that label are handed to whichever neighbouring label they
   touch most. */
function smooth(label, V, nT){
  if (nT < 10) return;
  /* vertices by quantised position */
  const vid = new Int32Array(nT * 3);
  const map = new Map();
  let nv = 0;
  const q = (x) => Math.round(x * 800);                 // 1.25 mm
  for (let i = 0; i < nT * 3; i++){
    const key = q(V[i*3]) * 73856093 ^ q(V[i*3+1]) * 19349663 ^ q(V[i*3+2]) * 83492791;
    let id = map.get(key);
    if (id === undefined){ id = nv++; map.set(key, id); }
    vid[i] = id;
  }
  /* triangles around each vertex */
  const start = new Int32Array(nv + 1);
  for (let i = 0; i < nT * 3; i++) start[vid[i] + 1]++;
  for (let v = 0; v < nv; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nv), around = new Int32Array(nT * 3);
  for (let i = 0; i < nT * 3; i++) around[fill[vid[i]]++] = Math.floor(i / 3);
  /* union-find over same-label neighbours */
  const parent = new Int32Array(nT); for (let i = 0; i < nT; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (x, y) => { x = find(x); y = find(y); if (x !== y) parent[x] = y; };
  for (let i = 0; i < nT; i++){
    if (!label[i]) continue;
    for (let c = 0; c < 3; c++){
      const vtx = vid[i*3 + c];
      for (let k = start[vtx]; k < start[vtx + 1]; k++){ const j = around[k]; if (j !== i && label[j] === label[i]) union(i, j); }
    }
  }
  const islandSize = new Map(), labelSize = new Map();
  for (let i = 0; i < nT; i++){ if (!label[i]) continue; const r = find(i); islandSize.set(r, (islandSize.get(r) || 0) + 1); labelSize.set(label[i], (labelSize.get(label[i]) || 0) + 1); }
  /* two passes: the first pass's reassignments can leave new small islands */
  for (let pass = 0; pass < 2; pass++){
    const changed = [];
    for (let i = 0; i < nT; i++){
      if (!label[i]) continue;
      const r = find(i), sz = islandSize.get(r), tot = labelSize.get(label[i]);
      if (!(sz < Math.max(3, tot * 0.02)) || sz > 400) continue;
      /* which other label do I touch most? */
      const votes = new Map();
      for (let c = 0; c < 3; c++){
        const vtx = vid[i*3 + c];
        for (let k = start[vtx]; k < start[vtx + 1]; k++){ const j = around[k]; if (label[j] && label[j] !== label[i] && find(j) !== r) votes.set(label[j], (votes.get(label[j]) || 0) + 1); }
      }
      if (!votes.size) continue;
      let best = null, bv = 0; for (const [l, n] of votes) if (n > bv){ bv = n; best = l; }
      changed.push([i, best]);
    }
    if (!changed.length) break;
    for (const [i, l] of changed){ labelSize.set(label[i], labelSize.get(label[i]) - 1); label[i] = l; labelSize.set(l, (labelSize.get(l) || 0) + 1); }
    /* rebuild the islands for the second pass */
    for (let i = 0; i < nT; i++) parent[i] = i;
    for (let i = 0; i < nT; i++){
      if (!label[i]) continue;
      for (let c = 0; c < 3; c++){ const vtx = vid[i*3 + c]; for (let k = start[vtx]; k < start[vtx + 1]; k++){ const j = around[k]; if (j !== i && label[j] === label[i]) union(i, j); } }
    }
    islandSize.clear();
    for (let i = 0; i < nT; i++){ if (!label[i]) continue; const r = find(i); islandSize.set(r, (islandSize.get(r) || 0) + 1); }
  }
}

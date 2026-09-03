/* Re-pose part of a glTF binary about a pivot.
 *
 * Showroom models are often exported in a display pose rather than a neutral
 * one — a car with a handful of lock wound on, for instance. That looks fine in
 * a single render and wrong the moment the model has to drive, so the pose has
 * to come out of the file before anything else uses it.
 *
 *     node tools/glb-pose.mjs in.glb out.glb "PivotNode:30:NodeA,NodeB,NodeC"
 *
 * Each argument turns the listed nodes by <deg> about the Y axis through the
 * pivot node's origin. Every listed node must sit under an untransformed
 * ancestor chain, which the tool checks rather than assumes.
 */
import { readFileSync, writeFileSync } from 'fs';

const [inFile, outFile, ...ops] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: glb-pose.mjs in.glb out.glb "Pivot:deg:A,B,C" ...'); process.exit(1); }

const buf = readFileSync(inFile);
let off = 12, g = null, bin = null;
while (off < buf.length){
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) g = JSON.parse(data.toString('utf8')); else bin = Buffer.from(data);
  off += 8 + len;
}

const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const mul = (a, b) => { const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++){
    let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; };
function local(n){
  if (n.matrix) return n.matrix;
  const t = n.translation || [0,0,0], q = n.rotation || [0,0,0,1], s = n.scale || [1,1,1];
  const [x,y,z,w] = q;
  return [(1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
          (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
          (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
          t[0], t[1], t[2], 1];
}
const parent = new Map();
g.nodes.forEach((n, i) => { for (const c of (n.children || [])) parent.set(c, i); });
const index = (name) => { const i = g.nodes.findIndex(n => n.name === name);
  if (i < 0) throw new Error(`no node named ${name}`); return i; };
function ancestry(i){ let m = I, p = parent.get(i);
  while (p != null){ m = mul(local(g.nodes[p]), m); p = parent.get(p); } return m; }
function world(i){ return mul(ancestry(i), local(g.nodes[i])); }
/* plain Gauss-Jordan — these are a handful of matrices, once, at build time */
function invert(m){
  const a = [], b = [];
  for (let r = 0; r < 4; r++){
    a.push([m[0*4+r], m[1*4+r], m[2*4+r], m[3*4+r]]);
    b.push([0,0,0,0].map((_, c) => c === r ? 1 : 0));
  }
  for (let c = 0; c < 4; c++){
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) throw new Error('singular parent transform');
    [a[c], a[piv]] = [a[piv], a[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    const d = a[c][c];
    for (let k = 0; k < 4; k++){ a[c][k] /= d; b[c][k] /= d; }
    for (let r = 0; r < 4; r++){
      if (r === c) continue;
      const f = a[r][c];
      for (let k = 0; k < 4; k++){ a[r][k] -= f * a[c][k]; b[r][k] -= f * b[c][k]; }
    }
  }
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c*4+r] = b[r][c];
  return o;
}

for (const op of ops){
  const [pivotName, degText, list] = op.split(':');
  const deg = Number(degText), a = deg * Math.PI / 180;
  const p = world(index(pivotName));
  const px = p[12], py = p[13], pz = p[14];
  const c = Math.cos(a), s = Math.sin(a);
  /* a yaw about the vertical line through the pivot */
  const R = [ c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,
              px - (c*px + s*pz), 0, pz - (-s*px + c*pz), 1 ];
  for (const name of list.split(',')){
    const i = index(name);
    const anc = ancestry(i);
    /* the turn is described in world space, so it has to be carried back
       through whatever the parents already do to the node */
    const m = mul(invert(anc), mul(R, mul(anc, local(g.nodes[i]))));
    const n = g.nodes[i];
    delete n.translation; delete n.rotation; delete n.scale;
    n.matrix = m;
    console.log(`${name} turned ${deg}° about ${pivotName} (${px.toFixed(3)}, ${pz.toFixed(3)})`);
  }
}

const jb = Buffer.from(JSON.stringify(g), 'utf8');
const js = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 0x20)]);   /* spaces, never nulls */
const bs = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4, 0)]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + bs.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bs.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(outFile, Buffer.concat([head, jh, js, bh, bs]));
console.log('wrote', outFile);

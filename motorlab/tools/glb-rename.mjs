/* Give a glTF binary's anonymous nodes real names.
 *
 * A model exported from a DCC tool often leaves a few nodes unnamed — the
 * loader then invents names like "mesh_89", which are stable only by accident
 * and tell nothing about what the piece is. MotorLab maps model pieces onto
 * teardown parts by name, so the names have to mean something.
 *
 *     node tools/glb-rename.mjs in.glb out.glb 84=WheelFrontLTyre 89=...
 *
 * Each argument is <node index>=<name>. Meshes attached to a renamed node take
 * the same name, so the loader's own naming agrees whichever it prefers.
 */
import { readFileSync, writeFileSync } from 'fs';

const [inFile, outFile, ...pairs] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: glb-rename.mjs in.glb out.glb idx=Name ...'); process.exit(1); }

const buf = readFileSync(inFile);
let off = 12, json = null, bin = null;
while (off < buf.length){
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8')); else bin = Buffer.from(data);
  off += 8 + len;
}

/* A loader names a mesh from the glTF mesh, not the node that carries it, so a
 * node with several primitives loses its name on every piece. Copying the node
 * name down onto the mesh keeps the pieces identifiable however they load. */
if (pairs[0] === '--sync'){
  pairs.shift();
  let n = 0;
  for (const node of json.nodes)
    if (node.mesh != null && node.name && json.meshes[node.mesh].name !== node.name){
      json.meshes[node.mesh].name = node.name; n++;
    }
  console.log(`named ${n} anonymous meshes after their node`);
}

for (const p of pairs){
  const [idx, name] = p.split('=');
  const node = json.nodes[Number(idx)];
  if (!node) throw new Error(`no node ${idx}`);
  node.name = name;
  if (node.mesh != null) json.meshes[node.mesh].name = name;
  console.log(`node ${idx} -> ${name}`);
}

const jb = Buffer.from(JSON.stringify(json), 'utf8');
const js = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 0x20)]);   /* spaces, never nulls */
const bs = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4, 0)]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + bs.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bs.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(outFile, Buffer.concat([head, jh, js, bh, bs]));
console.log('wrote', outFile, (js.length + bs.length + 28) / 1024 | 0, 'kB');

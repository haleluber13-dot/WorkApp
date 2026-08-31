/* Build MotorLab as one self-contained HTML file that needs no server and no
 * network: three.js, every module, the coastline data and the update feed are
 * all inlined. Run from the repository root:
 *
 *     npm install esbuild
 *     node motorlab/tools/build-single.mjs motorlab-offline.html
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';

const ROOT = process.env.MOTORLAB_ROOT || 'motorlab';
const vendorPlugin = {
  name: 'vendor-three',
  setup(build){
    build.onResolve({ filter: /^three$/ }, () => ({ path: resolve(ROOT, 'vendor/three/build/three.module.min.js') }));
    build.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: resolve(ROOT, 'vendor/three/examples/jsm/', args.path.replace('three/addons/', '')) }));
  },
};

const res = await esbuild.build({
  entryPoints: [resolve(ROOT, 'js/main.js')],
  bundle: true, format: 'iife', minify: true, write: false,
  target: ['es2021'], legalComments: 'none', plugins: [vendorPlugin],
});
const js = res.outputFiles[0].text;

/* Assets and vehicles the caller asked to leave out. The single file has a hard
 * size limit wherever it gets hosted, and the two heaviest vehicle models cost
 * more than the rest of the app put together — so they can be dropped, and the
 * vehicles that need them dropped with them, rather than shipping a catalogue
 * entry that cannot be drawn.
 *
 *     node tools/build-single.mjs out.html --skip=nns,harley --omit=nns,harley
 */
const arg = (name) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).split(',').filter(Boolean) : [];
};
const skip = arg('skip'), omit = arg('omit');
/* The scanned surface maps ship at full detail for the hosted app, but every
   byte of this build is inlined into one file with a size cap on it. When a
   small copy of a map exists in assets/surfaces-lite/, use that instead — the
   app still asks for ./assets/surfaces/<name>, so nothing in it has to know. */
const liteTex = !process.argv.includes('--full-tex');

/* inline every runtime asset so the single file needs no server at all */
const MIME = { '.png':'image/png', '.jpg':'image/jpeg', '.obj':'text/plain', '.mtl':'text/plain',
               '.glb':'model/gltf-binary', '.hdr':'image/vnd.radiance',
               /* the Draco decoder every bundled model needs */
               '.wasm':'application/wasm', '.js':'text/javascript',
               /* and the manifest that says which models exist at all: without
                  it every subject falls back to the generated machine, which
                  is exactly what this build was doing */
               '.json':'application/json' };
/* The models that earn their place first when there is not room for all of
 * them: one per marque people will look for by name, then the engines that
 * teach the most distinct layouts. Everything not named here still competes
 * for what is left, smallest first, so the file ends up as full as it can be.
 */
const FIRST = [
  'veh-bmw-m3-e46', 'veh-toyota-supra-a80', 'veh-mazda-rx7', 'veh-porsche-911-gt3',
  'veh-nissan-skyline-r34', 'veh-honda-nsx-na1', 'veh-ford-mustang-gt', 'veh-lambo-v12',
  'veh-bugatti-w16', 'veh-audi-r8', 'veh-ferrari-812', 'veh-maserati-granturismo',
  'veh-subaru-wrx-sti', 'veh-koenigsegg', 'veh-toyota-ae86', 'veh-sportbike',
  'eng-v8-57-sb', 'eng-i6-30-legend', 'eng-rotary-13b-t', 'eng-f6-30-t',
  'eng-f4-25-t', 'eng-v12-65-na', 'eng-m-triple-765',
];
const candidates = [];

function collect(dir, out = {}, base = dir){
  for (const name of readdirSync(dir)){
    const full = join(dir, name);
    if (statSync(full).isDirectory()){ collect(full, out, base); continue; }
    const ext = name.slice(name.lastIndexOf('.'));
    if (!MIME[ext]) continue;
    let rel = relative(`${ROOT}/assets`, full).split(/[\\/]/).join('/');
    if (rel.startsWith('surfaces-lite/')) continue;          // reached via its full-tier twin
    if (rel.startsWith('models-lite/')) continue;            // ditto
    if (rel.startsWith('thumbs-lite/')) continue;            // ditto
    if (skip.some(s => rel === s || rel.startsWith(s + '/'))) continue;
    let src = full;
    for (const folder of ['surfaces/', 'thumbs/']){
      if (!liteTex || !rel.startsWith(folder)) continue;
      const lite = join(`${ROOT}/assets`, folder.slice(0, -1) + '-lite', rel.slice(folder.length));
      if (existsSync(lite)) src = lite;
    }
    /* The real models total a couple of hundred megabytes and this build has a
       size cap, so it carries the small tier — and only as much of it as fits.
       Which ones fit is decided below, once every candidate's size is known;
       here we only note the candidates. The manifest still lists them all, and
       one that is not in the file is simply not fetched, so that vehicle stays
       generated rather than breaking. */
    if (liteTex && rel.startsWith('models/') && rel.endsWith('.glb')){
      const lite = join(`${ROOT}/assets`, 'models-lite', rel.slice('models/'.length));
      if (!existsSync(lite)) continue;
      candidates.push([rel, lite]);
      continue;
    }
    out['./assets/' + rel] = `data:${MIME[ext]};base64,` + readFileSync(src).toString('base64');
  }
  return out;
}
let assets = {};
try { assets = collect(`${ROOT}/assets`); } catch { assets = {}; }

/* Fill the model budget: the named ones first, then whatever else fits,
   smallest first, so the file carries as many machines as it can hold. */
const budgetMB = Number((process.argv.find(a => a.startsWith('--model-budget=')) || '=7')
                        .split('=').pop()) || 7;
let spent = 0;
const rank = (rel) => {
  const stem = rel.slice('models/'.length, -'.glb'.length);
  const i = FIRST.indexOf(stem);
  return i < 0 ? 1e6 : i;
};
candidates.sort((a, b) => (rank(a[0]) - rank(b[0])) ||
                          (statSync(a[1]).size - statSync(b[1]).size));
const takenModels = [];
for (const [rel, src] of candidates){
  const bytes = statSync(src).size;
  if ((spent + bytes) / 1048576 > budgetMB) continue;
  spent += bytes;
  assets['./assets/' + rel] = 'data:model/gltf-binary;base64,' + readFileSync(src).toString('base64');
  takenModels.push(rel.slice('models/'.length, -'.glb'.length));
}
console.log(`  models: ${takenModels.length} of ${candidates.length} fit in ${budgetMB} MB `
            + `(${(spent/1048576).toFixed(1)} MB used)`);

/* Every vehicle in this file is a real model or it is not in this file.
 *
 * The hosted app fetches a model when you pick its machine, so a car without
 * one falls back to the generated body and that is the right thing to do. In
 * the single file there is no fetching: whatever did not fit above would show
 * as a generated body for ever. Rather than fill a catalogue of photographs
 * with shapes derived from a specification, the ones whose model did not fit
 * are left out of it. --keep-all turns that off.
 */
if (!process.argv.includes('--keep-all')){
  const have = new Set(takenModels.filter(s => s.startsWith('veh-')).map(s => s.slice(4)));
  for (const [rel] of candidates){
    if (!rel.startsWith('models/veh-')) continue;
    const id = rel.slice('models/veh-'.length, -'.glb'.length);
    if (!have.has(id)) omit.push(id);
  }
  console.log(`  catalogue: ${have.size} vehicles kept, ${omit.length} left out `
              + `(no room for their model)`);
}
for (const [k, v] of Object.entries(assets))
  console.log(`  asset ${k.padEnd(44)} ${(v.length / 1024 / 1024).toFixed(2)} MB inlined`);

const css  = readFileSync(`${ROOT}/styles.css`, 'utf8');
const land = readFileSync(`${ROOT}/data/world_land.json`, 'utf8');
const feed = readFileSync(`${ROOT}/data/updates.json`, 'utf8');

/* take the visible markup out of index.html, dropping the module plumbing */
const html = readFileSync(`${ROOT}/index.html`, 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[\s\S]*?<\/script>/g, '')
  .trim();

const out = `<title>MotorLab</title>
<meta name="description" content="Strip an engine to the block in 3D and rebuild it with real torque sequences, build the chassis, wire it, tune the ECU and run it on the dyno.">
<style>
${css}
</style>
${body}
<script>window.__MOTORLAB_OMIT=${JSON.stringify(omit)};window.__MOTORLAB_SCANS_ONLY=${JSON.stringify(!process.argv.includes('--keep-all'))};window.__MOTORLAB_LAND=${land};window.__MOTORLAB_FEED=${feed};window.__MOTORLAB_ASSETS=${JSON.stringify(assets)};</script>
<script>
${js}
</script>
`;
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || 'motorlab-offline.html';
writeFileSync(OUT, out);
console.log('assets inlined:', Object.keys(assets).length,
            skip.length ? `(skipped ${skip.join(', ')})` : '',
            omit.length ? `(catalogue without ${omit.join(', ')})` : '');
console.log('wrote', OUT, '— JS', (js.length/1024).toFixed(0)+'kB', '| land', (land.length/1024).toFixed(0)+'kB',
            '| total', (out.length/1024/1024).toFixed(2)+'MB');

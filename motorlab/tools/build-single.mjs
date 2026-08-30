/* Build MotorLab as one self-contained HTML file that needs no server and no
 * network: three.js, every module, the coastline data and the update feed are
 * all inlined. Run from the repository root:
 *
 *     npm install esbuild
 *     node motorlab/tools/build-single.mjs motorlab-offline.html
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
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

/* inline every runtime asset so the single file needs no server at all */
const MIME = { '.png':'image/png', '.jpg':'image/jpeg', '.obj':'text/plain', '.mtl':'text/plain',
               '.glb':'model/gltf-binary', '.hdr':'image/vnd.radiance' };
function collect(dir, out = {}, base = dir){
  for (const name of readdirSync(dir)){
    const full = join(dir, name);
    if (statSync(full).isDirectory()){ collect(full, out, base); continue; }
    const ext = name.slice(name.lastIndexOf('.'));
    if (!MIME[ext]) continue;
    const key = './assets/' + relative(`${ROOT}/assets`, full).split(/[\\/]/).join('/');
    out[key] = `data:${MIME[ext]};base64,` + readFileSync(full).toString('base64');
  }
  return out;
}
let assets = {};
try { assets = collect(`${ROOT}/assets`); } catch { assets = {}; }
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
<script>window.__MOTORLAB_LAND=${land};window.__MOTORLAB_FEED=${feed};window.__MOTORLAB_ASSETS=${JSON.stringify(assets)};</script>
<script>
${js}
</script>
`;
const OUT = process.argv[2] || 'motorlab-offline.html';
writeFileSync(OUT, out);
console.log('assets inlined:', Object.keys(assets).length);
console.log('wrote', OUT, '— JS', (js.length/1024).toFixed(0)+'kB', '| land', (land.length/1024).toFixed(0)+'kB',
            '| total', (out.length/1024/1024).toFixed(2)+'MB');

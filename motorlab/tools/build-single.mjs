/* Build MotorLab as one self-contained HTML file that needs no server and no
 * network: three.js, every module, the coastline data and the update feed are
 * all inlined. Run from the repository root:
 *
 *     npm install esbuild
 *     node motorlab/tools/build-single.mjs motorlab-offline.html
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

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
<script>window.__MOTORLAB_LAND=${land};window.__MOTORLAB_FEED=${feed};</script>
<script>
${js}
</script>
`;
const OUT = process.argv[2] || 'motorlab-offline.html';
writeFileSync(OUT, out);
console.log('wrote', OUT, '— JS', (js.length/1024).toFixed(0)+'kB', '| land', (land.length/1024).toFixed(0)+'kB',
            '| total', (out.length/1024/1024).toFixed(2)+'MB');

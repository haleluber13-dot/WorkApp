#!/usr/bin/env node
/* MotorLab — bake an external model into the app.
 *
 * The in-app importer keeps a model in the browser. This does the other half:
 * it files a .glb into motorlab/assets/models/ and registers it against a
 * vehicle or engine, so it ships with the app and every viewer sees it.
 *
 *   node motorlab/tools/import-model.mjs veh:bmw-m3-e46 path/to/m3.glb \
 *        --credit "Author Name" --licence CC0 --source https://example.com/page
 *   node motorlab/tools/import-model.mjs eng:bmw-s54 path/to/s54.glb ...
 *   node motorlab/tools/import-model.mjs --list
 *   node motorlab/tools/import-model.mjs --remove veh:bmw-m3-e46
 *
 * Only pass a model you have the right to redistribute. --licence and --credit
 * are required for that reason: they are written into the manifest and into
 * assets/models/CREDITS.md, so what shipped and under what terms is always on
 * the record.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP  = resolve(HERE, '..');
const DIR  = join(APP, 'assets', 'models');
const MANIFEST = join(DIR, 'manifest.json');

const readManifest = () =>
  existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { models:{} };

function writeManifest(m){
  mkdirSync(DIR, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  const rows = Object.entries(m.models).sort(([a],[b]) => a.localeCompare(b));
  writeFileSync(join(DIR, 'CREDITS.md'),
    '# Bundled models\n\n' +
    'Every model shipped with MotorLab, what it is used for, and the terms it\n' +
    'is redistributed under. Nothing goes in here without a licence that allows\n' +
    'redistribution.\n\n' +
    '| Used for | File | Licence | Credit | Source |\n|---|---|---|---|---|\n' +
    rows.map(([k, v]) =>
      `| \`${k}\` | ${v.file} | ${v.licence} | ${v.credit} | ${v.source || '—'} |`).join('\n') +
    (rows.length ? '\n' : '_None yet._\n'));
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf('--' + name); return i < 0 ? null : args[i + 1]; };

if (args.includes('--list')){
  const m = readManifest();
  const rows = Object.entries(m.models);
  if (!rows.length) console.log('No models bundled.');
  for (const [k, v] of rows) console.log(`${k.padEnd(28)} ${v.file}  [${v.licence}]  ${v.credit}`);
  process.exit(0);
}

const removeKey = flag('remove');
if (removeKey){
  const m = readManifest();
  const rec = m.models[removeKey];
  if (!rec){ console.error('Not bundled: ' + removeKey); process.exit(1); }
  try { rmSync(join(DIR, rec.file)); } catch {}
  delete m.models[removeKey];
  writeManifest(m);
  console.log('Removed ' + removeKey);
  process.exit(0);
}

const [target, src] = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!target || !src || !/^(veh|eng):[a-z0-9-]+$/.test(target)){
  console.error('usage: import-model.mjs <veh|eng>:<id> <file.glb> --licence <L> --credit <who> [--source <url>]');
  process.exit(1);
}
const licence = flag('licence') || flag('license');
const credit  = flag('credit');
if (!licence || !credit){
  console.error('--licence and --credit are required: a model only ships if the terms it ships under are recorded.');
  process.exit(1);
}
if (!existsSync(src)){ console.error('No such file: ' + src); process.exit(1); }

const buf = readFileSync(src);
if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546C67){
  console.error('That is not a binary glTF (.glb). Convert it first — glb-optimise.mjs will do it.');
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });
const file = target.replace(':', '-') + '.glb';
writeFileSync(join(DIR, file), buf);

const m = readManifest();
m.models[target] = { file, licence, credit, source: flag('source') || '',
                     bytes: buf.length, added: new Date().toISOString().slice(0, 10) };
writeManifest(m);
console.log(`Bundled ${basename(src)} as ${file} for ${target} — ${(buf.length/1048576).toFixed(2)} MB [${licence}]`);
console.log('Credits written to assets/models/CREDITS.md');

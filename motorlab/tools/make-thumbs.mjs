#!/usr/bin/env node
/* MotorLab — render a picture of every vehicle and every engine.
 *
 * The catalogue is a wall of names, and a name is the worst way to pick a car.
 * These are the pictures that replace it: one square-ish photo per subject,
 * shot from the app's own viewport so a generated engine and a scanned car are
 * lit the same way and stand at the same angle.
 *
 * It drives the real app in a headless browser rather than re-implementing the
 * builders, which is the only way the pictures can stay honest — whatever
 * changes in the model shows up here on the next run.
 *
 *   node motorlab/tools/make-thumbs.mjs                 # everything
 *   node motorlab/tools/make-thumbs.mjs veh:bmw-m3-e46 eng:v8-57-sb
 *   node motorlab/tools/make-thumbs.mjs --only veh      # just the vehicles
 *
 * Output: motorlab/assets/thumbs/<kind>-<id>.jpg
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { extname, join, normalize, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP  = resolve(HERE, '..');
const ROOT = resolve(APP, '..');
const OUT  = join(APP, 'assets', 'thumbs');
const PORT = Number(process.env.PORT || 8191);

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.obj':'text/plain', '.mtl':'text/plain', '.glb':'model/gltf-binary',
  '.hdr':'application/octet-stream', '.webmanifest':'application/json' };

const argv = process.argv.slice(2);
const only = argv.filter(a => !a.startsWith('--'));
const kindOnly = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const force = argv.includes('--force');

mkdirSync(OUT, { recursive: true });

const srv = createServer((req, res) => {
  let p = normalize(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  try { if (statSync(p).isDirectory()) p = join(p, 'index.html'); } catch {}
  try {
    const b = readFileSync(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('not here'); }
});
await new Promise(r => srv.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 760, height: 760 } });
await page.addInitScript(() => { try { localStorage.setItem('motorlab.seen', '1'); } catch {} });

const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto(`http://127.0.0.1:${PORT}/motorlab/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__motorlab, null, { timeout: 90_000 });

/* Nothing but the model: no panel, no HUD, no toolbar, and a plain ground so
   the picture reads as a photograph of the thing rather than a screenshot. */
const STRIP = `
  .panel, .topbar, #labels, .toast, .statusbar, .vp__tools, .vp__hud,
  .vp__slider, .vp__crank, .vp__empty { display: none !important; }
  .stage { grid-template-columns: 1fr !important; }
  #gl { width: 100% !important; height: 100% !important; }
`;
await page.addStyleTag({ content: STRIP });

const list = await page.evaluate(async () => {
  const v = await import('./js/data/vehicles.js');
  const e = await import('./js/data/engines.js');
  return [
    ...(v.VEHICLES || []).map(x => ({ kind: 'veh', id: x.id, name: x.name })),
    ...(e.ENGINES  || []).map(x => ({ kind: 'eng', id: x.id, name: x.name })),
  ];
});

const wanted = list.filter(s =>
  (!only.length || only.includes(`${s.kind}:${s.id}`)) &&
  (!kindOnly || s.kind === kindOnly));

/* Every model loaded stays in memory for the life of the page, and after a
 * couple of dozen of them the next glTF fails to parse — out of texture
 * memory, quietly, with the app falling back to the generated machine exactly
 * as it is designed to. The pictures came out looking fine and were of the
 * wrong thing. So: start the page again every few subjects, and check the
 * model really is in hand before taking the picture. */
const PER_PAGE = 24;

async function freshPage(){
  await page.goto(`http://127.0.0.1:${PORT}/motorlab/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!globalThis.__motorlab, null, { timeout: 90_000 });
  await page.addStyleTag({ content: STRIP });
}

let done = 0, skipped = 0, since = 0;
const retried = new Set();
const queue = [...wanted];
for (let qi = 0; qi < queue.length; qi++){
  const s = queue[qi];
  const file = join(OUT, `${s.kind}-${s.id}.jpg`);
  if (!force && existsSync(file)) { skipped++; continue; }
  if (since >= PER_PAGE){ await freshPage(); since = 0; }
  since++;
  try {
    await page.evaluate(async ([kind, id]) => {
      const st = await import('./js/store.js');
      if (kind === 'eng') st.state.engineId = id; else st.state.vehicleId = id;
      st.invalidateTrees();
      /* every part fitted, nothing exploded: a catalogue picture is of the
         finished machine, not of a teardown in progress */
      const ws = kind === 'eng' ? 'engine' : 'chassis';
      const tree = kind === 'eng' ? st.tree() : st.vTree();
      const bag = kind === 'eng' ? (st.state.installed[st.state.engineId] ||= [])
                                 : (st.state.vInstalled[st.state.vehicleId] ||= []);
      bag.length = 0;
      bag.push(...tree.parts.map(p => p.id));
      st.state.settings.explodeDefault = 0;
      globalThis.__motorlab.ctx.goto(ws, { silent: true });
      /* a catalogue picture is of the machine, not of a diagram of it */
      const vp = globalThis.__motorlab.viewport;
      vp.setGhost(false); vp.setWire(false); vp.setCutaway(false); vp.setLabels(false);
    }, [s.kind, s.id]);

    /* A bundled model arrives after the first build and triggers a second one.
       Waiting for the geometry to stop changing is not enough on its own — the
       fetch can take longer than the settle window — so wait for the model to
       be in hand as well. */
    await page.waitForFunction(async ([kind, id]) => {
      const im = await import('./js/lib/importModel.js');
      if (im.modelPending(kind, id)) return false;
      const m = globalThis.__motorlab?.viewport?.model;
      if (!m) return false;
      const now = performance.now();
      const seen = (globalThis.__thumbSeen ||= {});
      let n = 0;
      m.root.traverse(o => { if (o.isMesh) n += (o.geometry?.index?.count || 0); });
      if (seen.n !== n) { seen.n = n; seen.at = now; return false; }
      return now - seen.at > 1000;
    }, [s.kind, s.id], { timeout: 120_000 }).catch(() => errs.push('settle timeout ' + s.id));
    await page.evaluate(() => {
      delete globalThis.__thumbSeen;
      const vp = globalThis.__motorlab.viewport;
      vp.setGhost(false); vp.setWire(false); vp.setCutaway(false);
      vp.setExplode(0); vp.frame();
      /* frame() leaves room for a part to be dragged out of the machine. A
         catalogue picture wants none of that: fill the card with the car. */
      vp.camera.position.lerpVectors(vp.controls.target, vp.camera.position, 0.70);
      vp.camera.updateProjectionMatrix();
      vp.controls.update();
    });
    await page.waitForTimeout(700);
    /* clip on the page rather than screenshotting the canvas element: an
       element shot waits for the element to stop changing, and a canvas that
       renders every frame never does. */
    /* Did the real model actually arrive? If it did not, the app quietly draws
       the generated machine, which is right for the app and wrong for a
       catalogue picture — so say so rather than shipping the wrong photo. */
    let got = await page.evaluate(async ([kind, id]) => {
      const im = await import('./js/lib/importModel.js');
      return !im.hasBundled(kind, id) || !!im.rawModelFor(kind, id);
    }, [s.kind, s.id]);
    if (!got){
      /* The settle wait can come back before the fetch has finished — it is a
         poll, and a poll can miss. Ask for the model outright and wait for the
         answer before declaring it missing. */
      got = await page.evaluate(async ([kind, id]) => {
        const im = await import('./js/lib/importModel.js');
        return !!(await im.ensureModel(kind, id));
      }, [s.kind, s.id]).catch(() => false);
      if (got){
        /* the model is in hand, but the app rebuilds around it asynchronously —
           wait for the geometry to stop changing or the picture is still of
           the generated machine */
        await page.waitForFunction(() => {
          const m = globalThis.__motorlab?.viewport?.model;
          if (!m) return false;
          let n = 0; m.root.traverse(o => { if (o.isMesh) n += (o.geometry?.index?.count || 0); });
          const seen = (globalThis.__thumbSeen2 ||= {});
          if (seen.n !== n){ seen.n = n; seen.at = performance.now(); return false; }
          return performance.now() - seen.at > 1200;
        }, null, { timeout: 60_000 }).catch(() => {});
        await page.evaluate(() => {
          delete globalThis.__thumbSeen2;
          const vp = globalThis.__motorlab.viewport;
          vp.setGhost(false); vp.setWire(false); vp.setCutaway(false);
          vp.setExplode(0); vp.frame();
          vp.camera.position.lerpVectors(vp.controls.target, vp.camera.position, 0.70);
          vp.camera.updateProjectionMatrix(); vp.controls.update();
        });
        await page.waitForTimeout(900);
      }
    }
    if (!got){
      /* one more go on a clean page before giving up on it, rather than
         quietly shipping a photo of the wrong car */
      if (!retried.has(s.id)){
        retried.add(s.id);
        await freshPage(); since = 0;
        queue.push(s);
      } else {
        errs.push(`${s.kind}:${s.id} model would not load — no picture rather than the wrong one`);
      }
      continue;
    }
    const box = await page.locator('#gl').boundingBox();
    const side = Math.min(box.width, box.height);
    await page.screenshot({ path: file, type: 'jpeg', quality: 84,
      clip: { x: box.x + (box.width - side) / 2, y: box.y + (box.height - side) / 2,
              width: side, height: side } });
    done++;
    process.stdout.write(`  ${s.kind}:${s.id}\n`);
  } catch (err){
    errs.push(`${s.kind}:${s.id} ${String(err).slice(0, 120)}`);
  }
}

console.log(`\n${done} rendered, ${skipped} already there, ${wanted.length} wanted`);
if (errs.length) console.log('problems:\n  ' + errs.slice(0, 20).join('\n  '));
await browser.close();
srv.close();

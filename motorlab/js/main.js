/* MotorLab — application shell. */
import { Viewport } from './viewport.js';
import { $, h, tabs as renderTabs, toast, modal, para, note, section, kv, btn } from './ui.js';
import { state, load, save, engine, vehicle, tree, vTree, installedSet, vInstalledSet,
         invalidateTrees, U } from './store.js';
import { loadStoredUpdates, checkForUpdates, updateState } from './updates.js';
import { buildEngine } from './build/engineModel.js';
import { buildVehicle } from './build/vehicleModel.js';
import { buildScannedVehicle, setLivery, liveriesFor } from './build/scannedVehicle.js';
import { onGameEvent, progressSummary, levelFor } from './game.js';
import { closeMenu, getSelected } from './workspaces/assembly.js';
import { restoreCustom } from './lib/importModel.js';
import { loadTextures } from './lib/textures.js';
import { loadPartModels, partCredits } from './lib/partModels.js';

import garage   from './workspaces/garage.js';
import { engineWs, chassisWs } from './workspaces/engine.js';
import tuneWs   from './workspaces/tune.js';
import dynoWs   from './workspaces/dyno.js';
import upgradeWs from './workspaces/upgrade.js';
import wiringWs from './workspaces/wiring.js';
import audioWs  from './workspaces/audio.js';
import learnWs  from './workspaces/learn.js';
import racesWs  from './workspaces/races.js';
import newsWs   from './workspaces/news.js';
import settingsWs from './workspaces/settings.js';

const WORKSPACES = [garage, engineWs, chassisWs, tuneWs, dynoWs, upgradeWs,
                    wiringWs, audioWs, learnWs, racesWs, newsWs, settingsWs];
const WS_BY_ID = Object.fromEntries(WORKSPACES.map(w => [w.id, w]));

let viewport = null;
let currentModel = null;     // { kind, built }
let refreshTimer = null;

const ctx = {
  get viewport(){ return viewport; },
  refresh, debouncedRefresh, goto, setTab, reloadModel, applySettings,
};

/* ---------------------------------------------------------------------- */
function boot(){
  load();
  loadStoredUpdates();
  invalidateTrees();

  /* the scanned part maps — real disc, caliper, tyre, carbon — load once, up
     front, so every builder after this point can stay synchronous */
  Promise.all([loadTextures(), loadPartModels()])
    .then(() => { if (currentModel){ currentModel = null; reloadModel(); } });

  viewport = new Viewport($('#gl'), $('#labels'));
  globalThis.__motorlab = { viewport, ctx };        // a handle for tooling and tests
  viewport.onPick = (id, hit, ev) => {
    const ws = current();
    if (ws.onPick) ws.onPick(ctx, id, hit, ev);
    else if (id) viewport.select(id);
  };
  viewport.onContext = (id, hit, ev) => current().onContext?.(ctx, id, hit, ev);
  viewport.setLabelSource((id) => current().labelFor?.(id) || null);

  buildNav();
  bindTools();
  bindKeys();
  applySettings();
  wireGameEvents();

  if (!WS_BY_ID[state.workspace]) state.workspace = 'garage';
  goto(state.workspace, { silent:true });

  /* bring back any vehicle model imported in a previous session */
  restoreCustom().then(r => {
    if (!r) return;
    if (currentModel?.kind === 'vehicle'){ currentModel = null; reloadModel(); }
    toast(`${r.name} restored — ${r.triangles.toLocaleString()} triangles.`);
  }).catch(() => {});

  if (state.settings.autoCheckUpdates)
    checkForUpdates(state.settings.feedUrl).then(r => {
      if (r.ok && !r.upToDate){
        const n = Object.values(r.added).reduce((a,b) => a+b, 0);
        if (n){ invalidateTrees(); refresh();
          toast(`Catalog updated — ${n} new items. See News & Updates.`, 'good'); }
      }
    });

  $('#btnHelp').onclick = showHelp;
  $('#btnReset').onclick = () => goto('settings', { tab:'data' });
  if (!localStorage.getItem('motorlab.seen')){
    localStorage.setItem('motorlab.seen', '1');
    setTimeout(showHelp, 700);
  }
}

function current(){ return WS_BY_ID[state.workspace] || garage; }
function currentTab(){
  const ws = current();
  const list = ws.tabs?.(ctx) || [];
  const saved = state.ui.panelTab[ws.id];
  return list.some(t => t.id === saved) ? saved : (list[0]?.id || null);
}

/* ---- navigation ------------------------------------------------------- */
function buildNav(){
  const nav = $('#workspaces');
  nav.innerHTML = '';
  for (const w of WORKSPACES)
    nav.appendChild(h('button', { class:'ws', data:{ ws:w.id }, onclick:() => goto(w.id), title:w.name },
      h('span', { class:'ws__ico', text:w.icon }), h('span', { text:w.short || w.name })));
}

function goto(id, opts = {}){
  if (!WS_BY_ID[id]) return;
  closeMenu();
  state.workspace = id;
  if (opts.tab) state.ui.panelTab[id] = opts.tab;
  if (opts.highlight) state.ui.upgradeHighlight = opts.highlight;
  save();
  document.querySelectorAll('.ws').forEach(b => b.classList.toggle('on', b.dataset.ws === id));
  reloadModel();
  refresh();
  if (!opts.silent) toast(WS_BY_ID[id].name);
}

function setTab(tab){
  state.ui.panelTab[current().id] = tab;
  save(); refresh();
}

/* ---- 3D model --------------------------------------------------------- */
function reloadModel(){
  const ws = current();
  const kind = ws.model;
  const wantKey = kind === 'engine' ? 'e:' + state.engineId
                : kind === 'vehicle' ? 'v:' + state.vehicleId : null;
  const empty = $('#vpEmpty');

  document.body.dataset.layout = kind ? 'split' : 'wide';
  if (!kind){
    empty.hidden = false;
    empty.textContent = '';
    empty.appendChild(h('div', null,
      h('div', { style:{ fontSize:'28px', marginBottom:'10px' }, text:ws.icon }),
      h('div', { text:ws.name }),
      h('div', { class:'tiny muted', style:{ marginTop:'8px', maxWidth:'420px' },
        text:'This workspace works in the panel. Switch to the Engine Bay or the Chassis to get back to the 3D model.' })));
    if (viewport.model){ viewport.scene.remove(viewport.model.root); viewport.model = null; }
    document.querySelectorAll('#gl').forEach(c => c.style.opacity = '0.25');
    return;
  }
  document.querySelectorAll('#gl').forEach(c => c.style.opacity = '1');
  empty.hidden = true;

  if (currentModel?.key === wantKey){ syncVisibility(); return; }

  const show = (built) => {
    currentModel = { key:wantKey, kind, built };
    viewport.installed = kind === 'engine' ? installedSet() : vInstalledSet();
    viewport.load(built, { fit:true });
    viewport.setExplode(state.settings.explodeDefault / 100);
    const ex = $('#explode');
    if (ex) ex.value = state.settings.explodeDefault;
  };

  /* a vehicle backed by a real model has to be fetched first */
  if (kind === 'vehicle' && vehicle().model){
    currentModel = { key:wantKey, kind, built:null, loading:true };
    $('#hudSub').textContent = 'Loading the model…';
    buildScannedVehicle(vehicle(), vTree()).then(built => {
      if (currentModel?.key !== wantKey) return;      // the user moved on while it loaded
      show(built);
      /* put back the colour or livery this model was last wearing */
      const model = vehicle().model;
      const list = liveriesFor(model);
      const saved = state.ui.liveries?.[model];
      const want = list.some(l => l.id === saved) ? saved : list[0]?.id;
      if (want) setLivery(model, want);
      refresh();
    }).catch(err => {
      console.error('Model load failed', err);
      if (currentModel?.key !== wantKey) return;
      toast('Could not load that model — falling back to the generated body.', 'bad');
      try { show(buildVehicle(vehicle(), vTree())); refresh(); } catch {}
    });
    return;
  }

  try {
    show(kind === 'engine' ? buildEngine(engine(), tree()) : buildVehicle(vehicle(), vTree()));
  } catch (err){
    console.error('Model build failed', err);
    toast('Could not build that 3D model — the rest of the app still works.', 'bad');
  }
}
function syncVisibility(){
  const kind = current().model;
  if (!kind || !viewport.model) return;
  viewport.applyInstalled(kind === 'engine' ? installedSet() : vInstalledSet());
}

/* ---- panel ------------------------------------------------------------ */
function debouncedRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 180);
}

function refresh(){
  const ws = current();
  const tab = currentTab();
  $('#panelTitle').textContent = ws.name;
  const list = ws.tabs?.(ctx) || [];
  renderTabs($('#panelTabs'), list, tab, setTab);
  const body = $('#panelBody');
  const scroll = body.scrollTop;
  body.innerHTML = '';
  try {
    body.appendChild(ws.render(ctx, tab));
  } catch (err){
    console.error(err);
    body.appendChild(note('Something went wrong rendering this panel: ' + err.message, 'bad'));
  }
  body.scrollTop = scroll;

  const hud = ws.hud?.(ctx) || { title:ws.name, sub:'' };
  $('#hudTitle').textContent = hud.title;
  $('#hudSub').textContent = hud.sub || '';

  const g = $('#gauges');
  g.innerHTML = '';
  for (const item of (ws.gauges?.(ctx) || []))
    g.appendChild(h('div', { class:'gauge ' + (item.kind || '') },
      h('span', { text:item.label }), h('b', { text:String(item.value) })));

  $('#explodeWrap').hidden = !ws.tools?.explode;
  $('#crankBar').hidden = !ws.tools?.crank;
  syncVisibility();
  updateStatus();
  $('#rigEngine').textContent = engine().name;
  $('#rigVehicle').textContent = vehicle().name;
}

function updateStatus(){
  const p = progressSummary();
  $('#statusLeft').textContent = state.settings.showXp && state.settings.gameMode
    ? `L${p.level.lvl} ${p.level.title} · ${p.xp} XP · $${p.credits.toLocaleString()}`
    : `${engine().name}`;
  const sel = getSelected();
  const kind = current().model;
  const t = kind === 'vehicle' ? vTree() : tree();
  $('#statusMid').textContent = sel && t.byId[sel] ? t.byId[sel].name : '';
  $('#statusRight').textContent =
    `${p.achievements}/${p.totalAchievements} achievements · catalog v${updateState.version || 0}`;
}

/* ---- viewport tools --------------------------------------------------- */
function bindTools(){
  const on = { explode:false, cutaway:false, ghost:state.settings.autoGhost,
               labels:state.settings.autoLabels, wire:false };
  document.querySelectorAll('.tool').forEach(b => {
    const t = b.dataset.tool;
    if (t === 'ghost' && on.ghost) b.classList.add('on');
    if (t === 'labels' && on.labels) b.classList.add('on');
    b.onclick = () => {
      if (t === 'fit'){ viewport.frame(); return; }
      on[t] = !on[t];
      b.classList.toggle('on', on[t]);
      if (t === 'cutaway') viewport.setCutaway(on[t]);
      if (t === 'ghost')   viewport.setGhost(on[t]);
      if (t === 'labels')  viewport.setLabels(on[t]);
      if (t === 'wire')    viewport.setWire(on[t]);
      if (t === 'explode'){
        const v = on[t] ? 60 : 0;
        $('#explode').value = v;
        viewport.setExplode(v/100);
      }
    };
  });
  viewport.setGhost(on.ghost);
  viewport.setLabels(on.labels);

  $('#explode').oninput = (e) => viewport.setExplode(parseFloat(e.target.value)/100);

  const rpm = $('#rpmIdle'), read = $('#rpmRead'), crank = $('#btnCrank');
  const setBoost = () => {
    const e = engine(), s = viewport.state;
    if (!e.boostTarget){ s.boost = 0; return; }
    const spool = e.spoolRpm || 2200;
    s.boost = e.boostTarget / (1 + Math.exp(-(s.rpm - spool) / (spool * 0.2)));
  };
  const missingParts = () => {
    if (current().model !== 'engine') return [];
    const inst = installedSet(), t = tree();
    return t.parts.filter(p => !inst.has(p.id));
  };
  rpm.oninput = () => {
    const v = parseInt(rpm.value, 10);
    read.textContent = v;
    if (v <= 0){ viewport.stopEngine(); return; }
    const missing = missingParts();
    if (missing.length){
      rpm.value = 0; read.textContent = '0';
      viewport.stopEngine();
      toast(`It will not run like this — ${missing.length} parts are still off, starting with ${missing[0].name}.`, 'bad');
      return;
    }
    viewport.revTo(v);
  };
  crank.onclick = () => {
    const e = engine();
    const s = viewport.state;
    const live = s.rpm > 40 || s.cranking > 0;
    if (live){
      viewport.stopEngine();
      rpm.value = 0;
      toast('Shut down.' + (e.aspiration !== 'na' ? ' On a real turbo car you would let it idle first — shutting down hot cokes the bearing oil.' : ''));
      return;
    }
    const missing = missingParts();
    if (missing.length){
      toast(`It will not run like this — ${missing.length} parts are still off, starting with ${missing[0].name}.`, 'bad');
      return;
    }
    viewport.startEngine(e.idle, {
      redline: e.redline, spoolRpm: e.spoolRpm || 2200,
      /* a light bike or race flywheel picks up revs far faster than a truck's */
      inertia: e.class === 'race' ? 0.32 : e.class === 'bike' ? 0.45
             : e.fuel === 'diesel' ? 2.2 : 1,
    });
    rpm.value = e.idle;
    toast('Cranking…');
  };
  /* keep the readout honest while the engine settles */
  setInterval(() => {
    const bar = $('#crankBar');
    if (!bar || bar.hidden) return;
    const s = viewport.state;
    read.textContent = Math.round(s.rpm);
    crank.classList.toggle('on', s.rpm > 40 || s.cranking > 0);
    crank.textContent = s.cranking > 0 ? '… cranking' : (s.rpm > 40 ? '■ Stop' : '▶ Crank');
    setBoost();
  }, 90);
}

function applySettings(){
  const s = state.settings;
  document.documentElement.style.setProperty('--acc', s.accent);
  const opacity = s.bodyOpacity ?? 0.5;
  if (globalThis.__MOTORLAB_BODY_OPACITY !== opacity){
    globalThis.__MOTORLAB_BODY_OPACITY = opacity;
    if (currentModel?.kind === 'vehicle'){ currentModel = null; reloadModel(); }
  }
  if (!viewport) return;
  viewport.camera.fov = s.fov; viewport.camera.updateProjectionMatrix();
  viewport.setBackdrop(s.backdrop);
  viewport.setEnvironment(s.environment).then(ok => {
    if (!ok && s.environment !== 'neutral'){
      state.settings.environment = 'neutral'; save();
    }
  });
  viewport.ground.visible = s.showGrid;
  viewport.key.castShadow = s.showShadows;
  viewport.onQualityFallback = () => {
    if (state.settings.quality !== 'high') return;
    state.settings.quality = 'balanced'; save();
    toast('This device could not run the ambient-occlusion pipeline — switched to Balanced.', 'bad');
    refresh();
  };
  if (viewport.quality !== s.quality) viewport.setQuality(s.quality);
  viewport.renderer.shadowMap.enabled = s.showShadows && s.quality !== 'fast';
  if (viewport.scene) viewport.scene.environmentIntensity = s.reflections ?? 0.85;
  viewport.setGhost(s.autoGhost);
  viewport.resize();
}

/* ---- keyboard --------------------------------------------------------- */
function bindKeys(){
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    const tool = { x:'explode', c:'cutaway', g:'ghost', l:'labels', w:'wire', f:'fit' }[k];
    if (tool){ document.querySelector(`.tool[data-tool="${tool}"]`)?.click(); return; }
    if (k >= '1' && k <= '9'){ const w = WORKSPACES[parseInt(k,10)-1]; if (w) goto(w.id); return; }
    if (k === '?' || (k === '/' && e.shiftKey)){ showHelp(); return; }
    if (k === 'escape'){ closeMenu(); const m = $('#modal'); if (!m.hidden){ m.hidden = true; m.innerHTML=''; } }
  });
}

/* ---- game feedback ---------------------------------------------------- */
function wireGameEvents(){
  onGameEvent((kind, payload) => {
    if (kind === 'level'){
      modal({ title:'Rank up', body:h('div', null,
        h('div', { style:{ fontSize:'34px', textAlign:'center', margin:'6px 0 12px' }, text:'🏆' }),
        para(`You have reached <b>Level ${payload.lvl} — ${payload.title}</b>.`),
        para(`$${(payload.lvl*1500).toLocaleString()} in credits added to your budget.`)),
        actions:[{ label:'Back to work', primary:true }] });
    } else if (kind === 'achievement'){
      toast(`${payload.icon}  ${payload.name} — ${payload.desc}`, 'good');
    }
    updateStatus();
  });
}

/* ---- help ------------------------------------------------------------- */
function showHelp(){
  modal({ title:'MotorLab — how it works', wide:true, body:h('div', null,
    para('A workshop you cannot break. Every engine and vehicle here is <b>generated from a specification</b> — the 3D model, the part list, the build order, the torque figures and the physics all come from the same numbers, so nothing is a static picture.'),
    section('In the 3D view',
      kv('Left-drag', 'orbit'), kv('Scroll / pinch', 'zoom'), kv('Right-drag', 'pan'),
      kv('Click a part', 'select it and open the actions menu'),
      kv('Right-click a part', 'actions menu directly'),
      kv('X / C / G / L / W / F', 'explode · cutaway · ghost · labels · wireframe · frame'),
      kv('1–9', 'jump between workspaces')),
    section('Where to start',
      h('ol', { class:'steps' },
        h('li', null, h('b', null, 'Garage'), ' — choose a vehicle and an engine. Everything else follows this.'),
        h('li', null, h('b', null, 'Engine Bay'), ' — strip it to the block and build it back. Every joint has a real torque figure and a real sequence.'),
        h('li', null, h('b', null, 'Chassis'), ' — subframes, suspension, brakes, drivetrain and wheels on the same system.'),
        h('li', null, h('b', null, 'Upgrade Shop'), ' — fit turbos, cams, head work, fuel systems, suspension and tyres.'),
        h('li', null, h('b', null, 'Tuning'), ' — fuel and ignition tables, boost, limits. Get it wrong and it detonates.'),
        h('li', null, h('b', null, 'Dyno & Track'), ' — measure what you built: power, 0–100, the quarter, a lap time.'),
        h('li', null, h('b', null, 'Learn'), ' — 23 lessons and a set of build challenges tied to all of the above.'))),
    note('Stuck? Every assembly panel has a <b>next step</b> box that tells you exactly which part goes on next and shows you where it lives.'),
    section('Credits',
      para('Almost everything you see is generated. Where a part is genuinely impossible to fake — a turbine wheel, a scanned vehicle body — MotorLab uses a real model, and those are credited here:'),
      ...credits().map(c => h('div', { class:'tiny muted', text:c })),
      h('div', { class:'tiny muted', text:'Scanned PBR surfaces — the grain on every casting, the orange peel on the paint, the tooth of the rubber — from ambientCG (ambientcg.com), CC0.' }),
      h('div', { class:'tiny muted', text:'Environment lighting photographed at a real auto service bay and a studio, from Poly Haven (polyhaven.com), CC0.' }),
      h('div', { class:'tiny muted', text:'Vehicle models and part textures were supplied by the repository owner; see the ABOUT.md beside each one in assets/ for provenance and trademarks.' })),
  ), actions:[{ label:'Start', primary:true }] });
}

/** Attribution the licences actually require, shown in the app itself. */
function credits(){
  const list = partCredits();
  return list.length ? list : ['(no scanned components loaded)'];
}

/* ---------------------------------------------------------------------- */
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();

if ('serviceWorker' in navigator)
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

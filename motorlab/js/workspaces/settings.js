/* Settings — everything in the app is adjustable from here. */
import { h, section, kv, note, para, chip, btn, toast, field, select, slider, toggle,
         download, pickFile, pickBinaryFile, confirmDialog, modal, add } from '../ui.js';
import { loadGLB, clearModel, modelFor, listModels } from '../lib/importModel.js';
import { state, save, DEFAULT_SETTINGS, resetAll, resetProject, exportSave, importSave,
         invalidateTrees, invalidateTree, engine, vehicle } from '../store.js';
import { checkForUpdates, updateState, DEFAULT_FEED } from '../updates.js';
import { progressSummary } from '../game.js';

export function render(ctx, tab){
  const s = state.settings;
  const v = vehicle(), e = engine();
  const importInto = (kind, id, label) =>
    pickBinaryFile('.glb,.gltf,model/gltf-binary,model/gltf+json', async (buf, name, size) => {
      if (size > 80 * 1024 * 1024){ toast('That file is over 80 MB — too big to hold in the browser.', 'bad'); return; }
      try {
        const r = await loadGLB(kind, id, buf, name);
        invalidateTree(kind, id);
        ctx.reloadModel(); ctx.refresh();
        toast(`${r.name} loaded onto ${label} — ${r.meshes} meshes, ${r.triangles.toLocaleString()} triangles.`, 'good');
      } catch (err){ toast(String(err.message || err), 'bad'); }
    });
  const dropModel = (kind, id, back) => {
    clearModel(kind, id); invalidateTree(kind, id);
    ctx.reloadModel(); ctx.refresh(); toast('Back to the ' + back + '.');
  };

  const wrap = h('div');
  const set = (k, v) => { s[k] = v; save(); ctx.applySettings(); ctx.refresh(); };
  const setQuiet = (k, v) => { s[k] = v; save(); ctx.applySettings(); };

  if (tab === 'data') return renderData(ctx, wrap);

  if (tab === 'sim'){
    add(wrap,
      para('The conditions every simulation runs under, and how hard the app pushes back when a build is dangerous.'),
      section('Ambient conditions',
        slider({ label:'Air temperature', min:-10, max:45, step:1, value:s.ambientC, format:(v)=>v+' °C',
          onInput:(v) => setQuiet('ambientC', v) }),
        slider({ label:'Altitude', min:0, max:4500, step:100, value:s.altitudeM, format:(v)=>v+' m',
          onInput:(v) => setQuiet('altitudeM', v) }),
        note('Hot air is less dense, so a naturally aspirated engine loses roughly 1% of its power for every 3 °C. Altitude costs about 3% per 300 m — which is why Pikes Peak is such a brutal test.')),
      section('Simulation',
        field('Difficulty', select([
          { value:'apprentice', label:'Apprentice — generous tolerances, plenty of hints' },
          { value:'mechanic',   label:'Mechanic — realistic tolerances' },
          { value:'engineer',   label:'Engineer — tight tolerances, no hints' },
        ], s.difficulty, (v) => set('difficulty', v))),
        slider({ label:'Auto-tune margin', min:0, max:1, step:0.05, value:s.autoTuneAggression,
          format:(v) => v < 0.35 ? 'conservative' : v < 0.7 ? 'street' : 'race',
          onInput:(v) => setQuiet('autoTuneAggression', v) }),
        toggle('Model engine damage', s.damageEnabled, (v) => set('damageEnabled', v)),
        toggle('Torque wrench drill', s.torqueGame, (v) => set('torqueGame', v)),
        toggle('Confirm before removing a part', s.confirmRemove, (v) => set('confirmRemove', v)),
        toggle('Show coaching hints', s.hints, (v) => set('hints', v))),
      section('Game layer',
        toggle('Game mode (XP, credits, challenges)', s.gameMode, (v) => set('gameMode', v)),
        toggle('Show XP in the status bar', s.showXp, (v) => set('showXp', v)),
        note(s.gameMode ? 'Parts cost credits, which you earn from lessons, challenges and dyno runs.'
                        : 'Game mode is off — every part in the catalog is free to fit and nothing is locked.')),

      section('Money',
        toggle('Unlimited money', s.unlimitedMoney ?? false, (v) => { set('unlimitedMoney', v); ctx.refresh?.(); }),
        note('Turn this on and money never runs out — fit anything you like, as much as you like.'),
        field('Set your balance', h('div', { class:'btnrow', style:{ margin:0 } },
          h('input', { class:'ml-money', type:'number', min:0, step:1000,
            value: state.game.credits,
            onchange:(e) => { const v = Math.max(0, Math.floor(+e.target.value || 0));
              state.game.credits = v; save(); toast('Balance set to $' + v.toLocaleString(), 'good'); ctx.refresh?.(); } }),
          btn('+$100k', { class:'btn--sm', onClick:() => { state.game.credits += 100000; save(); toast('+$100,000', 'good'); ctx.refresh(); } }),
          btn('Max', { class:'btn--sm', onClick:() => { state.game.credits = 999999999; save(); toast('Balance maxed', 'good'); ctx.refresh(); } }))),
        note('Type any amount and press enter, or tap a button. It is your garage — spend how you want.')),
    );
    return wrap;
  }

  /* Forty settings is forty settings however tidily it is grouped, so the
     fastest way to change one is to type a word from it. */
  const filter = h('input', { class:'search', type:'search', placeholder:'Find a setting — colour, units, shadows, sound…',
    value:state.ui.settingsQ || '',
    oninput:(ev) => {
      const q = (state.ui.settingsQ = ev.target.value.trim().toLowerCase());
      let shown = 0;
      wrap.querySelectorAll('.sec').forEach(sec => {
        const hit = !q || sec.textContent.toLowerCase().includes(q);
        sec.hidden = !hit;
        if (hit) shown++;
      });
      empty.hidden = !!shown;
    } });
  const empty = h('div', { class:'muted', text:'No setting matches that.', hidden:true });
  add(wrap, h('div', { class:'wallbar' }, filter), empty);

  add(wrap,
    section('Units',
      field('Measurement system', select([
        { value:'metric', label:'Metric — Nm, bar, km/h, °C, mm' },
        { value:'imperial', label:'Imperial — lb-ft, psi, mph, °F, in' },
      ], s.units, (v) => set('units', v))),
      field('Power unit', select([
        { value:'hp', label:'Horsepower (hp)' }, { value:'kw', label:'Kilowatts (kW)' }, { value:'ps', label:'Metric horsepower (PS)' },
      ], s.powerUnit, (v) => set('powerUnit', v)))),

    section('3D view',
      field('Lighting', select([
        { value:'garage',  label:'Auto service bay — photographed HDRI' },
        { value:'studio',  label:'Studio — photographed HDRI' },
        { value:'neutral', label:'Neutral room — generated' },
      ], s.environment, (v) => set('environment', v))),
      note('The environment is what a polished rim, a clearcoat panel or a pane of glass is actually reflecting. Both photographed options are real places, lit by real lights.'),
      toggle('Show the environment behind the model', s.backdrop, (v) => set('backdrop', v)),
      field('Render quality', select([
        { value:'balanced', label:'Balanced — reflections and shadows (recommended)' },
        { value:'high', label:'High — adds ambient occlusion and bloom; needs a real GPU' },
        { value:'fast', label:'Fast — for older phones and laptops' },
      ], s.quality, (v) => set('quality', v))),
      slider({ label:'Reflections', min:0, max:2, step:0.05, value:s.reflections ?? 0.85,
        format:(v) => v.toFixed(2) + '×', onInput:(v) => setQuiet('reflections', v) }),
      note('Reflections come from an environment map, not a texture. Turning them down makes metal look like painted plastic — which is exactly why a part with nothing to reflect never looks real.'),
      slider({ label:'Field of view', min:25, max:70, step:1, value:s.fov, format:(v)=>v+'°',
        onInput:(v) => setQuiet('fov', v) }),
      slider({ label:'Exposure', min:50, max:160, step:2, value:s.exposure ?? 100, format:(v)=>v+'%',
        onInput:(v) => setQuiet('exposure', v) }),
      note('Exposure is the camera, not the lights: turn it up for a bright showroom read, down for a moody garage.'),
      toggle('Ground grid', s.showGrid, (v) => set('showGrid', v)),
      toggle('Shadows', s.showShadows, (v) => set('showShadows', v)),
      toggle('Ghost the parts that are not fitted', s.autoGhost, (v) => set('autoGhost', v)),
      toggle('Part labels on by default', s.autoLabels, (v) => set('autoLabels', v)),
      toggle('Zoom to a part when you select it', s.autoFrame, (v) => set('autoFrame', v)),
      slider({ label:'Default explode', min:0, max:100, step:5, value:s.explodeDefault, format:(v)=>v+'%',
        onInput:(v) => setQuiet('explodeDefault', v) }),
      slider({ label:'Bodywork opacity', min:0.15, max:1, step:0.05, value:s.bodyOpacity ?? 0.5,
        format:(v) => v >= 0.99 ? 'solid' : Math.round(v*100)+'%',
        onInput:(v) => set('bodyOpacity', v) }),
      note('Turn the bodywork up to solid for a finished car, or back down to see the chassis, suspension and drivetrain through it.')),

    section("The driver's seat",
      slider({ label:'Engine volume', min:0, max:100, step:5, value:s.engineVolume ?? 70,
        format:(v)=>v+'%', onInput:(v) => setQuiet('engineVolume', v) }),
      toggle('Real recorded engine sound (when a recording exists)', s.realSound ?? true,
        (v) => set('realSound', v)),
      note('Where a licence-clean recording of the real machine exists — a cross-plane V8, a rotary, a Harley twin — it plays pitch-tracked to the tachometer, layered over a synth built from this exact engine’s firing frequency. Turn the recordings off to hear the pure simulation. Every recording’s author is credited in the Files tab.'),
      field('Steering wheel side', select([
        { value:'left',  label:'Left-hand drive' },
        { value:'right', label:'Right-hand drive' },
      ], s.seatSide ?? 'left', (v) => set('seatSide', v))),
      slider({ label:'In-car field of view', min:50, max:90, step:1, value:s.driveFov ?? 66,
        format:(v)=>v+'°', onInput:(v) => setQuiet('driveFov', v) }),
      note('A wider in-car view shows more of the dashboard and the door; a narrower one is more like looking down the road.')),

    section('Handling parts',
      para('Press and hold any part in the 3D view and it comes off in your hand. Drag it clear and let go and it stays where you put it, on the bench beside the machine, until you put it back.'),
      slider({ label:'Press-and-hold time', min:150, max:1200, step:50, value:s.holdMs ?? 420,
        format:(v) => (v/1000).toFixed(2) + ' s', onInput:(v) => setQuiet('holdMs', v) }),
      note('Shorter is quicker once you know the app; longer stops a slow click from lifting something you only meant to look at.'),
      toggle('Snap a part onto the bench when you drop it nearby', s.benchSnap ?? true,
        (v) => set('benchSnap', v)),
      toggle('Show a picture of each part in the lists', s.partPics ?? true, (v) => set('partPics', v)),
      note('The pictures are rendered from the parts themselves. Turn them off on a slow machine.')),

    section('Text and motion',
      slider({ label:'Text size', min:90, max:135, step:5, value:s.textScale ?? 100,
        format:(v) => v + '%', onInput:(v) => set('textScale', v) }),
      toggle('Reduce motion (no camera glides, no spin-up animation)', s.reduceMotion ?? false,
        (v) => set('reduceMotion', v)),
      toggle('Sound', s.sound, (v) => set('sound', v))),

    section('Bring your own model',
      para('MotorLab ships with real, licence-clean models for most of the catalogue — they are fetched when you pick the machine they belong to, and credited in <b>assets/models/CREDITS.md</b>. You can put your own over the top of any of them: a <b>.glb</b> or <b>.gltf</b>. A CC0 download, a purchased asset, or a scan you made yourself with a phone all work.'),
      para('A model is kept against the specific vehicle or engine you load it for, so a library builds up as you go. On a <b>vehicle</b> it replaces the generated bodywork, with the chassis, suspension, brakes and drivetrain still underneath where you can work on them. On an <b>engine</b> it goes on as a shell over the top: strip the shell off and the whole teardown works exactly as before.'),
      h('div', { class:'btnrow' },
        btn('Load a model for ' + v.name, { class:'btn--pri', onClick:() => importInto('veh', v.id, v.name) }),
        modelFor('veh', v.id) ? btn('Remove it', { onClick:() => dropModel('veh', v.id, 'generated bodywork') }) : null),
      modelFor('veh', v.id) ? kv(v.name, modelFor('veh', v.id).name + ' · '
        + modelFor('veh', v.id).triangles.toLocaleString() + ' triangles') : null,
      h('div', { class:'btnrow' },
        btn('Load a model for ' + e.name, { class:'btn--pri', onClick:() => importInto('eng', e.id, e.name) }),
        modelFor('eng', e.id) ? btn('Remove it', { onClick:() => dropModel('eng', e.id, 'generated engine') }) : null),
      modelFor('eng', e.id) ? kv(e.name, modelFor('eng', e.id).name + ' · '
        + modelFor('eng', e.id).triangles.toLocaleString() + ' triangles') : null,
      listModels().length
        ? h('div', { class:'kvs' }, ...listModels().map(m =>
            kv((m.kind === 'veh' ? 'Vehicle' : 'Engine') + ' · ' + m.id, m.name)))
        : note('Nothing imported yet.'),
      note('Models are stored in this browser and survive a reload. Nothing is uploaded anywhere. Sources worth knowing: Sketchfab has a large collection of public-domain (CC0) vehicles that are free to use for anything; Kenney and Quaternius publish CC0 vehicle kits; and a phone scan of a real engine or car imports the same way.')),

    section('Appearance',
      field('Accent colour', h('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap' } },
        ...['#ff7a1a','#22d3ee','#3ddc84','#ffc53d','#ff5a5a','#a78bfa','#f472b6','#94a3b8'].map(c =>
          h('button', { style:{ width:'30px', height:'30px', borderRadius:'8px', background:c,
            border: s.accent === c ? '2px solid #fff' : '1px solid #2e3950', cursor:'pointer' },
            onclick:() => set('accent', c) })))),
      note('The accent colour is used for selection highlights in 3D as well as the interface.')),

    section('Updates',
      toggle('Check for catalog updates on start', s.autoCheckUpdates, (v) => set('autoCheckUpdates', v)),
      field('Feed URL', h('input', { type:'text', value:s.feedUrl,
        onchange:(e) => { s.feedUrl = e.target.value.trim() || DEFAULT_FEED; save(); toast('Saved.'); } })),
      h('div', { class:'btnrow' },
        btn('Check now', { onClick:async () => {
          const r = await checkForUpdates(s.feedUrl);
          toast(r.ok ? (r.upToDate ? 'Already up to date.' : `Updated to v${r.version}.`) : 'Check failed: ' + r.error,
                r.ok ? 'good' : 'bad');
          invalidateTrees(); ctx.refresh();
        } }),
        btn('Open the update channel', { onClick:() => ctx.goto('news', { tab:'updates' }) }))),

    h('div', { class:'btnrow' },
      btn('Restore all defaults', { onClick:() => confirmDialog('Restore defaults',
        'Reset every setting to its default? Your builds, tunes and progress are not touched.',
        () => { Object.assign(s, DEFAULT_SETTINGS); save(); ctx.applySettings(); ctx.refresh(); toast('Settings restored.'); }) })),
  );
  return wrap;
}

function renderData(ctx, wrap){
  const p = progressSummary();
  add(wrap,
    section('Your progress',
      kv('Level', `${p.level.lvl} — ${p.level.title}`),
      kv('XP', String(p.xp)),
      kv('Credits', '$' + p.credits.toLocaleString()),
      kv('Achievements', `${p.achievements} / ${p.totalAchievements}`),
      kv('Challenges', `${p.challenges} / ${p.totalChallenges}`),
      kv('Lessons complete', String(Object.values(state.lessons).filter(l => l.done).length)),
      kv('Dyno runs', String(state.game.dynoRuns || 0)),
      kv('Fasteners torqued', String(state.game.boltsTorqued || 0))),

    section('Save file',
      para('Everything — builds, tunes, fitted parts, lessons, achievements, settings and anything you added to the catalog — lives in this browser. Export it to move to another device or to keep a backup.'),
      h('div', { class:'btnrow' },
        btn('Export save', { class:'btn--pri', onClick:() => {
          download(`motorlab-save-${new Date().toISOString().slice(0,10)}.json`, exportSave());
          toast('Save exported.');
        } }),
        btn('Import save', { onClick:() => pickFile('.json', (text) => {
          try { importSave(text); toast('Save imported — reloading.', 'good'); setTimeout(() => location.reload(), 700); }
          catch (e){ toast('Not a valid MotorLab save file.', 'bad'); }
        }) }))),

    section('Reset',
      h('div', { class:'btnrow' },
        btn('Reset this project', { onClick:() => confirmDialog('Reset project',
          'Put the current engine and vehicle back to standard, factory tune and no upgrades?',
          () => { resetProject(); ctx.reloadModel(); ctx.refresh(); toast('Project reset.'); }, 'Reset') }),
        btn('Erase everything', { class:'btn--danger', onClick:() => confirmDialog('Erase everything',
          'Delete every build, tune, lesson result, achievement and credit. This cannot be undone.',
          () => { resetAll(); toast('Everything erased — reloading.'); setTimeout(() => location.reload(), 700); }, 'Erase it all') }))),

    section('About',
      para('<b>MotorLab</b> — a virtual build and tuning bay for engines, cars, motorcycles and karts. Everything you see in 3D is generated from a specification, not a downloaded model, and every number on screen comes from a physical model rather than a lookup table.'),
      note('The performance figures are a teaching simulation. They are calibrated to land close to real published figures for the archetypes they represent, but they are not a replacement for a real dyno, a real workshop manual or a real torque spec.'),
      note('Engines and vehicles are named after the real machines whose published bore, stroke, compression ratio, dimensions and gearing they are built from — the names identify the engineering being taught. MotorLab is an independent educational tool. It is not affiliated with, authorised by or endorsed by any manufacturer, it carries no manufacturer\'s badge, emblem or livery, and all trade marks belong to their respective owners.')),
  );
  return wrap;
}

export default {
  id:'settings', name:'Settings', icon:'⚙', model:null,
  tabs:() => [{ id:'general', name:'General' }, { id:'sim', name:'Simulation' }, { id:'data', name:'Progress & data' }],
  render,
  hud:() => ({ title:'Settings', sub:'Everything in MotorLab is adjustable' }),
};

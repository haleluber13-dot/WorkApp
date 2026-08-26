/* Settings — everything in the app is adjustable from here. */
import { h, section, kv, note, para, chip, btn, toast, field, select, slider, toggle,
         download, pickFile, confirmDialog, modal } from '../ui.js';
import { state, save, DEFAULT_SETTINGS, resetAll, resetProject, exportSave, importSave, invalidateTrees } from '../store.js';
import { checkForUpdates, updateState, DEFAULT_FEED } from '../updates.js';
import { progressSummary } from '../game.js';

export function render(ctx, tab){
  const s = state.settings;
  const wrap = h('div');
  const set = (k, v) => { s[k] = v; save(); ctx.applySettings(); ctx.refresh(); };
  const setQuiet = (k, v) => { s[k] = v; save(); ctx.applySettings(); };

  if (tab === 'data') return renderData(ctx, wrap);

  if (tab === 'sim'){
    wrap.append(
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
    );
    return wrap;
  }

  wrap.append(
    section('Units',
      field('Measurement system', select([
        { value:'metric', label:'Metric — Nm, bar, km/h, °C, mm' },
        { value:'imperial', label:'Imperial — lb-ft, psi, mph, °F, in' },
      ], s.units, (v) => set('units', v))),
      field('Power unit', select([
        { value:'hp', label:'Horsepower (hp)' }, { value:'kw', label:'Kilowatts (kW)' }, { value:'ps', label:'Metric horsepower (PS)' },
      ], s.powerUnit, (v) => set('powerUnit', v)))),

    section('3D view',
      field('Render quality', select([
        { value:'high', label:'High — shadows, antialiasing' },
        { value:'balanced', label:'Balanced' },
        { value:'fast', label:'Fast — for older devices' },
      ], s.quality, (v) => set('quality', v))),
      slider({ label:'Field of view', min:25, max:70, step:1, value:s.fov, format:(v)=>v+'°',
        onInput:(v) => setQuiet('fov', v) }),
      toggle('Ground grid', s.showGrid, (v) => set('showGrid', v)),
      toggle('Shadows', s.showShadows, (v) => set('showShadows', v)),
      toggle('Ghost the parts that are not fitted', s.autoGhost, (v) => set('autoGhost', v)),
      toggle('Part labels on by default', s.autoLabels, (v) => set('autoLabels', v)),
      toggle('Zoom to a part when you select it', s.autoFrame, (v) => set('autoFrame', v)),
      slider({ label:'Default explode', min:0, max:100, step:5, value:s.explodeDefault, format:(v)=>v+'%',
        onInput:(v) => setQuiet('explodeDefault', v) })),

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
  wrap.append(
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
      note('The performance figures are a teaching simulation. They are calibrated to land close to real published figures for the archetypes they represent, but they are not a replacement for a real dyno, a real workshop manual or a real torque spec.')),
  );
  return wrap;
}

export default {
  id:'settings', name:'Settings', icon:'⚙', model:null,
  tabs:() => [{ id:'general', name:'General' }, { id:'sim', name:'Simulation' }, { id:'data', name:'Progress & data' }],
  render,
  hud:() => ({ title:'Settings', sub:'Everything in MotorLab is adjustable' }),
};

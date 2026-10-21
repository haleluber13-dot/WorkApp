/* News & updates — what's new in the world, and what's new in the app. */
import { h, section, kv, note, para, chip, btn, toast, field, select, modal, add } from '../ui.js';
import { state, save, invalidateTrees } from '../store.js';
import { NEWS_CATEGORIES } from '../data/news.js';
import { allNews, checkForUpdates, updateState, addCustom, clearUpdates, DEFAULT_FEED } from '../updates.js';
import { ENGINES } from '../data/engines.js';
import { VEHICLES } from '../data/vehicles.js';
import { RACES } from '../data/races.js';
import { UPGRADES } from '../data/upgrades.js';

export function render(ctx, tab){
  const wrap = h('div');
  if (tab === 'updates') return renderUpdates(ctx, wrap);
  if (tab === 'add')     return renderAdd(ctx, wrap);

  const cat = state.ui.newsCat || '';
  const items = allNews().filter(n => !cat || n.cat === cat);
  add(wrap,
    para('What is changing in engines, cars, bikes and racing — and why it matters for what you are building.'),
    h('div', { style:{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'10px' } },
      h('button', { class:'chip' + (cat ? '' : ' chip--acc'), style:{ cursor:'pointer' },
        onclick:() => { state.ui.newsCat = ''; save(); ctx.refresh(); } }, 'Everything'),
      ...NEWS_CATEGORIES.map(c => h('button', { class:'chip' + (cat === c.id ? ' chip--acc' : ''), style:{ cursor:'pointer' },
        onclick:() => { state.ui.newsCat = c.id; save(); ctx.refresh(); } }, `${c.icon} ${c.name}`))),
    ...items.map(n => h('div', { class:'card' },
      h('div', { class:'card__h' },
        h('div', null,
          h('div', { class:'card__brand', text:`${n.date} · ${NEWS_CATEGORIES.find(c => c.id === n.cat)?.name || n.cat}` }),
          h('div', { class:'card__t', text:n.title })),
        n.new ? chip('new','acc') : null),
      h('div', { class:'card__b', text:n.body }))),
  );
  return wrap;
}

function renderUpdates(ctx, wrap){
  const s = updateState;
  const busy = h('div');
  add(wrap,
    para('MotorLab keeps its own catalog current. It checks an update feed and merges anything new — cars, bikes, engines, tuning parts, circuits and race series — into the app. Everything merged is stored on this device, so it still works offline.'),
    section('Channel',
      kv('Catalog version', String(s.version || 0)),
      kv('Published', s.published || '—'),
      kv('Last checked', s.lastChecked ? new Date(s.lastChecked).toLocaleString() : 'never'),
      s.lastError ? note('Last check failed: ' + s.lastError + '. The app carries on with everything it already has.', 'warn') : null,
      field('Feed URL', h('input', { type:'text', value:state.settings.feedUrl,
        onchange:(e) => { state.settings.feedUrl = e.target.value.trim() || DEFAULT_FEED; save(); toast('Feed URL saved.'); } })),
      h('div', { class:'btnrow' },
        btn('Check for updates', { class:'btn--pri', onClick:async () => {
          busy.innerHTML = ''; add(busy, note('Checking…'));
          const r = await checkForUpdates(state.settings.feedUrl);
          busy.innerHTML = '';
          if (!r.ok){ toast('Update check failed: ' + r.error, 'bad'); ctx.refresh(); return; }
          if (r.upToDate){ toast('Already up to date.'); ctx.refresh(); return; }
          const n = Object.values(r.added).reduce((a,b) => a+b, 0);
          invalidateTrees();
          toast(n ? `Catalog updated to v${r.version} — ${n} new items.` : `Catalog at v${r.version}.`, 'good');
          ctx.refresh();
        } }),
        btn('Re-apply feed', { onClick:async () => {
          await checkForUpdates(state.settings.feedUrl, { force:true });
          invalidateTrees(); toast('Feed re-applied.'); ctx.refresh();
        } })),
      busy),
    section('Catalog now',
      kv('Engines', String(ENGINES.length)),
      kv('Vehicles', String(VEHICLES.length)),
      kv('Upgrade parts', String(UPGRADES.length)),
      kv('Race events', String(RACES.length))),
    section('Merged from the feed',
      ...['engines','vehicles','races','upgrades','news'].map(k =>
        kv(k[0].toUpperCase() + k.slice(1), String((s[k] || []).length))),
      (s.engines?.length || s.vehicles?.length) ? h('div', { class:'plist', style:{ marginTop:'8px' } },
        ...[...(s.engines||[]), ...(s.vehicles||[])].map(x => h('div', { class:'pitem installed' },
          h('span', { class:'pitem__st' }), h('span', { class:'pitem__n', text:x.name || x.id }),
          x.custom ? h('span', { class:'pitem__q', text:'yours' }) : null))) : null,
      h('div', { class:'btnrow', style:{ marginTop:'9px' } },
        btn('Remove all merged content', { class:'btn--danger', onClick:() => {
          clearUpdates(); invalidateTrees(); toast('Back to the bundled catalog. Reload to see it.'); ctx.refresh();
        } }))),
    note('<b>How to publish your own updates:</b> host a JSON file with <code>version</code>, <code>published</code> and any of <code>news</code>, <code>engines</code>, <code>vehicles</code>, <code>races</code>, <code>upgrades</code>, then point the feed URL at it. Every install picks it up on the next check.'),
  );
  return wrap;
}

/* ---- add your own ----------------------------------------------------- */
function renderAdd(ctx, wrap){
  const form = state.ui.addForm ||= { kind:'vehicles' };
  const fields = {
    vehicles:[
      ['id','Identifier','my-car'], ['name','Name','My project car'],
      ['class','Class (car / bike / kart)','car'], ['drivetrain','Drivetrain (FWD/RWD/AWD/chain)','RWD'],
      ['massKg','Mass (kg)','1400'], ['wheelbase','Wheelbase (mm)','2600'],
      ['trackF','Front track (mm)','1540'], ['trackR','Rear track (mm)','1540'],
      ['lengthMm','Length (mm)','4400'], ['widthMm','Width (mm)','1800'], ['heightMm','Height (mm)','1380'],
      ['tyreF','Front tyre width','235'], ['tyreR','Rear tyre width','265'],
      ['rimF','Front rim (in)','18'], ['rimR','Rear rim (in)','18'],
      ['brakeF','Front disc (mm)','340'], ['brakeR','Rear disc (mm)','320'],
      ['cd','Drag coefficient','0.31'], ['area','Frontal area (m²)','2.1'],
      ['final','Final drive','3.9'], ['fuelL','Fuel (L)','55'],
      ['blurb','Description',''],
    ],
    engines:[
      ['id','Identifier','my-engine'], ['name','Name','My 2.0 turbo'],
      ['layout','Layout (I / V / F)','I'], ['cyl','Cylinders','4'],
      ['bankAngle','Bank angle (V engines)','0'],
      ['displacement','Displacement (cc)','1998'], ['bore','Bore (mm)','86'], ['stroke','Stroke (mm)','86'],
      ['cr','Compression ratio','9.5'], ['redline','Redline (rpm)','7200'],
      ['aspiration','Induction (na/turbo/twinturbo/supercharged)','turbo'],
      ['boostTarget','Boost target (bar)','1.2'], ['spoolRpm','Spool rpm','2200'],
      ['fuel','Fuel (gasoline/premium/race/e85/methanol/diesel)','premium'],
      ['valvesPerCyl','Valves per cylinder','4'], ['cam','Valvetrain (DOHC/SOHC/OHV)','DOHC'],
      ['idle','Idle rpm','850'], ['class','Class (car/bike/race)','car'],
      ['blurb','Description',''],
    ],
  };
  const numeric = new Set(['massKg','wheelbase','trackF','trackR','lengthMm','widthMm','heightMm','tyreF','tyreR',
    'rimF','rimR','brakeF','brakeR','cd','area','final','fuelL','cyl','bankAngle','displacement','bore','stroke',
    'cr','redline','boostTarget','spoolRpm','valvesPerCyl','idle']);
  const vals = form.vals ||= {};

  add(wrap,
    para('Add your own car, bike or engine. It joins the catalog exactly like a feed item: 3D model, part tree, torque specs and simulation are all generated from what you enter.'),
    field('What are you adding', select([{ value:'vehicles', label:'Vehicle' }, { value:'engines', label:'Engine' }],
      form.kind, (v) => { form.kind = v; save(); ctx.refresh(); })),
    ...fields[form.kind].map(([k, label, ph]) =>
      field(label, h('input', { type:'text', placeholder:ph, value:vals[k] ?? '',
        oninput:(e) => { vals[k] = e.target.value; } }))),
    h('div', { class:'btnrow' },
      btn('Add to the catalog', { class:'btn--pri', onClick:() => {
        const obj = {};
        for (const [k] of fields[form.kind]){
          const raw = (vals[k] ?? '').trim();
          if (!raw) continue;
          obj[k] = numeric.has(k) ? parseFloat(raw) : raw;
        }
        if (!obj.id || !obj.name){ toast('An identifier and a name are required.', 'bad'); return; }
        if (form.kind === 'vehicles' && !obj.engines) obj.engines = [state.engineId];
        try {
          addCustom(form.kind, obj);
          invalidateTrees();
          toast(`${obj.name} added to the catalog.`, 'good');
          form.vals = {};
          ctx.refresh();
        } catch (err){ toast(String(err.message || err), 'bad'); }
      } }),
      btn('Clear form', { onClick:() => { form.vals = {}; ctx.refresh(); } })),
    note('Anything you add is stored on this device and shown alongside the built-in catalog. It can be exported with your save file in Settings.'),
  );
  return wrap;
}

export default {
  id:'news', name:'News & Updates', short:'News', icon:'📰', model:null,
  tabs:() => [{ id:'news', name:'News' }, { id:'updates', name:'Update channel' }, { id:'add', name:'Add your own' }],
  render,
  hud:() => ({ title:'News & updates', sub:`Catalog v${updateState.version || 0} · ${ENGINES.length} engines · ${VEHICLES.length} vehicles` }),
};

/* MotorLab — application state, settings and persistence. */

import { ENGINE_BY_ID, ENGINES } from './data/engines.js';
import { VEHICLE_BY_ID, VEHICLES } from './data/vehicles.js';
import { defaultTune } from './sim/ecu.js';
import { buildPartTree } from './data/parts.js';
import { modelFor } from './lib/importModel.js';
import { buildVehicleTree } from './data/vehicleParts.js';

const KEY = 'motorlab.state.v1';
const SET = 'motorlab.settings.v1';

export const DEFAULT_SETTINGS = {
  /* look */
  theme:'workshop', accent:'#ff7a1a', units:'metric', powerUnit:'hp',
  showGrid:true, showShadows:true, quality:'balanced', fov:42, reflections:0.85, bodyOpacity:1.0,
  environment:'garage', backdrop:false,
  /* behaviour */
  /* ghost off by default: the first thing you see should be the machine, not
     a wireframe of everything that is missing from it. G still turns it on. */
  autoGhost:false, autoLabels:false, autoFrame:true, explodeDefault:0,
  confirmRemove:false, torqueGame:true, hints:true, sound:false,
  /* handling parts, and reading them */
  holdMs:420, benchSnap:true, partPics:true, textScale:100, reduceMotion:false,
  /* drive & sound */
  engineVolume:70, seatSide:'left', driveFov:66, exposure:100, dashCluster:true,
  /* simulation */
  ambientC:25, altitudeM:0, dynoSmoothing:1, difficulty:'apprentice',
  autoTuneAggression:0.5, damageEnabled:true,
  /* game */
  gameMode:true, showXp:true, credits:12000,
  /* updates */
  feedUrl:'./data/updates.json', autoCheckUpdates:true,
};

export const state = {
  /* A Supra with a 2JZ in it: both of these are real models, and the first
     thing anyone sees should be a real car rather than a shape derived from a
     specification. The derived ones are still there for every machine that has
     no scan — they are just not what the app opens on. */
  engineId:'i6-30-legend',
  vehicleId:'toyota-supra-a80',
  workspace:'garage',
  installed:{},            // engineId -> [partIds]
  vInstalled:{},           // vehicleId -> [partIds]
  tunes:{},                // engineId -> tune
  fitted:{},               // engineId -> [upgradeIds]
  torqued:{},              // `${engineId}:${partId}` -> true
  lessons:{},              // lessonId -> { done, score }
  quizAnswers:{},
  game:{ xp:0, level:1, credits:12000, achievements:[], challenges:{}, builds:0, dynoRuns:0, streak:0 },
  settings:{ ...DEFAULT_SETTINGS },
  ui:{ groupsOpen:{}, panelTab:{} },
};

/* ---- derived ---------------------------------------------------------- */
const treeCache = new Map();
export function engine(){ return ENGINE_BY_ID[state.engineId] || ENGINE_BY_ID['i4-20-t'] || ENGINES[0]; }
/* The offline build leaves out any vehicle it had no room for, so a saved
   choice — or the default — can name one that is not in this copy. Fall back
   to whatever is actually here rather than to a name that might not be. */
export function vehicle(){ return VEHICLE_BY_ID[state.vehicleId] || VEHICLE_BY_ID['coupe'] || VEHICLES[0]; }

export function tree(){
  const e = engine();
  const shell = !!modelFor('eng', e.id);
  const k = 'e:' + e.id + (shell ? ':shell' : '');
  if (!treeCache.has(k)) treeCache.set(k, buildPartTree(e, { shell }));
  return treeCache.get(k);
}
/** Drop cached trees for one subject — an import or removal changes its parts. */
export function invalidateTree(kind, id){
  for (const k of [...treeCache.keys()])
    if (k.startsWith((kind === 'eng' ? 'e:' : 'v:') + id)) treeCache.delete(k);
}
export function vTree(){
  const v = vehicle();
  const k = 'v:' + v.id;
  if (!treeCache.has(k)) treeCache.set(k, buildVehicleTree(v));
  return treeCache.get(k);
}
export function invalidateTrees(){ treeCache.clear(); }

export function installedSet(){
  const id = state.engineId;
  const t = tree();
  if (!state.installed[id]) state.installed[id] = t.parts.map(p => p.id);   // start assembled
  /* The real model arrives after the first build, and it arrives as a part.
     A part that was not in the tree when this engine was first assembled is
     not in the saved list, so without this the scan turns up permanently "not
     fitted" — the one thing you came to look at, switched off. */
  else if (!state.installed[id].includes('shell') && t.byId.shell)
    state.installed[id].push('shell');
  return new Set(state.installed[id]);
}
export function setInstalled(set){ state.installed[state.engineId] = [...set]; save(); }

export function vInstalledSet(){
  const id = state.vehicleId;
  if (!state.vInstalled[id]) state.vInstalled[id] = vTree().parts.map(p => p.id);
  return new Set(state.vInstalled[id]);
}
export function setVInstalled(set){ state.vInstalled[state.vehicleId] = [...set]; save(); }

export function tune(){
  const id = state.engineId;
  if (!state.tunes[id]) state.tunes[id] = defaultTune(engine());
  return state.tunes[id];
}
export function setTune(t){ state.tunes[state.engineId] = t; save(); }
export function resetTune(){ state.tunes[state.engineId] = defaultTune(engine()); save(); }

export function fitted(){
  const id = state.engineId;
  return state.fitted[id] ||= [];
}
export function setFitted(list){ state.fitted[state.engineId] = list; save(); }

export function isTorqued(partId){ return !!state.torqued[`${state.engineId}:${partId}`]; }
export function setTorqued(partId, ok = true){
  state.torqued[`${state.engineId}:${partId}`] = ok; save();
}

/* ---- persistence ------------------------------------------------------ */
let saveTimer = null;
export function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { settings, ...rest } = state;
      localStorage.setItem(KEY, JSON.stringify(rest));
      localStorage.setItem(SET, JSON.stringify(settings));
    } catch {}
  }, 220);
}
export function load(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
    const s = localStorage.getItem(SET);
    state.settings = { ...DEFAULT_SETTINGS, ...(s ? JSON.parse(s) : {}) };
    if (!state.game) state.game = { xp:0, level:1, credits:state.settings.credits, achievements:[], challenges:{}, builds:0, dynoRuns:0, streak:0 };
    if (!state.ui) state.ui = { groupsOpen:{}, panelTab:{} };
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
  return state;
}
export function resetAll(){
  try { localStorage.removeItem(KEY); } catch {}
  Object.assign(state, {
    installed:{}, vInstalled:{}, tunes:{}, fitted:{}, torqued:{}, lessons:{}, quizAnswers:{},
    game:{ xp:0, level:1, credits:DEFAULT_SETTINGS.credits, achievements:[], challenges:{}, builds:0, dynoRuns:0, streak:0 },
    ui:{ groupsOpen:{}, panelTab:{} },
  });
  invalidateTrees(); save();
}
export function resetProject(){
  delete state.installed[state.engineId];
  delete state.vInstalled[state.vehicleId];
  delete state.tunes[state.engineId];
  delete state.fitted[state.engineId];
  for (const k of Object.keys(state.torqued)) if (k.startsWith(state.engineId + ':')) delete state.torqued[k];
  save();
}

export function exportSave(){
  return JSON.stringify({ app:'MotorLab', version:1, saved:new Date().toISOString(), state }, null, 2);
}
export function importSave(json){
  const data = JSON.parse(json);
  if (!data?.state) throw new Error('Not a MotorLab save file');
  Object.assign(state, data.state);
  state.settings = { ...DEFAULT_SETTINGS, ...(data.state.settings || {}) };
  invalidateTrees(); save();
}

/* ---- units ------------------------------------------------------------ */
export const U = {
  power(hp){
    const s = state.settings.powerUnit;
    if (s === 'kw') return { v: hp * 0.7457, u:'kW' };
    if (s === 'ps') return { v: hp * 1.01387, u:'PS' };
    return { v: hp, u:'hp' };
  },
  torque(nm){
    return state.settings.units === 'imperial' ? { v: nm * 0.73756, u:'lb-ft' } : { v: nm, u:'Nm' };
  },
  pressure(bar){
    return state.settings.units === 'imperial' ? { v: bar * 14.5038, u:'psi' } : { v: bar, u:'bar' };
  },
  speed(kph){
    return state.settings.units === 'imperial' ? { v: kph * 0.621371, u:'mph' } : { v: kph, u:'km/h' };
  },
  temp(c){
    return state.settings.units === 'imperial' ? { v: c * 9/5 + 32, u:'°F' } : { v: c, u:'°C' };
  },
  len(mm){
    return state.settings.units === 'imperial' ? { v: mm / 25.4, u:'in' } : { v: mm, u:'mm' };
  },
  fmt(o, dp = 0){ return `${o.v.toFixed(dp)} ${o.u}`; },
};

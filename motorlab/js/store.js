/* MotorLab — application state, settings and persistence. */

import { ENGINE_BY_ID } from './data/engines.js';
import { VEHICLE_BY_ID } from './data/vehicles.js';
import { defaultTune } from './sim/ecu.js';
import { buildPartTree } from './data/parts.js';
import { buildVehicleTree } from './data/vehicleParts.js';

const KEY = 'motorlab.state.v1';
const SET = 'motorlab.settings.v1';

export const DEFAULT_SETTINGS = {
  /* look */
  theme:'workshop', accent:'#ff7a1a', units:'metric', powerUnit:'hp',
  showGrid:true, showShadows:true, quality:'high', fov:42,
  /* behaviour */
  autoGhost:true, autoLabels:false, autoFrame:true, explodeDefault:0,
  confirmRemove:false, torqueGame:true, hints:true, sound:false,
  /* simulation */
  ambientC:25, altitudeM:0, dynoSmoothing:1, difficulty:'apprentice',
  autoTuneAggression:0.5, damageEnabled:true,
  /* game */
  gameMode:true, showXp:true, credits:12000,
  /* updates */
  feedUrl:'./data/updates.json', autoCheckUpdates:true,
};

export const state = {
  engineId:'i4-20-t',
  vehicleId:'coupe',
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
export function engine(){ return ENGINE_BY_ID[state.engineId] || ENGINE_BY_ID['i4-20-t']; }
export function vehicle(){ return VEHICLE_BY_ID[state.vehicleId] || VEHICLE_BY_ID['coupe']; }

export function tree(){
  const e = engine();
  const k = 'e:' + e.id;
  if (!treeCache.has(k)) treeCache.set(k, buildPartTree(e));
  return treeCache.get(k);
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
  if (!state.installed[id]) state.installed[id] = tree().parts.map(p => p.id);   // start assembled
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

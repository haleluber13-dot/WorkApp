/* MotorLab — the update channel.
 * The app ships with a full catalog, then merges anything newer it can fetch
 * from an update feed: new cars, new engines, new upgrade parts, new circuits
 * and race series, and news items. Everything merged is stored locally, so the
 * app keeps its additions offline and works with no network at all.
 *
 * Feed shape (JSON):
 * { "version": 3, "published": "2026-08-20",
 *   "news":[…], "engines":[…], "vehicles":[…], "races":[…], "upgrades":[…] }
 */

import { ENGINES, ENGINE_BY_ID } from './data/engines.js';
import { VEHICLES, VEHICLE_BY_ID } from './data/vehicles.js';
import { RACES, RACE_BY_ID } from './data/races.js';
import { UPGRADES, UPGRADE_BY_ID } from './data/upgrades.js';
import { NEWS_SEED } from './data/news.js';

export const DEFAULT_FEED = './data/updates.json';

const KEY = 'motorlab.updates.v1';

export const updateState = {
  version: 0, published: null, lastChecked: null, lastError: null,
  news: [], engines: [], vehicles: [], races: [], upgrades: [],
};

export function loadStoredUpdates(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(updateState, JSON.parse(raw));
  } catch { /* private mode, corrupt data — carry on with the bundled catalog */ }
  applyToCatalogs();
  return updateState;
}
function persist(){
  try { localStorage.setItem(KEY, JSON.stringify(updateState)); } catch {}
}

/** Merge everything we have stored into the live in-memory catalogs. */
export function applyToCatalogs(){
  mergeInto(ENGINES, ENGINE_BY_ID, updateState.engines, normaliseEngine);
  mergeInto(VEHICLES, VEHICLE_BY_ID, updateState.vehicles, normaliseVehicle);
  mergeInto(RACES, RACE_BY_ID, updateState.races, (r) => r);
  mergeInto(UPGRADES, UPGRADE_BY_ID, updateState.upgrades, normaliseUpgrade);
}

function mergeInto(list, index, incoming, normalise){
  for (const raw of incoming || []){
    if (!raw?.id) continue;
    const item = normalise({ ...raw, added:true });
    const existing = index[item.id];
    if (existing){
      Object.assign(existing, item);
    } else {
      list.push(item); index[item.id] = item;
    }
  }
}

/* Feed entries are plain JSON, so functions and defaults are rebuilt here. */
function normaliseEngine(e){
  return Object.assign({
    kind:'piston', layout:'I', bankAngle:0, valvesPerCyl:4, cam:'DOHC', revsPerCycle:2,
    aspiration:'na', fuel:'gasoline', class:'car', idle:800, coolant:'water',
    ignition:'coil-on-plug', injection:'port', dryWeight:150,
    tqPeak: Math.round((e.redline || 7000) * 0.55), hpPeak: Math.round((e.redline || 7000) * 0.85),
    firing: 'I' + (e.cyl || 4),
  }, e);
}
function normaliseVehicle(v){
  return Object.assign({
    class:'car', drivetrain:'FWD', bay:'front-transverse', suspF:'macpherson', suspR:'torsionbeam',
    chassis:'unibody', brakeF:300, brakeR:280, tyreF:205, tyreR:205, rimF:17, rimR:17,
    cd:0.32, area:2.2, downforceKg:0, driveLoss:0.14, fuelL:50, seats:5, colour:0x2f6fb0,
    gears:[3.5,2.1,1.4,1.05,0.85,0.7], final:4.0,
  }, v);
}
function normaliseUpgrade(u){
  const test = compileFits(u.fitsExpr);
  return Object.assign({ cat:'induction', cost:0, effects:{}, requires:[], conflicts:[], tier:1 },
    u, { fits: test });
}
/** Feeds describe fitment declaratively — never as executable code. */
function compileFits(expr){
  if (!expr || typeof expr !== 'object') return () => true;
  return (e) => {
    if (expr.aspiration && !toArray(expr.aspiration).includes(e.aspiration)) return false;
    if (expr.kind && !toArray(expr.kind).includes(e.kind)) return false;
    if (expr.class && !toArray(expr.class).includes(e.class)) return false;
    if (expr.fuel && !toArray(expr.fuel).includes(e.fuel)) return false;
    if (expr.boosted === true && e.aspiration === 'na') return false;
    if (expr.boosted === false && e.aspiration !== 'na') return false;
    if (expr.minCyl && e.cyl < expr.minCyl) return false;
    if (expr.maxCyl && e.cyl > expr.maxCyl) return false;
    return true;
  };
}
const toArray = (v) => Array.isArray(v) ? v : [v];

export function allNews(){
  const seen = new Set();
  const out = [];
  for (const n of [...(updateState.news || []), ...NEWS_SEED]){
    if (!n?.id || seen.has(n.id)) continue;
    seen.add(n.id); out.push(n);
  }
  return out.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}

/** Fetch a feed and merge it. Returns a summary of what changed. */
export async function checkForUpdates(url = DEFAULT_FEED, { force = false } = {}){
  const summary = { ok:false, added:{ news:0, engines:0, vehicles:0, races:0, upgrades:0 }, version:updateState.version, error:null };
  try {
    let data;
    /* a single-file build carries its catalog inside it — no request to make */
    if (globalThis.__MOTORLAB_FEED && url === DEFAULT_FEED){
      data = globalThis.__MOTORLAB_FEED;
    } else {
      try {
        const bust = (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
        const res = await fetch(url + bust, { cache:'no-store' });
        if (!res.ok) throw new Error(`Feed responded ${res.status}`);
        data = await res.json();
      } catch (netErr){
        if (!globalThis.__MOTORLAB_FEED) throw netErr;
        data = globalThis.__MOTORLAB_FEED;
      }
    }
    if (!force && typeof data.version === 'number' && data.version <= updateState.version){
      summary.ok = true; summary.upToDate = true;
      updateState.lastChecked = new Date().toISOString(); persist();
      return summary;
    }
    for (const key of ['news','engines','vehicles','races','upgrades']){
      const incoming = Array.isArray(data[key]) ? data[key] : [];
      const have = new Set((updateState[key] || []).map(x => x.id));
      const fresh = incoming.filter(x => x?.id && !have.has(x.id));
      updateState[key] = [...(updateState[key] || []), ...fresh];
      summary.added[key] = fresh.length;
    }
    updateState.version = data.version ?? updateState.version + 1;
    updateState.published = data.published || new Date().toISOString().slice(0,10);
    updateState.lastChecked = new Date().toISOString();
    updateState.lastError = null;
    persist();
    applyToCatalogs();
    summary.ok = true; summary.version = updateState.version;
  } catch (err){
    summary.error = String(err.message || err);
    updateState.lastError = summary.error;
    updateState.lastChecked = new Date().toISOString();
    persist();
  }
  return summary;
}

/** Add your own vehicle or engine by hand — stored the same way as a feed item. */
export function addCustom(kind, item){
  if (!item?.id) throw new Error('Needs an id');
  updateState[kind] = [...(updateState[kind] || []).filter(x => x.id !== item.id), { ...item, custom:true }];
  persist();
  applyToCatalogs();
  return item;
}
export function removeCustom(kind, id){
  updateState[kind] = (updateState[kind] || []).filter(x => x.id !== id);
  persist();
}
export function clearUpdates(){
  Object.assign(updateState, { version:0, published:null, news:[], engines:[], vehicles:[], races:[], upgrades:[] });
  persist();
}

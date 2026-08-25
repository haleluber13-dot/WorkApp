/**
 * sync.js — Optional team sync over Supabase's REST API.
 *
 * Deliberately dependency-free: we speak PostgREST directly rather than
 * bundling the Supabase JS client, so the PWA stays a zero-build static site.
 *
 * Design: the local store is always the source of truth for the UI. Sync is a
 * background reconciliation — never a blocker. Records carry `updatedAt`
 * (epoch ms) and reconcile last-write-wins, which is the right call here
 * because a shoot day is edited by one coordinator at a time in practice.
 */

import { getState, replaceState } from './store.js';

const TABLES = ['people', 'locations', 'days'];

let pushTimer = null;
let online = navigator.onLine;
let statusListeners = new Set();
let lastStatus = { state: 'off', detail: '' };

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  fn(lastStatus);
  return () => statusListeners.delete(fn);
}

function setStatus(state, detail = '') {
  lastStatus = { state, detail };
  statusListeners.forEach((f) => f(lastStatus));
}

function cfg() {
  const s = getState().settings.sync;
  return s.enabled && s.url && s.anonKey ? s : null;
}

function headers(c) {
  return {
    apikey: c.anonKey,
    Authorization: `Bearer ${c.anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
}

function endpoint(c, table) {
  return `${c.url.replace(/\/+$/, '')}/rest/v1/${table}`;
}

/**
 * Rows are stored with the whole record in a `data` jsonb column. This keeps
 * the schema stable as the app's model evolves — no migration per new field.
 */
function toRow(c, rec) {
  return { id: rec.id, project_id: c.projectId || 'default', updated_at: rec.updatedAt || Date.now(), data: rec };
}

/** Push a batch produced by store.update(). Debounced so rapid typing coalesces. */
export function pushChanges(touched) {
  const c = cfg();
  if (!c || !touched?.table || !TABLES.includes(touched.table)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => flush(), 600);
}

/** Push the entire local dataset — used on enable, on reconnect, and after a debounce. */
export async function flush() {
  const c = cfg();
  if (!c) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  setStatus('syncing');
  const s = getState();
  try {
    for (const table of TABLES) {
      const rows = s[table].map((r) => toRow(c, r));
      if (!rows.length) continue;
      const res = await fetch(`${endpoint(c, table)}?on_conflict=id`, {
        method: 'POST', headers: headers(c), body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    }
    setStatus('ok', new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    console.warn('sync push failed', e);
    setStatus('error', String(e.message || e).slice(0, 120));
  }
}

/** Pull remote rows and merge them in by `updatedAt`. */
export async function pull() {
  const c = cfg();
  if (!c) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  setStatus('syncing');
  const s = structuredClone(getState());
  try {
    for (const table of TABLES) {
      const url = `${endpoint(c, table)}?project_id=eq.${encodeURIComponent(c.projectId || 'default')}&select=id,updated_at,data`;
      const res = await fetch(url, { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` } });
      if (!res.ok) throw new Error(`${table}: ${res.status}`);
      const remote = await res.json();
      const byId = new Map(s[table].map((r) => [r.id, r]));
      for (const row of remote) {
        // A record deleted locally stays deleted unless the remote copy is newer.
        const deletedAt = s.meta.deleted[row.id];
        if (deletedAt && deletedAt >= Number(row.updated_at)) continue;
        const local = byId.get(row.id);
        if (!local || Number(row.updated_at) > (local.updatedAt || 0)) {
          byId.set(row.id, row.data);
        }
      }
      s[table] = [...byId.values()];
    }
    s.meta.lastPull = Date.now();
    replaceState(s);
    setStatus('ok', new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    console.warn('sync pull failed', e);
    setStatus('error', String(e.message || e).slice(0, 120));
  }
}

/** Verify credentials before the user commits to them. */
export async function testConnection({ url, anonKey }) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) return { ok: false, error: 'כתובת לא תקינה' };
  try {
    const res = await fetch(`${base}/rest/v1/people?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (res.status === 404) return { ok: false, error: 'הטבלאות לא נוצרו — הריצו את supabase/schema.sql' };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'המפתח נדחה (anon key שגוי או RLS חוסם)' };
    if (!res.ok) return { ok: false, error: `שגיאת שרת ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'אין חיבור לשרת' };
  }
}

export function startAutoSync() {
  if (!cfg()) { setStatus('off'); return; }
  pull();
  window.addEventListener('online', () => { online = true; pull().then(flush); });
  window.addEventListener('offline', () => { online = false; setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  setInterval(() => { if (!document.hidden && navigator.onLine) pull(); }, 60_000);
}

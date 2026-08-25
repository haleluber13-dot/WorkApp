/**
 * store.js — Local-first state.
 *
 * Everything is written to localStorage synchronously so the app is fully
 * usable with no signal (the normal condition on location). When team sync is
 * configured, changes are additionally pushed to Supabase and pulled on
 * reconnect. Conflicts resolve last-write-wins per record via `updatedAt`.
 */

import { newDay, newPerson, newLocation, todayISO, uid } from './model.js';

const KEY = 'workapp.state.v1';

const EMPTY = {
  people: [],
  locations: [],
  days: [],
  settings: {
    productionName: 'ההפקה שלי',
    theme: 'auto',
    navApp: 'waze',          // waze | apple | google
    sync: { url: '', anonKey: '', projectId: '', enabled: false },
  },
  meta: { lastPull: 0, deleted: {} },
};

let state = load();
const listeners = new Set();
const externalListeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    // Merge forward so new settings keys appear for existing installs.
    return {
      ...structuredClone(EMPTY),
      ...parsed,
      settings: { ...EMPTY.settings, ...(parsed.settings || {}),
                  sync: { ...EMPTY.settings.sync, ...((parsed.settings || {}).sync || {}) } },
      meta: { ...EMPTY.meta, ...(parsed.meta || {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('persist failed', e);
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fires only when state is replaced from *outside* the UI — a sync pull or a
 * backup restore. Local edits must not trigger it: repainting the screen while
 * someone is typing destroys the field under their finger. Every local
 * mutation site re-renders explicitly instead.
 */
export function subscribeExternal(fn) {
  externalListeners.add(fn);
  return () => externalListeners.delete(fn);
}

function emit() {
  persist();
  listeners.forEach((fn) => fn(state));
}

/** Mutate state through a function, then persist + notify + queue for sync. */
export function update(mutator, { sync = true } = {}) {
  const touched = mutator(state);
  emit();
  if (sync && state.settings.sync.enabled) {
    import('./sync.js').then((m) => m.pushChanges(touched)).catch(() => {});
  }
  return touched;
}

/** Replace state wholesale (used by sync pull and by import). */
export function replaceState(next) {
  state = next;
  emit();
  externalListeners.forEach((fn) => fn(state));
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export const people = () => state.people;
export const personById = (id) => state.people.find((p) => p.id === id) || null;

export function upsertPerson(partial) {
  return update((s) => {
    const now = Date.now();
    if (partial.id) {
      const i = s.people.findIndex((p) => p.id === partial.id);
      if (i >= 0) {
        s.people[i] = { ...s.people[i], ...partial, updatedAt: now };
        return { table: 'people', rows: [s.people[i]] };
      }
    }
    const p = newPerson({ ...partial, updatedAt: now });
    s.people.push(p);
    return { table: 'people', rows: [p] };
  });
}

export function deletePerson(id) {
  return update((s) => {
    s.people = s.people.filter((p) => p.id !== id);
    s.meta.deleted[id] = Date.now();
    // Unassign from every day so no sheet points at a ghost.
    s.days.forEach((d) => {
      Object.keys(d.slots).forEach((k) => { if (d.slots[k] === id) delete d.slots[k]; });
      delete d.calls[id];
      Object.values(d.vehicles || {}).forEach((v) => { if (v.driverId === id) v.driverId = ''; });
    });
    return { table: 'people', deleted: [id] };
  });
}

/* ------------------------------------------------------------------ *
 * Locations
 * ------------------------------------------------------------------ */

export const locations = () => state.locations;
export const locationById = (id) => state.locations.find((l) => l.id === id) || null;

export function upsertLocation(partial) {
  return update((s) => {
    const now = Date.now();
    if (partial.id) {
      const i = s.locations.findIndex((l) => l.id === partial.id);
      if (i >= 0) {
        s.locations[i] = { ...s.locations[i], ...partial, updatedAt: now };
        return { table: 'locations', rows: [s.locations[i]] };
      }
    }
    const l = newLocation({ ...partial, updatedAt: now });
    s.locations.push(l);
    return { table: 'locations', rows: [l] };
  });
}

export function deleteLocation(id) {
  return update((s) => {
    s.locations = s.locations.filter((l) => l.id !== id);
    s.meta.deleted[id] = Date.now();
    s.days.forEach((d) => { if (d.locationId === id) d.locationId = ''; });
    return { table: 'locations', deleted: [id] };
  });
}

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

export const days = () => [...state.days].sort((a, b) => a.date.localeCompare(b.date));
export const dayById = (id) => state.days.find((d) => d.id === id) || null;
export const dayByDate = (iso) => state.days.find((d) => d.date === iso) || null;

/** The day to show on launch: today if it exists, else the next upcoming, else the last. */
export function currentDay() {
  const iso = todayISO();
  const all = days();
  return all.find((d) => d.date === iso)
      || all.find((d) => d.date > iso)
      || all[all.length - 1]
      || null;
}

export function upsertDay(partial) {
  return update((s) => {
    const now = Date.now();
    if (partial.id) {
      const i = s.days.findIndex((d) => d.id === partial.id);
      if (i >= 0) {
        s.days[i] = { ...s.days[i], ...partial, updatedAt: now };
        return { table: 'days', rows: [s.days[i]] };
      }
    }
    const d = newDay({ ...partial, updatedAt: now });
    s.days.push(d);
    return { table: 'days', rows: [d] };
  });
}

export function deleteDay(id) {
  return update((s) => {
    s.days = s.days.filter((d) => d.id !== id);
    s.meta.deleted[id] = Date.now();
    return { table: 'days', deleted: [id] };
  });
}

/** Patch one field on a day without clobbering concurrent edits elsewhere. */
export function patchDay(id, patch) {
  const d = dayById(id);
  if (!d) return null;
  return upsertDay({ ...d, ...patch });
}

/** Assign a person to a sheet slot on a day (or clear it with personId=''). */
export function assignSlot(dayId, slot, personId) {
  const d = dayById(dayId);
  if (!d) return null;
  const slots = { ...d.slots };
  if (personId) slots[slot] = personId; else delete slots[slot];
  return upsertDay({ ...d, slots });
}

/** Set a per-person call override on a day. */
export function setCall(dayId, personId, patch) {
  const d = dayById(dayId);
  if (!d) return null;
  const calls = { ...d.calls };
  calls[personId] = { time: '', status: 'pending', locationId: '', note: '', ...(calls[personId] || {}), ...patch };
  return upsertDay({ ...d, calls });
}

/* ------------------------------------------------------------------ *
 * Derived: who is on a given day, with resolved call time + location
 * ------------------------------------------------------------------ */

export function rosterFor(day) {
  if (!day) return [];
  const seen = new Map();
  Object.entries(day.slots).forEach(([slot, personId]) => {
    const person = personById(personId);
    if (!person) return;
    if (!seen.has(personId)) seen.set(personId, { person, slots: [], call: null });
    seen.get(personId).slots.push(slot);
  });
  // Drivers assigned on the vehicles sheet also count as being on the day.
  Object.entries(day.vehicles || {}).forEach(([vslot, v]) => {
    if (!v?.driverId) return;
    const person = personById(v.driverId);
    if (!person) return;
    if (!seen.has(v.driverId)) seen.set(v.driverId, { person, slots: [], call: null, vehicles: [] });
    const e = seen.get(v.driverId);
    (e.vehicles ||= []).push(vslot);
  });
  return [...seen.values()].map((e) => {
    const override = day.calls[e.person.id] || {};
    return {
      ...e,
      call: {
        time: override.time || day.generalCall,
        status: override.status || 'pending',
        locationId: override.locationId || day.locationId,
        note: override.note || '',
        isOverride: Boolean(override.time),
      },
    };
  }).sort((a, b) => (a.call.time || '').localeCompare(b.call.time || '')
                 || a.person.name.localeCompare(b.person.name, 'he'));
}

export const settings = () => state.settings;

export function setSettings(patch) {
  return update((s) => {
    s.settings = { ...s.settings, ...patch };
    return { table: 'settings', rows: [] };
  }, { sync: false });
}

export { uid };

/* App state, persistence and undo.

   - settings, tattoos and small UI state → localStorage (read synchronously at boot)
   - designs (may contain large PNG data URLs) and the sketch document → IndexedDB
   Undo covers tattoos and body settings (what you see on the 3D body). */

import { defaultSettings, coerceSetting } from "./settings.js";

const LS_KEY = "inkform.v1";
const DB_NAME = "inkform", DB_STORE = "kv";

/* ── tiny IndexedDB key/value ─────────────────────────────────────────── */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("no indexedDB"));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export const idb = {
  async get(k) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const r = d.transaction(DB_STORE).objectStore(DB_STORE).get(k);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch { return undefined; }
  },
  async set(k, v) {
    try {
      const d = await db();
      await new Promise((res, rej) => {
        const t = d.transaction(DB_STORE, "readwrite");
        t.objectStore(DB_STORE).put(v, k);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    } catch (e) { console.warn("IndexedDB write failed", e); }
  },
  async del(k) {
    try {
      const d = await db();
      await new Promise((res) => { const t = d.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).delete(k); t.oncomplete = res; t.onerror = res; });
    } catch {}
  },
};

export const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const BODY_KEYS = ["sex", "heightCm", "build", "muscle", "shoulders", "chest", "hips", "legLength", "armPose", "detail"];

export class Store extends EventTarget {
  constructor() {
    super();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch {}
    this.settings = { ...defaultSettings(), ...(saved.settings || {}) };
    this.tattoos = Array.isArray(saved.tattoos) ? saved.tattoos : [];
    this.selectedId = saved.selectedId || null;
    this.activeDesignId = saved.activeDesignId || null;
    this.designs = [];
    this.undoStack = []; this.redoStack = [];
    this._saveT = 0;
  }

  async loadDesigns() {
    const d = await idb.get("designs");
    this.designs = Array.isArray(d) ? d : [];
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); }

  /* ── persistence ── */
  save() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.saveNow(), 250);
  }
  saveNow() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: this.settings, tattoos: this.tattoos, selectedId: this.selectedId, activeDesignId: this.activeDesignId,
      }));
    } catch (e) { console.warn("save failed", e); }
  }
  saveDesigns() { return idb.set("designs", this.designs); }

  /* ── settings ── */
  get(key) { return this.settings[key]; }
  set(key, value) {
    const v = coerceSetting(key, value);
    if (this.settings[key] === v) return v;
    this.settings[key] = v;
    this.save();
    this.emit("setting", { key, value: v });
    return v;
  }
  body() {
    const b = {};
    for (const k of BODY_KEYS) b[k] = this.settings["body." + k];
    return b;
  }

  /* ── undo (tattoos + body) ── */
  snapshot() { return JSON.stringify({ tattoos: this.tattoos, body: this.body() }); }
  checkpoint() {
    const s = this.snapshot();
    if (this.undoStack[this.undoStack.length - 1] === s) return false;
    this.undoStack.push(s);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    return true;
  }
  _restore(s) {
    const o = JSON.parse(s);
    this.tattoos = o.tattoos;
    let bodyChanged = false;
    for (const k of BODY_KEYS) {
      if (this.settings["body." + k] !== o.body[k]) { this.settings["body." + k] = o.body[k]; bodyChanged = true; }
    }
    if (!this.tattoos.some((t) => t.id === this.selectedId)) this.selectedId = null;
    this.save();
    this.emit("restore", { bodyChanged });
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.snapshot());
    this._restore(this.undoStack.pop());
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.snapshot());
    this._restore(this.redoStack.pop());
    return true;
  }

  /* ── designs ── */
  design(id) { return this.designs.find((d) => d.id === id); }
  addDesign(d) {
    this.designs.unshift(d);
    if (this.designs.length > 300) this.designs.length = 300;
    this.activeDesignId = d.id;
    this.saveDesigns(); this.save();
    this.emit("designs");
    return d;
  }
  updateDesign(id, patch) {
    const d = this.design(id);
    if (!d) return null;
    Object.assign(d, patch);
    this.saveDesigns();
    this.emit("designs", { changed: id });
    return d;
  }
  removeDesign(id) {
    this.designs = this.designs.filter((d) => d.id !== id);
    if (this.activeDesignId === id) this.activeDesignId = this.designs[0]?.id || null;
    this.saveDesigns(); this.save();
    this.emit("designs");
  }

  /* ── tattoos ── */
  tattoo(id) {
    if (id === "selected" || id == null) id = this.selectedId || this.tattoos[this.tattoos.length - 1]?.id;
    return this.tattoos.find((t) => t.id === id);
  }
}

/* Project file: everything needed to restore a session elsewhere. */
export async function exportProject(store, sketchState) {
  return {
    app: "InkForm 3D", version: 1, exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(Object.entries(store.settings).filter(([k]) => k !== "ai.apiKey")),
    tattoos: store.tattoos, designs: store.designs, sketch: sketchState || null,
  };
}

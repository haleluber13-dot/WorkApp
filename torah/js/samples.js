/* Otiyot — samples.
 *
 * Records from the microphone, takes audio files off the device, keeps both in
 * IndexedDB so they survive a reload, and hands decoded buffers to the synth.
 * Nothing leaves the browser: recordings are stored locally and are never
 * uploaded anywhere.
 */

const DB_NAME = 'otiyot';
const DB_VERSION = 1;
const STORE = 'samples';

export const PAD_COUNT = 8;

/** A pad is one sample plus how and when it fires. */
export function emptyPad(i) {
  return {
    id: `pad${i}`,
    sampleId: null,
    name: '',
    on: true,
    pattern: i === 0 ? 'x...............' : '................',
    gain: 0.9,
    rate: 1,          // playback speed, doubles as pitch
    start: 0,         // seconds into the clip
    reverse: false,
    oneShot: true,    // false = let it run past the next trigger
  };
}

export const defaultPads = () =>
  Array.from({ length: PAD_COUNT }, (_, i) => emptyPad(i));

/* ------------------------------------------------------------------- store */

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export class SampleBank {
  constructor() {
    this.db = null;
    this.meta = [];                  // {id, name, type, size, dur, created}
    this.buffers = new Map();        // id -> AudioBuffer, for the live context
    this.available = typeof indexedDB !== 'undefined';
  }

  async init() {
    if (!this.available) return this;
    try {
      this.db = await open();
      const all = await tx(this.db, 'readonly', st => st.getAll());
      this.meta = (all || []).map(({ blob, ...rest }) => rest)
        .sort((a, b) => a.created - b.created);
    } catch (err) {
      // Private windows and blocked storage both land here; the app still runs,
      // samples just will not persist between visits.
      console.warn('Samples cannot be stored in this browser:', err);
      this.available = false;
    }
    return this;
  }

  /** Store a clip and decode it. Returns its metadata entry. */
  async add(blob, name, ctx) {
    const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let buffer = null;
    try {
      buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch (err) {
      throw new Error('That file is not audio this browser can decode.');
    }
    const entry = {
      id, name: name || 'clip', type: blob.type || 'audio/webm',
      size: blob.size, dur: buffer.duration, created: Date.now(),
    };
    this.buffers.set(id, buffer);
    this.meta.push(entry);
    if (this.db) {
      try { await tx(this.db, 'readwrite', st => st.put({ ...entry, blob })); }
      catch (err) { console.warn('Could not save the clip:', err); }
    }
    return entry;
  }

  async remove(id) {
    this.meta = this.meta.filter(m => m.id !== id);
    this.buffers.delete(id);
    if (this.db) {
      try { await tx(this.db, 'readwrite', st => st.delete(id)); } catch (_) { /* gone */ }
    }
  }

  async rename(id, name) {
    const m = this.meta.find(x => x.id === id);
    if (!m) return;
    m.name = name;
    if (this.db) {
      const rec = await tx(this.db, 'readonly', st => st.get(id));
      if (rec) { rec.name = name; await tx(this.db, 'readwrite', st => st.put(rec)); }
    }
  }

  /** Decode everything into the given context — used for the live graph and
   *  again, separately, for an offline render. */
  async decodeAll(ctx, into = this.buffers) {
    if (!this.db) return into;
    for (const m of this.meta) {
      if (into.has(m.id)) continue;
      try {
        const rec = await tx(this.db, 'readonly', st => st.get(m.id));
        if (rec?.blob) into.set(m.id, await ctx.decodeAudioData(await rec.blob.arrayBuffer()));
      } catch (err) {
        console.warn('Could not decode', m.name, err);
      }
    }
    return into;
  }

  get(id) { return this.buffers.get(id) || null; }
  info(id) { return this.meta.find(m => m.id === id) || null; }
}

/* ---------------------------------------------------------------- recorder */

/** Microphone capture. On a phone this is the "record" button. */
export class Recorder {
  constructor() {
    this.rec = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
  }

  static get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  /** Pick a container this browser will actually produce. */
  static mime() {
    const want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return want.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  }

  async start() {
    if (!Recorder.supported) throw new Error('This browser cannot record audio.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const type = Recorder.mime();
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.startedAt = Date.now();
  }

  get elapsed() { return this.rec ? (Date.now() - this.startedAt) / 1000 : 0; }
  get active() { return this.rec?.state === 'recording'; }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new Error('Not recording.'));
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
        this.stream.getTracks().forEach(t => t.stop());
        this.rec = null;
        this.stream = null;
        resolve(blob);
      };
      this.rec.stop();
    });
  }

  cancel() {
    try { this.rec?.stop(); } catch (_) { /* not running */ }
    this.stream?.getTracks().forEach(t => t.stop());
    this.rec = null;
    this.stream = null;
  }
}

/** Reverse a buffer, for pads with reverse switched on. */
export function reverseBuffer(ctx, buf) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return out;
}

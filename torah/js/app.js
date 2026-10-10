/* Otiyot — the app. Wires the text, the mapping, the synth and the screen. */

import * as data from './data.js';
import {
  LETTERS, LETTER_INFO, MODES, MAPPINGS, RHYTHMS, TROPE,
  sequence, analyse, letterMidi, midiToName, gematria, degreeToMidi, clustersOf,
} from './mapping.js';
import { STYLES, STYLE_LIST, bpmRange } from './styles.js';
import { Transport, render } from './audio.js';
import { toWav, toMidi, download } from './export.js';
import { defaultFx, fxFromStyle } from './fx.js';
import { SampleBank, Recorder, defaultPads } from './samples.js';
import * as lyrics from './lyrics.js';
import { VOWELS, translit, colour } from './niqqud.js';
import { mount } from './panes.js';
import { Narrator, CHARACTERS } from './voice.js';
import { REGISTERS, speakLength } from './vocal.js';

const $ = id => document.getElementById(id);

/* Above this many letters we stop drawing the whole selection into the DOM and
 * render a moving window of verses instead — the whole Torah is 300,000+
 * letters and no browser wants that many spans at once. */
const READER_WINDOW = 60;      // verses rendered around the playhead
const BIG_SELECTION = 40000;   // letters — beyond this we warn before building
const WAV_LIMIT = 15 * 60;     // seconds of audio — beyond this the WAV is too big to hold in a tab

/* The voice that is always there, whatever the device has installed. */
const BUILTIN = '__builtin__';

const state = {
  manifest: null,
  book: null,
  verses: [],
  score: null,
  stats: null,
  windowStart: -1,
  litQueue: [],
  noteVerse: 0,
  view: 'roll',
  sel: { scope: 'chapter', bookId: 'genesis', chapter: 1, verse: 1, count: 8 },
  opt: {
    style: 'scroll',
    mapping: 'yetzirah', mode: 'ahavaRabbah', root: 57, bpm: 132,
    rhythm: 'even', snapSimples: true, bass: true, pad: true, percussion: true,
    showPoints: true,
    vowels: { pitch: true, length: true, accent: true },
    mix: {},          // per-track {gain, mute, solo}
    patterns: {},     // edits to the style's drum patterns
    groove: '',       // a beat preset laid over the style, or '' for its own
    kickVoice: null,  // null = whichever kick the style names
    bassVoice: null,
    leadVoice: null,
    vocal: { type: 'tenor', vibrato: 0.5, breath: 0.35 },
    noteEdits: {},    // "book:ch:v:word:letter" -> {semi, len, vel, mute}
    pads: defaultPads(),
  },
  fx: defaultFx(),
  lyrics: { text: '', barsPerLine: 1, offsetBars: 0 },
  theme: 'dark',
  themeExplicit: false,   // true once the reader picks one themselves
  narration: {
    on: false,
    mode: 'follow',       // 'follow' the music, or 'book' at its own pace
    source: 'hebrew',     // 'hebrew' | 'translit' | a translation code
    lang: '', voiceName: BUILTIN,
    register: 'neutral',  // who is reading, when it is the built-in voice
    rate: 1, pitch: 1, volume: 1,
    character: 'plain',
    duck: true,
    verseIndex: 0,        // where the audiobook has got to
  },
};

const narrator = new Narrator();
let builtinTimer = null;
let translationList = [];
let translation = null;      // the loaded translation, if the source is one
let spokenVerse = -1;        // the verse the narrator last started

const bank = new SampleBank();
const recorder = new Recorder();
let panes = null;
let laidCache = null;

const transport = new Transport();

/* ------------------------------------------------------------------- setup */

async function boot() {
  try {
    state.manifest = await data.loadManifest();
  } catch (err) {
    $('loadMsg').textContent = 'Could not load the text. Serve this folder over http:// rather than opening the file directly.';
    console.error(err);
    return;
  }

  loadProject();
  applyTheme(state.theme);
  await bank.init();
  await setupNarrator();

  buildStyleSel();
  buildBookSel();
  buildModeSel();
  buildRootSel();
  buildChoices();
  await buildChapSel();
  syncBpm();
  transport.fx = state.fx;
  transport.buffers = bank.buffers;
  transport.settings.vocal = state.opt.vocal;
  panes = mount(appApi);
  wire();

  const t = state.manifest.totals;
  $('aboutCounts').textContent =
    `${t.letters.toLocaleString()} letters in ${t.words.toLocaleString()} words across ${t.verses.toLocaleString()} verses`;

  await rebuild();
  panes.renderAll();

  $('loading').classList.add('gone');
  setTimeout(() => $('loading').remove(), 500);
}

function buildStyleSel() {
  $('styleSel').innerHTML = STYLE_LIST
    .map(x => `<option value="${x.id}">${x.name}</option>`).join('');
  $('styleSel').value = state.opt.style;
  buildStyleChoices();
}

function buildStyleChoices() {
  $('styleChoices').innerHTML = STYLE_LIST.map(x => `
    <button class="choice${x.id === state.opt.style ? ' on' : ''}" data-style="${x.id}">
      <b>${x.name}</b><small>${x.blurb}</small>
    </button>`).join('');
  const st = STYLES[state.opt.style];
  $('styleHint').textContent = st.free
    ? 'No drums — the letters set their own pace.'
    : `Letters land on ${st.grid === 4 ? 'sixteenths' : st.grid === 2 ? 'eighths' : 'the beat'}, ` +
      `${st.per} step${st.per === 1 ? '' : 's'} each.`;
  // The layer switches mean different things once a kit is running.
  $('percLabel').innerHTML = st.kit
    ? `Drums<small>Kick, snare, hats and percussion.</small>`
    : `A breath between words<small>And a drum at the end of each verse.</small>`;
  $('bassLabel').innerHTML = st.free || st.bass === 'sustain'
    ? `Bass on every word<small>Rooted in that word's gematria.</small>`
    : st.bass === 'sub'
      ? `808 sub<small>One gliding note per word, from its gematria.</small>`
      : `Rolling bass<small>Offbeat sixteenths on each word's root.</small>`;
}

/** Point the BPM controls at the range this style actually lives in. */
function syncBpm() {
  const r = bpmRange(state.opt.style);
  const bpm = Math.min(r.max, Math.max(r.min, state.opt.bpm));
  state.opt.bpm = bpm;
  const slider = $('bpm'), num = $('bpmNum');
  slider.min = r.min; slider.max = r.max; slider.value = bpm;
  num.value = bpm;
}

function buildBookSel() {
  const sel = $('bookSel');
  sel.innerHTML = state.manifest.books
    .map(b => `<option value="${b.id}">${b.he} · ${b.en}</option>`).join('');
  sel.value = state.sel.bookId;
}

async function buildChapSel() {
  const book = await data.loadBook(state.sel.bookId);
  state.book = book;
  const sel = $('chapSel');
  sel.innerHTML = book.chapters
    .map((_, i) => `<option value="${i + 1}">ch ${i + 1}</option>`).join('');
  sel.value = Math.min(state.sel.chapter, book.chapters.length);
  state.sel.chapter = +sel.value;
  buildVerseSel();
}

function buildVerseSel() {
  const sel = $('verseSel');
  const n = state.book.chapters[state.sel.chapter - 1].length;
  sel.innerHTML = Array.from({ length: n },
    (_, i) => `<option value="${i + 1}">v ${i + 1}</option>`).join('');
  sel.value = Math.min(state.sel.verse, n);
  state.sel.verse = +sel.value;
  const perVerse = state.sel.scope === 'verse' || state.sel.scope === 'run';
  sel.hidden = !perVerse;
  $('chapSel').hidden = state.sel.scope === 'book' || state.sel.scope === 'torah';
}

function buildModeSel() {
  $('modeSel').innerHTML = Object.entries(MODES)
    .map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
  $('modeSel').value = state.opt.mode;
  $('modeHint').textContent = MODES[state.opt.mode].note;
}

function buildRootSel() {
  const opts = [];
  for (let m = 45; m <= 64; m++) opts.push(`<option value="${m}">${midiToName(m)}</option>`);
  $('rootSel').innerHTML = opts.join('');
  $('rootSel').value = state.opt.root;
}

function buildChoices() {
  $('mapChoices').innerHTML = Object.entries(MAPPINGS).map(([k, m]) => `
    <button class="choice${k === state.opt.mapping ? ' on' : ''}" data-map="${k}">
      <b>${m.name}</b><small>${m.blurb}</small>
    </button>`).join('');

  $('rhythmChoices').innerHTML = Object.entries(RHYTHMS).map(([k, r]) => `
    <button class="choice${k === state.opt.rhythm ? ' on' : ''}" data-rhythm="${k}">
      <b>${r.name}</b><small>${r.blurb}</small>
    </button>`).join('');
}

/* ------------------------------------------------------------ build a score */

let building = false;

async function rebuild(keepPosition = false) {
  if (building) return;
  building = true;
  const was = transport.playing;
  const at = keepPosition ? transport.position : 0;
  transport.stop();

  try {
    state.verses = await data.select(state.sel);
  } catch (err) {
    console.error(err);
    warn('Could not load that selection.');
    building = false;
    return;
  }

  const letters = data.countLetters(state.verses);
  if (letters > BIG_SELECTION) {
    warn(`${letters.toLocaleString()} letters — building the score may take a moment, and the text pane will follow the music rather than showing everything at once.`);
  } else {
    warn(null);
  }

  // Let the warning paint before the (synchronous) sequencing blocks the thread.
  await new Promise(r => requestAnimationFrame(r));

  state.score = sequence(state.verses, state.opt);
  state.stats = analyse(state.score);
  laidCache = null;
  transport.load(state.score);
  state.windowStart = -1;
  state.litQueue = [];

  renderReader(0, true);
  renderStats();
  renderLetterPane();
  updateScopeStat();
  panes?.renderLyrics();
  if (state.view === 'notes') panes?.renderNotes();
  saveProject();

  $('tEnd').textContent = clock(state.score.duration);
  $('seek').value = 0;
  $('tNow').textContent = '0:00';
  const tooLong = state.score.duration > WAV_LIMIT;
  $('btnWav').disabled = tooLong;
  $('exportHint').textContent = tooLong
    ? `This selection runs ${clock(state.score.duration)} — too much to render to WAV in a browser tab. MIDI still holds all of it; pick a shorter passage for audio.`
    : `MIDI holds the whole selection, however long. WAV is rendered here in the browser: about ${wavSize(state.score.duration)} and roughly ${Math.max(1, Math.round(state.score.duration / 22))}s to render.`;

  building = false;
  if (keepPosition && at) transport.seek(Math.min(at, state.score.duration));
  if (was) transport.play();
}

/** Put every control back in step with `state` after a setup is loaded. */
async function afterProjectLoad() {
  applyTheme(state.theme);
  $('styleSel').value = state.opt.style;
  $('bookSel').value = state.sel.bookId;
  $('scopeSel').value = state.sel.scope;
  $('modeSel').value = state.opt.mode;
  $('rootSel').value = state.opt.root;
  $('snapChk').checked = state.opt.snapSimples;
  $('bassChk').checked = state.opt.bass;
  $('padChk').checked = state.opt.pad;
  $('percChk').checked = state.opt.percussion;
  $('pointsChk').checked = state.opt.showPoints !== false;
  $('vowPitchChk').checked = state.opt.vowels.pitch;
  $('vowLenChk').checked = state.opt.vowels.length;
  $('vowAccChk').checked = state.opt.vowels.accent;
  $('verb').value = Math.round((state.fx.reverb?.mix ?? 0.3) * 100);
  buildStyleChoices();
  buildChoices();
  await buildChapSel();
  syncBpm();
  appApi.applyFx();
  laidCache = null;
  await rebuild();
  panes?.renderAll();
}

function warn(msg) {
  const el = $('warn');
  el.hidden = !msg;
  if (msg) el.textContent = msg;
}

function updateScopeStat() {
  const v = state.verses.length;
  const w = data.countWords(state.verses);
  const l = data.countLetters(state.verses);
  const lpm = state.score.duration > 0 ? Math.round(l / (state.score.duration / 60)) : 0;
  $('scopeStat').textContent =
    `${l.toLocaleString()} letters · ${state.opt.bpm} BPM · ${lpm.toLocaleString()} letters/min · ${clock(state.score.duration)}`;
  $('readerMeta').textContent = `${v.toLocaleString()} verse${v === 1 ? '' : 's'}`;
  const first = state.verses[0];
  $('readerTitle').textContent = first
    ? (state.sel.scope === 'torah' ? 'תורה' : `${first.bookHe} ${first.chapter}`)
    : '';
}

/* ------------------------------------------------------------- the reader */

const letterEls = new Map();   // "vi:wi:li" -> span

function renderReader(centerVerse, force = false) {
  const showPoints = state.opt.showPoints !== false;
  const total = state.verses.length;
  const windowed = total > READER_WINDOW;
  const start = windowed
    ? Math.max(0, Math.min(centerVerse - 8, total - READER_WINDOW))
    : 0;
  if (!force && windowed && start === state.windowStart) return;
  if (!force && !windowed && state.windowStart === 0) return;

  state.windowStart = start;
  const end = windowed ? Math.min(total, start + READER_WINDOW) : total;

  const parts = [];
  for (let vi = start; vi < end; vi++) {
    const v = state.verses[vi];
    parts.push(`<div class="v" data-v="${vi}">`);
    for (let wi = 0; wi < v.words.length; wi++) {
      const w = v.words[wi];
      const cl = clustersOf(w);
      // A letter and its points are one unit: they light up together and the
      // marks must never be split off into a span of their own.
      parts.push(`<span class="w" data-v="${vi}" data-w="${wi}" title="${translit(w)}">`);
      for (let li = 0; li < cl.length; li++) {
        const c = cl[li];
        const cls = LETTER_INFO.get(c.base)?.cls || '';
        const text = showPoints ? c.letter + c.marks.join('') : c.letter;
        parts.push(`<span class="c ${cls}" data-k="${vi}:${wi}:${li}">${text}</span>`);
      }
      parts.push('</span>');
    }
    parts.push(`<span class="v__n">${v.chapter}:${v.verse}</span></div>`);
  }

  const reader = $('reader');
  reader.innerHTML = parts.join('');
  letterEls.clear();
  for (const el of reader.querySelectorAll('.c')) letterEls.set(el.dataset.k, el);
  state.litQueue = [];
  lastWordEl = null;
}

/* Walk the index alongside the playhead and light each letter as it sounds. */
let idxPtr = 0;

function updateHighlight(now) {
  const idx = state.score.index;
  if (!idx.length) return;

  if (idxPtr > 0 && idx[idxPtr - 1].t > now) idxPtr = 0;       // seeked backwards
  while (idxPtr < idx.length && idx[idxPtr].t <= now) {
    const e = idx[idxPtr++];
    renderReader(e.verseIndex);
    const el = letterEls.get(`${e.verseIndex}:${e.wordIndex}:${e.letterIndex}`);
    if (el) {
      // Hold each letter until the next one lights, so the spotlight glides
      // along the line instead of blinking off between notes.
      const next = idx[idxPtr];
      el.classList.add('lit');
      state.litQueue.push({ el, until: (next ? next.t : now + 0.5) + 0.14 });
      const word = el.parentElement;
      if (word !== lastWordEl) {
        lastWordEl?.classList.remove('on');
        word.classList.add('on');
        lastWordEl = word;
        scrollIntoView(word);
      }
    }
  }

  while (state.litQueue.length && state.litQueue[0].until < now) {
    state.litQueue.shift().el.classList.remove('lit');
  }
}

let lastWordEl = null;
let lastScroll = 0;

function scrollIntoView(el) {
  const box = $('reader');
  const now = performance.now();
  if (now - lastScroll < 220) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top + 40 || r.bottom > b.bottom - 40) {
    box.scrollTop += (r.top - b.top) - box.clientHeight * 0.38;
    lastScroll = now;
  }
}

/* --------------------------------------------------------------- the roll */

const roll = $('roll');
const rollCtx = roll.getContext('2d');
const spectrum = $('spectrum');
const specCtx = spectrum.getContext('2d');

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return { w, h };
}

const CLS_TOKEN = { mother: '--mother', double: '--double', simple: '--simple' };
const BASS_VOICES = new Set(['bass', 'subbass', 'rollbass']);

/* Four lanes at the foot of the roll, kick nearest the bottom. */
const DRUM_LANE = {
  kick_psy: 0, kick_808: 0, kick_punch: 0, kick_soft: 0, kick_dist: 0, tav: 0,
  snare: 1, clap: 1,
  hat: 2, ohat: 2,
  perc: 3, tick: 3,
};
const DRUM_TOKEN = {
  kick_psy: '--mother', kick_808: '--mother', kick_punch: '--mother',
  kick_soft: '--mother', kick_dist: '--warn-ink', tav: '--gold',
  snare: '--dim', clap: '--dim', sample: '--simple',
  hat: '--double', ohat: '--double',
  perc: '--faint', tick: '--faint',
};
const WINDOW_SEC = 9;

function drawRoll(now) {
  const { w, h } = fit(roll);
  const g = rollCtx;
  g.clearRect(0, 0, w, h);
  if (!state.score) return;

  const notes = state.score.notes;
  const t0 = now - WINDOW_SEC * 0.34;
  const t1 = now + WINDOW_SEC * 0.66;
  const x = t => (t - t0) / (t1 - t0) * w;

  const lead = state.stats;
  const lo = (lead?.low ?? 48) - 4;
  const hi = (lead?.high ?? 84) + 4;
  const y = m => h - 14 - (m - lo) / Math.max(1, hi - lo) * (h - 28);

  // Faint horizontal rules on the tonic of each octave.
  g.strokeStyle = paint.get('--line');
  g.lineWidth = 1;
  for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) {
    g.beginPath();
    g.moveTo(0, Math.round(y(m)) + .5);
    g.lineTo(w, Math.round(y(m)) + .5);
    g.stroke();
  }

  let i = lowerBound(notes, t0 - 6);
  // (drum notes carry midi 0 and are drawn in their own lanes, below)
  for (; i < notes.length; i++) {
    const n = notes[i];
    if (n.t > t1) break;
    if (n.t + n.dur < t0) continue;

    const nx = x(n.t);
    const nw = Math.max(2.5, x(n.t + n.dur) - nx - 1);
    const active = n.t <= now && now <= n.t + n.dur;

    if (n.voice === 'pad') {
      g.fillStyle = paint.get('--bass');
      g.globalAlpha = active ? 0.28 : 0.14;
      g.fillRect(nx, y(n.midi) - 3, nw, 6);
      g.globalAlpha = 1;
    } else if (BASS_VOICES.has(n.voice)) {
      g.fillStyle = paint.get('--bass');
      g.globalAlpha = active ? 1 : 0.6;
      round(g, nx, y(n.midi) - 3, nw, 6, 3);
      g.globalAlpha = 1;
    } else if (n.drum || n.voice === 'tick' || n.voice === 'tav') {
      // Drums get their own lanes along the bottom, loudest at the back.
      const lane = n.voice === 'sample' ? 4 : (DRUM_LANE[n.voice] ?? 3);
      const ly = h - 6 - lane * 5;
      g.fillStyle = paint.get(DRUM_TOKEN[n.voice] || '--faint');
      g.globalAlpha = active ? 1 : 0.55;
      g.fillRect(nx, ly, Math.max(2, Math.min(nw, 7)), 4);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = paint.get(CLS_TOKEN[n.cls] || '--gold');
      g.globalAlpha = active ? 1 : 0.62;
      round(g, nx, y(n.midi) - 4, nw, 8, 3.5);
      if (active) {
        g.globalAlpha = 0.3;
        g.fillRect(nx - 3, y(n.midi) - 9, nw + 6, 18);
      }
      g.globalAlpha = 1;
    }
  }

  // Playhead.
  const px = Math.round(x(now)) + .5;
  g.strokeStyle = paint.get('--gold');
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke();
}

function round(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, rr) : g.rect(x, y, w, h);
  g.fill();
}

/** First index whose note starts at or after t (notes are sorted by t). */
function lowerBound(notes, t) {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function drawSpectrum() {
  const { w, h } = fit(spectrum);
  const g = specCtx;
  g.clearRect(0, 0, w, h);
  const an = transport.voices?.analyser;
  if (!an) {
    g.fillStyle = paint.get('--faint');
    g.font = '13px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('Press play to see the sound.', w / 2, h / 2);
    return;
  }
  const bins = new Uint8Array(an.frequencyBinCount);
  an.getByteFrequencyData(bins);

  const bars = 96;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    // Log spacing so the low end is not squashed into two pixels.
    const f = Math.pow(i / bars, 2.1);
    const b = Math.min(bins.length - 1, Math.floor(f * bins.length * 0.62));
    const v = bins[b] / 255;
    const bh = Math.max(1, v * (h - 16));
    const grad = g.createLinearGradient(0, h - bh, 0, h);
    grad.addColorStop(0, paint.get('--gold'));
    grad.addColorStop(1, paint.get('--gold-dim'));
    g.fillStyle = grad;
    g.fillRect(i * bw + 1, h - bh - 6, bw - 2, bh);
  }
}

/* --------------------------------------------------------------- the panes */

function renderStats() {
  const s = state.stats;
  if (!s) return;
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const maxPc = Math.max(1, ...s.pitchClass);
  const letters = data.countLetters(state.verses);
  const isTrope = state.opt.mapping === 'trope';

  const pcBars = s.pitchClass.map((n, i) => n === 0 ? '' : `
    <div class="bar"><span class="bar__k">${names[i]}</span>
      <div class="bar__t"><div class="bar__f" style="width:${n / maxPc * 100}%"></div></div>
      <span class="bar__v">${(n / s.count * 100).toFixed(1)}%</span></div>`).join('');

  const maxL = s.topLetters.length ? s.topLetters[0][1] : 1;
  const lBars = s.topLetters.slice(0, 10).map(([l, n]) => {
    const midi = letterMidi(l, state.opt);
    return `<div class="bar">
      <span class="bar__k" style="font-size:17px">${l}<small style="color:var(--gold);font-size:10px;margin-inline-start:5px">${midi != null ? midiToName(midi) : ''}</small></span>
      <div class="bar__t"><div class="bar__f" style="width:${n / maxL * 100}%"></div></div>
      <span class="bar__v">${n.toLocaleString()}</span></div>`;
  }).join('');

  const ivNames = { 0: 'same note', 1: 'semitone up', '-1': 'semitone down', 2: 'tone up',
    '-2': 'tone down', 3: 'minor 3rd up', '-3': 'minor 3rd down', 4: 'major 3rd up',
    '-4': 'major 3rd down', 5: '4th up', '-5': '4th down', 7: '5th up', '-7': '5th down',
    12: 'octave up', '-12': 'octave down' };
  const maxIv = s.topIntervals.length ? s.topIntervals[0][1] : 1;
  const ivBars = s.topIntervals.map(([iv, n]) => `
    <div class="bar"><span class="bar__k" style="width:auto">${ivNames[iv] || (iv > 0 ? `+${iv}` : iv)}</span>
      <div class="bar__t"><div class="bar__f" style="width:${n / maxIv * 100}%"></div></div>
      <span class="bar__v">${n.toLocaleString()}</span></div>`).join('');

  $('stats').innerHTML = `
    <div class="statgrid">
      <div class="card"><b>${letters.toLocaleString()}</b><span>letters read</span></div>
      <div class="card"><b>${s.count.toLocaleString()}</b><span>melody notes</span></div>
      <div class="card"><b>${s.total.toLocaleString()}</b><span>notes in all</span></div>
      <div class="card"><b>${clock(state.score.duration)}</b><span>playing time</span></div>
      <div class="card"><b>${state.opt.bpm}</b><span>BPM · ${state.score.styleName}</span></div>
      <div class="card"><b>${s.low != null ? midiToName(s.low) : '—'}–${s.high != null ? midiToName(s.high) : '—'}</b><span>range</span></div>
      <div class="card"><b>${(s.unisonShare * 100).toFixed(0)}%</b><span>repeated notes</span></div>
    </div>

    <h3 class="sec">Which notes the text lands on</h3>
    <div class="bars">${pcBars}</div>
    <p class="note">${MODES[state.opt.mode].name} on ${midiToName(state.opt.root)}. The shape of this chart is the shape of Hebrew itself — it is letter frequency, heard as pitch.</p>

    <h3 class="sec">${isTrope ? 'Letters under the accents' : 'The letters doing the most singing'}</h3>
    <div class="bars">${lBars}</div>
    ${isTrope ? '' : `<p class="note">Yod, He, Vav, Mem, Alef and Lamed carry most of the text, so their notes become the tonal centre of the piece whether you want them to or not.</p>`}

    <h3 class="sec">Most common moves between notes</h3>
    <div class="bars">${ivBars}</div>`;
}

function renderLetterPane() {
  if (state.opt.mapping === 'trope') {
    const steps = MODES[state.opt.mode].steps;
    const rows = TROPE.map(t => {
      const notes = t.deg.map(d => midiToName(degreeToMidi(state.opt.root, steps, d))).join(' ');
      return `<div class="lcell ${t.d ? 'mother' : 'simple'}" style="grid-template-columns:1fr">
        <div class="lcell__m">
          <div class="lcell__n">${t.he} <span style="color:var(--faint);font-size:11px">${t.key}</span></div>
          <div class="lcell__p" style="font-size:11.5px">${notes}</div>
          <div class="lcell__s">${t.d ? 'pauses the phrase' : 'leans forward'}</div>
        </div></div>`;
    }).join('');
    $('letters').innerHTML = `
      <div class="legend">
        <span><i style="background:var(--mother)"></i>disjunctive — a stop</span>
        <span><i style="background:var(--simple)"></i>conjunctive — a link</span>
      </div>
      <div class="ltab">${rows}</div>
      <p class="note">These are the accent marks written above and below the letters. Each one is a small melodic figure; strung together they punctuate the verse the way commas and full stops would. The shapes here are a plain approximation of the Ashkenazi Torah chant.</p>`;
    return;
  }

  const rows = LETTERS.map(x => {
    const midi = letterMidi(x.l, state.opt);
    return `<div class="lcell ${x.cls}">
      <div class="lcell__l">${x.l}</div>
      <div class="lcell__m">
        <div class="lcell__n">${x.name} <span style="color:var(--faint)">${x.v}</span></div>
        <div class="lcell__p">${midi != null ? midiToName(midi) : '—'}</div>
        <div class="lcell__s">${x.assoc}</div>
      </div></div>`;
  }).join('');

  const LEN_NAME = { long: 'long', short: 'short', ultra: 'barely there' };
  const vowRows = Object.entries(VOWELS).map(([mark, v]) => `
    <div class="vcell">
      <div class="vcell__m">א<span class="vcell__p">${mark}</span></div>
      <div class="lcell__m">
        <div class="lcell__n">${v.he}</div>
        <div class="lcell__p">${v.tr} · ${v.q === 'ə' ? 'murmur' : v.q}
          ${VOWEL_ARROW[v.q] ?? ''}</div>
        <div class="lcell__s">${LEN_NAME[v.len]}</div>
      </div>
    </div>`).join('');

  $('letters').innerHTML = `
    <div class="legend">
      <span><i style="background:var(--mother)"></i>3 mothers</span>
      <span><i style="background:var(--double)"></i>7 doubles</span>
      <span><i style="background:var(--simple)"></i>12 simples</span>
    </div>
    <div class="ltab">${rows}</div>
    <p class="note">The number beside each name is its gematria value; the line beneath is what the Sefer Yetzirah assigns it. The pitch is what that letter sounds like right now, under ${MAPPINGS[state.opt.mapping].name} in ${MODES[state.opt.mode].name}.</p>

    <h3 class="sec">The points</h3>
    <p class="note" style="margin-top:0">A letter alone does not say how it is pronounced — the points do. Each one bends its letter's note and sets how long it is held. The arrow is the pitch shift, in degrees of the mode.</p>
    <div class="ltab">${vowRows}</div>`;
}

/* ------------------------------------------------------------------- loop */

function frame() {
  const now = transport.position;
  if (state.view === 'roll') drawRoll(now);
  else if (state.view === 'spectrum') drawSpectrum();

  panes?.updateKaraoke(now);
  narrationTick();

  if (transport.playing) {
    updateHighlight(now);
    $('tNow').textContent = clock(now);
    const d = state.score?.duration || 1;
    $('seek').value = Math.round(now / d * 1000);
  }
  requestAnimationFrame(frame);
}

/** Uncompressed stereo 16-bit at 44.1 kHz — about 10 MB a minute. */
const wavSize = sec => {
  const mb = sec * 44100 * 2 * 2 / 1048576;
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

const clock = s => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
           : `${m}:${String(ss).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------- wiring */

function wire() {
  $('bookSel').addEventListener('change', async e => {
    state.sel.bookId = e.target.value;
    state.sel.chapter = 1;
    state.sel.verse = 1;
    await buildChapSel();
    rebuild();
  });

  $('chapSel').addEventListener('change', e => {
    state.sel.chapter = +e.target.value;
    state.sel.verse = 1;
    buildVerseSel();
    rebuild();
  });

  $('verseSel').addEventListener('change', e => {
    state.sel.verse = +e.target.value;
    rebuild();
  });

  $('scopeSel').addEventListener('change', e => {
    state.sel.scope = e.target.value;
    state.sel.count = e.target.value === 'run' ? 8 : 1;
    buildVerseSel();
    rebuild();
  });

  $('btnPlay').addEventListener('click', async () => {
    if (transport.playing) { transport.pause(); setPlayIcon(false); }
    else { await transport.play(); setPlayIcon(true); }
  });
  transport.onEnd = () => {
    setPlayIcon(false);
    if (state.narration.mode === 'follow') { hushVoice(); duck(false); }
  };

  $('seek').addEventListener('input', e => {
    const d = state.score?.duration || 0;
    const t = +e.target.value / 1000 * d;
    $('tNow').textContent = clock(t);
    transport.seek(t);
    idxPtr = 0;
    clearLit();
    if (state.verses.length) {
      const near = state.score.index.find(x => x.t >= t);
      renderReader(near ? near.verseIndex : 0, true);
    }
  });

  $('reader').addEventListener('click', e => {
    const w = e.target.closest('.w');
    if (!w) return;
    const vi = +w.dataset.v, wi = +w.dataset.w;
    const hit = state.score.index.find(x => x.verseIndex === vi && x.wordIndex === wi);
    if (!hit) return;
    transport.seek(hit.t);
    idxPtr = 0;
    clearLit();
    if (!transport.playing) { transport.play(); setPlayIcon(true); }
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === tab));
      state.view = tab.dataset.view;
      for (const el of document.querySelectorAll('[data-view]')) {
        if (el.classList.contains('tab')) continue;
        el.hidden = el.dataset.view !== state.view;
      }
      if (state.view === 'beat') panes?.renderBeat();
      if (state.view === 'samples') panes?.renderSamples();
      if (state.view === 'lyrics') panes?.renderLyrics();
      if (state.view === 'fx') panes?.renderFx();
      if (state.view === 'notes') panes?.renderNotes();
      if (state.view === 'voice') panes?.renderVoice();
    });
  }

  const setStyle = id => {
    if (!STYLES[id] || id === state.opt.style) return;
    state.opt.style = id;
    state.opt.bpm = STYLES[id].bpm;      // each style arrives at its own tempo
    state.opt.patterns = {};             // pattern edits belonged to the old kit
    state.opt.groove = '';
    state.opt.kickVoice = null;          // let the new style name its own sounds
    state.opt.bassVoice = null;
    state.fx = fxFromStyle({ ...STYLES[id], id });
    appApi.applyFx();
    $('styleSel').value = id;
    buildStyleChoices();
    syncBpm();
    panes?.renderBeat();
    panes?.renderFx();
    rebuild();
  };

  $('styleSel').addEventListener('change', e => setStyle(e.target.value));
  $('styleChoices').addEventListener('click', e => {
    const b = e.target.closest('[data-style]');
    if (b) setStyle(b.dataset.style);
  });

  const setBpm = v => {
    const r = bpmRange(state.opt.style);
    const bpm = Math.min(r.max, Math.max(r.min, Math.round(v) || state.opt.bpm));
    state.opt.bpm = bpm;
    $('bpm').value = bpm;
    $('bpmNum').value = bpm;
  };
  $('bpm').addEventListener('input', e => setBpm(+e.target.value));
  $('bpm').addEventListener('change', () => rebuild());
  $('bpmNum').addEventListener('change', e => { setBpm(+e.target.value); rebuild(); });

  $('mapChoices').addEventListener('click', e => {
    const b = e.target.closest('[data-map]');
    if (!b) return;
    state.opt.mapping = b.dataset.map;
    buildChoices();
    rebuild(true);
  });

  $('rhythmChoices').addEventListener('click', e => {
    const b = e.target.closest('[data-rhythm]');
    if (!b) return;
    state.opt.rhythm = b.dataset.rhythm;
    buildChoices();
    rebuild(true);
  });

  $('modeSel').addEventListener('change', e => {
    state.opt.mode = e.target.value;
    $('modeHint').textContent = MODES[state.opt.mode].note;
    rebuild(true);
  });

  $('rootSel').addEventListener('change', e => {
    state.opt.root = +e.target.value;
    rebuild(true);
  });

  $('pointsChk').addEventListener('change', e => {
    state.opt.showPoints = e.target.checked;
    renderReader(state.windowStart, true);
    saveProject();
  });
  for (const [id, key] of [['vowPitchChk', 'pitch'], ['vowLenChk', 'length'],
                           ['vowAccChk', 'accent']]) {
    $(id).addEventListener('change', e => {
      state.opt.vowels[key] = e.target.checked;
      rebuild(true);
    });
  }

  for (const [id, key] of [['snapChk', 'snapSimples'], ['bassChk', 'bass'],
                           ['padChk', 'pad'], ['percChk', 'percussion']]) {
    $(id).addEventListener('change', e => {
      state.opt[key] = e.target.checked;
      rebuild(true);
    });
  }

  $('vol').addEventListener('input', e => {
    const v = +e.target.value / 100;
    transport.settings.volume = v;
    transport.voices?.setVolume(v);
  });
  $('verb').addEventListener('input', e => {
    const v = +e.target.value / 100;
    state.fx.reverb.mix = v;
    state.fx.reverb.on = v > 0.01;
    appApi.applyFx('reverb');
    panes?.renderFx();
  });
  $('tone').addEventListener('input', e => {
    const v = +e.target.value / 100;
    transport.settings.tone = v;
    transport.voices?.setTone(v);
  });

  $('btnTheme').addEventListener('click', () => {
    state.themeExplicit = true;
    applyTheme(THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]);
    saveProject();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme('system');
  });

  $('btnSaveProj').addEventListener('click', () => {
    download(new Blob([JSON.stringify(projectData(), null, 2)], { type: 'application/json' }),
             `${exportName()}-setup.json`);
  });
  $('btnLoadProj').addEventListener('click', () => $('projFile').click());
  $('projFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const ok = loadProject(JSON.parse(await f.text()));
      if (!ok) throw new Error('not an Otiyot setup');
      await afterProjectLoad();
      warn(null);
    } catch (err) {
      warn(`That file is not an Otiyot setup (${err.message}).`);
    }
  });
  $('btnResetProj').addEventListener('click', async () => {
    try { localStorage.removeItem(PROJECT_KEY); } catch (_) { /* nothing stored */ }
    state.opt.mix = {};
    state.opt.patterns = {};
    state.opt.groove = '';
    state.opt.kickVoice = null;
    state.opt.bassVoice = null;
    state.opt.leadVoice = null;
    state.opt.noteEdits = {};
    state.opt.pads = defaultPads();
    state.lyrics = { text: '', barsPerLine: 1, offsetBars: 0 };
    state.fx = fxFromStyle({ ...STYLES[state.opt.style], id: state.opt.style });
    await afterProjectLoad();
  });

  $('btnPanel').addEventListener('click', () => togglePanel(true));
  $('btnClose').addEventListener('click', () => togglePanel(false));
  $('scrim').addEventListener('click', () => togglePanel(false));

  $('btnMidi').addEventListener('click', () => {
    const blob = toMidi(state.score, { title: exportName() });
    download(blob, `${exportName()}.mid`);
  });

  $('btnWav').addEventListener('click', doRender);

  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); $('btnPlay').click(); }
    if (e.key === 'Escape') togglePanel(false);
  });

  addEventListener('resize', () => { fit(roll); fit(spectrum); });
}

function clearLit() {
  for (const x of state.litQueue) x.el.classList.remove('lit');
  state.litQueue = [];
}

function setPlayIcon(on) {
  const b = $('btnPlay');
  b.textContent = on ? '❚❚' : '▶';
  b.classList.toggle('on', on);
  b.setAttribute('aria-label', on ? 'Pause' : 'Play');
}

function togglePanel(open) {
  $('panel').hidden = !open;
  $('scrim').hidden = !open;
}

function exportName() {
  const f = state.verses[0];
  const base = state.sel.scope === 'torah' ? 'torah'
    : state.sel.scope === 'book' ? f.book.toLowerCase()
    : `${f.book.toLowerCase()}-${f.chapter}${state.sel.scope === 'chapter' ? '' : `-${f.verse}`}`;
  return `otiyot-${base}-${state.opt.mapping}`;
}

async function doRender() {
  const btn = $('btnWav');
  btn.disabled = true;
  btn.textContent = 'Rendering…';
  $('renderBar').hidden = false;
  try {
    const buf = await render(state.score, transport.settings, p => {
      $('renderFill').style.width = `${Math.round(p * 92)}%`;
    });
    $('renderFill').style.width = '100%';
    download(toWav(buf), `${exportName()}.wav`);
  } catch (err) {
    console.error(err);
    warn('The render ran out of room — try a shorter selection.');
  } finally {
    btn.textContent = 'Render to WAV';
    btn.disabled = state.score.duration > WAV_LIMIT;
    setTimeout(() => { $('renderBar').hidden = true; $('renderFill').style.width = '0'; }, 700);
  }
}


/* ------------------------------------------------------------ the narrator */

async function setupNarrator() {
  if (!Narrator.supported) return;
  await narrator.load();
  translationList = await data.loadTranslationIndex();

  // Prefer a Hebrew voice if the device has one, since that is the text.
  const n = state.narration;
  if (!n.lang) {
    const langs = narrator.languages().map(l => l.code);
    n.lang = langs.includes('he') ? 'he'
      : langs.includes((navigator.language || 'en').split('-')[0])
        ? (navigator.language || 'en').split('-')[0]
        : langs[0] || '';
  }
  if (!n.voiceName) n.voiceName = BUILTIN;
  if (n.source && n.source !== 'hebrew' && n.source !== 'translit') {
    try { translation = await data.loadTranslation(n.source); }
    catch (_) { n.source = 'hebrew'; }
  }
}

/** The verse the narrator should be on right now. */
function narrationVerse() {
  const n = state.narration;
  if (n.mode === 'book') return Math.min(n.verseIndex, state.verses.length - 1);
  // Following the music: whichever verse the playhead is inside.
  const idx = state.score?.index;
  if (!idx?.length) return 0;
  const t = transport.position;
  let lo = 0, hi = idx.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (idx[mid].t <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx[best].verseIndex;
}

/** A verse as syllables the built-in voice can pronounce. */
function syllablesOf(vi) {
  const v = state.verses[vi];
  if (!v) return [];
  const out = [];
  for (let wi = 0; wi < v.words.length; wi++) {
    const cl = clustersOf(v.words[wi]);
    for (const c of cl) {
      const col = colour(c);
      out.push({
        cons: c.base,
        vq: c.vowel ? c.vowel.q : 'ə',
        len: c.vowel ? c.vowel.len : 'none',
        silent: col.silent,
      });
    }
    if (out.length) out[out.length - 1].gap = 0.07;   // a breath between words
  }
  return out;
}

/** What that verse says, in whichever text is selected. */
function verseLine(vi) {
  const v = state.verses[vi];
  if (!v) return { ref: '', text: '', rtl: false };
  const ref = `${v.book} ${v.chapter}:${v.verse}`;
  const src = state.narration.source;
  if (src === 'hebrew') return { ref, text: v.words.join(' '), rtl: true, lang: 'he' };
  if (src === 'translit') {
    return { ref, text: v.words.map(w => translit(w)).join(' '), rtl: false, lang: '' };
  }
  const t = translation ? data.verseText(translation, v.bookId, v.chapter, v.verse) : '';
  return { ref, text: t, rtl: false, lang: src };
}

/* The music drops while the voice is speaking, then comes back. */
let duckedFrom = null;
function duck(on) {
  if (!state.narration.duck || !transport.voices) return;
  const full = transport.settings.volume;
  if (on && duckedFrom === null) {
    duckedFrom = full;
    transport.voices.setVolume(full * 0.3);
  } else if (!on && duckedFrom !== null) {
    transport.voices.setVolume(duckedFrom);
    duckedFrom = null;
  }
}

function sayVerse(vi, onDone) {
  const n = state.narration;
  clearTimeout(builtinTimer);
  builtinTimer = null;

  if (n.voiceName === BUILTIN) {
    // The voice the app builds itself. It speaks Hebrew, so it reads the
    // Hebrew whatever text the screen is showing.
    const syls = syllablesOf(vi);
    if (!syls.length) { onDone?.(); return false; }
    const ctx = transport.ctx;
    if (!ctx || !transport.voices) { onDone?.(); return false; }
    duck(true);
    const reg = REGISTERS[n.register] || REGISTERS.neutral;
    const at = ctx.currentTime + 0.05;
    const took = transport.voices.read(syls, at, {
      register: n.register,
      midi: reg.midi + (n.pitch - 1) * 12,     // the pitch slider, in semitones
      rate: n.rate, volume: n.volume,
    });
    narrator.speaking = true;
    builtinTimer = setTimeout(() => {
      narrator.speaking = false;
      duck(false);
      onDone?.();
    }, Math.max(80, took * 1000));
    return true;
  }

  const line = verseLine(vi);
  if (!line.text) { onDone?.(); return false; }
  duck(true);
  return narrator.speak(line.text, {
    voiceName: n.voiceName, lang: line.lang || n.lang,
    rate: n.rate, pitch: n.pitch, volume: n.volume,
    onend: () => { duck(false); onDone?.(); },
    onerror: msg => { duck(false); warn(`The voice stopped: ${msg}`); },
  });
}

/** Stop whichever voice is talking. */
function hushVoice() {
  clearTimeout(builtinTimer);
  builtinTimer = null;
  narrator.cancel();
  transport.voices?.hush();
  narrator.speaking = false;
}

/** Changing the voice mid-sentence takes effect on the spot. */
function restartLine() {
  const n = state.narration;
  if (!n.on) return;
  hushVoice();
  if (n.mode === 'book') readOn();
  else { spokenVerse = -1; }        // the follow loop will pick it up again
}

/** Called every frame while reading along with the music. */
function narrationTick() {
  const n = state.narration;
  if (!n.on || n.mode !== 'follow' || !transport.playing) return;
  const vi = narrationVerse();
  if (vi === spokenVerse || narrator.speaking) return;
  spokenVerse = vi;
  sayVerse(vi);
}

/** The audiobook reads one verse after another at its own pace. */
function readOn() {
  const n = state.narration;
  if (!n.on || n.mode !== 'book') return;
  if (n.verseIndex >= state.verses.length) { n.on = false; panes?.renderVoice(); return; }
  const vi = n.verseIndex;
  renderReader(vi);
  panes?.renderVoice();
  sayVerse(vi, () => {
    if (!state.narration.on || state.narration.mode !== 'book') return;
    state.narration.verseIndex = vi + 1;
    readOn();
  });
}

/* --------------------------------------------------------------- the theme */

/* Three states, like the rest of the web: light, dark, or whatever the device
 * says. Only the explicit choices stamp the root element. */
const THEMES = ['light', 'dark', 'system'];
const THEME_ICON = { light: '☀', dark: '☾', system: '◐' };

function applyTheme(t) {
  state.theme = THEMES.includes(t) ? t : 'dark';
  const root = document.documentElement;
  if (state.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
  $('btnTheme').textContent = THEME_ICON[state.theme];
  $('btnTheme').title = `Theme: ${state.theme} — click to change`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0d0b08';
  }
  paint.clear();       // canvas colours are read from the tokens
}

/* The pitch shift each vowel quality makes, shown in the table. */
const VOWEL_ARROW = { i: '+2', e: '+1', a: '0', 'ə': '0', o: '−1', u: '−2' };

/* Canvas drawing cannot use var(), so the tokens are read once per theme. */
const paint = {
  cache: null,
  clear() { this.cache = null; },
  get(name) {
    if (!this.cache) this.cache = new Map();
    if (!this.cache.has(name)) {
      this.cache.set(name,
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888');
    }
    return this.cache.get(name);
  },
};

/* ------------------------------------------------------------- the project */

const PROJECT_KEY = 'otiyot.project.v1';

function projectData() {
  return {
    v: 1,
    sel: state.sel,
    opt: state.opt,
    fx: state.fx,
    lyrics: state.lyrics,
    narration: { ...state.narration, on: false },   // never resume speaking on load
    theme: state.themeExplicit ? state.theme : null,
  };
}

function saveProject() {
  try { localStorage.setItem(PROJECT_KEY, JSON.stringify(projectData())); }
  catch (_) { /* private window, or full — the app still works */ }
}

function loadProject(fromObject) {
  let p = fromObject;
  if (!p) {
    try { p = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'); }
    catch (_) { p = null; }
  }
  if (!p || typeof p !== 'object') return false;
  // Merge rather than replace, so a setup saved by an older version still opens.
  if (p.sel) Object.assign(state.sel, p.sel);
  if (p.opt) {
    Object.assign(state.opt, p.opt);
    state.opt.mix = p.opt.mix || {};
    state.opt.patterns = p.opt.patterns || {};
    state.opt.noteEdits = p.opt.noteEdits || {};
    state.opt.vocal = { type: 'tenor', vibrato: 0.5, breath: 0.35, ...(p.opt.vocal || {}) };
    const pads = defaultPads();
    if (Array.isArray(p.opt.pads)) {
      p.opt.pads.forEach((pd, i) => { if (pads[i]) Object.assign(pads[i], pd, { id: pads[i].id }); });
    }
    state.opt.pads = pads;
  }
  if (p.fx) state.fx = { ...defaultFx(), ...p.fx };
  if (p.lyrics) Object.assign(state.lyrics, p.lyrics);
  if (p.narration) Object.assign(state.narration, p.narration, { on: false });
  if (p.theme && THEMES.includes(p.theme)) {
    state.theme = p.theme;
    state.themeExplicit = true;
  }
  return true;
}

/* --------------------------------------------------------------- the words */

/** Lay the lyrics over the current score's bars, cached until either changes. */
function laidLyrics() {
  if (laidCache) return laidCache;
  const sc = state.score;
  laidCache = lyrics.layout(state.lyrics.text, {
    bpm: state.opt.bpm,
    beatsPerBar: sc?.beatsPerBar || 4,
    barsPerLine: state.lyrics.barsPerLine,
    offsetBars: state.lyrics.offsetBars,
  });
  return laidCache;
}

/* ------------------------------------------------------------ the recorder */

let recTimer = null;

async function toggleRecord() {
  if (recorder.active) {
    clearInterval(recTimer);
    recTimer = null;
    try {
      const blob = await recorder.stop();
      await appApi.addClip(blob, `take ${bank.meta.length + 1}`);
    } catch (err) {
      warn(`Could not save that recording: ${err.message}`);
    }
    panes.renderSamples();
    return;
  }
  try {
    await transport.ensure();          // a mic needs a live context anyway
    await recorder.start();
    panes.renderSamples();
    recTimer = setInterval(() => {
      const el = $('recTime');
      if (el) el.textContent = `${recorder.elapsed.toFixed(1)}s`;
    }, 100);
  } catch (err) {
    warn(err.name === 'NotAllowedError'
      ? 'Microphone access was declined. Allow it in your browser to record.'
      : `Could not start recording: ${err.message}`);
  }
}

/* --------------------------------------------------------------- pane API */

const appApi = {
  state,
  bank,
  recorder,
  narrator,
  rebuild,
  laidLyrics,
  toggleRecord,

  translations: () => translationList,

  setVocal(v) {
    Object.assign(state.opt.vocal, v);
    transport.voices?.setVocal(state.opt.vocal);
    transport.settings.vocal = state.opt.vocal;
    saveProject();
  },

  /** Which verse the music is in right now — for "jump to the playhead". */
  verseAtPlayhead() {
    const idx = state.score?.index;
    if (!idx?.length) return 0;
    const t = transport.position;
    let lo = 0, hi = idx.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (idx[mid].t <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return idx[best].verseIndex;
  },

  narrationText: () => verseLine(narrationVerse()),
  saveNarration: saveProject,

  async rescanVoices() {
    await narrator.load();
    await setupNarrator();
    panes.renderVoice();
  },

  toggleNarration() {
    const n = state.narration;
    n.on = !n.on;
    spokenVerse = -1;
    if (!n.on) {
      hushVoice();
      duck(false);
    } else if (n.mode === 'book') {
      // Start from wherever the music is, not from the top.
      n.verseIndex = transport.position > 0 ? narrationVerse() : 0;
      readOn();
    }
    panes.renderVoice();
    saveProject();
  },

  BUILTIN,
  restartLine,

  async testVoice() {
    const n = state.narration;
    if (n.voiceName === BUILTIN) {
      await transport.ensure();
      hushVoice();
      const syls = syllablesOf(narrationVerse()).slice(0, 14);
      const reg = REGISTERS[n.register] || REGISTERS.neutral;
      transport.voices.read(syls, transport.ctx.currentTime + 0.05, {
        register: n.register, midi: reg.midi + (n.pitch - 1) * 12,
        rate: n.rate, volume: n.volume,
      });
      return;
    }
    const line = verseLine(narrationVerse());
    narrator.speak(line.text ? line.text.slice(0, 160) : 'One two three.', {
      voiceName: n.voiceName, lang: line.lang || n.lang,
      rate: n.rate, pitch: n.pitch, volume: n.volume,
      onerror: msg => warn(`That voice would not speak: ${msg}`),
    });
  },

  async setNarrationSource(src) {
    const n = state.narration;
    if (src === 'hebrew' || src === 'translit') {
      translation = null;
      n.source = src;
      // Hebrew reads best in a Hebrew voice, if the device has one.
      if (src === 'hebrew' && narrator.forLanguage('he').length) {
        n.lang = 'he';
        n.voiceName = narrator.forLanguage('he')[0].name;
      }
    } else {
      try {
        translation = await data.loadTranslation(src);
        n.source = src;
        // Follow the translation into a voice that speaks its language.
        const vs = narrator.forLanguage(src);
        if (vs.length) { n.lang = src; n.voiceName = vs[0].name; }
        else warn(`No ${src} voice on this device — it will be read in ${n.lang || 'the current voice'}.`);
      } catch (err) {
        warn(`Could not load that translation: ${err.message}`);
      }
    }
    saveProject();
  },

  /** A translation the reader brings themselves, for any language at all. */
  async loadOwnTranslation(file) {
    try {
      const text = await file.text();
      let payload;
      if (file.name.endsWith('.json')) {
        payload = JSON.parse(text);
        if (!payload.books) throw new Error('no "books" in that file');
      } else {
        // Plain text: one verse per line, laid over the current selection.
        const lines = text.split(/\r?\n/).filter(x => x.trim());
        const books = {};
        for (let i = 0; i < state.verses.length && i < lines.length; i++) {
          const v = state.verses[i];
          books[v.bookId] = books[v.bookId] || [];
          books[v.bookId][v.chapter - 1] = books[v.bookId][v.chapter - 1] || [];
          books[v.bookId][v.chapter - 1][v.verse - 1] = lines[i];
        }
        payload = { label: file.name.replace(/\.[^.]+$/, ''), books };
      }
      const code = payload.code || `own-${Date.now().toString(36).slice(-4)}`;
      payload.label = payload.label || file.name;
      translationList = data.addTranslation(code, payload);
      await appApi.setNarrationSource(code);
      warn(null);
    } catch (err) {
      warn(`That file could not be read as a translation: ${err.message}`);
    }
  },

  async addClip(blob, name) {
    try {
      const ctx = await transport.ensure();
      const entry = await bank.add(blob, name, ctx);
      warn(null);
      return entry;
    } catch (err) {
      warn(err.message);
      return null;
    }
  },

  /** Play a clip once, so you can hear what you picked. */
  async audition(id) {
    const ctx = await transport.ensure();
    const buf = bank.get(id);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(transport.voices.master);
    src.start();
  },

  applyFx(id) {
    transport.fx = state.fx;
    if (transport.voices) {
      if (id) transport.voices.rack.apply(id);
      else transport.voices.replaceFx(state.fx);
    }
    saveProject();
  },

  resetFx() {
    state.fx = fxFromStyle({ ...STYLES[state.opt.style], id: state.opt.style });
    appApi.applyFx();
  },

  onLyrics() {
    laidCache = null;
    saveProject();
  },

  saveLrc() {
    const laid = laidLyrics();
    if (!laid.lines.length) return;
    download(new Blob([lyrics.toLrc(laid.lines, exportName())], { type: 'text/plain' }),
             `${exportName()}.lrc`);
  },

  seekTo(t) {
    transport.seek(t);
    idxPtr = 0;
    clearLit();
  },
};

/* -------------------------------------------------------------------- go */

(async () => {
  await boot();
  requestAnimationFrame(frame);
})();

// Only the standalone site has a service worker; embedded copies skip it.
if ('serviceWorker' in navigator && window.top === window.self) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

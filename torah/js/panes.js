/* Otiyot — the editing panes.
 *
 * Beat, Samples, Lyrics and Plug-ins. Each one renders from `state` and calls
 * back into the app when something changes; none of them owns any state of
 * their own. Events are delegated from the pane root, so re-rendering never
 * leaves a dead listener behind.
 */

import { STYLES, BEAT_PRESETS, steps as parseSteps } from './styles.js';
import { KICKS, BASSES, LEADS, VOICE_TYPES } from './audio.js';
import { midiToName, clustersOf, noteKey } from './mapping.js';
import { FX_DEFS, FX_ORDER } from './fx.js';
import { PAD_COUNT } from './samples.js';
import { CHARACTERS, languageName } from './voice.js';
import { REGISTERS } from './vocal.js';
import * as lyrics from './lyrics.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Clicking a step cycles through rest, ghost, soft, normal, hard. */
const CYCLE = ['.', '-', 'o', 'x', 'X'];
const LEVEL = { '.': 0, '-': 1, o: 2, x: 3, X: 4 };

const TRACK_NAMES = {
  lead: 'Letters', bass: 'Bass', pad: 'Pads',
  kick: 'Kick', snare: 'Snare', hat: 'Hats', ohat: 'Open hat', perc: 'Perc',
};

/** Tracks the current style actually has, in mixer order. */
export function tracksOf(style) {
  const out = [
    { key: 'lead', name: TRACK_NAMES.lead, grid: false },
    { key: 'bass', name: TRACK_NAMES.bass, grid: false },
    { key: 'pad', name: TRACK_NAMES.pad, grid: false },
  ];
  for (const key of Object.keys(style.kit || {})) {
    out.push({ key, name: TRACK_NAMES[key] || key, grid: true });
  }
  return out;
}

export function mount(app) {
  /* app: { state, rebuild, applyFx, bank, recorder, addClip, onLyrics, seekTo } */

  /* ------------------------------------------------------------- the beat */

  function stepGrid(track, pattern, active) {
    const cells = [...pattern];
    return `<div class="grid" data-track="${track}">` + cells.map((c, i) => {
      const lvl = LEVEL[c] ?? 0;
      const beat = i % 4 === 0 ? ' grid__c--beat' : '';
      return `<button class="grid__c grid__c--l${lvl}${beat}" data-step="${i}"
        aria-label="step ${i + 1}" ${active === i ? 'data-now="1"' : ''}></button>`;
    }).join('') + '</div>';
  }

  function renderBeat() {
    const st = STYLES[app.state.opt.style];
    const mix = app.state.opt.mix;
    const edits = app.state.opt.patterns;
    const rows = tracksOf(st).map(t => {
      const m = mix[t.key] || {};
      const pat = t.grid ? (edits[t.key] ?? st.kit[t.key].p) : null;
      return `<div class="trk">
        <div class="trk__head">
          <b>${t.name}</b>
          <div class="trk__btns">
            <button class="mini${m.mute ? ' on' : ''}" data-mute="${t.key}" title="Mute">M</button>
            <button class="mini${m.solo ? ' on' : ''}" data-solo="${t.key}" title="Solo">S</button>
          </div>
          <input class="trk__gain" type="range" min="0" max="150" step="1"
                 value="${Math.round((m.gain ?? 1) * 100)}" data-gain="${t.key}"
                 aria-label="${t.name} level">
          <span class="trk__db">${Math.round((m.gain ?? 1) * 100)}</span>
        </div>
        ${pat ? stepGrid(t.key, pat) : ''}
      </div>`;
    }).join('');

    const o = app.state.opt;
    const styleKick = st.kit?.kick?.voice || 'kick_psy';
    const styleBass = st.bassVoice || 'bass';

    const kickOpts = Object.entries(KICKS).map(([id, k]) =>
      `<option value="${id}"${(o.kickVoice || styleKick) === id ? ' selected' : ''}>${k.name}</option>`).join('');
    const bassOpts = Object.entries(BASSES).map(([id, bs]) =>
      `<option value="${id}"${(o.bassVoice || styleBass) === id ? ' selected' : ''}>${bs.name}</option>`).join('');
    const styleLead = st.lead.voice;
    const leadNow = o.leadVoice || styleLead;
    const leadOpts = Object.entries(LEADS).map(([id, l]) =>
      `<option value="${id}"${leadNow === id ? ' selected' : ''}>${l.name}</option>`).join('');
    const grooveOpts = `<option value="">— this style's own —</option>` +
      Object.entries(BEAT_PRESETS).map(([id, g]) =>
        `<option value="${id}"${o.groove === id ? ' selected' : ''}>${g.name}</option>`).join('');

    $('beat').innerHTML = `
      <div class="paneHead">
        <div><h3 class="sec">${esc(st.name)} — the groove</h3>
          <p class="note" style="margin:0">Tap a step to cycle it: rest → ghost → soft → normal → hard.
          ${st.kit ? '' : 'This style has no kit, so there is nothing to tap — but the kick and bass below still apply if you switch to one that has.'}</p></div>
        <button class="btn btn--sm" id="beatReset">Reset</button>
      </div>

      <div class="picks">
        <label><span>Lead</span><select id="leadSel">${leadOpts}</select></label>
        <label><span>Kick</span><select id="kickSel">${kickOpts}</select></label>
        <label><span>Bass</span><select id="bassSel">${bassOpts}</select></label>
        <label><span>Groove</span><select id="grooveSel">${grooveOpts}</select></label>
      </div>
      ${leadNow === 'vox' ? `
      <div class="picks" style="margin-top:8px">
        <label><span>Throat</span><select id="voxType">${Object.entries(VOICE_TYPES).map(([id, v]) =>
          `<option value="${id}"${(o.vocal?.type || 'tenor') === id ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label><span>Vibrato</span><input type="range" id="voxVib" min="0" max="1" step="0.02" value="${o.vocal?.vibrato ?? 0.5}"></label>
        <label><span>Breath</span><input type="range" id="voxBr" min="0" max="1" step="0.02" value="${o.vocal?.breath ?? 0.35}"></label>
      </div>
      <p class="note" style="margin-top:6px">${esc(LEADS.vox.blurb)}
        A shorter throat raises every resonance — the same note, a different body making it.</p>` : ''}

      <p class="note" style="margin-top:6px">
        ${BASSES[o.bassVoice || styleBass]?.blurb || ''}
        A groove replaces the drum patterns below; the kick and bass sounds stay whatever you picked.
      </p>

      ${rows}`;
  }

  /* ---------------------------------------------------------- the samples */

  function renderSamples() {
    const bank = app.bank;
    const clips = bank.meta;
    const rec = app.recorder;
    const canRecord = rec.constructor.supported;

    const options = id => `<option value="">— empty —</option>` + clips
      .map(c => `<option value="${c.id}"${c.id === id ? ' selected' : ''}>${esc(c.name)}</option>`)
      .join('');

    const clipList = clips.length ? clips.map(c => `
      <div class="clip">
        <input class="clip__name" value="${esc(c.name)}" data-rename="${c.id}" aria-label="Clip name">
        <span class="clip__dur">${c.dur.toFixed(1)}s</span>
        <button class="mini" data-audition="${c.id}" title="Play once">▶</button>
        <button class="mini mini--warn" data-del="${c.id}" title="Delete">✕</button>
      </div>`).join('')
      : `<p class="note">Nothing recorded yet. Hit record and make a noise, or bring in a file.</p>`;

    const mix = app.state.opt.mix;
    const pads = app.state.opt.pads.map((pd, i) => {
      const m = mix[pd.id] || {};
      return `<div class="trk trk--pad">
        <div class="trk__head">
          <b>Pad ${i + 1}</b>
          <select class="pad__sel" data-pad-sample="${pd.id}" aria-label="Pad ${i + 1} clip">${options(pd.sampleId)}</select>
          <div class="trk__btns">
            <button class="mini${m.mute ? ' on' : ''}" data-mute="${pd.id}" title="Mute">M</button>
            <button class="mini${m.solo ? ' on' : ''}" data-solo="${pd.id}" title="Solo">S</button>
          </div>
        </div>
        ${stepGrid(pd.id, pd.pattern)}
        <div class="pad__knobs">
          <label>Gain<input type="range" min="0" max="150" value="${Math.round(pd.gain * 100)}" data-pad="gain" data-id="${pd.id}"></label>
          <label>Pitch<input type="range" min="25" max="300" value="${Math.round(pd.rate * 100)}" data-pad="rate" data-id="${pd.id}"></label>
          <label>Start<input type="range" min="0" max="100" value="${Math.round(pd.start * 100)}" data-pad="start" data-id="${pd.id}"></label>
          <button class="mini${pd.oneShot ? '' : ' on'}" data-pad="oneShot" data-id="${pd.id}" title="Let the clip ring past the next hit">ring</button>
        </div>
      </div>`;
    }).join('');

    $('samples').innerHTML = `
      <div class="recbar">
        <button class="recbtn${rec.active ? ' on' : ''}" id="recBtn" ${canRecord ? '' : 'disabled'}>
          ${rec.active ? '■ Stop' : '● Record'}
        </button>
        <span class="rectime" id="recTime">${rec.active ? rec.elapsed.toFixed(1) + 's' : ''}</span>
        <button class="btn btn--sm" id="importBtn">Add a file</button>
        <input type="file" id="importFile" accept="audio/*" multiple hidden>
      </div>
      <p class="note" style="margin-top:0">
        ${canRecord
          ? 'Record straight from your phone or laptop mic, or bring in any audio file. Clips stay on this device — nothing is uploaded.'
          : 'This browser will not give the page a microphone, but you can still add audio files.'}
      </p>
      <h3 class="sec">Your clips</h3>
      ${clipList}
      <h3 class="sec">Pads</h3>
      <p class="note" style="margin-top:0">Give a pad a clip, then tap the steps it should fire on.</p>
      ${pads}`;
  }

  /* ----------------------------------------------------------- the lyrics */

  function renderLyrics() {
    const L = app.state.lyrics;
    const laid = app.laidLyrics();
    const dense = laid.lines.filter(l => l.dense).length;

    const list = laid.lines.length
      ? laid.lines.map(l => `
        <div class="lyr" data-line="${l.index}" data-from="${l.from}">
          <span class="lyr__bar">${l.bar + 1}</span>
          <span class="lyr__t">${esc(l.text)}</span>
          <span class="lyr__syl${l.dense ? ' lyr__syl--warn' : ''}">${l.syllables}</span>
        </div>`).join('')
      : `<p class="note">Type above and the lines will land on the bars here.</p>`;

    $('lyrics').innerHTML = `
      <h3 class="sec">Your words, on the beat</h3>
      <textarea id="lyrText" class="lyrbox" rows="8" spellcheck="true"
        placeholder="One line per bar.&#10;Leave a line blank for a bar's rest.&#10;End a line with dots to hold it&#8230;&#10;&#10;Write whatever you want here — it is your text, not generated."
        >${esc(L.text)}</textarea>
      <div class="lyrops">
        <label>Bars per line
          <input id="lyrBars" type="number" min="1" max="8" step="1" value="${L.barsPerLine}"></label>
        <label>Start at bar
          <input id="lyrOffset" type="number" min="0" max="512" step="1" value="${L.offsetBars}"></label>
        <button class="btn btn--sm" id="lyrLrc" ${laid.lines.length ? '' : 'disabled'}>Save .lrc</button>
      </div>
      <p class="note">
        ${laid.lines.length
          ? `${laid.lines.length} line${laid.lines.length === 1 ? '' : 's'} over ${laid.bars} bars ·
             one bar is ${laid.barSec.toFixed(2)}s at ${app.state.opt.bpm} BPM
             ${dense ? `· <b style="color:var(--warn-ink)">${dense} line${dense === 1 ? '' : 's'} may be too many syllables to fit</b>` : ''}`
          : 'The count on the right of each line is its syllables — over about four a beat and it stops being sayable.'}
      </p>
      <div class="lyrlist">${list}</div>`;
  }

  /* ------------------------------------------------------ the note editor */

  const SYL = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', 'ə': 'ə' };

  function renderNotes() {
    const verses = app.state.verses;
    const vi = Math.min(app.state.noteVerse ?? 0, Math.max(0, verses.length - 1));
    const v = verses[vi];
    const edits = app.state.opt.noteEdits;
    const count = Object.keys(edits).length;

    if (!v) { $('notes').innerHTML = '<p class="note">Nothing selected.</p>'; return; }

    // Build the list from the letters themselves, not from the score: a muted
    // note has no note in the score, and it still has to be here to un-mute.
    const sounded = new Map();
    for (const n of app.state.score?.notes || []) {
      if (n.lead && !n.doubled && n.key && !sounded.has(n.key)) sounded.set(n.key, n);
    }

    const rows = v.words.flatMap((word, wi) =>
      clustersOf(word).map((c, li) => {
        const key = noteKey(v, wi, li);
        const n = sounded.get(key);
        const ed = edits[key] || {};
        const semi = ed.semi || 0;
        const syl = translitSyl({ cons: c.base, vq: c.vowel ? c.vowel.q : 'ə' });
        const edited = !!(semi || (ed.len ?? 1) !== 1 || (ed.vel ?? 1) !== 1);
        return `<div class="nrow${ed.mute ? ' muted' : ''}${edited ? ' edited' : ''}" data-key="${key}">
          <div class="nrow__l">${c.letter}${c.marks.join('')}</div>
          <div class="nrow__s">${esc(syl || '—')}</div>
          <div class="nrow__p">
            <button class="mini" data-nudge="-1" title="Down a semitone">−</button>
            <b>${n ? midiToName(n.midi) : '—'}</b>
            <button class="mini" data-nudge="1" title="Up a semitone">+</button>
            <span class="nrow__n">${semi > 0 ? '+' + semi : semi || ''}</span>
          </div>
          <input class="nrow__v" type="range" min="0.25" max="3" step="0.05"
                 value="${ed.len ?? 1}" data-len title="Length">
          <span class="nrow__n">${((ed.len ?? 1)).toFixed(2)}×</span>
          <input class="nrow__v" type="range" min="0" max="1.6" step="0.05"
                 value="${ed.vel ?? 1}" data-vel title="Level">
          <button class="mini${ed.mute ? ' on' : ''}" data-mute-note title="Silence this note">M</button>
        </div>`;
      })).join('');

    $('notes').innerHTML = `
      <div class="paneHead">
        <div><h3 class="sec">Every note, one at a time</h3>
          <p class="note" style="margin:0">Change the pitch, how long it is held, how loud, or silence it.
          ${count ? `<b>${count} note${count === 1 ? '' : 's'} changed</b> — your edits are filed against the letter itself, so they survive changing style, tempo or chapter.` : ''}</p></div>
        <button class="btn btn--sm" id="notesReset" ${count ? '' : 'disabled'}>Reset all</button>
      </div>

      <div class="picks" style="margin-bottom:10px">
        <label><span>Verse</span><select id="noteVerse">${verses.map((x, i) =>
          `<option value="${i}"${i === vi ? ' selected' : ''}>${x.chapter}:${x.verse}</option>`).join('')}</select></label>
        <label><span></span><button class="btn btn--sm" id="noteHere">Jump to the playhead</button></label>
      </div>

      <div class="nhead"><span>letter</span><span>sung</span><span>pitch</span>
        <span>length</span><span></span><span>level</span><span></span></div>
      ${rows || '<p class="note">No notes in this verse.</p>'}`;
  }

  /* What the voice will actually sing on this note. */
  function translitSyl(n) {
    const c = { 'א': 'ʾ', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
      'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ל': 'l', 'מ': 'm', 'נ': 'n', 'ס': 's',
      'ע': 'ʿ', 'פ': 'p', 'צ': 'ts', 'ק': 'q', 'ר': 'r', 'ש': 'sh', 'ת': 't' }[n.cons] || '';
    return (c + (SYL[n.vq] || '')).replace(/ʾ|ʿ/g, '');
  }

  function editNote(key, patch) {
    const edits = app.state.opt.noteEdits;
    edits[key] = { ...(edits[key] || {}), ...patch };
    const e = edits[key];
    // Drop an entry that no longer changes anything.
    if (!e.semi && (e.len ?? 1) === 1 && (e.vel ?? 1) === 1 && !e.mute) delete edits[key];
    app.rebuild(true);
  }

  $('notes').addEventListener('click', e => {
    if (e.target.id === 'notesReset') {
      app.state.opt.noteEdits = {};
      renderNotes();
      app.rebuild(true);
      return;
    }
    if (e.target.id === 'noteHere') { app.state.noteVerse = app.verseAtPlayhead(); renderNotes(); return; }
    const row = e.target.closest('[data-key]');
    if (!row) return;
    const key = row.dataset.key;
    const nudge = e.target.closest('[data-nudge]');
    if (nudge) {
      const cur = app.state.opt.noteEdits[key]?.semi || 0;
      editNote(key, { semi: Math.max(-24, Math.min(24, cur + +nudge.dataset.nudge)) });
      setTimeout(renderNotes, 0);
      return;
    }
    if (e.target.closest('[data-mute-note]')) {
      editNote(key, { mute: !app.state.opt.noteEdits[key]?.mute });
      setTimeout(renderNotes, 0);
    }
  });

  $('notes').addEventListener('change', e => {
    if (e.target.id === 'noteVerse') { app.state.noteVerse = +e.target.value; renderNotes(); return; }
    const row = e.target.closest('[data-key]');
    if (!row) return;
    if (e.target.hasAttribute('data-len')) editNote(row.dataset.key, { len: +e.target.value });
    if (e.target.hasAttribute('data-vel')) editNote(row.dataset.key, { vel: +e.target.value });
    setTimeout(renderNotes, 0);
  });

  $('notes').addEventListener('input', e => {
    const row = e.target.closest('[data-key]');
    if (!row) return;
    if (e.target.hasAttribute('data-len')) {
      const out = e.target.nextElementSibling;
      if (out) out.textContent = (+e.target.value).toFixed(2) + '×';
    }
  });

  /* -------------------------------------------------------- the narrator */

  function renderVoice() {
    const n = app.state.narration;
    const nar = app.narrator;
    const ok = nar.constructor.supported;
    const langs = nar.languages();
    const voices = n.lang ? nar.forLanguage(n.lang) : nar.voices;
    const cur = app.narrationText();

    const sources = [
      { id: 'hebrew', label: 'Hebrew — as written' },
      { id: 'translit', label: 'Hebrew — in Latin letters' },
      ...app.translations().map(t => ({ id: t.code, label: t.label + (t.own ? ' (yours)' : '') })),
    ];

    const builtin = n.voiceName === app.BUILTIN;
    const voiceOpts =
      `<option value="${app.BUILTIN}"${builtin ? ' selected' : ''}>Built-in voice — always here</option>` +
      (voices.length
        ? `<optgroup label="On this device">` + voices.map(v =>
            `<option value="${esc(v.name)}"${n.voiceName === v.name ? ' selected' : ''}>${esc(v.name)}${v.localService ? '' : ' · online'}</option>`).join('') + '</optgroup>'
        : '');

    $('voice').innerHTML = `
      <div class="vbar">
        <button class="saybtn${n.on ? ' on' : ''}" id="vToggle">${n.on ? '■ Stop reading' : '▶ Read aloud'}</button>
        <button class="btn btn--sm" id="vTest">Hear it</button>
        <span class="vstat">${ok && nar.voices.length
          ? `built-in voice + ${nar.voices.length} on this device, ${langs.length} languages`
          : 'the built-in voice — this device has no others installed'}</span>
      </div>

      <div class="vgrid">
        <label class="vrow"><span>Voice</span>
          <select id="vVoice">${voiceOpts}</select></label>
        ${builtin ? `
        <label class="vrow"><span>Who</span>
          <select id="vReg">${Object.entries(REGISTERS).map(([id, r]) =>
            `<option value="${id}"${n.register === id ? ' selected' : ''}>${r.name}</option>`).join('')}</select></label>`
        : `
        <label class="vrow"><span>Language</span>
          <select id="vLang">${langs.map(l =>
            `<option value="${l.code}"${n.lang === l.code ? ' selected' : ''}>${esc(l.name)} (${l.voices.length})</option>`).join('')}</select></label>`}
        <label class="vrow"><span>Read</span>
          <select id="vSource">${sources.map(x =>
            `<option value="${x.id}"${n.source === x.id ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label class="vrow"><span>Mode</span>
          <select id="vMode">
            <option value="follow"${n.mode === 'follow' ? ' selected' : ''}>Follow the music</option>
            <option value="book"${n.mode === 'book' ? ' selected' : ''}>Audiobook — read at its own pace</option>
          </select></label>
      </div>

      <p class="note" style="margin-top:8px">${builtin
        ? `${esc(REGISTERS[n.register]?.blurb || '')} This voice is made of filters here in the page — nothing to install, nothing sent anywhere. It pronounces Hebrew from the points, so it reads the Hebrew whichever text is shown above. <b>Change it while it is reading and it changes on the spot.</b>`
        : 'A voice from the operating system. It can read a translation in its own language; the built-in voice reads Hebrew.'}</p>

      ${builtin ? '' : `
      <h3 class="sec">The voice's character</h3>
      <p class="note" style="margin-top:0">These shape the device's own voice with speed and pitch. They are not impressions of anyone.</p>
      <div class="chars">${Object.entries(CHARACTERS).map(([id, c]) => `
        <button class="chip${n.character === id ? ' on' : ''}" data-char="${id}">
          <b>${c.name}</b><small>${c.blurb}</small></button>`).join('')}</div>`}

      <div class="vgrid" style="margin-top:10px">
        <label class="vrow"><span>Speed</span>
          <input type="range" id="vRate" min="0.4" max="2.2" step="0.02" value="${n.rate}">
          <output>${n.rate.toFixed(2)}</output></label>
        <label class="vrow"><span>Pitch</span>
          <input type="range" id="vPitch" min="0" max="2" step="0.02" value="${n.pitch}">
          <output>${n.pitch.toFixed(2)}</output></label>
        <label class="vrow"><span>Level</span>
          <input type="range" id="vVol" min="0" max="1" step="0.02" value="${n.volume}">
          <output>${n.volume.toFixed(2)}</output></label>
      </div>

      <label class="row check" style="margin-top:10px"><input type="checkbox" id="vDuck" ${n.duck ? 'checked' : ''}>
        <span>Duck the music while it reads<small>Drops the band under the voice, then brings it back.</small></span></label>

      <div class="vnow">
        <div class="vnow__ref">${cur.ref || 'nothing yet'}</div>
        <div class="vnow__t"${cur.rtl ? ' dir="rtl" lang="he"' : ''}>${esc(cur.text || '—')}</div>
      </div>

      <h3 class="sec">Another language</h3>
      <p class="note" style="margin-top:0">
        The voices above can speak any language this device has installed, but the
        <b>words</b> have to come from somewhere. Four translations are bundled, all
        of them public domain. For anything else, load your own: a JSON file of
        <code>{ "label": "…", "books": { "genesis": [[verse, …], …] } }</code>, or a
        plain text file with one verse per line.
      </p>
      <div class="vbar">
        <button class="btn btn--sm" id="vLoadTrans">Load a translation</button>
        <input type="file" id="vTransFile" accept=".json,.txt,application/json,text/plain" hidden>
      </div>`;
  }

  /* --------------------------------------------------------- the plug-ins */

  function renderFx() {
    const fx = app.state.fx;
    const cards = FX_ORDER.map(id => {
      const def = FX_DEFS[id];
      const v = fx[id];
      const knobs = Object.entries(def.params).map(([k, spec]) => {
        if (spec.options) {
          return `<label class="knob"><span>${spec.label}</span>
            <select data-fx="${id}" data-param="${k}">${spec.options
              .map(o => `<option value="${o}"${v[k] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>
          </label>`;
        }
        const val = v[k];
        const show = spec.max <= 2 ? (+val).toFixed(2) : Math.round(val);
        return `<label class="knob"><span>${spec.label}</span>
          <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}"
                 value="${val}" data-fx="${id}" data-param="${k}">
          <output>${show}</output></label>`;
      }).join('');
      return `<div class="fxcard${v.on ? ' on' : ''}">
        <div class="fxcard__head">
          <button class="led${v.on ? ' on' : ''}" data-fxon="${id}"
                  aria-pressed="${v.on}" aria-label="${def.name} on/off"></button>
          <b>${def.name}</b>
        </div>
        <p class="fxcard__b">${def.blurb}</p>
        <div class="knobs">${knobs}</div>
      </div>`;
    }).join('');

    $('fx').innerHTML = `
      <div class="paneHead">
        <div><h3 class="sec">Plug-ins</h3>
          <p class="note" style="margin:0">In signal order. Each style switches on the ones it needs; everything is yours to change.</p></div>
        <button class="btn btn--sm" id="fxReset">Style defaults</button>
      </div>
      <div class="fxgrid">${cards}</div>`;
  }

  /* ------------------------------------------------------- karaoke ticker */

  function updateKaraoke(t) {
    const laid = app.laidLyrics();
    const box = $('karaoke');
    if (!laid.lines.length) { box.hidden = true; return; }
    box.hidden = false;
    const { current, last, next } = lyrics.at(laid.lines, t);
    const cur = current >= 0 ? laid.lines[current] : (last >= 0 ? laid.lines[last] : null);
    const nxt = next >= 0 ? laid.lines[next] : null;
    const nowEl = $('karaokeNow');
    const text = cur ? cur.text : '';
    if (nowEl.textContent !== text) nowEl.textContent = text;
    nowEl.classList.toggle('dim', current < 0);
    const nextEl = $('karaokeNext');
    const nt = nxt ? nxt.text : '';
    if (nextEl.textContent !== nt) nextEl.textContent = nt;
    const p = current >= 0 ? lyrics.progress(laid.lines[current], t) : 0;
    $('karaokeSweep').style.width = `${(p * 100).toFixed(1)}%`;
  }

  /* --------------------------------------------------------------- events */

  /* One delegated handler per pane root, attached once. */

  const stepFrom = e => {
    const cell = e.target.closest('[data-step]');
    if (!cell) return null;
    const grid = cell.closest('[data-track]');
    return grid ? { track: grid.dataset.track, step: +cell.dataset.step } : null;
  };

  function cyclePattern(pattern, step) {
    const cells = [...pattern];
    const cur = CYCLE.indexOf(cells[step] ?? '.');
    cells[step] = CYCLE[(cur + 1) % CYCLE.length];
    return cells.join('');
  }

  function toggleMix(key, field) {
    const mix = app.state.opt.mix;
    mix[key] = { ...(mix[key] || {}) };
    mix[key][field] = !mix[key][field];
    app.rebuild(true);
  }

  $('beat').addEventListener('click', e => {
    const st = STYLES[app.state.opt.style];
    const hit = stepFrom(e);
    if (hit) {
      const cur = app.state.opt.patterns[hit.track] ?? st.kit?.[hit.track]?.p;
      if (cur == null) return;
      app.state.opt.patterns[hit.track] = cyclePattern(cur, hit.step);
      renderBeat();
      app.rebuild(true);
      return;
    }
    const mute = e.target.closest('[data-mute]');
    if (mute) { toggleMix(mute.dataset.mute, 'mute'); renderBeat(); return; }
    const solo = e.target.closest('[data-solo]');
    if (solo) { toggleMix(solo.dataset.solo, 'solo'); renderBeat(); return; }
    if (e.target.id === 'beatReset') {
      app.state.opt.patterns = {};
      app.state.opt.groove = '';
      app.state.opt.kickVoice = null;
      app.state.opt.bassVoice = null;
      app.state.opt.leadVoice = null;
      renderBeat();
      app.rebuild(true);
    }
  });

  $('beat').addEventListener('change', e => {
    const o = app.state.opt;
    if (e.target.id === 'leadSel') { o.leadVoice = e.target.value; renderBeat(); app.rebuild(true); return; }
    if (e.target.id === 'voxType') { app.setVocal({ type: e.target.value }); return; }
    if (e.target.id === 'kickSel') { o.kickVoice = e.target.value; app.rebuild(true); return; }
    if (e.target.id === 'bassSel') { o.bassVoice = e.target.value; renderBeat(); app.rebuild(true); return; }
    if (e.target.id === 'grooveSel') {
      o.groove = e.target.value;
      const g = BEAT_PRESETS[o.groove];
      if (g) {
        // Only write patterns for tracks this style actually has.
        const kit = STYLES[o.style].kit || {};
        o.patterns = {};
        for (const key of Object.keys(kit)) if (g[key]) o.patterns[key] = g[key];
      } else {
        o.patterns = {};
      }
      renderBeat();
      app.rebuild(true);
    }
  });

  $('beat').addEventListener('input', e => {
    if (e.target.id === 'voxVib') return app.setVocal({ vibrato: +e.target.value });
    if (e.target.id === 'voxBr') return app.setVocal({ breath: +e.target.value });
    const g = e.target.closest('[data-gain]');
    if (!g) return;
    const key = g.dataset.gain;
    app.state.opt.mix[key] = { ...(app.state.opt.mix[key] || {}), gain: +g.value / 100 };
    g.parentElement.querySelector('.trk__db').textContent = g.value;
  });
  $('beat').addEventListener('change', e => {
    if (e.target.closest('[data-gain]')) app.rebuild(true);
  });

  /* ---- samples ---- */

  $('samples').addEventListener('click', async e => {
    const t = e.target;
    if (t.id === 'recBtn') return app.toggleRecord();
    if (t.id === 'importBtn') return $('importFile').click();

    const del = t.closest('[data-del]');
    if (del) {
      await app.bank.remove(del.dataset.del);
      for (const pd of app.state.opt.pads) if (pd.sampleId === del.dataset.del) pd.sampleId = null;
      renderSamples();
      app.rebuild(true);
      return;
    }
    const aud = t.closest('[data-audition]');
    if (aud) return app.audition(aud.dataset.audition);

    const hit = stepFrom(e);
    if (hit) {
      const pd = app.state.opt.pads.find(p => p.id === hit.track);
      if (!pd) return;
      pd.pattern = cyclePattern(pd.pattern, hit.step);
      renderSamples();
      app.rebuild(true);
      return;
    }
    const mute = t.closest('[data-mute]');
    if (mute) { toggleMix(mute.dataset.mute, 'mute'); renderSamples(); return; }
    const solo = t.closest('[data-solo]');
    if (solo) { toggleMix(solo.dataset.solo, 'solo'); renderSamples(); return; }

    const ring = t.closest('[data-pad="oneShot"]');
    if (ring) {
      const pd = app.state.opt.pads.find(p => p.id === ring.dataset.id);
      pd.oneShot = !pd.oneShot;
      renderSamples();
      app.rebuild(true);
    }
  });

  $('samples').addEventListener('input', e => {
    const k = e.target.closest('input[data-pad]');
    if (!k) return;
    const pd = app.state.opt.pads.find(p => p.id === k.dataset.id);
    if (!pd) return;
    const field = k.dataset.pad;
    if (field === 'gain') pd.gain = +k.value / 100;
    if (field === 'rate') pd.rate = +k.value / 100;
    if (field === 'start') {
      const info = pd.sampleId ? app.bank.info(pd.sampleId) : null;
      pd.start = info ? (+k.value / 100) * info.dur * 0.9 : 0;
    }
  });
  $('samples').addEventListener('change', async e => {
    if (e.target.id === 'importFile') {
      for (const f of e.target.files) await app.addClip(f, f.name.replace(/\.[^.]+$/, ''));
      e.target.value = '';
      renderSamples();
      return;
    }
    const sel = e.target.closest('[data-pad-sample]');
    if (sel) {
      const pd = app.state.opt.pads.find(p => p.id === sel.dataset.padSample);
      pd.sampleId = sel.value || null;
      pd.start = 0;
      app.rebuild(true);
      return;
    }
    const ren = e.target.closest('[data-rename]');
    if (ren) { await app.bank.rename(ren.dataset.rename, ren.value.trim() || 'clip'); renderSamples(); return; }
    if (e.target.closest('input[data-pad]')) app.rebuild(true);
  });

  /* ---- lyrics ---- */

  let lyrTimer = null;
  $('lyrics').addEventListener('input', e => {
    if (e.target.id === 'lyrText') {
      app.state.lyrics.text = e.target.value;
      clearTimeout(lyrTimer);
      lyrTimer = setTimeout(() => { app.onLyrics(); renderLyricsKeepFocus(); }, 400);
    }
  });
  $('lyrics').addEventListener('change', e => {
    if (e.target.id === 'lyrBars') {
      app.state.lyrics.barsPerLine = Math.max(1, Math.min(8, +e.target.value || 1));
      app.onLyrics(); renderLyrics();
    }
    if (e.target.id === 'lyrOffset') {
      app.state.lyrics.offsetBars = Math.max(0, +e.target.value || 0);
      app.onLyrics(); renderLyrics();
    }
  });
  $('lyrics').addEventListener('click', e => {
    if (e.target.id === 'lyrLrc') return app.saveLrc();
    const line = e.target.closest('[data-from]');
    if (line) app.seekTo(+line.dataset.from);
  });

  /* Re-render the list under the textarea without stealing the caret. */
  function renderLyricsKeepFocus() {
    const box = $('lyrText');
    const focused = document.activeElement === box;
    const pos = focused ? [box.selectionStart, box.selectionEnd] : null;
    renderLyrics();
    if (focused) {
      const next = $('lyrText');
      next.focus();
      try { next.setSelectionRange(pos[0], pos[1]); } catch (_) { /* range gone */ }
    }
  }

  /* ---- the narrator ---- */

  $('voice').addEventListener('click', e => {
    const t = e.target;
    if (t.id === 'vToggle') return app.toggleNarration();
    if (t.id === 'vTest') return app.testVoice();
    if (t.id === 'vRescan') return app.rescanVoices();
    if (t.id === 'vLoadTrans') return $('vTransFile').click();
    const ch = t.closest('[data-char]');
    if (ch) {
      const c = CHARACTERS[ch.dataset.char];
      Object.assign(app.state.narration, { character: ch.dataset.char, rate: c.rate, pitch: c.pitch });
      renderVoice();
      app.saveNarration();
      app.restartLine();
    }
  });

  $('voice').addEventListener('input', e => {
    const n = app.state.narration;
    const map = { vRate: 'rate', vPitch: 'pitch', vVol: 'volume' };
    const key = map[e.target.id];
    if (!key) return;
    n[key] = +e.target.value;
    n.character = '';
    const out = e.target.parentElement.querySelector('output');
    if (out) out.textContent = n[key].toFixed(2);
  });

  $('voice').addEventListener('change', async e => {
    const n = app.state.narration;
    const id = e.target.id;
    if (id === 'vRate' || id === 'vPitch' || id === 'vVol') {
      app.saveNarration();
      app.restartLine();
      return;
    }
    if (id === 'vReg') { n.register = e.target.value; renderVoice(); app.saveNarration(); app.restartLine(); return; }
    if (id === 'vLang') {
      n.lang = e.target.value;
      const first = app.narrator.forLanguage(n.lang)[0];
      n.voiceName = first ? first.name : app.BUILTIN;
      renderVoice(); app.saveNarration(); app.restartLine(); return;
    }
    if (id === 'vVoice') {
      n.voiceName = e.target.value;
      renderVoice();
      app.saveNarration();
      app.restartLine();
      return;
    }
    if (id === 'vMode') { n.mode = e.target.value; app.saveNarration(); return; }
    if (id === 'vSource') { await app.setNarrationSource(e.target.value); renderVoice(); return; }
    if (id === 'vDuck') { n.duck = e.target.checked; app.saveNarration(); return; }
    if (id === 'vTransFile') {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) { await app.loadOwnTranslation(f); renderVoice(); }
    }
  });

  /* ---- plug-ins ---- */

  $('fx').addEventListener('click', e => {
    const led = e.target.closest('[data-fxon]');
    if (led) {
      const id = led.dataset.fxon;
      app.state.fx[id].on = !app.state.fx[id].on;
      app.applyFx(id);
      renderFx();
      return;
    }
    if (e.target.id === 'fxReset') { app.resetFx(); renderFx(); }
  });

  $('fx').addEventListener('input', e => {
    const k = e.target.closest('[data-fx]');
    if (!k) return;
    const { fx: id, param } = k.dataset;
    const spec = FX_DEFS[id].params[param];
    const value = spec.options ? k.value : +k.value;
    app.state.fx[id][param] = value;
    app.applyFx(id);
    const out = k.parentElement.querySelector('output');
    if (out) out.textContent = spec.max <= 2 ? value.toFixed(2) : Math.round(value);
  });

  return { renderBeat, renderSamples, renderLyrics, renderFx, renderVoice, renderNotes,
           updateKaraoke,
           renderAll() { renderBeat(); renderSamples(); renderLyrics(); renderFx();
                         renderVoice(); renderNotes(); } };
}

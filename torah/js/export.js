/* Otiyot — writing the result out as a file.
 *
 * WAV so you can just listen to it, MIDI so you can open the letters in a
 * notation program and see what they spell on a stave.
 */

/* ------------------------------------------------------------------- WAV */

/** Encode an AudioBuffer as a 16-bit PCM WAV blob. */
export function toWav(buffer) {
  const chans = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = frames * chans * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);

  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  str(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                       // PCM
  view.setUint16(22, chans, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, bytes, true);

  const data = [];
  for (let c = 0; c < chans; c++) data.push(buffer.getChannelData(c));

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chans; c++) {
      let s = data[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/* ------------------------------------------------------------------ MIDI */

const PPQ = 480;
const BPM = 120;                       // fixed clock; the score is already in seconds
const TICKS_PER_SEC = PPQ * BPM / 60;  // 960

function vlq(n) {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return out;
}

function chunk(id, bytes) {
  const head = [];
  for (const ch of id) head.push(ch.charCodeAt(0));
  const len = bytes.length;
  head.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  return head.concat(bytes);
}

/* General MIDI voices, chosen to sound close to the in-app synth. */
const TRACKS = [
  { voice: 'lead', name: 'Letters',   ch: 0, program: 46 },  // orchestral harp
  { voice: 'bass', name: 'Words',     ch: 1, program: 32 },  // acoustic bass
  { voice: 'pad',  name: 'Verses',    ch: 2, program: 89 },  // warm pad
  { voice: 'perc', name: 'Breaths',   ch: 9, program: null },
];

/** Build a Standard MIDI File (format 1) from a score. */
export function toMidi(score, meta = {}) {
  const header = chunk('MThd', [0, 1, 0, TRACKS.length + 1, (PPQ >> 8) & 0xff, PPQ & 0xff]);

  // Track 0: tempo, time signature and a text marker naming the source.
  const t0 = [];
  const usPerQuarter = Math.round(60000000 / BPM);
  const title = (meta.title || 'Otiyot — the Torah as notes').slice(0, 120);
  t0.push(...vlq(0), 0xff, 0x03, title.length, ...[...title].map(c => c.charCodeAt(0) & 0x7f));
  t0.push(...vlq(0), 0xff, 0x51, 0x03,
          (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);
  t0.push(...vlq(0), 0xff, 0x58, 0x04, 4, 2, 24, 8);
  t0.push(...vlq(0), 0xff, 0x2f, 0x00);
  const tracks = [chunk('MTrk', t0)];

  for (const spec of TRACKS) {
    const notes = score.notes.filter(n =>
      spec.voice === 'perc' ? (n.voice === 'tick' || n.voice === 'tav') : n.voice === spec.voice);

    const bytes = [];
    bytes.push(...vlq(0), 0xff, 0x03, spec.name.length,
               ...[...spec.name].map(c => c.charCodeAt(0)));
    if (spec.program !== null) bytes.push(...vlq(0), 0xc0 | spec.ch, spec.program);

    // Flatten to on/off events, then sort by tick.
    const events = [];
    for (const n of notes) {
      const isPerc = spec.voice === 'perc';
      const key = isPerc ? (n.voice === 'tav' ? 35 : 37)
                         : Math.max(0, Math.min(127, Math.round(n.midi)));
      const vel = Math.max(1, Math.min(127, Math.round((n.vel ?? 0.7) * 110)));
      const on = Math.round(n.t * TICKS_PER_SEC);
      const off = Math.max(on + 1, Math.round((n.t + Math.max(n.dur, 0.05)) * TICKS_PER_SEC));
      events.push({ tick: on, kind: 1, key, vel });
      events.push({ tick: off, kind: 0, key, vel: 0 });
    }
    // Note-offs first at equal ticks, so repeated pitches retrigger cleanly.
    events.sort((a, b) => a.tick - b.tick || a.kind - b.kind);

    let last = 0;
    for (const e of events) {
      bytes.push(...vlq(Math.max(0, e.tick - last)));
      bytes.push((e.kind ? 0x90 : 0x80) | spec.ch, e.key, e.vel);
      last = e.tick;
    }
    bytes.push(...vlq(0), 0xff, 0x2f, 0x00);
    tracks.push(chunk('MTrk', bytes));
  }

  const all = header.concat(...tracks);
  return new Blob([new Uint8Array(all)], { type: 'audio/midi' });
}

/* ------------------------------------------------------------------ save */

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

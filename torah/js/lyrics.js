/* Otiyot — the lyrics track.
 *
 * You write the lines; this works out where each one sits against the beat and
 * hands back a timed list the player can follow. One line per bar by default,
 * a blank line is a bar's rest, and a line ending in a run of dots holds for
 * an extra bar per dot.
 *
 * Nothing here generates words — it only places the ones you type.
 */

/** Rough syllable count, used to warn when a line will not fit its bar. */
export function syllables(line) {
  const words = line.toLowerCase().match(/[a-z֐-׿']+/g) || [];
  let n = 0;
  for (const w of words) {
    if (/[֐-׿]/.test(w)) { n += Math.max(1, Math.ceil(w.length / 2)); continue; }
    const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
    n += Math.max(1, groups ? groups.length : 1);
  }
  return n;
}

/**
 * Lay the text out over the bars.
 *
 * @param {string} text        the user's lines
 * @param {object} opt         {bpm, beatsPerBar, barsPerLine, offsetBars}
 * @returns {{lines:Array, barSec:number, total:number}}
 *   lines — {text, index, bar, from, to, syllables, dense}
 */
export function layout(text, opt = {}) {
  const {
    bpm = 120, beatsPerBar = 4, barsPerLine = 1, offsetBars = 0,
  } = opt;

  const barSec = (60 / bpm) * beatsPerBar;
  const raw = (text || '').replace(/\r/g, '').split('\n');
  const lines = [];
  let bar = offsetBars;

  for (let i = 0; i < raw.length; i++) {
    const src = raw[i];
    const trimmed = src.trim();

    if (!trimmed) { bar += barsPerLine; continue; }        // a blank line rests

    // Trailing dots hold the line for another bar each.
    const held = /(\.+)\s*$/.exec(trimmed);
    const extra = held ? held[1].length : 0;
    const body = held ? trimmed.slice(0, held.index).trim() : trimmed;
    if (!body) { bar += barsPerLine + extra; continue; }

    const bars = barsPerLine + extra;
    const syl = syllables(body);
    lines.push({
      text: body,
      index: lines.length,
      bar,
      from: bar * barSec,
      to: (bar + bars) * barSec,
      bars,
      syllables: syl,
      // More than about four syllables a beat and nobody can say it.
      dense: syl / (bars * beatsPerBar) > 4,
    });
    bar += bars;
  }

  return { lines, barSec, total: bar * barSec, bars: bar };
}

/** Which line is sounding at time t, and which comes next. */
export function at(lines, t) {
  let cur = -1;
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i].from && t < lines[i].to) { cur = i; break; }
    if (lines[i].from > t) break;
  }
  if (cur === -1) {
    // Between lines: report the one just gone, so the display does not blank.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].to <= t) return { current: -1, last: i, next: i + 1 < lines.length ? i + 1 : -1 };
    }
    return { current: -1, last: -1, next: lines.length ? 0 : -1 };
  }
  return { current: cur, last: cur, next: cur + 1 < lines.length ? cur + 1 : -1 };
}

/** How far through the current line we are, 0–1 — drives the sweep bar. */
export function progress(line, t) {
  if (!line || t < line.from) return 0;
  return Math.max(0, Math.min(1, (t - line.from) / Math.max(0.001, line.to - line.from)));
}

/** A .lrc file, so the words travel with the audio into other players. */
export function toLrc(lines, title = 'Otiyot') {
  const stamp = s => {
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(2).padStart(5, '0');
    return `[${String(m).padStart(2, '0')}:${rest}]`;
  };
  const head = [`[ti:${title}]`, '[re:Otiyot]', ''];
  return head.concat(lines.map(l => `${stamp(l.from)}${l.text}`)).join('\n') + '\n';
}

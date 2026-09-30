/* Practice tools that sit beside the course. */

import {
  SCALES, CHORDS, TONICS, CIRCLE, KEY_SIG, scaleNotes, chordNotes, scaleFingering,
  pcLabel, fullLabel, noteId, fromMidi, diatonicChords, intervalName, keySigList, accText,
  LETTERS, makeNote, parseNote,
} from "./theory.js";
import { parseExercise } from "./score.js";
import { Staff } from "./staff.js";
import { Keyboard, fitRange } from "./keyboard.js";
import { audio, playNote, noteOff, click, schedule } from "./audio.js";
import { MicListener } from "./listen.js";
import { store, activity } from "./store.js";
import { esc, toast } from "./practice.js";

const $ = (s, r = document) => r.querySelector(s);

export const TOOLS = [
  { id: "scales", icon: "🎼", title: "Scale & Chord finder", sub: "Any scale or chord in any key — with fingering, sound and a practice exercise." },
  { id: "reading", icon: "👁", title: "Note Reading trainer", sub: "Name notes on the staff faster every day. Answer by tapping or on your piano." },
  { id: "ear", icon: "👂", title: "Ear trainer", sub: "Recognize intervals and chord types by sound." },
  { id: "circle", icon: "⭕", title: "Circle of fifths", sub: "All 12 keys, their signatures and chords." },
  { id: "metronome", icon: "⏱", title: "Metronome", sub: "Steady beat with accents, subdivisions and tap tempo." },
  { id: "piano", icon: "🎹", title: "Piano & note finder", sub: "Free play, or play on your piano and see the note's name." },
];

export function renderTool(id, root, nav) {
  const fn = { scales, reading, ear, circle, metronome, piano }[id];
  if (!fn) { root.innerHTML = "<p>Unknown tool.</p>"; return null; }
  const t = TOOLS.find((x) => x.id === id);
  root.innerHTML = `<div class="page tool">
    <header class="page-h"><button class="ibtn" data-nav="#/tools" aria-label="Back">←</button><h2>${t.icon} ${t.title}</h2></header>
    <div class="tool-body"></div></div>`;
  return fn($(".tool-body", root), nav);
}

/* ─── scale & chord finder ─── */
function scales(root, nav) {
  root.innerHTML = `
    <div class="card">
      <div class="seg wide" data-k="kind"><button data-v="scale" class="on">Scales</button><button data-v="chord">Chords</button></div>
      <div class="field-row">
        <label>Root<select data-k="root">${TONICS.map((t) => `<option ${t === "C" ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="type-scale">Type<select data-k="stype">${Object.entries(SCALES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="type-chord" hidden>Type<select data-k="ctype">${Object.entries(CHORDS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("")}</select></label>
        <label class="type-chord" hidden>Inversion<select data-k="inv"><option value="0">Root position</option><option value="1">1st inversion</option><option value="2">2nd inversion</option><option value="3">3rd inversion</option></select></label>
      </div>
      <div class="seg" data-k="hand"><button data-v="R" class="on">Right hand</button><button data-v="L">Left hand</button></div>
    </div>
    <div class="card"><div class="sc-name"></div><div class="sc-notes"></div><div class="kbwrap"></div><div class="sc-info muted"></div>
      <div class="row"><button class="btn btn-play" data-act="play">▶ Play</button><button class="btn btn-go" data-act="practice">✋ Practice this</button></div>
    </div>`;
  const s = { kind: "scale", root: "C", stype: "major", ctype: "maj", inv: 0, hand: "R" };
  const kb = new Keyboard($(".kbwrap", root), { lo: 48, hi: 84, labels: "all", onPress: (m) => playNote(m, { sustain: true }), onRelease: noteOff });
  let cur = [];
  const update = () => {
    root.querySelectorAll(".type-scale").forEach((e) => (e.hidden = s.kind !== "scale"));
    root.querySelectorAll(".type-chord").forEach((e) => (e.hidden = s.kind !== "chord"));
    const oct = s.hand === "R" ? 4 : 3;
    if (s.kind === "scale") {
      cur = scaleNotes(s.root, s.stype, oct);
      const fg = scaleFingering(s.root, s.stype);
      const fing = fg && cur.length === 8 ? fg[s.hand] : null;
      $(".sc-name", root).textContent = `${pcLabel(parseNote(s.root + "4"))} ${SCALES[s.stype].name}`;
      $(".sc-notes", root).innerHTML = cur.map((n, i) => `<span class="chip">${pcLabel(n)}${fing ? `<i class="fbadge f-${s.hand}">${fing[i]}</i>` : ""}</span>`).join("");
      const ks = s.stype === "major" ? KEY_SIG[s.root] : ["natural_minor", "harmonic_minor", "melodic_minor"].includes(s.stype) ? KEY_SIG[s.root + "m"] : undefined;
      $(".sc-info", root).innerHTML = `Steps: <b>${SCALES[s.stype].steps}</b>` +
        (ks !== undefined ? ` · Key signature: <b>${ks === 0 ? "none" : Math.abs(ks) + (ks > 0 ? " ♯" : " ♭")}</b>` : "") +
        (fing ? ` · Fingering (${s.hand === "R" ? "right" : "left"} hand): <b>${fing.join(" ")}</b>` : " · Fingering: use the pattern that avoids the thumb on black keys.");
      kb.setRange(...fitRange(cur[0].midi - 1, cur[cur.length - 1].midi + 1, 15));
      kb.setTargets(cur.map((n, i) => ({ midi: n.midi, finger: fing ? fing[i] : null, hand: s.hand })));
    } else {
      cur = chordNotes(s.root, s.ctype, oct, Math.min(s.inv, CHORDS[s.ctype].f.length - 1));
      const f = chordFingers(cur.length, s.hand, s.inv);
      const name = pcLabel(parseNote(s.root + "4")) + CHORDS[s.ctype].sym;
      $(".sc-name", root).textContent = `${name} — ${CHORDS[s.ctype].name}`;
      const rootChord = chordNotes(s.root, s.ctype, oct, 0);
      $(".sc-notes", root).innerHTML = rootChord.map((n, i) => `<span class="chip">${pcLabel(n)}<small>${CHORDS[s.ctype].parts[i]}</small></span>`).join("");
      $(".sc-info", root).innerHTML = `Fingering: <b>${f.join("-")}</b> · Built from: ${CHORDS[s.ctype].parts.join(" + ")}`;
      kb.setRange(...fitRange(cur[0].midi - 3, cur[cur.length - 1].midi + 3, 15));
      kb.setTargets(cur.map((n, i) => ({ midi: n.midi, finger: f[i], hand: s.hand })));
    }
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".seg button");
    if (b) {
      const k = b.parentElement.dataset.k;
      s[k] = b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      update();
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "play") {
      audio();
      if (s.kind === "scale") {
        const seq = [...cur, ...cur.slice(0, -1).reverse()];
        seq.forEach((n, i) => playNote(n.midi, { when: audio().currentTime + 0.05 + i * 0.28, dur: 0.3 }));
      } else {
        cur.forEach((n, i) => playNote(n.midi, { when: audio().currentTime + 0.05 + i * 0.25, dur: 0.6 }));
        cur.forEach((n) => playNote(n.midi, { when: audio().currentTime + 0.1 + cur.length * 0.25, dur: 1.6 }));
      }
    }
    if (act === "practice") {
      const ex = s.kind === "scale" ? scaleExercise(s.root, s.stype, s.hand) : chordExercise(s.root, s.ctype, s.hand);
      nav.practiceTemp(ex, $(".sc-name", root).textContent);
    }
  });
  root.addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    s[k] = k === "inv" ? +e.target.value : e.target.value;
    update();
  });
  update();
  return { cleanup: () => kb.destroy() };
}

function chordFingers(n, hand, inv) {
  if (n === 3) return hand === "R" ? [[1, 3, 5], [1, 2, 5], [1, 3, 5]][inv] || [1, 3, 5] : [[5, 3, 1], [5, 3, 1], [5, 2, 1]][inv] || [5, 3, 1];
  if (n === 4) return hand === "R" ? [1, 2, 3, 5] : [5, 3, 2, 1];
  return hand === "R" ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
}

function keyFor(root, type) {
  if (type === "major" && KEY_SIG[root] !== undefined) return root;
  if (/minor/.test(type) && KEY_SIG[root + "m"] !== undefined) return root + "m";
  return "C";
}

export function scaleExercise(root, type, hand) {
  const oct = hand === "R" ? 4 : 3;
  const notes = scaleNotes(root, type, oct);
  const fg = scaleFingering(root, type);
  const fing = fg && notes.length === 8 ? fg[hand] : null;
  let seq = [...notes.map((n, i) => [n, fing?.[i]]), ...notes.slice(0, -1).reverse().map((n, i, arr) => [n, fing?.[arr.length - 1 - i]])];
  if (type === "melodic_minor") {
    const down = scaleNotes(root, "natural_minor", oct);
    seq = [...notes.map((n, i) => [n, fing?.[i]]), ...down.slice(0, -1).reverse().map((n, i, arr) => [n, fing?.[arr.length - 1 - i]])];
  }
  const tok = seq.map(([n, f], i) => noteId(n) + (f ? "-" + f : "") + (i === 0 ? "q" : i === seq.length - 1 ? "h" : ""));
  /* pad so the last note is a half note on a bar line */
  const beats = seq.length - 1 + 2;
  const pad = (4 - (beats % 4)) % 4;
  const str = tok.join(" ") + (pad ? " r" + ({ 1: "q", 2: "h", 3: "h." }[pad]) : "");
  const lbl = `${root} ${SCALES[type].name}`;
  return { title: lbl, ts: "4/4", tempo: 72, key: keyFor(root, type), [hand === "R" ? "rh" : "lh"]: str };
}

function chordExercise(root, type, hand) {
  const oct = hand === "R" ? 4 : 3;
  const n = CHORDS[type].f.length;
  const invs = Math.min(n, 4);
  const blocks = [];
  for (let i = 0; i < invs; i++) {
    const ns = chordNotes(root, type, oct, i);
    const f = chordFingers(ns.length, hand, i);
    blocks.push(ns.map((x, j) => noteId(x) + "-" + f[j]).join("+") + "h");
  }
  const rootPos = chordNotes(root, type, oct, 0);
  const f0 = chordFingers(rootPos.length, hand, 0);
  const broken = rootPos.map((x, j) => noteId(x) + "-" + f0[j] + (j === 0 ? "q" : "")).join(" ");
  const brokenBeats = rootPos.length;
  const pad = (4 - ((invs * 2 + brokenBeats) % 4)) % 4;
  const str = blocks.join(" ") + " " + broken + (pad ? " r" + ({ 1: "q", 2: "h", 3: "h." }[pad]) : "");
  return { title: "Inversions, then broken", ts: "4/4", tempo: 66, [hand === "R" ? "rh" : "lh"]: str };
}

/* ─── note reading trainer ─── */
function reading(root) {
  root.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="seg" data-k="clef"><button data-v="treble" class="on">Treble</button><button data-v="bass">Bass</button><button data-v="both">Both</button></div>
        <div class="seg" data-k="range"><button data-v="staff" class="on">On the staff</button><button data-v="ledger">+ Ledger lines</button><button data-v="acc">+ Sharps/flats</button></div>
      </div>
    </div>
    <div class="card trainer">
      <div class="tr-stats"><span class="sc">0 / 0</span><span class="streak"></span><span class="timer"></span></div>
      <div class="tr-staff"></div>
      <div class="tr-fb">Which note is this?</div>
      <div class="letters">${LETTERS.map((l, i) => `<button class="btn" data-l="${i}">${l}</button>`).join("")}</div>
      <div class="kbwrap"></div>
      <div class="row"><button class="btn" data-act="round">⏱ 60-second round</button><button class="btn sm tog" data-act="mic">🎤 Answer on my piano</button></div>
      <p class="muted small">Best 60-second score: <b class="best"></b></p>
    </div>`;
  const s = { clef: "treble", range: "staff", total: 0, right: 0, streak: 0, cur: null, roundEnd: 0, mic: null, lock: false };
  const staff = new Staff($(".tr-staff", root));
  staff.showFingers = false;
  const kb = new Keyboard($(".kbwrap", root), { lo: 36, hi: 84, labels: "c", onPress: (m) => { playNote(m, { sustain: true }); answerMidi(m); }, onRelease: noteOff });
  const bestEl = $(".best", root);
  const showBest = () => (bestEl.textContent = store.best("reading60") || "—");
  showBest();

  const pools = {
    treble: { staff: [30, 38], ledger: [26, 43] },
    bass: { staff: [18, 26], ledger: [14, 30] },
  };
  function next() {
    const clef = s.clef === "both" ? (Math.random() < 0.5 ? "treble" : "bass") : s.clef;
    const [a, b] = pools[clef][s.range === "staff" ? "staff" : "ledger"];
    let n;
    do {
      const step = a + Math.floor(Math.random() * (b - a + 1));
      const acc = s.range === "acc" ? [-1, 0, 0, 1][Math.floor(Math.random() * 4)] : 0;
      n = makeNote(step % 7, acc, Math.floor(step / 7));
    } while (s.cur && n.midi === s.cur.midi && n.step === s.cur.step);
    s.cur = n;
    s.clefNow = clef;
    s.shownAt = performance.now();
    const tokn = noteId(n) + "w";
    staff.render(parseExercise({ ts: "4/4", bare: true, [clef === "treble" ? "rh" : "lh"]: tokn }));
    kb.setRange(clef === "treble" ? 52 : 31, clef === "treble" ? 84 : 64);
    $(".tr-fb", root).textContent = "Which note is this?";
    $(".tr-fb", root).className = "tr-fb";
    s.lock = false;
  }
  function answer(correct, label) {
    if (s.lock) return;
    activity();
    s.total++;
    const fb = $(".tr-fb", root);
    if (correct) {
      s.right++; s.streak++;
      fb.textContent = `✓ ${fullLabel(s.cur)}${s.streak >= 5 ? ` — ${s.streak} in a row!` : ""}`;
      fb.className = "tr-fb good";
      playNote(s.cur.midi, { dur: 0.5 });
      s.lock = true;
      setTimeout(next, 550);
    } else {
      s.streak = 0;
      fb.textContent = `✗ Not ${label} — try again`;
      fb.className = "tr-fb bad";
    }
    $(".sc", root).textContent = `${s.right} / ${s.total}`;
    $(".streak", root).textContent = s.streak >= 3 ? `🔥 ${s.streak}` : "";
  }
  function answerMidi(m) {
    if (!s.cur) return;
    const ok = m === s.cur.midi;
    const samePc = ((m - s.cur.midi) % 12 + 12) % 12 === 0;
    if (!ok && samePc) { $(".tr-fb", root).textContent = "Right note — wrong octave. Look at the clef again."; $(".tr-fb", root).className = "tr-fb bad"; return; }
    answer(ok, fullLabel(fromMidi(m)));
  }
  root.addEventListener("click", async (e) => {
    const b = e.target.closest(".seg button");
    if (b) {
      s[b.parentElement.dataset.k] = b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      next();
      return;
    }
    const l = e.target.closest("[data-l]");
    if (l) {
      const li = +l.dataset.l;
      if (s.range === "acc") answer(li === s.cur.li, LETTERS[li] + " (look at the ♯/♭ too — tap the key instead)");
      else answer(li === s.cur.li, LETTERS[li]);
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "round") startRound();
    if (act === "mic") {
      if (s.mic) { s.mic.stop(); s.mic = null; e.target.classList.remove("on"); return; }
      try {
        const good = { n: 0 };
        s.mic = new MicListener((f) => {
          if (f.midi == null || f.clarity < 0.85 || !s.cur || s.lock) { good.n = 0; return; }
          const m = Math.round(f.midi);
          if (((m - s.cur.midi) % 12 + 12) % 12 === 0) { if (++good.n >= 2) { good.n = 0; answer(true); } }
          else good.n = 0;
        });
        await s.mic.start();
        e.target.classList.add("on");
      } catch (err) { toast(null, "Microphone unavailable: " + (err.message || err)); }
    }
  });
  let timer = 0;
  function startRound() {
    s.total = 0; s.right = 0; s.streak = 0;
    s.roundEnd = performance.now() + 60000;
    clearInterval(timer);
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((s.roundEnd - performance.now()) / 1000));
      $(".timer", root).textContent = `⏱ ${left}s`;
      if (left <= 0) {
        clearInterval(timer);
        const rec = store.best("reading60", s.right);
        $(".tr-fb", root).textContent = `Time! ${s.right} correct${rec ? " — new record! 🏆" : ""}`;
        $(".tr-fb", root).className = "tr-fb good";
        $(".timer", root).textContent = "";
        s.lock = true;
        showBest();
        setTimeout(next, 2500);
      }
    }, 250);
    $(".sc", root).textContent = "0 / 0";
    next();
  }
  next();
  return { cleanup: () => { clearInterval(timer); s.mic?.stop(); kb.destroy(); } };
}

/* ─── ear trainer ─── */
function ear(root) {
  const EASY = [2, 4, 5, 7, 12], ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const QUAL = ["maj", "min", "dim", "aug"];
  root.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="seg" data-k="mode"><button data-v="int" class="on">Intervals</button><button data-v="chord">Chords</button></div>
        <div class="seg" data-k="level"><button data-v="easy" class="on">Easy</button><button data-v="all">All</button></div>
        <div class="seg" data-k="dir"><button data-v="up" class="on">Up</button><button data-v="down">Down</button><button data-v="harm">Together</button></div>
      </div>
    </div>
    <div class="card trainer">
      <div class="tr-stats"><span class="sc">0 / 0</span><span class="streak"></span></div>
      <div class="row"><button class="btn btn-play big-btn" data-act="play">▶ Play</button><button class="btn" data-act="next">Next ›</button></div>
      <div class="tr-fb">Listen, then choose.</div>
      <div class="opts"></div>
      <p class="muted small">Tip: link intervals to songs you know — a perfect 4th starts “Here Comes the Bride”, a perfect 5th “Twinkle Twinkle” (C→G), a major 6th “My Bonnie”, an octave “Somewhere Over the Rainbow”.</p>
    </div>`;
  const s = { mode: "int", level: "easy", dir: "up", total: 0, right: 0, streak: 0, q: null, answered: false };
  const newQ = () => {
    const base = 55 + Math.floor(Math.random() * 12);
    if (s.mode === "int") {
      const pool = s.level === "easy" ? EASY : ALL;
      const semi = pool[Math.floor(Math.random() * pool.length)];
      s.q = { base, semi, opts: pool.map((x) => ({ v: x, l: intervalName(x) })), ans: semi };
    } else {
      const pool = s.level === "easy" ? ["maj", "min"] : QUAL;
      const t = pool[Math.floor(Math.random() * pool.length)];
      s.q = { base, chord: t, opts: pool.map((x) => ({ v: x, l: CHORDS[x].name })), ans: t };
    }
    s.answered = false;
    $(".opts", root).innerHTML = s.q.opts.map((o) => `<button class="btn" data-v="${o.v}">${o.l}</button>`).join("");
    $(".tr-fb", root).textContent = "Listen, then choose.";
    $(".tr-fb", root).className = "tr-fb";
    play();
  };
  const play = () => {
    const c = audio(), t = c.currentTime + 0.05;
    if (s.mode === "int") {
      const a = s.q.base, b = s.q.base + s.q.semi;
      if (s.dir === "harm") { playNote(a, { when: t, dur: 1.4 }); playNote(b, { when: t, dur: 1.4 }); }
      else if (s.dir === "up") { playNote(a, { when: t, dur: 0.7 }); playNote(b, { when: t + 0.75, dur: 1.0 }); }
      else { playNote(b, { when: t, dur: 0.7 }); playNote(a, { when: t + 0.75, dur: 1.0 }); }
    } else {
      const f = CHORDS[s.q.chord].f.map(([, semi]) => s.q.base + semi);
      f.forEach((m, i) => playNote(m, { when: t + i * 0.3, dur: 0.5 }));
      f.forEach((m) => playNote(m, { when: t + f.length * 0.3 + 0.1, dur: 1.5 }));
    }
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".seg button");
    if (b) {
      s[b.parentElement.dataset.k] = b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      newQ();
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "play") { if (!s.q) newQ(); else play(); }
    if (act === "next") newQ();
    const o = e.target.closest(".opts [data-v]");
    if (o && s.q && !s.answered) {
      activity();
      const v = s.mode === "int" ? +o.dataset.v : o.dataset.v;
      const fb = $(".tr-fb", root);
      s.total++;
      if (v === s.q.ans) {
        s.right++; s.streak++; s.answered = true;
        fb.textContent = "✓ Correct!"; fb.className = "tr-fb good";
        o.classList.add("good");
        store.best("ear_streak", s.streak);
        setTimeout(newQ, 1100);
      } else {
        s.streak = 0;
        fb.textContent = "✗ Not quite — listen again"; fb.className = "tr-fb bad";
        o.classList.add("bad");
        play();
      }
      $(".sc", root).textContent = `${s.right} / ${s.total}`;
      $(".streak", root).textContent = s.streak >= 3 ? `🔥 ${s.streak}` : "";
    }
  });
  $(".opts", root).innerHTML = `<p class="muted">Press ▶ Play to start.</p>`;
  return { cleanup() {} };
}

/* ─── circle of fifths ─── */
function circle(root, nav) {
  root.innerHTML = `<div class="card circle-card"><div class="cof"></div><div class="cof-info"></div></div>`;
  const R1 = 150, R2 = 108, R3 = 70, C = 160;
  let sel = 0;
  const seg = (i, r0, r1) => {
    const a0 = ((i - 0.5) * 30 - 90) * Math.PI / 180, a1 = ((i + 0.5) * 30 - 90) * Math.PI / 180;
    const p = (r, a) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
    return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const lbl = (name) => name[0] + name.slice(1).replace("#", "♯").replace("b", "♭");
  const draw = () => {
    let svg = `<svg viewBox="0 0 320 320" class="cof-svg">`;
    CIRCLE.forEach((k, i) => {
      const a = (i * 30 - 90) * Math.PI / 180;
      svg += `<path d="${seg(i, R2, R1)}" class="cof-seg ${i === sel ? "on" : ""}" data-i="${i}"/>`;
      svg += `<path d="${seg(i, R3, R2)}" class="cof-seg min ${i === sel ? "on" : ""}" data-i="${i}"/>`;
      svg += `<text x="${C + 129 * Math.cos(a)}" y="${C + 129 * Math.sin(a) + 6}" class="cof-t">${lbl(k.maj)}${k.alt ? "/" + lbl(k.alt) : ""}</text>`;
      svg += `<text x="${C + 89 * Math.cos(a)}" y="${C + 89 * Math.sin(a) + 5}" class="cof-t sm">${lbl(k.min)}</text>`;
    });
    const n = KEY_SIG[CIRCLE[sel].maj];
    svg += `<text x="${C}" y="${C - 4}" class="cof-c">${Math.abs(n) || "0"}${n > 0 ? "♯" : n < 0 ? "♭" : ""}</text><text x="${C}" y="${C + 18}" class="cof-c sm">${n === 0 ? "no sharps/flats" : keySigList(CIRCLE[sel].maj).map(([li, a]) => LETTERS[li] + accText(a)).join(" ")}</text></svg>`;
    $(".cof", root).innerHTML = svg;
    const k = CIRCLE[sel];
    const chords = diatonicChords(k.maj);
    const sc = scaleNotes(k.maj, "major", 4);
    $(".cof-info", root).innerHTML = `
      <h3>${lbl(k.maj)} major <span class="muted">· relative minor ${lbl(k.min)}</span></h3>
      <p>Scale: ${sc.map((x) => `<span class="chip">${pcLabel(x)}</span>`).join("")}</p>
      <p class="muted small">Chords of the key — tap to hear:</p>
      <div class="chords">${chords.map((c, i) => `<button class="btn chord-btn" data-c="${i}"><small>${c.roman}</small><b>${c.name}</b></button>`).join("")}</div>
      <div class="row"><button class="btn btn-go" data-act="scale">✋ Practice ${lbl(k.maj)} major scale</button></div>`;
    $(".cof-info", root).dataset.sel = sel;
  };
  root.addEventListener("click", (e) => {
    const sg = e.target.closest("[data-i]");
    if (sg) { sel = +sg.dataset.i; draw(); const r = parseNote(CIRCLE[sel].maj + "4"); [0, 4, 7].forEach((x) => playNote(r.midi + x - (r.midi > 64 ? 12 : 0), { dur: 1 })); }
    const cb = e.target.closest("[data-c]");
    if (cb) {
      const c = diatonicChords(CIRCLE[sel].maj)[+cb.dataset.c];
      const drop = c.notes[0].midi > 66 ? 12 : 0;
      c.notes.forEach((n) => playNote(n.midi - drop, { dur: 1.2 }));
      playNote(c.notes[0].midi - drop - 12, { dur: 1.2 });
    }
    if (e.target.closest("[data-act=scale]")) nav.practiceTemp(scaleExercise(CIRCLE[sel].maj, "major", "R"), lbl(CIRCLE[sel].maj) + " major scale");
  });
  draw();
  return { cleanup() {} };
}

/* ─── metronome ─── */
function metronome(root) {
  root.innerHTML = `
    <div class="card metro">
      <div class="m-bpm"><button class="btn round" data-d="-5">−5</button><button class="btn round" data-d="-1">−</button><div><b class="bpmv">80</b><small>bpm</small><div class="m-name muted"></div></div><button class="btn round" data-d="1">+</button><button class="btn round" data-d="5">+5</button></div>
      <input type="range" min="30" max="240" value="80" class="m-range">
      <div class="m-dots"></div>
      <div class="field-row">
        <label>Beats per bar<select data-k="beats"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option></select></label>
        <label>Subdivide<select data-k="sub"><option value="1">Beats only</option><option value="2">Eighths</option><option value="3">Triplets</option><option value="4">Sixteenths</option></select></label>
      </div>
      <div class="row"><button class="btn btn-play big-btn" data-act="go">▶ Start</button><button class="btn" data-act="tap">Tap tempo</button></div>
      <p class="muted small">Pro tip: find the tempo where you play with zero mistakes, then add 4 bpm per day.</p>
    </div>`;
  const s = { bpm: 80, beats: 4, sub: 1, on: false, taps: [] };
  const name = (b) => (b < 60 ? "Largo" : b < 76 ? "Adagio" : b < 108 ? "Andante / Moderato" : b < 120 ? "Moderato" : b < 168 ? "Allegro" : "Presto");
  const show = () => {
    $(".bpmv", root).textContent = s.bpm;
    $(".m-range", root).value = s.bpm;
    $(".m-name", root).textContent = name(s.bpm);
    $(".m-dots", root).innerHTML = Array.from({ length: s.beats }, (_, i) => `<i data-b="${i}"></i>`).join("");
  };
  let next = 0, beat = 0, subi = 0, timer = 0;
  const loop = () => {
    const c = audio();
    while (next < c.currentTime + 0.12) {
      const accent = subi === 0 && beat === 0;
      if (subi === 0) click(next, accent);
      else {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 900; g.gain.setValueAtTime(0.04, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.03);
        o.connect(g).connect(c.destination); o.start(next); o.stop(next + 0.04);
      }
      if (subi === 0) {
        const b = beat, when = next;
        setTimeout(() => {
          root.querySelectorAll(".m-dots i").forEach((d, i) => d.classList.toggle("on", i === b));
        }, Math.max(0, (when - c.currentTime) * 1000));
      }
      next += 60 / s.bpm / s.sub;
      subi++;
      if (subi >= s.sub) { subi = 0; beat = (beat + 1) % s.beats; }
    }
    timer = setTimeout(loop, 25);
  };
  const start = () => { audio(); s.on = true; next = audio().currentTime + 0.1; beat = 0; subi = 0; loop(); $("[data-act=go]", root).textContent = "■ Stop"; };
  const stop = () => { s.on = false; clearTimeout(timer); $("[data-act=go]", root).textContent = "▶ Start"; root.querySelectorAll(".m-dots i").forEach((d) => d.classList.remove("on")); };
  root.addEventListener("click", (e) => {
    const d = e.target.closest("[data-d]");
    if (d) { s.bpm = Math.max(30, Math.min(240, s.bpm + +d.dataset.d)); show(); }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "go") s.on ? stop() : start();
    if (act === "tap") {
      const t = performance.now();
      s.taps = s.taps.filter((x) => t - x < 3000);
      s.taps.push(t);
      if (s.taps.length >= 2) {
        const iv = (s.taps[s.taps.length - 1] - s.taps[0]) / (s.taps.length - 1);
        s.bpm = Math.max(30, Math.min(240, Math.round(60000 / iv)));
        show();
      }
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.classList.contains("m-range")) { s.bpm = +e.target.value; show(); }
    if (e.target.dataset.k === "beats") { s.beats = +e.target.value; show(); }
    if (e.target.dataset.k === "sub") s.sub = +e.target.value;
  });
  show();
  return { cleanup: stop };
}

/* ─── free piano + note finder ─── */
function piano(root) {
  root.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="oct"><button class="btn sm" data-o="-1">◀ Lower</button><span class="oct-l"></span><button class="btn sm" data-o="1">Higher ▶</button></div>
        <div class="seg" data-k="labels"><button data-v="all" class="on">All names</button><button data-v="c">C only</button><button data-v="none">None</button></div>
        <button class="btn sm tog" data-act="mic">🎤 Note finder</button>
      </div>
    </div>
    <div class="card finder"><div class="nf-big">—</div><div class="nf-sub muted">Tap a key — or turn on 🎤 and play any note on your piano to see its name and where it's written.</div><div class="nf-staff"></div></div>
    <div class="kbwrap tall"></div>`;
  let base = 48;
  const span = () => (root.clientWidth < 520 ? 12 : 24);
  const kb = new Keyboard($(".kbwrap", root), { lo: base, hi: base + span(), labels: "all", onPress: (m) => { playNote(m, { sustain: true }); showNote(m); activity(); }, onRelease: noteOff });
  const staffEl = $(".nf-staff", root);
  const staff = new Staff(staffEl);
  staff.showFingers = false;
  const setRange = () => { kb.setRange(base, base + span()); $(".oct-l", root).textContent = `${fullLabel(fromMidi(base))} – ${fullLabel(fromMidi(base + span()))}`; };
  function showNote(m) {
    const n = fromMidi(m);
    const alt = n.acc ? fromMidi(m, true) : null;
    $(".nf-big", root).textContent = alt ? `${pcLabel(n)} / ${pcLabel(alt)}` : pcLabel(n);
    $(".nf-sub", root).textContent = `${fullLabel(n)}${m === 60 ? " — middle C" : ""} · ${m < 60 ? "usually written in the bass clef" : "usually written in the treble clef"}`;
    staff.render(parseExercise({ ts: "4/4", bare: true, [m < 60 ? "lh" : "rh"]: noteId(n) + "w" }));
    kb.setState(m, "press", 600);
  }
  let mic = null, last = null, cnt = 0;
  root.addEventListener("click", async (e) => {
    const o = e.target.closest("[data-o]");
    if (o) { base = Math.max(21, Math.min(108 - span(), base + 12 * +o.dataset.o)); setRange(); }
    const b = e.target.closest(".seg button");
    if (b) { kb.setLabels(b.dataset.v); b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }
    if (e.target.closest("[data-act=mic]")) {
      const btn = e.target.closest("[data-act=mic]");
      if (mic) { mic.stop(); mic = null; btn.classList.remove("on"); return; }
      try {
        mic = new MicListener((f) => {
          if (f.midi == null || f.clarity < 0.85) { cnt = 0; return; }
          const m = Math.round(f.midi);
          cnt = m === last ? cnt + 1 : 0;
          last = m;
          if (cnt === 2) {
            if (m < base || m > base + span()) { base = Math.max(21, Math.min(108 - span(), m - (m % 12) - (span() > 12 ? 12 : 0))); setRange(); }
            showNote(m);
          }
        });
        await mic.start();
        btn.classList.add("on");
      } catch (err) { toast(null, "Microphone unavailable: " + (err.message || err)); }
    }
  });
  setRange();
  return { cleanup: () => { mic?.stop(); kb.destroy(); } };
}

/* The practice screen: sheet music on top, keyboard at the bottom.

   ▶ Listen        the app plays the piece, lighting up notes and keys.
   ✋ Step by step  the app waits at each step until you play it — on your real
                   piano (microphone or MIDI) or by tapping the screen.
   🎯 Play along    the music moves in time; every note you hit on the beat
                   scores. The app can play the other hand for you.

   Any of them can be limited to a few bars (tap the music, or "Bars"). */

import { parseExercise, buildSteps, scoreRange, pedalRelease } from "./score.js";
import { Staff } from "./staff.js";
import { Keyboard, fitRange } from "./keyboard.js";
import { audio, playNote, noteOff, click, schedule } from "./audio.js";
import { MicListener, MidiInput } from "./listen.js";
import { pcLabel, fullLabel, fromMidi, getNameStyle } from "./theory.js";
import { store, activity } from "./store.js";

const $ = (sel, root = document) => root.querySelector(sel);
const PC = (m) => ((Math.round(m) % 12) + 12) % 12;
const EPS = 1e-6;

let sharedMidi = null;
const midiHandlers = { on: null, off: null, status: null };

export function openPractice(root, { ex, title, onBack, onComplete, resultKey }) {
  const score = parseExercise(ex);
  const st = {
    hands: score.hands.join(""),
    tempo: score.tempo,
    mode: "idle",
    loop: false,
    stepIdx: 0,
    mistakes: 0,
    started: 0,
    steps: [],
    recent: new Map(),
    mic: null,
    micState: { fresh: true, good: 0, bad: 0, badCounted: false },
    playing: null,
    voices: [],
    raf: 0,
    from: 0,                 // section start (beats)
    to: score.end,           // section end (beats)
    perfectRuns: 0,
  };

  /* bar boundaries: [start, end) of each measure */
  const barStarts = [0, ...score.bars];
  const bars = barStarts.map((b, i) => ({ n: score.pickup > 0 ? i : i + 1, from: b, to: barStarts[i + 1] ?? score.end }));
  const barOfTime = (t) => bars.findIndex((b) => t >= b.from - EPS && t < b.to - EPS);

  root.innerHTML = `
  <div class="pr">
    <header class="pr-top">
      <button class="ibtn" data-a="back" aria-label="Back">←</button>
      <div class="pr-title"><b>${esc(title)}</b><span>${esc(ex.title || "")}</span></div>
      <button class="ibtn" data-a="full" aria-label="Full screen" title="Full screen">⛶</button>
      <button class="ibtn" data-a="opts" aria-label="Options" title="Options">⚙</button>
    </header>
    <div class="pr-staff" tabindex="0" title="Tap a bar to practice from there"></div>
    <div class="pr-now">
      <div class="now-main"><span class="now-step"></span><span class="now-what"></span></div>
      <div class="now-hear" hidden><span class="lvl"><i></i></span><span class="hear-txt">Listening…</span></div>
    </div>
    <div class="pr-kb"></div>
    <div class="pr-ctrl">
      <div class="grp">
        <button class="btn btn-play" data-a="watch" title="Hear it played (Space)">▶ Listen</button>
        <button class="btn btn-go" data-a="wait" title="Play it yourself, one step at a time (Enter)">✋ Step by step</button>
        <button class="btn btn-along" data-a="along" title="Play in time with the music">🎯 Play along</button>
      </div>
      <div class="grp grp-step" hidden>
        <button class="btn sm" data-a="prev" aria-label="Previous step">‹</button>
        <button class="btn sm" data-a="hint">🔊 Hint</button>
        <button class="btn sm" data-a="next" aria-label="Skip step">›</button>
      </div>
      <div class="grp">
        <div class="seg" data-a="hands"></div>
        <div class="tempo"><button class="btn sm" data-a="slower" aria-label="Slower">−</button><span class="bpm"></span><button class="btn sm" data-a="faster" aria-label="Faster">+</button></div>
        <button class="btn sm" data-a="section" title="Practice only some bars">📍 <span class="sec-l">All bars</span></button>
      </div>
      <div class="grp">
        <button class="btn sm tog" data-a="mic" title="Listen to my piano through the microphone">🎤 Mic</button>
        <button class="btn sm tog" data-a="midi" title="Use a MIDI keyboard">🎹 MIDI</button>
        <button class="btn sm tog" data-a="loop" title="Repeat">🔁</button>
        <button class="btn sm tog" data-a="click" title="Metronome click">⏱</button>
        <button class="btn sm tog" data-a="rec" title="Record yourself and listen back">⏺</button>
      </div>
    </div>
    <div class="pr-sec pop" hidden>
      <b>Practice bars</b>
      <div class="sec-row"><label>From <select data-s="from"></select></label><label>to <select data-s="to"></select></label></div>
      <p class="muted small">Tip: tap on the music to start from that bar. Professionals practice the hardest 1–2 bars slowly, then join them to the bars around them.</p>
      <div class="row"><button class="btn sm" data-a="secAll">Whole piece</button><button class="btn sm btn-play" data-a="secClose">Done</button></div>
    </div>
    <div class="pr-opts pop" hidden>
      <b>Options</b>
      <label>Key names on the keyboard
        <select data-o="labels"><option value="all">All keys</option><option value="c">C only</option><option value="none">None</option></select></label>
      <label><input type="checkbox" data-o="fingers"> Finger numbers on the music</label>
      <label><input type="checkbox" data-o="speak"> Say the notes out loud</label>
      <label><input type="checkbox" data-o="accompany"> Play the other hand for me</label>
      <label><input type="checkbox" data-o="countIn"> Count-in bar before playing</label>
      <label><input type="checkbox" data-o="autoSpeed"> Speed up 5 bpm after a perfect run</label>
      <label>Music size <input type="range" min="0.7" max="1.6" step="0.1" data-o="zoom"></label>
      <label>Sound <select data-o="sound"><option value="piano">Grand piano</option><option value="synth">Simple synth</option></select></label>
      <label>Mic sensitivity <input type="range" min="0.5" max="2.5" step="0.1" data-o="micSens"></label>
      <p class="muted small">🎤 Put the phone near the piano in a quiet room. Single notes are detected reliably; for chords a MIDI keyboard is exact. Keys on the screen always work.</p>
      <p class="muted small">Keyboard: Space = listen · Enter = step by step · Esc = stop</p>
    </div>
    <div class="pr-result" hidden></div>
  </div>`;

  const staffEl = $(".pr-staff", root);
  const staff = new Staff(staffEl, { fit: true });
  staff.showFingers = store.setting("fingers");
  staff.zoom = store.setting("zoom") || 1;
  staff.render(score);

  let [lo, hi] = scoreRange(score);
  const narrow = root.clientWidth < 520;
  [lo, hi] = fitRange(lo - 2, hi + 2, narrow ? 10 : 15);
  const kb = new Keyboard($(".pr-kb", root), {
    lo, hi, labels: store.setting("labels"),
    onPress: (m) => noteOn(m, 0.7, "touch"),
    onRelease: (m) => noteOff(m),
    maxHeight: () => Math.min(260, window.innerHeight * (window.innerHeight < 520 ? 0.36 : 0.3)),
  });

  /* keep the screen awake while practicing */
  let wakeLock = null;
  const lockScreen = async () => { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not allowed */ } };
  const onVis = () => { if (document.visibilityState === "visible") lockScreen(); };
  lockScreen();
  document.addEventListener("visibilitychange", onVis);

  if (window.innerHeight > window.innerWidth && window.innerWidth < 600 && !sessionStorage.getItem("pp-rot")) {
    sessionStorage.setItem("pp-rot", "1");
    setTimeout(() => toast(root, "📱↻ Tip: turn your phone sideways for a bigger keyboard and music."), 600);
  }

  /* ---------- controls ---------- */
  const handsSeg = $("[data-a=hands]", root);
  const handOpts = score.hands.length > 1 ? [["RL", "Both hands"], ["R", "Right"], ["L", "Left"]] : [[score.hands[0], score.hands[0] === "R" ? "Right hand" : "Left hand"]];
  handsSeg.innerHTML = handOpts.map(([v, l]) => `<button data-h="${v}" class="${v === st.hands ? "on" : ""}">${l}</button>`).join("");
  handsSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-h]");
    if (!b) return;
    st.hands = b.dataset.h;
    handsSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    stopAll();
    showIdle();
  });
  const bpmEl = $(".bpm", root);
  const showBpm = () => (bpmEl.textContent = `${st.tempo} bpm`);
  showBpm();
  $("[data-a=click]", root).classList.toggle("on", store.setting("click"));

  /* section (bars) */
  const secPop = $(".pr-sec", root);
  const selFrom = $("[data-s=from]", secPop), selTo = $("[data-s=to]", secPop);
  const barOpts = bars.map((b, i) => `<option value="${i}">${b.n === 0 ? "pickup" : "bar " + b.n}</option>`).join("");
  selFrom.innerHTML = barOpts; selTo.innerHTML = barOpts;
  function setSection(fi, ti) {
    fi = Math.max(0, Math.min(fi, bars.length - 1));
    ti = Math.max(fi, Math.min(ti, bars.length - 1));
    st.from = bars[fi].from; st.to = bars[ti].to;
    selFrom.value = fi; selTo.value = ti;
    const all = fi === 0 && ti === bars.length - 1;
    $(".sec-l", root).textContent = all ? "All bars" : fi === ti ? `Bar ${bars[fi].n}` : `Bars ${bars[fi].n}–${bars[ti].n}`;
    $("[data-a=section]", root).classList.toggle("on", !all);
    staff.setSection(all ? null : st.from, st.to);
  }
  setSection(0, bars.length - 1);
  secPop.addEventListener("change", () => { stopAll(); setSection(+selFrom.value, +selTo.value); showIdle(); });

  staffEl.addEventListener("click", (e) => {
    if (st.mode === "watch" || st.mode === "along") return;
    const t = staff.timeAt(e.clientX);
    if (t == null) return;
    const bi = Math.max(0, barOfTime(t));
    if (st.mode === "wait") {
      const idx = st.steps.findIndex((s) => s.t >= t - EPS);
      if (idx >= 0) { st.stepIdx = idx; showStep(); }
      return;
    }
    const curTo = +selTo.value;
    setSection(bi, Math.max(bi, curTo));
    showIdle();
    toast(root, `Starting from ${bars[bi].n === 0 ? "the pickup" : "bar " + bars[bi].n}. “📍” sets where to stop.`);
  });

  root.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    audio();
    switch (a) {
      case "back": cleanup(); onBack(); break;
      case "watch": st.mode === "watch" ? stopAll() : startWatch(); break;
      case "wait": st.mode === "wait" ? stopAll() : startWait(); break;
      case "along": st.mode === "along" ? stopAll() : startAlong(); break;
      case "slower": st.tempo = Math.max(30, st.tempo - 5); showBpm(); restartTimed(); break;
      case "faster": st.tempo = Math.min(240, st.tempo + 5); showBpm(); restartTimed(); break;
      case "loop": st.loop = !st.loop; e.target.closest("button").classList.toggle("on", st.loop); break;
      case "click": store.setting("click", !store.setting("click")); e.target.closest("button").classList.toggle("on", store.setting("click")); break;
      case "mic": toggleMic(e.target.closest("button")); break;
      case "midi": toggleMidi(e.target.closest("button")); break;
      case "rec": toggleRecord(e.target.closest("button")); break;
      case "hint": if (st.mode === "wait") hint(); break;
      case "next": if (st.mode === "wait") advance(true); break;
      case "prev": if (st.mode === "wait" && st.stepIdx > 0) { st.stepIdx--; showStep(); } break;
      case "opts": secPop.hidden = true; opts.hidden = !opts.hidden; break;
      case "section": opts.hidden = true; secPop.hidden = !secPop.hidden; break;
      case "secAll": stopAll(); setSection(0, bars.length - 1); showIdle(); break;
      case "secClose": secPop.hidden = true; break;
      case "full": toggleFull(); break;
    }
  });

  const opts = $(".pr-opts", root);
  for (const k of ["labels", "sound"]) opts.querySelector(`[data-o=${k}]`).value = store.setting(k);
  for (const k of ["fingers", "countIn", "speak", "accompany", "autoSpeed"]) opts.querySelector(`[data-o=${k}]`).checked = !!store.setting(k);
  opts.querySelector("[data-o=micSens]").value = store.setting("micSens");
  opts.querySelector("[data-o=zoom]").value = store.setting("zoom") || 1;
  opts.addEventListener("input", async (e) => {
    const k = e.target.dataset.o;
    if (!k) return;
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value;
    store.setting(k, v);
    if (k === "labels") kb.setLabels(v);
    if (k === "fingers" || k === "zoom") { staff.showFingers = store.setting("fingers"); staff.zoom = store.setting("zoom") || 1; staff.render(score); setSection(+selFrom.value, +selTo.value); refreshHighlight(); }
    if (k === "micSens" && st.mic) st.mic.sensitivity = v;
    if (k === "sound") (await import("./audio.js")).setSound(v);
    if (k === "speak" && v) speak("Notes will be spoken");
  });
  document.addEventListener("pointerdown", closePops, true);
  function closePops(e) {
    if (e.target.closest(".pop,[data-a=opts],[data-a=section]")) return;
    opts.hidden = true; secPop.hidden = true;
  }

  /* ---------- display helpers ---------- */
  const nowStep = $(".now-step", root), nowWhat = $(".now-what", root);
  function describe(notes) {
    const byHand = { R: [], L: [] };
    for (const n of notes) byHand[n.hand].push(n);
    const part = (h, arr) => {
      if (!arr.length) return "";
      const names = arr.map((n) => `<b>${pcLabel(n)}</b><sub>${n.oct}</sub>${n.finger ? `<i class="fbadge f-${h}">${n.finger}</i>` : ""}`).join(" ");
      return `<span class="hand h-${h}">${h === "R" ? "Right" : "Left"}</span> ${names}`;
    };
    return [part("R", byHand.R), part("L", byHand.L)].filter(Boolean).join('<span class="sep">·</span>');
  }
  const inSection = (t) => t >= st.from - EPS && t < st.to - EPS;
  const sectionSteps = (hands) => buildSteps(score, hands).filter((s) => inSection(s.t));
  const targetsOf = (s) => (s ? s.notes.map((n) => ({ midi: n.midi, finger: n.finger, hand: n.hand })) : []);

  function showIdle() {
    st.steps = sectionSteps(st.hands);
    nowStep.textContent = `${st.steps.length} steps`;
    nowWhat.innerHTML = `<b>▶ Listen</b> first, then <b>✋ Step by step</b>. When it's easy, try <b>🎯 Play along</b>.`;
    kb.setTargets(targetsOf(st.steps[0]));
    staff.clearMarks();
    staff.highlight(st.steps[0]?.t ?? null, st.hands, false);
    const x = st.steps[0] ? staff.xOf(st.steps[0].t) : 0;
    staffEl.scrollLeft = Math.max(0, (x || 0) * staff.scale - staffEl.clientWidth * 0.33);
    setModeButtons();
  }
  function refreshHighlight() {
    if (st.mode === "wait") showStep();
    else if (st.mode === "idle") showIdle();
  }
  function setModeButtons() {
    const set = (a, on, label, stopLabel = "■ Stop") => {
      const b = $(`[data-a=${a}]`, root);
      b.textContent = on ? stopLabel : label;
      b.classList.toggle("on", on);
    };
    set("watch", st.mode === "watch", "▶ Listen");
    set("wait", st.mode === "wait", "✋ Step by step");
    set("along", st.mode === "along", "🎯 Play along");
    $(".grp-step", root).hidden = st.mode !== "wait";
  }
  function beatLabel(t) {
    const bi = barOfTime(t);
    if (bi < 0) return "";
    const beatLen = score.den === 8 ? 0.5 : 1;
    const inBar = t - bars[bi].from + (bars[bi].n === 0 ? score.measure - score.pickup : 0);
    return `Bar ${bars[bi].n || "0"} · beat ${Math.floor(inBar / beatLen + EPS) + 1}`;
  }

  /* ---------- speech ---------- */
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    u.lang = getNameStyle() === "solfege" ? "it-IT" : "en-US";
    speechSynthesis.speak(u);
  }
  function speakStep(notes) {
    if (!store.setting("speak")) return;
    const say = (n) => pcLabel(n).replace("♯", " sharp").replace("♭", " flat");
    const hands = [...new Set(notes.map((n) => n.hand))];
    const parts = hands.map((h) => {
      const ns = notes.filter((n) => n.hand === h);
      const txt = ns.map(say).join(", ");
      const f = ns.length === 1 && ns[0].finger ? `, finger ${ns[0].finger}` : "";
      return (hands.length > 1 ? (h === "R" ? "right " : "left ") : "") + txt + f;
    });
    speak(parts.join(". "));
  }

  /* ---------- timed playback shared by Listen and Play along ---------- */
  function buildPlayback({ audibleHands, lead, spb }) {
    const items = [];
    if (store.setting("click") || st.mode === "along") {
      const beatLen = score.den === 8 ? 0.5 : 1;
      const first = lead > 0 ? -score.measure : 0;
      for (let b = first; b < st.to - st.from - EPS; b += beatLen) {
        const abs = st.from + b;
        const pos = (((abs - score.pickup) % score.measure) + score.measure) % score.measure;
        if (b >= 0 && !store.setting("click")) continue;
        items.push({ at: lead + b * spb, fn: (w) => click(w, Math.abs(pos) < EPS || Math.abs(pos - score.measure) < EPS) });
      }
    }
    for (const ev of score.events) {
      if (ev.rest || !inSection(ev.t) || !audibleHands.includes(ev.hand)) continue;
      const len = ev.stacc ? ev.d * 0.45 : ev.d * 0.96;
      const rel = Math.min(pedalRelease(score, ev.t, ev.t + len), st.to + 0.5);
      for (const n of ev.notes) {
        items.push({ at: lead + (ev.t - st.from) * spb, fn: (w) => st.voices.push(playNote(n.midi, { when: w, dur: (rel - ev.t) * spb, vel: ev.vel })) });
      }
    }
    return items;
  }

  /* ---------- ▶ Listen ---------- */
  function startWatch() {
    stopAll();
    st.mode = "watch";
    setModeButtons();
    const spb = 60 / st.tempo;
    const countIn = store.setting("countIn") && store.setting("click");
    const lead = countIn ? score.measure * spb : 0;
    const items = buildPlayback({ audibleHands: "RL", lead, spb });
    const vis = sectionSteps("RL").map((s) => ({ at: lead + (s.t - st.from) * spb, step: s }));
    const endAt = lead + (st.to - st.from) * spb;
    runTimed(items, endAt, () => { if (st.loop) startWatch(); else { stopAll(); showIdle(); } }, (t, job) => {
      let vi = job.vi ?? -1;
      while (vi + 1 < vis.length && vis[vi + 1].at <= t + 0.01) {
        vi++;
        const s = vis[vi].step;
        staff.highlight(s.t, "RL");
        kb.setTargets(targetsOf(s));
        nowWhat.innerHTML = describe(s.notes);
      }
      job.vi = vi;
      const beat = st.from + (t - lead) / spb;
      nowStep.textContent = t < lead ? `Count-in ${Math.floor(t / spb) + 1}` : beatLabel(beat);
      if (vi < 0) nowWhat.textContent = countIn ? "Get ready… listen to the beat" : "";
    });
  }

  function runTimed(items, endAt, onDone, onFrame) {
    const job = schedule(items, {
      onEnd: () => {
        if (job !== st.playing) return;
        const wait = Math.max(0, (job.start + endAt - audio().currentTime) * 1000);
        setTimeout(() => { if (job === st.playing) onDone(); }, wait + 150);
      },
    });
    st.playing = job;
    const frame = () => {
      if (st.playing !== job) return;
      onFrame(audio().currentTime - job.start, job);
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
    return job;
  }
  function restartTimed() {
    if (st.mode === "watch") startWatch();
    if (st.mode === "along") startAlong();
  }

  function stopAll() {
    if (st.playing) { st.playing.stop(); st.playing = null; }
    cancelAnimationFrame(st.raf);
    const t = audio().currentTime;
    st.voices.forEach((v) => v.stop(t));
    st.voices = [];
    const was = st.mode;
    st.mode = "idle";
    kb.clearStates();
    setModeButtons();
    if (was === "wait" || was === "along") showIdle();
  }

  /* ---------- ✋ Step by step ---------- */
  function startWait() {
    stopAll();
    st.steps = sectionSteps(st.hands);
    if (!st.steps.length) return toast(root, "Nothing for this hand in these bars.");
    st.mode = "wait";
    st.stepIdx = 0;
    st.mistakes = 0;
    st.started = performance.now();
    $(".pr-result", root).hidden = true;
    staff.clearMarks();
    setModeButtons();
    showStep();
  }
  function showStep() {
    const s = st.steps[st.stepIdx];
    if (!s) return;
    st.stepStart = performance.now();
    st.recent.clear();
    const prev = st.steps[st.stepIdx - 1];
    const pcs = s.notes.map((n) => PC(n.midi));
    const prevPcs = prev ? prev.notes.map((n) => PC(n.midi)) : [];
    /* a fresh key-strike is only required if this step shares a note with the last one */
    st.micState = { fresh: !pcs.some((p) => prevPcs.includes(p)), good: 0, bad: 0, badCounted: false };
    staff.highlight(s.t, st.hands);
    kb.setTargets(targetsOf(s));
    nowStep.textContent = `Step ${st.stepIdx + 1} / ${st.steps.length}`;
    nowWhat.innerHTML = describe(s.notes);
    speakStep(s.notes);
  }
  function hint() {
    const s = st.steps[st.stepIdx];
    s?.notes.forEach((n) => playNote(n.midi, { dur: 0.9, vel: 0.6 }));
  }
  /* when one hand practices alone, the app plays the other hand between steps */
  function accompany(fromT, toT) {
    if (!store.setting("accompany") || st.hands === "RL" || score.hands.length < 2) return;
    const spb = 60 / st.tempo;
    const now = audio().currentTime;
    for (const ev of score.events) {
      if (ev.rest || st.hands.includes(ev.hand) || ev.t < fromT - EPS || ev.t >= toT - EPS) continue;
      for (const n of ev.notes) st.voices.push(playNote(n.midi, { when: now + (ev.t - fromT) * spb, dur: Math.min(ev.d, 2) * spb, vel: ev.vel * 0.8 }));
    }
  }
  function advance(skipped = false) {
    const s = st.steps[st.stepIdx];
    if (!skipped) s.notes.forEach((n) => kb.setState(n.midi, "ok", 260));
    activity();
    const nextS = st.steps[st.stepIdx + 1];
    accompany(s.t, nextS ? nextS.t : st.to);
    st.stepIdx++;
    if (st.stepIdx >= st.steps.length) return finishWait();
    showStep();
  }
  function finishWait() {
    const secs = Math.round((performance.now() - st.started) / 1000);
    const n = st.steps.length;
    const acc = Math.max(0, Math.round((100 * n) / (n + st.mistakes)));
    const whole = st.from <= EPS && st.to >= score.end - EPS;
    if (resultKey && whole) store.exResult(resultKey, { mistakes: st.mistakes, tempo: st.tempo, hands: st.hands });
    if (whole) onComplete?.({ mistakes: st.mistakes, hands: st.hands });
    const perfect = st.mistakes === 0;
    showResult({
      icon: perfect ? "🎉" : acc >= 85 ? "👏" : "💪",
      title: perfect ? "Perfect!" : acc >= 85 ? "Well played!" : "Finished — keep going!",
      line: `${n} steps · ${st.mistakes} wrong note${st.mistakes === 1 ? "" : "s"} · ${acc}% · ${secs}s`,
      advice: perfect
        ? "Next: try 🎯 Play along to play it in time. Start slow — accuracy first, then speed."
        : "Play it again slowly. When it's perfect three times in a row, it's learned.",
      again: startWait,
      extra: perfect ? `<button class="btn btn-along" data-r="along">🎯 Play along</button>` : "",
    });
  }

  /* ---------- 🎯 Play along (timed, scored) ---------- */
  function startAlong() {
    stopAll();
    st.steps = sectionSteps(st.hands);
    if (!st.steps.length) return toast(root, "Nothing for this hand in these bars.");
    st.mode = "along";
    staff.clearMarks();
    $(".pr-result", root).hidden = true;
    setModeButtons();
    const spb = 60 / st.tempo;
    const lead = score.measure * spb; // always count in: you need to know when to start
    const audible = store.setting("accompany") && st.hands !== "RL" ? score.hands.filter((h) => !st.hands.includes(h)).join("") : "";
    const items = buildPlayback({ audibleHands: audible, lead, spb });
    const win = st.mic ? 0.42 : 0.3; // seconds either side of the beat
    st.along = {
      spb, lead, win,
      steps: st.steps.map((s) => ({ s, at: lead + (s.t - st.from) * spb, hit: new Set(), done: false, ok: false, dt: 0 })),
      extra: 0, next: 0,
    };
    const endAt = lead + (st.to - st.from) * spb;
    const job = runTimed(items, endAt, finishAlong, (t, jb) => {
      const A = st.along;
      A.now = t;
      /* cursor + targets follow the upcoming step */
      while (A.next < A.steps.length && A.steps[A.next].at < t - win) {
        const x = A.steps[A.next];
        if (!x.done) { x.done = true; staff.mark(x.s.t, "miss"); }
        A.next++;
      }
      const up = A.steps.find((x) => x.at > t - 0.08 && !x.done) || A.steps[A.next];
      if (up && up !== jb.shown) {
        jb.shown = up;
        staff.highlight(up.s.t, st.hands);
        kb.setTargets(targetsOf(up.s));
        nowWhat.innerHTML = describe(up.s.notes);
      }
      nowStep.textContent = t < lead ? `Count-in ${Math.floor(t / spb) + 1} / ${score.den === 8 ? score.num / 2 : score.num}` : beatLabel(st.from + (t - lead) / spb);
    });
    void job;
  }
  function alongInput(midiOrPcs, isMic) {
    const A = st.along;
    if (!A || A.now == null) return;
    const t = audio().currentTime - st.playing.start;
    /* the nearest unfinished step within the window */
    let best = null;
    for (let i = Math.max(0, A.next - 1); i < A.steps.length; i++) {
      const x = A.steps[i];
      if (x.at - t > A.win) break;
      if (x.done || Math.abs(x.at - t) > A.win) continue;
      const matches = isMic
        ? x.s.notes.some((n) => midiOrPcs.includes(PC(n.midi)))
        : x.s.notes.some((n) => n.midi === midiOrPcs);
      if (matches && (!best || Math.abs(x.at - t) < Math.abs(best.at - t))) best = x;
    }
    if (!best) { A.extra++; if (!isMic) kb.setState(midiOrPcs, "bad", 300); return; }
    if (isMic) best.s.notes.forEach((n) => { if (midiOrPcs.includes(PC(n.midi))) best.hit.add(n.midi); });
    else best.hit.add(midiOrPcs);
    const need = isMic ? Math.min(best.s.notes.length, 1) : best.s.notes.length;
    if (best.hit.size >= need) {
      best.done = true; best.ok = true; best.dt = t - best.at;
      staff.mark(best.s.t, "hit");
      best.s.notes.forEach((n) => kb.setState(n.midi, "ok", 200));
      activity();
    }
  }
  function finishAlong() {
    const A = st.along;
    const total = A.steps.length;
    const hits = A.steps.filter((x) => x.ok);
    const pct = Math.round((100 * hits.length) / total);
    const avg = hits.length ? Math.round((1000 * hits.reduce((a, x) => a + x.dt, 0)) / hits.length) : 0;
    const timing = Math.abs(avg) < 40 ? "right on the beat" : avg < 0 ? `a little early (${-avg} ms)` : `a little late (${avg} ms)`;
    st.mode = "idle";
    setModeButtons();
    const whole = st.from <= EPS && st.to >= score.end - EPS;
    if (whole && pct >= 90 && resultKey) store.exResult(resultKey, { mistakes: total - hits.length, tempo: st.tempo, hands: st.hands, along: pct });
    if (whole && pct >= 90) onComplete?.({ mistakes: 0, hands: st.hands });
    let sped = "";
    if (pct >= 95 && store.setting("autoSpeed")) { st.tempo = Math.min(240, st.tempo + 5); showBpm(); sped = ` Tempo raised to ${st.tempo} bpm.`; }
    if (st.loop && !sped && pct < 100) { startAlong(); return; }
    showResult({
      icon: pct >= 95 ? "🏆" : pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪",
      title: `${pct}% in time`,
      line: `${hits.length} of ${total} notes on the beat${hits.length ? ` · ${timing}` : ""}${A.extra ? ` · ${A.extra} extra` : ""}`,
      advice: (pct >= 95 ? "Excellent! Raise the tempo a little, or play it with both hands." : pct >= 70 ? "Nearly there. Red notes on the music show where to slow down and practice." : "Lower the tempo (−) until you can keep up, or go back to ✋ Step by step.") + sped,
      again: startAlong,
    });
  }

  function showResult({ icon, title, line, advice, again, extra = "" }) {
    staff.highlight(null);
    kb.setTargets([]);
    const res = $(".pr-result", root);
    res.hidden = false;
    res.innerHTML = `<div class="card res">
      <div class="big">${icon}</div><h3>${title}</h3><p>${line}</p><p class="muted">${advice}</p>
      <div class="row"><button class="btn" data-r="again">↺ Again</button>${extra}<button class="btn btn-go" data-r="close">Done</button></div></div>`;
    res.onclick = (e) => {
      const r = e.target.closest("[data-r]")?.dataset.r;
      if (!r) return;
      res.hidden = true;
      if (r === "again") again();
      if (r === "along") startAlong();
      if (r === "close") showIdle();
    };
  }

  /* ---------- input: touch / MIDI ---------- */
  function noteOn(m, vel, src) {
    activity();
    if (src === "touch") playNote(m, { vel, sustain: true });
    kb.setState(m, "press");
    if (src === "touch") setTimeout(() => kb.states.get(m) === "press" && kb.setState(m, null), 220);
    if (st.mode === "along") return alongInput(m, false);
    if (st.mode !== "wait") return;
    const s = st.steps[st.stepIdx];
    const want = s.notes.map((n) => n.midi);
    if (!want.includes(m)) {
      st.mistakes++;
      kb.setState(m, "bad", 400);
      return;
    }
    st.recent.set(m, performance.now());
    const t = performance.now();
    if (want.every((w) => st.recent.has(w) && t - st.recent.get(w) < 1500)) advance();
  }

  /* ---------- microphone ---------- */
  const hearBox = $(".now-hear", root), hearTxt = $(".hear-txt", root), lvl = $(".lvl i", root);
  async function toggleMic(btn) {
    if (st.mic) {
      st.mic.stop(); st.mic = null; btn.classList.remove("on"); hearBox.hidden = true; return;
    }
    try {
      const mic = new MicListener(onMicFrame);
      mic.sensitivity = store.setting("micSens");
      await mic.start();
      st.mic = mic;
      btn.classList.add("on");
      hearBox.hidden = false;
      toast(root, "🎤 Listening to your piano. Play the lit-up notes!");
      if (st.mode === "idle") startWait();
    } catch (err) {
      toast(root, "Microphone unavailable: " + (err.message || err) + ". Allow microphone access for this site.");
    }
  }
  function onMicFrame(f) {
    lvl.style.width = Math.round(f.level * 100) + "%";
    const heard = f.midi != null && f.clarity > 0.8 ? Math.round(f.midi) : null;
    hearTxt.textContent = heard != null ? "I hear " + fullLabel(fromMidi(heard)) : f.active ? "…" : "Listening…";
    if (st.mode === "along") {
      if (f.onset || (f.sinceOnset < 160 && f.sinceOnset > 30)) {
        const pcs = heard != null ? [PC(heard)] : f.chroma ? [...f.chroma.keys()].filter((i) => f.chroma[i] > 0.6) : [];
        if (pcs.length && (f.onset || !st.along.lastMicOnset || performance.now() - st.along.lastMicOnset > 60)) {
          if (f.onset) st.along.lastMicOnset = performance.now();
          if (f.onset || heard != null) alongInput(pcs, true);
        }
      }
      return;
    }
    if (st.mode !== "wait") return;
    const s = st.steps[st.stepIdx];
    if (!s) return;
    const ms = st.micState;
    if (f.onset) { ms.fresh = true; ms.badCounted = false; ms.good = 0; ms.bad = 0; }
    if (performance.now() - st.stepStart < 120) return;
    const pcs = [...new Set(s.notes.map((n) => PC(n.midi)))];
    let ok = false;
    if (pcs.length === 1) {
      const target = s.notes[0].midi;
      if (heard != null && PC(heard) === pcs[0] && Math.abs(heard - target) <= 12) ok = true;
      else if (heard != null && f.sinceOnset < 500) {
        ms.bad++;
        if (ms.bad >= 3 && !ms.badCounted && ms.fresh) { ms.badCounted = true; st.mistakes++; kb.setState(heard, "bad", 400); }
      }
    } else if (f.chroma) {
      ok = pcs.every((pc) => f.chroma[pc] >= 0.3);
    }
    if (ok && f.active) ms.good++; else ms.good = 0;
    if (ms.good >= 2 && ms.fresh) { ms.fresh = false; advance(); }
  }

  /* ---------- record yourself ---------- */
  let rec = null;
  async function toggleRecord(btn) {
    if (rec?.state === "recording") { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.classList.remove("on", "recording");
        btn.textContent = "⏺";
        const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
        const res = $(".pr-result", root);
        res.hidden = false;
        res.innerHTML = `<div class="card res"><div class="big">🎧</div><h3>Listen back</h3>
          <audio controls src="${url}" style="width:100%"></audio>
          <p class="muted">Listen like an audience would: is the beat steady? Are loud and soft clear? Does the melody sing over the accompaniment?</p>
          <div class="row"><a class="btn" href="${url}" download="my-playing.webm">⬇ Save</a><button class="btn btn-go" data-r="close">Done</button></div></div>`;
        res.onclick = (e) => { if (e.target.closest("[data-r=close]")) { res.hidden = true; } };
      };
      rec.start();
      btn.classList.add("on", "recording");
      btn.textContent = "⏹ Rec";
      toast(root, "⏺ Recording… press ⏹ to stop and listen back.");
    } catch (err) {
      toast(root, "Can't record: " + (err.message || err));
    }
  }

  function toggleFull() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().then(() => screen.orientation?.lock?.("landscape").catch(() => {})).catch(() => toast(root, "Full screen isn't available here — add the app to your home screen instead."));
  }

  /* ---------- MIDI ---------- */
  let midiEnabled = false;
  async function toggleMidi(btn) {
    if (btn.classList.contains("on")) { btn.classList.remove("on"); midiEnabled = false; return; }
    try {
      if (!sharedMidi) {
        sharedMidi = new MidiInput({
          onOn: (m, v) => midiHandlers.on?.(m, v),
          onOff: (m) => midiHandlers.off?.(m),
          onStatus: (names) => midiHandlers.status?.(names),
        });
        await sharedMidi.start();
      }
      midiEnabled = true;
      btn.classList.add("on");
      toast(root, sharedMidi.names.length ? "🎹 MIDI: " + sharedMidi.names.join(", ") : "No MIDI keyboard found yet — plug one in (USB or Bluetooth).");
      if (st.mode === "idle") startWait();
    } catch (err) {
      toast(root, err.message || String(err));
    }
  }
  midiHandlers.on = (m, v) => { if (midiEnabled) { playNote(m, { vel: v, sustain: true }); noteOn(m, v, "midi"); } };
  midiHandlers.off = (m) => { if (midiEnabled) { noteOff(m); kb.setState(m, null); } };
  midiHandlers.status = (names) => { if (midiEnabled) toast(root, names.length ? "MIDI: " + names.join(", ") : "MIDI keyboard disconnected"); };

  const onKey = (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.key === " ") { e.preventDefault(); st.mode === "watch" ? stopAll() : startWatch(); }
    if (e.key === "Enter") { e.preventDefault(); st.mode === "wait" ? advance(true) : startWait(); }
    if (e.key === "Escape") stopAll();
  };
  document.addEventListener("keydown", onKey);

  function cleanup() {
    stopAll();
    st.mic?.stop();
    if (rec?.state === "recording") rec.stop();
    kb.destroy();
    wakeLock?.release?.().catch(() => {});
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", closePops, true);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    midiHandlers.on = midiHandlers.off = midiHandlers.status = null;
  }

  const pref = store.setting("input");
  if (pref === "mic" || pref === "midi") $(`[data-a=${pref}]`, root).classList.add("suggest");

  showIdle();
  return { cleanup };
}

export function toast(root, msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  (root || document.body).appendChild(t);
  setTimeout(() => t.classList.add("out"), 3200);
  setTimeout(() => t.remove(), 3700);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

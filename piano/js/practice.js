/* The practice screen: sheet music on top, keyboard at the bottom.

   Watch     — the app plays the exercise, lighting up notes and keys.
   Your turn — the app waits at each step until you play it (on your real
               piano via microphone or MIDI, or by tapping the screen). */

import { parseExercise, buildSteps, scoreRange, pedalRelease } from "./score.js";
import { Staff } from "./staff.js";
import { Keyboard, fitRange } from "./keyboard.js";
import { audio, playNote, noteOff, click, schedule } from "./audio.js";
import { MicListener, MidiInput } from "./listen.js";
import { pcLabel, fullLabel, fromMidi } from "./theory.js";
import { store, activity } from "./store.js";

const $ = (sel, root = document) => root.querySelector(sel);
const PC = (m) => ((Math.round(m) % 12) + 12) % 12;

let sharedMidi = null;

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
    micState: { fresh: true, good: 0, bad: 0, badCounted: false, lastPcs: [] },
    playing: null,
    voices: [],
    raf: 0,
  };

  root.innerHTML = `
  <div class="pr">
    <header class="pr-top">
      <button class="ibtn" data-a="back" aria-label="Back">←</button>
      <div class="pr-title"><b>${esc(title)}</b><span>${esc(ex.title || "")}</span></div>
      <button class="ibtn" data-a="opts" aria-label="Display options">⚙</button>
    </header>
    <div class="pr-staff" tabindex="0"></div>
    <div class="pr-now">
      <div class="now-main"><span class="now-step"></span><span class="now-what"></span></div>
      <div class="now-hear" hidden><span class="lvl"><i></i></span><span class="hear-txt">Listening…</span></div>
    </div>
    <div class="pr-kb"></div>
    <div class="pr-ctrl">
      <div class="grp">
        <button class="btn btn-play" data-a="watch">▶ Watch</button>
        <button class="btn btn-go" data-a="wait">✋ Your turn</button>
      </div>
      <div class="grp grp-step" hidden>
        <button class="btn sm" data-a="prev" aria-label="Previous step">‹</button>
        <button class="btn sm" data-a="hint">🔊 Hint</button>
        <button class="btn sm" data-a="next" aria-label="Skip step">›</button>
      </div>
      <div class="grp">
        <div class="seg" data-a="hands"></div>
        <div class="tempo"><button class="btn sm" data-a="slower">−</button><span class="bpm"></span><button class="btn sm" data-a="faster">+</button></div>
      </div>
      <div class="grp">
        <button class="btn sm tog" data-a="mic" title="Listen to my piano through the microphone">🎤 Mic</button>
        <button class="btn sm tog" data-a="midi" title="Use a MIDI keyboard">🎹 MIDI</button>
        <button class="btn sm tog" data-a="loop" title="Repeat">🔁</button>
        <button class="btn sm tog" data-a="click" title="Metronome click in Watch">⏱</button>
      </div>
    </div>
    <div class="pr-opts" hidden>
      <label>Key names
        <select data-o="labels"><option value="all">All keys</option><option value="c">C only</option><option value="none">None</option></select></label>
      <label><input type="checkbox" data-o="fingers"> Finger numbers on the music</label>
      <label><input type="checkbox" data-o="countIn"> Count-in before Watch</label>
      <label>Mic sensitivity <input type="range" min="0.5" max="2.5" step="0.1" data-o="micSens"></label>
      <p class="muted">Mic tip: put the phone near the piano in a quiet room. Single notes are detected reliably; chords work best with a MIDI keyboard.</p>
    </div>
    <div class="pr-result" hidden></div>
  </div>`;

  const staffEl = $(".pr-staff", root);
  const staff = new Staff(staffEl, { fit: true });
  staff.showFingers = store.setting("fingers");
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

  /* ---------- controls ---------- */
  const handsSeg = $("[data-a=hands]", root);
  const handOpts = score.hands.length > 1 ? [["RL", "Both"], ["R", "R"], ["L", "L"]] : [[score.hands[0], score.hands[0] === "R" ? "Right hand" : "Left hand"]];
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

  root.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (!a) return;
    audio();
    switch (a) {
      case "back": cleanup(); onBack(); break;
      case "watch": st.mode === "watch" ? stopAll() : startWatch(); break;
      case "wait": st.mode === "wait" ? stopAll() : startWait(); break;
      case "slower": st.tempo = Math.max(30, st.tempo - 5); showBpm(); if (st.mode === "watch") startWatch(); break;
      case "faster": st.tempo = Math.min(220, st.tempo + 5); showBpm(); if (st.mode === "watch") startWatch(); break;
      case "loop": st.loop = !st.loop; e.target.classList.toggle("on", st.loop); break;
      case "click": store.setting("click", !store.setting("click")); e.target.classList.toggle("on", store.setting("click")); break;
      case "mic": toggleMic(e.target); break;
      case "midi": toggleMidi(e.target); break;
      case "hint": if (st.mode === "wait") hint(); break;
      case "next": if (st.mode === "wait") advance(true); break;
      case "prev": if (st.mode === "wait" && st.stepIdx > 0) { st.stepIdx--; showStep(); } break;
      case "opts": $(".pr-opts", root).hidden = !$(".pr-opts", root).hidden; break;
    }
  });

  const opts = $(".pr-opts", root);
  opts.querySelector("[data-o=labels]").value = store.setting("labels");
  opts.querySelector("[data-o=fingers]").checked = store.setting("fingers");
  opts.querySelector("[data-o=countIn]").checked = store.setting("countIn");
  opts.querySelector("[data-o=micSens]").value = store.setting("micSens");
  opts.addEventListener("input", (e) => {
    const k = e.target.dataset.o;
    if (!k) return;
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value;
    store.setting(k, v);
    if (k === "labels") kb.setLabels(v);
    if (k === "fingers") { staff.showFingers = v; staff.render(score); refreshHighlight(); }
    if (k === "micSens" && st.mic) st.mic.sensitivity = v;
  });

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
  function showIdle() {
    st.steps = buildSteps(score, st.hands);
    nowStep.textContent = `${st.steps.length} steps`;
    nowWhat.innerHTML = `Press <b>▶ Watch</b> to hear it, then <b>✋ Your turn</b> to play it yourself.`;
    kb.setTargets(st.steps[0] ? st.steps[0].notes.map((n) => ({ midi: n.midi, finger: n.finger, hand: n.hand })) : []);
    staff.highlight(st.steps[0]?.t ?? null, st.hands, false);
    staffEl.scrollLeft = 0;
    setModeButtons();
  }
  function refreshHighlight() {
    if (st.mode === "wait") showStep();
    else showIdle();
  }
  function setModeButtons() {
    $("[data-a=watch]", root).textContent = st.mode === "watch" ? "■ Stop" : "▶ Watch";
    $("[data-a=wait]", root).textContent = st.mode === "wait" ? "■ Stop" : "✋ Your turn";
    $("[data-a=watch]", root).classList.toggle("on", st.mode === "watch");
    $("[data-a=wait]", root).classList.toggle("on", st.mode === "wait");
    $(".grp-step", root).hidden = st.mode !== "wait";
  }

  /* ---------- Watch mode ---------- */
  function startWatch() {
    stopAll();
    st.mode = "watch";
    setModeButtons();
    const spb = 60 / st.tempo;
    const countIn = store.setting("countIn") && store.setting("click");
    const lead = countIn ? score.measure * spb : 0;
    const items = [];
    const vis = [];
    if (store.setting("click")) {
      const beatLen = score.den === 8 ? 0.5 : 1;
      const total = score.end;
      const first = countIn ? -score.measure : 0;
      for (let b = first; b < total - 1e-6; b += beatLen) {
        const pos = (((b - score.pickup) % score.measure) + score.measure) % score.measure;
        items.push({ at: lead + b * spb, fn: (w) => click(w, Math.abs(pos) < 1e-6) });
      }
    }
    for (const ev of score.events) {
      if (ev.rest) continue;
      const len = ev.stacc ? ev.d * 0.45 : ev.d * 0.96;
      const rel = pedalRelease(score, ev.t, ev.t + len);
      for (const n of ev.notes) {
        items.push({ at: lead + ev.t * spb, fn: (w) => st.voices.push(playNote(n.midi, { when: w, dur: (rel - ev.t) * spb, vel: ev.vel })) });
      }
    }
    const steps = buildSteps(score, "RL");
    for (const s of steps) vis.push({ at: lead + s.t * spb, step: s });
    const endAt = lead + score.end * spb;
    const job = schedule(items, {
      onEnd: () => {
        if (job !== st.playing) return;
        const wait = Math.max(0, (job.start + endAt - audio().currentTime) * 1000);
        setTimeout(() => {
          if (job !== st.playing) return;
          if (st.loop) startWatch(); else { stopAll(); showIdle(); }
        }, wait);
      },
    });
    st.playing = job;
    let vi = -1;
    const frame = () => {
      if (st.playing !== job) return;
      const t = audio().currentTime - job.start;
      while (vi + 1 < vis.length && vis[vi + 1].at <= t + 0.01) {
        vi++;
        const s = vis[vi].step;
        staff.highlight(s.t, "RL");
        kb.setTargets(s.notes.map((n) => ({ midi: n.midi, finger: n.finger, hand: n.hand })));
        nowStep.textContent = `Step ${vi + 1} / ${vis.length}`;
        nowWhat.innerHTML = describe(s.notes);
      }
      if (vi < 0) { nowStep.textContent = countIn ? "Count-in" : ""; nowWhat.textContent = countIn ? "Get ready… listen to the beat" : ""; }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  }

  function stopAll() {
    if (st.playing) { st.playing.stop(); st.playing = null; }
    cancelAnimationFrame(st.raf);
    const t = audio().currentTime;
    st.voices.forEach((v) => v.stop(t));
    st.voices = [];
    const wasWait = st.mode === "wait";
    st.mode = "idle";
    kb.clearStates();
    setModeButtons();
    if (wasWait) showIdle();
  }

  /* ---------- Your turn (wait) mode ---------- */
  function startWait() {
    stopAll();
    st.steps = buildSteps(score, st.hands);
    if (!st.steps.length) return;
    st.mode = "wait";
    st.stepIdx = 0;
    st.mistakes = 0;
    st.started = performance.now();
    $(".pr-result", root).hidden = true;
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
    kb.setTargets(s.notes.map((n) => ({ midi: n.midi, finger: n.finger, hand: n.hand })));
    nowStep.textContent = `Step ${st.stepIdx + 1} / ${st.steps.length}`;
    nowWhat.innerHTML = describe(s.notes);
  }
  function hint() {
    const s = st.steps[st.stepIdx];
    s?.notes.forEach((n) => playNote(n.midi, { dur: 0.9, vel: 0.6 }));
  }
  function advance(skipped = false) {
    const s = st.steps[st.stepIdx];
    if (!skipped) s.notes.forEach((n) => kb.setState(n.midi, "ok", 260));
    activity();
    st.stepIdx++;
    if (st.stepIdx >= st.steps.length) return finish();
    showStep();
  }
  function finish() {
    const secs = Math.round((performance.now() - st.started) / 1000);
    st.mode = "idle";
    setModeButtons();
    staff.highlight(null);
    kb.setTargets([]);
    const perfect = st.mistakes === 0;
    const acc = Math.max(0, Math.round(100 * st.steps.length / (st.steps.length + st.mistakes)));
    if (resultKey) store.exResult(resultKey, { mistakes: st.mistakes, tempo: st.tempo, hands: st.hands });
    onComplete?.({ mistakes: st.mistakes, hands: st.hands });
    const res = $(".pr-result", root);
    res.hidden = false;
    res.innerHTML = `<div class="card res">
      <div class="big">${perfect ? "🎉" : acc >= 85 ? "👏" : "💪"}</div>
      <h3>${perfect ? "Perfect!" : acc >= 85 ? "Well played!" : "Finished — keep going!"}</h3>
      <p>${st.steps.length} steps · ${st.mistakes} wrong note${st.mistakes === 1 ? "" : "s"} · ${acc}% accuracy · ${secs}s</p>
      <p class="muted">${perfect ? "Now try it with the Watch tempo — play along while it plays, or raise the tempo." : "Play it again slowly. When it's perfect three times in a row, it's learned."}</p>
      <div class="row"><button class="btn" data-r="again">↺ Again</button><button class="btn btn-go" data-r="close">Done</button></div>
    </div>`;
    res.onclick = (e) => {
      const r = e.target.closest("[data-r]")?.dataset.r;
      if (r === "again") { res.hidden = true; startWait(); }
      if (r === "close") { res.hidden = true; showIdle(); }
    };
  }

  /* ---------- input: touch / MIDI ---------- */
  function noteOn(m, vel, src) {
    activity();
    if (src === "touch") playNote(m, { vel, sustain: true });
    kb.setState(m, "press", src === "touch" ? 0 : 0);
    if (src === "touch") setTimeout(() => kb.states.get(m) === "press" && kb.setState(m, null), 220);
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
      if (st.mode !== "wait") startWait();
    } catch (err) {
      toast(root, "Microphone unavailable: " + (err.message || err) + ". Allow microphone access for this site.");
    }
  }
  function onMicFrame(f) {
    lvl.style.width = Math.round(f.level * 100) + "%";
    const heard = f.midi != null && f.clarity > 0.8 ? Math.round(f.midi) : null;
    hearTxt.textContent = heard != null ? "I hear " + fullLabel(fromMidi(heard)) : f.active ? "…" : "Listening…";
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

  /* ---------- MIDI ---------- */
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
      toast(root, sharedMidi.names.length ? "MIDI: " + sharedMidi.names.join(", ") : "No MIDI keyboard found yet — plug one in (USB or Bluetooth).");
    } catch (err) {
      toast(root, err.message || String(err));
    }
  }
  let midiEnabled = false;
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
    kb.destroy();
    document.removeEventListener("keydown", onKey);
    midiHandlers.on = midiHandlers.off = midiHandlers.status = null;
  }

  showIdle();
  return { cleanup };
}

const midiHandlers = { on: null, off: null, status: null };

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

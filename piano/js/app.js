/* PianoPath — app shell and routing.
   #/                     course map
   #/lesson/<id>          a lesson
   #/practice/<id>/<n>    practice screen for exercise n of a lesson
   #/practice/tmp         practice screen for a generated exercise (tools)
   #/tools, #/tool/<id>   tools
   #/progress             progress & settings */

import { LEVELS, ALL_LESSONS, lessonById, nextLesson, exercisesOf } from "./curriculum.js";
import { openPractice, esc, toast } from "./practice.js";
import { TOOLS, renderTool, scaleExercise } from "./tools.js";
import { Keyboard, fitRange } from "./keyboard.js";
import { parseExercise } from "./score.js";
import { Staff } from "./staff.js";
import { parseNote, setNameStyle } from "./theory.js";
import { audio, playNote, noteOff, setVolume, setSound, loadSamples } from "./audio.js";
import { store, lastDays } from "./store.js";
import { SONGS, SONG_LEVELS, songById } from "./songs.js";
import { GLOSSARY } from "./glossary.js";

const view = document.getElementById("view");
const tabs = document.getElementById("tabs");
let cleanup = null;
let tempEx = null;

setNameStyle(store.setting("names"));
setVolume(store.setting("volume"));
setSound(store.setting("sound") === "synth" ? "synth" : "piano-lazy");
applyTheme();

const nav = {
  go(hash) { location.hash = hash; },
  practiceTemp(ex, title) { tempEx = { ex, title }; location.hash = "#/practice/tmp"; },
};

function route() {
  cleanup?.cleanup?.();
  cleanup = null;
  view.onclick = null;
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const [page, a, b] = parts;
  document.body.dataset.page = page || "learn";
  tabs.querySelectorAll("a").forEach((x) => x.classList.toggle("on", x.dataset.tab === ({ lesson: "learn", tool: "tools", glossary: "tools" }[page] || page || "learn")));
  window.scrollTo(0, 0);
  if (!page || page === "learn") return renderHome();
  if (page === "lesson") return renderLesson(a);
  if (page === "practice") return renderPractice(a, b);
  if (page === "tools") return renderTools();
  if (page === "songs") return renderSongs();
  if (page === "glossary") return renderGlossary();
  if (page === "tool") { cleanup = renderTool(a, view, nav); return; }
  if (page === "progress") return renderProgress();
  renderHome();
}
window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  const n = e.target.closest("[data-nav]");
  if (n) { e.preventDefault(); nav.go(n.dataset.nav); }
});

/* ───────────── course map ───────────── */
function renderHome() {
  if (!store.setting("onboarded")) return renderWelcome();
  const doneCount = ALL_LESSONS.filter((l) => store.isDone(l.id)).length;
  const next = ALL_LESSONS.find((l) => !store.isDone(l.id));
  const pct = Math.round((100 * doneCount) / ALL_LESSONS.length);
  const streak = store.streak();
  const goal = store.setting("goalMin") || 15;
  const mins = Math.round(todaySec() / 60);
  view.innerHTML = `
  <div class="page home">
    <section class="hero">
      <div>
        <h1>PianoPath</h1>
        <p>From your first note to playing like a pro. Put your phone on the piano and follow along.</p>
      </div>
      <div class="ring" style="--p:${pct}" title="Course progress"><span>${pct}%</span></div>
    </section>
    <div class="stat-row">
      <div class="stat"><b>${doneCount}</b><span>of ${ALL_LESSONS.length} lessons</span></div>
      <div class="stat"><b>${streak}🔥</b><span>day streak</span></div>
      <div class="stat goal ${mins >= goal ? "met" : ""}"><b>${mins}<small>/${goal}</small></b><span>min today${mins >= goal ? " ✓" : ""}</span><i style="width:${Math.min(100, (100 * mins) / goal)}%"></i></div>
    </div>
    ${next ? `<a class="continue" data-nav="#/lesson/${next.id}">
      <span class="c-l">${doneCount ? "Continue" : "Start here"}</span>
      <b>${esc(next.title)}</b><small>Level ${next.level.id.slice(1)} · ${esc(next.level.title)} · ${next.mins} min</small><i>›</i></a>`
      : `<div class="continue done"><b>🎓 Course complete!</b><small>Keep going with Songs, Tools and the path in lesson 6-8.</small></div>`}
    ${todayPlan(next)}
    ${LEVELS.map((lv, li) => {
      const n = lv.lessons.filter((l) => store.isDone(l.id)).length;
      const open = n < lv.lessons.length || lv.lessons.some((l) => next && l.id === next.id);
      return `<details class="level" style="--c:${lv.color}" ${open ? "open" : ""}>
        <summary><span class="lv-n">${n === lv.lessons.length ? "✓" : li + 1}</span><div><h2>${esc(lv.title)}</h2><p>${esc(lv.sub)}</p></div><span class="lv-p">${n}/${lv.lessons.length}</span></summary>
        <div class="bar"><i style="width:${(100 * n) / lv.lessons.length}%"></i></div>
        <ol class="lessons">${lv.lessons.map((ls) => `
          <li><a data-nav="#/lesson/${ls.id}" class="${store.isDone(ls.id) ? "done" : ""} ${next && next.id === ls.id ? "next" : ""}">
            <span class="chk">${store.isDone(ls.id) ? "✓" : ls.id.split("-")[1]}</span>
            <span class="t">${esc(ls.title)}</span>
            <span class="m">${exercisesOf(ls).length ? `${exercisesOf(ls).length} ♪ · ` : ""}${ls.mins}′</span></a></li>`).join("")}
        </ol></details>`;
    }).join("")}
    <p class="center"><button class="lnk" data-act="replay-welcome">Change my starting level</button></p>
  </div>`;
  view.onclick = (e) => {
    const it = e.target.closest("[data-plan]");
    if (it) {
      planMark(it.dataset.plan);
      if (it.dataset.plan === "warm") nav.practiceTemp(warmupExercise(), "Warm-up");
    }
    if (e.target.closest("[data-act=replay-welcome]")) { store.setting("onboarded", false); renderHome(); }
  };
}

/* ─── today's plan: warm-up → lesson → review → training ─── */
function planState() {
  const d = new Date().toDateString();
  if (store.s.plan?.date !== d) { store.s.plan = { date: d, done: {} }; store.save(); }
  return store.s.plan;
}
function planMark(k) { planState().done[k] = true; store.save(); }
function weekNo() { return Math.floor(Date.now() / (7 * 864e5)); }
const WEEK_KEYS = ["C", "G", "F", "D", "Bb", "A", "Eb", "E", "Ab", "B", "Db", "F#"];
function warmupExercise() {
  const scalesKnown = store.isDone("3-4");
  if (!scalesKnown) {
    return { title: "Five-finger warm-up (C position)", ts: "4/4", tempo: 72,
      rh: "C4-1q D4-2 E4-3 F4-4 | G4-5 F4-4 E4-3 D4-2 | C4-1 E4-3 D4-2 F4-4 | E4-3 G4-5 C4-1h",
      lh: "C3-5q D3-4 E3-3 F3-2 | G3-1 F3-2 E3-3 D3-4 | C3-5 E3-3 D3-4 F3-2 | E3-3 G3-1 C3-5h" };
  }
  const known = store.isDone("3-8") ? WEEK_KEYS : WEEK_KEYS.slice(0, 3);
  const key = known[weekNo() % known.length];
  const r = scaleExercise(key, "major", "R"), l = scaleExercise(key, "major", "L");
  return { ...r, title: `${key.replace("b", "♭").replace("#", "♯")} major scale — scale of the week`, lh: l.lh };
}
function reviewPick() {
  const entries = Object.entries(store.s.exDone).filter(([k]) => k.includes("#"));
  if (!entries.length) return null;
  entries.sort((a, b) => a[1].t - b[1].t);
  const [key] = entries[0];
  const [lid, i] = key.split("#");
  const ls = lessonById(lid);
  const ex = ls && exercisesOf(ls)[+i];
  return ex ? { ls, i, ex } : null;
}
function todayPlan(next) {
  const P = planState();
  const rev = reviewPick();
  const reading = store.isDone("2-1");
  const items = [
    { k: "warm", icon: "🔥", t: "Warm up", s: store.isDone("3-4") ? "Scale of the week, hands together" : "Five-finger exercise, both hands", nav: "" },
    next && { k: "lesson", icon: "📘", t: "Today's lesson", s: next.title, nav: `#/lesson/${next.id}` },
    rev && { k: "review", icon: "🔁", t: "Review", s: `${rev.ex.title} (${rev.ls.title})`, nav: `#/practice/${rev.ls.id}/${rev.i}` },
    { k: "train", icon: reading ? "👁" : "👂", t: reading ? "Note reading — 2 minutes" : "Ear training — 2 minutes", s: reading ? "Short daily drills build fast reading" : "Recognize intervals and chords by ear", nav: reading ? "#/tool/reading" : "#/tool/ear" },
    { k: "song", icon: "🎵", t: "Play for fun", s: "Pick a song you like", nav: "#/songs" },
  ].filter(Boolean);
  const done = items.filter((x) => P.done[x.k]).length;
  return `<section class="plan card">
    <h3>Today's practice <span class="muted small">${done}/${items.length}</span></h3>
    ${items.map((x) => `<a class="plan-i ${P.done[x.k] ? "done" : ""}" data-plan="${x.k}" ${x.nav ? `data-nav="${x.nav}"` : ""}>
      <span class="pi-i">${P.done[x.k] ? "✓" : x.icon}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><i>›</i></a>`).join("")}
  </section>`;
}

/* ─── first-run welcome ─── */
function renderWelcome() {
  document.body.dataset.page = "welcome";
  const W = { step: 0 };
  const LEVEL_START = { new: null, some: "L1", reads: "L2", good: "L4" };
  const steps = [
    () => `<div class="wl-hero"><div class="wl-logo">🎹</div><h1>Welcome to PianoPath</h1>
      <p>A complete piano course that sits on your music stand. It shows every key and finger, plays each piece for you, and listens while you play.</p></div>
      <button class="btn btn-go big-btn" data-w="next">Let's start</button>`,
    () => `<h2>How much piano do you know?</h2><div class="wl-opts">
      ${[["new", "🌱", "Never played", "Start from the very beginning."],
         ["some", "🙂", "I can play a few simple tunes", "Skip the first steps, start reading music."],
         ["reads", "📖", "I read notes and play with both hands", "Start at scales & keys."],
         ["good", "🎼", "I know scales and play songs", "Start at technique & expression."]]
        .map(([v, i, t, s]) => `<button class="wl-opt" data-lvl="${v}"><span>${i}</span><b>${t}</b><small>${s}</small></button>`).join("")}</div>`,
    () => `<h2>What will you play on?</h2><div class="wl-opts">
      ${[["mic", "🎹", "A real piano or keyboard", "The app listens through the microphone."],
         ["midi", "🔌", "A digital piano with USB / Bluetooth MIDI", "Exact note detection, even chords."],
         ["touch", "📱", "No piano right now", "Tap the keys on the screen."]]
        .map(([v, i, t, s]) => `<button class="wl-opt" data-inp="${v}"><span>${i}</span><b>${t}</b><small>${s}</small></button>`).join("")}</div>`,
    () => `<h2>How do you name notes?</h2><div class="wl-opts">
      <button class="wl-opt" data-names="letters"><span>🔤</span><b>C D E F G A B</b><small>English / German style</small></button>
      <button class="wl-opt" data-names="solfege"><span>🎶</span><b>Do Re Mi Fa Sol La Si</b><small>Latin / fixed do</small></button></div>`,
    () => `<h2>Daily goal</h2><p class="muted">Short, daily practice beats long sessions once a week.</p><div class="wl-opts row3">
      ${[[5, "Casual"], [15, "Regular"], [30, "Serious"], [60, "Pro track"]].map(([m, l]) => `<button class="wl-opt" data-goal="${m}"><b>${m} min</b><small>${l}</small></button>`).join("")}</div>`,
    () => `<div class="wl-hero"><div class="wl-logo">✨</div><h2>You're all set!</h2>
      <ul class="lst left">
        <li>Stand the phone on the music rack — sideways gives the biggest keyboard.</li>
        <li><b style="color:var(--r)">Blue</b> = right hand, <b style="color:var(--l)">orange</b> = left hand. The number is the finger.</li>
        <li>▶ <b>Listen</b> → ✋ <b>Step by step</b> → 🎯 <b>Play along</b>.</li>
        <li>Your plan for each day is on the home screen.</li>
      </ul></div>
      <button class="btn btn-go big-btn" data-w="finish">Go to my first lesson</button>`,
  ];
  const draw = () => {
    view.innerHTML = `<div class="page welcome"><div class="wl-dots">${steps.map((_, i) => `<i class="${i <= W.step ? "on" : ""}"></i>`).join("")}</div>
      <div class="wl-body">${steps[W.step]()}</div>
      ${W.step > 0 && W.step < steps.length - 1 ? `<button class="lnk" data-w="back">← Back</button>` : ""}</div>`;
  };
  view.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    audio();
    if (b.dataset.lvl) {
      const upTo = LEVEL_START[b.dataset.lvl];
      for (const lv of LEVELS) {
        for (const ls of lv.lessons) if (upTo && lv.id <= upTo) store.s.done[ls.id] ||= Date.now();
      }
      store.save();
      W.step++;
    } else if (b.dataset.inp) { store.setting("input", b.dataset.inp); W.step++; }
    else if (b.dataset.names) { store.setting("names", b.dataset.names); setNameStyle(b.dataset.names); W.step++; }
    else if (b.dataset.goal) { store.setting("goalMin", +b.dataset.goal); W.step++; }
    else if (b.dataset.w === "next") W.step++;
    else if (b.dataset.w === "back") W.step = Math.max(0, W.step - 1);
    else if (b.dataset.w === "finish") {
      store.setting("onboarded", true);
      [60, 64, 67, 72].forEach((m, i) => playNote(m, { when: audio().currentTime + i * 0.12, dur: 1.5, vel: 0.6 }));
      const next = ALL_LESSONS.find((l) => !store.isDone(l.id));
      view.onclick = null;
      return nav.go(next ? "#/lesson/" + next.id : "#/");
    }
    draw();
  };
  draw();
}

function todaySec() {
  const d = new Date();
  const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return store.s.days[k] || 0;
}

/* ───────────── lesson ───────────── */
function renderLesson(id) {
  const ls = lessonById(id);
  if (!ls) return renderHome();
  const nx = nextLesson(id);
  const exs = exercisesOf(ls);
  let exI = 0;
  const blocks = ls.body.map((b) => {
    switch (b.t) {
      case "p": return `<p>${b.html}</p>`;
      case "h": return `<h3>${esc(b.text)}</h3>`;
      case "tip": return `<div class="tip"><b>💡 Tip</b> ${b.html}</div>`;
      case "warn": return `<div class="tip warn"><b>⚠️ Careful</b> ${b.html}</div>`;
      case "list": return `<${b.ordered ? "ol" : "ul"} class="lst">${b.items.map((i) => `<li>${i}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
      case "kb": return `<figure class="kbfig" data-kb='${esc(JSON.stringify(b))}'><div class="kbwrap"></div>${b.caption ? `<figcaption>${esc(b.caption)} <button class="lnk" data-play-kb>🔊 hear it</button></figcaption>` : `<figcaption><button class="lnk" data-play-kb>🔊 hear it</button></figcaption>`}</figure>`;
      case "quiz": return `<div class="quiz" data-ans="${b.answer}"><p class="q">❓ ${b.q}</p><div class="qo">${b.options.map((o, i) => `<button class="btn" data-qi="${i}">${o}</button>`).join("")}</div><p class="qwhy" hidden>${b.why || ""}</p></div>`;
      case "tool": { const t = TOOLS.find((x) => x.id === b.id); return `<a class="toollink" data-nav="#/tool/${b.id}">${t.icon} ${esc(b.label)} ›</a>`; }
      case "ex": {
        const i = exI++;
        const res = store.exDone(`${ls.id}#${i}`);
        return `<div class="excard" data-ex="${i}">
          <div class="ex-h"><span class="ex-n">♪ ${i + 1}</span><b>${esc(b.title)}</b>${res ? `<span class="ex-ok" title="Completed">✓${res.mistakes === 0 ? " perfect" : ""}</span>` : ""}</div>
          ${b.desc ? `<p class="muted">${esc(b.desc)}</p>` : ""}
          <div class="ex-staff"></div>
          <div class="row"><button class="btn btn-play" data-listen="${i}">▶ Listen</button><button class="btn btn-go" data-nav="#/practice/${ls.id}/${i}">✋ Practice</button></div>
        </div>`;
      }
      default: return "";
    }
  }).join("");
  view.innerHTML = `
  <div class="page lesson" style="--c:${ls.level.color}">
    <header class="page-h"><button class="ibtn" data-nav="#/" aria-label="Back">←</button><div><small>Level ${ls.level.id.slice(1)} · ${esc(ls.level.title)} · Lesson ${ls.id}</small><h2>${esc(ls.title)}</h2></div></header>
    <div class="goals"><b>You'll learn</b><ul>${ls.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>
    <article>${blocks}</article>
    <div class="lesson-end">
      <button class="btn ${store.isDone(ls.id) ? "" : "btn-go"}" data-done>${store.isDone(ls.id) ? "✓ Completed — mark as not done" : "✓ Mark lesson complete"}</button>
      ${nx ? `<button class="btn" data-nav="#/lesson/${nx.id}">Next: ${esc(nx.title)} ›</button>` : ""}
      <button class="btn" data-nav="#/glossary">📖 Glossary</button>
    </div>
  </div>`;

  const kbs = [];
  view.querySelectorAll(".kbfig").forEach((fig) => {
    const b = JSON.parse(fig.dataset.kb);
    const notes = b.notes.map((x) => ({ ...parseNote(x.n), f: x.f, h: x.h }));
    const lo = b.lo ? parseNote(b.lo).midi : Math.min(...notes.map((n) => n.midi)) - 2;
    const hi = b.hi ? parseNote(b.hi).midi : Math.max(...notes.map((n) => n.midi)) + 2;
    const kb = new Keyboard(fig.querySelector(".kbwrap"), {
      ...(() => { const [l, h] = b.lo ? [lo, hi] : fitRange(lo, hi, 10); return { lo: l, hi: h }; })(),
      labels: b.labels || store.setting("labels"),
      onPress: (m) => playNote(m, { sustain: true }),
      onRelease: noteOff,
    });
    kb.setTargets(notes.map((n) => ({ midi: n.midi, finger: n.f, hand: n.h })));
    fig._notes = notes;
    kbs.push(kb);
  });
  exs.forEach((e, i) => {
    const host = view.querySelector(`.excard[data-ex="${i}"] .ex-staff`);
    try {
      const st = new Staff(host);
      st.showFingers = store.setting("fingers");
      st.render(parseExercise(e));
    } catch (err) {
      host.textContent = "⚠ " + err.message;
    }
  });

  let stopListen = null;
  view.onclick = (e) => {
    const q = e.target.closest("[data-qi]");
    if (q) {
      const box = q.closest(".quiz");
      const ok = +q.dataset.qi === +box.dataset.ans;
      q.classList.add(ok ? "good" : "bad");
      if (ok) { box.classList.add("solved"); box.querySelector(".qwhy").hidden = !box.querySelector(".qwhy").textContent; }
    }
    if (e.target.closest("[data-play-kb]")) {
      const fig = e.target.closest(".kbfig");
      const t = audio().currentTime;
      const ns = fig._notes.slice().sort((a, b) => a.midi - b.midi);
      ns.forEach((n, i) => playNote(n.midi, { when: t + 0.05 + i * 0.3, dur: 0.5 }));
    }
    const li = e.target.closest("[data-listen]");
    if (li) {
      stopListen?.();
      stopListen = listenExercise(exs[+li.dataset.listen], li);
    }
    if (e.target.closest("[data-done]")) {
      store.markDone(ls.id, !store.isDone(ls.id));
      if (store.isDone(ls.id) && nx) toast(null, "Lesson complete! Next: " + nx.title);
      renderLesson(id);
    }
  };
  cleanup = { cleanup: () => { stopListen?.(); kbs.forEach((k) => k.destroy()); view.onclick = null; } };
}

/* quick playback of an exercise from the lesson page */
function listenExercise(ex, btn) {
  const score = parseExercise(ex);
  const c = audio();
  const spb = 60 / score.tempo;
  const t0 = c.currentTime + 0.1;
  const voices = [];
  for (const ev of score.events) {
    if (ev.rest) continue;
    for (const n of ev.notes) voices.push(playNote(n.midi, { when: t0 + ev.t * spb, dur: ev.d * spb * (ev.stacc ? 0.45 : 0.95), vel: ev.vel }));
  }
  btn.textContent = "■ Stop";
  const stop = () => { voices.forEach((v) => v.stop(c.currentTime)); btn.textContent = "▶ Listen"; clearTimeout(tm); btn.onclick = null; };
  const tm = setTimeout(stop, score.end * spb * 1000 + 800);
  setTimeout(() => { btn.onclick = (e) => { e.stopPropagation(); stop(); }; }, 0);
  return stop;
}

/* ───────────── practice ───────────── */
function renderPractice(a, b) {
  let ex, title, key = null, ls = null;
  let song = null;
  if (a === "tmp") {
    if (!tempEx) return nav.go("#/tools");
    ({ ex, title } = tempEx);
  } else if (a === "song") {
    song = songById(b);
    if (!song) return nav.go("#/songs");
    ex = song.ex; title = song.title; key = "song:" + song.id;
  } else {
    ls = lessonById(a);
    if (!ls) return renderHome();
    ex = exercisesOf(ls)[+b];
    if (!ex) return renderLesson(a);
    title = ls.title;
    key = `${ls.id}#${b}`;
  }
  document.body.dataset.page = "practice";
  cleanup = openPractice(view, {
    ex, title, resultKey: key,
    onBack: () => { cleanup = null; history.length > 1 ? history.back() : nav.go(ls ? "#/lesson/" + ls.id : song ? "#/songs" : "#/tools"); },
    onComplete: () => {
      if (!ls) return;
      const all = exercisesOf(ls).every((_, i) => store.exDone(`${ls.id}#${i}`));
      if (all && !store.isDone(ls.id)) { store.markDone(ls.id); toast(null, "🎓 Lesson " + ls.id + " complete!"); }
    },
  });
}

/* ───────────── songs ───────────── */
let songFilter = 0;
function renderSongs() {
  const list = SONGS.filter((s) => !songFilter || s.level === songFilter);
  view.innerHTML = `<div class="page songs">
    <header class="page-h"><h2>Songs</h2></header>
    <p class="muted">Real pieces to enjoy — each with fingering, both hands, and all practice modes. Stars show difficulty.</p>
    <div class="chips-row">${[[0, "All"], ...SONG_LEVELS.map((l) => [l.n, `${l.stars} ${l.label}`])].map(([n, l]) => `<button class="chipbtn ${songFilter === n ? "on" : ""}" data-f="${n}">${l}</button>`).join("")}</div>
    <div class="song-list">${list.map((s) => {
      const lv = SONG_LEVELS[s.level - 1];
      const res = store.exDone("song:" + s.id);
      const ready = !s.after || store.isDone(s.after);
      const after = s.after ? ALL_LESSONS.find((l) => l.id === s.after) : null;
      return `<div class="song card">
        <div class="song-h"><div><b>${esc(s.title)}</b><small>${esc(s.by)}</small></div><span class="stars" title="${lv.label}">${lv.stars}</span></div>
        ${s.tip ? `<p class="muted small">${esc(s.tip)}</p>` : ""}
        ${s.lesson ? `<p class="small"><a class="lnk" data-nav="#/lesson/${s.lesson}">📘 Taught step by step in lesson ${s.lesson}</a></p>` : !ready && after ? `<p class="small"><a class="lnk warnline" data-nav="#/lesson/${after.id}">Easier after lesson ${after.id}: ${esc(after.title)}</a></p>` : ""}
        <div class="row"><button class="btn sm btn-play" data-listen-song="${s.id}">▶ Listen</button><button class="btn sm btn-go" data-nav="#/practice/song/${s.id}">✋ Practice</button>${res ? `<span class="ex-ok">✓ played${res.mistakes === 0 ? " perfectly" : ""}</span>` : ""}</div>
      </div>`;
    }).join("")}</div></div>`;
  let stop = null;
  view.onclick = (e) => {
    const f = e.target.closest("[data-f]");
    if (f) { songFilter = +f.dataset.f; stop?.(); renderSongs(); return; }
    const l = e.target.closest("[data-listen-song]");
    if (l) { stop?.(); stop = listenExercise(songById(l.dataset.listenSong).ex, l); planMark("song"); }
  };
  cleanup = { cleanup: () => stop?.() };
}

/* ───────────── glossary ───────────── */
function renderGlossary() {
  view.innerHTML = `<div class="page glossary">
    <header class="page-h"><button class="ibtn" data-nav="#/tools" aria-label="Back">←</button><h2>📖 Glossary</h2></header>
    <input type="search" class="search" placeholder="Search: staccato, key signature, dotted…" aria-label="Search the glossary">
    ${GLOSSARY.map((grp, gi) => `<section class="gl-grp"><h3>${esc(grp.g)}</h3>${grp.items.map((it, ii) => `
      <div class="gl-item" data-s="${esc((it.t + " " + it.d).toLowerCase())}"><b>${esc(it.t)}</b><p>${esc(it.d)}</p>${it.ex ? `<div class="gl-ex" data-ex="${gi}-${ii}"></div>` : ""}</div>`).join("")}</section>`).join("")}
    <p class="muted small center gl-none" hidden>Nothing found.</p>
  </div>`;
  view.querySelectorAll(".gl-ex").forEach((el) => {
    const [gi, ii] = el.dataset.ex.split("-").map(Number);
    const ex = GLOSSARY[gi].items[ii].ex;
    const st = new Staff(el);
    st.showFingers = false;
    st.render(parseExercise(ex));
    el.onclick = () => listenExercise({ tempo: 90, ...ex }, { set textContent(v) {}, set onclick(v) {} });
    el.title = "Tap to hear";
  });
  const q = view.querySelector(".search");
  q.addEventListener("input", () => {
    const s = q.value.trim().toLowerCase();
    let any = false;
    view.querySelectorAll(".gl-item").forEach((it) => { const hit = !s || it.dataset.s.includes(s); it.hidden = !hit; any ||= hit; });
    view.querySelectorAll(".gl-grp").forEach((g) => (g.hidden = !g.querySelector(".gl-item:not([hidden])")));
    view.querySelector(".gl-none").hidden = any;
  });
}

/* ───────────── tools ───────────── */
function renderTools() {
  view.innerHTML = `<div class="page">
    <header class="page-h"><h2>Tools</h2></header>
    <div class="tools-grid"><a class="tool-card" data-nav="#/glossary"><span class="ti">📖</span><b>Glossary</b><small>Every music term and symbol explained, with examples you can hear.</small></a>${TOOLS.map((t) => `<a class="tool-card" data-nav="#/tool/${t.id}"><span class="ti">${t.icon}</span><b>${t.title}</b><small>${t.sub}</small></a>`).join("")}</div>
  </div>`;
}

/* ───────────── progress & settings ───────────── */
function renderProgress() {
  const days = lastDays(14);
  const max = Math.max(600, ...days.map((d) => d.sec));
  const total = Object.values(store.s.days).reduce((a, b) => a + b, 0);
  const S = store.s.settings;
  view.innerHTML = `<div class="page progress">
    <header class="page-h"><h2>Progress</h2></header>
    <div class="stat-row">
      <div class="stat"><b>${ALL_LESSONS.filter((l) => store.isDone(l.id)).length}</b><span>lessons done</span></div>
      <div class="stat"><b>${store.streak()}🔥</b><span>day streak</span></div>
      <div class="stat"><b>${Math.round(total / 60)}</b><span>minutes total</span></div>
    </div>
    <div class="card"><h3>Last 14 days</h3>
      <div class="chart" role="img" aria-label="Minutes practiced per day">${days.map((d) => `<div class="col" title="${d.date}: ${Math.round(d.sec / 60)} min"><i style="height:${(100 * d.sec) / max}%"></i><span>${"SMTWTFS"[d.dow]}</span></div>`).join("")}</div>
      <p class="muted small">Time counts while you're playing, practicing or training. Aim for at least 15 minutes a day.</p>
    </div>
    <div class="card"><h3>Levels</h3>${LEVELS.map((lv, i) => {
      const n = lv.lessons.filter((l) => store.isDone(l.id)).length;
      return `<div class="lvrow" style="--c:${lv.color}"><span>${i + 1}. ${esc(lv.title)}</span><div class="bar"><i style="width:${(100 * n) / lv.lessons.length}%"></i></div><span>${n}/${lv.lessons.length}</span></div>`;
    }).join("")}
      <p class="muted small">Trainer records — Note reading (60 s): <b>${store.best("reading60") || "—"}</b> · Ear training streak: <b>${store.best("ear_streak") || "—"}</b></p>
    </div>
    <div class="card settings"><h3>Settings</h3>
      <label>Note names <select data-s="names"><option value="letters">C D E F G A B</option><option value="solfege">Do Re Mi Fa Sol La Si</option></select></label>
      <label>Keyboard key names <select data-s="labels"><option value="all">All keys</option><option value="c">C only</option><option value="none">None</option></select></label>
      <label>Theme <select data-s="theme"><option value="auto">Automatic</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label><input type="checkbox" data-s="fingers"> Show finger numbers on the music</label>
      <label><input type="checkbox" data-s="click"> Metronome click while playing</label>
      <label><input type="checkbox" data-s="countIn"> One-bar count-in before Listen</label>
      <label>Sound <select data-s="sound"><option value="piano">Grand piano (recorded)</option><option value="synth">Simple synth</option></select></label>
      <label>Daily goal <select data-s="goalMin"><option value="5">5 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label>
      <label><input type="checkbox" data-s="speak"> Say the notes out loud in Step by step</label>
      <label><input type="checkbox" data-s="accompany"> Play the other hand for me (one-hand practice)</label>
      <label><input type="checkbox" data-s="autoSpeed"> Speed up 5 bpm after a perfect Play along</label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-s="volume"></label>
      <label>Microphone sensitivity <input type="range" min="0.5" max="2.5" step="0.1" data-s="micSens"></label>
      <div class="row"><button class="btn" data-act="test">🔊 Test sound</button><button class="btn" data-act="export">⬇ Back up progress</button><label class="btn">⬆ Restore<input type="file" accept="application/json" data-act="import" hidden></label><button class="btn danger" data-act="reset">Reset progress</button></div>
    </div>
    <p class="muted small center">PianoPath works offline once loaded · add it to your home screen for a full-screen app.<br>Piano sound: Salamander Grand Piano by Alexander Holm (CC-BY 3.0).</p>
  </div>`;
  const root = view.querySelector(".settings");
  root.querySelectorAll("[data-s]").forEach((el) => {
    const k = el.dataset.s;
    if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k];
  });
  root.addEventListener("input", (e) => {
    const k = e.target.dataset.s;
    if (!k) return;
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value;
    store.setting(k, v);
    if (k === "names") setNameStyle(v);
    if (k === "volume") setVolume(v);
    if (k === "theme") applyTheme();
    if (k === "sound") setSound(v);
    if (k === "goalMin") store.setting("goalMin", +v);
  });
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "test") { audio(); [60, 64, 67, 72].forEach((m, i) => playNote(m, { when: audio().currentTime + i * 0.15, dur: 1.2 })); }
    if (act === "reset" && confirm("Erase all progress? This can't be undone.")) { store.reset(); renderProgress(); }
    if (act === "export") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([store.export()], { type: "application/json" }));
      a.download = "pianopath-progress.json";
      a.click();
    }
  });
  root.querySelector("[data-act=import]").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.done || !data.settings) throw new Error("not a PianoPath backup");
      localStorage.setItem("pianopath.v1", JSON.stringify(data));
      location.reload();
    } catch (err) { toast(null, "Couldn't restore: " + err.message); }
  });
}

function applyTheme() {
  const t = store.setting("theme");
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}

/* unlock audio on first touch (iOS) */
window.addEventListener("pointerdown", () => { audio(); if (store.setting("sound") !== "synth") loadSamples(); }, { once: true });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

route();

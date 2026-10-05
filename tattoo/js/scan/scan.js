/* "Scan me" — make an avatar of yourself.

   mountScan(container, { getBody, buildBody, onDone, onCancel, toast, units }) → { reset(), destroy() }

   Step by step: intro (name, sex, height, weight) → front photo → cut-out check
   → side photo (optional) → cut-out check → landmark lines → fitting → result
   (3D preview, measurements, sliders, skin tone) → onDone(avatar).
   Or: intro → "No photos? Enter measurements" → fitting → result.

   Photos never leave the device: cut-out, measuring and fitting all run here
   (in a worker when possible). */
import * as P from "./pipeline.js";
import { LANDMARKS } from "./silhouette.js";
import { IMAGE_ACCEPT } from "../imageio.js";
import { SKIN_TONES } from "../settings.js";
import { nearestSwatch } from "./skin.js";
import * as BM from "./bodymeasure.js";
import { measureAt, modelCircs, tapeOf } from "./fit.js";

const CSS_HREF = new URL("./scan.css", import.meta.url).href;
const DRAFT_KEY = "inkform.scan.draft";
const DEFAULT_SKIN = "#d09a74";

function ensureCss() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  if (links.some((l) => l.href === CSS_HREF || (l.getAttribute("href") || "").includes("scan/scan.css"))) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = CSS_HREF;
  document.head.appendChild(l);
}
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const put = (node, ...kids) => node.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false && k !== ""));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") || null; } catch { return null; } };
const writeDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
const isTouch = () => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } };

// ------------------------------------------------------------------ icons & drawings
const IC = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  selfie: '<svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><circle cx="12" cy="6.5" r="1"/><circle cx="12" cy="12.5" r="2.4"/><path d="M8.5 18.5c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4"/></svg>',
  gallery: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="M21 16l-5-5-7 7"/></svg>',
  shirt: '<svg viewBox="0 0 24 24"><path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/></svg>',
  wall: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/></svg>',
  body: '<svg viewBox="0 0 24 24"><circle cx="12" cy="4" r="2"/><path d="M12 7v7M7 9l5-1 5 1M9 21l3-7 3 7"/><path d="M3 2v3M3 19v3M21 2v3M21 19v3"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  brush: '<svg viewBox="0 0 24 24"><path d="M4 20c3 0 5-1.5 5-4l9-11 2 2-11 9c-2.5 0-4 2-5 4z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  retake: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/></svg>',
};

const FIG_FILL = "currentColor";
function poseFrontSVG() {
  return `<svg viewBox="0 -2 200 304" role="img" aria-label="Stand facing the camera, arms a little out to the sides, feet hip-width apart">
  <rect x="26" y="10" width="148" height="280" rx="10" fill="none" stroke="var(--bs-accent)" stroke-width="2" stroke-dasharray="6 5"/>
  <g fill="${FIG_FILL}" opacity=".78" style="color:var(--bs-muted)">
    <circle cx="100" cy="35" r="15"/>
    <rect x="94" y="48" width="12" height="12" rx="4"/>
    <path d="M77 60 Q100 53 123 60 L127 92 Q121 117 124 140 L76 140 Q79 117 73 92 Z"/>
    <path d="M75 137 L125 137 L127 163 L104 165 L100 156 L96 165 L73 163 Z"/>
    <g stroke="currentColor" stroke-width="11" stroke-linecap="round" fill="none">
      <path d="M80 66 L62 104 L47 138"/><path d="M120 66 L138 104 L153 138"/>
      <path d="M89 160 L87 214 L85 266" stroke-width="14"/><path d="M111 160 L113 214 L115 266" stroke-width="14"/>
    </g>
    <circle cx="45" cy="143" r="6.5"/><circle cx="155" cy="143" r="6.5"/>
    <ellipse cx="82" cy="273" rx="9" ry="5"/><ellipse cx="118" cy="273" rx="9" ry="5"/>
  </g>
  <g fill="none" stroke="var(--bs-accent)" stroke-width="2" stroke-linecap="round">
    <path d="M72 78 A30 30 0 0 0 63 101"/><path d="M128 78 A30 30 0 0 1 137 101"/>
    <path d="M86 284 L114 284" /><path d="M86 280 v8 M114 280 v8"/>
  </g>
  <g fill="var(--bs-accent)" font-size="11" font-family="inherit" font-weight="700" text-anchor="middle">
    <text x="45" y="84">≈30°</text><text x="100" y="7" font-size="10">head to toe in the picture</text><text x="100" y="298" font-size="10">feet apart</text>
  </g>
</svg>`;
}
function poseSideSVG() {
  return `<svg viewBox="0 -2 200 304" role="img" aria-label="Stand sideways, arms straight out in front at shoulder height">
  <rect x="26" y="10" width="148" height="280" rx="10" fill="none" stroke="var(--bs-accent)" stroke-width="2" stroke-dasharray="6 5"/>
  <g fill="${FIG_FILL}" opacity=".78" style="color:var(--bs-muted)">
    <circle cx="92" cy="35" r="15"/><path d="M105 31 l6 5 -6 2z"/>
    <rect x="86" y="48" width="12" height="12" rx="4"/>
    <path d="M80 60 Q96 54 104 60 Q112 86 108 112 Q112 132 108 150 L78 150 Q70 134 76 112 Q72 86 80 60Z"/>
    <g stroke="currentColor" stroke-linecap="round" fill="none">
      <path d="M92 68 L166 68" stroke-width="11"/>
      <path d="M90 150 L91 212 L92 266" stroke-width="15"/>
    </g>
    <circle cx="172" cy="68" r="6.5"/>
    <ellipse cx="101" cy="273" rx="14" ry="5"/>
  </g>
  <g fill="none" stroke="var(--bs-accent)" stroke-width="2" stroke-linecap="round"><path d="M120 54 L160 54"/><path d="M152 49 L160 54 L152 59"/></g>
  <g fill="var(--bs-accent)" font-size="10" font-family="inherit" font-weight="700" text-anchor="middle">
    <text x="142" y="44">arms forward</text><text x="100" y="7">head to toe in the picture</text><text x="100" y="298">feet together</text>
  </g>
</svg>`;
}
function heroSVG() {
  return `<svg viewBox="0 0 92 112" aria-hidden="true">
  <rect x="2" y="2" width="56" height="100" rx="9" fill="var(--bs-panel2)" stroke="var(--bs-border)" stroke-width="2"/>
  <g fill="var(--bs-muted)"><circle cx="30" cy="24" r="6"/><path d="M21 32 Q30 29 39 32 L41 60 L19 60 Z"/>
  <g stroke="var(--bs-muted)" stroke-width="5" stroke-linecap="round"><path d="M22 35 L13 55"/><path d="M38 35 L47 55"/><path d="M25 60 L24 88"/><path d="M35 60 L36 88"/></g></g>
  <g fill="none" stroke="var(--bs-accent)" stroke-width="2.4" stroke-linecap="round"><path d="M8 14 v-6 h6M46 8 h6 v6M52 92 v6 h-6M14 98 h-6 v-6"/></g>
  <g transform="translate(60 52)"><path d="M2 30 L16 8 L30 30 Z" fill="var(--bs-accent)" opacity=".18"/>
  <path d="M16 4 l11 6 v13 l-11 6 l-11 -6 v-13z" fill="none" stroke="var(--bs-accent)" stroke-width="2.4" stroke-linejoin="round"/><path d="M5 10 l11 6 l11 -6 M16 16 v13" fill="none" stroke="var(--bs-accent)" stroke-width="2"/></g>
</svg>`;
}
function fitFigSVG() {
  return `<svg class="bs-fig" viewBox="0 0 90 150" aria-hidden="true"><g class="bs-pulse" fill="var(--bs-accent)" opacity=".85">
  <circle cx="45" cy="16" r="10"/><path d="M30 30 Q45 25 60 30 L63 70 L27 70 Z"/>
  <g stroke="var(--bs-accent)" stroke-width="7" stroke-linecap="round"><path d="M31 33 L19 64"/><path d="M59 33 L71 64"/><path d="M37 70 L36 138"/><path d="M53 70 L54 138"/></g></g></svg>`;
}

// ------------------------------------------------------------------ text
const ISSUE_TEXT = {
  "no-person": "We couldn't find a person in this photo. Try again in front of a plain wall, or fix the cut-out by hand.",
  "not-person": "This doesn't look like a whole standing person — check the cut-out below.",
  "cut-head": "The top of your head is cut off — step back a little or hold the phone a bit lower.",
  "cut-feet": "Your feet are cut off — your whole body must be in the picture, head to toe.",
  "touch-edge": "You're touching the edge of the photo — leave some space around you (arms too).",
  "too-small": "You're quite small in the photo — come a little closer so you fill most of the height.",
  "tilted": "The photo looks tilted — hold the phone upright and stand straight.",
  "legs-together": "We can't see the gap between your legs — stand with your feet hip-width apart.",
  "arms-down": "Hold your arms a little away from your body (like an A) so we can see your sides.",
  "hands-touch": "A hand seems to touch your hip — keep your hands away from your body.",
  "busy-bg": "The background is busy, so the cut-out may be off — a plain wall works best.",
  "front-like": "This looks like a front-facing photo — for this one, turn sideways.",
};
const LM_LABEL = {
  top: "Top of head", chin: "Chin", neck: "Neck", shoulder: "Shoulders", armpit: "Armpits", chest: "Chest",
  waist: "Waist", hip: "Hips", crotch: "Crotch", thigh: "Thigh", knee: "Knees", calf: "Calves", ankle: "Ankles", sole: "Soles",
};
const PARAMS = [
  { key: "build", label: "Build", min: 0, max: 1, step: 0.01, pct: true },
  { key: "muscle", label: "Muscle", min: 0, max: 1, step: 0.01, pct: true },
  { key: "shoulders", label: "Shoulders", min: 0, max: 1, step: 0.01, pct: true },
  { key: "chest", label: "Chest", labelF: "Bust", min: 0, max: 1, step: 0.01, pct: true },
  { key: "hips", label: "Hips", min: 0, max: 1, step: 0.01, pct: true },
  { key: "legLength", label: "Leg length", min: 0, max: 1, step: 0.01, pct: true },
  { key: "armPose", label: "Arm pose", min: 5, max: 90, step: 1, deg: true },
];
const STEP_DOT = { intro: 0, front: 1, frontcut: 1, side: 2, sidecut: 2, marks: 3, tape: 1, fit: 4, result: 4 };

// ------------------------------------------------------------------ mount
export function mountScan(container, opts = {}) {
  ensureCss();
  const o = {
    getBody: () => ({}), buildBody: null, onDone: () => {}, onCancel: () => {}, toast: () => {}, units: "cm", ...opts,
  };
  const imperial = o.units === "in";
  const fmtLen = (cm, digits = 1) => (cm == null || !isFinite(cm) ? "—" : imperial ? `${(cm / 2.54).toFixed(digits)} in` : `${cm.toFixed(digits)} cm`);
  const fmtHeight = (cm) => {
    if (!imperial) return `${Math.round(cm)} cm`;
    const tin = Math.round(cm / 2.54);
    return `${Math.floor(tin / 12)}′ ${tin % 12}″`;
  };

  // ---------------------------------------------------------------- state
  const body0 = (() => { try { return o.getBody() || {}; } catch { return {}; } })();
  const draft = readDraft();
  const fresh = () => ({
    step: "intro", mode: "photo",
    name: draft?.name || "Me",
    sex: draft?.sex || (body0.sex === "female" ? "female" : "male"),
    heightCm: draft?.heightCm || null,
    weightKg: draft?.weightKg || null,
    front: null, side: null, rows: null, sideRows: null,
    tape: { chest: null, waist: null, hips: null, shoulder: null, inseam: null },
    fit: null, params: null, skin: null, skinChoice: null, measures: null,
    busy: false, sideSkipped: false,
  });
  let st = fresh();
  if (!st.heightCm && body0.heightCm && (draft || body0.heightCm !== 178)) st.heightCm = body0.heightCm;
  let preview = null, previewReq = 0, lastGeom = null, roPreview = null, destroyed = false;
  let pickKind = "front";

  // ---------------------------------------------------------------- DOM
  const root = el("div", { class: "bodyscan", role: "dialog", "aria-label": "Scan me — make an avatar of yourself" });
  const btnBack = el("button", { class: "bs-iconbtn", type: "button", "aria-label": "Back", html: IC.back, onclick: () => back() });
  const btnClose = el("button", { class: "bs-iconbtn", type: "button", "aria-label": "Close", title: "Close", html: IC.close, onclick: () => close() });
  const titleEl = el("b", {}, "Scan me");
  const dots = el("div", { class: "bs-dots", "aria-hidden": "true" });
  const head = el("header", { class: "bs-head" }, btnBack, el("div", { class: "bs-head__title" }, titleEl, dots), btnClose);
  const main = el("main", { class: "bs-main" });
  const foot = el("footer", { class: "bs-foot" });
  const busyEl = el("div", { class: "bs-busy", hidden: true, role: "status", "aria-live": "polite" });
  const mkInput = (capture) => {
    const i = el("input", { type: "file", accept: capture ? "image/*" : IMAGE_ACCEPT, hidden: true, "aria-hidden": "true", tabindex: "-1" });
    if (capture) i.setAttribute("capture", capture);
    i.addEventListener("change", () => { const f = i.files && i.files[0]; i.value = ""; if (f) loadPhoto(pickKind, f); });
    return i;
  };
  const inCamBack = mkInput("environment"), inCamFront = mkInput("user"), inGallery = mkInput(null);
  root.append(head, main, foot, busyEl, inCamBack, inCamFront, inGallery);
  container.appendChild(root);

  function setBusy(text) {
    if (!text) { busyEl.hidden = true; st.busy = false; return; }
    st.busy = true;
    put(busyEl, el("div", {}, el("div", { class: "bs-spin" }), el("div", {}, text)));
    busyEl.hidden = false;
  }
  const toast = (m) => { try { o.toast(m); } catch { /* ignore */ } };

  // ---------------------------------------------------------------- navigation
  function go(step) {
    st.step = step;
    render();
    main.scrollTop = 0;
  }
  function back() {
    if (st.busy) return;
    const s = st.step;
    if (s === "intro") return close();
    if (s === "front" || s === "tape") return go("intro");
    if (s === "frontcut") return go("front");
    if (s === "side") return go("frontcut");
    if (s === "sidecut") return go("side");
    if (s === "marks") return go(st.side && !st.sideSkipped ? "sidecut" : "side");
    if (s === "fit") { P.cancelJobs(); return go(st.mode === "tape" ? "tape" : "marks"); }
    if (s === "result") return go(st.mode === "tape" ? "tape" : "marks");
  }
  function close() {
    P.cancelJobs();
    try { o.onCancel(); } catch { /* ignore */ }
  }

  function render() {
    if (destroyed) return;
    const s = st.step;
    const n = st.mode === "tape" ? 3 : 5;
    const at = st.mode === "tape" ? (s === "intro" ? 0 : s === "tape" ? 1 : 2) : STEP_DOT[s];
    put(dots, Array.from({ length: n }, (_, i) => el("i", { class: i === at ? "on" : i < at ? "done" : "" })));
    btnBack.disabled = s === "intro";
    titleEl.textContent = {
      intro: "Scan me", front: "Front photo", frontcut: "Check the cut-out", side: "Side photo", sidecut: "Check the cut-out",
      marks: "Check the lines", tape: "Your measurements", fit: "Making your avatar", result: "Your avatar",
    }[s] || "Scan me";
    if (s !== "result") teardownPreview();
    if (s === "marks" || s === "result") root.dataset.wide = ""; else delete root.dataset.wide;
    ({ intro: renderIntro, front: () => renderCapture("front"), side: () => renderCapture("side"),
      frontcut: () => renderCut("front"), sidecut: () => renderCut("side"), marks: renderMarks,
      tape: renderTape, fit: renderFit, result: renderResult })[s]();
  }

  // ---------------------------------------------------------------- intro
  function heightInputs(onChange) {
    if (!imperial) {
      const i = el("input", { type: "number", inputmode: "decimal", min: "140", max: "210", step: "0.5", id: "bs-h", placeholder: "e.g. 172", value: st.heightCm ? String(Math.round(st.heightCm * 2) / 2) : "", "aria-describedby": "bs-h-hint" });
      i.addEventListener("input", () => { const v = parseFloat(i.value); onChange(isFinite(v) ? v : null); });
      return el("div", { class: "bs-unit" }, i, el("span", {}, "cm"));
    }
    const tin = st.heightCm ? Math.round(st.heightCm / 2.54) : null;
    const ft = el("input", { type: "number", inputmode: "numeric", min: "4", max: "7", id: "bs-h", placeholder: "5", value: tin ? String(Math.floor(tin / 12)) : "", "aria-label": "Height, feet" });
    const inch = el("input", { type: "number", inputmode: "numeric", min: "0", max: "11", placeholder: "8", value: tin ? String(tin % 12) : "", "aria-label": "Height, inches" });
    const upd = () => { const f = parseFloat(ft.value), i = parseFloat(inch.value) || 0; onChange(isFinite(f) ? (f * 12 + i) * 2.54 : null); };
    ft.addEventListener("input", upd); inch.addEventListener("input", upd);
    return el("div", { class: "bs-row" }, el("div", { class: "bs-unit" }, ft, el("span", {}, "ft")), el("div", { class: "bs-unit" }, inch, el("span", {}, "in")));
  }
  function seg(options, value, onPick, label) {
    const g = el("div", { class: "bs-seg", role: "group", "aria-label": label });
    for (const [v, text] of options) {
      const b = el("button", { type: "button", "aria-pressed": String(v === value) }, text);
      b.addEventListener("click", () => {
        for (const x of g.children) x.setAttribute("aria-pressed", String(x === b));
        onPick(v);
      });
      g.append(b);
    }
    return g;
  }
  function saveDraft() { writeDraft({ name: st.name, sex: st.sex, heightCm: st.heightCm, weightKg: st.weightKg }); }
  function renderIntro() {
    const err = el("div", { class: "bs-err", role: "alert" });
    const nameIn = el("input", { type: "text", id: "bs-name", value: st.name || "Me", maxlength: "40", autocomplete: "off" });
    nameIn.addEventListener("input", () => { st.name = nameIn.value.trim() || "Me"; });
    const wIn = el("input", { type: "number", inputmode: "decimal", id: "bs-w", min: imperial ? "60" : "30", max: imperial ? "500" : "230", step: "0.5", placeholder: "optional",
      value: st.weightKg ? String(imperial ? Math.round(st.weightKg / 0.4536) : Math.round(st.weightKg)) : "" });
    wIn.addEventListener("input", () => { const v = parseFloat(wIn.value); st.weightKg = isFinite(v) && v > 0 ? (imperial ? v * 0.4536 : v) : null; });
    const validate = () => {
      if (!(st.heightCm >= 140 && st.heightCm <= 210)) {
        err.textContent = `Please enter your height (${imperial ? "4′ 7″ – 6′ 11″" : "140–210 cm"}) — it sets the size of everything.`;
        root.querySelector("#bs-h")?.focus();
        return false;
      }
      if (st.weightKg != null && (st.weightKg < 30 || st.weightKg > 230)) st.weightKg = null;
      err.textContent = ""; saveDraft();
      return true;
    };
    put(main, el("div", { class: "bs-page" },
      el("div", { class: "bs-hero" }, el("span", { html: heroSVG() }), el("div", {},
        el("h2", {}, "Make a 3D avatar of you"),
        el("p", { class: "bs-muted", style: "margin:0" }, "Take two quick photos (front and side). We'll measure your shape and build a body that matches — about two minutes."))),
      el("h3", {}, "You'll need"),
      el("ul", { class: "bs-need" },
        el("li", { html: IC.shirt + "<div><b>Tight-ish clothes</b><br><span class='bs-muted bs-small'>Shorts and a fitted top are best. Tie long hair up.</span></div>" }),
        el("li", { html: IC.wall + "<div><b>A plain wall</b><br><span class='bs-muted bs-small'>Stand a step in front of it, in good even light.</span></div>" }),
        el("li", { html: IC.body + "<div><b>Your whole body in frame</b><br><span class='bs-muted bs-small'>Head to toe, barefoot or flat shoes.</span></div>" }),
        el("li", { html: IC.timer + "<div><b>A friend or a timer</b><br><span class='bs-muted bs-small'>Phone upright at waist height, 2–3 m (7–10 ft) away.</span></div>" })),
      el("div", { class: "bs-privacy", html: IC.lock + "<div><b>Photos stay on this device — nothing is uploaded.</b></div>" }),
      el("div", { class: "bs-form" },
        el("div", { class: "bs-field" }, el("label", { for: "bs-name" }, "Name"), nameIn),
        el("div", { class: "bs-field" }, el("span", { class: "bs-label" }, "Body type"),
          seg([["male", "Male"], ["female", "Female"]], st.sex, (v) => { st.sex = v; }, "Body type")),
        el("div", { class: "bs-field" }, el("label", { for: "bs-h" }, "Height ", el("span", { class: "bs-muted" }, "(required)")),
          heightInputs((v) => { st.heightCm = v; }), el("span", { class: "bs-hint", id: "bs-h-hint" }, "Your real height without shoes — it sets the scale.")),
        el("div", { class: "bs-field" }, el("label", { for: "bs-w" }, "Weight ", el("span", { class: "bs-muted" }, "(optional)")),
          el("div", { class: "bs-unit" }, wIn, el("span", {}, imperial ? "lb" : "kg")), el("span", { class: "bs-hint" }, "Helps us guess your build.")),
        err),
    ));
    put(foot,
      el("button", { type: "button", class: "bs-btn bs-btn--ghost", onclick: () => { if (validate()) { st.mode = "tape"; go("tape"); } }, html: IC.ruler + "<span>No photos? Enter measurements</span>" }),
      el("span", { class: "bs-spacer" }),
      el("button", { type: "button", class: "bs-btn bs-btn--primary", onclick: () => { if (validate()) { st.mode = "photo"; go("front"); } }, html: "<span>Start with photos</span>" + IC.next }));
  }

  // ---------------------------------------------------------------- capture
  function renderCapture(kind) {
    pickKind = kind;
    const front = kind === "front";
    const tips = front
      ? ["Face the camera, standing straight", "Arms a little out to the sides, like an A", "Feet hip-width apart", "Phone upright at waist height, 2–3 m away", "Whole body in the picture, head to toe"]
      : ["Turn sideways (either side)", "Arms straight out in front at shoulder height", "Feet together, stand tall, look ahead", "Same spot and distance as the front photo", "Whole body in the picture, head to toe"];
    const pick = (input) => { pickKind = kind; input.click(); };
    put(main, el("div", { class: "bs-page" },
      el("div", { class: "bs-capture" },
        el("div", { class: "bs-guide", html: front ? poseFrontSVG() : poseSideSVG() }),
        el("div", {},
          el("h2", {}, front ? "Front photo" : "Side photo"),
          !front ? el("p", { class: "bs-muted" }, "Optional, but it makes chest, waist and hips much more accurate.") : null,
          el("ol", { class: "bs-tips" }, tips.map((t, i) => el("li", {}, el("b", {}, String(i + 1)), el("span", {}, t)))),
          el("div", { class: "bs-actions" },
            el("button", { type: "button", class: "bs-btn bs-btn--primary bs-btn--block", onclick: () => pick(inCamBack), html: IC.camera + "<span>Take photo</span>" }),
            el("button", { type: "button", class: "bs-btn bs-btn--block", onclick: () => pick(inCamFront), html: IC.selfie + "<span>Selfie camera</span>" }),
            el("button", { type: "button", class: "bs-btn bs-btn--block", onclick: () => pick(inGallery), html: IC.gallery + "<span>Choose from gallery</span>" })),
          el("div", { class: "bs-drop" }, "Can't add photos here? Paste one (Ctrl+V, or long-press → Paste), drop it on this page, or ",
            el("button", { type: "button", class: "bs-btn bs-btn--link", onclick: () => { st.mode = "tape"; go("tape"); } }, "enter measurements instead"), "."),
          st[kind] ? el("p", { class: "bs-muted bs-small", style: "margin-top:10px" }, "You already have a photo here — ",
            el("button", { type: "button", class: "bs-btn bs-btn--link", onclick: () => go(kind + "cut") }, "use it"), ".") : null,
        ))));
    put(foot, front ? null : el("button", { type: "button", class: "bs-btn", onclick: () => { st.side = null; st.sideSkipped = true; st.sideRows = null; go("marks"); } }, "Skip side photo"));
  }

  async function loadPhoto(kind, file) {
    if (st.busy || destroyed) return;
    setBusy(kind === "front" ? "Finding you in the photo…" : "Finding you in the side photo…");
    try {
      const photo = await P.preparePhoto(file);
      const seg = await P.cutOut(photo);
      if (destroyed) return;
      st[kind] = { photo, mask: seg.mask, mw: seg.w, mh: seg.h, plain: seg.plain, undo: [], an: null };
      if (kind === "side") st.sideSkipped = false;
      analyze(kind, true);
      setBusy(null);
      go(kind + "cut");
    } catch (e) {
      setBusy(null);
      if (String(e?.message) !== "cancelled") toast(e?.message || "Couldn't open that photo");
    }
  }

  function analyze(kind, resetRows) {
    const d = st[kind];
    if (!d) return;
    d.an = kind === "front" ? P.analyzeFront(d.mask, d.mw, d.mh, d.photo.cam) : P.analyzeSide(d.mask, d.mw, d.mh, d.photo.cam);
    const issues = d.an.issues.slice();
    if (!d.plain) issues.push("busy-bg");
    if (kind === "side" && st.front?.an?.lm && d.an.S) {
      const f = P.measurementsCm(st.front.an, d.an, st.front.an.lm, 170).frac;
      if (f.chestD > f.chestW * 0.9) issues.push("front-like");
    }
    d.issues = [...new Set(issues)];
    if (kind === "front" && resetRows) st.rows = null;
    if (kind === "side" && resetRows) st.sideRows = null;
  }

  // ---------------------------------------------------------------- cut-out review
  function tintedPhoto(d, strength = 0.68) {
    const { photo, mask, mw, mh } = d;
    const c = document.createElement("canvas");
    c.width = mw; c.height = mh;
    const g = c.getContext("2d");
    // the measuring-size pixels are already in memory (same size as the mask): no canvas read-back
    const id = new ImageData(new Uint8ClampedArray(photo.big.rgba), mw, mh), p = id.data;
    const acc = accentRGB();
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x, a = mask[i] / 255, k = strength * (1 - a);
        let r = p[i * 4] * (1 - k) + 14 * k, gg = p[i * 4 + 1] * (1 - k) + 14 * k, b = p[i * 4 + 2] * (1 - k) + 22 * k;
        // outline: inside pixels with an outside pixel 2 px away
        if (mask[i] >= 128 && ((x > 1 && mask[i - 2] < 128) || (x < mw - 2 && mask[i + 2] < 128) || (y > 1 && mask[i - 2 * mw] < 128) || (y < mh - 2 && mask[i + 2 * mw] < 128))) {
          r = acc[0]; gg = acc[1]; b = acc[2];
        }
        p[i * 4] = r; p[i * 4 + 1] = gg; p[i * 4 + 2] = b;
      }
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function accentRGB() {
    const v = getComputedStyle(root).getPropertyValue("--bs-accent").trim() || "#e0455f";
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    return [224, 69, 95];
  }
  function issuesBanner(issues) {
    if (!issues.length) return el("div", { class: "bs-banner bs-banner--ok", html: IC.ok + "<div><b>Looks good!</b> If the outline hugs your body, carry on.</div>" });
    return el("div", { class: "bs-banner bs-banner--warn", role: "status" },
      el("span", { html: IC.warn }),
      el("div", {}, el("b", {}, "Please check this photo"), el("ul", {}, issues.map((k) => el("li", {}, ISSUE_TEXT[k] || k)))));
  }

  function renderCut(kind) {
    const d = st[kind];
    if (!d) return go(kind);
    pickKind = kind;
    const tool = { mode: null, size: 18 };
    const canvas = el("canvas", { "aria-label": "Your photo with the cut-out outlined" });
    const stage = el("div", { class: "bs-stage" }, canvas);
    const bannerBox = el("div");
    const redraw = () => {
      const t = tintedPhoto(d);
      canvas.width = t.width; canvas.height = t.height;
      canvas.getContext("2d").drawImage(t, 0, 0);
      put(bannerBox, issuesBanner(d.issues));
    };
    redraw();
    // editing
    let box = null, last = null, drawing = false, base = null;
    const toMask = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * d.mw, (e.clientY - r.top) / r.height * d.mh];
    };
    const dab = (x, y) => {
      const rad = tool.size * d.mw / Math.max(1, canvas.getBoundingClientRect().width), keep = tool.mode === "keep";
      const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(d.mw - 1, Math.ceil(x + rad));
      const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(d.mh - 1, Math.ceil(y + rad));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const dd = Math.hypot(xx - x, yy - y) / rad;
        if (dd > 1) continue;
        const v = Math.round(255 * clamp((1 - dd) / 0.3, 0, 1));
        const i = yy * d.mw + xx;
        d.mask[i] = keep ? Math.max(d.mask[i], v) : Math.min(d.mask[i], 255 - v);
      }
    };
    const drawCursor = () => {
      canvas.getContext("2d").drawImage(base, 0, 0);
      if (box) {
        const g = canvas.getContext("2d");
        g.save(); g.strokeStyle = "#fff"; g.lineWidth = Math.max(2, d.mw / 300); g.setLineDash([10, 8]);
        g.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); g.restore();
      }
    };
    stage.addEventListener("pointerdown", (e) => {
      if (!tool.mode || st.busy) return;
      e.preventDefault();
      stage.setPointerCapture?.(e.pointerId);
      drawing = true;
      const [x, y] = toMask(e);
      if (tool.mode === "box") { base = tintedPhoto(d); box = [x, y, x, y]; drawCursor(); return; }
      d.undo.push(Uint8Array.from(d.mask)); if (d.undo.length > 12) d.undo.shift();
      last = [x, y]; dab(x, y); redrawFast();
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drawing) return;
      const [x, y] = toMask(e);
      if (tool.mode === "box") { box[2] = x; box[3] = y; drawCursor(); return; }
      const steps = Math.max(1, Math.ceil(Math.hypot(x - last[0], y - last[1]) / 3));
      for (let k = 1; k <= steps; k++) dab(last[0] + (x - last[0]) * k / steps, last[1] + (y - last[1]) * k / steps);
      last = [x, y];
      redrawFast();
    });
    const end = async () => {
      if (!drawing) return;
      drawing = false;
      if (tool.mode === "box" && box) {
        const r = { x0: Math.min(box[0], box[2]) / d.mw, x1: Math.max(box[0], box[2]) / d.mw, y0: Math.min(box[1], box[3]) / d.mh, y1: Math.max(box[1], box[3]) / d.mh };
        box = null;
        if (r.x1 - r.x0 < 0.05 || r.y1 - r.y0 < 0.1) { redraw(); return; }
        setBusy("Cutting out again…");
        try {
          const seg = await P.cutOut(d.photo, r);
          d.undo.push(Uint8Array.from(d.mask));
          d.mask = seg.mask; d.plain = seg.plain;
        } catch (e) { toast(e?.message || "Couldn't redo the cut-out"); }
        setBusy(null);
      }
      analyze(kind, true);
      redraw();
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    let raf = 0;
    function redrawFast() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; const t = tintedPhoto(d); canvas.getContext("2d").drawImage(t, 0, 0); });
    }

    const toolsBox = el("div", { class: "bs-tools", hidden: true });
    const setMode = (m) => {
      tool.mode = m;
      stage.classList.toggle("bs-stage--edit", !!m);
      for (const b of toolsBox.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
    };
    const sizeIn = el("input", { type: "range", min: "6", max: "60", value: String(tool.size), "aria-label": "Brush size" });
    sizeIn.addEventListener("input", () => { tool.size = +sizeIn.value; });
    put(toolsBox,
      el("div", { class: "bs-seg", role: "group", "aria-label": "Fix tool" },
        el("button", { type: "button", "data-mode": "keep", "aria-pressed": "false", onclick: () => setMode("keep") }, "Keep"),
        el("button", { type: "button", "data-mode": "erase", "aria-pressed": "false", onclick: () => setMode("erase") }, "Erase"),
        el("button", { type: "button", "data-mode": "box", "aria-pressed": "false", onclick: () => setMode("box") }, "Box")),
      el("p", { class: "bs-muted bs-small", style: "margin:0" }, "Paint over parts that belong to you (Keep) or to the background (Erase), or draw a box around yourself to cut out again."),
      el("div", { class: "bs-range" }, el("span", { class: "bs-small" }, "Size"), sizeIn),
      el("div", { class: "bs-row" },
        el("button", { type: "button", class: "bs-btn", html: IC.undo + "<span>Undo</span>", onclick: () => { const m = d.undo.pop(); if (m) { d.mask = m; analyze(kind, true); redraw(); } } }),
        el("button", { type: "button", class: "bs-btn", onclick: () => { setMode(null); toolsBox.hidden = true; fixBtn.hidden = false; } }, "Done fixing")));
    const fixBtn = el("button", { type: "button", class: "bs-btn bs-btn--block", html: IC.brush + "<span>Fix the cut-out</span>", onclick: () => { toolsBox.hidden = false; fixBtn.hidden = true; setMode("keep"); } });
    put(main, el("div", { class: "bs-page" },
      el("div", { class: "bs-cutgrid" },
        el("div", { class: "bs-cutview" }, stage),
        el("div", {},
          bannerBox,
          el("p", { class: "bs-muted" }, "The outlined area is what we measure. It should hug your body — hair and loose clothes make you look bigger."),
          fixBtn, toolsBox,
          el("button", { type: "button", class: "bs-btn bs-btn--ghost bs-btn--block", style: "margin-top:8px", html: IC.retake + "<span>Retake / choose another photo</span>", onclick: () => go(kind) })))));
    put(foot, el("button", { type: "button", class: "bs-btn bs-btn--primary", html: "<span>Looks good</span>" + IC.next, onclick: () => {
      if (!d.an?.S) { toast("We couldn't find you in this photo — fix the cut-out or retake it"); return; }
      go(kind === "front" ? "side" : "marks");
    } }));
  }

  // ---------------------------------------------------------------- landmarks
  function frontRows() {
    const F = st.front.an;
    if (!st.rows) {
      const S = F.S, lm = F.lm;
      st.rows = {};
      for (const k of LANDMARKS) st.rows[k] = k === "top" ? S.topE : k === "sole" ? S.botE : S.botE - lm[k] * S.pxH;
    }
    return st.rows;
  }
  function sideRows() {
    const S = st.side?.an?.S;
    if (!S) return null;
    if (!st.sideRows) st.sideRows = { top: S.topE, sole: S.botE };
    return st.sideRows;
  }
  /** Current landmarks (fractions) and silhouettes with the user's lines applied. */
  function currentLm() {
    const R = frontRows(), S = st.front.an.S;
    S.topE = R.top; S.botE = R.sole; S.pxH = R.sole - R.top;
    const lm = {};
    for (const k of LANDMARKS) lm[k] = (R.sole - R.top) > 0 ? (R.sole - R[k]) / (R.sole - R.top) : 0;
    lm.top = 1; lm.sole = 0;
    const sr = sideRows();
    if (sr) { const Sd = st.side.an.S; Sd.topE = sr.top; Sd.botE = sr.sole; Sd.pxH = sr.sole - sr.top; }
    return lm;
  }
  function hasSide() { return !!(st.side && !st.sideSkipped && st.side.an?.S); }

  function renderMarks() {
    if (!st.front?.an?.S) return go("front");
    const withSide = hasSide();
    const R = frontRows();
    let selected = "waist";
    const chips = el("div", { class: "bs-chips", "aria-live": "polite" });
    const panels = [];
    const makePanel = (kind) => {
      const d = st[kind], S = d.an.S;
      const padX = (S.xmax - S.xmin) * 0.1 + 6, padY = S.pxH * 0.05;
      const cx0 = Math.max(0, Math.floor(S.xmin - padX)), cx1 = Math.min(d.mw, Math.ceil(S.xmax + padX));
      const cy0 = Math.max(0, Math.floor(S.topE - padY)), cy1 = Math.min(d.mh, Math.ceil(S.rawBotE + padY));
      const baseImg = tintedPhoto(d, 0.45);
      const canvas = el("canvas", { "aria-label": kind === "front" ? "Front photo with measuring lines" : "Side photo with measuring lines" });
      canvas.width = cx1 - cx0; canvas.height = cy1 - cy0;
      const stage = el("div", { class: "bs-stage" }, canvas);
      const panel = { kind, canvas, stage, cx0, cy0, baseImg };
      panel.draw = () => {
        const g = canvas.getContext("2d");
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.drawImage(baseImg, cx0, cy0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        const scale = (canvas.getBoundingClientRect().width || canvas.width) / canvas.width;
        const fs = 12 / scale, lw = 1.5 / scale;
        g.font = `600 ${fs}px system-ui, sans-serif`;
        const lm = currentLm();
        const lines = [];
        if (kind === "front") for (const k of LANDMARKS) lines.push({ k, y: R[k] - cy0, edit: true });
        else {
          const sr = sideRows(), Sd = S;
          for (const k of LANDMARKS) {
            if (k === "top" || k === "sole") lines.push({ k, y: sr[k] - cy0, edit: true });
            else if (["shoulder", "chest", "waist", "hip", "crotch", "thigh", "knee", "calf"].includes(k)) lines.push({ k, y: Sd.botE - lm[k] * Sd.pxH - cy0, edit: false });
          }
        }
        lines.forEach((ln, idx) => {
          const sel = ln.k === selected && kind === "front";
          g.strokeStyle = sel ? "#ffd166" : ln.edit ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.6)";
          g.lineWidth = sel ? lw * 2.2 : lw;
          g.setLineDash(ln.edit ? [] : [6 / scale, 5 / scale]);
          g.beginPath(); g.moveTo(0, ln.y); g.lineTo(canvas.width, ln.y); g.stroke();
          g.setLineDash([]);
          const text = LM_LABEL[ln.k];
          const tw = g.measureText(text).width, ph = fs * 1.5, pw = tw + fs;
          const left = idx % 2 === 0;
          const x = left ? 4 / scale : canvas.width - pw - 4 / scale;
          const y = clamp(ln.y - ph / 2, 0, canvas.height - ph);
          g.fillStyle = sel ? "#ffd166" : "rgba(20,20,26,.78)";
          g.beginPath(); g.roundRect ? g.roundRect(x, y, pw, ph, ph / 2) : g.rect(x, y, pw, ph); g.fill();
          g.fillStyle = sel ? "#1a1a1a" : "#fff";
          g.fillText(text, x + fs / 2, y + ph * 0.72);
        });
        panel.lines = lines;
        canvas.__lines = lines; // (tests)
      };
      // dragging
      let drag = null;
      const yOf = (e) => { const r = canvas.getBoundingClientRect(); return (e.clientY - r.top) / r.height * canvas.height; };
      stage.addEventListener("pointerdown", (e) => {
        const y = yOf(e);
        const scale = canvas.getBoundingClientRect().height / canvas.height;
        let best = null, bd = (isTouch() ? 26 : 16) / scale;
        for (const ln of panel.lines || []) if (ln.edit && Math.abs(ln.y - y) < bd) { bd = Math.abs(ln.y - y); best = ln; }
        if (!best) return;
        e.preventDefault();
        stage.setPointerCapture?.(e.pointerId);
        drag = { k: best.k, dy: best.y - y };
        if (kind === "front") selected = best.k;
        redrawAll();
      });
      stage.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const y = yOf(e) + drag.dy + cy0;
        if (kind === "front") {
          const i = LANDMARKS.indexOf(drag.k);
          const lo = i > 0 ? R[LANDMARKS[i - 1]] + 2 : 0, hi = i < LANDMARKS.length - 1 ? R[LANDMARKS[i + 1]] - 2 : d.mh;
          R[drag.k] = clamp(y, lo, hi);
        } else {
          const sr = sideRows();
          if (drag.k === "top") sr.top = clamp(y, 0, sr.sole - 20); else sr.sole = clamp(y, sr.top + 20, d.mh);
        }
        redrawAll();
      });
      const up = () => { drag = null; };
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
      // keyboard: select with Tab-like arrows on the canvas
      stage.tabIndex = 0;
      stage.addEventListener("keydown", (e) => {
        if (kind !== "front") return;
        const i = LANDMARKS.indexOf(selected);
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const dy = (e.key === "ArrowUp" ? -1 : 1) * (e.shiftKey ? 5 : 1);
          const lo = i > 0 ? R[LANDMARKS[i - 1]] + 2 : 0, hi = i < LANDMARKS.length - 1 ? R[LANDMARKS[i + 1]] - 2 : d.mh;
          R[selected] = clamp(R[selected] + dy, lo, hi);
          redrawAll();
        } else if (e.key === "PageUp" || e.key === "PageDown") {
          e.preventDefault();
          selected = LANDMARKS[clamp(i + (e.key === "PageUp" ? -1 : 1), 0, LANDMARKS.length - 1)];
          redrawAll();
        }
      });
      return panel;
    };
    const fp = makePanel("front");
    panels.push(fp);
    const sp = withSide ? makePanel("side") : null;
    if (sp) panels.push(sp);
    let raf = 0;
    function redrawAll() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; for (const p of panels) p.draw(); updateChips(); });
    }
    function updateChips() {
      const lm = currentLm();
      const m = P.measurementsCm(st.front.an, withSide ? st.side.an : null, lm, st.heightCm).cm;
      const chip = (label, v) => el("span", { class: "bs-chip" }, label + " ", el("b", {}, v));
      put(chips,
        chip("Shoulders", fmtLen(m.shoulderWidth)), chip("Chest", fmtLen(m.chestWidth)), chip("Waist", fmtLen(m.waistWidth)),
        chip("Hips", fmtLen(m.hipWidth)), chip("Inseam", fmtLen(m.inseam)),
        withSide ? chip("Chest depth", fmtLen(m.chestDepth)) : null, withSide ? chip("Seat depth", fmtLen(m.buttDepth)) : null);
    }
    const wrap = el("div", { class: "bs-marks" + (withSide ? " bs-has-side" : " bs-marks--one"), "data-tab": "front" });
    const tabs = el("div", { class: "bs-tabs" }, seg([["front", "Front"], ["side", "Side"]], "front", (v) => { wrap.dataset.tab = v; redrawAll(); }, "Photo"));
    put(wrap,
      withSide ? tabs : null,
      el("div", { class: "bs-markpanel bs-markpanel--front" }, el("p", { class: "bs-cap" }, el("span", {}, "Front"), el("span", { class: "bs-muted" }, "drag a line to move it")), fp.stage),
      sp ? el("div", { class: "bs-markpanel bs-markpanel--side" }, el("p", { class: "bs-cap" }, el("span", {}, "Side"), el("span", { class: "bs-muted" }, "top & soles move")), sp.stage) : null);
    put(main, el("div", { class: "bs-page bs-page--wide" },
      el("h2", {}, "Check the measuring lines"),
      el("p", { class: "bs-muted" }, "We found these levels on your outline. If one is off, drag it to the right place (or select it and use the arrow keys). ",
        el("b", {}, "Top of head"), " and ", el("b", {}, "Soles"), " set the scale — put Soles where your heels touch the floor."),
      wrap, chips,
      el("button", { type: "button", class: "bs-btn bs-btn--link", style: "margin-top:6px", onclick: () => { st.rows = null; st.sideRows = null; renderMarks(); } }, "Reset lines")));
    put(foot, el("button", { type: "button", class: "bs-btn bs-btn--primary", html: "<span>Make my avatar</span>" + IC.next, onclick: () => runFit() }));
    requestAnimationFrame(() => redrawAll());
    const ro = new ResizeObserver(() => redrawAll());
    for (const p of panels) ro.observe(p.stage);
    cleanupStep = () => ro.disconnect();
  }
  let cleanupStep = null;

  // ---------------------------------------------------------------- tape measurements
  function renderTape() {
    st.mode = "tape";
    const t = st.tape;
    const err = el("div", { class: "bs-err", role: "alert" });
    const field = (key, label, hint, req) => {
      const v = t[key];
      const i = el("input", { type: "number", inputmode: "decimal", id: "bs-t-" + key, min: "1", step: "0.5", placeholder: req ? "" : "optional",
        value: v ? String(Math.round((imperial ? v / 2.54 : v) * 10) / 10) : "" });
      i.addEventListener("input", () => { const n = parseFloat(i.value); t[key] = isFinite(n) && n > 0 ? (imperial ? n * 2.54 : n) : null; });
      return el("div", { class: "bs-field" }, el("label", { for: "bs-t-" + key }, label, req ? null : el("span", { class: "bs-muted" }, " (optional)")),
        el("div", { class: "bs-unit" }, i, el("span", {}, imperial ? "in" : "cm")), el("span", { class: "bs-hint" }, hint));
    };
    put(main, el("div", { class: "bs-page" },
      el("h2", {}, "Enter your measurements"),
      el("p", { class: "bs-muted" }, `Use a soft tape measure, snug but not tight, over light clothes. Height: ${fmtHeight(st.heightCm)}.`),
      el("div", { class: "bs-form" },
        field("chest", "Chest", st.sex === "female" ? "Around the fullest part of your bust, under the armpits." : "Around the fullest part of your chest, under the armpits.", true),
        field("waist", "Waist", "Around the narrowest part, usually just above the belly button.", true),
        field("hips", "Hips", "Around the widest part of your bottom.", true),
        field("shoulder", "Shoulder width", "Across your back, from one shoulder tip to the other.", false),
        field("inseam", "Inseam", "From your crotch straight down to the floor, barefoot.", false),
        err)));
    put(foot, el("span", { class: "bs-spacer" }), el("button", { type: "button", class: "bs-btn bs-btn--primary", html: "<span>Make my avatar</span>" + IC.next, onclick: () => {
      const H = st.heightCm;
      const bad = [["chest", 0.35, 0.95], ["waist", 0.28, 0.95], ["hips", 0.38, 0.95]].find(([k, a, b]) => !(t[k] >= H * a && t[k] <= H * b));
      if (bad) { err.textContent = `Please check your ${bad[0]} — it should be measured around your body (${fmtLen(H * bad[1], 0)} – ${fmtLen(H * bad[2], 0)}).`; root.querySelector("#bs-t-" + bad[0])?.focus(); return; }
      if (t.shoulder && !(t.shoulder > H * 0.15 && t.shoulder < H * 0.4)) t.shoulder = null;
      if (t.inseam && !(t.inseam > H * 0.35 && t.inseam < H * 0.56)) t.inseam = null;
      runFit();
    } }));
  }

  // ---------------------------------------------------------------- fitting
  let bar = null, barText = null;
  function renderFit() {
    bar = el("i");
    barText = el("div", { class: "bs-muted" }, "Shaping your body… 0%");
    put(main, el("div", { class: "bs-fitting" },
      el("span", { html: fitFigSVG() }),
      el("h2", {}, "Shaping your body…"),
      el("div", { class: "bs-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, bar),
      barText,
      el("p", { class: "bs-muted bs-small" }, "We try body shapes until one matches your measurements. Everything happens on this device.")));
    put(foot, el("button", { type: "button", class: "bs-btn", onclick: () => back() }, "Cancel"));
  }
  function setProgress(p) {
    if (!bar) return;
    const v = Math.round(clamp(p, 0, 1) * 100);
    bar.style.width = v + "%";
    bar.parentElement?.setAttribute("aria-valuenow", String(v));
    barText.textContent = `Shaping your body… ${v}%`;
  }
  async function runFit() {
    go("fit");
    let shown = 0.03, cur = 0;
    setProgress(shown);
    const tick = setInterval(() => { shown = Math.min(shown + 0.004, 0.3); setProgress(Math.max(shown, cur)); }, 120);
    const onProgress = (p) => { cur = 0.12 + p * 0.86; setProgress(Math.max(cur, shown)); };
    const t0 = performance.now();
    try {
      let res;
      if (st.mode === "tape") {
        res = await P.runJob("fitTape", { sex: st.sex, heightCm: st.heightCm, weightKg: st.weightKg, ...st.tape, opts: { maxEvals: isTouch() ? 70 : 90 } }, { onProgress });
        st.measures = { you: { height: st.heightCm, chest: st.tape.chest, waist: st.tape.waist, hips: st.tape.hips, shoulderWidth: st.tape.shoulder, inseam: st.tape.inseam } };
        st.skin = null;
      } else {
        const lm = currentLm();
        const front = st.front.an, side = hasSide() ? st.side.an : null;
        const meas = P.measurementsCm(front, side, lm, st.heightCm);
        st.lmModel = P.modelLandmarks(front, lm);
        res = await P.runJob("fitPhoto", {
          sex: st.sex, heightCm: st.heightCm, weightKg: st.weightKg, armAngle: front.armAngle, lm: st.lmModel, meas: meas.frac, side: !!side,
          opts: { maxEvals: isTouch() ? 70 : 90 },
        }, { onProgress });
        const circ = P.circumferences(meas.frac, res.circ, st.heightCm, !!side);
        st.measures = { you: { ...meas.cm, chest: circ.chest, waist: circ.waist, hips: circ.hips, thigh: circ.thigh }, frac: meas.frac };
        try { st.skin = P.sampleSkin(st.front.photo.big.rgba, st.front.mask, front.S, lm); } catch { st.skin = null; }
      }
      if (st.step !== "fit" || destroyed) return;
      st.fit = res;
      st.fitMs = performance.now() - t0;
      st.params = { ...res.params };
      st.skinChoice = st.skin ? st.skin.hex : st.skinChoice || DEFAULT_SKIN;
      setProgress(1);
      go("result");
    } catch (e) {
      if (String(e?.message) === "cancelled" || st.step !== "fit") return;
      toast("Something went wrong while fitting — please try again");
      console.error(e);
      go(st.mode === "tape" ? "tape" : "marks");
    } finally {
      clearInterval(tick);
    }
  }

  // ---------------------------------------------------------------- result
  function teardownPreview() {
    roPreview?.disconnect(); roPreview = null;
    if (preview) { preview.destroy(); preview = null; }
    if (lastGeom) { try { lastGeom.dispose(); } catch { /* ignore */ } lastGeom = null; }
    cleanupStep?.(); cleanupStep = null;
  }
  function silhouetteCanvas(d, kind) {
    const S = d.an.S;
    const c = el("canvas", { "aria-label": kind === "front" ? "Your outline from the front" : "Your outline from the side" });
    c.draw = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      c.width = W; c.height = H;
      const g = c.getContext("2d");
      const tmp = document.createElement("canvas");
      tmp.width = d.mw; tmp.height = d.mh;
      const tg = tmp.getContext("2d");
      const id = tg.createImageData(d.mw, d.mh);
      const acc = accentRGB();
      for (let i = 0; i < d.mask.length; i++) { id.data[i * 4] = acc[0]; id.data[i * 4 + 1] = acc[1]; id.data[i * 4 + 2] = acc[2]; id.data[i * 4 + 3] = d.mask[i] * 0.85; }
      tg.putImageData(id, 0, 0);
      // same framing as the 3D views: body height fills 1/1.06 of the canvas, feet at the bottom margin
      const k = (H / 1.06) / S.pxH;
      const mx = S.cx(Math.round((S.topE + S.botE) / 2));
      g.drawImage(tmp, W / 2 - mx * k, H - H * 0.03 - S.botE * k, d.mw * k, d.mh * k);
    };
    return c;
  }
  function renderResult() {
    teardownPreview();
    const p = st.params;
    const photoMode = st.mode === "photo";
    const figs = [];
    const fSil = photoMode ? silhouetteCanvas(st.front, "front") : null;
    const sSil = photoMode && hasSide() ? silhouetteCanvas(st.side, "side") : null;
    const glCanvas = el("canvas", { "aria-label": "Your 3D avatar, front and side" });
    const glFig = el("figure", { class: "bs-3d" }, glCanvas, el("figcaption", {}, "Avatar · front & side"));
    if (fSil) figs.push(el("figure", {}, fSil, el("figcaption", {}, "You · front")));
    figs.push(glFig);
    if (sSil) figs.push(el("figure", {}, sSil, el("figcaption", {}, "You · side")));
    const compare = el("div", { class: "bs-compare" }, figs);

    // sliders
    const sliders = el("div", { class: "bs-sliders" });
    const hSlider = (() => {
      const out = el("output", {}, fmtHeight(p.heightCm));
      const r = el("input", { type: "range", min: "140", max: "210", step: "0.5", value: String(p.heightCm), id: "bs-p-height", "aria-label": "Height" });
      r.addEventListener("input", () => { p.heightCm = +r.value; out.textContent = fmtHeight(p.heightCm); changed(); });
      return el("div", { class: "bs-slider" }, el("label", { for: "bs-p-height" }, "Height"), r, out);
    })();
    sliders.append(hSlider);
    for (const d of PARAMS) {
      const fmt = (v) => (d.deg ? Math.round(v) + "°" : Math.round(v * 100) + "%");
      const out = el("output", {}, fmt(p[d.key]));
      const r = el("input", { type: "range", min: String(d.min), max: String(d.max), step: String(d.step), value: String(p[d.key]), id: "bs-p-" + d.key, "aria-label": d.label });
      r.addEventListener("input", () => { p[d.key] = +r.value; out.textContent = fmt(p[d.key]); changed(); });
      sliders.append(el("div", { class: "bs-slider" }, el("label", { for: "bs-p-" + d.key }, st.sex === "female" && d.labelF ? d.labelF : d.label), r, out));
    }

    // measurements table
    const tableBox = el("div");
    // skin
    const swBox = el("div", { class: "bs-swatches", role: "group", "aria-label": "Skin tone" });
    const renderSwatches = () => {
      const items = [];
      if (st.skin) items.push(el("button", { type: "button", class: "bs-swatch bs-swatch--mine", style: `--mine:${st.skin.hex}`, "aria-pressed": String(st.skinChoice === st.skin.hex), title: "Your tone, from the photo", onclick: () => pickSkin(st.skin.hex) }, "My tone"));
      for (const s of SKIN_TONES) items.push(el("button", { type: "button", class: "bs-swatch", style: `background:${s.value}`, title: s.label, "aria-label": s.label, "aria-pressed": String(st.skinChoice === s.value), onclick: () => pickSkin(s.value) }));
      put(swBox, items);
    };
    const pickSkin = (hex) => { st.skinChoice = hex; renderSwatches(); preview?.setSkin(hex); };
    renderSwatches();
    const nameIn = el("input", { type: "text", id: "bs-r-name", value: st.name || "Me", maxlength: "40" });
    nameIn.addEventListener("input", () => { st.name = nameIn.value.trim() || "Me"; });

    const skinNote = st.skin
      ? el("p", { class: "bs-muted bs-small" }, `We picked “My tone” from your face and arms${st.skin.confidence < 0.5 ? " (not very sure — check it)" : ""}. Closest swatch: ${SKIN_TONES[nearestSwatch(st.skin.hex, SKIN_TONES)].label}.`)
      : el("p", { class: "bs-muted bs-small" }, "Pick the swatch closest to your skin.");

    put(main, el("div", { class: "bs-page bs-page--wide" },
      el("div", { class: "bs-result" },
        el("div", {},
          el("div", { class: "bs-card" }, compare),
          el("div", { class: "bs-card" }, el("h3", {}, "Measurements"), tableBox)),
        el("div", {},
          el("div", { class: "bs-card" }, el("h3", {}, "Fine-tune"),
            el("p", { class: "bs-muted bs-small" }, "Drag any slider if something doesn't look like you."),
            el("div", { class: "bs-field", style: "margin-bottom:8px" }, seg([["male", "Male"], ["female", "Female"]], st.sex, (v) => { st.sex = v; p.sex = v; changed(); renderResult(); }, "Body type")),
            sliders,
            el("button", { type: "button", class: "bs-btn bs-btn--link", onclick: () => { st.params = { ...st.fit.params, sex: st.sex }; renderResult(); } }, "Back to the fitted shape")),
          el("div", { class: "bs-card" }, el("h3", {}, "Skin tone"), swBox, skinNote),
          el("div", { class: "bs-card" }, el("div", { class: "bs-field" }, el("label", { for: "bs-r-name" }, "Avatar name"), nameIn))))));

    let confirmT = 0;
    const overBtn = el("button", { type: "button", class: "bs-btn bs-btn--ghost", onclick: () => {
      if (!confirmT) { overBtn.textContent = "Tap again to start over"; overBtn.classList.add("bs-btn--confirm"); confirmT = setTimeout(() => { confirmT = 0; overBtn.textContent = "Start over"; overBtn.classList.remove("bs-btn--confirm"); }, 3000); return; }
      clearTimeout(confirmT); reset();
    } }, "Start over");
    put(foot, overBtn, el("span", { class: "bs-spacer" }), el("button", { type: "button", class: "bs-btn bs-btn--primary", onclick: () => save() }, "Save avatar"));

    // measurement table (avatar column follows the sliders)
    let mTimer = 0;
    const updateTable = () => {
      clearTimeout(mTimer);
      mTimer = setTimeout(() => { if (st.step === "result") put(tableBox, measureTable()); }, 220);
    };
    put(tableBox, measureTable());

    // 3D preview
    (async () => {
      if (!o.buildBody) { put(glFig, el("div", { class: "bs-3dmsg" }, "3D preview isn't available here.")); return; }
      let mod;
      try { mod = await import("./preview.js"); } catch { mod = null; }
      if (st.step !== "result" || destroyed) return;
      preview = mod ? mod.createPreview(glCanvas) : null;
      if (!preview) { glCanvas.replaceWith(el("div", { class: "bs-3dmsg" }, "3D preview isn't available on this device — your avatar will still be saved.")); }
      else { preview.setSkin(st.skinChoice || DEFAULT_SKIN); preview.setViews(2); }
      roPreview = new ResizeObserver(() => { preview?.render(); fSil?.draw(); sSil?.draw(); });
      roPreview.observe(compare);
      fSil?.draw(); sSil?.draw();
      rebuild("low");
    })();

    let rTimer = 0, hiTimer = 0;
    function changed() {
      clearTimeout(rTimer); clearTimeout(hiTimer);
      rTimer = setTimeout(() => rebuild("low"), 90);
      updateTable();
    }
    async function rebuild(detail) {
      if (!preview || !o.buildBody) return;
      const id = ++previewReq;
      try {
        const res = await o.buildBody({ ...bodyParams(), detail });
        if (id !== previewReq || !preview) { res.geometry.dispose?.(); return; }
        const old = lastGeom;
        lastGeom = res.geometry;
        preview.setGeometry(res.geometry, res.bounds);
        if (old && old !== res.geometry) old.dispose?.();
        if (detail === "low") { clearTimeout(hiTimer); hiTimer = setTimeout(() => rebuild("medium"), 650); }
      } catch (e) { console.error(e); }
    }
  }

  function bodyParams() {
    const p = st.params;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return {
      sex: st.sex, heightCm: Math.round(p.heightCm * 10) / 10,
      build: r3(p.build), muscle: r3(p.muscle), shoulders: r3(p.shoulders), chest: r3(p.chest), hips: r3(p.hips), legLength: r3(p.legLength),
      armPose: Math.round(p.armPose * 10) / 10,
    };
  }

  function avatarMeasures() {
    const b = bodyParams();
    const M = BM.prepareModel(b);
    const H = b.heightCm;
    const cm = (v) => (v == null || !isFinite(v) ? null : Math.round(v * H * 10) / 10);
    if (st.mode === "tape") {
      const t = tapeOf(M, H);
      return { height: H, chest: t.chest, waist: t.waist, hips: t.hips, shoulderWidth: t.shoulder, inseam: t.inseam };
    }
    const lm = st.lmModel;
    const m = measureAt(M, lm, true), c = modelCircs(M, lm);
    return {
      height: H, shoulderWidth: cm(m.shoulderW), chestWidth: cm(m.chestW), waistWidth: cm(m.waistW), hipWidth: cm(m.hipW),
      thighWidth: cm(m.thighW), calfWidth: cm(m.calfW), upperArmWidth: cm(m.upperArm),
      chestDepth: cm(m.chestD), waistDepth: cm(m.waistD), hipDepth: cm(m.hipD), buttDepth: cm(m.buttD), thighDepth: cm(m.thighD),
      chest: cm(c.chest.c), waist: cm(c.waist.c), hips: cm(c.hip.c), thigh: cm(c.thigh.c), inseam: cm(m.crotch),
    };
  }

  function measureTable() {
    const you = st.measures?.you || {};
    let av = {};
    try { av = avatarMeasures(); } catch (e) { console.error(e); }
    const rows = st.mode === "tape"
      ? [["Height", "height"], ["Chest", "chest"], ["Waist", "waist"], ["Hips", "hips"], ["Shoulder width", "shoulderWidth"], ["Inseam", "inseam"]]
      : [["Height", "height"], ["Chest (around)", "chest"], ["Waist (around)", "waist"], ["Hips (around)", "hips"], ["Thigh (around)", "thigh"], ["Shoulder width", "shoulderWidth"], ["Inseam", "inseam"]];
    const more = st.mode === "tape" ? [] : [
      ["Chest width", "chestWidth"], ["Waist width", "waistWidth"], ["Hip width", "hipWidth"], ["Thigh width", "thighWidth"], ["Calf width", "calfWidth"], ["Upper arm", "upperArmWidth"],
      ...(hasSide() ? [["Chest depth", "chestDepth"], ["Waist depth", "waistDepth"], ["Hip depth", "hipDepth"], ["Seat depth", "buttDepth"], ["Thigh depth", "thighDepth"]] : []),
    ];
    const tr = ([label, k], cls) => el("tr", { class: cls }, el("td", {}, label), el("td", {}, k === "height" ? fmtHeight(you[k] ?? st.heightCm) : fmtLen(you[k])), el("td", {}, k === "height" ? fmtHeight(av[k]) : fmtLen(av[k])));
    const head = el("thead", {}, el("tr", {}, el("th", {}, ""), el("th", {}, st.mode === "tape" ? "You entered" : "From photos"), el("th", {}, "Avatar")));
    const t = el("table", { class: "bs-table" }, head, el("tbody", {}, rows.map((r) => tr(r))));
    const box = el("div", {}, t);
    if (more.length) box.append(el("details", { class: "bs-more" }, el("summary", {}, "More measurements"), el("table", { class: "bs-table" }, el("tbody", {}, more.map((r) => tr(r, "bs-sub"))))));
    if (st.mode === "photo") box.append(el("p", { class: "bs-muted bs-small", style: "margin:8px 0 0" }, hasSide()
      ? "Around-the-body numbers are estimated from your front and side outlines."
      : "Without a side photo, chest/waist/hips around the body are rough estimates."));
    return box;
  }

  function save() {
    const b = bodyParams();
    let thumb = null, photos;
    if (st.mode === "photo") {
      try { currentLm(); thumb = P.headThumb(st.front.photo, st.front.an, currentLmFracs(), 256); } catch (e) { console.error(e); }
      try { photos = { front: P.photoURL(st.front.photo, 800) }; if (hasSide()) photos.side = P.photoURL(st.side.photo, 800); } catch { photos = undefined; }
    } else {
      try { thumb = preview?.thumb(256) || null; } catch { thumb = null; }
    }
    const you = { ...(st.measures?.you || {}) };
    const measurements = {};
    for (const [k, v] of Object.entries(you)) if (v != null && isFinite(v)) measurements[k] = Math.round(v * 10) / 10;
    measurements.height = b.heightCm;
    if (st.weightKg) measurements.weight = Math.round(st.weightKg * 10) / 10;
    measurements.armPose = b.armPose;
    const avatar = { name: (st.name || "Me").slice(0, 40), body: b, skinTone: st.skinChoice || DEFAULT_SKIN, thumb, measurements };
    if (photos) avatar.photos = photos;
    st.heightCm = b.heightCm;
    saveDraft();
    try { o.onDone(avatar); } catch (e) { console.error(e); }
  }
  function currentLmFracs() { return currentLm(); }

  // ---------------------------------------------------------------- paste / drop / keys
  const photoStep = () => ["intro", "front", "frontcut", "side", "sidecut"].includes(st.step);
  const kindForStep = () => (st.step.startsWith("side") ? "side" : "front");
  const onPaste = (e) => {
    if (!root.isConnected || !photoStep() || st.busy) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name || ""));
    if (!files.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (st.step === "intro") { if (!(st.heightCm >= 140 && st.heightCm <= 210)) { toast("Enter your height first"); return; } st.mode = "photo"; }
    loadPhoto(kindForStep(), files[0]);
  };
  addEventListener("paste", onPaste, true);
  root.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) { e.preventDefault(); e.stopPropagation(); root.classList.add("bs-dragging"); } });
  root.addEventListener("dragleave", (e) => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove("bs-dragging"); });
  root.addEventListener("drop", (e) => {
    root.classList.remove("bs-dragging");
    const f = [...(e.dataTransfer?.files || [])][0];
    if (!f) return;
    e.preventDefault(); e.stopPropagation();
    if (!photoStep() || st.step === "intro") { toast("Drop your photo on the Front or Side photo step"); return; }
    loadPhoto(kindForStep(), f);
  });
  const onKey = (e) => {
    if (e.key !== "Escape" || !root.isConnected || !root.getClientRects().length) return; // only while shown
    e.stopImmediatePropagation(); e.preventDefault();
    back();
  };
  addEventListener("keydown", onKey, true);

  // ---------------------------------------------------------------- api
  function reset() {
    P.cancelJobs();
    teardownPreview();
    setBusy(null);
    const keep = { name: st.name, sex: st.sex, heightCm: st.heightCm, weightKg: st.weightKg };
    st = { ...fresh(), ...keep };
    go("intro");
  }
  function destroy() {
    destroyed = true;
    P.cancelJobs();
    teardownPreview();
    removeEventListener("paste", onPaste, true);
    removeEventListener("keydown", onKey, true);
    root.remove();
  }
  render();
  // debugging / tests
  root.__scan = { get state() { return st; }, go, runFit, loadPhoto };
  return { reset, destroy };
}

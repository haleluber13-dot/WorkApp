/* Every user-changeable option in one schema. The settings panel, the AI
   assistant ("make the skin darker") and persistence all read from this list,
   so adding an option here makes it available everywhere. */

export const SKIN_TONES = [
  { value: "#f6dccb", label: "Porcelain" },
  { value: "#efc9ae", label: "Fair" },
  { value: "#e2b393", label: "Light" },
  { value: "#d09a74", label: "Medium" },
  { value: "#bd8a60", label: "Olive" },
  { value: "#a26d47", label: "Tan" },
  { value: "#7f5235", label: "Brown" },
  { value: "#5e3b26", label: "Dark brown" },
  { value: "#3f281b", label: "Deep" },
];

export const INK_SWATCHES = [
  "#141414", "#3a3a3a", "#6b6b6b", "#b3242f", "#d9532b", "#e6b52e",
  "#2f8f4e", "#1f5fa8", "#3fa7c9", "#6c3fa0", "#c04e8f", "#7a4a2a",
];

const BOOL = "bool", RANGE = "range", SELECT = "select", COLOR = "color", TEXT = "text", ACTION = "action";

export const GROUPS = [
  { id: "body", label: "Body", icon: "🧍" },
  { id: "skin", label: "Skin & scene", icon: "💡" },
  { id: "ink", label: "Tattoo ink", icon: "🖋️" },
  { id: "place", label: "Placement", icon: "🎯" },
  { id: "designs", label: "Designs", icon: "✨" },
  { id: "sketch", label: "Sketch", icon: "✏️" },
  { id: "ai", label: "AI assistant", icon: "🤖" },
  { id: "ui", label: "Interface", icon: "🎨" },
  { id: "data", label: "Data", icon: "💾" },
];

export const SETTINGS = [
  // ── Body ───────────────────────────────────────────────────────────────
  { key: "body.sex", group: "body", label: "Body", type: SELECT, default: "male",
    choices: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }] },
  { key: "body.heightCm", group: "body", label: "Height", type: RANGE, min: 140, max: 210, step: 1, default: 178, unit: "cm" },
  { key: "body.build", group: "body", label: "Build (slim → heavy)", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.muscle", group: "body", label: "Muscle", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.shoulders", group: "body", label: "Shoulder width", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.chest", group: "body", label: "Chest / bust", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.hips", group: "body", label: "Hips", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.legLength", group: "body", label: "Leg length", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "body.armPose", group: "body", label: "Arm pose (angle from body)", type: RANGE, min: 5, max: 90, step: 1, default: 30, unit: "°" },
  { key: "body.detail", group: "body", label: "Mesh detail", type: SELECT, default: "medium",
    choices: [{ value: "low", label: "Low (fast phones)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High (sharpest)" }] },

  // ── Skin & scene ───────────────────────────────────────────────────────
  { key: "skin.tone", group: "skin", label: "Skin tone", type: COLOR, default: "#d09a74", swatches: SKIN_TONES },
  { key: "skin.roughness", group: "skin", label: "Skin roughness", type: RANGE, min: 0.25, max: 1, step: 0.01, default: 0.58 },
  { key: "skin.sheen", group: "skin", label: "Skin sheen (velvet glow)", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.35 },
  { key: "skin.oil", group: "skin", label: "Skin shine (oil / lotion)", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.12 },
  { key: "skin.warmth", group: "skin", label: "Subsurface warmth", type: RANGE, min: 0, max: 1, step: 0.01, default: 0.4 },
  { key: "scene.lighting", group: "skin", label: "Lighting", type: SELECT, default: "studio",
    choices: [
      { value: "studio", label: "Studio soft" }, { value: "daylight", label: "Natural daylight" },
      { value: "shop", label: "Warm tattoo shop" }, { value: "dramatic", label: "Dramatic" },
      { value: "rim", label: "Rim light" }, { value: "flat", label: "Flat (check linework)" },
    ] },
  { key: "scene.background", group: "skin", label: "Background", type: SELECT, default: "auto",
    choices: [
      { value: "auto", label: "Match theme" }, { value: "charcoal", label: "Charcoal studio" }, { value: "midnight", label: "Midnight blue" },
      { value: "warm", label: "Warm shop" }, { value: "light", label: "Light grey" },
      { value: "white", label: "White" }, { value: "black", label: "Black" },
    ] },
  { key: "scene.exposure", group: "skin", label: "Exposure", type: RANGE, min: 0.4, max: 2, step: 0.01, default: 1 },
  { key: "scene.shadows", group: "skin", label: "Shadows", type: BOOL, default: true },
  { key: "scene.floor", group: "skin", label: "Floor", type: BOOL, default: true },
  { key: "scene.fov", group: "skin", label: "Camera lens (field of view)", type: RANGE, min: 20, max: 70, step: 1, default: 35, unit: "°" },
  { key: "scene.autoRotate", group: "skin", label: "Turntable (auto-rotate)", type: BOOL, default: false },
  { key: "scene.autoRotateSpeed", group: "skin", label: "Turntable speed", type: RANGE, min: 0.2, max: 6, step: 0.1, default: 1.2 },
  { key: "scene.quality", group: "skin", label: "Render quality", type: SELECT, default: "auto",
    choices: [{ value: "auto", label: "Auto" }, { value: "low", label: "Low (battery)" }, { value: "high", label: "High" }, { value: "ultra", label: "Ultra" }] },

  // ── Ink ────────────────────────────────────────────────────────────────
  { key: "ink.blend", group: "ink", label: "Ink look", type: SELECT, default: "skin",
    choices: [{ value: "skin", label: "Realistic (ink in skin)" }, { value: "vivid", label: "Vivid (like a sticker)" }] },
  { key: "ink.defaultMode", group: "ink", label: "New tattoo ink", type: SELECT, default: "original",
    choices: [
      { value: "original", label: "Design colors" }, { value: "black", label: "Black & grey" },
      { value: "color", label: "Single color" }, { value: "stencil", label: "Stencil preview" },
    ] },
  { key: "ink.defaultColor", group: "ink", label: "Single-color ink", type: COLOR, default: "#b3242f", swatches: INK_SWATCHES.map((v) => ({ value: v })) },
  { key: "ink.saturation", group: "ink", label: "Color saturation", type: RANGE, min: 0, max: 1.6, step: 0.01, default: 1 },
  { key: "ink.density", group: "ink", label: "Ink density", type: RANGE, min: 0.3, max: 1, step: 0.01, default: 0.92 },
  { key: "ink.softness", group: "ink", label: "Edge softness", type: RANGE, min: 0, max: 3, step: 0.1, default: 0.6 },
  { key: "ink.defaultAge", group: "ink", label: "New tattoo age (fresh → old)", type: RANGE, min: 0, max: 1, step: 0.01, default: 0 },
  { key: "ink.freshGlow", group: "ink", label: "Fresh redness on new tattoos", type: BOOL, default: false },
  { key: "ink.removeWhite", group: "ink", label: "Remove white background from images", type: BOOL, default: true },
  { key: "ink.whiteThreshold", group: "ink", label: "White removal strength", type: RANGE, min: 0.5, max: 1, step: 0.01, default: 0.86 },
  { key: "ink.textureRes", group: "ink", label: "Texture sharpness", type: SELECT, default: "1024",
    choices: [{ value: "512", label: "512 (fast)" }, { value: "1024", label: "1024" }, { value: "2048", label: "2048 (crisp)" }] },

  // ── Placement ──────────────────────────────────────────────────────────
  { key: "place.units", group: "place", label: "Units", type: SELECT, default: "cm",
    choices: [{ value: "cm", label: "Centimeters" }, { value: "in", label: "Inches" }] },
  { key: "place.defaultSizeCm", group: "place", label: "Default size (when region has none)", type: RANGE, min: 2, max: 40, step: 0.5, default: 10, unit: "cm" },
  { key: "place.useRegionSize", group: "place", label: "Auto-size to the body part", type: BOOL, default: true },
  { key: "place.snapRotation", group: "place", label: "Snap rotation to 15°", type: BOOL, default: false },
  { key: "place.showOutline", group: "place", label: "Outline the selected tattoo", type: BOOL, default: true },
  { key: "place.showHandles", group: "place", label: "Show resize / rotate handle", type: BOOL, default: true },
  { key: "place.showRegions", group: "place", label: "Show body-part markers", type: BOOL, default: false },
  { key: "place.focusOnPlace", group: "place", label: "Zoom camera to new tattoos", type: BOOL, default: true },
  { key: "place.wheel", group: "place", label: "Shift+wheel resizes, Alt+wheel rotates", type: BOOL, default: true },

  // ── Designs ────────────────────────────────────────────────────────────
  { key: "designs.defaultStyle", group: "designs", label: "Default style", type: SELECT, default: "mandala", choices: [] },
  { key: "designs.autoPlace", group: "designs", label: "Put new designs on the body right away", type: BOOL, default: true },
  { key: "designs.defaultRegion", group: "designs", label: "Default body part", type: SELECT, default: "left_forearm_inner", choices: [] },
  { key: "designs.liveRegenerate", group: "designs", label: "Live update while changing style options", type: BOOL, default: true },

  // ── Sketch ─────────────────────────────────────────────────────────────
  { key: "sketch.defaultBrush", group: "sketch", label: "Default brush", type: SELECT, default: "liner",
    choices: [
      { value: "fineliner", label: "Fine liner" }, { value: "liner", label: "Tattoo liner" }, { value: "brush", label: "Brush pen" },
      { value: "shader", label: "Shader" }, { value: "stipple", label: "Dotwork" }, { value: "pencil", label: "Pencil" },
    ] },
  { key: "sketch.defaultSize", group: "sketch", label: "Default brush size", type: RANGE, min: 1, max: 60, step: 1, default: 6, unit: "px" },
  { key: "sketch.smoothing", group: "sketch", label: "Line smoothing (stabilizer)", type: RANGE, min: 0, max: 100, step: 1, default: 45 },
  { key: "sketch.pressure", group: "sketch", label: "Pen pressure", type: BOOL, default: true },
  { key: "sketch.symmetry", group: "sketch", label: "Symmetry", type: SELECT, default: "off",
    choices: [
      { value: "off", label: "Off" }, { value: "vertical", label: "Mirror left/right" }, { value: "horizontal", label: "Mirror top/bottom" },
      { value: "quad", label: "Four-way" }, { value: "radial", label: "Radial (mandala)" },
    ] },
  { key: "sketch.radialCount", group: "sketch", label: "Radial segments", type: RANGE, min: 2, max: 24, step: 1, default: 8 },
  { key: "sketch.showGrid", group: "sketch", label: "Show grid", type: BOOL, default: false },
  { key: "sketch.background", group: "sketch", label: "Canvas background", type: SELECT, default: "checker",
    choices: [{ value: "checker", label: "Transparent checker" }, { value: "skin", label: "Skin tone" }, { value: "white", label: "White paper" }] },
  { key: "sketch.canvasSize", group: "sketch", label: "Canvas size", type: SELECT, default: "1024",
    choices: [{ value: "768", label: "768 px" }, { value: "1024", label: "1024 px" }, { value: "1536", label: "1536 px" }, { value: "2048", label: "2048 px" }] },

  // ── AI ─────────────────────────────────────────────────────────────────
  { key: "ai.engine", group: "ai", label: "Assistant brain", type: SELECT, default: "local",
    choices: [{ value: "local", label: "Built-in (offline, free)" }, { value: "claude", label: "Claude (smarter — needs API key)" }] },
  { key: "ai.apiKey", group: "ai", label: "Anthropic API key", type: TEXT, secret: true, default: "",
    hint: "Stored only on this device. Get one at console.anthropic.com." },
  { key: "ai.model", group: "ai", label: "Claude model", type: SELECT, default: "claude-opus-5-5",
    choices: [
      { value: "claude-opus-5-5", label: "Claude Opus 5.5 (best)" }, { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster)" },
      { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" }, { value: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
    ] },
  { key: "ai.effort", group: "ai", label: "Thinking effort", type: SELECT, default: "medium",
    choices: [{ value: "low", label: "Low (quick)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High (careful)" }] },
  { key: "ai.look", group: "ai", label: "Let Claude look at the 3D view", type: BOOL, default: true },
  { key: "ai.voice", group: "ai", label: "Microphone button", type: BOOL, default: true },
  { key: "ai.speak", group: "ai", label: "Read replies aloud", type: BOOL, default: false },
  { key: "ai.suggestions", group: "ai", label: "Show suggestion chips", type: BOOL, default: true },

  // ── Interface ──────────────────────────────────────────────────────────
  { key: "ui.theme", group: "ui", label: "Theme", type: SELECT, default: "dark",
    choices: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "Match device" }] },
  { key: "ui.accent", group: "ui", label: "Accent color", type: COLOR, default: "#e0455f",
    swatches: ["#e0455f", "#e07a2f", "#d6b23a", "#3fb27f", "#3f8fe0", "#8a5cf0", "#e05cc0"].map((v) => ({ value: v })) },
  { key: "ui.fontScale", group: "ui", label: "Text size", type: RANGE, min: 0.85, max: 1.3, step: 0.05, default: 1 },
  { key: "ui.reduceMotion", group: "ui", label: "Reduce motion", type: BOOL, default: false },
  { key: "ui.hints", group: "ui", label: "Show tips", type: BOOL, default: true },
  { key: "ui.confirmDelete", group: "ui", label: "Ask before deleting", type: BOOL, default: true },

  // ── Data ───────────────────────────────────────────────────────────────
  { key: "data.export", group: "data", label: "Export project (.json)", type: ACTION, action: "exportProject" },
  { key: "data.import", group: "data", label: "Import project", type: ACTION, action: "importProject" },
  { key: "data.screenshot", group: "data", label: "Save 3D view as image", type: ACTION, action: "saveScreenshot" },
  { key: "data.clearTattoos", group: "data", label: "Remove all tattoos", type: ACTION, action: "clearTattoos", danger: true },
  { key: "data.resetSettings", group: "data", label: "Reset all settings", type: ACTION, action: "resetSettings", danger: true },
  { key: "data.resetAll", group: "data", label: "Erase everything", type: ACTION, action: "resetAll", danger: true },
];

export const SETTING_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

export function defaultSettings() {
  const o = {};
  for (const s of SETTINGS) if (s.type !== ACTION) o[s.key] = s.default;
  return o;
}

/* Coerce/validate a value for a setting; returns the default when invalid. */
export function coerceSetting(key, value) {
  const s = SETTING_BY_KEY[key];
  if (!s) return value;
  switch (s.type) {
    case BOOL: return typeof value === "string" ? value === "true" || value === "on" || value === "yes" : !!value;
    case RANGE: {
      let n = Number(value);
      if (!isFinite(n)) return s.default;
      return Math.min(s.max, Math.max(s.min, n));
    }
    case SELECT: {
      if (!s.choices.length) return String(value);
      const v = String(value);
      const hit = s.choices.find((c) => c.value === v) ||
        s.choices.find((c) => c.label.toLowerCase().startsWith(v.toLowerCase()));
      return hit ? hit.value : s.default;
    }
    case COLOR: return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : s.default;
    default: return value == null ? "" : String(value);
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Settings panel: tabs per group + search. `get(key)`, `set(key, value)`,
   `act(actionName)` are supplied by the app. Returns { el, refresh(), show(group) }. */
export function createSettingsPanel({ get, set, act }) {
  const el = document.createElement("div");
  el.className = "settings";
  el.innerHTML = `
    <div class="settings__head">
      <h2>Settings</h2>
      <input class="settings__search" type="search" placeholder="Search settings…" aria-label="Search settings">
      <button class="iconbtn settings__close" data-close aria-label="Close settings">✕</button>
    </div>
    <div class="settings__body">
      <nav class="settings__tabs" role="tablist">${GROUPS.map((g) =>
        `<button role="tab" data-group="${g.id}"><span>${g.icon}</span>${esc(g.label)}</button>`).join("")}</nav>
      <div class="settings__list"></div>
    </div>`;
  const list = el.querySelector(".settings__list");
  const search = el.querySelector(".settings__search");
  let group = "body";

  const fmt = (s, v) => {
    if (s.type !== RANGE) return "";
    if (s.max <= 1.6 && s.min >= 0 && !s.unit) return Math.round(v * 100) + "%";
    if (s.key === "place.defaultSizeCm" && get("place.units") === "in") return (v / 2.54).toFixed(1) + " in";
    if (s.key === "body.heightCm" && get("place.units") === "in") {
      const inch = Math.round(v / 2.54); return `${Math.floor(inch / 12)}′${inch % 12}″`;
    }
    return (Number.isInteger(s.step) ? v : (+v).toFixed(1)) + (s.unit || "");
  };

  function row(s) {
    const v = get(s.key);
    const changed = s.type !== ACTION && JSON.stringify(v) !== JSON.stringify(s.default);
    let ctl = "";
    switch (s.type) {
      case BOOL:
        ctl = `<label class="switch"><input type="checkbox" data-k="${s.key}" ${v ? "checked" : ""}><span></span></label>`; break;
      case RANGE:
        ctl = `<div class="rangewrap"><input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"><output>${fmt(s, v)}</output></div>`; break;
      case SELECT:
        ctl = `<select data-k="${s.key}">${s.choices.map((c) => `<option value="${esc(c.value)}" ${c.value === v ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`; break;
      case COLOR:
        ctl = `<div class="swatches">${(s.swatches || []).map((c) => `<button class="sw ${c.value === v ? "on" : ""}" data-k="${s.key}" data-v="${c.value}" style="--c:${c.value}" title="${esc(c.label || c.value)}" aria-label="${esc(c.label || c.value)}"></button>`).join("")}<input type="color" data-k="${s.key}" value="${v}" aria-label="Custom color"></div>`; break;
      case TEXT:
        ctl = `<input type="${s.secret ? "password" : "text"}" data-k="${s.key}" value="${esc(v)}" autocomplete="off" spellcheck="false" placeholder="${s.secret ? "sk-ant-…" : ""}">`; break;
      case ACTION:
        ctl = `<button class="btn ${s.danger ? "btn--danger" : ""}" data-act="${s.action}">${esc(s.label)}</button>`; break;
    }
    if (s.type === ACTION) return `<div class="srow srow--action">${ctl}</div>`;
    return `<div class="srow ${s.type === COLOR || s.type === TEXT ? "srow--wide" : ""}">
      <div class="srow__label">${esc(s.label)}${changed ? `<button class="srow__reset" data-reset="${s.key}" title="Reset to default">↺</button>` : ""}${s.hint ? `<small>${esc(s.hint)}</small>` : ""}</div>
      <div class="srow__ctl">${ctl}</div></div>`;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    el.querySelectorAll(".settings__tabs button").forEach((b) => b.classList.toggle("on", !q && b.dataset.group === group));
    const items = q
      ? SETTINGS.filter((s) => (s.label + " " + s.key + " " + (GROUPS.find((g) => g.id === s.group)?.label || "")).toLowerCase().includes(q))
      : SETTINGS.filter((s) => s.group === group);
    list.innerHTML = items.length ? items.map(row).join("") : `<p class="muted">No setting matches “${esc(q)}”.</p>`;
    if (!q && group === "data") list.insertAdjacentHTML("beforeend", `<p class="muted small">Your designs, tattoos and settings are saved automatically in this browser. Export a project file to back them up or move them to another device.</p>`);
  }

  el.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-group]");
    if (tab) { group = tab.dataset.group; search.value = ""; render(); return; }
    const sw = e.target.closest(".sw");
    if (sw) { set(sw.dataset.k, sw.dataset.v); render(); return; }
    const rs = e.target.closest("[data-reset]");
    if (rs) { set(rs.dataset.reset, SETTING_BY_KEY[rs.dataset.reset].default); render(); return; }
    const a = e.target.closest("[data-act]");
    if (a) { act(a.dataset.act); render(); }
  });
  el.addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const s = SETTING_BY_KEY[k];
    if (s.type === RANGE) {
      e.target.nextElementSibling.textContent = fmt(s, +e.target.value);
      set(k, +e.target.value, { live: true });
    } else if (s.type === COLOR) set(k, e.target.value, { live: true });
  });
  el.addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const s = SETTING_BY_KEY[k];
    const val = s.type === BOOL ? e.target.checked : s.type === RANGE ? +e.target.value : e.target.value;
    set(k, val);
    if (s.type !== TEXT) render();
  });
  search.addEventListener("input", render);
  render();
  return { el, refresh: render, show(g) { if (g) group = g; search.value = ""; render(); } };
}

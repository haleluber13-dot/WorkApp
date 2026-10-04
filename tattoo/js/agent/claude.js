// Claude engine: a real agent loop on the official Anthropic JS SDK (vendored as
// one ESM file, loaded lazily so the offline app never pays for it).
//
//   const eng = createClaudeEngine(app, { getSetting });
//   const { reply, chips } = await eng.handle(text, { onProgress, onText, onActivity });
//
// - Streams each turn with client.beta.messages.stream(...) and reads the result
//   with .finalMessage().
// - Tools mirror the app API; all tool_results of one assistant turn go back in a
//   single user message; failures are returned with is_error: true.
// - History is append-only: every assistant `response.content` (thinking blocks
//   included) is pushed back unchanged; system prompt and tool list are frozen per
//   conversation, so earlier thinking blocks stay valid.

import { RegionResolver } from "./regions.js";

const SDK_URL = new URL("../../vendor/anthropic/sdk.js", import.meta.url).href;

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
];
export const DEFAULT_MODEL = "claude-opus-5-5";

// Per-model request shape (from the claude-api skill docs):
//  - Opus 5.5 / Sonnet 5.5 / Fable 5.1: adaptive thinking (cannot be disabled), explicit effort,
//    server-side refusal fallback ("default" form), progress-update thinking display.
//  - Haiku 4.5: no thinking / effort params; no server-side fallback.
const MODEL_CAPS = {
  "claude-opus-5-5": { adaptive: true, effort: true, fallbacks: true, updates: true, maxTokens: 64000 },
  "claude-sonnet-5-5": { adaptive: true, effort: true, fallbacks: true, updates: true, maxTokens: 64000 },
  "claude-fable-5-1": { adaptive: true, effort: true, fallbacks: true, updates: true, maxTokens: 64000 },
  "claude-haiku-4-5": { adaptive: false, effort: false, fallbacks: false, updates: false, maxTokens: 16000 },
};
const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const BETA_UPDATES = "thinking-display-updates-2026-08-18";
const MAX_TURNS = 14;

let sdkPromise = null;
export function loadSdk() {
  if (!sdkPromise) sdkPromise = import(SDK_URL).catch((e) => { sdkPromise = null; throw e; });
  return sdkPromise;
}

/* ───────────────────────── tool definitions ───────────────────────── */

const MOVE = {
  type: "object",
  description: "Offset in centimeters within the skin's tangent plane, as seen looking at the tattoo: right = viewer's right, up = toward the head.",
  properties: { right: { type: "number" }, up: { type: "number" } },
  required: ["right", "up"],
  additionalProperties: false,
};
const INK = { type: "string", enum: ["original", "black", "color", "stencil"], description: "original = the design's own colors; black = black & grey; color = single ink color (set color); stencil = purple transfer outline." };

export function buildTools({ allowLook = true } = {}) {
  const tools = [
    {
      name: "get_state",
      description: "Read the current scene: body parameters, every placed tattoo (id, design name, region, size, rotation, ink, age…), the selected tattoo and the design library. Call this when you need ids or current values you don't already have.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      strict: true,
    },
    {
      name: "list_styles",
      description: "List the procedural design styles with their tweakable options (key, type, range/choices, default). Call before create_design when you want to set specific options, or when the user asks to tweak a design option you don't know the key for.",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      strict: true,
    },
    {
      name: "create_design",
      description: "Generate a new tattoo design with the built-in procedural generator. Give a short natural-language prompt (subject + style, e.g. \"geometric wolf\", \"fine line rose\") and/or a style_id with opts. To tweak an existing design (\"thinner lines\", \"more petals\"), call again with the same style_id and the changed opts, then point the tattoo at the new design with update_tattoo(design_id). Returns the design id.",
      input_schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Subject and style in plain words." },
          style_id: { type: "string", description: "A style id from list_styles / the system prompt." },
          opts: { type: "object", description: "Generator options for the style (keys from list_styles)." },
          name: { type: "string", description: "Optional friendly name." },
        },
        required: [],
      },
    },
    {
      name: "create_svg_design",
      description: "Add a design you author yourself as a complete SVG. Use this when the built-in generator can't make what the user wants (a specific symbol, custom lettering layout, a particular composition). Tattoo-flash conventions: a single self-contained <svg> with xmlns and a viewBox (e.g. 0 0 512 512) and no width/height in px needed; transparent background (no full-size background rect); ink #141414 (add colors only if the user asked for color); bold, clean, closed paths with stroke-linecap/linejoin round; line weights that survive at tattoo scale (stroke-width ≥ 3 in a 512 box, fine details ≥ 1.5); no external references (no <image href>, no web fonts, no <use> of external files, no scripts, no foreignObject); prefer text converted to paths, otherwise plain <text> with a generic font-family (serif / sans-serif / cursive). Keep it under ~25 KB.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short design name, e.g. \"Moon & dagger\"." },
          svg: { type: "string", description: "The complete SVG document." },
          style: { type: "string", description: "Style label, e.g. \"traditional\", \"fine line\"." },
        },
        required: ["name", "svg"],
      },
      eager_input_streaming: true,
    },
    {
      name: "place_tattoo",
      description: "Put a design on the body at a named region. Uses the most recent design when design_id is omitted. Returns the new tattoo (id, region, sizeCm …). Pick a size that suits the spot (see the region sizes in the system prompt).",
      input_schema: {
        type: "object",
        properties: {
          region: { type: "string", description: "Region id (exactly as listed)." },
          design_id: { type: "string" },
          size_cm: { type: "number", description: "Width on skin in cm (typically 2–40)." },
          rotation: { type: "number", description: "Degrees around the skin normal; 0 = upright." },
          offset_cm: MOVE,
          ink: INK,
          color: { type: "string", description: "Hex ink color like #b3242f, used with ink=color." },
        },
        required: ["region"],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "update_tattoo",
      description: "Change a placed tattoo. id may be \"selected\" for the current/most recent tattoo. Use relative fields for relative requests: scale_by (1.25 = 25% bigger), rotate_by (degrees), move_cm (cm). age: 0 fresh … 0.3 healed … 1 very old/faded. opacity 0..1. design_id swaps the artwork (e.g. after regenerating).",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string" },
          region: { type: "string" },
          size_cm: { type: "number" },
          scale_by: { type: "number" },
          rotation: { type: "number" },
          rotate_by: { type: "number" },
          move_cm: MOVE,
          opacity: { type: "number" },
          ink: INK,
          color: { type: "string" },
          flip: { type: "boolean", description: "Mirror the artwork horizontally." },
          age: { type: "number" },
          visible: { type: "boolean" },
          design_id: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "remove_tattoo",
      description: "Remove one tattoo by id (or \"selected\"), or every tattoo with id \"all\". The user can undo.",
      input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      strict: true,
    },
    {
      name: "duplicate_tattoo",
      description: "Copy a tattoo. mirror=true puts a mirrored copy at the same spot on the other side of the body (\"same on the other arm\").",
      input_schema: { type: "object", properties: { id: { type: "string" }, mirror: { type: "boolean" } }, required: ["id", "mirror"], additionalProperties: false },
      strict: true,
    },
    {
      name: "set_body",
      description: "Change the 3D body. Only include fields to change. sex male|female; height_cm 140–210; build, muscle, shoulders, chest, hips, leg_length are 0..1 (0.5 average); arm_pose is degrees of arm abduction 5–90.",
      input_schema: {
        type: "object",
        properties: {
          sex: { type: "string", enum: ["male", "female"] },
          height_cm: { type: "number" }, build: { type: "number" }, muscle: { type: "number" }, shoulders: { type: "number" },
          chest: { type: "number" }, hips: { type: "number" }, leg_length: { type: "number" }, arm_pose: { type: "number" },
        },
        required: [],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "set_setting",
      description: "Change an app setting, e.g. skin.tone (hex color — darker/lighter skin), scene.lighting, scene.background, ink.blend. Call get_settings first if unsure of keys or allowed values. Never touch ai.* keys.",
      input_schema: {
        type: "object",
        properties: { key: { type: "string" }, value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
        required: ["key", "value"],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "get_settings",
      description: "List adjustable settings (key, label, type, range or choices, current value).",
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
      strict: true,
    },
    {
      name: "camera",
      description: "Move the 3D camera: view = front/back/left/right/top, or focus = a region id or tattoo id to zoom in on. Use it to show the user the result.",
      input_schema: {
        type: "object",
        properties: { view: { type: "string", enum: ["front", "back", "left", "right", "top"] }, focus: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
      strict: true,
    },
    {
      name: "undo",
      description: "Undo (or redo with redo=true) the last change(s).",
      input_schema: { type: "object", properties: { redo: { type: "boolean" }, times: { type: "integer" } }, required: [], additionalProperties: false },
      strict: true,
    },
  ];
  if (allowLook) tools.push({
    name: "look",
    description: "Take a picture of the 3D view to check how a tattoo actually sits on the body (position, size, overlap). Use it after placing or moving when placement matters; point the camera first if needed.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  });
  return tools;
}

const ACTIVITY_LABEL = {
  get_state: "checking", list_styles: "browsing styles", create_design: "designing", create_svg_design: "drawing",
  place_tattoo: "placing", update_tattoo: "adjusting", remove_tattoo: "removing", duplicate_tattoo: "copying",
  set_body: "changing body", set_setting: "changing settings", get_settings: "checking settings", camera: "moving camera",
  undo: "undoing", look: "taking a look",
};

/* ───────────────────────── input validation ───────────────────────── */

// Minimal JSON-schema check for our own schemas (types, required, enum,
// additionalProperties:false). Needed because eager input streaming skips
// server-side validation, and as a guard in general.
export function validateInput(schema, value, path = "input") {
  if (!schema) return null;
  if (schema.anyOf) {
    for (const s of schema.anyOf) if (!validateInput(s, value, path)) return null;
    return `${path} has the wrong type`;
  }
  const t = schema.type;
  if (t === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return `${path} must be an object`;
    for (const k of schema.required || []) if (!(k in value)) return `${path}.${k} is required`;
    for (const [k, v] of Object.entries(value)) {
      const ps = schema.properties && schema.properties[k];
      if (!ps) { if (schema.additionalProperties === false) return `${path}.${k} is not allowed`; continue; }
      const e = validateInput(ps, v, `${path}.${k}`);
      if (e) return e;
    }
    return null;
  }
  if (t === "string" && typeof value !== "string") return `${path} must be a string`;
  if (t === "number" && (typeof value !== "number" || !isFinite(value))) return `${path} must be a number`;
  if (t === "integer" && !Number.isInteger(value)) return `${path} must be an integer`;
  if (t === "boolean" && typeof value !== "boolean") return `${path} must be true or false`;
  if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.join(", ")}`;
  return null;
}

/* ───────────────────────── system prompt ───────────────────────── */

function buildSystem(app) {
  let regions = [], styles = [];
  try { regions = app.listRegions() || []; } catch {}
  try { styles = app.listStyles() || []; } catch {}
  const regionLines = regions.map((r) => `${r.id} — ${r.label || r.id}${r.sizeCm ? ` (~${Math.round(r.sizeCm)} cm)` : ""}`).join("\n");
  const styleLines = styles.map((s) => `${s.id} — ${s.name}${s.description ? `: ${s.description}` : ""}`).join("\n");
  return `You are the tattoo assistant inside InkForm 3D, an app where people try tattoos on a 3D body before getting inked. You are a warm, experienced tattoo artist: you know placement, flow with the body's lines, sensible sizes, styles (traditional, neo-trad, fine line, blackwork, geometric, mandala, dotwork, watercolor, lettering, Japanese…) and how ink ages.

The user is a tattoo enthusiast, not a technical person. They speak casually ("make it bigger", "a bit higher", "same on the other arm").

How to work:
- Act first. Do what was asked right away with the tools; don't ask for confirmation unless the request is truly ambiguous, and then ask one short question.
- "it"/"that" means the selected or most recently changed tattoo (id "selected" works).
- Relative requests are relative: "bigger" ≈ scale_by 1.25, "a bit" ≈ 1.1, "a lot" ≈ 1.6; "higher" ≈ move_cm up 2; "a bit" ≈ 1 cm.
- Left/right body parts are the person's own left/right (region ids say which).
- Prefer the built-in generator (create_design) for designs; author an SVG with create_svg_design when the user wants something specific it can't make.
- After placing or moving something where placement matters, you may use look to check it visually, and fix it if it's off. Don't look after every tiny change — keep things snappy.
- Reply in one or two short, friendly sentences in plain language: say what you did (e.g. "Done — 12 cm geometric wolf on your left inner forearm.") and optionally offer one natural next step. Never mention tools, ids, JSON, parameters or anything technical. No markdown headings or lists unless the user asks for a list.
- If something fails, say so simply and suggest an alternative.

Body regions (id — label, typical width):
${regionLines || "(call get_state / list regions if needed)"}

Design styles (id — name):
${styleLines || "(call list_styles)"}`;
}

function stateSnapshot(app) {
  try {
    const st = app.getState() || {};
    const designs = new Map((st.designs || []).map((d) => [d.id, d]));
    return JSON.stringify({
      body: st.body,
      selectedId: st.selectedId || null,
      view: st.view,
      tattoos: (st.tattoos || []).map((t) => ({
        id: t.id, design: (designs.get(t.designId) || {}).name || t.designId, designId: t.designId, region: t.region,
        sizeCm: Math.round((t.sizeCm || 0) * 10) / 10, rotation: Math.round(t.rotation || 0), ink: t.ink, color: t.color,
        flip: !!t.flip, age: t.age, opacity: t.opacity, visible: t.visible !== false,
      })),
    });
  } catch { return "{}"; }
}

/* ───────────────────────── tool execution ───────────────────────── */

// The app quietly maps unknown region names onto *some* body part (its fuzzy matcher accepts
// almost anything), so check region ids here: exact id, else our own body-part parser, else an error.
function checkRegion(app, region) {
  if (region == null) return undefined;
  let list = [];
  try { list = app.listRegions() || []; } catch {}
  if (!list.length || list.some((r) => r.id === region)) return region;
  const hit = new RegionResolver(list).find(String(region).replace(/[_-]+/g, " ").toLowerCase(), {});
  if (hit) return hit.regionId;
  throw new Error(`Unknown region "${region}" — use one of the region ids listed in the system prompt.`);
}

async function runTool(app, name, input, { allowLook }) {
  const pickDefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  switch (name) {
    case "get_state": return JSON.parse(stateSnapshot(app));
    case "list_styles": return (app.listStyles() || []).map((s) => ({ id: s.id, name: s.name, category: s.category, description: s.description, options: (s.options || []).map((o) => pickDefined({ key: o.key, label: o.label, type: o.type, min: o.min, max: o.max, step: o.step, choices: o.choices && o.choices.map((c) => c.value), default: o.default })) }));
    case "get_settings": return (app.listSettings() || []).filter((s) => !/^ai\./.test(s.key) && s.type !== "action").map((s) => pickDefined({ key: s.key, label: s.label, type: s.type, min: s.min, max: s.max, choices: s.choices && s.choices.map((c) => c.value), swatches: s.swatches && s.swatches.map((c) => (c.label ? `${c.value} ${c.label}` : c.value)), value: app.getSetting(s.key) }));
    case "create_design": {
      const d = await app.createDesign(pickDefined({ styleId: input.style_id, opts: input.opts, prompt: input.prompt, name: input.name }));
      return { design_id: d.id, name: d.name, style: d.style, params: d.params };
    }
    case "create_svg_design": {
      const svg = String(input.svg || "");
      if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new Error("svg must be one complete <svg>…</svg> document");
      if (/<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?!#)/i.test(svg)) throw new Error("svg must be self-contained: no scripts, event handlers or external references");
      const d = await app.addSvgDesign(pickDefined({ name: input.name, svg, style: input.style }));
      return { design_id: d.id, name: d.name };
    }
    case "place_tattoo": {
      const t = await app.placeTattoo(pickDefined({ designId: input.design_id, region: checkRegion(app, input.region), sizeCm: input.size_cm, rotation: input.rotation, offsetCm: input.offset_cm, ink: input.ink, color: input.color }));
      return summarizeTattoo(t);
    }
    case "update_tattoo": {
      const { id, ...rest } = input;
      const t = await app.updateTattoo(id, pickDefined({
        region: checkRegion(app, rest.region), sizeCm: rest.size_cm, scaleBy: rest.scale_by, rotation: rest.rotation, rotateBy: rest.rotate_by,
        moveCm: rest.move_cm, opacity: rest.opacity, ink: rest.ink, color: rest.color, flip: rest.flip, age: rest.age,
        visible: rest.visible, designId: rest.design_id,
      }));
      return summarizeTattoo(t);
    }
    case "remove_tattoo":
      if (input.id === "all") { await app.clearTattoos(); return { removed: "all" }; }
      await app.removeTattoo(input.id); return { removed: input.id };
    case "duplicate_tattoo": return summarizeTattoo(await app.duplicateTattoo(input.id, { mirror: !!input.mirror }));
    case "set_body": {
      const map = { sex: "sex", height_cm: "heightCm", build: "build", muscle: "muscle", shoulders: "shoulders", chest: "chest", hips: "hips", leg_length: "legLength", arm_pose: "armPose" };
      const p = {};
      for (const [k, v] of Object.entries(input)) if (map[k] && v !== undefined) p[map[k]] = v;
      await app.setBody(p);
      return { body: (app.getState() || {}).body };
    }
    case "set_setting":
      if (/^ai\./.test(input.key)) throw new Error("assistant settings can only be changed by the user");
      app.setSetting(input.key, input.value);
      return { key: input.key, value: app.getSetting(input.key) };
    case "camera":
      if (input.focus) {
        const isTattoo = input.focus === "selected" || ((app.getState() || {}).tattoos || []).some((t) => t.id === input.focus);
        await app.focus(isTattoo ? input.focus : checkRegion(app, input.focus));
      }
      else if (input.view) await app.viewFrom(input.view);
      else await app.viewFrom("front");
      return { ok: true };
    case "undo": {
      const n = Math.max(1, Math.min(20, input.times || 1));
      for (let i = 0; i < n; i++) await (input.redo ? app.redo() : app.undo());
      return { ok: true, state: JSON.parse(stateSnapshot(app)) };
    }
    case "look": {
      if (!allowLook) throw new Error("looking at the view is turned off in settings");
      const url = await app.screenshot({ width: 768, height: 768 });
      const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(String(url || ""));
      if (!m) throw new Error("screenshot unavailable");
      return { __content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: "Current 3D view." },
      ] };
    }
    default: throw new Error(`unknown tool ${name}`);
  }
}

function summarizeTattoo(t) {
  if (!t) return { ok: true };
  return { id: t.id, designId: t.designId, region: t.region, sizeCm: Math.round((t.sizeCm || 0) * 10) / 10, rotation: t.rotation, ink: t.ink, color: t.color, age: t.age, opacity: t.opacity, flip: t.flip };
}

/* ───────────────────────── engine ───────────────────────── */

export class ClaudeError extends Error {
  constructor(kind, message, cause) { super(message); this.kind = kind; this.cause = cause; }
}

/**
 * @param app      the app API
 * @param options  { getSetting(key), clientFactory?(Anthropic, opts) } — clientFactory lets tests inject a fetch.
 */
export function createClaudeEngine(app, options = {}) {
  const getSetting = options.getSetting || ((k) => { try { return app.getSetting(k); } catch { return undefined; } });
  let convo = null;            // { system, tools, messages }
  let client = null, clientKey = null;

  function newConvo() {
    const allowLook = getSetting("ai.look") !== false;
    convo = {
      allowLook,
      // Frozen for the whole conversation: editing system/tools later would invalidate thinking blocks.
      system: [{ type: "text", text: buildSystem(app), cache_control: { type: "ephemeral" } }],
      tools: buildTools({ allowLook }),
      messages: [],
    };
    return convo;
  }

  async function getClient() {
    const key = String(getSetting("ai.apiKey") || "").trim();
    if (!key) throw new ClaudeError("nokey", "No API key set.");
    const sdk = await loadSdk();
    const Anthropic = sdk.default || sdk.Anthropic;
    if (!client || clientKey !== key) {
      const opts = { apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 };
      client = options.clientFactory ? options.clientFactory(Anthropic, opts) : new Anthropic(opts);
      clientKey = key;
    }
    return { client, sdk };
  }

  function requestParams(c) {
    const model = String(getSetting("ai.model") || DEFAULT_MODEL);
    const caps = MODEL_CAPS[model] || MODEL_CAPS[DEFAULT_MODEL];
    const effort = ["low", "medium", "high", "xhigh", "max"].includes(getSetting("ai.effort")) ? getSetting("ai.effort") : "medium";
    const params = {
      model,
      max_tokens: caps.maxTokens,
      system: c.system,
      tools: c.tools,
      tool_choice: { type: "auto" },
      messages: c.messages,
    };
    const betas = [];
    if (caps.adaptive) {
      params.thinking = caps.updates ? { type: "adaptive", display: "updates" } : { type: "adaptive" };
      if (caps.updates) betas.push(BETA_UPDATES);
    }
    if (caps.effort) params.output_config = { effort };
    if (caps.fallbacks) { params.fallbacks = "default"; betas.push(BETA_FALLBACK); }
    if (betas.length) params.betas = betas;
    return params;
  }

  // After a mid-output fallback, blocks before the last `fallback` marker that the
  // fallback model can't continue from are omitted when echoing (docs: refusal section).
  function echoContent(content) {
    const lastFb = content.map((b) => b.type).lastIndexOf("fallback");
    if (lastFb < 0) return content;
    return content.filter((b, i) => i > lastFb || !["thinking", "redacted_thinking", "tool_use", "server_tool_use"].includes(b.type));
  }

  /**
   * Run one user message through the agent loop.
   * cb: { onActivity(label, status), onProgress(text), onText(fullTextSoFar) }
   */
  async function handle(text, cb = {}) {
    const { client: cl, sdk } = await getClient();
    const c = convo || newConvo();
    c.messages.push({ role: "user", content: [{ type: "text", text: `<app_state>${stateSnapshot(app)}</app_state>\n\n${text}` }] });
    let finalText = "";
    let didSomething = false;
    let jsonRetries = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const params = requestParams(c);
      let message;
      try {
        const stream = cl.beta.messages.stream(params);
        let live = "";
        stream.on("text", (delta) => { live += delta; cb.onText && cb.onText(finalText + live); });
        stream.on("thinking", (delta) => { if (delta && cb.onProgress) cb.onProgress(delta); });
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Typed API errors (auth, rate limit, connection…) are never retried here.
        if (err instanceof sdk.APIError) throw classify(err, sdk);
        // Tool input that could not be parsed at all (eager input streaming) surfaces as a
        // plain AnthropicError: re-issue the turn (the failed turn was never appended), capped.
        if (err instanceof sdk.AnthropicError && jsonRetries++ < 2) continue;
        throw classify(err, sdk);
      }

      if (message.stop_reason === "refusal") {
        // Partial output of a declined turn is discarded; the user turn stays (append-only).
        return { reply: (finalText ? finalText + " " : "") + "Sorry — I can't help with that one. Want to try a different design?", refusal: true, didSomething };
      }

      const content = message.content || [];
      const toolUses = content.filter((b) => b.type === "tool_use");
      const texts = content.filter((b) => b.type === "text").map((b) => b.text).join("");
      if (texts) finalText = (finalText ? finalText + "\n\n" : "") + texts.trim();
      for (const b of content) if (b.type === "thinking" && b.thinking && cb.onProgress) cb.onProgress("\n");

      c.messages.push({ role: "assistant", content: echoContent(content) });

      if (message.stop_reason === "pause_turn") continue;

      if (message.stop_reason === "max_tokens") {
        if (toolUses.length) {
          // Never run truncated tool input; answer every tool_use so the history stays valid.
          c.messages.push({ role: "user", content: toolUses.map((tu) => ({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: "Not run: the request was cut off (max_tokens). Try a smaller step." })) });
        }
        return { reply: (finalText || "That got a bit long and was cut off") + " — could you ask in smaller steps?", truncated: true, didSomething };
      }

      if (!toolUses.length) break; // end_turn / stop_sequence

      // Run every tool of this turn, then return all results in ONE user message.
      const results = [];
      for (const tu of toolUses) {
        const label = ACTIVITY_LABEL[tu.name] || tu.name;
        cb.onActivity && cb.onActivity(label, "start", tu.name);
        const def = c.tools.find((t) => t.name === tu.name);
        const err = def ? validateInput(def.input_schema, tu.input) : `unknown tool ${tu.name}`;
        if (err) {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: err, received: tu.input }) });
          cb.onActivity && cb.onActivity(label, "error", tu.name);
          continue;
        }
        try {
          const out = await runTool(app, tu.name, tu.input, { allowLook: c.allowLook });
          if (!/^(?:get_state|list_styles|get_settings|look)$/.test(tu.name)) didSomething = true;
          results.push(out && out.__content
            ? { type: "tool_result", tool_use_id: tu.id, content: out.__content }
            : { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out ?? { ok: true }) });
          cb.onActivity && cb.onActivity(label, "done", tu.name);
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: String((e && e.message) || e || "failed") });
          cb.onActivity && cb.onActivity(label, "error", tu.name);
        }
      }
      c.messages.push({ role: "user", content: results });
    }
    return { reply: finalText || (didSomething ? "Done!" : "Hmm, I'm not sure what to do there — could you say it another way?"), didSomething };
  }

  function classify(err, sdk) {
    if (err instanceof ClaudeError) return err;
    if (sdk && err instanceof sdk.AuthenticationError) return new ClaudeError("auth", "Your Anthropic API key was rejected — please check it in Settings.", err);
    if (sdk && err instanceof sdk.PermissionDeniedError) return new ClaudeError("permission", "Your API key doesn't have access to this model.", err);
    if (sdk && err instanceof sdk.NotFoundError) return new ClaudeError("model", "That Claude model isn't available for your key — try another in Settings.", err);
    if (sdk && err instanceof sdk.RateLimitError) return new ClaudeError("rate", "Claude is busy right now (rate limit) — try again in a moment.", err);
    if (sdk && err instanceof sdk.BadRequestError) return new ClaudeError("bad", "Claude couldn't process that request.", err);
    if (sdk && err instanceof sdk.APIConnectionError) return new ClaudeError("network", "I couldn't reach Claude — check your internet connection.", err);
    if (sdk && err instanceof sdk.InternalServerError) return new ClaudeError("server", "Claude is having trouble right now.", err);
    if (sdk && err instanceof sdk.APIError) return new ClaudeError("api", `Claude returned an error${err.status ? ` (${err.status})` : ""}.`, err);
    return new ClaudeError("other", "Something went wrong talking to Claude.", err);
  }

  return {
    handle,
    reset() { convo = null; },
    get history() { return convo ? convo.messages : []; },
    requestParams: () => requestParams(convo || newConvo()),
  };
}

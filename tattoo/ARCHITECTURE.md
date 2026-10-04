# InkForm 3D — architecture

Static web app (no build step), like the other apps in this repo. Served from
`tattoo/`. Plain ES modules; three.js is vendored and resolved with an import map.

```html
<script type="importmap">
{ "imports": {
    "three": "./vendor/three/three.module.js",
    "three/addons/": "./vendor/three/addons/"
} }
</script>
```

Vendored: `vendor/three/three.module.js` (+ `three.core.js`), `vendor/three/addons/`
(`OrbitControls.js`, `RoomEnvironment.js`, `BufferGeometryUtils.js`, `DecalGeometry.js`).
Any other library must be vendored locally too (no CDNs at runtime), MIT/OFL/CC0 only.

## Layout

```
tattoo/
  index.html  styles.css  manifest.webmanifest  sw.js  icons/  fonts/  vendor/
  js/
    app.js              shell, tabs, wiring, the `app` API (below)
    state.js            store + persistence + undo/redo
    settings.js         settings schema + generic settings panel
    viewer.js           three.js scene, body mesh, tattoo decals, picking/dragging
    decal.js            fast decal builder (spatial hash + flood fill)
    ink.js              design → ink texture processing (ink modes, aging, stencil)
    body/               (agent A) parametric body: SDF + mesher + regions
    designs/            (agent B) style generators, motif library, lettering
    sketch/             (agent C) drawing studio
    agent/              (agent D) AI assistant: local interpreter + Claude client + chat UI
  dev/                  temporary test pages (deleted before shipping)
```

## World conventions

- Units: **meters**. Y up. Feet on y = 0. Body faces **+Z**. The person's **left** side is **+X**.
- Body is centered on x = 0, z ≈ 0.
- Default pose: relaxed A-pose, arms ~25–35° from the torso, palms facing forward
  (anatomical position) so the inner forearm is visible from the front.

## Shared data shapes

```js
// Body parameters (all optional, defaults shown)
BodyParams = {
  sex: "male" | "female",   // default "male"
  heightCm: 178,            // 140..210
  build: 0.5,               // 0 slim .. 1 heavy (overall girth / body fat)
  muscle: 0.5,              // 0 soft .. 1 athletic/muscular
  shoulders: 0.5,           // 0 narrow .. 1 broad
  chest: 0.5,               // pecs (male) / bust size (female)
  hips: 0.5,                // 0 narrow .. 1 wide
  legLength: 0.5,           // proportion
  armPose: 30,              // degrees of arm abduction from the torso (5..90)
  detail: "medium",         // "low" | "medium" | "high" mesh resolution
}

// A design (artwork in the library)
Design = {
  id: "d_…", name: "Rose mandala", style: "mandala",
  kind: "svg" | "image",
  svg?: "<svg …>…</svg>",   // self-contained: no external refs, transparent background
  image?: "data:image/png;base64,…",  // transparent PNG
  width, height,            // intrinsic px (svg viewBox size or image size)
  params?: {…},             // generator inputs, to regenerate/tweak
  createdAt: 1700000000000,
}

// A tattoo placed on the body
Tattoo = {
  id: "t_…", designId: "d_…",
  region: "left_forearm_inner",   // nearest named region (informational)
  position: [x, y, z],            // surface point (body space, meters)
  normal: [x, y, z],              // surface normal at position
  rotation: 0,                    // degrees, around the normal (0 = design "up" ≈ body up)
  sizeCm: 10,                     // width of the design on skin, in cm
  opacity: 1,                     // 0..1
  ink: "original" | "black" | "color" | "stencil",
  color: "#1a1a1a",               // used when ink === "color"
  flip: false,                    // mirror horizontally
  age: 0,                         // 0 fresh .. 1 old/faded (blur + fade + desaturate)
  visible: true,
}
```

## Module contracts

### body/ (agent A) — `js/body/index.js`
```js
export const DEFAULT_BODY: BodyParams
export async function buildBody(params: BodyParams): Promise<{
  geometry: THREE.BufferGeometry,     // indexed, smooth normals, meters, conventions above
  regions: Region[],                  // anchors computed for these params
  bounds: { min:[x,y,z], max:[x,y,z] },
}>
export const REGION_LIST: RegionInfo[]   // static metadata (id, label, aliases, group, side)
Region = { id, label, group, side: "left"|"right"|"center",
           position:[x,y,z], normal:[x,y,z], up:[x,y,z], sizeCm /* sensible default width */,
           aliases: ["left inner forearm", …] }
```

### designs/ (agent B) — `js/designs/index.js`
```js
export const STYLES: StyleInfo[]  // {id,name,category,description,options:Option[]}
Option = { key, label, type: "range"|"select"|"color"|"text"|"bool"|"seed",
           min?, max?, step?, choices?: [{value,label}], default }
export const SUBJECTS: {id,name,tags[]}[]           // motif library entries
export function generateDesign(styleId, opts = {}): { svg, width, height, name, params }
export function designFromPrompt(text, seed?): { styleId, opts }   // NL → generator call
export function renderSvgToCanvas(svg, size): Promise<HTMLCanvasElement>
```

### sketch/ (agent C) — `js/sketch/sketchpad.js`
```js
export class SketchPad {
  constructor(container: HTMLElement, { width = 1024, height = 1024, settings = {} })
  setSettings(settings) ; loadImage(src | HTMLCanvasElement | svgString) ; clear()
  undo() ; redo() ; toCanvas(): HTMLCanvasElement ; toDataURL(): string  // transparent PNG
  isEmpty(): boolean ; on(event, fn) /* "change" */ ; destroy()
}
```

### agent/ (agent D) — `js/agent/chat.js`
```js
export function mountAssistant(container: HTMLElement, app: AppAPI): { open(), close(), say(text) }
```

## The `app` API (implemented by `js/app.js`, used by the assistant and UI)

All methods are synchronous unless marked async. Region ids come from `REGION_LIST`.

```js
app.getState()          → { body: BodyParams, tattoos: Tattoo[], selectedId, designs: [{id,name,style}], view }
app.listRegions()       → RegionInfo[]
app.listStyles()        → StyleInfo[]
app.listSettings()      → SettingDef[]   // {key,label,group,type,min,max,step,choices,default}
app.getSetting(key) ; app.setSetting(key, value)
app.createDesign({ styleId, opts?, prompt?, name? }) → Design           // procedural generator
app.addSvgDesign({ name, svg, style? }) → Design                        // e.g. AI-authored SVG
app.placeTattoo({ designId?, region, sizeCm?, rotation?, offsetCm?: {right, up}, ink?, color? }) → Tattoo
        // designId defaults to the selected/most recent design
app.updateTattoo(id, {
  region?, sizeCm?, scaleBy?, rotation?, rotateBy?, moveCm?: {right, up},
  opacity?, ink?, color?, flip?, age?, visible?, designId?
}) → Tattoo          // id may be "selected"
app.removeTattoo(id) ; app.selectTattoo(id) ; app.clearTattoos()
app.duplicateTattoo(id, { mirror = false }) → Tattoo   // mirror = same spot on the other side
app.setBody(partialBodyParams)     async
app.focus(regionIdOrTattooId) ; app.viewFrom("front"|"back"|"left"|"right"|"top")
app.undo() ; app.redo()
app.screenshot({ width?, height? }) → dataURL (PNG)   async
app.openSketch(designId?) ; app.showTab("studio"|"sketch"|"designs")
app.toast(text)
```

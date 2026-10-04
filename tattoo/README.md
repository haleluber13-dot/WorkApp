# 🖋️ InkForm 3D — tattoo designer with a 3D body

Design a tattoo, see it on a realistic 3D body, slide it around the skin until
it sits exactly right, and let an AI assistant do it for you by just saying
what you want. Runs in any modern browser on phone, tablet and desktop, works
offline once loaded, and installs as an app (PWA). Live at `/tattoo/` once
GitHub Pages is enabled for this repo.

## What you can do

- **3D body, male or female** — a smooth, anatomically proportioned figure you
  can spin, zoom and view from any side. Change height, build, muscle,
  shoulders, chest/bust, hips, leg length, arm pose and skin tone; tattoos stay
  where they are on the body when its shape changes.
- **Put tattoos anywhere** — tap a design, then tap the body. Drag a tattoo to
  slide it over the skin, drag its round handle to resize and rotate, or pick a
  body part from 75 named spots (inner forearm, behind the ear, ribs, shoulder
  blade, ankle, fingers…). Tattoos **wrap around** arms and legs like real ink
  instead of sitting flat like a sticker.
- **Real ink look** — ink sits *in* the skin and takes on its lighting. Switch a
  tattoo between its design colors, black & grey, any single ink color, or a
  purple **thermal stencil** preview. Age it from fresh (with redness) to
  healed to old and faded. Set opacity, mirror it, copy it to the other side,
  duplicate, reorder, hide.
- **Create — 25+ tattoo styles** — mandala, geometric, sacred geometry, dotwork,
  blackwork, fine-line, minimalist, tribal, Polynesian, Maori koru, Celtic knot,
  Japanese waves, botanical, traditional/old-school, neo-traditional,
  watercolor, lettering (script, gothic, typewriter, Chicano…), ornamental,
  trash polka, sketch/hatching, ignorant style, zodiac & constellations,
  armbands, animals, and more — each with its own options and a motif library
  (rose, skull, swallow, wolf, koi, snake, moon, compass…). Or just type
  “mandala with 12 petals” or “Emma in script” and it builds it.
- **Sketch** — a full drawing studio: tattoo liner with pressure taper, brush
  pen, shader, dotwork stippling, hatching, pencil, shapes, text, fill,
  mirror/radial symmetry for mandalas, layers, a trace layer, **photo → stencil**
  conversion, undo/redo, pen pressure and touch. Send the drawing straight to
  the body.
- **AI assistant** (✦ AI button) — say or type things like *“put a geometric
  wolf on my left forearm”*, *“a bit higher”*, *“make it 30% bigger”*, *“same
  on the other arm”*, *“make it red”*, *“switch to a female body”*, *“show me
  the back”*. It acts immediately. The built-in brain works offline for free;
  add an Anthropic API key in **Settings → AI assistant** to use Claude, which
  can also draw brand-new designs and look at the 3D view to check placement.
- **Settings for everything** — body, skin and lighting, ink rendering,
  placement behaviour, design and sketch defaults, the AI, theme/accent/text
  size, units (cm / inches). Searchable.
- **Your work is saved automatically** in the browser. Export / import a
  project file, save a picture of the 3D view, download designs as SVG/PNG.

## Run it

Static site — no build step. Serve the repo root and open `/tattoo/`:

```bash
python3 -m http.server 8099      # then open http://localhost:8099/tattoo/
```

## Keyboard (Studio)

| Key | Action |
|---|---|
| Arrows / Shift+arrows | nudge selected tattoo 0.5 cm / 2 cm |
| `[` `]` | rotate 15° |
| `+` `-` | resize |
| Shift+wheel / Alt+wheel | resize / rotate |
| `F` | zoom to selected tattoo |
| Ctrl+D | duplicate |
| Delete | remove |
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |
| Esc | cancel placing / deselect |

## How it works

- **Body** (`js/body/`) — a parametric signed-distance-field human (smoothly
  blended capsules and ellipsoids driven by the body sliders) polygonized into
  a smooth mesh in a Web Worker. No model files, so every proportion is
  adjustable.
- **Skin-wrapping decals** (`js/decal.js`) — a discrete exponential map walks
  outward over the mesh from the tattoo's center and gives each vertex skin
  coordinates that preserve distances along the surface, so designs wrap
  around limbs without stretching and never bleed onto a neighbouring limb.
- **Ink** (`js/ink.js`) — designs are rasterized and processed (ink mode,
  aging, stencil tracing, white-background removal) and multiplied into the
  lit skin.
- **Designs** (`js/designs/`) — seeded procedural generators that output
  self-contained SVG; lettering is converted to paths with bundled OFL fonts.
- **Sketch** (`js/sketch/`), **assistant** (`js/agent/`), **settings schema**
  (`js/settings.js`), **app controller and the `app` API** (`js/app.js`) —
  see [ARCHITECTURE.md](ARCHITECTURE.md).

Third-party code (all vendored, no CDNs): three.js (MIT), three-mesh-bvh (MIT),
opentype.js (MIT), Anthropic TypeScript SDK (MIT), fonts under the SIL Open
Font License — licenses are next to each in `vendor/` and `fonts/`.

When you change app files, bump `CACHE` in `sw.js` so installed copies update.

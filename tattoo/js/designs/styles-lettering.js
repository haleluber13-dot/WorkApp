// Lettering styles: script, gothic, chicano, typewriter, bold sans, traditional banner.
import { INK, f1, f2, makeRng, transformD, M, polyD } from "./core.js";
import { renderScene, sceneBBox, PALETTES } from "./render.js";
import { layoutText, FONT_CHOICES, FONTS } from "./fonts.js";
import { bannerEls, textEls, flourishEls } from "./lettering.js";
import { seedOpt, weightOpt, colorOpt, rangeOpt, boolOpt, textOpt, selectOpt } from "./opts.js";

function letteringOptions(d) {
  return [
    textOpt("text", "Text", d.text), selectOpt("font", "Font", FONT_CHOICES, d.font),
    selectOpt("layout", "Layout", ["straight", "arc", "arc-down", "wave"], d.layout || "straight"),
    selectOpt("banner", "Banner", ["none", "ribbon", "scroll"], d.banner || "none"),
    selectOpt("flourish", "Flourish", ["none", "swash", "hearts", "stars", "lines", "dots"], d.flourish || "none"),
    selectOpt("effect", "Effect", ["none", "shadow", "outline", "outline-shadow"], d.effect || "none"),
    boolOpt("uppercase", "Uppercase", !!d.uppercase), rangeOpt("tracking", "Letter spacing", -0.05, 0.4, 0.01, d.tracking ?? 0),
    selectOpt("colors", "Colors", ["ink", "traditional"], d.colors || "ink"), weightOpt(d.weight ?? 3.5), colorOpt(), seedOpt(),
  ];
}

function letteringGen(o, ctx) {
  const rng = makeRng("lt" + o.seed);
  let text = String(o.text ?? "").trim() || "Ink";
  if (o.uppercase) text = text.toUpperCase();
  const font = FONTS[o.font] ? o.font : "script";
  const size = 180;
  const els = [];
  const single = text.replace(/\s*(\n|\s\/\s|\|)\s*/g, " ");
  const L = layoutText(single, font, size, { tracking: o.tracking });
  const W = Math.max(1000, L.width + 500), cx = W / 2, cy = 500;
  const shadow = o.effect === "shadow" || o.effect === "outline-shadow" ? size * 0.05 : 0;
  const outline = o.effect === "outline" || o.effect === "outline-shadow";
  const colored = o.colors === "traditional";
  const textRole = colored ? "main" : "dark";
  let bbox;
  if (o.banner !== "none") {
    const bs = size * 0.62;
    const Lb = layoutText(single, font, bs, { tracking: o.tracking });
    const curve = o.layout === "arc" ? 70 : o.layout === "arc-down" ? -70 : o.layout === "wave" ? 30 : 0;
    const b = bannerEls({ cx, cy, width: Lb.width + bs * 1.3, height: bs * 1.45, curve, style: o.banner, role: colored ? "cream" : "white" });
    els.push(...b.els);
    const t = textEls(single, { font, size: bs, base: b.base.map((p) => [p[0], p[1] + bs * 0.3]), tracking: o.tracking, role: textRole, shadow: shadow * 0.6, outline });
    els.push(...t.els);
    bbox = sceneBBox({ box: [0, 0, W, 1000], els: b.els }, 0);
    bbox = [bbox[0], bbox[1], bbox[0] + bbox[2], bbox[1] + bbox[3]];
  } else {
    const t = textEls(text, { font, size, cx, cy, layout: o.layout, arc: 0.5, tracking: o.tracking, role: textRole, shadow, outline });
    els.push(...t.els);
    bbox = t.bbox;
  }
  if (o.flourish !== "none") els.push(...flourishEls(o.flourish, bbox, rng));
  const scene = { box: [0, 0, W, 1000], els };
  const mode = colored ? "fill" : "line";
  const body = renderScene(ctx, scene, mode, { w: o.weight, color: o.color, bold: 1.2, palette: { ...PALETTES.traditional, white: "#ffffff" }, inner: true });
  return { body, bbox: sceneBBox(scene, o.weight * 2 + 16) };
}

const mk = (id, name, description, d, gallery) => ({ id, name, category: "Lettering", description, options: letteringOptions(d), gallery, gen: letteringGen, usesFonts: true });

export const LETTERING_STYLES = [
  mk("lettering-script", "Lettering: script", "Flowing script names and quotes with optional swash, banner or arc.",
    { text: "Emma", font: "script", flourish: "swash" },
    [{ text: "Emma" }, { text: "Carpe diem", font: "scriptBold", layout: "wave", flourish: "hearts" }, { text: "Mom", banner: "ribbon", flourish: "none" }, { text: "Amor fati", layout: "arc", font: "brush" }]),
  mk("lettering-gothic", "Lettering: gothic", "Blackletter / Old English lettering — straight, arched or on a banner.",
    { text: "Familia", font: "gothic", layout: "arc" },
    [{ text: "Familia" }, { text: "Loyalty", layout: "straight", effect: "shadow" }, { text: "Blessed", banner: "scroll" }]),
  mk("lettering-chicano", "Lettering: Chicano", "Chicano-style lettering: tall blackletter or signpainter script with drop shadow and stars.",
    { text: "Mi Vida Loca", font: "chicano", layout: "arc", effect: "outline-shadow", flourish: "stars" },
    [{ text: "Mi Vida Loca" }, { text: "Smile now", font: "signpainter", layout: "straight", effect: "shadow", flourish: "swash" }, { text: "Los Angeles", layout: "arc-down" }]),
  mk("lettering-typewriter", "Lettering: typewriter", "Clean monospaced typewriter quotes, small and minimal.",
    { text: "this too shall pass", font: "typewriter", tracking: 0.04, weight: 2 },
    [{ text: "this too shall pass" }, { text: "breathe", uppercase: true, tracking: 0.3, flourish: "lines" }, { text: "still I rise", layout: "arc" }]),
  mk("lettering-sans", "Lettering: bold sans", "Bold condensed capitals with generous spacing.",
    { text: "Stay wild", font: "sans", uppercase: true, tracking: 0.12 },
    [{ text: "Stay wild" }, { text: "No fear", effect: "outline-shadow" }, { text: "1987", layout: "arc", flourish: "dots" }]),
  mk("lettering-banner", "Lettering: banner", "Old-school ribbon banner with western lettering — classic flash.",
    { text: "Mom", font: "western", banner: "ribbon", layout: "arc", colors: "traditional", weight: 6, uppercase: true },
    [{ text: "Mom" }, { text: "True love", banner: "scroll", layout: "straight", font: "scriptBold", uppercase: false }, { text: "Mother", colors: "ink", layout: "arc-down" }]),
];

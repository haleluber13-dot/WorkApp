// Text rendering for the Sketch studio: multi-line, letter spacing, arc (banner) curve.

export const FONTS = [
  { id: 'Ink Script', label: 'Script', fallback: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive' },
  { id: 'Ink Script Bold', label: 'Script bold', fallback: '"Segoe Script", "Brush Script MT", cursive' },
  { id: 'Ink Signpainter', label: 'Signpainter', fallback: '"Brush Script MT", cursive' },
  { id: 'Ink Brush', label: 'Brush script', fallback: '"Brush Script MT", cursive' },
  { id: 'Ink Gothic', label: 'Gothic / blackletter', fallback: '"Old English Text MT", "UnifrakturMaguntia", "Times New Roman", serif' },
  { id: 'Ink Chicano', label: 'Chicano', fallback: '"Old English Text MT", "Times New Roman", serif' },
  { id: 'Ink Western', label: 'Western / old school', fallback: '"Rockwell", Georgia, serif' },
  { id: 'Ink Sans', label: 'Bold sans', fallback: '"Oswald", "Arial Narrow", system-ui, sans-serif' },
  { id: 'Ink Typewriter', label: 'Typewriter', fallback: '"American Typewriter", "Courier New", Courier, monospace' },
  { id: 'Ink Marker', label: 'Marker', fallback: '"Permanent Marker", "Marker Felt", "Comic Sans MS", sans-serif' },
  { id: 'Ink Elegant', label: 'Elegant serif', fallback: 'Didot, "Bodoni 72", "Playfair Display", Georgia, serif' },
];

export function fontCss(fontId, size) {
  const f = FONTS.find((x) => x.id === fontId) || FONTS[0];
  return `${Math.round(size)}px "${f.id}", ${f.fallback}`;
}

const loaded = new Set();
/** Ensure a font face is ready; resolves true when loaded (or false if unavailable). */
export function ensureFont(fontId) {
  if (loaded.has(fontId) || !document.fonts?.load) return Promise.resolve(true);
  return document.fonts.load(`40px "${fontId}"`).then((list) => { if (list.length) loaded.add(fontId); return list.length > 0; }, () => false);
}

/**
 * Lay out text centred at (cx, cy). spec: { text, font, fontSize, letterSpacing, curve (deg), align, color }
 * Returns { glyphs: [{ch,x,y,rot}], lines, bounds: {x0,y0,x1,y1} } — straight lines keep kerning by drawing whole runs.
 */
export function layoutText(ctx, spec, cx, cy) {
  const size = Math.max(4, spec.fontSize || 60);
  ctx.font = fontCss(spec.font, size);
  const ls = (spec.letterSpacing || 0) * size / 100;
  const lines = String(spec.text ?? '').split('\n');
  const lh = size * 1.18;
  const curve = (spec.curve || 0) * Math.PI / 180;
  const total = lh * lines.length;
  const items = [];
  let bounds = null;
  const grow = (x, y, r) => {
    if (!bounds) bounds = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
    else { bounds.x0 = Math.min(bounds.x0, x - r); bounds.y0 = Math.min(bounds.y0, y - r); bounds.x1 = Math.max(bounds.x1, x + r); bounds.y1 = Math.max(bounds.y1, y + r); }
  };
  const widths = lines.map((ln) => {
    const chars = [...ln];
    const cw = chars.map((ch) => ctx.measureText(ch).width + ls);
    const runW = ls ? cw.reduce((a, b) => a + b, 0) - ls : ctx.measureText(ln).width;
    return { chars, cw, w: Math.max(0, runW) };
  });
  const maxW = Math.max(1, ...widths.map((l) => l.w));
  lines.forEach((ln, li) => {
    const { chars, cw, w } = widths[li];
    const baseY = cy - total / 2 + lh * li + size * 0.82;
    if (Math.abs(curve) < 0.01) {
      let x0 = cx - w / 2;
      if (spec.align === 'left') x0 = cx - maxW / 2;
      else if (spec.align === 'right') x0 = cx + maxW / 2 - w;
      items.push({ run: ln, x: x0, y: baseY, chars, cw });
      grow(x0, baseY - size * 0.82, 0); grow(x0 + w, baseY + size * 0.36, 0);
    } else {
      const sign = curve > 0 ? 1 : -1;
      const th = Math.abs(curve);
      const R = Math.max(w, 1) / th;
      const midY = baseY - size * 0.3;
      let acc = 0;
      chars.forEach((ch, i) => {
        const wch = cw[i] - (i === chars.length - 1 ? ls : 0);
        const psi = -th / 2 + (acc + wch / 2) / R;
        acc += cw[i];
        let x, y, rot;
        if (sign > 0) { x = cx + R * Math.sin(psi); y = baseY + R - R * Math.cos(psi); rot = psi; }
        else { x = cx + R * Math.sin(psi); y = baseY - R + R * Math.cos(psi); rot = -psi; }
        items.push({ ch, x, y, rot });
        grow(x, y - size * 0.35, size * 0.7);
      });
      void midY;
    }
  });
  if (!bounds) bounds = { x0: cx - 10, y0: cy - 10, x1: cx + 10, y1: cy + 10 };
  return { items, bounds, size, ls };
}

export function drawText(ctx, spec, cx, cy, transforms) {
  const lay = layoutText(ctx, spec, cx, cy);
  ctx.fillStyle = spec.color || '#000';
  ctx.textBaseline = 'alphabetic';
  const T = transforms && transforms.length ? transforms : [[1, 0, 0, 1, 0, 0]];
  for (const m of T) {
    for (const it of lay.items) {
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (it.run !== undefined) {
        ctx.textAlign = 'left';
        if (lay.ls) {
          let x = it.x;
          it.chars.forEach((ch, i) => { ctx.fillText(ch, x, it.y); x += it.cw[i]; });
        } else ctx.fillText(it.run, it.x, it.y);
      } else {
        ctx.translate(it.x, it.y); ctx.rotate(it.rot);
        ctx.textAlign = 'center';
        ctx.fillText(it.ch, 0, 0);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return lay.bounds;
}

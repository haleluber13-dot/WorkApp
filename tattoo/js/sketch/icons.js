// Inline SVG icons for the Sketch studio (24×24 grid, currentColor).
const svg = (body, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const F = 'fill="currentColor" stroke="none"';

export const ICONS = {
  // tools
  move: svg('<path d="M12 3v18M3 12h18"/><path d="M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/>'),
  fineliner: svg('<path d="M3.5 17.5c2.5-4 4.5-8.5 7.5-7.5 3 1 1 6 4 6.5 2.2.4 3.8-3 5.5-7"/>', 1.4),
  liner: svg(`<path ${F} d="M3 19.5C8.5 18.6 12.8 13.2 16 9.5c1.6-1.8 3.3-3.6 5-5-1 2.4-2.6 4.4-4.2 6.4C13.6 15 9.6 19 3 19.5z"/>`),
  brushpen: svg(`<path ${F} d="M4.5 20c1.6-.6 2.6-2.4 3.3-4.6.9-2.9 1.4-6.6 4.2-8.8 2.3-1.8 5.5-2.4 7.5-1.8-2.4.2-4.4 1.2-5.6 2.9-1.6 2.3-1.7 5.6-3.4 8.4C9.3 18.4 7.1 20 4.5 20z"/>`),
  shader: svg(`<circle cx="12" cy="12" r="8.5" ${F} opacity=".16"/><circle cx="12" cy="12" r="6" ${F} opacity=".3"/><circle cx="12" cy="12" r="3.4" ${F} opacity=".6"/>`),
  stipple: svg(`<g ${F}><circle cx="12" cy="12" r="1.4"/><circle cx="8" cy="9" r="1.2"/><circle cx="15.5" cy="8" r="1.1"/><circle cx="16" cy="14.5" r="1.3"/><circle cx="9.5" cy="15.8" r="1.1"/><circle cx="12.2" cy="5.5" r=".9"/><circle cx="5.5" cy="12.8" r=".9"/><circle cx="19" cy="11" r=".9"/><circle cx="13" cy="19" r=".9"/><circle cx="6.5" cy="6" r=".7"/><circle cx="18" cy="18.2" r=".7"/></g>`),
  hatch: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M3.8 12.5L12.5 3.8M5.5 18.5L18.5 5.5M11.5 20.2l8.7-8.7"/>', 1.5),
  pencil: svg('<path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8z"/><path d="M13.8 6.8l3.4 3.4"/><path d="M4 20l2.2-.6" stroke-width="2.4"/>'),
  marker: svg('<path d="M4.5 16l15-8" stroke-width="5" opacity=".45"/><path d="M4.5 8l15 8" stroke-width="5" opacity=".45"/>'),
  eraser: svg('<path d="M9 20h11"/><path d="M4.7 15.3l9.6-9.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11.1 18.9a2 2 0 0 1-1.4.6H8.3a2 2 0 0 1-1.4-.6l-2.2-2.2a1 1 0 0 1 0-1.4z"/><path d="M9.6 10.4l5 5"/>'),
  fill: svg('<path d="M11 3.5l8 8-6.6 6.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8z"/><path d="M4.6 12h14.2"/><path ' + F + ' d="M20.3 15.2s1.7 2.1 1.7 3.3a1.7 1.7 0 0 1-3.4 0c0-1.2 1.7-3.3 1.7-3.3z"/>'),
  shape: svg('<rect x="3.5" y="3.5" width="9.5" height="9.5" rx="1.5"/><circle cx="15.5" cy="15.5" r="5"/>'),
  text: svg('<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>'),
  eyedropper: svg('<path d="M14.2 5.3l1.6-1.6a2.3 2.3 0 0 1 3.3 0l1.2 1.2a2.3 2.3 0 0 1 0 3.3l-1.6 1.6"/><path d="M12.5 7l4.5 4.5"/><path d="M15.5 10L7 18.5 4 20l1.5-3L14 8.5"/>'),
  // actions
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16M8 11h6M11 8v6"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16M8 11h6"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.5h-4.5"/>'),
  importImg: svg('<rect x="3" y="5" width="14" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="M3.5 17.5l4-4 3.5 3.5 2-2 3.5 3.5"/><path d="M20 3v6M17 6h6"/>'),
  stencil: svg('<path d="M4 20L15 9"/><path d="M13.5 7.5l3 3"/><path d="M17 2.5v3M15.5 4h3M20.5 8.5v2.5M19.2 9.75h2.6M9 3.5v2M8 4.5h2"/>'),
  download: svg('<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  more: svg(`<g ${F}><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></g>`),
  layers: svg('<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.2l8.5 4.5 8.5-4.5"/><path d="M3.5 16.2l8.5 4.5 8.5-4.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  duplicate: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  trash: svg('<path d="M4.5 7h15M10 11v6M14 11v6"/><path d="M6.5 7l1 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l1-12"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/>'),
  merge: svg('<path d="M12 3.5v10M8 10l4 4 4-4"/><path d="M4.5 18.5h15"/><path d="M7 21h10"/>'),
  clear: svg('<rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3 2.6"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M4 4l16 16"/><path d="M9.9 5.8A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 7.1C4 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1"/><path d="M10 10a3 3 0 0 0 4.1 4.1"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8"/>'),
  grip: svg(`<g ${F}><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>`),
  sliders: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 2.5-2.5L20 19"/>'),
  canvas: svg('<path d="M7 3v14h14"/><path d="M3 7h14v14"/>'),
  palette: svg('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-3s.9-1.8 2.1-1.8h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.8 16.7 3.5 12 3.5z"/><g ' + F + '><circle cx="7.5" cy="11" r="1.3"/><circle cx="10" cy="7.3" r="1.3"/><circle cx="14.5" cy="7.3" r="1.3"/></g>'),
  checker: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><path ${F} d="M4 6a2 2 0 0 1 2-2h6v8H4zM12 12h8v6a2 2 0 0 1-2 2h-6z" opacity=".55"/>`),
  grid: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>', 1.4),
  center: svg('<path d="M12 3v18M3 12h18" stroke-dasharray="2.2 2.2"/><circle cx="12" cy="12" r="2.2"/>'),
  rings: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>'),
  magnet: svg('<path d="M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>'),
  // symmetry
  symOff: svg('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>'),
  symV: svg('<path d="M12 3v18" stroke-dasharray="2 2.4"/><path d="M9 7.5L4.5 12 9 16.5z"/><path d="M15 7.5l4.5 4.5-4.5 4.5z"/>'),
  symH: svg('<path d="M3 12h18" stroke-dasharray="2 2.4"/><path d="M7.5 9L12 4.5 16.5 9z"/><path d="M7.5 15l4.5 4.5 4.5-4.5z"/>'),
  symQuad: svg(`<path d="M12 3v18M3 12h18" stroke-dasharray="2 2.4"/><g ${F}><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="7.5" r="2"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/></g>`),
  symRadial: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M4.6 7.75l14.8 8.5M4.6 16.25l14.8-8.5"/>', 1.4),
  symKaleido: svg('<path d="M12 12c-1.4-2.4-1.4-5.6 0-8.5 1.4 2.9 1.4 6.1 0 8.5zM12 12c2.8 0 5.6 1.6 7.4 4.2-3.2.3-6-1.4-7.4-4.2zM12 12c-1.4 2.4-4.2 4-7.4 4.2C6.4 13.6 9.2 12 12 12z"/><path d="M12 12c2.8 0 5.6-1.6 7.4-4.2-3.2-.3-6 1.4-7.4 4.2zM12 12c-1.4-2.4-4.2-4-7.4-4.2 1.8 2.6 4.6 4.2 7.4 4.2zM12 12c1.4 2.4 1.4 5.6 0 8.5-1.4-2.9-1.4-6.1 0-8.5z" opacity=".55"/>', 1.3),
  // shapes
  shLine: svg('<path d="M5 19L19 5"/>'),
  shRect: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'),
  shEllipse: svg('<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'),
  shPolygon: svg('<path d="M12 3.5l7.4 4.25v8.5L12 20.5l-7.4-4.25v-8.5z"/>'),
  shStar: svg('<path d="M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z"/>'),
  shArc: svg('<path d="M4 17.5C6 10 9 7 12 7s6 3 8 10.5"/><circle cx="4" cy="17.5" r="1" fill="currentColor"/><circle cx="20" cy="17.5" r="1" fill="currentColor"/>'),
  // transform
  flipH: svg('<path d="M12 3v18" stroke-dasharray="2 2.4"/><path d="M9 6.5L3.5 17H9z"/><path d="M15 6.5L20.5 17H15z" fill="currentColor" fill-opacity=".35"/>'),
  flipV: svg('<path d="M3 12h18" stroke-dasharray="2 2.4"/><path d="M6.5 9L17 3.5V9z"/><path d="M6.5 15L17 20.5V15z" fill="currentColor" fill-opacity=".35"/>'),
  rot90: svg('<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M4.5 3.5V7.5h4"/>'),
  alignLeft: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  alignCenter: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  alignRight: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  rename: svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/><path d="M13 20h7"/>'),
  hand: svg('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.4 0-3.8-1-5.2-3L4 14.6a1.5 1.5 0 0 1 2.4-1.8L8 15"/>'),
};

export function icon(name) {
  return ICONS[name] || '';
}

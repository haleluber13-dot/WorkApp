// Small vocabularies shared by the local interpreter (and reused for chips/help).

export const COLORS = {
  red: "#c4262e", "blood red": "#8e0f17", "dark red": "#8e1a1f", crimson: "#a4161a", scarlet: "#d1232a", cherry: "#b3112e",
  maroon: "#6d1a22", burgundy: "#6b1630", wine: "#5e1427",
  orange: "#e0662a", "burnt orange": "#c0531d", amber: "#e09a1f", coral: "#e86f5a", peach: "#f0a07a",
  yellow: "#e6c02e", gold: "#c9a227", golden: "#c9a227", mustard: "#c99a2a",
  green: "#2f8f4e", "dark green": "#1d5c33", "forest green": "#1f5a32", emerald: "#11845b", olive: "#6b7a2a", lime: "#7fbf2a", mint: "#5fc9a0", sage: "#7f9a7a",
  teal: "#13858a", turquoise: "#2bb3b1", cyan: "#2fb6d6", aqua: "#2fc4c4",
  blue: "#1f5fa8", "light blue": "#5aa7e0", "sky blue": "#5aaee6", "dark blue": "#163f7a", navy: "#14294f", "royal blue": "#2446b8", cobalt: "#1f47a8", indigo: "#3b2f8f",
  purple: "#6c3fa0", violet: "#7d4cc2", lavender: "#a58ad6", lilac: "#b49ad8", plum: "#6e2f63",
  pink: "#d9578f", "hot pink": "#e0307f", magenta: "#c0307f", fuchsia: "#c0389a", "light pink": "#eba3c0",
  brown: "#7a4a2a", sepia: "#704c2f", tan: "#b08055",
  grey: "#5e5e5e", gray: "#5e5e5e", silver: "#9a9a9a", charcoal: "#333333",
  white: "#f2f0ea",
};
// Longest names first so "dark red" wins over "red".
export const COLOR_NAMES = Object.keys(COLORS).sort((a, b) => b.length - a.length);

export const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, "forty five": 45, "forty-five": 45, "ninety degrees": 90,
};

export const ORDINALS = {
  first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4,
  sixth: 5, "6th": 5, last: -1, latest: -1, newest: -1, "most recent": -1, previous: -2, oldest: 0, earliest: 0,
};

// Absolute size words (cm). "big" sits a little under "large".
export const SIZE_WORDS = [
  [/\b(?:micro|teeny|teeny[- ]tiny|itty[- ]bitty)\b/, 2.5],
  [/\b(?:tiny|very small|super small)\b/, 3.5],
  [/\b(?:small|little|mini|minimal|dainty|petite|delicate little)\b/, 5.5],
  [/\b(?:palm[- ]sized?|hand[- ]sized?)\b/, 8],
  [/\b(?:medium|mid[- ]?sized?|moderate|normal[- ]sized?|regular[- ]sized?)\b/, 9],
  [/\b(?:big|biggish)\b/, 14],
  [/\b(?:large)\b/, 16],
  [/\b(?:huge|giant|massive|enormous|full|whole|xl|extra large|very large|very big)\b/, 25],
];

// Option-name hints for "make the lines thinner", "more petals" …
export const OPTION_HINTS = [
  { say: /\b(?:lines?|line ?work|strokes?|outlines?|line weight|linework)\b/, keys: ["line", "stroke", "weight", "outline", "thick", "width", "pen"] },
  { say: /\bpetals?\b/, keys: ["petal"] },
  { say: /\b(?:points?|spikes?|rays?|tips?)\b/, keys: ["point", "spike", "ray", "tip"] },
  { say: /\b(?:rings?|layers?|circles?|tiers?|levels?)\b/, keys: ["ring", "layer", "circle", "tier", "level"] },
  { say: /\b(?:details?|detailed|complex(?:ity)?|intricate|busier|busy|simpler|simple|minimal(?:ist)?|cleaner)\b/, keys: ["detail", "complex", "intricacy", "density", "busy"] },
  { say: /\b(?:dots?|dotwork|stipple|stippling)\b/, keys: ["dot", "stipple"] },
  { say: /\b(?:shading|shade|shadows?|fill|solid)\b/, keys: ["shad", "fill", "solid", "hatch"] },
  { say: /\b(?:leaves|leaf)\b/, keys: ["leaf", "leaves"] },
  { say: /\b(?:stars?)\b/, keys: ["star"] },
  { say: /\b(?:sides?|symmetry|folds?|segments?|spokes?)\b/, keys: ["side", "symmetr", "fold", "segment", "spoke"] },
  { say: /\b(?:curves?|curvy|curvier|swirls?|swirly|flow)\b/, keys: ["curv", "swirl", "flow"] },
  { say: /\b(?:spacing|space|gaps?)\b/, keys: ["spac", "gap"] },
  { say: /\b(?:frame|border)\b/, keys: ["frame", "border"] },
  { say: /\b(?:font|letters?|text|lettering)\b/, keys: ["font", "text", "letter"] },
  { say: /\b(?:thorns?)\b/, keys: ["thorn"] },
  { say: /\b(?:rays|sun ?rays|sunburst)\b/, keys: ["ray", "burst"] },
];

export const SIZE_FMT = (cm, units = "cm") => {
  if (units === "in") {
    const inch = cm / 2.54;
    return `${inch < 3 ? (Math.round(inch * 4) / 4).toString() : Math.round(inch)}″`;
  }
  return `${cm < 4 ? Math.round(cm * 2) / 2 : Math.round(cm)} cm`;
};

export function hexLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

export function shadeHex(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export const HELP_TEXT =
  "I can put designs on the body and adjust them. Try things like:\n" +
  "• “put a geometric wolf on my left forearm”\n" +
  "• “add a small rose behind my right ear”\n" +
  "• “make it bigger”, “a bit higher”, “closer to the wrist”, “rotate it 20 degrees”\n" +
  "• “make it red”, “black ink”, “make it look healed / old”\n" +
  "• “same on the other arm”, “remove the one on my chest”\n" +
  "• “more petals”, “thinner lines”, “make it watercolor”, “write \"Mom\" on my wrist”\n" +
  "• “switch to a female body”, “taller”, “darker skin”, “show me the back”, “undo”";

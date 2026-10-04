// Natural language → { styleId, opts } for the design generators.
import { hashSeed } from "./core.js";

const INK_COLORS = {
  red: "#b3201b", crimson: "#a3122a", scarlet: "#c42116", blue: "#1f4fa0", navy: "#1b2f5e", teal: "#127d78", turquoise: "#1aa3a0",
  green: "#2b7a3b", emerald: "#147a4f", purple: "#5b2d8e", violet: "#6a3fb0", pink: "#d6457a", orange: "#e0661c", yellow: "#e7b416",
  gold: "#c99a2e", brown: "#6b4226", grey: "#5c5c5c", gray: "#5c5c5c", white: "#f4f1ea", black: "#141414",
};
const WC_PALETTE = { red: "red", crimson: "red", scarlet: "red", blue: "blue", navy: "ocean", teal: "teal", turquoise: "teal", green: "green", emerald: "green", purple: "purple", violet: "purple", lavender: "purple", pink: "pink", orange: "orange", yellow: "autumn", gold: "autumn", rainbow: "rainbow", pastel: "pastel", sunset: "sunset", ocean: "ocean", autumn: "autumn", black: "black", grey: "black", gray: "black" };

const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const SIGN_ALIASES = { scorpius: "scorpio", capricornus: "capricorn", ram: "aries", bull: "taurus", twins: "gemini", crab: "cancer", virgin: "virgo", scales: "libra", archer: "sagittarius", "water bearer": "aquarius", fish: "pisces", "big dipper": "big-dipper", "ursa major": "big-dipper", "little dipper": "little-dipper", "ursa minor": "little-dipper", orion: "orion", cassiopeia: "cassiopeia" };
const FLOWER_IDS = ["rose", "peony", "lotus", "sunflower", "daisy", "lavender"];
const ANIMALS = ["wolf", "lion", "eagle", "fox", "bear", "deer", "owl", "cat", "dove", "swallow", "hummingbird", "butterfly", "bee", "snake", "koi", "dragon", "phoenix", "jellyfish", "whale", "spider"];

// style keyword rules — first match wins (ordered from most to least specific)
const STYLE_RULES = [
  ["trash-polka", /\btrash[\s-]?polka\b/],
  ["neo-traditional", /\bneo[\s-]?trad(itional)?\b|\bneotrad/],
  ["sacred-geometry", /\bsacred geometr|\bflower of life\b|\bseed of life\b|\bmetatron|\bsri[\s-]?yantra|\bmerkaba|\bvesica|\bgolden (spiral|ratio)|\bfibonacci/],
  ["mandala", /\bmandalas?\b/],
  ["ornamental", /\bchandelier|\bsternum|\bfiligree|\bornament(al)?\b|\blace\b|\bunderboob/],
  ["maori", /\bmaori|\bkoru|\bkirituhi|\bta moko|\bmoko\b/],
  ["polynesian", /\bpolynesian|\bsamoan|\bhawaiian|\btongan|\bmarquesan|\btahitian|\bshark teeth|\benata\b|\bhonu\b/],
  ["celtic", /\bceltic|\bknot(work)?\b|\btriquetra|\btrinity knot|\bshield knot|\birish\b/],
  ["tribal", /\btribal\b/],
  ["japanese", /\bjapanese|\birezumi|\bseigaiha|\bgreat wave|\bhokusai|\bukiyo/],
  ["watercolor", /\bwater[\s-]?colou?r|\bsplash|\bpainterly/],
  ["traditional", /\btraditional|\bold[\s-]?school|\bsailor jerry|\bamerican trad|\bflash\b/],
  ["dotwork", /\bdot[\s-]?work|\bstippl|\bdotted\b|\bdot shading|\bdots shading|\bpointillis/],
  ["sketch", /\bsketch|\bhatch|\bpencil|\billustrative|\betching|\bengraving|\bwoodcut|\bpen and ink/],
  ["ignorant", /\bignorant|\bdoodle|\bnaive|\bchildlike|\bscribbl/],
  ["brush", /\bbrush|(^|[^a-z])ens[oō](?![a-z])|\bsumi|\bink stroke|\bzen circle/],
  ["geometric", /\bgeometric|\blow[\s-]?poly|\bpolygon(al)?\b|\bfaceted|\bgeometry\b/],
  ["blackwork", /\bblack[\s-]?work|\bsolid black|\bnegative space|\bblackout|\bheavy black/],
  ["zodiac", /\bzodiac|\bconstellation|\bastrolog|\bhoroscope|\bstar sign|\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces|orion|cassiopeia|big dipper|little dipper)\b/],
  ["compass", /\bcompass|\bwind rose\b|\bnautical star map/],
  ["sun-moon", /\bsun and moon|\bsun & moon|\bmoon and sun|\beclipse|\bcelestial|\bmoon phases?\b|\blunar phases?/],
  ["minimal-symbols", /\bheart ?beat|\bekg\b|\becg\b|\bpulse\b|\blifeline|\bsemi[\s-]?colon|\bpaper plane|\bsunrise|\bsunset\b/],
  ["skull", /\bsugar skull|\bcalavera|\bskull and crossbones|\bcrossbones/],
  ["feather-dreamcatcher", /\bdream ?catcher/],
  ["armband", /\barm ?band|\bbracelet|\banklet|\bwrap[\s-]?around|\bband tattoo|\bcuff\b|\bgreek key|\bmeander|\bbarbed wire/],
  ["minimal-line", /\bone[\s-]line|\bsingle[\s-]line|\bcontinuous[\s-]line|\bminimalist line|\bline[\s-]?art\b|\bminimal line/],
  ["fineline", /\bfine[\s-]?line|\bdelicate|\bthin line|\bsingle needle|\bdainty|\bmicro\b/],
  ["floral", /\bfloral|\bbouquet|\bwreath|\bbotanical|\bflowers\b|\bbloom|\bgarland/],
];
const LETTER_RULES = [
  ["lettering-chicano", /\bchicano|\bcholo|\blowrider|\bold english chicano|\bsign ?painter/],
  ["lettering-gothic", /\bgothic|\bblackletter|\bold english|\bfraktur|\bmedieval/],
  ["lettering-typewriter", /\btypewriter|\btyped\b|\bmonospace|\bcourier|\btypewritten/],
  ["lettering-sans", /\bsans\b|\bblock letters?|\bbold letters|\bcapitals|\ball caps|\bcondensed|\bmodern font/],
  ["lettering-banner", /\bbanner|\bribbon|\bscroll\b/],
  ["lettering-script", /\bscript|\bcursive|\bcalligraph|\bhandwrit|\bsignature|\belegant/],
];

function extractText(raw) {
  const q = /["“”«»]([^"“”«»]{1,80})["“”«»]/.exec(raw) || /(?:^|\s)'([^']{1,80})'(?:\s|$|[.,!?])/.exec(raw);
  if (q) return q[1].trim();
  const pats = [
    /\b(?:that|which)?\s*(?:says|say|saying|reads|reading|spells|spelling|with the (?:words?|text|name)|with text|text|words?|quote)\s*:?\s+(.{1,60}?)(?:\s+(?:in|on|with|using|as|inside|under|above|over|around)\s|[.,;!?]|$)/i,
    /\b(?:named|name is|name|called)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ'’-]*(?:\s+(?:and|&)\s+[A-Za-zÀ-ÿ][\wÀ-ÿ'’-]*)?)/i,
    /\b(?:date|year)\s+([\d./-]{2,12})/i,
  ];
  for (const p of pats) {
    const m = p.exec(raw);
    if (m && m[1]) {
      let v = m[1].trim().replace(/^(?:a|an|the)\s+/i, "");
      if (/^(script|gothic|cursive|banner|bold|font|style|letters?)$/i.test(v)) continue;
      return v;
    }
  }
  return null;
}

function findSubject(t, SUBJECT_SYNONYMS) {
  let best = null, bestLen = 0, bestPos = Infinity;
  for (const [id, syns] of Object.entries(SUBJECT_SYNONYMS)) {
    for (const s of syns) {
      if (!s || s.length < 2) continue;
      const re = new RegExp(`(^|[^a-z])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^a-z]|$)`);
      const m = re.exec(t);
      if (m && (s.length > bestLen || (s.length === bestLen && m.index < bestPos))) { best = id; bestLen = s.length; bestPos = m.index; }
    }
  }
  return best;
}
function allSubjects(t, SUBJECT_SYNONYMS) {
  const found = [];
  for (const [id, syns] of Object.entries(SUBJECT_SYNONYMS)) for (const s of syns) {
    if (!s || s.length < 3) continue;
    const re = new RegExp(`(^|[^a-z])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^a-z]|$)`);
    const m = re.exec(t);
    if (m) { found.push({ id, pos: m.index }); break; }
  }
  return found.sort((a, b) => a.pos - b.pos).map((f) => f.id);
}
const numBefore = (t, words) => { const m = new RegExp(`(\\d{1,3})[\\s-]*(?:${words})`).exec(t); return m ? parseInt(m[1], 10) : null; };
const WORDNUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16, twenty: 20 };

export function designFromPrompt(text, seed, { STYLES, MAP, SUBJECTS, SUBJECT_SYNONYMS }) {
  const raw = String(text ?? "").trim();
  let t = " " + raw.toLowerCase().replace(/[’']/g, "'") + " ";
  for (const [w, n] of Object.entries(WORDNUM)) t = t.replace(new RegExp(`\\b${w}\\b`, "g"), String(n));
  const sd = seed ?? ((hashSeed(raw) % 9973) + 1);
  const opts = { seed: sd };
  const has = (re) => re.test(t);

  let words = extractText(raw);
  if (!words && /\b(lettering|letters|font|written|writing|calligraphy|script|cursive|gothic|blackletter|chicano|typewriter|sans|banner)\b/i.test(raw)) {
    const STOP = new Set("a an the in on with of and or for to my his her their our your style styled lettering letters letter font written writing calligraphy script cursive gothic blackletter old english chicano typewriter typed sans bold block banner ribbon scroll tattoo design text word words name arched arc curved straight wavy small big large simple fine elegant pretty nice cool please make me i want would like".split(" "));
    const left = raw.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase().replace(/[^a-zà-ÿ]/g, "")));
    if (left.length) words = left.join(" ").replace(/[.,;:!?]+$/, "");
  }
  const subjectList = allSubjects(t.replace(/["“”].*?["“”]/g, " "), SUBJECT_SYNONYMS);
  let subject = findSubject(t.replace(/["“”].*?["“”]/g, " "), SUBJECT_SYNONYMS);
  const colorWord = Object.keys(INK_COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  const wcWord = Object.keys(WC_PALETTE).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  const simple = has(/\b(simple|small|tiny|minimal|minimalist|clean|subtle|little|dainty)\b/);
  const detailed = has(/\b(detailed|intricate|complex|elaborate|ornate|busy|large|big|full)\b/);
  const bold = has(/\b(bold|thick|heavy|chunky)\b/), thin = has(/\b(thin|fine|delicate|light)\b/);

  // ---- choose style
  let styleId = null;
  const wantsLettering = !!words && has(/\b(name|names|says|say|saying|reads|text|word|words|quote|letter|lettering|font|script|cursive|calligraphy|typewriter|gothic|initials?)\b|["“]/);
  for (const [id, re] of STYLE_RULES) if (re.test(t)) { styleId = id; break; }
  if (wantsLettering && (!styleId || ["fineline", "minimal-line", "floral"].includes(styleId)) && !(styleId === "traditional")) {
    styleId = "lettering-script";
    for (const [id, re] of LETTER_RULES) if (re.test(t)) { styleId = id; break; }
  }
  if (!styleId) {
    for (const [id, re] of LETTER_RULES) if (re.test(t) && words) { styleId = id; break; }
  }
  if (!styleId && has(/\bskull/)) styleId = "skull";
  if (!styleId && has(/\b(feather|feathers)\b/)) styleId = "feather-dreamcatcher";
  if (!styleId && has(/\b(moon phases|heartbeat|infinity|semicolon|waves?|mountains?|arrow)\b/) && (simple || has(/\bminimal|\bsymbol|\bline\b/))) styleId = "minimal-symbols";
  if (!styleId && has(/\b(armband|band)\b/)) styleId = "armband";
  if (!styleId && subject && ANIMALS.includes(subject)) styleId = "animals";
  if (!styleId && subject && FLOWER_IDS.includes(subject)) styleId = "floral";
  if (!styleId && has(/\b(minimal|minimalist|simple|tiny|small)\b/)) styleId = subject ? "fineline" : "minimal-symbols";
  if (!styleId) styleId = subject ? "fineline" : words ? "lettering-script" : "mandala";
  const style = MAP[styleId];
  const optKeys = new Set(style.options.map((o) => o.key));
  const choiceOf = (key, v) => { const o = style.options.find((x) => x.key === key); return o?.choices?.some((c) => c.value === v) ? v : undefined; };
  const set = (k, v) => { if (v !== undefined && v !== null && optKeys.has(k)) { if (style.options.find((o) => o.key === k)?.type === "select") { const c = choiceOf(k, v); if (c !== undefined) opts[k] = c; } else opts[k] = v; } };

  // ---- generic options
  if (subject) set("subject", subject);
  if (colorWord && optKeys.has("color") && !["traditional", "neo-traditional"].includes(styleId) && !(styleId === "watercolor")) set("color", INK_COLORS[colorWord]);
  if (styleId === "trash-polka" && colorWord && colorWord !== "black") set("color", INK_COLORS[colorWord]);
  const wOpt = style.options.find((o) => o.key === "weight");
  if (wOpt && (bold || thin)) set("weight", +(wOpt.default * (bold ? 1.6 : 0.6)).toFixed(1));
  const anyNum = (() => { const m = /\b(\d{1,3})\b/.exec(t); return m ? parseInt(m[1], 10) : null; })();

  // ---- style specifics
  switch (styleId) {
    case "mandala": {
      const p = numBefore(t, "petals?|points?|fold|sided|symmetry|segments?|rays?") ?? null;
      if (p) set("petals", Math.max(6, Math.min(24, p)));
      const l = numBefore(t, "layers?|rings?|levels?"); if (l) set("layers", Math.max(2, Math.min(9, l)));
      else if (simple) set("layers", 3); else if (detailed) set("layers", 7);
      if (has(/\bdot/)) set("fill", "dotwork"); else if (has(/\b(bold|black|solid|blackwork)\b/)) set("fill", "bold"); else if (has(/\b(line|outline|simple|fine)\b/)) set("fill", "line");
      if (has(/\bhalf\b/)) set("form", "half"); else if (has(/\b(drop|hanging|chandelier|dangling)\b/)) set("form", "drop");
      if (has(/\b(colou?r|colorful|red|teal|jewel)\b/)) set("ink", "color");
      if (has(/\blotus\b/)) set("center", "flower"); else if (has(/\bstar\b/)) set("center", "star");
      set("detail", simple ? 1 : detailed ? 3 : 2);
      break;
    }
    case "sacred-geometry": {
      const map = [["flower-of-life", /flower of life/], ["seed-of-life", /seed of life/], ["metatron", /metatron/], ["sri-yantra", /yantra/], ["merkaba", /merkaba|star tetra/], ["vesica", /vesica/], ["golden-spiral", /golden|fibonacci/]];
      for (const [v, re] of map) if (re.test(t)) { set("pattern", v); break; }
      const r = numBefore(t, "rings?"); if (r) set("rings", Math.max(1, Math.min(4, r)));
      break;
    }
    case "ornamental": set("form", has(/sternum|underboob/) ? "sternum" : has(/lace|band/) ? "lace-band" : has(/frame|scroll/) ? "scroll-frame" : "chandelier"); if (has(/colou?r/)) set("ink", "color"); break;
    case "polynesian": set("form", has(/\b(circle|circular|round|shoulder|sun)\b/) ? "circle" : has(/sleeve/) ? "half-sleeve-band" : "armband"); if (has(/turtle|honu/)) set("turtle", true); break;
    case "maori": set("form", has(/\b(band|armband)\b/) ? "band" : has(/\b(fern|cluster|frond)\b/) ? "cluster" : "circle"); break;
    case "tribal": set("form", has(/\b(arm ?band|band)\b/) ? "armband" : has(/\bsun\b/) ? "sun" : has(/\b(flame|fire)\b/) ? "flame" : has(/\bwings?\b/) ? "wings" : "centerpiece"); break;
    case "celtic": {
      const map = [["triquetra", /triquetra|trinity knot(?! .*circle)/], ["trinity", /trinity|triquetra.*circle|circle.*triquetra/], ["shield", /shield/], ["quaternary", /quaternary|four|4[\s-]?(fold|loop)/], ["border", /border|band|armband/], ["ring", /ring|circle|circular/], ["panel", /panel|square/]];
      for (const [v, re] of map) if (re.test(t)) { set("form", v); break; }
      if (has(/\b(solid|black|bold)\b/)) set("mode", "solid");
      break;
    }
    case "japanese": set("scene", has(/\bkoi\b/) ? "koi-waves" : has(/\bclouds?\b/) && !has(/\bwaves?\b/) ? "clouds" : has(/seigaiha|scales?\b|pattern/) ? "seigaiha" : has(/\bcircle|round/) ? "wave-circle" : "great-wave"); if (has(/\b(black|grey|gray)\b/)) set("ink", "black"); break;
    case "watercolor": if (wcWord) set("colors", WC_PALETTE[wcWord]); if (has(/\bbold\b/)) set("lines", "bold"); if (has(/\bno (lines|outline)/)) set("lines", "none"); break;
    case "traditional": case "neo-traditional": {
      if (words || has(/\b(banner|ribbon)\b/)) { set("banner", true); if (words) set("text", styleId === "traditional" ? words.toUpperCase() : words); }
      const subs = subjectList.filter((s) => s !== subject);
      if (styleId === "traditional") {
        if (subs.includes("dagger") || (has(/\bdagger|knife/) && subject !== "dagger")) set("combo", "dagger");
        else if (subs.includes("rose") && subject !== "rose") set("combo", "roses");
        else if (has(/\b(flames?|fire|burning)\b/) && subject !== "flame") set("combo", "flames");
        else if (has(/\bswallows\b/) && subject !== "swallow") set("combo", "swallows");
      } else {
        if (has(/\boval\b/)) set("frame", "oval"); else if (has(/\bcircle\b/)) set("frame", "circle"); else if (has(/\bno frame\b/)) set("frame", "none");
        if (has(/\bpeon/)) set("flowers", "peonies"); else if (has(/\bdais/)) set("flowers", "daisies");
      }
      if (has(/\bmuted|vintage|faded\b/)) set("palette", "muted");
      break;
    }
    case "dotwork": if (has(/\bmoon\b/) && subject !== "moon") set("backdrop", "moon"); else if (has(/\bcircle\b/)) set("backdrop", "circle"); else if (has(/\btriangle\b/)) set("backdrop", "triangle"); if (detailed) set("density", 1.4); if (simple) set("density", 0.7); break;
    case "blackwork": if (has(/\bsilhouette\b/)) set("mode", "silhouette"); for (const sh of ["circle", "diamond", "hexagon", "arch", "square"]) if (t.includes(sh)) { set("shape", sh); break; } if (has(/stripe/)) set("pattern", "stripes"); break;
    case "geometric": for (const fr of ["circle", "hexagon", "triangle", "diamond"]) if (t.includes(fr)) { set("frame", fr); break; } if (has(/\bhalf\b|\bsplit\b/)) set("split", true); if (detailed) set("facets", 4); if (simple) set("facets", 2); if (has(/\bdot/)) set("shading", "dots"); break;
    case "sketch": if (detailed) set("layers", 4); if (simple) set("layers", 2); break;
    case "trash-polka": if (words) set("text", words.toUpperCase()); break;
    case "ignorant": {
      const dood = ["smiley", "ghost", "flower", "snake", "heart", "house", "sun", "alien", "lightning"].find((d) => t.includes(d));
      if (dood) set("subject", "doodle-" + dood); else if (subject) set("subject", subject);
      if (words) set("text", words);
      break;
    }
    case "animals": {
      if (!subject || !ANIMALS.includes(subject)) set("subject", "wolf");
      if (has(/geometric|low[\s-]?poly/)) set("render", "geometric"); else if (has(/silhouette|solid|black/)) set("render", "silhouette"); else if (has(/dot/)) set("render", "dotwork"); else if (has(/sketch|hatch/)) set("render", "hatch"); else if (has(/colou?r|traditional/)) set("render", "color");
      for (const fr of ["circle", "triangle", "diamond", "hexagon"]) if (t.includes(fr)) { set("frame", fr); break; }
      break;
    }
    case "skull": set("variant", has(/sugar|calavera|dia de|day of the dead/) ? "sugar" : has(/rose/) ? "roses" : has(/crossbones|bones/) ? "crossbones" : has(/dagger|knife|sword/) ? "dagger" : has(/geometric/) ? "geometric" : "classic"); if (has(/\bdot/)) set("ink", "dotwork"); else if (has(/\b(line|outline|fine)\b/)) set("ink", "line"); else if (has(/\b(black|solid|silhouette)\b/)) set("ink", "solid"); else if (has(/sugar|colou?r|traditional/)) set("ink", "color"); else set("ink", "line"); break;
    case "floral": {
      const fl = subjectList.filter((s) => FLOWER_IDS.includes(s));
      set("flower", fl.length > 1 ? "mixed" : fl[0] || (has(/flowers/) ? "mixed" : undefined));
      set("arrangement", has(/bouquet/) ? "bouquet" : has(/wreath|ring|circle/) ? "wreath" : has(/crescent|half moon|arc/) ? "crescent" : has(/branch|sprig/) ? "branch" : has(/vine|band|garland/) ? "vine" : has(/single|one|stem/) ? "single" : undefined);
      if (has(/watercolou?r/)) set("ink", "watercolor"); else if (has(/\bdot/)) set("ink", "dotwork"); else if (has(/sketch|hatch/)) set("ink", "hatch"); else if (has(/colou?r|red|pink|traditional/)) set("ink", "color");
      break;
    }
    case "feather-dreamcatcher": set("variant", has(/dream ?catcher/) ? "dreamcatcher" : has(/bird/) ? "feather-birds" : has(/arrow/) ? "arrow-feather" : has(/\b(3|three) feathers|feathers\b/) ? "three-feathers" : "feather"); if (has(/watercolou?r/)) set("ink", "watercolor"); else if (has(/\bdot/)) set("ink", "dotwork"); else if (has(/colou?r/)) set("ink", "color"); if (wcWord) set("colors", WC_PALETTE[wcWord]); break;
    case "compass": { const p = numBefore(t, "points?|pointed"); if (p) set("points", String(p >= 16 ? 16 : p >= 8 ? 8 : 4)); set("style", has(/globe|world|map/) ? "globe" : has(/ornate|vintage|detailed/) ? "ornate" : simple ? "minimal" : undefined); if (has(/\bmap\b/)) set("map", true); if (simple) set("letters", false); break; }
    case "sun-moon": set("variant", has(/eclipse/) ? "eclipse" : has(/phases?/) ? "phases" : has(/crescent|stars/) && !has(/\bsun\b/) ? "crescent-stars" : has(/geometric/) ? "geometric-sun" : "sun-moon"); break;
    case "zodiac": {
      let sign = SIGNS.find((s) => new RegExp(`\\b${s}\\b`).test(t));
      if (!sign) for (const [k, v] of Object.entries(SIGN_ALIASES)) if (new RegExp(`\\b${k}\\b`).test(t)) { sign = v; break; }
      if (sign) set("sign", sign);
      if (has(/constellation/) && !has(/symbol|glyph/)) set("show", "constellation"); else if (has(/symbol|glyph/) && !has(/constellation/)) set("show", "glyph");
      if (has(/\bmoon\b/)) set("frame", "moon"); else if (has(/no frame|frameless/)) set("frame", "none");
      break;
    }
    case "minimal-symbols": {
      const map = [["heartbeat", /heart ?beat|ekg|ecg|pulse|lifeline/], ["moon-phases", /moon phases?|lunar/], ["semicolon", /semi[\s-]?colon/], ["infinity", /infinity|infinite/], ["paper-plane", /paper plane|airplane/], ["sunrise", /sunrise|sunset|horizon/], ["mountain-circle", /mountains?.*circle|circle.*mountains?/], ["mountains", /mountains?/], ["wave-circle", /waves?.*circle|circle.*waves?/], ["waves", /waves?|ocean|sea/], ["arrow", /arrow/], ["lotus-line", /lotus/]];
      for (const [v, re] of map) if (re.test(t)) { set("symbol", v); break; }
      if (has(/\bheart\b/) && opts.symbol === "heartbeat") set("accent", true);
      break;
    }
    case "brush": set("shape", has(/heart/) ? "heart" : has(/\bx\b|cross/) ? "cross" : has(/wave/) ? "wave" : has(/strokes?|lines?/) ? "strokes" : "enso"); if (has(/no (seal|stamp)/)) set("seal", false); break;
    case "armband": {
      const map = [["meander", /greek|meander|key/], ["barbed", /barbed|wire/], ["chain", /chain/], ["teeth", /teeth|triangles?|shark/], ["waves", /waves?|ocean/], ["vine", /vine|leaf|leaves|ivy/], ["dots", /dots/], ["zigzag", /zig ?zag/], ["checker", /checker/], ["running", /spiral|scroll/], ["mountains", /mountain/], ["stripe", /solid|black band|thick line/], ["lines", /lines/]];
      for (const [v, re] of map) if (re.test(t)) { set("pattern", v); break; }
      if (has(/\b(thin|fine|narrow)\b/)) set("height", 0.12); if (has(/\b(thick|wide|bold)\b/)) set("height", 0.3);
      break;
    }
    default: break;
  }
  // lettering
  if (style.category === "Lettering") {
    set("text", words || (subject ? subject[0].toUpperCase() + subject.slice(1) : style.options.find((o) => o.key === "text").default));
    if (has(/\b(arc|arched|curved|curve|arch)\b/)) set("layout", "arc"); else if (has(/\b(smile|curved down|arc down)\b/)) set("layout", "arc-down"); else if (has(/\bwav(e|y)\b/)) set("layout", "wave"); else if (has(/\bstraight\b/)) set("layout", "straight");
    if (has(/\bribbon|banner\b/)) set("banner", "ribbon"); else if (has(/\bscroll\b/)) set("banner", "scroll");
    if (has(/\bhearts?\b/)) set("flourish", "hearts"); else if (has(/\bstars?\b/)) set("flourish", "stars"); else if (has(/\bswash|flourish|swirl/)) set("flourish", "swash");
    if (has(/\bshadow|3d\b/)) set("effect", "shadow"); if (has(/\boutline/)) set("effect", opts.effect === "shadow" ? "outline-shadow" : "outline");
    if (has(/\b(caps|capital|uppercase|all caps)\b/)) set("uppercase", true);
    if (has(/\b(colou?r|traditional|red)\b/) && styleId === "lettering-banner") set("colors", "traditional");
    if (styleId === "lettering-script" && has(/\bbold\b/)) set("font", "scriptBold");
    if (styleId === "lettering-script" && has(/\bbrush\b/)) set("font", "brush");
    if (styleId === "lettering-chicano" && has(/\bscript|cursive|signpainter\b/)) set("font", "signpainter");
    if (colorWord && colorWord !== "black") set("color", INK_COLORS[colorWord]);
  }
  return { styleId, opts };
}

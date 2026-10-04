// Design vocabulary for the local assistant: which words name a tattoo subject or a
// style, close substitutes for subjects the built-in generators don't have, and a
// small typo corrector for casual / voice input.

// Subject id → words people use for it. Mirrors the design library (js/designs/library.js);
// app.listSubjects() is merged in at runtime so new motifs are picked up automatically.
export const SUBJECT_WORDS = {
  rose: ["rose", "roses"], peony: ["peony", "peonies", "carnation"], lotus: ["lotus", "lotus flower", "water lily", "waterlily"],
  sunflower: ["sunflower", "sunflowers"], daisy: ["daisy", "daisies", "chamomile"], lavender: ["lavender", "sprig"],
  leaf: ["leaf", "leaves", "foliage", "fern"], vine: ["vine", "vines", "ivy"], laurel: ["laurel", "laurels", "laurel wreath", "olive branch"],
  tree: ["tree", "trees", "tree of life", "oak"], cactus: ["cactus", "cacti", "succulent"], cherry: ["cherry", "cherries"],
  mushroom: ["mushroom", "mushrooms", "toadstool", "shroom", "fungi"], heart: ["heart", "hearts"], sacredheart: ["sacred heart", "flaming heart"],
  star: ["star", "stars", "nautical star"], anchor: ["anchor", "anchors"], ship: ["ship", "boat", "galleon", "pirate ship", "sailboat", "sailing ship"],
  dagger: ["dagger", "knife", "sword", "blade"], swords: ["crossed swords", "crossed daggers", "swords"], skull: ["skull", "skulls", "skeleton", "calavera"],
  snake: ["snake", "snakes", "serpent", "cobra", "viper", "python"], moon: ["moon", "crescent", "crescent moon", "moons"], sun: ["sun", "suns", "sunshine"],
  planet: ["planet", "planets", "saturn"], butterfly: ["butterfly", "butterflies", "moth"], bee: ["bee", "bees", "honeybee", "bumblebee"],
  spider: ["spider", "spiders"], web: ["spider web", "spiderweb", "cobweb", "web"], feather: ["feather", "feathers", "quill", "plume"],
  arrow: ["arrow", "arrows"], eye: ["eye", "eyes", "all seeing eye", "third eye", "eye of providence"], hand: ["hamsa", "hamsa hand", "hand of fatima"],
  wolf: ["wolf", "wolves", "husky", "dog"], lion: ["lion", "lions", "lioness"], eagle: ["eagle", "eagles", "hawk", "falcon"], fox: ["fox", "foxes", "kitsune"],
  bear: ["bear", "bears", "grizzly"], deer: ["deer", "stag", "elk", "antlers", "reindeer"], owl: ["owl", "owls"], cat: ["cat", "cats", "kitten", "kitty", "black cat"],
  dove: ["dove", "doves"], swallow: ["swallow", "swallows", "sparrow", "sparrows", "bird", "birds"], hummingbird: ["hummingbird", "humming bird", "colibri"],
  koi: ["koi", "koi fish", "carp", "fish"], dragon: ["dragon", "dragons", "wyvern"], phoenix: ["phoenix", "firebird"], jellyfish: ["jellyfish", "jelly fish"],
  whale: ["whale", "whales", "whale tail", "orca"], mountain: ["mountain", "mountains", "peaks", "mountain range"], wave: ["wave", "waves", "ocean wave"],
  compass: ["compass", "compass rose", "wind rose"], crown: ["crown", "crowns", "tiara"], key: ["key", "keys", "skeleton key"],
  hourglass: ["hourglass", "sand clock"], clock: ["clock", "pocket watch", "watch"], diamond: ["diamond", "diamonds", "gem", "jewel", "crystal"],
  flame: ["flame", "flames", "fire"], candle: ["candle", "candles"], lightning: ["lightning", "lightning bolt", "bolt", "thunderbolt"],
  infinity: ["infinity", "infinity sign", "infinity symbol"], cross: ["cross", "crucifix"], dreamcatcher: ["dreamcatcher", "dream catcher"],
  paperplane: ["paper plane", "paper airplane", "paperplane"], semicolon: ["semicolon", "semi colon", "semi-colon"], music: ["music note", "musical note", "music notes", "music", "treble clef"],
};

// Things people ask for that the generators don't draw: closest built-in subject.
export const SUBSTITUTES = {
  tiger: "lion", panther: "cat", leopard: "cat", jaguar: "cat", cheetah: "cat", puma: "cat", lynx: "cat",
  raven: "eagle", crow: "eagle", vulture: "eagle", bat: "eagle", parrot: "hummingbird", flamingo: "hummingbird", robin: "swallow", hen: "swallow",
  shark: "whale", dolphin: "whale", octopus: "jellyfish", squid: "jellyfish", turtle: "whale", seahorse: "koi", goldfish: "koi",
  scorpion: "spider", dragonfly: "butterfly", ladybug: "bee", beetle: "bee", horse: "deer", unicorn: "deer", rabbit: "fox", bunny: "fox", hare: "fox",
  lizard: "snake", gecko: "snake", frog: "koi", tulip: "peony", lily: "lotus", orchid: "lotus", poppy: "rose", cherry_blossom: "peony", "cherry blossom": "peony", sakura: "peony",
  palm: "tree", "palm tree": "tree", pine: "tree", bonsai: "tree", gun: "dagger", pistol: "dagger", axe: "dagger", rosary: "cross", angel: "dove", wings: "feather",
  planet_earth: "planet", earth: "planet", galaxy: "planet", rocket: "planet", star_wars: "planet", note: "music", guitar: "music", headphones: "music",
};

// Style keywords (mirror of the generator's own rules, used to recognize a design request).
export const STYLE_WORDS = /\b(?:trash[\s-]?polka|neo[\s-]?trad(?:itional)?|sacred geometr\w*|flower of life|seed of life|metatron\w*|sri[\s-]?yantra|merkaba|golden (?:spiral|ratio)|fibonacci|mandalas?|ornamental|ornament|chandelier|filigree|lace|maori|koru|polynesian|samoan|hawaiian|tongan|marquesan|celtic|knot ?work|triquetra|trinity knot|tribal|japanese|irezumi|great wave|seigaiha|water[\s-]?colou?r|traditional|old[\s-]?school|sailor jerry|american trad\w*|dot[\s-]?work|stipple\w*|dotted|sketch\w*|hatch(?:ing|ed)?|pencil|illustrative|etching|engraving|woodcut|ignorant|doodle|childlike|naive|brush ?stroke|brush|ens[oō]|sumi|geometric|low[\s-]?poly|polygonal|faceted|black[\s-]?work|solid black|negative space|blackout|zodiac|constellation|astrolog\w*|horoscope|star sign|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces|orion|cassiopeia|big dipper|little dipper|sun and moon|sun & moon|moon and sun|eclipse|celestial|moon phases?|lunar phases?|heart ?beat|ekg|ecg|lifeline|sunrise|sunset|sugar skull|calavera|crossbones|arm ?band|bracelet|anklet|wrap[\s-]?around|band|cuff|greek key|meander|barbed wire|one[\s-]line|single[\s-]line|continuous[\s-]line|line[\s-]?art|line drawing|fine[\s-]?line|single needle|micro|floral|flowers?|bouquet|wreath|botanical|bloom|garland|minimal(?:ist)?|abstract|realistic|realism|portrait)\b/;

// Lettering style per keyword (first match wins).
export const LETTER_STYLES = [
  ["lettering-chicano", /\b(?:chicano|cholo|lowrider|sign ?painter)\b/],
  ["lettering-gothic", /\b(?:gothic|blackletter|black letter|old english|fraktur|medieval)\b/],
  ["lettering-typewriter", /\b(?:typewriter|typed|typewritten|monospace|courier)\b/],
  ["lettering-sans", /\b(?:sans|block letters?|block|bold letters|capitals|all caps|capital letters|condensed|modern font)\b/],
  ["lettering-banner", /\b(?:banner|ribbon|scroll)\b/],
  ["lettering-script", /\b(?:script|cursive|calligraph\w*|handwrit\w*|signature|elegant)\b/],
];

/* ───────────────────────── typo correction ───────────────────────── */

// Hand-picked fixes for very common short slips / chat spellings.
const FIXES = {
  abit: "a bit", alil: "a little", lil: "little", "a lil": "a little", bit: "bit", u: "you", ur: "your", pls: "please", plz: "please", thx: "thanks",
  bak: "back", lft: "left", lef: "left", rite: "right", rgt: "right", rght: "right", rigth: "right", rihgt: "right", rigt: "right", riht: "right",
  sholder: "shoulder", shoulda: "shoulder", sholdier: "shoulder", forarm: "forearm", foreram: "forearm", wirst: "wrist", wrsit: "wrist", ankel: "ankle",
  thig: "thigh", theigh: "thigh", calve: "calf", nek: "neck", chesst: "chest", bicept: "bicep", tricept: "tricep", ribcage: "ribcage",
  thier: "their", teh: "the", hte: "the", adn: "and", nad: "and", tatoo: "tattoo", tatto: "tattoo", tattooo: "tattoo", tattoe: "tattoo", tatt: "tattoo", tat: "tattoo",
  bigr: "bigger", biger: "bigger", bigegr: "bigger", smaler: "smaller", samller: "smaller", smallr: "smaller", higer: "higher", hihger: "higher", lowr: "lower",
  degres: "degrees", degress: "degrees", dgrees: "degrees", degree: "degrees", roate: "rotate", rotat: "rotate", rotaet: "rotate", roatate: "rotate",
  colour: "colour", blk: "black", blck: "black", balck: "black", blakc: "black", grey: "grey", gray: "gray", purpel: "purple", purpl: "purple",
  remvoe: "remove", remoev: "remove", remov: "remove", delet: "delete", dleete: "delete", undoo: "undo", redoo: "redo",
  donw: "down", dwon: "down", dow: "down", uo: "up", mvoe: "move", moev: "move", mve: "move",
  mandela: "mandala", mandla: "mandala", watercolour: "watercolor", watercolr: "watercolor", geometirc: "geometric", geomtric: "geometric",
  tradtional: "traditional", traditonal: "traditional", trad: "traditional", dragn: "dragon", dragon: "dragon", draon: "dragon", skul: "skull", skll: "skull",
  butterfy: "butterfly", butterly: "butterfly", butterflie: "butterfly", wolfe: "wolf", wofl: "wolf", phenix: "phoenix", pheonix: "phoenix", roze: "rose",
  semicolen: "semicolon", semi: "semi", hummingbrd: "hummingbird", hummnigbird: "hummingbird", lettring: "lettering", leterring: "lettering",
};

// Words worth correcting toward (long enough to be unambiguous).
const TARGETS = [
  // body
  "forearm", "forearms", "wrist", "wrists", "shoulder", "shoulders", "chest", "ankle", "ankles", "calf", "calves", "thigh", "thighs", "neck", "ribs",
  "spine", "stomach", "belly", "hip", "hips", "knee", "knees", "elbow", "elbows", "finger", "fingers", "thumb", "hand", "hands", "palm", "foot",
  "collarbone", "bicep", "biceps", "tricep", "triceps", "sternum", "shin", "shins", "behind", "inner", "outer", "inside", "outside", "left", "right",
  "back", "upper", "lower", "blade", "blades", "buttock", "glute", "knuckles", "forehead",
  // verbs & modifiers
  "rotate", "remove", "delete", "move", "bigger", "smaller", "larger", "higher", "lower", "darker", "lighter", "black", "colour", "color",
  "degrees", "mirror", "flip", "stencil", "faded", "healed", "undo", "redo", "tattoo", "design", "please", "little", "slightly", "bottom",
  "straighten", "opacity", "transparent", "female", "male", "taller", "shorter", "skinnier", "muscular", "instead", "another", "variation",
  "purple", "yellow", "orange", "green", "blue", "pink", "white", "brown", "silver", "golden", "turquoise",
  // styles
  "watercolor", "geometric", "traditional", "mandala", "dotwork", "blackwork", "tribal", "polynesian", "celtic", "japanese", "sketch",
  "lettering", "minimalist", "minimal", "fineline", "ornamental", "floral", "botanical", "constellation", "zodiac", "armband", "script", "gothic",
];

// Common words that must never be "corrected".
const COMMON = new Set(("a an the and or but so to of on in at by for with from into onto over under up down out off it its it's this that these those them they " +
  "my your his her our their me you he she we i im i'm is are was were be been am do does did done make made makes making move moves put puts get got " +
  "want wanna need like love lots more less much many very just also too then than now here there where what when which who why how can could would " +
  "should will shall may might must have has had give gives take takes look looks looking see show shows let lets let's try add adds new old other same " +
  "one two three some any all every each both few bit tad lot bit top side sides tip lip lips hair head heads face ear ears eye eyes nose arm arms leg legs " +
  "toe toes rib cap mom dad son kid kids name word words text say says said call called mean last next first second hold mold fold bold gold cold old " +
  "dead deal heal held hell help here hide wide wise wine line lines fine nine mine pine dine time tile tide ride rice nice dice mice " +
  "bake bark park part pack sack rack race face fact back black block clock click flick flip slip ship shop stop step stem star start stars " +
  "hip hips lips tips rips dips ships chips cheek chin shin skin shine spin spine sine wing wings ring rings king sing thing things think thin " +
  "calm calf half palm balm farm warm worm form from fore forum four pour hour sour your tour " +
  "rose nose hose pose lose lost most post host cost best rest test west nest " +
  "wrist list mist fist gist twist " +
  "high higher sigh nigh thigh light right fight might night sight tight bright " +
  "blade blame flame frame shame same game came name lame " +
  "bigger bagger digger jigger " +
  "small smell spell shell sell tell well bell dell cell hell " +
  "lower power tower mower flower slower " +
  "moon mood food good wood hood " +
  "elbow below bellow fellow yellow mellow " +
  "neck deck peck check " +
  "chest chess guest quest crest " +
  "knee keen kneel " +
  "back pack sack rack tack hack lack jack " +
  "darker barker parker marker " +
  "maria mario emma ohana mama papa nana familia lift angle write wrote white knew tattoos designs variations colors colours degrees " +
  "band hand land sand wand bend kind mind find wind hint mint pint print paint saint faint " +
  "sketchy lines curves dots stars notes words layers rings petals points sides lighting lights lightning daylight sighting " +
  "inches inch theme mode spinning spin background floor shadows shadow " +
  "font fonts style styles text size sizes angle shade shading petal petals detail details layer layers frame border thorns thorn leaves leaf " +
  "curve swirl banner ribbon scroll arc arched wavy caps flourish outline sparkle sparkles splatter fade older newer version copy mirror " +
  "view zoom front stencil opacity body model tone pale woman man slimmer muscle closer farther further toward towards away center centre middle edge " +
  "wing wings star moon moth math path bath boat coat goat fork folk lord ford food foot fool pool tool cool soul sole").split(/\s+/));
const KNOWN = new Set();
/** Words that are real vocabulary (subjects, regions, colors…): never corrected. */
export function addKnownWords(words) { for (const w of words) if (w) KNOWN.add(String(w).toLowerCase()); }

function editDistance1(a, b) {
  // true when a → b by one insertion, deletion, substitution or adjacent transposition
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    const diff = [];
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; j++;
  }
  return true;
}

let extraTargets = [];
/** Add vocabulary (e.g. subject names from the app) that typos may be corrected toward. */
export function addTypoTargets(words) {
  extraTargets = [...new Set(words.filter((w) => /^[a-z]{5,}$/.test(w)))];
}

/** Fix obvious misspellings in lower-cased text. Leaves quoted placeholders (qq0qq) alone. */
export function fixTypos(text, skip = null) {
  return text.replace(/[a-z']+/g, (w) => {
    if (/^qq\d+qq$/.test(w) || (skip && skip.has(w))) return w;
    if (FIXES[w] != null) return FIXES[w];
    if (w.length < 4 || COMMON.has(w) || KNOWN.has(w)) return w;
    const all = [...TARGETS, ...extraTargets];
    if (all.includes(w)) return w;
    // Only correct when exactly one target is one edit away and shares the first letter (or is a transposition at the start).
    const hits = all.filter((t) => t.length >= 4 && editDistance1(w, t) && (t[0] === w[0] || (t[1] === w[0] && t[0] === w[1])));
    const uniq = [...new Set(hits)];
    return uniq.length === 1 ? uniq[0] : w;
  });
}

// Style vocabulary and every motif word are real words too.
addKnownWords(STYLE_WORDS.source.replace(/\\[bsw]/g, " ").split(/[^a-z]+/).filter((w) => w.length >= 4));
addKnownWords(Object.values(SUBJECT_WORDS).flat().flatMap((w) => w.split(" ")));
addKnownWords(Object.keys(SUBSTITUTES).flatMap((w) => w.split(/[_ ]/)));
addKnownWords(LETTER_STYLES.flatMap(([, re]) => re.source.replace(/\\[bsw]/g, " ").split(/[^a-z]+/)).filter((w) => w.length >= 4));

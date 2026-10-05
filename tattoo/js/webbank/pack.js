// Web library — built-in offline pack: the game-icons.net drawings
// (CC BY 3.0 / CC0, credited per author), lazy-loaded from
// vendor/webbank/game-icons.json, with tattoo-friendly categories and a
// synonym-aware search.

const PACK_URL = new URL("../../vendor/webbank/game-icons.json", import.meta.url).href;
export const PACK_LICENSE_FILE = new URL("../../vendor/webbank/game-icons-license.txt", import.meta.url).href;

const LICENSES = {
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC0": "https://creativecommons.org/publicdomain/zero/1.0/",
};

// ── categories ─────────────────────────────────────────────────────────
// Membership is decided by whole name tokens ("wolf-head" → wolf, head).
const w = (s) => s.split(/\s+/).filter(Boolean);
export const CATEGORIES = [
  { id: "animals", name: "Animals", featured: ["wolf-head", "lion", "eagle-emblem", "snake"],
    words: w(`wolf wolves fox bear lion lioness tiger cat kitten panther leopard jaguar cheetah lynx dog hound puppy horse pony stallion
      mare deer stag elk moose reindeer bull ox cow buffalo bison ram goat sheep lamb boar pig hog rabbit hare bunny squirrel
      hedgehog raccoon otter beaver badger weasel mole rat mouse mice bat elephant mammoth rhino rhinoceros hippo hippopotamus
      giraffe zebra camel llama kangaroo koala panda sloth monkey ape gorilla chimpanzee orangutan lemur
      eagle hawk falcon owl raven crow bird birds swallow sparrow dove pigeon parrot macaw peacock rooster chicken hen chick duck
      goose swan crane heron stork flamingo pelican seagull gull albatross hummingbird kingfisher woodpecker vulture condor
      ostrich penguin kiwi toucan magpie robin cardinal
      snake serpent cobra viper python rattlesnake lizard gecko iguana chameleon turtle tortoise frog toad salamander newt
      crocodile alligator dinosaur velociraptor raptor trex
      fish koi carp shark whale dolphin orca octopus squid jellyfish seahorse crab lobster shrimp starfish salmon tuna piranha
      angler eel ray manta seal walrus narwhal clam oyster snail slug shell
      butterfly moth bee wasp hornet ant ants spider scorpion beetle ladybug dragonfly mantis grasshopper cricket cockroach
      caterpillar worm fly mosquito tick centipede scarab firefly
      paw claw claws fang fangs feather tusk tusks antler antlers horn mane`) },
  { id: "plants", name: "Plants & flowers", featured: ["rose", "lotus-flower", "sunflower", "fern"],
    words: w(`rose roses flower flowers floral lotus tulip daisy sunflower lily orchid petal petals blossom bloom poppy lavender
      dandelion hibiscus daffodil peony carnation iris violet jasmine magnolia marigold chrysanthemum
      clover shamrock leaf leaves vine vines ivy fern moss tree trees oak pine palm willow birch maple cedar cypress bonsai
      sapling sprout seedling seed seeds acorn pinecone branch twig root roots thorn thorny bud bouquet wreath laurel garden
      herb herbs grass wheat bamboo reed cactus succulent aloe mushroom mushrooms toadstool fungus plant plants
      cherry apple pear grapes grape berry berries strawberry lemon orange pumpkin pomegranate olive fig
      forest jungle hedge flytrap carnivorous`) },
  { id: "skulls", name: "Skulls & death", featured: ["skull-crossed-bones", "crowned-skull", "death-skull", "grim-reaper"],
    words: w(`skull skulls skeleton bone bones crossbones death dead reaper grim coffin tombstone tomb grave graveyard gravestone
      ghost zombie undead corpse scythe lich necromancer`) },
  { id: "mythical", name: "Mythical", featured: ["dragon-head", "unicorn", "mermaid", "griffin-symbol"],
    words: w(`dragon dragons wyvern drake phoenix unicorn griffin gryphon pegasus kraken hydra minotaur centaur mermaid siren
      fairy fae demon daemon devil angel vampire werewolf cerberus medusa gorgon cyclops chimera sphinx oni yokai troll goblin
      ogre orc elf dwarf giant wizard witch sorcerer golem basilisk harpy banshee djinn genie leviathan behemoth manticore
      wendigo yeti bigfoot alien monster beast lizardman`) },
  { id: "weapons", name: "Weapons", featured: ["plain-dagger", "katana", "crossed-swords", "battle-axe"],
    words: w(`sword swords dagger daggers knife knives axe axes spear bow arrow arrows crossbow gun pistol revolver rifle shotgun
      mace flail hammer warhammer scythe trident katana saber sabre scimitar blade blades shuriken halberd lance javelin
      sickle kunai whip club morningstar glaive rapier claymore cutlass machete`) },
  { id: "symbols", name: "Symbols", featured: ["all-seeing-eye", "yin-yang", "triquetra", "heart-key"],
    words: w(`heart hearts eye eyes infinity yin yang triskelion triquetra ankh pentagram pentacle rune runes hand hands key keys
      lock crown hourglass clock knot spiral rosary scales balance chain chains dreamcatcher eye-of-horus horus omega alpha
      symbol emblem sigil mark seal totem keyhole arrowhead lightning diamond`) },
  { id: "nature", name: "Nature", featured: ["big-wave", "mountains", "flame", "snowflake-1"],
    words: w(`mountain mountains wave waves water fire flame flames lightning thunder cloud clouds snowflake snow rain wind tornado
      volcano rock rocks stone crystal crystals river lake waterfall ice drop droplet splash sunrise sunset sea ocean desert
      island beach cave`) },
  { id: "space", name: "Sun, moon & stars", featured: ["moon", "sun", "ringed-planet", "star-formation"],
    words: w(`moon moons sun suns star stars planet planets galaxy comet meteor rocket astronaut ufo eclipse saturn earth orbit
      satellite constellation night crescent nebula cosmos universe zodiac sunrise sunset solar lunar`) },
  { id: "religious", name: "Religious", featured: ["angel-wings", "prayer", "church", "ankh"],
    words: w(`cross crucifix angel angels church cathedral chapel prayer praying rosary holy halo buddha temple shrine monk priest
      nun bible candle chalice crusader templar saint menorah crescent torii ankh om dove heaven hell devil demon sacred`) },
  { id: "nautical", name: "Nautical", featured: ["anchor", "ship-wheel", "lighthouse", "compass"],
    words: w(`anchor ship ships boat sail sailboat sailing compass lighthouse wave waves sea ocean octopus kraken mermaid pirate
      rope wheel shell seashell whale shark swallow trident jellyfish seahorse crab harpoon galleon drakkar fishing
      submarine buoy knot treasure`) },
  { id: "tribal", name: "Tribal & ornament", featured: ["tribal-mask", "flower-twirl", "heavy-thorny-triskelion", "spiral-bloom"],
    words: w(`tribal totem mask masks spiral spirals swirl twirl twirly knot knots triskelion triquetra celtic maori aztec mayan
      egyptian hieroglyph ornament ornamental pattern sun barbed thorny tentacle tentacles flourish rune runes viking`) },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
// tokens that drag unrelated game items into a category
const NOT_TATTOO = new Set(w(`card cards dice die chess meeple poker tarot coin coins battery car truck bus tank robot laser
  console joystick keyboard computer phone smartphone tv plug usb`));
// per-category exclusions (tool/food/object names that merely mention an animal or plant)
const NOT_IN = {
  animals: new Set(w(`knife clip baseball leth blade cargo slippers oven canned cooked fried bowl bucket house hot artillery
    armoured backbone cage twitter scepter limb ensign trap leg core maggot hide`)),
  plants: new Set(w(`checkbox family pot hat cut duck branch arrow camp entrance`)),
};

// ── synonyms: query word → name tokens (weight 1 = as good as the word itself) ──
const SYN = {
  koi: ["fish", "carp", "circling-fish", "double-fish"], carp: ["fish"], goldfish: ["fish"],
  rose: ["flower", "rose"], roses: ["rose"], peony: ["flower", "rose", "spiral-bloom"], tulip: ["flower"],
  flower: ["flowers", "lotus", "daisy", "sunflower", "rose", "twirly-flower", "bloom"], flowers: ["flower"],
  floral: ["flower"], wildflower: ["flower", "flowers", "daisy", "dandelion"], cherry: ["cherry", "blossom", "flower"],
  sakura: ["cherry", "flower", "blossom"], blossom: ["flower", "cherry"], lavender: ["flower", "herb", "sprout"],
  plant: ["plant", "sprout", "leaf", "fern", "vine", "tree"], plants: ["plant"], botanical: ["plant", "leaf", "flower", "fern"],
  leaf: ["leaf", "leaves", "oak-leaf", "maple-leaf", "vine-leaf", "fern"], leaves: ["leaf"], tree: ["tree", "oak", "pine-tree", "palm-tree", "bonsai-tree"],
  forest: ["tree", "forest", "pine-tree"], fern: ["fern", "leaf"], vine: ["vine", "vines", "thorny-vine"], ivy: ["vine", "vines"],
  mushroom: ["mushroom", "mushrooms"], cactus: ["cactus"],
  skull: ["skull", "skeleton", "crossed-bones", "death"], skeleton: ["skull", "bones"], death: ["skull", "reaper", "grave"],
  dragon: ["dragon", "wyvern", "sea-dragon"], phoenix: ["phoenix", "bird", "flame", "fire", "wing", "wings"],
  snake: ["snake", "serpent", "cobra", "sea-serpent"], serpent: ["snake"], cobra: ["snake"],
  swallow: ["swallow", "sparrow", "bird", "dove"], sparrow: ["swallow", "bird"], bird: ["bird", "eagle", "swallow", "raven", "owl", "dove", "sparrow", "hummingbird"],
  birds: ["bird"], hummingbird: ["hummingbird", "bird"], dove: ["dove", "bird"], crow: ["raven", "crow-dive"], raven: ["raven", "crow-dive"],
  eagle: ["eagle", "eagle-emblem", "hawk", "falcon", "griffin"], hawk: ["hawk", "eagle"], falcon: ["hawk", "eagle", "falcon"], owl: ["owl", "barn-owl"],
  wolf: ["wolf", "wolf-head", "wolf-howl", "fox"], wolves: ["wolf"], fox: ["fox", "fox-head"], bear: ["bear", "bear-head", "polar-bear"],
  lion: ["lion", "lioness", "griffin"], tiger: ["tiger", "tiger-head", "panther", "leopard", "saber-toothed-cat-head"],
  cat: ["cat", "hollow-cat", "black-cat"], kitten: ["cat"], dog: ["dog", "sitting-dog", "jumping-dog", "wolf"], puppy: ["dog"],
  deer: ["deer", "stag", "stag-head", "deer-head", "elk", "moose"], stag: ["deer", "stag"], horse: ["horse", "horse-head", "unicorn", "horseshoe"],
  elephant: ["elephant", "elephant-head", "mammoth"], shark: ["shark", "shark-fin", "shark-jaws"], whale: ["whale", "sperm-whale", "whale-tail"],
  octopus: ["octopus", "tentacle", "kraken-tentacle", "squid"], kraken: ["kraken", "tentacle", "octopus", "giant-squid"], jellyfish: ["jellyfish"],
  fish: ["fish", "koi", "salmon", "shark"], bee: ["bee", "beehive", "hive", "honeycomb", "wasp"], spider: ["spider", "spider-web", "web"],
  scorpion: ["scorpion"], butterfly: ["butterfly", "moth", "butterfly-flower"], moth: ["butterfly", "moth"], beetle: ["beetle", "scarab"],
  insect: ["bee", "butterfly", "beetle", "ant", "spider", "praying-mantis", "dragonfly"], bug: ["beetle", "ant", "bug"],
  animal: ["animal"], animals: ["animal"], beast: ["beast", "monster"],
  mandala: ["flower-twirl", "twirly-flower", "spiral-bloom", "sun", "lotus", "flower-star", "star-formation", "twirl-center", "triple-yin"],
  geometric: ["triangle", "cube", "hexagon", "star-formation", "pentagram", "spiral"], sacred: ["triquetra", "star-formation", "all-seeing-eye", "lotus", "ankh"],
  wave: ["wave", "waves", "big-wave", "wave-crest"], waves: ["wave"], japanese: ["japan", "japanese-bridge", "katana", "samurai-helmet", "oni", "kimono", "torii", "big-wave", "paper-crane", "ninja"],
  japan: ["japanese"], oni: ["oni", "devil-mask", "demon"], hannya: ["oni", "devil-mask"], samurai: ["samurai-helmet", "katana", "ninja"],
  anchor: ["anchor", "ship-wheel"], ship: ["ship", "sailboat", "galleon", "drakkar"], compass: ["compass", "compass-rose"],
  dagger: ["dagger", "knife", "plain-dagger", "dagger-rose", "sword"], knife: ["knife", "dagger"], sword: ["sword", "swords", "crossed-swords", "katana", "saber"],
  axe: ["axe", "battle-axe"], gun: ["pistol", "revolver", "gun"],
  heart: ["heart", "hearts", "love"], love: ["heart"], eye: ["eye", "eyes", "all-seeing-eye"], eyes: ["eye"],
  hand: ["hand", "hands", "fist", "palm", "finger", "evil-hand"], hands: ["hand"], fist: ["fist", "hand"],
  moon: ["moon", "crescent", "eclipse", "night"], sun: ["sun", "sunrise", "sun-cloud"], star: ["star", "stars", "star-formation"], stars: ["star"],
  space: ["planet", "galaxy", "rocket", "moon", "star"], planet: ["planet", "ringed-planet", "saturn", "earth"], galaxy: ["galaxy", "spiral"],
  cross: ["cross", "crucifix", "templar"], angel: ["angel", "angel-wings", "wings", "halo"], wings: ["wing", "wings", "angel-wings"], wing: ["wing", "wings"],
  devil: ["devil", "demon", "daemon", "oni", "evil"], demon: ["devil", "demon", "daemon"],
  reaper: ["grim-reaper", "reaper-scythe", "scythe"], ghost: ["ghost", "spectre"],
  fire: ["fire", "flame", "flames", "burning"], flame: ["fire", "flame", "flames"], flames: ["flame"],
  crown: ["crown", "crowned"], king: ["crown", "king"], queen: ["crown", "queen"],
  clock: ["clock", "hourglass", "pocket-watch"], hourglass: ["hourglass", "clock"], time: ["hourglass", "clock"],
  lotus: ["lotus", "lotus-flower"], tribal: ["tribal", "totem", "spiral", "triskelion"], celtic: ["triquetra", "triskelion", "knot", "celtic"],
  viking: ["viking", "drakkar", "rune", "valknut", "mjolnir"], norse: ["viking", "rune"],
  infinity: ["infinity"], key: ["key", "keyhole", "heart-key"], lock: ["lock", "padlock", "keyhole"], mermaid: ["mermaid", "siren"],
  unicorn: ["unicorn"], pegasus: ["pegasus", "horse", "wing"], griffin: ["griffin"], mountain: ["mountain", "mountains"], mountains: ["mountain"],
  lighthouse: ["lighthouse"], feather: ["feather", "quill"], dreamcatcher: ["dream-catcher", "feather"], arrow: ["arrow", "arrows", "bow"],
  pirate: ["pirate", "skull-crossed-bones", "jolly-roger"], bat: ["bat", "bat-wing", "moon-bats"], crab: ["crab"], turtle: ["turtle", "sea-turtle"],
  frog: ["frog"], ram: ["ram", "goat"], goat: ["goat", "ram"], bull: ["bull", "bull-horns"], boar: ["boar"], rabbit: ["rabbit", "hare"],
  monkey: ["monkey", "gorilla", "ape"], gorilla: ["gorilla", "ape"], panther: ["panther", "tiger", "cat"], leopard: ["leopard", "panther"],
};
// object/food names that mention a motif but make poor tattoo results — ranked lower
const DEMOTE = new Set(w(`fried cooked canned can bucket corpse bowl pot jar bottle cage house trap oven slice sliced
  roasted meat food fork spoon plate tin bag box crate`));
const STOP = new Set(w(`a an the of with and or in on for to my tattoo tattoos design designs drawing drawings icon icons art
  sketch ink style styled traditional old school simple small big cute minimal minimalist black white line lines outline`));

export function stem(t) {
  if (t.length > 4 && t.endsWith("ves")) return t.slice(0, -3) + "f";
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(ches|shes|sses|xes)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

export function queryTerms(q) {
  return String(q || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

// ── pack loading ─────────────────────────────────────────────────────────
let packPromise = null;
let pack = null; // { authors, icons, entries[] }

export function packLoaded() { return !!pack; }

export function loadPack() {
  if (!packPromise) {
    packPromise = fetch(PACK_URL).then((r) => {
      if (!r.ok) throw new Error("pack " + r.status);
      return r.json();
    }).then((raw) => (pack = indexPack(raw))).catch((e) => { packPromise = null; throw e; });
  }
  return packPromise;
}

function indexPack(raw) {
  const catWords = CATEGORIES.map((c) => new Set(c.words));
  const byName = new Map();
  const entries = raw.icons.map(([name, ai, d], i) => {
    const toks = name.split("-");
    const stems = toks.map(stem);
    const cats = [];
    if (!toks.some((t) => NOT_TATTOO.has(t))) {
      CATEGORIES.forEach((c, ci) => {
        if (NOT_IN[c.id] && toks.some((t) => NOT_IN[c.id].has(t))) return;
        if (toks.some((t, k) => catWords[ci].has(t) || catWords[ci].has(stems[k]))) cats.push(c.id);
      });
    }
    const e = { i, name, ai, d, toks, stems, cats };
    if (!byName.has(name)) byName.set(name, e);
    return e;
  });
  for (const c of CATEGORIES) c.count = entries.filter((e) => e.cats.includes(c.id)).length;
  return { raw, authors: raw.authors, entries, byName };
}

// ── search ─────────────────────────────────────────────────────────────
function matchScore(e, x) {
  // x: a token ("wolf") or a full name ("wolf-head")
  if (x.includes("-")) return e.name === x ? 12 : e.name.startsWith(x + "-") || e.name.endsWith("-" + x) ? 8 : e.name.includes(x) ? 5 : 0;
  let best = 0;
  for (let k = 0; k < e.toks.length; k++) {
    const t = e.toks[k], s = e.stems[k];
    if (t === x || s === x) { best = Math.max(best, 10); break; }
    if (x.length >= 3 && t.startsWith(x)) best = Math.max(best, 5);
  }
  return best;
}

/** Returns pack entries ranked for `q`, optionally limited to a category id. */
export function searchPack(q, { category = null } = {}) {
  if (!pack) return [];
  const terms = [...new Set(queryTerms(q).map(stem))];
  let pool = pack.entries;
  if (category) pool = pool.filter((e) => e.cats.includes(category));
  if (!terms.length) return category ? pool.slice() : [];
  const catHit = terms.map((t) => CATEGORIES.find((c) => c.id === t || stem(c.name.toLowerCase().split(" ")[0]) === t));
  const res = [];
  for (const e of pool) {
    let total = 0, matched = 0;
    for (let ti = 0; ti < terms.length; ti++) {
      const t = terms[ti];
      let best = matchScore(e, t), extra = 0;
      const syn = SYN[t] || [];
      for (const x of syn) {
        const s = matchScore(e, x) * 0.75;
        if (s > best) { extra += best * 0.3; best = s; } else extra += s * 0.3;
      }
      if (!best && catHit[ti] && e.cats.includes(catHit[ti].id)) best = 3;
      if (best) { matched++; total += best + Math.min(extra, 6) + (e.name === t ? 6 : 0); }
    }
    if (matched) res.push([matched * 100 + total - e.name.length * 0.05 - (e.toks.some((t) => DEMOTE.has(t)) ? 8 : 0), e]);
  }
  res.sort((a, b) => b[0] - a[0]);
  return res.map((r) => r[1]);
}

export function categoryEntries(id) { return pack ? pack.entries.filter((e) => e.cats.includes(id)) : []; }
export function entryByName(name) { return pack?.byName.get(name) || null; }
export function packStats() { return pack ? { count: pack.entries.length, authors: pack.authors.length } : null; }
export function getCategory(id) { return CAT_BY_ID[id] || null; }

const FEATURED = ["rose", "skull-crossed-bones", "dragon-head", "wolf-howl", "lotus-flower", "snake", "anchor", "swallow",
  "eagle-emblem", "dagger-rose", "moon", "butterfly", "lion", "octopus", "compass", "all-seeing-eye", "dragonfly",
  "tiger-head", "owl", "big-wave", "heart-key", "sunflower", "crowned-skull", "fox-head", "jellyfish", "hummingbird",
  "fern", "spider-web", "triquetra", "deer-head", "raven", "mermaid", "praying-mantis", "mushroom", "katana", "yin-yang"];
export function featuredEntries() {
  return FEATURED.map((n) => pack?.byName.get(n)).filter(Boolean);
}

// ── items ────────────────────────────────────────────────────────────────
export function titleFromName(name) {
  const s = name.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function entryToItem(e) {
  const [folder, author, homepage, lic] = pack.authors[e.ai];
  const title = titleFromName(e.name);
  const url = `https://game-icons.net/1x1/${folder}/${e.name}.html`;
  const license = lic === "CC0" ? "CC0" : "CC BY 3.0";
  const item = {
    id: `gi:${folder}/${e.name}`,
    kind: "svg",
    title, creator: author, creatorUrl: homepage || "https://game-icons.net",
    source: "game-icons.net", sourceId: "gameicons", sourceUrl: "https://game-icons.net",
    license, licenseUrl: LICENSES[license], url,
    width: 512, height: 512,
    commercialOk: true, shareAlike: false, publicDomain: license === "CC0",
    tags: e.cats.slice(),
  };
  item.credit = creditLine(item);
  return item;
}

export function creditLine(it) {
  const by = it.creator ? ` by ${it.creator}` : "";
  return `“${it.title}”${by} — ${it.source} — ${it.license} (${it.licenseUrl}) — ${it.url}`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Self-contained black-ink SVG with the credit embedded as metadata. */
export function entrySvg(e, { color = "#111111", item = null } = {}) {
  const it = item || entryToItem(e);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<title>${esc(it.title)}</title><desc>${esc(it.credit)}</desc>` +
    `<path fill="${color}" d="${e.d}"/></svg>`;
}

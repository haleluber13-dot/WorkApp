// Motif library index: SUBJECTS metadata + cached motif lookup.
import { MOTIF_DEFS } from "./motifs.js";
import { ANIMAL_DEFS } from "./motifs-animals.js";
import { EXTRA_DEFS } from "./motifs-extra.js";
import { makeRng } from "./core.js";

const DEFS = { ...MOTIF_DEFS, ...ANIMAL_DEFS, ...EXTRA_DEFS };

// id → [name, tags, synonyms]
const META = {
  rose: ["Rose", ["flower", "floral", "love", "traditional"], ["roses", "rosa"]],
  peony: ["Peony", ["flower", "floral", "japanese"], ["peonies", "carnation"]],
  lotus: ["Lotus", ["flower", "floral", "spiritual", "zen"], ["lotus flower", "water lily", "waterlily"]],
  sunflower: ["Sunflower", ["flower", "floral", "sun"], ["sunflowers"]],
  daisy: ["Daisy", ["flower", "floral", "minimal"], ["daisies", "chamomile"]],
  lavender: ["Lavender", ["flower", "botanical", "fine-line"], ["sprig"]],
  leaf: ["Leaf", ["botanical", "nature"], ["leaves", "foliage"]],
  vine: ["Vine", ["botanical", "nature", "band"], ["ivy", "vines", "stem"]],
  laurel: ["Laurel wreath", ["botanical", "frame", "victory"], ["wreath", "olive branch", "laurels"]],
  tree: ["Tree of life", ["nature", "spiritual"], ["trees", "tree of life", "oak", "roots"]],
  cactus: ["Cactus", ["botanical", "desert", "cute"], ["succulent", "cacti"]],
  cherry: ["Cherries", ["fruit", "traditional", "pin-up"], ["cherry"]],
  mushroom: ["Mushroom", ["nature", "cute", "witchy"], ["mushrooms", "toadstool", "fungi", "shroom"]],
  heart: ["Heart", ["love", "traditional", "symbol"], ["hearts", "love"]],
  sacredheart: ["Sacred heart", ["love", "traditional", "religious"], ["sacred heart", "flaming heart"]],
  star: ["Nautical star", ["symbol", "traditional", "sailor"], ["stars", "nautical star"]],
  anchor: ["Anchor", ["nautical", "traditional", "sailor"], ["anchors"]],
  ship: ["Sailing ship", ["nautical", "traditional", "sailor"], ["boat", "galleon", "pirate ship", "sailboat"]],
  dagger: ["Dagger", ["traditional", "weapon"], ["knife", "sword", "blade"]],
  swords: ["Crossed swords", ["weapon", "traditional"], ["crossed swords", "crossed daggers"]],
  skull: ["Skull", ["death", "traditional", "memento mori"], ["skulls", "skeleton", "death", "calavera"]],
  snake: ["Snake", ["animal", "reptile", "traditional"], ["serpent", "cobra", "viper", "python"]],
  moon: ["Crescent moon", ["celestial", "night"], ["crescent", "lunar", "moons"]],
  sun: ["Sun", ["celestial", "light"], ["suns", "sunshine", "solar"]],
  planet: ["Planet", ["celestial", "space"], ["saturn", "space", "planets"]],
  butterfly: ["Butterfly", ["insect", "nature", "transformation"], ["butterflies", "moth"]],
  bee: ["Bee", ["insect", "nature", "cute"], ["bees", "honeybee", "bumblebee"]],
  spider: ["Spider", ["insect", "spooky"], ["spiders"]],
  web: ["Spider web", ["spooky", "traditional"], ["spiderweb", "cobweb", "spider web"]],
  feather: ["Feather", ["nature", "boho", "freedom"], ["feathers", "quill", "plume"]],
  arrow: ["Arrow", ["symbol", "boho", "direction"], ["arrows"]],
  eye: ["All-seeing eye", ["symbol", "mystic"], ["all seeing eye", "eye of providence", "eyes", "third eye"]],
  hand: ["Hamsa hand", ["symbol", "protection"], ["hamsa", "hand of fatima", "hands", "palm"]],
  wolf: ["Wolf", ["animal", "wild"], ["wolves", "husky", "dog"]],
  lion: ["Lion", ["animal", "wild", "strength"], ["lions", "lioness", "king"]],
  eagle: ["Eagle", ["animal", "bird", "freedom"], ["eagles", "hawk", "falcon"]],
  fox: ["Fox", ["animal", "wild", "cute"], ["foxes", "kitsune"]],
  bear: ["Bear", ["animal", "wild"], ["bears", "grizzly"]],
  deer: ["Stag", ["animal", "wild", "nature"], ["deer", "elk", "antlers", "reindeer"]],
  owl: ["Owl", ["animal", "bird", "wisdom"], ["owls"]],
  cat: ["Cat", ["animal", "pet", "cute"], ["cats", "kitten", "kitty", "black cat"]],
  dove: ["Dove", ["animal", "bird", "peace"], ["doves", "pigeon", "peace"]],
  swallow: ["Swallow", ["animal", "bird", "traditional", "sailor"], ["swallows", "sparrow", "bird", "birds"]],
  hummingbird: ["Hummingbird", ["animal", "bird", "nature"], ["humming bird", "colibri"]],
  koi: ["Koi", ["animal", "fish", "japanese"], ["koi fish", "carp", "fish"]],
  dragon: ["Dragon", ["mythical", "japanese"], ["dragons", "wyvern"]],
  phoenix: ["Phoenix", ["mythical", "bird", "rebirth"], ["firebird"]],
  jellyfish: ["Jellyfish", ["ocean", "animal"], ["jelly fish", "medusa"]],
  whale: ["Whale tail", ["ocean", "animal"], ["whale", "whales", "orca", "fluke"]],
  mountain: ["Mountains", ["nature", "landscape", "adventure"], ["mountain", "peaks", "hills"]],
  wave: ["Wave", ["ocean", "japanese", "nature"], ["waves", "ocean", "sea", "surf"]],
  compass: ["Compass", ["travel", "nautical"], ["compass rose", "wind rose"]],
  crown: ["Crown", ["royal", "symbol"], ["crowns", "king", "queen", "tiara"]],
  key: ["Key", ["symbol", "vintage"], ["keys", "skeleton key"]],
  hourglass: ["Hourglass", ["time", "memento mori"], ["sand clock", "sandglass"]],
  clock: ["Pocket watch", ["time", "vintage"], ["clock", "watch", "time"]],
  diamond: ["Diamond", ["gem", "traditional"], ["gem", "jewel", "crystal", "diamonds"]],
  flame: ["Flame", ["fire", "element"], ["fire", "flames", "burning"]],
  candle: ["Candle", ["light", "spiritual"], ["candles"]],
  lightning: ["Lightning bolt", ["weather", "energy"], ["lightning", "bolt", "thunder", "thunderbolt", "electric"]],
  infinity: ["Infinity", ["symbol", "minimal", "love"], ["infinite", "forever", "eternity"]],
  cross: ["Cross", ["religious", "symbol"], ["crucifix", "faith"]],
  dreamcatcher: ["Dreamcatcher", ["boho", "spiritual"], ["dream catcher"]],
  paperplane: ["Paper plane", ["travel", "minimal"], ["paper airplane", "plane", "airplane"]],
  semicolon: ["Semicolon", ["symbol", "minimal", "awareness"], [";", "semi colon"]],
  music: ["Music note", ["music", "minimal"], ["music", "note", "notes", "melody"]],
};

export const SUBJECTS = Object.keys(DEFS).filter((id) => META[id]).map((id) => ({ id, name: META[id][0], tags: META[id][1] }));
export const SUBJECT_SYNONYMS = Object.fromEntries(Object.keys(DEFS).filter((id) => META[id]).map((id) => [id, [id, META[id][0].toLowerCase(), ...(META[id][2] || [])]]));
export const hasMotif = (id) => !!DEFS[id];

const cache = new Map();
export function getMotif(id, seed = 1) {
  if (!DEFS[id]) id = "rose";
  const key = id + "|" + (DEFS[id].length ? seed : 0);
  let m = cache.get(key);
  if (!m) {
    m = DEFS[id](makeRng("motif" + id + seed));
    if (cache.size > 200) cache.clear();
    cache.set(key, m);
  }
  return m;
}

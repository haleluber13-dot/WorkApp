/* Otiyot — loading the text.
 *
 * The five books live in data/*.json, one file each, built by
 * tools/torah_build.py from the Westminster Leningrad Codex. Each file holds
 * the consonantal letters verse by verse plus a packed cantillation code per
 * word. Books are fetched on demand and cached for the session.
 */

const BASE = new URL('../data/', import.meta.url);
const cache = new Map();
let manifest = null;

export async function loadManifest() {
  if (manifest) return manifest;
  const res = await fetch(new URL('manifest.json', BASE));
  if (!res.ok) throw new Error(`Could not load the book list (${res.status})`);
  manifest = await res.json();
  return manifest;
}

export async function loadBook(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const res = await fetch(new URL(`${id}.json`, BASE));
    if (!res.ok) throw new Error(`Could not load ${id} (${res.status})`);
    return res.json();
  })();
  cache.set(id, p);
  return p;
}

export async function loadAll(onProgress) {
  const m = await loadManifest();
  const books = [];
  for (let i = 0; i < m.books.length; i++) {
    books.push(await loadBook(m.books[i].id));
    if (onProgress) onProgress((i + 1) / m.books.length, m.books[i].en);
  }
  return books;
}

/** One verse, in the shape the sequencer wants. */
function verseOf(book, ci, vi) {
  const text = book.chapters[ci][vi];
  return {
    book: book.en, bookId: book.id, bookHe: book.he,
    chapter: ci + 1, verse: vi + 1,
    words: text.split(' '),
    accents: book.accents?.[ci]?.[vi] || '',
  };
}

/**
 * Collect the verses for a selection.
 * @param {object} sel {scope:'verse'|'chapter'|'book'|'torah', bookId, chapter, verse, count}
 */
export async function select(sel) {
  const m = await loadManifest();

  if (sel.scope === 'torah') {
    const out = [];
    for (const b of m.books) {
      const book = await loadBook(b.id);
      for (let ci = 0; ci < book.chapters.length; ci++)
        for (let vi = 0; vi < book.chapters[ci].length; vi++)
          out.push(verseOf(book, ci, vi));
    }
    return out;
  }

  const book = await loadBook(sel.bookId);

  if (sel.scope === 'book') {
    const out = [];
    for (let ci = 0; ci < book.chapters.length; ci++)
      for (let vi = 0; vi < book.chapters[ci].length; vi++)
        out.push(verseOf(book, ci, vi));
    return out;
  }

  const ci = Math.min(Math.max(0, (sel.chapter || 1) - 1), book.chapters.length - 1);

  if (sel.scope === 'chapter') {
    return book.chapters[ci].map((_, vi) => verseOf(book, ci, vi));
  }

  // A run of verses starting where the reader is.
  const start = Math.min(Math.max(0, (sel.verse || 1) - 1), book.chapters[ci].length - 1);
  const count = Math.max(1, sel.count || 1);
  const out = [];
  let c = ci, v = start;
  while (out.length < count && c < book.chapters.length) {
    if (v >= book.chapters[c].length) { c++; v = 0; continue; }
    out.push(verseOf(book, c, v));
    v++;
  }
  return out;
}

/* Words now carry their vowel points, so a character count is not a letter
 * count — only the consonants are letters. */
const LETTER_RE = /[\u05D0-\u05EA]/g;
export const countLetters = verses =>
  verses.reduce((n, v) => n + v.words.reduce(
    (w, x) => w + (x.match(LETTER_RE)?.length || 0), 0), 0);

export const countWords = verses => verses.reduce((n, v) => n + v.words.length, 0);

/* ------------------------------------------------------------ translations
 *
 * Only public-domain translations are bundled — nineteenth and early
 * twentieth century works whose copyright has expired. Each language is a
 * separate file, fetched the first time it is chosen rather than up front,
 * because together they are larger than the Hebrew.
 */

const TRANS = new URL('../data/trans/', import.meta.url);
const transCache = new Map();
let transIndex = null;

export async function loadTranslationIndex() {
  if (transIndex) return transIndex;
  try {
    const res = await fetch(new URL('index.json', TRANS));
    transIndex = res.ok ? (await res.json()).translations || [] : [];
  } catch (_) {
    transIndex = [];              // no translations bundled; Hebrew still works
  }
  return transIndex;
}

export async function loadTranslation(code) {
  if (transCache.has(code)) return transCache.get(code);
  const p = (async () => {
    const res = await fetch(new URL(`${code}.json`, TRANS));
    if (!res.ok) throw new Error(`no ${code} translation (${res.status})`);
    return res.json();
  })();
  transCache.set(code, p);
  try { return await p; } catch (err) { transCache.delete(code); throw err; }
}

/** Hold a translation the reader supplied themselves, for any language. */
export function addTranslation(code, payload) {
  transCache.set(code, Promise.resolve(payload));
  transIndex = (transIndex || []).filter(t => t.code !== code)
    .concat([{ code, label: payload.label || code, file: null, own: true }]);
  return transIndex;
}

/** One verse of a loaded translation, or '' if it does not reach that far. */
export function verseText(trans, bookId, chapter, verse) {
  const ch = trans?.books?.[bookId];
  return ch?.[chapter - 1]?.[verse - 1] || '';
}

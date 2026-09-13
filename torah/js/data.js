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

export const countLetters = verses =>
  verses.reduce((n, v) => n + v.words.reduce((w, x) => w + x.length, 0), 0);

export const countWords = verses => verses.reduce((n, v) => n + v.words.length, 0);

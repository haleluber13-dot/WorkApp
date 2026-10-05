// Web library — online sources. Only open-licence / public-domain APIs that
// send CORS headers for both the JSON and the image pixels:
//   Openverse (CC media index), Wikimedia Commons, Natural-history plates
//   (Biodiversity Heritage Library scans on Commons), Art Institute of
//   Chicago (public domain, IIIF) and The Met (Open Access, CC0).
// Each adapter returns { items, hasMore, next } where items are normalized:
//   { id, kind:"image", title, creator, creatorUrl, source, sourceId, sourceUrl,
//     license, licenseUrl, url, thumb, full:[urls…], width, height,
//     commercialOk, shareAlike, publicDomain, credit, dedupe }

import { creditLine } from "./pack.js";

const TIMEOUT = 15000;
const PD_MARK = "https://creativecommons.org/publicdomain/mark/1.0/";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";

export class SourceError extends Error {
  constructor(kind, message, retryAfter = 0) { super(message); this.kind = kind; this.retryAfter = retryAfter; }
}

/** fetch JSON with a timeout; classifies failures as offline / busy / timeout / error. */
export async function fetchJSON(url, { signal, timeout = TIMEOUT } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort("timeout"), timeout);
  let r;
  try {
    r = await fetch(url, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (e) {
    if (signal?.aborted) throw new SourceError("aborted", "Cancelled");
    if (ctl.signal.aborted) throw new SourceError("timeout", "Timed out");
    throw new SourceError("offline", "Can't reach the server");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (r.status === 429 || r.status === 503) {
    throw new SourceError("busy", "Too many requests — try again in a minute", +(r.headers.get("retry-after") || 60));
  }
  if (!r.ok) throw new SourceError("error", `Server error ${r.status}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch {
    if (/too many requests/i.test(text)) throw new SourceError("busy", "Too many requests — try again in a minute", 60);
    throw new SourceError("error", "Unexpected response");
  }
}

const stripHtml = (s) => {
  if (!s) return "";
  const t = String(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return t;
};
const firstHref = (html) => {
  const m = /href="([^"]+)"/.exec(html || "");
  if (!m) return "";
  return m[1].startsWith("//") ? "https:" + m[1] : m[1];
};
const clip = (s, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
export const dedupeKey = (url) => {
  try {
    const u = new URL(url);
    let p = decodeURIComponent(u.pathname).replace(/_/g, " ").toLowerCase();
    return (u.hostname.replace(/^www\./, "").replace(/^(\w+\.)?m\./, "$1") + p).replace(/\/$/, "");
  } catch { return url; }
};

function finish(it) {
  it.credit = creditLine(it);
  it.dedupe = dedupeKey(it.url);
  return it;
}

// ── Openverse ─────────────────────────────────────────────────────────
const OV_NAMES = { by: "BY", "by-sa": "BY-SA", "by-nc": "BY-NC", "by-nc-sa": "BY-NC-SA", "by-nd": "BY-ND", "by-nc-nd": "BY-NC-ND" };
function ovLicense(code, ver) {
  if (code === "cc0") return "CC0 1.0";
  if (code === "pdm") return "Public Domain Mark 1.0";
  return `CC ${OV_NAMES[code] || code.toUpperCase()}${ver ? " " + ver : ""}`;
}
const PROVIDER_NAMES = { flickr: "Flickr", wikimedia: "Wikimedia Commons", stocksnap: "StockSnap", rawpixel: "rawpixel",
  smithsonian: "Smithsonian", met: "The Met", clevelandmuseum: "Cleveland Museum of Art", nypl: "NYPL",
  brooklynmuseum: "Brooklyn Museum", europeana: "Europeana", sciencemuseum: "Science Museum", nappy: "nappy" };

const openverse = {
  id: "openverse", name: "Openverse", home: "https://openverse.org",
  note: "Creative Commons images from Flickr, Wikimedia, museums and more",
  async search({ q, page = 1, commercial, illustrations, signal }) {
    const p = new URLSearchParams({ q, page: String(page), page_size: "20", mature: "false",
      license_type: commercial ? "commercial,modification" : "modification" });
    if (illustrations) p.set("category", "illustration,digitized_artwork");
    const d = await fetchJSON(`https://api.openverse.org/v1/images/?${p}`, { signal });
    const items = [];
    for (const r of d.results || []) {
      if (!r.thumbnail || !r.foreign_landing_url) continue;
      if (/-nd$|-nd-/.test(r.license)) continue; // no-derivatives — can't be turned into a tattoo
      const lic = ovLicense(r.license, r.license_version);
      const provider = PROVIDER_NAMES[r.source] || PROVIDER_NAMES[r.provider] || r.source || r.provider || "";
      const full = [];
      if (r.url && (!r.width || r.width <= 4200)) full.push(r.url);
      full.push(r.thumbnail);
      // Flickr serves CORS itself and has sized variants — spare Openverse's thumbnail proxy for those
      const fm = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(_[a-z])?\.jpg$/.exec(r.url || "");
      const thumb = fm ? fm[1] + "_z.jpg" : r.thumbnail;
      items.push(finish({
        id: "ov:" + r.id, kind: "image",
        title: clip(stripHtml(r.title) || "Untitled"), creator: stripHtml(r.creator) || "Unknown", creatorUrl: r.creator_url || "",
        source: provider ? `Openverse · ${provider}` : "Openverse", sourceId: "openverse", sourceUrl: "https://openverse.org/image/" + r.id,
        license: lic, licenseUrl: r.license_url || PD_MARK, url: r.foreign_landing_url,
        thumb, full, width: r.width || 0, height: r.height || 0,
        commercialOk: !/nc/.test(r.license), shareAlike: /sa/.test(r.license), publicDomain: r.license === "cc0" || r.license === "pdm",
      }));
    }
    return { items, hasMore: page < Math.min(d.page_count || 0, 12), next: page + 1, total: d.result_count || 0 };
  },
};

// ── Wikimedia Commons (and the BHL natural-history preset on top of it) ──
const WM_OK_MIME = /^image\/(jpeg|png|gif|webp|svg\+xml|tiff)$/;
function wmItems(d, { commercial, sourceId, sourceName }) {
  const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const items = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !ii.thumburl || !WM_OK_MIME.test(ii.mime || "")) continue;
    const m = ii.extmetadata || {};
    const v = (k) => m[k]?.value || "";
    const licName = stripHtml(v("LicenseShortName"));
    if (!licName) continue;
    if (/\bND\b|no ?deriv|non-?free|fair use/i.test(licName)) continue;
    const nc = /\bNC\b|non-?commercial/i.test(licName);
    if (commercial && nc) continue;
    const pd = /public domain|^PD|CC0|no restrictions/i.test(licName);
    const licUrl = v("LicenseUrl") ? v("LicenseUrl").replace(/^\/\//, "https://") : pd ? (/CC0/i.test(licName) ? CC0 : PD_MARK) : ii.descriptionurl;
    const fileTitle = p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
    const title = clip(stripHtml(v("ObjectName")) || fileTitle);
    const artistHtml = v("Artist");
    const creator = clip(stripHtml(artistHtml) || stripHtml(v("Credit")) || "Unknown", 90);
    const w = ii.width || 0, h = ii.height || 0;
    const sized = (px) => ii.thumburl.replace(/\/\d+px-/, `/${px}px-`);
    const full = [];
    if (/jpeg|png|gif|webp/.test(ii.mime) && w && w <= 2048) full.push(ii.url);
    else if (w > 1280) full.push(sized(1280), sized(960));
    full.push(ii.thumburl);
    items.push(finish({
      id: `${sourceId}:${p.pageid}`, kind: "image",
      title, creator, creatorUrl: firstHref(artistHtml),
      source: sourceName, sourceId, sourceUrl: ii.descriptionurl,
      license: licName, licenseUrl: licUrl, url: ii.descriptionurl,
      thumb: ii.thumburl, full, width: w, height: h,
      commercialOk: !nc, shareAlike: /SA\b|share ?alike|GFDL|FAL|free art/i.test(licName), publicDomain: pd,
    }));
  }
  return items;
}

// Wikimedia asks API clients to send requests one at a time — the Commons and BHL presets share a queue.
let wmQueue = Promise.resolve();
function wmSerial(fn) {
  const run = wmQueue.then(fn, fn);
  wmQueue = run.catch(() => {});
  return run;
}

function wmSearch(query, opts) { return wmSerial(() => wmSearchNow(query, opts)); }
async function wmSearchNow(query, { offset = 0, signal, commercial, sourceId, sourceName }) {
  if (signal?.aborted) throw new SourceError("aborted", "Cancelled");
  const p = new URLSearchParams({
    action: "query", format: "json", formatversion: "1", origin: "*",
    generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "20", gsroffset: String(offset),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "500",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ObjectName|Credit|UsageTerms",
  });
  const d = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${p}`, { signal });
  if (d.error) throw new SourceError(d.error.code === "ratelimited" ? "busy" : "error", d.error.info || "Search error");
  const next = d.continue?.gsroffset;
  return { items: wmItems(d, { commercial, sourceId, sourceName }), hasMore: next != null && next < 400, next: next ?? offset + 20 };
}

const ILLU_TERMS = "(engraving OR illustration OR lithograph OR woodcut OR etching OR drawing OR plate)";
const wikimedia = {
  id: "wikimedia", name: "Wikimedia Commons", home: "https://commons.wikimedia.org",
  note: "Free-licence photos, drawings and scans",
  search({ q, page: offset = 0, commercial, illustrations, signal }) {
    const query = illustrations ? `${q} AND ${ILLU_TERMS} filetype:bitmap|drawing` : `${q} filetype:bitmap|drawing`;
    return wmSearch(query, { offset, signal, commercial, sourceId: "wikimedia", sourceName: "Wikimedia Commons" });
  },
  first: 0,
};

const bhl = {
  id: "bhl", name: "Natural history plates", home: "https://www.biodiversitylibrary.org",
  note: "Public-domain botanical & zoological plates from the Biodiversity Heritage Library (via Wikimedia Commons)",
  search({ q, page: offset = 0, commercial, signal }) {
    return wmSearch(`${q} "Biodiversity Heritage Library" filetype:bitmap`, { offset, signal, commercial, sourceId: "bhl", sourceName: "Biodiversity Heritage Library · Wikimedia Commons" });
  },
  first: 0,
  natural: true, // runs in "All" only for plant/animal searches (or when picked)
};

// ── Art Institute of Chicago ──────────────────────────────────────────
const AIC_IIIF = "https://www.artic.edu/iiif/2/";
const aic = {
  id: "aic", name: "Art Institute of Chicago", home: "https://www.artic.edu",
  note: "Public-domain artworks (CC0)",
  async search({ q, page = 1, illustrations, signal }) {
    const p = new URLSearchParams({ page: String(page), limit: "20",
      fields: "id,title,artist_title,artist_display,image_id,thumbnail,date_display,artwork_type_title" });
    // plain `q` is a loose "should" when combined with filters — use a real match on the subject fields
    p.set("query[bool][must][0][multi_match][query]", q);
    ["title^3", "subject_titles^2", "term_titles", "classification_titles", "style_titles"].forEach((f, i) =>
      p.set(`query[bool][must][0][multi_match][fields][${i}]`, f));
    p.set("query[bool][filter][0][term][is_public_domain]", "true");
    if (illustrations) {
      p.set("query[bool][filter][1][terms][artwork_type_id][0]", "18"); // Print
      p.set("query[bool][filter][1][terms][artwork_type_id][1]", "14"); // Drawing and Watercolor
    }
    const d = await fetchJSON(`https://api.artic.edu/api/v1/artworks/search?${p}`, { signal });
    const items = [];
    for (const r of d.data || []) {
      if (!r.image_id) continue;
      const base = AIC_IIIF + r.image_id + "/full/";
      const t = r.thumbnail || {};
      items.push(finish({
        id: "aic:" + r.id, kind: "image",
        title: clip((r.title || "Untitled") + (r.date_display ? `, ${r.date_display}` : "")),
        creator: clip(r.artist_title || (r.artist_display || "").split("\n")[0] || "Unknown artist", 90), creatorUrl: "",
        source: "Art Institute of Chicago", sourceId: "aic", sourceUrl: "https://www.artic.edu",
        license: "Public domain (CC0)", licenseUrl: CC0, url: `https://www.artic.edu/artworks/${r.id}`,
        thumb: base + "400,/0/default.jpg", full: [base + "1686,/0/default.jpg", base + "843,/0/default.jpg"],
        placeholder: t.lqip || "", width: t.width || 0, height: t.height || 0,
        commercialOk: true, shareAlike: false, publicDomain: true,
      }));
    }
    const pg = d.pagination || {};
    return { items, hasMore: (pg.current_page || page) < Math.min(pg.total_pages || 0, 25), next: page + 1, total: pg.total || 0 };
  },
  first: 1,
};

// ── The Met (Open Access) ─────────────────────────────────────────────
const MET = "https://collectionapi.metmuseum.org/public/collection/v1";
// images.metmuseum.org only sends Access-Control-Allow-Origin on CDN cache misses (cached copies drop
// the header), so image URLs get a per-session query token: the first load in a session reaches the
// origin and gets CORS headers, repeats come from the browser cache.
const MET_TOKEN = Math.random().toString(36).slice(2, 8);
const metImg = (u) => (u ? u + (u.includes("?") ? "&" : "?") + "wb=" + MET_TOKEN : "");
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; try { out[k] = await fn(list[k]); } catch (e) { if (e.kind === "aborted") throw e; out[k] = null; } }
  }));
  return out;
}
const met = {
  id: "met", name: "The Met", home: "https://www.metmuseum.org",
  note: "Open Access public-domain artworks (CC0)",
  async search({ q, page: offset = 0, illustrations, signal }) {
    const p = new URLSearchParams({ q, hasImages: "true", offset: String(offset), limit: "24" });
    if (illustrations) p.set("departmentId", "9"); // Drawings and Prints
    const d = await fetchJSON(`${MET}.1/search?${p}`, { signal });
    const ids = d.objectIDs || [];
    const objs = await pool(ids, 8, (id) => fetchJSON(`${MET}/objects/${id}`, { signal, timeout: 12000 }));
    const items = [];
    for (const o of objs) {
      if (!o || !o.isPublicDomain || !o.primaryImageSmall) continue;
      items.push(finish({
        id: "met:" + o.objectID, kind: "image",
        title: clip((o.title || "Untitled") + (o.objectDate ? `, ${o.objectDate}` : "")),
        creator: clip(o.artistDisplayName || o.culture || "Unknown artist", 90), creatorUrl: o.artistWikidata_URL || o.artistULAN_URL || "",
        source: "The Metropolitan Museum of Art", sourceId: "met", sourceUrl: "https://www.metmuseum.org/about-the-met/policies-and-documents/open-access",
        license: "Public domain (CC0)", licenseUrl: CC0, url: o.objectURL,
        thumb: metImg(o.primaryImageSmall), full: [o.primaryImage, o.primaryImageSmall].filter(Boolean).map(metImg), width: 0, height: 0,
        commercialOk: true, shareAlike: false, publicDomain: true,
      }));
    }
    return { items, hasMore: offset + 24 < Math.min(d.total || 0, 480), next: offset + 24, total: d.total || 0 };
  },
  first: 0,
};

openverse.first = 1;
export const ONLINE_SOURCES = [openverse, wikimedia, bhl, aic, met];
export const SOURCE_BY_ID = Object.fromEntries(ONLINE_SOURCES.map((s) => [s.id, s]));

// ── small LRU cache of search pages ───────────────────────────────────
const cache = new Map();
export async function searchSource(src, opts) {
  const key = [src.id, opts.q.toLowerCase(), opts.page, opts.commercial ? 1 : 0, opts.illustrations ? 1 : 0].join("|");
  if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
  const v = await src.search(opts);
  cache.set(key, v);
  while (cache.size > 80) cache.delete(cache.keys().next().value);
  return v;
}

// ── pixels: CORS-clean canvas / blob from an item ─────────────────────
export function loadImage(url, { timeout = 25000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    const t = setTimeout(() => { img.src = ""; reject(new SourceError("timeout", "Image timed out")); }, timeout);
    signal?.addEventListener("abort", () => { clearTimeout(t); img.src = ""; reject(new SourceError("aborted", "Cancelled")); }, { once: true });
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new SourceError("error", "Image failed to load")); };
    img.src = url;
  });
}

export function drawToCanvas(img, max = 2048, { background = null } = {}) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const g = c.getContext("2d");
  if (background) { g.fillStyle = background; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, c.width, c.height);
  g.getImageData(0, 0, 1, 1); // throws if tainted
  return c;
}

/** Full-resolution (≤ max px) CORS-clean canvas for an image item; falls back through item.full then thumb. */
export async function imageItemCanvas(item, { max = 2048, signal } = {}) {
  const urls = [...new Set([...(item.full || []), item.thumb].filter(Boolean))];
  let last;
  for (const u of urls) {
    try {
      const img = await loadImage(u, { signal });
      return drawToCanvas(img, max);
    } catch (e) { if (e.kind === "aborted") throw e; last = e; }
  }
  throw last || new SourceError("error", "No image");
}

export const canvasToBlob = (c, type = "image/png", q) =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), type, q));

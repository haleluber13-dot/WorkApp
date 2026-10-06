/* Where an asset lives.
 *
 * The app runs three ways and each puts its files somewhere different: served
 * from a directory, opened as a single self-contained HTML file with every
 * asset inlined as a data: URI, and loaded from a sub-path when it is hosted
 * under one. This is the one place that knows the difference, so nothing else
 * has to.
 */

let base = '';

/** Called once at start-up when the app is not at the root of its origin. */
export function setAssetBase(b){ base = b || ''; }

/** The URL for `assets/<path>`, wherever this copy of the app keeps it. */
export function assetUrl(path){
  const key = './assets/' + path;
  return globalThis.__MOTORLAB_ASSETS?.[key] || base + key;
}

/** True when the single-file build carries this asset. Lets a caller fall back
 *  quietly instead of firing a request that is going to 404. */
export function assetBundled(path){
  const inlined = globalThis.__MOTORLAB_ASSETS;
  return !inlined || Object.prototype.hasOwnProperty.call(inlined, './assets/' + path);
}

/* The bytes of an inlined asset, decoded here rather than fetched.
 *
 * The single-file build carries its assets as data: URIs, and the obvious way
 * to read one back is fetch() — which is exactly the API a sandboxed host's
 * security policy is most likely to refuse. An <img> may show data: URIs all
 * day while fetch of the same string is denied, which is how the catalogue
 * photos survived on a page where every model quietly failed. Base64 needs no
 * network API at all, so the models stop depending on one.
 */
export function assetBytes(path){
  const v = globalThis.__MOTORLAB_ASSETS?.['./assets/' + path];
  if (!v || !v.startsWith('data:')) return null;
  const b64 = v.slice(v.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function assetText(path){
  const b = assetBytes(path);
  return b === null ? null : new TextDecoder().decode(b);
}

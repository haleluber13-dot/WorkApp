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

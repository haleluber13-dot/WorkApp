/* The catalogue photograph for a vehicle or an engine.
 *
 * Every subject has one, rendered from its own 3D model by
 * tools/make-thumbs.mjs, so the picture is of the thing the app will actually
 * build rather than a stock image of something like it. When one is missing —
 * a new catalogue entry, or a build that left the pictures out — the card falls
 * back to a drawn silhouette rather than a broken image.
 */
import { h } from '../ui.js';
import { assetUrl, assetBundled } from './assets.js';

export const photoPath = (kind, id) => `thumbs/${kind}-${id}.jpg`;

export function hasPhoto(kind, id){ return assetBundled(photoPath(kind, id)); }

/** A square photo element for one subject, with a fallback that never breaks. */
export function photo(kind, id, alt = ''){
  const wrap = h('span', { class:'shot' });
  if (!hasPhoto(kind, id)){
    wrap.classList.add('shot--none');
    wrap.appendChild(h('span', { class:'shot__ico', text: kind === 'eng' ? '⚙' : '🚗' }));
    return wrap;
  }
  const img = h('img', { class:'shot__img', alt, loading:'lazy', decoding:'async' });
  /* onerror rather than a HEAD check: the picture is either there or it is
     not, and finding out costs a request either way. */
  img.onerror = () => {
    wrap.classList.add('shot--none');
    img.remove();
    wrap.appendChild(h('span', { class:'shot__ico', text: kind === 'eng' ? '⚙' : '🚗' }));
  };
  img.src = assetUrl(photoPath(kind, id));
  wrap.appendChild(img);
  return wrap;
}

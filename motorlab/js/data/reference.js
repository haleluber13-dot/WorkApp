/* MotorLab — reference models.
 *
 * There are two ways a real model can be used, and they are not the same
 * thing. Downloading one and shipping it inside the app is redistribution: it
 * needs a licence that allows it, and most do not. Embedding one is what the
 * embed code on its page is for — the model stays on its author's account,
 * loads from their servers, and carries their name and a link back.
 *
 * So the good models that cannot be bundled are not out of reach. They sit
 * beside the generated engine as a reference: the real object to look at while
 * you strip the teachable one down. Nothing is copied, the author is credited
 * in the panel, and the link goes back to their page.
 *
 * A uid is the id in a Sketchfab URL or embed:
 *   https://sketchfab.com/models/<uid>/embed
 */

export const REFERENCES = {
  /* ---- engines ---- */
  'eng:f6-30-t': {
    uid:'5454444654c84c87bf84d1d9b1fc24eb',
    title:'Porsche 911 SC engine with 915 gearbox',
    author:'PROKOP',
    note:'A flat six with its gearbox still on it. The gearbox is ahead of the engine and the engine is behind the rear axle — which is the whole 911 layout in one picture, and why the weight sits where it does.',
  },
  'eng:porsche-mezger': {
    uid:'5454444654c84c87bf84d1d9b1fc24eb',
    title:'Porsche 911 SC engine with 915 gearbox',
    author:'PROKOP',
    note:'The same architecture the Mezger engine kept: crankcase, cooling fan drive and the gearbox hung off the front of it.',
  },
  'eng:porsche-9a1-gt3': {
    uid:'5454444654c84c87bf84d1d9b1fc24eb',
    title:'Porsche 911 SC engine with 915 gearbox',
    author:'PROKOP',
    note:'Where the flat six started. Compare the cooling: this one is air-cooled with a fan, the GT3 engine is water-cooled with the same crankcase layout.',
  },
  'eng:i6-30-legend': {
    uid:'7ebc9741434540c4831453066d7ae057',
    title:'Toyota 2JZ-GTE engine',
    author:'autoNgraphic',
    note:'Look at the block: closed deck, cast iron, and six bolts on every main bearing cap. That bottom end is the whole reason this engine has the reputation it has.',
  },
  'eng:rotary-13b-t': {
    uid:'a603b26ad9f5478dbb801591847e2f72',
    title:'13B PP rotary engine',
    author:'Dakta.Grower.Nzl',
    note:'A peripheral-port 13B. No valves, no camshaft, no reciprocating mass — the intake is a hole in the rotor housing wall and the rotors are the only moving parts of consequence.',
  },
  'eng:v8-57-sb': {
    uid:'7a957b5f9f954fe5b24e685f5e22046f',
    title:'V8 engine',
    author:'Pro_modeler',
    note:'A pushrod V8 with the intake in the valley and the exhaust outboard on each bank. Everything the teardown here calls a part, you can find on this one.',
  },
  'eng:f4-25-t': {
    uid:'55e22b0e48f440c8a00ea1385e2c09ab',
    title:'Subaru EJ257 flat-four boxer engine',
    author:'ilvskf',
    note:'The cylinders lie flat on both sides, so the crank sits barely above the sump and the whole car\'s centre of gravity comes down with it. That is the only reason to build a boxer.',
  },
  'eng:d-i6-67': {
    uid:'8a08e2a4c2da49b69536f39d021c9ac7',
    title:'7.3 Powerstroke diesel engine',
    author:'ihdieselman',
    note:'A heavy-duty diesel six. Note how much more metal is in everything — the block, the caps, the rods — because it lives at seventeen to one and twice the cylinder pressure of a petrol engine.',
  },
  'eng:m-triple-765': {
    uid:'ad2416e341cb4beca3f86b0b00e84749',
    title:'Three-cylinder motorcycle engine',
    author:'Jamie Hamel-Smith',
    note:'A motorcycle triple with the gearbox in the same castings as the engine. On a bike there is no bellhousing — the crankcase is the gearbox case.',
  },
};

/** The reference for a subject, or null. kind is 'eng' or 'veh'. */
export function referenceFor(kind, id){
  return REFERENCES[`${kind}:${id}`] || null;
}

/** Where the user's own reference for a subject is kept. */
const KEY = 'motorlab.refs.v1';

function stored(){
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

/** A reference the user set themselves beats the built-in one. */
export function activeReference(kind, id){
  const mine = stored()[`${kind}:${id}`];
  return mine || referenceFor(kind, id);
}

export function setReference(kind, id, rec){
  const all = stored();
  if (rec) all[`${kind}:${id}`] = rec; else delete all[`${kind}:${id}`];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* full or blocked */ }
}

/** Pull a uid out of anything someone is likely to paste: a model page URL, an
 *  embed URL, or the whole iframe snippet off the share dialog. */
export function uidFrom(text){
  const s = String(text || '');
  const m = s.match(/sketchfab\.com\/(?:3d-)?models\/(?:[a-z0-9-]*-)?([0-9a-f]{32})/i)
         || s.match(/\b([0-9a-f]{32})\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** The title and author out of a pasted embed snippet, when they are in it. */
export function creditFrom(text){
  const s = String(text || '');
  const title = s.match(/<a[^>]*3d-models\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/i);
  const author = s.match(/by\s*<a[^>]*sketchfab\.com\/([^"\/]+)"[^>]*>\s*([^<]+?)\s*<\/a>/i);
  return { title: title ? title[1].trim() : null,
           author: author ? author[2].trim() : null };
}

export const EMBED_BASE = 'https://sketchfab.com/models/';

/** The embed URL for a uid, with the viewer chrome we want. */
export function embedUrl(uid){
  const q = new URLSearchParams({
    autospin: '0.2', autostart: '1', preload: '1',
    ui_theme: 'dark', ui_infos: '0', ui_controls: '1', ui_watermark: '0',
  });
  return `${EMBED_BASE}${uid}/embed?${q}`;
}

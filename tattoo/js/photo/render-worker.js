// Photo studio — render worker: full-resolution adjustments + tattoo looks off the main thread.
// Messages in:  { type: 'src', doc, rgba, w, h, GW, GH }                       (once per photo)
//               { type: 'render', id, doc, adjust, adjKey, look, lookKey, mask? }
// Messages out: { id, doc, adjKey, lookKey, adj?: Uint8ClampedArray, look?: Uint8ClampedArray } | { id, error }
import { makeSource, prepareAdjust, applyAdjust, adjustIsIdentity } from './adjust.js';
import { renderLookROI } from './looks.js';
import { processOutput } from './output.js';

let S = null; // { doc, src, w, h, adjKey, adj, identity }

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'src') {
      S = { doc: m.doc, w: m.w, h: m.h, src: makeSource(m.rgba, m.w, m.h, { k: 1, GW: m.GW, GH: m.GH }), adjKey: null, adj: null };
      return;
    }
    if (m.type === 'output') {
      const out = processOutput(m.job);
      self.postMessage({ id: m.id, out }, [out.buffer]);
      return;
    }
    if (m.type !== 'render') return;
    if (!S || S.doc !== m.doc) { self.postMessage({ id: m.id, error: 'no source' }); return; }
    let adjOut = null;
    if (S.adjKey !== m.adjKey) {
      if (adjustIsIdentity(m.adjust)) { S.adj = S.src.rgba; S.identity = true; }
      else { S.adj = applyAdjust(S.src, prepareAdjust(m.adjust), new Uint8ClampedArray(S.w * S.h * 4)); S.identity = false; }
      S.adjKey = m.adjKey;
    }
    const transfer = [];
    if (m.wantAdj && !S.identity) { adjOut = S.adj.slice(); transfer.push(adjOut.buffer); }
    let look = null;
    if (m.look) {
      look = renderLookROI(S.adj, S.w, S.h, m.look, { k: 1, mask: m.mask || null });
      if (look === S.adj) look = S.adj.slice();
      transfer.push(look.buffer);
    }
    self.postMessage({ id: m.id, doc: m.doc, adjKey: m.adjKey, lookKey: m.lookKey, adj: adjOut, identity: S.identity, look }, transfer);
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};

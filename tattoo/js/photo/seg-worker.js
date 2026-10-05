// Photo studio — segmentation worker (module worker). Messages: { id, job } → { id, result } | { id, error }.
import { runSmartSelect } from './segment.js';

self.onmessage = (e) => {
  const { id, job } = e.data || {};
  try {
    const result = runSmartSelect(job);
    self.postMessage({ id, result }, [result.mask.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};

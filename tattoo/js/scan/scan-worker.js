// Body scan worker: person cut-out and body fitting off the main thread.
// Messages: { id, type: "segment" | "fitPhoto" | "fitTape", data } → { id, progress } … { id, result } | { id, error }
import { segmentPerson } from "./silhouette.js";
import { fitPhotoReport, fitTapeReport } from "./fit.js";

self.onmessage = async (e) => {
  const { id, type, data } = e.data || {};
  try {
    let result;
    const onProgress = (p) => self.postMessage({ id, progress: p });
    if (type === "segment") {
      result = segmentPerson(data);
      self.postMessage({ id, result }, [result.mask.buffer]);
      return;
    }
    if (type === "fitPhoto") result = await fitPhotoReport(data, { ...(data.opts || {}), onProgress });
    else if (type === "fitTape") result = await fitTapeReport(data, { ...(data.opts || {}), onProgress });
    else throw new Error("unknown job " + type);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};

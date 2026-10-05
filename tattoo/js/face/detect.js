/* Face landmarks with MediaPipe Face Landmarker (vendored, Apache-2.0).
   Everything is loaded lazily the first time a face is analysed and runs on
   the device (CPU WASM by default). */

const BASE = new URL("../../vendor/mediapipe/", import.meta.url).href;

let loading = null;   // Promise<FaceLandmarker>
export const timings = { load: 0, detect: 0 };

function friendly(msg, cause) {
  const e = new Error(msg);
  e.friendly = true;
  e.cause = cause;
  return e;
}

async function fetchModel(onProgress) {
  let res = await fetch(BASE + "face_landmarker.task").catch(() => null);
  if (!res?.ok) {
    // hosts that won't serve a .task file get a base64 text copy instead
    const alt = await fetch(BASE + "face_landmarker.task.b64.txt").catch(() => null);
    if (alt?.ok) {
      const bin = atob((await alt.text()).trim());
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      onProgress?.(1);
      return out;
    }
  }
  if (!res?.ok) throw new Error("model HTTP " + (res ? res.status : "network"));
  const total = +res.headers.get("content-length") || 3758596;
  if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Load (once) the landmarker. onProgress(0..1) reports the model download. */
export function loadLandmarker({ onProgress, delegate = "CPU" } = {}) {
  if (loading) return loading;
  loading = (async () => {
    const t0 = performance.now();
    if (typeof WebAssembly !== "object") throw friendly("Face detection needs WebAssembly, which this viewer has turned off. Open InkForm in your browser or the app to use your face.");
    let mp;
    try { mp = await import(BASE + "vision_bundle.mjs"); }
    catch (e) { throw friendly("Couldn't load the face detector here. Open InkForm in your browser or the app to use your face.", e); }
    let simd = true;
    try { simd = await mp.FilesetResolver.isSimdSupported(); } catch { /* assume yes */ }
    if (!simd) throw friendly("This browser is too old for face detection. Update it (or Android System WebView) and try again.");
    const fileset = { wasmLoaderPath: BASE + "wasm/vision_wasm_internal.js", wasmBinaryPath: BASE + "wasm/vision_wasm_internal.wasm" };
    let model;
    try { model = await fetchModel(onProgress); }
    catch (e) { throw friendly("Couldn't load the face model. Check that the app finished downloading and try again.", e); }
    const make = (d) => mp.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate: d },
      runningMode: "IMAGE",
      numFaces: 4,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    let lm;
    try { lm = await make(delegate); }
    catch (e) {
      if (delegate !== "CPU") { try { lm = await make("CPU"); } catch (e2) { e = e2; } }
      if (!lm) throw friendly("The face detector couldn't start here (this viewer may block WebAssembly). Open InkForm in your browser or the app.", e);
    }
    timings.load = performance.now() - t0;
    return lm;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/**
 * Detect faces on a canvas. Returns faces sorted by size (largest first):
 * [{ pts: Float32Array(478*3) in canvas pixels (x, y, z with z in pixel units,
 *    negative = toward the camera), box: {x0,y0,x1,y1}, size }]
 */
export async function detectFaces(canvas, opts) {
  const lm = await loadLandmarker(opts);
  const t0 = performance.now();
  let res;
  try { res = lm.detect(canvas); }
  catch (e) { throw friendly("Face detection failed on this photo. Try another one.", e); }
  timings.detect = performance.now() - t0;
  const W = canvas.width, H = canvas.height;
  const faces = (res.faceLandmarks || []).map((L) => {
    const pts = new Float32Array(L.length * 3);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < L.length; i++) {
      const x = L[i].x * W, y = L[i].y * H, z = L[i].z * W;
      pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z;
      if (i < 468) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { pts, box: { x0, y0, x1, y1 }, size: Math.max(x1 - x0, y1 - y0), count: L.length };
  }).filter((f) => f.count >= 468);
  faces.sort((a, b) => b.size - a.size);
  return faces;
}

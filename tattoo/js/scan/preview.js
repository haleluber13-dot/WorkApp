// Body scan — small three.js preview of the fitted body: front and side views
// side by side in one canvas, rendered on demand (no animation loop).
import * as THREE from "three";

export function createPreview(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.2, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd09a74, roughness: 0.6, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  let height = 1.78, views = 2;

  function frame(viewW, viewH, side) {
    // fit the full body height with a small margin; same scale for both views
    const h = height * 1.06, w = (h * viewW) / viewH;
    cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2;
    cam.updateProjectionMatrix();
    const cy = height / 2;
    if (side) { cam.position.set(4, cy, 0); cam.lookAt(0, cy, 0); }
    else { cam.position.set(0, cy, 4); cam.lookAt(0, cy, 0); }
  }

  const api = {
    ok: true,
    /** Replace the body geometry (the caller owns the previous one). */
    setGeometry(geometry, bounds) {
      mesh.geometry = geometry;
      height = bounds ? bounds.max[1] : 1.78;
      api.render();
    },
    setSkin(hex) { mat.color.set(hex); api.render(); },
    setViews(n) { views = n; api.render(); },
    render() {
      const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.setScissorTest(true);
      renderer.setClearColor(0x000000, 0);
      const vw = w / views;
      for (let i = 0; i < views; i++) {
        renderer.setViewport(i * vw, 0, vw, h);
        renderer.setScissor(i * vw, 0, vw, h);
        frame(vw, h, i === 1);
        renderer.render(scene, cam);
      }
      renderer.setScissorTest(false);
    },
    /** Head-and-shoulders picture (square data URL) for bodies made without photos. */
    thumb(size = 256, bg = "#8a8a8f") {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const r2 = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
      r2.outputColorSpace = THREE.SRGBColorSpace;
      r2.setClearColor(new THREE.Color(bg), 1);
      const top = height, span = height * 0.25;
      const cm = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.1, 20);
      const cy = top - span * 0.46;
      cm.position.set(0, cy, 4); cm.lookAt(0, cy, 0);
      r2.render(scene, cm);
      const url = c.toDataURL("image/jpeg", 0.86);
      r2.dispose();
      r2.forceContextLoss?.();
      return url;
    },
    destroy() {
      try { mat.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); } catch { /* ignore */ }
    },
  };
  return api;
}

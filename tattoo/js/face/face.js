/* "My face" — put the user's real face on the 3D mannequin from a selfie.

   mountFaceCapture(container, { onDone(face), onCancel(), toast(msg), skinTone }) → { destroy() }
   createFaceObject(face, THREE) → THREE.Object3D   (textured mask + hair shell, face space)
   fitFaceToHead(object, { bodyMesh, regions, bounds, THREE })   (place + shrink-wrap on the head)
   setFaceHair(object, style, color)                 (optional: change the hair without re-fitting)

   face = { version: 1, image, uv, points, indices, oval, skinTone, hairColor, hair }
   Landmarks: MediaPipe Face Landmarker (vendor/mediapipe, Apache-2.0), loaded
   lazily by mountFaceCapture only. Photos never leave the device. */

export { createFaceObject, fitFaceToHead, setFaceHair } from "./mesh.js";
export { mountFaceCapture } from "./ui.js";

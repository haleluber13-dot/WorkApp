/* A Draco decoder that runs on the main thread, from a decoder module the
 * page already carries.
 *
 * THREE's DRACOLoader builds a pool of workers from blob: URLs and feeds them
 * a decoder it fetches from a directory. Inside a sandboxed page — the single
 * offline file published as an artifact — any one of those steps can be
 * refused by the host's security policy: fetch of a data: URI, a Worker from
 * a blob:, WebAssembly compilation. Each refusal looks like every model in
 * the catalogue quietly failing at once.
 *
 * This does none of those things. The offline build inlines the plain-JS
 * decoder as an ordinary script tag (window.DracoDecoderModule), and this
 * class decodes on the main thread with it: no fetch, no worker, no wasm, no
 * eval. A model this size decodes in tens of milliseconds; the pool was for
 * scenes with hundreds of megabytes of geometry, not for one car.
 *
 * The decode logic is the same as the one DRACOLoader ships to its workers,
 * kept call-for-call so the two stay interchangeable behind GLTFLoader.
 */
import * as THREE from 'three';

let modulePromise = null;

function decoderModule(){
  if (!modulePromise){
    const factory = globalThis.DracoDecoderModule;
    if (!factory) return Promise.reject(new Error('No DracoDecoderModule on this page.'));
    modulePromise = new Promise((res) => factory({ onModuleLoaded: res }));
  }
  return modulePromise;
}

const DATA_TYPE = (draco, T) =>
  T === Float32Array ? draco.DT_FLOAT32 :
  T === Int8Array    ? draco.DT_INT8    :
  T === Int16Array   ? draco.DT_INT16   :
  T === Int32Array   ? draco.DT_INT32   :
  T === Uint8Array   ? draco.DT_UINT8   :
  T === Uint16Array  ? draco.DT_UINT16  : draco.DT_UINT32;

export class MainThreadDRACOLoader {
  constructor(){
    this.defaultAttributeIDs = { position:'POSITION', normal:'NORMAL', color:'COLOR', uv:'TEX_COORD' };
    this.defaultAttributeTypes = { position:'Float32Array', normal:'Float32Array',
                                   color:'Float32Array', uv:'Float32Array' };
  }

  /* GLTFLoader calls these; nothing to warm up and nothing to tear down. */
  preload(){ return this; }
  dispose(){ return this; }
  setDecoderPath(){ return this; }
  setDecoderConfig(){ return this; }
  setWorkerLimit(){ return this; }

  decodeDracoFile(buffer, callback, attributeIDs, attributeTypes,
                  vertexColorSpace = THREE.LinearSRGBColorSpace, onError = () => {}){
    const job = decoderModule().then((draco) => {
      const decoder = new draco.Decoder();
      try {
        return this._decode(draco, decoder, new Int8Array(buffer), {
          attributeIDs: attributeIDs || this.defaultAttributeIDs,
          attributeTypes: attributeTypes || this.defaultAttributeTypes,
          useUniqueIDs: !!attributeIDs,
          vertexColorSpace,
        });
      } finally {
        draco.destroy(decoder);
      }
    });
    return job.then(callback).catch(onError);
  }

  _decode(draco, decoder, array, cfg){
    const geometryType = decoder.GetEncodedGeometryType(array);
    let mesh, status;
    if (geometryType === draco.TRIANGULAR_MESH){
      mesh = new draco.Mesh();
      status = decoder.DecodeArrayToMesh(array, array.byteLength, mesh);
    } else if (geometryType === draco.POINT_CLOUD){
      mesh = new draco.PointCloud();
      status = decoder.DecodeArrayToPointCloud(array, array.byteLength, mesh);
    } else {
      throw new Error('Draco: unexpected geometry type.');
    }
    if (!status.ok() || mesh.ptr === 0)
      throw new Error('Draco: decoding failed: ' + status.error_msg());

    const geometry = new THREE.BufferGeometry();
    try {
      for (const name in cfg.attributeIDs){
        const T = globalThis[cfg.attributeTypes[name]] || Float32Array;
        let attr;
        if (cfg.useUniqueIDs){
          attr = decoder.GetAttributeByUniqueId(mesh, cfg.attributeIDs[name]);
        } else {
          const id = decoder.GetAttributeId(mesh, draco[cfg.attributeIDs[name]]);
          if (id === -1) continue;
          attr = decoder.GetAttribute(mesh, id);
        }
        const numComponents = attr.num_components();
        const numValues = mesh.num_points() * numComponents;
        const byteLength = numValues * T.BYTES_PER_ELEMENT;
        const ptr = draco._malloc(byteLength);
        decoder.GetAttributeDataArrayForAllPoints(mesh, attr, DATA_TYPE(draco, T), byteLength, ptr);
        const data = new T(draco.HEAPF32.buffer, ptr, numValues).slice();
        draco._free(ptr);
        const ba = new THREE.BufferAttribute(data, numComponents);
        if (name === 'color'){
          /* GLTFLoader hands colors over already linear, so there is nothing
             to convert here — only .drc files ever need the sRGB pass. */
          ba.normalized = !(data instanceof Float32Array);
        }
        geometry.setAttribute(name, ba);
      }
      if (geometryType === draco.TRIANGULAR_MESH){
        const numIndices = mesh.num_faces() * 3;
        const byteLength = numIndices * 4;
        const ptr = draco._malloc(byteLength);
        decoder.GetTrianglesUInt32Array(mesh, byteLength, ptr);
        const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();
        draco._free(ptr);
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
      }
    } finally {
      draco.destroy(mesh);
    }
    return geometry;
  }
}

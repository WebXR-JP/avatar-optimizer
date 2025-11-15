import { VRMLoaderPlugin, type VRM, type VRMLoaderPluginOptions } from '@pixiv/three-vrm'
import { ResultAsync } from 'neverthrow'
import type { LoadingManager } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { OptimizationError, ThreeVRMDocument } from '../types'

type BinaryLike = ArrayBuffer | ArrayBufferView | SharedArrayBuffer | Blob

export type ThreeVRMLoadResult = ThreeVRMDocument

/**
 * three.js + @pixiv/three-vrm で VRM バイナリをパースし VRM インスタンスを返却
 */
export function importVRMWithThreeVRM(
  binary: BinaryLike
): ResultAsync<VRM, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const loader = new GLTFLoader()
      const arrayBuffer = await toArrayBuffer(binary)
      loader.register((parser) => new VRMLoaderPlugin(parser))
      const gltf = await loader.parseAsync(arrayBuffer, '')
      const vrm = gltf.userData?.vrm as VRM | undefined

      if (!vrm) {
        throw new Error('three-vrm loader did not attach a VRM instance to gltf.userData')
      }

      return vrm
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to import VRM with three-vrm: ${String(error)}`,
    }),
  )
}

async function toArrayBuffer(binary: BinaryLike): Promise<ArrayBuffer> {
  if (binary instanceof ArrayBuffer) {
    return binary
  }

  if (typeof Blob !== 'undefined' && binary instanceof Blob) {
    return binary.arrayBuffer()
  }

  if (typeof SharedArrayBuffer !== 'undefined' && binary instanceof SharedArrayBuffer) {
    const copy = new ArrayBuffer(binary.byteLength)
    new Uint8Array(copy).set(new Uint8Array(binary))
    return copy
  }

  if (ArrayBuffer.isView(binary)) {
    const copy = new ArrayBuffer(binary.byteLength)
    const tempView = new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)
    new Uint8Array(copy).set(tempView)
    return copy
  }

  throw new TypeError('Unsupported binary data type')
}

import { VRMLoaderPlugin, type VRM, type VRMLoaderPluginOptions } from '@pixiv/three-vrm'
import { ResultAsync } from 'neverthrow'
import type { LoadingManager } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { OptimizationError, ThreeVRMDocument } from '../types'

type BinaryLike = ArrayBuffer | ArrayBufferView | SharedArrayBuffer | Blob

export interface ThreeVRMLoaderOptions {
  /**
   * 既存の GLTFLoader インスタンスを使い回したい場合に指定
   * (VRMLoaderPlugin が登録済みであることが前提)
   */
  loader?: GLTFLoader
  /** three.js の LoadingManager を差し込みたい場合に使用 */
  manager?: LoadingManager
  /** GLTFLoader.parseAsync の第二引数 (相対リソース解決用) */
  resourcePath?: string
  /** VRMLoaderPlugin に渡すオプション */
  pluginOptions?: VRMLoaderPluginOptions
}

export type ThreeVRMLoadResult = ThreeVRMDocument

/**
 * three.js + @pixiv/three-vrm で VRM バイナリをパースし VRM インスタンスを返却
 */
export function importVRMWithThreeVRM(
  binary: BinaryLike,
  options: ThreeVRMLoaderOptions = {},
): ResultAsync<ThreeVRMDocument, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const loader = ensureGLTFLoader(options)
      const arrayBuffer = await toArrayBuffer(binary)
      const gltf = await loader.parseAsync(arrayBuffer, options.resourcePath ?? '')
      const vrm = gltf.userData?.vrm as VRM | undefined

      if (!vrm) {
        throw new Error('three-vrm loader did not attach a VRM instance to gltf.userData')
      }

      return { vrm, gltf }
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to import VRM with three-vrm: ${String(error)}`,
    }),
  )
}

function ensureGLTFLoader(options: ThreeVRMLoaderOptions): GLTFLoader {
  if (options.loader) {
    return options.loader
  }

  const loader = new GLTFLoader(options.manager)
  loader.register((parser) => new VRMLoaderPlugin(parser, options.pluginOptions))
  return loader
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

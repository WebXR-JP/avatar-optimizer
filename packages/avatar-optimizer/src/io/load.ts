/**
 * VRM ロード機能
 * URL / File / Blob / ArrayBuffer から VRM を読み込む
 */
import type { VRM } from '@pixiv/three-vrm'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { MToonAtlasLoaderPlugin } from '@xrift/mtoon-atlas'
import { ResultAsync } from 'neverthrow'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { VRMLoaderError } from '../types'

/**
 * VRM ソースの型
 * URL文字列、File、Blob、ArrayBuffer を受け付ける
 */
export type VRMSource = string | File | Blob | ArrayBuffer

/**
 * VRM を読み込む
 *
 * @param source - VRM ソース (URL文字列 / File / Blob / ArrayBuffer)
 * @returns VRM オブジェクトまたはエラー
 *
 * @example
 * ```typescript
 * // URL から読み込み
 * const result = await loadVRM('/path/to/model.vrm')
 *
 * // File から読み込み
 * const result = await loadVRM(file)
 *
 * // ArrayBuffer から読み込み
 * const result = await loadVRM(arrayBuffer)
 * ```
 */
export function loadVRM(source: VRMSource): ResultAsync<VRM, VRMLoaderError> {
  return ResultAsync.fromPromise(
    (async () => {
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.register((parser) => new MToonAtlasLoaderPlugin(parser as any))

      let gltf

      if (typeof source === 'string') {
        // URL から読み込み
        gltf = await loader.loadAsync(source)
      } else if (source instanceof ArrayBuffer) {
        // ArrayBuffer から読み込み
        gltf = await loader.parseAsync(source, '')
      } else {
        // File / Blob から読み込み
        const url = URL.createObjectURL(source)
        try {
          gltf = await loader.loadAsync(url)
        } finally {
          URL.revokeObjectURL(url)
        }
      }

      const vrm = gltf.userData.vrm as VRM | undefined

      if (!vrm) {
        throw new Error('VRM data not found in loaded file')
      }

      return vrm
    })(),
    (error): VRMLoaderError => ({
      type: 'VRM_LOAD_FAILED',
      message: `Failed to load VRM: ${String(error)}`,
    }),
  )
}

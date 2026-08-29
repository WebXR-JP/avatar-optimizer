/**
 * VRM ロード機能
 * URL / File / Blob / ArrayBuffer から VRM を読み込む
 */
import type { VRM } from '@pixiv/three-vrm'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { VRMMetaLoaderPlugin } from '@pixiv/three-vrm-core'
import { VRMNodeConstraintLoaderPlugin } from '@pixiv/three-vrm-node-constraint'
import {
  MToonAtlasLoaderPlugin,
  resolveKtx2Loader,
} from '@webxr-jp/mtoon-atlas'
import { ResultAsync } from 'neverthrow'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { VRMLoaderError } from '../types'

/**
 * VRM ソースの型
 * URL文字列、File、Blob、ArrayBuffer を受け付ける
 */
export type VRMSource = string | File | Blob | ArrayBuffer

/**
 * loadVRM のオプション
 */
export interface LoadVRMOptions {
  /**
   * 使用する KTX2Loader。GLTFLoader と MToonAtlasLoaderPlugin の双方で共有される。
   *
   * 渡すインスタンスは `detectSupport(renderer)` 済みである必要がある。
   * 未初期化のまま渡すと three が
   * `THREE.KTX2Loader: Missing initialization with .detectSupport( renderer ).`
   * を投げる
   */
  ktx2Loader?: KTX2Loader

  /**
   * KTX2 トランスコーダーの配信元ディレクトリ（末尾スラッシュ必須）。
   * `ktx2Loader` を渡した場合は無視される。
   * アプリ全体で切り替えるなら `setKtx2TranscoderPath()` の方が簡単
   */
  ktx2TranscoderPath?: string
}

/**
 * VRM を読み込む
 *
 * @param source - VRM ソース (URL文字列 / File / Blob / ArrayBuffer)
 * @param options - KTX2 トランスコーダーの設定。省略時はアプリ全体の既定値
 *                  （`setKtx2TranscoderPath()` で変更可能）に従う
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
export function loadVRM(
  source: VRMSource,
  options: LoadVRMOptions = {},
): ResultAsync<VRM, VRMLoaderError> {
  return ResultAsync.fromPromise(
    (async () => {
      const loader = new GLTFLoader()

      // KTX2Loader を設定（KTX2 テクスチャのサポート）
      // GLTFLoader と MToonAtlasLoaderPlugin で同じインスタンスを共有し、
      // 二重生成（一時 WebGLRenderer が 2 つ作られる）を避ける
      const ktx2Loader =
        options.ktx2Loader ?? resolveKtx2Loader(options.ktx2TranscoderPath)
      if (ktx2Loader) {
        loader.setKTX2Loader(ktx2Loader)
      }

      loader.register((parser) => {
        // VRMMetaLoaderPlugin をインスタンス化して広範囲のライセンスを許可
        const metaPlugin = new VRMMetaLoaderPlugin(parser, {
          acceptLicenseUrls: [
            // VRM 1.0 公式ライセンス
            'https://vrm.dev/licenses/1.0/',
            // CC0 (パブリックドメイン)
            'https://creativecommons.org/publicdomain/zero/1.0/',
            // CC BY
            'https://creativecommons.org/licenses/by/4.0/',
            // CC BY-NC
            'https://creativecommons.org/licenses/by-nc/4.0/',
            // CC BY-SA
            'https://creativecommons.org/licenses/by-sa/4.0/',
            // CC BY-NC-SA
            'https://creativecommons.org/licenses/by-nc-sa/4.0/',
            // CC BY-ND
            'https://creativecommons.org/licenses/by-nd/4.0/',
            // CC BY-NC-ND
            'https://creativecommons.org/licenses/by-nc-nd/4.0/',
          ],
        })

        return new VRMLoaderPlugin(parser, { metaPlugin })
      })
      // NodeConstraint拡張をロード（VRM1.0のaim/roll/rotation制約）
      loader.register((parser) => new VRMNodeConstraintLoaderPlugin(parser))
      loader.register(
        (parser) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new MToonAtlasLoaderPlugin(parser as any, {
            ktx2Loader: ktx2Loader ?? undefined,
            // ローダーの生成に失敗した場合、プラグイン側の再解決が
            // 既定値（CDN）に落ちないよう、指定パスも渡しておく
            ktx2TranscoderPath: options.ktx2TranscoderPath,
          }),
      )

      let gltf
      let blobUrl: string | null = null

      try {
        if (typeof source === 'string') {
          // URL から読み込み
          gltf = await loader.loadAsync(source)
        } else if (source instanceof ArrayBuffer) {
          // ArrayBuffer から読み込み
          // 空のパスを渡すとGLTFLoaderが相対パスを解決できないため、
          // Blobに変換してURLを作成
          const blob = new Blob([source], { type: 'model/gltf-binary' })
          blobUrl = URL.createObjectURL(blob)
          gltf = await loader.loadAsync(blobUrl)
        } else {
          // File / Blob から読み込み
          blobUrl = URL.createObjectURL(source)
          gltf = await loader.loadAsync(blobUrl)
        }

        const vrm = gltf.userData.vrm as VRM | undefined

        if (!vrm) {
          throw new Error('VRM data not found in loaded file')
        }

        // VRM 1.0 の VRMLoaderPlugin では _v1Import 内で scene.updateMatrixWorld() が
        // 呼ばれないため、SpringBone の setInitState() で matrixWorld が未初期化の状態で
        // エラーが発生する場合がある。
        // VRM を読み込んだ後にシーン全体の matrixWorld を更新することで、
        // すべてのノード（特に動的に追加された tail ノード）の matrixWorld を初期化する。
        vrm.scene.updateMatrixWorld(true)

        return vrm
      } finally {
        // すべての読み込みが完了した後にblob URLを解放
        // Note: GLTFLoaderはloadAsync完了時点ですべてのリソースをメモリにロード済み
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
        }
      }
    })(),
    (error): VRMLoaderError => ({
      type: 'VRM_LOAD_FAILED',
      message: `Failed to load VRM: ${String(error)}`,
    }),
  )
}

/**
 * VRM ロード機能
 * URL / File / Blob / ArrayBuffer から VRM を読み込む
 */
import type { VRM } from '@pixiv/three-vrm'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { VRMMetaLoaderPlugin } from '@pixiv/three-vrm-core'
import { VRMNodeConstraintLoaderPlugin } from '@pixiv/three-vrm-node-constraint'
import { MToonAtlasLoaderPlugin } from '@webxr-jp/mtoon-atlas'
import { ResultAsync } from 'neverthrow'
import { WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { VRMLoaderError } from '../types'

/**
 * VRM ソースの型
 * URL文字列、File、Blob、ArrayBuffer を受け付ける
 */
export type VRMSource = string | File | Blob | ArrayBuffer

// KTX2Loader のシングルトンインスタンス
// WebGLRenderer との関連付けが必要なため、遅延初期化
let ktx2LoaderInstance: KTX2Loader | null = null

/**
 * KTX2Loader を取得または初期化する
 * ブラウザ環境でのみ動作（WebGL コンテキストが必要）
 */
function getKTX2Loader(): KTX2Loader | null {
  if (ktx2LoaderInstance) {
    return ktx2LoaderInstance
  }

  // ブラウザ環境チェック
  if (
    typeof document === 'undefined' ||
    typeof WebGLRenderingContext === 'undefined'
  ) {
    return null
  }

  try {
    // KTX2Loader の初期化には WebGL コンテキストが必要
    // 一時的な canvas から WebGLRenderer を作成
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')

    if (!gl) {
      console.warn(
        'WebGL2 がサポートされていません。KTX2 テクスチャは読み込めません。',
      )
      return null
    }

    const renderer = new WebGLRenderer({
      canvas,
      context: gl,
    })

    ktx2LoaderInstance = new KTX2Loader()
    // Basis Universal transcoder のパス（CDN から読み込み）
    ktx2LoaderInstance.setTranscoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/libs/basis/',
    )
    ktx2LoaderInstance.detectSupport(renderer)

    // eslint-disable-next-line no-console
    console.log('KTX2Loader 初期化完了')

    // 一時的な renderer を破棄
    renderer.dispose()

    return ktx2LoaderInstance
  } catch (error) {
    console.warn(
      'KTX2Loader の初期化に失敗しました。KTX2 テクスチャは読み込めません。',
      error,
    )
    return null
  }
}

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

      // KTX2Loader を設定（KTX2 テクスチャのサポート）
      const ktx2Loader = getKTX2Loader()
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loader.register((parser) => new MToonAtlasLoaderPlugin(parser as any))

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

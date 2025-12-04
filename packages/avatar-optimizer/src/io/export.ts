/**
 * VRM エクスポート機能
 * VRM を Uint8Array (バイナリ) としてエクスポートする
 */
import type { VRM } from '@pixiv/three-vrm'
import { MToonAtlasExporterPlugin } from '@xrift/mtoon-atlas'
import { ResultAsync } from 'neverthrow'
import { Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { VRMExporterPlugin } from '../exporter'
import type { ExportVRMError, ExportVRMOptions } from '../types'

/**
 * VRM をバイナリとしてエクスポートする
 *
 * @param vrm - エクスポート対象の VRM
 * @param options - エクスポートオプション
 * @returns ArrayBuffer (バイナリデータ) またはエラー
 *
 * @example
 * ```typescript
 * const result = await exportVRM(vrm)
 *
 * if (result.isOk()) {
 *   // ブラウザでダウンロード
 *   const blob = new Blob([result.value], { type: 'application/octet-stream' })
 *   const url = URL.createObjectURL(blob)
 *   // ...
 *
 *   // Node.js でファイル書き出し
 *   fs.writeFileSync('output.vrm', Buffer.from(result.value))
 * }
 * ```
 */
export function exportVRM(
  vrm: VRM,
  options: ExportVRMOptions = {},
): ResultAsync<ArrayBuffer, ExportVRMError> {
  const { binary = true } = options

  return ResultAsync.fromPromise(
    new Promise<ArrayBuffer>((resolve, reject) => {
      // SpringBone を初期状態にリセット
      vrm.springBoneManager?.reset()
      vrm.springBoneManager?.setInitState()

      const exporter = new GLTFExporter()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exporter.register((writer) => new MToonAtlasExporterPlugin(writer as any))
      exporter.register((writer) => {
        const plugin = new VRMExporterPlugin(writer)
        plugin.setVRM(vrm)
        return plugin
      })

      // vrm.scene の子要素を Scene に直接追加してエクスポート
      // VRMHumanoidRig と VRMExpression はランタイム専用なので除外
      const exportScene = new Scene()
      const children = [...vrm.scene.children].filter(
        (child) =>
          child.name !== 'VRMHumanoidRig' &&
          !child.name.startsWith('VRMExpression'),
      )
      children.forEach((child) => exportScene.add(child))

      exporter.parse(
        exportScene,
        (result) => {
          // エクスポート後、子要素を元の vrm.scene に戻す
          children.forEach((child) => vrm.scene.add(child))

          try {
            if (result instanceof ArrayBuffer) {
              resolve(result)
            } else {
              // JSON 出力の場合
              const jsonString = JSON.stringify(result)
              const encoder = new TextEncoder()
              resolve(encoder.encode(jsonString).buffer as ArrayBuffer)
            }
          } catch (err) {
            reject(err)
          }
        },
        (error) => {
          // エラー時も子要素を元に戻す
          children.forEach((child) => vrm.scene.add(child))
          reject(error)
        },
        {
          binary,
          trs: false,
          onlyVisible: true,
        },
      )
    }),
    (error): ExportVRMError => ({
      type: 'EXPORT_FAILED',
      message: `Failed to export VRM: ${String(error)}`,
    }),
  )
}

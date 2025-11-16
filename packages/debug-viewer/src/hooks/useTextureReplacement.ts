import { RepeatWrapping, TextureLoader } from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { ResultAsync } from 'neverthrow'

export type TextureReplacementError =
  | { type: 'INVALID_VRM'; message: string }
  | { type: 'TEXTURE_LOAD_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

/**
 * VRMモデルのすべてのマテリアルのテクスチャを指定されたURLで置き換えます。
 * VRMのすべてのメッシュオブジェクトを走査し、
 * マテリアルのすべてのテクスチャプロパティをuv.pngで置き換えます。
 *
 * @param vrm - テクスチャを置き換えるVRMオブジェクト
 * @param textureUrl - 置き換え用テクスチャのURL
 * @returns 成功時はvoid、失敗時はエラー
 */
export function replaceVRMTextures(
  vrm: VRM,
  textureUrl: string,
): ResultAsync<void, TextureReplacementError> {
  return ResultAsync.fromPromise(
    (async () => {
      if (!vrm || !vrm.scene) {
        throw new Error('Invalid VRM object')
      }

      // テクスチャを読み込む
      const loader = new TextureLoader()
      const texture = await loader.loadAsync(textureUrl)
      texture.flipY = false;
      texture.wrapS = texture.wrapT = RepeatWrapping

      // VRMシーンのすべてのメッシュを走査
      vrm.scene.traverse((node) => {
        // Three.jsではMesh型の check
        if ((node as any).isMesh) {
          const mesh = node as any
          if (!mesh.material) return

          // material が配列の場合と単一の場合に対応
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]

          materials.forEach((material) => {
            if (!material) return

            // このテクスチャプロパティを置き換え
            const replaceTextureProperties = [
              'map',
              'shadeMultiplyTexture',
            ]
            // このテクスチャプロパティはテクスチャを外す
            const removeTextureProperties = [
              'normalMap',
              'emissiveMap',
              'shadingShiftTexture',
              'matcapTexture',
              'rimMultiplyTexture',
              'outlineWidthMultiplyTexture',
              'uvAnimationMaskTexture',
            ]

            replaceTextureProperties.forEach((prop) => {
              if (prop in material && material[prop]) {
                // 古いテクスチャを破棄
                if (material[prop].dispose) {
                  material[prop].dispose()
                }
                // 新しいテクスチャを設定
                material[prop] = texture
              }
            })

            removeTextureProperties.forEach((prop) => {
              if (prop in material && material[prop]) {
                // 古いテクスチャを破棄
                if (material[prop].dispose) {
                  material[prop].dispose()
                }
                // テクスチャを外す
                material[prop] = null
              }
            })

            // マテリアルの変更を通知
            material.needsUpdate = true
          })
        }
      })
    })(),
    (error) => ({
      type: 'TEXTURE_LOAD_FAILED' as const,
      message: `Failed to replace textures: ${String(error)}`,
    }),
  )
}

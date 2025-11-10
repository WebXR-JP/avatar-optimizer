import type { Document } from '@gltf-transform/core'
import type {
  OptimizationOptions,
  TextureSlotInfo,
  VRMStatistics,
} from './types'

/**
 * VRM モデルを最適化します
 * テクスチャ圧縮、メッシュ削減などの処理を実行
 *
 * Phase 1: baseColorテクスチャの抽出・分類
 */
export async function optimizeVRM(
  file: File,
  _options: OptimizationOptions,
): Promise<File> {
  try {
    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer()

    // gltf-transformでドキュメントをロード
    // ブラウザ環境ではWebIOを使用
    const { WebIO } = await import('@gltf-transform/core')
    const io = new WebIO()
    const document = await io.readBinary(new Uint8Array(arrayBuffer))

    // baseColorテクスチャを抽出・分類
    const textureSlotInfo = await extractBaseColorTextures(document)

    // デバッグ用にコンソールに出力
    if (textureSlotInfo.textures.length > 0) {
      console.error('[VRM Optimizer] Extracted baseColor textures:', {
        textureCount: textureSlotInfo.textures.length,
        materialCount: textureSlotInfo.materialCount,
        totalBytes: textureSlotInfo.totalBytes,
        details: textureSlotInfo.textures,
      })
    }

    // 現在のバージョンではテクスチャの変換処理は実装していない
    // そのままファイルを返す（将来的にアトラス化処理を追加）
    return file
  } catch (error) {
    console.error('[VRM Optimizer] Error during optimization:', error)
    // エラーが発生した場合は元のファイルを返す
    return file
  }
}

/**
 * GLTFドキュメントからbaseColorテクスチャを抽出・分類します
 *
 * @param document gltf-transformのドキュメント
 * @returns テクスチャスロット情報
 */
async function extractBaseColorTextures(
  document: Document,
): Promise<TextureSlotInfo> {
  const textureMap = new Map<
    string,
    {
      name: string
      width: number
      height: number
      mimeType: string
      materials: Set<string>
      bytes: number
    }
  >()

  // すべてのマテリアルを走査
  for (const material of document.getRoot().listMaterials()) {
    const materialName = material.getName() || 'unnamed'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pbr = material.getExtension<Record<string, any>>(
      'KHR_materials_pbrSpecularGlossiness',
    ) || { baseColorTexture: null }

    // baseColorMapを取得（PBRメタリック・ラフネスモデル）
    const baseColorTexture =
      material.getBaseColorTexture() || pbr.baseColorTexture

    if (baseColorTexture) {
      const textureInfo = baseColorTexture.getTexture()
      if (textureInfo) {
        const textureName = textureInfo.getName() || 'unnamed_texture'

        // テクスチャの画像データを取得
        const image = textureInfo.getImage()
        if (image) {
          const mimeType = textureInfo.getMimeType() || 'image/png'

          if (!textureMap.has(textureName)) {
            // テクスチャサイズを推定（画像バイナリサイズから）
            const bytes = image.byteLength

            // 実際の画像寸法を取得（HTMLToCanvasを使用）
            let width = 0
            let height = 0

            try {
              // Uint8ArrayをBlobに変換して、画像情報を取得
              const blob = new Blob([image], { type: mimeType })
              const url = URL.createObjectURL(blob)
              const img = new Image()

              // Promise形式で画像読み込みを待つ
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  width = img.naturalWidth
                  height = img.naturalHeight
                  URL.revokeObjectURL(url)
                  resolve()
                }
                img.onerror = () => {
                  // フォールバック: テクスチャサイズを推定
                  // PNG/JPEGの場合、ファイルサイズから推定
                  const estimatedSize = Math.sqrt(bytes / 4) // RGBA 4 bytes/pixel
                  width = Math.pow(2, Math.ceil(Math.log2(estimatedSize)))
                  height = width
                  URL.revokeObjectURL(url)
                  resolve()
                }
                img.src = url
              })
            } catch {
              // エラーが発生した場合はデフォルト値を設定
              width = 1024
              height = 1024
            }

            textureMap.set(textureName, {
              name: textureName,
              width,
              height,
              mimeType,
              materials: new Set([materialName]),
              bytes,
            })
          } else {
            // すでに記録されているテクスチャの場合はマテリアルを追加
            const existing = textureMap.get(textureName)!
            existing.materials.add(materialName)
          }
        }
      }
    }
  }

  // テクスチャ情報をフォーマット
  const textures = Array.from(textureMap.values()).map((tex) => ({
    name: tex.name,
    width: tex.width,
    height: tex.height,
    mimeType: tex.mimeType,
    materials: Array.from(tex.materials),
  }))

  const materialCount = new Set(
    Array.from(textureMap.values()).flatMap((tex) => Array.from(tex.materials)),
  ).size

  const totalBytes = Array.from(textureMap.values()).reduce(
    (sum, tex) => sum + tex.bytes,
    0,
  )

  return {
    slot: 'baseColor',
    textures,
    materialCount,
    totalBytes,
  }
}

/**
 * VRM モデルの統計情報を計算します
 *
 * TODO: 具体的な実装は後で
 */
export async function calculateVRMStatistics(
  _file: File,
): Promise<VRMStatistics> {
  // 現在のバージョンではダミー統計情報を返す
  return {
    polygonCount: 0,
    textureCount: 0,
    materialCount: 0,
    boneCount: 0,
    meshCount: 0,
    fileSizeMB: 0,
    vramEstimateMB: 0,
  }
}

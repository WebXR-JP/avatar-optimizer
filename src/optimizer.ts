import { ResultAsync } from 'neverthrow'

import type { Document } from '@gltf-transform/core'

import type {
  OptimizationError,
  OptimizationOptions,
  TextureSlotInfo,
  VRMStatistics,
} from './types'

/**
 * VRM モデルを最適化します
 * テクスチャ圧縮、メッシュ削減などの処理を実行
 *
 * Phase 1: baseColorテクスチャの抽出・分類
 *
 * @param file VRM ファイル
 * @param _options 最適化オプション
 * @returns 最適化されたファイルの Result
 */
export function optimizeVRM(
  file: File,
  _options: OptimizationOptions,
): ResultAsync<File, OptimizationError> {
  // ファイル型の検証（同期）
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file')),
      () => ({
        type: 'INVALID_FILE_TYPE' as const,
        message: 'Invalid file: expected a File object',
      })
    )
  }

  // ファイルをArrayBufferに変換
  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'LOAD_FAILED' as const,
    message: `Failed to read file: ${String(error)}`,
  }))
    .andThen((arrayBuffer) => _loadDocument(arrayBuffer))
    .andThen((document) => _extractAndLogTextures(document))
    .map(() => file) // 現在のバージョンではファイルをそのまま返す
}

/**
 * ArrayBuffer から glTF-Transform ドキュメントをロードします（内部用）
 */
function _loadDocument(
  arrayBuffer: ArrayBuffer,
): ResultAsync<Document, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const { WebIO } = await import('@gltf-transform/core')
      const io = new WebIO()
      const document = await io.readBinary(new Uint8Array(arrayBuffer))
      if (!document) {
        throw new Error('Document is null')
      }
      return document
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to parse VRM document: ${String(error)}`,
    })
  )
}

/**
 * baseColor テクスチャを抽出してログに出力します（内部用）
 */
function _extractAndLogTextures(
  document: Document,
): ResultAsync<void, OptimizationError> {
  return ResultAsync.fromPromise(
    extractBaseColorTextures(document),
    (error) => ({
      type: 'TEXTURE_EXTRACTION_FAILED' as const,
      message: `Failed to extract textures: ${String(error)}`,
    })
  ).map((textureSlotInfo) => {
    // デバッグ用にコンソールに出力
    if (textureSlotInfo.textures.length > 0) {
      console.error('[VRM Optimizer] Extracted baseColor textures:', {
        textureCount: textureSlotInfo.textures.length,
        materialCount: textureSlotInfo.materialCount,
        totalBytes: textureSlotInfo.totalBytes,
        details: textureSlotInfo.textures,
      })
    }
  })
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
    const pbr = material.getExtension<any>(
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
export function calculateVRMStatistics(
  _file: File,
): ResultAsync<VRMStatistics, OptimizationError> {
  // 現在のバージョンではダミー統計情報を返す
  return ResultAsync.fromPromise(
    Promise.resolve({
      polygonCount: 0,
      textureCount: 0,
      materialCount: 0,
      boneCount: 0,
      meshCount: 0,
      fileSizeMB: 0,
      vramEstimateMB: 0,
    }),
    (error) => ({
      type: 'UNKNOWN_ERROR' as const,
      message: `Failed to calculate statistics: ${String(error)}`,
    })
  )
}

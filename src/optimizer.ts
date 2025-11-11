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

import { atlasTexturesInDocument, type AtlasError } from '@xrift/avatar-optimizer-texture-atlas'
import * as Types from './types'

/**
 * VRM モデルを最適化します
 * テクスチャ圧縮、メッシュ削減などの処理を実行
 *
 * Phase 1: baseColorテクスチャの抽出・分類
 *
 * @param file VRM ファイル
 * @param options 最適化オプション
 * @returns 最適化されたファイルの Result
 */
export function optimizeVRM(
  file: File,
  options: Types.OptimizationOptions,
): ResultAsync<File, Types.OptimizationError> {
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
    .andThen((document) => {
      // ドキュメント内の最大テクスチャサイズを検出してスケール係数を自動計算
      const maxTextureSize = _getMaxTextureSize(document)
      const textureScale = maxTextureSize
        ? _calculateTextureScale(maxTextureSize, options.maxTextureSize)
        : 1.0

      // Store original extensions before atlasing
      const originalExtensionsUsed = Array.from(document.getRoot().listExtensionsUsed())

      // Call atlasTexturesInDocument
      return atlasTexturesInDocument(document, {
        maxSize: options.maxTextureSize,
        textureScale: textureScale,
      }).map((atlasResult) => {
        // Restore original extensions to the optimized document
        const optimizedRoot = atlasResult.document.getRoot()

        // Re-add extensions that were in the original document
        for (const ext of originalExtensionsUsed) {
          if (!optimizedRoot.listExtensionsUsed().includes(ext)) {
            optimizedRoot.addExtension(ext)
          }
        }

        return atlasResult
      }).mapErr((atlasError: AtlasError) => { // Explicitly type atlasError
        // Map AtlasError types to OptimizationError
        let mappedError: Types.OptimizationError;
        switch (atlasError.type) {
          case 'INVALID_TEXTURE':
            mappedError = { type: 'PROCESSING_FAILED', message: `Invalid texture for atlasing: ${atlasError.message}` };
            break;
          case 'PACKING_FAILED':
            mappedError = { type: 'PROCESSING_FAILED', message: `Texture packing failed: ${atlasError.message}` };
            break;
          case 'CANVAS_ERROR':
            mappedError = { type: 'PROCESSING_FAILED', message: `Canvas operation failed during atlasing: ${atlasError.message}` };
            break;
          case 'DOCUMENT_ERROR':
            mappedError = { type: 'PROCESSING_FAILED', message: `Document error during atlasing: ${atlasError.message}` };
            break;
          case 'UV_MAPPING_FAILED':
            mappedError = { type: 'PROCESSING_FAILED', message: `UV remapping failed during atlasing: ${atlasError.message}` };
            break;
          case 'UNKNOWN_ERROR':
          default:
            mappedError = { type: 'UNKNOWN_ERROR', message: `Texture atlasing failed: ${atlasError.message}` };
            break;
        }
        return mappedError;
      })
    })
    .andThen((atlasResult) => {
      // Write the updated document to a new file
      return ResultAsync.fromPromise(
        (async () => {
          const { WebIO } = await import('@gltf-transform/core')
          const io = new WebIO()

          // Preserve original document's extensions in the optimized document
          const optimizedDoc = atlasResult.document

          const newArrayBuffer = await io.writeBinary(optimizedDoc)
          const newUint8Array = new Uint8Array(newArrayBuffer)
          return new File([newUint8Array], file.name, { type: file.type })
        })(),
        (error) => ({
          type: 'PROCESSING_FAILED', // Use a more specific error type if possible
          message: `Failed to write optimized file: ${String(error)}`,
        } as Types.ProcessingError)
      )
    })
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
 * ドキュメント内の全テクスチャの最大サイズを取得します（内部用）
 * @param document glTF-Transform ドキュメント
 * @returns 最大幅と高さ（ピクセル）。テクスチャがない場合は undefined
 */
function _getMaxTextureSize(document: Document): { width: number; height: number } | undefined {
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    return undefined
  }

  let maxWidth = 0
  let maxHeight = 0

  for (const texture of textures) {
    const image = texture.getImage()
    if (image) {
      // glTF-Transform では texture.getSize() で [width, height] の配列を取得
      const size = texture.getSize()
      if (size) {
        const [width, height] = size
        if (width) maxWidth = Math.max(maxWidth, width)
        if (height) maxHeight = Math.max(maxHeight, height)
      }
    }
  }

  return maxWidth > 0 && maxHeight > 0 ? { width: maxWidth, height: maxHeight } : undefined
}

/**
 * 現在の最大テクスチャサイズから目標サイズに収まるスケール係数を計算します（内部用）
 * @param currentSize 現在の最大テクスチャサイズ
 * @param targetMaxSize 目標となる最大テクスチャサイズ
 * @returns スケール係数（0.1～1.0）
 */
function _calculateTextureScale(currentSize: { width: number; height: number }, targetMaxSize: number): number {
  const currentMax = Math.max(currentSize.width, currentSize.height)
  if (currentMax <= targetMaxSize) {
    return 1.0 // 既に目標サイズ以下なのでスケーリング不要
  }

  const scale = targetMaxSize / currentMax
  // 0.1 ～ 1.0 の範囲に制限
  return Math.max(0.1, Math.min(1.0, scale))
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

/**
 * VRM ファイルをバリデーションします
 * vrm-validator を使用して VRM の整合性と仕様準拠を確認
 *
 * @param file VRM ファイル
 * @returns バリデーション結果
 */
export function validateVRMFile(
  file: File,
): ResultAsync<Types.VRMValidationResult, Types.ValidationError> {
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

  // ファイルをArrayBufferに変換してバリデーション実行
  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'INVALID_FILE_TYPE' as const,
    message: `Failed to read file: ${String(error)}`,
  }))
    .andThen((arrayBuffer) => _validateVRMBytes(new Uint8Array(arrayBuffer)))
}

/**
 * Uint8Array から VRM をバリデーションします（内部用）
 */
function _validateVRMBytes(
  data: Uint8Array,
): ResultAsync<Types.VRMValidationResult, Types.ValidationError> {
  return ResultAsync.fromPromise(
    (async () => {
      // vrm-validator を動的にインポート
      // @ts-expect-error - vrm-validator は型定義がないため
      const vrmValidator = await import('vrm-validator')

      // バリデーション実行
      const report = await vrmValidator.validateBytes(data, {
        uri: 'model.vrm',
        format: 'glb',
      })

      // バリデーション結果を VRMValidationResult 形式に変換
      // issues は { messages: [...], numErrors: number, ... } 構造
      const messages = (report.issues?.messages || []) as any[]
      const isValid = (report.issues?.numErrors || 0) === 0
      const issues: Types.VRMValidationIssue[] = messages.map((message: any) => ({
        code: message.code || 'UNKNOWN',
        message: message.message || 'Unknown issue',
        severity: _mapSeverity(message.severity),
        pointer: message.pointer,
      }))

      return {
        isValid,
        issues,
        info: report.info,
      } as Types.VRMValidationResult
    })(),
    (error) => ({
      type: 'VALIDATOR_ERROR' as const,
      message: `VRM validation failed: ${String(error)}`,
    })
  )
}

/**
 * vrm-validator の severity をマップします（内部用）
 */
function _mapSeverity(severity: string): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'Error':
      return 'error'
    case 'Warning':
      return 'warning'
    case 'Information':
      return 'info'
    default:
      return 'info'
  }
}

import type { Document } from '@gltf-transform/core'
import { ResultAsync } from 'neverthrow'

import { atlasTexturesInDocument, type AtlasError } from '@xrift/avatar-optimizer-texture-atlas'

import type { OptimizationError, OptimizationOptions, ProcessingError } from '../types'
import {
  calculateTextureScale,
  documentToJSON,
  extractVRMExtensionFromBinary,
  getMaxTextureSize,
  jsonDocumentToGLB,
  loadDocument,
  mergeVRMIntoJSON,
} from '../vrm/document'

/**
 * VRM モデルを最適化します
 * テクスチャ圧縮、メッシュ削減などの処理を実行
 *
 * 処理フロー：
 * 1. ファイルをArrayBufferに変換
 * 2. JSON レベルで VRM 拡張データを抽出（glTF-Transform ロード前）
 * 3. ドキュメントをロード（VRM なしで処理）
 * 4. テクスチャアトラス化実行
 * 5. JSON 出力時に VRM データを再統合
 * 6. JSON から Document に変換してバイナリに出力
 *
 * @param file VRM ファイル
 * @param options 最適化オプション
 * @returns 最適化されたファイルの Result
 */
export function optimizeVRM(
  file: File,
  options: OptimizationOptions,
): ResultAsync<File, OptimizationError> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file')),
      () => ({
        type: 'INVALID_FILE_TYPE' as const,
        message: 'Invalid file: expected a File object',
      })
    )
  }

  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'LOAD_FAILED' as const,
    message: `Failed to read file: ${String(error)}`,
  }))
    .andThen((arrayBuffer) =>
      extractVRMExtensionFromBinary(arrayBuffer).map((vrmExtension) => ({
        arrayBuffer,
        vrmExtension,
      }))
    )
    .andThen(({ arrayBuffer, vrmExtension }) =>
      loadDocument(arrayBuffer).map((document) => ({
        document,
        vrmExtension,
      }))
    )
    .andThen(({ document, vrmExtension }) => {
      const textureScale = resolveTextureScale(document, options.maxTextureSize)

      return atlasTexturesInDocument(document, {
        maxSize: options.maxTextureSize,
        textureScale,
      })
        .mapErr(mapAtlasError)
        .map((atlasResult) => ({
          processedDocument: atlasResult.document,
          vrmExtension,
        }))
    })
    .andThen(({ processedDocument, vrmExtension }) =>
      ResultAsync.fromPromise(
        documentToJSON(processedDocument).then((jsonDoc) => ({
          jsonDoc,
          vrmExtension,
        })),
        (error) => ({
          type: 'PROCESSING_FAILED' as const,
          message: `Failed to convert document to JSON: ${String(error)}`,
        })
      )
    )
    .map(({ jsonDoc, vrmExtension }) => mergeVRMIntoJSON(jsonDoc, vrmExtension))
    .andThen((mergedJsonDoc) =>
      ResultAsync.fromPromise(
        jsonDocumentToGLB(mergedJsonDoc).then((arrayBuffer) => {
          const newUint8Array = new Uint8Array(arrayBuffer)
          return new File([newUint8Array], file.name, { type: file.type })
        }),
        (error) => ({
          type: 'PROCESSING_FAILED',
          message: `Failed to write optimized file with VRM data: ${String(error)}`,
        } as ProcessingError)
      )
    )
}

function resolveTextureScale(document: Document, targetMaxSize: number): number {
  const maxTextureSize = getMaxTextureSize(document)
  if (!maxTextureSize) {
    return 1.0
  }

  return calculateTextureScale(maxTextureSize, targetMaxSize)
}

function mapAtlasError(atlasError: AtlasError): OptimizationError {
  switch (atlasError.type) {
    case 'INVALID_TEXTURE':
      return {
        type: 'PROCESSING_FAILED',
        message: `Invalid texture for atlasing: ${atlasError.message}`,
      }
    case 'PACKING_FAILED':
      return {
        type: 'PROCESSING_FAILED',
        message: `Texture packing failed: ${atlasError.message}`,
      }
    case 'CANVAS_ERROR':
      return {
        type: 'PROCESSING_FAILED',
        message: `Canvas operation failed during atlasing: ${atlasError.message}`,
      }
    case 'DOCUMENT_ERROR':
      return {
        type: 'PROCESSING_FAILED',
        message: `Document error during atlasing: ${atlasError.message}`,
      }
    case 'UV_MAPPING_FAILED':
      return {
        type: 'PROCESSING_FAILED',
        message: `UV remapping failed during atlasing: ${atlasError.message}`,
      }
    case 'UNKNOWN_ERROR':
    default:
      return {
        type: 'UNKNOWN_ERROR',
        message: `Texture atlasing failed: ${atlasError.message}`,
      }
  }
}

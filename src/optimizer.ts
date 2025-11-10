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

import { atlasTexturesInDocument, type AtlasError } from '@xrift/textranscore-ts'
import type { CreateCanvasFactory } from '../third-party/TexTransCoreTS/src/types'
import * as Types from './types'

/**
 * VRM モデルを最適化します
 * テクスチャ圧縮、メッシュ削減などの処理を実行
 *
 * Phase 1: baseColorテクスチャの抽出・分類
 *
 * @param file VRM ファイル
 * @param options 最適化オプション
 * @param createCanvasFactory Canvas インスタンスを作成するためのファクトリ関数
 * @param createImageDataFactory ImageData インスタンスを作成するためのファクトリ関数
 * @returns 最適化されたファイルの Result
 */
export function optimizeVRM(
  file: File,
  options: Types.OptimizationOptions,
  createCanvasFactory: CreateCanvasFactory,
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
      // Call atlasTexturesInDocument
      return atlasTexturesInDocument(document, {
        maxSize: options.maxTextureSize,
      }, createCanvasFactory).mapErr((atlasError: AtlasError) => { // Explicitly type atlasError
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
          const newArrayBuffer = await io.writeBinary(atlasResult.document)
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

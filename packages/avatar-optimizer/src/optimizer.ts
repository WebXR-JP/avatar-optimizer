import { ResultAsync } from 'neverthrow'

import type { Document, JSONDocument } from '@gltf-transform/core'

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
 * GLB バイナリから JSON チャンクを直接抽出
 * GLB フォーマット: [header(12)] [jsonChunk] [binChunk]
 *
 * @param arrayBuffer GLB バイナリデータ
 * @returns JSON オブジェクト
 */
function _parseGLBJson(arrayBuffer: ArrayBuffer): Record<string, any> {
  const view = new DataView(arrayBuffer)
  const magic = view.getUint32(0, true)

  // GLB フォーマットの確認（magic number: 0x46546C67 = 'glTF'）
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file format')
  }

  // GLB ヘッダーをスキップ（12 バイト: magic + version + length）
  let offset = 12
  const chunks: Map<number, Uint8Array> = new Map()

  // チャンク処理ループ
  while (offset < arrayBuffer.byteLength) {
    // チャンクサイズと タイプを読み込み
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)

    offset += 8 // チャンクヘッダーをスキップ

    // チャンクデータを抽出
    const chunkData = new Uint8Array(arrayBuffer, offset, chunkLength)
    chunks.set(chunkType, chunkData)

    offset += chunkLength
  }

  // JSON チャンク（type: 0x4E4F534A = 'JSON'）を取得
  const jsonChunk = chunks.get(0x4e4f534a)
  if (!jsonChunk) {
    throw new Error('No JSON chunk found in GLB')
  }

  // JSON 文字列をデコード
  const jsonText = new TextDecoder().decode(jsonChunk)
  return JSON.parse(jsonText)
}

/**
 * GLB バイナリから JSON レベルで VRM 拡張データを抽出
 * ArrayBuffer → JSON → VRM 拡張データ
 *
 * glTF-Transform は VRM 1.0 の拡張を標準でサポートしていないため、
 * JSON レベルで直接 VRM データを抽出する。
 *
 * @param arrayBuffer GLB バイナリデータ
 * @returns VRM 拡張データ
 */
function _extractVRMExtensionFromBinary(
  arrayBuffer: ArrayBuffer,
): ResultAsync<Record<string, any> | null, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      // GLB バイナリから JSON を直接抽出
      const gltfJson = _parseGLBJson(arrayBuffer)

      // VRM 拡張データを抽出（存在する場合）
      const vrmExtension = gltfJson.extensions?.VRM ?? null

      return vrmExtension
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to extract VRM extension from binary: ${String(error)}`,
    })
  )
}

/**
 * VRM 拡張データを処理後の JSON に再統合
 * JSON + VRM 拡張データ → JSON
 *
 * 処理後に抽出した VRM 拡張データを再度マージする。
 * extensionsUsed に "VRM" を追加する。
 *
 * @param jsonDoc 処理後の JSONDocument
 * @param vrmExtension 抽出した VRM 拡張データ（null の場合はスキップ）
 * @returns VRM データを含む JSONDocument
 */
function _mergeVRMIntoJSON(
  jsonDoc: JSONDocument,
  vrmExtension: Record<string, any> | null
): JSONDocument {
  if (!vrmExtension) {
    return jsonDoc
  }

  // VRM 拡張データを JSON に再統合
  const mergedJson = {
    ...jsonDoc.json,
    extensions: {
      ...(jsonDoc.json.extensions || {}),
      VRM: vrmExtension,
    },
  }

  // extensionsUsed に "VRM" を追加
  if (!mergedJson.extensionsUsed) {
    mergedJson.extensionsUsed = []
  }
  if (!mergedJson.extensionsUsed.includes('VRM')) {
    mergedJson.extensionsUsed.push('VRM')
  }

  return {
    json: mergedJson,
    resources: jsonDoc.resources,
  }
}

/**
 * JSONDocument をバイナリ GLB に変換
 * glTF-Transform の writeBinary の代わりに、JSON を直接 GLB に変換
 * これにより VRM 拡張データが保持される
 *
 * @param jsonDoc VRM データを含む JSONDocument
 * @returns GLB バイナリデータ
 */
async function _jsonDocumentToGLB(jsonDoc: JSONDocument): Promise<ArrayBuffer> {
  const { WebIO } = await import('@gltf-transform/core')
  const io = new WebIO()

  // JSON を Document に変換（VRM は認識されないが、後で JSON レベルで復元）
  const document = await io.readJSON(jsonDoc)

  // Document をバイナリに変換
  const glbData = await io.writeBinary(document)

  // GLB バイナリから JSON チャンクを抽出して VRM を再度注入
  const glbArrayBuffer = (() => {
    if (glbData instanceof ArrayBuffer) {
      return glbData
    }
    if (glbData instanceof Uint8Array) {
      return glbData.buffer.slice(glbData.byteOffset, glbData.byteOffset + glbData.byteLength)
    }
    return (glbData as any).buffer
  })()
  return _injectVRMIntoGLB(glbArrayBuffer as ArrayBuffer, jsonDoc.json.extensions?.VRM ?? null)
}

/**
 * GLB バイナリの JSON チャンクに VRM データを注入
 * 既存の GLB をパース、JSON チャンクを更新、GLB を再構成
 *
 * @param glbData 元の GLB バイナリ
 * @param vrmExtension VRM 拡張データ
 * @returns VRM データを含む GLB バイナリ
 */
function _injectVRMIntoGLB(glbData: ArrayBuffer, vrmExtension: Record<string, any> | null): ArrayBuffer {
  if (!vrmExtension) {
    return glbData
  }

  const view = new DataView(glbData)

  // GLB ヘッダーを読み取り
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file format')
  }

  const version = view.getUint32(4, true)

  let offset = 12
  const chunks: Array<{ type: number; data: Uint8Array }> = []

  // チャンクを抽出
  while (offset < glbData.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)

    offset += 8

    const chunkData = new Uint8Array(glbData, offset, chunkLength)
    chunks.push({ type: chunkType, data: new Uint8Array(chunkData) })

    offset += chunkLength
  }

  // JSON チャンクを見つけて VRM を注入
  const jsonChunkIndex = chunks.findIndex((c) => c.type === 0x4e4f534a)
  if (jsonChunkIndex >= 0) {
    const jsonText = new TextDecoder().decode(chunks[jsonChunkIndex].data)
    const json = JSON.parse(jsonText)

    // VRM を注入
    if (!json.extensions) {
      json.extensions = {}
    }
    json.extensions.VRM = vrmExtension

    // extensionsUsed に "VRM" を追加
    if (!json.extensionsUsed) {
      json.extensionsUsed = []
    }
    if (!json.extensionsUsed.includes('VRM')) {
      json.extensionsUsed.push('VRM')
    }

    // JSON を再エンコード
    const newJsonText = JSON.stringify(json)
    const newJsonData = new TextEncoder().encode(newJsonText)

    // JSON チャンクは4バイト境界にパディングが必要
    // パディングサイズを計算（4バイト倍数に合わせる）
    const paddingSize = (4 - (newJsonData.byteLength % 4)) % 4
    const paddedJsonData = new Uint8Array(newJsonData.byteLength + paddingSize)
    paddedJsonData.set(newJsonData)
    // パディングバイトは0x20（スペース）で埋める
    for (let i = newJsonData.byteLength; i < paddedJsonData.byteLength; i++) {
      paddedJsonData[i] = 0x20
    }

    chunks[jsonChunkIndex].data = paddedJsonData
  }

  // GLB を再構成
  let totalSize = 12 // GLB ヘッダー

  for (const chunk of chunks) {
    totalSize += 8 + chunk.data.byteLength // チャンクヘッダー + データ
  }

  const buffer = new ArrayBuffer(totalSize)
  const newView = new DataView(buffer)
  const newData = new Uint8Array(buffer)

  // GLB ヘッダーを書き込み
  newView.setUint32(0, magic, true)
  newView.setUint32(4, version, true)
  newView.setUint32(8, totalSize, true)

  // チャンクを書き込み
  let writeOffset = 12
  for (const chunk of chunks) {
    newView.setUint32(writeOffset, chunk.data.byteLength, true)
    newView.setUint32(writeOffset + 4, chunk.type, true)
    writeOffset += 8

    newData.set(chunk.data, writeOffset)
    writeOffset += chunk.data.byteLength
  }

  return buffer
}

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
    .andThen((arrayBuffer) =>
      // Step 1: JSON レベルで VRM 拡張データを抽出
      _extractVRMExtensionFromBinary(arrayBuffer).map((vrmExtension) => ({
        arrayBuffer,
        vrmExtension,
      }))
    )
    .andThen(({ arrayBuffer, vrmExtension }) =>
      // Step 2: glTF-Transform でドキュメントをロード
      _loadDocument(arrayBuffer).map((document) => ({
        document,
        vrmExtension,
      }))
    )
    .andThen(({ document, vrmExtension }) => {
      // Step 3: ドキュメント内の最大テクスチャサイズを検出してスケール係数を自動計算
      const maxTextureSize = _getMaxTextureSize(document)
      const textureScale = maxTextureSize
        ? _calculateTextureScale(maxTextureSize, options.maxTextureSize)
        : 1.0

      // Step 4: テクスチャアトラス化を実行
      return atlasTexturesInDocument(document, {
        maxSize: options.maxTextureSize,
        textureScale: textureScale,
      })
        .mapErr((atlasError: AtlasError) => {
          // Map AtlasError types to OptimizationError
          let mappedError: Types.OptimizationError
          switch (atlasError.type) {
            case 'INVALID_TEXTURE':
              mappedError = {
                type: 'PROCESSING_FAILED',
                message: `Invalid texture for atlasing: ${atlasError.message}`,
              }
              break
            case 'PACKING_FAILED':
              mappedError = {
                type: 'PROCESSING_FAILED',
                message: `Texture packing failed: ${atlasError.message}`,
              }
              break
            case 'CANVAS_ERROR':
              mappedError = {
                type: 'PROCESSING_FAILED',
                message: `Canvas operation failed during atlasing: ${atlasError.message}`,
              }
              break
            case 'DOCUMENT_ERROR':
              mappedError = {
                type: 'PROCESSING_FAILED',
                message: `Document error during atlasing: ${atlasError.message}`,
              }
              break
            case 'UV_MAPPING_FAILED':
              mappedError = {
                type: 'PROCESSING_FAILED',
                message: `UV remapping failed during atlasing: ${atlasError.message}`,
              }
              break
            case 'UNKNOWN_ERROR':
            default:
              mappedError = {
                type: 'UNKNOWN_ERROR',
                message: `Texture atlasing failed: ${atlasError.message}`,
              }
              break
          }
          return mappedError
        })
        .map((atlasResult) => ({
          processedDocument: atlasResult.document,
          vrmExtension,
        }))
    })
    .andThen(({ processedDocument, vrmExtension }) =>
      // Step 5: 処理後のドキュメントを JSON に変換
      ResultAsync.fromPromise(
        (async () => {
          const { WebIO } = await import('@gltf-transform/core')
          const io = new WebIO()

          // ドキュメントを JSON に変換
          const jsonDoc = await io.writeJSON(processedDocument)

          return { jsonDoc, vrmExtension }
        })(),
        (error) => ({
          type: 'PROCESSING_FAILED' as const,
          message: `Failed to convert document to JSON: ${String(error)}`,
        })
      )
    )
    .map(({ jsonDoc, vrmExtension }) => {
      // Step 6: VRM 拡張データを JSON に再統合
      return _mergeVRMIntoJSON(jsonDoc, vrmExtension)
    })
    .andThen((mergedJsonDoc) =>
      // Step 7: GLB に変換（VRM データをバイナリレベルで注入）
      ResultAsync.fromPromise(
        (async () => {
          // JSON を GLB に変換して VRM を注入
          const newArrayBuffer = await _jsonDocumentToGLB(mergedJsonDoc)
          const newUint8Array = new Uint8Array(newArrayBuffer)
          return new File([newUint8Array], file.name, { type: file.type })
        })(),
        (error) => ({
          type: 'PROCESSING_FAILED',
          message: `Failed to write optimized file with VRM data: ${String(error)}`,
        } as Types.ProcessingError)
      )
    )
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

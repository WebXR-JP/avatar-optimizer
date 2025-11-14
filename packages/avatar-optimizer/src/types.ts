import type { AtlasError } from '@xrift/avatar-optimizer-texture-atlas'
import type { VRM } from '@pixiv/three-vrm'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface OptimizationOptions
{
  compressTextures: boolean
  maxTextureSize: number
  reduceMeshes: boolean
  targetPolygonCount?: number
}

/**
 * three-vrm / GLTFLoader で読み込んだ VRM ドキュメント
 */
export interface ThreeVRMDocument
{
  gltf: GLTF
  vrm: VRM
}

export interface VRMStatistics
{
  polygonCount: number
  textureCount: number
  materialCount: number
  boneCount: number
  meshCount: number
  fileSizeMB: number
  vramEstimateMB: number
}

/**
 * テクスチャスロットの情報
 * マテリアルごとにどのテクスチャがどのスロットで使用されているかを記録
 */
export interface TextureSlotInfo
{
  slot: 'baseColor'
  /** 当該スロットで使用されているテクスチャのリスト */
  textures: Array<{
    name: string
    width: number
    height: number
    mimeType: string
    materials: string[] // このテクスチャを使用しているマテリアル名のリスト
  }>
  /** テクスチャを使用しているマテリアル数（重複なし） */
  materialCount: number
  /** 総テクスチャバイト数 */
  totalBytes: number
}

/**
 * VRM バリデーション結果の詳細情報
 */
export interface VRMValidationIssue
{
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  pointer?: string
}

/**
 * VRM バリデーション結果
 */
export interface VRMValidationResult
{
  isValid: boolean
  issues: VRMValidationIssue[]
  info?: {
    generator?: string
    version?: string
  }
}

/**
 * バリデーション処理のエラー型
 */
export type ValidationError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'VALIDATION_FAILED'; message: string }
  | { type: 'VALIDATOR_ERROR'; message: string }

/**
 * テクスチャ処理などの内部処理のエラー型
 */
export type ProcessingError =
  | { type: 'PROCESSING_FAILED'; message: string }

/**

 * optimizeVRM 関数のエラー型

 * 型安全なエラーハンドリング用

 */

export type OptimizationError =

  | { type: 'INVALID_FILE_TYPE'; message: string }

  | { type: 'LOAD_FAILED'; message: string }

  | { type: 'DOCUMENT_PARSE_FAILED'; message: string }

  | { type: 'TEXTURE_EXTRACTION_FAILED'; message: string }

  | { type: 'UNKNOWN_ERROR'; message: string }

  | { type: 'UNSUPPORTED_VRM_VERSION'; message: string }

  | ValidationError

  | ProcessingError

  | AtlasError

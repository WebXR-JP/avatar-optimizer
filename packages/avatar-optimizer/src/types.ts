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
 * Material最適化関連のエラー型
 *
 * optimizeModelMaterials などの Material 処理で発生するエラー
 */
export type MaterialOptimizationError =
  | { type: 'NO_MATERIALS_FOUND'; message: string }
  | { type: 'INVALID_MATERIAL_TYPE'; message: string }
  | { type: 'ATLAS_GENERATION_FAILED'; message: string; cause?: unknown }
  | { type: 'UV_REMAPPING_FAILED'; message: string; cause?: unknown }
  | { type: 'GEOMETRY_PROCESSING_FAILED'; message: string; cause?: unknown }
  | { type: 'TEXTURE_PROCESSING_FAILED'; message: string; cause?: unknown }
  | { type: 'PACKING_FAILED'; message: string; cause?: unknown }
  | { type: 'MATERIAL_COMBINE_FAILED'; message: string; cause?: unknown }

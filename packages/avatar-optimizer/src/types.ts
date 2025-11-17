import type { VRM } from '@pixiv/three-vrm'
import { Texture, TypedArray, Vector2 } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Three.jsのImageに相当するUnion型
 * Three.js自体には含まれていないので自分で定義している
 */
export type ThreeImageType =
  HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas
  | ImageData
  | { data: TypedArray; width: number; height: number; };

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
 * テクスチャスロット名の型
 */
export const MTOON_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'emissiveMap',
  'shadeMultiplyTexture',
  'shadingShiftTexture',
  'matcapTexture',
  'rimMultiplyTexture',
  'outlineWidthMultiplyTexture',
  'uvAnimationMaskTexture',
] as const
export type MToonTextureSlot = typeof MTOON_TEXTURE_SLOTS[number];

/**
 * テクスチャスロット名をキーにしたアトラス画像マップの型
 */
export type AtlasImageMap = Record<MToonTextureSlot, Texture>

/**
 * テクスチャ組み合わせパターン
 * 各スロットに設定されているテクスチャのImage参照を保持
 */
export interface TextureCombinationPattern
{
  /** 各スロットのImage参照（nullの場合はテクスチャなし） */
  slots: Map<MToonTextureSlot, ThreeImageType | null>
}

/**
 * 組み合わせパターンとマテリアルのマッピング情報
 */
export interface PatternMaterialMapping
{
    /** 一意な組み合わせパターン */
    pattern: TextureCombinationPattern
    /** このパターンを使用するマテリアルのインデックス配列 */
    materialIndices: number[]
    /** パッキング用のテクスチャディスクリプタ */
    textureDescriptor: AtlasTextureDescriptor
}

/**
 * アトラス化対象となる1枚のテクスチャ
 */
export interface AtlasTextureDescriptor
{
  /** 画像の幅（ピクセル） */
  width: number
  /** 画像の高さ（ピクセル） */
  height: number
}

/**
 * 主にUVで使用するオフセットとスケール情報
 */
export interface OffsetScale
{
  offset: Vector2,
  scale: Vector2,
}

/**
 * 最適化関連のエラー型 (全体)
 *
 * optimizeModel などの 全体最適化処理で発生するエラー
 */
export type OptimizationError =
  | { type: 'NO_MATERIALS_FOUND'; message: string }
  | { type: 'INVALID_MATERIAL_TYPE'; message: string }
  | { type: 'ATLAS_GENERATION_FAILED'; message: string; cause?: unknown }
  | { type: 'UV_REMAPPING_FAILED'; message: string; cause?: unknown }
  | { type: 'GEOMETRY_PROCESSING_FAILED'; message: string; cause?: unknown }
  | { type: 'TEXTURE_PROCESSING_FAILED'; message: string; cause?: unknown }
  | { type: 'PACKING_FAILED'; message: string; cause?: unknown }
  | { type: 'MATERIAL_COMBINE_FAILED'; message: string; cause?: unknown }

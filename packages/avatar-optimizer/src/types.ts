import type { VRM } from '@pixiv/three-vrm'
import { ParameterSemanticId } from '@xrift/mtoon-atlas';
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
 * パラメータのパッキングレイアウト定義
 * mtoon-atlas の DEFAULT_PARAMETER_LAYOUT と同じ構造
 */
export interface ParameterLayout
{
  id: ParameterSemanticId
  texel: number
  channels: readonly ('r' | 'g' | 'b' | 'a')[]
}

/**
 * デフォルトパラメータレイアウト
 * mtoon-atlas/src/types.ts の DEFAULT_PARAMETER_LAYOUT と同一
 */
export const PARAMETER_LAYOUT: readonly ParameterLayout[] = [
  { id: 'baseColor', texel: 0, channels: ['r', 'g', 'b'] },
  { id: 'shadingShift', texel: 0, channels: ['a'] },
  { id: 'shadeColor', texel: 1, channels: ['r', 'g', 'b'] },
  { id: 'shadingShiftTextureScale', texel: 1, channels: ['a'] },
  { id: 'emissiveColor', texel: 2, channels: ['r', 'g', 'b'] },
  { id: 'emissiveIntensity', texel: 2, channels: ['a'] },
  { id: 'matcapColor', texel: 3, channels: ['r', 'g', 'b'] },
  { id: 'outlineWidth', texel: 3, channels: ['a'] },
  { id: 'outlineColor', texel: 4, channels: ['r', 'g', 'b'] },
  { id: 'outlineLightingMix', texel: 4, channels: ['a'] },
  { id: 'parametricRimColor', texel: 5, channels: ['r', 'g', 'b'] },
  { id: 'parametricRimLift', texel: 5, channels: ['a'] },
  { id: 'parametricRimFresnelPower', texel: 6, channels: ['r'] },
  { id: 'shadingToony', texel: 6, channels: ['g'] },
  { id: 'rimLightingMix', texel: 6, channels: ['b'] },
  { id: 'uvAnimationRotation', texel: 6, channels: ['a'] },
  { id: 'normalScale', texel: 7, channels: ['r', 'g'] },
  { id: 'uvAnimationScrollX', texel: 7, channels: ['b'] },
  { id: 'uvAnimationScrollY', texel: 7, channels: ['a'] },
] as const

/**
 * エラー型 (全体)
 */
export type OptimizationError = { type: 'ASSET_ERROR', message: string; }
  | { type: 'INVALID_OPERATION', message: string; }
  | { type: 'INVALID_PARAMETER', message: string; }
  | { type: 'INTERNAL_ERROR', message: string; }
  | { type: 'NO_MATERIALS_FOUND', message: string; }
  | { type: 'PARAMETER_TEXTURE_FAILED', message: string; }
  | { type: 'GEOMETRY_MERGE_FAILED', message: string; }

/**
 * MToonAtlasMaterial 型定義集約
 *
 * パラメータテクスチャ、アトラステクスチャ、スロット属性の型定義
 */

import * as THREE from 'three'

/**
 * アウトライン幅モード
 *
 * MToonMaterialのアウトライン描画における幅の計算方式
 */
export type OutlineWidthMode = 'none' | 'worldCoordinates' | 'screenCoordinates'

/**
 * パラメータセマンティクス定義
 *
 * パラメータテクスチャの各テクセル・チャンネルに対応するセマンティック情報
 */
export type ParameterSemanticId =
  | 'baseColor'
  | 'opacity'
  | 'shadeColor'
  | 'emissiveColor'
  | 'emissiveIntensity'
  | 'shadingShift'
  | 'shadingShiftTextureScale'
  | 'shadingToony'
  | 'rimLightingMix'
  | 'matcapColor'
  | 'outlineWidth'
  | 'outlineColor'
  | 'outlineLightingMix'
  | 'parametricRimColor'
  | 'parametricRimLift'
  | 'parametricRimFresnelPower'
  | 'uvAnimationScrollX'
  | 'uvAnimationScrollY'
  | 'uvAnimationRotation'
  | 'normalScale'

/**
 * パラメータセマンティック定義
 *
 * パラメータテクスチャのレイアウト情報
 */
export interface ParameterSemantic {
  id: ParameterSemanticId
  texel: number
  channels: readonly ('r' | 'g' | 'b' | 'a')[]
}

/**
 * 既定のパラメータテクスチャレイアウト
 *
 * スロット（行）ごとに 9 テクセル（列）を持ち、各テクセルの RGBA に
 * 下表のパラメータを詰める。avatar-optimizer の PARAMETER_LAYOUT と同一で、
 * GLSL 版（shaders/mtoon.frag）のテクセル割り当てとも一致させること。
 *
 * shadingShift は -1〜1 を 0〜1 に詰めて保存しているため、
 * 読み出し側で `value * 2 - 1` して復元する。
 */
export const DEFAULT_PARAMETER_LAYOUT: readonly ParameterSemantic[] = [
  { id: 'baseColor', texel: 0, channels: ['r', 'g', 'b'] },
  { id: 'opacity', texel: 0, channels: ['a'] },
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
  { id: 'shadingShift', texel: 8, channels: ['r'] },
] as const

/**
 * パラメータテクスチャディスクリプタ
 *
 * avatar-optimizer で生成されたパラメータテクスチャの情報
 */
export interface ParameterTextureDescriptor {
  /** パック済みパラメータテクスチャ */
  texture: THREE.Texture

  /** スロット数（= 元のマテリアル数） */
  slotCount: number

  /** スロットあたりのテクセル数（通常8） */
  texelsPerSlot: number

  /** カスタムレイアウト定義（省略時はデフォルト） */
  semantics?: ParameterSemantic[]

  /** アトラス化されたテクスチャセット */
  atlasedTextures?: AtlasedTextureSet
}

/**
 * アトラス化テクスチャセット
 *
 * avatar-optimizer で生成されたアトラス化テクスチャの集合
 */
export interface AtlasedTextureSet {
  /** ベースカラーアトラス（MToonMaterial.map） */
  baseColor?: THREE.Texture

  /** Shade 乗算テクスチャアトラス（shadeMultiplyTexture） */
  shade?: THREE.Texture

  /** Shading Shift テクスチャアトラス（shadingShiftTexture） */
  shadingShift?: THREE.Texture

  /** ノーマルマップアトラス（normalMap） */
  normal?: THREE.Texture

  /** エミッシブマップアトラス（emissiveMap） */
  emissive?: THREE.Texture

  /** Matcap テクスチャアトラス（matcapTexture） */
  matcap?: THREE.Texture

  /** Rim 乗算テクスチャアトラス（rimMultiplyTexture） */
  rim?: THREE.Texture

  /** UV アニメーションマスクテクスチャアトラス（uvAnimationMaskTexture） */
  uvAnimationMask?: THREE.Texture
}

/**
 * マテリアルスロット属性設定
 *
 * 頂点属性経由でマテリアルスロットを指定するための設定
 */
export interface MaterialSlotAttributeConfig {
  /** 属性名（デフォルト: 'mtoonMaterialSlot'） */
  name: string

  /** 説明（オプション） */
  description?: string
}

/**
 * MToonAtlasMaterial オプション
 *
 * THREE.ShaderMaterialParameters を拡張した、インスタンシング対応オプション
 */
export interface MToonAtlasOptions extends THREE.ShaderMaterialParameters {
  // MToonNodeMaterial の既存パラメータをサポート
  /** ベースカラー */
  color?: THREE.ColorRepresentation

  /** エミッシブカラー */
  emissive?: THREE.ColorRepresentation

  /** エミッシブ強度 */
  emissiveIntensity?: number

  /** 透明度 */
  transparent?: boolean

  /** 深度書き込み */
  depthWrite?: boolean

  // インスタンシング固有オプション
  /** パラメータテクスチャディスクリプタ */
  parameterTexture?: ParameterTextureDescriptor

  /** スロット属性設定 */
  slotAttribute?: MaterialSlotAttributeConfig
}

/**
 * GLSL 版（MToonAtlasMaterial）と TSL 版（MToonAtlasNodeMaterial）に共通する
 * インターフェース
 *
 * ローダーとエクスポーターはこの範囲だけを使うことで、どちらのマテリアルも扱える
 */
export interface MToonAtlasMaterialLike extends THREE.Material
{
  /** 識別フラグ */
  readonly isMToonAtlasMaterial: true

  /** パラメータテクスチャディスクリプタ */
  readonly parameterTexture: ParameterTextureDescriptor | undefined

  /** スロット属性設定 */
  readonly slotAttribute: MaterialSlotAttributeConfig

  /** アウトライン用マテリアルかどうか */
  isOutline: boolean

  /** アウトライン幅の計算方式 */
  outlineWidthMode: OutlineWidthMode

  /** このマテリアルを元にアウトライン用マテリアルを作る */
  createOutlineMaterial(widthMode?: Exclude<OutlineWidthMode, 'none'>): MToonAtlasMaterialLike
}

/**
 * MToonAtlasLoaderPlugin が生成するマテリアルのコンストラクタ
 *
 * WebGLRenderer では MToonAtlasMaterial（既定）、WebGPURenderer では
 * `@webxr-jp/mtoon-atlas/nodes` の MToonAtlasNodeMaterial を渡す
 */
export type MToonAtlasMaterialConstructor = new (parameters: {
  parameterTexture?: ParameterTextureDescriptor
  slotAttribute?: MaterialSlotAttributeConfig
  name?: string
}) => MToonAtlasMaterialLike

/**
 * MToonAtlasMaterial 型定義集約
 *
 * パラメータテクスチャ、アトラステクスチャ、スロット属性の型定義
 */

import * as THREE from 'three'

/**
 * パラメータセマンティクス定義
 *
 * パラメータテクスチャの各テクセル・チャンネルに対応するセマンティック情報
 */
export type ParameterSemanticId =
  | 'baseColor'
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

/**
 * インスタンシング マテリアル実装で共有される型宣言。
 *
 * このパッケージの目標は、通常マテリアルごとに変動する
 * MToonNodeMaterial ユニフォームを、インスタンスごとに
 * サンプリング可能なテクセルデータで置き換えることです。
 * 以下の型は、マテリアルがそのデータをデコードするために
 * 必要なメタデータをキャプチャします。
 */

import type { Texture } from 'three'
import type {
  MToonNodeMaterialParameters,
} from '@pixiv/three-vrm-materials-mtoon/nodes'

/**
 * インスタンス描画のマテリアルスロットインデックスを保持する
 * ジオメトリ属性を説明するメタデータ。
 */
export interface MaterialSlotAttributeConfig {
  /**
   * インスタンス化されたバッファジオメトリ上の属性名。
   * バッファは、インスタンスごとに単一のフロート値を含むことが予期されます。
   * このフロート値はパラメータテクスチャ内のスロットインデックスを指します。
   */
  name: string

  /**
   * 属性の生成方法を説明するオプション説明。
   * これは主に avatar-optimizer の出力をレンダラーに配線する
   * ツーリングで使用されます。
   */
  description?: string
}

const TEXEL_CHANNELS = ['r', 'g', 'b', 'a'] as const
type TexelChannel = (typeof TEXEL_CHANNELS)[number]

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

export interface ParameterSemantic {
  id: ParameterSemanticId
  texel: number
  channels: readonly TexelChannel[]
  description?: string
}

export const DEFAULT_PARAMETER_LAYOUT: readonly ParameterSemantic[] = [
  {
    id: 'baseColor',
    texel: 0,
    channels: ['r', 'g', 'b'],
    description: 'ベースディフューズカラー (linear RGB)。',
  },
  {
    id: 'shadingShift',
    texel: 0,
    channels: ['a'],
    description: 'シェーディングシフト係数。',
  },
  {
    id: 'shadeColor',
    texel: 1,
    channels: ['r', 'g', 'b'],
    description: 'シェードパス用カラー。',
  },
  {
    id: 'shadingShiftTextureScale',
    texel: 1,
    channels: ['a'],
    description: 'シェーディングシフトテクスチャ寄与スケール。',
  },
  {
    id: 'emissiveColor',
    texel: 2,
    channels: ['r', 'g', 'b'],
    description: 'エミッシブカラー。',
  },
  {
    id: 'emissiveIntensity',
    texel: 2,
    channels: ['a'],
    description: 'エミッシブ強度。',
  },
  {
    id: 'matcapColor',
    texel: 3,
    channels: ['r', 'g', 'b'],
    description: 'Matcap カラー係数。',
  },
  {
    id: 'outlineWidth',
    texel: 3,
    channels: ['a'],
    description: 'アウトライン幅。',
  },
  {
    id: 'outlineColor',
    texel: 4,
    channels: ['r', 'g', 'b'],
    description: 'アウトラインカラー。',
  },
  {
    id: 'outlineLightingMix',
    texel: 4,
    channels: ['a'],
    description: 'アウトラインのライティングミックス係数。',
  },
  {
    id: 'parametricRimColor',
    texel: 5,
    channels: ['r', 'g', 'b'],
    description: 'パラメトリックリムカラー。',
  },
  {
    id: 'parametricRimLift',
    texel: 5,
    channels: ['a'],
    description: 'パラメトリックリムリフト。',
  },
  {
    id: 'parametricRimFresnelPower',
    texel: 6,
    channels: ['r'],
    description: 'パラメトリックリムフレネルパワー。',
  },
  {
    id: 'shadingToony',
    texel: 6,
    channels: ['g'],
    description: 'シェーディングトゥーニー係数。',
  },
  {
    id: 'rimLightingMix',
    texel: 6,
    channels: ['b'],
    description: 'リムライティング比率。',
  },
  {
    id: 'uvAnimationRotation',
    texel: 6,
    channels: ['a'],
    description: 'UV アニメーション回転速度。',
  },
  {
    id: 'normalScale',
    texel: 7,
    channels: ['r', 'g'],
    description: 'ノーマルマップスケール (x, y)。',
  },
  {
    id: 'uvAnimationScrollX',
    texel: 7,
    channels: ['b'],
    description: 'UV アニメーション X スクロール。',
  },
  {
    id: 'uvAnimationScrollY',
    texel: 7,
    channels: ['a'],
    description: 'UV アニメーション Y スクロール。',
  },
] as const

export const DEFAULT_PARAMETER_TEXELS_PER_SLOT =
  Math.max(...DEFAULT_PARAMETER_LAYOUT.map((entry) => entry.texel)) + 1

/**
 * アトラス化されたテクスチャセット。
 * インスタンシング時に使用する各種テクスチャマップを格納します。
 */
export interface AtlasedTextureSet {
  /**
   * ベースカラーテクスチャ (MToonNodeMaterial.map)
   */
  baseColor?: Texture

  /**
   * シェード乗算テクスチャ (MToonNodeMaterial.shadeMultiplyTexture)
   */
  shade?: Texture

  /**
   * シェーディングシフトテクスチャ (MToonNodeMaterial.shadingShiftTexture)
   */
  shadingShift?: Texture

  /**
   * ノーマルマップ (MToonNodeMaterial.normalMap)
   */
  normal?: Texture

  /**
   * エミッシブマップ (MToonNodeMaterial.emissiveMap)
   */
  emissive?: Texture

  /**
   * Matcap テクスチャ (MToonNodeMaterial.matcapTexture)
   */
  matcap?: Texture

  /**
   * リム乗算テクスチャ (MToonNodeMaterial.rimMultiplyTexture)
   */
  rim?: Texture

  /**
   * UV アニメーションマスクテクスチャ (MToonNodeMaterial.uvAnimationMaskTexture)
   */
  uvAnimationMask?: Texture
}

/**
 * マテリアルごとの定数を含むパラメータテクスチャのディスクリプタ。
 */
export interface ParameterTextureDescriptor {
  /**
   * パック済みパラメータを含むテクスチャ。各スロットは
   * インスタンシング/結合前の 1 つのマテリアルに対応します。
   */
  texture: Texture

  /**
   * テクスチャに格納されるスロット数。これはシェーダー側の
   * サンプリングが有効な UV 座標を計算するために必要です。
   */
  slotCount: number

  /**
   * 単一スロットに割り当てられるテクセルの数。
   */
  texelsPerSlot: number

  /**
   * ツールがレイアウトを理解するために検査できるオプション セマンティクス リスト。
   * ランタイムは現在これをメタデータとして扱いますが、
   * 今後のバージョンではシェーダーノードがここから導出されます。
   * // TODO: セマンティクスをシェーダーグラフにフックします。
   */
  semantics?: ParameterSemantic[]

  /**
   * アトラス化されたテクスチャセット。
   * 指定された場合、マテリアルのテクスチャマップが自動的に設定されます。
   */
  atlasedTextures?: AtlasedTextureSet
}

/**
 * {@link MToonInstancingMaterial} でサポートされるオプション。
 *
 * 形状は {@link MToonNodeMaterialParameters} をミラーリングして
 * 採用を容易にします。同時に呼び出し元がインスタンシング固有の
 * メタデータを指定できるようにします。
 */
export interface MToonInstancingOptions
  extends Partial<MToonNodeMaterialParameters> {
  /**
   * パック済みパラメータテクスチャのディスクリプタ。
   */
  parameterTexture?: ParameterTextureDescriptor

  /**
   * スロットインデックスを格納する属性の構成。
   */
  slotAttribute?: MaterialSlotAttributeConfig
}

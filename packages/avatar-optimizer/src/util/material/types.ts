/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import { MToonMaterial } from '@pixiv/three-vrm'
import { MToonAtlasMaterial } from '@xrift/mtoon-atlas'
import { Matrix3, Mesh } from 'three'
import { OffsetScale } from '../../types'

/**
 * テクスチャパッキングの結果
 */
export interface PackingLayouts {
  /** パックされたテクスチャ情報 */
  packed: OffsetScale[]
}

/**
 * テクスチャ画像データ
 */
export interface TextureImageData {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * スロットごとに生成されたアトラス画像
 */
export interface SlotAtlasImage {
  /** アトラス PNG などのバイナリバッファ */
  atlasImage: Uint8Array
  /** アトラス幅 */
  atlasWidth: number
  /** アトラス高さ */
  atlasHeight: number
}

/**
 * マテリアル単位で適用する UV 変換行列
 * 3x3 行列を一次元配列で保持 (列優先/行優先は利用側と合意)
 */
export interface MaterialPlacement {
  /** 3x3 変換行列（9 要素） */
  uvTransform: Matrix3
}

/**
 * アトラス生成結果（ドキュメント非依存のメタデータのみ）
 */
export interface AtlasBuildResult {
  /** スロットごとに生成されたアトラス画像 */
  atlases: SlotAtlasImage[]
  /** 各マテリアルに適用する UV 変換行列 */
  placements: MaterialPlacement[]
}

/**
 * UV座標マッピング情報
 */
export interface UVMapping {
  /** プリミティティブのインデックス */
  primitiveIndex: number
  /** マテリアルのテクスチャスロット */
  textureSlot: string
  /** オリジナルのテクスチャインデックス */
  originalTextureIndex: number
  /** アトラス内のノーマライズされたUV座標（min） */
  uvMin: { u: number; v: number }
  /** アトラス内のノーマライズされたUV座標（max） */
  uvMax: { u: number; v: number }
}

/**
 * テクスチャアトラス化の結果
 */
export interface AtlasResult {
  /** アトラス化されたドキュメント */
  document: Document
  /** UV座標マッピング情報 */
  mapping: UVMapping[]
  /** アトラス画像のメタデータ */
  atlasMetadata: {
    width: number
    height: number
    textureCount: number
    packingEfficiency: number
  }
}

/**
 * マテリアル結合のオプション
 */
export interface CombineMaterialOptions {
  /** アトラスサイズ（デフォルト: 2048） */
  atlasSize?: number
  /** スロット属性名（デフォルト: 'mtoonMaterialSlot'） */
  slotAttributeName?: string
  /** パラメータテクスチャのテクセル数（デフォルト: 8） */
  texelsPerSlot?: number
}

/**
 * アウトライン幅モード
 */
export type OutlineWidthMode = 'none' | 'worldCoordinates' | 'screenCoordinates'

/**
 * レンダーモード（透過分離用）
 * - opaque: 不透明（transparent === false && alphaTest === 0）
 * - alphaTest: MASKモード（alphaTest > 0）
 * - transparent: 半透明（transparent === true）
 */
export type RenderMode = 'opaque' | 'alphaTest' | 'transparent'

/**
 * マテリアル情報（アウトライン情報を含む）
 */
export interface MaterialInfo {
  /** マテリアル */
  material: MToonMaterial
  /** このマテリアルを使用しているメッシュ */
  meshes: Mesh[]
  /** アウトラインが有効かどうか */
  hasOutline: boolean
  /** アウトライン幅モード */
  outlineWidthMode: OutlineWidthMode
  /** レンダーモード */
  renderMode: RenderMode
}

/**
 * メッシュグループ（レンダーモードごとの結合結果）
 * meshがnullの場合はexcludedMeshes専用グループ（結合メッシュなし、マテリアルのみ）
 */
export interface MeshGroup {
  /** 結合されたメッシュ（excludedMeshesのみの場合はnull） */
  mesh: Mesh | null
  /** 使用されたMToonAtlasMaterial */
  material: MToonAtlasMaterial
  /** アウトライン用メッシュ */
  outlineMesh?: Mesh
  /** アウトライン用MToonAtlasMaterial */
  outlineMaterial?: MToonAtlasMaterial
}

/**
 * マテリアルスロット情報
 */
export interface MaterialSlotInfo {
  /** レンダーモード */
  renderMode: RenderMode
  /** グループ内でのスロットインデックス */
  slotIndex: number
}

/**
 * マテリアル結合の結果
 */
export interface CombinedMeshResult {
  /** レンダーモードごとのメッシュグループ */
  groups: Map<RenderMode, MeshGroup>
  /** マテリアルからスロット情報へのマッピング */
  materialSlotIndex: Map<MToonMaterial, MaterialSlotInfo>
  /** 統計情報 */
  statistics: {
    /** 元のメッシュ数 */
    originalMeshCount: number
    /** 元のマテリアル数（重複排除後） */
    originalMaterialCount: number
    /** 削減されたドローコール数 */
    reducedDrawCalls: number
  }
}

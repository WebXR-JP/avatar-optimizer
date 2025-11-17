/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import { Matrix3, Vector2 } from "three"
import { OffsetScale } from "../types"

/**
 * テクスチャパッキングの結果
 */
export interface PackingResult
{
  /** アトラスの幅 */
  atlasWidth: number
  /** アトラスの高さ */
  atlasHeight: number
  /** パックされたテクスチャ情報 */
  packed: OffsetScale[]
}

/**
 * テクスチャ画像データ
 */
export interface TextureImageData
{
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * スロットごとに生成されたアトラス画像
 */
export interface SlotAtlasImage
{
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
export interface MaterialPlacement
{
  /** 3x3 変換行列（9 要素） */
  uvTransform: Matrix3
}

/**
 * アトラス生成結果（ドキュメント非依存のメタデータのみ）
 */
export interface AtlasBuildResult
{
  /** スロットごとに生成されたアトラス画像 */
  atlases: SlotAtlasImage[]
  /** 各マテリアルに適用する UV 変換行列 */
  placements: MaterialPlacement[]
}

/**
 * UV座標マッピング情報
 */
export interface UVMapping
{
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
export interface AtlasResult
{
  /** アトラス化されたドキュメント */
  document: any // Document 型（避けるため any）
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
 * エラー型定義
 */
export type AtlasError =
  | { type: 'INVALID_TEXTURE'; message: string }
  | { type: 'PACKING_FAILED'; message: string }
  | { type: 'CANVAS_ERROR'; message: string }
  | { type: 'DOCUMENT_ERROR'; message: string }
  | { type: 'UV_MAPPING_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

/**
 * マテリアル結合のオプション
 */
export interface CombineMaterialOptions
{
  /** アトラスサイズ（デフォルト: 2048） */
  atlasSize?: number
  /** スロット属性名（デフォルト: 'mtoonMaterialSlot'） */
  slotAttributeName?: string
  /** パラメータテクスチャのテクセル数（デフォルト: 8） */
  texelsPerSlot?: number
}

/**
 * マテリアル結合の結果
 */
export interface CombinedMeshResult
{
  /** 結合されたメッシュ */
  mesh: any // Mesh型（Three.js依存を避けるためany）
  /** 使用されたMToonInstancingMaterial */
  material: any // MToonInstancingMaterial型
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

/**
 * マテリアル結合のエラー型
 */
export type CombineError =
  | { type: 'NO_MATERIALS_FOUND'; message: string }
  | { type: 'PARAMETER_TEXTURE_FAILED'; message: string }
  | { type: 'ATLAS_GENERATION_FAILED'; message: string }
  | { type: 'GEOMETRY_MERGE_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

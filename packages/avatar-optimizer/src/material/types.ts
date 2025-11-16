/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import { Matrix3, Vector2 } from "three"

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
 * テクスチャスロット名の型
 */
export type TextureSlot =
  | 'map'
  | 'normalMap'
  | 'emissiveMap'
  | 'shadeMultiplyTexture'
  | 'shadingShiftTexture'
  | 'matcapTexture'
  | 'rimMultiplyTexture'
  | 'outlineWidthMultiplyTexture'
  | 'uvAnimationMaskTexture'

/**
 * テクスチャ組み合わせパターン
 * 各スロットに設定されているテクスチャのImage参照を保持
 */
export interface TextureCombinationPattern
{
  /** 各スロットのImage参照（nullの場合はテクスチャなし） */
  slots: Map<TextureSlot, any | null>
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
 * エラー型定義
 */
export type AtlasError =
  | { type: 'INVALID_TEXTURE'; message: string }
  | { type: 'PACKING_FAILED'; message: string }
  | { type: 'CANVAS_ERROR'; message: string }
  | { type: 'DOCUMENT_ERROR'; message: string }
  | { type: 'UV_MAPPING_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

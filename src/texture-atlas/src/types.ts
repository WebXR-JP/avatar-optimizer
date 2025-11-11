/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import type { Primitive, Texture } from '@gltf-transform/core'

/**
 * 2D ベクトル
 */
export interface Vector2 {
  x: number
  y: number
}

/**
 * パッキング対象となるテクスチャアイランドの情報
 * C# の IslandTransform に相当
 */
export interface IslandTransform {
  position: Vector2
  size: Vector2
  rotation: number
  originalIndex: number
}

/**
 * テクスチャアトラス化のオプション
 */
export interface AtlasOptions {
  /** アトラスの最大サイズ（ピクセル）デフォルト: 2048 */
  maxSize?: number
  /** テクスチャのダウンスケール係数 (0.1-1.0)。デフォルト: 1.0（縮小なし） */
  textureScale?: number
}

/**
 * テクスチャ内の矩形領域を表す
 */
export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * パックされたテクスチャの配置情報
 */
export interface PackedTexture extends Rectangle {
  /** オリジナルテクスチャのインデックス */
  index: number
  /** オリジナルテクスチャの幅 */
  originalWidth: number
  /** オリジナルテクスチャの高さ */
  originalHeight: number
}

/**
 * テクスチャパッキングの結果
 */
export interface PackingResult {
  /** アトラスの幅 */
  atlasWidth: number
  /** アトラスの高さ */
  atlasHeight: number
  /** パックされたテクスチャ情報 */
  packed: PackedTexture[]
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






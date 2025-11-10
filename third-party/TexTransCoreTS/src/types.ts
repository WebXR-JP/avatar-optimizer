/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import type { Primitive, Texture } from '@gltf-transform/core'

/**
 * テクスチャアトラス化のオプション
 */
export interface AtlasOptions {
  /** アトラスの最大サイズ（ピクセル）デフォルト: 2048 */
  maxSize?: number
  /** テクスチャ間のパディング（ピクセル）デフォルト: 4 */
  padding?: number
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

/**
 * キャンバス型（ブラウザとNode.js互換）
 */
export interface Canvas {
  width: number
  height: number
  getContext(contextId: '2d', options?: any): CanvasRenderingContext2D | null
  toDataURL(type?: string, quality?: number): string
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void
}

/**
 * Canvas コンテキスト型（ブラウザとNode.js互換）
 */
export interface CanvasContext {
  drawImage(
    image: Canvas | HTMLImageElement,
    dx: number,
    dy: number,
  ): void
  drawImage(
    image: Canvas | HTMLImageElement,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
  drawImage(
    image: Canvas | HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
  putImageData(imagedata: ImageData, dx: number, dy: number): void
  clearRect(x: number, y: number, w: number, h: number): void
}

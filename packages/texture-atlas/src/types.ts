/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

/**
 * テクスチャアトラス化のオプション
 */
export interface AtlasOptions {
  /** アトラスの最大サイズ（ピクセル）デフォルト: 2048 */
  maxSize?: number
}

/**
 * アトラス化対象となる1枚のテクスチャ
 */
export interface AtlasTextureDescriptor {
  /** 画像の幅（ピクセル） */
  width: number
  /** 画像の高さ（ピクセル） */
  height: number
  /** RGBA ビットマップを返す非同期ローダー */
  readImageData(): Promise<Uint8Array>
}

/**
 * 1 つのマテリアルに紐づくテクスチャ集合
 */
export interface AtlasMaterialDescriptor {
  /** このマテリアルでアトラス化したいテクスチャ */
  primaryTexture: AtlasTextureDescriptor
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
  /** 入力時の元のテクスチャ幅（スケーリング前） */
  sourceWidth: number
  /** 入力時の元のテクスチャ高さ（スケーリング前） */
  sourceHeight: number
  /** パッキング時のスケーリング後の幅（width と同じ値） */
  scaledWidth: number
  /** パッキング時のスケーリング後の高さ（height と同じ値） */
  scaledHeight: number
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
 * 正規化座標で表現したパッキング結果
 */
export interface NormalizedPackedTexture {
  /** オリジナルテクスチャのインデックス */
  index: number
  /** UV 空間での配置（最小値） */
  uvMin: { u: number; v: number }
  /** UV 空間での配置（最大値） */
  uvMax: { u: number; v: number }
  /** 入力時の元のテクスチャ幅（スケーリング前） */
  sourceWidth: number
  /** 入力時の元のテクスチャ高さ（スケーリング前） */
  sourceHeight: number
  /** パッキング時のスケーリング後の幅 */
  scaledWidth: number
  /** パッキング時のスケーリング後の高さ */
  scaledHeight: number
}

export interface NormalizedPackingResult {
  atlasWidth: number
  atlasHeight: number
  packed: NormalizedPackedTexture[]
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
  /** UV を再計算する対象マテリアル ID */
  materialId: string
  /** 3x3 変換行列（9 要素） */
  uvTransform: [number, number, number, number, number, number, number, number, number]
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

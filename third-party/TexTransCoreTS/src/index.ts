/**
 * TexTransCoreTS - TypeScript テクスチャアトラス化ライブラリ
 *
 * glTF-Transform ドキュメント内のテクスチャを自動的にアトラス化し、
 * モデルの UV 座標を再マッピングします。
 */

// Public API のみをエクスポート
export { atlasTexturesInDocument } from './atlas/atlasTexture'
export type {
  AtlasOptions,
  AtlasResult,
  AtlasError,
  PackingResult,
  UVMapping,
  Rectangle,
  Vector2,
  IslandTransform,
  PackedTexture,
  CreateCanvasFactory, // 追加
} from './types'

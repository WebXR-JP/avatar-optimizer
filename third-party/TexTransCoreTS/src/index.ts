/**
 * TexTransCoreTS - TypeScript テクスチャアトラス化ライブラリ
 *
 * glTF-Transform ドキュメント内のテクスチャを自動的にアトラス化し、
 * モデルの UV 座標を再マッピングします。
 */

// Public API のみをエクスポート
export { atlasTexturesInDocument } from './atlas/atlasTexture'
export { packTexturesNFDH } from './atlas/nfdh-packer'
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
} from './types'

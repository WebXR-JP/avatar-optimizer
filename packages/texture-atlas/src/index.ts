/**
 * TexTransCoreTS - TypeScript テクスチャアトラス化ライブラリ
 *
 * glTF-Transform ドキュメント内のテクスチャを自動的にアトラス化し、
 * モデルの UV 座標を再マッピングします。
 */

// Public API のみをエクスポート
export { atlasTexturesInDocument, packAndCreateAtlas } from './atlas/process-gltf-atlas'
export { buildAtlases } from './core/atlas-builder'
export type {
  AtlasOptions,
  AtlasResult,
  AtlasError,
  AtlasMaterialDescriptor,
  AtlasTextureDescriptor,
  PackingResult,
  UVMapping,
  Rectangle,
  PackedTexture,
  SlotAtlasImage,
  MaterialPlacement,
  AtlasBuildResult,
} from './types'

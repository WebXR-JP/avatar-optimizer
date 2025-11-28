/**
 * @xrift/mtoon-atlas
 *
 * MToon shader atlas optimization material for three-vrm WebGL applications.
 *
 * Provides MToonAtlasMaterial that consumes atlas + packed parameter textures
 * produced by @xrift/avatar-optimizer.
 */

// クラスエクスポート
export { MToonAtlasMaterial } from './MToonAtlasMaterial'
export type { DebugMode } from './MToonAtlasMaterial'

// 型定義エクスポート
export type {
  ParameterSemanticId,
  ParameterSemantic,
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonAtlasOptions,
} from './types'

// GLTF拡張プラグイン
export { MToonAtlasLoaderPlugin } from './extensions/MToonAtlasLoaderPlugin'
export { MToonAtlasExporterPlugin } from './extensions/MToonAtlasExporterPlugin'
export { MTOON_ATLAS_EXTENSION_NAME } from './extensions/types'
export type { MToonAtlasExtensionSchema } from './extensions/types'

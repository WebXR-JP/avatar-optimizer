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

// 型定義エクスポート
export type {
  ParameterSemanticId,
  ParameterSemantic,
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonAtlasOptions,
} from './types'

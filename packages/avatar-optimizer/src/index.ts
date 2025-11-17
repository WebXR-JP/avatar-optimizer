/**
 * @xrift/avatar-optimizer - avatar optimization library for XRift
 */

// メイン処理のエクスポート
export { optimizeModel } from './avatar-optimizer'

// Material types
export type {
  PackingLayouts as PackingResult,
  TextureImageData,
  SlotAtlasImage,
  MaterialPlacement,
  AtlasBuildResult,
  UVMapping,
  AtlasResult,
} from './util/material/types'

// Root types
export type {
  OptimizationOptions,
  ThreeVRMDocument,
  TextureSlotInfo,
  OptimizationError,
  AtlasTextureDescriptor
} from './types'

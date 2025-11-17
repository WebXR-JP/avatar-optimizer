/**
 * @xrift/avatar-optimizer - avatar optimization library for XRift
 */

// メイン処理のエクスポート
export { optimizeModel } from './avatar-optimizer'

// Material types
export type {
  PackingResult,
  TextureImageData,
  SlotAtlasImage,
  MaterialPlacement,
  AtlasBuildResult,
  UVMapping,
  AtlasResult,
  AtlasError,
} from './material/types'

// Root types
export type {
  OptimizationOptions,
  ThreeVRMDocument,
  TextureSlotInfo,
  OptimizationError,
  AtlasTextureDescriptor
} from './types'

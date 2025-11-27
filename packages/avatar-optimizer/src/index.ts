/**
 * @xrift/avatar-optimizer - avatar optimization library for XRift
 */

// メイン処理のエクスポート
export { optimizeModel } from './avatar-optimizer'

// Material types
export type {
  AtlasBuildResult,
  AtlasResult,
  MaterialPlacement,
  PackingLayouts as PackingResult,
  SlotAtlasImage,
  TextureImageData,
  UVMapping,
} from './util/material/types'

// Root types
export type {
  AtlasTextureDescriptor,
  OptimizationError,
  OptimizationOptions,
  TextureSlotInfo,
  ThreeVRMDocument,
} from './types'

// Exporter
export { VRMExporterPlugin } from './exporter'

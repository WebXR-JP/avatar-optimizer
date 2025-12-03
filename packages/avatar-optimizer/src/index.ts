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
  AtlasGenerationOptions,
  AtlasTextureDescriptor,
  OptimizationError,
  OptimizationOptions,
  OptimizeModelOptions,
  SlotAtlasResolution,
  TextureSlotInfo,
  ThreeVRMDocument,
} from './types'

// Exporter
export { VRMExporterPlugin } from './exporter'

// Skeleton migration utilities (for debugging)
export { migrateSkeletonVRM0ToVRM1 } from './util/skeleton'
export {
  createVirtualTailNodes,
  migrateSpringBone,
  rotateSpringBoneColliderOffsets,
  rotateSpringBoneGravityDirections,
} from './util/springbone'

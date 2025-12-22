/**
 * @xrift/avatar-optimizer - avatar optimization library for XRift
 */

// メイン処理のエクスポート
export { optimizeModel } from './avatar-optimizer'

// IO (load/export)
export { exportVRM, loadVRM, type VRMSource } from './io'

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
  ExportVRMError,
  ExportVRMOptions,
  OptimizationError,
  OptimizationOptions,
  OptimizeModelOptions,
  SimplifyOptions,
  SlotAtlasResolution,
  TextureCompressionOptions,
  TextureSlotInfo,
  ThreeVRMDocument,
  VRMLoaderError,
} from './types'

// Re-export UastcQuality from texture-compression
export { UastcQuality } from '@xrift/texture-compression'

// Simplify
export { simplifyMeshes, type SimplifyStatistics } from './process/simplify'

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

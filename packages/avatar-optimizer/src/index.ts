/**
 * @webxr-jp/avatar-optimizer - avatar optimization library for XRift
 */

// メイン処理のエクスポート
export { optimizeModel } from './avatar-optimizer'

// IO (load/export)
export { exportVRM, loadVRM, type LoadVRMOptions, type VRMSource } from './io'
// KTX2 トランスコーダーの配信元設定。
// 実体は @webxr-jp/mtoon-atlas だが、これは本パッケージの dependencies なので
// avatar-optimizer だけを入れている利用者からは直接 import できない。
// また利用者が mtoon-atlas を別途インストールしてバージョンがずれると、
// モジュールが二重化して設定が loadVRM 側に効かなくなる。ここから再エクスポートする
export {
  clearKtx2LoaderCache,
  DEFAULT_KTX2_TRANSCODER_PATH,
  getKtx2TranscoderPath,
  setKtx2TranscoderPath,
} from '@webxr-jp/mtoon-atlas'

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
export { UastcQuality } from '@webxr-jp/texture-compression'

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

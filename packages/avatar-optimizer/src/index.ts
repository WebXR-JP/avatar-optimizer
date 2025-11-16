/**
 * @xrift/avatar-optimizer - avatar optimization library for XRift
 */

// Material module (Three.js MToonMaterial support)
export { optimizeModelMaterials as setAtlasTexturesToObjectsWithCorrectUV, generateAtlasImages } from './material/index'
export type { AtlasImageMap } from './material/index'

// Material types
export type {
  AtlasTextureDescriptor,
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
  VRMStatistics,
  TextureSlotInfo,
  ProcessingError,
  OptimizationError,
} from './types'

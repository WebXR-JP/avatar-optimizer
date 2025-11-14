// Optimization functions
export { optimizeVRM } from './core/optimizer'
export { calculateVRMStatistics } from './core/statistics'
export { validateVRMFile } from './core/validation'
export {
  readVRMDocumentWithLoadersGL,
  writeVRMDocumentWithLoadersGL,
} from './vrm/loaders-gl'
export { importVRMWithThreeVRM } from './vrm/three-vrm-loader'
export { exportVRMDocumentToGLB } from './vrm/exporter'

// Type exports
export type {
  OptimizationError,
  OptimizationOptions,
  ProcessingError,
  ThreeVRMDocument,
  TextureSlotInfo,
  ValidationError,
  VRMStatistics,
  VRMValidationResult,
  VRMValidationIssue,
} from './types'
export type { LoadersGLVRMDocument } from './vrm/loaders-gl'
export type {
  ThreeVRMLoadResult,
  ThreeVRMLoaderOptions,
} from './vrm/three-vrm-loader'

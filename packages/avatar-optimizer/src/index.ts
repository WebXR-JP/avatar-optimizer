// Optimization functions
export { optimizeVRM } from './core/optimizer'
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
export type {
  ThreeVRMLoadResult,
  ThreeVRMLoaderOptions,
} from './vrm/three-vrm-loader'

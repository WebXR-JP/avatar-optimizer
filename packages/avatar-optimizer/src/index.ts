// Optimization functions
export { optimizeVRM } from './core/optimizer'
export { calculateVRMStatistics } from './core/statistics'
export { validateVRMFile } from './core/validation'
export {
  readVRMDocumentWithLoadersGL,
  writeVRMDocumentWithLoadersGL,
} from './vrm/loaders-gl'

// Type exports
export type {
  OptimizationError,
  OptimizationOptions,
  ProcessingError,
  TextureSlotInfo,
  ValidationError,
  VRMStatistics,
  VRMValidationResult,
  VRMValidationIssue,
} from './types'
export type { LoadersGLVRMDocument } from './vrm/loaders-gl'

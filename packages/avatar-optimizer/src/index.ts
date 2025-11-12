// Optimization functions
export { optimizeVRM } from './core/optimizer'
export { calculateVRMStatistics } from './core/statistics'
export { validateVRMFile } from './core/validation'

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

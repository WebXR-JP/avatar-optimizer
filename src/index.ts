// Main preprocessing function
export { preprocessVRM } from './preprocessor'

// Optimization functions
export { optimizeVRM, calculateVRMStatistics } from './optimizer'

// Type exports
export type {
  OptimizationOptions,
  PreprocessingOptions,
  PreprocessingResult,
  VRMStatistics,
  TextureSlotInfo,
} from './types'

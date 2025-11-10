// Main preprocessing function
export { preprocessVRM } from './preprocessor'

// Optimization functions
export { calculateVRMStatistics, optimizeVRM } from './optimizer'

// Type exports
export type {
  OptimizationOptions,
  PreprocessingOptions,
  PreprocessingResult,
  TextureSlotInfo,
  VRMStatistics,
} from './types'

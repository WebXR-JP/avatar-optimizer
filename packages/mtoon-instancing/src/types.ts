/**
 * Configuration options for MToon instancing optimization
 */
export interface MToonInstancingOptions {
  /**
   * Enable MToon shader instancing
   */
  enabled?: boolean

  /**
   * Maximum number of instances per batch
   */
  maxInstancesPerBatch?: number

  /**
   * Enable shader optimization
   */
  optimizeShaders?: boolean
}

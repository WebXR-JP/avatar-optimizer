import { ResultAsync } from 'neverthrow'

import type { OptimizationError, VRMStatistics } from '../types'

/**
 * VRM モデルの統計情報を計算します
 *
 * TODO: 具体的な実装は今後の開発で追加予定
 */
export function calculateVRMStatistics(
  _file: File,
): ResultAsync<VRMStatistics, OptimizationError> {
  return ResultAsync.fromPromise(
    Promise.resolve({
      polygonCount: 0,
      textureCount: 0,
      materialCount: 0,
      boneCount: 0,
      meshCount: 0,
      fileSizeMB: 0,
      vramEstimateMB: 0,
    }),
    (error) => ({
      type: 'UNKNOWN_ERROR' as const,
      message: `Failed to calculate statistics: ${String(error)}`,
    })
  )
}

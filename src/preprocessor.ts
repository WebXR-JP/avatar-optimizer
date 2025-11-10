import { calculateVRMStatistics, optimizeVRM } from './optimizer'
import type { PreprocessingOptions, PreprocessingResult } from './types'

/**
 * VRM モデルの前処理を実行します
 * バリデーション、最適化、統計情報計算など複数のステップを実行
 */
export async function preprocessVRM(
  file: File,
  options: PreprocessingOptions,
): Promise<PreprocessingResult> {
  // 1. オリジナルの統計情報を計算
  const originalStats = await calculateVRMStatistics(file)

  // 2. 最適化処理（オプション）
  let processedFile = file
  if (options.optimize && options.optimization) {
    processedFile = await optimizeVRM(file, options.optimization)
  }

  // 3. 最適化後の統計情報を計算
  const finalStats = await calculateVRMStatistics(processedFile)

  return {
    file: processedFile,
    originalStats,
    finalStats,
  }
}

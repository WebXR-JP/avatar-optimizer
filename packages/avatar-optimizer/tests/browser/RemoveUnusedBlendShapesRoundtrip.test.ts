import type { VRM } from '@pixiv/three-vrm'
import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { exportVRM, loadVRM, optimizeModel } from '../../src'

/**
 * メッシュごとの有効なモーフ差分ベクトル合計を計算する
 */
function captureExpressionMorphState(vrm: VRM): Map<string, Float32Array> {
  const result = new Map<string, Float32Array>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const influences = obj.morphTargetInfluences
    const posTargets = obj.geometry.morphAttributes.position
    if (!influences || !posTargets || posTargets.length === 0) return

    const vertexCount = obj.geometry.getAttribute('position').count
    const accum = new Float32Array(vertexCount * 3)
    let hasNonZero = false

    for (let ti = 0; ti < posTargets.length; ti++) {
      const weight = influences[ti] ?? 0
      if (weight === 0) continue
      hasNonZero = true
      const attr = posTargets[ti]
      for (let vi = 0; vi < vertexCount; vi++) {
        accum[vi * 3 + 0] += weight * attr.getX(vi)
        accum[vi * 3 + 1] += weight * attr.getY(vi)
        accum[vi * 3 + 2] += weight * attr.getZ(vi)
      }
    }

    if (hasNonZero) {
      result.set(obj.name, accum)
    }
  })

  return result
}

describe('RemoveUnusedBlendShapes Roundtrip', () => {
  it('AliciaSolid.vrm で未参照 BlendShape を削除しても全表情の変形結果が一致し、出力サイズが削減される', async () => {
    const response = await fetch('/AliciaSolid.vrm')
    const originalBuffer = await response.arrayBuffer()

    // 1. 元 VRM の全表情による変形結果を記録
    const origLoaded = await loadVRM(originalBuffer)
    expect(origLoaded.isOk()).toBe(true)
    if (origLoaded.isErr()) return
    const origVRM = origLoaded.value

    const exprNames =
      origVRM.expressionManager?.expressions.map((e) => e.expressionName) ?? []
    expect(exprNames.length).toBeGreaterThan(0)

    const expectedByExpression = new Map<string, Map<string, Float32Array>>()
    for (const name of exprNames) {
      origVRM.expressionManager?.resetValues()
      origVRM.expressionManager?.setValue(name, 1.0)
      origVRM.expressionManager?.update()
      expectedByExpression.set(name, captureExpressionMorphState(origVRM))
    }

    // 2. removeUnusedBlendShapes: false で最適化＋エクスポートしたサイズを取得
    const baseLoaded = await loadVRM(originalBuffer)
    expect(baseLoaded.isOk()).toBe(true)
    if (baseLoaded.isErr()) return
    const baseVRM = baseLoaded.value

    const baseOpt = await optimizeModel(baseVRM, {
      migrateVRM0ToVRM1: false,
      removeUnusedBlendShapes: false,
    })
    expect(baseOpt.isOk()).toBe(true)
    if (baseOpt.isOk()) {
      expect(baseOpt.value.statistics.blendShapes).toBeUndefined()
    }
    const baseExport = await exportVRM(baseVRM)
    expect(baseExport.isOk()).toBe(true)
    if (baseExport.isErr()) return

    // 3. removeUnusedBlendShapes: true で最適化＋エクスポート＋再ロード
    const prunedLoaded = await loadVRM(originalBuffer)
    expect(prunedLoaded.isOk()).toBe(true)
    if (prunedLoaded.isErr()) return
    const prunedVRM = prunedLoaded.value

    const prunedOpt = await optimizeModel(prunedVRM, {
      migrateVRM0ToVRM1: false,
      removeUnusedBlendShapes: true,
    })
    expect(prunedOpt.isOk()).toBe(true)
    if (prunedOpt.isErr()) return

    const blendStats = prunedOpt.value.statistics.blendShapes
    expect(blendStats).toBeDefined()
    expect(blendStats!.removedBlendShapeCount).toBeGreaterThan(0)
    expect(blendStats!.remainingBlendShapeCount).toBeGreaterThan(0)

    // 最適化直後（エクスポート前）の段階で全表情の変形結果が一致すること
    for (const name of exprNames) {
      prunedVRM.expressionManager?.resetValues()
      prunedVRM.expressionManager?.setValue(name, 1.0)
      prunedVRM.expressionManager?.update()

      const actualMap = captureExpressionMorphState(prunedVRM)
      const expectedMap = expectedByExpression.get(name)!

      expect(actualMap.size, `pre-export ${name}`).toBe(expectedMap.size)
      for (const [meshName, expectedArr] of expectedMap) {
        const actualArr = actualMap.get(meshName)
        expect(actualArr, `pre-export ${name} / ${meshName}`).toBeDefined()
        expect(actualArr!.length, `pre-export ${name} / ${meshName} len`).toBe(
          expectedArr.length,
        )
        for (let i = 0; i < expectedArr.length; i++) {
          expect(
            actualArr![i],
            `pre-export ${name} / ${meshName} / idx=${i}`,
          ).toBeCloseTo(expectedArr[i], 4)
        }
      }
    }
    prunedVRM.expressionManager?.resetValues()
    prunedVRM.expressionManager?.update()

    const prunedExport = await exportVRM(prunedVRM)
    expect(prunedExport.isOk()).toBe(true)
    if (prunedExport.isErr()) return

    // 未使用 BlendShape 削除版の方がファイルサイズが小さいこと
    expect(prunedExport.value.byteLength).toBeLessThan(
      baseExport.value.byteLength,
    )

    const reloadedRes = await loadVRM(prunedExport.value)
    expect(reloadedRes.isOk()).toBe(true)
    if (reloadedRes.isErr()) return
    const reloadedVRM = reloadedRes.value

    // 4. 再ロード後の全表情の変形結果が元モデルと一致すること
    for (const name of exprNames) {
      reloadedVRM.expressionManager?.resetValues()
      reloadedVRM.expressionManager?.setValue(name, 1.0)
      reloadedVRM.expressionManager?.update()

      const actualMap = captureExpressionMorphState(reloadedVRM)
      const expectedMap = expectedByExpression.get(name)!

      expect(actualMap.size).toBe(expectedMap.size)
      for (const [meshName, expectedArr] of expectedMap) {
        const actualArr = actualMap.get(meshName)
        expect(actualArr, `${name} / ${meshName}`).toBeDefined()
        expect(actualArr!.length, `${name} / ${meshName} len`).toBe(
          expectedArr.length,
        )
        for (let i = 0; i < expectedArr.length; i++) {
          expect(actualArr![i], `${name} / ${meshName} / idx=${i}`).toBeCloseTo(
            expectedArr[i],
            4,
          )
        }
      }
    }
  })

  it('VRM1_Constraint_Twist_Sample.vrm (VRM 1.0) でも表情と morphTargetDictionary が整合してラウンドトリップできる', async () => {
    const response = await fetch('/VRM1_Constraint_Twist_Sample.vrm')
    const buffer = await response.arrayBuffer()

    const origLoaded = await loadVRM(buffer)
    expect(origLoaded.isOk()).toBe(true)
    if (origLoaded.isErr()) return
    const origVRM = origLoaded.value

    const exprNames =
      origVRM.expressionManager?.expressions.map((e) => e.expressionName) ?? []
    expect(exprNames.length).toBeGreaterThan(0)

    const expectedByExpression = new Map<string, Map<string, Float32Array>>()
    for (const name of exprNames) {
      origVRM.expressionManager?.resetValues()
      origVRM.expressionManager?.setValue(name, 1.0)
      origVRM.expressionManager?.update()
      expectedByExpression.set(name, captureExpressionMorphState(origVRM))
    }

    const optLoaded = await loadVRM(buffer)
    expect(optLoaded.isOk()).toBe(true)
    if (optLoaded.isErr()) return
    const optVRM = optLoaded.value

    const optResult = await optimizeModel(optVRM, {
      removeUnusedBlendShapes: true,
    })
    expect(optResult.isOk()).toBe(true)
    if (optResult.isErr()) return

    expect(
      optResult.value.statistics.blendShapes?.removedBlendShapeCount,
    ).toBeGreaterThan(0)

    // pre-export check for VRM1
    for (const name of exprNames) {
      optVRM.expressionManager?.resetValues()
      optVRM.expressionManager?.setValue(name, 1.0)
      optVRM.expressionManager?.update()
      const actualMap = captureExpressionMorphState(optVRM)
      const expectedMap = expectedByExpression.get(name)!
      expect(actualMap.size, `vrm1 pre-export ${name}`).toBe(expectedMap.size)
      for (const [meshName, expectedArr] of expectedMap) {
        const actualArr = actualMap.get(meshName)
        expect(actualArr, `vrm1 pre-export ${name} / ${meshName}`).toBeDefined()
        for (let i = 0; i < expectedArr.length; i++) {
          expect(
            actualArr![i],
            `vrm1 pre-export ${name} / ${meshName} / ${i}`,
          ).toBeCloseTo(expectedArr[i], 4)
        }
      }
    }
    optVRM.expressionManager?.resetValues()
    optVRM.expressionManager?.update()

    const exportedRes = await exportVRM(optVRM)
    expect(exportedRes.isOk()).toBe(true)
    if (exportedRes.isErr()) return

    const reloadedRes = await loadVRM(exportedRes.value)
    expect(reloadedRes.isOk()).toBe(true)
    if (reloadedRes.isErr()) return
    const reloadedVRM = reloadedRes.value

    // morphTargetDictionary と morphTargetInfluences の長さ・インデックス整合性を検証
    reloadedVRM.scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      if (obj.morphTargetInfluences && obj.morphTargetDictionary) {
        const values = Object.values(obj.morphTargetDictionary)
        expect(values.length).toBe(obj.morphTargetInfluences.length)
        const sorted = [...values].sort((a, b) => a - b)
        expect(sorted).toEqual(
          Array.from({ length: obj.morphTargetInfluences.length }, (_, i) => i),
        )
      }
    })

    for (const name of exprNames) {
      reloadedVRM.expressionManager?.resetValues()
      reloadedVRM.expressionManager?.setValue(name, 1.0)
      reloadedVRM.expressionManager?.update()

      const actualMap = captureExpressionMorphState(reloadedVRM)
      const expectedMap = expectedByExpression.get(name)!

      expect(actualMap.size).toBe(expectedMap.size)
      for (const [meshName, expectedArr] of expectedMap) {
        const actualArr = actualMap.get(meshName)
        expect(actualArr, `${name} / ${meshName}`).toBeDefined()
        expect(actualArr!.length, `${name} / ${meshName} len`).toBe(
          expectedArr.length,
        )
        for (let i = 0; i < expectedArr.length; i++) {
          expect(actualArr![i], `${name} / ${meshName} / idx=${i}`).toBeCloseTo(
            expectedArr[i],
            4,
          )
        }
      }
    }
  })
})

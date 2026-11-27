/**
 * VRM の表情（expressionManager）から参照されていない BlendShape（MorphTarget）を
 * シーン内のメッシュからまとめて削除する処理
 */

import type { VRM } from '@pixiv/three-vrm'
import { ok, Result } from 'neverthrow'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import type {
  OptimizationError,
  RemoveUnusedBlendShapesStatistics,
} from '../types'

interface MorphTargetBindLike {
  primitives: Mesh[]
  index: number
  weight?: number
  constructor: new (params: {
    primitives: Mesh[]
    index: number
    weight: number
  }) => unknown
}

interface ExpressionLike {
  binds?: unknown[]
  _binds?: unknown[]
  addBind?: (bind: unknown) => void
  deleteBind?: (bind: unknown) => void
}

interface MeshMorphPlan {
  mesh: Mesh
  targetCount: number
  keptOldIndices: number[]
  oldToNew: Map<number, number>
  hasChanges: boolean
  signature: string
}

function isMorphTargetBindLike(bind: unknown): bind is MorphTargetBindLike {
  if (typeof bind !== 'object' || bind === null) return false
  const candidate = bind as { primitives?: unknown; index?: unknown }
  return (
    Array.isArray(candidate.primitives) && typeof candidate.index === 'number'
  )
}

function getMorphTargetCount(mesh: Mesh): number {
  const morphAttributes = mesh.geometry?.morphAttributes
  let maxLen = 0
  if (morphAttributes) {
    for (const key of Object.keys(morphAttributes) as Array<
      keyof typeof morphAttributes
    >) {
      const list = morphAttributes[key]
      if (Array.isArray(list) && list.length > maxLen) {
        maxLen = list.length
      }
    }
  }
  if (maxLen > 0) return maxLen
  return mesh.morphTargetInfluences?.length ?? 0
}

function shallowCloneGeometry(geometry: BufferGeometry): BufferGeometry {
  const cloned = new BufferGeometry()
  cloned.name = geometry.name
  cloned.setIndex(geometry.index)

  for (const [name, attr] of Object.entries(geometry.attributes)) {
    cloned.setAttribute(name, attr)
  }

  for (const name of Object.keys(geometry.morphAttributes) as Array<
    keyof typeof geometry.morphAttributes
  >) {
    const morphList = geometry.morphAttributes[name]
    if (morphList) {
      cloned.morphAttributes[name] = [...morphList]
    }
  }
  cloned.morphTargetsRelative = geometry.morphTargetsRelative

  for (const group of geometry.groups) {
    cloned.addGroup(group.start, group.count, group.materialIndex)
  }

  if (geometry.boundingBox) {
    cloned.boundingBox = geometry.boundingBox.clone()
  }
  if (geometry.boundingSphere) {
    cloned.boundingSphere = geometry.boundingSphere.clone()
  }
  cloned.setDrawRange(geometry.drawRange.start, geometry.drawRange.count)
  cloned.userData = { ...geometry.userData }

  return cloned
}

function applyMorphFilteringToGeometry(
  geometry: BufferGeometry,
  keptOldIndices: number[],
): void {
  if (keptOldIndices.length === 0) {
    geometry.morphAttributes = {}
    geometry.morphTargetsRelative = false
    geometry.dispatchEvent({ type: 'dispose' })
    return
  }

  const nextMorphAttributes: Partial<
    Record<keyof BufferGeometry['morphAttributes'], BufferAttribute[]>
  > = {}
  const oldMorphAttributes = geometry.morphAttributes

  for (const key of Object.keys(oldMorphAttributes) as Array<
    keyof typeof oldMorphAttributes
  >) {
    const list = oldMorphAttributes[key]
    if (!Array.isArray(list) || list.length === 0) continue

    const filtered: BufferAttribute[] = []
    let allPresent = true
    for (const oldIdx of keptOldIndices) {
      const attr = list[oldIdx]
      if (!attr) {
        allPresent = false
        break
      }
      filtered.push(attr as BufferAttribute)
    }
    if (allPresent && filtered.length > 0) {
      nextMorphAttributes[key] = filtered
    }
  }

  geometry.morphAttributes =
    nextMorphAttributes as BufferGeometry['morphAttributes']
  geometry.dispatchEvent({ type: 'dispose' })
}

function updateMeshMorphTargets(
  mesh: Mesh,
  keptOldIndices: number[],
  oldToNew: Map<number, number>,
): void {
  if (keptOldIndices.length === 0) {
    mesh.morphTargetInfluences = undefined
    mesh.morphTargetDictionary = undefined
    return
  }

  const oldInfluences = mesh.morphTargetInfluences
  mesh.morphTargetInfluences = keptOldIndices.map(
    (oldIdx) => oldInfluences?.[oldIdx] ?? 0,
  )

  const oldDict = mesh.morphTargetDictionary
  if (!oldDict) {
    return
  }

  const newDict: Record<string, number> = {}
  const assignedNewIndices = new Set<number>()

  for (const [name, oldIdx] of Object.entries(oldDict)) {
    const newIdx = oldToNew.get(oldIdx)
    if (newIdx !== undefined) {
      newDict[name] = newIdx
      assignedNewIndices.add(newIdx)
    }
  }

  const dictEntriesCount = Object.keys(newDict).length
  if (dictEntriesCount === 0) {
    mesh.morphTargetDictionary = undefined
    return
  }

  // GLTFExporter は targetNames を構築する際に reverseDictionary[i] を参照する。
  // 一部の保持インデックスに名前が無いと undefined が混入するため、フォールバック名で補完する
  if (assignedNewIndices.size < keptOldIndices.length) {
    for (let newIdx = 0; newIdx < keptOldIndices.length; newIdx++) {
      if (assignedNewIndices.has(newIdx)) continue
      const oldIdx = keptOldIndices[newIdx]
      let fallbackName = String(oldIdx)
      while (fallbackName in newDict) {
        fallbackName = `${fallbackName}_`
      }
      newDict[fallbackName] = newIdx
      assignedNewIndices.add(newIdx)
    }
  }

  mesh.morphTargetDictionary = newDict
}

function removeBindFromExpression(expr: ExpressionLike, bind: unknown): void {
  if (typeof expr.deleteBind === 'function') {
    expr.deleteBind(bind)
    return
  }
  if (Array.isArray(expr.binds)) {
    const idx = expr.binds.indexOf(bind)
    if (idx >= 0) {
      expr.binds.splice(idx, 1)
    }
  }
  if (Array.isArray(expr._binds) && expr._binds !== expr.binds) {
    const idx = expr._binds.indexOf(bind)
    if (idx >= 0) {
      expr._binds.splice(idx, 1)
    }
  }
}

function addBindToExpression(expr: ExpressionLike, bind: unknown): void {
  if (typeof expr.addBind === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expr.addBind(bind as any)
    return
  }
  if (Array.isArray(expr._binds)) {
    expr._binds.push(bind)
  } else if (Array.isArray(expr.binds)) {
    expr.binds.push(bind)
  }
}

function remapExpressionBindIndices(
  vrm: VRM,
  planByMesh: Map<Mesh, MeshMorphPlan>,
): void {
  const expressions = vrm.expressionManager?.expressions
  if (!expressions) return

  const processedBinds = new Set<object>()

  for (const expression of expressions) {
    const expr = expression as unknown as ExpressionLike
    const binds = [...(expr.binds ?? expr._binds ?? [])]

    for (const bind of binds) {
      if (!isMorphTargetBindLike(bind) || processedBinds.has(bind)) continue
      processedBinds.add(bind)

      const oldIndex = bind.index
      if (bind.primitives.length === 0) continue

      const targetIndexByMesh = new Map<number, Mesh[]>()
      for (const primitive of bind.primitives) {
        const plan = planByMesh.get(primitive)
        const mapped = plan?.oldToNew.get(oldIndex)
        const nextIndex = mapped !== undefined ? mapped : oldIndex
        let list = targetIndexByMesh.get(nextIndex)
        if (!list) {
          list = []
          targetIndexByMesh.set(nextIndex, list)
        }
        list.push(primitive)
      }

      if (targetIndexByMesh.size === 1) {
        const [onlyNewIndex] = targetIndexByMesh.keys()
        if (onlyNewIndex !== oldIndex) {
          bind.index = onlyNewIndex
        }
        continue
      }

      // 1 つの bind が複数メッシュを指し、削除後のインデックスがメッシュごとに異なる場合は分割する
      removeBindFromExpression(expr, bind)
      const BindCtor = bind.constructor
      const weight = typeof bind.weight === 'number' ? bind.weight : 1

      for (const [newIndex, groupPrimitives] of targetIndexByMesh) {
        const splitBind = new BindCtor({
          primitives: groupPrimitives,
          index: newIndex,
          weight,
        })
        processedBinds.add(splitBind as object)
        addBindToExpression(expr, splitBind)
      }
    }
  }
}

/**
 * VRM の表情（`vrm.expressionManager`）から参照されていない BlendShape（MorphTarget）を
 * シーン内のメッシュからまとめて削除し、残った BlendShape に合わせて表情バインドのインデックスを
 * リマップする。
 *
 * - `weight === 0` のバインドであっても、`morphTargetBinds` に登録されていれば参照ありとして保持する
 * - 共有 `BufferGeometry` でメッシュごとに保持セットが異なる場合は浅い複製を作って独立させる
 * - 変更した `BufferGeometry` には `dispose` イベントを発火し Three.js の MorphTarget キャッシュを無効化する
 *
 * @param vrm - 処理対象の VRM インスタンス
 * @returns 削除前後の統計情報
 */
export function removeUnusedBlendShapes(
  vrm: VRM,
): Result<RemoveUnusedBlendShapesStatistics, OptimizationError> {
  const stats: RemoveUnusedBlendShapesStatistics = {
    processedMeshCount: 0,
    originalBlendShapeCount: 0,
    removedBlendShapeCount: 0,
    remainingBlendShapeCount: 0,
  }

  // 1. シーン内の全 Mesh とそれぞれの現在の MorphTarget 数を収集
  const allMeshes: Mesh[] = []
  const targetCountByMesh = new Map<Mesh, number>()
  vrm.scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    allMeshes.push(obj)
    targetCountByMesh.set(obj, getMorphTargetCount(obj))
  })

  // 2. expressionManager から参照されている (mesh, index) を収集
  const usedIndicesByMesh = new Map<Mesh, Set<number>>()
  const expressions = vrm.expressionManager?.expressions ?? []
  for (const expression of expressions) {
    const expr = expression as unknown as ExpressionLike
    const binds = expr.binds ?? expr._binds ?? []
    for (const bind of binds) {
      if (!isMorphTargetBindLike(bind)) continue
      const idx = bind.index
      if (!Number.isInteger(idx) || idx < 0) continue

      for (const primitive of bind.primitives) {
        const targetCount = targetCountByMesh.get(primitive)
        if (targetCount === undefined || idx >= targetCount) continue

        let set = usedIndicesByMesh.get(primitive)
        if (!set) {
          set = new Set<number>()
          usedIndicesByMesh.set(primitive, set)
        }
        set.add(idx)
      }
    }
  }

  // 3. メッシュごとの保持インデックス計画を構築・統計を集計
  const planByMesh = new Map<Mesh, MeshMorphPlan>()
  const signaturesByGeometry = new Map<BufferGeometry, Set<string>>()

  for (const mesh of allMeshes) {
    const targetCount = targetCountByMesh.get(mesh) ?? 0
    let signature = 'ALL'

    if (targetCount > 0) {
      const usedSet = usedIndicesByMesh.get(mesh)
      const keptOldIndices: number[] = []
      const oldToNew = new Map<number, number>()

      for (let i = 0; i < targetCount; i++) {
        if (usedSet?.has(i)) {
          oldToNew.set(i, keptOldIndices.length)
          keptOldIndices.push(i)
        }
      }

      const hasChanges = keptOldIndices.length < targetCount
      signature = hasChanges ? keptOldIndices.join(',') : 'ALL'

      stats.processedMeshCount++
      stats.originalBlendShapeCount += targetCount
      stats.remainingBlendShapeCount += keptOldIndices.length
      stats.removedBlendShapeCount += targetCount - keptOldIndices.length

      planByMesh.set(mesh, {
        mesh,
        targetCount,
        keptOldIndices,
        oldToNew,
        hasChanges,
        signature,
      })
    }

    if (mesh.geometry) {
      let sigSet = signaturesByGeometry.get(mesh.geometry)
      if (!sigSet) {
        sigSet = new Set<string>()
        signaturesByGeometry.set(mesh.geometry, sigSet)
      }
      sigSet.add(signature)
    }
  }

  if (stats.removedBlendShapeCount === 0) {
    return ok(stats)
  }

  // 4. BufferGeometry の morphAttributes を更新（共有関係に配慮）
  const updatedGeometries = new Set<BufferGeometry>()
  const clonedGeometryCache = new Map<
    BufferGeometry,
    Map<string, BufferGeometry>
  >()

  for (const plan of planByMesh.values()) {
    if (!plan.hasChanges) continue
    const originalGeometry = plan.mesh.geometry
    if (!originalGeometry) continue

    const sigSet = signaturesByGeometry.get(originalGeometry)
    if (sigSet && sigSet.size === 1) {
      if (!updatedGeometries.has(originalGeometry)) {
        applyMorphFilteringToGeometry(originalGeometry, plan.keptOldIndices)
        updatedGeometries.add(originalGeometry)
      }
    } else {
      let sigCache = clonedGeometryCache.get(originalGeometry)
      if (!sigCache) {
        sigCache = new Map<string, BufferGeometry>()
        clonedGeometryCache.set(originalGeometry, sigCache)
      }
      let cloned = sigCache.get(plan.signature)
      if (!cloned) {
        cloned = shallowCloneGeometry(originalGeometry)
        applyMorphFilteringToGeometry(cloned, plan.keptOldIndices)
        sigCache.set(plan.signature, cloned)
      }
      plan.mesh.geometry = cloned
    }
  }

  // 5. メッシュ側の morphTargetInfluences / morphTargetDictionary を更新
  for (const plan of planByMesh.values()) {
    if (!plan.hasChanges) continue
    updateMeshMorphTargets(plan.mesh, plan.keptOldIndices, plan.oldToNew)
  }

  // 6. expressionManager の MorphTargetBind.index をリマップ
  remapExpressionBindIndices(vrm, planByMesh)

  return ok(stats)
}

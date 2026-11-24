import { ok, Result } from 'neverthrow'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Matrix4,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint8BufferAttribute,
  Uint16BufferAttribute,
} from 'three'
import type {
  OptimizationError,
  SkeletonOptimizationStatistics,
} from '../../types'

const IBM_TOLERANCE = 1e-5

interface SkeletonGroup {
  boneInverseMap: Map<Bone, Matrix4>
  meshes: SkinnedMesh[]
}

/**
 * 2 つの Matrix4 が許容誤差内で一致するか判定する
 */
function matrixNearlyEquals(a: Matrix4, b: Matrix4): boolean {
  const ae = a.elements
  const be = b.elements
  for (let i = 0; i < 16; i++) {
    if (Math.abs(ae[i] - be[i]) > IBM_TOLERANCE) {
      return false
    }
  }
  return true
}

/**
 * 2 つの Bone -> IBM マップを単一 Skeleton へ統合可能か判定する
 */
function isBoneInverseMapMergeable(
  candidate: Map<Bone, Matrix4>,
  target: Map<Bone, Matrix4>,
): boolean {
  for (const [bone, inverse] of candidate) {
    const existing = target.get(bone)
    if (existing && !matrixNearlyEquals(inverse, existing)) {
      return false
    }
  }
  return true
}

/**
 * ジオメトリの skinIndex / skinWeight 属性から実際にウェイトが付いている
 * ボーンインデックス集合を収集する
 */
function collectUsedBoneIndices(
  skinIndexAttr: BufferAttribute | InterleavedBufferAttribute,
  skinWeightAttr: BufferAttribute | InterleavedBufferAttribute,
): Set<number> {
  const used = new Set<number>()
  const count = skinIndexAttr.count
  const itemSize = skinIndexAttr.itemSize

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < itemSize; j++) {
      let weight = 0
      if (j === 0) weight = skinWeightAttr.getX(i)
      else if (j === 1) weight = skinWeightAttr.getY(i)
      else if (j === 2) weight = skinWeightAttr.getZ(i)
      else if (j === 3) weight = skinWeightAttr.getW(i)

      if (!Number.isNaN(weight) && weight !== 0) {
        let index = 0
        if (j === 0) index = skinIndexAttr.getX(i)
        else if (j === 1) index = skinIndexAttr.getY(i)
        else if (j === 2) index = skinIndexAttr.getZ(i)
        else if (j === 3) index = skinIndexAttr.getW(i)
        used.add(index)
      }
    }
  }

  return used
}

/**
 * BufferGeometry の浅い複製を作成する（属性配列自体は共有し、差し替えのみ独立させる）
 */
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

/**
 * 新しいボーン配列に合わせて skinIndex 属性をリマップした新しい BufferAttribute を返す
 * 元の属性は変更しない
 */
function createRemappedSkinIndexAttribute(
  sourceAttr: BufferAttribute | InterleavedBufferAttribute,
  oldBones: Bone[],
  newBones: Bone[],
): BufferAttribute {
  const boneToNewIndex = new Map<Bone, number>()
  for (let i = 0; i < newBones.length; i++) {
    boneToNewIndex.set(newBones[i], i)
  }

  const oldToNew = new Int32Array(oldBones.length)
  for (let i = 0; i < oldBones.length; i++) {
    oldToNew[i] = boneToNewIndex.get(oldBones[i]) ?? 0
  }

  const count = sourceAttr.count
  const itemSize = sourceAttr.itemSize
  const length = count * itemSize

  let targetAttr: BufferAttribute
  if (sourceAttr instanceof InterleavedBufferAttribute) {
    targetAttr =
      newBones.length > 256
        ? new Uint16BufferAttribute(new Uint16Array(length), itemSize)
        : new Uint8BufferAttribute(new Uint8Array(length), itemSize)
  } else {
    const srcArray = sourceAttr.array
    const needsUint16 =
      newBones.length > 256 &&
      (srcArray instanceof Uint8Array || srcArray instanceof Int8Array)
    if (needsUint16) {
      targetAttr = new Uint16BufferAttribute(
        new Uint16Array(length),
        itemSize,
        sourceAttr.normalized,
      )
    } else {
      targetAttr = sourceAttr.clone()
    }
  }

  for (let i = 0; i < count; i++) {
    if (itemSize >= 1) {
      const a = sourceAttr.getX(i)
      targetAttr.setX(i, a >= 0 && a < oldToNew.length ? oldToNew[a] : 0)
    }
    if (itemSize >= 2) {
      const b = sourceAttr.getY(i)
      targetAttr.setY(i, b >= 0 && b < oldToNew.length ? oldToNew[b] : 0)
    }
    if (itemSize >= 3) {
      const c = sourceAttr.getZ(i)
      targetAttr.setZ(i, c >= 0 && c < oldToNew.length ? oldToNew[c] : 0)
    }
    if (itemSize >= 4) {
      const d = sourceAttr.getW(i)
      targetAttr.setW(i, d >= 0 && d < oldToNew.length ? oldToNew[d] : 0)
    }
  }

  targetAttr.needsUpdate = true
  return targetAttr
}

/**
 * シーン内の全 SkinnedMesh の Skeleton を統合し、ウェイト参照のない未使用ボーンを除外する
 *
 * - 互換性のある inverseBindMatrix を持つ SkinnedMesh 同士を単一の Skeleton に統合し、
 *   1 フレームあたりの `Skeleton.update()` 実行回数と GPU 転送回数を削減する
 * - いずれの頂点からもウェイト参照（weight !== 0）されていないボーンを `Skeleton.bones` から除外し、
 *   ボーン行列計算量とバッファサイズを削減する（シーン階層の Bone ノード自体は削除しない）
 * - 共有 BufferGeometry（本体＋アウトライン等）の共有関係は可能な限り維持する
 * - WebGPU 互換のため `computeBoneTexture()` は呼ばず、`boneTexture === null` を維持する
 *
 * @param rootNode - 最適化対象のルートノード
 * @returns スケルトン最適化の統計情報
 */
export function optimizeSkeletons(
  rootNode: Object3D,
): Result<SkeletonOptimizationStatistics, OptimizationError> {
  const allSkinnedMeshes: SkinnedMesh[] = []
  rootNode.traverse((obj) => {
    if (obj instanceof SkinnedMesh && obj.skeleton) {
      allSkinnedMeshes.push(obj)
    }
  })

  if (allSkinnedMeshes.length === 0) {
    return ok({
      originalSkeletonCount: 0,
      optimizedSkeletonCount: 0,
      originalTotalBones: 0,
      optimizedTotalBones: 0,
    })
  }

  // 最適化前の統計を集計
  const originalSkeletons = new Set<Skeleton>()
  for (const mesh of allSkinnedMeshes) {
    originalSkeletons.add(mesh.skeleton)
  }
  let originalTotalBones = 0
  for (const skeleton of originalSkeletons) {
    originalTotalBones += skeleton.bones.length
  }

  // 同一 (skinIndex, skinWeight) ペアに対する使用インデックス集計キャッシュ
  const usedIndicesCache = new Map<
    BufferAttribute | InterleavedBufferAttribute,
    Map<BufferAttribute | InterleavedBufferAttribute, Set<number>>
  >()

  interface MeshOptimizationEntry {
    mesh: SkinnedMesh
    oldSkeleton: Skeleton
    oldBones: Bone[]
    originalSkinIndexAttr: BufferAttribute | InterleavedBufferAttribute
    boneInverseMap: Map<Bone, Matrix4>
  }

  const targetEntries: MeshOptimizationEntry[] = []

  for (const mesh of allSkinnedMeshes) {
    const skeleton = mesh.skeleton
    const geometry = mesh.geometry
    const skinIndexAttr = geometry.getAttribute('skinIndex')
    const skinWeightAttr = geometry.getAttribute('skinWeight')

    if (!skinIndexAttr || !skinWeightAttr || skeleton.bones.length === 0) {
      continue
    }

    let weightMap = usedIndicesCache.get(skinIndexAttr)
    if (!weightMap) {
      weightMap = new Map()
      usedIndicesCache.set(skinIndexAttr, weightMap)
    }
    let usedIndices = weightMap.get(skinWeightAttr)
    if (!usedIndices) {
      usedIndices = collectUsedBoneIndices(skinIndexAttr, skinWeightAttr)
      weightMap.set(skinWeightAttr, usedIndices)
    }

    const boneInverseMap = new Map<Bone, Matrix4>()
    for (const index of usedIndices) {
      const bone = skeleton.bones[index]
      if (!bone) continue

      let inverse = skeleton.boneInverses[index]
      if (!inverse) {
        bone.updateWorldMatrix(true, false)
        inverse = bone.matrixWorld.clone().invert()
      }
      if (!boneInverseMap.has(bone)) {
        boneInverseMap.set(bone, inverse.clone())
      }
    }

    // glTF 仕様では skin.joints は最低 1 要素必須のため、全頂点ウェイト 0 の場合も先頭ボーンを保持
    if (boneInverseMap.size === 0 && skeleton.bones[0]) {
      const fallbackBone = skeleton.bones[0]
      let inverse = skeleton.boneInverses[0]
      if (!inverse) {
        fallbackBone.updateWorldMatrix(true, false)
        inverse = fallbackBone.matrixWorld.clone().invert()
      }
      boneInverseMap.set(fallbackBone, inverse.clone())
    }

    targetEntries.push({
      mesh,
      oldSkeleton: skeleton,
      oldBones: [...skeleton.bones],
      originalSkinIndexAttr: skinIndexAttr,
      boneInverseMap,
    })
  }

  // 互換性のある IBM を持つメッシュをグループ化
  const groups: SkeletonGroup[] = []
  const meshToGroupIndex = new Map<SkinnedMesh, number>()

  for (const entry of targetEntries) {
    let matchedGroupIndex = -1
    for (let gi = 0; gi < groups.length; gi++) {
      if (
        isBoneInverseMapMergeable(
          entry.boneInverseMap,
          groups[gi].boneInverseMap,
        )
      ) {
        matchedGroupIndex = gi
        break
      }
    }

    if (matchedGroupIndex === -1) {
      const newGroup: SkeletonGroup = {
        boneInverseMap: new Map(),
        meshes: [],
      }
      for (const [bone, inverse] of entry.boneInverseMap) {
        newGroup.boneInverseMap.set(bone, inverse.clone())
      }
      newGroup.meshes.push(entry.mesh)
      groups.push(newGroup)
      meshToGroupIndex.set(entry.mesh, groups.length - 1)
    } else {
      const group = groups[matchedGroupIndex]
      for (const [bone, inverse] of entry.boneInverseMap) {
        if (!group.boneInverseMap.has(bone)) {
          group.boneInverseMap.set(bone, inverse.clone())
        }
      }
      group.meshes.push(entry.mesh)
      meshToGroupIndex.set(entry.mesh, matchedGroupIndex)
    }
  }

  // グループごとに新しい Skeleton を作成（computeBoneTexture() は WebGPU 互換のため呼ばない）
  const groupSkeletons: Array<{ skeleton: Skeleton; bones: Bone[] }> = []
  for (const group of groups) {
    const newBones = Array.from(group.boneInverseMap.keys())
    const newBoneInverses = Array.from(group.boneInverseMap.values()).map((m) =>
      m.clone(),
    )
    const newSkeleton = new Skeleton(newBones, newBoneInverses)
    groupSkeletons.push({ skeleton: newSkeleton, bones: newBones })
  }

  // ジオメトリの共有関係を調査し、同一リマップ条件で共有されている場合は複製せず維持する
  const skeletonKeyMap = new Map<Skeleton, number>()
  const getSkeletonKey = (skeleton: Skeleton): number => {
    let key = skeletonKeyMap.get(skeleton)
    if (key === undefined) {
      key = skeletonKeyMap.size
      skeletonKeyMap.set(skeleton, key)
    }
    return key
  }

  const boneKeyMap = new Map<Bone, number>()
  const getBoneKey = (bone: Bone): number => {
    let key = boneKeyMap.get(bone)
    if (key === undefined) {
      key = boneKeyMap.size
      boneKeyMap.set(bone, key)
    }
    return key
  }

  const attrKeyMap = new Map<
    BufferAttribute | InterleavedBufferAttribute,
    number
  >()
  const getAttrKey = (
    attr: BufferAttribute | InterleavedBufferAttribute,
  ): number => {
    let key = attrKeyMap.get(attr)
    if (key === undefined) {
      key = attrKeyMap.size
      attrKeyMap.set(attr, key)
    }
    return key
  }

  // Geometry ごとに最初の (oldSkeletonKey, groupIndex) を記録し、異なる組が出た場合のみ clone
  const geometryPrimarySignature = new Map<BufferGeometry, string>()
  const remappedGeometryCache = new Map<
    BufferGeometry,
    Map<string, BufferGeometry>
  >()
  const remappedSkinIndexCache = new Map<string, BufferAttribute>()

  for (const entry of targetEntries) {
    const groupIndex = meshToGroupIndex.get(entry.mesh)!
    const { skeleton: newSkeleton, bones: newBones } =
      groupSkeletons[groupIndex]

    const oldSkeletonKey = getSkeletonKey(entry.oldSkeleton)
    const signature = `${oldSkeletonKey}:${groupIndex}`

    const oldBonesKey = entry.oldBones.map(getBoneKey).join(',')
    const skinIndexCacheKey = `${getAttrKey(entry.originalSkinIndexAttr)};${oldBonesKey};${groupIndex}`

    let remappedSkinIndex = remappedSkinIndexCache.get(skinIndexCacheKey)
    if (!remappedSkinIndex) {
      remappedSkinIndex = createRemappedSkinIndexAttribute(
        entry.originalSkinIndexAttr,
        entry.oldBones,
        newBones,
      )
      remappedSkinIndexCache.set(skinIndexCacheKey, remappedSkinIndex)
    }

    const originalGeometry = entry.mesh.geometry
    const primarySig = geometryPrimarySignature.get(originalGeometry)

    if (primarySig === undefined) {
      geometryPrimarySignature.set(originalGeometry, signature)
      originalGeometry.setAttribute('skinIndex', remappedSkinIndex)
    } else if (primarySig !== signature) {
      let clonedMap = remappedGeometryCache.get(originalGeometry)
      if (!clonedMap) {
        clonedMap = new Map()
        remappedGeometryCache.set(originalGeometry, clonedMap)
      }
      let clonedGeo = clonedMap.get(signature)
      if (!clonedGeo) {
        clonedGeo = shallowCloneGeometry(originalGeometry)
        clonedGeo.setAttribute('skinIndex', remappedSkinIndex)
        clonedMap.set(signature, clonedGeo)
      }
      entry.mesh.geometry = clonedGeo
    }

    entry.mesh.bind(newSkeleton, entry.mesh.bindMatrix.clone())
  }

  // 最適化後の統計集計と、使われなくなった古い Skeleton の解放
  const optimizedSkeletons = new Set<Skeleton>()
  for (const mesh of allSkinnedMeshes) {
    optimizedSkeletons.add(mesh.skeleton)
  }

  for (const oldSkeleton of originalSkeletons) {
    if (!optimizedSkeletons.has(oldSkeleton)) {
      oldSkeleton.dispose()
    }
  }

  let optimizedTotalBones = 0
  for (const skeleton of optimizedSkeletons) {
    optimizedTotalBones += skeleton.bones.length
  }

  return ok({
    originalSkeletonCount: originalSkeletons.size,
    optimizedSkeletonCount: optimizedSkeletons.size,
    originalTotalBones,
    optimizedTotalBones,
  })
}

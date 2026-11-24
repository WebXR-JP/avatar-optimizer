import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint8BufferAttribute,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { optimizeSkeletons } from '../../src/util/skeleton'

function computeSkinnedPosition(
  mesh: SkinnedMesh,
  vertexIndex: number,
): Vector3 {
  const posAttr = mesh.geometry.getAttribute('position')
  const skinIndexAttr = mesh.geometry.getAttribute('skinIndex')
  const skinWeightAttr = mesh.geometry.getAttribute('skinWeight')

  const basePos = new Vector3(
    posAttr.getX(vertexIndex),
    posAttr.getY(vertexIndex),
    posAttr.getZ(vertexIndex),
  ).applyMatrix4(mesh.bindMatrix)

  const result = new Vector3()
  const tmp = new Vector3()
  const boneMat = new Matrix4()

  const indices = [
    skinIndexAttr.getX(vertexIndex),
    skinIndexAttr.getY(vertexIndex),
    skinIndexAttr.getZ(vertexIndex),
    skinIndexAttr.getW(vertexIndex),
  ]
  const weights = [
    skinWeightAttr.getX(vertexIndex),
    skinWeightAttr.getY(vertexIndex),
    skinWeightAttr.getZ(vertexIndex),
    skinWeightAttr.getW(vertexIndex),
  ]

  for (let i = 0; i < 4; i++) {
    const w = weights[i]
    if (w === 0) continue
    const boneIdx = indices[i]
    const bone = mesh.skeleton.bones[boneIdx]
    const inverse = mesh.skeleton.boneInverses[boneIdx]
    boneMat.multiplyMatrices(bone.matrixWorld, inverse)
    tmp.copy(basePos).applyMatrix4(boneMat).multiplyScalar(w)
    result.add(tmp)
  }

  return result.applyMatrix4(mesh.bindMatrixInverse)
}

function createLinearBoneChain(count: number): {
  rootBone: Bone
  bones: Bone[]
} {
  const bones: Bone[] = []
  let parent: Bone | null = null
  for (let i = 0; i < count; i++) {
    const bone = new Bone()
    bone.name = `bone_${i}`
    if (parent) {
      bone.position.set(0, 1, 0)
      parent.add(bone)
    }
    bones.push(bone)
    parent = bone
  }
  return { rootBone: bones[0], bones }
}

describe('optimizeSkeletons', () => {
  it('returns zero statistics when no SkinnedMesh exists', () => {
    const root = new Object3D()
    const result = optimizeSkeletons(root)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        originalSkeletonCount: 0,
        optimizedSkeletonCount: 0,
        originalTotalBones: 0,
        optimizedTotalBones: 0,
      })
    }
  })

  it('removes unused bones, remaps skinIndex, and preserves skinning result', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(4)
    root.add(rootBone)

    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 0, 2, 0, 0, 3, 0], 3),
    )
    // bone_0 と bone_2 のみ使用（bone_1 と bone_3 は未使用）
    geometry.setAttribute(
      'skinIndex',
      new Uint16BufferAttribute([0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4),
    )
    geometry.setAttribute(
      'skinWeight',
      new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0], 4),
    )

    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial())
    root.add(mesh)
    root.updateMatrixWorld(true)

    const skeleton = new Skeleton(bones)
    mesh.bind(skeleton, new Matrix4())

    // 最適化前のポーズ結果を取得
    bones[2].rotation.z = Math.PI / 4
    root.updateMatrixWorld(true)
    const expectedBefore = [0, 1, 2].map((vi) =>
      computeSkinnedPosition(mesh, vi),
    )

    // バインドポーズへ戻してから最適化
    bones[2].rotation.z = 0
    root.updateMatrixWorld(true)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        originalSkeletonCount: 1,
        optimizedSkeletonCount: 1,
        originalTotalBones: 4,
        optimizedTotalBones: 2,
      })
    }

    expect(mesh.skeleton.bones).toEqual([bones[0], bones[2]])
    // シーン階層のノード自体は削除されない
    expect(bones[1].parent).toBe(bones[0])
    expect(bones[3].parent).toBe(bones[2])

    // ポーズを再度適用してスキニング結果が一致することを検証
    bones[2].rotation.z = Math.PI / 4
    root.updateMatrixWorld(true)
    for (let vi = 0; vi < 3; vi++) {
      const actual = computeSkinnedPosition(mesh, vi)
      expect(actual.distanceTo(expectedBefore[vi])).toBeLessThan(1e-5)
    }
  })

  it('merges multiple SkinnedMeshes with compatible IBMs into a single Skeleton', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(4)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const makeMesh = (boneIdx: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute(
        'position',
        new Float32BufferAttribute([0, boneIdx, 0], 3),
      )
      geo.setAttribute(
        'skinIndex',
        new Uint16BufferAttribute([boneIdx, 0, 0, 0], 4),
      )
      geo.setAttribute(
        'skinWeight',
        new Float32BufferAttribute([1, 0, 0, 0], 4),
      )
      const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
      const skel = new Skeleton([...bones])
      mesh.bind(skel, new Matrix4())
      return mesh
    }

    const meshA = makeMesh(0)
    const meshB = makeMesh(2)
    root.add(meshA, meshB)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        originalSkeletonCount: 2,
        optimizedSkeletonCount: 1,
        originalTotalBones: 8,
        optimizedTotalBones: 2,
      })
    }

    expect(meshA.skeleton).toBe(meshB.skeleton)
    expect(meshA.skeleton.bones).toEqual([bones[0], bones[2]])
  })

  it('keeps shared BufferGeometry intact without double-remapping skinIndex', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(3)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const sharedGeo = new BufferGeometry()
    sharedGeo.setAttribute('position', new Float32BufferAttribute([0, 2, 0], 3))
    sharedGeo.setAttribute(
      'skinIndex',
      new Uint16BufferAttribute([2, 0, 0, 0], 4),
    )
    sharedGeo.setAttribute(
      'skinWeight',
      new Float32BufferAttribute([1, 0, 0, 0], 4),
    )

    const skeleton = new Skeleton(bones)
    const bodyMesh = new SkinnedMesh(sharedGeo, new MeshBasicMaterial())
    const outlineMesh = new SkinnedMesh(sharedGeo, new MeshBasicMaterial())
    bodyMesh.bind(skeleton, new Matrix4())
    outlineMesh.bind(skeleton, new Matrix4())
    root.add(bodyMesh, outlineMesh)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)

    expect(bodyMesh.geometry).toBe(outlineMesh.geometry)
    expect(bodyMesh.skeleton).toBe(outlineMesh.skeleton)
    expect(bodyMesh.skeleton.bones).toEqual([bones[2]])
    expect(bodyMesh.geometry.getAttribute('skinIndex').getX(0)).toBe(0)
  })

  it('keeps incompatible boneInverses in separate Skeletons and preserves bindMatrix', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(2)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const makeMesh = (ibmOffset: number, bindOffset: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
      geo.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0], 4))
      geo.setAttribute(
        'skinWeight',
        new Float32BufferAttribute([1, 0, 0, 0], 4),
      )
      const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
      const ibm0 = new Matrix4().makeTranslation(ibmOffset, 0, 0)
      const ibm1 = new Matrix4().makeTranslation(ibmOffset, -1, 0)
      const skel = new Skeleton(bones, [ibm0, ibm1])
      const bindMat = new Matrix4().makeTranslation(bindOffset, 0, 0)
      mesh.bind(skel, bindMat)
      return mesh
    }

    const meshA = makeMesh(0, 10)
    const meshB = makeMesh(5, 20)
    root.add(meshA, meshB)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.optimizedSkeletonCount).toBe(2)
      expect(result.value.optimizedTotalBones).toBe(2)
    }

    expect(meshA.skeleton).not.toBe(meshB.skeleton)
    expect(meshA.bindMatrix.elements[12]).toBe(10)
    expect(meshB.bindMatrix.elements[12]).toBe(20)
  })

  it('keeps WebGPU-compatible boneMatrices sizing and boneTexture === null', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(3)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute([0, 1, 0], 3))
    geo.setAttribute('skinIndex', new Uint16BufferAttribute([1, 0, 0, 0], 4))
    geo.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0], 4))

    const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
    mesh.bind(new Skeleton(bones), new Matrix4())
    root.add(mesh)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    expect(mesh.skeleton.boneTexture).toBeNull()
    expect(mesh.skeleton.boneMatrices?.length).toBe(
      mesh.skeleton.bones.length * 16,
    )
  })

  it('keeps at least 1 bone when all skinWeights are zero', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(3)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    geo.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0], 4))
    geo.setAttribute('skinWeight', new Float32BufferAttribute([0, 0, 0, 0], 4))

    const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
    mesh.bind(new Skeleton(bones), new Matrix4())
    root.add(mesh)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    expect(mesh.skeleton.bones.length).toBe(1)
    expect(mesh.skeleton.bones[0]).toBe(bones[0])
  })

  it('promotes Uint8 skinIndex to Uint16 when merged skeleton exceeds 256 bones', () => {
    const root = new Object3D()
    const { rootBone, bones } = createLinearBoneChain(260)
    root.add(rootBone)
    root.updateMatrixWorld(true)

    const geo1 = new BufferGeometry()
    const positions1 = new Float32Array(200 * 3)
    const indices1 = new Uint8Array(200 * 4)
    const weights1 = new Float32Array(200 * 4)
    for (let i = 0; i < 200; i++) {
      indices1[i * 4] = i
      weights1[i * 4] = 1
    }
    geo1.setAttribute('position', new Float32BufferAttribute(positions1, 3))
    geo1.setAttribute('skinIndex', new Uint8BufferAttribute(indices1, 4))
    geo1.setAttribute('skinWeight', new Float32BufferAttribute(weights1, 4))
    const mesh1 = new SkinnedMesh(geo1, new MeshBasicMaterial())
    mesh1.bind(new Skeleton(bones.slice(0, 200)), new Matrix4())

    const geo2 = new BufferGeometry()
    const positions2 = new Float32Array(60 * 3)
    const indices2 = new Uint8Array(60 * 4)
    const weights2 = new Float32Array(60 * 4)
    for (let i = 0; i < 60; i++) {
      indices2[i * 4] = i
      weights2[i * 4] = 1
    }
    geo2.setAttribute('position', new Float32BufferAttribute(positions2, 3))
    geo2.setAttribute('skinIndex', new Uint8BufferAttribute(indices2, 4))
    geo2.setAttribute('skinWeight', new Float32BufferAttribute(weights2, 4))
    const mesh2 = new SkinnedMesh(geo2, new MeshBasicMaterial())
    mesh2.bind(new Skeleton(bones.slice(200, 260)), new Matrix4())

    root.add(mesh1, mesh2)

    const result = optimizeSkeletons(root)
    expect(result.isOk()).toBe(true)
    expect(mesh1.skeleton).toBe(mesh2.skeleton)
    expect(mesh1.skeleton.bones.length).toBe(260)

    const remapped2 = mesh2.geometry.getAttribute('skinIndex')
    expect(remapped2.array).toBeInstanceOf(Uint16Array)
    expect(remapped2.getX(59)).toBe(259)
  })
})

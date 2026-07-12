import { MToonMaterial } from '@pixiv/three-vrm'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { mergeGeometriesWithSlotAttribute } from '../../src/util/mesh/merge-mesh'

describe('merge-mesh', () => {
  describe('mergeGeometriesWithSlotAttribute', () => {
    it('should merge geometries and add slot attribute', () => {
      // Create two simple meshes
      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

      const material1 = new MToonMaterial()
      const material2 = new MToonMaterial()

      const mesh1 = new Mesh(geometry1, material1)
      const mesh2 = new Mesh(geometry2, material2)

      const meshes = [mesh1, mesh2]
      const slotMap = new Map<Mesh, number>()
      slotMap.set(mesh1, 0)
      slotMap.set(mesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        meshes,
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)

      if (result.isOk()) {
        const [mergedGeometry] = result.value
        expect(mergedGeometry).toBeDefined()

        // Check that positions are merged
        const positions = mergedGeometry.getAttribute('position')
        expect(positions.count).toBe(6) // 3 vertices from each mesh

        // Check that slot attribute is added
        const slotAttr = mergedGeometry.getAttribute('mtoonMaterialSlot')
        expect(slotAttr).toBeDefined()
        expect(slotAttr.count).toBe(6)

        // First 3 vertices should have slot 0
        expect(slotAttr.getX(0)).toBe(0)
        expect(slotAttr.getX(1)).toBe(0)
        expect(slotAttr.getX(2)).toBe(0)

        // Next 3 vertices should have slot 1
        expect(slotAttr.getX(3)).toBe(1)
        expect(slotAttr.getX(4)).toBe(1)
        expect(slotAttr.getX(5)).toBe(1)
      }
    })

    it('should preserve skinning weights when merging skinned meshes', () => {
      // Create a simple skinned mesh with bone weights
      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

      // Add skin weights and indices
      const skinWeights1 = new Float32Array([
        1.0,
        0.0,
        0.0,
        0.0, // vertex 0: fully weighted to bone 0
        0.5,
        0.5,
        0.0,
        0.0, // vertex 1: split between bone 0 and 1
        0.0,
        1.0,
        0.0,
        0.0, // vertex 2: fully weighted to bone 1
      ])
      const skinIndices1 = new Float32Array([
        0,
        1,
        2,
        3, // vertex 0
        0,
        1,
        2,
        3, // vertex 1
        0,
        1,
        2,
        3, // vertex 2
      ])
      geometry1.setAttribute('skinWeight', new BufferAttribute(skinWeights1, 4))
      geometry1.setAttribute('skinIndex', new BufferAttribute(skinIndices1, 4))

      // Create a second skinned mesh
      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

      const skinWeights2 = new Float32Array([
        0.0,
        0.0,
        1.0,
        0.0, // vertex 0: fully weighted to bone 2
        0.0,
        0.0,
        0.5,
        0.5, // vertex 1: split between bone 2 and 3
        0.0,
        0.0,
        0.0,
        1.0, // vertex 2: fully weighted to bone 3
      ])
      const skinIndices2 = new Float32Array([
        0,
        1,
        2,
        3, // vertex 0
        0,
        1,
        2,
        3, // vertex 1
        0,
        1,
        2,
        3, // vertex 2
      ])
      geometry2.setAttribute('skinWeight', new BufferAttribute(skinWeights2, 4))
      geometry2.setAttribute('skinIndex', new BufferAttribute(skinIndices2, 4))

      // Create bones and skeleton
      const bone0 = new Bone()
      const bone1 = new Bone()
      const bone2 = new Bone()
      const bone3 = new Bone()
      const bones = [bone0, bone1, bone2, bone3]
      const skeleton = new Skeleton(bones)

      const material1 = new MToonMaterial()
      const material2 = new MToonMaterial()

      const skinnedMesh1 = new SkinnedMesh(geometry1, material1)
      skinnedMesh1.bind(skeleton)

      const skinnedMesh2 = new SkinnedMesh(geometry2, material2)
      skinnedMesh2.bind(skeleton)

      const meshes = [skinnedMesh1, skinnedMesh2]
      const slotMap = new Map<Mesh, number>()
      slotMap.set(skinnedMesh1, 0)
      slotMap.set(skinnedMesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        meshes,
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)

      if (result.isOk()) {
        const [mergedGeometry] = result.value

        // Check that skinWeight attribute is preserved
        const skinWeight = mergedGeometry.getAttribute('skinWeight')
        expect(skinWeight).toBeDefined()
        expect(skinWeight.count).toBe(6) // 3 vertices from each mesh

        // Check that skinIndex attribute is preserved
        const skinIndex = mergedGeometry.getAttribute('skinIndex')
        expect(skinIndex).toBeDefined()
        expect(skinIndex.count).toBe(6)

        // Verify first mesh's skin weights are preserved
        // Vertex 0 from mesh1
        expect(skinWeight.getX(0)).toBeCloseTo(1.0)
        expect(skinWeight.getY(0)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(0)).toBeCloseTo(0.0)
        expect(skinWeight.getW(0)).toBeCloseTo(0.0)

        // Vertex 1 from mesh1
        expect(skinWeight.getX(1)).toBeCloseTo(0.5)
        expect(skinWeight.getY(1)).toBeCloseTo(0.5)
        expect(skinWeight.getZ(1)).toBeCloseTo(0.0)
        expect(skinWeight.getW(1)).toBeCloseTo(0.0)

        // Vertex 2 from mesh1
        expect(skinWeight.getX(2)).toBeCloseTo(0.0)
        expect(skinWeight.getY(2)).toBeCloseTo(1.0)
        expect(skinWeight.getZ(2)).toBeCloseTo(0.0)
        expect(skinWeight.getW(2)).toBeCloseTo(0.0)

        // Verify second mesh's skin weights are preserved
        // Vertex 0 from mesh2
        expect(skinWeight.getX(3)).toBeCloseTo(0.0)
        expect(skinWeight.getY(3)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(3)).toBeCloseTo(1.0)
        expect(skinWeight.getW(3)).toBeCloseTo(0.0)

        // Vertex 1 from mesh2
        expect(skinWeight.getX(4)).toBeCloseTo(0.0)
        expect(skinWeight.getY(4)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(4)).toBeCloseTo(0.5)
        expect(skinWeight.getW(4)).toBeCloseTo(0.5)

        // Vertex 2 from mesh2
        expect(skinWeight.getX(5)).toBeCloseTo(0.0)
        expect(skinWeight.getY(5)).toBeCloseTo(0.0)
        expect(skinWeight.getZ(5)).toBeCloseTo(0.0)
        expect(skinWeight.getW(5)).toBeCloseTo(1.0)

        // Verify skin indices are preserved
        expect(skinIndex.getX(0)).toBe(0)
        expect(skinIndex.getY(0)).toBe(1)
        expect(skinIndex.getZ(0)).toBe(2)
        expect(skinIndex.getW(0)).toBe(3)
      }
    })

    it('should handle empty mesh array', () => {
      const result = mergeGeometriesWithSlotAttribute(
        [],
        new Map(),
        'mtoonMaterialSlot',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain(
          'マージ対象のメッシュがありません',
        )
      }
    })

    it('should compensate for different inverseBindMatrices when merging meshes with non-zero origins (VRM0)', () => {
      // VRM0.x（UniVRM v0.115等）で再現:
      // 各SkinnedMeshのノードtranslationがIBMに含まれるため、
      // メッシュ間でinverseBindMatricesが異なる。
      // GLTFLoaderはbindMatrix=identityを使うため、IBM差分を頂点で補正する必要がある。

      const rootNode = new Object3D()
      const offset = new Vector3(0.1, 1.7, 0.1) // Antennaのノードtranslation

      // ボーン階層
      const rootBone = new Bone()
      rootBone.name = 'Hips'
      rootNode.add(rootBone)
      rootBone.updateMatrixWorld(true)

      const bones = [rootBone]

      // Body用IBM: ボーンがidentityの場合、IBM = identity
      const bodyIBM = new Matrix4() // identity

      // Antenna用IBM: メッシュノードのtranslationが含まれる
      // IBM_antenna = IBM_body * T(-offset)
      // 実際のVRMでは、各ジョイントのIBMに一定のtranslationオフセットが加わる
      const antennaIBM = new Matrix4().makeTranslation(
        -offset.x,
        -offset.y,
        -offset.z,
      )

      // Skeleton1 (Body): IBM = identity
      const skeleton1 = new Skeleton(bones, [bodyIBM.clone()])

      // Skeleton2 (Antenna): IBM = T(-offset)
      const skeleton2 = new Skeleton(bones, [antennaIBM.clone()])

      // Mesh1: Body at (0,0,0) with identity IBM
      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))
      const skinWeights1 = new Float32Array([
        1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      ])
      const skinIndices1 = new Float32Array([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ])
      geometry1.setAttribute('skinWeight', new BufferAttribute(skinWeights1, 4))
      geometry1.setAttribute('skinIndex', new BufferAttribute(skinIndices1, 4))

      const mesh1 = new SkinnedMesh(geometry1, new MToonMaterial())
      rootNode.add(mesh1)
      mesh1.updateMatrixWorld(true)
      // GLTFLoaderと同様にbindMatrix=identityでbind
      mesh1.bind(skeleton1, new Matrix4())

      // Mesh2: Antenna at offset position with different IBM
      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))
      const skinWeights2 = new Float32Array([
        1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      ])
      const skinIndices2 = new Float32Array([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ])
      geometry2.setAttribute('skinWeight', new BufferAttribute(skinWeights2, 4))
      geometry2.setAttribute('skinIndex', new BufferAttribute(skinIndices2, 4))

      const mesh2 = new SkinnedMesh(geometry2, new MToonMaterial())
      mesh2.position.set(offset.x, offset.y, offset.z)
      rootNode.add(mesh2)
      mesh2.updateMatrixWorld(true)
      // GLTFLoaderと同様にbindMatrix=identityでbind
      mesh2.bind(skeleton2, new Matrix4())

      const slotMap = new Map<Mesh, number>()
      slotMap.set(mesh1, 0)
      slotMap.set(mesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        [mesh1, mesh2],
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)

      if (result.isOk()) {
        const [mergedGeometry] = result.value
        const positions = mergedGeometry.getAttribute('position')
        expect(positions.count).toBe(6)

        // Mesh1の頂点はそのまま（基準メッシュ）
        expect(positions.getX(0)).toBeCloseTo(0)
        expect(positions.getY(0)).toBeCloseTo(0)
        expect(positions.getZ(0)).toBeCloseTo(0)

        // Mesh2の頂点はIBM差分が補正される
        // IBM差分 = bodyIBM^{-1} * antennaIBM = I * T(-offset) = T(-offset)
        // → compensation = T(-offset)（offsetの逆方向にシフト）
        // ただしこれはbindMatrix空間での変換なので...
        //
        // 実際の数学:
        // Body: skinned_pos = boneWorld * bodyIBM * bindMatrix * vertex
        //                   = boneWorld * I * I * vertex
        //                   = boneWorld * vertex
        // Antenna: skinned_pos = boneWorld * antennaIBM * bindMatrix * vertex
        //                      = boneWorld * T(-offset) * I * vertex
        //                      = boneWorld * (vertex - offset)
        //
        // マージ後にbodyのIBMを使う場合:
        // skinned_pos = boneWorld * bodyIBM * bindMatrix * new_vertex
        //             = boneWorld * new_vertex
        //
        // antennaと同じ結果にするには: new_vertex = vertex - offset
        // つまり compensation = T(-offset) を頂点に適用
        //
        // vertex 3 (mesh2の最初の頂点: 元は (0,0,0))
        // → (0,0,0) + (-0.1, -1.7, -0.1) = (-0.1, -1.7, -0.1)
        const v3 = new Vector3(
          positions.getX(3),
          positions.getY(3),
          positions.getZ(3),
        )
        expect(v3.x).toBeCloseTo(-offset.x)
        expect(v3.y).toBeCloseTo(-offset.y)
        expect(v3.z).toBeCloseTo(-offset.z)

        // vertex 4 (mesh2の2番目の頂点: 元は (0.1,0,0))
        // → (0.1,0,0) + (-0.1, -1.7, -0.1) = (0, -1.7, -0.1)
        const v4 = new Vector3(
          positions.getX(4),
          positions.getY(4),
          positions.getZ(4),
        )
        expect(v4.x).toBeCloseTo(0.1 - offset.x)
        expect(v4.y).toBeCloseTo(-offset.y)
        expect(v4.z).toBeCloseTo(-offset.z)

        // 統合スケルトンのboneInversesは基準メッシュのIBM（identity）
        const skeleton = mergedGeometry.userData.skeleton as Skeleton
        expect(skeleton).toBeDefined()
        expect(skeleton.boneInverses[0].equals(bodyIBM)).toBe(true)
      }
    })

    it('should output canonical model space even when the FIRST mesh has a baked IBM translation (VRM0 accessory-first order)', () => {
      // 実VRM（UniVRM 0.115出力）で発生したケース:
      // マージ対象の「最初の」メッシュがAntenna等の装飾メッシュで、
      // そのIBMにノードtranslationが焼き込まれている。
      // 以前は基準（最初の）メッシュの空間に統一していたため、
      // 統合スケルトンのIBMに焼き込みが残り、後段のVRM0→VRM1
      // マイグレーション（IBM=ボーンワールドの逆を前提に再計算する）で
      // グループ全体が原点方向へずれていた。
      // 修正後は基準メッシュに関わらず正準なモデル空間
      // （IBM=ボーンワールドの逆、bindMatrix=identity）に統一される。

      const rootNode = new Object3D()
      const offset = new Vector3(0.1, 1.7, 0.1) // Antennaのノードtranslation

      const rootBone = new Bone()
      rootBone.name = 'Hips'
      rootNode.add(rootBone)
      rootBone.updateMatrixWorld(true)
      const bones = [rootBone]

      // UniVRM出力を模倣: IBM_antenna = inv(boneWorld) * T(offset) = T(offset)
      // （boneWorld = identity のため）
      // three.jsのレンダリング: boneWorld * IBM * bindMatrix * v = v + offset
      // → 頂点はメッシュローカル（原点付近）、描画位置は頭上
      const antennaIBM = new Matrix4().makeTranslation(
        offset.x,
        offset.y,
        offset.z,
      )
      const bodyIBM = new Matrix4() // identity

      const makeSkinAttrs = (geometry: BufferGeometry) => {
        geometry.setAttribute(
          'skinWeight',
          new BufferAttribute(
            new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
            4,
          ),
        )
        geometry.setAttribute(
          'skinIndex',
          new BufferAttribute(
            new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            4,
          ),
        )
      }

      // Antenna: 頂点はローカル原点付近、IBMにoffsetが焼き込まれている
      const antennaGeometry = new BufferGeometry()
      antennaGeometry.setAttribute(
        'position',
        new BufferAttribute(
          new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0]),
          3,
        ),
      )
      makeSkinAttrs(antennaGeometry)
      const antennaMesh = new SkinnedMesh(antennaGeometry, new MToonMaterial())
      antennaMesh.position.copy(offset)
      rootNode.add(antennaMesh)
      antennaMesh.updateMatrixWorld(true)
      antennaMesh.bind(new Skeleton(bones, [antennaIBM.clone()]), new Matrix4())

      // Body: 頂点はモデル空間、IBMはidentity
      const bodyGeometry = new BufferGeometry()
      bodyGeometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      )
      makeSkinAttrs(bodyGeometry)
      const bodyMesh = new SkinnedMesh(bodyGeometry, new MToonMaterial())
      rootNode.add(bodyMesh)
      bodyMesh.updateMatrixWorld(true)
      bodyMesh.bind(new Skeleton(bones, [bodyIBM.clone()]), new Matrix4())

      const slotMap = new Map<Mesh, number>()
      slotMap.set(antennaMesh, 0)
      slotMap.set(bodyMesh, 1)

      // Antennaが最初（＝以前の実装では基準メッシュ）
      const result = mergeGeometriesWithSlotAttribute(
        [antennaMesh, bodyMesh],
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const [mergedGeometry] = result.value
        const positions = mergedGeometry.getAttribute('position')
        expect(positions.count).toBe(6)

        // Antennaの頂点はモデル空間の描画位置（頭上）に補正される
        expect(positions.getX(0)).toBeCloseTo(offset.x)
        expect(positions.getY(0)).toBeCloseTo(offset.y)
        expect(positions.getZ(0)).toBeCloseTo(offset.z)
        expect(positions.getX(1)).toBeCloseTo(0.1 + offset.x)

        // Bodyの頂点はそのまま（モデル空間のまま）
        expect(positions.getX(3)).toBeCloseTo(0)
        expect(positions.getY(3)).toBeCloseTo(0)
        expect(positions.getX(4)).toBeCloseTo(1)

        // 統合スケルトンのIBMは正準（ボーンワールドの逆 = identity）
        // Antennaの焼き込みIBMが残ってはいけない
        const skeleton = mergedGeometry.userData.skeleton as Skeleton
        expect(skeleton).toBeDefined()
        expect(skeleton.boneInverses[0].equals(new Matrix4())).toBe(true)

        // 統合メッシュのbindMatrixはidentity
        const bindMatrix = mergedGeometry.userData.bindMatrix as Matrix4
        expect(bindMatrix).toBeDefined()
        expect(bindMatrix.equals(new Matrix4())).toBe(true)
      }
    })

    it('should not modify vertices when all meshes share the same inverseBindMatrices', () => {
      // VRM1.0または原点一致VRM0: 全メッシュで同じIBMの場合、頂点は変更されない
      const rootNode = new Object3D()

      const rootBone = new Bone()
      rootNode.add(rootBone)
      rootBone.updateMatrixWorld(true)

      const bones = [rootBone]
      const ibm = new Matrix4() // 同じIBM

      const skeleton1 = new Skeleton(bones, [ibm.clone()])
      const skeleton2 = new Skeleton(bones, [ibm.clone()])

      const geometry1 = new BufferGeometry()
      const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
      geometry1.setAttribute('position', new BufferAttribute(positions1, 3))
      geometry1.setAttribute(
        'skinWeight',
        new BufferAttribute(
          new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          4,
        ),
      )
      geometry1.setAttribute(
        'skinIndex',
        new BufferAttribute(
          new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          4,
        ),
      )

      const mesh1 = new SkinnedMesh(geometry1, new MToonMaterial())
      rootNode.add(mesh1)
      mesh1.updateMatrixWorld(true)
      mesh1.bind(skeleton1, new Matrix4())

      const geometry2 = new BufferGeometry()
      const positions2 = new Float32Array([2, 0, 0, 3, 0, 0, 2, 1, 0])
      geometry2.setAttribute('position', new BufferAttribute(positions2, 3))
      geometry2.setAttribute(
        'skinWeight',
        new BufferAttribute(
          new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          4,
        ),
      )
      geometry2.setAttribute(
        'skinIndex',
        new BufferAttribute(
          new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          4,
        ),
      )

      const mesh2 = new SkinnedMesh(geometry2, new MToonMaterial())
      rootNode.add(mesh2)
      mesh2.updateMatrixWorld(true)
      mesh2.bind(skeleton2, new Matrix4())

      const slotMap = new Map<Mesh, number>()
      slotMap.set(mesh1, 0)
      slotMap.set(mesh2, 1)

      const result = mergeGeometriesWithSlotAttribute(
        [mesh1, mesh2],
        slotMap,
        'mtoonMaterialSlot',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const [mergedGeometry] = result.value
        const positions = mergedGeometry.getAttribute('position')

        // mesh1の頂点はそのまま
        expect(positions.getX(0)).toBeCloseTo(0)
        expect(positions.getY(0)).toBeCloseTo(0)

        // mesh2の頂点もそのまま（IBM補正不要）
        expect(positions.getX(3)).toBeCloseTo(2)
        expect(positions.getY(3)).toBeCloseTo(0)
      }
    })

    it('should handle meshes with no valid geometry', () => {
      const emptyGeometry = new BufferGeometry()
      const mesh = new Mesh(emptyGeometry, new MToonMaterial())

      const result = mergeGeometriesWithSlotAttribute(
        [mesh],
        new Map([[mesh, 0]]),
        'mtoonMaterialSlot',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('ASSET_ERROR')
        expect(result.error.message).toContain(
          '有効なジオメトリを持つメッシュがありません',
        )
      }
    })
  })
})

import { type VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  Quaternion,
  Scene,
  Skeleton,
  SkinnedMesh,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM } from '../../src/io/export'
import { loadVRM } from '../../src/io/load'
import { migrateVRM0ToVRM1 } from '../../src/process/migrate-vrm'
import { migrateSkeletonVRM0ToVRM1 } from '../../src/util/skeleton'

const VRM0_FILE = '/AliciaSolid.vrm'
const VRM1_FILE = '/VRM1_Constraint_Twist_Sample.vrm'

async function loadFixture(path: string): Promise<VRM> {
  const res = await fetch(path)
  const buf = await res.arrayBuffer()
  const result = await loadVRM(buf)
  return result._unsafeUnwrap()
}

/**
 * `@pixiv/three-vrm-animation` の `createVRMAnimationHumanoidTracks` と同じ規則で
 * VRM 1.0 基準の回転クォータニオンを VRM の normalized bone に適用する。
 */
function applyVRMAStyleRotation(
  vrm: VRM,
  boneName: VRMHumanBoneName,
  vrm1Quat: Quaternion,
): void {
  const normalized = vrm.humanoid.getNormalizedBoneNode(boneName)
  if (!normalized) {
    throw new Error(`Normalized bone not found: ${boneName}`)
  }

  if (vrm.meta.metaVersion === '0') {
    normalized.quaternion.set(-vrm1Quat.x, vrm1Quat.y, -vrm1Quat.z, vrm1Quat.w)
  } else {
    normalized.quaternion.copy(vrm1Quat)
  }

  vrm.humanoid.update()
  vrm.scene.updateMatrixWorld(true)
}

/**
 * 指定ボーンから子ボーンへ向かうワールド単位方向ベクトルを取得する。
 */
function getBoneWorldDirection(
  vrm: VRM,
  parentBoneName: VRMHumanBoneName,
  childBoneName: VRMHumanBoneName,
): Vector3 {
  const parent = vrm.humanoid.getRawBoneNode(parentBoneName)!
  const child = vrm.humanoid.getRawBoneNode(childBoneName)!
  vrm.scene.updateMatrixWorld(true)
  const p = parent.getWorldPosition(new Vector3())
  const c = child.getWorldPosition(new Vector3())
  return c.sub(p).normalize()
}

describe('VRM 0.x -> 1.0 ランタイムマイグレーションと VRMA 回転整合性', () => {
  it('optimizeModel (migrateVRM0ToVRM1: true) 後に metaVersion / humanoid / lookAt が VRM 1.0 へ更新されること', async () => {
    const vrm = await loadFixture(VRM0_FILE)
    expect(vrm.meta.metaVersion).toBe('0')

    const originalLookAtOffset = vrm.lookAt?.offsetFromHeadBone.clone()
    const oldRigRoot = vrm.humanoid.normalizedHumanBonesRoot

    const result = await optimizeModel(vrm, { migrateVRM0ToVRM1: true })
    expect(result.isOk()).toBe(true)

    // meta が VRM 1.0 形式へ更新されていること
    expect(vrm.meta.metaVersion).toBe('1')
    if (vrm.meta.metaVersion === '1') {
      expect(vrm.meta.name).toBe('Alicia Solid')
      expect(vrm.meta.authors).toEqual(['© DWANGO Co., Ltd.'])
      expect(vrm.meta.avatarPermission).toBe('everyone')
      expect(vrm.meta.commercialUsage).toBe('personalProfit')
      expect(vrm.meta.thumbnailImage).toBeDefined()
    }

    // VRMHumanoidRig が再構築され、古いルートはシーンから外れていること
    const newRigRoot = vrm.humanoid.normalizedHumanBonesRoot
    expect(newRigRoot).not.toBe(oldRigRoot)
    expect(oldRigRoot.parent).toBeNull()
    expect(newRigRoot.parent).toBe(vrm.scene)
    const rigRootsInScene = vrm.scene.children.filter(
      (c) => c.name === 'VRMHumanoidRig',
    )
    expect(rigRootsInScene).toHaveLength(1)

    // VRMLookAt が +Z 前向きに更新されていること
    if (vrm.lookAt && originalLookAtOffset) {
      expect(vrm.lookAt.faceFront.x).toBeCloseTo(0, 5)
      expect(vrm.lookAt.faceFront.y).toBeCloseTo(0, 5)
      expect(vrm.lookAt.faceFront.z).toBeCloseTo(1, 5)
      expect(vrm.lookAt.offsetFromHeadBone.x).toBeCloseTo(
        -originalLookAtOffset.x,
        5,
      )
      expect(vrm.lookAt.offsetFromHeadBone.y).toBeCloseTo(
        originalLookAtOffset.y,
        5,
      )
      expect(vrm.lookAt.offsetFromHeadBone.z).toBeCloseTo(
        -originalLookAtOffset.z,
        5,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applier = vrm.lookAt.applier as any
      if (applier && 'faceFront' in applier) {
        expect(applier.faceFront.z).toBeCloseTo(1, 5)
      }
    }
  })

  it('optimizeModel 後の VRMA 回転方向が未最適化 (Y180補正) および Export->Reload 後と一致すること', async () => {
    // 1. 未最適化の VRM 0.x に VRMA 回転を適用（基準）
    const vrmOriginal = await loadFixture(VRM0_FILE)
    // X, Y, Z すべてに回転成分を持つ VRM 1.0 基準のポーズ（右腕を前に上げつつひねる）
    const poseQuat = new Quaternion().setFromEuler(
      new Euler(Math.PI / 4, Math.PI / 6, -Math.PI / 3, 'XYZ'),
    )
    applyVRMAStyleRotation(
      vrmOriginal,
      VRMHumanBoneName.RightUpperArm,
      poseQuat,
    )
    const dirOriginal = getBoneWorldDirection(
      vrmOriginal,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    // VRM 0.x (-Z前向き) から VRM 1.0 (+Z前向き) への期待方向: Y 軸 180 度回転
    const expectedDirVRM1 = new Vector3(
      -dirOriginal.x,
      dirOriginal.y,
      -dirOriginal.z,
    )

    // 2. optimizeModel (migrateVRM0ToVRM1: true) 直後に VRMA 回転を適用
    const vrmOptimized = await loadFixture(VRM0_FILE)
    const optResult = await optimizeModel(vrmOptimized, {
      migrateVRM0ToVRM1: true,
    })
    expect(optResult.isOk()).toBe(true)

    applyVRMAStyleRotation(
      vrmOptimized,
      VRMHumanBoneName.RightUpperArm,
      poseQuat,
    )
    const dirOptimized = getBoneWorldDirection(
      vrmOptimized,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )

    expect(dirOptimized.x).toBeCloseTo(expectedDirVRM1.x, 3)
    expect(dirOptimized.y).toBeCloseTo(expectedDirVRM1.y, 3)
    expect(dirOptimized.z).toBeCloseTo(expectedDirVRM1.z, 3)

    // 3. Export -> Reload 後にも同じ回転方向であること
    // エクスポート前に T ポーズへ戻す
    vrmOptimized.humanoid.resetNormalizedPose()
    vrmOptimized.humanoid.update()
    const exported = await exportVRM(vrmOptimized, {})
    expect(exported.isOk()).toBe(true)

    const reloaded = (await loadVRM(exported._unsafeUnwrap()))._unsafeUnwrap()
    expect(reloaded.meta.metaVersion).toBe('1')
    applyVRMAStyleRotation(reloaded, VRMHumanBoneName.RightUpperArm, poseQuat)
    const dirReloaded = getBoneWorldDirection(
      reloaded,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )

    expect(dirReloaded.x).toBeCloseTo(expectedDirVRM1.x, 3)
    expect(dirReloaded.y).toBeCloseTo(expectedDirVRM1.y, 3)
    expect(dirReloaded.z).toBeCloseTo(expectedDirVRM1.z, 3)
  })

  it('ポーズがついた状態から optimizeModel を呼んでもバインドポーズ基準で正しくマイグレーションされること', async () => {
    const vrm = await loadFixture(VRM0_FILE)
    // 基準となる T ポーズでの右腕方向（Y180回転後）
    const restDirBefore = getBoneWorldDirection(
      vrm,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    const expectedRestDirAfter = new Vector3(
      -restDirBefore.x,
      restDirBefore.y,
      -restDirBefore.z,
    )

    // アニメーション再生中を模擬して大きくポーズを付ける
    const activePose = new Quaternion().setFromEuler(
      new Euler(Math.PI / 2, 0, Math.PI / 3),
    )
    applyVRMAStyleRotation(vrm, VRMHumanBoneName.RightUpperArm, activePose)

    // ポーズが付いたまま optimizeModel を実行
    const optResult = await optimizeModel(vrm, { migrateVRM0ToVRM1: true })
    expect(optResult.isOk()).toBe(true)

    // マイグレーション後は T ポーズに戻って正しく Y180 回転されていること
    vrm.humanoid.update()
    const restDirAfter = getBoneWorldDirection(
      vrm,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    expect(restDirAfter.x).toBeCloseTo(expectedRestDirAfter.x, 3)
    expect(restDirAfter.y).toBeCloseTo(expectedRestDirAfter.y, 3)
    expect(restDirAfter.z).toBeCloseTo(expectedRestDirAfter.z, 3)
  })

  it('optimizeModel (migrateVRM0ToVRM1: true) -> exportVRM で権限とサムネイルが保たれること', async () => {
    const vrm = await loadFixture(VRM0_FILE)
    const optResult = await optimizeModel(vrm, { migrateVRM0ToVRM1: true })
    expect(optResult.isOk()).toBe(true)

    const exported = await exportVRM(vrm, {})
    expect(exported.isOk()).toBe(true)

    const reloaded = (await loadVRM(exported._unsafeUnwrap()))._unsafeUnwrap()
    expect(reloaded.meta.metaVersion).toBe('1')
    if (reloaded.meta.metaVersion === '1') {
      expect(reloaded.meta.name).toBe('Alicia Solid')
      expect(reloaded.meta.authors).toEqual(['© DWANGO Co., Ltd.'])
      expect(reloaded.meta.avatarPermission).toBe('everyone')
      expect(reloaded.meta.commercialUsage).toBe('personalProfit')
      expect(reloaded.meta.thumbnailImage).toBeDefined()
    }
  })

  it('非ゼロ hips Z オフセットと初期回転を持つ VRM 0.x でも humanoid.update() で古い姿勢に戻らないこと', async () => {
    const vrm = await loadFixture(VRM0_FILE)
    const hips = vrm.humanoid.getRawBoneNode(VRMHumanBoneName.Hips)!
    const rightArm = vrm.humanoid.getRawBoneNode(
      VRMHumanBoneName.RightUpperArm,
    )!

    // VRM 0.x 側に非ゼロの hips Z オフセットと初期回転を持たせ、その状態で VRMHumanoid を初期化する
    hips.position.z = -0.05
    rightArm.quaternion.setFromEuler(new Euler(0.2, -0.3, 0.15))
    vrm.scene.updateMatrixWorld(true)
    const oldRoot = vrm.humanoid.normalizedHumanBonesRoot
    oldRoot.parent?.remove(oldRoot)
    vrm.humanoid.copy(vrm.humanoid)
    vrm.scene.add(vrm.humanoid.normalizedHumanBonesRoot)

    const result = migrateVRM0ToVRM1(vrm)
    expect(result.isOk()).toBe(true)

    // humanoid.update() を呼んでも古い hips Z や初期回転が書き戻されないこと
    vrm.humanoid.update()
    vrm.scene.updateMatrixWorld(true)

    expect(hips.position.z).toBeCloseTo(0.05, 4)
    expect(rightArm.quaternion.x).toBeCloseTo(0, 4)
    expect(rightArm.quaternion.y).toBeCloseTo(0, 4)
    expect(rightArm.quaternion.z).toBeCloseTo(0, 4)
    expect(rightArm.quaternion.w).toBeCloseTo(1, 4)
  })

  it('migrateVRM0ToVRM1 を 2 回呼んでも冪等で、VRM 1.0 モデルには何もしないこと', async () => {
    const vrm0 = await loadFixture(VRM0_FILE)
    expect(migrateVRM0ToVRM1(vrm0).isOk()).toBe(true)
    const dirAfterFirst = getBoneWorldDirection(
      vrm0,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )

    // 2 回目は既に metaVersion === '1' なのでスキップされる
    expect(migrateVRM0ToVRM1(vrm0).isOk()).toBe(true)
    const dirAfterSecond = getBoneWorldDirection(
      vrm0,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    expect(dirAfterSecond.x).toBeCloseTo(dirAfterFirst.x, 5)
    expect(dirAfterSecond.y).toBeCloseTo(dirAfterFirst.y, 5)
    expect(dirAfterSecond.z).toBeCloseTo(dirAfterFirst.z, 5)

    // VRM 1.0 モデルに対してもスキップされる
    const vrm1 = await loadFixture(VRM1_FILE)
    const dirBefore = getBoneWorldDirection(
      vrm1,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    expect(migrateVRM0ToVRM1(vrm1).isOk()).toBe(true)
    const dirAfter = getBoneWorldDirection(
      vrm1,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.RightLowerArm,
    )
    expect(dirAfter.x).toBeCloseTo(dirBefore.x, 5)
    expect(dirAfter.y).toBeCloseTo(dirBefore.y, 5)
    expect(dirAfter.z).toBeCloseTo(dirBefore.z, 5)
  })

  it('共有 morphAttributes を持つマルチプリミティブで WebGL 描画後のマイグレーションが GPU キャッシュ含め正しく反映されること', () => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const renderer = new WebGLRenderer({ canvas, alpha: true })
    renderer.setClearColor(0x000000, 0)
    const target = new WebGLRenderTarget(size, size)

    try {
      // 上半分 (prim0) と下半分 (prim1) で同一の position / morphAttributes を共有
      const positions = new BufferAttribute(
        new Float32Array([
          // prim0: y in [0.1, 0.6]
          -0.4, 0.1, 0, 0.4, 0.1, 0, 0.4, 0.6, 0, -0.4, 0.6, 0,
          // prim1: y in [-0.6, -0.1]
          -0.4, -0.6, 0, 0.4, -0.6, 0, 0.4, -0.1, 0, -0.4, -0.1, 0,
        ]),
        3,
      )
      // morphTarget 0: X 方向に +1.0 移動（適用後は x in [0.6, 1.4]）
      const morphDelta = new Float32Array(8 * 3)
      for (let i = 0; i < 8; i++) {
        morphDelta[i * 3] = 1.0
      }
      const morphPos = new BufferAttribute(morphDelta, 3)
      const skinWeights = new BufferAttribute(
        new Float32Array(8 * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        4,
      )
      const skinIndices = new BufferAttribute(new Float32Array(8 * 4), 4)

      const makePrim = (indices: number[], skeleton: Skeleton) => {
        const geo = new BufferGeometry()
        geo.setAttribute('position', positions)
        geo.setAttribute('skinWeight', skinWeights)
        geo.setAttribute('skinIndex', skinIndices)
        geo.setIndex(indices)
        geo.morphAttributes.position = [morphPos]
        geo.morphTargetsRelative = true
        const mat = new MeshBasicMaterial({
          color: 0xffffff,
          side: DoubleSide,
        })
        const mesh = new SkinnedMesh(geo, mat)
        mesh.frustumCulled = false
        mesh.bind(skeleton)
        mesh.morphTargetInfluences = [1]
        return mesh
      }

      const rootBone = new Bone()
      const skeleton = new Skeleton([rootBone])
      const prim0 = makePrim([0, 1, 2, 0, 2, 3], skeleton)
      const prim1 = makePrim([4, 5, 6, 4, 6, 7], skeleton)

      const rootNode = new Object3D()
      rootNode.add(rootBone, prim0, prim1)

      const scene = new Scene()
      scene.add(rootNode)
      const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10)
      camera.position.set(0, 0, 5)
      camera.lookAt(0, 0, 0)

      const countHalfPixels = () => {
        renderer.setRenderTarget(target)
        renderer.clear()
        renderer.render(scene, camera)
        const pixels = new Uint8Array(size * size * 4)
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
        let left = 0
        let right = 0
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const alpha = pixels[(y * size + x) * 4 + 3]
            if (alpha > 0) {
              if (x < size / 2) left++
              else right++
            }
          }
        }
        return { left, right }
      }

      // マイグレーション前: morph (+1.0) により右側 (x > 0) にのみ描画され、WebGLMorphtargets キャッシュが作られる
      const before = countHalfPixels()
      expect(before.right).toBeGreaterThan(0)
      expect(before.left).toBe(0)

      // マイグレーション実行
      const result = migrateSkeletonVRM0ToVRM1(rootNode)
      expect(result.isOk()).toBe(true)

      // 合成位置 (position + morph) が Y 軸 180 度回転していること
      for (const mesh of [prim0, prim1]) {
        const pos = mesh.geometry.getAttribute('position')
        const mPos = mesh.geometry.morphAttributes.position![0]
        // 元の頂点0 (-0.4, 0.1, 0) + morph (1.0, 0, 0) = (0.6, 0.1, 0) -> (-0.6, 0.1, 0)
        expect(pos.getX(0) + mPos.getX(0)).toBeCloseTo(-0.6, 5)
      }

      // マイグレーション後: GPU キャッシュが更新され、morph (-1.0) により左側 (x < 0) にのみ描画される
      const after = countHalfPixels()
      expect(after.left).toBeGreaterThan(0)
      expect(after.right).toBe(0)
    } finally {
      target.dispose()
      renderer.dispose()
    }
  })
})

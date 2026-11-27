import type { VRM } from '@pixiv/three-vrm'
import { ok, Result, safeTry } from 'neverthrow'
import { Bone, type Texture } from 'three'
import { migrateVRM0MetaToVRM1 } from '../exporter/meta'
import type { OptimizationError } from '../types'
import { collectActiveSceneResources } from '../util/cleanup-references'
import { migrateSkeletonVRM0ToVRM1 } from '../util/skeleton'
import { migrateSpringBone } from '../util/springbone'

/**
 * VRMHumanoid をマイグレーション後のボーン状態から再構築する
 *
 * three-vrm の VRMHumanoidRig は構築時のボーン座標・親ワールド回転・
 * ローカル回転をキャッシュしているため、スケルトンマイグレーション後に
 * 古いまま残すと vrm.humanoid.update() が毎フレームマイグレーション前の
 * 回転や hips 位置を書き戻してしまう。
 *
 * humanoid.copy(humanoid) で既存インスタンスの参照を保ったまま内部の
 * _rawHumanBones と _normalizedHumanBones を再生成する。
 */
function rebuildHumanoid(vrm: VRM): void {
  const humanoid = vrm.humanoid
  if (!humanoid || typeof humanoid.copy !== 'function') return

  const oldRoot = humanoid.normalizedHumanBonesRoot
  if (oldRoot?.parent) {
    oldRoot.parent.remove(oldRoot)
  }

  // VRMHumanoidRig.update() が boneNode.parent.matrixWorld を破壊的に
  // invert() している場合があるため、再構築前に必ずワールド行列を最新化する
  vrm.scene.updateMatrixWorld(true)

  humanoid.copy(humanoid)

  if (humanoid.normalizedHumanBonesRoot) {
    vrm.scene.add(humanoid.normalizedHumanBonesRoot)
  }
}

/**
 * VRMLookAt を VRM 1.0 座標系 (+Z 前向き) へ更新する
 *
 * VRM 0.x では faceFront が (0, 0, -1) に設定され、offsetFromHeadBone も
 * -Z 前向き座標系になっている。また VRMLookAt / VRMLookAtBoneApplier は
 * 構築時の head / eye ボーンの rest 回転をキャッシュしているため、
 * マイグレーション後のボーンに合わせて再初期化する。
 */
function migrateLookAt(lookAt: NonNullable<VRM['lookAt']>): void {
  // offsetFromHeadBone を Y 軸 180 度回転 (x -> -x, z -> -z)
  lookAt.offsetFromHeadBone.set(
    -lookAt.offsetFromHeadBone.x,
    lookAt.offsetFromHeadBone.y,
    -lookAt.offsetFromHeadBone.z,
  )

  // VRM 1.0 は +Z 前向き
  lookAt.faceFront.set(0, 0, 1)

  // _restHeadWorldQuaternion をマイグレーション後の head ボーンから再取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookAtAny = lookAt as any
  if (
    lookAtAny._restHeadWorldQuaternion &&
    typeof lookAt.getLookAtWorldQuaternion === 'function'
  ) {
    lookAt.getLookAtWorldQuaternion(lookAtAny._restHeadWorldQuaternion)
  }

  // VRMLookAtBoneApplier の場合は faceFront (+Z) と目ボーンの rest 回転を再初期化
  // instanceof ではなくプロパティ有無で判定する（@pixiv/three-vrm 傘パッケージの
  // 二重実体で instanceof が false になる問題への対策）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applier = lookAt.applier as any
  if (applier && 'faceFront' in applier) {
    const ApplierCtor = applier.constructor as new (
      humanoid: typeof lookAt.humanoid,
      rangeMapHorizontalInner: unknown,
      rangeMapHorizontalOuter: unknown,
      rangeMapVerticalDown: unknown,
      rangeMapVerticalUp: unknown,
    ) => typeof lookAt.applier

    lookAt.applier = new ApplierCtor(
      lookAt.humanoid,
      applier.rangeMapHorizontalInner,
      applier.rangeMapHorizontalOuter,
      applier.rangeMapVerticalDown,
      applier.rangeMapVerticalUp,
    )
  }

  lookAt.reset()
}

/**
 * VRM 0.x インスタンスをランタイム上で VRM 1.0 形式へマイグレーションする
 *
 * 以下の処理をまとめて実行し、エクスポート前でも VRM 1.0 として
 * VRMA アニメーションや SpringBone / LookAt が正しく動作する状態にする:
 * 1. バインドポーズへのリセット（SpringBone / Humanoid）
 * 2. スケルトンと頂点の Y 軸 180 度回転（Humanoid Bone は rotation=identity）
 * 3. VRMHumanoid (VRMHumanoidRig) の再構築
 * 4. VRMLookAt の座標系・rest 回転更新
 * 5. vrm.meta を VRM1Meta (metaVersion: '1') へ変換
 * 6. SpringBone の調整（仮想 tail・重力方向・コライダーオフセット・初期状態）
 *
 * 既に VRM 1.0 (metaVersion === '1') の場合は何もしない。
 *
 * @param vrm - マイグレーション対象の VRM インスタンス
 */
export function migrateVRM0ToVRM1(vrm: VRM): Result<void, OptimizationError> {
  return safeTry(function* () {
    // 既に VRM 1.0 の場合はスキップ
    if (vrm.meta?.metaVersion === '1') {
      return ok(undefined)
    }

    // SpringBoneManager を一時的に退避
    // 処理中に外部から vrm.update() が呼ばれても SpringBone が動かないようにする
    const springBoneManager = vrm.springBoneManager
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vrm as any).springBoneManager = null

    // 物理演算やアニメーションによる変形を排除し、バインドポーズへ戻す
    springBoneManager?.reset()
    vrm.humanoid?.resetNormalizedPose?.()
    vrm.humanoid?.resetRawPose?.()
    vrm.scene.updateMatrixWorld(true)

    // Humanoid Bone のセットを構築
    // VRM 1.0 仕様では Humanoid Bone のみ回転が identity である必要がある
    // 非 Humanoid Bone（髪、服、SpringBone 制御のボーンなど）は回転を保持
    const humanoidBones = new Set<Bone>()
    if (vrm.humanoid) {
      Object.values(vrm.humanoid.humanBones).forEach((humanBone) => {
        const node = humanBone.node
        if (node instanceof Bone) {
          humanoidBones.add(node)
        }
      })
    }

    const skeletonResult = migrateSkeletonVRM0ToVRM1(vrm.scene, {
      humanoidBones,
    })

    if (skeletonResult.isErr()) {
      // 失敗時も退避した SpringBoneManager を必ず復元する
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(vrm as any).springBoneManager = springBoneManager
      return skeletonResult
    }

    // VRMHumanoidRig を新しいボーン位置・回転で再構築
    rebuildHumanoid(vrm)

    // VRMLookAt を VRM 1.0 (+Z 前向き) へ更新
    if (vrm.lookAt) {
      migrateLookAt(vrm.lookAt)
    }

    // メタ情報を VRM 1.0 形式 (metaVersion: '1') へ更新
    // @pixiv/three-vrm-animation の createVRMAnimationClip は vrm.meta.metaVersion を
    // 見て VRM 0.x 用の X/Z 反転を行うため、ここを更新しないと回転向きが反転する
    if (vrm.meta) {
      const oldMetaTexture = (vrm.meta as { texture?: Texture }).texture
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(vrm as any).meta = migrateVRM0MetaToVRM1(vrm.meta)
      if (oldMetaTexture) {
        const active = collectActiveSceneResources(vrm)
        if (!active.textures.has(oldMetaTexture)) {
          oldMetaTexture.dispose()
        }
      }
    }

    // SpringBoneManager を復元して SpringBone 関連の調整を一括実行
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vrm as any).springBoneManager = springBoneManager
    migrateSpringBone(vrm)

    return ok(undefined)
  })
}

import { err, ok, Result, safeTry } from 'neverthrow'
import {
  Bone,
  BufferAttribute,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three'
import { OptimizationError } from '../../types'
import { editBufferAttribute } from '../mesh/buffer-attribute'

/**
 * マイグレーションオプション
 */
export interface MigrationOptions {
  /** Humanoid Boneのセット（これらのボーンのみ回転をidentityにする） */
  humanoidBones?: Set<Bone>
  /** 頂点回転をスキップ（デバッグ用） */
  skipVertexRotation?: boolean
  /** ボーン位置回転をスキップ（デバッグ用） */
  skipBoneTransform?: boolean
  /** bindMatrix更新をスキップ（デバッグ用） */
  skipBindMatrix?: boolean
}

/**
 * VRM0.x形式のスケルトンをVRM1.0形式に変換
 * Y軸周り180度回転を適用してモデルの向きを+Z前向きに変更
 *
 * 処理内容:
 * 1. 全メッシュの頂点位置をY軸180度回転
 * 2. 各ボーンのワールド座標を記録し、Y軸180度回転
 * 3. Humanoid Boneのrotationをidentityにリセット（VRM1.0仕様）
 *    - 非Humanoid Bone（髪、服など）は相対的な回転を保持
 * 4. ルートからツリーを下りながらローカル位置を再計算
 * 5. InverseBoneMatrix（boneInverses）を再計算
 *
 * @param rootNode - VRMモデルのルートノード（VRM.scene）
 * @param options - マイグレーションオプション
 * @returns 変換結果
 */
export function migrateSkeletonVRM0ToVRM1(
  rootNode: Object3D,
  options: MigrationOptions = {},
): Result<void, OptimizationError> {
  return safeTry(function* () {
    // 1. 全SkinnedMeshを収集
    const skinnedMeshes: SkinnedMesh[] = []
    rootNode.traverse((obj) => {
      if (obj instanceof SkinnedMesh) {
        skinnedMeshes.push(obj)
      }
    })

    if (skinnedMeshes.length === 0) {
      return err({
        type: 'ASSET_ERROR',
        message: 'SkinnedMeshが見つかりません',
      })
    }

    // 2. 各メッシュの頂点位置をY軸180度回転
    // 新しいアプローチ: 全BufferAttributeを収集し、ArrayBufferごとに1回だけ回転を適用
    // これにより、BufferAttributeの関係を気にせず、各ArrayBufferを確実に1回だけ処理できる
    if (!options.skipVertexRotation) {
      rotateAllVertexBuffers(skinnedMeshes)

      // 2b. SkinnedMeshのpositionもY軸180度回転
      // UniVRM等で書き出されたVRM0では、剣や装飾品が非ゼロpositionのSkinnedMeshとして
      // エクスポートされることがある。頂点だけ回転してpositionを回転しないと位置がずれる。
      for (const mesh of skinnedMeshes) {
        if (mesh.position.x !== 0 || mesh.position.z !== 0) {
          mesh.position.x = -mesh.position.x
          mesh.position.z = -mesh.position.z
          mesh.updateMatrix()
          mesh.updateMatrixWorld(true)
          // bindMatrixを新しいmesh位置に合わせて更新
          mesh.bindMatrix.copy(mesh.matrixWorld)
          mesh.bindMatrixInverse.copy(mesh.matrixWorld).invert()
        }
      }
    }

    // 3. 全ボーンのワールド座標を記録（重複排除）
    // 複数のスケルトンが同じボーンを共有している場合があるため、
    // 先にすべてのボーンの座標を記録してから変換を適用する
    if (!options.skipBoneTransform) {
      const allBonePositions = new Map<Bone, Vector3>()
      const processedSkeletons = new Set<Skeleton>()

      // 4. すべてのスケルトンからボーン座標を収集
      for (const mesh of skinnedMeshes) {
        const skeleton = mesh.skeleton
        if (!skeleton || processedSkeletons.has(skeleton)) continue
        processedSkeletons.add(skeleton)

        const positions = recordBoneWorldPositions(skeleton)
        for (const [bone, pos] of positions) {
          if (!allBonePositions.has(bone)) {
            allBonePositions.set(bone, pos)
          }
        }
      }

      // 5. 座標をY軸180度回転
      const rotatedPositions = rotateBonePositions(allBonePositions)

      // 6. 全ボーンから真のルートボーン（祖先の中で最も上にある Bone）を特定
      // VRMでは各SkinnedMesh.skeleton.bonesは使用するボーンのみを含むが、
      // 実際のボーン階層は1つなので、全ボーンを走査して真のルートを見つける
      //
      // 「親がBoneでない」で止めずに、Bone でないノードを挟んでも祖先を
      // 最後まで辿る。Head の下に Armature_Hair（Object3D）→ Hair_Root（Bone）
      // のような階層で Hair_Root を独立したルートとして処理すると、
      // Armature_Hair の補正と順序が噛み合わなくなるため。
      // そうした Bone は rebuildBoneTransforms が中間ノードを経由して辿る。
      // どのスケルトンにも含まれない Bone が joint の上にある場合も、
      // その Bone をルートとして扱う（ルートが 0 件になって失敗しない）
      const allRootBones = new Set<Bone>()
      for (const bone of allBonePositions.keys()) {
        allRootBones.add(findTopmostBone(bone))
      }

      if (allRootBones.size === 0) {
        return err({
          type: 'ASSET_ERROR',
          message: 'ルートボーンが見つかりません',
        })
      }

      // 6b. スケルトンに含まれない Bone のワールド座標も変換前に記録する
      // GLTFLoader は skin の joint を Bone として生成するが、その skin を持つ
      // メッシュが最適化の途中で消えていると allBonePositions に載らない。
      // rebuildBoneTransforms は親から順に書き換えるため、処理中に
      // 「現在のワールド座標」を取ると新しい親 × 古いローカルの位置になり、
      // 回転後の目標が狂う。全 Bone をここで記録しておき、後段で現在位置を
      // 読む経路に頼らない
      for (const rootBone of allRootBones) {
        rootBone.traverse((obj) => {
          if (!(obj instanceof Bone) || rotatedPositions.has(obj)) return
          obj.updateWorldMatrix(true, false)
          const worldPos = obj.getWorldPosition(new Vector3())
          rotatedPositions.set(
            obj,
            worldPos.applyMatrix4(new Matrix4().makeRotationY(Math.PI)),
          )
        })
      }

      // 7. 非Bone子要素のワールド行列を記録（ボーン変換変更前）
      const nonBoneWorldMatrices = new Map<Object3D, Matrix4>()
      for (const rootBone of allRootBones) {
        const matrices = collectNonBoneChildWorldMatrices(rootBone)
        for (const [obj, mat] of matrices) {
          nonBoneWorldMatrices.set(obj, mat)
        }
      }

      // 8. 各ルートボーンからボーン変換を再構築
      // 非Bone子要素（末端ノード・装飾メッシュ・中間の空ノード）も
      // 同じ走査の中で親の新しい座標系に合わせて補正する
      for (const rootBone of allRootBones) {
        rebuildBoneTransforms(
          rootBone,
          rotatedPositions,
          options.humanoidBones,
          nonBoneWorldMatrices,
        )
      }

      // 10. すべてのスケルトンのInverseBoneMatrixを再計算
      processedSkeletons.forEach((skeleton) => {
        recalculateBoneInverses(skeleton)
      })
    }

    // 11. bindMatrixの更新
    if (!options.skipBindMatrix) {
      for (const mesh of skinnedMeshes) {
        mesh.skeleton.calculateInverses()
      }
    }

    return ok(undefined)
  })
}

/**
 * 全SkinnedMeshの頂点バッファにY軸180度回転を適用
 *
 * editBufferAttribute を使用して安全に新しい BufferAttribute を作成し、
 * 元のバッファを変更せずに処理する。
 *
 * @param skinnedMeshes - 処理対象のSkinnedMesh配列
 */
function rotateAllVertexBuffers(skinnedMeshes: SkinnedMesh[]): void {
  /**
   * Y軸180度回転を適用する編集関数
   * 回転行列 [[−1, 0, 0], [0, 1, 0], [0, 0, −1]] を適用
   */
  function rotateVec3Array(array: Float32Array): void {
    const count = array.length / 3
    for (let i = 0; i < count; i++) {
      const baseIdx = i * 3
      array[baseIdx + 0] = -array[baseIdx + 0] // x = -x
      array[baseIdx + 2] = -array[baseIdx + 2] // z = -z
    }
  }

  /**
   * BufferAttribute を回転して geometry に設定
   */
  function rotateAndSetAttribute(
    geometry: SkinnedMesh['geometry'],
    attrName: string,
    attr: BufferAttribute | InterleavedBufferAttribute,
  ): void {
    if (attr.itemSize !== 3) return

    const rotated = editBufferAttribute<Float32Array>(attr, rotateVec3Array)
    geometry.setAttribute(attrName, rotated)
  }

  // 処理済みのgeometryを追跡（共有geometryの重複処理を防ぐ）
  const processedGeometries = new Set<SkinnedMesh['geometry']>()

  // 各SkinnedMeshを処理
  for (const mesh of skinnedMeshes) {
    const geometry = mesh.geometry

    // 既に処理済みのgeometryはスキップ
    if (processedGeometries.has(geometry)) {
      continue
    }
    processedGeometries.add(geometry)

    // position属性
    const posAttr = geometry.getAttribute('position')
    if (posAttr) {
      rotateAndSetAttribute(geometry, 'position', posAttr)
    }

    // normal属性
    const normalAttr = geometry.getAttribute('normal')
    if (normalAttr) {
      rotateAndSetAttribute(geometry, 'normal', normalAttr)
    }

    // morphTarget position属性
    const morphPositions = geometry.morphAttributes.position
    if (morphPositions && Array.isArray(morphPositions)) {
      for (let i = 0; i < morphPositions.length; i++) {
        const morphAttr = morphPositions[i]
        if (morphAttr.itemSize !== 3) continue
        // 既存の配列を直接編集（GPUキャッシュ問題を回避）
        const array = morphAttr.array as Float32Array
        rotateVec3Array(array)
        morphAttr.needsUpdate = true
      }
    }

    // morphTarget normal属性
    const morphNormals = geometry.morphAttributes.normal
    if (morphNormals && Array.isArray(morphNormals)) {
      for (let i = 0; i < morphNormals.length; i++) {
        const morphAttr = morphNormals[i]
        if (morphAttr.itemSize !== 3) continue
        // 既存の配列を直接編集
        const array = morphAttr.array as Float32Array
        rotateVec3Array(array)
        morphAttr.needsUpdate = true
      }
    }

    // Three.jsのmorphテクスチャキャッシュを無効化するためdisposeイベントを発火
    // これにより次のレンダリングでmorphデータが再アップロードされる
    geometry.dispatchEvent({ type: 'dispose' })
  }
}

/**
 * スケルトン内の全ボーンのワールド座標を記録
 */
export function recordBoneWorldPositions(
  skeleton: Skeleton,
): Map<Bone, Vector3> {
  const positions = new Map<Bone, Vector3>()

  // ワールド行列を更新
  if (skeleton.bones.length > 0) {
    skeleton.bones[0].updateWorldMatrix(true, true)
  }

  for (const bone of skeleton.bones) {
    const worldPos = new Vector3()
    bone.getWorldPosition(worldPos)
    positions.set(bone, worldPos.clone())
  }

  return positions
}

/**
 * ボーン座標をY軸周り180度回転
 */
export function rotateBonePositions(
  positions: Map<Bone, Vector3>,
): Map<Bone, Vector3> {
  const rotated = new Map<Bone, Vector3>()
  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)

  for (const [bone, pos] of positions) {
    const newPos = pos.clone().applyMatrix4(rotationMatrix)
    rotated.set(bone, newPos)
  }

  return rotated
}

/**
 * スケルトンのルートボーンを特定
 * 親がBoneでないボーンをルートとして返す
 */
export function findRootBone(skeleton: Skeleton): Bone | null {
  for (const bone of skeleton.bones) {
    // 親がBoneでない場合、このボーンがルート
    if (!(bone.parent instanceof Bone)) {
      return bone
    }
  }
  return skeleton.bones[0] || null
}

/**
 * ルートからツリーを下りながらボーンのローカル変換を再計算
 *
 * VRM1.0仕様では Humanoid Bone のみ rotation が identity である必要がある。
 * 非Humanoid Bone（髪、服、SpringBone制御のボーンなど）は相対的な回転を保持する。
 *
 * Bone でないノードも同じ走査で辿る。スキンの joint でない末端ノード
 * （`Breast_1_L_end` のような `*_end`）は three の GLTFLoader が Object3D として
 * 生成するため、Bone だけを辿ると補正から漏れて親の座標系だけが反転し、
 * ワールド位置が前後逆になる。SpringBone の末端がそこを指すため、
 * 静止方向が体の内側を向き、コライダーに押されて胸などが背中側へ振れていた。
 *
 * @param rootBone - ルートボーン
 * @param rotatedPositions - Y軸180度回転後のワールド座標
 * @param humanoidBones - Humanoid Boneのセット（これらのみidentityにする）
 * @param nonBoneWorldMatrices - 非Bone子要素の変換前ワールド行列
 *   （collectNonBoneChildWorldMatrices で記録したもの）
 */
export function rebuildBoneTransforms(
  rootBone: Bone,
  rotatedPositions: Map<Bone, Vector3>,
  humanoidBones?: Set<Bone>,
  nonBoneWorldMatrices?: Map<Object3D, Matrix4>,
): void {
  const identityQuat = new Quaternion()
  const rotationMatrix = new Matrix4().makeRotationY(Math.PI)
  const rotationQuat = new Quaternion().setFromRotationMatrix(rotationMatrix)

  /**
   * 非Boneノードを処理する再帰関数
   *
   * - SkinnedMesh: step 2b で position を回転済みなので触らない
   * - SpringBone コライダー: offset 側を rotateSpringBoneColliderOffsets で回すので触らない
   * - Mesh（非スキンの装飾メッシュ）: 頂点を回転していないので
   *   ワールド姿勢ごと Y軸180°回転した位置・向きに補正する
   * - その他の Object3D（末端ノード・中間の空ノード）: 非Humanoid Bone と同じ規則で
   *   位置はワールド座標を回転、回転は q' = R q R^-1 で座標系に合わせる
   *
   * いずれの場合も子に Bone や Object3D が続いていれば辿り続ける
   */
  function processNonBone(obj: Object3D, parentWorldMatrix: Matrix4): void {
    const recorded = nonBoneWorldMatrices?.get(obj)
    const isSkinned = obj instanceof SkinnedMesh
    const isCollider = isSpringBoneCollider(obj)

    if (recorded && !isSkinned && !isCollider) {
      if (obj instanceof Mesh) {
        compensateNonBoneChildren(new Map([[obj, recorded]]), rotationMatrix)
      } else {
        const targetWorldPos = new Vector3()
          .setFromMatrixPosition(recorded)
          .applyMatrix4(rotationMatrix)
        const localPos = targetWorldPos.applyMatrix4(
          parentWorldMatrix.clone().invert(),
        )
        obj.position.copy(localPos)
        obj.quaternion.copy(
          rotationQuat
            .clone()
            .multiply(obj.quaternion)
            .multiply(rotationQuat.clone().invert()),
        )
        obj.updateMatrix()
        obj.updateMatrixWorld(true)
      }
    }

    for (const child of obj.children) {
      if (child instanceof Bone) {
        processBone(child, obj.matrixWorld)
      } else {
        processNonBone(child, obj.matrixWorld)
      }
    }
  }

  /**
   * ボーンを処理する再帰関数
   * @param bone - 処理対象のボーン
   * @param parentWorldMatrix - 親のワールド行列
   */
  function processBone(bone: Bone, parentWorldMatrix: Matrix4): void {
    let targetWorldPos = rotatedPositions.get(bone)

    // rotatedPositions に含まれないボーンは現在のワールド位置を取得してY軸180度回転
    // migrateSkeletonVRM0ToVRM1 からの呼び出しではツリー内の全 Bone を事前に
    // 記録しているので通常ここには来ない。親を先に書き換えているため、
    // ここで取れる位置は「新しい親 × 古いローカル」であり正確ではない。
    // 単体で rebuildBoneTransforms を使う場合の最後の手段として残している
    if (!targetWorldPos) {
      bone.updateMatrixWorld(true)
      const currentWorldPos = new Vector3()
      bone.getWorldPosition(currentWorldPos)
      targetWorldPos = currentWorldPos.applyMatrix4(rotationMatrix)
    }

    // 親のワールド行列の逆行列を計算
    const parentWorldMatrixInverse = parentWorldMatrix.clone().invert()

    // Humanoid Boneかどうかで処理を分岐
    const isHumanoidBone = humanoidBones?.has(bone) ?? true

    if (isHumanoidBone) {
      // Humanoid Bone: VRM1.0仕様に従い rotation を identity にする
      bone.quaternion.copy(identityQuat)

      // ローカル位置 = ワールド位置を親のローカル座標系に変換
      // 親の rotation が identity なので、単純な差分で計算できる
      const parentWorldPos = new Vector3().setFromMatrixPosition(
        parentWorldMatrix,
      )
      const localPos = targetWorldPos.clone().sub(parentWorldPos)
      bone.position.copy(localPos)
    } else {
      // 非Humanoid Bone: 相対的な回転を保持
      // マイグレーション前の rotation を Y軸180度回転で調整
      // VRM0のローカル座標系はY軸180度回転しているため、
      // rotation も同様に調整する必要がある

      // 現在の回転を取得（マイグレーション前のVRM0での回転）
      const originalLocalQuat = bone.quaternion.clone()

      // VRM0→VRM1でローカル座標系がY軸180度回転するため、
      // 元の回転を新しい座標系に変換: q' = R * q * R^-1
      // ここで R は Y軸180度回転
      const newLocalQuat = rotationQuat
        .clone()
        .multiply(originalLocalQuat)
        .multiply(rotationQuat.clone().invert())
      bone.quaternion.copy(newLocalQuat)

      // ローカル位置を計算
      // ワールド位置から親のワールド行列の逆行列を適用してローカル位置を求める
      const localPos = targetWorldPos
        .clone()
        .applyMatrix4(parentWorldMatrixInverse)
      bone.position.copy(localPos)
    }

    // 行列を更新
    bone.updateMatrix()
    bone.updateMatrixWorld(true)

    // 子を再帰処理（更新後のワールド行列を渡す）
    for (const child of bone.children) {
      if (child instanceof Bone) {
        processBone(child, bone.matrixWorld)
      } else {
        processNonBone(child, bone.matrixWorld)
      }
    }
  }

  // ルートボーンから開始
  // 親のワールド行列を取得（親がない場合は単位行列）
  let parentWorldMatrix = new Matrix4()
  if (rootBone.parent) {
    rootBone.parent.updateMatrixWorld(true)
    parentWorldMatrix = rootBone.parent.matrixWorld.clone()
  }

  processBone(rootBone, parentWorldMatrix)
}

/**
 * 祖先を最後まで辿り、最も上にある Bone を返す（Bone でないノードを挟んでも止まらない）
 * 祖先に Bone がなければ自分自身がルート
 */
function findTopmostBone(bone: Bone): Bone {
  let topmost = bone
  let current = bone.parent
  while (current) {
    if (current instanceof Bone) topmost = current
    current = current.parent
  }
  return topmost
}

/**
 * SpringBone のコライダーか（VRMSpringBoneCollider は shape を持つ Object3D）
 * instanceof を使わないのは three-vrm が二重インストールされた場合に
 * クラス実体が別になり判定が壊れるため
 */
function isSpringBoneCollider(obj: Object3D): boolean {
  return (obj as { shape?: unknown }).shape !== undefined
}

/**
 * ボーンツリーを走査し、非Bone子要素のワールド行列を記録する
 * rebuildBoneTransforms の前に呼び出すことで、ボーン変換変更前の位置を保存する
 *
 * 対象は Bone 以外の全ノード（装飾メッシュ、末端ノード、中間の空ノード）。
 * SkinnedMesh は step 2b の position 回転で、SpringBone コライダーは
 * offset の回転でそれぞれ別途処理されるため除外する
 *
 * @param rootBone - ルートボーン
 * @returns 非Bone子要素とそのワールド行列のMap
 */
export function collectNonBoneChildWorldMatrices(
  rootBone: Bone,
): Map<Object3D, Matrix4> {
  const result = new Map<Object3D, Matrix4>()
  rootBone.traverse((obj) => {
    if (obj === rootBone) return
    if (obj instanceof Bone) return
    if (obj instanceof SkinnedMesh) return
    if (isSpringBoneCollider(obj)) return
    result.set(obj, obj.matrixWorld.clone())
  })
  return result
}

/**
 * 記録した非Bone子要素のワールド行列をY軸180°回転し、新しいローカル変換を計算して適用する
 * rebuildBoneTransforms の後に呼び出す
 *
 * @param recorded - collectNonBoneChildWorldMatrices で記録したMap
 * @param yRotation - Y軸180°回転行列
 */
export function compensateNonBoneChildren(
  recorded: Map<Object3D, Matrix4>,
  yRotation: Matrix4,
): void {
  for (const [child, oldWorldMatrix] of recorded) {
    if (!child.parent) continue

    // ターゲットワールド行列 = Ry180 * 元のワールド行列
    const targetWorld = yRotation.clone().multiply(oldWorldMatrix)
    // 新しいローカル行列 = 親の逆ワールド行列 * ターゲットワールド行列
    const parentInverse = child.parent.matrixWorld.clone().invert()
    const newLocal = parentInverse.multiply(targetWorld)
    // position, quaternion, scale に分解して適用
    newLocal.decompose(child.position, child.quaternion, child.scale)
    child.updateMatrix()
    child.updateMatrixWorld(true)
  }
}

/**
 * InverseBoneMatrix（skeleton.boneInverses）を再計算
 */
export function recalculateBoneInverses(skeleton: Skeleton): void {
  // ワールド行列を更新
  skeleton.bones.forEach((bone) => bone.updateMatrixWorld(true))

  // calculateInversesを呼び出し
  // これは各bone.matrixWorldの逆行列をboneInversesに設定する
  skeleton.calculateInverses()

  // 行列テクスチャを更新（使用している場合）
  skeleton.computeBoneTexture()
}

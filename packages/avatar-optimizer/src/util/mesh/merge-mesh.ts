import { err, ok, Result } from 'neverthrow'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OptimizationError } from '../../types'

/**
 * ジオメトリの属性を正規化し、マージ可能な状態にする
 *
 * SkinnedMeshと通常Meshが混在する場合、skinIndex/skinWeight属性の有無が
 * 異なるためマージに失敗する。この関数は全ジオメトリの属性を統一する。
 *
 * @param geometries - 正規化対象のジオメトリ配列
 * @param hasSkinnedMesh - SkinnedMeshが含まれるかどうか
 */
function normalizeGeometryAttributes(
  geometries: BufferGeometry[],
  hasSkinnedMesh: boolean,
): void {
  if (geometries.length === 0) return

  // 全ジオメトリから使用されている属性名を収集
  const allAttributeNames = new Set<string>()
  for (const geometry of geometries) {
    for (const name of Object.keys(geometry.attributes)) {
      allAttributeNames.add(name)
    }
  }

  // SkinnedMeshがある場合、skinIndex/skinWeight属性が必須
  if (hasSkinnedMesh) {
    allAttributeNames.add('skinIndex')
    allAttributeNames.add('skinWeight')
  }

  // 各ジオメトリに欠けている属性を追加
  for (const geometry of geometries) {
    const vertexCount = geometry.attributes.position?.count ?? 0
    if (vertexCount === 0) continue

    for (const attrName of allAttributeNames) {
      if (geometry.attributes[attrName]) continue

      // 属性が欠けている場合、デフォルト値で埋める
      const referenceAttr = findReferenceAttribute(geometries, attrName)
      if (referenceAttr) {
        const itemSize = referenceAttr.itemSize
        const normalized = referenceAttr.normalized

        // skinIndex用の特別処理（Uint16を使用）
        if (attrName === 'skinIndex') {
          const array = new Uint16Array(vertexCount * itemSize)
          geometry.setAttribute(
            attrName,
            new Uint16BufferAttribute(array, itemSize, normalized),
          )
        }
        // skinWeight用の特別処理（最初のウェイトを1.0に）
        else if (attrName === 'skinWeight') {
          const array = new Float32Array(vertexCount * itemSize)
          // 各頂点の最初のウェイトを1.0にして、ルートボーン（インデックス0）に完全にバインド
          for (let i = 0; i < vertexCount; i++) {
            array[i * itemSize] = 1.0 // 最初のウェイト = 1.0
          }
          geometry.setAttribute(
            attrName,
            new Float32BufferAttribute(array, itemSize, normalized),
          )
        }
        // その他の属性は0で埋める
        else {
          const array = new Float32Array(vertexCount * itemSize)
          geometry.setAttribute(
            attrName,
            new Float32BufferAttribute(array, itemSize, normalized),
          )
        }
      }
    }
  }
}

/**
 * ジオメトリ配列から指定属性の参照を取得
 */
function findReferenceAttribute(
  geometries: BufferGeometry[],
  attrName: string,
): BufferAttribute | null {
  for (const geometry of geometries) {
    const attr = geometry.attributes[attrName]
    if (attr) return attr as BufferAttribute
  }
  return null
}

/**
 * ジオメトリを結合してスロット属性を追加
 *
 * BufferGeometryUtils.mergeBufferGeometriesを使用して複数のジオメトリを
 * マージし、スロット属性を追加します。
 * SkinnedMeshが含まれる場合、ボーンインデックスのリマッピングを行い、
 * 統合されたスケルトンをuserData.skeletonに格納して返します。
 *
 * @param meshes - 結合対象のメッシュ配列
 * @param materialSlotMap - メッシュ→スロットインデックスのマップ
 * @param slotAttributeName - スロット属性名
 * @returns 結合されたBufferGeometryの配列
 */
export function mergeGeometriesWithSlotAttribute(
  meshes: Mesh[],
  materialSlotMap: Map<Mesh, number>,
  slotAttributeName: string,
): Result<BufferGeometry[], OptimizationError> {
  if (meshes.length === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: 'マージ対象のメッシュがありません',
    })
  }

  // 有効なジオメトリを持つメッシュをフィルタリング
  const validMeshes: Array<{ mesh: Mesh; geometry: BufferGeometry }> = []
  for (const mesh of meshes) {
    if (mesh.geometry instanceof BufferGeometry) {
      const vertexCount = mesh.geometry.attributes.position?.count ?? 0
      if (vertexCount > 0) {
        validMeshes.push({ mesh, geometry: mesh.geometry })
      }
    }
  }

  if (validMeshes.length === 0) {
    return err({
      type: 'ASSET_ERROR',
      message: '有効なジオメトリを持つメッシュがありません',
    })
  }

  // 全てのSkinnedMeshからボーンを収集して統合リストを作成
  // 各SkinnedMeshは使用するボーンのみを持つため、全体を収集する必要がある
  //
  // 統合先の空間は「正準なモデル空間」に統一する:
  // - 統合スケルトンのIBM = ボーンの現在のワールド行列の逆（バインドポーズ前提）
  // - 統合メッシュのbindMatrix = identity
  // - 各メッシュの頂点には「正準IBMと元IBMの差分」を補正行列として適用する
  //
  // VRM0.x（UniVRM出力）ではメッシュノードのtranslationがIBMに焼き込まれており、
  // メッシュごとにIBMが異なる。以前は基準メッシュのIBM（＝焼き込みを含む空間）に
  // 統一していたが、その場合「頂点＝モデル空間、IBM＝ボーンワールドの逆」を前提とする
  // 後段のVRM0→VRM1マイグレーションと矛盾し、装飾メッシュが原点付近にずれていた
  const allBones: Bone[] = []
  const boneUuidToIndex = new Map<string, number>() // uuid -> 統合リスト内のインデックス
  const boneInversesMap = new Map<string, Matrix4>() // uuid -> 正準IBM（ワールド行列の逆）
  let firstSkinnedMesh: SkinnedMesh | null = null

  // メッシュごとのIBM補正行列
  // compensation = boneWorld * thisIBM（最初のジョイントで検出）
  // IBMにノードtranslationが焼き込まれている場合、この値がそのtranslationになる
  const meshIBMCompensation = new Map<SkinnedMesh, Matrix4>()
  const EPSILON = 1e-6

  /** 2つの行列がepsilon許容で等しいか */
  const matrixNearlyEquals = (a: Matrix4, b: Matrix4): boolean => {
    for (let i = 0; i < 16; i++) {
      if (Math.abs(a.elements[i] - b.elements[i]) > EPSILON) return false
    }
    return true
  }
  const identity = new Matrix4()

  for (const { mesh } of validMeshes) {
    if (mesh instanceof SkinnedMesh && mesh.skeleton) {
      if (!firstSkinnedMesh) firstSkinnedMesh = mesh

      // 正準IBMとのずれを各ジョイントから計算する
      // UniVRM出力ではメッシュ内の全ジョイントで同一のずれになるため、
      // 最初のジョイントの補正を採用し、2つ目で同一性を検証する
      let compensation: Matrix4 | null = null
      for (let idx = 0; idx < mesh.skeleton.bones.length; idx++) {
        const bone = mesh.skeleton.bones[idx]
        const thisIBM = mesh.skeleton.boneInverses[idx]
        if (!thisIBM) continue
        // 祖先を含めてワールド行列を最新化する
        // （updateMatrixWorld(true)は子方向のみで祖先を再計算しない）
        bone.updateWorldMatrix(true, false)
        const thisCompensation = bone.matrixWorld.clone().multiply(thisIBM)
        if (!compensation) {
          compensation = thisCompensation
          continue
        }
        // 2つ目のジョイントで補正の同一性を検証
        if (!matrixNearlyEquals(compensation, thisCompensation)) {
          console.warn(
            `mergeGeometriesWithSlotAttribute: メッシュ "${mesh.name}" のIBM補正が` +
              'ジョイント間で一致しません。バインドポーズでない状態で呼ばれたか、' +
              '非一様なIBMを持つモデルです。最初のジョイントの補正を使用します。',
          )
        }
        break
      }
      if (compensation && !matrixNearlyEquals(compensation, identity)) {
        meshIBMCompensation.set(mesh, compensation)
      }

      // ボーンを正準IBM（現在のワールド行列の逆）で登録
      mesh.skeleton.bones.forEach((bone) => {
        if (!boneUuidToIndex.has(bone.uuid)) {
          boneUuidToIndex.set(bone.uuid, allBones.length)
          allBones.push(bone)
          bone.updateWorldMatrix(true, false)
          boneInversesMap.set(bone.uuid, bone.matrixWorld.clone().invert())
        }
      })
    }
  }

  const hasSkinnedMesh = firstSkinnedMesh !== null

  // 各ジオメトリをワールド座標に変換
  const transformedGeometries: BufferGeometry[] = []
  const slotData: number[] = []

  for (const { mesh, geometry } of validMeshes) {
    const transformedGeometry = geometry.clone()
    const vertexCount = geometry.attributes.position?.count ?? 0

    // SkinnedMeshの場合はbindMatrixとIBM補正を適用して、頂点を正準なモデル空間に変換
    if (mesh instanceof SkinnedMesh) {
      transformedGeometry.applyMatrix4(mesh.bindMatrix)
      // IBM補正: IBMにノードtranslation等が焼き込まれているメッシュの頂点を
      // モデル空間の正しい位置へ移動する
      const ibmCompensation = meshIBMCompensation.get(mesh)
      if (ibmCompensation) {
        transformedGeometry.applyMatrix4(ibmCompensation)
      }

      // skinIndexのリマッピング
      if (mesh.skeleton && transformedGeometry.attributes.skinIndex) {
        const skinIndexAttr = transformedGeometry.attributes.skinIndex
        const oldBones = mesh.skeleton.bones

        // skinIndex属性を直接書き換える
        for (let i = 0; i < skinIndexAttr.count; i++) {
          const a = skinIndexAttr.getX(i)
          const b = skinIndexAttr.getY(i)
          const c = skinIndexAttr.getZ(i)
          const d = skinIndexAttr.getW(i)

          // 古いインデックス -> ボーン -> UUID -> 新しいインデックス
          // ボーンが存在しない場合（ありえないはずだが）は0にしておく
          const newA = oldBones[a]
            ? (boneUuidToIndex.get(oldBones[a].uuid) ?? 0)
            : 0
          const newB = oldBones[b]
            ? (boneUuidToIndex.get(oldBones[b].uuid) ?? 0)
            : 0
          const newC = oldBones[c]
            ? (boneUuidToIndex.get(oldBones[c].uuid) ?? 0)
            : 0
          const newD = oldBones[d]
            ? (boneUuidToIndex.get(oldBones[d].uuid) ?? 0)
            : 0

          skinIndexAttr.setXYZW(i, newA, newB, newC, newD)
        }
      }
    }
    // 通常のMeshの場合
    else {
      mesh.updateWorldMatrix(true, false)
      // 正準なモデル空間 = ワールド空間（統合メッシュのbindMatrixはidentity）
      transformedGeometry.applyMatrix4(mesh.matrixWorld)
    }

    // TODO: 顔メッシュを判別して、顔メッシュの場合はモーフターゲットを残す
    // 現状は全てのメッシュからモーフターゲットを削除
    transformedGeometry.morphAttributes = {}
    transformedGeometry.morphTargetsRelative = false

    transformedGeometries.push(transformedGeometry)

    // スロットインデックスを頂点数分追加
    const slotIndex = materialSlotMap.get(mesh) ?? 0
    for (let i = 0; i < vertexCount; i++) {
      slotData.push(slotIndex)
    }
  }

  // ジオメトリの属性を正規化（SkinnedMeshと通常Meshの混在に対応）
  normalizeGeometryAttributes(transformedGeometries, hasSkinnedMesh)

  // BufferGeometryUtils.mergeBufferGeometriesを使用してジオメトリをマージ
  const mergedGeometry = mergeGeometries(transformedGeometries)

  // mergeGeometriesが失敗した場合（属性の不一致など）nullを返す
  if (mergedGeometry === null) {
    return err({
      type: 'ASSET_ERROR',
      message:
        'ジオメトリのマージに失敗しました。全てのジオメトリが同じ属性を持っているか確認してください。',
    })
  }

  // 統合されたスケルトンとbindMatrixをuserDataに保存
  if (hasSkinnedMesh && firstSkinnedMesh) {
    // 収集した正準IBM（ワールド行列の逆）で統合スケルトンを作成
    // new Skeleton(bones)はcalculateInverses()を呼び出すため、
    // 手動でboneInversesを設定する必要がある
    const boneInverses = allBones.map((bone) => {
      const inverse = boneInversesMap.get(bone.uuid)
      if (inverse) {
        return inverse
      }
      // boneInverseが見つからない場合は現在のmatrixWorldから計算
      bone.updateWorldMatrix(true, false)
      return bone.matrixWorld.clone().invert()
    })

    const skeleton = new Skeleton(allBones, boneInverses)
    mergedGeometry.userData.skeleton = skeleton
    // 頂点を正準なモデル空間に統一しているため、bindMatrixはidentity
    mergedGeometry.userData.bindMatrix = new Matrix4()
  }

  // スロット属性を追加
  const slotArray = new Float32Array(slotData)
  mergedGeometry.setAttribute(
    slotAttributeName,
    new Float32BufferAttribute(slotArray, 1),
  )

  return ok([mergedGeometry])
}

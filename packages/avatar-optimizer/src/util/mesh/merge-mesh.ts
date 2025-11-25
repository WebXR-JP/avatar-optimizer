import { err, ok, Result } from 'neverthrow'
import { BufferGeometry, Float32BufferAttribute, Mesh, SkinnedMesh, Bone, Skeleton } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OptimizationError } from '../../types'

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
): Result<BufferGeometry[], OptimizationError>
{
  if (meshes.length === 0)
  {
    return err({
      type: 'ASSET_ERROR',
      message: 'マージ対象のメッシュがありません',
    })
  }

  // 有効なジオメトリを持つメッシュをフィルタリング
  const validMeshes: Array<{ mesh: Mesh; geometry: BufferGeometry }> = []
  for (const mesh of meshes)
  {
    if (mesh.geometry instanceof BufferGeometry)
    {
      const vertexCount = mesh.geometry.attributes.position?.count ?? 0
      if (vertexCount > 0)
      {
        validMeshes.push({ mesh, geometry: mesh.geometry })
      }
    }
  }

  if (validMeshes.length === 0)
  {
    return err({
      type: 'ASSET_ERROR',
      message: '有効なジオメトリを持つメッシュがありません',
    })
  }

  // 全てのSkinnedMeshからボーンを収集して統合リストを作成
  const allBones: Bone[] = []
  const boneUniqueMap = new Map<string, number>() // uuid -> newIndex
  const hasSkinnedMesh = validMeshes.some(({ mesh }) => mesh instanceof SkinnedMesh)

  if (hasSkinnedMesh)
  {
    for (const { mesh } of validMeshes)
    {
      if (mesh instanceof SkinnedMesh && mesh.skeleton)
      {
        for (const bone of mesh.skeleton.bones)
        {
          if (!boneUniqueMap.has(bone.uuid))
          {
            boneUniqueMap.set(bone.uuid, allBones.length)
            allBones.push(bone)
          }
        }
      }
    }
  }

  // 各ジオメトリをワールド座標に変換
  const transformedGeometries: BufferGeometry[] = []
  const slotData: number[] = []

  for (const { mesh, geometry } of validMeshes)
  {
    const transformedGeometry = geometry.clone()
    const vertexCount = geometry.attributes.position?.count ?? 0

    // SkinnedMeshの場合はbindMatrixを適用して、頂点を共通の空間（スケルトン空間）に変換
    if (mesh instanceof SkinnedMesh)
    {
      transformedGeometry.applyMatrix4(mesh.bindMatrix)

      // skinIndexのリマッピング
      if (mesh.skeleton && transformedGeometry.attributes.skinIndex)
      {
        const skinIndexAttr = transformedGeometry.attributes.skinIndex
        const oldBones = mesh.skeleton.bones

        // skinIndex属性を直接書き換える
        for (let i = 0; i < skinIndexAttr.count; i++)
        {
          const a = skinIndexAttr.getX(i)
          const b = skinIndexAttr.getY(i)
          const c = skinIndexAttr.getZ(i)
          const d = skinIndexAttr.getW(i)

          // 古いインデックス -> ボーン -> UUID -> 新しいインデックス
          // ボーンが存在しない場合（ありえないはずだが）は0にしておく
          const newA = oldBones[a] ? boneUniqueMap.get(oldBones[a].uuid) ?? 0 : 0
          const newB = oldBones[b] ? boneUniqueMap.get(oldBones[b].uuid) ?? 0 : 0
          const newC = oldBones[c] ? boneUniqueMap.get(oldBones[c].uuid) ?? 0 : 0
          const newD = oldBones[d] ? boneUniqueMap.get(oldBones[d].uuid) ?? 0 : 0

          skinIndexAttr.setXYZW(i, newA, newB, newC, newD)
        }
      }
    }
    // 通常のMeshの場合はワールド変換を適用
    else
    {
      mesh.updateMatrixWorld(true)
      transformedGeometry.applyMatrix4(mesh.matrixWorld)
    }

    // TODO: 顔メッシュを判別して、顔メッシュの場合はモーフターゲットを残す
    // 現状は全てのメッシュからモーフターゲットを削除
    transformedGeometry.morphAttributes = {}
    transformedGeometry.morphTargetsRelative = false

    transformedGeometries.push(transformedGeometry)

    // スロットインデックスを頂点数分追加
    const slotIndex = materialSlotMap.get(mesh) ?? 0
    for (let i = 0; i < vertexCount; i++)
    {
      slotData.push(slotIndex)
    }
  }

  // BufferGeometryUtils.mergeBufferGeometriesを使用してジオメトリをマージ
  const mergedGeometry = mergeGeometries(transformedGeometries)

  // 統合されたスケルトンをuserDataに保存
  if (hasSkinnedMesh)
  {
    mergedGeometry.userData.skeleton = new Skeleton(allBones)
  }

  // スロット属性を追加
  const slotArray = new Float32Array(slotData)
  mergedGeometry.setAttribute(
    slotAttributeName,
    new Float32BufferAttribute(slotArray, 1),
  )

  return ok([mergedGeometry])
}

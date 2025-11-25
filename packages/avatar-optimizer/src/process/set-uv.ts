import { MToonMaterial } from '@pixiv/three-vrm'
import { Result } from 'neverthrow'
import { BufferGeometry, Mesh, Object3D } from 'three'
import { OffsetScale, OptimizationError } from '../types'
import { remapGeometryUVs } from '../util/mesh/uv'

/**
 * GLTF/VRM フロー前提で 1 Mesh = 1 Material のみをサポートし、(ただし Outline付きMToonは例外的に複数マテリアルを許容)
 * 実装簡略化と UV 再マッピングの二重適用防止を優先する。
 * 複数マテリアルの Mesh を検出した場合はエラーを返す。
 * MToonNodeMaterial のみを対象とする。
 *
 * @param rootNode - 処理対象のルートノード
 * @param materialPlacementMap - マテリアルごとの UV 配置情報マップ
 * @returns 処理結果
 */
export function applyPlacementsToGeometries(
  rootNode: Object3D,
  materialPlacementMap: Map<MToonMaterial, OffsetScale>,
): Result<void[], OptimizationError> {
  const targets = new Map<BufferGeometry, OffsetScale>()
  rootNode.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    if (!(obj.geometry instanceof BufferGeometry)) return

    let material: MToonMaterial | null = null

    if (Array.isArray(obj.material)) {
      // Outline付きMToonの場合はOutline用に複数マテリアルになっている
      // 両マテリアルが全インデックスを参照するため、同様に1つのマテリアルだけ処理すればいい。
      material = obj.material[0]
    } else if (obj.material instanceof MToonMaterial) {
      material = obj.material
    }

    if (!(material instanceof MToonMaterial)) {
      // @ts-ignore
      if (
        obj.material?.isMToonMaterial ||
        (Array.isArray(obj.material) && obj.material[0]?.isMToonMaterial)
      ) {
        console.warn(
          'Found MToonMaterial-like object but instanceof failed. This indicates a dual package hazard.',
          obj.material,
        )
      }
      return
    }

    const placement = materialPlacementMap.get(material)
    if (!placement) {
      console.warn('No placement found for material', material)
      return
    }

    // uvアトリビュートを共有している場合があるため、BufferGeometryをcloneすることで独立させている
    // 無駄にattribute bufferが長くなっている可能性があるため効率化したい
    const clonedGeometry = obj.geometry.clone()
    obj.geometry.dispose()
    obj.geometry = clonedGeometry

    targets.set(obj.geometry, placement)
  })

  const results = [...targets].map((target) =>
    remapGeometryUVs(target[0], target[1]),
  )
  return Result.combine(results)
}

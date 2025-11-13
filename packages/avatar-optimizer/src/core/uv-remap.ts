import { GLTFScenegraph } from '@loaders.gl/gltf'

import type { PendingMaterialPlacement } from '../vrm/scenegraph-adapter'

const FLOAT_COMPONENT_TYPE = 5126
const TEXCOORD_PREFIX = 'TEXCOORD_'

/**
 * アトラス配置結果に応じて対象プリミティブの UV を再計算する
 */
export function remapPrimitiveUVs(
  scenegraph: GLTFScenegraph,
  placements: PendingMaterialPlacement[],
): void {
  if (!placements.length) {
    return
  }

  const placementMap = new Map<number, PendingMaterialPlacement>()
  for (const placement of placements) {
    placementMap.set(placement.materialIndex, placement)
  }

  const processedAccessors = new Set<number>()
  const meshes = scenegraph.json.meshes ?? []
  meshes.forEach((mesh) => {
    mesh?.primitives?.forEach((primitive) => {
      if (!primitive || typeof primitive.material !== 'number') {
        return
      }

      const placement = placementMap.get(primitive.material)
      if (!placement) {
        return
      }

      const attributeName = buildTexCoordAttributeName(placement.texCoord)
      const accessorIndex = primitive.attributes?.[attributeName]
      if (typeof accessorIndex !== 'number') {
        return
      }

      if (processedAccessors.has(accessorIndex)) {
        return
      }

      applyUvTransform(scenegraph, accessorIndex, placement.uvTransform)
      processedAccessors.add(accessorIndex)
    })
  })
}

function buildTexCoordAttributeName(texCoord: number): string {
  return `${TEXCOORD_PREFIX}${Math.max(0, texCoord || 0)}`
}

function applyUvTransform(
  scenegraph: GLTFScenegraph,
  accessorIndex: number,
  uvTransform: PendingMaterialPlacement['uvTransform'],
): void {
  const accessor = scenegraph.getAccessor(accessorIndex)
  if (!accessor || accessor.type !== 'VEC2' || accessor.componentType !== FLOAT_COMPONENT_TYPE) {
    return
  }

  const componentCount = getAccessorComponentCount(accessor.type)
  if (componentCount < 2) {
    return
  }

  const data = scenegraph.getTypedArrayForAccessor(accessorIndex)
  if (!(data instanceof Float32Array)) {
    return
  }

  const scaleU = uvTransform[0]
  const translateU = uvTransform[2]
  const scaleV = uvTransform[4]
  const translateV = uvTransform[5]

  for (let i = 0; i < accessor.count; i++) {
    const offset = i * componentCount
    const u = data[offset]
    const v = data[offset + 1]
    data[offset] = u * scaleU + translateU
    data[offset + 1] = v * scaleV + translateV
  }
}

function getAccessorComponentCount(type?: string): number {
  switch (type) {
    case 'SCALAR':
      return 1
    case 'VEC2':
      return 2
    case 'VEC3':
      return 3
    case 'VEC4':
      return 4
    case 'MAT2':
      return 4
    case 'MAT3':
      return 9
    case 'MAT4':
      return 16
    default:
      return 0
  }
}

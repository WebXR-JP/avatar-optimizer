import type { BufferAttribute, BufferGeometry, Material, Mesh } from 'three'

import type { ThreeVRMDocument } from '../types'
import type { PendingMaterialPlacement } from '../vrm/scenegraph-adapter'

/**
 * three.js のオブジェクト階層に対してアトラス適用後の UV を再計算する
 */
export function remapPrimitiveUVs(
  document: ThreeVRMDocument,
  placements: PendingMaterialPlacement[],
): void {
  if (!placements.length) {
    return
  }

  const placementMap = new Map<string, PendingMaterialPlacement>(
    placements.map((placement) => [placement.materialUuid, placement]),
  )

  const processedAttributes = new Set<BufferAttribute>()
  const scenes = document.gltf.scenes?.length
    ? document.gltf.scenes
    : document.gltf.scene
      ? [document.gltf.scene]
      : []

  scenes.forEach((scene) => {
    scene.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) {
        return
      }

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => {
          transformGeometry(mesh.geometry, material, placementMap, processedAttributes)
        })
      } else {
        transformGeometry(mesh.geometry, mesh.material, placementMap, processedAttributes)
      }
    })
  })
}

function transformGeometry(
  geometry: BufferGeometry | undefined,
  material: Material | undefined,
  placements: Map<string, PendingMaterialPlacement>,
  processed: Set<BufferAttribute>,
): void {
  if (!geometry || !material) {
    return
  }

  const placement = placements.get(material.uuid)
  if (!placement) {
    return
  }

  const attribute = geometry.getAttribute('uv') as BufferAttribute | undefined
  if (!attribute || processed.has(attribute)) {
    return
  }

  applyUvTransform(attribute, placement.uvTransform)
  processed.add(attribute)
}

function applyUvTransform(
  attribute: BufferAttribute,
  uvTransform: PendingMaterialPlacement['uvTransform'],
): void {
  if (attribute.itemSize < 2) {
    return
  }

  const array = attribute.array
  if (!(array instanceof Float32Array)) {
    return
  }

  const scaleU = uvTransform[0]
  const translateU = uvTransform[2]
  const scaleV = uvTransform[4]
  const translateV = uvTransform[5]

  for (let i = 0; i < attribute.count; i++) {
    const offset = i * attribute.itemSize
    const u = array[offset]
    const v = array[offset + 1]
    array[offset] = u * scaleU + translateU
    array[offset + 1] = v * scaleV + translateV
  }

  attribute.needsUpdate = true
}

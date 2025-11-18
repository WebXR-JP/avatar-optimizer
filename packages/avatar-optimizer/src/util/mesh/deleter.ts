import { Material, Mesh } from 'three'

/**
 * Mesh と関連するリソース（Material、Geometry）を削除してメモリを解放します。
 * @param mesh - 削除対象の Mesh
 * @param scene - Mesh が追加されているシーン
 */
export function deleteMesh(mesh: Mesh): void {
  // Material
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m: Material) => m.dispose())
  } else {
    mesh.material.dispose()
  }

  // Geometry
  // 本当はBufferAttributeが共有されていないか確認すべき
  mesh.geometry.dispose()
}

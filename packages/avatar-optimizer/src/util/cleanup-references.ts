/**
 * 最適化処理で置き換え・削除された元 VRM リソースへの残留参照を解放するユーティリティ
 *
 * `optimizeModel(vrm)` が VRM をインプレース最適化したあと、呼び出し側が
 * 最適化済み `vrm` をそのまま利用し続ける場合に、元 VRM のマテリアル・
 * テクスチャ・メッシュ・ジオメトリ・スケルトンへの強参照が `vrm.materials` や
 * `vrm.firstPerson.meshAnnotations`、`vrm.expressionManager` 等に残って
 * GC に回収されなくなる問題を防ぐ。
 */

import type { VRM } from '@pixiv/three-vrm'
import {
  type BufferGeometry,
  type Material,
  Mesh,
  type Object3D,
  type Skeleton,
  SkinnedMesh,
  type Texture,
} from 'three'
import { type AtlasImageMap, MTOON_TEXTURE_SLOTS } from '../types'
import type {
  CombinedMeshResult,
  MaterialInfo,
  MeshGroup,
  RenderMode,
} from './material/types'

/**
 * 最適化前に収集した元マテリアル・元テクスチャのスナップショット
 */
export interface OriginalResourcesSnapshot {
  materials: Set<Material>
  textures: Set<Texture>
}

/**
 * 最適化後のアクティブなシーン・メタ情報から到達可能なリソースのスナップショット
 */
export interface ActiveResourcesSnapshot {
  materials: Set<Material>
  textures: Set<Texture>
  textureSources: Set<unknown>
  images: Set<unknown>
  geometries: Set<BufferGeometry>
  skeletons: Set<Skeleton>
}

type FirstPersonAnnotationType = NonNullable<
  VRM['firstPerson']
>['meshAnnotations'][number]['type']

function isTextureLike(value: unknown): value is Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: unknown }).isTexture === true
  )
}

function isPropertyWritable(target: object, key: string): boolean {
  let current: object | null = target
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor) {
      if (descriptor.get || descriptor.set) {
        return typeof descriptor.set === 'function'
      }
      return descriptor.writable === true
    }
    current = Object.getPrototypeOf(current)
  }
  return false
}

/**
 * 単一マテリアルから参照されている全テクスチャを収集する
 *
 * @param material - 走査対象のマテリアル
 * @param out - 収集先のテクスチャ Set
 */
export function collectMaterialTextures(
  material: Material,
  out: Set<Texture>,
): void {
  const matRecord = material as unknown as Record<string, unknown>

  for (const slot of MTOON_TEXTURE_SLOTS) {
    const value = matRecord[slot]
    if (isTextureLike(value)) {
      out.add(value)
    }
  }

  for (const key of Object.keys(material)) {
    const value = matRecord[key]
    if (isTextureLike(value)) {
      out.add(value)
    }
  }

  if (
    'uniforms' in material &&
    material.uniforms &&
    typeof material.uniforms === 'object'
  ) {
    const uniforms = material.uniforms as Record<
      string,
      { value?: unknown } | undefined
    >
    for (const uniform of Object.values(uniforms)) {
      if (uniform && isTextureLike(uniform.value)) {
        out.add(uniform.value)
      }
    }
  }

  if (
    'parameterTexture' in material &&
    material.parameterTexture &&
    typeof material.parameterTexture === 'object'
  ) {
    const descriptor = material.parameterTexture as {
      texture?: unknown
      atlasedTextures?: Record<string, unknown>
    }
    if (isTextureLike(descriptor.texture)) {
      out.add(descriptor.texture)
    }
    if (descriptor.atlasedTextures) {
      for (const tex of Object.values(descriptor.atlasedTextures)) {
        if (isTextureLike(tex)) {
          out.add(tex)
        }
      }
    }
  }

  if (
    'parameterBuffer' in material &&
    material.parameterBuffer &&
    typeof material.parameterBuffer === 'object'
  ) {
    const descriptor = material.parameterBuffer as {
      atlasedTextures?: Record<string, unknown>
    }
    if (descriptor.atlasedTextures) {
      for (const tex of Object.values(descriptor.atlasedTextures)) {
        if (isTextureLike(tex)) {
          out.add(tex)
        }
      }
    }
  }
}

/**
 * アトラス割り当て前に元マテリアルと元テクスチャをスナップショット収集する
 *
 * `assignAtlasTexturesToMaterial` より前に呼び出すことで、
 * 本体マテリアル・アウトライン用クローンマテリアル双方とそれらが保持していた
 * 全元テクスチャを漏らさず記録する。
 *
 * @param materialInfos - シーンから収集した MToon マテリアル情報配列
 * @returns 元マテリアル・元テクスチャの集合
 */
export function collectOriginalResources(
  materialInfos: MaterialInfo[],
): OriginalResourcesSnapshot {
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  for (const info of materialInfos) {
    materials.add(info.material)
    for (const mesh of info.meshes) {
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) {
          if (mat) {
            materials.add(mat)
          }
        }
      } else if (mesh.material) {
        materials.add(mesh.material)
      }
    }
  }

  for (const material of materials) {
    collectMaterialTextures(material, textures)
  }

  return { materials, textures }
}

/**
 * 現在の `vrm.scene` と `vrm.meta` で使用中のアクティブなリソースを収集する
 *
 * @param vrm - 対象の VRM インスタンス
 * @returns アクティブなマテリアル・テクスチャ・ソース・画像・ジオメトリ・スケルトン
 */
export function collectActiveSceneResources(vrm: VRM): ActiveResourcesSnapshot {
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const textureSources = new Set<unknown>()
  const images = new Set<unknown>()
  const geometries = new Set<BufferGeometry>()
  const skeletons = new Set<Skeleton>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return

    if (obj.geometry) {
      geometries.add(obj.geometry)
    }
    if (obj instanceof SkinnedMesh && obj.skeleton) {
      skeletons.add(obj.skeleton)
    }

    const meshMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material]
    for (const mat of meshMaterials) {
      if (mat) {
        materials.add(mat)
      }
    }
  })

  for (const material of materials) {
    collectMaterialTextures(material, textures)
  }

  for (const texture of textures) {
    if (texture.source) {
      textureSources.add(texture.source)
    }
    if (texture.image) {
      images.add(texture.image)
    }
  }

  // VRM 0.x のサムネイルテクスチャや VRM 1.0 の thumbnailImage を保護
  const meta = vrm.meta as
    | { texture?: Texture; thumbnailImage?: unknown }
    | undefined
  if (meta?.texture && isTextureLike(meta.texture)) {
    textures.add(meta.texture)
    if (meta.texture.source) {
      textureSources.add(meta.texture.source)
    }
    if (meta.texture.image) {
      images.add(meta.texture.image)
    }
  }
  if (meta?.thumbnailImage) {
    images.add(meta.thumbnailImage)
  }

  return {
    materials,
    textures,
    textureSources,
    images,
    geometries,
    skeletons,
  }
}

/**
 * 破棄済みマテリアルからテクスチャ参照をすべて切り離す
 *
 * @param material - 対象のマテリアル
 */
export function clearMaterialTextureReferences(material: Material): void {
  const matRecord = material as unknown as Record<string, unknown>

  for (const slot of MTOON_TEXTURE_SLOTS) {
    if (slot in material && isPropertyWritable(material, slot)) {
      matRecord[slot] = null
    }
  }

  for (const key of Object.keys(material)) {
    if (isTextureLike(matRecord[key]) && isPropertyWritable(material, key)) {
      matRecord[key] = null
    }
  }

  if (
    'uniforms' in material &&
    material.uniforms &&
    typeof material.uniforms === 'object'
  ) {
    const uniforms = material.uniforms as Record<
      string,
      { value?: unknown } | undefined
    >
    for (const uniform of Object.values(uniforms)) {
      if (uniform && isTextureLike(uniform.value)) {
        uniform.value = null
      }
    }
  }
}

/**
 * `vrm.materials` から置換済みマテリアルを除き、新しいアトラスマテリアルへ更新する
 *
 * @param vrm - 対象の VRM インスタンス
 * @param replacedMaterials - 置換された旧マテリアルの Set
 * @param newMaterials - 新たに追加するアトラスマテリアル群
 */
export function updateVRMMaterials(
  vrm: VRM,
  replacedMaterials: Set<Material>,
  newMaterials: Iterable<Material>,
): void {
  if (!Array.isArray(vrm.materials)) {
    return
  }

  const seen = new Set<Material>()
  const nextMaterials: Material[] = []

  for (const mat of vrm.materials) {
    if (replacedMaterials.has(mat) || seen.has(mat)) continue
    seen.add(mat)
    nextMaterials.push(mat)
  }

  for (const mat of newMaterials) {
    if (seen.has(mat)) continue
    seen.add(mat)
    nextMaterials.push(mat)
  }

  vrm.materials.splice(0, vrm.materials.length, ...nextMaterials)
}

/**
 * `vrm.firstPerson.meshAnnotations` から削除済みメッシュを除去し、結合メッシュを追加する
 *
 * @param vrm - 対象の VRM インスタンス
 * @param removedMeshes - シーンから削除されたメッシュの Set
 * @param materialInfos - 元のマテリアル情報配列（renderMode ごとの type 集計用）
 * @param groups - 結合されたメッシュグループマップ
 */
export function updateVRMFirstPersonAnnotations(
  vrm: VRM,
  removedMeshes: Set<Object3D>,
  materialInfos: MaterialInfo[],
  groups: Map<RenderMode, MeshGroup>,
): void {
  const annotations = vrm.firstPerson?.meshAnnotations
  if (!Array.isArray(annotations)) {
    return
  }

  const meshAnnotationTypes = new Map<Object3D, FirstPersonAnnotationType>()
  for (const ann of annotations) {
    const annLegacy = ann as unknown as {
      mesh?: Object3D
      meshes?: Mesh[]
      type: FirstPersonAnnotationType
    }
    if (Array.isArray(annLegacy.meshes)) {
      for (const m of annLegacy.meshes) {
        meshAnnotationTypes.set(m, annLegacy.type)
      }
    } else if (annLegacy.mesh) {
      meshAnnotationTypes.set(annLegacy.mesh, annLegacy.type)
    }
  }

  const nextAnnotations: typeof annotations = []
  for (const ann of annotations) {
    const annLegacy = ann as unknown as {
      mesh?: Object3D
      meshes?: Mesh[]
      type: FirstPersonAnnotationType
    }
    if (Array.isArray(annLegacy.meshes)) {
      const remaining = annLegacy.meshes.filter((m) => !removedMeshes.has(m))
      if (remaining.length > 0) {
        nextAnnotations.push({ ...ann, meshes: remaining })
      }
    } else if (annLegacy.mesh) {
      if (!removedMeshes.has(annLegacy.mesh)) {
        nextAnnotations.push(ann)
      }
    } else {
      nextAnnotations.push(ann)
    }
  }

  const hasRemovedAnnotatedMesh = [...removedMeshes].some((m) =>
    meshAnnotationTypes.has(m),
  )

  if (hasRemovedAnnotatedMesh) {
    const typesByRenderMode = new Map<
      RenderMode,
      Set<FirstPersonAnnotationType>
    >()
    for (const info of materialInfos) {
      for (const mesh of info.meshes) {
        if (!removedMeshes.has(mesh)) continue
        const type = meshAnnotationTypes.get(mesh)
        if (!type) continue
        let typeSet = typesByRenderMode.get(info.renderMode)
        if (!typeSet) {
          typeSet = new Set()
          typesByRenderMode.set(info.renderMode, typeSet)
        }
        typeSet.add(type)
      }
    }

    for (const [renderMode, group] of groups) {
      const addedMeshes = [group.mesh, group.outlineMesh].filter(
        (m): m is Mesh => m != null,
      )
      if (addedMeshes.length === 0) continue

      const types = typesByRenderMode.get(renderMode)
      const type: FirstPersonAnnotationType =
        types && types.size === 1 ? [...types][0] : 'auto'
      nextAnnotations.push({ meshes: addedMeshes, type })
    }
  }

  annotations.splice(0, annotations.length, ...nextAnnotations)
}

function removeBindFromExpression(
  exprAny: {
    binds?: unknown[]
    _binds?: unknown[]
    deleteBind?: (bind: unknown) => void
  },
  bind: unknown,
): void {
  if (typeof exprAny.deleteBind === 'function') {
    exprAny.deleteBind(bind)
    return
  }
  if (Array.isArray(exprAny.binds)) {
    const idx = exprAny.binds.indexOf(bind)
    if (idx >= 0) {
      exprAny.binds.splice(idx, 1)
    }
  }
  if (Array.isArray(exprAny._binds) && exprAny._binds !== exprAny.binds) {
    const idx = exprAny._binds.indexOf(bind)
    if (idx >= 0) {
      exprAny._binds.splice(idx, 1)
    }
  }
}

/**
 * `vrm.expressionManager` から置換済みマテリアル・削除済みメッシュへの参照を除去する
 *
 * @param vrm - 対象の VRM インスタンス
 * @param replacedMaterials - 置換された旧マテリアルの Set
 * @param removedMeshes - 削除された旧メッシュの Set
 */
export function cleanupExpressionManagerReferences(
  vrm: VRM,
  replacedMaterials: Set<Material>,
  removedMeshes: Set<Object3D>,
): void {
  const expressions = vrm.expressionManager?.expressions
  if (!expressions) {
    return
  }

  for (const expression of expressions) {
    const exprAny = expression as unknown as {
      binds?: unknown[]
      _binds?: unknown[]
      deleteBind?: (bind: unknown) => void
      materialColorBinds?: Array<{ material?: Material | null }>
      textureTransformBinds?: Array<{ material?: Material | null }>
    }

    const binds = [...(exprAny.binds ?? exprAny._binds ?? [])]
    for (const bind of binds) {
      const bindAny = bind as {
        material?: Material | null
        primitives?: Object3D[]
      }

      if (bindAny.material && replacedMaterials.has(bindAny.material)) {
        removeBindFromExpression(exprAny, bind)
        bindAny.material = null
        continue
      }

      if (
        Array.isArray(bindAny.primitives) &&
        bindAny.primitives.some((mesh) => removedMeshes.has(mesh))
      ) {
        bindAny.primitives = bindAny.primitives.filter(
          (mesh) => !removedMeshes.has(mesh),
        )
        if (bindAny.primitives.length === 0) {
          removeBindFromExpression(exprAny, bind)
        }
      }
    }

    if (Array.isArray(exprAny.materialColorBinds)) {
      exprAny.materialColorBinds = exprAny.materialColorBinds.filter((bind) => {
        if (bind.material && replacedMaterials.has(bind.material)) {
          bind.material = null
          return false
        }
        return true
      })
    }

    if (Array.isArray(exprAny.textureTransformBinds)) {
      exprAny.textureTransformBinds = exprAny.textureTransformBinds.filter(
        (bind) => {
          if (bind.material && replacedMaterials.has(bind.material)) {
            bind.material = null
            return false
          }
          return true
        },
      )
    }
  }
}

/**
 * 最適化で置換・削除された元 VRM リソースへの参照を解除し、未使用リソースを破棄する
 *
 * 必ず新結合メッシュを `vrm.scene` へ追加し、旧 `meshesToRemove` を `vrm.scene` から
 * 除去した後に呼び出すこと。
 */
export function disposeReplacedResources(params: {
  vrm: VRM
  originalResources: OriginalResourcesSnapshot
  atlasMap: AtlasImageMap
  meshesToRemove: Mesh[]
  materialInfos: MaterialInfo[]
  combineResult: CombinedMeshResult
}): void {
  const {
    vrm,
    originalResources,
    atlasMap,
    meshesToRemove,
    materialInfos,
    combineResult,
  } = params

  const active = collectActiveSceneResources(vrm)

  const replacedMaterials = new Set<Material>()
  for (const mat of originalResources.materials) {
    if (!active.materials.has(mat)) {
      replacedMaterials.add(mat)
    }
  }

  const removedMeshes = new Set<Object3D>(meshesToRemove)

  const newAtlasMaterials: Material[] = []
  for (const group of combineResult.groups.values()) {
    newAtlasMaterials.push(group.material)
    if (group.outlineMaterial) {
      newAtlasMaterials.push(group.outlineMaterial)
    }
  }

  updateVRMMaterials(vrm, replacedMaterials, newAtlasMaterials)
  updateVRMFirstPersonAnnotations(
    vrm,
    removedMeshes,
    materialInfos,
    combineResult.groups,
  )
  cleanupExpressionManagerReferences(vrm, replacedMaterials, removedMeshes)

  combineResult.materialSlotIndex.clear()

  for (const mat of replacedMaterials) {
    clearMaterialTextureReferences(mat)
    mat.dispose()
  }

  for (const mesh of meshesToRemove) {
    if (mesh.geometry && !active.geometries.has(mesh.geometry)) {
      mesh.geometry.dispose()
    }
    if (
      mesh instanceof SkinnedMesh &&
      mesh.skeleton &&
      !active.skeletons.has(mesh.skeleton)
    ) {
      mesh.skeleton.dispose()
    }
  }

  const candidateTextures = new Set<Texture>([
    ...originalResources.textures,
    ...Object.values(atlasMap),
  ])

  for (const texture of candidateTextures) {
    if (!texture || active.textures.has(texture)) continue
    texture.dispose()
    if (
      typeof ImageBitmap !== 'undefined' &&
      texture.image instanceof ImageBitmap &&
      !active.images.has(texture.image) &&
      !active.textureSources.has(texture.source)
    ) {
      texture.image.close()
    }
  }
}

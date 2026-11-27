import { MToonMaterial, type VRM, VRMExpression } from '@pixiv/three-vrm'
import { MToonAtlasMaterial } from '@webxr-jp/mtoon-atlas'
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  Skeleton,
  SkinnedMesh,
  UnsignedByteType,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { AtlasImageMap, MToonTextureSlot } from '../../src/types'
import {
  clearMaterialTextureReferences,
  collectActiveSceneResources,
  collectOriginalResources,
  disposeReplacedResources,
} from '../../src/util/cleanup-references'
import { combineMToonMaterials } from '../../src/util/material/combine'
import type { MaterialInfo } from '../../src/util/material/types'

function createDummyTexture(name: string): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255])
  const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType)
  tex.name = name
  tex.needsUpdate = true
  return tex
}

function createEmptyAtlasMap(): AtlasImageMap {
  return {
    map: createDummyTexture('atlas_map'),
    normalMap: createDummyTexture('atlas_normal'),
    emissiveMap: createDummyTexture('atlas_emissive'),
    shadeMultiplyTexture: createDummyTexture('atlas_shade'),
    shadingShiftTexture: createDummyTexture('atlas_shadingShift'),
    matcapTexture: createDummyTexture('atlas_matcap'),
    rimMultiplyTexture: createDummyTexture('atlas_rim'),
    outlineWidthMultiplyTexture: createDummyTexture('atlas_outlineWidth'),
    uvAnimationMaskTexture: createDummyTexture('atlas_uvAnim'),
  }
}

function createTriangleGeometry(withSkin = false): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  geo.setAttribute(
    'normal',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  )
  geo.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2),
  )
  if (withSkin) {
    geo.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4))
    geo.setAttribute(
      'skinWeight',
      new BufferAttribute(
        new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        4,
      ),
    )
  }
  return geo
}

describe('cleanup-references', () => {
  it('vrm.materials から置換済み本体・アウトラインマテリアルを除去し、非 MToon を残して新アトラスマテリアルを追加する', () => {
    const scene = new Group()
    const origMat = new MToonMaterial({ name: 'origSurface' })
    const origOutline = origMat.clone()
    origOutline.name = 'origOutline'
    const nonMToonMat = new MeshStandardMaterial({ name: 'nonMToon' })

    const origTex = createDummyTexture('origTex')
    const origOutlineTex = createDummyTexture('origOutlineTex')
    origMat.map = origTex
    origOutline.map = origOutlineTex

    const removedMesh = new Mesh(createTriangleGeometry(), [
      origMat,
      origOutline,
    ])
    const nonMToonMesh = new Mesh(createTriangleGeometry(), nonMToonMat)
    scene.add(nonMToonMesh)

    const materialInfos: MaterialInfo[] = [
      {
        material: origMat,
        meshes: [removedMesh],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
    ]

    const originalResources = collectOriginalResources(materialInfos)
    expect(originalResources.materials.has(origMat)).toBe(true)
    expect(originalResources.materials.has(origOutline)).toBe(true)
    expect(originalResources.textures.has(origTex)).toBe(true)
    expect(originalResources.textures.has(origOutlineTex)).toBe(true)

    const atlasMap = createEmptyAtlasMap()
    origMat.map = atlasMap.map

    const atlasMat = new MToonAtlasMaterial({
      parameterTexture: {
        texture: createDummyTexture('paramTex'),
        slotCount: 1,
        texelsPerSlot: 9,
        atlasedTextures: { baseColor: atlasMap.map },
      },
    })
    const combinedMesh = new Mesh(createTriangleGeometry(), atlasMat)
    scene.add(combinedMesh)

    const vrm = {
      scene,
      materials: [origMat, origOutline, nonMToonMat] as Material[],
    } as unknown as VRM

    const origDisposeSpy = vi.spyOn(origMat, 'dispose')
    const outlineDisposeSpy = vi.spyOn(origOutline, 'dispose')
    const nonMToonDisposeSpy = vi.spyOn(nonMToonMat, 'dispose')

    disposeReplacedResources({
      vrm,
      originalResources,
      atlasMap,
      meshesToRemove: [removedMesh],
      materialInfos,
      combineResult: {
        groups: new Map([
          ['opaque', { mesh: combinedMesh, material: atlasMat }],
        ]),
        materialSlotIndex: new Map([
          [origMat, { renderMode: 'opaque', slotIndex: 0 }],
        ]),
        statistics: {
          originalMeshCount: 1,
          originalMaterialCount: 1,
          reducedDrawCalls: 0,
        },
      },
    })

    expect(vrm.materials).toEqual([nonMToonMat, atlasMat])
    expect(origDisposeSpy).toHaveBeenCalledTimes(1)
    expect(outlineDisposeSpy).toHaveBeenCalledTimes(1)
    expect(nonMToonDisposeSpy).not.toHaveBeenCalled()
    expect(origMat.map).toBeNull()
    expect(origOutline.map).toBeNull()
  })

  it('vrm.firstPerson.meshAnnotations から削除メッシュを除去し、空要素を消し、除外メッシュを残して結合メッシュを追加する', () => {
    const scene = new Group()
    const matOpaque1 = new MToonMaterial({ name: 'opaque1' })
    const matOpaque2 = new MToonMaterial({ name: 'opaque2' })
    const matAlpha = new MToonMaterial({ name: 'alpha', alphaTest: 0.5 })
    const matExcluded = new MToonMaterial({ name: 'excluded' })

    const removedOpaque1 = new Mesh(createTriangleGeometry(), matOpaque1)
    const removedOpaque2 = new Mesh(createTriangleGeometry(), matOpaque2)
    const removedMixed1 = new Mesh(createTriangleGeometry(), matAlpha)
    const removedMixed2 = new Mesh(createTriangleGeometry(), matAlpha)
    const excludedMesh = new Mesh(createTriangleGeometry(), matExcluded)

    const atlasMatOpaque = new MToonAtlasMaterial()
    const atlasMatAlpha = new MToonAtlasMaterial()
    excludedMesh.material = atlasMatOpaque
    scene.add(excludedMesh)

    const combinedOpaque = new Mesh(createTriangleGeometry(), atlasMatOpaque)
    const combinedOpaqueOutline = new Mesh(
      createTriangleGeometry(),
      atlasMatOpaque.createOutlineMaterial(),
    )
    const combinedAlpha = new Mesh(createTriangleGeometry(), atlasMatAlpha)
    scene.add(combinedOpaque, combinedOpaqueOutline, combinedAlpha)

    const materialInfos: MaterialInfo[] = [
      {
        material: matOpaque1,
        meshes: [removedOpaque1],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
      {
        material: matOpaque2,
        meshes: [removedOpaque2],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
      {
        material: matAlpha,
        meshes: [removedMixed1, removedMixed2],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'alphaTest',
      },
      {
        material: matExcluded,
        meshes: [excludedMesh],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const originalResources = collectOriginalResources(materialInfos)
    const vrm = {
      scene,
      firstPerson: {
        meshAnnotations: [
          {
            meshes: [removedOpaque1, removedOpaque2],
            type: 'thirdPersonOnly',
          },
          { meshes: [removedMixed1], type: 'firstPersonOnly' },
          { meshes: [removedMixed2], type: 'thirdPersonOnly' },
          { meshes: [excludedMesh], type: 'firstPersonOnly' },
        ],
      },
    } as unknown as VRM

    disposeReplacedResources({
      vrm,
      originalResources,
      atlasMap: createEmptyAtlasMap(),
      meshesToRemove: [
        removedOpaque1,
        removedOpaque2,
        removedMixed1,
        removedMixed2,
      ],
      materialInfos,
      combineResult: {
        groups: new Map([
          [
            'opaque',
            {
              mesh: combinedOpaque,
              material: atlasMatOpaque,
              outlineMesh: combinedOpaqueOutline,
            },
          ],
          ['alphaTest', { mesh: combinedAlpha, material: atlasMatAlpha }],
        ]),
        materialSlotIndex: new Map(),
        statistics: {
          originalMeshCount: 4,
          originalMaterialCount: 3,
          reducedDrawCalls: 1,
        },
      },
    })

    const annotations = vrm.firstPerson!.meshAnnotations
    expect(annotations).toEqual([
      { meshes: [excludedMesh], type: 'firstPersonOnly' },
      {
        meshes: [combinedOpaque, combinedOpaqueOutline],
        type: 'thirdPersonOnly',
      },
      { meshes: [combinedAlpha], type: 'auto' },
    ])
  })

  it('vrm.expressionManager から置換済みマテリアルの bind を削除し、除外メッシュの MorphTargetBind は保持する', () => {
    const scene = new Group()
    const origMat = new MToonMaterial({ name: 'origMat' })
    const removedMesh = new Mesh(createTriangleGeometry(), origMat)
    const excludedMesh = new Mesh(createTriangleGeometry(), origMat)

    const atlasMat = new MToonAtlasMaterial()
    excludedMesh.material = atlasMat
    scene.add(excludedMesh)

    const materialInfos: MaterialInfo[] = [
      {
        material: origMat,
        meshes: [removedMesh, excludedMesh],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const originalResources = collectOriginalResources(materialInfos)

    const expr = new VRMExpression('happy')
    const materialBind = { material: origMat, type: 'color' }
    const removedMorphBind = {
      primitives: [removedMesh],
      index: 0,
      weight: 1,
    }
    const keptMorphBind = {
      primitives: [excludedMesh, removedMesh],
      index: 1,
      weight: 1,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expr.addBind(materialBind as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expr.addBind(removedMorphBind as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expr.addBind(keptMorphBind as any)

    const vrm = {
      scene,
      expressionManager: { expressions: [expr] },
    } as unknown as VRM

    disposeReplacedResources({
      vrm,
      originalResources,
      atlasMap: createEmptyAtlasMap(),
      meshesToRemove: [removedMesh],
      materialInfos,
      combineResult: {
        groups: new Map([['opaque', { mesh: null, material: atlasMat }]]),
        materialSlotIndex: new Map([
          [origMat, { renderMode: 'opaque', slotIndex: 0 }],
        ]),
        statistics: {
          originalMeshCount: 0,
          originalMaterialCount: 1,
          reducedDrawCalls: 0,
        },
      },
    })

    expect(expr.binds).toHaveLength(1)
    expect(expr.binds[0]).toBe(keptMorphBind)
    expect(keptMorphBind.primitives).toEqual([excludedMesh])
    expect(materialBind.material).toBeNull()
  })

  it('未使用テクスチャと atlasMap 余剰テクスチャのみ dispose() し、アクティブな matcap と meta.texture は保持する', () => {
    const scene = new Group()
    const origMat = new MToonMaterial({ name: 'orig' })
    const unusedMapTex = createDummyTexture('unusedMap')
    const activeMatcapTex = createDummyTexture('activeMatcap')
    const metaTex = createDummyTexture('metaTex')
    origMat.map = unusedMapTex
    origMat.matcapTexture = activeMatcapTex

    const removedMesh = new Mesh(createTriangleGeometry(), origMat)
    const materialInfos: MaterialInfo[] = [
      {
        material: origMat,
        meshes: [removedMesh],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const originalResources = collectOriginalResources(materialInfos)
    const atlasMap = createEmptyAtlasMap()

    // MatCap は UV 非依存で元の activeMatcapTex を引き継ぐ
    origMat.map = atlasMap.map
    const atlasMat = new MToonAtlasMaterial({
      parameterTexture: {
        texture: createDummyTexture('paramTex'),
        slotCount: 1,
        texelsPerSlot: 9,
        atlasedTextures: {
          baseColor: atlasMap.map,
          matcap: activeMatcapTex,
        },
      },
    })
    const combinedMesh = new Mesh(createTriangleGeometry(), atlasMat)
    scene.add(combinedMesh)

    const vrm = {
      scene,
      meta: { metaVersion: '0', texture: metaTex },
    } as unknown as VRM

    const unusedMapDispose = vi.spyOn(unusedMapTex, 'dispose')
    const activeAtlasMapDispose = vi.spyOn(atlasMap.map, 'dispose')
    const unusedAtlasMatcapDispose = vi.spyOn(atlasMap.matcapTexture, 'dispose')
    const unusedAtlasOutlineDispose = vi.spyOn(
      atlasMap.outlineWidthMultiplyTexture,
      'dispose',
    )
    const activeMatcapDispose = vi.spyOn(activeMatcapTex, 'dispose')
    const metaTexDispose = vi.spyOn(metaTex, 'dispose')

    const combineResult = {
      groups: new Map([['opaque', { mesh: combinedMesh, material: atlasMat }]]),
      materialSlotIndex: new Map([
        [origMat, { renderMode: 'opaque' as const, slotIndex: 0 }],
      ]),
      statistics: {
        originalMeshCount: 1,
        originalMaterialCount: 1,
        reducedDrawCalls: 0,
      },
    }

    disposeReplacedResources({
      vrm,
      originalResources,
      atlasMap,
      meshesToRemove: [removedMesh],
      materialInfos,
      combineResult,
    })

    expect(unusedMapDispose).toHaveBeenCalledTimes(1)
    expect(unusedAtlasMatcapDispose).toHaveBeenCalledTimes(1)
    expect(unusedAtlasOutlineDispose).toHaveBeenCalledTimes(1)
    expect(activeAtlasMapDispose).not.toHaveBeenCalled()
    expect(activeMatcapDispose).not.toHaveBeenCalled()
    expect(metaTexDispose).not.toHaveBeenCalled()
    expect(combineResult.materialSlotIndex.size).toBe(0)
  })

  it('excludedMeshes と共有されている Geometry / Skeleton は dispose() せず、非共有のみ dispose() する', () => {
    const scene = new Group()
    const bone = new Bone()
    const sharedGeo = createTriangleGeometry(true)
    const unsharedGeo = createTriangleGeometry(true)
    const sharedSkeleton = new Skeleton([bone])
    const unsharedSkeleton = new Skeleton([bone])

    const origMat = new MToonMaterial({ name: 'orig' })
    const excludedMesh = new SkinnedMesh(sharedGeo, origMat)
    excludedMesh.bind(sharedSkeleton)
    const removedSharedMesh = new SkinnedMesh(sharedGeo, origMat)
    removedSharedMesh.bind(sharedSkeleton)
    const removedUnsharedMesh = new SkinnedMesh(unsharedGeo, origMat)
    removedUnsharedMesh.bind(unsharedSkeleton)

    const atlasMat = new MToonAtlasMaterial()
    excludedMesh.material = atlasMat
    scene.add(excludedMesh)

    const materialInfos: MaterialInfo[] = [
      {
        material: origMat,
        meshes: [excludedMesh, removedSharedMesh, removedUnsharedMesh],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ]

    const originalResources = collectOriginalResources(materialInfos)
    const vrm = { scene } as unknown as VRM

    const sharedGeoDispose = vi.spyOn(sharedGeo, 'dispose')
    const unsharedGeoDispose = vi.spyOn(unsharedGeo, 'dispose')
    const sharedSkelDispose = vi.spyOn(sharedSkeleton, 'dispose')
    const unsharedSkelDispose = vi.spyOn(unsharedSkeleton, 'dispose')

    disposeReplacedResources({
      vrm,
      originalResources,
      atlasMap: createEmptyAtlasMap(),
      meshesToRemove: [removedSharedMesh, removedUnsharedMesh],
      materialInfos,
      combineResult: {
        groups: new Map([['opaque', { mesh: null, material: atlasMat }]]),
        materialSlotIndex: new Map(),
        statistics: {
          originalMeshCount: 2,
          originalMaterialCount: 1,
          reducedDrawCalls: 0,
        },
      },
    })

    expect(sharedGeoDispose).not.toHaveBeenCalled()
    expect(sharedSkelDispose).not.toHaveBeenCalled()
    expect(unsharedGeoDispose).toHaveBeenCalledTimes(1)
    expect(unsharedSkelDispose).toHaveBeenCalledTimes(1)
  })

  it('clearMaterialTextureReferences が MToonMaterial の全テクスチャスロットを null 化する', () => {
    const mat = new MToonMaterial()
    const slots: MToonTextureSlot[] = [
      'map',
      'normalMap',
      'emissiveMap',
      'shadeMultiplyTexture',
      'shadingShiftTexture',
      'matcapTexture',
      'rimMultiplyTexture',
      'outlineWidthMultiplyTexture',
      'uvAnimationMaskTexture',
    ]
    for (const slot of slots) {
      mat[slot] = createDummyTexture(slot)
    }

    clearMaterialTextureReferences(mat)

    for (const slot of slots) {
      expect(mat[slot]).toBeNull()
      expect(mat.uniforms[slot].value).toBeNull()
    }
  })

  it('combineMToonMaterials 完了後に結合ジオメトリの userData.skeleton と bindMatrix が削除される', () => {
    const bone = new Bone()
    const skeleton = new Skeleton([bone])
    const mesh1 = new SkinnedMesh(
      createTriangleGeometry(true),
      new MToonMaterial({ name: 'm1' }),
    )
    mesh1.bind(skeleton)
    mesh1.material.outlineWidthMode = 'worldCoordinates'

    const mesh2 = new SkinnedMesh(
      createTriangleGeometry(true),
      new MToonMaterial({ name: 'm2' }),
    )
    mesh2.bind(skeleton)
    mesh2.material.outlineWidthMode = 'none'

    const result = combineMToonMaterials([
      {
        material: mesh1.material,
        meshes: [mesh1],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
      {
        material: mesh2.material,
        meshes: [mesh2],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ])

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('opaque')!
    expect(group.mesh).not.toBeNull()
    expect(group.outlineMesh).toBeDefined()
    expect(group.mesh!.geometry.userData.skeleton).toBeUndefined()
    expect(group.mesh!.geometry.userData.bindMatrix).toBeUndefined()
    expect(group.outlineMesh!.geometry.userData.skeleton).toBeUndefined()
    expect(group.outlineMesh!.geometry.userData.bindMatrix).toBeUndefined()
  })

  it('collectActiveSceneResources は meta.thumbnailImage も保護対象に含める', () => {
    const scene = new Group()
    const fakeThumbnail = { tag: 'thumb' }
    const vrm = {
      scene,
      meta: { metaVersion: '1', thumbnailImage: fakeThumbnail },
    } as unknown as VRM

    const active = collectActiveSceneResources(vrm)
    expect(active.images.has(fakeThumbnail)).toBe(true)
  })
})

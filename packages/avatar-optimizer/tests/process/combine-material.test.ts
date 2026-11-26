import { MToonMaterial } from '@pixiv/three-vrm'
import { BufferAttribute, BufferGeometry, Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { combineMToonMaterials } from '../../src/util/material/combine'
import { packMaterialParameters } from '../../src/util/texture'

describe('combineMToonMaterials', () => {
  it('should exclude meshes specified in excludedMeshes', () => {
    // Create two simple meshes with the same material
    const geometry1 = new BufferGeometry()
    const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

    const geometry2 = new BufferGeometry()
    const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
    geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

    const material = new MToonMaterial()

    const mesh1 = new Mesh(geometry1, material)
    const mesh2 = new Mesh(geometry2, material)

    const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
    materialMeshMap.set(material, [mesh1, mesh2])

    const excludedMeshes = new Set<Mesh>([mesh2])

    const result = combineMToonMaterials(materialMeshMap, {}, excludedMeshes)

    expect(result.isOk()).toBe(true)

    if (result.isOk()) {
      const { statistics } = result.value
      // Should only contain mesh1
      expect(statistics.originalMeshCount).toBe(1)
    }
  })

  it('should include all meshes if excludedMeshes is empty', () => {
    // Create two simple meshes with the same material
    const geometry1 = new BufferGeometry()
    const positions1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    geometry1.setAttribute('position', new BufferAttribute(positions1, 3))

    const geometry2 = new BufferGeometry()
    const positions2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
    geometry2.setAttribute('position', new BufferAttribute(positions2, 3))

    const material = new MToonMaterial()

    const mesh1 = new Mesh(geometry1, material)
    const mesh2 = new Mesh(geometry2, material)

    const materialMeshMap = new Map<MToonMaterial, Mesh[]>()
    materialMeshMap.set(material, [mesh1, mesh2])

    const result = combineMToonMaterials(materialMeshMap, {})

    expect(result.isOk()).toBe(true)

    if (result.isOk()) {
      const { statistics } = result.value
      // Should contain both meshes
      expect(statistics.originalMeshCount).toBe(2)
    }
  })

  it('should build outlineMesh only from meshes whose material has outline when mixed in the same renderMode', () => {
    const createTriangleGeometry = (z: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]), 3),
      )
      return geo
    }

    const outlinedMat = new MToonMaterial({ name: 'outlined' })
    outlinedMat.outlineWidthMode = 'worldCoordinates'
    outlinedMat.outlineWidthFactor = 0.01

    const plainMat = new MToonMaterial({ name: 'plain' })
    plainMat.outlineWidthMode = 'none'

    const outlinedMesh = new Mesh(createTriangleGeometry(0), outlinedMat)
    const plainMesh = new Mesh(createTriangleGeometry(1), plainMat)

    const result = combineMToonMaterials([
      {
        material: outlinedMat,
        meshes: [outlinedMesh],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
      {
        material: plainMat,
        meshes: [plainMesh],
        hasOutline: false,
        outlineWidthMode: 'none',
        renderMode: 'opaque',
      },
    ])

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('opaque')!
    expect(group.mesh).not.toBeNull()
    expect(group.outlineMesh).toBeDefined()

    // 本体メッシュは両方(6頂点)、アウトラインメッシュはアウトラインあり(3頂点)のみ
    expect(group.mesh!.geometry.getAttribute('position').count).toBe(6)
    expect(group.outlineMesh!.geometry.getAttribute('position').count).toBe(3)
    expect(group.outlineMesh!.geometry).not.toBe(group.mesh!.geometry)

    // アウトラインメッシュのスロット属性は outlinedMat のスロット (0) を持つ
    const outlineSlot =
      group.outlineMesh!.geometry.getAttribute('mtoonMaterialSlot')
    expect(outlineSlot.count).toBe(3)
    expect(Array.from(outlineSlot.array)).toEqual([0, 0, 0])

    // シャドウ生成は不要なので castShadow=false、影の受け取りは維持
    expect(group.outlineMesh!.castShadow).toBe(false)
    expect(group.outlineMesh!.receiveShadow).toBe(true)
  })

  it('should share geometry between main mesh and outlineMesh when all merged meshes have outline', () => {
    const createTriangleGeometry = (z: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]), 3),
      )
      return geo
    }

    const mat1 = new MToonMaterial()
    mat1.outlineWidthMode = 'worldCoordinates'
    const mat2 = new MToonMaterial()
    mat2.outlineWidthMode = 'worldCoordinates'

    const mesh1 = new Mesh(createTriangleGeometry(0), mat1)
    const mesh2 = new Mesh(createTriangleGeometry(1), mat2)

    const result = combineMToonMaterials([
      {
        material: mat1,
        meshes: [mesh1],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
      {
        material: mat2,
        meshes: [mesh2],
        hasOutline: true,
        outlineWidthMode: 'worldCoordinates',
        renderMode: 'opaque',
      },
    ])

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('opaque')!
    expect(group.outlineMesh).toBeDefined()
    expect(group.outlineMesh!.geometry).toBe(group.mesh!.geometry)
  })

  it('should not create outlineMesh when the only outlined mesh is excluded', () => {
    const createTriangleGeometry = (z: number) => {
      const geo = new BufferGeometry()
      geo.setAttribute(
        'position',
        new BufferAttribute(new Float32Array([0, 0, z, 1, 0, z, 0, 1, z]), 3),
      )
      return geo
    }

    const outlinedMat = new MToonMaterial()
    outlinedMat.outlineWidthMode = 'worldCoordinates'
    const plainMat = new MToonMaterial()
    plainMat.outlineWidthMode = 'none'

    const excludedOutlinedMesh = new Mesh(
      createTriangleGeometry(0),
      outlinedMat,
    )
    const mergedPlainMesh = new Mesh(createTriangleGeometry(1), plainMat)

    const result = combineMToonMaterials(
      [
        {
          material: outlinedMat,
          meshes: [excludedOutlinedMesh],
          hasOutline: true,
          outlineWidthMode: 'worldCoordinates',
          renderMode: 'opaque',
        },
        {
          material: plainMat,
          meshes: [mergedPlainMesh],
          hasOutline: false,
          outlineWidthMode: 'none',
          renderMode: 'opaque',
        },
      ],
      {},
      new Set([excludedOutlinedMesh]),
    )

    expect(result.isOk()).toBe(true)
    const group = result._unsafeUnwrap().groups.get('opaque')!
    expect(group.mesh).not.toBeNull()
    expect(group.outlineMesh).toBeUndefined()
  })

  it('should pack outlineWidth as 0 when outlineWidthMode is none', () => {
    const mat = new MToonMaterial()
    mat.outlineWidthMode = 'none'
    mat.outlineWidthFactor = 0.05

    const packed = packMaterialParameters([mat], 9)
    expect(packed.isOk()).toBe(true)
    // outlineWidth は texel 3 の alpha (index = 3 * 4 + 3 = 15)
    expect(packed._unsafeUnwrap().data[15]).toBe(0)
  })
})

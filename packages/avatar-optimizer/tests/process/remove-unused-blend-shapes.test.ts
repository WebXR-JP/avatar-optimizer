import {
  MToonMaterial,
  VRM,
  VRMExpression,
  VRMExpressionManager,
  VRMExpressionMorphTargetBind,
} from '@pixiv/three-vrm'
import { MeshoptSimplifier } from 'meshoptimizer'
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { removeUnusedBlendShapes } from '../../src/process/remove-unused-blend-shapes'

function createMorphMesh(options: {
  name: string
  targetNames?: string[]
  deltas: number[][]
  withNormals?: boolean
  material?: MeshBasicMaterial | MToonMaterial
  sharedGeometry?: BufferGeometry
}): Mesh {
  const {
    name,
    targetNames,
    deltas,
    withNormals = true,
    material = new MeshBasicMaterial(),
    sharedGeometry,
  } = options

  let geometry: BufferGeometry
  if (sharedGeometry) {
    geometry = sharedGeometry
  } else {
    geometry = new BufferGeometry()
    const basePositions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    geometry.setAttribute('position', new BufferAttribute(basePositions, 3))
    geometry.setIndex([0, 1, 2])
    if (withNormals) {
      geometry.setAttribute(
        'normal',
        new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
      )
    }

    geometry.morphAttributes.position = deltas.map(([dx, dy, dz]) => {
      return new BufferAttribute(
        new Float32Array([dx, dy, dz, dx, dy, dz, dx, dy, dz]),
        3,
      )
    })
    if (withNormals) {
      geometry.morphAttributes.normal = deltas.map(([dx]) => {
        return new BufferAttribute(
          new Float32Array([dx, 0, 0, dx, 0, 0, dx, 0, 0]),
          3,
        )
      })
    }
    geometry.morphTargetsRelative = true
  }

  const mesh = new Mesh(geometry, material)
  mesh.name = name
  mesh.updateMorphTargets()

  if (targetNames && mesh.morphTargetInfluences) {
    const dict: Record<string, number> = {}
    targetNames.forEach((tName, idx) => {
      dict[tName] = idx
    })
    mesh.morphTargetDictionary = dict
  }

  return mesh
}

function createMockVRM(
  meshes: Mesh[],
  expressionManager: VRMExpressionManager | null,
): VRM {
  const scene = new Object3D()
  meshes.forEach((m) => scene.add(m))
  return {
    scene,
    expressionManager,
  } as unknown as VRM
}

function computeEffectiveMorphDelta(
  mesh: Mesh,
  vertexIndex = 0,
): [number, number, number] {
  const influences = mesh.morphTargetInfluences ?? []
  const posTargets = mesh.geometry.morphAttributes.position ?? []
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < posTargets.length; i++) {
    const w = influences[i] ?? 0
    if (w === 0) continue
    const attr = posTargets[i]
    x += w * attr.getX(vertexIndex)
    y += w * attr.getY(vertexIndex)
    z += w * attr.getZ(vertexIndex)
  }
  return [x, y, z]
}

describe('removeUnusedBlendShapes', () => {
  beforeAll(async () => {
    await MeshoptSimplifier.ready
  })

  it('表情から未参照の BlendShape のみを削除し、参照済みの配列・辞書・bind.index をリマップする', () => {
    const mesh = createMorphMesh({
      name: 'face',
      targetNames: ['unused0', 'happy', 'unused1', 'blink', 'unused2'],
      deltas: [
        [10, 0, 0],
        [0, 1, 0],
        [0, 20, 0],
        [0, 0, 2],
        [30, 30, 30],
      ],
    })

    const manager = new VRMExpressionManager()
    const happyExpr = new VRMExpression('happy')
    happyExpr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 1,
        weight: 0.8,
      }),
    )
    const blinkExpr = new VRMExpression('blink')
    blinkExpr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 3,
        weight: 1.0,
      }),
    )
    // weight === 0 でも登録されていれば保持対象
    const zeroExpr = new VRMExpression('neutral')
    zeroExpr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 1,
        weight: 0,
      }),
    )
    manager.registerExpression(happyExpr)
    manager.registerExpression(blinkExpr)
    manager.registerExpression(zeroExpr)

    const vrm = createMockVRM([mesh], manager)

    // 最適化前の適用結果を記録
    manager.setValue('happy', 1)
    manager.update()
    const expectedHappyDelta = computeEffectiveMorphDelta(mesh)
    manager.resetValues()
    manager.setValue('blink', 1)
    manager.update()
    const expectedBlinkDelta = computeEffectiveMorphDelta(mesh)
    manager.resetValues()
    manager.update()

    let disposedEventCount = 0
    mesh.geometry.addEventListener('dispose', () => {
      disposedEventCount++
    })

    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    expect(result.value).toEqual({
      processedMeshCount: 1,
      originalBlendShapeCount: 5,
      removedBlendShapeCount: 3,
      remainingBlendShapeCount: 2,
    })

    expect(mesh.geometry.morphAttributes.position).toHaveLength(2)
    expect(mesh.geometry.morphAttributes.normal).toHaveLength(2)
    expect(mesh.geometry.morphTargetsRelative).toBe(true)
    expect(mesh.morphTargetInfluences).toHaveLength(2)
    expect(mesh.morphTargetDictionary).toEqual({
      happy: 0,
      blink: 1,
    })
    expect(disposedEventCount).toBe(1)

    // bind.index が新インデックスに更新されていること
    expect((happyExpr.binds[0] as VRMExpressionMorphTargetBind).index).toBe(0)
    expect((blinkExpr.binds[0] as VRMExpressionMorphTargetBind).index).toBe(1)
    expect((zeroExpr.binds[0] as VRMExpressionMorphTargetBind).index).toBe(0)

    // 最適化後の表情適用結果が一致すること
    manager.setValue('happy', 1)
    manager.update()
    expect(computeEffectiveMorphDelta(mesh)).toEqual(expectedHappyDelta)
    manager.resetValues()
    manager.setValue('blink', 1)
    manager.update()
    expect(computeEffectiveMorphDelta(mesh)).toEqual(expectedBlinkDelta)
  })

  it('全 BlendShape が未参照のメッシュは morphAttributes / morphTargetInfluences / dictionary を完全に除去する', () => {
    const mesh = createMorphMesh({
      name: 'eye',
      targetNames: ['unused0', 'unused1'],
      deltas: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    })
    const vrm = createMockVRM([mesh], new VRMExpressionManager())

    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    expect(result.value).toEqual({
      processedMeshCount: 1,
      originalBlendShapeCount: 2,
      removedBlendShapeCount: 2,
      remainingBlendShapeCount: 0,
    })
    expect(mesh.geometry.morphAttributes).toEqual({})
    expect(mesh.geometry.morphTargetsRelative).toBe(false)
    expect(mesh.morphTargetInfluences).toBeUndefined()
    expect(mesh.morphTargetDictionary).toBeUndefined()
  })

  it('全 BlendShape が参照済みの場合は何も削除しない', () => {
    const mesh = createMorphMesh({
      name: 'face',
      targetNames: ['a', 'b'],
      deltas: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    })
    const manager = new VRMExpressionManager()
    const expr = new VRMExpression('aa')
    expr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 0,
        weight: 1,
      }),
    )
    expr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 1,
        weight: 1,
      }),
    )
    manager.registerExpression(expr)

    const vrm = createMockVRM([mesh], manager)
    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    expect(result.value).toEqual({
      processedMeshCount: 1,
      originalBlendShapeCount: 2,
      removedBlendShapeCount: 0,
      remainingBlendShapeCount: 2,
    })
    expect(mesh.geometry.morphAttributes.position).toHaveLength(2)
    expect(mesh.morphTargetDictionary).toEqual({ a: 0, b: 1 })
  })

  it('expressionManager が null の場合は全 BlendShape を削除する', () => {
    const mesh = createMorphMesh({
      name: 'face',
      targetNames: ['a'],
      deltas: [[1, 0, 0]],
    })
    const vrm = createMockVRM([mesh], null)

    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    expect(result.value.removedBlendShapeCount).toBe(1)
    expect(result.value.remainingBlendShapeCount).toBe(0)
    expect(mesh.morphTargetInfluences).toBeUndefined()
  })

  it('1 つの bind が複数 primitives を指し、リマップ後インデックスが異なる場合は bind を分割する', () => {
    const meshA = createMorphMesh({
      name: 'meshA',
      targetNames: ['unused', 'shared'],
      deltas: [
        [10, 0, 0],
        [0, 1, 0],
      ],
    })
    const meshB = createMorphMesh({
      name: 'meshB',
      targetNames: ['onlyB', 'shared'],
      deltas: [
        [0, 0, 5],
        [0, 2, 0],
      ],
    })

    const manager = new VRMExpressionManager()
    const exprOnlyB = new VRMExpression('ih')
    exprOnlyB.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [meshB],
        index: 0,
        weight: 1,
      }),
    )
    const exprShared = new VRMExpression('aa')
    exprShared.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [meshA, meshB],
        index: 1,
        weight: 0.7,
      }),
    )
    manager.registerExpression(exprOnlyB)
    manager.registerExpression(exprShared)

    const vrm = createMockVRM([meshA, meshB], manager)
    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    // meshA では old 1 -> new 0, meshB では old 1 -> new 1 にリマップされるため分割される
    expect(exprShared.binds).toHaveLength(2)
    manager.setValue('aa', 1)
    manager.update()
    expect(computeEffectiveMorphDelta(meshA)).toEqual([0, 0.7, 0])
    expect(computeEffectiveMorphDelta(meshB)).toEqual([0, 1.4, 0])
  })

  it('共有 BufferGeometry を持つメッシュ間で保持インデックスが同じなら共有を維持し、異なるなら浅いクローンで分離する', () => {
    const baseMesh = createMorphMesh({
      name: 'base',
      targetNames: ['m0', 'm1', 'm2'],
      deltas: [
        [1, 0, 0],
        [0, 2, 0],
        [0, 0, 3],
      ],
    })
    const sharedGeo = baseMesh.geometry

    // 同一保持セット (mesh1, mesh2 はどちらも index 1 を使用)
    const mesh1 = createMorphMesh({
      name: 'mesh1',
      targetNames: ['m0', 'm1', 'm2'],
      deltas: [],
      sharedGeometry: sharedGeo,
    })
    const mesh2 = createMorphMesh({
      name: 'mesh2',
      targetNames: ['m0', 'm1', 'm2'],
      deltas: [],
      sharedGeometry: sharedGeo,
    })
    // 異なる保持セット (mesh3 は index 2 を使用)
    const mesh3 = createMorphMesh({
      name: 'mesh3',
      targetNames: ['m0', 'm1', 'm2'],
      deltas: [],
      sharedGeometry: sharedGeo,
    })

    const manager = new VRMExpressionManager()
    const expr1 = new VRMExpression('aa')
    expr1.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh1, mesh2],
        index: 1,
        weight: 1,
      }),
    )
    const expr2 = new VRMExpression('ih')
    expr2.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh3],
        index: 2,
        weight: 1,
      }),
    )
    manager.registerExpression(expr1)
    manager.registerExpression(expr2)

    const vrm = createMockVRM([mesh1, mesh2, mesh3], manager)
    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)

    expect(mesh1.geometry).toBe(mesh2.geometry)
    expect(mesh1.geometry).not.toBe(mesh3.geometry)
    // 頂点属性バッファは共有されている
    expect(mesh1.geometry.getAttribute('position')).toBe(
      mesh3.geometry.getAttribute('position'),
    )

    manager.setValue('aa', 1)
    manager.setValue('ih', 1)
    manager.update()
    expect(computeEffectiveMorphDelta(mesh1)).toEqual([0, 2, 0])
    expect(computeEffectiveMorphDelta(mesh2)).toEqual([0, 2, 0])
    expect(computeEffectiveMorphDelta(mesh3)).toEqual([0, 0, 3])
  })

  it('morphTargetDictionary が undefined や範囲外 bind.index を含んでいても安全に動作する', () => {
    const mesh = createMorphMesh({
      name: 'noDict',
      deltas: [
        [1, 0, 0],
        [0, 1, 0],
      ],
    })
    mesh.morphTargetDictionary = undefined

    const manager = new VRMExpressionManager()
    const expr = new VRMExpression('aa')
    expr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 1,
        weight: 1,
      }),
    )
    // 範囲外インデックス
    expr.addBind(
      new VRMExpressionMorphTargetBind({
        primitives: [mesh],
        index: 99,
        weight: 1,
      }),
    )
    manager.registerExpression(expr)

    const vrm = createMockVRM([mesh], manager)
    const result = removeUnusedBlendShapes(vrm)
    expect(result.isOk()).toBe(true)
    if (result.isErr()) return

    expect(result.value.removedBlendShapeCount).toBe(1)
    expect(result.value.remainingBlendShapeCount).toBe(1)
    expect(mesh.morphTargetDictionary).toBeUndefined()
    expect((expr.binds[0] as VRMExpressionMorphTargetBind).index).toBe(0)
    expect((expr.binds[1] as VRMExpressionMorphTargetBind).index).toBe(99)
  })
})

describe('optimizeModel with removeUnusedBlendShapes', () => {
  beforeAll(async () => {
    await MeshoptSimplifier.ready
  })

  it('デフォルトでは未参照 BlendShape を削除せず、true 指定時に削除して統計を返す', async () => {
    const createModel = () => {
      const mesh = createMorphMesh({
        name: 'head',
        targetNames: ['unused', 'blink'],
        deltas: [
          [1, 0, 0],
          [0, 1, 0],
        ],
      })
      const manager = new VRMExpressionManager()
      const blink = new VRMExpression('blink')
      blink.addBind(
        new VRMExpressionMorphTargetBind({
          primitives: [mesh],
          index: 1,
          weight: 1,
        }),
      )
      manager.registerExpression(blink)
      return { vrm: createMockVRM([mesh], manager), mesh }
    }

    const defaultCase = createModel()
    const defaultResult = await optimizeModel(defaultCase.vrm)
    expect(defaultResult.isOk()).toBe(true)
    if (defaultResult.isOk()) {
      expect(defaultResult.value.statistics.blendShapes).toBeUndefined()
    }
    expect(defaultCase.mesh.geometry.morphAttributes.position).toHaveLength(2)

    const enabledCase = createModel()
    const enabledResult = await optimizeModel(enabledCase.vrm, {
      removeUnusedBlendShapes: true,
    })
    expect(enabledResult.isOk()).toBe(true)
    if (enabledResult.isOk()) {
      expect(enabledResult.value.statistics.blendShapes).toEqual({
        processedMeshCount: 1,
        originalBlendShapeCount: 2,
        removedBlendShapeCount: 1,
        remainingBlendShapeCount: 1,
      })
    }
    expect(enabledCase.mesh.geometry.morphAttributes.position).toHaveLength(1)
    expect(enabledCase.mesh.morphTargetDictionary).toEqual({ blink: 0 })
  })

  it('removeUnusedBlendShapes と simplify 併用時、未参照 BlendShape のみのメッシュが簡略化対象になる', async () => {
    // 10x10 グリッドメッシュに未参照 MorphTarget のみを持たせる
    const gridSize = 6
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    for (let y = 0; y <= gridSize; y++) {
      for (let x = 0; x <= gridSize; x++) {
        positions.push(x, y, 0)
        normals.push(0, 0, 1)
        uvs.push(x / gridSize, y / gridSize)
      }
    }
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const i = y * (gridSize + 1) + x
        indices.push(i, i + 1, i + gridSize + 1)
        indices.push(i + 1, i + gridSize + 2, i + gridSize + 1)
      }
    }

    const geo = new BufferGeometry()
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3),
    )
    geo.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(normals), 3),
    )
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
    geo.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
    geo.morphAttributes.position = [
      new BufferAttribute(new Float32Array(positions.length), 3),
    ]
    geo.morphTargetsRelative = true

    const mesh = new Mesh(geo, new MeshBasicMaterial())
    mesh.name = 'bodyWithUnusedMorph'
    mesh.updateMorphTargets()

    const vrm = createMockVRM([mesh], new VRMExpressionManager())
    const result = await optimizeModel(vrm, {
      removeUnusedBlendShapes: true,
      simplify: {
        targetRatio: 0.4,
        targetError: 0.1,
        morphTargetHandling: 'skip',
      },
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.statistics.blendShapes?.removedBlendShapeCount).toBe(
        1,
      )
      expect(result.value.statistics.simplify?.processedMeshCount).toBe(1)
      expect(
        result.value.statistics.simplify?.simplifiedIndexCount,
      ).toBeLessThan(indices.length)
    }
  })

  it('既にアトラス化済みのモデルでは removeUnusedBlendShapes をスキップする', async () => {
    const atlasMaterial = new MeshBasicMaterial()
    ;(
      atlasMaterial as unknown as { isMToonAtlasMaterial: boolean }
    ).isMToonAtlasMaterial = true

    const mesh = createMorphMesh({
      name: 'alreadyOptimized',
      targetNames: ['unused'],
      deltas: [[1, 0, 0]],
      material: atlasMaterial,
    })
    const vrm = createMockVRM([mesh], new VRMExpressionManager())

    const result = await optimizeModel(vrm, {
      removeUnusedBlendShapes: true,
    })
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.atlasSkipped?.reason).toBe('ALREADY_OPTIMIZED')
      expect(result.value.statistics.blendShapes).toBeUndefined()
    }
    expect(mesh.geometry.morphAttributes.position).toHaveLength(1)
  })
})

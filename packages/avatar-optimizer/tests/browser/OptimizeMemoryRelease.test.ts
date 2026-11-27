/**
 * optimizeModel 実行後の元 VRM リソース参照解放テスト（ブラウザ環境）
 *
 * 実モデル（AliciaSolid.vrm / VRM1_Constraint_Twist_Sample.vrm）に対して
 * optimizeModel を実行した直後に、vrm および最適化結果から辿れる
 * オブジェクトグラフ全体に元マテリアル・元テクスチャ・削除メッシュ・
 * 非共有ジオメトリ・元スケルトンへの強参照が残っていないことを検証する。
 */

import type { VRM } from '@pixiv/three-vrm'
import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import {
  clearKtx2LoaderCache,
  DEFAULT_KTX2_TRANSCODER_PATH,
  getKtx2TranscoderPath,
  setKtx2TranscoderPath,
} from '@webxr-jp/mtoon-atlas'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import {
  AmbientLight,
  type BufferGeometry,
  DirectionalLight,
  type Material,
  Mesh,
  OrthographicCamera,
  RenderTarget,
  Scene,
  type Skeleton,
  SkinnedMesh,
  type Texture,
  WebGLRenderer,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM, loadVRM } from '../../src/io'
import type { OptimizeModelOptions } from '../../src/types'
import { collectMaterialTextures } from '../../src/util/cleanup-references'
import { isMToonLikeMaterial } from '../../src/util/material'
import { measureRegionColor } from './helpers/atlas-rendering'

const isNativeWebGPUMode =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_WEBGPU_NATIVE === 'true'

interface PreOptimizationSnapshot {
  mtoonMaterials: Set<Material>
  textures: Set<Texture>
  meshes: Set<Mesh>
  geometries: Set<BufferGeometry>
  skeletons: Set<Skeleton>
}

function capturePreOptimizationSnapshot(vrm: VRM): PreOptimizationSnapshot {
  const mtoonMaterials = new Set<Material>()
  const textures = new Set<Texture>()
  const meshes = new Set<Mesh>()
  const geometries = new Set<BufferGeometry>()
  const skeletons = new Set<Skeleton>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    meshes.add(obj)
    if (obj.geometry) {
      geometries.add(obj.geometry)
    }
    if (obj instanceof SkinnedMesh && obj.skeleton) {
      skeletons.add(obj.skeleton)
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (isMToonLikeMaterial(mat)) {
        mtoonMaterials.add(mat)
        collectMaterialTextures(mat, textures)
      }
    }
  })

  if (Array.isArray(vrm.materials)) {
    for (const mat of vrm.materials) {
      if (isMToonLikeMaterial(mat)) {
        mtoonMaterials.add(mat)
        collectMaterialTextures(mat, textures)
      }
    }
  }

  return { mtoonMaterials, textures, meshes, geometries, skeletons }
}

function shouldSkipObjectForTraversal(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return true
  if (typeof Node !== 'undefined' && value instanceof Node) return true
  if (typeof Window !== 'undefined' && value instanceof Window) return true
  if (typeof Document !== 'undefined' && value instanceof Document) return true
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return true
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) {
    return true
  }
  return false
}

/**
 * roots から到達可能なすべての JS オブジェクトを BFS で収集する
 */
function collectReachableObjects(roots: unknown[]): Set<object> {
  const visited = new Set<object>()
  const queue: object[] = []

  const enqueue = (val: unknown) => {
    if (shouldSkipObjectForTraversal(val)) return
    if (!visited.has(val)) {
      visited.add(val)
      queue.push(val)
    }
  }

  for (const root of roots) {
    enqueue(root)
  }

  let head = 0
  while (head < queue.length) {
    const current = queue[head++]

    if (Array.isArray(current)) {
      for (const item of current) {
        enqueue(item)
      }
    } else if (current instanceof Map) {
      for (const [k, v] of current.entries()) {
        enqueue(k)
        enqueue(v)
      }
    } else if (current instanceof Set) {
      for (const item of current.values()) {
        enqueue(item)
      }
    }

    for (const key of Object.getOwnPropertyNames(current)) {
      enqueue((current as Record<string, unknown>)[key])
    }
  }

  return visited
}

function collectActiveSceneState(vrm: VRM): {
  meshes: Set<Mesh>
  geometries: Set<BufferGeometry>
  materials: Set<Material>
  textures: Set<Texture>
} {
  const meshes = new Set<Mesh>()
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  vrm.scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    meshes.add(obj)
    if (obj.geometry) {
      geometries.add(obj.geometry)
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (mat) {
        materials.add(mat)
        collectMaterialTextures(mat, textures)
      }
    }
  })

  return { meshes, geometries, materials, textures }
}

function assertNoLeakedOriginalReferences(
  vrm: VRM,
  optValue: unknown,
  before: PreOptimizationSnapshot,
): void {
  const active = collectActiveSceneState(vrm)
  const metaTexture = (vrm.meta as { texture?: Texture } | undefined)?.texture
  const reachable = collectReachableObjects([vrm, optValue])

  const leakedMaterials = [...before.mtoonMaterials].filter((m) =>
    reachable.has(m),
  )
  expect(leakedMaterials).toEqual([])

  const leakedTextures = [...before.textures].filter(
    (tex) =>
      !active.textures.has(tex) && tex !== metaTexture && reachable.has(tex),
  )
  expect(leakedTextures).toEqual([])

  const removedMeshes = [...before.meshes].filter((m) => !active.meshes.has(m))
  expect(removedMeshes.length).toBeGreaterThan(0)
  const leakedMeshes = removedMeshes.filter((m) => reachable.has(m))
  expect(leakedMeshes).toEqual([])

  const removedNonSharedGeos = [...before.geometries].filter(
    (g) => !active.geometries.has(g),
  )
  const leakedGeos = removedNonSharedGeos.filter((g) => reachable.has(g))
  expect(leakedGeos).toEqual([])

  const leakedSkeletons = [...before.skeletons].filter((s) => reachable.has(s))
  expect(leakedSkeletons).toEqual([])

  if (Array.isArray(vrm.materials)) {
    for (const mat of vrm.materials) {
      expect(before.mtoonMaterials.has(mat)).toBe(false)
      expect(active.materials.has(mat)).toBe(true)
    }
    for (const mat of active.materials) {
      expect(vrm.materials).toContain(mat)
    }
  }
}

describe('optimizeModel メモリ・参照解放統合テスト', () => {
  let prevTranscoderPath: string
  let aliciaBuffer: ArrayBuffer
  let vrm1Buffer: ArrayBuffer

  beforeAll(async () => {
    prevTranscoderPath = getKtx2TranscoderPath()
    clearKtx2LoaderCache()
    setKtx2TranscoderPath('/basis/')

    const [aliciaRes, vrm1Res] = await Promise.all([
      fetch('/AliciaSolid.vrm'),
      fetch('/VRM1_Constraint_Twist_Sample.vrm'),
    ])
    aliciaBuffer = await aliciaRes.arrayBuffer()
    vrm1Buffer = await vrm1Res.arrayBuffer()
  })

  afterAll(() => {
    clearKtx2LoaderCache()
    setKtx2TranscoderPath(prevTranscoderPath || DEFAULT_KTX2_TRANSCODER_PATH)
  })

  async function runWebGLCase(
    buffer: ArrayBuffer,
    options: OptimizeModelOptions,
  ): Promise<void> {
    const loadRes = await loadVRM(buffer.slice(0))
    expect(loadRes.isOk()).toBe(true)
    const vrm = loadRes._unsafeUnwrap()

    const before = capturePreOptimizationSnapshot(vrm)
    expect(before.mtoonMaterials.size).toBeGreaterThan(0)
    expect(before.textures.size).toBeGreaterThan(0)

    const optRes = await optimizeModel(vrm, options)
    expect(optRes.isOk()).toBe(true)
    const optValue = optRes._unsafeUnwrap()
    expect(optValue.materialSlotIndex.size).toBe(0)

    assertNoLeakedOriginalReferences(vrm, optValue, before)

    // 最適化直後のランタイム動作・描画・エクスポート・firstPerson.setup を検証
    expect(() => vrm.update(1 / 60)).not.toThrow()

    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(128, 128)
    try {
      const scene = new Scene()
      scene.add(new AmbientLight(0xffffff, 1))
      scene.add(new DirectionalLight(0xffffff, 1))
      scene.add(vrm.scene)
      const camera = new OrthographicCamera(-1, 1, 2, 0, 0.1, 10)
      camera.position.set(0, 1, 3)

      renderer.render(scene, camera)
      expect(
        measureRegionColor(renderer.domElement, 0, 0, 128, 128).nonBlackCount,
      ).toBeGreaterThan(100)

      const exportRes = await exportVRM(vrm)
      expect(exportRes.isOk()).toBe(true)

      expect(() => vrm.firstPerson?.setup()).not.toThrow()
    } finally {
      renderer.dispose()
    }
  }

  it('AliciaSolid (VRM 0.x): 通常 WebGL + マイグレーションで元リソース参照がすべて解放される', async () => {
    await runWebGLCase(aliciaBuffer, {
      migrateVRM0ToVRM1: true,
      atlas: { defaultResolution: 256 },
    })
  })

  it('VRM1_Constraint_Twist_Sample (VRM 1.0): 通常 WebGL で元リソース参照がすべて解放される', async () => {
    await runWebGLCase(vrm1Buffer, {
      atlas: { defaultResolution: 256 },
    })
  })

  it('AliciaSolid (VRM 0.x): KTX2 圧縮付きでも元リソース参照がすべて解放される', async () => {
    await runWebGLCase(aliciaBuffer, {
      migrateVRM0ToVRM1: true,
      atlas: { defaultResolution: 256 },
      textureCompression: {
        supercompression: true,
        generateMipmaps: false,
      },
    })
  })

  it('VRM1_Constraint_Twist_Sample (VRM 1.0): KTX2 圧縮付きでも元リソース参照がすべて解放される', async () => {
    await runWebGLCase(vrm1Buffer, {
      atlas: { defaultResolution: 256 },
      textureCompression: {
        supercompression: true,
        generateMipmaps: false,
      },
    })
  })

  it('AliciaSolid (VRM 0.x): WebGPURenderer (MToonNodeMaterial / MToonAtlasNodeMaterial) でも元リソース参照がすべて解放される', async () => {
    const width = 128
    const height = 128
    const renderer = new WebGPURenderer({
      antialias: false,
      forceWebGL: !isNativeWebGPUMode,
    })
    renderer.setSize(width, height)
    await renderer.init()

    const target = new RenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
    })

    try {
      const loadRes = await loadVRM(aliciaBuffer.slice(0), {
        mtoonMaterialType: MToonNodeMaterial,
        mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
        ktx2Renderer: renderer,
      })
      expect(loadRes.isOk()).toBe(true)
      const vrm = loadRes._unsafeUnwrap()

      const before = capturePreOptimizationSnapshot(vrm)
      expect(before.mtoonMaterials.size).toBeGreaterThan(0)
      expect(before.textures.size).toBeGreaterThan(0)

      const optRes = await optimizeModel(vrm, {
        migrateVRM0ToVRM1: true,
        atlas: { defaultResolution: 256 },
        atlasMaterialType: MToonAtlasNodeMaterial,
        ktx2Renderer: renderer,
      })
      expect(optRes.isOk()).toBe(true)
      const optValue = optRes._unsafeUnwrap()
      expect(optValue.materialSlotIndex.size).toBe(0)

      assertNoLeakedOriginalReferences(vrm, optValue, before)

      expect(() => vrm.update(1 / 60)).not.toThrow()

      const scene = new Scene()
      scene.add(new AmbientLight(0xffffff, 1.2))
      scene.add(new DirectionalLight(0xffffff, 1.0))
      scene.add(vrm.scene)
      const camera = new OrthographicCamera(-1, 1, 2, 0, 0.1, 10)
      camera.position.set(0, 1, 3)

      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const raw = (await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        width,
        height,
      )) as Uint8Array
      let nonBlackCount = 0
      for (let i = 0; i < raw.length; i += 4) {
        if (raw[i] > 0 || raw[i + 1] > 0 || raw[i + 2] > 0) {
          nonBlackCount++
        }
      }
      expect(nonBlackCount).toBeGreaterThan(100)

      const exportRes = await exportVRM(vrm)
      expect(exportRes.isOk()).toBe(true)

      expect(() => vrm.firstPerson?.setup()).not.toThrow()
    } finally {
      renderer.setRenderTarget(null)
      target.dispose()
      renderer.dispose()
    }
  })
})

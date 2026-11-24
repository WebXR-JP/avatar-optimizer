/**
 * MToonAtlasNodeMaterial（TSL / 個別 UBO 版）の WebGPURenderer 実描画テスト
 *
 * 通常の `pnpm test`（vitest.config.ts）では WebGL2 フォールバック（forceWebGL: true）、
 * `pnpm test:webgpu`（vitest.webgpu.config.ts）ではネイティブ WebGPU（非フォールバック）で
 * 同一の全 7 ケースを実行し、各バックエンドが意図通り使われていることも明示検証する。
 *
 * ピクセル検証は SwapChain 破棄タイミングの影響を避けるため RenderTarget +
 * `readRenderTargetPixelsAsync()` で直接読み出す。
 */

import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import {
  AmbientLight,
  DataTexture,
  DirectionalLight,
  Mesh,
  OrthographicCamera,
  RenderTarget,
  Scene,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM, loadVRM } from '../../src/io'
import {
  createMultiSlotParameterData,
  createParameterData,
  createSingleSlotQuadGeometry,
  createSolidTexture,
  createTwoSlotQuadGeometry,
  expectPixelMatchesRgb,
  GRID_PALETTE,
} from './helpers/atlas-rendering'

/**
 * vitest.webgpu.config.ts 経由で起動された場合は true（ネイティブ WebGPU 必須モード）
 */
const isNativeWebGPUMode =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_WEBGPU_NATIVE === 'true'

const BACKEND_LABEL = isNativeWebGPUMode ? 'Native WebGPU' : 'WebGL2 fallback'

interface WebGPURendererInternals {
  backend?: {
    isWebGPUBackend?: boolean
    isWebGLBackend?: boolean
  }
  _nodes?: {
    nodeBuilderCache?: Map<unknown, unknown>
  }
}

interface TopDownPixelBuffer {
  width: number
  height: number
  /** 左上原点（y=0 が画面上端）で取得する RGBA（0〜255） */
  at(x: number, y: number): [number, number, number, number]
  /** 指定矩形（左上原点）内の非黒ピクセル数と平均 RGB を集計する */
  measureRegion(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { nonBlackCount: number; avgR: number; avgG: number; avgB: number }
}

/**
 * モードに応じた WebGPURenderer とオフスクリーン RenderTarget を初期化し、
 * 期待バックエンドであることを厳密に検証する
 */
async function createVerifiedRenderer(
  width: number,
  height: number,
): Promise<{
  renderer: WebGPURenderer
  target: RenderTarget
  dispose: () => void
}> {
  const renderer = new WebGPURenderer({
    antialias: false,
    forceWebGL: !isNativeWebGPUMode,
  })
  renderer.setSize(width, height)
  await renderer.init()

  const backend = (renderer as unknown as WebGPURendererInternals).backend
  if (isNativeWebGPUMode) {
    // ネイティブ WebGPU テストで WebGL2 へサイレントフォールバックしていないことを保証
    expect(backend?.isWebGPUBackend).toBe(true)
  } else {
    expect(backend?.isWebGLBackend).toBe(true)
  }

  const target = new RenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  renderer.setRenderTarget(target)

  return {
    renderer,
    target,
    dispose: () => {
      renderer.setRenderTarget(null)
      target.dispose()
      renderer.dispose()
    },
  }
}

/**
 * RenderTarget へ描画し、左上原点（y=0 が上端）で参照できるピクセルバッファを返す
 */
async function renderAndReadPixels(
  renderer: WebGPURenderer,
  target: RenderTarget,
  scene: Scene,
  camera: OrthographicCamera,
): Promise<TopDownPixelBuffer> {
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)

  const { width, height } = target
  const raw = (await renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    width,
    height,
  )) as Uint8Array

  // WebGL2 の gl.readPixels は左下原点、WebGPU の copyTextureToBuffer は左上原点
  const flipY =
    (renderer as unknown as WebGPURendererInternals).backend?.isWebGLBackend ===
    true

  const at = (x: number, y: number): [number, number, number, number] => {
    const row = flipY ? height - 1 - y : y
    const idx = (row * width + x) * 4
    return [raw[idx], raw[idx + 1], raw[idx + 2], raw[idx + 3]]
  }

  const measureRegion = (rx: number, ry: number, rw: number, rh: number) => {
    let nonBlackCount = 0
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const [r, g, b] = at(x, y)
        if (r + g + b > 30) {
          nonBlackCount++
          sumR += r
          sumG += g
          sumB += b
        }
      }
    }
    return {
      nonBlackCount,
      avgR: nonBlackCount > 0 ? sumR / nonBlackCount : 0,
      avgG: nonBlackCount > 0 ? sumG / nonBlackCount : 0,
      avgB: nonBlackCount > 0 ? sumB / nonBlackCount : 0,
    }
  }

  return { width, height, at, measureRegion }
}

/**
 * WebGPURenderer 内部の nodeBuilderCache サイズを取得する（シェーダーキャッシュ共有確認用）
 */
function getNodeBuilderCacheSize(renderer: WebGPURenderer): number {
  const nodes = (renderer as unknown as WebGPURendererInternals)._nodes
  return nodes?.nodeBuilderCache?.size ?? -1
}

/**
 * VRM 内の全 MToonAtlasNodeMaterial の baseColor / shadeColor を指定 RGB へ差し替える
 */
function tintVRMParameterBuffers(
  root: Scene | Mesh | { traverse: (cb: (obj: unknown) => void) => void },
  rgb: [number, number, number],
): void {
  const visited = new Set<MToonAtlasNodeMaterial>()
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!(mat instanceof MToonAtlasNodeMaterial) || visited.has(mat)) continue
      visited.add(mat)
      const desc = mat.parameterBuffer
      if (!desc) continue
      const nextData = desc.data.slice()
      for (let slot = 0; slot < desc.slotCount; slot++) {
        const base = slot * desc.texelsPerSlot * 4
        nextData[base + 0] = rgb[0]
        nextData[base + 1] = rgb[1]
        nextData[base + 2] = rgb[2]
        nextData[base + 4] = rgb[0]
        nextData[base + 5] = rgb[1]
        nextData[base + 6] = rgb[2]
      }
      mat.setParameterBuffer({ ...desc, data: nextData })
    }
  })
}

describe(`MToonAtlasNodeMaterial with WebGPURenderer (${BACKEND_LABEL})`, () => {
  it('複数マテリアル間でシェーダーキャッシュを共有しつつ、各 UBO スロットとアトラステクスチャが混線せず描画される', async () => {
    const { renderer, target, dispose } = await createVerifiedRenderer(128, 128)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const dataA = createParameterData([1, 0, 0], [0, 1, 0])
      dataA[11] = 0
      dataA[9 * 4 + 11] = 0
      const matA = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: dataA,
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 255, 255) },
        },
      })

      const dataB = createParameterData([0, 0, 1], [1, 1, 0])
      dataB[11] = 0
      dataB[9 * 4 + 11] = 0
      const matB = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: dataB,
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 255, 255) },
        },
      })

      expect(matA.customProgramCacheKey()).toBe(matB.customProgramCacheKey())

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, 0.5, 2, 1), matA))
      renderer.render(scene, camera)
      const cacheSizeAfterA = getNodeBuilderCacheSize(renderer)

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, -0.5, 2, 1), matB))
      const pixels = await renderAndReadPixels(renderer, target, scene, camera)
      const cacheSizeAfterB = getNodeBuilderCacheSize(renderer)

      expect(cacheSizeAfterB).toBe(cacheSizeAfterA)

      expectPixelMatchesRgb(pixels.at(32, 32), [1, 0, 0])
      expectPixelMatchesRgb(pixels.at(96, 32), [0, 1, 0])
      expectPixelMatchesRgb(pixels.at(32, 96), [0, 0, 1])
      expectPixelMatchesRgb(pixels.at(96, 96), [1, 1, 0])
    } finally {
      dispose()
    }
  })

  it('別々のアトラステクスチャ（map）を持つマテリアル間でもシェーダー共有しつつテクスチャが切り替わる', async () => {
    const { renderer, target, dispose } = await createVerifiedRenderer(128, 128)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const whiteDataA = createParameterData([1, 1, 1], [1, 1, 1])
      whiteDataA[11] = 0
      whiteDataA[9 * 4 + 11] = 0
      const whiteDataB = whiteDataA.slice()

      const matRedMap = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: whiteDataA,
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 0, 0) },
        },
      })
      const matBlueMap = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: whiteDataB,
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(0, 0, 255) },
        },
      })

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, 0.5, 2, 1), matRedMap))
      renderer.render(scene, camera)
      const cacheSizeAfterRed = getNodeBuilderCacheSize(renderer)

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, -0.5, 2, 1), matBlueMap))
      const pixels = await renderAndReadPixels(renderer, target, scene, camera)
      const cacheSizeAfterBlue = getNodeBuilderCacheSize(renderer)

      expect(cacheSizeAfterBlue).toBe(cacheSizeAfterRed)

      expectPixelMatchesRgb(pixels.at(64, 32), [1, 0, 0])
      expectPixelMatchesRgb(pixels.at(64, 96), [0, 0, 1])
    } finally {
      dispose()
    }
  })

  it('アウトライン（頂点 + フラグメント両ステージからの UBO 参照）を描画できる', async () => {
    const { renderer, target, dispose } = await createVerifiedRenderer(64, 64)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new DirectionalLight(0xffffff, 1))

      const data = createParameterData([1, 1, 1], [1, 1, 1], 0.05, [0, 1, 0])
      const body = new MToonAtlasNodeMaterial({
        parameterBuffer: { data, slotCount: 2, texelsPerSlot: 9 },
      })
      const outlineWorld = body.createOutlineMaterial('worldCoordinates')
      const outlineScreen = body.createOutlineMaterial('screenCoordinates')

      const mesh1 = new Mesh(
        createTwoSlotQuadGeometry(-0.5, 0, 0.8, 0.8),
        outlineWorld,
      )
      mesh1.rotation.y = Math.PI
      const mesh2 = new Mesh(
        createTwoSlotQuadGeometry(0.5, 0, 0.8, 0.8),
        outlineScreen,
      )
      mesh2.rotation.y = Math.PI
      scene.add(mesh1, mesh2)

      const pixels = await renderAndReadPixels(renderer, target, scene, camera)

      expect(pixels.at(16, 32)[1]).toBeGreaterThan(180)
      expect(pixels.at(48, 32)[1]).toBeGreaterThan(180)
    } finally {
      dispose()
    }
  })

  it('実 VRM（AliciaSolid.vrm）の MToonNodeMaterial 最適化 → WebGPURenderer 描画 → エクスポート → 再読込が通る', async () => {
    const response = await fetch('/AliciaSolid.vrm')
    const originalBuffer = await response.arrayBuffer()

    const loadResult = await loadVRM(originalBuffer, {
      mtoonMaterialType: MToonNodeMaterial,
      mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
    })
    expect(loadResult.isOk()).toBe(true)
    const vrm = loadResult._unsafeUnwrap()

    const optResult = await optimizeModel(vrm, {
      atlasMaterialType: MToonAtlasNodeMaterial,
    })
    expect(optResult.isOk()).toBe(true)

    const optimizedMaterials: MToonAtlasNodeMaterial[] = []
    vrm.scene.traverse((obj) => {
      if (
        obj instanceof Mesh &&
        obj.material instanceof MToonAtlasNodeMaterial
      ) {
        optimizedMaterials.push(obj.material)
      }
    })
    expect(optimizedMaterials.length).toBeGreaterThan(0)
    for (const mat of optimizedMaterials) {
      expect(mat.parameterTexture).toBeUndefined()
      expect(mat.parameterBuffer).toBeDefined()
      expect(mat.parameterBuffer!.slotCount).toBeGreaterThan(0)
    }

    const { renderer, target, dispose } = await createVerifiedRenderer(128, 128)
    try {
      const scene = new Scene()
      scene.add(new AmbientLight(0xffffff, 1))
      scene.add(new DirectionalLight(0xffffff, 1))
      scene.add(vrm.scene)
      const camera = new OrthographicCamera(-1, 1, 2, 0, 0.1, 10)
      camera.position.set(0, 1, 3)

      const pixels1 = await renderAndReadPixels(renderer, target, scene, camera)
      expect(
        pixels1.measureRegion(0, 0, 128, 128).nonBlackCount,
      ).toBeGreaterThan(200)

      const exportedResult = await exportVRM(vrm)
      expect(exportedResult.isOk()).toBe(true)
      const exportedArrayBuffer = exportedResult._unsafeUnwrap()

      const reloadedResult = await loadVRM(exportedArrayBuffer, {
        mtoonMaterialType: MToonNodeMaterial,
        mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
      })
      expect(reloadedResult.isOk()).toBe(true)
      const reloadedVrm = reloadedResult._unsafeUnwrap()

      const reloadedMaterials: MToonAtlasNodeMaterial[] = []
      reloadedVrm.scene.traverse((obj) => {
        if (
          obj instanceof Mesh &&
          obj.material instanceof MToonAtlasNodeMaterial
        ) {
          reloadedMaterials.push(obj.material)
        }
      })
      expect(reloadedMaterials.length).toBeGreaterThan(0)
      for (const mat of reloadedMaterials) {
        expect(mat.parameterTexture).toBeUndefined()
        expect(mat.parameterBuffer).toBeDefined()
        expect(mat.parameterBuffer!.slotCount).toBeGreaterThan(0)
      }

      scene.remove(vrm.scene)
      scene.add(reloadedVrm.scene)
      const pixels2 = await renderAndReadPixels(renderer, target, scene, camera)
      expect(
        pixels2.measureRegion(0, 0, 128, 128).nonBlackCount,
      ).toBeGreaterThan(200)
    } finally {
      dispose()
    }
  })

  it('複数体（実 VRM 3 体）を同時描画してもシェーダーキャッシュを共有し、各体の UBO 色とポーズが混線しない', async () => {
    const response = await fetch('/AliciaSolid.vrm')
    const originalBuffer = await response.arrayBuffer()

    const baseLoad = await loadVRM(originalBuffer, {
      mtoonMaterialType: MToonNodeMaterial,
      mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
    })
    expect(baseLoad.isOk()).toBe(true)
    const baseVrm = baseLoad._unsafeUnwrap()

    const optResult = await optimizeModel(baseVrm, {
      atlasMaterialType: MToonAtlasNodeMaterial,
    })
    expect(optResult.isOk()).toBe(true)

    const exportedResult = await exportVRM(baseVrm)
    expect(exportedResult.isOk()).toBe(true)
    const optimizedGlb = exportedResult._unsafeUnwrap()

    const loadAvatar = async () => {
      const res = await loadVRM(optimizedGlb.slice(0), {
        mtoonMaterialType: MToonNodeMaterial,
        mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
      })
      expect(res.isOk()).toBe(true)
      return res._unsafeUnwrap()
    }

    const avatarLeft = await loadAvatar()
    const avatarCenter = await loadAvatar()
    const avatarRight = await loadAvatar()

    avatarLeft.scene.position.set(-1.2, 0, 0)
    avatarCenter.scene.position.set(0, 0, 0)
    avatarRight.scene.position.set(1.2, 0, 0)

    tintVRMParameterBuffers(avatarCenter.scene, [1.0, 0.15, 0.15])
    tintVRMParameterBuffers(avatarRight.scene, [0.15, 0.15, 1.0])

    const leftUpperArm =
      avatarCenter.humanoid?.getNormalizedBoneNode('leftUpperArm')
    if (leftUpperArm) {
      leftUpperArm.rotation.z = 0.6
    }
    avatarCenter.update(0.016)

    const width = 300
    const height = 150
    const { renderer, target, dispose } = await createVerifiedRenderer(
      width,
      height,
    )

    try {
      const scene = new Scene()
      scene.add(new AmbientLight(0xffffff, 1.2))
      scene.add(new DirectionalLight(0xffffff, 1.0))

      const camera = new OrthographicCamera(-2.0, 2.0, 1.7, -0.1, 0.1, 10)
      camera.position.set(0, 0.8, 3)
      camera.lookAt(0, 0.8, 0)

      // モーフ無し統合 SkinnedMesh + アウトラインのみでキャッシュ共有（増加 0）を厳密に検証
      const morphMeshes: Mesh[] = []
      let nonMorphAtlasMeshCount = 0
      for (const avatar of [avatarLeft, avatarCenter, avatarRight]) {
        avatar.scene.traverse((obj) => {
          if (
            obj instanceof Mesh &&
            obj.material instanceof MToonAtlasNodeMaterial
          ) {
            if (Object.keys(obj.geometry.morphAttributes).length > 0) {
              morphMeshes.push(obj)
              obj.visible = false
            } else if (avatar === avatarLeft) {
              nonMorphAtlasMeshCount++
            }
          }
        })
      }
      expect(nonMorphAtlasMeshCount).toBeGreaterThan(0)

      scene.add(avatarLeft.scene)
      renderer.render(scene, camera)
      const cacheAfter1 = getNodeBuilderCacheSize(renderer)

      scene.add(avatarCenter.scene, avatarRight.scene)
      renderer.render(scene, camera)
      const cacheAfter3 = getNodeBuilderCacheSize(renderer)

      expect(cacheAfter3).toBe(cacheAfter1)

      // モーフ付きメッシュも表示して全メッシュ 3 体同時描画のピクセルを検証
      for (const mesh of morphMeshes) {
        mesh.visible = true
      }
      const pixels = await renderAndReadPixels(renderer, target, scene, camera)

      const leftStats = pixels.measureRegion(0, 0, 100, height)
      const centerStats = pixels.measureRegion(100, 0, 100, height)
      const rightStats = pixels.measureRegion(200, 0, 100, height)

      expect(leftStats.nonBlackCount).toBeGreaterThan(200)
      expect(centerStats.nonBlackCount).toBeGreaterThan(200)
      expect(rightStats.nonBlackCount).toBeGreaterThan(200)

      expect(centerStats.avgR).toBeGreaterThan(centerStats.avgB * 2)
      expect(rightStats.avgB).toBeGreaterThan(rightStats.avgR * 2)
    } finally {
      dispose()
    }
  })

  it('異なるバケットサイズ（8 / 16 / 最大 112 ≒ 16KB）が同一シーンに混在しても末尾スロットまで正しく描画される', async () => {
    const { renderer, target, dispose } = await createVerifiedRenderer(128, 128)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const matB8 = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: createMultiSlotParameterData(8, 7, [1, 0, 0]),
          slotCount: 8,
          texelsPerSlot: 9,
        },
      })
      const matB16 = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: createMultiSlotParameterData(16, 15, [0, 1, 0]),
          slotCount: 16,
          texelsPerSlot: 9,
        },
      })
      const matB112A = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: createMultiSlotParameterData(112, 111, [0, 0, 1]),
          slotCount: 112,
          texelsPerSlot: 9,
        },
      })
      const matB112B = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: createMultiSlotParameterData(112, 111, [1, 1, 0]),
          slotCount: 112,
          texelsPerSlot: 9,
        },
      })

      expect(matB8.parameterBucketSlots).toBe(8)
      expect(matB16.parameterBucketSlots).toBe(16)
      expect(matB112A.parameterBucketSlots).toBe(112)
      expect(matB112B.parameterBucketSlots).toBe(112)

      scene.add(
        new Mesh(createSingleSlotQuadGeometry(-0.5, 0.5, 1, 1, 7), matB8),
      )
      renderer.render(scene, camera)
      const cacheAfter8 = getNodeBuilderCacheSize(renderer)

      scene.add(
        new Mesh(createSingleSlotQuadGeometry(0.5, 0.5, 1, 1, 15), matB16),
      )
      renderer.render(scene, camera)
      const cacheAfter16 = getNodeBuilderCacheSize(renderer)

      scene.add(
        new Mesh(createSingleSlotQuadGeometry(-0.5, -0.5, 1, 1, 111), matB112A),
      )
      renderer.render(scene, camera)
      const cacheAfter112A = getNodeBuilderCacheSize(renderer)

      scene.add(
        new Mesh(createSingleSlotQuadGeometry(0.5, -0.5, 1, 1, 111), matB112B),
      )
      const pixels = await renderAndReadPixels(renderer, target, scene, camera)
      const cacheAfter112B = getNodeBuilderCacheSize(renderer)

      expect(cacheAfter16).toBe(cacheAfter8 + 1)
      expect(cacheAfter112A).toBe(cacheAfter16 + 1)
      expect(cacheAfter112B).toBe(cacheAfter112A)

      expectPixelMatchesRgb(pixels.at(32, 32), [1, 0, 0])
      expectPixelMatchesRgb(pixels.at(96, 32), [0, 1, 0])
      expectPixelMatchesRgb(pixels.at(32, 96), [0, 0, 1])
      expectPixelMatchesRgb(pixels.at(96, 96), [1, 1, 0])
    } finally {
      dispose()
    }
  })

  it('多数体（16 体）の連続描画と途中の退室（dispose）・再入室でも残存マテリアルの描画が壊れない', async () => {
    const width = 128
    const height = 128
    const { renderer, target, dispose } = await createVerifiedRenderer(
      width,
      height,
    )

    interface AvatarEntry {
      mesh: Mesh
      material: MToonAtlasNodeMaterial
      texture: DataTexture
      rgb: [number, number, number]
      px: number
      py: number
    }

    const createGridEntry = (
      col: number,
      row: number,
      rgb: [number, number, number],
    ): AvatarEntry => {
      const x = -0.75 + col * 0.5
      const y = 0.75 - row * 0.5
      const slot = (row * 4 + col) % 8
      const texture = createSolidTexture(255, 255, 255)
      const material = new MToonAtlasNodeMaterial({
        parameterBuffer: {
          data: createMultiSlotParameterData(8, slot, rgb),
          slotCount: 8,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: texture },
        },
      })
      const mesh = new Mesh(
        createSingleSlotQuadGeometry(x, y, 0.45, 0.45, slot),
        material,
      )
      return {
        mesh,
        material,
        texture,
        rgb,
        px: Math.floor((col + 0.5) * (width / 4)),
        py: Math.floor((row + 0.5) * (height / 4)),
      }
    }

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const entries: AvatarEntry[] = []
      for (let i = 0; i < 16; i++) {
        const col = i % 4
        const row = Math.floor(i / 4)
        entries.push(
          createGridEntry(col, row, GRID_PALETTE[i % GRID_PALETTE.length]),
        )
      }

      scene.add(entries[0].mesh)
      renderer.render(scene, camera)
      const cacheAfter1 = getNodeBuilderCacheSize(renderer)

      for (let i = 1; i < entries.length; i++) {
        scene.add(entries[i].mesh)
      }
      renderer.render(scene, camera)
      renderer.render(scene, camera)
      const pixelsBefore = await renderAndReadPixels(
        renderer,
        target,
        scene,
        camera,
      )
      const cacheAfter16 = getNodeBuilderCacheSize(renderer)

      expect(cacheAfter16).toBe(cacheAfter1)

      for (const entry of entries) {
        expectPixelMatchesRgb(pixelsBefore.at(entry.px, entry.py), entry.rgb)
      }

      // 奇数番（8 体）を退室・完全 dispose
      for (let i = 1; i < entries.length; i += 2) {
        const entry = entries[i]
        scene.remove(entry.mesh)
        entry.mesh.geometry.dispose()
        entry.material.dispose()
        entry.texture.dispose()
      }

      // 退室跡の 4 箇所に新しい色で再入室
      const rejoined: AvatarEntry[] = []
      for (const idx of [1, 5, 9, 13]) {
        const col = idx % 4
        const row = Math.floor(idx / 4)
        const nextRgb = GRID_PALETTE[(idx + 2) % GRID_PALETTE.length]
        const next = createGridEntry(col, row, nextRgb)
        rejoined.push(next)
        scene.add(next.mesh)
      }

      renderer.render(scene, camera)
      renderer.render(scene, camera)
      const pixelsAfter = await renderAndReadPixels(
        renderer,
        target,
        scene,
        camera,
      )

      expect(getNodeBuilderCacheSize(renderer)).toBe(cacheAfter1)

      for (let i = 0; i < entries.length; i += 2) {
        const entry = entries[i]
        expectPixelMatchesRgb(pixelsAfter.at(entry.px, entry.py), entry.rgb)
      }

      for (const entry of rejoined) {
        expectPixelMatchesRgb(pixelsAfter.at(entry.px, entry.py), entry.rgb)
      }

      for (const idx of [3, 7, 11, 15]) {
        const entry = entries[idx]
        const px = pixelsAfter.at(entry.px, entry.py)
        expect(px[0] + px[1] + px[2]).toBeLessThan(15)
      }
    } finally {
      dispose()
    }
  })
})

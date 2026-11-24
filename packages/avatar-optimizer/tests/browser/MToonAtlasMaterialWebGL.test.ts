/**
 * MToonAtlasMaterial（GLSL / WebGLRenderer 版）の実描画・複数体テスト
 *
 * WebGPURenderer 向けテスト（MToonAtlasNodeMaterialWebGPU.test.ts）と同等の観点で以下を検証する:
 * - 複数マテリアル間でシェーダープログラムを共有しつつ、各スロットとアトラステクスチャが混線しないこと
 * - アウトライン（worldCoordinates / screenCoordinates）が描画できること
 * - 実 VRM（AliciaSolid.vrm）の最適化 → 描画 → エクスポート → 再読込＆再描画が通ること
 * - 実 VRM 3 体の同時描画（異なる色・ポーズ）で混線しないこと
 * - 多数体（16 体）の連続描画＋途中退室（dispose）・再入室で残存描画が壊れないこと
 */

import { MToonAtlasMaterial } from '@webxr-jp/mtoon-atlas'
import {
  AmbientLight,
  DataTexture,
  DirectionalLight,
  Mesh,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM, loadVRM } from '../../src/io'
import {
  createMultiSlotParameterData,
  createParameterData,
  createParameterDataTexture,
  createSingleSlotQuadGeometry,
  createSolidTexture,
  createTwoSlotQuadGeometry,
  expectPixelMatchesRgb,
  GRID_PALETTE,
  measureRegionColor,
  sampleCanvasPixel,
} from './helpers/atlas-rendering'

/**
 * VRM 内の全 MToonAtlasMaterial のパラメータテクスチャの baseColor / shadeColor を指定 RGB へ差し替える
 */
function tintGLSLVRMParameterTextures(
  root: Scene | Mesh | { traverse: (cb: (obj: unknown) => void) => void },
  rgb: [number, number, number],
): void {
  const visited = new Set<MToonAtlasMaterial>()
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (!(mat instanceof MToonAtlasMaterial) || visited.has(mat)) continue
      visited.add(mat)
      const desc = mat.parameterTexture
      if (!desc) continue
      const image = desc.texture.image as { data?: Float32Array } | undefined
      if (!image?.data) continue

      const nextData = image.data.slice()
      for (let slot = 0; slot < desc.slotCount; slot++) {
        const base = slot * desc.texelsPerSlot * 4
        nextData[base + 0] = rgb[0]
        nextData[base + 1] = rgb[1]
        nextData[base + 2] = rgb[2]
        nextData[base + 4] = rgb[0]
        nextData[base + 5] = rgb[1]
        nextData[base + 6] = rgb[2]
      }
      const nextTexture = createParameterDataTexture(
        nextData,
        desc.slotCount,
        desc.texelsPerSlot,
      )
      mat.setParameterTexture({ ...desc, texture: nextTexture })
    }
  })
}

function getProgramCount(renderer: WebGLRenderer): number {
  return renderer.info.programs?.length ?? -1
}

describe('MToonAtlasMaterial with WebGLRenderer', () => {
  it('複数マテリアル間でシェーダープログラムを共有しつつ、各スロットが混線せず描画される', () => {
    const width = 128
    const height = 128
    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const dataA = createParameterData([1, 0, 0], [0, 1, 0])
      dataA[11] = 0
      dataA[9 * 4 + 11] = 0
      const matA = new MToonAtlasMaterial({
        parameterTexture: {
          texture: createParameterDataTexture(dataA, 2),
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 255, 255) },
        },
      })

      const dataB = createParameterData([0, 0, 1], [1, 1, 0])
      dataB[11] = 0
      dataB[9 * 4 + 11] = 0
      const matB = new MToonAtlasMaterial({
        parameterTexture: {
          texture: createParameterDataTexture(dataB, 2),
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 255, 255) },
        },
      })

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, 0.5, 2, 1), matA))
      renderer.render(scene, camera)
      const programsAfterA = getProgramCount(renderer)

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, -0.5, 2, 1), matB))
      renderer.render(scene, camera)
      const programsAfterB = getProgramCount(renderer)

      expect(programsAfterB).toBe(programsAfterA)

      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 32, 32),
        [1, 0, 0],
      )
      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 96, 32),
        [0, 1, 0],
      )
      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 32, 96),
        [0, 0, 1],
      )
      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 96, 96),
        [1, 1, 0],
      )
    } finally {
      renderer.dispose()
    }
  })

  it('別々のアトラステクスチャ（map）を持つマテリアル間でもシェーダー共有しつつテクスチャが切り替わる', () => {
    const width = 128
    const height = 128
    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new AmbientLight(0xffffff, Math.PI))

      const whiteA = createParameterData([1, 1, 1], [1, 1, 1])
      whiteA[11] = 0
      whiteA[9 * 4 + 11] = 0
      const whiteB = whiteA.slice()

      const matRedMap = new MToonAtlasMaterial({
        parameterTexture: {
          texture: createParameterDataTexture(whiteA, 2),
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(255, 0, 0) },
        },
      })
      const matBlueMap = new MToonAtlasMaterial({
        parameterTexture: {
          texture: createParameterDataTexture(whiteB, 2),
          slotCount: 2,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: createSolidTexture(0, 0, 255) },
        },
      })

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, 0.5, 2, 1), matRedMap))
      renderer.render(scene, camera)
      const programsAfterRed = getProgramCount(renderer)

      scene.add(new Mesh(createTwoSlotQuadGeometry(0, -0.5, 2, 1), matBlueMap))
      renderer.render(scene, camera)
      const programsAfterBlue = getProgramCount(renderer)

      expect(programsAfterBlue).toBe(programsAfterRed)

      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 64, 32),
        [1, 0, 0],
      )
      expectPixelMatchesRgb(
        sampleCanvasPixel(renderer.domElement, 64, 96),
        [0, 0, 1],
      )
    } finally {
      renderer.dispose()
    }
  })

  it('アウトライン（worldCoordinates / screenCoordinates）を描画できる', () => {
    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(64, 64)

    try {
      const scene = new Scene()
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      camera.position.z = 2
      scene.add(new DirectionalLight(0xffffff, 1))

      const data = createParameterData([1, 1, 1], [1, 1, 1], 0.05, [0, 1, 0])
      const body = new MToonAtlasMaterial({
        parameterTexture: {
          texture: createParameterDataTexture(data, 2),
          slotCount: 2,
          texelsPerSlot: 9,
        },
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

      renderer.render(scene, camera)

      expect(sampleCanvasPixel(renderer.domElement, 16, 32)[1]).toBeGreaterThan(
        180,
      )
      expect(sampleCanvasPixel(renderer.domElement, 48, 32)[1]).toBeGreaterThan(
        180,
      )
    } finally {
      renderer.dispose()
    }
  })

  it('実 VRM（AliciaSolid.vrm）の MToonMaterial 最適化 → WebGLRenderer 描画 → エクスポート → 再読込が通る', async () => {
    const response = await fetch('/AliciaSolid.vrm')
    const originalBuffer = await response.arrayBuffer()

    const loadResult = await loadVRM(originalBuffer)
    expect(loadResult.isOk()).toBe(true)
    const vrm = loadResult._unsafeUnwrap()

    const optResult = await optimizeModel(vrm)
    expect(optResult.isOk()).toBe(true)

    const optimizedMaterials: MToonAtlasMaterial[] = []
    vrm.scene.traverse((obj) => {
      if (obj instanceof Mesh && obj.material instanceof MToonAtlasMaterial) {
        optimizedMaterials.push(obj.material)
      }
    })
    expect(optimizedMaterials.length).toBeGreaterThan(0)
    for (const mat of optimizedMaterials) {
      expect(mat.parameterTexture).toBeDefined()
      expect(mat.parameterTexture!.slotCount).toBeGreaterThan(0)
    }

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
      ).toBeGreaterThan(200)

      const exportedResult = await exportVRM(vrm)
      expect(exportedResult.isOk()).toBe(true)
      const reloadedResult = await loadVRM(exportedResult._unsafeUnwrap())
      expect(reloadedResult.isOk()).toBe(true)
      const reloadedVrm = reloadedResult._unsafeUnwrap()

      scene.remove(vrm.scene)
      scene.add(reloadedVrm.scene)
      renderer.render(scene, camera)
      expect(
        measureRegionColor(renderer.domElement, 0, 0, 128, 128).nonBlackCount,
      ).toBeGreaterThan(200)
    } finally {
      renderer.dispose()
    }
  })

  it('複数体（実 VRM 3 体）を同時描画してもプログラムを共有し、各体の色とポーズが混線しない', async () => {
    const response = await fetch('/AliciaSolid.vrm')
    const originalBuffer = await response.arrayBuffer()

    const baseLoad = await loadVRM(originalBuffer)
    expect(baseLoad.isOk()).toBe(true)
    const baseVrm = baseLoad._unsafeUnwrap()

    const optResult = await optimizeModel(baseVrm)
    expect(optResult.isOk()).toBe(true)

    const exportedResult = await exportVRM(baseVrm)
    expect(exportedResult.isOk()).toBe(true)
    const optimizedGlb = exportedResult._unsafeUnwrap()

    const loadAvatar = async () => {
      const res = await loadVRM(optimizedGlb.slice(0))
      expect(res.isOk()).toBe(true)
      return res._unsafeUnwrap()
    }

    const avatarLeft = await loadAvatar()
    const avatarCenter = await loadAvatar()
    const avatarRight = await loadAvatar()

    avatarLeft.scene.position.set(-1.2, 0, 0)
    avatarCenter.scene.position.set(0, 0, 0)
    avatarRight.scene.position.set(1.2, 0, 0)

    tintGLSLVRMParameterTextures(avatarCenter.scene, [1.0, 0.15, 0.15])
    tintGLSLVRMParameterTextures(avatarRight.scene, [0.15, 0.15, 1.0])

    const leftUpperArm =
      avatarCenter.humanoid?.getNormalizedBoneNode('leftUpperArm')
    if (leftUpperArm) {
      leftUpperArm.rotation.z = 0.6
    }
    avatarCenter.update(0.016)

    const width = 300
    const height = 150
    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)

    try {
      const scene = new Scene()
      scene.add(new AmbientLight(0xffffff, 1.2))
      scene.add(new DirectionalLight(0xffffff, 1.0))

      const camera = new OrthographicCamera(-2.0, 2.0, 1.7, -0.1, 0.1, 10)
      camera.position.set(0, 0.8, 3)
      camera.lookAt(0, 0.8, 0)

      scene.add(avatarLeft.scene)
      renderer.render(scene, camera)
      const programsAfter1 = getProgramCount(renderer)

      scene.add(avatarCenter.scene, avatarRight.scene)
      renderer.render(scene, camera)
      const programsAfter3 = getProgramCount(renderer)

      // 3 体描いても GLSL シェーダープログラムは増えないこと
      expect(programsAfter3).toBe(programsAfter1)

      const leftStats = measureRegionColor(
        renderer.domElement,
        0,
        0,
        100,
        height,
      )
      const centerStats = measureRegionColor(
        renderer.domElement,
        100,
        0,
        100,
        height,
      )
      const rightStats = measureRegionColor(
        renderer.domElement,
        200,
        0,
        100,
        height,
      )

      expect(leftStats.nonBlackCount).toBeGreaterThan(200)
      expect(centerStats.nonBlackCount).toBeGreaterThan(200)
      expect(rightStats.nonBlackCount).toBeGreaterThan(200)

      expect(centerStats.avgR).toBeGreaterThan(centerStats.avgB * 2)
      expect(rightStats.avgB).toBeGreaterThan(rightStats.avgR * 2)
    } finally {
      renderer.dispose()
    }
  })

  it('多数体（16 体）の連続描画と途中の退室（dispose）・再入室でも残存マテリアルの描画が壊れない', () => {
    const width = 128
    const height = 128
    const renderer = new WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)

    interface AvatarEntry {
      mesh: Mesh
      material: MToonAtlasMaterial
      paramTexture: DataTexture
      atlasTexture: DataTexture
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
      const paramTexture = createParameterDataTexture(
        createMultiSlotParameterData(8, slot, rgb),
        8,
      )
      const atlasTexture = createSolidTexture(255, 255, 255)
      const material = new MToonAtlasMaterial({
        parameterTexture: {
          texture: paramTexture,
          slotCount: 8,
          texelsPerSlot: 9,
          atlasedTextures: { baseColor: atlasTexture },
        },
      })
      const mesh = new Mesh(
        createSingleSlotQuadGeometry(x, y, 0.45, 0.45, slot),
        material,
      )
      return {
        mesh,
        material,
        paramTexture,
        atlasTexture,
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
      const programsAfter1 = getProgramCount(renderer)

      for (let i = 1; i < entries.length; i++) {
        scene.add(entries[i].mesh)
      }
      for (let frame = 0; frame < 3; frame++) {
        renderer.render(scene, camera)
      }

      expect(getProgramCount(renderer)).toBe(programsAfter1)

      for (const entry of entries) {
        expectPixelMatchesRgb(
          sampleCanvasPixel(renderer.domElement, entry.px, entry.py),
          entry.rgb,
        )
      }

      // 奇数番（8 体）を退室・完全 dispose
      for (let i = 1; i < entries.length; i += 2) {
        const entry = entries[i]
        scene.remove(entry.mesh)
        entry.mesh.geometry.dispose()
        entry.material.dispose()
        entry.paramTexture.dispose()
        entry.atlasTexture.dispose()
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

      for (let frame = 0; frame < 3; frame++) {
        renderer.render(scene, camera)
      }

      expect(getProgramCount(renderer)).toBe(programsAfter1)

      for (let i = 0; i < entries.length; i += 2) {
        const entry = entries[i]
        expectPixelMatchesRgb(
          sampleCanvasPixel(renderer.domElement, entry.px, entry.py),
          entry.rgb,
        )
      }

      for (const entry of rejoined) {
        expectPixelMatchesRgb(
          sampleCanvasPixel(renderer.domElement, entry.px, entry.py),
          entry.rgb,
        )
      }

      for (const idx of [3, 7, 11, 15]) {
        const entry = entries[idx]
        const px = sampleCanvasPixel(renderer.domElement, entry.px, entry.py)
        expect(px[0] + px[1] + px[2]).toBeLessThan(15)
      }
    } finally {
      renderer.dispose()
    }
  })
})

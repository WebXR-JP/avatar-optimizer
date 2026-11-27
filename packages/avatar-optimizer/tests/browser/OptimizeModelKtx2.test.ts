/**
 * optimizeModel の KTX2 圧縮統合テスト（ブラウザ環境）
 *
 * - optimizeModel({ textureCompression }) でランタイムのアトラステクスチャが
 *   CompressedTexture に差し替わり、元 KTX2 バイナリもキャッシュされること
 * - colorSpace / minFilter / マジックヘッダーが正しく維持されること
 * - optimizeModel 直後に WebGLRenderer / WebGPURenderer で描画できること
 * - exportVRM(vrm)（textureCompression 指定なし）で KTX2 パススルー出力され、
 *   loadVRM() で再読み込み・再描画できること
 * - 後方互換として exportVRM(vrm, { textureCompression }) も引き続き動作すること
 * - ktx2Transcode: false ではテクスチャを差し替えず、記録した KTX2 が出力されること
 */

import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import {
  clearKtx2LoaderCache,
  DEFAULT_KTX2_TRANSCODER_PATH,
  getKtx2Source,
  getKtx2TranscoderPath,
  isCompressedTexture,
  MToonAtlasMaterial,
  setKtx2TranscoderPath,
} from '@webxr-jp/mtoon-atlas'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import {
  AmbientLight,
  DirectionalLight,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RenderTarget,
  Scene,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM, loadVRM } from '../../src/io'
import { measureRegionColor } from './helpers/atlas-rendering'

const KTX2_MAGIC = [
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]

const isNativeWebGPUMode =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_WEBGPU_NATIVE === 'true'

interface GlbJsonChunk {
  extensionsUsed?: string[]
  images?: Array<{ name?: string; mimeType?: string }>
}

function parseGlbJsonChunk(glb: ArrayBuffer): GlbJsonChunk {
  const view = new DataView(glb)
  // GLB header: magic(4) + version(4) + length(4) = 12 bytes
  const jsonChunkLength = view.getUint32(12, true)
  const jsonChunkType = view.getUint32(16, true)
  expect(jsonChunkType).toBe(0x4e4f534a) // 'JSON'
  const jsonBytes = new Uint8Array(glb, 20, jsonChunkLength)
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as GlbJsonChunk
}

function collectMToonAtlasMaterials(
  scene: Scene,
): Array<MToonAtlasMaterial | MToonAtlasNodeMaterial> {
  const materials = new Set<MToonAtlasMaterial | MToonAtlasNodeMaterial>()
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of mats) {
      if (mat && 'isMToonAtlasMaterial' in mat && mat.isMToonAtlasMaterial) {
        materials.add(mat as MToonAtlasMaterial | MToonAtlasNodeMaterial)
      }
    }
  })
  return [...materials]
}

function getAtlasedTexturesFromMaterial(
  material: MToonAtlasMaterial | MToonAtlasNodeMaterial,
): Record<string, Texture | undefined> {
  if (
    'parameterBuffer' in material &&
    material.parameterBuffer?.atlasedTextures
  ) {
    return material.parameterBuffer.atlasedTextures as Record<
      string,
      Texture | undefined
    >
  }
  if (material.parameterTexture?.atlasedTextures) {
    return material.parameterTexture.atlasedTextures as Record<
      string,
      Texture | undefined
    >
  }
  return {}
}

describe('optimizeModel KTX2 texture compression', () => {
  let prevTranscoderPath: string
  let aliciaBuffer: ArrayBuffer

  beforeAll(async () => {
    prevTranscoderPath = getKtx2TranscoderPath()
    clearKtx2LoaderCache()
    setKtx2TranscoderPath('/basis/')

    const response = await fetch('/AliciaSolid.vrm')
    aliciaBuffer = await response.arrayBuffer()
  })

  afterAll(() => {
    clearKtx2LoaderCache()
    setKtx2TranscoderPath(prevTranscoderPath || DEFAULT_KTX2_TRANSCODER_PATH)
  })

  it('optimizeModel 時にアトラステクスチャが CompressedTexture になり、キャッシュ・colorSpace・描画・無指定 exportVRM パススルーが成立する', async () => {
    const loadRes = await loadVRM(aliciaBuffer.slice(0))
    expect(loadRes.isOk()).toBe(true)
    const vrm = loadRes._unsafeUnwrap()

    const optRes = await optimizeModel(vrm, {
      atlas: { defaultResolution: 256 },
      textureCompression: {
        supercompression: true,
        generateMipmaps: false,
      },
    })
    expect(optRes.isOk()).toBe(true)

    const atlasMaterials = collectMToonAtlasMaterials(vrm.scene)
    expect(atlasMaterials.length).toBeGreaterThan(0)

    const srgbSlots = new Set([
      'baseColor',
      'shade',
      'emissive',
      'matcap',
      'rim',
    ])
    const linearSlots = new Set(['normal', 'shadingShift', 'uvAnimationMask'])

    for (const mat of atlasMaterials) {
      const atlased = getAtlasedTexturesFromMaterial(mat)
      expect(Object.keys(atlased).length).toBeGreaterThan(0)

      for (const [slot, tex] of Object.entries(atlased)) {
        if (!tex) continue

        // 1. GPU 向け CompressedTexture になっていること
        expect(isCompressedTexture(tex), `${slot} should be compressed`).toBe(
          true,
        )

        // 2. KTX2 マジックヘッダーを持つ元バイナリが detach されずにキャッシュされていること
        const ktx2Source = getKtx2Source(tex)
        expect(ktx2Source, `${slot} ktx2 source`).toBeDefined()
        expect(ktx2Source!.length).toBeGreaterThan(KTX2_MAGIC.length)
        expect(Array.from(ktx2Source!.subarray(0, 12))).toEqual(KTX2_MAGIC)

        // 3. DFD 由来の colorSpace が維持されていること
        if (srgbSlots.has(slot)) {
          expect(tex.colorSpace, `${slot} colorSpace`).toBe(SRGBColorSpace)
        } else if (linearSlots.has(slot)) {
          expect(tex.colorSpace, `${slot} colorSpace`).not.toBe(SRGBColorSpace)
        }

        // 4. generateMipmaps: false 指定時に LinearFilter が維持されていること
        expect(tex.minFilter, `${slot} minFilter`).toBe(LinearFilter)
      }
    }

    // 5. optimizeModel 直後に WebGLRenderer でそのまま描画できること
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

      // 6. exportVRM(vrm)（textureCompression 指定なし）で KTX2 パススルー出力されること
      const exportedResult = await exportVRM(vrm)
      expect(exportedResult.isOk()).toBe(true)
      const exportedGlb = exportedResult._unsafeUnwrap()

      const json = parseGlbJsonChunk(exportedGlb)
      expect(json.extensionsUsed).toContain('KHR_texture_basisu')
      expect(json.images?.some((img) => img.mimeType === 'image/ktx2')).toBe(
        true,
      )

      // 7. エクスポートした GLB を loadVRM() で再読み込みして再描画できること
      const reloadedResult = await loadVRM(exportedGlb.slice(0))
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

  it('後方互換: optimizeModel（圧縮なし）→ exportVRM({ textureCompression }) でも KTX2 が出力される', async () => {
    const loadRes = await loadVRM(aliciaBuffer.slice(0))
    expect(loadRes.isOk()).toBe(true)
    const vrm = loadRes._unsafeUnwrap()

    const optRes = await optimizeModel(vrm, {
      atlas: { defaultResolution: 256 },
    })
    expect(optRes.isOk()).toBe(true)

    const exportRes = await exportVRM(vrm, {
      textureCompression: { supercompression: true },
    })
    expect(exportRes.isOk()).toBe(true)
    const json = parseGlbJsonChunk(exportRes._unsafeUnwrap())
    expect(json.extensionsUsed).toContain('KHR_texture_basisu')
    expect(json.images?.some((img) => img.mimeType === 'image/ktx2')).toBe(true)
  })

  it('ktx2Transcode: false ではテクスチャを差し替えずに KTX2 を記録し、無指定 exportVRM で KTX2 が出力される', async () => {
    const loadRes = await loadVRM(aliciaBuffer.slice(0))
    expect(loadRes.isOk()).toBe(true)
    const vrm = loadRes._unsafeUnwrap()

    const optRes = await optimizeModel(vrm, {
      atlas: { defaultResolution: 256 },
      textureCompression: { supercompression: true, generateMipmaps: false },
      ktx2Transcode: false,
    })
    expect(optRes.isOk()).toBe(true)

    const atlasMaterials = collectMToonAtlasMaterials(vrm.scene)
    expect(atlasMaterials.length).toBeGreaterThan(0)
    for (const mat of atlasMaterials) {
      for (const [slot, tex] of Object.entries(
        getAtlasedTexturesFromMaterial(mat),
      )) {
        if (!tex) continue
        // メモリ上は非圧縮のまま、エンコード結果だけが記録されていること
        expect(isCompressedTexture(tex), `${slot} should stay raw`).toBe(false)
        const ktx2Source = getKtx2Source(tex)
        expect(ktx2Source, `${slot} ktx2 source`).toBeDefined()
        expect(Array.from(ktx2Source!.subarray(0, 12))).toEqual(KTX2_MAGIC)
      }
    }

    const exportRes = await exportVRM(vrm)
    expect(exportRes.isOk()).toBe(true)
    const exportedGlb = exportRes._unsafeUnwrap()
    const json = parseGlbJsonChunk(exportedGlb)
    expect(json.extensionsUsed).toContain('KHR_texture_basisu')
    expect(json.images?.some((img) => img.mimeType === 'image/ktx2')).toBe(true)

    const reloadedResult = await loadVRM(exportedGlb.slice(0))
    expect(reloadedResult.isOk()).toBe(true)
    const reloadedMaterials = collectMToonAtlasMaterials(
      reloadedResult._unsafeUnwrap().scene,
    )
    expect(
      reloadedMaterials.some((mat) =>
        Object.values(getAtlasedTexturesFromMaterial(mat)).some(
          (tex) => tex && isCompressedTexture(tex),
        ),
      ),
    ).toBe(true)
  })

  it('WebGPURenderer (MToonAtlasNodeMaterial) で optimizeModel 時 KTX2 圧縮→即時描画→無指定 exportVRM が通る', async () => {
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

      const optRes = await optimizeModel(vrm, {
        atlas: { defaultResolution: 256 },
        atlasMaterialType: MToonAtlasNodeMaterial,
        textureCompression: {
          supercompression: true,
          generateMipmaps: false,
        },
        ktx2Renderer: renderer,
      })
      expect(optRes.isOk()).toBe(true)

      const mats = collectMToonAtlasMaterials(vrm.scene)
      expect(mats.length).toBeGreaterThan(0)
      for (const mat of mats) {
        const atlased = getAtlasedTexturesFromMaterial(mat)
        for (const tex of Object.values(atlased)) {
          if (!tex) continue
          expect(isCompressedTexture(tex)).toBe(true)
          expect(getKtx2Source(tex)).toBeDefined()
        }
      }

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
      expect(nonBlackCount).toBeGreaterThan(200)

      // 無指定 exportVRM で KTX2 パススルー出力
      const exportRes = await exportVRM(vrm)
      expect(exportRes.isOk()).toBe(true)
      const json = parseGlbJsonChunk(exportRes._unsafeUnwrap())
      expect(json.extensionsUsed).toContain('KHR_texture_basisu')
      expect(json.images?.some((img) => img.mimeType === 'image/ktx2')).toBe(
        true,
      )
    } finally {
      renderer.setRenderTarget(null)
      target.dispose()
      renderer.dispose()
    }
  })
})

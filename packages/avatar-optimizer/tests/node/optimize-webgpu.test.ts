/**
 * Node + WebGPU（Dawn）でのアトラス合成と、loadVRM → optimizeModel → exportVRM の通し検証
 *
 * GPU アダプタが得られない環境（Vulkan ドライバの無い CI など）ではスキップする。
 * GPU が無くても lavapipe などのソフトウェア Vulkan があれば実行される。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DataTexture,
  RGBAFormat,
  Texture,
  UnsignedByteType,
  Vector2,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { afterAll, describe, expect, it } from 'vitest'
import { exportVRM, loadVRM, optimizeModel } from '../../src'
import { createNodeAtlasRenderer, installNodePolyfills } from '../../src/node'
import { composeImagesToAtlas } from '../../src/util/texture/composite'

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
)

/**
 * WebGPU レンダラーを用意する。dawn.node の読み込みやアダプタ取得に失敗した場合は null
 * （その場合このファイルのテストはスキップする）
 */
async function setupRenderer(): Promise<WebGPURenderer | null> {
  const webgpu = await import('webgpu').catch((error: unknown) => {
    console.warn('webgpu パッケージを読み込めないためスキップします:', error)
    return null
  })
  if (!webgpu) return null

  Object.assign(globalThis, webgpu.globals)
  installNodePolyfills()
  const result = await createNodeAtlasRenderer({ gpu: webgpu.create([]) })
  if (result.isErr()) {
    console.warn(`WebGPU を使えないためスキップします: ${result.error.message}`)
    return null
  }
  return result.value
}

const renderer = await setupRenderer()

afterAll(() => {
  renderer?.dispose()
})

function solid(r: number, g: number, b: number, a: number): DataTexture {
  const data = new Uint8Array(4 * 4 * 4)
  for (let i = 0; i < 16; i++) data.set([r, g, b, a], i * 4)
  const texture = new DataTexture(data, 4, 4, RGBAFormat, UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

function pixel(texture: Texture, x: number, y: number): number[] {
  const image = texture.image as { data: Uint8Array; width: number }
  const offset = (y * image.width + x) * 4
  return Array.from(image.data.subarray(offset, offset + 4))
}

function readVRM(name: string): ArrayBuffer {
  const bytes = fs.readFileSync(path.join(fixturesDir, name))
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** GLB の JSON チャンクを取り出す */
function readGlbJson(buffer: ArrayBuffer): {
  extensions?: Record<string, { meta?: { thumbnailImage?: number } }>
  extensionsUsed?: string[]
  images?: unknown[]
} {
  const view = new DataView(buffer)
  const jsonLength = view.getUint32(12, true)
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)),
  )
}

describe.runIf(renderer)('Node + WebGPU', () => {
  it('composeImagesToAtlas: WebGL 版と同じ行順（行 0 = v=0）で合成され、alpha=0 の RGB も保持される', async () => {
    const result = await composeImagesToAtlas(
      [
        // 下半分（v = 0〜0.5）: alpha=0 の色
        {
          image: solid(12, 34, 56, 0),
          uvTransform: {
            offset: new Vector2(0, 0),
            scale: new Vector2(1, 0.5),
          },
        },
        // 上半分（v = 0.5〜1）: 不透明の色
        {
          image: solid(78, 90, 123, 255),
          uvTransform: {
            offset: new Vector2(0, 0.5),
            scale: new Vector2(1, 0.5),
          },
        },
      ],
      { width: 8, height: 8, renderer: renderer! },
    )

    expect(result.isOk()).toBe(true)
    if (result.isErr()) return
    expect(pixel(result.value, 4, 1)).toEqual([12, 34, 56, 0])
    expect(pixel(result.value, 4, 6)).toEqual([78, 90, 123, 255])
    result.value.dispose()
  })

  it('composeImagesToAtlas: 渡したレンダラーのクリア色とレンダーターゲットを元に戻す', async () => {
    renderer!.setClearColor(0x336699, 0.5)
    const result = await composeImagesToAtlas(
      [
        {
          image: solid(1, 2, 3, 255),
          uvTransform: { offset: new Vector2(0, 0), scale: new Vector2(1, 1) },
        },
      ],
      { width: 4, height: 4, renderer: renderer! },
    )
    expect(result.isOk()).toBe(true)
    result.map((texture) => texture.dispose())

    expect(renderer!.getRenderTarget()).toBeNull()
    expect(renderer!.getClearAlpha()).toBe(0.5)
    expect(
      renderer!.getClearColor(new (await import('three')).Color()).getHex(),
    ).toBe(0x336699)
  })

  it.each([
    ['AliciaSolid.vrm（VRM 0.x）', 'AliciaSolid.vrm'],
    [
      'VRM1_Constraint_Twist_Sample.vrm（VRM 1.0）',
      'VRM1_Constraint_Twist_Sample.vrm',
    ],
  ])(
    '%s を読み込み → 最適化 → 書き出し → 読み直しできる',
    async (_label, file) => {
      const loaded = await loadVRM(readVRM(file))
      expect(loaded.isOk()).toBe(true)
      if (loaded.isErr()) return
      const vrm = loaded.value

      const optimized = await optimizeModel(vrm, {
        atlas: { defaultResolution: 512, renderer: renderer! },
      })
      expect(optimized.isOk()).toBe(true)
      if (optimized.isErr()) return
      expect(optimized.value.atlasSkipped).toBeUndefined()

      const exported = await exportVRM(vrm)
      expect(exported.isOk()).toBe(true)
      if (exported.isErr()) return

      const json = readGlbJson(exported.value)
      expect(json.extensionsUsed).toContain('XRIFT_mtoon_atlas')
      // サムネイル（VRM 0.x はテクスチャ経由、1.0 は createImageBitmap 経由）が失われない
      const thumbnailIndex = json.extensions?.VRMC_vrm?.meta?.thumbnailImage
      expect(thumbnailIndex).toBeTypeOf('number')
      expect(json.images?.[thumbnailIndex!]).toBeDefined()

      const reloaded = await loadVRM(exported.value)
      expect(reloaded.isOk()).toBe(true)
      if (reloaded.isErr()) return
      let meshCount = 0
      reloaded.value.scene.traverse((object) => {
        if ((object as { isMesh?: boolean }).isMesh) meshCount++
      })
      expect(meshCount).toBeGreaterThan(0)
    },
  )

  it('optimizeModel({ textureCompression, ktx2Transcode: false }) で KTX2Loader なしに圧縮でき、exportVRM が KTX2 を出力する', async () => {
    const loaded = await loadVRM(readVRM('AliciaSolid.vrm'))
    expect(loaded.isOk()).toBe(true)
    if (loaded.isErr()) return
    const vrm = loaded.value

    const optimized = await optimizeModel(vrm, {
      atlas: { defaultResolution: 256, renderer: renderer! },
      textureCompression: { supercompression: true, generateMipmaps: false },
      ktx2Transcode: false,
    })
    expect(
      optimized.isOk(),
      optimized.isErr() ? optimized.error.message : '',
    ).toBe(true)

    // textureCompression を指定しなくても記録済みの KTX2 がパススルー出力される
    const exported = await exportVRM(vrm)
    expect(exported.isOk()).toBe(true)
    if (exported.isErr()) return

    const json = readGlbJson(exported.value) as {
      extensionsUsed?: string[]
      images?: Array<{ mimeType?: string }>
    }
    expect(json.extensionsUsed).toContain('KHR_texture_basisu')
    expect(
      json.images?.filter((image) => image.mimeType === 'image/ktx2').length,
    ).toBeGreaterThan(0)
  })
})

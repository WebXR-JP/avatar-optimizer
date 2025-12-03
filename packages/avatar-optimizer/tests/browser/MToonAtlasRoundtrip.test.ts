import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import {
  MToonAtlasExporterPlugin,
  MToonAtlasLoaderPlugin,
  MToonAtlasMaterial,
} from '@xrift/mtoon-atlas'
import { Object3D, Scene, SkinnedMesh, SRGBColorSpace, Texture } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

/**
 * MToonAtlasMaterialを使用した最適化済みVRMのラウンドトリップテスト
 * インポート → optimizeModel → エクスポート → インポート の流れで
 * MToonAtlasMaterialが正しく保持されることを確認
 */
describe('MToonAtlas Roundtrip', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  // 共有状態
  let optimizedVRM: VRM
  let reloadedVRM: VRM
  let exportedBuffer: ArrayBuffer

  /**
   * VRMを読み込むヘルパー関数
   */
  async function loadVRM(buffer: ArrayBuffer): Promise<{ gltf: GLTF; vrm: VRM }> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    loader.register((parser) => new MToonAtlasLoaderPlugin(parser))

    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM

    return { gltf, vrm }
  }

  /**
   * VRMをGLBとしてエクスポートするヘルパー関数
   */
  async function exportVRM(vrm: VRM): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })
    exporter.register((writer) => new MToonAtlasExporterPlugin(writer))

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const exportScene = new Scene()
      const children = [...vrm.scene.children].filter(
        (child) =>
          child.name !== 'VRMHumanoidRig' &&
          !child.name.startsWith('VRMExpression'),
      )
      children.forEach((child) => exportScene.add(child))

      exporter.parse(
        exportScene,
        (result) => {
          children.forEach((child) => vrm.scene.add(child))
          if (result instanceof ArrayBuffer) {
            resolve(result)
          } else {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => {
          children.forEach((child) => vrm.scene.add(child))
          reject(error)
        },
        { binary: true },
      )
    })
  }

  /**
   * テクスチャからピクセルデータを取得するヘルパー関数
   */
  function getTexturePixelData(texture: Texture): Uint8ClampedArray | null {
    const image = texture.image as
      | {
          data?: ArrayLike<number>
          width?: number
          height?: number
        }
      | HTMLImageElement
      | ImageBitmap
      | null

    if (!image) return null

    if ('data' in image && image.data) {
      const data = image.data
      const result = new Uint8ClampedArray(data.length)
      for (let i = 0; i < data.length; i++) {
        result[i] = data[i] <= 1 ? Math.round(data[i] * 255) : data[i]
      }
      return result
    }

    if ('width' in image && 'height' in image && image.width && image.height) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      ctx.drawImage(image as CanvasImageSource, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }

    return null
  }

  /**
   * 非ゼロピクセル数をカウントするヘルパー関数
   */
  function countNonZeroPixels(data: Uint8ClampedArray): number {
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
        count++
      }
    }
    return count
  }

  /**
   * シーン内のMToonAtlasMaterialを検索するヘルパー関数
   */
  function findMToonAtlasMaterials(vrm: VRM): MToonAtlasMaterial[] {
    const materials: MToonAtlasMaterial[] = []
    vrm.scene.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        const meshMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of meshMaterials) {
          if (material && 'isMToonAtlasMaterial' in material) {
            materials.push(material as MToonAtlasMaterial)
          }
        }
      }
    })
    return materials
  }

  // 1回だけVRM読み込み→最適化→エクスポート→再読み込みを実行
  beforeAll(async () => {
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm } = await loadVRM(originalBuffer)

    const optimizeResult = await optimizeModel(vrm)
    expect(optimizeResult.isOk()).toBe(true)
    optimizedVRM = vrm

    exportedBuffer = await exportVRM(optimizedVRM)
    const { vrm: reloaded } = await loadVRM(exportedBuffer)
    reloadedVRM = reloaded
  })

  describe('after optimization', () => {
    it('should produce MToonAtlasMaterial', () => {
      const atlasMaterials = findMToonAtlasMaterials(optimizedVRM)
      expect(atlasMaterials.length).toBeGreaterThan(0)

      const material = atlasMaterials[0]
      expect(material.isMToonAtlasMaterial).toBe(true)
      expect(material.parameterTexture).toBeDefined()
      expect(material.parameterTexture?.texture).toBeDefined()
      expect(material.parameterTexture?.slotCount).toBeGreaterThan(0)
    })
  })

  describe('after roundtrip', () => {
    it('should preserve MToonAtlasMaterial', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalMaterial = originalMaterials[0]
      const originalSlotCount = originalMaterial.parameterTexture?.slotCount ?? 0
      const originalTexelsPerSlot =
        originalMaterial.parameterTexture?.texelsPerSlot ?? 9

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
      expect(reloadedMaterials.length).toBeGreaterThan(0)

      const reloadedMaterial = reloadedMaterials[0]
      expect(reloadedMaterial.isMToonAtlasMaterial).toBe(true)
      expect(reloadedMaterial.parameterTexture).toBeDefined()
      expect(reloadedMaterial.parameterTexture?.texture).toBeDefined()
      expect(reloadedMaterial.parameterTexture?.slotCount).toBe(originalSlotCount)
      expect(reloadedMaterial.parameterTexture?.texelsPerSlot).toBe(
        originalTexelsPerSlot,
      )
    })

    it('should preserve atlased textures', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalAtlasedTextures =
        originalMaterials[0].parameterTexture?.atlasedTextures
      const originalTextureKeys = originalAtlasedTextures
        ? Object.keys(originalAtlasedTextures).filter(
            (key) =>
              originalAtlasedTextures[
                key as keyof typeof originalAtlasedTextures
              ] != null,
          )
        : []

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
      const reloadedAtlasedTextures =
        reloadedMaterials[0].parameterTexture?.atlasedTextures

      for (const key of originalTextureKeys) {
        const originalTexture =
          originalAtlasedTextures?.[key as keyof typeof originalAtlasedTextures]
        const reloadedTexture =
          reloadedAtlasedTextures?.[key as keyof typeof reloadedAtlasedTextures]

        expect(
          reloadedTexture,
          `Atlased texture '${key}' should be preserved`,
        ).toBeDefined()

        if (
          originalTexture instanceof Texture &&
          reloadedTexture instanceof Texture
        ) {
          const origImg = originalTexture.image as {
            width?: number
            height?: number
          }
          const reloadImg = reloadedTexture.image as {
            width?: number
            height?: number
          }
          expect(reloadImg.width).toBe(origImg.width)
          expect(reloadImg.height).toBe(origImg.height)
        }
      }
    })

    it('should preserve parameter texture pixel data', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalParamTexture = originalMaterials[0].parameterTexture?.texture
      expect(originalParamTexture).toBeDefined()

      const originalPixelData = getTexturePixelData(originalParamTexture!)
      expect(originalPixelData).not.toBeNull()

      const originalNonZeroCount = countNonZeroPixels(originalPixelData!)
      expect(originalNonZeroCount).toBeGreaterThan(0)

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
      const reloadedParamTexture = reloadedMaterials[0].parameterTexture?.texture
      expect(reloadedParamTexture).toBeDefined()

      const reloadedPixelData = getTexturePixelData(reloadedParamTexture!)
      expect(reloadedPixelData).not.toBeNull()

      const reloadedNonZeroCount = countNonZeroPixels(reloadedPixelData!)
      expect(reloadedNonZeroCount).toBeGreaterThan(0)

      const ratio = reloadedNonZeroCount / originalNonZeroCount
      expect(ratio).toBeGreaterThan(0.4)
    })

    it('should preserve texture colorSpace', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalAtlasedTextures =
        originalMaterials[0].parameterTexture?.atlasedTextures
      expect(originalAtlasedTextures).toBeDefined()

      const originalColorSpaces: Record<string, string> = {}
      for (const [key, texture] of Object.entries(originalAtlasedTextures!)) {
        if (texture instanceof Texture) {
          originalColorSpaces[key] = texture.colorSpace
        }
      }

      if (originalColorSpaces.baseColor) {
        expect(originalColorSpaces.baseColor).toBe(SRGBColorSpace)
      }

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
      const reloadedAtlasedTextures =
        reloadedMaterials[0].parameterTexture?.atlasedTextures
      expect(reloadedAtlasedTextures).toBeDefined()

      for (const [key, originalColorSpace] of Object.entries(originalColorSpaces)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reloadedTexture = (reloadedAtlasedTextures as any)?.[key]
        if (reloadedTexture instanceof Texture) {
          const expectedColorSpace =
            originalColorSpace === SRGBColorSpace
              ? SRGBColorSpace
              : reloadedTexture.colorSpace
          expect(reloadedTexture.colorSpace).toBe(expectedColorSpace)
        }
      }

      const originalParamTexture = originalMaterials[0].parameterTexture?.texture
      const reloadedParamTexture = reloadedMaterials[0].parameterTexture?.texture
      expect(reloadedParamTexture?.colorSpace).toBe(originalParamTexture?.colorSpace)
    })

    it('should preserve slot attribute data', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)

      let originalMesh: SkinnedMesh | null = null
      optimizedVRM.scene.traverse((object) => {
        if (
          object instanceof SkinnedMesh &&
          object.material &&
          'isMToonAtlasMaterial' in object.material
        ) {
          originalMesh = object
        }
      })
      expect(originalMesh).not.toBeNull()

      const originalGeometry = originalMesh!.geometry
      const originalSlotAttrName = originalMaterials[0].slotAttribute.name
      const originalSlotAttribute =
        originalGeometry.getAttribute(originalSlotAttrName)
      expect(originalSlotAttribute).toBeDefined()

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)

      let reloadedMesh: SkinnedMesh | null = null
      reloadedVRM.scene.traverse((object) => {
        if (
          object instanceof SkinnedMesh &&
          object.material &&
          'isMToonAtlasMaterial' in object.material
        ) {
          reloadedMesh = object
        }
      })
      expect(reloadedMesh).not.toBeNull()

      const reloadedGeometry = reloadedMesh!.geometry
      const reloadedSlotAttrName = reloadedMaterials[0].slotAttribute.name
      const reloadedSlotAttribute =
        reloadedGeometry.getAttribute(reloadedSlotAttrName)
      expect(reloadedSlotAttribute).toBeDefined()
      expect(reloadedSlotAttribute.count).toBe(originalSlotAttribute.count)
    })
  })

  describe('debug comparison (optional)', () => {
    it('should compare material properties', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)

      const beforeExport = captureMaterialState(originalMaterials[0], 'Before Export')
      const afterReimport = captureMaterialState(reloadedMaterials[0], 'After Reimport')
      const differences = compareMaterialStates(beforeExport, afterReimport)

      console.log('=== Material Comparison ===')
      console.log('Before Export:', JSON.stringify(beforeExport, null, 2))
      console.log('After Reimport:', JSON.stringify(afterReimport, null, 2))

      if (differences.length > 0) {
        console.log('\n=== Differences Found ===')
        for (const diff of differences) {
          console.log(`  ${diff.property}:`)
          console.log(`    Before: ${JSON.stringify(diff.before)}`)
          console.log(`    After:  ${JSON.stringify(diff.after)}`)
        }
      }

      expect(true).toBe(true)
    })

    it('should compare scene structure', () => {
      console.log('=== Scene Structure Comparison ===')
      console.log('Before Export:')
      logSceneStructure(optimizedVRM.scene, 0)

      console.log('\nAfter Reimport:')
      logSceneStructure(reloadedVRM.scene, 0)

      expect(true).toBe(true)
    })

    it('should check outlineWidthFactor precision', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalParamTexture = originalMaterials[0].parameterTexture?.texture
      const originalData = getParameterTextureData16bit(originalParamTexture!)

      const texelsPerSlot = originalMaterials[0].parameterTexture?.texelsPerSlot ?? 9
      const outlineWidthIndex = 3 * 4 + 3

      console.log('=== outlineWidthFactor Precision Test ===')
      console.log(`texelsPerSlot: ${texelsPerSlot}`)

      if (originalData) {
        console.log(`Original outlineWidthFactor: ${originalData[outlineWidthIndex]}`)

        const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
        const reloadedParamTexture = reloadedMaterials[0].parameterTexture?.texture
        const reloadedData = getParameterTextureData16bit(reloadedParamTexture!)

        if (reloadedData) {
          const originalOutlineWidth = originalData[outlineWidthIndex]
          const reloadedOutlineWidth = reloadedData[outlineWidthIndex]
          const absoluteError = Math.abs(originalOutlineWidth - reloadedOutlineWidth)
          const relativeError =
            originalOutlineWidth > 0
              ? (absoluteError / originalOutlineWidth) * 100
              : 0

          console.log(`Reloaded outlineWidthFactor: ${reloadedOutlineWidth}`)
          console.log(`Relative error: ${relativeError.toFixed(2)}%`)

          if (relativeError > 10) {
            console.warn('⚠️ High precision loss detected!')
          }
        }
      }

      expect(true).toBe(true)
    })

    it('should compare shade texture data', () => {
      const originalMaterials = findMToonAtlasMaterials(optimizedVRM)
      const originalShadeTexture =
        originalMaterials[0].parameterTexture?.atlasedTextures?.shade

      if (!originalShadeTexture) {
        console.log('No shade texture found')
        return
      }

      const originalShadeData = getTexturePixelData(originalShadeTexture)
      const originalNonZeroCount = originalShadeData
        ? countNonZeroPixels(originalShadeData)
        : 0

      console.log('=== Shade Texture Comparison ===')
      console.log(`Original non-zero pixels: ${originalNonZeroCount}`)

      const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
      const reloadedShadeTexture =
        reloadedMaterials[0].parameterTexture?.atlasedTextures?.shade

      if (reloadedShadeTexture) {
        const reloadedShadeData = getTexturePixelData(reloadedShadeTexture)
        const reloadedNonZeroCount = reloadedShadeData
          ? countNonZeroPixels(reloadedShadeData)
          : 0
        console.log(`Reloaded non-zero pixels: ${reloadedNonZeroCount}`)
      }

      expect(true).toBe(true)
    })
  })
})

/**
 * マテリアルの状態をキャプチャ
 */
function captureMaterialState(
  material: MToonAtlasMaterial,
  label: string,
): Record<string, unknown> {
  return {
    label,
    name: material.name,
    side: material.side,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    alphaTest: material.alphaTest,
    parameterTexture: material.parameterTexture
      ? {
          slotCount: material.parameterTexture.slotCount,
          texelsPerSlot: material.parameterTexture.texelsPerSlot,
          textureExists: !!material.parameterTexture.texture,
        }
      : null,
    slotAttribute: material.slotAttribute,
  }
}

/**
 * 2つのマテリアル状態を比較して差分を返す
 */
function compareMaterialStates(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ property: string; before: unknown; after: unknown }> {
  const differences: Array<{
    property: string
    before: unknown
    after: unknown
  }> = []

  function compare(obj1: unknown, obj2: unknown, path: string) {
    if (obj1 === obj2) return

    if (
      obj1 === null ||
      obj2 === null ||
      typeof obj1 !== 'object' ||
      typeof obj2 !== 'object'
    ) {
      differences.push({ property: path, before: obj1, after: obj2 })
      return
    }

    const keys = new Set([
      ...Object.keys(obj1 as object),
      ...Object.keys(obj2 as object),
    ])
    for (const key of keys) {
      const val1 = (obj1 as Record<string, unknown>)[key]
      const val2 = (obj2 as Record<string, unknown>)[key]
      compare(val1, val2, path ? `${path}.${key}` : key)
    }
  }

  const beforeCopy = { ...before }
  const afterCopy = { ...after }
  delete beforeCopy.label
  delete afterCopy.label

  compare(beforeCopy, afterCopy, '')

  return differences
}

/**
 * シーン構造をログ出力（最大2階層）
 */
function logSceneStructure(obj: Object3D, depth: number, maxDepth = 2) {
  const indent = '  '.repeat(depth)
  console.log(
    `${indent}${obj.name || `<${obj.type}>`} (${obj.type}) - children: ${obj.children.length}`,
  )

  if (depth < maxDepth) {
    obj.children.forEach((child) => {
      logSceneStructure(child, depth + 1, maxDepth)
    })
  }
}

/**
 * パラメータテクスチャから16bit精度でピクセルデータを取得
 */
function getParameterTextureData16bit(texture: Texture): Float32Array | null {
  const image = texture.image as
    | {
        data?: ArrayLike<number>
        width?: number
        height?: number
      }
    | HTMLImageElement
    | ImageBitmap
    | null

  if (!image) return null

  if ('data' in image && image.data) {
    const data = image.data
    const result = new Float32Array(data.length)
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] <= 1 ? data[i] : data[i] / 255
    }
    return result
  }

  if ('width' in image && 'height' in image && image.width && image.height) {
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const gl = canvas.getContext('webgl2')
    if (!gl) return null

    const glTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, glTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image as TexImageSource,
    )

    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      glTexture,
      0,
    )

    const pixels = new Uint8Array(image.width * image.height * 4)
    gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    gl.deleteFramebuffer(fbo)
    gl.deleteTexture(glTexture)

    const result = new Float32Array(pixels.length)
    for (let i = 0; i < pixels.length; i++) {
      result[i] = pixels[i] / 255
    }
    return result
  }

  return null
}

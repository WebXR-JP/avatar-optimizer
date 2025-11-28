import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import {
  MToonAtlasExporterPlugin,
  MToonAtlasLoaderPlugin,
  MToonAtlasMaterial,
} from '@xrift/mtoon-atlas'
import { optimizeModel } from '../../src/avatar-optimizer'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'
import { SkinnedMesh, Texture } from 'three'

/**
 * MToonAtlasMaterialを使用した最適化済みVRMのラウンドトリップテスト
 * インポート → optimizeModel → エクスポート → インポート の流れで
 * MToonAtlasMaterialが正しく保持されることを確認
 */
describe('MToonAtlas Roundtrip', () =>
{
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  /**
   * VRMを読み込むヘルパー関数
   */
  async function loadVRM(buffer: ArrayBuffer): Promise<{ gltf: any; vrm: VRM }>
  {
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
  async function exportVRM(vrm: VRM): Promise<ArrayBuffer>
  {
    const exporter = new GLTFExporter()
    exporter.register((writer) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })
    exporter.register((writer) => new MToonAtlasExporterPlugin(writer))

    return new Promise<ArrayBuffer>((resolve, reject) =>
    {
      exporter.parse(
        vrm.scene,
        (result) =>
        {
          if (result instanceof ArrayBuffer)
          {
            resolve(result)
          } else
          {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => reject(error),
        { binary: true },
      )
    })
  }

/**
   * テクスチャからピクセルデータを取得するヘルパー関数
   */
  function getTexturePixelData(texture: Texture): Uint8ClampedArray | null
  {
    const image = texture.image as {
      data?: ArrayLike<number>
      width?: number
      height?: number
    } | HTMLImageElement | ImageBitmap | null

    if (!image) return null

    // DataTexture の場合は直接データを取得
    if ('data' in image && image.data)
    {
      // Float32Array や Uint8Array の可能性があるため Uint8ClampedArray に変換
      const data = image.data
      const result = new Uint8ClampedArray(data.length)
      for (let i = 0; i < data.length; i++)
      {
        // 浮動小数点の場合は 0-255 に変換
        result[i] = data[i] <= 1 ? Math.round(data[i] * 255) : data[i]
      }
      return result
    }

    // HTMLImageElement/ImageBitmap の場合は Canvas 経由で取得
    if ('width' in image && 'height' in image && image.width && image.height)
    {
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
  function countNonZeroPixels(data: Uint8ClampedArray): number
  {
    let count = 0
    // RGBA の 4 チャンネルずつ処理
    for (let i = 0; i < data.length; i += 4)
    {
      // RGB のいずれかが非ゼロならカウント（アルファは無視）
      if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0)
      {
        count++
      }
    }
    return count
  }

  /**
   * シーン内のMToonAtlasMaterialを検索するヘルパー関数
   */
  function findMToonAtlasMaterials(vrm: VRM): MToonAtlasMaterial[]
  {
    const materials: MToonAtlasMaterial[] = []
    vrm.scene.traverse((object) =>
    {
      if (object instanceof SkinnedMesh)
      {
        const meshMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of meshMaterials)
        {
          if (material && 'isMToonAtlasMaterial' in material)
          {
            materials.push(material as MToonAtlasMaterial)
          }
        }
      }
    })
    return materials
  }

  it('should produce MToonAtlasMaterial after optimization', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)
    expect(originalVRM).toBeDefined()

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. MToonAtlasMaterialが生成されていることを確認
    const atlasMaterials = findMToonAtlasMaterials(originalVRM)
    expect(atlasMaterials.length).toBeGreaterThan(0)

    // 4. 最初のMToonAtlasMaterialの構成を確認
    const material = atlasMaterials[0]
    expect(material.isMToonAtlasMaterial).toBe(true)
    expect(material.parameterTexture).toBeDefined()
    expect(material.parameterTexture?.texture).toBeDefined()
    expect(material.parameterTexture?.slotCount).toBeGreaterThan(0)
  })

  it('should preserve MToonAtlasMaterial after export and reimport', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)
    expect(originalVRM).toBeDefined()

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. 最適化後のMToonAtlasMaterialを取得
    const originalAtlasMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalAtlasMaterials.length).toBeGreaterThan(0)

    const originalMaterial = originalAtlasMaterials[0]
    const originalSlotCount = originalMaterial.parameterTexture?.slotCount ?? 0
    const originalTexelsPerSlot = originalMaterial.parameterTexture?.texelsPerSlot ?? 8

    // 4. GLBとしてエクスポート
    const exportedBuffer = await exportVRM(originalVRM)
    expect(exportedBuffer.byteLength).toBeGreaterThan(0)

    // 5. 再度読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)
    expect(reloadedVRM).toBeDefined()

    // 6. MToonAtlasMaterialが復元されていることを確認
    const reloadedAtlasMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedAtlasMaterials.length).toBeGreaterThan(0)

    // 7. マテリアルパラメータの整合性を確認
    const reloadedMaterial = reloadedAtlasMaterials[0]
    expect(reloadedMaterial.isMToonAtlasMaterial).toBe(true)
    expect(reloadedMaterial.parameterTexture).toBeDefined()
    expect(reloadedMaterial.parameterTexture?.texture).toBeDefined()
    expect(reloadedMaterial.parameterTexture?.slotCount).toBe(originalSlotCount)
    expect(reloadedMaterial.parameterTexture?.texelsPerSlot).toBe(originalTexelsPerSlot)
  })

  it('should preserve atlased textures after roundtrip', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. 最適化後のテクスチャ情報を取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    const originalAtlasedTextures = originalMaterials[0].parameterTexture?.atlasedTextures
    const originalTextureKeys = originalAtlasedTextures
      ? Object.keys(originalAtlasedTextures).filter(
        (key) => originalAtlasedTextures[key as keyof typeof originalAtlasedTextures] != null
      )
      : []

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のテクスチャ情報を確認
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    const reloadedAtlasedTextures = reloadedMaterials[0].parameterTexture?.atlasedTextures

    // 7. 各アトラステクスチャが復元されていることを確認
    for (const key of originalTextureKeys)
    {
      const originalTexture = originalAtlasedTextures?.[key as keyof typeof originalAtlasedTextures]
      const reloadedTexture = reloadedAtlasedTextures?.[key as keyof typeof reloadedAtlasedTextures]

      expect(reloadedTexture, `Atlased texture '${key}' should be preserved`).toBeDefined()

      // テクスチャサイズが一致することを確認
      if (originalTexture instanceof Texture && reloadedTexture instanceof Texture)
      {
        expect(reloadedTexture.image.width).toBe(originalTexture.image.width)
        expect(reloadedTexture.image.height).toBe(originalTexture.image.height)
      }
    }
  })

  it('should preserve parameter texture pixel data after roundtrip', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. 最適化後のパラメータテクスチャを取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    const originalParamTexture = originalMaterials[0].parameterTexture?.texture
    expect(originalParamTexture, 'Original parameter texture should exist').toBeDefined()

    // 元のパラメータテクスチャのピクセルデータを取得
    const originalPixelData = getTexturePixelData(originalParamTexture!)
    expect(originalPixelData, 'Should be able to read original texture data').not.toBeNull()

    // 元のテクスチャが真っ黒でないことを確認
    const originalNonZeroCount = countNonZeroPixels(originalPixelData!)
    expect(originalNonZeroCount, 'Original parameter texture should not be all black').toBeGreaterThan(0)

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のパラメータテクスチャを確認
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    const reloadedParamTexture = reloadedMaterials[0].parameterTexture?.texture
    expect(reloadedParamTexture, 'Reloaded parameter texture should exist').toBeDefined()

    // 再読み込み後のピクセルデータを取得
    const reloadedPixelData = getTexturePixelData(reloadedParamTexture!)
    expect(reloadedPixelData, 'Should be able to read reloaded texture data').not.toBeNull()

    // 再読み込み後のテクスチャが真っ黒でないことを確認
    const reloadedNonZeroCount = countNonZeroPixels(reloadedPixelData!)
    expect(
      reloadedNonZeroCount,
      `Reloaded parameter texture should not be all black (original had ${originalNonZeroCount} non-zero pixels)`,
    ).toBeGreaterThan(0)

    // 非ゼロピクセル数が概ね一致することを確認（完全一致でなくても良い）
    const ratio = reloadedNonZeroCount / originalNonZeroCount
    expect(
      ratio,
      `Non-zero pixel count ratio should be close to 1.0 (got ${ratio})`,
    ).toBeGreaterThan(0.9)
  })

  it('should preserve slot attribute data after roundtrip', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. 最適化後のスロット属性情報を取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    // 統合されたメッシュを見つける
    let originalMesh: SkinnedMesh | null = null
    originalVRM.scene.traverse((object) =>
    {
      if (
        object instanceof SkinnedMesh &&
        object.material &&
        'isMToonAtlasMaterial' in object.material
      )
      {
        originalMesh = object
      }
    })
    expect(originalMesh).not.toBeNull()

    // 元のスロット属性を取得
    const originalGeometry = originalMesh!.geometry
    const originalSlotAttrName = originalMaterials[0].slotAttribute.name
    const originalSlotAttribute = originalGeometry.getAttribute(originalSlotAttrName)
    expect(originalSlotAttribute, 'Original slot attribute should exist').toBeDefined()

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のスロット属性を確認
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    let reloadedMesh: SkinnedMesh | null = null
    reloadedVRM.scene.traverse((object) =>
    {
      if (
        object instanceof SkinnedMesh &&
        object.material &&
        'isMToonAtlasMaterial' in object.material
      )
      {
        reloadedMesh = object
      }
    })
    expect(reloadedMesh).not.toBeNull()

    // 再読み込み後のスロット属性を取得
    // GLTFLoader は custom attribute を小文字に変換するため注意
    const reloadedGeometry = reloadedMesh!.geometry
    const reloadedSlotAttrName = reloadedMaterials[0].slotAttribute.name
    const reloadedSlotAttribute = reloadedGeometry.getAttribute(reloadedSlotAttrName)
    expect(reloadedSlotAttribute, `Slot attribute '${reloadedSlotAttrName}' should exist after reload`).toBeDefined()

    // スロット属性のサイズが一致することを確認
    expect(reloadedSlotAttribute.count).toBe(originalSlotAttribute.count)
  })
})

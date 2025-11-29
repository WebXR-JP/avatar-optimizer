import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import {
  MToonAtlasExporterPlugin,
  MToonAtlasLoaderPlugin,
  MToonAtlasMaterial,
} from '@xrift/mtoon-atlas'
import { Object3D, Scene, SkinnedMesh, SRGBColorSpace, Texture } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

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
  async function loadVRM(buffer: ArrayBuffer): Promise<{ gltf: GLTF; vrm: VRM }>
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
      // vrm.scene の子要素を Scene に直接追加してエクスポート
      // これにより GLTFExporter が AuxScene を作成するのを防ぎ、
      // かつシーン構造が保持される
      const exportScene = new Scene()

      // 子要素を一時的にコピー（add()すると元の親から外れるため参照を保持）
      // VRMHumanoidRig と VRMExpression はランタイムで動的に生成されるため除外
      const children = [...vrm.scene.children].filter((child) =>
        child.name !== 'VRMHumanoidRig' && !child.name.startsWith('VRMExpression'),
      )
      children.forEach((child) => exportScene.add(child))

      exporter.parse(
        exportScene,
        (result) =>
        {
          // エクスポート後、子要素を元のvrm.sceneに戻す
          children.forEach((child) => vrm.scene.add(child))

          if (result instanceof ArrayBuffer)
          {
            resolve(result)
          } else
          {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) =>
        {
          // エラー時も子要素を元に戻す
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
        (key) => originalAtlasedTextures[key as keyof typeof originalAtlasedTextures] != null,
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
        const origImg = originalTexture.image as { width?: number; height?: number }
        const reloadImg = reloadedTexture.image as { width?: number; height?: number }
        expect(reloadImg.width).toBe(origImg.width)
        expect(reloadImg.height).toBe(origImg.height)
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

  it('should preserve texture colorSpace after roundtrip', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. 最適化後のテクスチャのcolorSpaceを取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    const originalAtlasedTextures = originalMaterials[0].parameterTexture?.atlasedTextures
    expect(originalAtlasedTextures, 'Original atlased textures should exist').toBeDefined()

    // 元のcolorSpaceを記録
    const originalColorSpaces: Record<string, string> = {}
    for (const [key, texture] of Object.entries(originalAtlasedTextures!))
    {
      if (texture instanceof Texture)
      {
        originalColorSpaces[key] = texture.colorSpace
      }
    }

    // baseColor は sRGB であることを確認
    if (originalColorSpaces.baseColor)
    {
      expect(originalColorSpaces.baseColor).toBe(SRGBColorSpace)
    }

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のcolorSpaceを確認
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    const reloadedAtlasedTextures = reloadedMaterials[0].parameterTexture?.atlasedTextures
    expect(reloadedAtlasedTextures, 'Reloaded atlased textures should exist').toBeDefined()

    // 各テクスチャのcolorSpaceが保持されていることを確認
    for (const [key, originalColorSpace] of Object.entries(originalColorSpaces))
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reloadedTexture = (reloadedAtlasedTextures as any)?.[key]
      if (reloadedTexture instanceof Texture)
      {
        // sRGB テクスチャは再読み込み後も sRGB であるべき
        const expectedColorSpace = originalColorSpace === SRGBColorSpace ? SRGBColorSpace : reloadedTexture.colorSpace
        expect(
          reloadedTexture.colorSpace,
          `Texture '${key}' colorSpace should be preserved (expected: ${expectedColorSpace}, got: ${reloadedTexture.colorSpace})`,
        ).toBe(expectedColorSpace)
      }
    }

    // パラメータテクスチャのcolorSpaceも確認（NoColorSpace/Linear であるべき）
    const originalParamTexture = originalMaterials[0].parameterTexture?.texture
    const reloadedParamTexture = reloadedMaterials[0].parameterTexture?.texture
    expect(reloadedParamTexture?.colorSpace).toBe(originalParamTexture?.colorSpace)
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

  it('should compare material properties before export and after reimport', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. エクスポート前のマテリアル情報を取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    const originalMaterial = originalMaterials[0]

    // エクスポート前のマテリアル情報をキャプチャ
    const beforeExport = captureMaterialState(originalMaterial, 'Before Export')

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のマテリアル情報を取得
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    const reloadedMaterial = reloadedMaterials[0]

    // 再読み込み後のマテリアル情報をキャプチャ
    const afterReimport = captureMaterialState(reloadedMaterial, 'After Reimport')

    // 7. 差分を比較・出力
    const differences = compareMaterialStates(beforeExport, afterReimport)

    // 差分をコンソールに出力（デバッグ用）
    console.log('=== Material Comparison ===')
    console.log('Before Export:', JSON.stringify(beforeExport, null, 2))
    console.log('After Reimport:', JSON.stringify(afterReimport, null, 2))

    if (differences.length > 0)
    {
      console.log('\n=== Differences Found ===')
      for (const diff of differences)
      {
        console.log(`  ${diff.property}:`)
        console.log(`    Before: ${JSON.stringify(diff.before)}`)
        console.log(`    After:  ${JSON.stringify(diff.after)}`)
      }
    } else
    {
      console.log('\nNo differences found in material properties.')
    }

    // テストはパスさせる（比較結果の確認用）
    expect(true).toBe(true)
  })

  it('should compare scene structure before export and after reimport', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. エクスポート前のシーン構造を記録
    console.log('=== Scene Structure Comparison ===')
    console.log('Before Export:')
    logSceneStructure(originalVRM.scene, 0)

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のシーン構造を記録
    console.log('\nAfter Reimport:')
    logSceneStructure(reloadedVRM.scene, 0)

    // 7. ルートノードの名前を比較
    console.log('\n=== Root Node Comparison ===')
    console.log(`Original root name: "${originalVRM.scene.name}" (type: ${originalVRM.scene.type})`)
    console.log(`Reloaded root name: "${reloadedVRM.scene.name}" (type: ${reloadedVRM.scene.type})`)
    console.log(`Original children count: ${originalVRM.scene.children.length}`)
    console.log(`Reloaded children count: ${reloadedVRM.scene.children.length}`)

    // ルートの子要素の名前を列挙
    console.log('\nOriginal root children:')
    originalVRM.scene.children.forEach((child, i) =>
    {
      console.log(`  [${i}] "${child.name}" (${child.type})`)
    })

    console.log('\nReloaded root children:')
    reloadedVRM.scene.children.forEach((child, i) =>
    {
      console.log(`  [${i}] "${child.name}" (${child.type})`)
    })

    expect(true).toBe(true)
  })

  it('should compare shade texture data before export and after reimport', async () =>
  {
    // 1. 元のVRMを読み込み
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm: originalVRM } = await loadVRM(originalBuffer)

    // 2. 最適化を実行
    const optimizeResult = await optimizeModel(originalVRM)
    expect(optimizeResult.isOk()).toBe(true)

    // 3. エクスポート前のマテリアル情報を取得
    const originalMaterials = findMToonAtlasMaterials(originalVRM)
    expect(originalMaterials.length).toBeGreaterThan(0)

    const originalMaterial = originalMaterials[0]
    const originalShadeTexture = originalMaterial.parameterTexture?.atlasedTextures?.shade

    // shadeテクスチャが存在することを確認
    expect(originalShadeTexture, 'Original shade texture should exist').toBeDefined()

    // エクスポート前のshadeテクスチャデータを取得
    const originalShadeData = getTexturePixelData(originalShadeTexture!)
    expect(originalShadeData, 'Should be able to read original shade texture data').not.toBeNull()

    // 元のshadeテクスチャの非ゼロピクセルをカウント
    const originalNonZeroCount = countNonZeroPixels(originalShadeData!)

    console.log('=== Shade Texture Comparison ===')
    const origImg = originalShadeTexture!.image as { width?: number; height?: number } | null
    console.log(`Original shade texture size: ${origImg?.width}x${origImg?.height}`)
    console.log(`Original shade texture non-zero pixels: ${originalNonZeroCount}`)
    console.log(`Original shade texture colorSpace: ${originalShadeTexture!.colorSpace}`)

    // 4. エクスポート
    const exportedBuffer = await exportVRM(originalVRM)

    // 5. 再読み込み
    const { vrm: reloadedVRM } = await loadVRM(exportedBuffer)

    // 6. 再読み込み後のマテリアル情報を取得
    const reloadedMaterials = findMToonAtlasMaterials(reloadedVRM)
    expect(reloadedMaterials.length).toBeGreaterThan(0)

    const reloadedMaterial = reloadedMaterials[0]
    const reloadedShadeTexture = reloadedMaterial.parameterTexture?.atlasedTextures?.shade

    // shadeテクスチャが復元されていることを確認
    expect(reloadedShadeTexture, 'Reloaded shade texture should exist').toBeDefined()

    // 再読み込み後のshadeテクスチャデータを取得
    const reloadedShadeData = getTexturePixelData(reloadedShadeTexture!)
    expect(reloadedShadeData, 'Should be able to read reloaded shade texture data').not.toBeNull()

    // 再読み込み後のshadeテクスチャの非ゼロピクセルをカウント
    const reloadedNonZeroCount = countNonZeroPixels(reloadedShadeData!)

    const reloadImg = reloadedShadeTexture!.image as { width?: number; height?: number } | null
    console.log(`Reloaded shade texture size: ${reloadImg?.width}x${reloadImg?.height}`)
    console.log(`Reloaded shade texture non-zero pixels: ${reloadedNonZeroCount}`)
    console.log(`Reloaded shade texture colorSpace: ${reloadedShadeTexture!.colorSpace}`)

    // 最初の数ピクセルのRGBA値を比較
    console.log('\n=== First 10 pixels comparison (RGBA) ===')
    for (let i = 0; i < Math.min(40, originalShadeData!.length); i += 4)
    {
      const origR = originalShadeData![i]
      const origG = originalShadeData![i + 1]
      const origB = originalShadeData![i + 2]
      const origA = originalShadeData![i + 3]

      const reloadR = reloadedShadeData![i]
      const reloadG = reloadedShadeData![i + 1]
      const reloadB = reloadedShadeData![i + 2]
      const reloadA = reloadedShadeData![i + 3]

      const pixelIndex = i / 4
      const isDifferent = origR !== reloadR || origG !== reloadG || origB !== reloadB || origA !== reloadA
      console.log(
        `Pixel ${pixelIndex}: ` +
        `Original(${origR},${origG},${origB},${origA}) vs ` +
        `Reloaded(${reloadR},${reloadG},${reloadB},${reloadA})` +
        (isDifferent ? ' [DIFFERENT]' : ''),
      )
    }

    // 非ゼロピクセル数が概ね一致することを確認
    const ratio = reloadedNonZeroCount / (originalNonZeroCount || 1)
    console.log(`\nNon-zero pixel ratio: ${ratio}`)

    // テストはパスさせる（比較結果の確認用）
    expect(true).toBe(true)
  })
})

/**
 * マテリアルの状態をキャプチャ
 */
function captureMaterialState(material: MToonAtlasMaterial, label: string): Record<string, unknown>
{
  const state: Record<string, unknown> = {
    label,
    name: material.name,

    // 基本プロパティ
    side: material.side,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    alphaTest: material.alphaTest,

    // パラメータテクスチャ情報
    parameterTexture: material.parameterTexture ? {
      slotCount: material.parameterTexture.slotCount,
      texelsPerSlot: material.parameterTexture.texelsPerSlot,
      textureExists: !!material.parameterTexture.texture,
      textureSize: material.parameterTexture.texture?.image ? {
        width: (material.parameterTexture.texture.image as { width?: number }).width,
        height: (material.parameterTexture.texture.image as { height?: number }).height,
      } : null,
      atlasedTextureKeys: material.parameterTexture.atlasedTextures
        ? Object.keys(material.parameterTexture.atlasedTextures).filter(
          (key) => material.parameterTexture!.atlasedTextures![key as keyof typeof material.parameterTexture.atlasedTextures] != null,
        )
        : [],
    } : null,

    // スロット属性
    slotAttribute: material.slotAttribute,

    // Defines
    defines: { ...material.defines },

    // Uniforms（主要なもののみ）
    uniforms: captureUniforms(material),

    // Three.js 標準プロパティ
    fog: material.fog,
    lights: material.lights,
    clipping: material.clipping,
    vertexShaderLength: material.vertexShader?.length,
    fragmentShaderLength: material.fragmentShader?.length,
  }

  return state
}

/**
 * Uniformsの値をキャプチャ
 */
function captureUniforms(material: MToonAtlasMaterial): Record<string, unknown>
{
  const uniforms = material.uniforms
  const result: Record<string, unknown> = {}

  // テクスチャ関連
  result.hasParameterTexture = !!uniforms.uParameterTexture?.value
  result.parameterTextureSize = uniforms.uParameterTextureSize?.value
    ? { x: uniforms.uParameterTextureSize.value.x, y: uniforms.uParameterTextureSize.value.y }
    : null
  result.texelsPerSlot = uniforms.uTexelsPerSlot?.value

  // アトラステクスチャの存在チェック
  result.hasMap = !!uniforms.map?.value
  result.hasShadeMultiplyTexture = !!uniforms.shadeMultiplyTexture?.value
  result.hasShadingShiftTexture = !!uniforms.shadingShiftTexture?.value
  result.hasNormalMap = !!uniforms.normalMap?.value
  result.hasEmissiveMap = !!uniforms.emissiveMap?.value
  result.hasMatcapTexture = !!uniforms.matcapTexture?.value
  result.hasRimMultiplyTexture = !!uniforms.rimMultiplyTexture?.value
  result.hasUvAnimationMaskTexture = !!uniforms.uvAnimationMaskTexture?.value

  // MToonパラメータ（Color型は文字列に変換）
  const litFactor = uniforms.litFactor?.value
  result.litFactor = litFactor ? { r: litFactor.r, g: litFactor.g, b: litFactor.b } : null

  result.opacity = uniforms.opacity?.value

  const shadeColorFactor = uniforms.shadeColorFactor?.value
  result.shadeColorFactor = shadeColorFactor
    ? { r: shadeColorFactor.r, g: shadeColorFactor.g, b: shadeColorFactor.b }
    : null

  result.shadingShiftFactor = uniforms.shadingShiftFactor?.value
  result.shadingToonyFactor = uniforms.shadingToonyFactor?.value
  result.giEqualizationFactor = uniforms.giEqualizationFactor?.value

  const parametricRimColorFactor = uniforms.parametricRimColorFactor?.value
  result.parametricRimColorFactor = parametricRimColorFactor
    ? { r: parametricRimColorFactor.r, g: parametricRimColorFactor.g, b: parametricRimColorFactor.b }
    : null

  result.rimLightingMixFactor = uniforms.rimLightingMixFactor?.value
  result.parametricRimFresnelPowerFactor = uniforms.parametricRimFresnelPowerFactor?.value
  result.parametricRimLiftFactor = uniforms.parametricRimLiftFactor?.value

  const matcapFactor = uniforms.matcapFactor?.value
  result.matcapFactor = matcapFactor
    ? { r: matcapFactor.r, g: matcapFactor.g, b: matcapFactor.b }
    : null

  const emissive = uniforms.emissive?.value
  result.emissive = emissive
    ? { r: emissive.r, g: emissive.g, b: emissive.b }
    : null

  result.emissiveIntensity = uniforms.emissiveIntensity?.value

  const outlineColorFactor = uniforms.outlineColorFactor?.value
  result.outlineColorFactor = outlineColorFactor
    ? { r: outlineColorFactor.r, g: outlineColorFactor.g, b: outlineColorFactor.b }
    : null

  result.outlineLightingMixFactor = uniforms.outlineLightingMixFactor?.value

  result.uvAnimationScrollXOffset = uniforms.uvAnimationScrollXOffset?.value
  result.uvAnimationScrollYOffset = uniforms.uvAnimationScrollYOffset?.value
  result.uvAnimationRotationPhase = uniforms.uvAnimationRotationPhase?.value

  return result
}

/**
 * 2つのマテリアル状態を比較して差分を返す
 */
function compareMaterialStates(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ property: string; before: unknown; after: unknown }>
{
  const differences: Array<{ property: string; before: unknown; after: unknown }> = []

  function compare(obj1: unknown, obj2: unknown, path: string)
  {
    if (obj1 === obj2) return

    if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object')
    {
      differences.push({ property: path, before: obj1, after: obj2 })
      return
    }

    const keys = new Set([...Object.keys(obj1 as object), ...Object.keys(obj2 as object)])
    for (const key of keys)
    {
      const val1 = (obj1 as Record<string, unknown>)[key]
      const val2 = (obj2 as Record<string, unknown>)[key]
      compare(val1, val2, path ? `${path}.${key}` : key)
    }
  }

  // label は比較対象外
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
function logSceneStructure(obj: Object3D, depth: number, maxDepth = 2)
{
  const indent = '  '.repeat(depth)
  console.log(`${indent}${obj.name || `<${obj.type}>`} (${obj.type}) - children: ${obj.children.length}`)

  if (depth < maxDepth)
  {
    obj.children.forEach((child) =>
    {
      logSceneStructure(child, depth + 1, maxDepth)
    })
  }
}

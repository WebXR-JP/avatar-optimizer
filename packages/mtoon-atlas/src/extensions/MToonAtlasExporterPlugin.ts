import { Mesh, Object3D, Texture } from 'three'
import { encode as encodePng16 } from 'fast-png'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import
{
  GLTFWriter,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
  OutlineWidthMode,
} from './types'

/**
 * テクスチャインデックス情報
 * beforeParseで画像処理を開始し、afterParseで解決されたインデックスを使用
 */
interface TextureIndexInfo
{
  parameterTextureIndex: number
  atlasedTextureIndices: Record<string, number>
}

/**
 * 解決待ちのテクスチャインデックス情報（beforeParse時点）
 */
interface PendingTextureIndexInfo
{
  parameterTextureIndex: Promise<number> | null
  atlasedTextureIndices: Record<string, Promise<number>>
}

/**
 * GLTFExporter用のMToonAtlasエクスポートプラグイン
 *
 * GLTFExporterはShaderMaterialをサポートしないため、
 * beforeParseでテクスチャを処理し、afterParseでマテリアル定義をJSONに追加します。
 */
export class MToonAtlasExporterPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private writer: GLTFWriter

  // MToonAtlasMaterialを持つメッシュのマップ（SkinnedMeshと通常のMesh両方対応）
  private mtoonAtlasMeshes: Map<Mesh, MToonAtlasMaterial[]> = new Map()

  // beforeParseで処理されたテクスチャインデックス（解決済み）
  private textureIndices: Map<MToonAtlasMaterial, TextureIndexInfo> = new Map()

  // beforeParseで処理中のテクスチャインデックス（Promise）
  private pendingTextureIndices: Map<MToonAtlasMaterial, PendingTextureIndexInfo> = new Map()

  constructor(writer: GLTFWriter)
  {
    this.writer = writer
  }

  /**
   * beforeParseでシーン内のMToonAtlasMaterialを収集し、テクスチャを処理
   */
  public beforeParse(input: Object3D | Object3D[])
  {
    this.mtoonAtlasMeshes.clear()
    this.textureIndices.clear()
    this.pendingTextureIndices.clear()
    const roots = Array.isArray(input) ? input : [input]

    for (const root of roots)
    {
      root.traverse((obj) =>
      {
        // SkinnedMeshと通常のMesh両方を対象にする
        if (obj instanceof Mesh)
        {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          const mtoonMaterials: MToonAtlasMaterial[] = []

          for (const material of materials)
          {
            if (material && 'isMToonAtlasMaterial' in material)
            {
              mtoonMaterials.push(material as MToonAtlasMaterial)
            }
          }

          if (mtoonMaterials.length > 0)
          {
            this.mtoonAtlasMeshes.set(obj, mtoonMaterials)

            // テクスチャを事前に処理（非同期）
            for (const material of mtoonMaterials)
            {
              if (!this.pendingTextureIndices.has(material))
              {
                this.processTexturesForMaterial(material)
              }
            }
          }
        }
      })
    }
  }

  /**
   * マテリアルのテクスチャを処理してインデックスを保存
   * 非同期でBINチャンクに書き込み、完了後にtextureIndicesに格納
   */
  private processTexturesForMaterial(material: MToonAtlasMaterial)
  {
    const pendingIndices: PendingTextureIndexInfo = {
      parameterTextureIndex: null,
      atlasedTextureIndices: {},
    }

    // パラメータテクスチャを処理
    // パラメータテクスチャはRGBA全チャンネルにパラメータデータが格納されているため
    // Canvas 2D経由ではなくfast-pngで直接PNGエンコードする（Premultiplied Alpha問題回避）
    if (material.parameterTexture?.texture)
    {
      pendingIndices.parameterTextureIndex = this.processParameterTexture(
        material.parameterTexture.texture
      )
    }

    // アトラス化テクスチャを処理
    const atlasedTextures = material.parameterTexture?.atlasedTextures
    if (atlasedTextures)
    {
      for (const [key, texture] of Object.entries(atlasedTextures))
      {
        if (texture)
        {
          pendingIndices.atlasedTextureIndices[key] = this.processTextureWithFallback(texture)
        }
      }
    }

    this.pendingTextureIndices.set(material, pendingIndices)

    // 全てのPromiseを解決してtextureIndicesに格納
    const allPromises: Promise<void>[] = []

    if (pendingIndices.parameterTextureIndex)
    {
      allPromises.push(pendingIndices.parameterTextureIndex.then(() => { }))
    }

    for (const promise of Object.values(pendingIndices.atlasedTextureIndices))
    {
      allPromises.push(promise.then(() => { }))
    }

    // 全て解決後にtextureIndicesに格納し、マテリアル定義も更新するPromise
    const resolveAllPromise = Promise.all(allPromises).then(async () =>
    {
      const resolvedIndices: TextureIndexInfo = {
        parameterTextureIndex: pendingIndices.parameterTextureIndex
          ? await pendingIndices.parameterTextureIndex
          : -1,
        atlasedTextureIndices: {},
      }

      for (const [key, promise] of Object.entries(pendingIndices.atlasedTextureIndices))
      {
        resolvedIndices.atlasedTextureIndices[key] = await promise
      }

      this.textureIndices.set(material, resolvedIndices)
    })

    this.writer.pending.push(resolveAllPromise)
  }

  /**
   * パラメータテクスチャを処理（BINチャンクに書き込み）
   * Canvas 2DのPremultiplied Alpha問題を回避するため、
   * 生のRGBAデータから直接PNGを生成してBINチャンクに格納
   */
  private processParameterTexture(texture: Texture): Promise<number>
  {
    const json = this.writer.json
    json.textures = json.textures || []
    json.images = json.images || []
    json.samplers = json.samplers || []

    // パラメータテクスチャ用サンプラー（Nearest Filter）
    let nearestSamplerIndex = json.samplers.findIndex(
      (s: any) => s.magFilter === 9728 && s.minFilter === 9728
    )
    if (nearestSamplerIndex === -1)
    {
      nearestSamplerIndex = json.samplers.length
      json.samplers.push({
        magFilter: 9728, // NEAREST
        minFilter: 9728, // NEAREST
        wrapS: 33071, // CLAMP_TO_EDGE
        wrapT: 33071, // CLAMP_TO_EDGE
      })
    }

    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'parameterTexture',
      mimeType: 'image/png',
    }
    json.images.push(imageDef)

    // テクスチャ定義を先に追加（インデックスを確定）
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: nearestSamplerIndex,
      source: imageIndex,
      name: texture.name || 'parameterTexture',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any
    if (image?.data && image.width && image.height)
    {
      // DataTextureの生データから16bit PNGをエンコード（精度向上）
      const srcData = image.data
      const isFloatData = srcData instanceof Float32Array ||
        srcData.constructor?.name === 'Float32Array'
      const pixelCount = image.width * image.height * 4
      // 16bit PNG用にUint16Arrayを使用
      const uint16Data = new Uint16Array(pixelCount)

      for (let i = 0; i < pixelCount; i++)
      {
        const value = srcData[i]
        // Float32Array (0.0-1.0) の場合は 65535 を掛ける（16bit精度）
        // Uint8Array (0-255) の場合は 257 を掛けて16bitに変換
        uint16Data[i] = isFloatData
          ? Math.round(Math.min(1, Math.max(0, value)) * 65535)
          : value * 257
      }

      // fast-pngで16bit PNGエンコード（Premultiplied Alpha問題を回避、精度向上）
      const pngData = encodePng16({
        width: image.width,
        height: image.height,
        depth: 16,
        channels: 4,
        data: uint16Data,
      })

      // BlobからBINチャンクに書き込む
      const blob = new Blob([pngData.buffer as ArrayBuffer], { type: 'image/png' })
      const bufferViewPromise = this.writer.processBufferViewImage(blob)
        .then(bufferViewIndex =>
        {
          imageDef.bufferView = bufferViewIndex
          return textureIndex
        })

      // pendingに追加して完了を待つ
      this.writer.pending.push(bufferViewPromise.then(() => { }))
      return bufferViewPromise
    } else
    {
      console.warn('MToonAtlasExporterPlugin: Parameter texture has no valid data')
      // 1x1透明画像をBINチャンクに書き込む
      const placeholder = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
      ])
      const blob = new Blob([placeholder], { type: 'image/png' })
      const bufferViewPromise = this.writer.processBufferViewImage(blob)
        .then(bufferViewIndex =>
        {
          imageDef.bufferView = bufferViewIndex
          return textureIndex
        })

      this.writer.pending.push(bufferViewPromise.then(() => { }))
      return bufferViewPromise
    }
  }

/**
   * テクスチャを処理してBINチャンクに書き込む
   * @param texture - 処理するテクスチャ
   */
  private processTextureWithFallback(texture: Texture): Promise<number>
  {
    // processTextureが使える場合はそれを使用（同期的に成功する場合）
    if (typeof this.writer.processTexture === 'function')
    {
      try
      {
        const index = this.writer.processTexture(texture)
        return Promise.resolve(index)
      } catch
      {
        // フォールバック処理へ
      }
    }

    // 直接JSONにテクスチャを追加してBINチャンクに書き込む
    const json = this.writer.json
    json.textures = json.textures || []
    json.images = json.images || []
    json.samplers = json.samplers || []

    // デフォルトサンプラーを追加（なければ）
    if (json.samplers.length === 0)
    {
      json.samplers.push({
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      })
    }

    // 画像定義を先に追加（インデックスを確定）
    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'texture',
      mimeType: 'image/png',
    }
    json.images.push(imageDef)

    // テクスチャ定義を先に追加
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: 0,
      source: imageIndex,
      name: texture.name || 'texture',
    })

    // テクスチャのソースを取得
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any
    const blobPromise = this.imageToBlobAsync(image)

    const bufferViewPromise = blobPromise
      .then(blob => this.writer.processBufferViewImage(blob))
      .then(bufferViewIndex =>
      {
        imageDef.bufferView = bufferViewIndex
        return textureIndex
      })

    // pendingに追加して完了を待つ
    this.writer.pending.push(bufferViewPromise.then(() => { }))
    return bufferViewPromise
  }

  /**
   * 画像をBlobに変換する（非同期）
   */
  private async imageToBlobAsync(image: any): Promise<Blob>
  {
    if (!image)
    {
      console.warn('MToonAtlasExporterPlugin: Texture has no image, using placeholder')
      return this.createPlaceholderBlob()
    }

    // CanvasからBlob
    if (image instanceof HTMLCanvasElement)
    {
      return new Promise((resolve) =>
      {
        image.toBlob((blob) =>
        {
          resolve(blob || this.createPlaceholderBlob())
        }, 'image/png')
      })
    }

    // ImageBitmap/HTMLImageElementからBlob
    if (image instanceof ImageBitmap || image instanceof HTMLImageElement)
    {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (ctx)
      {
        ctx.drawImage(image, 0, 0)
        return new Promise((resolve) =>
        {
          canvas.toBlob((blob) =>
          {
            resolve(blob || this.createPlaceholderBlob())
          }, 'image/png')
        })
      }
    }

    // DataTexture（image.data）からBlob
    if (image.data && image.width && image.height)
    {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (ctx)
      {
        const srcData = image.data
        const isFloatData = srcData instanceof Float32Array ||
          srcData.constructor?.name === 'Float32Array'
        const pixelCount = image.width * image.height * 4
        const uint8Data = new Uint8ClampedArray(pixelCount)

        for (let i = 0; i < pixelCount; i++)
        {
          const value = srcData[i]
          uint8Data[i] = isFloatData
            ? Math.round(Math.min(1, Math.max(0, value)) * 255)
            : value
        }

        const imageData = new ImageData(uint8Data, image.width, image.height)
        ctx.putImageData(imageData, 0, 0)

        return new Promise((resolve) =>
        {
          canvas.toBlob((blob) =>
          {
            resolve(blob || this.createPlaceholderBlob())
          }, 'image/png')
        })
      }
    }

    // toDataURL対応オブジェクト
    if (typeof image.toDataURL === 'function')
    {
      const dataUrl: string = image.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++)
      {
        bytes[i] = binary.charCodeAt(i)
      }
      return new Blob([bytes], { type: 'image/png' })
    }

    console.warn('MToonAtlasExporterPlugin: Could not convert texture image, using placeholder')
    return this.createPlaceholderBlob()
  }

  /**
   * 1x1透明プレースホルダーBlob作成
   */
  private createPlaceholderBlob(): Blob
  {
    const placeholder = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82,
    ])
    return new Blob([placeholder], { type: 'image/png' })
  }

  /**
   * afterParseでマテリアルとメッシュのプリミティブ属性をJSONに追加
   *
   * GLTFExporterはShaderMaterialをスキップするため、
   * ここで手動でマテリアル定義を追加します。
   *
   * 注: テクスチャ処理のPromiseはwriter.pendingに追加済みなので、
   * afterParse完了後にGLTFExporterがawait Promise.all(pending)で待機する。
   * マテリアル定義内のテクスチャインデックスは、pendingのPromise内で更新される。
   */
  public afterParse(_input: Object3D | Object3D[])
  {
    if (this.mtoonAtlasMeshes.size === 0) return

    const json = this.writer.json

    // マテリアルの処理
    // マテリアルごとにインデックスを記録
    const materialIndexMap = new Map<MToonAtlasMaterial, number>()
    // マテリアル定義とマテリアルの対応を保存（後でテクスチャインデックスを更新するため）
    const materialDefMap = new Map<MToonAtlasMaterial, any>()

    for (const [mesh, materials] of this.mtoonAtlasMeshes)
    {
      for (const material of materials)
      {
        if (materialIndexMap.has(material)) continue

        // マテリアル定義を作成（テクスチャインデックスは後で更新される）
        const materialDef = this.createMaterialDef(material)

        // マテリアル配列に追加
        json.materials = json.materials || []
        const materialIndex = json.materials.length
        json.materials.push(materialDef)
        materialIndexMap.set(material, materialIndex)
        materialDefMap.set(material, materialDef)
      }

      // メッシュのプリミティブにマテリアルとスロット属性を設定
      this.updateMeshPrimitive(mesh, materials, materialIndexMap)
    }

    // extensionsUsedに追加
    json.extensionsUsed = json.extensionsUsed || []
    if (!json.extensionsUsed.includes(MTOON_ATLAS_EXTENSION_NAME))
    {
      json.extensionsUsed.push(MTOON_ATLAS_EXTENSION_NAME)
    }

    // テクスチャ処理完了後にマテリアル定義のインデックスを更新するPromiseをpendingに追加
    const updateMaterialDefsPromise = this.waitForAllTextureIndices().then(() =>
    {
      for (const [material, materialDef] of materialDefMap)
      {
        const indices = this.textureIndices.get(material)
        if (indices)
        {
          const extension = materialDef.extensions[MTOON_ATLAS_EXTENSION_NAME]
          if (extension.parameterTexture)
          {
            extension.parameterTexture.index = indices.parameterTextureIndex
          }
          for (const [key, index] of Object.entries(indices.atlasedTextureIndices))
          {
            extension.atlasedTextures[key] = { index }
          }
        }
      }
    })

    this.writer.pending.push(updateMaterialDefsPromise)
  }

  /**
   * 全てのテクスチャインデックスが解決されるのを待つ
   */
  private async waitForAllTextureIndices(): Promise<void>
  {
    const allPromises: Promise<void>[] = []

    for (const pending of this.pendingTextureIndices.values())
    {
      if (pending.parameterTextureIndex)
      {
        allPromises.push(pending.parameterTextureIndex.then(() => { }))
      }
      for (const promise of Object.values(pending.atlasedTextureIndices))
      {
        allPromises.push(promise.then(() => { }))
      }
    }

    await Promise.all(allPromises)
  }

  /**
   * MToonAtlasMaterialからGLTFマテリアル定義を作成
   */
  private createMaterialDef(material: MToonAtlasMaterial): any
  {
    const indices = this.textureIndices.get(material)

    const extension: MToonAtlasExtensionSchema = {
      version: '1.0',
      parameterTexture: {
        index: indices?.parameterTextureIndex ?? -1,
        texelsPerSlot: material.parameterTexture?.texelsPerSlot ?? 9,
        slotCount: material.parameterTexture?.slotCount ?? 0,
      },
      slotAttributeName: '_MTOON_MATERIAL_SLOT',
      atlasedTextures: {},
    }

    // アウトライン関連のプロパティを設定
    if (material.isOutline)
    {
      extension.isOutline = true
    }
    if (material.outlineWidthMode && material.outlineWidthMode !== 'none')
    {
      extension.outlineWidthMode = material.outlineWidthMode as OutlineWidthMode
    }

    // アトラス化テクスチャのインデックスを設定
    if (indices?.atlasedTextureIndices)
    {
      for (const [key, index] of Object.entries(indices.atlasedTextureIndices))
      {
        ; (extension.atlasedTextures as any)[key] = { index }
      }
    }

    // マテリアル定義を構築
    const materialDef: any = {
      name: material.name || 'MToonAtlasMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: material.side === 2, // THREE.DoubleSide
      extensions: {
        [MTOON_ATLAS_EXTENSION_NAME]: extension,
      },
    }

    // アルファモードの設定
    if (material.transparent)
    {
      materialDef.alphaMode = 'BLEND'
    } else if (material.alphaTest > 0)
    {
      materialDef.alphaMode = 'MASK'
      materialDef.alphaCutoff = material.alphaTest
    }

    return materialDef
  }

  /**
   * メッシュのプリミティブにマテリアルとスロット属性を設定
   */
  private updateMeshPrimitive(
    mesh: Mesh,
    materials: MToonAtlasMaterial[],
    materialIndexMap: Map<MToonAtlasMaterial, number>
  )
  {
    const json = this.writer.json

    // メッシュのノードインデックスを取得
    const nodeIndex = this.writer.nodeMap?.get(mesh)
    if (nodeIndex === undefined) return

    const nodeDef = json.nodes?.[nodeIndex]
    if (!nodeDef || nodeDef.mesh === undefined) return

    const meshDef = json.meshes?.[nodeDef.mesh]
    if (!meshDef?.primitives) return

    // マテリアルを設定
    const material = materials[0] // 単一マテリアルを仮定
    const materialIndex = materialIndexMap.get(material)
    if (materialIndex === undefined) return

    for (const primitive of meshDef.primitives)
    {
      primitive.material = materialIndex

      // スロット属性を追加
      const attributeName = material.slotAttribute?.name || 'mtoonMaterialSlot'
      const attribute = mesh.geometry.getAttribute(attributeName)

      if (attribute)
      {
        // processAccessorもafterParseでは使えない場合があるので直接処理
        this.addSlotAttribute(primitive, mesh, attributeName)
      }
    }
  }

  /**
   * スロット属性をプリミティブに追加
   */
  private addSlotAttribute(primitive: any, mesh: Mesh, attributeName: string)
  {
    const attribute = mesh.geometry.getAttribute(attributeName)
    if (!attribute) return

    // processAccessorが使える場合はそれを使用
    if (typeof this.writer.processAccessor === 'function')
    {
      try
      {
        const accessorIndex = this.writer.processAccessor(attribute, mesh.geometry)
        primitive.attributes['_MTOON_MATERIAL_SLOT'] = accessorIndex
        return
      } catch
      {
        // フォールバック処理
      }
    }

    // 直接JSONにアクセサを追加
    const json = this.writer.json
    json.accessors = json.accessors || []
    json.bufferViews = json.bufferViews || []
    json.buffers = json.buffers || []

    // バッファデータを取得
    const array = attribute.array
    const byteArray = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)

    // Base64エンコード
    let binary = ''
    for (let i = 0; i < byteArray.length; i++)
    {
      binary += String.fromCharCode(byteArray[i])
    }
    const base64 = btoa(binary)
    const dataUri = `data:application/octet-stream;base64,${base64}`

    // バッファを追加
    const bufferIndex = json.buffers.length
    json.buffers.push({
      uri: dataUri,
      byteLength: byteArray.byteLength,
    })

    // バッファビューを追加
    const bufferViewIndex = json.bufferViews.length
    json.bufferViews.push({
      buffer: bufferIndex,
      byteOffset: 0,
      byteLength: byteArray.byteLength,
    })

    // アクセサを追加
    const accessorIndex = json.accessors.length
    json.accessors.push({
      bufferView: bufferViewIndex,
      componentType: 5126, // FLOAT
      count: attribute.count,
      type: 'SCALAR',
    })

    primitive.attributes['_MTOON_MATERIAL_SLOT'] = accessorIndex
  }

}

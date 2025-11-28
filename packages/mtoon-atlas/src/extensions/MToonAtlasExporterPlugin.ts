import { Material, Mesh, Object3D, SkinnedMesh, Texture } from 'three'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import
{
  GLTFWriter,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
} from './types'

/**
 * テクスチャインデックス情報
 */
interface TextureIndexInfo
{
  parameterTextureIndex: number
  atlasedTextureIndices: Record<string, number>
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

  // MToonAtlasMaterialを持つメッシュのマップ
  private mtoonAtlasMeshes: Map<SkinnedMesh, MToonAtlasMaterial[]> = new Map()

  // beforeParseで処理されたテクスチャインデックス
  private textureIndices: Map<MToonAtlasMaterial, TextureIndexInfo> = new Map()

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
    const roots = Array.isArray(input) ? input : [input]

    for (const root of roots)
    {
      root.traverse((obj) =>
      {
        if (obj instanceof SkinnedMesh)
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

            // テクスチャを事前に処理
            for (const material of mtoonMaterials)
            {
              if (!this.textureIndices.has(material))
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
   */
  private processTexturesForMaterial(material: MToonAtlasMaterial)
  {
    const indices: TextureIndexInfo = {
      parameterTextureIndex: -1,
      atlasedTextureIndices: {},
    }

    // パラメータテクスチャを処理
    if (material.parameterTexture?.texture)
    {
      indices.parameterTextureIndex = this.processTextureWithFallback(
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
          indices.atlasedTextureIndices[key] = this.processTextureWithFallback(texture)
        }
      }
    }

    this.textureIndices.set(material, indices)
  }

  /**
   * テクスチャを処理（processTextureが使えない場合は直接JSONに追加）
   */
  private processTextureWithFallback(texture: Texture): number
  {
    // processTextureが使える場合はそれを使用
    if (typeof this.writer.processTexture === 'function')
    {
      try
      {
        return this.writer.processTexture(texture)
      } catch
      {
        // フォールバック処理
      }
    }

    // 直接JSONにテクスチャを追加
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

    // 画像を追加
    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'texture',
    }

    // テクスチャのソースを取得
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any
    if (image)
    {
      // 様々な画像ソースタイプに対応
      let dataUrl: string | null = null

      if (image instanceof HTMLCanvasElement)
      {
        // Canvasの場合は直接toDataURLを呼び出し
        dataUrl = image.toDataURL('image/png')
      } else if (image instanceof ImageBitmap || image instanceof HTMLImageElement)
      {
        // ImageBitmap/HTMLImageElementの場合はCanvasに描画
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        if (ctx)
        {
          ctx.drawImage(image, 0, 0)
          dataUrl = canvas.toDataURL('image/png')
        }
      } else if (image.data && image.width && image.height)
      {
        // ImageDataライクなオブジェクト（例：DataTexture）
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')
        if (ctx)
        {
          // RGBA データを ImageData に変換
          const imageData = new ImageData(
            new Uint8ClampedArray(image.data),
            image.width,
            image.height
          )
          ctx.putImageData(imageData, 0, 0)
          dataUrl = canvas.toDataURL('image/png')
        }
      } else if (typeof image.toDataURL === 'function')
      {
        dataUrl = image.toDataURL('image/png')
      }

      if (dataUrl)
      {
        imageDef.uri = dataUrl
      } else
      {
        // フォールバック: 1x1透明画像
        console.warn('MToonAtlasExporterPlugin: Could not convert texture image to data URL, using placeholder')
        imageDef.uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      }
    } else
    {
      // 画像がない場合は1x1透明画像を使用
      console.warn('MToonAtlasExporterPlugin: Texture has no image, using placeholder')
      imageDef.uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }

    json.images.push(imageDef)

    // テクスチャを追加
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: 0,
      source: imageIndex,
      name: texture.name || 'texture',
    })

    return textureIndex
  }

  /**
   * afterParseでマテリアルとメッシュのプリミティブ属性をJSONに追加
   *
   * GLTFExporterはShaderMaterialをスキップするため、
   * ここで手動でマテリアル定義を追加します。
   */
  public afterParse(_input: Object3D | Object3D[])
  {
    if (this.mtoonAtlasMeshes.size === 0) return

    const json = this.writer.json

    // マテリアルの処理
    // マテリアルごとにインデックスを記録
    const materialIndexMap = new Map<MToonAtlasMaterial, number>()

    for (const [mesh, materials] of this.mtoonAtlasMeshes)
    {
      for (const material of materials)
      {
        if (materialIndexMap.has(material)) continue

        // マテリアル定義を作成（事前処理されたテクスチャインデックスを使用）
        const materialDef = this.createMaterialDef(material)

        // マテリアル配列に追加
        json.materials = json.materials || []
        const materialIndex = json.materials.length
        json.materials.push(materialDef)
        materialIndexMap.set(material, materialIndex)
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
        texelsPerSlot: material.parameterTexture?.texelsPerSlot ?? 8,
        slotCount: material.parameterTexture?.slotCount ?? 0,
      },
      slotAttributeName: '_MTOON_MATERIAL_SLOT',
      atlasedTextures: {},
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
    mesh: SkinnedMesh,
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
  private addSlotAttribute(primitive: any, mesh: SkinnedMesh, attributeName: string)
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

  // writeMaterialはGLTFExporterがShaderMaterialをスキップするため呼ばれない
  // 代わりにafterParseで処理
  public writeMaterial(_material: Material, _materialDef: any)
  {
    // This method is not called for ShaderMaterial
    // Processing is done in afterParse instead
  }

  // writeMeshも同様にafterParseで処理
  public writeMesh(_mesh: Mesh, _meshDef: any)
  {
    // This method may not be called correctly for ShaderMaterial meshes
    // Processing is done in afterParse instead
  }
}

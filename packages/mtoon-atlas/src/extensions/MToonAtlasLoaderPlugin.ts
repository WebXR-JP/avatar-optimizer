import { Material, Texture, SRGBColorSpace, NoColorSpace, DoubleSide, FrontSide, NearestFilter, DataTexture, FloatType, RGBAFormat } from 'three'
import { decode as decodePng } from 'fast-png'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import
{
  GLTFParser,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
} from './types'

export class MToonAtlasLoaderPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private parser: GLTFParser

  constructor(parser: GLTFParser)
  {
    this.parser = parser
  }

  public loadMaterial(materialIndex: number): Promise<Material> | null
  {
    const materialDef = this.parser.json.materials[materialIndex]
    if (
      !materialDef.extensions ||
      !materialDef.extensions[MTOON_ATLAS_EXTENSION_NAME]
    )
    {
      return null
    }

    return this._loadMaterialAsync(materialIndex)
  }

  /**
   * パラメータテクスチャを16bit精度で読み込む
   * GLTFLoaderのloadTextureはImageBitmap経由で8bitに変換されるため、
   * 直接PNGデータを取得してfast-pngでデコードする
   */
  private async _loadParameterTexture16bit(textureIndex: number): Promise<DataTexture>
  {
    const json = this.parser.json
    const textureDef = json.textures[textureIndex]
    const imageIndex = textureDef.source
    const imageDef = json.images[imageIndex]

    let pngData: ArrayBuffer

    if (imageDef.uri)
    {
      // Data URI または 外部URL
      if (imageDef.uri.startsWith('data:'))
      {
        // Base64 Data URI をデコード
        const base64 = imageDef.uri.split(',')[1]
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++)
        {
          bytes[i] = binary.charCodeAt(i)
        }
        pngData = bytes.buffer
      } else
      {
        // 外部URL（相対パスも含む）
        const response = await fetch(imageDef.uri)
        pngData = await response.arrayBuffer()
      }
    } else if (imageDef.bufferView !== undefined)
    {
      // GLB 埋め込みバッファ
      const bufferView = await this.parser.getDependency('bufferView', imageDef.bufferView)
      pngData = bufferView.buffer.slice(
        bufferView.byteOffset,
        bufferView.byteOffset + bufferView.byteLength
      )
    } else
    {
      throw new Error('MToonAtlasLoaderPlugin: Invalid image definition')
    }

    // fast-pngでデコード（16bit対応）
    const decoded = decodePng(new Uint8Array(pngData))
    const { width, height, depth, channels, data } = decoded

    // Float32Array に変換
    const pixelCount = width * height * 4
    const floatData = new Float32Array(pixelCount)

    if (depth === 16)
    {
      // 16bit PNG: 0-65535 を 0-1 に正規化
      const uint16Data = data as Uint16Array
      if (channels === 4)
      {
        for (let i = 0; i < pixelCount; i++)
        {
          floatData[i] = uint16Data[i] / 65535
        }
      } else if (channels === 3)
      {
        // RGB only, add alpha = 1
        for (let i = 0; i < width * height; i++)
        {
          floatData[i * 4] = uint16Data[i * 3] / 65535
          floatData[i * 4 + 1] = uint16Data[i * 3 + 1] / 65535
          floatData[i * 4 + 2] = uint16Data[i * 3 + 2] / 65535
          floatData[i * 4 + 3] = 1
        }
      }
    } else
    {
      // 8bit PNG: 0-255 を 0-1 に正規化
      const uint8Data = data as Uint8Array
      if (channels === 4)
      {
        for (let i = 0; i < pixelCount; i++)
        {
          floatData[i] = uint8Data[i] / 255
        }
      } else if (channels === 3)
      {
        // RGB only, add alpha = 1
        for (let i = 0; i < width * height; i++)
        {
          floatData[i * 4] = uint8Data[i * 3] / 255
          floatData[i * 4 + 1] = uint8Data[i * 3 + 1] / 255
          floatData[i * 4 + 2] = uint8Data[i * 3 + 2] / 255
          floatData[i * 4 + 3] = 1
        }
      }
    }

    // DataTexture を作成
    const texture = new DataTexture(floatData, width, height, RGBAFormat, FloatType)
    texture.flipY = false
    texture.colorSpace = NoColorSpace
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.needsUpdate = true

    return texture
  }

  private async _loadMaterialAsync(materialIndex: number): Promise<Material>
  {
    const materialDef = this.parser.json.materials[materialIndex]
    const extension = materialDef.extensions[
      MTOON_ATLAS_EXTENSION_NAME
    ] as MToonAtlasExtensionSchema

    const pending: Promise<void>[] = []
    const atlasedTextures: any = {}

    const loadTexture = async (
      key: string,
      textureInfo: { index: number } | undefined
    ) =>
    {
      if (textureInfo)
      {
        const loadedTexture = await this.parser.loadTexture(textureInfo.index)
        // GLTFLoader がテクスチャをキャッシュするため、clone() して独立したオブジェクトを使用
        const texture = loadedTexture.clone()
        texture.source = loadedTexture.source // image ソースを共有
        texture.flipY = false

        // Set color space based on texture type
        // baseColor, shade, emissive, matcap, rim are usually sRGB (color data)
        // normal, shadingShift, uvAnimationMask are Linear (non-color data)
        const srgbTextures = ['baseColor', 'shade', 'emissive', 'matcap', 'rim']
        if (srgbTextures.includes(key))
        {
          texture.colorSpace = SRGBColorSpace
        } else
        {
          texture.colorSpace = NoColorSpace
        }

        atlasedTextures[key] = texture
      }
    }

    // Load parameter texture (16bit対応)
    let parameterTexture: Texture | null = null
    if (extension.parameterTexture)
    {
      pending.push(
        this._loadParameterTexture16bit(extension.parameterTexture.index).then((tex) =>
        {
          parameterTexture = tex
        })
      )
    }

    // Load atlased textures
    if (extension.atlasedTextures)
    {
      for (const [key, value] of Object.entries(extension.atlasedTextures))
      {
        pending.push(loadTexture(key, value))
      }
    }

    await Promise.all(pending)

    if (!parameterTexture)
    {
      throw new Error('MToonAtlasLoaderPlugin: parameterTexture is missing')
    }

    // Determine slot attribute name
    // GLTFLoader converts custom attributes to lowercase
    const slotAttributeName = extension.slotAttributeName.toLowerCase()

    const material = new MToonAtlasMaterial({
      parameterTexture: {
        texture: parameterTexture,
        slotCount: extension.parameterTexture.slotCount,
        texelsPerSlot: extension.parameterTexture.texelsPerSlot,
        atlasedTextures: atlasedTextures,
      },
      slotAttribute: {
        name: slotAttributeName,
      },
      name: materialDef.name,
    })

    // Apply standard material properties
    if (materialDef.doubleSided)
    {
      material.side = DoubleSide
    } else
    {
      material.side = FrontSide
    }

    if (materialDef.alphaMode === 'BLEND')
    {
      material.transparent = true
      material.depthWrite = false
    } else if (materialDef.alphaMode === 'MASK')
    {
      material.transparent = false
      material.alphaTest = materialDef.alphaCutoff ?? 0.5
    } else
    {
      material.transparent = false
    }

    if (materialDef.extras)
    {
      material.userData = materialDef.extras
    }

    // アウトライン関連のプロパティを設定
    if (extension.isOutline)
    {
      material.isOutline = true
    }
    if (extension.outlineWidthMode)
    {
      material.outlineWidthMode = extension.outlineWidthMode
    }

    return material
  }
}

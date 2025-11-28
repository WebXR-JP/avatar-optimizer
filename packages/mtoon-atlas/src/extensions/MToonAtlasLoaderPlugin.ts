import { Material, Texture, SRGBColorSpace, NoColorSpace, DoubleSide, FrontSide, NearestFilter } from 'three'
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

    // Load parameter texture
    let parameterTexture: Texture | null = null
    if (extension.parameterTexture)
    {
      pending.push(
        this.parser.loadTexture(extension.parameterTexture.index).then((tex) =>
        {
          parameterTexture = tex
          parameterTexture.flipY = false
          parameterTexture.colorSpace = NoColorSpace
          // パラメータテクスチャは数値データなのでバイリニア補間を無効化
          parameterTexture.minFilter = NearestFilter
          parameterTexture.magFilter = NearestFilter
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

    return material
  }
}

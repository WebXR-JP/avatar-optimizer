import { Material, Mesh } from 'three'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import
  {
    GLTFWriter,
    MTOON_ATLAS_EXTENSION_NAME,
    MToonAtlasExtensionSchema,
  } from './types'

export class MToonAtlasExporterPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private writer: GLTFWriter

  constructor(writer: GLTFWriter)
  {
    this.writer = writer
  }

  public writeMaterial(material: Material, materialDef: any)
  {
    if (!('isMToonAtlasMaterial' in material))
    {
      return
    }

    const mtoonMaterial = material as MToonAtlasMaterial
    const extension: MToonAtlasExtensionSchema = {
      version: '1.0',
      parameterTexture: {
        index: -1,
        texelsPerSlot: mtoonMaterial.parameterTexture?.texelsPerSlot ?? 8,
        slotCount: mtoonMaterial.parameterTexture?.slotCount ?? 0,
      },
      slotAttributeName: '_MTOON_MATERIAL_SLOT',
      atlasedTextures: {},
    }

    // Process parameter texture
    if (mtoonMaterial.parameterTexture?.texture)
    {
      const texture = mtoonMaterial.parameterTexture.texture
      extension.parameterTexture.index = this.writer.processTexture(texture)
    }

    // Process atlased textures
    const atlasedTextures = mtoonMaterial.parameterTexture?.atlasedTextures
    if (atlasedTextures)
    {
      for (const [key, texture] of Object.entries(atlasedTextures))
      {
        if (texture)
        {
          const index = this.writer.processTexture(texture)
            ; (extension.atlasedTextures as any)[key] = { index }
        }
      }
    }

    materialDef.extensions = materialDef.extensions || {}
    materialDef.extensions[MTOON_ATLAS_EXTENSION_NAME] = extension

    // Set fallback PBR values
    materialDef.pbrMetallicRoughness = {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    }
  }

  public writeMesh(mesh: Mesh, meshDef: any)
  {
    if (!mesh.isMesh || !mesh.geometry) return

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const hasMToonAtlas = materials.some(m => 'isMToonAtlasMaterial' in m)

    if (!hasMToonAtlas) return

    // Find the attribute name used by the material
    let attributeName = 'mtoonMaterialSlot'
    for (const material of materials)
    {
      if ('isMToonAtlasMaterial' in material)
      {
        const m = material as MToonAtlasMaterial
        if (m.slotAttribute?.name)
        {
          attributeName = m.slotAttribute.name
          break
        }
      }
    }

    const geometry = mesh.geometry
    const attribute = geometry.getAttribute(attributeName)

    if (attribute)
    {
      // We want to export it as '_MTOON_MATERIAL_SLOT'
      const accessorIndex = this.writer.processAccessor(attribute, geometry)

      if (meshDef.primitives)
      {
        for (const primitive of meshDef.primitives)
        {
          primitive.attributes['_MTOON_MATERIAL_SLOT'] = accessorIndex
        }
      }
    }
  }
}

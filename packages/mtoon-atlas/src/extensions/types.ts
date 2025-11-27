import type { Texture, BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'

export const MTOON_ATLAS_EXTENSION_NAME = 'XRIFT_mtoon_atlas'

/**
 * GLTF Extension Schema for XRIFT_mtoon_atlas
 */
export interface MToonAtlasExtensionSchema
{
  version: string
  parameterTexture: {
    index: number
    texelsPerSlot: number
    slotCount: number
  }
  slotAttributeName: string
  atlasedTextures: {
    baseColor?: { index: number }
    shade?: { index: number }
    shadingShift?: { index: number }
    normal?: { index: number }
    emissive?: { index: number }
    matcap?: { index: number }
    rim?: { index: number }
    uvAnimationMask?: { index: number }
  }
}

/**
 * Type definition for GLTF parser/writer context
 * This is a partial definition of GLTFParser/GLTFWriter from three/examples/jsm/loaders/GLTFLoader
 */
export interface GLTFParser
{
  json: any
  associations: Map<any, any>
  getDependency: (type: string, index: number) => Promise<any>
  loadTexture: (index: number) => Promise<Texture>
}

export interface GLTFWriter
{
  json: any
  processTexture: (texture: Texture) => number
  processAccessor: (attribute: BufferAttribute | InterleavedBufferAttribute, geometry: BufferGeometry, start?: number, count?: number) => number
}

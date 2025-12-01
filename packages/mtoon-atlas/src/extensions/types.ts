import type { Texture, BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'

export const MTOON_ATLAS_EXTENSION_NAME = 'XRIFT_mtoon_atlas'

/**
 * GLTF Extension Schema for XRIFT_mtoon_atlas
 */
/**
 * アウトライン幅モード
 */
export type OutlineWidthMode = 'none' | 'worldCoordinates' | 'screenCoordinates'

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
  /**
   * アウトラインマテリアルかどうか
   * true の場合、このマテリアルはアウトライン描画用
   */
  isOutline?: boolean
  /**
   * アウトライン幅モード
   * - 'none': アウトラインなし
   * - 'worldCoordinates': ワールド座標系での固定幅
   * - 'screenCoordinates': スクリーン座標系での固定幅
   */
  outlineWidthMode?: OutlineWidthMode
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
  nodeMap: Map<any, number>
  processTexture: (texture: Texture) => number
  processAccessor: (attribute: BufferAttribute | InterleavedBufferAttribute, geometry: BufferGeometry, start?: number, count?: number) => number
}

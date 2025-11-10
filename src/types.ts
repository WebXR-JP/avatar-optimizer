export interface OptimizationOptions {
  compressTextures: boolean
  maxTextureSize: number
  reduceMeshes: boolean
  targetPolygonCount?: number
}

export interface PreprocessingOptions {
  optimize: boolean
  optimization?: OptimizationOptions
}

export interface PreprocessingResult {
  file: File
  originalStats: VRMStatistics
  finalStats: VRMStatistics
}

export interface VRMStatistics {
  polygonCount: number
  textureCount: number
  materialCount: number
  boneCount: number
  meshCount: number
  fileSizeMB: number
  vramEstimateMB: number
}

/**
 * テクスチャスロットの情報
 * マテリアルごとにどのテクスチャがどのスロットで使用されているかを記録
 */
export interface TextureSlotInfo {
  slot: 'baseColor'
  /** 当該スロットで使用されているテクスチャのリスト */
  textures: Array<{
    name: string
    width: number
    height: number
    mimeType: string
    materials: string[] // このテクスチャを使用しているマテリアル名のリスト
  }>
  /** テクスチャを使用しているマテリアル数（重複なし） */
  materialCount: number
  /** 総テクスチャバイト数 */
  totalBytes: number
}

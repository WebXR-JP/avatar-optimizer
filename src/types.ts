export interface OptimizationOptions {
  compressTextures: boolean
  maxTextureSize: number
  reduceMeshes: boolean
  targetPolygonCount?: number
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

/**
 * optimizeVRM 関数のエラー型
 * 型安全なエラーハンドリング用
 */
export type OptimizationError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'DOCUMENT_PARSE_FAILED'; message: string }
  | { type: 'TEXTURE_EXTRACTION_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

/**
 * バリデーション処理のエラー型
 */
export type ValidationError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'VALIDATION_FAILED'; message: string }

/**
 * テクスチャ処理などの内部処理のエラー型
 */
export type ProcessingError =
  | { type: 'PROCESSING_FAILED'; message: string }
  | OptimizationError

// テクスチャアトラス化のエラー型
export type AtlasError =
  | { type: 'NO_TEXTURES'; message: string }
  | { type: 'INVALID_SIZE'; message: string }
  | { type: 'PACKING_FAILED'; message: string }
  | { type: 'CANVAS_ERROR'; message: string }
  | { type: 'REMAP_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

// アトラス化オプション
export interface AtlasOptions {
  maxSize?: number              // 最大アトラスサイズ (デフォルト: 2048)
  padding?: number              // パディング幅 (デフォルト: 4)
  format?: 'png' | 'jpeg'       // 出力形式 (デフォルト: 'png')
}

// アトラス化結果
export interface AtlasResult {
  document: Document            // 更新済み glTF-Transform ドキュメント
  atlasMetadata: {
    width: number              // アトラス幅
    height: number             // アトラス高さ
    textureCount: number       // 統合されたテクスチャ数
    packingEfficiency: number  // パッキング効率 (0-1)
  }
  islandRegions: IslandRegion[] // マッピング情報（デバッグ用）
}

/**
 * テクスチャ内の領域（島）を表現
 * 元位置とアトラス内新位置の対応付けに使用
 */
export interface IslandRegion {
  // 元テクスチャ内の位置・サイズ（ピクセル座標）
  sourceTextureIndex: number     // 元のテクスチャインデックス
  sourceX: number                // 元テクスチャ内の X 位置
  sourceY: number                // 元テクスチャ内の Y 位置
  sourceWidth: number            // 元テクスチャ内の幅
  sourceHeight: number           // 元テクスチャ内の高さ

  // アトラス内の新位置・サイズ（ピクセル座標）
  targetX: number                // アトラス内の X 位置
  targetY: number                // アトラス内の Y 位置
  targetWidth: number            // アトラス内の幅
  targetHeight: number           // アトラス内の高さ

  // メタデータ
  rotation: number               // 回転角（将来対応）
  padding: number                // パディング幅
}

// パッキング結果
export interface PackedRect {
  textureIndex: number
  x: number
  y: number
  width: number
  height: number
  rotated?: boolean            // 将来対応
}

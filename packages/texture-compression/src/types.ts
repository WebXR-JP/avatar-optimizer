/**
 * テクスチャ圧縮関連の型定義
 */

/** UASTC品質レベル */
export enum UastcQuality {
  /** 最速、最低品質 */
  Fastest = 0,
  /** 高速 */
  Faster = 1,
  /** デフォルト */
  Default = 2,
  /** 低速、高品質 */
  Slower = 3,
  /** 最高品質 */
  VerySlow = 4,
}

/** KTX2圧縮オプション */
export interface Ktx2CompressionOptions {
  /** UASTC品質レベル (0-4, デフォルト: 2) */
  quality?: UastcQuality
  /** 圧縮レベル (0-5, デフォルト: 3) */
  compressionLevel?: number
  /** ミップマップ生成 (デフォルト: false) */
  generateMipmaps?: boolean
  /** Zstandard超圧縮を使用 (デフォルト: true) */
  supercompression?: boolean
}

/** KTX2圧縮結果 */
export interface Ktx2CompressionResult {
  /** 圧縮後のKTX2バイナリデータ */
  data: Uint8Array
  /** 元のサイズ (bytes) */
  originalSize: number
  /** 圧縮後のサイズ (bytes) */
  compressedSize: number
  /** 画像の幅 */
  width: number
  /** 画像の高さ */
  height: number
}

/** エラー型 */
export type CompressionError =
  | { type: 'WASM_LOAD_ERROR'; message: string }
  | { type: 'COMPRESSION_ERROR'; message: string }
  | { type: 'INVALID_INPUT'; message: string }

/**
 * BasisEncoderモジュールの型定義
 * Emscriptenでビルドされたbasis_encoder.jsが公開するAPI
 */
export interface BasisEncoderModule {
  /** BasisEncoderクラス */
  BasisEncoder: new () => BasisEncoder
  /** LDR画像タイプ列挙（生ピクセルデータにはcRGBA32を使用） */
  ldr_image_type: {
    cRGBA32: { value: number }
    cPNGImage: { value: number }
    cJPGImage: { value: number }
  }
}

/**
 * BasisEncoderインスタンスの型定義
 */
export interface BasisEncoder {
  /** KTX2ファイル生成を設定 */
  setCreateKTX2File(create: boolean): void
  /** UASTC超圧縮（Zstandard）を設定 */
  setKTX2UASTCSupercompression(enable: boolean): void
  /** UASTCモードを有効化 */
  setUASTC(enable: boolean): void
  /** スライスソース画像を設定（LDR） */
  setSliceSourceImage(
    sliceIndex: number,
    imageData: Uint8Array,
    width: number,
    height: number,
    imageType: number,
  ): boolean
  /** UASTC品質フラグを設定 */
  setPackUASTCFlags(flags: number): void
  /** 圧縮レベルを設定 */
  setCompressionLevel(level: number): void
  /** ミップマップ生成を設定 */
  setMipGen(generate: boolean): void
  /** エンコードを実行 */
  encode(outputBuffer: Uint8Array): number
  /** リソースを解放 */
  delete(): void
}

/** BASIS WASM ファクトリ関数の型 */
export type BasisModuleFactory = (
  moduleOverrides?: Record<string, unknown>,
) => Promise<BasisEncoderModule>

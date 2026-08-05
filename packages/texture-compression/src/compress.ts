/**
 * KTX2テクスチャ圧縮ロジック
 */

import { errAsync, ResultAsync } from 'neverthrow'
import { initBasisEncoder } from './encoder'
import {
  BasisEncoderModule,
  CompressionError,
  Ktx2CompressionOptions,
  Ktx2CompressionResult,
  UastcQuality,
} from './types'

/** デフォルトの圧縮オプション */
const DEFAULT_OPTIONS: Required<Ktx2CompressionOptions> = {
  quality: UastcQuality.Default,
  compressionLevel: 3,
  generateMipmaps: true,
  supercompression: true,
  srgb: false,
}

/** 出力バッファの最大サイズ（24MB） */
const MAX_OUTPUT_SIZE = 1024 * 1024 * 24

/**
 * RGBAピクセルデータをKTX2形式に圧縮
 *
 * @param imageData - RGBAピクセルデータ（width * height * 4 bytes）
 * @param width - 画像の幅
 * @param height - 画像の高さ
 * @param options - 圧縮オプション
 * @returns 圧縮結果
 */
export function compressToKtx2(
  imageData: Uint8Array,
  width: number,
  height: number,
  options?: Ktx2CompressionOptions,
): ResultAsync<Ktx2CompressionResult, CompressionError> {
  // 入力検証
  const validationError = validateInput(imageData, width, height)
  if (validationError) {
    return errAsync(validationError)
  }

  const opts = { ...DEFAULT_OPTIONS, ...options }

  return initBasisEncoder().andThen((module) =>
    ResultAsync.fromPromise(
      encodeWithBasis(module, imageData, width, height, opts),
      (error) => ({
        type: 'COMPRESSION_ERROR' as const,
        message: `KTX2エンコードに失敗: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ),
  )
}

/**
 * 入力データを検証
 * @returns エラーがあればCompressionError、なければnull
 */
function validateInput(
  imageData: Uint8Array,
  width: number,
  height: number,
): CompressionError | null {
  if (width <= 0 || height <= 0) {
    return {
      type: 'INVALID_INPUT',
      message: `幅と高さは正の値である必要があります: width=${width}, height=${height}`,
    }
  }

  const expectedSize = width * height * 4
  if (imageData.length !== expectedSize) {
    return {
      type: 'INVALID_INPUT',
      message: `画像データサイズが不正です: expected=${expectedSize}, actual=${imageData.length}`,
    }
  }

  // 2のべき乗チェック（推奨だが必須ではない）
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    console.warn(
      `[texture-compression] 幅・高さが2のべき乗でない場合、一部のGPUで問題が発生する可能性があります: ${width}x${height}`,
    )
  }

  return null
}

/**
 * 2のべき乗かチェック
 */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/**
 * BasisEncoderを使用してエンコード
 */
async function encodeWithBasis(
  module: BasisEncoderModule,
  imageData: Uint8Array,
  width: number,
  height: number,
  options: Required<Ktx2CompressionOptions>,
): Promise<Ktx2CompressionResult> {
  const encoder = new module.BasisEncoder()

  try {
    // KTX2出力を有効化
    encoder.setCreateKTX2File(true)

    // UASTCモードを有効化
    encoder.setUASTC(true)

    // 超圧縮（Zstandard）を設定
    encoder.setKTX2UASTCSupercompression(options.supercompression)

    // 品質設定
    encoder.setPackUASTCFlags(options.quality)

    // 圧縮レベル
    encoder.setCompressionLevel(options.compressionLevel)

    // sRGB設定: カラーテクスチャではKTX2のDFD transferFunctionをsRGBにする。
    // これが無いとKTX2がリニア扱いになり、BC7/ASTC等へのトランスコード後に
    // sRGB変換が二重適用されて表示が白く浮く
    encoder.setPerceptual(options.srgb)
    encoder.setKTX2SRGBTransferFunc(options.srgb)

    // ミップマップ生成（sRGB入力ではリニア空間でフィルタリング）
    encoder.setMipGen(options.generateMipmaps)
    encoder.setMipSRGB(options.srgb)

    // ソース画像を設定（RGBA32生データ）
    const success = encoder.setSliceSourceImage(
      0,
      imageData,
      width,
      height,
      module.ldr_image_type.cRGBA32.value,
    )

    if (!success) {
      throw new Error('ソース画像の設定に失敗しました')
    }

    // 出力バッファを確保
    const outputBuffer = new Uint8Array(MAX_OUTPUT_SIZE)

    // エンコード実行
    const outputSize = encoder.encode(outputBuffer)

    if (outputSize === 0) {
      throw new Error('エンコード結果が空です')
    }

    // 結果を切り出し
    const ktx2Data = new Uint8Array(outputBuffer.buffer, 0, outputSize)

    return {
      data: ktx2Data.slice(), // コピーを返す
      originalSize: imageData.length,
      compressedSize: outputSize,
      width,
      height,
    }
  } finally {
    // リソース解放
    encoder.delete()
  }
}

/**
 * Y軸を反転したピクセルデータを生成
 * WebGLテクスチャ座標系（左下原点）からKTX2座標系（左上原点）への変換
 *
 * @param imageData - 元のRGBAピクセルデータ
 * @param width - 画像の幅
 * @param height - 画像の高さ
 * @returns Y軸反転されたピクセルデータ
 */
export function flipImageY(
  imageData: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const rowSize = width * 4
  const flipped = new Uint8Array(imageData.length)

  for (let y = 0; y < height; y++) {
    const srcOffset = y * rowSize
    const dstOffset = (height - 1 - y) * rowSize
    flipped.set(imageData.subarray(srcOffset, srcOffset + rowSize), dstOffset)
  }

  return flipped
}

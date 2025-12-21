/**
 * @xrift/texture-compression
 *
 * テクスチャ圧縮ユーティリティパッケージ
 * avatar-optimizerで利用するためのWASMベースのKTX2圧縮機能を提供
 */

// 型定義
export type {
  CompressionError,
  Ktx2CompressionOptions,
  Ktx2CompressionResult,
} from './types'
export { UastcQuality } from './types'

// 圧縮API
export { compressToKtx2, flipImageY } from './compress'

// エンコーダー管理
export {
  disposeBasisEncoder,
  getCachedBasisEncoder,
  initBasisEncoder,
  isBasisEncoderReady,
} from './encoder'

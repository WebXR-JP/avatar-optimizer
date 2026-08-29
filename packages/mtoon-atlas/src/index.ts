/**
 * @webxr-jp/mtoon-atlas
 *
 * MToon shader atlas optimization material for three-vrm WebGL applications.
 *
 * Provides MToonAtlasMaterial that consumes atlas + packed parameter textures
 * produced by @webxr-jp/avatar-optimizer.
 */

// クラスエクスポート
export { MToonAtlasMaterial } from './MToonAtlasMaterial'
export type { DebugMode } from './MToonAtlasMaterial'

// 型定義エクスポート
export type {
  ParameterSemanticId,
  ParameterSemantic,
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonAtlasOptions,
} from './types'

// GLTF拡張プラグイン
export { MToonAtlasLoaderPlugin } from './extensions/MToonAtlasLoaderPlugin'
export type { MToonAtlasLoaderPluginOptions } from './extensions/MToonAtlasLoaderPlugin'
// KTX2 トランスコーダーの配信元設定（CDN 依存を外して自己ホストする場合に使う）
export {
  setKtx2TranscoderPath,
  getKtx2TranscoderPath,
  resolveKtx2Loader,
  DEFAULT_KTX2_TRANSCODER_PATH,
} from './extensions/ktx2-loader'
export { MToonAtlasExporterPlugin } from './extensions/MToonAtlasExporterPlugin'
// 独自ローダーで KTX2 テクスチャを読み込む場合に、再エクスポート可能にするための登録関数
export { rememberKtx2Source } from './extensions/ktx2-source-cache'
export type { TextureCompressionOptions } from './extensions/MToonAtlasExporterPlugin'
export { MTOON_ATLAS_EXTENSION_NAME } from './extensions/types'
export type { MToonAtlasExtensionSchema } from './extensions/types'

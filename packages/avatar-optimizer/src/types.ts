import type { MToonMaterial, VRM } from '@pixiv/three-vrm'
import type { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import {
  type Ktx2SupportRenderer,
  type MToonAtlasMaterialConstructor,
  ParameterSemanticId,
} from '@webxr-jp/mtoon-atlas'
import type { UastcQuality } from '@webxr-jp/texture-compression'
import {
  ColorSpace,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  TypedArray,
  Vector2,
  type WebGLRenderer,
} from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { WebGPURenderer } from 'three/webgpu'

/**
 * Three.jsのImageに相当するUnion型
 * Three.js自体には含まれていないので自分で定義している
 */
export type ThreeImageType =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas
  | ImageData
  | { data: TypedArray; width: number; height: number }

export interface OptimizationOptions {
  compressTextures: boolean
  maxTextureSize: number
  reduceMeshes: boolean
  targetPolygonCount?: number
}

/**
 * メッシュ簡略化オプション
 */
export interface SimplifyOptions {
  /**
   * 目標頂点削減率 (0.0-1.0)
   * 例: 0.5 = 頂点数を50%に削減
   * @default 0.5
   */
  targetRatio?: number
  /**
   * 目標エラー値（0.0-1.0）
   * 簡略化による形状変化の許容度
   * @default 0.01
   */
  targetError?: number
  /**
   * 境界頂点をロックするか
   * trueの場合、メッシュの端にある頂点は移動・削除されない
   * @default true
   */
  lockBorder?: boolean
  /**
   * UV属性の重み（0.0-1.0）
   * 高い値ほどテクスチャ座標の保護を優先
   * @default 1.0
   */
  uvWeight?: number
  /**
   * 法線属性の重み（0.0-1.0）
   * 高い値ほどシェーディングの滑らかさを優先
   * @default 0.5
   */
  normalWeight?: number
  /**
   * MorphTargetを持つメッシュの処理方法
   * - 'skip': 簡略化をスキップ
   * - 'discard': MorphTargetを破棄して簡略化
   * @default 'skip'
   */
  morphTargetHandling?: 'skip' | 'discard'
}

/**
 * optimizeModel 関数のオプション
 */
export interface OptimizeModelOptions {
  /**
   * VRM0.xからVRM1.0へのスケルトンマイグレーションを行う
   * Y軸周り180度回転を適用してモデルの向きを+Z前向きに変更
   */
  migrateVRM0ToVRM1?: boolean
  /**
   * アトラス生成オプション
   * スロットごとの解像度指定などを行う
   */
  atlas?: AtlasGenerationOptions
  /**
   * メッシュ簡略化オプション
   * 設定された場合、excludedMeshes以外のメッシュを簡略化
   */
  simplify?: SimplifyOptions
  /**
   * 統合後に使うアトラスマテリアルのクラス。
   * 省略時は MToonAtlasMaterial（WebGL 専用）。
   *
   * WebGPURenderer で描画する場合（入力が MToonNodeMaterial の場合）は
   * `@webxr-jp/mtoon-atlas/nodes` の MToonAtlasNodeMaterial を渡す。
   * MToonNodeMaterial を含むモデルで省略すると INVALID_PARAMETER になる
   */
  atlasMaterialType?: MToonAtlasMaterialConstructor
  /**
   * テクスチャ圧縮オプション
   * 指定された場合、アトラス化テクスチャを KTX2（UASTC）形式へ圧縮し、
   * `KTX2Loader` で GPU 向け `CompressedTexture` へトランスコードして差し替える。
   * 元の KTX2 バイナリもキャッシュされるため、後続の `exportVRM` では指定なしで
   * そのまま KTX2 バイナリとしてパススルー出力される
   */
  textureCompression?: TextureCompressionOptions
  /**
   * 使用する KTX2Loader（`textureCompression` 指定時のみ使用）。
   * 渡すインスタンスは `detectSupport(renderer)` 済みである必要がある
   */
  ktx2Loader?: KTX2Loader
  /**
   * KTX2 トランスコーダーの配信元ディレクトリ（`textureCompression` 指定時のみ使用）。
   * `ktx2Loader` を渡した場合は無視される。
   * 省略時は `setKtx2TranscoderPath()` の既定値に従う
   */
  ktx2TranscoderPath?: string
  /**
   * KTX2 の対応形式の判定に使うレンダラー（`textureCompression` 指定時のみ使用）。
   * `ktx2Loader` を渡した場合は無視される。
   * 省略時は `setKtx2Renderer()` の値、それも無ければ一時 WebGLRenderer で判定する。
   * WebGPURenderer で描画する場合は `await renderer.init()` 済みのものを渡す
   */
  ktx2Renderer?: Ktx2SupportRenderer
}

/**
 * 最適化対象の MToon マテリアル
 *
 * WebGL 用の MToonMaterial と、WebGPURenderer 用の MToonNodeMaterial（TSL）の
 * どちらも扱う。両者は同名のパラメータを持つ。
 * MToonNodeMaterial は型としてのみ参照し、実行時に three/webgpu を読み込まない
 */
export type MToonLikeMaterial = MToonMaterial | MToonNodeMaterial

/**
 * three-vrm / GLTFLoader で読み込んだ VRM ドキュメント
 */
export interface ThreeVRMDocument {
  gltf: GLTF
  vrm: VRM
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
 * テクスチャスロット名の型
 */
export const MTOON_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'emissiveMap',
  'shadeMultiplyTexture',
  'shadingShiftTexture',
  'matcapTexture',
  'rimMultiplyTexture',
  'outlineWidthMultiplyTexture',
  'uvAnimationMaskTexture',
] as const
export type MToonTextureSlot = (typeof MTOON_TEXTURE_SLOTS)[number]

/**
 * テクスチャスロットごとのカラースペース設定
 * - sRGB: カラーデータを持つテクスチャ（map, emissiveMap, shadeMultiplyTexture, matcapTexture, rimMultiplyTexture）
 * - Linear/NoColorSpace: 非カラーデータ（normalMap, shadingShiftTexture, outlineWidthMultiplyTexture, uvAnimationMaskTexture）
 */
export const MTOON_TEXTURE_SLOT_COLOR_SPACES: Record<
  MToonTextureSlot,
  ColorSpace
> = {
  map: SRGBColorSpace,
  normalMap: NoColorSpace,
  emissiveMap: SRGBColorSpace,
  shadeMultiplyTexture: SRGBColorSpace,
  shadingShiftTexture: NoColorSpace,
  matcapTexture: SRGBColorSpace,
  rimMultiplyTexture: SRGBColorSpace,
  outlineWidthMultiplyTexture: NoColorSpace,
  uvAnimationMaskTexture: NoColorSpace,
}

/**
 * テクスチャスロット名をキーにしたアトラス画像マップの型
 */
export type AtlasImageMap = Record<MToonTextureSlot, Texture>

/**
 * テクスチャ組み合わせパターン
 * 各スロットに設定されているテクスチャのImage参照を保持
 */
export interface TextureCombinationPattern {
  /** 各スロットのImage参照（nullの場合はテクスチャなし） */
  slots: Map<MToonTextureSlot, ThreeImageType | null>
}

/**
 * 組み合わせパターンとマテリアルのマッピング情報
 */
export interface PatternMaterialMapping {
  /** 一意な組み合わせパターン */
  pattern: TextureCombinationPattern
  /** このパターンを使用するマテリアルのインデックス配列 */
  materialIndices: number[]
  /** パッキング用のテクスチャディスクリプタ */
  textureDescriptor: AtlasTextureDescriptor
}

/**
 * アトラス化対象となる1枚のテクスチャ
 */
export interface AtlasTextureDescriptor {
  /** 画像の幅（ピクセル） */
  width: number
  /** 画像の高さ（ピクセル） */
  height: number
}

/**
 * 主にUVで使用するオフセットとスケール情報
 */
export interface OffsetScale {
  offset: Vector2
  scale: Vector2
}

/**
 * パラメータのパッキングレイアウト定義
 * mtoon-atlas の DEFAULT_PARAMETER_LAYOUT と同じ構造
 */
export interface ParameterLayout {
  id: ParameterSemanticId
  texel: number
  channels: readonly ('r' | 'g' | 'b' | 'a')[]
}

/**
 * デフォルトパラメータレイアウト
 * mtoon-atlas/src/types.ts の DEFAULT_PARAMETER_LAYOUT と同一
 */
export const PARAMETER_LAYOUT: readonly ParameterLayout[] = [
  { id: 'baseColor', texel: 0, channels: ['r', 'g', 'b'] },
  { id: 'opacity', texel: 0, channels: ['a'] },
  { id: 'shadeColor', texel: 1, channels: ['r', 'g', 'b'] },
  { id: 'shadingShiftTextureScale', texel: 1, channels: ['a'] },
  { id: 'emissiveColor', texel: 2, channels: ['r', 'g', 'b'] },
  { id: 'emissiveIntensity', texel: 2, channels: ['a'] },
  { id: 'matcapColor', texel: 3, channels: ['r', 'g', 'b'] },
  { id: 'outlineWidth', texel: 3, channels: ['a'] },
  { id: 'outlineColor', texel: 4, channels: ['r', 'g', 'b'] },
  { id: 'outlineLightingMix', texel: 4, channels: ['a'] },
  { id: 'parametricRimColor', texel: 5, channels: ['r', 'g', 'b'] },
  { id: 'parametricRimLift', texel: 5, channels: ['a'] },
  { id: 'parametricRimFresnelPower', texel: 6, channels: ['r'] },
  { id: 'shadingToony', texel: 6, channels: ['g'] },
  { id: 'rimLightingMix', texel: 6, channels: ['b'] },
  { id: 'uvAnimationRotation', texel: 6, channels: ['a'] },
  { id: 'normalScale', texel: 7, channels: ['r', 'g'] },
  { id: 'uvAnimationScrollX', texel: 7, channels: ['b'] },
  { id: 'uvAnimationScrollY', texel: 7, channels: ['a'] },
  { id: 'shadingShift', texel: 8, channels: ['r'] },
] as const

/**
 * スロットごとのアトラス解像度設定
 * 指定されていないスロットはデフォルト値（2048）を使用
 */
export type SlotAtlasResolution = Partial<Record<MToonTextureSlot, number>>

/**
 * アトラス生成オプション
 */
export interface AtlasGenerationOptions {
  /**
   * デフォルトのアトラス解像度（各辺のピクセル数）
   * @default 2048
   */
  defaultResolution?: number
  /**
   * スロットごとの解像度オーバーライド
   * 例: { map: 2048, normalMap: 1024, emissiveMap: 512 }
   */
  slotResolutions?: SlotAtlasResolution
  /**
   * アトラス合成（オフスクリーン描画と読み戻し）に使うレンダラー。
   * 省略時はライブラリ内で共有するオフスクリーン WebGLRenderer を使う（OffscreenCanvas と WebGL2 が必要）。
   *
   * WebGL の無い環境（Node + Dawn など）では初期化済みの WebGPURenderer を渡す。
   * Node では `@webxr-jp/avatar-optimizer/node` の `createNodeAtlasRenderer()` で作成できる。
   * 渡したレンダラーのレンダーターゲットとクリア色は合成後に元へ戻す。破棄は呼び出し側で行う
   */
  renderer?: AtlasRenderer
}

/**
 * アトラス合成に使えるレンダラー
 * WebGPURenderer は型としてのみ参照し、実行時に three/webgpu を読み込まない
 */
export type AtlasRenderer = WebGLRenderer | WebGPURenderer

/**
 * WebGPU の GPUDevice
 * 利用側に @webgpu/types を要求しないよう、実体の型は問わない
 */
export type NodeGPUDevice = object

/** WebGPU の GPU（`navigator.gpu` 相当）のうち、デバイス取得に使う部分 */
export interface NodeGPU {
  requestAdapter(options?: object): Promise<{
    requestDevice(): Promise<NodeGPUDevice>
  } | null>
}

/**
 * `createNodeAtlasRenderer()`（`@webxr-jp/avatar-optimizer/node`）のオプション
 * device と gpu のどちらかを指定する。両方あれば device を使う
 */
export interface NodeAtlasRendererOptions {
  /**
   * 使用する GPUDevice。
   * Dawn（`webgpu` パッケージ）の場合、デバイスを作った GPU オブジェクトが GC されると
   * クラッシュするので、その GPU も gpu に渡すか利用側で参照を保持しておく
   */
  device?: NodeGPUDevice
  /** GPUDevice を要求する GPU（`webgpu` パッケージの `create([])` の戻り値など） */
  gpu?: NodeGPU
  /** gpu からアダプタを要求するときのオプション（GPURequestAdapterOptions） */
  adapterOptions?: object
}

/**
 * スケルトン最適化の統計情報
 */
export interface SkeletonOptimizationStatistics {
  /** 最適化前のユニークな Skeleton 数 */
  originalSkeletonCount: number
  /** 最適化後のユニークな Skeleton 数 */
  optimizedSkeletonCount: number
  /** 最適化前の全ユニーク Skeleton の合計ボーン数 */
  originalTotalBones: number
  /** 最適化後の全ユニーク Skeleton の合計ボーン数 */
  optimizedTotalBones: number
}

/**
 * エラー型 (全体)
 */
export type OptimizationError =
  | { type: 'ASSET_ERROR'; message: string }
  | { type: 'INVALID_OPERATION'; message: string }
  | { type: 'INVALID_PARAMETER'; message: string }
  | { type: 'INTERNAL_ERROR'; message: string }
  | { type: 'NO_MATERIALS_FOUND'; message: string }
  | { type: 'PARAMETER_TEXTURE_FAILED'; message: string }

/**
 * VRM ロード時のエラー型
 */
export type VRMLoaderError =
  | { type: 'VRM_LOAD_FAILED'; message: string }
  | { type: 'INVALID_VRM'; message: string }

/**
 * テクスチャ圧縮オプション
 * アトラステクスチャを KTX2 形式で圧縮する
 */
export interface TextureCompressionOptions {
  /**
   * UASTC 品質レベル (0-4)
   * @default 2 (Default)
   */
  quality?: UastcQuality

  /**
   * 圧縮レベル (0-5)
   * @default 3
   */
  compressionLevel?: number

  /**
   * ミップマップを生成するか
   * @default false
   */
  generateMipmaps?: boolean

  /**
   * Zstandard 超圧縮を使用するか
   * @default true
   */
  supercompression?: boolean
}

/**
 * VRM エクスポート時のオプション
 */
export interface ExportVRMOptions {
  /**
   * バイナリ形式 (.vrm) で出力するか
   * @default true
   */
  binary?: boolean

  /**
   * テクスチャ圧縮オプション
   * 指定された場合、アトラステクスチャを KTX2 形式で圧縮
   *
   * @deprecated `optimizeModel(vrm, { textureCompression })` を使用してください。
   * `optimizeModel` で圧縮済みのテクスチャは、`exportVRM` にこのオプションを
   * 指定しなくてもそのまま KTX2 バイナリとしてパススルー出力されます。
   */
  textureCompression?: TextureCompressionOptions
}

/**
 * VRM エクスポート時のエラー型
 */
export type ExportVRMError =
  | { type: 'EXPORT_FAILED'; message: string }
  | { type: 'INVALID_VRM'; message: string }

/**
 * glTF に書き出す VRMC_vrm.meta の形
 *
 * three-vrm の VRM1Meta は実行時表現（thumbnailImage が HTMLImageElement）
 * なので、直列化後の形を別に持つ。thumbnailImage は仕様どおり
 * gltf.images へのインデックス。
 */
export interface VRM1MetaDef {
  name?: string
  version?: string
  authors?: string[]
  copyrightInformation?: string
  contactInformation?: string
  references?: string[]
  thirdPartyLicenses?: string
  thumbnailImage?: number
  licenseUrl: string
  otherLicenseUrl?: string
  avatarPermission: 'onlyAuthor' | 'onlySeparatelyLicensedPerson' | 'everyone'
  allowExcessivelyViolentUsage: boolean
  allowExcessivelySexualUsage: boolean
  commercialUsage: 'personalNonProfit' | 'personalProfit' | 'corporation'
  allowPoliticalOrReligiousUsage: boolean
  allowAntisocialOrHateUsage: boolean
  creditNotation: 'required' | 'unnecessary'
  allowRedistribution: boolean
  modification:
    | 'prohibited'
    | 'allowModification'
    | 'allowModificationRedistribution'
}

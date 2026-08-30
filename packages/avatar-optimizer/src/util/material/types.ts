/**
 * Core type definitions for TexTransCoreTS
 * テクスチャアトラス化とモデル編集に必要な型を集約
 */

import { MToonMaterial } from '@pixiv/three-vrm'
import { MToonAtlasMaterial } from '@webxr-jp/mtoon-atlas'
import { Matrix3, Mesh } from 'three'
import type { SimplifyStatistics } from '../../process/simplify'
import { OffsetScale } from '../../types'

/**
 * テクスチャパッキングの結果
 */
export interface PackingLayouts {
  /** パックされたテクスチャ情報 */
  packed: OffsetScale[]
}

/**
 * テクスチャ画像データ
 */
export interface TextureImageData {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * スロットごとに生成されたアトラス画像
 */
export interface SlotAtlasImage {
  /** アトラス PNG などのバイナリバッファ */
  atlasImage: Uint8Array
  /** アトラス幅 */
  atlasWidth: number
  /** アトラス高さ */
  atlasHeight: number
}

/**
 * マテリアル単位で適用する UV 変換行列
 * 3x3 行列を一次元配列で保持 (列優先/行優先は利用側と合意)
 */
export interface MaterialPlacement {
  /** 3x3 変換行列（9 要素） */
  uvTransform: Matrix3
}

/**
 * アトラス生成結果（ドキュメント非依存のメタデータのみ）
 */
export interface AtlasBuildResult {
  /** スロットごとに生成されたアトラス画像 */
  atlases: SlotAtlasImage[]
  /** 各マテリアルに適用する UV 変換行列 */
  placements: MaterialPlacement[]
}

/**
 * UV座標マッピング情報
 */
export interface UVMapping {
  /** プリミティティブのインデックス */
  primitiveIndex: number
  /** マテリアルのテクスチャスロット */
  textureSlot: string
  /** オリジナルのテクスチャインデックス */
  originalTextureIndex: number
  /** アトラス内のノーマライズされたUV座標（min） */
  uvMin: { u: number; v: number }
  /** アトラス内のノーマライズされたUV座標（max） */
  uvMax: { u: number; v: number }
}

/**
 * テクスチャアトラス化の結果
 */
export interface AtlasResult {
  /** アトラス化されたドキュメント */
  document: Document
  /** UV座標マッピング情報 */
  mapping: UVMapping[]
  /** アトラス画像のメタデータ */
  atlasMetadata: {
    width: number
    height: number
    textureCount: number
    packingEfficiency: number
  }
}

/**
 * マテリアル結合のオプション
 */
export interface CombineMaterialOptions {
  /** アトラスサイズ（デフォルト: 2048） */
  atlasSize?: number
  /** スロット属性名（デフォルト: 'mtoonMaterialSlot'） */
  slotAttributeName?: string
  /** パラメータテクスチャのテクセル数（デフォルト: 8） */
  texelsPerSlot?: number
}

/**
 * アウトライン幅モード
 */
export type OutlineWidthMode = 'none' | 'worldCoordinates' | 'screenCoordinates'

/**
 * レンダーモード（透過分離用）
 * - opaque: 不透明（transparent === false && alphaTest === 0）
 * - alphaTest: MASKモード（alphaTest > 0）
 * - transparent: 半透明（transparent === true）
 */
export type RenderMode = 'opaque' | 'alphaTest' | 'transparent'

/**
 * マテリアル情報（アウトライン情報を含む）
 */
export interface MaterialInfo {
  /** マテリアル */
  material: MToonMaterial
  /** このマテリアルを使用しているメッシュ */
  meshes: Mesh[]
  /** アウトラインが有効かどうか */
  hasOutline: boolean
  /** アウトライン幅モード */
  outlineWidthMode: OutlineWidthMode
  /** レンダーモード */
  renderMode: RenderMode
}

/**
 * メッシュグループ（レンダーモードごとの結合結果）
 * meshがnullの場合はexcludedMeshes専用グループ（結合メッシュなし、マテリアルのみ）
 */
export interface MeshGroup {
  /** 結合されたメッシュ（excludedMeshesのみの場合はnull） */
  mesh: Mesh | null
  /** 使用されたMToonAtlasMaterial */
  material: MToonAtlasMaterial
  /** アウトライン用メッシュ */
  outlineMesh?: Mesh
  /** アウトライン用MToonAtlasMaterial */
  outlineMaterial?: MToonAtlasMaterial
}

/**
 * マテリアルスロット情報
 */
export interface MaterialSlotInfo {
  /** レンダーモード */
  renderMode: RenderMode
  /** グループ内でのスロットインデックス */
  slotIndex: number
}

/**
 * アトラス化・マテリアル統合をスキップした理由
 *
 * `ALREADY_OPTIMIZED`: 既に最適化済みだった。アトラス化するとマテリアルは
 *   MToonAtlasMaterial に置き換わるため、2 回目以降は MToonMaterial が
 *   見つからない。この場合は簡略化・マイグレーションも含めて何も行わない
 *   （いずれも冪等ではなく、再適用するとモデルが劣化・破壊されるため）。
 * `NO_MTOON_MATERIAL`: モデルに MToonMaterial が 1 つも無かった。
 *   最適化対象が存在しないため、簡略化とマイグレーションのみ実行される。
 */
export type AtlasSkipReason = 'ALREADY_OPTIMIZED' | 'NO_MTOON_MATERIAL'

export interface AtlasSkipped {
  reason: AtlasSkipReason
  /** 呼び出し側でそのまま表示できる説明文 */
  message: string
}

/**
 * マテリアル結合の結果
 */
export interface CombinedMeshResult {
  /**
   * アトラス化・マテリアル統合をスキップした場合に理由が入る。
   *
   * スキップしても `optimizeModel` はエラーにならず、簡略化と
   * マイグレーションだけを実行して正常終了する。呼び出し側からは
   * 「最適化したのに何も起きていない」ように見えるため、
   * 気づけるようにここへ理由を残す。
   *
   * 後続の KTX2 テクスチャ圧縮はアトラス化されたマテリアルにしか
   * 適用されないので、スキップに気づかないまま圧縮されていない
   * VRM が出力される点に注意。
   */
  atlasSkipped?: AtlasSkipped
  /** レンダーモードごとのメッシュグループ */
  groups: Map<RenderMode, MeshGroup>
  /** マテリアルからスロット情報へのマッピング */
  materialSlotIndex: Map<MToonMaterial, MaterialSlotInfo>
  /** 統計情報 */
  statistics: {
    /** 元のメッシュ数 */
    originalMeshCount: number
    /** 元のマテリアル数（重複排除後） */
    originalMaterialCount: number
    /** 削減されたドローコール数 */
    reducedDrawCalls: number
    /** メッシュ簡略化の統計（簡略化を実行した場合のみ） */
    simplify?: SimplifyStatistics
  }
}

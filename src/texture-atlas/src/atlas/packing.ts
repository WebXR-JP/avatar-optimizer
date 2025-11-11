/**
 * テクスチャパッキングアルゴリズム
 *
 * rectpack-ts ライブラリを使用して、複数のテクスチャを
 * 単一のアトラスに効率的にパッキングします。
 *
 * rectpack-ts は MaxRects (Maximal Rectangles) アルゴリズムの実装で、
 * 複数の変種を提供し、高品質なテクスチャレイアウトを生成します。
 */

import { Packer, MaxRectsBssf } from 'rectpack-ts'
import { SORT_AREA } from 'rectpack-ts/dist/src/sorting.js'
import type { PackingResult, PackedTexture } from '../types'

/**
 * テクスチャサイズ配列をパッキング（単一ビンモード）
 *
 * rectpack-ts の MaxRects アルゴリズムを使用して、
 * 複数のテクスチャを指定されたアトラスサイズに最適に配置します。
 *
 * このモードはすべてのテクスチャを単一のアトラスに詰め込もうとします。
 * テクスチャが収まらない場合は例外をスローします。
 *
 * アルゴリズム:
 * - MaxRectsBssf (Best Short Side Fit): 最短の辺を最小化
 * - SORT_AREA: 面積で降順ソート（より大きなテクスチャから処理）
 * - rotation: true（矩形の回転を許可）
 *
 * @param sizes - テクスチャサイズの配列 { width, height }
 * @param atlasWidth - アトラスの幅（ピクセル）
 * @param atlasHeight - アトラスの高さ（ピクセル）
 * @returns パッキング結果
 * @throws テクスチャがアトラスに収まらない場合
 */
export function packTexturesWithMaxRects(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
  originalSizes?: Array<{ width: number; height: number }>,
): PackingResult {
  if (sizes.length === 0) {
    throw new Error('No textures to pack')
  }

  // originalSizes が指定されていない場合は sizes を使用
  const baseOriginalSizes = originalSizes || sizes

  // Packer インスタンスを作成
  // - packAlgo: MaxRectsBssf（最短辺フィット）
  // - sortAlgo: SORT_AREA（面積でソート）
  // - rotation: true（回転を許可）
  const packer = new Packer({
    packAlgo: MaxRectsBssf,
    sortAlgo: SORT_AREA,
    rotation: true,
  })

  // アトラスを単一のビンとして追加
  packer.addBin(atlasWidth, atlasHeight)

  // 各テクスチャをパッカーに追加（インデックスを rid として保存）
  sizes.forEach((size, index) => {
    packer.addRect(size.width, size.height, String(index))
  })

  // パッキング実行
  packer.pack()

  // パッキング結果を取得
  const bins = packer.binList()
  if (bins.length === 0) {
    throw new Error('Packing failed: No bins were created')
  }

  // 最初のビンを取得
  const bin = bins[0]

  // rect リストに変換（PackedTexture フォーマット）
  const packed: PackedTexture[] = bin.rectangles.map((rect: any) => {
    const originalIndex =
      rect.rid !== null && rect.rid !== undefined ? parseInt(String(rect.rid), 10) : -1
    if (originalIndex < 0 || originalIndex >= sizes.length) {
      throw new Error(`Invalid rectangle index: ${originalIndex}`)
    }

    const scaledSize = sizes[originalIndex]
    const baseOriginalSize = baseOriginalSizes[originalIndex]

    return {
      index: originalIndex,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      sourceWidth: baseOriginalSize.width,
      sourceHeight: baseOriginalSize.height,
      scaledWidth: scaledSize.width,
      scaledHeight: scaledSize.height,
    }
  })

  // すべてのテクスチャがパッキングされたか確認
  if (packed.length !== sizes.length) {
    throw new Error(
      `Packing failed: ${packed.length}/${sizes.length} textures packed. Textures do not fit in atlas.`,
    )
  }

  // 複数のビンが使用されていないか確認
  if (bins.length > 1) {
    throw new Error(
      `Packing failed: ${bins.length} bins required, but expected single bin. Textures do not fit in atlas.`,
    )
  }

  return {
    atlasWidth: bin.width,
    atlasHeight: bin.height,
    packed,
  }
}

/**
 * テクスチャをスケーリングして自動的にパッキング
 *
 * 単一のアトラスにテクスチャが収まらない場合、
 * テクスチャサイズを段階的に縮小して再試行します。
 *
 * @param sizes - テクスチャサイズの配列
 * @param atlasWidth - アトラスの幅
 * @param atlasHeight - アトラスの高さ
 * @returns パッキング結果（テクスチャがダウンスケーリングされる可能性あり）
 * @throws テクスチャが 1x1 ピクセルまで縮小されても収まらない場合
 */
export async function packTexturesWithAutoScaling(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
): Promise<PackingResult> {
  return _tryPackWithScaling(sizes, atlasWidth, atlasHeight, 1.0)
}

/**
 * 再帰的にパッキングを試行（内部関数）
 */
async function _tryPackWithScaling(
  originalSizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
  scaleMultiplier: number = 1.0,
): Promise<PackingResult> {
  // スケーリングを適用したサイズ
  const currentSizes = originalSizes.map((size) => ({
    width: Math.max(1, Math.floor(size.width * scaleMultiplier)),
    height: Math.max(1, Math.floor(size.height * scaleMultiplier)),
  }))

  try {
    // MaxRects パッキングを試行
    // originalSizes を渡して、sourceWidth/Height に記録させる
    return packTexturesWithMaxRects(currentSizes, atlasWidth, atlasHeight, originalSizes)
  } catch (error) {
    // パッキングに失敗した場合、テクスチャサイズを 90% に縮小して再試行
    const nextScaleMultiplier = scaleMultiplier * 0.9

    // 最小サイズ（1x1）を下回らないかチェック
    const minScaledWidth = Math.max(
      1,
      Math.floor(Math.min(...originalSizes.map((s) => s.width)) * nextScaleMultiplier),
    )
    const minScaledHeight = Math.max(
      1,
      Math.floor(Math.min(...originalSizes.map((s) => s.height)) * nextScaleMultiplier),
    )

    if (minScaledWidth < 1 || minScaledHeight < 1) {
      throw new Error(
        `Failed to pack textures using MaxRects algorithm. Could not fit textures even after scaling down to 1x1 pixels.`,
      )
    }

    // 再帰的に再試行
    return _tryPackWithScaling(
      originalSizes,
      atlasWidth,
      atlasHeight,
      nextScaleMultiplier,
    )
  }
}

/**
 * テクスチャをパッキング（公開 API）
 *
 * MaxRects アルゴリズムを使用してテクスチャを自動的にパッキングします。
 * テクスチャが収まらない場合は、自動的にスケーリングして再試行します。
 *
 * @param sizes - テクスチャサイズの配列 { width, height }
 * @param atlasWidth - アトラスの幅（ピクセル）
 * @param atlasHeight - アトラスの高さ（ピクセル）
 * @returns パッキング結果
 * @throws テクスチャが 1x1 ピクセルまで縮小されても収まらない場合
 */
export async function packTextures(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
): Promise<PackingResult> {
  return packTexturesWithAutoScaling(sizes, atlasWidth, atlasHeight)
}

/**
 * 旧 NFDH パッカーの互換性ラッパー
 *
 * 既存のコードとの互換性のため、packTexturesNFDH という名前で
 * packTextures を呼び出すラッパーを提供します。
 *
 * @deprecated packTextures を使用してください
 */
export async function packTexturesNFDH(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
): Promise<PackingResult> {
  return packTextures(sizes, atlasWidth, atlasHeight)
}

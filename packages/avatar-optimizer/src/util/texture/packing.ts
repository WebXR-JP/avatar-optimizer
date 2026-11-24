/**
 * テクスチャパッキングアルゴリズム
 *
 * rectpack-ts ライブラリを使用して、複数のテクスチャを
 * 単一のアトラスに効率的にパッキングします。
 *
 * rectpack-ts は MaxRects (Maximal Rectangles) アルゴリズムの実装で、
 * 複数の変種を提供し、高品質なテクスチャレイアウトを生成します。
 */

import { MaxRectsBssf, Packer, PackerBBF } from 'rectpack-ts'
import { Rectangle } from 'rectpack-ts/dist/src/geometry'
import type { PackingAlgorithm } from 'rectpack-ts/dist/src/packing-algorithm'
import { SORT_AREA } from 'rectpack-ts/dist/src/sorting.js'
import { Vector2 } from 'three'
import type { PackingLayouts } from '../material/types'

const ATLAS_SIZE = 2048 // ←相対値しか返さないので割となんでもいい
const SCALE_SEARCH_EPSILON = 0.0001

/**
 * テクスチャがアトラスに収まらなかったことを表すエラー。
 * 自動スケーリングはこのエラーのときだけ縮小して再試行し、
 * それ以外の例外（ライブラリ内部の不具合など）は握り潰さずに伝播させる。
 */
class TextureDoesNotFitError extends Error {}

/**
 * rectpack-ts の PackerBBF（Bin Best Fit）を、エンジン非依存に動くよう置き換えたもの。
 *
 * 元の fitRect は空配列に対する reduce の TypeError を握り潰して
 * 「収まる open bin が無い」ことを検出しているが、その判定を
 * V8 のエラーメッセージ（'Reduce of empty array ...'）の文字列一致で行っている。
 * Safari (JavaScriptCore) のメッセージは 'reduce of empty array ...' と小文字始まりのため
 * 判定に外れて再 throw され、最初の矩形すら配置できずパッキングが常に失敗する。
 *
 * ここでは配列長を見て分岐し、エラーメッセージに依存しない。
 * それ以外の挙動（最良 fitness の bin を選ぶ・無ければ新しい bin を開く）は元実装と同じ。
 * パッチではなくサブクラスにしているのは、利用側のインストールにも効かせるため。
 */
class EngineSafePackerBBF extends PackerBBF {
  fitRect(width: number, height: number, rid?: string): boolean {
    let bestBin: PackingAlgorithm | null = null
    let bestFitness = Infinity
    for (const bin of this._openBins) {
      const fitness = bin.fitness(width, height)
      if (fitness !== null && fitness < bestFitness) {
        bestFitness = fitness
        bestBin = bin
      }
    }

    if (bestBin) {
      bestBin.addRect(width, height, rid)
      return true
    }

    while (true) {
      const newBin = this._newOpenBin(width, height)
      if (!newBin) return false
      if (newBin.addRect(width, height, rid)) return true
    }
  }
}

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
): PackingLayouts {
  if (sizes.length === 0) {
    throw new Error('No textures to pack')
  }

  // Packer インスタンスを作成
  // - packAlgo: MaxRectsBssf（最短辺フィット）
  // - sortAlgo: SORT_AREA（面積でソート）
  // - rotation: true（回転を許可）
  const packer = new Packer({
    binAlgo: EngineSafePackerBBF,
    packAlgo: MaxRectsBssf,
    sortAlgo: SORT_AREA,
    rotation: true,
  })

  // アトラスを単一のビンとして追加
  packer.addBin(ATLAS_SIZE, ATLAS_SIZE)

  // 各テクスチャをパッカーに追加（インデックスを rid として保存）
  sizes.forEach((size, index) => {
    packer.addRect(size.width, size.height, String(index))
  })

  // パッキング実行
  packer.pack()

  // パッキング結果を取得
  const bins = packer.binList()
  if (bins.length === 0) {
    throw new TextureDoesNotFitError('Packing failed: No bins were created')
  }

  // 最初のビンを取得
  const bin = bins[0]

  // rect リストに変換（PackedTexture フォーマット）
  const packed = bin.rectangles.map((rect: Rectangle) => ({
    rid: rect.rid,
    offset: new Vector2(rect.x / bin.width, rect.y / bin.height),
    scale: new Vector2(rect.width / bin.width, rect.height / bin.height),
  }))

  // ridでソートして元の順序に戻す
  packed.sort((a, b) => Number(a.rid) - Number(b.rid))

  // すべてのテクスチャがパッキングされたか確認
  if (packed.length !== sizes.length) {
    throw new TextureDoesNotFitError(
      `Packing failed: ${packed.length}/${sizes.length} textures packed. Textures do not fit in atlas.`,
    )
  }

  // 複数のビンが使用されていないか確認
  if (bins.length > 1) {
    throw new TextureDoesNotFitError(
      `Packing failed: ${bins.length} bins required, but expected single bin. Textures do not fit in atlas.`,
    )
  }

  return {
    packed,
  }
}

/**
 * テクスチャをスケーリングして自動的にパッキング
 *
 * 単一のアトラスにテクスチャが収まらない場合、
 * まずは指数的に縮小して成功範囲を見つけ、
 * その後は二分探索でギリギリ収まるスケールを求めます。
 *
 * @param sizes - テクスチャサイズの配列
 * @param atlasWidth - アトラスの幅
 * @param atlasHeight - アトラスの高さ
 * @returns パッキング結果（テクスチャがダウンスケーリングされる可能性あり）
 * @throws テクスチャが 1x1 ピクセルまで縮小されても収まらない場合
 */
export async function packTexturesWithAutoScaling(
  sizes: Array<{ width: number; height: number }>,
): Promise<PackingLayouts> {
  if (sizes.length === 0) {
    throw new Error('No textures to pack')
  }

  const attemptPack = (scale: number) => {
    const scaledSizes = scaleTextureSizes(sizes, scale)
    return packTexturesWithMaxRects(scaledSizes)
  }

  // まずは等倍でトライし、成功すればそのまま返す
  try {
    return attemptPack(1)
  } catch (error) {
    // 収まらない場合のみスケールを絞り込む。それ以外は本当の失敗なので伝播
    if (!(error instanceof TextureDoesNotFitError)) throw error
  }

  const minScaleLimit = computeMinScaleLimit(sizes)
  let lastFailedScale = 1
  let lastSuccessScale: number | null = null
  let lastSuccessResult: PackingLayouts | null = null

  // まずは成功するスケールを見つけるまで指数的に縮小
  let currentScale = 0.5
  for (let attempt = 0; attempt < 32; attempt++) {
    if (currentScale < minScaleLimit) {
      currentScale = minScaleLimit
    }

    try {
      const result = attemptPack(currentScale)
      lastSuccessScale = currentScale
      lastSuccessResult = result
      break
    } catch (error) {
      if (!(error instanceof TextureDoesNotFitError)) throw error
      lastFailedScale = currentScale
      if (currentScale <= minScaleLimit) {
        throw new Error(
          'Failed to pack textures using MaxRects algorithm. Could not fit textures even after scaling down to 1x1 pixels.',
        )
      }
      currentScale *= 0.5
    }
  }

  if (lastSuccessScale === null || lastSuccessResult === null) {
    throw new Error(
      'Failed to pack textures using MaxRects algorithm. Could not fit textures even after scaling down to 1x1 pixels.',
    )
  }

  // 高速に見つかった成功スケールがそのまま最適な場合は返す
  if (lastFailedScale <= lastSuccessScale) {
    return lastSuccessResult
  }

  // 失敗（大きい）スケールと成功（小さい）スケールの間で二分探索
  let low = lastSuccessScale
  let high = lastFailedScale
  for (let i = 0; i < 25; i++) {
    if (Math.abs(high - low) < SCALE_SEARCH_EPSILON) {
      break
    }

    const mid = (low + high) / 2
    if (mid === low || mid === high) {
      break
    }

    try {
      const result = attemptPack(mid)
      lastSuccessScale = mid
      lastSuccessResult = result
      low = mid
    } catch (error) {
      if (!(error instanceof TextureDoesNotFitError)) throw error
      high = mid
    }
  }

  if (lastSuccessResult === null) {
    throw new Error(
      'Failed to pack textures using MaxRects algorithm. Could not fit textures even after scaling down to 1x1 pixels.',
    )
  }

  return lastSuccessResult
}

function scaleTextureSizes(
  originalSizes: Array<{ width: number; height: number }>,
  scaleMultiplier: number,
): Array<{ width: number; height: number }> {
  return originalSizes.map((size) => ({
    width: Math.max(1, Math.floor(size.width * scaleMultiplier)),
    height: Math.max(1, Math.floor(size.height * scaleMultiplier)),
  }))
}

function computeMinScaleLimit(
  sizes: Array<{ width: number; height: number }>,
): number {
  if (sizes.length === 0) {
    return 1
  }

  const maxDimension = Math.max(
    ...sizes.map((size) => Math.max(size.width, size.height)),
  )
  if (maxDimension <= 0) {
    return 1
  }
  return 1 / maxDimension
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
): Promise<PackingLayouts> {
  return packTexturesWithAutoScaling(sizes)
}

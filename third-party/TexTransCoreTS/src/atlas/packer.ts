/**
 * Bin Packing アルゴリズム
 * MaxRects 法を簡易実装してテクスチャレイアウトを最適化
 *
 * 参考: Jukka Jylänki の MaxRectsBinPack アルゴリズム
 */

import type { PackedTexture, PackingResult, Rectangle } from '../types'

/**
 * MaxRects ベースの Bin Packer 実装
 *
 * テクスチャサイズのリストを受け取り、
 * 単一のアトラス内での配置を計算します。
 */
export class BinPacker {
  private atlasWidth: number
  private atlasHeight: number
  private padding: number
  private usedRectangles: Rectangle[] = []
  private freeRectangles: Rectangle[] = []

  constructor(atlasWidth: number, atlasHeight: number, padding: number = 0) {
    this.atlasWidth = atlasWidth
    this.atlasHeight = atlasHeight
    this.padding = padding

    // 初期状態：アトラス全体が空き領域
    this.freeRectangles = [
      {
        x: 0,
        y: 0,
        width: atlasWidth,
        height: atlasHeight,
      },
    ]
  }

  /**
   * テクスチャサイズのリストをパック
   */
  pack(sizes: Array<{ width: number; height: number }>): PackedTexture[] {
    const packed: PackedTexture[] = []

    for (let i = 0; i < sizes.length; i++) {
      const { width, height } = sizes[i]
      const position = this._findBestPosition(width, height)

      if (!position) {
        throw new Error(
          `Failed to pack texture ${i} (${width}x${height}) into ${this.atlasWidth}x${this.atlasHeight} atlas`,
        )
      }

      packed.push({
        index: i,
        x: position.x,
        y: position.y,
        width,
        height,
        originalWidth: width,
        originalHeight: height,
      })

      this._placeRectangle(position.x, position.y, width, height)
    }

    return packed
  }

  /**
   * テクスチャを配置できる最適な位置を探す（Bottom-Left Fit）
   */
  private _findBestPosition(
    width: number,
    height: number,
  ): Rectangle | null {
    let bestPos: Rectangle | null = null
    let bestPeakHeight = Infinity

    // パディングを含めたサイズ
    const paddedWidth = width + this.padding * 2
    const paddedHeight = height + this.padding * 2

    for (const rect of this.freeRectangles) {
      if (rect.width >= paddedWidth && rect.height >= paddedHeight) {
        // フィット可能な領域を発見
        const peakHeight = rect.y + paddedHeight
        if (peakHeight < bestPeakHeight) {
          bestPeakHeight = peakHeight
          bestPos = {
            x: rect.x + this.padding,
            y: rect.y + this.padding,
            width: paddedWidth,
            height: paddedHeight,
          }
        }
      }
    }

    return bestPos
  }

  /**
   * 矩形を使用済みエリアに登録し、空き領域を更新
   */
  private _placeRectangle(
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // パディング込みのサイズ
    const rect: Rectangle = {
      x: x - this.padding,
      y: y - this.padding,
      width: width + this.padding * 2,
      height: height + this.padding * 2,
    }

    this.usedRectangles.push(rect)

    // 空き領域を再計算
    this._updateFreeRectangles(rect)
  }

  /**
   * 新しい矩形の配置後、空き領域リストを更新
   */
  private _updateFreeRectangles(placed: Rectangle): void {
    const newFreeRects: Rectangle[] = []

    for (const free of this.freeRectangles) {
      if (!this._overlaps(placed, free)) {
        // オーバーラップしない領域はそのまま保持
        newFreeRects.push(free)
      } else {
        // オーバーラップする部分を分割
        // 上部
        if (free.y < placed.y) {
          newFreeRects.push({
            x: free.x,
            y: free.y,
            width: free.width,
            height: placed.y - free.y,
          })
        }
        // 右部
        if (free.x + free.width > placed.x + placed.width) {
          newFreeRects.push({
            x: placed.x + placed.width,
            y: free.y,
            width: free.x + free.width - (placed.x + placed.width),
            height: free.height,
          })
        }
        // 下部
        if (free.y + free.height > placed.y + placed.height) {
          newFreeRects.push({
            x: free.x,
            y: placed.y + placed.height,
            width: free.width,
            height: free.y + free.height - (placed.y + placed.height),
          })
        }
        // 左部
        if (free.x < placed.x) {
          newFreeRects.push({
            x: free.x,
            y: free.y,
            width: placed.x - free.x,
            height: free.height,
          })
        }
      }
    }

    // 小さな断片化を防ぐため、最小サイズ未満のエリアを削除
    const MIN_SIZE = 4
    this.freeRectangles = newFreeRects.filter(
      (rect) => rect.width >= MIN_SIZE && rect.height >= MIN_SIZE,
    )
  }

  /**
   * 2 つの矩形がオーバーラップしているか判定
   */
  private _overlaps(a: Rectangle, b: Rectangle): boolean {
    return !(
      a.x + a.width <= b.x ||
      a.x >= b.x + b.width ||
      a.y + a.height <= b.y ||
      a.y >= b.y + b.height
    )
  }

  /**
   * パッキング効率を計算（0-1）
   */
  getPackingEfficiency(): number {
    const usedArea = this.usedRectangles.reduce(
      (sum, rect) => sum + rect.width * rect.height,
      0,
    )
    const totalArea = this.atlasWidth * this.atlasHeight
    return usedArea / totalArea
  }
}

/**
 * テクスチャサイズのリストをアトラスにパック
 */
export async function packTextures(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
  padding: number = 4,
): Promise<PackingResult> {
  const packer = new BinPacker(atlasWidth, atlasHeight, padding)
  const packed = packer.pack(sizes)

  return {
    atlasWidth,
    atlasHeight,
    packed,
  }
}

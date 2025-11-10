import { PackedRect } from '../types'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * MaxRects Bin Packing アルゴリズム（簡易版）
 * 複数のテクスチャを指定サイズのキャンバスに効率的に配置
 */
export class BinPacker {
  private width: number
  private height: number
  private usedRectangles: Rect[] = []
  private freeRectangles: Rect[] = []

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.freeRectangles = [{ x: 0, y: 0, width, height }]
  }

  /**
   * 複数の矩形を配置
   * @param sizes 配置対象の矩形サイズ配列
   * @returns 配置結果 { x, y, width, height }[]
   */
  pack(sizes: { width: number; height: number }[]): PackedRect[] {
    const results: PackedRect[] = []

    for (let i = 0; i < sizes.length; i++) {
      const best = this.findBestPosition(sizes[i].width, sizes[i].height)
      if (!best) {
        throw new Error(`Cannot pack texture ${i}: size too large`)
      }
      results.push({
        textureIndex: i,
        x: best.x,
        y: best.y,
        width: sizes[i].width,
        height: sizes[i].height,
      })
      this.addUsedRectangle(best)
    }

    return results
  }

  private findBestPosition(
    width: number,
    height: number,
  ): Rect | null {
    // 最適フィッティング: スコアが最小の空き領域を選択
    let best: Rect | null = null
    let bestScore = Number.MAX_VALUE

    for (const free of this.freeRectangles) {
      if (free.width >= width && free.height >= height) {
        const score = Math.min(free.width - width, free.height - height)
        if (score < bestScore) {
          best = { x: free.x, y: free.y, width, height }
          bestScore = score
        }
      }
    }

    return best
  }

  private addUsedRectangle(rect: Rect): void {
    this.usedRectangles.push(rect)
    this.splitFreeRectangles(rect)
  }

  private splitFreeRectangles(usedRect: Rect): void {
    const newFree: Rect[] = []

    for (const free of this.freeRectangles) {
      // 重なりがない場合はそのまま
      if (!this.intersect(free, usedRect)) {
        newFree.push(free)
        continue
      }

      // 水平・垂直スプリット
      if (free.x < usedRect.x) {
        newFree.push({
          x: free.x,
          y: free.y,
          width: usedRect.x - free.x,
          height: free.height,
        })
      }
      if (free.x + free.width > usedRect.x + usedRect.width) {
        newFree.push({
          x: usedRect.x + usedRect.width,
          y: free.y,
          width: free.x + free.width - (usedRect.x + usedRect.width),
          height: free.height,
        })
      }
      if (free.y < usedRect.y) {
        newFree.push({
          x: free.x,
          y: free.y,
          width: free.width,
          height: usedRect.y - free.y,
        })
      }
      if (free.y + free.height > usedRect.y + usedRect.height) {
        newFree.push({
          x: free.x,
          y: usedRect.y + usedRect.height,
          width: free.width,
          height: free.y + free.height - (usedRect.y + usedRect.height),
        })
      }
    }

    this.freeRectangles = newFree
  }

  private intersect(a: Rect, b: Rect): boolean {
    return !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    )
  }
}

export async function packTextures(
  textures: { width: number; height: number }[],
  maxSize: number = 2048,
  padding: number = 4,
): Promise<{ packed: PackedRect[]; atlasWidth: number; atlasHeight: number }> {
  // パディング考慮してパック
  const withPadding = textures.map((t) => ({
    width: t.width + padding * 2,
    height: t.height + padding * 2,
  }))

  const packer = new BinPacker(maxSize, maxSize) // padding は内部で考慮されるため、ここでは渡さない

  const packed = packer.pack(withPadding)

  // アトラスの実際のサイズを計算
  let atlasWidth = 0
  let atlasHeight = 0
  for (const rect of packed) {
    atlasWidth = Math.max(atlasWidth, rect.x + rect.width)
    atlasHeight = Math.max(atlasHeight, rect.y + rect.height)
  }

  return {
    packed,
    atlasWidth,
    atlasHeight,
  }
}

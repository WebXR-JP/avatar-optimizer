
import type { IslandTransform, PackingResult, Vector2 } from '../types'

const TARGET_WIDTH = 1

class UVWidthBox {
  public readonly width: number
  public readonly floor: number
  public readonly height: number
  private readonly upper: IslandTransform[] = []
  private readonly lower: IslandTransform[] = []

  constructor(floor: number, height: number, width: number) {
    this.width = width
    this.height = height
    this.floor = floor
  }

  public get ceil(): number {
    return this.floor + this.height
  }

  public trySetBox(islandTf: IslandTransform): boolean {
    if (this.height < islandTf.size.y) return false

    // Try packing from the bottom (lower)
    {
      const isFirst = this.lower.length === 0
      const emptyXMin = isFirst
        ? 0
        : this.lower[this.lower.length - 1].position.x +
          this.lower[this.lower.length - 1].size.x
      const emptyXMax = this.getCeilWithEmpty(
        Math.max(this.floor, Math.min(this.floor + islandTf.size.y, this.ceil)),
      )
      const emptyWidthSize = emptyXMax - emptyXMin
      const islandWidth = islandTf.size.x

      if (emptyWidthSize >= islandWidth) {
        islandTf.position.x = emptyXMin
        islandTf.position.y = this.floor
        this.lower.push(islandTf)
        return true
      }
    }

    // Try packing from the top (upper)
    {
      const isFirst = this.upper.length === 0
      const emptyXMin = this.getFloorWithEmpty(
        Math.max(this.floor, Math.min(this.ceil - islandTf.size.y, this.ceil)),
      )
      const emptyXMax = isFirst
        ? this.width
        : this.upper[this.upper.length - 1].position.x
      const emptyWidthSize = emptyXMax - emptyXMin
      const islandWidth = islandTf.size.x

      if (emptyWidthSize >= islandWidth) {
        islandTf.position.x = emptyXMax - islandTf.size.x
        islandTf.position.y = this.ceil - islandTf.size.y
        this.upper.push(islandTf)
        return true
      }
    }

    return false
  }

  private getFloorWithEmpty(targetHeight: number): number {
    if (targetHeight < this.floor || targetHeight > this.ceil) {
      throw new Error('TargetHeight is not in range!')
    }

    let xMin = 0
    const targetF2Height = targetHeight - this.floor

    for (const island of this.lower) {
      if (targetF2Height < island.size.y) {
        xMin = Math.max(xMin, island.position.x + island.size.x)
      }
    }
    return xMin
  }

  private getCeilWithEmpty(targetHeight: number): number {
    if (targetHeight < this.floor || targetHeight > this.ceil) {
      throw new Error('TargetHeight is not in range!')
    }

    let xMax = this.width
    const targetC2Height = this.ceil - targetHeight

    for (const island of this.upper) {
      if (targetC2Height < island.size.y) {
        xMax = Math.min(xMax, island.position.x)
      }
    }
    return xMax
  }
}

function swap(v: Vector2): Vector2 {
  return { x: v.y, y: v.x }
}

function tryNFDHPlasFC(
  sortedIslands: IslandTransform[],
  targetHeight: number,
): boolean {
  const uvWidthBoxes: UVWidthBox[] = []

  for (let i = 0; i < sortedIslands.length; i++) {
    const islandTf = sortedIslands[i]

    const trySetBoxList = (): boolean => {
      for (const withBox of uvWidthBoxes) {
        if (withBox.trySetBox(islandTf)) {
          return true
        }
      }
      return false
    }

    if (trySetBoxList()) {
      continue
    }

    const isFirstBox = uvWidthBoxes.length === 0
    const floor = isFirstBox ? 0 : uvWidthBoxes[uvWidthBoxes.length - 1].ceil
    const newWithBox = new UVWidthBox(floor, islandTf.size.y, TARGET_WIDTH)
    uvWidthBoxes.push(newWithBox)

    if (!newWithBox.trySetBox(islandTf)) {
      return false
    }
  }

  if (uvWidthBoxes.length === 0) return true
  const lastHeight = uvWidthBoxes[uvWidthBoxes.length - 1].ceil
  return lastHeight <= targetHeight
}

export function nextFitDecreasingHeightPlusFloorCeiling(
  islands: IslandTransform[],
  targetHeight: number,
): boolean {
  if (islands.length === 0) {
    return false
  }

  // Pre-rotation
  for (const tf of islands) {
    if (tf.size.y > tf.size.x) {
      tf.rotation = -Math.PI / 2 // 90 degrees
      tf.size = swap(tf.size)
    } else {
      tf.rotation = 0
    }
  }

  // Sort by height (decreasing)
  islands.sort((a, b) => b.size.y - a.size.y)

  if (tryNFDHPlasFC(islands, targetHeight)) {
    // Post-rotation
    for (const tf of islands) {
      if (tf.rotation !== 0) {
        tf.size = swap(tf.size)
        tf.position.y += tf.size.x
      }
    }
    return true
  }

  return false
}

export async function packTexturesNFDH(
  sizes: Array<{ width: number; height: number }>,
  atlasWidth: number,
  atlasHeight: number,
): Promise<PackingResult> {
  // テクスチャサイズの自動スケーリングで再試行する内部関数
  async function tryPackWithScaling(
    textureSizes: Array<{ width: number; height: number }>,
    currentAtlasWidth: number,
    currentAtlasHeight: number,
    scaleMultiplier: number = 1.0,
    maxAtlasWidth: number = atlasWidth * 8, // Maximum atlas size (prevent infinite loops)
    maxAtlasHeight: number = atlasHeight * 8,
  ): Promise<PackingResult> {
    const islands: IslandTransform[] = textureSizes.map((size, i) => ({
      position: { x: 0, y: 0 },
      size: { x: size.width / currentAtlasWidth, y: size.height / currentAtlasHeight },
      rotation: 0,
      originalIndex: i,
    }))

    const success = nextFitDecreasingHeightPlusFloorCeiling(
      islands,
      1.0, // Target height is normalized to 1.0
    )

    if (success) {
      const packed = islands.map((tf) => ({
        index: tf.originalIndex,
        x: Math.round(tf.position.x * currentAtlasWidth),
        y: Math.round(tf.position.y * currentAtlasHeight),
        width: Math.round(tf.size.x * currentAtlasWidth),
        height: Math.round(tf.size.y * currentAtlasHeight),
        originalWidth: sizes[tf.originalIndex].width,
        originalHeight: sizes[tf.originalIndex].height,
      }))

      return {
        atlasWidth: currentAtlasWidth,
        atlasHeight: currentAtlasHeight,
        packed,
      }
    }

    // パッキングに失敗した場合、テクスチャサイズを90%にしてリトライ
    // （段階的にスケール、急激な縮小を避ける）
    const nextScaleMultiplier = scaleMultiplier * 0.9

    // 最小サイズ（1x1）を下回らないようにチェック
    const minScaledWidth = Math.max(
      1,
      Math.floor(Math.min(...textureSizes.map((s) => s.width)) * nextScaleMultiplier),
    )
    const minScaledHeight = Math.max(
      1,
      Math.floor(Math.min(...textureSizes.map((s) => s.height)) * nextScaleMultiplier),
    )

    if (minScaledWidth < 1 || minScaledHeight < 1) {
      throw new Error(
        `Failed to pack textures using NFDH algorithm. Could not fit textures even after scaling down to 1x1 pixels.`,
      )
    }

    // テクスチャサイズをスケーリング
    const scaledSizes = textureSizes.map((size) => ({
      width: Math.max(1, Math.floor(size.width * nextScaleMultiplier)),
      height: Math.max(1, Math.floor(size.height * nextScaleMultiplier)),
    }))

    // 再帰的に再試行
    return tryPackWithScaling(
      scaledSizes,
      currentAtlasWidth,
      currentAtlasHeight,
      nextScaleMultiplier,
      maxAtlasWidth,
      maxAtlasHeight,
    )
  }

  return tryPackWithScaling(sizes, atlasWidth, atlasHeight, 1.0, atlasWidth * 8, atlasHeight * 8)
}

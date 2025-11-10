
import type { IslandTransform, PackingResult, Vector2 } from '../types'

const TARGET_WIDTH = 1
const PADDING = 0.01

class UVWidthBox {
  public readonly width: number
  public readonly padding: number
  public readonly floor: number
  public readonly height: number
  private readonly upper: IslandTransform[] = []
  private readonly lower: IslandTransform[] = []

  constructor(floor: number, height: number, padding: number, width: number) {
    this.width = width
    this.height = height
    this.floor = floor
    this.padding = padding
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
      const islandWidth = isFirst
        ? this.padding * 0.5 + islandTf.size.x + this.padding
        : this.padding + islandTf.size.x + this.padding

      if (emptyWidthSize > islandWidth) {
        islandTf.position.x = isFirst
          ? emptyXMin + this.padding
          : emptyXMin + this.padding * 2
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
      const islandWidth = isFirst
        ? this.padding * 2 + islandTf.size.x + this.padding
        : this.padding * 2 + islandTf.size.x + this.padding * 2

      if (emptyWidthSize > islandWidth) {
        islandTf.position.x = isFirst
          ? emptyXMax - islandTf.size.x - this.padding
          : emptyXMax - islandTf.size.x - this.padding * 2
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
      if (targetF2Height < island.size.y + this.padding * 2) {
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
      if (targetC2Height < island.size.y + this.padding * 2) {
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
  islandPadding: number,
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
    const floor = isFirstBox
      ? islandPadding
      : uvWidthBoxes[uvWidthBoxes.length - 1].ceil + islandPadding * 2
    const newWithBox = new UVWidthBox(
      floor,
      islandTf.size.y,
      islandPadding,
      TARGET_WIDTH,
    )
    uvWidthBoxes.push(newWithBox)

    if (!newWithBox.trySetBox(islandTf)) {
      return false // Should not happen on the first try
    }
  }

  if (uvWidthBoxes.length === 0) return true
  const lastHeight = uvWidthBoxes[uvWidthBoxes.length - 1].ceil
  return lastHeight + islandPadding <= targetHeight
}

export function nextFitDecreasingHeightPlusFloorCeiling(
  islands: IslandTransform[],
  targetHeight: number,
  islandPadding: number = PADDING,
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

  if (tryNFDHPlasFC(islands, targetHeight, islandPadding)) {
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
  padding: number = PADDING,
): Promise<PackingResult> {
  const islands: IslandTransform[] = sizes.map((size, i) => ({
    position: { x: 0, y: 0 },
    size: { x: size.width / atlasWidth, y: size.height / atlasHeight },
    rotation: 0,
    originalIndex: i,
  }))

  const success = nextFitDecreasingHeightPlusFloorCeiling(
    islands,
    1.0, // Target height is normalized to 1.0
    padding / atlasWidth,
  )

  if (!success) {
    throw new Error('Failed to pack textures using NFDH algorithm.')
  }

  const packed = islands.map((tf) => ({
    index: tf.originalIndex,
    x: Math.round(tf.position.x * atlasWidth),
    y: Math.round(tf.position.y * atlasHeight),
    width: Math.round(tf.size.x * atlasWidth),
    height: Math.round(tf.size.y * atlasHeight),
    originalWidth: sizes[tf.originalIndex].width,
    originalHeight: sizes[tf.originalIndex].height,
  }))

  return {
    atlasWidth,
    atlasHeight,
    packed,
  }
}

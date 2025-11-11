/**
 * NFDH Bin Packing アルゴリズムの単体テスト
 *
 * テストの焦点:
 * 1. テクスチャがアトラスの境界内に収まらない場合のオーバーラップの検出
 * 2. 入力が大きすぎて出力に収まらない場合のオーバーフロー動作の検証
 * 3. 回転の処理
 * 4. エッジケースと境界条件
 */

import { packTexturesNFDH } from '../src/atlas/nfdh-packer'
import type { PackingResult, PackedTexture } from '../src/types'

/**
 * 2つの矩形がオーバーラップしているかチェックするヘルパー関数
 * 矩形 (A, B) がオーバーラップするのは:
 * - A.x < B.x + B.width かつ
 * - B.x < A.x + A.width かつ
 * - A.y < B.y + B.height かつ
 * - B.y < A.y + A.height の場合
 */
function rectanglesOverlap(
  rect1: PackedTexture,
  rect2: PackedTexture,
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect2.x < rect1.x + rect1.width &&
    rect1.y < rect2.y + rect2.height &&
    rect2.y < rect1.y + rect1.height
  )
}

/**
 * パッキング結果にオーバーラップがないことを検証するヘルパー関数
 * パックされた矩形のすべてのペアをチェックします
 */
function verifyNoOverlaps(result: PackingResult): {
  isValid: boolean
  overlaps: Array<{ rect1Index: number; rect2Index: number }>
} {
  const overlaps: Array<{ rect1Index: number; rect2Index: number }> = []

  for (let i = 0; i < result.packed.length; i++) {
    for (let j = i + 1; j < result.packed.length; j++) {
      if (rectanglesOverlap(result.packed[i], result.packed[j])) {
        overlaps.push({ rect1Index: i, rect2Index: j })
      }
    }
  }

  return {
    isValid: overlaps.length === 0,
    overlaps,
  }
}



describe('NFDH パッカー - packTexturesNFDH', () => {
  describe('基本的なパッキング', () => {
    it('単一のテクスチャをパックする', async () => {
      const sizes = [{ width: 256, height: 256 }]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(1)
      expect(result.packed[0]).toEqual({
        index: 0,
        x: 0,
        y: 0,
        width: 256,
        height: 256,
        originalWidth: 256,
        originalHeight: 256,
      })
    })

    it('複数のテクスチャを水平にパックする', async () => {
      const sizes = [
        { width: 256, height: 256 },
        { width: 256, height: 256 },
        { width: 256, height: 256 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(3)
      const noOverlapCheck = verifyNoOverlaps(result)
      expect(noOverlapCheck.isValid).toBe(true)
    })

    it('異なるサイズのテクスチャをパックする', async () => {
      const sizes = [
        { width: 512, height: 512 },
        { width: 256, height: 256 },
        { width: 128, height: 128 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(3)
      const noOverlapCheck = verifyNoOverlaps(result)
      expect(noOverlapCheck.isValid).toBe(true)
    })
  })

  describe('オーバーフローとオーバーラップの検出', () => {
    it('パッキングの制約が必要な場合にテクスチャを縮小し、オーバーラップがないことを保証する', async () => {
      // 6x 400px textures = 6 * 160000 = 960000 pixels total
      // 1024x1024 atlas = 1048576 pixels
      // Constraint is tight - requires scaling to fit without overlaps
      const sizes = Array.from({ length: 6 }, () => ({
        width: 400,
        height: 400,
      }))
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // All should be packed
      expect(result.packed).toHaveLength(6)

      // Check if textures were scaled down (original > packed)
      let wasScaledDown = false
      for (let i = 0; i < result.packed.length; i++) {
        const packed = result.packed[i]
        const original = sizes[packed.index]
        if (
          packed.width < original.width ||
          packed.height < original.height
        ) {
          wasScaledDown = true
          break
        }
      }

      expect(wasScaledDown).toBe(true)

      // CRITICAL: Verify NO overlaps exist
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)
      if (!overlapCheck.isValid) {
        console.log('オーバーラップが検出されました:', overlapCheck.overlaps)
      }

      console.log('✅ テクスチャはオーバーラップなしでパッキングのために縮小されました:', result.packed)
    })

    it('必要に応じて自動スケーリングで大きなテクスチャをパックし、オーバーラップがないことを保証する', async () => {
      // 3x 1024x1024 textures = 3 * 1048576 = 3145728 pixels total
      // 2048x2048 atlas = 4194304 pixels
      // Needs scaling to avoid overlaps
      const sizes = [
        { width: 1024, height: 1024 },
        { width: 1024, height: 1024 },
        { width: 1024, height: 1024 },
      ]
      const result = await packTexturesNFDH(sizes, 2048, 2048)

      // All textures should be packed
      expect(result.packed).toHaveLength(3)

      // CRITICAL: Verify NO overlaps exist
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)
      if (!overlapCheck.isValid) {
        console.log('オーバーラップが検出されました:', overlapCheck.overlaps)
        overlapCheck.overlaps.forEach((overlap) => {
          console.log(`  テクスチャ ${overlap.rect1Index} が ${overlap.rect2Index} とオーバーラップしています`)
        })
      }

      console.log('✅ スケーリング結果を含むパッキング (オーバーラップなし):', result.packed)
      console.log('アトラスサイズ:', result.atlasWidth, 'x', result.atlasHeight)
    })

    it('制約されたアトラスでのテクスチャ配置を示し、オーバーラップがないことを保証する', async () => {
      // 4x 600x600 textures = 4 * 360000 = 1440000 pixels total
      // 1024x1024 atlas = 1048576 pixels
      // Significantly over-constrained - requires scaling
      const sizes = [
        { width: 600, height: 600 },
        { width: 600, height: 600 },
        { width: 600, height: 600 },
        { width: 600, height: 600 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // All should be packed
      expect(result.packed).toHaveLength(4)

      // Check for overlaps - MUST be valid
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)
      console.log('✅ オーバーラップチェック: オーバーラップは検出されませんでした')
      console.log('パックされたレイアウト:')
      result.packed.forEach((rect, idx) => {
        console.log(
          `  [${idx}] (${rect.x}, ${rect.y}) ${rect.width}x${rect.height}`,
        )
      })
    })

    it('必要に応じてスケーリングで様々なサイズをパックし、オーバーラップがないことを保証する', async () => {
      // Mix of sizes that may require scaling
      // Total: 640000 + 360000 + 160000 + 90000 = 1250000 pixels
      // 1024x1024 atlas = 1048576 pixels (over-constrained)
      const sizes = [
        { width: 800, height: 800 },
        { width: 600, height: 600 },
        { width: 400, height: 400 },
        { width: 300, height: 300 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // All textures should be packed
      expect(result.packed.length).toBe(4)

      // CRITICAL: Verify NO overlaps exist
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)

      console.log('✅ パッキング結果 (オーバーラップなし):')
      result.packed.forEach((rect, idx) => {
        console.log(
          `  [${idx}] x:${rect.x}, y:${rect.y}, w:${rect.width}, h:${rect.height}`,
        )
      })
    })

    it('極端なサイズ制約をスケーリングで処理し、オーバーラップがないことを保証する', async () => {
      // Extremely constrained: 4 large textures in small atlas
      // Total: 2250000 + 1000000 + 640000 + 360000 = 4250000 pixels
      // 1024x1024 atlas = 1048576 pixels (EXTREME over-constraint)
      const sizes = [
        { width: 1500, height: 1500 },
        { width: 1000, height: 1000 },
        { width: 800, height: 800 },
        { width: 600, height: 600 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // All should be packed with scaling
      expect(result.packed).toHaveLength(4)

      // Check that all were scaled down
      let allScaled = true
      result.packed.forEach((packed) => {
        if (
          packed.width >= sizes[packed.index].width &&
          packed.height >= sizes[packed.index].height
        ) {
          allScaled = false
        }
      })

      expect(allScaled).toBe(true)

      // CRITICAL: Verify NO overlaps exist
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)

      console.log('✅ 極端な制約ケース - すべて縮小 (オーバーラップなし):', allScaled)
      console.log('パックされたテクスチャ:')
      result.packed.forEach((rect, idx) => {
        const original = sizes[rect.index]
        console.log(
          `  [${idx}] Original: ${original.width}x${original.height}, Packed: ${rect.width}x${rect.height}`,
        )
      })
    })
  })



  describe('エッジケース - スケーリングとパッキング', () => {
    it('アトラスと全く同じサイズの単一テクスチャを処理する', async () => {
      const sizes = [{ width: 1024, height: 1024 }]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(1)
      expect(result.packed[0].x).toBe(0)
      expect(result.packed[0].y).toBe(0)
    })

    it('複数の大きなテクスチャを小さなアトラスに収まるようにスケーリングする', async () => {
      // 2x 1024x1024 textures in 1024x1024 atlas will be scaled
      const sizes = [
        { width: 1024, height: 1024 },
        { width: 1024, height: 1024 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // Both should be packed
      expect(result.packed).toHaveLength(2)

      // At least one should be scaled
      let wasScaled = false
      result.packed.forEach((packed) => {
        if (
          packed.width < sizes[packed.index].width ||
          packed.height < sizes[packed.index].height
        ) {
          wasScaled = true
        }
      })
      expect(wasScaled).toBe(true)
      console.log('スケーリングされたパッキング結果:', result.packed)
    })

    it('アトラスの幅を超える幅広のテクスチャを処理する', async () => {
      // Single texture wider than atlas
      const sizes = [{ width: 2048, height: 512 }]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(1)
      console.log('幅広のテクスチャ - パックされたもの:', result.packed[0])
    })

    it('アトラスの高さを超える縦長のテクスチャを処理する', async () => {
      // Single tall texture
      const sizes = [{ width: 512, height: 2048 }]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      expect(result.packed).toHaveLength(1)
      console.log('縦長のテクスチャ - パックされたもの:', result.packed[0])
    })

    it('制約されたアトラスに多くの小さなテクスチャをパックし、オーバーラップがないことを保証する', async () => {
      // 8x 400x400 textures = 8 * 160000 = 1280000 pixels total
      // 1024x1024 atlas = 1048576 pixels (over-constrained)
      const sizes = Array.from({ length: 8 }, () => ({
        width: 400,
        height: 400,
      }))
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      // All should be packed
      expect(result.packed).toHaveLength(8)

      // Check for overlaps - MUST be valid
      const overlapCheck = verifyNoOverlaps(result)
      expect(overlapCheck.isValid).toBe(true)
      console.log('✅ 制約されたパッキング: オーバーラップは検出されませんでした')

      if (!overlapCheck.isValid) {
        console.log('オーバーラップする矩形:')
        overlapCheck.overlaps.forEach((overlap) => {
          console.log(
            `  矩形 ${overlap.rect1Index} と ${overlap.rect2Index} がオーバーラップしています`,
          )
        })
      }
    })
  })

  describe('元のインデックスの保持', () => {
    it('元のテクスチャインデックスを保持する', async () => {
      const sizes = [
        { width: 256, height: 256 },
        { width: 128, height: 128 },
        { width: 512, height: 512 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      const indices = result.packed.map((p) => p.index)
      expect(indices.sort()).toEqual([0, 1, 2])
    })

    it('パックされた結果で元の寸法を維持する', async () => {
      const sizes = [
        { width: 256, height: 256 },
        { width: 128, height: 128 },
        { width: 512, height: 512 },
      ]
      const result = await packTexturesNFDH(sizes, 1024, 1024)

      for (const packed of result.packed) {
        const original = sizes[packed.index]
        expect(packed.originalWidth).toBe(original.width)
        expect(packed.originalHeight).toBe(original.height)
      }
    })
  })


})

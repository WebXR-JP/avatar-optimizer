/**
 * テクスチャパッキングのエンジン互換性テスト
 *
 * rectpack-ts の元の PackerBBF は「空配列への reduce の TypeError」を
 * V8 のメッセージ文字列で判定しており、Safari (JavaScriptCore) では
 * メッセージが小文字始まりのため判定に外れてパッキングが常に失敗していた。
 * ここでは Array.prototype.reduce を JSC と同じメッセージで throw するよう差し替え、
 * Safari 相当の環境でもパッキングできることを確認する。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { packTextures } from '../../../src/util/texture/packing'

const originalReduce = Array.prototype.reduce

/** 初期値なしで空配列を reduce したときに JSC と同じメッセージで throw する reduce */
function jscLikeReduce(this: unknown[], ...args: unknown[]) {
  if (this.length === 0 && args.length < 2) {
    throw new TypeError('reduce of empty array with no initial value')
  }
  return (originalReduce as (...a: unknown[]) => unknown).apply(this, args)
}

describe('packTextures', () => {
  it('テクスチャをアトラス内に重ならずに配置する', async () => {
    const result = await packTextures([
      { width: 1024, height: 1024 },
      { width: 512, height: 512 },
      { width: 512, height: 256 },
    ])

    expect(result.packed).toHaveLength(3)
    for (const p of result.packed) {
      expect(p.offset.x + p.scale.x).toBeLessThanOrEqual(1)
      expect(p.offset.y + p.scale.y).toBeLessThanOrEqual(1)
    }
  })

  describe('Safari (JavaScriptCore) のエラーメッセージ環境', () => {
    beforeEach(() => {
      // eslint-disable-next-line no-extend-native
      Array.prototype.reduce = jscLikeReduce as typeof Array.prototype.reduce
    })

    afterEach(() => {
      // eslint-disable-next-line no-extend-native
      Array.prototype.reduce = originalReduce
    })

    it('reduce のメッセージに依存せずパッキングできる', async () => {
      const result = await packTextures([
        { width: 1024, height: 1024 },
        { width: 1024, height: 1024 },
        { width: 512, height: 512 },
      ])

      expect(result.packed).toHaveLength(3)
    })

    it('収まらない場合は縮小して詰め込む', async () => {
      const result = await packTextures(
        Array.from({ length: 8 }, () => ({ width: 2048, height: 2048 })),
      )

      expect(result.packed).toHaveLength(8)
      for (const p of result.packed) {
        expect(p.scale.x).toBeLessThan(1)
      }
    })
  })
})

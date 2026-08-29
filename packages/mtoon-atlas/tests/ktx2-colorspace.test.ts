/**
 * KTX2 の colorSpace を尊重することのテスト (GitHub Issue #40)
 *
 * three.js は圧縮テクスチャのアップロード時に texture.colorSpace を見て
 * 内部フォーマット（sRGB 版かどうか）を選ぶ。
 * MToonAtlasLoaderPlugin がスロット名から colorSpace を強制上書きしていると、
 * KTX2 の DFD transferFunction が誤っていても結果的に正しく表示されてしまい、
 * エンコード時のバグを隠してしまう（debug-viewer と実環境で表示が食い違う）。
 *
 * KTX2Loader が DFD から設定した colorSpace を保つことを確認する。
 */

import { describe, it, expect } from 'vitest'
import {
  CompressedTexture,
  DataTexture,
  LinearSRGBColorSpace,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { applyAtlasTextureColorSpace } from '../src/extensions/MToonAtlasLoaderPlugin'

/** KTX2Loader が返すのと同じ形の CompressedTexture を作る */
function createCompressedTexture(colorSpace: string): CompressedTexture
{
  const mipmaps = [{ data: new Uint8Array(8), width: 4, height: 4 }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const texture = new CompressedTexture(mipmaps as any, 4, 4)
  texture.colorSpace = colorSpace
  return texture
}

function createPlainTexture(): DataTexture
{
  return new DataTexture(
    new Uint8Array([255, 0, 0, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  )
}

describe('KTX2 の colorSpace 尊重 (Issue #40)', () =>
{
  describe('圧縮テクスチャ（KTX2 由来）', () =>
  {
    it('KTX2Loader が設定した sRGB を上書きしない', () =>
    {
      const texture = createCompressedTexture(SRGBColorSpace)
      applyAtlasTextureColorSpace(texture, 'baseColor')
      expect(texture.colorSpace).toBe(SRGBColorSpace)
    })

    it('DFD がリニアなら、カラースロットでも上書きしない', () =>
    {
      // これが本題。ここで sRGB に塗り替えると、KTX2 のタグが誤っていても
      // 正しく表示されてしまい、エンコード側のバグを検知できなくなる
      const texture = createCompressedTexture(LinearSRGBColorSpace)
      applyAtlasTextureColorSpace(texture, 'baseColor')
      expect(texture.colorSpace).toBe(LinearSRGBColorSpace)
    })

    it('非カラースロットでも KTX2 側の指定を保つ', () =>
    {
      const texture = createCompressedTexture(NoColorSpace)
      applyAtlasTextureColorSpace(texture, 'normal')
      expect(texture.colorSpace).toBe(NoColorSpace)
    })
  })

  describe('非圧縮テクスチャ（PNG など）', () =>
  {
    it('カラースロットは sRGB になる', () =>
    {
      for (const key of ['baseColor', 'shade', 'emissive', 'matcap', 'rim'])
      {
        const texture = createPlainTexture()
        applyAtlasTextureColorSpace(texture, key)
        expect(texture.colorSpace, key).toBe(SRGBColorSpace)
      }
    })

    it('非カラースロットは NoColorSpace になる', () =>
    {
      for (const key of ['normal', 'shadingShift', 'uvAnimationMask'])
      {
        const texture = createPlainTexture()
        applyAtlasTextureColorSpace(texture, key)
        expect(texture.colorSpace, key).toBe(NoColorSpace)
      }
    })
  })

  describe('clone 経由でも保たれる', () =>
  {
    it('Texture.clone() は colorSpace を引き継ぐ', () =>
    {
      // ローダーは GLTFLoader のキャッシュを汚さないよう clone() してから
      // colorSpace を決める。clone で失われないことを確認する
      const texture = createCompressedTexture(LinearSRGBColorSpace)
      const cloned = texture.clone()
      expect(cloned.colorSpace).toBe(LinearSRGBColorSpace)

      applyAtlasTextureColorSpace(cloned, 'baseColor')
      expect(cloned.colorSpace).toBe(LinearSRGBColorSpace)
    })
  })
})

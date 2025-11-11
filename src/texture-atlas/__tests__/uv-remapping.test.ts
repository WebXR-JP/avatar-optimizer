/**
 * UV 座標再マッピング単体テスト
 *
 * UV 座標の再計算ロジックが正確に動作することを検証
 */

import { remapUVCoordinate, remapPrimitiveUVs } from '../src/atlas/uv-remapping'
import { Document, Primitive } from '@gltf-transform/core'

describe('UV Remapping', () => {
  describe('remapUVCoordinate', () => {
    it('should remap UV coordinates correctly', () => {
      // テクスチャが 512x512 で、アトラスの (0, 0) に配置
      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 512,
        sourceHeight: 512,
        targetX: 0,
        targetY: 0,
        targetWidth: 512,
        targetHeight: 512,
      }

      const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, 2048, 2048)

      // 元の UV (0.5, 0.5) は元テクスチャ内で (256, 256) ピクセル
      // アトラス内では (0 + 256, 0 + 256) = (256, 256) ピクセル
      // アトラス内の正規化 UV は (256 / 2048, 256 / 2048) = (0.125, 0.125)
      expect(newU).toBeCloseTo(0.125, 3)
      expect(newV).toBeCloseTo(0.125, 3)
    })

    it('should remap UV coordinates with offset atlas position', () => {
      // テクスチャが 512x512 で、アトラスの (512, 512) に配置
      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 512,
        sourceHeight: 512,
        targetX: 512,
        targetY: 512,
        targetWidth: 512,
        targetHeight: 512,
      }

      const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, 2048, 2048)

      // 元の UV (0.5, 0.5) は元テクスチャ内で (256, 256) ピクセル
      // アトラス内では (512 + 256, 512 + 256) = (768, 768) ピクセル
      // アトラス内の正規化 UV は (768 / 2048, 768 / 2048) = (0.375, 0.375)
      expect(newU).toBeCloseTo(0.375, 3)
      expect(newV).toBeCloseTo(0.375, 3)
    })

    it('should handle corner cases at UV boundaries', () => {
      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 256,
        sourceHeight: 256,
        targetX: 0,
        targetY: 0,
        targetWidth: 256,
        targetHeight: 256,
      }

      // UV (0, 0) - left-top corner
      const { newU: u0, newV: v0 } = remapUVCoordinate(0, 0, region, 1024, 1024)
      expect(u0).toBeCloseTo(0, 3)
      expect(v0).toBeCloseTo(0, 3)

      // UV (1, 1) - right-bottom corner
      const { newU: u1, newV: v1 } = remapUVCoordinate(1, 1, region, 1024, 1024)
      expect(u1).toBeCloseTo(256 / 1024, 3) // 0.25
      expect(v1).toBeCloseTo(256 / 1024, 3) // 0.25
    })

    it('should preserve aspect ratio during remapping', () => {
      // 元テクスチャが矩形（512x256）
      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 512,
        sourceHeight: 256,
        targetX: 0,
        targetY: 0,
        targetWidth: 512,
        targetHeight: 256,
      }

      // 中央 (0.5, 0.5)
      const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, 1024, 1024)

      // 元のテクスチャ内: (256, 128)
      // アトラス内: (256, 128)
      // 正規化: (256/1024, 128/1024) = (0.25, 0.125)
      expect(newU).toBeCloseTo(0.25, 3)
      expect(newV).toBeCloseTo(0.125, 3)

      // アスペクト比が変わっていないことを確認
      // 元: 512 / 256 = 2.0
      // 新しい座標の影響度: 0.25 / 0.125 = 2.0
      expect(newU / newV).toBeCloseTo((0.5 * 512) / (0.5 * 256), 3)
    })
  })

  describe('remapPrimitiveUVs', () => {
    let document: Document

    beforeEach(() => {
      document = new Document()
    })

    it('should update primitive UV attributes', () => {
      // プリミティブを作成
      const primitive = document.createPrimitive()

      // TEXCOORD_0 を設定（4 頂点、各 2 成分）
      const originalUVs = new Float32Array([
        0.0, 0.0,   // 頂点 0
        1.0, 0.0,   // 頂点 1
        1.0, 1.0,   // 頂点 2
        0.0, 1.0,   // 頂点 3
      ])

      const uvAttribute = document.createAccessor('uv-accessor')
        .setType('VEC2')
        .setArray(originalUVs)

      primitive.setAttribute('TEXCOORD_0', uvAttribute)

      // IslandRegion 情報（テクスチャが 256x256 で、アトラスの (0, 0) に配置）
      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 256,
        sourceHeight: 256,
        targetX: 0,
        targetY: 0,
        targetWidth: 256,
        targetHeight: 256,
      }

      // UV を再マッピング
      remapPrimitiveUVs(primitive, region, 512, 512)

      // 更新された値を確認
      const remappedUVs = uvAttribute.getArray()
      if (!remappedUVs) fail('UV array should exist')

      // 元の (0, 0) は (0, 0) のままであるべき
      expect(remappedUVs[0]).toBeCloseTo(0, 3)
      expect(remappedUVs[1]).toBeCloseTo(0, 3)

      // 元の (1, 0) は (256/512, 0/512) = (0.5, 0) であるべき
      expect(remappedUVs[2]).toBeCloseTo(0.5, 3)
      expect(remappedUVs[3]).toBeCloseTo(0, 3)

      // 元の (1, 1) は (256/512, 256/512) = (0.5, 0.5) であるべき
      expect(remappedUVs[4]).toBeCloseTo(0.5, 3)
      expect(remappedUVs[5]).toBeCloseTo(0.5, 3)

      // 元の (0, 1) は (0, 256/512) = (0, 0.5) であるべき
      expect(remappedUVs[6]).toBeCloseTo(0, 3)
      expect(remappedUVs[7]).toBeCloseTo(0.5, 3)
    })

    it('should handle primitive without UV coordinates', () => {
      // UV なしのプリミティブ
      const primitive = document.createPrimitive()

      const region = {
        sourceTextureIndex: 0,
        sourceWidth: 256,
        sourceHeight: 256,
        targetX: 0,
        targetY: 0,
        targetWidth: 256,
        targetHeight: 256,
      }

      // エラーなく実行されるべき
      expect(() =>
        remapPrimitiveUVs(primitive, region, 512, 512),
      ).not.toThrow()
    })
  })
})

import { MToonMaterial } from '@pixiv/three-vrm'
import { DataTexture, Texture, Vector2 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildLayersForSlot,
  createSolidColorTexture,
  SLOT_DEFAULT_FILL,
} from '../../src/process/gen-atlas'
import type { MToonTextureSlot, PatternMaterialMapping } from '../../src/types'

/**
 * テスト用のPatternMaterialMappingを作成するヘルパー
 */
function createMapping(materialIndices: number[]): PatternMaterialMapping {
  return {
    pattern: { slots: new Map() },
    materialIndices,
    textureDescriptor: { width: 512, height: 512 },
  }
}

/**
 * テスト用のOffsetScaleを作成するヘルパー
 */
function createPlacement(ox: number, oy: number, sx: number, sy: number) {
  return { offset: new Vector2(ox, oy), scale: new Vector2(sx, sy) }
}

describe('gen-atlas', () => {
  describe('buildLayersForSlot', () => {
    it('テクスチャありの場合、そのテクスチャが返る', () => {
      const tex = new Texture()
      tex.image = { width: 512, height: 512 }

      const mat = new MToonMaterial()
      mat.map = tex

      const materials = [mat]
      const mappings = [createMapping([0])]
      const placements = [createPlacement(0, 0, 1, 1)]

      const layers = buildLayersForSlot(materials, mappings, placements, 'map')

      expect(layers).toHaveLength(1)
      expect(layers[0].image).toBe(tex)
      expect(layers[0].uvTransform).toBe(placements[0])
    })

    it('テクスチャなしの場合、SLOT_DEFAULT_FILLに基づくダミーテクスチャが返る', () => {
      const mat = new MToonMaterial()
      // map テクスチャを設定しない

      const materials = [mat]
      const mappings = [createMapping([0])]
      const placements = [createPlacement(0, 0, 0.5, 0.5)]

      const layers = buildLayersForSlot(materials, mappings, placements, 'map')

      expect(layers).toHaveLength(1)
      // ダミーテクスチャが生成される（DataTexture）
      expect(layers[0].image).toBeInstanceOf(DataTexture)
      expect(layers[0].uvTransform).toBe(placements[0])

      // mapのデフォルト色は白 [255, 255, 255, 255]
      const dataTexture = layers[0].image as DataTexture
      const data = dataTexture.image.data
      expect(data[0]).toBe(255) // R
      expect(data[1]).toBe(255) // G
      expect(data[2]).toBe(255) // B
      expect(data[3]).toBe(255) // A
    })

    it('テクスチャなしのemissiveMapスロットでは黒のダミーが返る', () => {
      const mat = new MToonMaterial()

      const layers = buildLayersForSlot(
        [mat],
        [createMapping([0])],
        [createPlacement(0, 0, 1, 1)],
        'emissiveMap',
      )

      expect(layers).toHaveLength(1)
      const dataTexture = layers[0].image as DataTexture
      const data = dataTexture.image.data
      // emissiveMapのデフォルト色は [0, 0, 0, 255]
      expect(data[0]).toBe(0)
      expect(data[1]).toBe(0)
      expect(data[2]).toBe(0)
      expect(data[3]).toBe(255)
    })

    it('テクスチャなしのnormalMapスロットではフラット法線のダミーが返る', () => {
      const mat = new MToonMaterial()

      const layers = buildLayersForSlot(
        [mat],
        [createMapping([0])],
        [createPlacement(0, 0, 1, 1)],
        'normalMap',
      )

      expect(layers).toHaveLength(1)
      const dataTexture = layers[0].image as DataTexture
      const data = dataTexture.image.data
      // normalMapのデフォルト色は [128, 128, 255, 255]（フラット法線）
      expect(data[0]).toBe(128)
      expect(data[1]).toBe(128)
      expect(data[2]).toBe(255)
      expect(data[3]).toBe(255)
    })

    it('混在（テクスチャあり・なし）の場合、両方正しく処理される', () => {
      const tex = new Texture()
      tex.image = { width: 256, height: 256 }

      const matWithTex = new MToonMaterial()
      matWithTex.map = tex

      const matWithoutTex = new MToonMaterial()

      const materials = [matWithTex, matWithoutTex]
      const mappings = [createMapping([0]), createMapping([1])]
      const placements = [
        createPlacement(0, 0, 0.5, 0.5),
        createPlacement(0.5, 0, 0.5, 0.5),
      ]

      const layers = buildLayersForSlot(materials, mappings, placements, 'map')

      expect(layers).toHaveLength(2)
      // 最初のレイヤーはオリジナルテクスチャ
      expect(layers[0].image).toBe(tex)
      // 2番目のレイヤーはダミーテクスチャ
      expect(layers[1].image).toBeInstanceOf(DataTexture)
    })

    it('複数マテリアルが同一パターンの場合、最初のマテリアルを代表として使用', () => {
      const tex = new Texture()
      tex.image = { width: 512, height: 512 }

      const mat1 = new MToonMaterial()
      mat1.map = tex
      const mat2 = new MToonMaterial()
      mat2.map = tex

      const materials = [mat1, mat2]
      // 両マテリアルが同一パターン
      const mappings = [createMapping([0, 1])]
      const placements = [createPlacement(0, 0, 1, 1)]

      const layers = buildLayersForSlot(materials, mappings, placements, 'map')

      expect(layers).toHaveLength(1)
      expect(layers[0].image).toBe(tex)
    })
  })

  describe('SLOT_DEFAULT_FILL', () => {
    it('全スロットにデフォルト色が定義されている', () => {
      const expectedSlots: MToonTextureSlot[] = [
        'map',
        'shadeMultiplyTexture',
        'emissiveMap',
        'normalMap',
        'shadingShiftTexture',
        'matcapTexture',
        'rimMultiplyTexture',
        'outlineWidthMultiplyTexture',
        'uvAnimationMaskTexture',
      ]

      for (const slot of expectedSlots) {
        expect(SLOT_DEFAULT_FILL[slot]).toBeDefined()
        expect(SLOT_DEFAULT_FILL[slot]).toHaveLength(4)
      }
    })

    it('乗算スロットは白、加算スロットは黒がデフォルト', () => {
      // 乗算スロット（白=無影響）
      expect(SLOT_DEFAULT_FILL.map).toEqual([255, 255, 255, 255])
      expect(SLOT_DEFAULT_FILL.shadeMultiplyTexture).toEqual([
        255, 255, 255, 255,
      ])
      expect(SLOT_DEFAULT_FILL.rimMultiplyTexture).toEqual([255, 255, 255, 255])

      // 加算スロット（黒=無影響）
      expect(SLOT_DEFAULT_FILL.emissiveMap).toEqual([0, 0, 0, 255])
    })
  })

  describe('createSolidColorTexture', () => {
    it('指定色でDataTextureを生成する', () => {
      const tex = createSolidColorTexture(128, 64, 32, 255)

      expect(tex).toBeInstanceOf(DataTexture)
      const data = (tex as DataTexture).image.data
      // 4x4テクスチャ（デフォルト）なので16ピクセル
      expect(data.length).toBe(4 * 4 * 4)
      // 最初のピクセルを検証
      expect(data[0]).toBe(128)
      expect(data[1]).toBe(64)
      expect(data[2]).toBe(32)
      expect(data[3]).toBe(255)
    })

    it('カスタムサイズで生成できる', () => {
      const tex = createSolidColorTexture(0, 0, 0, 255, 2, 2)

      const data = (tex as DataTexture).image.data
      expect(data.length).toBe(2 * 2 * 4)
    })
  })
})

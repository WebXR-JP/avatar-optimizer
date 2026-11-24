/**
 * MToonAtlasMaterial (WebGL) / MToonAtlasNodeMaterial (WebGPU / WebGL2) 共通の
 * 実描画ブラウザテスト用ヘルパー群
 */

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  FloatType,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { expect } from 'vitest'

/** 複数体グリッドテスト用の判別しやすい 6 色パレット */
export const GRID_PALETTE: readonly [number, number, number][] = [
  [1, 0, 0], // 赤
  [0, 1, 0], // 緑
  [0, 0, 1], // 青
  [1, 1, 0], // 黄
  [1, 0, 1], // マゼンタ
  [0, 1, 1], // シアン
]

/**
 * 2 スロット分のクワッド（左半分 = slot 0、右半分 = slot 1）を持つジオメトリを作る
 */
export function createTwoSlotQuadGeometry(
  xOffset: number,
  yOffset: number,
  width: number,
  height: number,
): BufferGeometry {
  const halfW = width / 2
  const x0 = xOffset - halfW
  const xMid = xOffset
  const x1 = xOffset + halfW
  const y0 = yOffset - height / 2
  const y1 = yOffset + height / 2

  const positions = new Float32Array([
    // 左半分（slot 0）
    x0,
    y0,
    0,
    xMid,
    y0,
    0,
    xMid,
    y1,
    0,
    x0,
    y0,
    0,
    xMid,
    y1,
    0,
    x0,
    y1,
    0,
    // 右半分（slot 1）
    xMid,
    y0,
    0,
    x1,
    y0,
    0,
    x1,
    y1,
    0,
    xMid,
    y0,
    0,
    x1,
    y1,
    0,
    xMid,
    y1,
    0,
  ])
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ])
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
  ])
  const slots = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('mtoonMaterialSlot', new BufferAttribute(slots, 1))
  return geometry
}

/**
 * 指定スロット 1 つだけを持つクワッドジオメトリを作る（複数体・バケット境界テスト用）
 */
export function createSingleSlotQuadGeometry(
  xOffset: number,
  yOffset: number,
  width: number,
  height: number,
  slotIndex: number,
): BufferGeometry {
  const halfW = width / 2
  const halfH = height / 2
  const x0 = xOffset - halfW
  const x1 = xOffset + halfW
  const y0 = yOffset - halfH
  const y1 = yOffset + halfH

  const positions = new Float32Array([
    x0,
    y0,
    0,
    x1,
    y0,
    0,
    x1,
    y1,
    0,
    x0,
    y0,
    0,
    x1,
    y1,
    0,
    x0,
    y1,
    0,
  ])
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ])
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])
  const slots = new Float32Array([
    slotIndex,
    slotIndex,
    slotIndex,
    slotIndex,
    slotIndex,
    slotIndex,
  ])

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('mtoonMaterialSlot', new BufferAttribute(slots, 1))
  return geometry
}

/**
 * 2 スロット分のパラメータ Float32Array を構築する
 */
export function createParameterData(
  slot0Rgb: [number, number, number],
  slot1Rgb: [number, number, number],
  outlineWidth = 0,
  outlineColor: [number, number, number] = [0, 0, 0],
): Float32Array {
  const texelsPerSlot = 9
  const data = new Float32Array(2 * texelsPerSlot * 4)

  const writeSlot = (slot: number, rgb: [number, number, number]) => {
    const base = slot * texelsPerSlot * 4
    // texel 0: baseColor (rgb) + opacity (a)
    data[base + 0] = rgb[0]
    data[base + 1] = rgb[1]
    data[base + 2] = rgb[2]
    data[base + 3] = 1
    // texel 1: shadeColor + shadingShiftTextureScale
    data[base + 4] = rgb[0]
    data[base + 5] = rgb[1]
    data[base + 6] = rgb[2]
    data[base + 7] = 1
    // texel 2: emissiveColor + emissiveIntensity
    data[base + 8] = rgb[0]
    data[base + 9] = rgb[1]
    data[base + 10] = rgb[2]
    data[base + 11] = 1
    // texel 3: matcapColor + outlineWidth
    data[base + 12] = 0
    data[base + 13] = 0
    data[base + 14] = 0
    data[base + 15] = outlineWidth
    // texel 4: outlineColor + outlineLightingMix
    data[base + 16] = outlineColor[0]
    data[base + 17] = outlineColor[1]
    data[base + 18] = outlineColor[2]
    data[base + 19] = 0
    // texel 6: parametricRimFresnelPower=5, shadingToony=0.9, rimLightingMix=1
    data[base + 24] = 5
    data[base + 25] = 0.9
    data[base + 26] = 1
    // texel 7: normalScale=(1,1)
    data[base + 28] = 1
    data[base + 29] = 1
    // texel 8: shadingShift=0 -> 0.5
    data[base + 32] = 0.5
  }

  writeSlot(0, slot0Rgb)
  writeSlot(1, slot1Rgb)
  return data
}

/**
 * 任意スロット数のパラメータ配列を作り、指定スロットへ diffuse 色（emissive=0）を書き込む
 */
export function createMultiSlotParameterData(
  slotCount: number,
  targetSlot: number,
  rgb: [number, number, number],
): Float32Array {
  const texelsPerSlot = 9
  const data = new Float32Array(slotCount * texelsPerSlot * 4)
  for (let slot = 0; slot < slotCount; slot++) {
    const base = slot * texelsPerSlot * 4
    data[base + 3] = 1 // opacity
    data[base + 7] = 1 // shadingShiftTextureScale
    data[base + 24] = 5 // parametricRimFresnelPower
    data[base + 25] = 0.9 // shadingToony
    data[base + 26] = 1 // rimLightingMix
    data[base + 28] = 1 // normalScale.x
    data[base + 29] = 1 // normalScale.y
    data[base + 32] = 0.5 // shadingShift=0 -> 0.5
  }

  const targetBase = targetSlot * texelsPerSlot * 4
  data[targetBase + 0] = rgb[0]
  data[targetBase + 1] = rgb[1]
  data[targetBase + 2] = rgb[2]
  data[targetBase + 4] = rgb[0]
  data[targetBase + 5] = rgb[1]
  data[targetBase + 6] = rgb[2]
  return data
}

/**
 * 生 Float32Array から GLSL 版 MToonAtlasMaterial 用の RGBA32F DataTexture を作る
 */
export function createParameterDataTexture(
  data: Float32Array,
  slotCount: number,
  texelsPerSlot = 9,
): DataTexture {
  const texture = new DataTexture(
    data,
    texelsPerSlot,
    slotCount,
    RGBAFormat,
    FloatType,
  )
  texture.flipY = false
  texture.colorSpace = NoColorSpace
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * 単色 2x2 の DataTexture を作る（アトラステクスチャ切替の検証用）
 */
export function createSolidTexture(
  r: number,
  g: number,
  b: number,
): DataTexture {
  const bytes = new Uint8Array([
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
  ])
  const tex = new DataTexture(bytes, 2, 2, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/**
 * 描画済み canvas から (x, y) の RGBA（0〜255）を読む
 */
export function sampleCanvasPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): [number, number, number, number] {
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  const ctx = copy.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)
  const pixel = ctx.getImageData(x, y, 1, 1).data
  return [pixel[0], pixel[1], pixel[2], pixel[3]]
}

/**
 * 描画済み canvas の指定矩形領域内の非背景ピクセル数と平均 RGB を集計する
 */
export function measureRegionColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): { nonBlackCount: number; avgR: number; avgG: number; avgB: number } {
  const copy = document.createElement('canvas')
  copy.width = canvas.width
  copy.height = canvas.height
  const ctx = copy.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)
  const pixels = ctx.getImageData(x, y, w, h).data

  let nonBlackCount = 0
  let sumR = 0
  let sumG = 0
  let sumB = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    if (r + g + b > 30) {
      nonBlackCount++
      sumR += r
      sumG += g
      sumB += b
    }
  }
  return {
    nonBlackCount,
    avgR: nonBlackCount > 0 ? sumR / nonBlackCount : 0,
    avgG: nonBlackCount > 0 ? sumG / nonBlackCount : 0,
    avgB: nonBlackCount > 0 ? sumB / nonBlackCount : 0,
  }
}

/**
 * 0〜255 のピクセル値が期待 RGB（各チャンネル 0 または 1）と一致することを検証する
 */
export function expectPixelMatchesRgb(
  pixel: [number, number, number, number],
  rgb: [number, number, number],
): void {
  for (let c = 0; c < 3; c++) {
    if (rgb[c] > 0.5) {
      expect(pixel[c]).toBeGreaterThan(180)
    } else {
      expect(pixel[c]).toBeLessThan(30)
    }
  }
}

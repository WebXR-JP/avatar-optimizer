/**
 * パラメータテクスチャのエクスポート/インポート精度テスト
 *
 * 16bit PNG エンコード/デコードによる精度劣化を検証
 */

import { describe, it, expect } from 'vitest'
import { encode as encodePng16 } from 'fast-png'
import { decode as decodePng } from 'fast-png'
import { DataTexture, FloatType, RGBAFormat } from 'three'

describe('Parameter Texture Roundtrip', () => {
  // テスト用のパラメータ値（実際の VRM で使われる典型的な値）
  const testValues = {
    baseColor: [1.0, 0.9, 0.8],       // RGB
    opacity: 1.0,                      // A
    shadeColor: [0.5, 0.4, 0.3],      // RGB
    shadingShift: -0.1,               // A (負の値もある)
    emissiveColor: [0.0, 0.0, 0.0],   // RGB
    emissiveIntensity: 0.0,           // A
    matcapColor: [1.0, 1.0, 1.0],     // RGB
    outlineWidth: 0.005,              // A (非常に小さい値)
    outlineColor: [0.0, 0.0, 0.0],    // RGB
    outlineLightingMix: 1.0,          // A
  }

  /**
   * Float32Array パラメータテクスチャを作成
   */
  function createParameterTexture(): { texture: DataTexture; data: Float32Array } {
    const width = 9  // texelsPerSlot
    const height = 1 // slotCount
    const data = new Float32Array(width * height * 4)

    // Texel 0: baseColor (RGB) + opacity (A)
    data[0] = testValues.baseColor[0]
    data[1] = testValues.baseColor[1]
    data[2] = testValues.baseColor[2]
    data[3] = testValues.opacity

    // Texel 1: shadeColor (RGB) + shadingShift (A)
    // shadingShift は -1 ~ 1 の範囲なので 0-1 に正規化
    data[4] = testValues.shadeColor[0]
    data[5] = testValues.shadeColor[1]
    data[6] = testValues.shadeColor[2]
    data[7] = (testValues.shadingShift + 1) / 2 // -1~1 を 0~1 に変換

    // Texel 2: emissiveColor (RGB) + emissiveIntensity (A)
    data[8] = testValues.emissiveColor[0]
    data[9] = testValues.emissiveColor[1]
    data[10] = testValues.emissiveColor[2]
    data[11] = testValues.emissiveIntensity

    // Texel 3: matcapColor (RGB) + outlineWidth (A)
    data[12] = testValues.matcapColor[0]
    data[13] = testValues.matcapColor[1]
    data[14] = testValues.matcapColor[2]
    data[15] = testValues.outlineWidth

    // Texel 4: outlineColor (RGB) + outlineLightingMix (A)
    data[16] = testValues.outlineColor[0]
    data[17] = testValues.outlineColor[1]
    data[18] = testValues.outlineColor[2]
    data[19] = testValues.outlineLightingMix

    // 残りの texel は 0 で埋める
    for (let i = 20; i < data.length; i++) {
      data[i] = 0
    }

    const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
    texture.needsUpdate = true

    return { texture, data }
  }

  /**
   * エクスポート処理をシミュレート（16bit PNG エンコード）
   */
  function exportToUint16(srcData: Float32Array, width: number, height: number): Uint16Array {
    const pixelCount = width * height * 4
    const uint16Data = new Uint16Array(pixelCount)

    for (let i = 0; i < pixelCount; i++) {
      const value = srcData[i]
      uint16Data[i] = Math.round(Math.min(1, Math.max(0, value)) * 65535)
    }

    return uint16Data
  }

  /**
   * PNG エンコード/デコードのラウンドトリップ
   */
  function roundtripPng16(uint16Data: Uint16Array, width: number, height: number): Uint16Array {
    // エンコード
    const pngData = encodePng16({
      width,
      height,
      depth: 16,
      channels: 4,
      data: uint16Data,
    })

    // デコード
    const decoded = decodePng(pngData)
    return new Uint16Array(decoded.data.buffer)
  }

  /**
   * WebGL テクスチャ読み込みをシミュレート（Uint16 → Float 正規化）
   */
  function simulateWebGLRead(uint16Data: Uint16Array): Float32Array {
    const floatData = new Float32Array(uint16Data.length)
    for (let i = 0; i < uint16Data.length; i++) {
      floatData[i] = uint16Data[i] / 65535
    }
    return floatData
  }

  it('should preserve outlineWidth value through 16bit PNG roundtrip', () => {
    const { data } = createParameterTexture()
    const width = 9
    const height = 1

    // オリジナル値
    const originalOutlineWidth = data[15] // texel 3, channel A

    // エクスポート
    const uint16Data = exportToUint16(data, width, height)
    const exportedOutlineWidth16 = uint16Data[15]

    // PNG ラウンドトリップ
    const roundtrippedData = roundtripPng16(uint16Data, width, height)
    const roundtrippedOutlineWidth16 = roundtrippedData[15]

    // WebGL 読み込みシミュレート
    const finalData = simulateWebGLRead(roundtrippedData)
    const finalOutlineWidth = finalData[15]

    console.log('=== outlineWidth ラウンドトリップ ===')
    console.log(`オリジナル (float): ${originalOutlineWidth}`)
    console.log(`エクスポート後 (uint16): ${exportedOutlineWidth16}`)
    console.log(`PNG デコード後 (uint16): ${roundtrippedOutlineWidth16}`)
    console.log(`最終値 (float): ${finalOutlineWidth}`)
    console.log(`誤差: ${Math.abs(originalOutlineWidth - finalOutlineWidth)}`)
    console.log(`相対誤差: ${Math.abs(originalOutlineWidth - finalOutlineWidth) / originalOutlineWidth * 100}%`)

    // 16bit の場合、0.005 * 65535 = 327.675 → 328
    // 328 / 65535 = 0.005005...
    // 相対誤差は約 0.1% 以下であるべき
    expect(Math.abs(originalOutlineWidth - finalOutlineWidth)).toBeLessThan(0.0001)
  })

  it('should preserve all parameter values through roundtrip', () => {
    const { data } = createParameterTexture()
    const width = 9
    const height = 1

    // エクスポート → PNG → インポート
    const uint16Data = exportToUint16(data, width, height)
    const roundtrippedData = roundtripPng16(uint16Data, width, height)
    const finalData = simulateWebGLRead(roundtrippedData)

    console.log('\n=== 全パラメータ比較 ===')
    console.log('Texel | Channel | Original | Final    | Error')
    console.log('------|---------|----------|----------|--------')

    const channels = ['R', 'G', 'B', 'A']
    for (let texel = 0; texel < 5; texel++) {
      for (let ch = 0; ch < 4; ch++) {
        const idx = texel * 4 + ch
        const original = data[idx]
        const final = finalData[idx]
        const error = Math.abs(original - final)
        console.log(`  ${texel}   |    ${channels[ch]}    | ${original.toFixed(6)} | ${final.toFixed(6)} | ${error.toFixed(6)}`)
      }
    }

    // 全ての値が許容誤差内であることを確認
    for (let i = 0; i < 20; i++) {
      const original = data[i]
      const final = finalData[i]
      // 16bit 精度の許容誤差: 1/65535 ≈ 0.000015
      expect(Math.abs(original - final)).toBeLessThan(0.0001)
    }
  })

  it('should compare 8bit vs 16bit precision for outlineWidth', () => {
    const outlineWidth = 0.005

    // 8bit 精度
    const uint8Value = Math.round(Math.min(1, Math.max(0, outlineWidth)) * 255)
    const recovered8bit = uint8Value / 255

    // 16bit 精度
    const uint16Value = Math.round(Math.min(1, Math.max(0, outlineWidth)) * 65535)
    const recovered16bit = uint16Value / 65535

    console.log('\n=== 8bit vs 16bit 精度比較 (outlineWidth = 0.005) ===')
    console.log(`8bit:  ${uint8Value} → ${recovered8bit.toFixed(6)} (誤差: ${Math.abs(outlineWidth - recovered8bit).toFixed(6)})`)
    console.log(`16bit: ${uint16Value} → ${recovered16bit.toFixed(6)} (誤差: ${Math.abs(outlineWidth - recovered16bit).toFixed(6)})`)

    // 16bit の方が精度が高いことを確認
    expect(Math.abs(outlineWidth - recovered16bit)).toBeLessThan(Math.abs(outlineWidth - recovered8bit))
  })
})

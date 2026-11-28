/**
 * MToonAtlasNodeMaterial（TSL / 個別 UBO 版）のテスト
 *
 * GPU を使わずに確認できる範囲（パラメータバッファ・バケット化・上限エラー・
 * キャッシュキー共有・複製・後方互換の parameterTexture・パラメータレイアウト）を検証する。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { BackSide, DataTexture, FloatType, FrontSide, RGBAFormat, Texture } from 'three'
import { materialOpacity } from 'three/tsl'
import { NodeMaterial } from 'three/webgpu'
import type { NodeBuilder } from 'three/webgpu'
import {
  DEFAULT_PARAMETER_LAYOUT,
  getMaxParameterUBOSlots,
  resolveParameterBucketSlots,
} from '../src'
import type { ParameterBufferDescriptor, ParameterTextureDescriptor } from '../src/types'
import { MToonAtlasNodeMaterial } from '../src/nodes'

function createBufferDescriptor(slotCount = 3, texelsPerSlot = 9): ParameterBufferDescriptor
{
  const data = new Float32Array(slotCount * texelsPerSlot * 4)
  for (let i = 0; i < data.length; i++)
  {
    data[i] = (i % 10) / 10
  }
  return {
    data,
    slotCount,
    texelsPerSlot,
    atlasedTextures: {
      baseColor: new Texture(),
      normal: new Texture(),
      shade: new Texture(),
    },
  }
}

function createTextureDescriptor(slotCount = 3, texelsPerSlot = 9): ParameterTextureDescriptor
{
  const data = new Float32Array(slotCount * texelsPerSlot * 4)
  data[0] = 0.25
  data[1] = 0.5
  data[2] = 0.75
  data[3] = 1.0
  const texture = new DataTexture(data, texelsPerSlot, slotCount, RGBAFormat, FloatType)
  return {
    texture,
    slotCount,
    texelsPerSlot,
    atlasedTextures: {
      baseColor: new Texture(),
      normal: new Texture(),
      shade: new Texture(),
    },
  }
}

describe('MToonAtlasNodeMaterial', () =>
{
  it('GLSL 版と共通の識別フラグと prefersParameterBuffer を持つ', () =>
  {
    expect(MToonAtlasNodeMaterial.prefersParameterBuffer).toBe(true)
    const material = new MToonAtlasNodeMaterial()
    expect(material.isMToonAtlasMaterial).toBe(true)
    expect(material.isMToonAtlasNodeMaterial).toBe(true)
    expect(material.isNodeMaterial).toBe(true)
    expect(material.lights).toBe(true)
  })

  it('parameterBuffer とアトラスをテクスチャ生成なしで設定できる', () =>
  {
    const descriptor = createBufferDescriptor(3)
    const material = new MToonAtlasNodeMaterial({ parameterBuffer: descriptor })

    expect(material.parameterBuffer).toBe(descriptor)
    expect(material.parameterTexture).toBeUndefined()
    expect(material.parameterBucketSlots).toBe(8)
    expect(material.parameterBufferData.length).toBe(8 * 9 * 4)
    expect(material.parameterBufferData.subarray(0, descriptor.data.length)).toEqual(descriptor.data)
    // パディング領域は 0 埋め
    expect(material.parameterBufferData[descriptor.data.length]).toBe(0)
    expect(material.map).toBe(descriptor.atlasedTextures?.baseColor)
    expect(material.normalMap).toBe(descriptor.atlasedTextures?.normal)
    expect(material.shadeMultiplyTexture).toBe(descriptor.atlasedTextures?.shade)
    expect(material.emissiveMap).toBeNull()
  })

  it('後方互換の parameterTexture からも UBO バッファへ抽出して設定できる', () =>
  {
    const descriptor = createTextureDescriptor(3)
    const material = new MToonAtlasNodeMaterial({ parameterTexture: descriptor })

    expect(material.parameterTexture).toBe(descriptor)
    expect(material.parameterBuffer?.slotCount).toBe(3)
    expect(material.parameterBuffer?.texelsPerSlot).toBe(9)
    expect(material.parameterBucketSlots).toBe(8)
    expect(material.parameterBufferData[0]).toBeCloseTo(0.25)
    expect(material.parameterBufferData[1]).toBeCloseTo(0.5)
    expect(material.parameterBufferData[2]).toBeCloseTo(0.75)
    expect(material.parameterBufferData[3]).toBeCloseTo(1.0)
    expect(material.map).toBe(descriptor.atlasedTextures?.baseColor)
  })

  it('パラメータを解除できる', () =>
  {
    const material = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor(12) })
    expect(material.parameterBucketSlots).toBe(16)

    material.setParameterBuffer(null)
    expect(material.parameterBuffer).toBeUndefined()
    expect(material.parameterTexture).toBeUndefined()
    expect(material.parameterBucketSlots).toBe(8)
    expect(material.parameterBufferData.length).toBe(8 * 9 * 4)
    expect(material.parameterBufferData.every((v) => v === 0)).toBe(true)
  })

  it('スロット数に応じて適切な UBO バケットに丸められる', () =>
  {
    expect(resolveParameterBucketSlots(0)).toBe(8)
    expect(resolveParameterBucketSlots(1)).toBe(8)
    expect(resolveParameterBucketSlots(8)).toBe(8)
    expect(resolveParameterBucketSlots(9)).toBe(16)
    expect(resolveParameterBucketSlots(16)).toBe(16)
    expect(resolveParameterBucketSlots(17)).toBe(32)
    expect(resolveParameterBucketSlots(32)).toBe(32)
    expect(resolveParameterBucketSlots(33)).toBe(64)
    expect(resolveParameterBucketSlots(64)).toBe(64)
    expect(resolveParameterBucketSlots(65)).toBe(112)
    expect(resolveParameterBucketSlots(112)).toBe(112)
    // WebGL2 最小 UBO 上限（16KB）に収まること
    expect(112 * 9 * 16).toBeLessThanOrEqual(16384)
  })

  it('UBO 上限（既定 113 スロット以上）を超えると RangeError を投げる', () =>
  {
    expect(getMaxParameterUBOSlots(9)).toBe(113)
    expect(() => resolveParameterBucketSlots(114, 9)).toThrow(RangeError)

    // 113 スロットは 113 * 9 * 16 = 16,272 <= 16,384 で収まる、114 は超過
    expect(resolveParameterBucketSlots(113, 9)).toBe(113)

    const tooMany = createBufferDescriptor(114, 9)
    expect(() => new MToonAtlasNodeMaterial({ parameterBuffer: tooMany })).toThrow(RangeError)

    // カスタム texelsPerSlot（16 vec4/slot = 256 bytes/slot -> 最大 64 スロット）
    expect(getMaxParameterUBOSlots(16)).toBe(64)
    expect(resolveParameterBucketSlots(64, 16)).toBe(64)
    expect(() => resolveParameterBucketSlots(65, 16)).toThrow(RangeError)
  })

  it('スロット属性名を設定できる（既定は mtoonMaterialSlot）', () =>
  {
    expect(new MToonAtlasNodeMaterial().slotAttribute.name).toBe('mtoonMaterialSlot')
    const material = new MToonAtlasNodeMaterial({ slotAttribute: { name: '_mtoonmaterialslot' } })
    expect(material.slotAttribute.name).toBe('_mtoonmaterialslot')
  })

  it('isOutline で描画面が切り替わる', () =>
  {
    const material = new MToonAtlasNodeMaterial()
    expect(material.side).toBe(FrontSide)
    material.isOutline = true
    expect(material.side).toBe(BackSide)
    material.isOutline = false
    expect(material.side).toBe(FrontSide)
  })

  it('アウトライン設定・スロット属性名・バケットサイズが変わるとキャッシュキーが変わる', () =>
  {
    // is〜 / _〜 のプロパティは three の自動キャッシュキーに含まれないため、
    // customProgramCacheKey に入れないと構成を変えてもシェーダーが作り直されない
    const material = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor(3) })
    const keys = [material.customProgramCacheKey()]
    material.setParameterBuffer(createBufferDescriptor(12)) // バケット 8 -> 16
    keys.push(material.customProgramCacheKey())
    material.isOutline = true
    material.outlineWidthMode = 'worldCoordinates'
    keys.push(material.customProgramCacheKey())
    material.outlineWidthMode = 'screenCoordinates'
    keys.push(material.customProgramCacheKey())
    material.setSlotAttribute({ name: 'other' })
    keys.push(material.customProgramCacheKey())

    expect(new Set(keys).size).toBe(5)
  })

  it('同じバケット・同じ構成の別マテリアルとはシェーダーキャッシュキーを共有する', () =>
  {
    // パラメータは UBO、アトラスは materialReference 経由で参照するため、
    // 別インスタンス間（別アバター間）でも同じシェーダーを再利用できる
    const a = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor(3) })
    const b = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor(7) })
    expect(a.parameterBucketSlots).toBe(8)
    expect(b.parameterBucketSlots).toBe(8)
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey())
    expect(a.clone().customProgramCacheKey()).toBe(a.customProgramCacheKey())
  })

  it('clone でパラメータバッファ・アトラス・アウトライン設定が引き継がれる', () =>
  {
    const material = new MToonAtlasNodeMaterial({
      parameterBuffer: createBufferDescriptor(10),
      slotAttribute: { name: 'slot' },
      transparent: true,
      alphaTest: 0.5,
    })
    material.isOutline = true
    material.outlineWidthMode = 'screenCoordinates'

    const cloned = material.clone()
    expect(cloned).toBeInstanceOf(MToonAtlasNodeMaterial)
    expect(cloned.parameterBucketSlots).toBe(16)
    expect(cloned.parameterBufferData).toEqual(material.parameterBufferData)
    expect(cloned.parameterBufferData).not.toBe(material.parameterBufferData)
    expect(cloned.parameterBuffer?.data).toBe(material.parameterBuffer?.data)
    expect(cloned.map).toBe(material.map)
    expect(cloned.normalMap).toBe(material.normalMap)
    expect(cloned.slotAttribute).toEqual({ name: 'slot' })
    expect(cloned.slotAttribute).not.toBe(material.slotAttribute)
    expect(cloned.isOutline).toBe(true)
    expect(cloned.side).toBe(BackSide)
    expect(cloned.outlineWidthMode).toBe('screenCoordinates')
    expect(cloned.transparent).toBe(true)
    expect(cloned.alphaTest).toBe(0.5)
  })

  it('スロットのアルファに material.opacity を掛ける（ゴーストなど外から薄くできる）', () =>
  {
    const material = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor(3) })
    // NodeMaterial は opacityNode があると materialOpacity を掛けないので、渡された opacityNode を見る
    let seen: unknown = null
    const spy = vi
      .spyOn(NodeMaterial.prototype, 'setupDiffuseColor')
      .mockImplementation(function (this: NodeMaterial)
      {
        seen = this.opacityNode
      })
    try
    {
      material.setupDiffuseColor({} as NodeBuilder)
    }
    finally
    {
      spy.mockRestore()
    }

    const node = seen as { op?: string, bNode?: unknown } | null
    expect(node?.op).toBe('*')
    expect(node?.bNode).toBe(materialOpacity)
    // 呼び出し後は元の opacityNode に戻す
    expect(material.opacityNode).toBeNull()
  })

  it('createOutlineMaterial は元を変えずにアウトライン用を作る', () =>
  {
    const material = new MToonAtlasNodeMaterial({ parameterBuffer: createBufferDescriptor() })
    const outline = material.createOutlineMaterial('screenCoordinates')

    expect(material.isOutline).toBe(false)
    expect(outline.isOutline).toBe(true)
    expect(outline.outlineWidthMode).toBe('screenCoordinates')
    expect(outline.side).toBe(BackSide)
    expect(outline.polygonOffset).toBe(true)
    expect(outline.map).toBe(material.map)
    expect(outline.parameterBufferData).toEqual(material.parameterBufferData)
  })
})

describe('DEFAULT_PARAMETER_LAYOUT', () =>
{
  it('テクセルとチャンネルの割り当てが重複しない', () =>
  {
    const used = new Set<string>()
    for (const semantic of DEFAULT_PARAMETER_LAYOUT)
    {
      for (const channel of semantic.channels)
      {
        const key = `${semantic.texel}.${channel}`
        expect(used.has(key), `${semantic.id} が ${key} を重複使用`).toBe(false)
        used.add(key)
      }
    }
  })

  it('GLSL 版のテクセル割り当てと一致する', () =>
  {
    // mtoon.frag の `float name = paramN.c;` / `vec3 name = paramN.rgb;` を読み取り、
    // レイアウト定数とずれていないことを確認する
    const frag = readFileSync(resolve(__dirname, '../src/shaders/mtoon.frag'), 'utf8')
    const glslNameToId: Record<string, string> = {
      litFactor: 'baseColor',
      opacity: 'opacity',
      shadeColorFactor: 'shadeColor',
      shadingShiftTextureScale: 'shadingShiftTextureScale',
      emissive: 'emissiveColor',
      emissiveIntensity: 'emissiveIntensity',
      matcapFactor: 'matcapColor',
      outlineWidthFactor: 'outlineWidth',
      outlineColorFactor: 'outlineColor',
      outlineLightingMixFactor: 'outlineLightingMix',
      parametricRimColorFactor: 'parametricRimColor',
      parametricRimLiftFactor: 'parametricRimLift',
      parametricRimFresnelPowerFactor: 'parametricRimFresnelPower',
      shadingToonyFactor: 'shadingToony',
      rimLightingMixFactor: 'rimLightingMix',
      uvAnimationRotationPhase: 'uvAnimationRotation',
      normalScale: 'normalScale',
      uvAnimationScrollXOffset: 'uvAnimationScrollX',
      uvAnimationScrollYOffset: 'uvAnimationScrollY',
      shadingShiftFactor: 'shadingShift',
    }

    const pattern = /(?:float|vec2|vec3)\s+(\w+)\s*=\s*param(\d)\.([rgba]+)/g
    const found = new Map<string, { texel: number, channels: string }>()
    for (const match of frag.matchAll(pattern))
    {
      found.set(match[1], { texel: Number(match[2]), channels: match[3] })
    }

    for (const [glslName, id] of Object.entries(glslNameToId))
    {
      const glsl = found.get(glslName)
      const semantic = DEFAULT_PARAMETER_LAYOUT.find((s) => s.id === id)
      expect(glsl, `${glslName} が mtoon.frag に見つからない`).toBeDefined()
      expect(semantic, `${id} がレイアウトに無い`).toBeDefined()
      expect(glsl!.texel, id).toBe(semantic!.texel)
      expect(glsl!.channels, id).toBe(semantic!.channels.join(''))
    }
    expect(DEFAULT_PARAMETER_LAYOUT).toHaveLength(Object.keys(glslNameToId).length)
  })
})

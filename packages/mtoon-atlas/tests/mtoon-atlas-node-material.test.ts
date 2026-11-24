/**
 * MToonAtlasNodeMaterial（TSL 版）のテスト
 *
 * GPU を使わずに確認できる範囲（プロパティ・キャッシュキー・複製・
 * パラメータレイアウト）を検証する。描画結果は debug-viewer で確認する。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BackSide, DataTexture, FloatType, FrontSide, RGBAFormat, Texture } from 'three'
import { MToonAtlasNodeMaterial } from '../src/nodes'
import { DEFAULT_PARAMETER_LAYOUT } from '../src/types'
import type { ParameterTextureDescriptor } from '../src/types'

function createDescriptor(): ParameterTextureDescriptor
{
  const texture = new DataTexture(new Float32Array(9 * 3 * 4), 9, 3, RGBAFormat, FloatType)
  return {
    texture,
    slotCount: 3,
    texelsPerSlot: 9,
    atlasedTextures: {
      baseColor: new Texture(),
      normal: new Texture(),
      shade: new Texture(),
    },
  }
}

describe('MToonAtlasNodeMaterial', () =>
{
  it('GLSL 版と共通の識別フラグを持つ', () =>
  {
    const material = new MToonAtlasNodeMaterial()
    expect(material.isMToonAtlasMaterial).toBe(true)
    expect(material.isMToonAtlasNodeMaterial).toBe(true)
    expect(material.isNodeMaterial).toBe(true)
    expect(material.lights).toBe(true)
  })

  it('パラメータテクスチャとアトラスを設定できる', () =>
  {
    const descriptor = createDescriptor()
    const material = new MToonAtlasNodeMaterial({ parameterTexture: descriptor })

    expect(material.parameterTexture).toBe(descriptor)
    expect(material.parameterTextureMap).toBe(descriptor.texture)
    expect(material.parameterTextureSize.toArray()).toEqual([9, 3])
    expect(material.map).toBe(descriptor.atlasedTextures?.baseColor)
    expect(material.normalMap).toBe(descriptor.atlasedTextures?.normal)
    expect(material.shadeMultiplyTexture).toBe(descriptor.atlasedTextures?.shade)
    expect(material.emissiveMap).toBeNull()
  })

  it('パラメータテクスチャを解除できる', () =>
  {
    const material = new MToonAtlasNodeMaterial({ parameterTexture: createDescriptor() })
    material.setParameterTexture(null)
    expect(material.parameterTexture).toBeUndefined()
    expect(material.parameterTextureMap).toBeNull()
    expect(material.parameterTextureSize.toArray()).toEqual([1, 1])
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

  it('アウトライン設定とスロット属性名を変えるとキャッシュキーが変わる', () =>
  {
    // is〜 / _〜 のプロパティは three の自動キャッシュキーに含まれないため、
    // customProgramCacheKey に入れないと構成を変えてもシェーダーが作り直されない
    const material = new MToonAtlasNodeMaterial()
    const keys = [material.customProgramCacheKey()]
    material.isOutline = true
    material.outlineWidthMode = 'worldCoordinates'
    keys.push(material.customProgramCacheKey())
    material.outlineWidthMode = 'screenCoordinates'
    keys.push(material.customProgramCacheKey())
    material.setSlotAttribute({ name: 'other' })
    keys.push(material.customProgramCacheKey())

    expect(new Set(keys).size).toBe(4)
  })

  it('別のマテリアルとはキャッシュキーを共有しない', () =>
  {
    // テクスチャをノードに直接持たせているため、共有すると
    // 後から描画したマテリアルが先のマテリアルのテクスチャで描かれてしまう
    const a = new MToonAtlasNodeMaterial()
    const b = new MToonAtlasNodeMaterial()
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey())
    expect(a.clone().customProgramCacheKey()).not.toBe(a.customProgramCacheKey())
  })

  it('clone でパラメータ・アトラス・アウトライン設定が引き継がれる', () =>
  {
    const material = new MToonAtlasNodeMaterial({
      parameterTexture: createDescriptor(),
      slotAttribute: { name: 'slot' },
      transparent: true,
      alphaTest: 0.5,
    })
    material.isOutline = true
    material.outlineWidthMode = 'screenCoordinates'

    const cloned = material.clone()
    expect(cloned).toBeInstanceOf(MToonAtlasNodeMaterial)
    expect(cloned.parameterTextureMap).toBe(material.parameterTextureMap)
    expect(cloned.parameterTextureSize.toArray()).toEqual([9, 3])
    expect(cloned.parameterTextureSize).not.toBe(material.parameterTextureSize)
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

  it('createOutlineMaterial は元を変えずにアウトライン用を作る', () =>
  {
    const material = new MToonAtlasNodeMaterial({ parameterTexture: createDescriptor() })
    const outline = material.createOutlineMaterial('screenCoordinates')

    expect(material.isOutline).toBe(false)
    expect(outline.isOutline).toBe(true)
    expect(outline.outlineWidthMode).toBe('screenCoordinates')
    expect(outline.side).toBe(BackSide)
    expect(outline.polygonOffset).toBe(true)
    expect(outline.map).toBe(material.map)
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

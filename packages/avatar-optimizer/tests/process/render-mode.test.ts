import { MToonMaterial } from '@pixiv/three-vrm'
import {
  MTOON_TRANSPARENT_RENDER_ORDER,
  MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER,
} from '@webxr-jp/mtoon-atlas'
import { describe, expect, it } from 'vitest'
import { getRenderMode, getRenderOrderForMode } from '../../src/util/material'

/**
 * レンダーモード判定
 * 半透明は depthWrite の有無で別グループにする（TransparentWithZWrite を保持するため）
 */
describe('getRenderMode', () => {
  it('should return opaque for a default material', () => {
    expect(getRenderMode(new MToonMaterial())).toBe('opaque')
  })

  it('should return alphaTest when alphaTest > 0', () => {
    const material = new MToonMaterial()
    material.alphaTest = 0.5
    expect(getRenderMode(material)).toBe('alphaTest')
  })

  it('should return transparent for transparent without depth write', () => {
    const material = new MToonMaterial()
    material.transparent = true
    material.depthWrite = false
    expect(getRenderMode(material)).toBe('transparent')
  })

  it('should return transparentZWrite for transparent with depth write', () => {
    // three-vrm は MToon の transparentWithZWrite を depthWrite=true に写す
    const material = new MToonMaterial({ transparentWithZWrite: true })
    material.transparent = true
    expect(material.depthWrite).toBe(true)
    expect(getRenderMode(material)).toBe('transparentZWrite')
  })
})

describe('getRenderOrderForMode', () => {
  it('should match the loader rule for transparent groups', () => {
    expect(getRenderOrderForMode('transparentZWrite')).toBe(
      MTOON_TRANSPARENT_ZWRITE_RENDER_ORDER,
    )
    expect(getRenderOrderForMode('transparent')).toBe(
      MTOON_TRANSPARENT_RENDER_ORDER,
    )
    expect(getRenderOrderForMode('transparentZWrite')).toBeLessThan(
      getRenderOrderForMode('transparent'),
    )
  })

  it('should leave opaque and alphaTest at the default order', () => {
    expect(getRenderOrderForMode('opaque')).toBe(0)
    expect(getRenderOrderForMode('alphaTest')).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { Texture } from 'three'
import {
  MToonInstancingMaterial,
  type ParameterTextureDescriptor,
  version,
} from '../src/index'

describe('mtoon-instancing', () => {
  it('should export version', () => {
    expect(version).toBe('0.1.0')
  })

  it('creates material with default slot attribute metadata', () => {
    const material = new MToonInstancingMaterial()

    expect(material.isMToonInstancingMaterial).toBe(true)
    expect(material.slotAttribute).toMatchObject({
      name: 'mtoonMaterialSlot',
    })
  })

  it('stores parameter texture info in userData for downstream wiring', () => {
    const texture = new Texture()
    const descriptor: ParameterTextureDescriptor = {
      texture,
      slotCount: 32,
      texelsPerSlot: 4,
    }

    const material = new MToonInstancingMaterial()
    material.setParameterTexture(descriptor)

    expect(material.parameterTexture).toBe(descriptor)
    expect(material.userData.mtoonInstancing.parameterTexture).toBe(texture)
    expect(material.userData.mtoonInstancing.slotCount).toBe(32)
    expect(material.userData.mtoonInstancing.texelsPerSlot).toBe(4)
  })
})

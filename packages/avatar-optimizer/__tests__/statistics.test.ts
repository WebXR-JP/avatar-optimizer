import { describe, expect, it } from 'vitest'

import { calculateVRMStatistics } from '../src/index'

describe('calculateVRMStatistics', () => {
  it('should resolve with a VRMStatistics object', async () => {
    const file = new File([new Uint8Array([0, 1, 2])], 'dummy.vrm', {
      type: 'model/gltf-binary',
    })

    const result = await calculateVRMStatistics(file)
    expect(result.isOk()).toBe(true)

    if (result.isOk()) {
      const stats = result.value
      expect(stats).toHaveProperty('polygonCount')
      expect(stats).toHaveProperty('textureCount')
      expect(stats).toHaveProperty('materialCount')
      expect(stats).toHaveProperty('boneCount')
      expect(stats).toHaveProperty('meshCount')
      expect(stats).toHaveProperty('fileSizeMB')
      expect(stats).toHaveProperty('vramEstimateMB')
    }
  })
})

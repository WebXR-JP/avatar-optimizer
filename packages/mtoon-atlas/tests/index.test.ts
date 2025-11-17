/**
 * MToonAtlasMaterial パッケージエクスポートテスト
 */

import { describe, it, expect } from 'vitest'
import { MToonAtlasMaterial } from '../src/index'

describe('mtoon-atlas exports', () => {
  it('should export MToonAtlasMaterial class', () => {
    expect(MToonAtlasMaterial).toBeDefined()
    expect(typeof MToonAtlasMaterial).toBe('function')
  })

  // TODO: 型定義エクスポートのテスト
})

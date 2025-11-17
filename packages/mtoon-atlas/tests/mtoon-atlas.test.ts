/**
 * MToonAtlasMaterial 基本テスト
 *
 * TODO: テストケースの詳細な実装
 */

import { describe, it, expect } from 'vitest'
import { MToonAtlasMaterial } from '../src/MToonAtlasMaterial'

describe('MToonAtlasMaterial', () => {
  it('should create an instance', () => {
    const material = new MToonAtlasMaterial()
    expect(material).toBeDefined()
    expect(material.isMToonAtlasMaterial).toBe(true)
  })

  // TODO: 詳細なテストケースを追加
})

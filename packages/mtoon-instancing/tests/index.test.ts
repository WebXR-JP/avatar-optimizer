import { describe, it, expect } from 'vitest'
import { version } from '../src/index'

describe('mtoon-instancing', () => {
  it('should export version', () => {
    expect(version).toBe('0.1.0')
  })
})

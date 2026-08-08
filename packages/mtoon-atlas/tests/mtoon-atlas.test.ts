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

  it('should define IGNORE_VERTEX_COLOR by default (upstream three-vrm parity)', () => {
    // 上流three-vrmのMToonMaterialは ignoreVertexColor=true が既定。
    // このdefineが無いと、COLOR_0(VEC4)を持つジオメトリで
    // USE_COLOR_ALPHA が注入され、mtoon.frag の
    // `diffuseColor.rgb *= vColor` が vec3 *= vec4 のコンパイルエラーになる
    const material = new MToonAtlasMaterial()
    expect(material.defines).toHaveProperty('IGNORE_VERTEX_COLOR')
  })

  it('should guard vertex color usage with IGNORE_VERTEX_COLOR in shaders', () => {
    const material = new MToonAtlasMaterial()
    expect(material.fragmentShader).toContain('IGNORE_VERTEX_COLOR')
  })

  // TODO: 詳細なテストケースを追加
})

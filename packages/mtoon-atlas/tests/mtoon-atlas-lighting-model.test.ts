/**
 * MToonAtlasLightingModel の影の分離（splitShadow）のテスト
 *
 * 平行光源のライトノードは全オブジェクトで共有され、影を受けるオブジェクトを一度ビルドすると
 * shadowNode / baseColorNode が残り続ける。receiveShadow: false のオブジェクトに影を掛けないことと、
 * その判断が頼る three の private（AnalyticLightNode の setup / setupShadow）の前提を確かめる。
 */

import { describe, it, expect } from 'vitest'
import { DirectionalLight, PointLight } from 'three'
import { float, vec3 } from 'three/tsl'
import { DirectionalLightNode, PointLightNode } from 'three/webgpu'
import type { Node, NodeBuilder } from 'three/webgpu'
import { splitShadow } from '../src/nodes/MToonAtlasLightingModel'

/** setup に要る最小限のビルダー（直接光の受け渡しだけ記録する） */
function createBuilder(receiveShadow: boolean, shadowMapEnabled = true)
{
  const directLights: { lightColor: Node }[] = []
  const builder = {
    object: { receiveShadow },
    renderer: { shadowMap: { enabled: shadowMapEnabled } },
    context: {},
    lightsNode: {
      setupDirectLight: (_builder: unknown, _lightNode: unknown, data: { lightColor: Node }) =>
      {
        directLights.push(data)
      },
    },
  }
  return { builder: builder as unknown as NodeBuilder, directLights }
}

/** GPU を使わずに済むよう、影の計算ノードを差し替えた平行光源のライトノード */
function createDirectionalLightNode()
{
  const light = new DirectionalLight(0xffffff, 2)
  light.castShadow = true
  const shadow = float(0.5)
  ;(light.shadow as unknown as { shadowNode: Node }).shadowNode = shadow
  return { node: new DirectionalLightNode(light), shadow }
}

describe('three の AnalyticLightNode の前提（three を上げたら読み直す）', () =>
{
  it('影を受けるオブジェクトでは、影ありの色（shadowColorNode）が lightColor として渡る', () =>
  {
    const { node } = createDirectionalLightNode()
    const { builder, directLights } = createBuilder(true)

    node.setup(builder)

    const n = node as unknown as { shadowColorNode: Node, baseColorNode: Node, shadowNode: Node }
    expect(n.shadowColorNode).toBeTruthy()
    expect(n.baseColorNode).toBeTruthy()
    expect(n.shadowNode).toBeTruthy()
    expect(directLights[0].lightColor).toBe(n.shadowColorNode)
  })

  it('影を受けるオブジェクトのあと影を受けないオブジェクトをビルドすると、shadowNode は残るが影なしの色が渡る', () =>
  {
    const { node } = createDirectionalLightNode()
    const receiver = createBuilder(true)
    const nonReceiver = createBuilder(false)

    node.setup(receiver.builder)
    node.setup(nonReceiver.builder)

    const n = node as unknown as { shadowColorNode: Node, baseColorNode: Node, shadowNode: Node }
    expect(n.shadowNode).toBeTruthy()
    expect(nonReceiver.directLights[0].lightColor).toBe(n.baseColorNode)
    expect(nonReceiver.directLights[0].lightColor).not.toBe(n.shadowColorNode)
  })
})

describe('splitShadow', () =>
{
  it('影を受けるオブジェクトでは、ライト色と影の係数に分ける', () =>
  {
    const { node, shadow } = createDirectionalLightNode()
    const { builder, directLights } = createBuilder(true)
    node.setup(builder)

    const result = splitShadow(directLights[0].lightColor, node)

    expect(result.color).toBe((node as unknown as { baseColorNode: Node }).baseColorNode)
    expect(result.shadow).toBe(shadow)
  })

  it('receiveShadow: false のオブジェクトには、ほかのオブジェクトで作られた影を掛けない', () =>
  {
    const { node, shadow } = createDirectionalLightNode()
    node.setup(createBuilder(true).builder)
    const { builder, directLights } = createBuilder(false)
    node.setup(builder)

    const result = splitShadow(directLights[0].lightColor, node)

    expect(result.color).toBe(directLights[0].lightColor)
    expect(result.shadow).not.toBe(shadow)
  })

  it('shadowMap が無効なら影を掛けない', () =>
  {
    const { node, shadow } = createDirectionalLightNode()
    node.setup(createBuilder(true).builder)
    const { builder, directLights } = createBuilder(true, false)
    node.setup(builder)

    const result = splitShadow(directLights[0].lightColor, node)

    expect(result.color).toBe(directLights[0].lightColor)
    expect(result.shadow).not.toBe(shadow)
  })

  it('平行光源以外は分けない（ライト色に影が掛かったまま使う）', () =>
  {
    const light = new PointLight(0xffffff, 1)
    const node = new PointLightNode(light)
    const lightColor = vec3(1, 1, 1)
    Object.assign(node, { shadowNode: float(0.5), shadowColorNode: lightColor, baseColorNode: vec3(1, 1, 1) })

    const result = splitShadow(lightColor, node)

    expect(result.color).toBe(lightColor)
  })
})

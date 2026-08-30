import type { VRM } from '@pixiv/three-vrm'
import { Object3D } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

/**
 * spec 外のカスタム制約をエクスポートしたときの警告のテスト
 *
 * VRMC_node_constraint 1.0 は roll / aim / rotation の 3 種のみ。
 * それ以外の VRMNodeConstraint サブクラスは rotation として書き出されるが、
 * サイレントだと再生側で意図しない回転コピーが起きても原因を追えない。
 */

/** exportNodeConstraints が必要とする最小限の GLTFWriter を作る */
function createWriter(nodes: Object3D[]) {
  return {
    json: { nodes: nodes.map(() => ({})) as Record<string, unknown>[] },
    nodeMap: new Map(nodes.map((node, index) => [node, index])),
  }
}

/** 制約 1 件だけを持つ VRM 相当のオブジェクトを作る */
function createVRM(constraint: object): VRM {
  return {
    nodeConstraintManager: { constraints: new Set([constraint]) },
  } as unknown as VRM
}

/** プラグインを組み立てて制約をエクスポートし、生成された JSON を返す */
function exportConstraint(constraint: Record<string, unknown>) {
  const destination = new Object3D()
  const source = new Object3D()
  Object.assign(constraint, { destination, source, weight: 1.0 })

  const writer = createWriter([destination, source])
  const plugin = new VRMExporterPlugin(writer)
  // exportNodeConstraints は private だが、ここでの検証対象は
  // 分岐そのものなので直接呼ぶ
  ;(
    plugin as unknown as { exportNodeConstraints(vrm: VRM): void }
  ).exportNodeConstraints(createVRM(constraint))

  return writer.json.nodes[0] as {
    extensions?: {
      VRMC_node_constraint?: { constraint: Record<string, unknown> }
    }
  }
}

describe('exportNodeConstraints の未知の制約に対する警告', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正規の rotation 制約では警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // three-vrm の組み込み制約が持つフィールド
    const node = exportConstraint({ _dstRestQuat: {}, _invSrcRestQuat: {} })

    expect(warn).not.toHaveBeenCalled()
    expect(node.extensions?.VRMC_node_constraint?.constraint).toHaveProperty(
      'rotation',
    )
  })

  it('roll / aim 制約では警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    exportConstraint({ rollAxis: 'X' })
    exportConstraint({ aimAxis: 'PositiveX' })

    expect(warn).not.toHaveBeenCalled()
  })

  it('spec 外のカスタム制約では警告しつつ rotation として出力する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    class MyCustomConstraint {}
    const node = exportConstraint(
      new MyCustomConstraint() as unknown as Record<string, unknown>,
    )

    // 挙動は従来どおり（rotation として出力）
    expect(node.extensions?.VRMC_node_constraint?.constraint).toHaveProperty(
      'rotation',
    )

    // 診断できるようクラス名を含めて警告する
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('MyCustomConstraint')
  })
})

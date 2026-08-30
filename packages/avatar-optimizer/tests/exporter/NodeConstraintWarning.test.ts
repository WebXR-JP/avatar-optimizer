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

type ExportedNode = {
  extensions?: {
    VRMC_node_constraint?: { constraint: Record<string, unknown> }
  }
}

/**
 * 制約群をエクスポートし、destination ノードごとの出力 JSON を返す
 *
 * 各制約に destination / source / weight を補ってから
 * 最小限の GLTFWriter を組み立てる。
 */
function exportConstraints(
  constraints: Record<string, unknown>[],
): ExportedNode[] {
  const nodes: Object3D[] = []
  for (const constraint of constraints) {
    const destination = new Object3D()
    const source = new Object3D()
    Object.assign(constraint, { destination, source, weight: 1.0 })
    nodes.push(destination, source)
  }

  const writer = {
    json: { nodes: nodes.map(() => ({})) as ExportedNode[] },
    nodeMap: new Map(nodes.map((node, index) => [node, index])),
  }

  const vrm = {
    nodeConstraintManager: { constraints: new Set(constraints) },
  } as unknown as VRM

  // exportNodeConstraints は private だが、検証対象は分岐そのものなので直接呼ぶ
  const plugin = new VRMExporterPlugin(writer) as unknown as {
    exportNodeConstraints(vrm: VRM): void
  }
  plugin.exportNodeConstraints(vrm)

  // destination は 2 つおきに並んでいる
  return constraints.map((_, i) => writer.json.nodes[i * 2])
}

/** 出力された制約タイプ（roll / aim / rotation）を取り出す */
function constraintTypeOf(node: ExportedNode): string | undefined {
  const constraint = node.extensions?.VRMC_node_constraint?.constraint
  return constraint && Object.keys(constraint)[0]
}

describe('exportNodeConstraints の未知の制約に対する警告', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('組み込みの roll / aim / rotation 制約では警告しない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const [roll, aim, rotation] = exportConstraints([
      { rollAxis: 'X', _dstRestQuat: {}, _invSrcRestQuat: {} },
      { aimAxis: 'PositiveX', _dstRestQuat: {}, _invSrcRestQuat: {} },
      { _dstRestQuat: {}, _invSrcRestQuat: {} },
    ])

    // 分岐に到達せず素通りしていないことを、出力 JSON で確かめる
    expect(constraintTypeOf(roll)).toBe('roll')
    expect(constraintTypeOf(aim)).toBe('aim')
    expect(constraintTypeOf(rotation)).toBe('rotation')

    expect(warn).not.toHaveBeenCalled()
  })

  it('spec 外のカスタム制約では警告しつつ rotation として出力する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    class MyCustomConstraint {}
    const [node] = exportConstraints([
      new MyCustomConstraint() as unknown as Record<string, unknown>,
    ])

    // 挙動は従来どおり（rotation として出力）
    expect(constraintTypeOf(node)).toBe('rotation')

    // 診断できるようクラス名を含めて警告する
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('MyCustomConstraint')
  })

  it('複数のカスタム制約があっても警告は 1 回にまとめる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    class ConstraintA {}
    class ConstraintB {}
    exportConstraints([
      new ConstraintA() as unknown as Record<string, unknown>,
      new ConstraintA() as unknown as Record<string, unknown>,
      new ConstraintB() as unknown as Record<string, unknown>,
    ])

    // 誤検知したときにログを埋め尽くさないよう、種類ごとに 1 度だけ挙げる
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('ConstraintA, ConstraintB')
  })
})

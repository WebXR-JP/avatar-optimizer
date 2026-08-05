import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRM } from '../../src/io/export'

/**
 * VRMC_node_constraint のエクスポートラウンドトリップテスト
 *
 * fixture: VRM1_Constraint_Twist_Sample.vrm（pixiv/three-vrm 公式サンプル。
 * VRM Public License 1.0 / allowRedistribution: true / (c) 2022 pixiv Inc.）
 *
 * このモデルの袖ボーン J_Aim_*_TopsUpperArm は肩の子（腕の子ではない）で、
 * aim constraint（source=前腕）だけで腕に追従する。constraint が
 * エクスポートで欠落すると袖が T ポーズに張り付く。
 *
 * 回帰の対象: 傘パッケージ @pixiv/three-vrm のローダが生成した constraint は
 * @pixiv/three-vrm-node-constraint のクラスと別実体のため、instanceof による
 * 型判定では全制約がサイレントに欠落する（roll 8 + aim 6 = 14 件が 0 件になる）
 */
const VRM_FILE = '/VRM1_Constraint_Twist_Sample.vrm'

interface ConstraintEntry {
  /** 制約タイプ (roll / aim / rotation) */
  type: string
  /** source ノード名（インデックスはエクスポートで変わり得るため名前で比較） */
  sourceName: string
}

interface GlbNode {
  name: string
  extensions?: {
    VRMC_node_constraint?: {
      constraint: Record<string, { source: number }>
    }
  }
}

interface GlbJson {
  nodes?: GlbNode[]
}

/** GLB バイナリから JSON チャンクを取り出す */
function parseGlbJson(buf: ArrayBuffer): GlbJson {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  const jsonBytes = new Uint8Array(buf, 20, jsonLen)
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as GlbJson
}

/** GLB JSON から { destノード名: { type, sourceName } } のマップを作る */
function collectConstraints(json: GlbJson): Map<string, ConstraintEntry> {
  const result = new Map<string, ConstraintEntry>()
  const nodes: GlbNode[] = json.nodes ?? []
  nodes.forEach((node) => {
    const ext = node.extensions?.VRMC_node_constraint
    if (!ext) return
    const type = Object.keys(ext.constraint)[0]
    const sourceIndex = ext.constraint[type].source
    result.set(node.name, {
      type,
      sourceName: nodes[sourceIndex]?.name ?? '(missing)',
    })
  })
  return result
}

async function loadVrmFromBuffer(buf: ArrayBuffer): Promise<VRM> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(buf, '')
  return gltf.userData.vrm as VRM
}

describe('NodeConstraint Export Roundtrip', () => {
  it('should load all constraints from the original file', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const original = collectConstraints(parseGlbJson(buf))
    expect(original.size).toBe(14)

    const vrm = await loadVrmFromBuffer(buf)
    expect(vrm.nodeConstraintManager?.constraints.size).toBe(14)
  })

  it('should preserve constraints through a plain export roundtrip', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const original = collectConstraints(parseGlbJson(buf))
    const vrm = await loadVrmFromBuffer(buf)

    const exported = await exportVRM(vrm, {})
    expect(exported.isOk()).toBe(true)
    const outBuf = exported._unsafeUnwrap()

    // dest ノード名・制約タイプ・source ノード名まで一致すること
    const roundtripped = collectConstraints(parseGlbJson(outBuf))
    expect(Object.fromEntries(roundtripped)).toEqual(
      Object.fromEntries(original),
    )

    // 再ロードしても manager に全件復元されること
    const vrm2 = await loadVrmFromBuffer(outBuf)
    expect(vrm2.nodeConstraintManager?.constraints.size).toBe(14)
  })

  it('should preserve constraints through optimize + export', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const original = collectConstraints(parseGlbJson(buf))
    const vrm = await loadVrmFromBuffer(buf)

    const optimized = await optimizeModel(vrm, {})
    expect(optimized.isOk()).toBe(true)

    const exported = await exportVRM(vrm, {})
    expect(exported.isOk()).toBe(true)
    const outBuf = exported._unsafeUnwrap()

    const roundtripped = collectConstraints(parseGlbJson(outBuf))
    expect(Object.fromEntries(roundtripped)).toEqual(
      Object.fromEntries(original),
    )

    const vrm2 = await loadVrmFromBuffer(outBuf)
    expect(vrm2.nodeConstraintManager?.constraints.size).toBe(14)
  })
})

import { VRM, VRMExpression, VRMHumanBoneName } from '@pixiv/three-vrm'
import { Bone, Group, Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { describe, expect, it } from 'vitest'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

// VRM 1.0の許可されたライセンスURL
const VRM10_LICENSE_URL = 'https://vrm.dev/licenses/1.0/'

/**
 * テスト用のVRMオブジェクトを作成する
 */
function createTestVRM() {
  const scene = new Scene()
  const vrmRoot = new Group()
  vrmRoot.name = 'VRMRoot'
  scene.add(vrmRoot)

  // Humanoid
  const hips = new Bone()
  hips.name = 'hips'
  const head = new Bone()
  head.name = 'head'
  hips.add(head)
  vrmRoot.add(hips)

  const humanBones = {
    [VRMHumanBoneName.Hips]: { node: hips },
    [VRMHumanBoneName.Head]: { node: head },
  }

  // Meta (VRM 1.0形式)
  const meta = {
    name: 'TestAvatar',
    version: '1.0.0',
    authors: ['Tester'],
    licenseUrl: VRM10_LICENSE_URL,
    avatarPermission: 'everyone',
    commercialUsage: 'personalNonProfit',
    allowExcessivelyViolentUsage: false,
    allowExcessivelySexualUsage: false,
    allowPoliticalOrReligiousUsage: false,
    allowAntisocialOrHateUsage: false,
    creditNotation: 'required',
    allowRedistribution: false,
    modification: 'prohibited',
  }

  // Expressions
  const expressionManager = {
    expressions: new Set<VRMExpression>(),
    getExpression: (_name: string) => null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  const happyExpr = new VRMExpression('happy')
  happyExpr.isBinary = false
  happyExpr.overrideBlink = 'block'
  happyExpr.overrideLookAt = 'none'
  happyExpr.overrideMouth = 'blend'
  expressionManager.expressions.add(happyExpr)

  // LookAt
  const lookAt = {
    offsetFromHeadBone: { x: 0, y: 0.1, z: 0, toArray: () => [0, 0.1, 0] },
    applier: { type: 'bone' },
    rangeMapHorizontalInner: { inputMaxValue: 10, outputScale: 10 },
    rangeMapHorizontalOuter: { inputMaxValue: 10, outputScale: 10 },
    rangeMapVerticalDown: { inputMaxValue: 10, outputScale: 10 },
    rangeMapVerticalUp: { inputMaxValue: 10, outputScale: 10 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  // FirstPerson
  const firstPerson = {
    meshAnnotations: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  const vrm = new VRM({
    scene: vrmRoot,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    humanoid: { humanBones } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    meta: meta as any,
    expressionManager: expressionManager,
    lookAt: lookAt,
    firstPerson: firstPerson,
  })

  // vrmRootにはVRMを付加しない（循環参照を避けるため）
  // プラグインでsetVRM()を使う

  return { scene, vrmRoot, vrm, hips, head }
}

describe('VRMExporterPlugin', () => {
  it('should export VRMC_vrm extension in JSON output', async () => {
    const { scene, vrm } = createTestVRM()

    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonOutput = await new Promise<any>((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => resolve(result),
        (error) => reject(error),
        { binary: false },
      )
    })

    // 拡張が正しく追加されているか確認
    expect(jsonOutput.extensions).toBeDefined()
    expect(jsonOutput.extensions.VRMC_vrm).toBeDefined()
    expect(jsonOutput.extensions.VRMC_vrm.specVersion).toBe('1.0')
    expect(jsonOutput.extensions.VRMC_vrm.meta.name).toBe('TestAvatar')
    expect(jsonOutput.extensionsUsed).toContain('VRMC_vrm')
  })

  it('should export GLB binary with VRMC_vrm extension', async () => {
    const { scene, vrm } = createTestVRM()

    // エクスポート
    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result)
          } else {
            reject(new Error('Expected ArrayBuffer (binary) output'))
          }
        },
        (error) => reject(error),
        { binary: true },
      )
    })

    expect(glbBuffer).toBeDefined()
    expect(glbBuffer.byteLength).toBeGreaterThan(0)

    // GLBバイナリからJSONチャンクを抽出してVRMC_vrm拡張が含まれているか確認
    const dataView = new DataView(glbBuffer)

    // GLBヘッダー: magic (4) + version (4) + length (4) = 12 bytes
    const magic = dataView.getUint32(0, true)
    expect(magic).toBe(0x46546c67) // 'glTF'

    // JSONチャンク: length (4) + type (4) + data
    const jsonChunkLength = dataView.getUint32(12, true)
    const jsonChunkType = dataView.getUint32(16, true)
    expect(jsonChunkType).toBe(0x4e4f534a) // 'JSON'

    // JSONデータを抽出
    const jsonBytes = new Uint8Array(glbBuffer, 20, jsonChunkLength)
    const jsonString = new TextDecoder().decode(jsonBytes)
    const json = JSON.parse(jsonString)

    // VRMC_vrm拡張が含まれているか確認
    expect(json.extensions).toBeDefined()
    expect(json.extensions.VRMC_vrm).toBeDefined()
    expect(json.extensions.VRMC_vrm.specVersion).toBe('1.0')
    expect(json.extensions.VRMC_vrm.meta.name).toBe('TestAvatar')
  })
})

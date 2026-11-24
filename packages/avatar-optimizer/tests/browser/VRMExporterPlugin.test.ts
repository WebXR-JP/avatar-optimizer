import { VRM, VRMExpression, VRMHumanBoneName } from '@pixiv/three-vrm'
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
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

  it('GLTFExporter 組み込みの拡張と併用しても extensionsUsed に VRMC_vrm が残る', async () => {
    const { scene, vrm } = createTestVRM()

    // MeshBasicMaterial は GLTFExporter 組み込みの KHR_materials_unlit で書き出される。
    // 組み込み拡張が 1 つでも使われると GLTFExporter は json.extensionsUsed を
    // writer.extensionsUsed の内容で上書きするため、json に直接 push した
    // VRMC_vrm が消えて VRM として読み込めなくなっていた
    scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))

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

    expect(jsonOutput.extensionsUsed).toContain('KHR_materials_unlit')
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

  it('deduplicates glTF skins for SkinnedMeshes sharing the same Skeleton and preserves sharing on reload', async () => {
    const { scene, vrm, vrmRoot, hips, head } = createTestVRM()
    scene.updateMatrixWorld(true)

    const createSkinned = (name: string, skeleton: Skeleton) => {
      const geo = new BoxGeometry(0.1, 0.1, 0.1)
      const count = geo.getAttribute('position').count
      const indices = new Uint16Array(count * 4)
      const weights = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) {
        weights[i * 4] = 1
      }
      geo.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4))
      geo.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
      const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
      mesh.name = name
      mesh.bind(skeleton, new Matrix4())
      return mesh
    }

    const sharedSkeleton = new Skeleton([hips, head])
    const meshA = createSkinned('MeshA', sharedSkeleton)
    const meshB = createSkinned('MeshB', sharedSkeleton)
    vrmRoot.add(meshA, meshB)

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
          if (result instanceof ArrayBuffer) resolve(result)
          else reject(new Error('Expected ArrayBuffer'))
        },
        (error) => reject(error),
        { binary: true },
      )
    })

    const dataView = new DataView(glbBuffer)
    const jsonChunkLength = dataView.getUint32(12, true)
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(glbBuffer, 20, jsonChunkLength)),
    )

    expect(json.skins).toHaveLength(1)
    const skinnedNodes = (json.nodes as Array<{ skin?: number }>).filter(
      (n) => n.skin !== undefined,
    )
    expect(skinnedNodes).toHaveLength(2)
    expect(skinnedNodes[0].skin).toBe(0)
    expect(skinnedNodes[1].skin).toBe(0)

    const loader = new GLTFLoader()
    const reloadedGltf = await loader.parseAsync(glbBuffer, '')
    const reloadedMeshes: SkinnedMesh[] = []
    reloadedGltf.scene.traverse((obj) => {
      if (obj instanceof SkinnedMesh) reloadedMeshes.push(obj)
    })
    expect(reloadedMeshes).toHaveLength(2)
    expect(reloadedMeshes[0].skeleton).toBe(reloadedMeshes[1].skeleton)
  })

  it('keeps separate glTF skins when bindMatrix differs', async () => {
    const { scene, vrm, vrmRoot, hips, head } = createTestVRM()
    scene.updateMatrixWorld(true)

    const createSkinned = (
      name: string,
      skeleton: Skeleton,
      bindOffsetX: number,
    ) => {
      const geo = new BoxGeometry(0.1, 0.1, 0.1)
      const count = geo.getAttribute('position').count
      const indices = new Uint16Array(count * 4)
      const weights = new Float32Array(count * 4)
      for (let i = 0; i < count; i++) {
        weights[i * 4] = 1
      }
      geo.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4))
      geo.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
      const mesh = new SkinnedMesh(geo, new MeshBasicMaterial())
      mesh.name = name
      mesh.bind(skeleton, new Matrix4().makeTranslation(bindOffsetX, 0, 0))
      return mesh
    }

    const sharedSkeleton = new Skeleton([hips, head])
    const meshA = createSkinned('MeshA', sharedSkeleton, 0)
    const meshB = createSkinned('MeshB', sharedSkeleton, 2)
    vrmRoot.add(meshA, meshB)

    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await new Promise<any>((resolve, reject) => {
      exporter.parse(
        scene,
        (result) => resolve(result),
        (error) => reject(error),
        { binary: false },
      )
    })

    expect(json.skins).toHaveLength(2)
  })
})

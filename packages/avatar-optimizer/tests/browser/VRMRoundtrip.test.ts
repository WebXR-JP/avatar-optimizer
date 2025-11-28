import { VRM, VRMHumanBoneName, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

/**
 * VRMファイルのインポート→エクスポート→インポートのラウンドトリップテスト
 * 実際のVRMファイル（AliciaSolid.vrm）を使用してデータの整合性を確認
 */
describe('VRM Roundtrip', () =>
{
  // VRMファイルのパス（publicDirをtests/fixturesに設定しているのでルートから取得）
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  it('should preserve VRM meta data after roundtrip', async () =>
  {
    // 1. 元のVRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()

    const originalGltf = await loader.parseAsync(originalBuffer, '')
    const originalVRM = originalGltf.userData.vrm as VRM
    expect(originalVRM).toBeDefined()

    // 元のメタデータを保存
    // VRM 0.0はtitle、VRM 1.0はnameを使用
    const originalMeta = originalVRM.meta as any
    const originalName = originalMeta.name ?? originalMeta.title
    expect(originalName).toBeDefined()

    // 2. VRMをGLBとしてエクスポート
    const exporter = new GLTFExporter()
    exporter.register((writer) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(originalVRM)
      return plugin
    })

    const exportedBuffer = await new Promise<ArrayBuffer>((resolve, reject) =>
    {
      exporter.parse(
        originalVRM.scene,
        (result) =>
        {
          if (result instanceof ArrayBuffer)
          {
            resolve(result)
          } else
          {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => reject(error),
        { binary: true },
      )
    })

    expect(exportedBuffer.byteLength).toBeGreaterThan(0)

    // 3. エクスポートしたGLBを再度VRMとしてロード
    const reloadedGltf = await loader.parseAsync(exportedBuffer, '')
    const reloadedVRM = reloadedGltf.userData.vrm as VRM
    expect(reloadedVRM).toBeDefined()

    // 4. メタデータの整合性を確認
    // エクスポートはVRM 1.0形式に変換されるため、reloaded側は常にnameを使用
    const reloadedMeta = reloadedVRM.meta as any
    const reloadedName = reloadedMeta.name ?? reloadedMeta.title
    expect(reloadedName).toBe(originalName)
  })

  it('should preserve humanoid bone structure after roundtrip', async () =>
  {
    // 1. 元のVRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()

    const originalGltf = await loader.parseAsync(originalBuffer, '')
    const originalVRM = originalGltf.userData.vrm as VRM
    expect(originalVRM).toBeDefined()

    // 元のヒューマノイドボーン情報を取得
    const originalHumanoid = originalVRM.humanoid
    expect(originalHumanoid).toBeDefined()

    // 必須ボーンが存在することを確認
    const requiredBones = [
      VRMHumanBoneName.Hips,
      VRMHumanBoneName.Spine,
      VRMHumanBoneName.Head,
      VRMHumanBoneName.LeftUpperArm,
      VRMHumanBoneName.RightUpperArm,
      VRMHumanBoneName.LeftUpperLeg,
      VRMHumanBoneName.RightUpperLeg,
    ]

    for (const boneName of requiredBones)
    {
      const bone = originalHumanoid.getNormalizedBoneNode(boneName)
      expect(bone, `Original VRM should have ${boneName}`).toBeDefined()
    }

    // 2. VRMをGLBとしてエクスポート
    const exporter = new GLTFExporter()
    exporter.register((writer) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(originalVRM)
      return plugin
    })

    const exportedBuffer = await new Promise<ArrayBuffer>((resolve, reject) =>
    {
      exporter.parse(
        originalVRM.scene,
        (result) =>
        {
          if (result instanceof ArrayBuffer)
          {
            resolve(result)
          } else
          {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => reject(error),
        { binary: true },
      )
    })

    // 3. エクスポートしたGLBを再度VRMとしてロード
    const reloadedGltf = await loader.parseAsync(exportedBuffer, '')
    const reloadedVRM = reloadedGltf.userData.vrm as VRM
    expect(reloadedVRM).toBeDefined()

    // 4. ヒューマノイドボーンの整合性を確認
    const reloadedHumanoid = reloadedVRM.humanoid
    expect(reloadedHumanoid).toBeDefined()

    for (const boneName of requiredBones)
    {
      const reloadedBone = reloadedHumanoid.getNormalizedBoneNode(boneName)
      expect(reloadedBone, `Reloaded VRM should have ${boneName}`).toBeDefined()
    }
  })

  it('should preserve expressions after roundtrip', async () =>
  {
    // 1. 元のVRMをロード
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()

    const originalGltf = await loader.parseAsync(originalBuffer, '')
    const originalVRM = originalGltf.userData.vrm as VRM
    expect(originalVRM).toBeDefined()

    // 元のエクスプレッション情報を取得
    const originalExpressionManager = originalVRM.expressionManager
    if (!originalExpressionManager)
    {
      // エクスプレッションがないVRMもあるのでスキップ
      return
    }

    // 元のエクスプレッション名を取得
    const originalExpressionNames: string[] = []
    originalExpressionManager.expressions.forEach((expr) =>
    {
      originalExpressionNames.push(expr.expressionName)
    })

    // 2. VRMをGLBとしてエクスポート
    const exporter = new GLTFExporter()
    exporter.register((writer) =>
    {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(originalVRM)
      return plugin
    })

    const exportedBuffer = await new Promise<ArrayBuffer>((resolve, reject) =>
    {
      exporter.parse(
        originalVRM.scene,
        (result) =>
        {
          if (result instanceof ArrayBuffer)
          {
            resolve(result)
          } else
          {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => reject(error),
        { binary: true },
      )
    })

    // 3. エクスポートしたGLBを再度VRMとしてロード
    const reloadedGltf = await loader.parseAsync(exportedBuffer, '')
    const reloadedVRM = reloadedGltf.userData.vrm as VRM
    expect(reloadedVRM).toBeDefined()

    // 4. エクスプレッションの整合性を確認
    const reloadedExpressionManager = reloadedVRM.expressionManager
    expect(reloadedExpressionManager).toBeDefined()

    // 元のエクスプレッションが全て存在することを確認
    for (const name of originalExpressionNames)
    {
      const reloadedExpr = reloadedExpressionManager?.getExpression(name)
      expect(reloadedExpr, `Reloaded VRM should have expression: ${name}`).toBeDefined()
    }
  })
})

/**
 * GitHub Issue #1: エクスポートされたVRMのSpringBone読み込みでエラーが発生する
 *
 * 問題の再現手順:
 * 1. VRMファイルを loadVRM で読み込む
 * 2. optimizeModel で最適化を実行
 * 3. exportVRM でVRMをエクスポート
 * 4. エクスポートされたVRMを VRMLoaderPlugin で読み込む
 * 5. SpringBone の初期化でエラーが発生
 */
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { exportVRM, loadVRM, optimizeModel } from '../../src'

describe('SpringBone Export Roundtrip (Issue #1)', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  it('should preserve SpringBone after loadVRM -> optimizeModel -> exportVRM roundtrip', async () => {
    // 1. VRMファイルをloadVRMで読み込む
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()

    const loadResult = await loadVRM(originalBuffer)
    expect(loadResult.isOk()).toBe(true)
    const originalVRM = loadResult._unsafeUnwrap()
    expect(originalVRM).toBeDefined()

    const originalSpringBoneManager = originalVRM.springBoneManager
    if (!originalSpringBoneManager) {
      // SpringBoneがないVRMはスキップ
      return
    }

    const originalJointCount = originalSpringBoneManager.joints.size
    expect(originalJointCount).toBeGreaterThan(0)

    // 2. optimizeModelで最適化を実行（migrateVRM0ToVRM1を有効化）
    const optimizeResult = await optimizeModel(originalVRM, {
      migrateVRM0ToVRM1: true,
    })
    expect(optimizeResult.isOk()).toBe(true)

    // 3. exportVRMでVRMをエクスポート
    const exportResult = await exportVRM(originalVRM)
    expect(exportResult.isOk()).toBe(true)
    const exportedBuffer = exportResult._unsafeUnwrap()

    // 4. エクスポートされたVRMを再度読み込む
    // ここでSpringBoneの初期化エラーが発生していた（修正前）
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const reloadedGltf = await loader.parseAsync(exportedBuffer, '')
    const reloadedVRM = reloadedGltf.userData.vrm as VRM
    expect(reloadedVRM).toBeDefined()

    // 5. SpringBoneの整合性を確認
    const reloadedSpringBoneManager = reloadedVRM.springBoneManager
    expect(
      reloadedSpringBoneManager,
      'Reloaded VRM should have SpringBoneManager',
    ).toBeDefined()

    // ジョイントが存在することを確認
    expect(
      reloadedSpringBoneManager!.joints.size,
      'Reloaded VRM should have SpringBone joints',
    ).toBeGreaterThan(0)

    // SpringBoneが実際に動作することを確認（updateを呼んでもエラーにならない）
    expect(() => reloadedSpringBoneManager!.update(1 / 60)).not.toThrow()
  })

  it('should preserve SpringBone after loadVRM -> exportVRM roundtrip (without optimization)', async () => {
    // 最適化なしでexportVRMを使用した場合のテスト
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()

    const loadResult = await loadVRM(originalBuffer)
    expect(loadResult.isOk()).toBe(true)
    const originalVRM = loadResult._unsafeUnwrap()

    if (!originalVRM.springBoneManager) {
      return
    }

    // exportVRMでエクスポート（最適化なし）
    const exportResult = await exportVRM(originalVRM)
    expect(exportResult.isOk()).toBe(true)
    const exportedBuffer = exportResult._unsafeUnwrap()

    // 再読み込み
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const reloadedGltf = await loader.parseAsync(exportedBuffer, '')
    const reloadedVRM = reloadedGltf.userData.vrm as VRM
    expect(reloadedVRM).toBeDefined()

    // SpringBoneの確認
    const reloadedSpringBoneManager = reloadedVRM.springBoneManager
    expect(reloadedSpringBoneManager).toBeDefined()
    expect(reloadedSpringBoneManager!.joints.size).toBeGreaterThan(0)
    expect(() => reloadedSpringBoneManager!.update(1 / 60)).not.toThrow()
  })
})

import { BoxGeometry, Mesh, MeshPhysicalMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { exportVRMToBuffer, loadVRMFromBuffer } from './helpers/vrm-roundtrip'

/**
 * MToon 以外のマテリアルを含む VRM の extensionsUsed ラウンドトリップテスト
 *
 * PBR のアクセサリ（KHR_materials_specular 付きの MeshPhysicalMaterial など）が
 * 残っていると、GLTFExporter が組み込み拡張の一覧で json.extensionsUsed を
 * 上書きし、プラグインが追加した VRMC_vrm / XRIFT_mtoon_atlas などが消えていた。
 * その結果、エクスポートした VRM を読み込み直すと userData.vrm が得られなかった。
 */
describe('extensionsUsed Roundtrip', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  /** GLB バイナリから JSON チャンクを取り出す */
  function readGlbJson(buffer: ArrayBuffer) {
    const view = new DataView(buffer)
    const jsonLength = view.getUint32(12, true)
    const jsonBytes = new Uint8Array(buffer, 20, jsonLength)
    return JSON.parse(new TextDecoder().decode(jsonBytes))
  }

  it('PBR マテリアルのメッシュが残っていても VRM として読み込み直せる', async () => {
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm } = await loadVRMFromBuffer(originalBuffer)

    const optimizeResult = await optimizeModel(vrm)
    expect(optimizeResult.isOk()).toBe(true)

    // アトラス化の対象外になる PBR のアクセサリを追加する
    const accessory = new Mesh(
      new BoxGeometry(),
      new MeshPhysicalMaterial({ specularIntensity: 0.5 }),
    )
    accessory.name = 'PBRAccessory'
    vrm.scene.add(accessory)

    const exportedBuffer = await exportVRMToBuffer(vrm)
    const json = readGlbJson(exportedBuffer)

    expect(json.extensionsUsed).toContain('KHR_materials_specular')
    expect(json.extensionsUsed).toContain('VRMC_vrm')
    expect(json.extensionsUsed).toContain('VRMC_springBone')
    expect(json.extensionsUsed).toContain('XRIFT_mtoon_atlas')

    const { vrm: reloadedVRM } = await loadVRMFromBuffer(exportedBuffer)
    expect(reloadedVRM).toBeDefined()
    expect(reloadedVRM.humanoid).toBeDefined()
  })
})

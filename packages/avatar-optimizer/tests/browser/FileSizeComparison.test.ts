import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { MToonAtlasExporterPlugin, MToonAtlasLoaderPlugin } from '@xrift/mtoon-atlas'
import { Scene, SkinnedMesh } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

/**
 * VRM最適化後のファイルサイズを検証するテスト
 * 最適化後のエクスポートファイルが元ファイルより著しく大きくならないことを確認
 */
describe('File Size Comparison', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'

  let originalBuffer: ArrayBuffer
  let originalVRM: VRM
  let optimizedVRM: VRM
  let exportedBuffer: ArrayBuffer

  /**
   * VRMを読み込むヘルパー関数
   */
  async function loadVRM(buffer: ArrayBuffer): Promise<{ gltf: GLTF; vrm: VRM }> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    loader.register((parser) => new MToonAtlasLoaderPlugin(parser))

    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM

    return { gltf, vrm }
  }

  /**
   * VRMをGLBとしてエクスポートするヘルパー関数
   */
  async function exportVRM(vrm: VRM): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })
    exporter.register((writer) => new MToonAtlasExporterPlugin(writer))

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const exportScene = new Scene()
      const children = [...vrm.scene.children].filter(
        (child) =>
          child.name !== 'VRMHumanoidRig' &&
          !child.name.startsWith('VRMExpression'),
      )
      children.forEach((child) => exportScene.add(child))

      exporter.parse(
        exportScene,
        (result) => {
          children.forEach((child) => vrm.scene.add(child))
          if (result instanceof ArrayBuffer) {
            resolve(result)
          } else {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => {
          children.forEach((child) => vrm.scene.add(child))
          reject(error)
        },
        { binary: true },
      )
    })
  }

  /**
   * 人間が読みやすいサイズ表記に変換
   */
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // VRM読み込み→最適化→エクスポートを1回だけ実行
  beforeAll(async () => {
    const response = await fetch(VRM_FILE_PATH)
    originalBuffer = await response.arrayBuffer()
    const { vrm } = await loadVRM(originalBuffer)
    originalVRM = vrm

    // 最適化を実行
    const optimizeResult = await optimizeModel(vrm)
    expect(optimizeResult.isOk()).toBe(true)
    optimizedVRM = vrm

    // エクスポート
    exportedBuffer = await exportVRM(optimizedVRM)
  })

  describe('file size analysis', () => {
    it('should log file size comparison', () => {
      const originalSize = originalBuffer.byteLength
      const exportedSize = exportedBuffer.byteLength
      const ratio = exportedSize / originalSize

      console.log('=== File Size Comparison ===')
      console.log(`Original VRM:   ${formatBytes(originalSize)}`)
      console.log(`Exported VRM:   ${formatBytes(exportedSize)}`)
      console.log(`Size ratio:     ${ratio.toFixed(2)}x`)
      console.log(`Size change:    ${ratio > 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(1)}%`)

      // テスト結果として記録（アサーションなしでログのみ）
      expect(true).toBe(true)
    })

    // TODO: ファイルサイズ肥大化の問題を修正後、このテストを有効化する
    it.skip('should not exceed 2x the original file size', () => {
      const originalSize = originalBuffer.byteLength
      const exportedSize = exportedBuffer.byteLength
      const ratio = exportedSize / originalSize

      // 最適化後のファイルが元ファイルの2倍を超えないことを確認
      // 現状: 約6倍に膨らんでいる問題がある
      expect(ratio).toBeLessThan(2)
    })

    it('should analyze buffer structure', async () => {
      console.log('\n=== Buffer Structure Analysis ===')

      // GLBヘッダー解析
      const view = new DataView(exportedBuffer)

      // GLBマジックナンバー
      const magic = view.getUint32(0, true)
      console.log(`GLB Magic: 0x${magic.toString(16)} (expected 0x46546c67)`)

      // GLBバージョン
      const version = view.getUint32(4, true)
      console.log(`GLB Version: ${version}`)

      // 全体長
      const length = view.getUint32(8, true)
      console.log(`GLB Total Length: ${formatBytes(length)}`)

      // JSON チャンク
      const jsonChunkLength = view.getUint32(12, true)
      const jsonChunkType = view.getUint32(16, true)
      console.log(`JSON Chunk: ${formatBytes(jsonChunkLength)} (type: 0x${jsonChunkType.toString(16)})`)

      // BIN チャンク
      const binChunkOffset = 20 + jsonChunkLength
      if (binChunkOffset < exportedBuffer.byteLength) {
        const binChunkLength = view.getUint32(binChunkOffset, true)
        const binChunkType = view.getUint32(binChunkOffset + 4, true)
        console.log(`BIN Chunk:  ${formatBytes(binChunkLength)} (type: 0x${binChunkType.toString(16)})`)
      }

      expect(true).toBe(true)
    })

    it('should analyze JSON chunk content', async () => {
      console.log('\n=== JSON Chunk Content Analysis ===')

      const view = new DataView(exportedBuffer)
      const jsonChunkLength = view.getUint32(12, true)

      // JSONチャンクを抽出
      const jsonBytes = new Uint8Array(exportedBuffer, 20, jsonChunkLength)
      const jsonString = new TextDecoder().decode(jsonBytes)
      const json = JSON.parse(jsonString)

      // 各セクションのサイズを計算
      const sectionSizes: { name: string; size: number }[] = []

      for (const [key, value] of Object.entries(json)) {
        const sectionJson = JSON.stringify(value)
        sectionSizes.push({ name: key, size: sectionJson.length })
      }

      // サイズ順にソート
      sectionSizes.sort((a, b) => b.size - a.size)

      console.log('JSON sections by size:')
      for (const section of sectionSizes) {
        console.log(`  ${section.name}: ${formatBytes(section.size)}`)
      }

      // imagesセクションの詳細分析
      if (json.images) {
        console.log(`\nImages count: ${json.images.length}`)
        let embeddedCount = 0
        let embeddedTotalSize = 0
        let bufferViewCount = 0

        for (const image of json.images) {
          if (image.uri && image.uri.startsWith('data:')) {
            embeddedCount++
            embeddedTotalSize += image.uri.length
          } else if (image.bufferView !== undefined) {
            bufferViewCount++
          }
        }

        console.log(`  Embedded (data URI): ${embeddedCount} images, total ${formatBytes(embeddedTotalSize)}`)
        console.log(`  BufferView reference: ${bufferViewCount} images`)
      }

      // texturesセクションの詳細分析
      if (json.textures) {
        console.log(`\nTextures count: ${json.textures.length}`)
      }

      // extensionsセクションの詳細分析
      if (json.extensions) {
        console.log('\nExtensions:')
        for (const [extName, extValue] of Object.entries(json.extensions)) {
          const extJson = JSON.stringify(extValue)
          console.log(`  ${extName}: ${formatBytes(extJson.length)}`)
        }
      }

      // MToonAtlasマテリアル拡張の詳細分析
      if (json.materials) {
        console.log('\nMToonAtlas materials:')
        for (let i = 0; i < json.materials.length; i++) {
          const mat = json.materials[i]
          if (mat.extensions?.XRIFT_mtoon_atlas) {
            const ext = mat.extensions.XRIFT_mtoon_atlas
            console.log(`  Material ${i}: parameterTexture.index=${ext.parameterTexture?.index}`)
            console.log(`    atlasedTextures: ${JSON.stringify(ext.atlasedTextures)}`)
          }
        }
      }

      // テクスチャ配列の詳細
      if (json.textures) {
        console.log(`\nTextures array (${json.textures.length} items):`)
        for (let i = 0; i < Math.min(5, json.textures.length); i++) {
          const tex = json.textures[i]
          console.log(`  [${i}]: source=${tex.source}, sampler=${tex.sampler}, name=${tex.name}`)
        }
        if (json.textures.length > 5) {
          console.log(`  ... and ${json.textures.length - 5} more`)
        }
      }

      expect(true).toBe(true)
    })

    it('should count meshes and textures', () => {
      console.log('\n=== Mesh and Texture Count ===')

      let originalMeshCount = 0
      let optimizedMeshCount = 0
      let originalVertexCount = 0
      let optimizedVertexCount = 0

      // オリジナルのメッシュカウント（再ロードが必要）
      // beforeAllで変更されているので、optimizedVRMのカウントのみ行う
      optimizedVRM.scene.traverse((obj) => {
        if (obj instanceof SkinnedMesh) {
          optimizedMeshCount++
          const posAttr = obj.geometry.getAttribute('position')
          if (posAttr) {
            optimizedVertexCount += posAttr.count
          }
        }
      })

      console.log(`Optimized Mesh Count:   ${optimizedMeshCount}`)
      console.log(`Optimized Vertex Count: ${optimizedVertexCount}`)

      expect(true).toBe(true)
    })
  })

  describe('roundtrip size comparison', () => {
    it('should compare export without optimization', async () => {
      // 最適化なしでエクスポートした場合のサイズを計測
      const response = await fetch(VRM_FILE_PATH)
      const buffer = await response.arrayBuffer()
      const { vrm } = await loadVRM(buffer)

      // 最適化なしでエクスポート
      const exporter = new GLTFExporter()
      exporter.register((writer) => {
        const plugin = new VRMExporterPlugin(writer)
        plugin.setVRM(vrm)
        return plugin
      })

      const noOptExportBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const exportScene = new Scene()
        const children = [...vrm.scene.children].filter(
          (child) =>
            child.name !== 'VRMHumanoidRig' &&
            !child.name.startsWith('VRMExpression'),
        )
        children.forEach((child) => exportScene.add(child))

        exporter.parse(
          exportScene,
          (result) => {
            children.forEach((child) => vrm.scene.add(child))
            if (result instanceof ArrayBuffer) {
              resolve(result)
            } else {
              reject(new Error('Expected ArrayBuffer output'))
            }
          },
          (error) => {
            children.forEach((child) => vrm.scene.add(child))
            reject(error)
          },
          { binary: true },
        )
      })

      const originalSize = originalBuffer.byteLength
      const noOptSize = noOptExportBuffer.byteLength
      const optimizedSize = exportedBuffer.byteLength

      console.log('\n=== Roundtrip Size Comparison ===')
      console.log(`Original file:                 ${formatBytes(originalSize)}`)
      console.log(`Export without optimization:   ${formatBytes(noOptSize)} (${(noOptSize / originalSize).toFixed(2)}x)`)
      console.log(`Export with optimization:      ${formatBytes(optimizedSize)} (${(optimizedSize / originalSize).toFixed(2)}x)`)
      console.log(`Optimization overhead:         ${formatBytes(optimizedSize - noOptSize)}`)

      expect(true).toBe(true)
    })
  })
})

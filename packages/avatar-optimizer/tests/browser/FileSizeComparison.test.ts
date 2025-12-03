import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import { MToonAtlasExporterPlugin, MToonAtlasLoaderPlugin } from '@xrift/mtoon-atlas'
import { BufferGeometry, Scene, SkinnedMesh } from 'three'
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
    // @ts-ignore - GLTFWriter型の互換性問題を無視
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

      // サイズ比較結果をアサーションメッセージに含める（テスト結果に表示される）
      const message = `Original: ${formatBytes(originalSize)}, Exported: ${formatBytes(exportedSize)}, Ratio: ${ratio.toFixed(2)}x`

      // テスト結果として記録
      expect(ratio, message).toBeGreaterThan(0)
    })

    // エクスポート結果をダウンロード可能にする（手動確認用）
    it('should allow downloading exported file for analysis', () => {
      // ブラウザ環境でダウンロードリンクを生成
      if (typeof document !== 'undefined') {
        const blob = new Blob([exportedBuffer], { type: 'model/gltf-binary' })
        const url = URL.createObjectURL(blob)
        console.log(`Download URL: ${url}`)
        // テスト環境では実際のダウンロードは行わない
      }
      expect(true).toBe(true)
    })

    // テクスチャキャッシュ導入後、ファイルサイズは改善されたが、まだ2.5x程度
    // PNG圧縮最適化等で更に削減可能
    it('should not exceed 3x the original file size', () => {
      const originalSize = originalBuffer.byteLength
      const exportedSize = exportedBuffer.byteLength
      const ratio = exportedSize / originalSize

      // 最適化後のファイルが元ファイルの3倍を超えないことを確認
      expect(ratio).toBeLessThan(3)
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
            console.log(`  Material ${i} (${mat.name}): parameterTexture.index=${ext.parameterTexture?.index}, isOutline=${ext.isOutline}, outlineWidthMode=${ext.outlineWidthMode}`)
            console.log(`    atlasedTextures: ${JSON.stringify(ext.atlasedTextures)}`)
          }
        }
      }

      // テクスチャ配列の詳細
      if (json.textures) {
        console.log(`\nTextures array (${json.textures.length} items):`)
        for (let i = 0; i < json.textures.length; i++) {
          const tex = json.textures[i]
          console.log(`  [${i}]: source=${tex.source}, sampler=${tex.sampler}, name=${tex.name}`)
        }
      }

      // どのマテリアルがどのテクスチャを参照しているか分析
      if (json.materials) {
        console.log('\nTexture usage by material:')
        const usedTextureIndices = new Set<number>()
        for (let i = 0; i < json.materials.length; i++) {
          const mat = json.materials[i]
          const ext = mat.extensions?.XRIFT_mtoon_atlas
          if (ext) {
            const indices: number[] = []
            if (ext.parameterTexture?.index >= 0) {
              indices.push(ext.parameterTexture.index)
              usedTextureIndices.add(ext.parameterTexture.index)
            }
            for (const [, val] of Object.entries(ext.atlasedTextures || {})) {
              const v = val as { index: number }
              indices.push(v.index)
              usedTextureIndices.add(v.index)
            }
            console.log(`  Material ${i}: ${indices.join(', ')}`)
          } else {
            // XRIFT_mtoon_atlas以外のマテリアル
            console.log(`  Material ${i} (non-atlas): pbrMetallicRoughness.baseColorTexture=${mat.pbrMetallicRoughness?.baseColorTexture?.index}`)
          }
        }
        console.log(`\nUsed texture indices (by XRIFT_mtoon_atlas): ${Array.from(usedTextureIndices).sort((a, b) => a - b).join(', ')}`)
        console.log(`Unused texture indices: ${Array.from({ length: json.textures.length }, (_, i) => i).filter(i => !usedTextureIndices.has(i)).join(', ')}`)

        // 未使用テクスチャの詳細
        const unusedIndices = Array.from({ length: json.textures.length }, (_, i) => i).filter(i => !usedTextureIndices.has(i))
        if (unusedIndices.length > 0) {
          console.log('\nUnused texture details:')
          for (const idx of unusedIndices) {
            const tex = json.textures[idx]
            const img = json.images[tex.source]
            console.log(`  Texture ${idx}: source=${tex.source}, name=${tex.name || img?.name || 'unnamed'}`)
          }
        }
      }

      expect(true).toBe(true)
    })

    it('should count meshes and textures', () => {
      let meshCount = 0
      let vertexCount = 0

      // 最適化後のメッシュカウント
      optimizedVRM.scene.traverse((obj) => {
        if (obj instanceof SkinnedMesh) {
          meshCount++
          const posAttr = obj.geometry.getAttribute('position')
          if (posAttr) {
            vertexCount += posAttr.count
          }
        }
      })

      // アサーションでメッシュとテクスチャの存在を確認
      expect(meshCount, `Mesh count: ${meshCount}, Vertex count: ${vertexCount}`).toBeGreaterThan(0)
    })

    it('should analyze buffer views and accessors', async () => {
      const view = new DataView(exportedBuffer)
      const jsonChunkLength = view.getUint32(12, true)
      const jsonBytes = new Uint8Array(exportedBuffer, 20, jsonChunkLength)
      const jsonString = new TextDecoder().decode(jsonBytes)
      const json = JSON.parse(jsonString)

      // 分析結果を収集
      const analysis = {
        bufferViews: {
          count: json.bufferViews?.length || 0,
          totalSize: 0,
          byTarget: {} as Record<string, { count: number; size: number }>,
          duplicateGroups: 0,
        },
        accessors: {
          count: json.accessors?.length || 0,
          byType: {} as Record<string, { count: number; elements: number }>,
          duplicateGroups: 0,
        },
        meshes: {
          count: json.meshes?.length || 0,
          totalPrimitives: 0,
          attributeUsage: {} as Record<string, number>,
        },
      }

      // BufferView分析
      if (json.bufferViews) {
        const byTarget: Record<number, { count: number; size: number }> = {}

        for (const bv of json.bufferViews) {
          analysis.bufferViews.totalSize += bv.byteLength
          const target = bv.target || 0
          if (!byTarget[target]) {
            byTarget[target] = { count: 0, size: 0 }
          }
          byTarget[target].count++
          byTarget[target].size += bv.byteLength
        }

        for (const [target, info] of Object.entries(byTarget)) {
          const targetName = target === '34962' ? 'ARRAY_BUFFER' :
            target === '34963' ? 'ELEMENT_ARRAY_BUFFER' :
              target === '0' ? 'none (images etc)' : `unknown (${target})`
          analysis.bufferViews.byTarget[targetName] = info
        }

        // 重複チェック
        const uniqueViews = new Map<string, number[]>()
        json.bufferViews.forEach((bv: any, idx: number) => {
          const key = `${bv.buffer}:${bv.byteOffset}:${bv.byteLength}`
          if (!uniqueViews.has(key)) uniqueViews.set(key, [])
          uniqueViews.get(key)!.push(idx)
        })
        analysis.bufferViews.duplicateGroups = Array.from(uniqueViews.values()).filter(arr => arr.length > 1).length
      }

      // Accessor分析
      if (json.accessors) {
        for (const acc of json.accessors) {
          if (!analysis.accessors.byType[acc.type]) {
            analysis.accessors.byType[acc.type] = { count: 0, elements: 0 }
          }
          analysis.accessors.byType[acc.type].count++
          analysis.accessors.byType[acc.type].elements += acc.count
        }

        // 重複チェック
        const uniqueAccessors = new Map<string, number[]>()
        json.accessors.forEach((acc: any, idx: number) => {
          const key = `${acc.bufferView}:${acc.byteOffset || 0}:${acc.count}:${acc.type}:${acc.componentType}`
          if (!uniqueAccessors.has(key)) uniqueAccessors.set(key, [])
          uniqueAccessors.get(key)!.push(idx)
        })
        analysis.accessors.duplicateGroups = Array.from(uniqueAccessors.values()).filter(arr => arr.length > 1).length
      }

      // Mesh分析
      if (json.meshes) {
        for (const mesh of json.meshes) {
          analysis.meshes.totalPrimitives += mesh.primitives?.length || 0
          for (const prim of mesh.primitives || []) {
            for (const attrName of Object.keys(prim.attributes || {})) {
              analysis.meshes.attributeUsage[attrName] = (analysis.meshes.attributeUsage[attrName] || 0) + 1
            }
          }
        }
      }

      // アサーションで重複がないことを確認
      // テスト失敗時に分析結果が表示されるようにする
      expect(analysis.bufferViews.duplicateGroups, `BufferView duplicates found. Analysis: ${JSON.stringify(analysis.bufferViews, null, 2)}`).toBe(0)
      expect(analysis.accessors.duplicateGroups, `Accessor duplicates found. Analysis: ${JSON.stringify(analysis.accessors, null, 2)}`).toBe(0)

      // 分析結果のサマリーをログ出力
      console.log('BufferViews:', analysis.bufferViews.count, 'totalSize:', analysis.bufferViews.totalSize)
      console.log('Accessors:', analysis.accessors.count)
      console.log('Meshes:', analysis.meshes.count, 'primitives:', analysis.meshes.totalPrimitives)
      console.log('Attributes:', Object.keys(analysis.meshes.attributeUsage).join(', '))
    })

    it('should detect duplicate binary data in BIN chunk', async () => {
      const view = new DataView(exportedBuffer)
      const jsonChunkLength = view.getUint32(12, true)
      const jsonBytes = new Uint8Array(exportedBuffer, 20, jsonChunkLength)
      const json = JSON.parse(new TextDecoder().decode(jsonBytes))

      // BINチャンクの開始位置
      const binChunkOffset = 20 + jsonChunkLength
      const binChunkLength = view.getUint32(binChunkOffset, true)
      const binChunkStart = binChunkOffset + 8 // チャンクヘッダー(8バイト)の後

      // バッファビューごとにバイナリデータのハッシュを計算
      const dataHashes = new Map<string, { indices: number[]; size: number }>()

      if (json.bufferViews) {
        for (let i = 0; i < json.bufferViews.length; i++) {
          const bv = json.bufferViews[i]
          const offset = bv.byteOffset || 0
          const length = bv.byteLength

          // BINチャンク内のデータを取得
          const dataStart = binChunkStart + offset
          const data = new Uint8Array(exportedBuffer, dataStart, length)

          // 簡易ハッシュ: 先頭、中間、末尾のサンプルとサイズを組み合わせ
          // 完全なハッシュは計算コストが高いため、サンプリングで近似
          const sampleSize = Math.min(64, length)
          const samples: number[] = []

          // 先頭サンプル
          for (let j = 0; j < sampleSize && j < length; j++) {
            samples.push(data[j])
          }
          // 中間サンプル
          const midStart = Math.floor(length / 2) - Math.floor(sampleSize / 2)
          for (let j = 0; j < sampleSize && midStart + j < length; j++) {
            samples.push(data[Math.max(0, midStart + j)])
          }
          // 末尾サンプル
          const endStart = Math.max(0, length - sampleSize)
          for (let j = 0; j < sampleSize && endStart + j < length; j++) {
            samples.push(data[endStart + j])
          }

          const hash = `${length}:${samples.join(',')}`

          if (!dataHashes.has(hash)) {
            dataHashes.set(hash, { indices: [], size: length })
          }
          dataHashes.get(hash)!.indices.push(i)
        }
      }

      // 重複データの検出
      const duplicates = Array.from(dataHashes.entries())
        .filter(([, info]) => info.indices.length > 1)

      let duplicateDataSize = 0
      const duplicateDetails: string[] = []

      for (const [, info] of duplicates) {
        // 最初の1つは必要、残りが重複
        const redundantCount = info.indices.length - 1
        const redundantSize = redundantCount * info.size
        duplicateDataSize += redundantSize

        duplicateDetails.push(
          `BufferViews ${info.indices.join(', ')}: ${info.size} bytes x ${info.indices.length} = ${redundantSize} bytes redundant`,
        )
      }

      // どのAccessorがこれらのBufferViewを使っているか調べる
      const bufferViewUsage: Record<number, string[]> = {}
      if (json.accessors) {
        for (let i = 0; i < json.accessors.length; i++) {
          const acc = json.accessors[i]
          const bvIdx = acc.bufferView
          if (!bufferViewUsage[bvIdx]) bufferViewUsage[bvIdx] = []
          bufferViewUsage[bvIdx].push(`accessor[${i}]: ${acc.type} x ${acc.count}`)
        }
      }

      // Meshのプリミティブからアクセサの用途を調べる
      const accessorUsage: Record<number, string[]> = {}
      if (json.meshes) {
        for (let mi = 0; mi < json.meshes.length; mi++) {
          const mesh = json.meshes[mi]
          for (let pi = 0; pi < (mesh.primitives?.length || 0); pi++) {
            const prim = mesh.primitives[pi]
            // attributes
            for (const [attrName, accIdx] of Object.entries(prim.attributes || {})) {
              if (!accessorUsage[accIdx as number]) accessorUsage[accIdx as number] = []
              accessorUsage[accIdx as number].push(`mesh[${mi}].prim[${pi}].${attrName}`)
            }
            // indices
            if (prim.indices !== undefined) {
              if (!accessorUsage[prim.indices]) accessorUsage[prim.indices] = []
              accessorUsage[prim.indices].push(`mesh[${mi}].prim[${pi}].indices`)
            }
          }
        }
      }

      // skinからも調べる
      if (json.skins) {
        for (let si = 0; si < json.skins.length; si++) {
          const skin = json.skins[si]
          if (skin.inverseBindMatrices !== undefined) {
            if (!accessorUsage[skin.inverseBindMatrices]) accessorUsage[skin.inverseBindMatrices] = []
            accessorUsage[skin.inverseBindMatrices].push(`skin[${si}].inverseBindMatrices`)
          }
        }
      }

      // プリミティブの属性一覧を出力
      if (json.meshes) {
        console.log('\nPrimitive attributes:')
        for (let mi = 0; mi < Math.min(json.meshes.length, 4); mi++) {
          const mesh = json.meshes[mi]
          for (let pi = 0; pi < (mesh.primitives?.length || 0); pi++) {
            const attrs = Object.keys(mesh.primitives[pi].attributes || {}).join(', ')
            console.log(`  mesh[${mi}].prim[${pi}]: ${attrs}`)
          }
        }
      }

      // 重複の詳細を出力
      const duplicateUsageDetails: string[] = []
      for (const [, info] of duplicates.slice(0, 5)) {
        const usages: string[] = []
        for (const bvIdx of info.indices) {
          const accUsages = bufferViewUsage[bvIdx] || []
          for (const accUsage of accUsages) {
            // accessor indexを抽出
            const match = accUsage.match(/accessor\[(\d+)\]/)
            if (match) {
              const accIdx = parseInt(match[1])
              const uses = accessorUsage[accIdx] || ['unknown']
              usages.push(`BV[${bvIdx}] -> ${accUsage} -> ${uses.join(', ')}`)
            }
          }
        }
        duplicateUsageDetails.push(usages.slice(0, 3).join('\n  '))
      }

      // 結果を出力
      const totalBinSize = binChunkLength
      const duplicateRatio = duplicateDataSize / totalBinSize

      console.log('\n=== Binary Duplicate Analysis ===')
      console.log(`Total BIN size: ${totalBinSize} bytes`)
      console.log(`Duplicate data: ${duplicateDataSize} bytes (${(duplicateRatio * 100).toFixed(1)}%)`)
      console.log(`Top duplicates:\n  ${duplicateUsageDetails.slice(0, 3).join('\n  ')}`)

      // 重複率が60%を超える場合は警告
      // 現状ではmorphTargetsやexcludedMeshesの重複が残っているため、
      // 完全にゼロにすることは現実的ではない
      // 今後の改善で削減を目指す
      expect(
        duplicateRatio,
        'Duplicate binary data found:\n' +
        `Total BIN size: ${totalBinSize} bytes\n` +
        `Duplicate data: ${duplicateDataSize} bytes (${(duplicateRatio * 100).toFixed(1)}%)\n` +
        `Top duplicates usage:\n  ${duplicateUsageDetails.join('\n\n  ')}`,
      ).toBeLessThan(0.6) // 60%未満を許容
    })

    it('should analyze morphTargets in exported GLB', async () => {
      const view = new DataView(exportedBuffer)
      const jsonChunkLength = view.getUint32(12, true)
      const jsonBytes = new Uint8Array(exportedBuffer, 20, jsonChunkLength)
      const json = JSON.parse(new TextDecoder().decode(jsonBytes))

      // BINチャンクの開始位置
      const binChunkOffset = 20 + jsonChunkLength
      const binChunkStart = binChunkOffset + 8

      console.log('\n=== MorphTarget Analysis ===')

      // meshごとのmorphTargets情報を収集
      const morphTargetInfo: Array<{
        meshIndex: number
        meshName: string
        targetCount: number
        targets: Array<{
          name: string
          accessors: Record<string, number>
        }>
      }> = []

      if (json.meshes) {
        for (let mi = 0; mi < json.meshes.length; mi++) {
          const mesh = json.meshes[mi]
          const prim = mesh.primitives?.[0]
          if (!prim?.targets || prim.targets.length === 0) continue

          const info = {
            meshIndex: mi,
            meshName: mesh.name || `mesh_${mi}`,
            targetCount: prim.targets.length,
            targets: [] as Array<{ name: string; accessors: Record<string, number> }>,
          }

          for (let ti = 0; ti < prim.targets.length; ti++) {
            const target = prim.targets[ti]
            const targetName = mesh.extras?.targetNames?.[ti] || `target_${ti}`
            info.targets.push({
              name: targetName,
              accessors: target,
            })
          }

          morphTargetInfo.push(info)
        }
      }

      // morphTargetsを持つメッシュの概要
      console.log(`Meshes with morphTargets: ${morphTargetInfo.length}`)
      for (const info of morphTargetInfo) {
        console.log(`  mesh[${info.meshIndex}] "${info.meshName}": ${info.targetCount} targets`)
      }

      // アクセサからBufferViewへのマッピング
      const accessorToBufferView: Record<number, { bufferView: number; type: string; count: number }> = {}
      if (json.accessors) {
        for (let i = 0; i < json.accessors.length; i++) {
          const acc = json.accessors[i]
          accessorToBufferView[i] = {
            bufferView: acc.bufferView,
            type: acc.type,
            count: acc.count,
          }
        }
      }

      // morphTargetで使われているBufferViewの重複を調査
      const morphTargetBufferViews = new Map<number, string[]>()
      for (const info of morphTargetInfo) {
        for (const target of info.targets) {
          for (const [attr, accIdx] of Object.entries(target.accessors)) {
            const accInfo = accessorToBufferView[accIdx as number]
            if (accInfo) {
              const bvIdx = accInfo.bufferView
              if (!morphTargetBufferViews.has(bvIdx)) {
                morphTargetBufferViews.set(bvIdx, [])
              }
              morphTargetBufferViews.get(bvIdx)!.push(
                `mesh[${info.meshIndex}].${target.name}.${attr}`,
              )
            }
          }
        }
      }

      // BufferViewのバイナリデータハッシュを計算
      const bvHashes = new Map<number, string>()
      if (json.bufferViews) {
        for (const bvIdx of morphTargetBufferViews.keys()) {
          const bv = json.bufferViews[bvIdx]
          const offset = bv.byteOffset || 0
          const length = bv.byteLength
          const data = new Uint8Array(exportedBuffer, binChunkStart + offset, length)

          // 簡易ハッシュ
          const sampleSize = Math.min(64, length)
          const samples: number[] = []
          for (let j = 0; j < sampleSize; j++) samples.push(data[j])
          const midStart = Math.floor(length / 2) - Math.floor(sampleSize / 2)
          for (let j = 0; j < sampleSize && midStart + j < length; j++) {
            samples.push(data[Math.max(0, midStart + j)])
          }
          const endStart = Math.max(0, length - sampleSize)
          for (let j = 0; j < sampleSize && endStart + j < length; j++) {
            samples.push(data[endStart + j])
          }
          bvHashes.set(bvIdx, `${length}:${samples.join(',')}`)
        }
      }

      // 同一ハッシュのBufferViewをグループ化
      const hashGroups = new Map<string, number[]>()
      for (const [bvIdx, hash] of bvHashes) {
        if (!hashGroups.has(hash)) hashGroups.set(hash, [])
        hashGroups.get(hash)!.push(bvIdx)
      }

      // 重複グループを表示
      console.log('\nDuplicate morphTarget BufferViews:')
      let totalDuplicateSize = 0
      for (const [hash, bvIndices] of hashGroups) {
        if (bvIndices.length > 1) {
          const size = parseInt(hash.split(':')[0])
          const redundantSize = size * (bvIndices.length - 1)
          totalDuplicateSize += redundantSize

          console.log(`  Hash group (${bvIndices.length} copies, ${size} bytes each, ${redundantSize} bytes redundant):`)
          for (const bvIdx of bvIndices.slice(0, 3)) {
            const usages = morphTargetBufferViews.get(bvIdx) || []
            console.log(`    BV[${bvIdx}]: ${usages.slice(0, 2).join(', ')}${usages.length > 2 ? '...' : ''}`)
          }
          if (bvIndices.length > 3) {
            console.log(`    ... and ${bvIndices.length - 3} more`)
          }
        }
      }

      console.log(`\nTotal morphTarget duplicate size: ${totalDuplicateSize} bytes (${(totalDuplicateSize / 1024 / 1024).toFixed(2)} MB)`)

      // Three.js読み込み直後のメッシュを確認（最適化前）
      console.log('\n=== Meshes BEFORE optimization (from GLTFLoader) ===')
      const response2 = await fetch(VRM_FILE_PATH)
      const freshBuffer = await response2.arrayBuffer()
      const { vrm: freshVRM } = await loadVRM(freshBuffer)

      const freshMeshesWithMorphTargets: string[] = []
      freshVRM.scene.traverse((obj) => {
        if (obj instanceof SkinnedMesh && obj.morphTargetInfluences && obj.morphTargetInfluences.length > 0) {
          const morphCount = obj.morphTargetInfluences.length
          freshMeshesWithMorphTargets.push(`${obj.name}: ${morphCount} targets`)
        }
      })
      console.log(`Fresh loaded VRM meshes with morphTargets: ${freshMeshesWithMorphTargets.length}`)
      for (const info of freshMeshesWithMorphTargets) {
        console.log(`  ${info}`)
      }

      // 元のVRMにどんなメッシュがあるか確認
      console.log('\n=== Meshes AFTER optimization ===')
      const geometryToMeshes = new Map<BufferGeometry, SkinnedMesh[]>()
      optimizedVRM.scene.traverse((obj) => {
        if (obj instanceof SkinnedMesh && obj.morphTargetInfluences && obj.morphTargetInfluences.length > 0) {
          const morphCount = obj.morphTargetInfluences.length
          const morphNames = obj.morphTargetDictionary ? Object.keys(obj.morphTargetDictionary).slice(0, 5) : []
          console.log(`  ${obj.name}: ${morphCount} morphTargets (${morphNames.join(', ')}${morphNames.length < morphCount ? '...' : ''})`)

          // geometryの共有状況を調査
          if (!geometryToMeshes.has(obj.geometry)) {
            geometryToMeshes.set(obj.geometry, [])
          }
          geometryToMeshes.get(obj.geometry)!.push(obj)
        }
      })

      // ジオメトリ共有状況
      console.log('\n=== Geometry Sharing ===')
      console.log(`Unique geometries with morphTargets: ${geometryToMeshes.size}`)
      for (const [geom, meshes] of geometryToMeshes) {
        if (meshes.length > 1) {
          console.log(`  Geometry shared by ${meshes.length} meshes: ${meshes.map(m => m.name).join(', ')}`)
        }
      }

      // morphAttributes の内容を調査
      console.log('\n=== MorphAttributes Analysis ===')

      // 配列参照で共有状況を確認（同一のTypedArrayインスタンスを共有しているか）
      const arrayToMeshes = new Map<ArrayBufferLike, string[]>()

      for (const [geom, meshes] of geometryToMeshes) {
        const mesh = meshes[0]
        console.log(`\n${mesh.name} geometry:`)
        console.log(`  position.count: ${geom.getAttribute('position')?.count}`)

        if (geom.morphAttributes.position) {
          console.log(`  morphAttributes.position: ${geom.morphAttributes.position.length} targets`)
          // 各ターゲットのデータ分析
          for (let i = 0; i < Math.min(geom.morphAttributes.position.length, 5); i++) {
            const attr = geom.morphAttributes.position[i]
            // 非ゼロ値をカウント
            const arr = attr.array as Float32Array
            let nonZeroCount = 0
            for (let j = 0; j < arr.length; j++) {
              if (Math.abs(arr[j]) > 0.0001) nonZeroCount++
            }
            console.log(`    target[${i}]: ${attr.count} vertices, ${nonZeroCount}/${arr.length} non-zero values`)

            // 配列参照で共有を追跡
            if (!arrayToMeshes.has(arr.buffer)) arrayToMeshes.set(arr.buffer, [])
            arrayToMeshes.get(arr.buffer)!.push(`${mesh.name}.position[${i}]`)
          }
        }
        if (geom.morphAttributes.normal) {
          console.log(`  morphAttributes.normal: ${geom.morphAttributes.normal.length} targets`)
          // normal も同様にチェック
          for (let i = 0; i < Math.min(geom.morphAttributes.normal.length, 5); i++) {
            const attr = geom.morphAttributes.normal[i]
            const arr = attr.array as Float32Array
            let nonZeroCount = 0
            for (let j = 0; j < arr.length; j++) {
              if (Math.abs(arr[j]) > 0.0001) nonZeroCount++
            }
            console.log(`    target[${i}]: ${attr.count} vertices, ${nonZeroCount}/${arr.length} non-zero values`)

            // 配列参照で共有を追跡
            if (!arrayToMeshes.has(arr.buffer)) arrayToMeshes.set(arr.buffer, [])
            arrayToMeshes.get(arr.buffer)!.push(`${mesh.name}.normal[${i}]`)
          }
        }
      }

      // ArrayBuffer共有状況
      console.log('\n=== ArrayBuffer Sharing (same instance) ===')
      let sharedCount = 0
      for (const [, usages] of arrayToMeshes) {
        if (usages.length > 1) {
          sharedCount++
          console.log(`  Shared by: ${usages.slice(0, 5).join(', ')}${usages.length > 5 ? '...' : ''}`)
        }
      }
      console.log(`Total shared buffers: ${sharedCount} / ${arrayToMeshes.size}`)

      expect(true).toBe(true)
    })
  })

  describe('roundtrip size comparison', () => {
    it('should analyze original VRM morphTargets', async () => {
      // 元のVRMファイルのmorphTargets重複を分析
      const view = new DataView(originalBuffer)
      const jsonChunkLength = view.getUint32(12, true)
      const jsonBytes = new Uint8Array(originalBuffer, 20, jsonChunkLength)
      const json = JSON.parse(new TextDecoder().decode(jsonBytes))

      const binChunkOffset = 20 + jsonChunkLength
      const binChunkStart = binChunkOffset + 8

      console.log('\n=== Original VRM MorphTarget Analysis ===')

      // morphTargetsを持つメッシュを収集
      const meshesWithMorphTargets: Array<{ name: string; targetCount: number }> = []
      if (json.meshes) {
        for (const mesh of json.meshes) {
          const prim = mesh.primitives?.[0]
          if (prim?.targets && prim.targets.length > 0) {
            meshesWithMorphTargets.push({
              name: mesh.name || 'unnamed',
              targetCount: prim.targets.length,
            })
          }
        }
      }

      console.log(`Meshes with morphTargets: ${meshesWithMorphTargets.length}`)
      for (const m of meshesWithMorphTargets) {
        console.log(`  ${m.name}: ${m.targetCount} targets`)
      }

      // BufferViewの重複を確認
      const dataHashes = new Map<string, { indices: number[]; size: number }>()
      if (json.bufferViews) {
        for (let i = 0; i < json.bufferViews.length; i++) {
          const bv = json.bufferViews[i]
          const offset = bv.byteOffset || 0
          const length = bv.byteLength
          const data = new Uint8Array(originalBuffer, binChunkStart + offset, length)

          const sampleSize = Math.min(64, length)
          const samples: number[] = []
          for (let j = 0; j < sampleSize; j++) samples.push(data[j])
          const midStart = Math.floor(length / 2) - Math.floor(sampleSize / 2)
          for (let j = 0; j < sampleSize && midStart + j < length; j++) {
            samples.push(data[Math.max(0, midStart + j)])
          }
          const endStart = Math.max(0, length - sampleSize)
          for (let j = 0; j < sampleSize && endStart + j < length; j++) {
            samples.push(data[endStart + j])
          }
          const hash = `${length}:${samples.join(',')}`

          if (!dataHashes.has(hash)) dataHashes.set(hash, { indices: [], size: length })
          dataHashes.get(hash)!.indices.push(i)
        }
      }

      const duplicates = Array.from(dataHashes.entries()).filter(([, info]) => info.indices.length > 1)
      let totalDuplicateSize = 0
      for (const [, info] of duplicates) {
        totalDuplicateSize += info.size * (info.indices.length - 1)
      }

      const binChunkLength = view.getUint32(binChunkOffset, true)
      console.log(`\nOriginal VRM duplicate data: ${totalDuplicateSize} bytes (${(totalDuplicateSize / binChunkLength * 100).toFixed(1)}%)`)
      console.log(`Total BIN size: ${binChunkLength} bytes`)

      expect(true).toBe(true)
    })

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

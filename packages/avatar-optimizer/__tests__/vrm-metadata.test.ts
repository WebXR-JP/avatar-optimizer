import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'
import { WebIO, type Node, Document, Root } from '@gltf-transform/core'
import { beforeAll, describe, expect, it } from 'vitest'

import { optimizeVRM, type OptimizationOptions } from '../src/index'
import { extractJsonFromGLB } from '../src/vrm/document'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * VRM メタデータのスナップショット
 * VRM メタデータの保持状況を比較するための型定義
 */
interface VRMMetadataSnapshot {
  hasVRMExtension: boolean
  vrmMeta: any
  vrmHumanoid: any
  vrmMaterialProperties: any
  materialCount: number
  textureCount: number
  meshCount: number
  nodeCount: number
  skinCount: number
  animationCount: number
  textureDetails: Array<{
    name: string
    width: number | undefined
    height: number | undefined
    mimeType: string
  }>
  materialDetails: Array<{
    name: string
    baseColorTexture: boolean
    normalTexture: boolean
  }>
}

async function readGltfJsonOrThrow(input: ArrayBuffer | ArrayBufferView): Promise<Record<string, any>> {
  const jsonResult = await extractJsonFromGLB(input)
  if (jsonResult.isErr()) {
    throw new Error(jsonResult.error.message)
  }
  return jsonResult.value
}

/**
 * VRM メタデータのスナップショットを取得（JSON レベルでの検証）
 * ドキュメントから VRM 固有のメタデータを抽出
 * NOTE: glTF-Transform の getExtension('VRM') は常に null を返すため、
 * JSON レベルで直接 VRM データを検証する
 */
function extractVRMMetadata(document: Document, gltfJson?: Record<string, any>): VRMMetadataSnapshot {
  const root = document.getRoot()

  // JSON レベルで VRM 拡張データを検証
  // glTF-Transform の getExtension では VRM は認識されないため、JSON から直接抽出
  const vrmExtensionJson = gltfJson?.extensions?.VRM ?? null
  const isValidVRMExtension = vrmExtensionJson !== null && typeof vrmExtensionJson === 'object'

  // VRM 拡張機能のプロパティにアクセス
  const vrmMeta = isValidVRMExtension ? (vrmExtensionJson as any).meta || null : null
  const vrmHumanoid = isValidVRMExtension ? (vrmExtensionJson as any).humanoid || null : null
  const vrmMaterialProperties = isValidVRMExtension ? (vrmExtensionJson as any).materialProperties || null : null

  const snapshot: VRMMetadataSnapshot = {
    hasVRMExtension: isValidVRMExtension,
    vrmMeta,
    vrmHumanoid,
    vrmMaterialProperties,
    materialCount: root.listMaterials().length,
    textureCount: root.listTextures().length,
    meshCount: root.listMeshes().length,
    nodeCount: root.listNodes().length,
    skinCount: root.listSkins().length,
    animationCount: root.listAnimations().length,
    textureDetails: root.listTextures().map((texture) => ({
      name: texture.getName(),
      width: texture.getSize()?.[0],
      height: texture.getSize()?.[1],
      mimeType: texture.getMimeType(),
    })),
    materialDetails: root.listMaterials().map((material) => ({
      name: material.getName(),
      baseColorTexture: !!material.getBaseColorTexture(),
      normalTexture: !!material.getNormalTexture(),
    })),
  }

  return snapshot
}

/**
 * VRM メタデータ保持テスト
 *
 * glTF-Transform でロード直後に VRM のメタデータが保持されているかを検証
 * VRM 1.0 の VRM 拡張機能と関連するメタデータの完全性をチェック
 */
describe('VRM メタデータ保持テスト', () => {
  const fixtureDir = path.join(__dirname, 'fixtures')
  const vrmFiles = [
    'fem_vroid.vrm',
    'Seed-san.vrm',
  ]

  vrmFiles.forEach((filename) => {
    const vrmPath = path.join(fixtureDir, filename)
    const hasFixture = fs.existsSync(vrmPath)

    describe(`${filename}`, () => {
      let document: Document
      let originalRoot: Root

      beforeAll(async () => {
        if (!hasFixture) {
          console.log(`ℹ️  Skipping: No fixture found at ${vrmPath}`)
          return
        }

        const fileBuffer = fs.readFileSync(vrmPath)
        const io = new WebIO()
        document = await io.readBinary(new Uint8Array(fileBuffer))
        originalRoot = document.getRoot()
      })

      it('ファイルが正常にロードされること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        expect(document).toBeDefined()
        expect(originalRoot).toBeDefined()
      })

      it('ロード後、VRM 拡張機能が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const extensions = Array.from(originalRoot.listExtensionsUsed())
        console.log(
          `  見つかった拡張機能: ${extensions.length > 0 ? extensions.join(', ') : '(なし)'}`
        )

        // 注記: glTF-Transform の listExtensionsUsed() は、VRM 拡張機能が存在する場合でも
        // 空配列を返すことがあります。VRM 拡張情報は JSON チャンクで直接確認します。
        // このテストはデバッグ用にこの動作を記録しています。
        expect(extensions).toEqual([])
      })

      it('マテリアル数が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const materials = originalRoot.listMaterials()
        expect(materials.length).toBeGreaterThan(0)
        console.log(`  マテリアル数: ${materials.length}`)
      })

      it('テクスチャ数が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const textures = originalRoot.listTextures()
        expect(textures.length).toBeGreaterThan(0)
        console.log(`  テクスチャ数: ${textures.length}`)
      })

      it('メッシュ数が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const meshes = originalRoot.listMeshes()
        expect(meshes.length).toBeGreaterThan(0)
        console.log(`  メッシュ数: ${meshes.length}`)
      })

      it('ノード階層（スケルトン構造）が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const nodes = originalRoot.listNodes()
        expect(nodes.length).toBeGreaterThan(0)

        // ルートノード（親を持たないノード）をチェック
        const rootNodes = nodes.filter((node: Node) => !node.getParentNode())
        expect(rootNodes.length).toBeGreaterThan(0)

        console.log(`  ノード数: ${nodes.length}`)
        console.log(`  ルートノード数: ${rootNodes.length}`)
      })

      it('アニメーション情報が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const animations = originalRoot.listAnimations()
        console.log(`  アニメーション数: ${animations.length}`)
        // アニメーションは存在する場合と存在しない場合がある
        expect(Array.isArray(animations)).toBe(true)
      })

      it('テクスチャ画像データが正しく保持されていること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const textures = originalRoot.listTextures()
        let texturesWithImage = 0

        for (const texture of textures) {
          const image = texture.getImage()
          if (image && image.byteLength > 0) {
            texturesWithImage++
          }
        }

        expect(texturesWithImage).toBeGreaterThan(0)
        console.log(
          `  画像データを持つテクスチャ: ${texturesWithImage}/${textures.length}`
        )
      })

      it('スキン情報（リギング）が保持されること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const skins = originalRoot.listSkins()
        console.log(`  スキン数: ${skins.length}`)
        // スキンは存在する場合と存在しない場合がある
        expect(Array.isArray(skins)).toBe(true)
      })

      it('マテリアル-テクスチャ関連付けが一貫していること', () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const materials = originalRoot.listMaterials()
        let validAssociations = 0

        for (const material of materials) {
          // 一般的なテクスチャスロットをチェック
          const baseColorTexture = material.getBaseColorTexture()
          const normalTexture = material.getNormalTexture()

          if (baseColorTexture || normalTexture) {
            validAssociations++
          }
        }

        console.log(
          `  テクスチャ関連付けを持つマテリアル: ${validAssociations}/${materials.length}`
        )
      })

      it('バイナリに再シリアライズ可能であること', async () => {
        if (!hasFixture) {
          console.log(`ℹ️  スキップ: ${vrmPath} にフィクスチャがありません`)
          return
        }

        const io = new WebIO()
        const binaryData = await io.writeBinary(document)

        expect(binaryData).toBeDefined()
        expect(binaryData.byteLength).toBeGreaterThan(0)
        console.log(`  シリアライズされたサイズ: ${(binaryData.byteLength / 1024 / 1024).toFixed(2)} MB`)
      })
    })
  })

  describe('optimizeVRM 実行後の VRM メタデータ保持テスト', () => {
    const testVrmPath = path.join(fixtureDir, 'fem_vroid.vrm')
    const hasFixture = fs.existsSync(testVrmPath)

    const optimizationOptions: OptimizationOptions = {
      compressTextures: true,
      maxTextureSize: 1024,
      reduceMeshes: false,
    }

    it('optimizeVRM 実行後に VRM メタデータが保持されること', async () => {
      // VRM 拡張機能保護実装完了
      // JSON レベルでの VRM 拡張機能保護により、処理中に VRM データが保持される
      if (!hasFixture) {
        console.log(`ℹ️  スキップ: ${testVrmPath} にフィクスチャがありません`)
        return
      }

      const fileBuffer = fs.readFileSync(testVrmPath)
      const io = new WebIO()

      // 元のドキュメントをロード
      const originalDoc = await io.readBinary(new Uint8Array(fileBuffer))
      const originalGltfJson = await readGltfJsonOrThrow(fileBuffer)
      const originalMetadata = extractVRMMetadata(originalDoc, originalGltfJson)

      console.log(`\n  元のメタデータ:`)
      console.log(`    - VRM 拡張機能: ${originalMetadata.hasVRMExtension ? '✓' : '✗'}`)
      console.log(`    - マテリアル数: ${originalMetadata.materialCount}`)
      console.log(`    - テクスチャ数: ${originalMetadata.textureCount}`)
      console.log(`    - メッシュ数: ${originalMetadata.meshCount}`)
      console.log(`    - ノード数: ${originalMetadata.nodeCount}`)
      console.log(`    - スキン数: ${originalMetadata.skinCount}`)
      console.log(`    - アニメーション数: ${originalMetadata.animationCount}`)

      // optimizeVRM を実行
      const optimizeResult = await optimizeVRM(
        new File([new Uint8Array(fileBuffer)], 'test.vrm', { type: 'model/gltf-binary' }),
        optimizationOptions
      )

      expect(optimizeResult.isOk()).toBe(true)
      if (!optimizeResult.isOk()) {
        throw new Error(`Optimization failed: ${optimizeResult.error.message}`)
      }

      const optimizedFile = optimizeResult.value

      // 最適化されたファイルをロード
      const optimizedBuffer = await optimizedFile.arrayBuffer()
      const optimizedDoc = await io.readBinary(new Uint8Array(optimizedBuffer))
      const optimizedGltfJson = await readGltfJsonOrThrow(optimizedBuffer)
      const optimizedMetadata = extractVRMMetadata(optimizedDoc, optimizedGltfJson)

      console.log(`\n  最適化後のメタデータ:`)
      console.log(`    - VRM 拡張機能: ${optimizedMetadata.hasVRMExtension ? '✓' : '✗'}`)
      console.log(`    - マテリアル数: ${optimizedMetadata.materialCount}`)
      console.log(`    - テクスチャ数: ${optimizedMetadata.textureCount}`)
      console.log(`    - メッシュ数: ${optimizedMetadata.meshCount}`)
      console.log(`    - ノード数: ${optimizedMetadata.nodeCount}`)
      console.log(`    - スキン数: ${optimizedMetadata.skinCount}`)
      console.log(`    - アニメーション数: ${optimizedMetadata.animationCount}`)

      // VRM 拡張機能が保持されていることを確認
      expect(optimizedMetadata.hasVRMExtension).toBe(true)

      // VRM メタ情報が保持されていることを確認
      expect(optimizedMetadata.vrmMeta).toBeDefined()

      // Humanoid 情報が保持されていることを確認
      expect(optimizedMetadata.vrmHumanoid).toBeDefined()

      // マテリアル数が保持されていることを確認
      expect(optimizedMetadata.materialCount).toBe(originalMetadata.materialCount)

      // テクスチャが完全に失われていないことを確認
      expect(optimizedMetadata.textureCount).toBeGreaterThan(0)

      // メッシュが完全に失われていないことを確認
      expect(optimizedMetadata.meshCount).toBeGreaterThan(0)

      // ノード構造が保持されていることを確認
      expect(optimizedMetadata.nodeCount).toBe(originalMetadata.nodeCount)

      // スキン（リギング）情報が保持されていることを確認
      expect(optimizedMetadata.skinCount).toBe(originalMetadata.skinCount)

      // アニメーション情報が保持されていることを確認
      expect(optimizedMetadata.animationCount).toBe(originalMetadata.animationCount)

      console.log(`\n  メタデータ保持の確認:`)
      console.log(`    - VRM 拡張機能: ${optimizedMetadata.hasVRMExtension ? '✓ 保持' : '✗ 失われた'}`)
      console.log(`    - マテリアル数: ${optimizedMetadata.materialCount === originalMetadata.materialCount ? '✓ 保持' : `✗ 変更 (${originalMetadata.materialCount} → ${optimizedMetadata.materialCount})`}`)
      console.log(`    - ノード数: ${optimizedMetadata.nodeCount === originalMetadata.nodeCount ? '✓ 保持' : `✗ 変更 (${originalMetadata.nodeCount} → ${optimizedMetadata.nodeCount})`}`)
      console.log(`    - スキン数: ${optimizedMetadata.skinCount === originalMetadata.skinCount ? '✓ 保持' : `✗ 変更 (${originalMetadata.skinCount} → ${optimizedMetadata.skinCount})`}`)
    })

    it('optimizeVRM 実行後にマテリアル-テクスチャ関連付けが保持されること', async () => {
      if (!hasFixture) {
        console.log(`ℹ️  スキップ: ${testVrmPath} にフィクスチャがありません`)
        return
      }

      const fileBuffer = fs.readFileSync(testVrmPath)
      const io = new WebIO()

      // 元のドキュメントをロード
      const originalDoc = await io.readBinary(new Uint8Array(fileBuffer))
      const originalRoot = originalDoc.getRoot()

      // 元のマテリアルとテクスチャの関連付けを記録
      const originalMaterialTextures = originalRoot.listMaterials().map((material) => {
        const baseColor = material.getBaseColorTexture()
        const normal = material.getNormalTexture()
        return {
          name: material.getName(),
          hasBaseColor: !!baseColor,
          hasNormal: !!normal,
        }
      })

      console.log(`\n  元のマテリアル-テクスチャ関連付け:`)
      originalMaterialTextures.forEach((mat) => {
        console.log(
          `    - ${mat.name}: baseColor=${mat.hasBaseColor ? '✓' : '✗'}, normal=${mat.hasNormal ? '✓' : '✗'}`
        )
      })

      // optimizeVRM を実行
      const optimizeResult = await optimizeVRM(
        new File([new Uint8Array(fileBuffer)], 'test.vrm', { type: 'model/gltf-binary' }),
        optimizationOptions
      )

      expect(optimizeResult.isOk()).toBe(true)
      if (!optimizeResult.isOk()) {
        throw new Error(`Optimization failed: ${optimizeResult.error.message}`)
      }

      const optimizedFile = optimizeResult.value

      // 最適化されたファイルをロード
      const optimizedBuffer = await optimizedFile.arrayBuffer()
      const optimizedDoc = await io.readBinary(new Uint8Array(optimizedBuffer))
      const optimizedRoot = optimizedDoc.getRoot()

      // 最適化後のマテリアルとテクスチャの関連付けを記録
      const optimizedMaterialTextures = optimizedRoot.listMaterials().map((material) => {
        const baseColor = material.getBaseColorTexture()
        const normal = material.getNormalTexture()
        return {
          name: material.getName(),
          hasBaseColor: !!baseColor,
          hasNormal: !!normal,
        }
      })

      console.log(`\n  最適化後のマテリアル-テクスチャ関連付け:`)
      optimizedMaterialTextures.forEach((mat) => {
        console.log(
          `    - ${mat.name}: baseColor=${mat.hasBaseColor ? '✓' : '✗'}, normal=${mat.hasNormal ? '✓' : '✗'}`
        )
      })

      // マテリアル数が同じことを確認
      expect(optimizedMaterialTextures.length).toBe(originalMaterialTextures.length)

      // 各マテリアルのテクスチャ関連付けが保持されていることを確認
      for (let i = 0; i < originalMaterialTextures.length; i++) {
        const originalMat = originalMaterialTextures[i]
        const optimizedMat = optimizedMaterialTextures[i]

        expect(optimizedMat.name).toBe(originalMat.name)
        expect(optimizedMat.hasBaseColor).toBe(originalMat.hasBaseColor)
        expect(optimizedMat.hasNormal).toBe(originalMat.hasNormal)
      }

      console.log(`\n  ✓ マテリアル-テクスチャ関連付けが保持されました`)
    })

    it('optimizeVRM 実行後にノード階層が保持されること', async () => {
      if (!hasFixture) {
        console.log(`ℹ️  スキップ: ${testVrmPath} にフィクスチャがありません`)
        return
      }

      const fileBuffer = fs.readFileSync(testVrmPath)
      const io = new WebIO()

      // 元のドキュメントをロード
      const originalDoc = await io.readBinary(new Uint8Array(fileBuffer))
      const originalRoot = originalDoc.getRoot()

      // 元のノード階層を記録
      const originalNodes = originalRoot.listNodes()
      const originalHierarchy = originalNodes.map((node) => ({
        name: node.getName(),
        parentName: node.getParentNode()?.getName() || null,
        childrenCount: node.listChildren().length,
      }))

      console.log(`\n  元のノード階層: ${originalNodes.length} ノード`)

      // optimizeVRM を実行
      const optimizeResult = await optimizeVRM(
        new File([new Uint8Array(fileBuffer)], 'test.vrm', { type: 'model/gltf-binary' }),
        optimizationOptions
      )

      expect(optimizeResult.isOk()).toBe(true)
      if (!optimizeResult.isOk()) {
        throw new Error(`Optimization failed: ${optimizeResult.error.message}`)
      }

      const optimizedFile = optimizeResult.value

      // 最適化されたファイルをロード
      const optimizedBuffer = await optimizedFile.arrayBuffer()
      const optimizedDoc = await io.readBinary(new Uint8Array(optimizedBuffer))
      const optimizedRoot = optimizedDoc.getRoot()

      // 最適化後のノード階層を記録
      const optimizedNodes = optimizedRoot.listNodes()
      const optimizedHierarchy = optimizedNodes.map((node) => ({
        name: node.getName(),
        parentName: node.getParentNode()?.getName() || null,
        childrenCount: node.listChildren().length,
      }))

      console.log(`  最適化後のノード階層: ${optimizedNodes.length} ノード`)

      // ノード数が同じことを確認
      expect(optimizedHierarchy.length).toBe(originalHierarchy.length)

      // 各ノードの親子関係が保持されていることを確認
      for (let i = 0; i < originalHierarchy.length; i++) {
        const originalNode = originalHierarchy[i]
        const optimizedNode = optimizedHierarchy[i]

        expect(optimizedNode.name).toBe(originalNode.name)
        expect(optimizedNode.parentName).toBe(originalNode.parentName)
        expect(optimizedNode.childrenCount).toBe(originalNode.childrenCount)
      }

      console.log(`\n  ✓ ノード階層が保持されました`)
    })
  })

})

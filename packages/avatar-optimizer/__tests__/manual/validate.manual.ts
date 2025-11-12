/**
 * VRM バリデーション機能の手動確認スクリプト
 * npx tsx __tests__/manual/validate.manual.ts で実行
 *
 * 使用方法:
 * - __tests__/input/ ディレクトリに VRM ファイルを配置
 * - スクリプトを実行してバリデーション結果を確認
 */

import { validateVRMFile } from '../../src/index'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function manualValidateVRM() {
  const inputDir = path.join(__dirname, '../input')
  const fixtureDir = path.join(__dirname, '../fixtures')

  // Check for VRM files in input directory first
  let targetFile: string | undefined

  if (fs.existsSync(inputDir)) {
    const files = fs.readdirSync(inputDir)
    const vrmFiles = files.filter((f) => f.endsWith('.vrm') || f.endsWith('.glb') || f.endsWith('.gltf'))
    if (vrmFiles.length > 0) {
      targetFile = path.join(inputDir, vrmFiles[0])
      console.log(`📁 Found VRM file in input: ${vrmFiles[0]}`)
    }
  }

  // Fallback to fixture if no input file found
  if (!targetFile && fs.existsSync(fixtureDir)) {
    const files = fs.readdirSync(fixtureDir)
    const vrmFiles = files.filter((f) => f.endsWith('.glb') || f.endsWith('.vrm') || f.endsWith('.gltf'))
    if (vrmFiles.length > 0) {
      targetFile = path.join(fixtureDir, vrmFiles[0])
      console.log(`📁 Using fixture file: ${vrmFiles[0]}`)
    }
  }

  if (!targetFile) {
    console.log('❌ No VRM files found in input or fixtures directories')
    console.log(`   Expected file in: ${inputDir}`)
    return
  }

  const fileName = path.basename(targetFile)
  console.log(`\n🔍 Validating: ${fileName}`)
  console.log(`   Size: ${(fs.statSync(targetFile).size / 1024 / 1024).toFixed(2)} MB`)
  console.log('   Running validation...')

  const fileBuffer = fs.readFileSync(targetFile)
  const file = new File([fileBuffer], fileName, { type: 'model/gltf-binary' })

  const result = await validateVRMFile(file)

  if (result.isErr()) {
    console.log(`\n❌ Validation error:`)
    console.log(`   Type: ${result.error.type}`)
    console.log(`   Message: ${result.error.message}`)
    return
  }

  const validation = result.value

  if (validation.isValid) {
    console.log(`\n✅ VRM is valid!`)
  } else {
    console.log(`\n⚠️  VRM has validation issues`)
  }

  // Show statistics
  if (validation.info) {
    console.log(`\n📊 Model Information:`)
    console.log(`   Version: ${validation.info.version || 'N/A'}`)
    console.log(`   Generator: ${validation.info.generator || 'N/A'}`)
    if (validation.info.materialCount !== undefined) {
      console.log(`   Materials: ${validation.info.materialCount}`)
    }
    if (validation.info.totalVertexCount !== undefined) {
      console.log(`   Vertices: ${validation.info.totalVertexCount}`)
    }
    if (validation.info.totalTriangleCount !== undefined) {
      console.log(`   Triangles: ${validation.info.totalTriangleCount}`)
    }
    if (validation.info.hasTextures) {
      console.log(`   Textures: Yes`)
    }
    if (validation.info.hasSkins) {
      console.log(`   Rigged: Yes`)
    }
  }

  // Show issues
  if (validation.issues.length === 0) {
    console.log(`\n✓ No validation issues found`)
  } else {
    const errors = validation.issues.filter((i) => i.severity === 'error')
    const warnings = validation.issues.filter((i) => i.severity === 'warning')
    const infos = validation.issues.filter((i) => i.severity === 'info')

    console.log(`\n📋 Validation Issues:`)
    if (errors.length > 0) {
      console.log(`\n   ❌ Errors: ${errors.length}`)
      errors.slice(0, 5).forEach((issue) => {
        console.log(`      - [${issue.code}] ${issue.message}`)
        if (issue.pointer) {
          console.log(`        at ${issue.pointer}`)
        }
      })
      if (errors.length > 5) {
        console.log(`      ... and ${errors.length - 5} more errors`)
      }
    }

    if (warnings.length > 0) {
      console.log(`\n   ⚠️  Warnings: ${warnings.length}`)
      warnings.slice(0, 5).forEach((issue) => {
        console.log(`      - [${issue.code}] ${issue.message}`)
        if (issue.pointer) {
          console.log(`        at ${issue.pointer}`)
        }
      })
      if (warnings.length > 5) {
        console.log(`      ... and ${warnings.length - 5} more warnings`)
      }
    }

    if (infos.length > 0 && infos.length <= 5) {
      console.log(`\n   ℹ️  Info: ${infos.length}`)
      infos.forEach((issue) => {
        console.log(`      - [${issue.code}] ${issue.message}`)
      })
    }
  }

  console.log(`\n✓ Validation complete`)
}

manualValidateVRM().catch((error) => {
  console.error('❌ Unexpected error:', String(error))
  process.exit(1)
})

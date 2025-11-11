import { WebIO } from '@gltf-transform/core'
import * as fs from 'fs'
import * as path from 'path'

async function checkVRMExtension(filePath: string) {
  const io = new WebIO()
  const buffer = fs.readFileSync(filePath)
  const document = await io.readBinary(new Uint8Array(buffer))

  const root = document.getRoot()
  const extensionsUsed = root.getExtensionsUsed()
  const extensionsRequired = root.getExtensionsRequired()

  console.log('📋 拡張機能チェック:')
  console.log('  extensionsUsed:', extensionsUsed)
  console.log('  extensionsRequired:', extensionsRequired)

  const hasVRMExtension = extensionsUsed.includes('VRMC_vrm')
  console.log(`\n  VRMC_vrm 拡張機能: ${hasVRMExtension ? '✅ あり' : '❌ なし'}`)

  return hasVRMExtension
}

async function main() {
  console.log('=== 元のファイル ===')
  await checkVRMExtension('__tests__/fixtures/Seed-san.vrm')

  console.log('\n=== 最適化済みファイル ===')
  await checkVRMExtension('./tmp/Seed-san_optimized.vrm')
}

main().catch(console.error)

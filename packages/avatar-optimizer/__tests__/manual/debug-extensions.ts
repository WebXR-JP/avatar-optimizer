import { WebIO } from '@gltf-transform/core'
import * as fs from 'fs'

async function debugExtensions() {
  const io = new WebIO()
  const buffer = fs.readFileSync('__tests__/fixtures/Seed-san.vrm')
  const document = await io.readBinary(new Uint8Array(buffer))

  // 書き出してから読み込み直す
  const outputBuffer = await io.writeBinary(document)
  const outputDocument = await io.readBinary(new Uint8Array(outputBuffer))
  
  console.log('元のドキュメント extensionsUsed:', document.getRoot().listExtensionsUsed())
  console.log('出力後のドキュメント extensionsUsed:', outputDocument.getRoot().listExtensionsUsed())
  
  console.log('\n警告メッセージから判断: VRMファイルにVRMC_vrm拡張機能が含まれている')
  console.log('しかしglTF-Transformは拡張機能の内容を読み込みません（実装されていない）')
}

debugExtensions().catch(console.error)

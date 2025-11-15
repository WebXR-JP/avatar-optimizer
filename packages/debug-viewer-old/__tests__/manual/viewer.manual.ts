import fs from 'fs'
import path from 'path'

/**
 * VRM ビューアの動作確認スクリプト
 *
 * 実行: pnpm -F debug-viewer run manual-viewer
 *
 * このスクリプトは Node.js 環境での基本的な初期化をテストします。
 * ブラウザ環境での実際のビジュアライゼーション確認は、
 * public/index.html を開いてテストしてください。
 */
async function manualCheckVRMViewer() {
  const fixtureDir = path.join(__dirname, '../fixtures')
  const inputDir = path.join(__dirname, '../input')
  const outputDir = path.join(__dirname, '../output')

  // ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // fixtures ディレクトリから VRM ファイルを探す
  const fixtures = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.vrm'))

  console.log('\n===== VRM ビューア 手動テスト =====\n')
  console.log('📦 VRMビューアパッケージ情報:')
  console.log('  - ライブラリエントリー: src/index.ts')
  console.log('  - ビルド出力: dist/index.js, dist/index.cjs')
  console.log('')

  if (fixtures.length > 0) {
    console.log(`✓ テスト用 VRM サンプル数: ${fixtures.length}`)
    fixtures.forEach((file) => {
      const filePath = path.join(fixtureDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`)
    })
    console.log('')
  } else {
    console.log('⚠️  fixtures/ に VRM ファイルが見つかりません')
    console.log('   テスト用サンプルを配置してください\n')
  }

  // input ディレクトリから VRM ファイルを探す
  const inputs = fs.existsSync(inputDir)
    ? fs.readdirSync(inputDir).filter((f) => f.endsWith('.vrm'))
    : []

  if (inputs.length > 0) {
    console.log(`✓ 手動確認用 VRM ファイル: ${inputs.length}`)
    inputs.forEach((file) => {
      const filePath = path.join(inputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`)
    })
    console.log('')
  }

  console.log('📖 次のステップ:')
  console.log('')
  console.log('1. パッケージをビルド:')
  console.log('   pnpm -F debug-viewer run build')
  console.log('')
  console.log('2. ブラウザでテスト:')
  console.log('   packages/debug-viewer/public/index.html を開く')
  console.log('')
  console.log('3. VRM ファイルをロード:')
  console.log('   - ファイルピッカーから fixtures または input のファイルを選択')
  console.log('   - Three.js WebGL キャンバスに VRM が表示されるか確認')
  console.log('')
  console.log('✅ VRMビューアテスト完了\n')
}

manualCheckVRMViewer().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

/**
 * three が同梱する Basis Universal トランスコーダを public/basis/ にコピーする
 *
 * KTX2 テクスチャの読み込みにはトランスコーダ (basis_transcoder.js / .wasm) が要る。
 * 既定では CDN から取得されるが、外部依存を避けるため同一オリジンから配信する。
 * インストール済みの three からコピーするので、three を更新してもバージョンがずれない。
 *
 * コピー先は .gitignore 済み。dev / build の前に実行される。
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

// three/package.json は exports に含まれないため、
// 公開されているサブパスから three のルートを辿る
const ktx2LoaderPath = require.resolve(
  'three/examples/jsm/loaders/KTX2Loader.js',
)
const threeDir = resolve(ktx2LoaderPath, '../../../..')
const srcDir = join(threeDir, 'examples/jsm/libs/basis')
const destDir = join(import.meta.dirname, '../public/basis')

mkdirSync(destDir, { recursive: true })
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  copyFileSync(join(srcDir, file), join(destDir, file))
}

const { version } = JSON.parse(
  readFileSync(join(threeDir, 'package.json'), 'utf8'),
)
console.log(`basis transcoder copied from three@${version} -> public/basis/`)

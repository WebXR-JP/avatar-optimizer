/**
 * GitHub Pages の SPA フォールバック用に dist/404.html を作る
 *
 * GitHub Pages は存在しないパスに対して 404.html を返す。index.html をそのまま
 * 置いておけば、`/textures` や `/stress` を直接開いても SPA が起動し、
 * ルーターが元の URL を解決してくれる（配信は 404 ステータスになる）。
 *
 * index.html の asset URL は Vite が base 込みの絶対パスで出力するため、
 * 404.html をサブパスから返してもアセットは正しく読み込まれる。
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../dist')
const indexHtml = join(distDir, 'index.html')

if (!existsSync(indexHtml))
{
  console.error('dist/index.html がありません。vite build の後に実行してください。')
  process.exit(1)
}

copyFileSync(indexHtml, join(distDir, '404.html'))
console.log('dist/404.html copied (SPA fallback)')

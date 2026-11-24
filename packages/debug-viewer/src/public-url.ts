/**
 * public/ 配下のファイルを base パス込みの URL に変換する
 *
 * GitHub Pages のプロジェクトページ (https://<org>.github.io/<repo>/) のように
 * サブパスで配信される場合、`/AliciaSolid.vrm` のようなルート絶対パスは
 * ドメイン直下を指してしまい 404 になる。Vite の `base` を前置きすることで、
 * ローカル開発（`/`）とサブパス配信のどちらでも同じコードで動かす。
 *
 * @param path - `public/` からのパス（先頭の `/` は有無どちらでもよい）
 * @returns base を前置きした URL
 *
 * @example
 * publicUrl('/samples/test.vrma') // base が '/' なら '/samples/test.vrma'
 *                                 // base が '/avatar-optimizer/' なら
 *                                 // '/avatar-optimizer/samples/test.vrma'
 */
export function publicUrl(path: string): string
{
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/${path.replace(/^\//, '')}`
}

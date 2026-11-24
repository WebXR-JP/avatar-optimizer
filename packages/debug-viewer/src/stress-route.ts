/**
 * マルチ VRM ストレステスト（`/stress`）のルート定義
 *
 * 数十体の VRM を同時に読み込むため、通常のデバッグビューアとは状態を共有しない
 * 単独ページとして提供する。条件はすべて URL クエリで指定でき、再現性のある
 * 計測（同じ URL を開けば同じ条件になる）を優先している。
 *
 * StrictMode の二重マウントで VRM を 2 倍読み込んでしまうため、このページだけは
 * StrictMode の外で描画する（main.tsx を参照）。
 */

/** ストレステストのパス */
export const STRESS_PATH = '/stress'

/**
 * 指定されたパスがストレステストかどうかを返す
 *
 * 末尾スラッシュの有無はどちらも許可する。GitHub Pages のプロジェクトページ
 * のようにサブパス配信される場合は `baseUrl` に Vite の base を渡す。
 *
 * @param pathname - `window.location.pathname`
 * @param baseUrl - `import.meta.env.BASE_URL`（既定は `/`）
 */
export function isStressRoute(pathname: string, baseUrl: string = '/'): boolean
{
  // pathname は base を含むため、base を除いてからアプリ内パスとして判定する
  const base = baseUrl.replace(/\/$/, '')
  const appPath = base && pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname
  return /^\/stress\/?$/.test(appPath)
}

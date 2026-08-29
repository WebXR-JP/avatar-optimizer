/**
 * KTX2Loader の生成とトランスコーダーパスの設定
 *
 * トランスコーダー（basis_transcoder.wasm / .js）の配信元は、
 * 既定では jsdelivr の CDN だが、以下の理由で差し替えたいことがある。
 *
 * - CDN 障害や CORS 事故の影響を受けたくない（自己ホストしたい）
 * - アプリ側がインストールしている three とバージョンを揃えたい
 *
 * 差し替え方法は 3 通りあり、優先順位は次のとおり。
 *
 * 1. `MToonAtlasLoaderPlugin` に `ktx2Loader` を渡す（設定済みインスタンスを共有）
 * 2. `MToonAtlasLoaderPlugin` に `ktx2TranscoderPath` を渡す（プラグイン単位）
 * 3. `setKtx2TranscoderPath()` でアプリ全体の既定値を変える（起動時に一度呼ぶ）
 */
import { WebGLRenderer } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

/**
 * トランスコーダーパスの既定値
 *
 * 明示的に設定されない限り CDN を使う。バージョンは peerDependencies の
 * 下限 (three >= 0.181) に合わせてある。KTX2Loader のワーカーは three 側の
 * コードなので、極端に古いトランスコーダーだと将来の three で
 * 未実装 API を呼んで壊れうる（例: r181 は ktx2File.isHDR() を参照する）。
 *
 * とはいえ URL に固定バージョンを書く以上、利用側の three とのずれは残る。
 * 確実に揃えたい場合は three が同梱するトランスコーダーを
 * node_modules からコピーして自己ホストし、setKtx2TranscoderPath() で
 * そのパスを指定すること（README 参照）。
 */
export const DEFAULT_KTX2_TRANSCODER_PATH =
  'https://cdn.jsdelivr.net/npm/three@0.181.1/examples/jsm/libs/basis/'

/**
 * 末尾スラッシュを補う
 *
 * KTX2Loader はパスとファイル名を単純連結するため、末尾スラッシュが無いと
 * `/basisbasis_transcoder.js` を取りに行って 404 になり、
 * ワーカー内の分かりにくいエラーで KTX2 テクスチャだけが無言で欠落する。
 * キャッシュキーの表記ゆれを防ぐ意味でもここで揃える。
 */
function normalizeTranscoderPath(path: string): string
{
  return path.endsWith('/') ? path : `${path}/`
}

let defaultTranscoderPath: string = DEFAULT_KTX2_TRANSCODER_PATH

/**
 * パスごとの KTX2Loader キャッシュ
 *
 * KTX2Loader の生成には detectSupport のための一時 WebGLRenderer が要るため、
 * 同じパスに対しては使い回す。パスをキーにすることで、
 * 別パスを指定したプラグインが誤って同じインスタンスを掴むのを防ぐ。
 */
const loaderCache = new Map<string, KTX2Loader>()

/**
 * KTX2 トランスコーダーの配信元をアプリ全体で切り替える
 *
 * アプリ起動時に一度呼ぶ想定。`MToonAtlasLoaderPlugin` を複数箇所で
 * 生成している場合に、呼び出しごとにオプションを渡さずに済む。
 * 既に生成済みのローダーには影響しないため、VRM を読み込む前に呼ぶこと。
 *
 * @param path - トランスコーダーを配信するディレクトリ（末尾スラッシュ必須）
 *
 * @example
 * ```typescript
 * // public/basis/ に basis_transcoder.js / .wasm を配置して同一オリジンで配信する
 * setKtx2TranscoderPath('/basis/')
 * ```
 */
export function setKtx2TranscoderPath(path: string): void
{
  defaultTranscoderPath = normalizeTranscoderPath(path)
}

/**
 * 現在のトランスコーダーパスの既定値を取得する
 */
export function getKtx2TranscoderPath(): string
{
  return defaultTranscoderPath
}

/**
 * KTX2Loader を取得または生成する
 * ブラウザ環境でのみ動作する（WebGL コンテキストが必要）
 *
 * @param transcoderPath - 使用するパス。省略時は既定値
 * @returns KTX2Loader。ブラウザ環境でない場合や初期化に失敗した場合は null
 */
export function resolveKtx2Loader(transcoderPath?: string): KTX2Loader | null
{
  const path =
    transcoderPath === undefined
      ? defaultTranscoderPath
      : normalizeTranscoderPath(transcoderPath)

  const cached = loaderCache.get(path)
  if (cached)
  {
    return cached
  }

  // ブラウザ環境チェック
  if (
    typeof document === 'undefined' ||
    typeof WebGLRenderingContext === 'undefined'
  )
  {
    return null
  }

  // 失敗した場合はキャッシュに載らず、テクスチャごとに再試行される。
  // renderer を解放し損ねるとブラウザの WebGL コンテキスト上限に達して
  // 既存シーンの描画まで巻き込むため、finally で必ず破棄する
  let renderer: WebGLRenderer | undefined

  try
  {
    // KTX2Loader の初期化には WebGL コンテキストが必要
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')

    if (!gl)
    {
      console.warn('MToonAtlasLoaderPlugin: WebGL2がサポートされていません')
      return null
    }

    // detectSupport のために一時的な WebGLRenderer を作る
    renderer = new WebGLRenderer({ canvas, context: gl })

    const loader = new KTX2Loader()
    loader.setTranscoderPath(path)
    loader.detectSupport(renderer)

    loaderCache.set(path, loader)
    return loader
  } catch (error)
  {
    console.warn('MToonAtlasLoaderPlugin: KTX2Loaderの初期化に失敗:', error)
    return null
  } finally
  {
    renderer?.dispose()
  }
}

/**
 * キャッシュ済みの KTX2Loader を破棄する
 *
 * パスを変えて作り直したい場合に、古いローダーが抱えるワーカープールと
 * WebGL コンテキストを解放するために使う。
 *
 * 注意: VRM の読み込み中に呼ばないこと。`loadVRM()` は取得したローダーを
 * GLTFLoader に渡したまま非同期に読み込むため、途中で dispose すると
 * ワーカープールが落ちて進行中の parse が分かりにくいエラーで失敗する。
 */
export function clearKtx2LoaderCache(): void
{
  for (const loader of loaderCache.values())
  {
    loader.dispose()
  }
  loaderCache.clear()
}

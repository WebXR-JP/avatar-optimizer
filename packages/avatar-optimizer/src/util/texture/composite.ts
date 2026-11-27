/**
 * 複数のテクスチャを 1 枚のアトラス画像へ合成する。
 *
 * 各レイヤーを独立した PlaneGeometry として正射影カメラの前に並べ、
 * オフスクリーンのレンダーターゲットに描画して読み戻した RGBA から DataTexture を作る。
 *
 * レンダラーは次の順で決まる:
 * - `options.renderer` に WebGPURenderer を渡した場合: それを使う（Node + Dawn など WebGL の無い環境向け）
 * - `options.renderer` に WebGLRenderer を渡した場合: それを使う
 * - 省略時: モジュール内で共有するオフスクリーン WebGLRenderer（OffscreenCanvas が必要）
 *
 * WebGPU の読み戻しは非同期のみのため、戻り値は ResultAsync で統一している。
 * 出力の行順はどのレンダラーでも WebGL の readRenderTargetPixels と同じ「行 0 = v=0」に揃える。
 */
import { err, errAsync, ok, Result, ResultAsync } from 'neverthrow'
import {
  Color,
  ColorSpace,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { AtlasRenderer, OptimizationError } from '../../types'
import { ImageMatrixPair } from './types'

/** 合成時のオプション */
export interface ComposeImageOptions {
  width: number
  height: number
  /** 出力テクスチャのカラースペース（デフォルト: SRGBColorSpace） */
  colorSpace?: ColorSpace
  /** 合成に使うレンダラー。省略時は共有のオフスクリーン WebGLRenderer */
  renderer?: AtlasRenderer
}

/** アトラス合成処理で共有するオフスクリーン WebGLRenderer */
let sharedRenderer: WebGLRenderer | null = null

/**
 * 共有オフスクリーン WebGLRenderer を取得（未生成またはコンテキストロスト時は生成）する
 */
function getSharedRenderer(): WebGLRenderer {
  if (sharedRenderer) {
    if (!sharedRenderer.getContext().isContextLost()) {
      return sharedRenderer
    }
    sharedRenderer.dispose()
    sharedRenderer = null
  }

  sharedRenderer = createRenderer()
  return sharedRenderer
}

/**
 * アトラス合成用に保持している共有 WebGLRenderer と WebGL コンテキストを解放する
 * （`options.renderer` で渡されたレンダラーは呼び出し側の所有物なので対象外）
 */
export function disposeAtlasRenderer(): void {
  if (!sharedRenderer) {
    return
  }

  const renderer = sharedRenderer
  sharedRenderer = null

  const gl = renderer.getContext()
  renderer.dispose()
  // dispose() により Three.js の webglcontextlost リスナーが解除されてからコンテキストを解放する
  if (!gl.isContextLost()) {
    renderer.forceContextLoss()
  }
}

/**
 * Three.jsのQuadメッシュと平行投影カメラを使用してImageを合成する
 *
 * @param layers - テクスチャとUV変換行列のペア配列（入力テクスチャは合成後に dispose される）
 * @param options - 幅・高さ・カラースペース・使用するレンダラー
 * @returns 合成されたアトラステクスチャ
 */
export function composeImagesToAtlas(
  layers: ImageMatrixPair[],
  options: ComposeImageOptions,
): ResultAsync<Texture, OptimizationError> {
  const { width, height, renderer } = options

  if (width <= 0 || height <= 0) {
    return errAsync({
      type: 'INVALID_PARAMETER',
      message: 'width, heightは正の値にしてください',
    })
  }

  if (renderer && isWebGPURenderer(renderer)) {
    return composeWithWebGPU(renderer, layers, options)
  }

  // WebGL は同期で描画・読み戻しできるので、結果だけ ResultAsync に包む
  return new ResultAsync(
    Promise.resolve(composeWithWebGL(renderer ?? null, layers, options)),
  )
}

/**
 * WebGLRenderer で合成する（同期）
 *
 * @param providedRenderer - 呼び出し側のレンダラー。null なら共有レンダラーを使う
 */
function composeWithWebGL(
  providedRenderer: WebGLRenderer | null,
  layers: ImageMatrixPair[],
  options: ComposeImageOptions,
): Result<Texture, OptimizationError> {
  const { width, height, colorSpace = SRGBColorSpace } = options

  if (!providedRenderer && typeof OffscreenCanvas === 'undefined') {
    disposeLayers(layers)
    return err({
      type: 'INVALID_OPERATION',
      message:
        'アトラス合成用の WebGL を利用できない環境です。' +
        'Node などでは atlas.renderer に初期化済みの WebGPURenderer を指定してください',
    })
  }

  // 1. レンダラーを決定
  let renderer: WebGLRenderer
  try {
    renderer = providedRenderer ?? getSharedRenderer()
  } catch (error) {
    disposeLayers(layers)
    return err({
      type: 'INTERNAL_ERROR',
      message: `アトラス用WebGLRendererの初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  // 2. シーン・カメラ・共有ジオメトリ・オフスクリーンレンダーターゲットをセットアップ
  const { scene, camera, geometry, restoreColorSpaces } = setupScene(layers)
  const renderTarget = new WebGLRenderTarget(width, height)
  const restoreState = saveRendererState(renderer)

  try {
    // 3. WebGLRenderTarget に描画
    renderer.setRenderTarget(renderTarget)
    // 透明背景でクリア（alpha = 0）
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, camera)

    // 4. ピクセルデータを読み取りテクスチャを作成（WebGL は行 0 = 下端 = v0）
    const pixels = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)

    return ok(createAtlasTexture(pixels, width, height, colorSpace))
  } catch (error) {
    return err({
      type: 'INTERNAL_ERROR',
      message: `アトラス画像の合成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    // 5. 呼び出し単位のリソース解放（共有レンダラー自体は再利用するため破棄しない）
    if (renderer.getContext().isContextLost()) {
      if (sharedRenderer === renderer) {
        disposeAtlasRenderer()
      }
    } else {
      restoreState()
    }

    disposeScene(scene, geometry)
    renderTarget.dispose()
    restoreColorSpaces()
    disposeLayers(layers)
  }
}

/**
 * WebGPURenderer で合成する（非同期）
 *
 * WebGPU バックエンドの読み戻しは行 0 = 上端なので、WebGL と同じ行順へ反転する。
 * WebGL2 フォールバックのバックエンドで動いている場合は反転しない。
 */
function composeWithWebGPU(
  renderer: WebGPURenderer,
  layers: ImageMatrixPair[],
  options: ComposeImageOptions,
): ResultAsync<Texture, OptimizationError> {
  const { width, height, colorSpace = SRGBColorSpace } = options

  return ResultAsync.fromPromise(
    renderer.init().then(async () => {
      // WebGPU に直接アップロードできない画像（Node のポリフィルが作る
      // RGBA 配列付きの画像など）は DataTexture に包み直す
      const uploadable = layers.map((layer) => ({
        ...layer,
        image: toUploadableTexture(layer.image),
      }))
      const wrappers = uploadable
        .map((layer, i) =>
          layer.image !== layers[i].image ? layer.image : null,
        )
        .filter((tex): tex is Texture => tex !== null)

      const { scene, camera, geometry, restoreColorSpaces } =
        setupScene(uploadable)
      const renderTarget = new RenderTarget(width, height)
      const restoreState = saveRendererState(renderer)

      try {
        renderer.setRenderTarget(renderTarget)
        renderer.setClearColor(0x000000, 0)
        renderer.clear()
        renderer.render(scene, camera)

        const raw = (await renderer.readRenderTargetPixelsAsync(
          renderTarget,
          0,
          0,
          width,
          height,
        )) as Uint8Array

        const isWebGPUBackend =
          (renderer.backend as { isWebGPUBackend?: boolean })
            .isWebGPUBackend === true
        const pixels = isWebGPUBackend
          ? flipRows(raw, width, height)
          : new Uint8Array(raw.buffer, raw.byteOffset, width * height * 4)

        return createAtlasTexture(pixels, width, height, colorSpace)
      } finally {
        restoreState()
        disposeScene(scene, geometry)
        renderTarget.dispose()
        restoreColorSpaces()
        wrappers.forEach((tex) => tex.dispose())
      }
    }),
    (error): OptimizationError => ({
      type: 'INTERNAL_ERROR',
      message: `アトラス画像の合成に失敗しました（WebGPU）: ${error instanceof Error ? error.message : String(error)}`,
    }),
  )
    .andTee(() => disposeLayers(layers))
    .orTee(() => disposeLayers(layers))
}

/** WebGPURenderer かどうか（three/webgpu を実行時に読み込まずに判定する） */
function isWebGPURenderer(renderer: AtlasRenderer): renderer is WebGPURenderer {
  return (renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer === true
}

/**
 * WebGPU にアップロードできる形のテクスチャを返す
 *
 * DataTexture や ImageBitmap などはそのまま返す。
 * `image.data` に RGBA の配列を持つだけの画像（Node 用ポリフィルの ImageBitmap など）は
 * WebGPU の copyExternalImageToTexture に渡せないため、同じピクセルを参照する DataTexture に包む。
 */
function toUploadableTexture(texture: Texture): Texture {
  if ((texture as DataTexture).isDataTexture) {
    return texture
  }
  const image = texture.image as {
    width?: number
    height?: number
    data?: ArrayBufferView
  } | null
  if (!image?.data || !image.width || !image.height) {
    return texture
  }

  const { buffer, byteOffset, byteLength } = image.data
  const wrapper = new DataTexture(
    new Uint8Array(buffer, byteOffset, byteLength),
    image.width,
    image.height,
    RGBAFormat,
    UnsignedByteType,
  )
  wrapper.flipY = texture.flipY
  wrapper.colorSpace = texture.colorSpace
  wrapper.magFilter = LinearFilter
  wrapper.minFilter = LinearFilter
  wrapper.needsUpdate = true
  return wrapper
}

/**
 * レイヤーを並べたシーンを作る
 *
 * 入力テクスチャの colorSpace は描画中だけ NoColorSpace に切り替え、
 * 戻り値の restoreColorSpaces で元に戻す
 */
function setupScene(layers: ImageMatrixPair[]) {
  const scene = new Scene()

  // 空き領域は不透明の黒
  scene.background = new Color(0, 0, 0)

  // 平行投影カメラ: ピクセルパーフェクトな座標系
  const camera = new OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  camera.position.z = 10

  const geometry = new PlaneGeometry()

  const originalColorSpaces = new Map<Texture, string>()
  for (const layer of layers) {
    if (!originalColorSpaces.has(layer.image)) {
      originalColorSpaces.set(layer.image, layer.image.colorSpace)
    }
  }

  for (const layer of layers) {
    scene.add(createLayerMesh(layer, geometry))
  }

  const restoreColorSpaces = () => {
    for (const [texture, colorSpace] of originalColorSpaces) {
      texture.colorSpace = colorSpace
    }
  }

  return { scene, camera, geometry, restoreColorSpaces }
}

/** シーン内のレイヤー用マテリアルと共有ジオメトリを破棄する */
function disposeScene(scene: Scene, geometry: PlaneGeometry): void {
  scene.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshBasicMaterial) {
      obj.material.dispose()
    }
  })
  geometry.dispose()
}

/** 入力レイヤーのテクスチャを破棄する（GPU 上のコピーを解放する） */
function disposeLayers(layers: ImageMatrixPair[]): void {
  layers.forEach((layer) => layer.image.dispose())
}

/**
 * 合成で書き換えるレンダラーの状態（レンダーターゲット・クリア色）を退避し、
 * 元に戻す関数を返す。呼び出し側から渡されたレンダラーの状態を壊さないため
 */
function saveRendererState(renderer: AtlasRenderer): () => void {
  const renderTarget = renderer.getRenderTarget()
  const clearColor = new Color()
  renderer.getClearColor(clearColor)
  const clearAlpha = renderer.getClearAlpha()
  return () => {
    // WebGLRenderer / WebGPURenderer で RenderTarget の型が異なるだけで、どちらも元の値に戻す
    ;(renderer as { setRenderTarget(target: unknown): void }).setRenderTarget(
      renderTarget,
    )
    renderer.setClearColor(clearColor, clearAlpha)
  }
}

/** 読み戻したピクセルの行を上下反転する */
function flipRows(src: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = width * 4
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    out.set(
      src.subarray(y * rowBytes, (y + 1) * rowBytes),
      (height - 1 - y) * rowBytes,
    )
  }
  return out
}

/** 合成結果の RGBA からアトラス用 DataTexture を作る */
function createAtlasTexture(
  pixels: Uint8Array,
  width: number,
  height: number,
  colorSpace: ColorSpace,
): DataTexture {
  const tex = new DataTexture(
    pixels,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  )
  tex.needsUpdate = true
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = colorSpace
  return tex
}

/**
 * WebGL レンダラーを作成する（オフスクリーン描画用）
 * outputColorSpace を LinearSRGBColorSpace に設定し、
 * 色空間変換を行わずピクセルデータをそのまま出力する
 */
function createRenderer(): WebGLRenderer {
  const canvas = new OffscreenCanvas(1, 1) // ダミーキャンバス
  const renderer = new WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    antialias: false,
    alpha: true,
    // premultipliedAlpha を無効化してアルファ値をそのまま保持
    premultipliedAlpha: false,
  })
  // ガンマ補正を無効化（ソーステクスチャのデータをそのまま保持）
  renderer.outputColorSpace = LinearSRGBColorSpace
  return renderer
}

/**
 * UV 変換を PlaneGeometry のワールド変換に適用したメッシュを作成
 *
 * @param layer - テクスチャと UV 変換行列
 * @param geometry - レイヤー間で共有する PlaneGeometry
 * @returns メッシュオブジェクト
 */
function createLayerMesh(
  layer: ImageMatrixPair,
  geometry: PlaneGeometry,
): Mesh {
  const texture = layer.image
  const uvTransform = layer.uvTransform

  // 色空間変換を無効化（ピクセルデータをそのまま合成）
  texture.colorSpace = NoColorSpace

  // マテリアル: テクスチャを割り当て
  // アトラスでは各テクスチャが重ならない領域に配置されるため、
  // NoBlendingでソースのRGBA値をそのまま書き込む（ブレンドなし）
  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    blending: NoBlending,
  })

  const mesh = new Mesh(geometry, material)

  // ワールド座標での位置・スケール・回転を設定
  mesh.position.x = uvTransform.offset.x + uvTransform.scale.x * 0.5
  mesh.position.y = uvTransform.offset.y + uvTransform.scale.y * 0.5
  mesh.position.z = 0

  mesh.scale.x = uvTransform.scale.x
  mesh.scale.y = uvTransform.scale.y
  mesh.scale.z = 1

  return mesh
}

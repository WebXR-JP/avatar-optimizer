import { err, ok, Result } from 'neverthrow'
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
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { OptimizationError } from '../../types'
import { ImageMatrixPair } from './types'

/** 合成時のオプション */
export interface ComposeImageOptions {
  width: number
  height: number
  /** 出力テクスチャのカラースペース（デフォルト: SRGBColorSpace） */
  colorSpace?: ColorSpace
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
 * 各レイヤーを独立したPlaneGeometryとして配置し、
 * WebGLRenderTargetにオフスクリーン描画してアトラスを生成する
 *
 * @param layers - テクスチャとUV変換行列のペア配列
 * @param options - 幅・高さ・背景色
 * @returns 合成されたアトラステクスチャ
 */
export function composeImagesToAtlas(
  layers: ImageMatrixPair[],
  options: ComposeImageOptions,
): Result<Texture, OptimizationError> {
  const { width, height, colorSpace = SRGBColorSpace } = options

  if (width <= 0 || height <= 0) {
    return err({
      type: 'INVALID_PARAMETER',
      message: 'width, heightは正の値にしてください',
    })
  }

  // 1. 共有 WebGL レンダラーを取得
  let renderer: WebGLRenderer
  try {
    renderer = getSharedRenderer()
  } catch (error) {
    return err({
      type: 'INTERNAL_ERROR',
      message: `アトラス用WebGLRendererの初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  // 2. シーン・カメラ・共有ジオメトリ・オフスクリーンレンダーターゲットをセットアップ
  const scene = new Scene()

  // 背景色を設定（黒）
  scene.background = new Color(0, 0, 0)

  // 平行投影カメラ: ピクセルパーフェクトな座標系
  const camera = new OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  camera.position.z = 10

  const sharedGeometry = new PlaneGeometry()

  // 透明対応のオフスクリーンレンダーターゲットを作成
  const renderTarget = new WebGLRenderTarget(width, height)

  // 元の colorSpace を退避（描画時に NoColorSpace へ切り替えた後、finally で復元する）
  const originalColorSpaces = new Map<Texture, string>()
  for (const layer of layers) {
    if (!originalColorSpaces.has(layer.image)) {
      originalColorSpaces.set(layer.image, layer.image.colorSpace)
    }
  }

  try {
    // 3. 各レイヤーをシーンに追加
    for (const layer of layers) {
      const mesh = createLayerMesh(layer, sharedGeometry)
      scene.add(mesh)
    }

    // 4. WebGLRenderTarget に描画
    renderer.setRenderTarget(renderTarget)
    // 透明背景でクリア（alpha = 0）
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, camera)

    // 5. ピクセルデータを読み取りテクスチャを作成
    const pixels = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)

    const tex = new DataTexture(
      pixels,
      width,
      height,
      RGBAFormat,
      UnsignedByteType,
    )

    tex.needsUpdate = true

    // 必要に応じて
    tex.magFilter = LinearFilter
    tex.minFilter = LinearFilter
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.colorSpace = colorSpace

    return ok(tex)
  } catch (error) {
    return err({
      type: 'INTERNAL_ERROR',
      message: `アトラス画像の合成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    // 6. 呼び出し単位のリソース解放（共有レンダラー自体は再利用するため破棄しない）
    if (renderer.getContext().isContextLost()) {
      if (sharedRenderer === renderer) {
        disposeAtlasRenderer()
      }
    } else {
      renderer.setRenderTarget(null)
    }

    scene.traverse((obj) => {
      if (obj instanceof Mesh && obj.material instanceof MeshBasicMaterial) {
        obj.material.dispose()
      }
    })
    sharedGeometry.dispose()
    renderTarget.dispose()
    for (const [texture, origColorSpace] of originalColorSpaces) {
      texture.colorSpace = origColorSpace
    }
    layers.forEach((layer) => layer.image.dispose())
  }
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
  // outputColorSpace = LinearSRGBColorSpace と組み合わせて使用
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

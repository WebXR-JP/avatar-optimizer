import { err, ok, Result } from 'neverthrow'
import
{
  Matrix3,
  Texture,
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  WebGLRenderTarget,
  Color,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
  DoubleSide,
  RepeatWrapping,
  CustomBlending,
  OneFactor,
  SrcAlphaFactor,
  OneMinusSrcAlphaFactor,
  AddEquation,
} from 'three'
import { OffsetScale } from './types'

/** Image + UV変換行列のペア */
export interface ImageMatrixPair
{
  image: Texture
  uvTransform: OffsetScale
}

/** 合成時のオプション */
export interface ComposeImageOptions
{
  width: number
  height: number
  backgroundColor?: Color | null
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
): Result<Texture, Error>
{
  const { width, height, backgroundColor } = options

  if (width <= 0 || height <= 0)
  {
    return err(new Error('Atlas width and height must be positive'))
  }

  // 1. WebGL レンダラー・シーン・カメラをセットアップ
  const renderer = createRenderer()
  const scene = new Scene()

  // 背景色を設定（指定がない場合は透明）
  if (backgroundColor !== null && backgroundColor !== undefined) {
    scene.background = backgroundColor
  } else {
    // null または undefined の場合は背景なし（透明）
    scene.background = null
  }

  // 平行投影カメラ: ピクセルパーフェクトな座標系
  const camera = new OrthographicCamera(0, 1, 1, 0, 0.1, 1000)
  camera.position.z = 10

  // 2. オフスクリーンレンダーターゲットを作成（透明対応）
  const renderTarget = new WebGLRenderTarget(width, height)

  // 3. 各レイヤーをシーンに追加
  for (const layer of layers)
  {
    try
    {
      const mesh = createLayerMesh(layer)
      scene.add(mesh)
    } catch (error)
    {
      renderer.dispose()
      renderTarget.dispose()
      return err(new Error(`Failed to create layer mesh: ${String(error)}`))
    }
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
    UnsignedByteType
  );

  tex.needsUpdate = true;

  // 必要に応じて
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;

  // 6. リソース解放
  scene.traverse((obj) =>
  {
    if (obj instanceof Mesh)
    {
      obj.geometry.dispose()
      if (obj.material instanceof MeshBasicMaterial)
      {
        obj.material.dispose()
      }
    }
  })
  renderer.dispose()
  renderTarget.dispose()
  layers.forEach(layer => layer.image.dispose())

  return ok(tex)
}

/**
 * WebGL レンダラーを作成する（オフスクリーン描画用）
 */
function createRenderer(): WebGLRenderer
{
  const canvas = new OffscreenCanvas(1, 1) // ダミーキャンバス
  const renderer = new WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    antialias: false,
    alpha: true,
  })
  return renderer
}

/**
 * UV 変換を PlaneGeometry のワールド変換に適用したメッシュを作成
 *
 * @param layer - テクスチャと UV 変換行列
 * @returns メッシュオブジェクト
 */
function createLayerMesh(
  layer: ImageMatrixPair,
): Mesh
{
  const texture = layer.image
  const uvTransform = layer.uvTransform

  // PlaneGeometry: デフォルトは 1x1、中心が原点
  const geometry = new PlaneGeometry()

  // マテリアル: テクスチャを割り当て
  // 背景色に影響されないようカスタムブレンディングを設定
  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendEquation: AddEquation,
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


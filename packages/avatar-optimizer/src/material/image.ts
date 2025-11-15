import { err, errAsync, ok, Result, ResultAsync } from 'neverthrow'
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
  } from 'three'

/** Image + UV変換行列のペア */
export interface ImageMatrixPair
{
  image: Texture
  uvTransform: Matrix3
}

/** 合成時のオプション */
export interface ComposeImageOptions
{
  width: number
  height: number
  backgroundColor?: Color | null
}

const DEFAULT_BG = 'rgba(0,0,0,0)'

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
  const { width, height, backgroundColor = DEFAULT_BG } = options

  if (width <= 0 || height <= 0)
  {
    return err(new Error('Atlas width and height must be positive'))
  }

  // 1. WebGL レンダラー・シーン・カメラをセットアップ
  const renderer = createRenderer()
  const scene = new Scene()

  // 背景色を設定
  scene.background = backgroundColor instanceof Color ? backgroundColor : null

  // 平行投影カメラ: ピクセルパーフェクトな座標系
  const camera = new OrthographicCamera(0, width, height, 0, 0.1, 1000)
  camera.position.z = 10

  // 2. オフスクリーンレンダーターゲットを作成
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
  renderer.render(scene, camera)

  // 5. WebGLRenderTarget から Texture を取得
  const resultTexture = renderTarget.texture

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

  return ok(resultTexture)
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
 * Matrix3 の UV 変換を PlaneGeometry のワールド変換に適用したメッシュを作成
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


  // Matrix3 から位置・スケール・回転を抽出
  // Matrix3: [ scaleU  0       translateU ]
  //          [ 0      scaleV  translateV ]
  //          [ 0      0       1          ]
  const elements = uvTransform.elements
  const scaleU = elements[0]
  const scaleV = elements[4]
  const translateU = elements[6]
  const translateV = elements[7]

  // PlaneGeometry: デフォルトは 1x1、中心が原点
  const geometry = new PlaneGeometry(1, 1)

  // マテリアル: テクスチャを割り当て
  const material = new MeshBasicMaterial({
    map: texture,
    side: 2, // THREE.FrontSide
    transparent: true,
  })

  const mesh = new Mesh(geometry, material)

  // ワールド座標での位置・スケール・回転を設定
  // translateU, translateV は UV 空間なのでピクセル空間に変換
  mesh.position.x = translateU + scaleU / 2
  mesh.position.y = translateV + scaleV / 2
  mesh.position.z = 0

  mesh.scale.x = scaleU
  mesh.scale.y = scaleV
  mesh.scale.z = 1

  return mesh
}

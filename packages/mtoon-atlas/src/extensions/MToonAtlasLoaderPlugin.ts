import { Material, Mesh, Texture, SRGBColorSpace, NoColorSpace, DoubleSide, FrontSide, NearestFilter, DataTexture, FloatType, RGBAFormat, CompressedTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { decode as decodePng } from 'fast-png'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import { getMToonRenderOrder } from '../render-order'
import { rememberKtx2Source } from './ktx2-source-cache'
import { resolveKtx2Loader, type Ktx2SupportRenderer } from './ktx2-loader'
import type { MToonAtlasMaterialConstructor } from '../types'
import
{
  GLTFParser,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
} from './types'

/** カラーデータとして扱うアトラススロット（sRGB） */
const SRGB_ATLAS_SLOTS = ['baseColor', 'shade', 'emissive', 'matcap', 'rim']

/**
 * アトラススロット名から colorSpace を解決する（PNG 等の非 KTX2 テクスチャ向け）
 */
function resolveAtlasTextureColorSpace(slot: string): typeof SRGBColorSpace | typeof NoColorSpace
{
  return SRGB_ATLAS_SLOTS.includes(slot) ? SRGBColorSpace : NoColorSpace
}

/**
 * アトラステクスチャの colorSpace を決める
 *
 * KTX2 由来のテクスチャは KTX2Loader が DFD の transferFunction から
 * colorSpace を設定済みなので、それを尊重して何もしない。
 * ここで名前ベースに塗り替えると、KTX2 側のタグが誤っていても結果的に
 * 正しく表示されてしまい、エンコード時のバグを隠してしまう
 * （debug-viewer では問題なく見えるのに、DFD をそのまま使う実環境では
 *   色が破綻する、という食い違いの原因になる）。
 *
 * KTX2 かどうかは呼び出し側から渡す。圧縮テクスチャかどうかでは判定できない:
 * KTX2Loader はトランスコード不要なペイロード（VK_FORMAT_R8G8B8A8_UNORM など）
 * に対して非圧縮の DataTexture を返すことがあり、その場合も colorSpace は
 * DFD から設定されるため。
 *
 * KTX2 以外（PNG など）は DFD を持たないので、従来どおりスロット名から設定する。
 *
 * @param texture - 対象テクスチャ
 * @param slot - アトラススロット名（baseColor / normal など）
 * @param isKtx2 - KTX2 から読み込んだテクスチャかどうか
 */
export function applyAtlasTextureColorSpace(
  texture: Texture,
  slot: string,
  isKtx2: boolean
): void
{
  if (isKtx2)
  {
    return
  }

  texture.colorSpace = resolveAtlasTextureColorSpace(slot)
}

/**
 * MToonAtlasLoaderPlugin のオプション
 */
export interface MToonAtlasLoaderPluginOptions
{
  /**
   * 使用する KTX2Loader。
   * GLTFLoader 側で設定済みのインスタンスを渡せば、二重生成を避けつつ
   * three 本体とバージョンの揃ったトランスコーダーを共有できる
   */
  ktx2Loader?: KTX2Loader

  /**
   * トランスコーダーの配信元ディレクトリ（末尾スラッシュ必須）。
   * `ktx2Loader` を渡した場合は無視される
   */
  ktx2TranscoderPath?: string

  /**
   * KTX2 の対応形式の判定に使うレンダラー。`ktx2Loader` を渡した場合は無視される。
   * 省略時は setKtx2Renderer() の値、それも無ければ一時 WebGLRenderer で判定する。
   * WebGPURenderer で描画する場合は init() 済みのものを渡す
   */
  ktx2Renderer?: Ktx2SupportRenderer

  /**
   * 生成するマテリアルのクラス。省略時は MToonAtlasMaterial（WebGL 専用）。
   * WebGPURenderer で描画する場合は `@webxr-jp/mtoon-atlas/nodes` の
   * MToonAtlasNodeMaterial を渡す
   */
  materialType?: MToonAtlasMaterialConstructor
}

export class MToonAtlasLoaderPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private parser: GLTFParser

  // 画像インデックス -> 元 KTX2 バイナリの複製（再エクスポート用、issue #39）
  // 同じアトラス画像が複数マテリアルから参照されるため、画像単位でメモ化する
  private ktx2SourceByImageIndex: Map<number, Uint8Array> = new Map()

  // WebGPURenderer は THREE.Texture インスタンス単位で GPU リソースを管理するため、
  // マテリアルごとに clone() すると同一アトラステクスチャがマテリアル数倍に増殖する。
  // ロード単位で Promise をキャッシュし、同一条件のテクスチャ／パラメータを全マテリアルで共有する
  private atlasTextureCache: Map<string, Promise<Texture | null>> = new Map()
  private ktx2TextureCache: Map<number, Promise<CompressedTexture | null>> = new Map()
  private parameterDataCache: Map<number, Promise<{ data: Float32Array, width: number, height: number }>> = new Map()
  private parameterTextureCache: Map<number, Promise<DataTexture>> = new Map()

  // 呼び出し側から渡された KTX2Loader（あればこれを優先して使う）
  private injectedKtx2Loader?: KTX2Loader

  // 呼び出し側から渡されたトランスコーダーパス
  private ktx2TranscoderPath?: string

  // 生成するマテリアルのクラス
  private materialType: MToonAtlasMaterialConstructor

  // KTX2 の対応形式の判定に使うレンダラー
  private ktx2Renderer?: Ktx2SupportRenderer

  constructor(parser: GLTFParser, options: MToonAtlasLoaderPluginOptions = {})
  {
    this.parser = parser
    this.injectedKtx2Loader = options.ktx2Loader
    this.ktx2TranscoderPath = options.ktx2TranscoderPath
    this.materialType = options.materialType ?? MToonAtlasMaterial
    this.ktx2Renderer = options.ktx2Renderer
  }

  /**
   * このプラグインが使う KTX2Loader を取得する
   * 注入されたインスタンス > 指定パス > アプリ全体の既定値 の順に解決する
   */
  private getKtx2Loader(): KTX2Loader | null
  {
    return this.injectedKtx2Loader ?? resolveKtx2Loader(this.ktx2TranscoderPath, this.ktx2Renderer)
  }

  /**
   * 再エクスポート用に元の KTX2 バイナリの複製を取得する（画像単位でメモ化）
   *
   * GLTFParser は bufferView を同一の ArrayBuffer でキャッシュして返し、
   * KTX2Loader.parse はその ArrayBuffer をワーカーへ transfer して detach する。
   * 通常は同一マイクロタスク内に全マテリアル分の複製が終わるため detach 前に間に合うが、
   * 呼び出しが後続タイミングにずれた場合に備えて detach 済みかどうかを確認する。
   * （複製済みならメモ化した方を返すので、実質ここで取りこぼすことはない）
   *
   * @param imageIndex - glTF の画像インデックス
   * @param ktx2Data - bufferView から取得した KTX2 バイナリ
   * @returns 複製。detach 済みで複製できなかった場合は undefined
   */
  private getOrCreateKtx2SourceCopy(
    imageIndex: number,
    ktx2Data: ArrayBuffer
  ): Uint8Array | undefined
  {
    const cached = this.ktx2SourceByImageIndex.get(imageIndex)
    if (cached)
    {
      return cached
    }

    // detach 済みの ArrayBuffer は byteLength が 0 になる
    if (ktx2Data.byteLength === 0)
    {
      return undefined
    }

    const copy = new Uint8Array(ktx2Data.slice(0))
    this.ktx2SourceByImageIndex.set(imageIndex, copy)
    return copy
  }

  public loadMaterial(materialIndex: number): Promise<Material> | null
  {
    const materialDef = this.parser.json.materials[materialIndex]
    if (
      !materialDef.extensions ||
      !materialDef.extensions[MTOON_ATLAS_EXTENSION_NAME]
    )
    {
      return null
    }

    return this._loadMaterialAsync(materialIndex)
  }

  /**
   * 半透明メッシュの描画順を three-vrm と同じ規則に揃える
   *
   * three-vrm は MToon の半透明を「深度書き込みあり（transparentWithZWrite）は 0、
   * なしは 19」の renderOrder で描き、深度を書くものを先に描く。renderOrder は
   * glTF に保存されないため、再読み込み時にここで同じ規則を適用する
   * （値の定義と three-vrm との差分は render-order.ts を参照）
   */
  public afterRoot(gltf: GLTF): Promise<void> | null
  {
    gltf.scene.traverse((object) =>
    {
      if (!(object instanceof Mesh)) return
      const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material
      if (!material || !('isMToonAtlasMaterial' in material)) return
      if (!material.transparent) return
      object.renderOrder = getMToonRenderOrder(material)
    })
    return null
  }

  /**
   * パラメータ画像を16bit精度でデコードして生 Float32Array として読み込む
   * GLTFLoaderのloadTextureはImageBitmap経由で8bitに変換されるため、
   * 直接PNGデータを取得してfast-pngでデコードする
   */
  private async _loadParameterData16bit(textureIndex: number): Promise<{ data: Float32Array, width: number, height: number }>
  {
    const json = this.parser.json

    // インデックスが無効な場合はエラー
    if (textureIndex < 0 || textureIndex >= json.textures.length)
    {
      throw new Error(`MToonAtlasLoaderPlugin: Invalid texture index: ${textureIndex}`)
    }

    const textureDef = json.textures[textureIndex]
    if (!textureDef)
    {
      throw new Error(`MToonAtlasLoaderPlugin: Texture definition not found at index ${textureIndex}`)
    }

    const imageIndex = textureDef.source
    if (imageIndex === undefined || imageIndex < 0 || imageIndex >= json.images.length)
    {
      throw new Error(`MToonAtlasLoaderPlugin: Invalid image index: ${imageIndex} for texture ${textureIndex}`)
    }

    const imageDef = json.images[imageIndex]

    let pngData: ArrayBuffer

    if (imageDef.uri)
    {
      // Data URI または 外部URL
      if (imageDef.uri.startsWith('data:'))
      {
        // Base64 Data URI をデコード
        const base64 = imageDef.uri.split(',')[1]
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++)
        {
          bytes[i] = binary.charCodeAt(i)
        }
        pngData = bytes.buffer
      } else
      {
        // 外部URL（相対パスも含む）
        const response = await fetch(imageDef.uri)
        pngData = await response.arrayBuffer()
      }
    } else if (imageDef.bufferView !== undefined)
    {
      // GLB 埋め込みバッファ
      // getDependency('bufferView', ...)はArrayBufferを返す
      const bufferViewData = await this.parser.getDependency('bufferView', imageDef.bufferView) as ArrayBuffer
      pngData = bufferViewData
    } else
    {
      throw new Error('MToonAtlasLoaderPlugin: Invalid image definition')
    }

    // fast-pngでデコード（16bit対応）
    const decoded = decodePng(new Uint8Array(pngData))
    const { width, height, depth, channels, data } = decoded

    // Float32Array に変換
    const pixelCount = width * height * 4
    const floatData = new Float32Array(pixelCount)

    if (depth === 16)
    {
      // 16bit PNG: 0-65535 を 0-1 に正規化
      const uint16Data = data as Uint16Array
      if (channels === 4)
      {
        for (let i = 0; i < pixelCount; i++)
        {
          floatData[i] = uint16Data[i] / 65535
        }
      } else if (channels === 3)
      {
        // RGB only, add alpha = 1
        for (let i = 0; i < width * height; i++)
        {
          floatData[i * 4] = uint16Data[i * 3] / 65535
          floatData[i * 4 + 1] = uint16Data[i * 3 + 1] / 65535
          floatData[i * 4 + 2] = uint16Data[i * 3 + 2] / 65535
          floatData[i * 4 + 3] = 1
        }
      }
    } else
    {
      // 8bit PNG: 0-255 を 0-1 に正規化
      const uint8Data = data as Uint8Array
      if (channels === 4)
      {
        for (let i = 0; i < pixelCount; i++)
        {
          floatData[i] = uint8Data[i] / 255
        }
      } else if (channels === 3)
      {
        // RGB only, add alpha = 1
        for (let i = 0; i < width * height; i++)
        {
          floatData[i * 4] = uint8Data[i * 3] / 255
          floatData[i * 4 + 1] = uint8Data[i * 3 + 1] / 255
          floatData[i * 4 + 2] = uint8Data[i * 3 + 2] / 255
          floatData[i * 4 + 3] = 1
        }
      }
    }

    return { data: floatData, width, height }
  }

  /**
   * パラメータ画像をキャッシュ付きで16bit精度デコードする（TSL / UBO 版向け）
   */
  private _getParameterData16bit(
    textureIndex: number
  ): Promise<{ data: Float32Array, width: number, height: number }>
  {
    let cached = this.parameterDataCache.get(textureIndex)
    if (!cached)
    {
      cached = this._loadParameterData16bit(textureIndex)
      this.parameterDataCache.set(textureIndex, cached)
    }
    return cached
  }

  /**
   * パラメータテクスチャを16bit精度で読み込む（GLSL 版向け）
   */
  private async _loadParameterTexture16bit(textureIndex: number): Promise<DataTexture>
  {
    const { data, width, height } = await this._getParameterData16bit(textureIndex)

    // DataTexture を作成
    const texture = new DataTexture(data, width, height, RGBAFormat, FloatType)
    texture.flipY = false
    texture.colorSpace = NoColorSpace
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.needsUpdate = true

    return texture
  }

  /**
   * パラメータテクスチャをキャッシュ付きで取得する（GLSL 版向け）
   */
  private _getParameterTexture16bit(textureIndex: number): Promise<DataTexture>
  {
    let cached = this.parameterTextureCache.get(textureIndex)
    if (!cached)
    {
      cached = this._loadParameterTexture16bit(textureIndex)
      this.parameterTextureCache.set(textureIndex, cached)
    }
    return cached
  }

  /**
   * KTX2テクスチャを直接読み込む
   * GLTFLoaderのloadTextureがKTX2を正しく処理できない場合のフォールバック
   */
  private async _loadKtx2Texture(textureIndex: number): Promise<CompressedTexture | null>
  {
    const json = this.parser.json
    const textureDef = json.textures?.[textureIndex]

    if (!textureDef)
    {
      console.warn(`MToonAtlasLoaderPlugin: テクスチャ定義が見つかりません: ${textureIndex}`)
      return null
    }

    // KHR_texture_basisu拡張からソースインデックスを取得
    const ktx2Extension = textureDef.extensions?.KHR_texture_basisu
    const imageIndex = ktx2Extension?.source ?? textureDef.source

    if (imageIndex === undefined || imageIndex < 0 || imageIndex >= json.images.length)
    {
      console.warn(`MToonAtlasLoaderPlugin: 無効な画像インデックス: ${imageIndex}`)
      return null
    }

    const imageDef = json.images[imageIndex]
    let ktx2Data: ArrayBuffer

    try
    {
      if (imageDef.uri)
      {
        // Data URI または 外部URL
        if (imageDef.uri.startsWith('data:'))
        {
          const base64 = imageDef.uri.split(',')[1]
          const binary = atob(base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++)
          {
            bytes[i] = binary.charCodeAt(i)
          }
          ktx2Data = bytes.buffer
        } else
        {
          const response = await fetch(imageDef.uri)
          ktx2Data = await response.arrayBuffer()
        }
      } else if (imageDef.bufferView !== undefined)
      {
        // GLB埋め込みバッファからKTX2データを取得
        ktx2Data = await this.parser.getDependency('bufferView', imageDef.bufferView) as ArrayBuffer
      } else
      {
        console.warn('MToonAtlasLoaderPlugin: 無効な画像定義（uri/bufferViewなし）')
        return null
      }

      // KTX2Loaderで読み込む
      const ktx2Loader = this.getKtx2Loader()
      if (!ktx2Loader)
      {
        console.warn('MToonAtlasLoaderPlugin: KTX2Loaderが利用できません')
        return null
      }

      // 再エクスポート用に元の KTX2 バイナリを複製しておく（issue #39）
      // KTX2Loader.parse は ArrayBuffer をワーカーへ transfer するため、
      // parse 後の ktx2Data は detach されて読み出せなくなる。必ず parse 前に複製する
      const ktx2SourceCopy = this.getOrCreateKtx2SourceCopy(imageIndex, ktx2Data)

      // KTX2Loaderのparseメソッドを使用してArrayBufferから直接読み込む
      return new Promise<CompressedTexture>((resolve, reject) =>
      {
        ktx2Loader.parse(
          ktx2Data,
          (texture: CompressedTexture) =>
          {
            // テクスチャプロパティを設定
            texture.flipY = false
            texture.minFilter = LinearMipmapLinearFilter
            texture.magFilter = LinearFilter
            texture.wrapS = RepeatWrapping
            texture.wrapT = RepeatWrapping
            texture.needsUpdate = true

            // 元の KTX2 バイナリを記録しておく
            // CompressedTexture は CPU から RGBA を読めないため、
            // 再エクスポート時はこのバイナリをパススルーする（issue #39）
            if (ktx2SourceCopy)
            {
              rememberKtx2Source(texture, ktx2SourceCopy)
            }

            resolve(texture)
          },
          (error: unknown) =>
          {
            reject(error)
          }
        )
      })
    } catch (error)
    {
      console.warn(`MToonAtlasLoaderPlugin: KTX2テクスチャの読み込みに失敗: ${error}`)
      return null
    }
  }

  /**
   * アトラステクスチャをキャッシュ付きで取得する
   *
   * WebGPURenderer は THREE.Texture インスタンスごとに GPU テクスチャを作成・アップロードするため、
   * 同一 textureIndex に対してマテリアル数分だけ clone() すると GPU メモリとアップロードが増殖する。
   * そのためロード単位で Promise をメモ化し、全マテリアルで同一インスタンスを共有する。
   *
   * - KTX2: DFD 由来の colorSpace をそのまま尊重し、自前生成の CompressedTexture を clone() せず共有する。
   * - 非 KTX2 (PNG 等): GLTFLoader の内部キャッシュを汚さないよう初回のみ clone() し、
   *   `textureIndex:colorSpace` 単位で共有する（別スロットでの sRGB / NoColorSpace 衝突を防ぐ）。
   */
  private _getAtlasedTexture(
    key: string,
    textureIndex: number
  ): Promise<Texture | null>
  {
    const textureDef = this.parser.json.textures?.[textureIndex]
    const isKtx2 = textureDef?.extensions?.KHR_texture_basisu !== undefined

    if (isKtx2)
    {
      let cached = this.ktx2TextureCache.get(textureIndex)
      if (!cached)
      {
        cached = this._loadKtx2Texture(textureIndex).then((texture) =>
        {
          if (!texture)
          {
            console.warn(`MToonAtlasLoaderPlugin: テクスチャ ${key} (index: ${textureIndex}) の読み込みに失敗しました`)
          }
          return texture
        })
        this.ktx2TextureCache.set(textureIndex, cached)
      }
      return cached
    }

    const colorSpace = resolveAtlasTextureColorSpace(key)
    const cacheKey = `${textureIndex}:${colorSpace}`
    let cached = this.atlasTextureCache.get(cacheKey)
    if (!cached)
    {
      cached = (async () =>
      {
        try
        {
          const loadedTexture = await this.parser.loadTexture(textureIndex)
          if (!loadedTexture)
          {
            console.warn(`MToonAtlasLoaderPlugin: テクスチャ ${key} (index: ${textureIndex}) の読み込みに失敗しました`)
            return null
          }

          // GLTFLoader キャッシュを汚さないよう初回のみ clone() し、以降は全マテリアルで共有する
          const texture = loadedTexture.clone()
          if ('source' in loadedTexture && loadedTexture.source)
          {
            texture.source = loadedTexture.source // image ソースを共有
          }
          texture.flipY = false

          applyAtlasTextureColorSpace(texture, key, false)

          return texture
        } catch (error)
        {
          console.warn(`MToonAtlasLoaderPlugin: テクスチャ ${key} (index: ${textureIndex}) の読み込み中にエラーが発生しました:`, error)
          return null
        }
      })()
      this.atlasTextureCache.set(cacheKey, cached)
    }
    return cached
  }

  private async _loadMaterialAsync(materialIndex: number): Promise<Material>
  {
    const materialDef = this.parser.json.materials[materialIndex]
    const extension = materialDef.extensions[
      MTOON_ATLAS_EXTENSION_NAME
    ] as MToonAtlasExtensionSchema

    const pending: Promise<void>[] = []
    const atlasedTextures: any = {}

    // Load parameter data / texture (16bit対応)
    const prefersBuffer = this.materialType.prefersParameterBuffer === true
    let parameterData: Float32Array | null = null
    let parameterTexture: Texture | null = null

    if (extension.parameterTexture && extension.parameterTexture.index >= 0)
    {
      if (prefersBuffer)
      {
        pending.push(
          this._getParameterData16bit(extension.parameterTexture.index).then(({ data }) =>
          {
            parameterData = data
          })
        )
      } else
      {
        pending.push(
          this._getParameterTexture16bit(extension.parameterTexture.index).then((tex) =>
          {
            parameterTexture = tex
          })
        )
      }
    }

    // Load atlased textures
    if (extension.atlasedTextures)
    {
      for (const [key, value] of Object.entries(extension.atlasedTextures))
      {
        if (value)
        {
          pending.push(
            this._getAtlasedTexture(key, value.index).then((texture) =>
            {
              if (texture)
              {
                atlasedTextures[key] = texture
              }
            })
          )
        }
      }
    }

    await Promise.all(pending)

    // Determine slot attribute name
    // GLTFLoader converts custom attributes to lowercase
    const slotAttributeName = extension.slotAttributeName.toLowerCase()
    const slotCount = extension.parameterTexture?.slotCount ?? 0
    const texelsPerSlot = extension.parameterTexture?.texelsPerSlot ?? 9

    let material
    if (prefersBuffer)
    {
      const data = parameterData ?? new Float32Array(Math.max(1, slotCount) * texelsPerSlot * 4)
      material = new this.materialType({
        parameterBuffer: {
          data,
          slotCount,
          texelsPerSlot,
          atlasedTextures,
        },
        slotAttribute: {
          name: slotAttributeName,
        },
        name: materialDef.name,
      })
    } else
    {
      // parameterTextureがない場合はダミーのDataTextureを作成
      if (!parameterTexture)
      {
        // 1x1のダミーテクスチャを作成
        const dummyData = new Float32Array(4).fill(0)
        parameterTexture = new DataTexture(dummyData, 1, 1, RGBAFormat, FloatType)
        parameterTexture.flipY = false
        parameterTexture.colorSpace = NoColorSpace
        parameterTexture.minFilter = NearestFilter
        parameterTexture.magFilter = NearestFilter
        parameterTexture.needsUpdate = true
      }

      material = new this.materialType({
        parameterTexture: {
          texture: parameterTexture,
          slotCount,
          texelsPerSlot,
          atlasedTextures,
        },
        slotAttribute: {
          name: slotAttributeName,
        },
        name: materialDef.name,
      })
    }

    // Apply standard material properties
    if (materialDef.doubleSided)
    {
      material.side = DoubleSide
    } else
    {
      material.side = FrontSide
    }

    if (materialDef.alphaMode === 'BLEND')
    {
      material.transparent = true
      // TransparentWithZWrite（髪など）は深度を書く。glTF の alphaMode には
      // この区別が無いので拡張側のフラグから復元する
      material.depthWrite = extension.transparentWithZWrite === true
    } else if (materialDef.alphaMode === 'MASK')
    {
      material.transparent = false
      material.alphaTest = materialDef.alphaCutoff ?? 0.5
    } else
    {
      material.transparent = false
    }

    if (materialDef.extras)
    {
      material.userData = materialDef.extras
    }

    // アウトライン関連のプロパティを設定
    if (extension.isOutline)
    {
      material.isOutline = true
    }
    if (extension.outlineWidthMode)
    {
      material.outlineWidthMode = extension.outlineWidthMode
    }

    return material
  }
}

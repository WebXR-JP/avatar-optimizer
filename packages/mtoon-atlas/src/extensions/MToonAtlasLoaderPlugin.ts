import { Material, Texture, SRGBColorSpace, NoColorSpace, DoubleSide, FrontSide, NearestFilter, DataTexture, FloatType, RGBAFormat, CompressedTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, WebGLRenderer } from 'three'
import { decode as decodePng } from 'fast-png'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import { rememberKtx2Source } from './ktx2-source-cache'
import
{
  GLTFParser,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
} from './types'

// KTX2Loaderのシングルトンインスタンス
let ktx2LoaderInstance: KTX2Loader | null = null

/**
 * KTX2Loaderを取得または初期化する
 * ブラウザ環境でのみ動作（WebGLコンテキストが必要）
 */
function getKTX2Loader(): KTX2Loader | null
{
  if (ktx2LoaderInstance)
  {
    return ktx2LoaderInstance
  }

  // ブラウザ環境チェック
  if (
    typeof document === 'undefined' ||
    typeof WebGLRenderingContext === 'undefined'
  )
  {
    return null
  }

  try
  {
    // KTX2Loaderの初期化にはWebGLコンテキストが必要
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')

    if (!gl)
    {
      console.warn('MToonAtlasLoaderPlugin: WebGL2がサポートされていません')
      return null
    }

    // WebGLRendererを一時的に作成してdetectSupportを呼び出す
    const renderer = new WebGLRenderer({ canvas, context: gl })

    ktx2LoaderInstance = new KTX2Loader()
    ktx2LoaderInstance.setTranscoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/libs/basis/'
    )
    ktx2LoaderInstance.detectSupport(renderer)

    renderer.dispose()

    return ktx2LoaderInstance
  } catch (error)
  {
    console.warn('MToonAtlasLoaderPlugin: KTX2Loaderの初期化に失敗:', error)
    return null
  }
}

export class MToonAtlasLoaderPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private parser: GLTFParser

  // 画像インデックス -> 元 KTX2 バイナリの複製（再エクスポート用、issue #39）
  // 同じアトラス画像が複数マテリアルから参照されるため、画像単位でメモ化する
  private ktx2SourceByImageIndex: Map<number, Uint8Array> = new Map()

  constructor(parser: GLTFParser)
  {
    this.parser = parser
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
   * パラメータテクスチャを16bit精度で読み込む
   * GLTFLoaderのloadTextureはImageBitmap経由で8bitに変換されるため、
   * 直接PNGデータを取得してfast-pngでデコードする
   */
  private async _loadParameterTexture16bit(textureIndex: number): Promise<DataTexture>
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

    // DataTexture を作成
    const texture = new DataTexture(floatData, width, height, RGBAFormat, FloatType)
    texture.flipY = false
    texture.colorSpace = NoColorSpace
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.needsUpdate = true

    return texture
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
      const ktx2Loader = getKTX2Loader()
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

  private async _loadMaterialAsync(materialIndex: number): Promise<Material>
  {
    const materialDef = this.parser.json.materials[materialIndex]
    const extension = materialDef.extensions[
      MTOON_ATLAS_EXTENSION_NAME
    ] as MToonAtlasExtensionSchema

    const pending: Promise<void>[] = []
    const atlasedTextures: any = {}

    const loadTexture = async (
      key: string,
      textureInfo: { index: number } | undefined
    ) =>
    {
      if (textureInfo)
      {
        try
        {
          // テクスチャがKTX2かどうかを確認
          const textureDef = this.parser.json.textures?.[textureInfo.index]
          const isKtx2 = textureDef?.extensions?.KHR_texture_basisu !== undefined

          let loadedTexture: Texture | CompressedTexture | null = null

          if (isKtx2)
          {
            // KTX2テクスチャを直接読み込む
            loadedTexture = await this._loadKtx2Texture(textureInfo.index)
          } else
          {
            // 通常のテクスチャはparser.loadTextureを使用
            loadedTexture = await this.parser.loadTexture(textureInfo.index)
          }

          // テクスチャが正しく読み込まれたかチェック
          if (!loadedTexture)
          {
            console.warn(`MToonAtlasLoaderPlugin: テクスチャ ${key} (index: ${textureInfo.index}) の読み込みに失敗しました`)
            return
          }

          // GLTFLoader がテクスチャをキャッシュするため、clone() して独立したオブジェクトを使用
          const texture = loadedTexture.clone()
          if ('source' in loadedTexture && loadedTexture.source)
          {
            texture.source = loadedTexture.source // image ソースを共有
          }
          texture.flipY = false

          // Set color space based on texture type
          // baseColor, shade, emissive, matcap, rim are usually sRGB (color data)
          // normal, shadingShift, uvAnimationMask are Linear (non-color data)
          const srgbTextures = ['baseColor', 'shade', 'emissive', 'matcap', 'rim']
          if (srgbTextures.includes(key))
          {
            texture.colorSpace = SRGBColorSpace
          } else
          {
            texture.colorSpace = NoColorSpace
          }

          atlasedTextures[key] = texture
        } catch (error)
        {
          console.warn(`MToonAtlasLoaderPlugin: テクスチャ ${key} (index: ${textureInfo.index}) の読み込み中にエラーが発生しました:`, error)
        }
      }
    }

    // Load parameter texture (16bit対応)
    let parameterTexture: Texture | null = null
    if (extension.parameterTexture && extension.parameterTexture.index >= 0)
    {
      pending.push(
        this._loadParameterTexture16bit(extension.parameterTexture.index).then((tex) =>
        {
          parameterTexture = tex
        })
      )
    }

    // Load atlased textures
    if (extension.atlasedTextures)
    {
      for (const [key, value] of Object.entries(extension.atlasedTextures))
      {
        pending.push(loadTexture(key, value))
      }
    }

    await Promise.all(pending)

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

    // Determine slot attribute name
    // GLTFLoader converts custom attributes to lowercase
    const slotAttributeName = extension.slotAttributeName.toLowerCase()

    const material = new MToonAtlasMaterial({
      parameterTexture: {
        texture: parameterTexture,
        slotCount: extension.parameterTexture.slotCount,
        texelsPerSlot: extension.parameterTexture.texelsPerSlot,
        atlasedTextures: atlasedTextures,
      },
      slotAttribute: {
        name: slotAttributeName,
      },
      name: materialDef.name,
    })

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
      material.depthWrite = false
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

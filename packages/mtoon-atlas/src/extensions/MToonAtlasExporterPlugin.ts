import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Mesh, Object3D, SkinnedMesh, Texture } from 'three'
import { encode as encodePng16 } from 'fast-png'
import { compressToKtx2 } from '@webxr-jp/texture-compression'
import type { Ktx2CompressionOptions } from '@webxr-jp/texture-compression'
import { MToonAtlasMaterial } from '../MToonAtlasMaterial'
import
{
  GLTFWriter,
  MTOON_ATLAS_EXTENSION_NAME,
  MToonAtlasExtensionSchema,
  OutlineWidthMode,
} from './types'

/**
 * テクスチャ圧縮オプション
 * エクスポート時にアトラステクスチャを KTX2 形式で圧縮する
 */
export interface TextureCompressionOptions extends Ktx2CompressionOptions {
  /**
   * WASM ファイルのディレクトリURL（initBasisEncoder に渡す用）
   * 実際の初期化は exportVRM 側で行うため、ここでは使用しない
   */
  wasmDir?: string
}

/**
 * テクスチャインデックス情報
 * beforeParseで画像処理を開始し、afterParseで解決されたインデックスを使用
 */
interface TextureIndexInfo
{
  parameterTextureIndex: number
  atlasedTextureIndices: Record<string, number>
}

/**
 * 解決待ちのテクスチャインデックス情報（beforeParse時点）
 */
interface PendingTextureIndexInfo
{
  parameterTextureIndex: Promise<number> | null
  atlasedTextureIndices: Record<string, Promise<number>>
}

/**
 * GLTFExporter用のMToonAtlasエクスポートプラグイン
 *
 * GLTFExporterはShaderMaterialをサポートしないため、
 * beforeParseでテクスチャを処理し、afterParseでマテリアル定義をJSONに追加します。
 */
export class MToonAtlasExporterPlugin
{
  public readonly name = MTOON_ATLAS_EXTENSION_NAME
  private writer: GLTFWriter

  // MToonAtlasMaterialを持つメッシュのマップ（SkinnedMeshと通常のMesh両方対応）
  private mtoonAtlasMeshes: Map<Mesh, MToonAtlasMaterial[]> = new Map()

  // beforeParseで処理されたテクスチャインデックス（解決済み）
  private textureIndices: Map<MToonAtlasMaterial, TextureIndexInfo> = new Map()

  // beforeParseで処理中のテクスチャインデックス（Promise）
  private pendingTextureIndices: Map<MToonAtlasMaterial, PendingTextureIndexInfo> = new Map()

  // テクスチャUUIDからインデックスへのキャッシュ（重複登録防止）
  // Three.jsのShaderMaterial.copyがuniformsをディープクローンするため、
  // オブジェクト参照ではなくUUIDでキャッシュする必要がある
  private textureCache: Map<string, Promise<number>> = new Map()

  // テクスチャ圧縮オプション（設定されている場合、アトラステクスチャをKTX2で圧縮）
  private textureCompressionOptions?: TextureCompressionOptions

  constructor(writer: GLTFWriter)
  {
    this.writer = writer
  }

  /**
   * テクスチャ圧縮オプションを設定
   * 設定された場合、アトラステクスチャを KTX2 形式で圧縮してエクスポート
   *
   * @param options - 圧縮オプション
   */
  public setTextureCompressionOptions(options: TextureCompressionOptions): void
  {
    this.textureCompressionOptions = options
  }

  /**
   * beforeParseでシーン内のMToonAtlasMaterialを収集し、テクスチャを処理
   * また、スロット属性名をGLTFExporterが正しい名前でエクスポートするようにリネーム
   */
  public beforeParse(input: Object3D | Object3D[])
  {
    this.mtoonAtlasMeshes.clear()
    this.textureIndices.clear()
    this.pendingTextureIndices.clear()
    this.textureCache.clear()
    const roots = Array.isArray(input) ? input : [input]

    for (const root of roots)
    {
      root.traverse((obj) =>
      {
        // SkinnedMeshと通常のMesh両方を対象にする
        if (obj instanceof Mesh)
        {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          const mtoonMaterials: MToonAtlasMaterial[] = []

          for (const material of materials)
          {
            if (material && 'isMToonAtlasMaterial' in material)
            {
              mtoonMaterials.push(material as MToonAtlasMaterial)
            }
          }

          if (mtoonMaterials.length > 0)
          {
            this.mtoonAtlasMeshes.set(obj, mtoonMaterials)

            // スロット属性名をリネーム
            // GLTFExporterは属性名を大文字化し_プレフィックスを付けるため、
            // 'mtoon_material_slot' → '_MTOON_MATERIAL_SLOT' としてエクスポートされる
            // これにより、addSlotAttributeで重複してデータを追加する必要がなくなる
            const material = mtoonMaterials[0]
            const originalAttrName = material.slotAttribute?.name || 'mtoonMaterialSlot'
            // GLTFExporterは'foo' -> '_FOO'に変換するため、'mtoon_material_slot'を使用
            const targetAttrName = 'mtoon_material_slot'

            if (originalAttrName !== targetAttrName)
            {
              const attr = obj.geometry.getAttribute(originalAttrName)
              if (attr)
              {
                // 元の属性は削除せず、新しい名前でも参照できるようにする
                // これにより、他のコードが元の名前で参照しても動作する
                obj.geometry.setAttribute(targetAttrName, attr)
              }
            }

            // テクスチャを事前に処理（非同期）
            for (const material of mtoonMaterials)
            {
              if (!this.pendingTextureIndices.has(material))
              {
                this.processTexturesForMaterial(material)
              }
            }
          }
        }
      })
    }

    // morphAttributesの共有を最適化
    // GLTFLoaderは同一アクセサに対して同じArrayBufferを共有するが、
    // 異なるBufferAttributeオブジェクトを作成する。
    // GLTFExporterはBufferAttributeオブジェクトをキーとしてキャッシュするため、
    // 同一ArrayBufferを持つ属性を同一のBufferAttributeオブジェクトに統一する
    this.optimizeMorphAttributeSharing(roots)

  }

  /**
   * 属性データの重複を検出してアクセサを共有する最適化
   *
   * GLTFExporterには以下の問題がある：
   * 1. morphTarget処理でattribute.clone()を毎回呼び出すため、キャッシュが効かない
   * 2. 同一データを持つ異なる属性オブジェクトが別々にエクスポートされる
   *
   * この問題を回避するため、processAccessorをラップして
   * データ内容のフィンガープリントでキャッシュを行う
   */
  private optimizeMorphAttributeSharing(_roots: Object3D[])
  {
    // データフィンガープリント -> アクセサインデックス のキャッシュ
    const fingerprintToAccessor = new Map<string, number>()

    // フィンガープリント生成関数
    const getFingerprint = (attribute: BufferAttribute | InterleavedBufferAttribute): string =>
    {
      const array = attribute.array as ArrayLike<number>
      const byteLength = attribute.array.byteLength
      const itemSize = attribute.itemSize
      const count = attribute.count
      const normalized = attribute.normalized

      // サイズ + itemSize + count + normalized + 先頭/中間/末尾のサンプルデータで簡易フィンガープリント
      const len = array.length
      if (len === 0) return `${byteLength}:${itemSize}:${count}:${normalized}:`

      const sampleCount = Math.min(16, len)
      const samples: number[] = []

      // 先頭サンプル
      for (let i = 0; i < sampleCount && i < len; i++)
      {
        samples.push(array[i])
      }
      // 中間サンプル
      const midStart = Math.floor(len / 2) - Math.floor(sampleCount / 2)
      for (let i = 0; i < sampleCount && midStart + i < len; i++)
      {
        samples.push(array[Math.max(0, midStart + i)])
      }
      // 末尾サンプル
      const endStart = Math.max(0, len - sampleCount)
      for (let i = 0; i < sampleCount && endStart + i < len; i++)
      {
        samples.push(array[endStart + i])
      }

      return `${byteLength}:${itemSize}:${count}:${normalized}:${samples.map(v => v.toFixed(6)).join(',')}`
    }

    // processAccessorをラップして、データ重複を回避
    const originalProcessAccessor = this.writer.processAccessor.bind(this.writer)
    let cacheHits = 0
    let totalCalls = 0

    this.writer.processAccessor = (
      attribute: BufferAttribute | InterleavedBufferAttribute,
      geometry?: BufferGeometry,
      start?: number,
      count?: number
    ): number =>
    {
      totalCalls++
      const fingerprint = getFingerprint(attribute)

      // 同一フィンガープリントに対してすでにアクセサを作成済みならそれを返す
      const cachedAccessor = fingerprintToAccessor.get(fingerprint)
      if (cachedAccessor !== undefined)
      {
        cacheHits++
        return cachedAccessor
      }

      // 新規作成してキャッシュに保存
      const accessorIndex = originalProcessAccessor(attribute, geometry, start, count)
      fingerprintToAccessor.set(fingerprint, accessorIndex)
      return accessorIndex
    }

    // afterParseでフック
    const originalAfterParse = this.afterParse.bind(this)
    this.afterParse = (input: Object3D | Object3D[]) =>
    {
      originalAfterParse(input)
    }
  }

  /**
   * マテリアルのテクスチャを処理してインデックスを保存
   * 非同期でBINチャンクに書き込み、完了後にtextureIndicesに格納
   */
  private processTexturesForMaterial(material: MToonAtlasMaterial)
  {
    const pendingIndices: PendingTextureIndexInfo = {
      parameterTextureIndex: null,
      atlasedTextureIndices: {},
    }

    // パラメータテクスチャを処理
    // パラメータテクスチャはRGBA全チャンネルにパラメータデータが格納されているため
    // Canvas 2D経由ではなくfast-pngで直接PNGエンコードする（Premultiplied Alpha問題回避）
    if (material.parameterTexture?.texture)
    {
      pendingIndices.parameterTextureIndex = this.processParameterTextureWithCache(
        material.parameterTexture.texture
      )
    }

    // アトラス化テクスチャを処理
    const atlasedTextures = material.parameterTexture?.atlasedTextures
    if (atlasedTextures)
    {
      for (const [key, texture] of Object.entries(atlasedTextures))
      {
        if (texture)
        {
          pendingIndices.atlasedTextureIndices[key] = this.processTextureWithCache(texture)
        }
      }
    }

    this.pendingTextureIndices.set(material, pendingIndices)


    // 全てのPromiseを解決してtextureIndicesに格納
    const allPromises: Promise<void>[] = []

    if (pendingIndices.parameterTextureIndex)
    {
      allPromises.push(pendingIndices.parameterTextureIndex.then(() => { }))
    }

    for (const promise of Object.values(pendingIndices.atlasedTextureIndices))
    {
      allPromises.push(promise.then(() => { }))
    }

    // 全て解決後にtextureIndicesに格納するPromise
    // このPromiseは後でwaitForAllTextureIndicesで待機される
    const resolveAllPromise = Promise.all(allPromises).then(async () =>
    {
      const resolvedIndices: TextureIndexInfo = {
        parameterTextureIndex: pendingIndices.parameterTextureIndex
          ? await pendingIndices.parameterTextureIndex
          : -1,
        atlasedTextureIndices: {},
      }

      for (const [key, promise] of Object.entries(pendingIndices.atlasedTextureIndices))
      {
        resolvedIndices.atlasedTextureIndices[key] = await promise
      }

      this.textureIndices.set(material, resolvedIndices)
    })

    // pendingTextureIndicesにresolveAllPromiseも保存して、waitForAllTextureIndicesで待機できるようにする
    ; (pendingIndices as any).resolvePromise = resolveAllPromise

    this.writer.pending.push(resolveAllPromise)
  }

  /**
   * パラメータテクスチャをキャッシュ付きで処理
   * 同じUUIDのテクスチャは1回だけ処理される
   */
  private processParameterTextureWithCache(texture: Texture): Promise<number>
  {
    const uuid = texture.uuid
    const cached = this.textureCache.get(uuid)
    if (cached)
    {
      return cached
    }

    const promise = this.processParameterTexture(texture)
    this.textureCache.set(uuid, promise)
    return promise
  }

  /**
   * 通常テクスチャをキャッシュ付きで処理
   * 同じUUIDのテクスチャは1回だけ処理される
   */
  private processTextureWithCache(texture: Texture): Promise<number>
  {
    const uuid = texture.uuid
    const cached = this.textureCache.get(uuid)
    if (cached)
    {
      return cached
    }

    const promise = this.processTextureWithFallback(texture)
    this.textureCache.set(uuid, promise)
    return promise
  }

  /**
   * パラメータテクスチャを処理（BINチャンクに書き込み）
   * Canvas 2DのPremultiplied Alpha問題を回避するため、
   * 生のRGBAデータから直接PNGを生成してBINチャンクに格納
   */
  private processParameterTexture(texture: Texture): Promise<number>
  {
    const json = this.writer.json
    json.textures = json.textures || []
    json.images = json.images || []
    json.samplers = json.samplers || []

    // パラメータテクスチャ用サンプラー（Nearest Filter）
    let nearestSamplerIndex = json.samplers.findIndex(
      (s: any) => s.magFilter === 9728 && s.minFilter === 9728
    )
    if (nearestSamplerIndex === -1)
    {
      nearestSamplerIndex = json.samplers.length
      json.samplers.push({
        magFilter: 9728, // NEAREST
        minFilter: 9728, // NEAREST
        wrapS: 33071, // CLAMP_TO_EDGE
        wrapT: 33071, // CLAMP_TO_EDGE
      })
    }

    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'parameterTexture',
      mimeType: 'image/png',
    }
    json.images.push(imageDef)

    // テクスチャ定義を先に追加（インデックスを確定）
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: nearestSamplerIndex,
      source: imageIndex,
      name: texture.name || 'parameterTexture',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any
    if (image?.data && image.width && image.height)
    {
      // DataTextureの生データから16bit PNGをエンコード（精度向上）
      const srcData = image.data
      const isFloatData = srcData instanceof Float32Array ||
        srcData.constructor?.name === 'Float32Array'
      const pixelCount = image.width * image.height * 4
      // 16bit PNG用にUint16Arrayを使用
      const uint16Data = new Uint16Array(pixelCount)

      for (let i = 0; i < pixelCount; i++)
      {
        const value = srcData[i]
        // Float32Array (0.0-1.0) の場合は 65535 を掛ける（16bit精度）
        // Uint8Array (0-255) の場合は 257 を掛けて16bitに変換
        uint16Data[i] = isFloatData
          ? Math.round(Math.min(1, Math.max(0, value)) * 65535)
          : value * 257
      }

      // fast-pngで16bit PNGエンコード（Premultiplied Alpha問題を回避、精度向上）
      const pngData = encodePng16({
        width: image.width,
        height: image.height,
        depth: 16,
        channels: 4,
        data: uint16Data,
      })

      // BlobからBINチャンクに書き込む
      const blob = new Blob([pngData.buffer as ArrayBuffer], { type: 'image/png' })
      const bufferViewPromise = this.writer.processBufferViewImage(blob)
        .then(bufferViewIndex =>
        {
          imageDef.bufferView = bufferViewIndex
          return textureIndex
        })

      // pendingに追加して完了を待つ
      this.writer.pending.push(bufferViewPromise.then(() => { }))
      return bufferViewPromise
    } else
    {
      console.warn('MToonAtlasExporterPlugin: Parameter texture has no valid data')
      // 1x1透明画像をBINチャンクに書き込む
      const placeholder = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82,
      ])
      const blob = new Blob([placeholder], { type: 'image/png' })
      const bufferViewPromise = this.writer.processBufferViewImage(blob)
        .then(bufferViewIndex =>
        {
          imageDef.bufferView = bufferViewIndex
          return textureIndex
        })

      this.writer.pending.push(bufferViewPromise.then(() => { }))
      return bufferViewPromise
    }
  }

/**
   * テクスチャを処理してBINチャンクに書き込む
   * @param texture - 処理するテクスチャ
   *
   * 注: writer.processTextureは使用しない。
   * GLTFExporter内部でテクスチャがキャッシュされないため、
   * 同じテクスチャオブジェクトでも毎回新しいエントリが作成されてしまう。
   * 代わりに手動でテクスチャを登録することで、キャッシュを正しく機能させる。
   */
  private processTextureWithFallback(texture: Texture): Promise<number>
  {
    // テクスチャ圧縮オプションが設定されている場合は KTX2 形式で処理
    if (this.textureCompressionOptions)
    {
      return this.processTextureAsKtx2(texture)
    }

    // 従来の PNG 形式で処理
    return this.processTextureAsPng(texture)
  }

  /**
   * テクスチャを KTX2 形式で処理してBINチャンクに書き込む
   * @param texture - 処理するテクスチャ
   */
  private processTextureAsKtx2(texture: Texture): Promise<number>
  {
    const json = this.writer.json
    json.textures = json.textures || []
    json.images = json.images || []
    json.samplers = json.samplers || []

    // KTX2 用の LINEAR サンプラーを取得または作成
    let linearSamplerIndex = json.samplers.findIndex(
      (s: any) => s.magFilter === 9729 && s.minFilter === 9987
    )
    if (linearSamplerIndex === -1)
    {
      linearSamplerIndex = json.samplers.length
      json.samplers.push({
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      })
    }

    // 画像定義を先に追加（インデックスを確定）
    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'texture',
      mimeType: 'image/ktx2',
    }
    json.images.push(imageDef)

    // テクスチャ定義を先に追加（KHR_texture_basisu 拡張付き）
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: linearSamplerIndex,
      source: imageIndex,
      name: texture.name || 'texture',
      extensions: {
        KHR_texture_basisu: {
          source: imageIndex,
        },
      },
    })

    // extensionsUsed に KHR_texture_basisu を追加
    json.extensionsUsed = json.extensionsUsed || []
    if (!json.extensionsUsed.includes('KHR_texture_basisu'))
    {
      json.extensionsUsed.push('KHR_texture_basisu')
    }

    // テクスチャを KTX2 形式で圧縮
    const bufferViewPromise = this.compressTextureToKtx2(texture)
      .then(async (ktx2Data) =>
      {
        // Uint8Array を新しい ArrayBuffer にコピーして Blob を作成
        // SharedArrayBuffer の可能性を排除
        const arrayCopy = new Uint8Array(ktx2Data).buffer as ArrayBuffer
        const blob = new Blob([arrayCopy], { type: 'image/ktx2' })
        const bufferViewIndex = await this.writer.processBufferViewImage(blob)
        imageDef.bufferView = bufferViewIndex
        return textureIndex
      })

    // pendingに追加して完了を待つ
    this.writer.pending.push(bufferViewPromise.then(() => { }))
    return bufferViewPromise
  }

  /**
   * テクスチャを KTX2 バイナリに圧縮
   * @param texture - 処理するテクスチャ
   * @returns KTX2 バイナリデータ
   */
  private async compressTextureToKtx2(texture: Texture): Promise<Uint8Array>
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any

    if (!image)
    {
      throw new Error('テクスチャに有効な画像データがありません')
    }

    // 画像の幅と高さを取得
    const width = image.width
    const height = image.height

    if (!width || !height)
    {
      throw new Error('テクスチャの画像サイズが取得できません')
    }

    // RGBAデータを取得（様々な画像形式に対応）
    const rgbaData = await this.extractRgbaData(image)
    const pixelCount = width * height * 4

    if (rgbaData.length !== pixelCount)
    {
      throw new Error(`画像データサイズが不正: expected ${pixelCount}, got ${rgbaData.length}`)
    }

    // 注: Y軸反転は不要
    // Three.jsのテクスチャ座標系とKTX2の座標系は両方とも左上原点
    // extractRgbaDataで取得したデータはそのまま使用する

    // 圧縮オプションを構築
    const compressionOptions: Ktx2CompressionOptions = {
      quality: this.textureCompressionOptions?.quality,
      compressionLevel: this.textureCompressionOptions?.compressionLevel,
      generateMipmaps: this.textureCompressionOptions?.generateMipmaps,
      supercompression: this.textureCompressionOptions?.supercompression,
    }

    // KTX2 圧縮を実行
    const result = await compressToKtx2(
      rgbaData,
      width,
      height,
      compressionOptions
    )

    if (result.isErr())
    {
      throw new Error(`KTX2圧縮に失敗: ${result.error.message}`)
    }

    return result.value.data
  }

  /**
   * 様々な画像形式からRGBAデータを抽出
   * @param image - 画像データ（DataTexture, HTMLImageElement, ImageBitmap, HTMLCanvasElement等）
   * @returns RGBA形式のUint8Array
   */
  private async extractRgbaData(image: any): Promise<Uint8Array>
  {
    // DataTexture（image.dataがある場合）
    if (image.data && image.width && image.height)
    {
      const srcData = image.data
      const isFloatData = srcData instanceof Float32Array ||
        srcData.constructor?.name === 'Float32Array'
      const pixelCount = image.width * image.height * 4

      if (isFloatData)
      {
        const rgbaData = new Uint8Array(pixelCount)
        for (let i = 0; i < pixelCount; i++)
        {
          rgbaData[i] = Math.round(Math.min(1, Math.max(0, srcData[i])) * 255)
        }
        return rgbaData
      } else
      {
        return new Uint8Array(srcData)
      }
    }

    // HTMLCanvasElement
    if (image instanceof HTMLCanvasElement)
    {
      const ctx = image.getContext('2d')
      if (ctx)
      {
        const imageData = ctx.getImageData(0, 0, image.width, image.height)
        return new Uint8Array(imageData.data)
      }
    }

    // HTMLImageElement または ImageBitmap
    // ImageBitmapはブラウザ環境のみで利用可能なため、typeofでチェック
    if (image instanceof HTMLImageElement ||
      (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap))
    {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (ctx)
      {
        ctx.drawImage(image, 0, 0)
        const imageData = ctx.getImageData(0, 0, image.width, image.height)
        return new Uint8Array(imageData.data)
      }
    }

    // toDataURL対応オブジェクト（OffscreenCanvas等）
    if (typeof image.toDataURL === 'function')
    {
      // toDataURLからImageを作成してCanvasに描画
      return new Promise((resolve, reject) =>
      {
        const dataUrl: string = image.toDataURL('image/png')
        const img = new Image()
        img.onload = () =>
        {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          if (ctx)
          {
            ctx.drawImage(img, 0, 0)
            const imageData = ctx.getImageData(0, 0, img.width, img.height)
            resolve(new Uint8Array(imageData.data))
          } else
          {
            reject(new Error('Canvas 2D context取得に失敗'))
          }
        }
        img.onerror = () => reject(new Error('画像のロードに失敗'))
        img.src = dataUrl
      })
    }

    throw new Error('サポートされていない画像形式です')
  }

  /**
   * テクスチャを PNG 形式で処理してBINチャンクに書き込む（従来の処理）
   * @param texture - 処理するテクスチャ
   */
  private processTextureAsPng(texture: Texture): Promise<number>
  {
    // 直接JSONにテクスチャを追加してBINチャンクに書き込む
    const json = this.writer.json
    json.textures = json.textures || []
    json.images = json.images || []
    json.samplers = json.samplers || []

    // アトラステクスチャ用のLINEARサンプラーを取得または作成
    // パラメータテクスチャがNEARESTサンプラーを先に登録する可能性があるため、
    // 常にsampler: 0を使うのではなく、LINEARサンプラーのインデックスを明示的に取得する
    let linearSamplerIndex = json.samplers.findIndex(
      (s: any) => s.magFilter === 9729 && s.minFilter === 9987
    )
    if (linearSamplerIndex === -1)
    {
      linearSamplerIndex = json.samplers.length
      json.samplers.push({
        magFilter: 9729, // LINEAR
        minFilter: 9987, // LINEAR_MIPMAP_LINEAR
        wrapS: 10497, // REPEAT
        wrapT: 10497, // REPEAT
      })
    }

    // 画像定義を先に追加（インデックスを確定）
    const imageIndex = json.images.length
    const imageDef: any = {
      name: texture.name || 'texture',
      mimeType: 'image/png',
    }
    json.images.push(imageDef)

    // テクスチャ定義を先に追加
    const textureIndex = json.textures.length
    json.textures.push({
      sampler: linearSamplerIndex,
      source: imageIndex,
      name: texture.name || 'texture',
    })

    // テクスチャのソースを取得
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const image = texture.image as any
    const blobPromise = this.imageToBlobAsync(image)

    const bufferViewPromise = blobPromise
      .then(blob => this.writer.processBufferViewImage(blob))
      .then(bufferViewIndex =>
      {
        imageDef.bufferView = bufferViewIndex
        return textureIndex
      })

    // pendingに追加して完了を待つ
    this.writer.pending.push(bufferViewPromise.then(() => { }))
    return bufferViewPromise
  }

  /**
   * 画像をBlobに変換する（非同期）
   */
  private async imageToBlobAsync(image: any): Promise<Blob>
  {
    if (!image)
    {
      console.warn('MToonAtlasExporterPlugin: Texture has no image, using placeholder')
      return this.createPlaceholderBlob()
    }

    // CanvasからBlob
    if (image instanceof HTMLCanvasElement)
    {
      return new Promise((resolve) =>
      {
        image.toBlob((blob) =>
        {
          resolve(blob || this.createPlaceholderBlob())
        }, 'image/png')
      })
    }

    // ImageBitmap/HTMLImageElementからBlob
    if (image instanceof ImageBitmap || image instanceof HTMLImageElement)
    {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (ctx)
      {
        ctx.drawImage(image, 0, 0)
        return new Promise((resolve) =>
        {
          canvas.toBlob((blob) =>
          {
            resolve(blob || this.createPlaceholderBlob())
          }, 'image/png')
        })
      }
    }

    // DataTexture（image.data）からBlob
    if (image.data && image.width && image.height)
    {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')
      if (ctx)
      {
        const srcData = image.data
        const isFloatData = srcData instanceof Float32Array ||
          srcData.constructor?.name === 'Float32Array'
        const pixelCount = image.width * image.height * 4
        const uint8Data = new Uint8ClampedArray(pixelCount)

        for (let i = 0; i < pixelCount; i++)
        {
          const value = srcData[i]
          uint8Data[i] = isFloatData
            ? Math.round(Math.min(1, Math.max(0, value)) * 255)
            : value
        }

        const imageData = new ImageData(uint8Data, image.width, image.height)
        ctx.putImageData(imageData, 0, 0)

        return new Promise((resolve) =>
        {
          canvas.toBlob((blob) =>
          {
            resolve(blob || this.createPlaceholderBlob())
          }, 'image/png')
        })
      }
    }

    // toDataURL対応オブジェクト
    if (typeof image.toDataURL === 'function')
    {
      const dataUrl: string = image.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++)
      {
        bytes[i] = binary.charCodeAt(i)
      }
      return new Blob([bytes], { type: 'image/png' })
    }

    console.warn('MToonAtlasExporterPlugin: Could not convert texture image, using placeholder')
    return this.createPlaceholderBlob()
  }

  /**
   * 1x1透明プレースホルダーBlob作成
   */
  private createPlaceholderBlob(): Blob
  {
    const placeholder = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
      0x42, 0x60, 0x82,
    ])
    return new Blob([placeholder], { type: 'image/png' })
  }

  /**
   * afterParseでマテリアルとメッシュのプリミティブ属性をJSONに追加
   *
   * GLTFExporterはShaderMaterialをスキップするため、
   * ここで手動でマテリアル定義を追加します。
   *
   * 注: テクスチャ処理のPromiseはwriter.pendingに追加済みなので、
   * afterParse完了後にGLTFExporterがawait Promise.all(pending)で待機する。
   * マテリアル定義内のテクスチャインデックスは、pendingのPromise内で更新される。
   */
  public afterParse(_input: Object3D | Object3D[])
  {
    if (this.mtoonAtlasMeshes.size === 0) return

    const json = this.writer.json

    // マテリアルの処理
    // マテリアルごとにインデックスを記録
    const materialIndexMap = new Map<MToonAtlasMaterial, number>()
    // マテリアル定義とマテリアルの対応を保存（後でテクスチャインデックスを更新するため）
    const materialDefMap = new Map<MToonAtlasMaterial, any>()

    for (const [mesh, materials] of this.mtoonAtlasMeshes)
    {
      for (const material of materials)
      {
        if (materialIndexMap.has(material)) continue

        // マテリアル定義を作成（テクスチャインデックスは後で更新される）
        const materialDef = this.createMaterialDef(material)

        // マテリアル配列に追加
        json.materials = json.materials || []
        const materialIndex = json.materials.length
        json.materials.push(materialDef)
        materialIndexMap.set(material, materialIndex)
        materialDefMap.set(material, materialDef)
      }

      // メッシュのプリミティブにマテリアルとスロット属性を設定
      this.updateMeshPrimitive(mesh, materials, materialIndexMap)
    }

    // extensionsUsedに追加
    json.extensionsUsed = json.extensionsUsed || []
    if (!json.extensionsUsed.includes(MTOON_ATLAS_EXTENSION_NAME))
    {
      json.extensionsUsed.push(MTOON_ATLAS_EXTENSION_NAME)
    }

    // テクスチャ処理完了後にマテリアル定義のインデックスを更新するPromiseをpendingに追加
    const updateMaterialDefsPromise = this.waitForAllTextureIndices().then(() =>
    {
      for (const [material, materialDef] of materialDefMap)
      {
        const indices = this.textureIndices.get(material)
        if (indices)
        {
          const extension = materialDef.extensions[MTOON_ATLAS_EXTENSION_NAME]
          if (extension.parameterTexture)
          {
            extension.parameterTexture.index = indices.parameterTextureIndex
          }
          for (const [key, index] of Object.entries(indices.atlasedTextureIndices))
          {
            extension.atlasedTextures[key] = { index }
          }
        }
      }
    })

    this.writer.pending.push(updateMaterialDefsPromise)
  }

  /**
   * 全てのテクスチャインデックスが解決され、textureIndicesに登録されるのを待つ
   */
  private async waitForAllTextureIndices(): Promise<void>
  {
    const allPromises: Promise<void>[] = []

    for (const pending of this.pendingTextureIndices.values())
    {
      // resolvePromiseを待つことで、textureIndicesへの登録も確実に完了する
      const resolvePromise = (pending as any).resolvePromise
      if (resolvePromise)
      {
        allPromises.push(resolvePromise)
      }
    }

    await Promise.all(allPromises)
  }

  /**
   * MToonAtlasMaterialからGLTFマテリアル定義を作成
   */
  private createMaterialDef(material: MToonAtlasMaterial): any
  {
    const indices = this.textureIndices.get(material)

    const extension: MToonAtlasExtensionSchema = {
      version: '1.0',
      parameterTexture: {
        index: indices?.parameterTextureIndex ?? -1,
        texelsPerSlot: material.parameterTexture?.texelsPerSlot ?? 9,
        slotCount: material.parameterTexture?.slotCount ?? 0,
      },
      slotAttributeName: '_MTOON_MATERIAL_SLOT',
      atlasedTextures: {},
    }

    // アウトライン関連のプロパティを設定
    if (material.isOutline)
    {
      extension.isOutline = true
    }
    if (material.outlineWidthMode && material.outlineWidthMode !== 'none')
    {
      extension.outlineWidthMode = material.outlineWidthMode as OutlineWidthMode
    }

    // アトラス化テクスチャのインデックスを設定
    if (indices?.atlasedTextureIndices)
    {
      for (const [key, index] of Object.entries(indices.atlasedTextureIndices))
      {
        ; (extension.atlasedTextures as any)[key] = { index }
      }
    }

    // マテリアル定義を構築
    const materialDef: any = {
      name: material.name || 'MToonAtlasMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: material.side === 2, // THREE.DoubleSide
      extensions: {
        [MTOON_ATLAS_EXTENSION_NAME]: extension,
      },
    }

    // アルファモードの設定
    if (material.transparent)
    {
      materialDef.alphaMode = 'BLEND'
    } else if (material.alphaTest > 0)
    {
      materialDef.alphaMode = 'MASK'
      materialDef.alphaCutoff = material.alphaTest
    }

    return materialDef
  }

  /**
   * メッシュのプリミティブにマテリアルとスロット属性を設定
   */
  private updateMeshPrimitive(
    mesh: Mesh,
    materials: MToonAtlasMaterial[],
    materialIndexMap: Map<MToonAtlasMaterial, number>
  )
  {
    const json = this.writer.json

    // メッシュのノードインデックスを取得
    const nodeIndex = this.writer.nodeMap?.get(mesh)
    if (nodeIndex === undefined) return

    const nodeDef = json.nodes?.[nodeIndex]
    if (!nodeDef || nodeDef.mesh === undefined) return

    const meshDef = json.meshes?.[nodeDef.mesh]
    if (!meshDef?.primitives) return

    // マテリアルを設定
    const material = materials[0] // 単一マテリアルを仮定
    const materialIndex = materialIndexMap.get(material)
    if (materialIndex === undefined) return

    for (const primitive of meshDef.primitives)
    {
      primitive.material = materialIndex

      // スロット属性の確認
      // beforeParseで属性名を'mtoon_material_slot'にリネーム済みなので、
      // GLTFExporterが'_MTOON_MATERIAL_SLOT'として出力しているはず
      // 既に存在する場合は何もしない（重複登録を防ぐ）
      if (primitive.attributes['_MTOON_MATERIAL_SLOT'] === undefined)
      {
        // フォールバック: 万が一GLTFExporterが出力していない場合のみ新規追加
        const attributeName = 'mtoon_material_slot'
        this.addSlotAttribute(primitive, mesh, attributeName)
      }
    }
  }

  /**
   * スロット属性をプリミティブに追加
   */
  private addSlotAttribute(primitive: any, mesh: Mesh, attributeName: string)
  {
    const attribute = mesh.geometry.getAttribute(attributeName)
    if (!attribute) return

    // processAccessorが使える場合はそれを使用
    if (typeof this.writer.processAccessor === 'function')
    {
      try
      {
        const accessorIndex = this.writer.processAccessor(attribute, mesh.geometry)
        primitive.attributes['_MTOON_MATERIAL_SLOT'] = accessorIndex
        return
      } catch
      {
        // フォールバック処理
      }
    }

    // 直接JSONにアクセサを追加
    const json = this.writer.json
    json.accessors = json.accessors || []
    json.bufferViews = json.bufferViews || []
    json.buffers = json.buffers || []

    // バッファデータを取得
    const array = attribute.array
    const byteArray = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)

    // Base64エンコード
    let binary = ''
    for (let i = 0; i < byteArray.length; i++)
    {
      binary += String.fromCharCode(byteArray[i])
    }
    const base64 = btoa(binary)
    const dataUri = `data:application/octet-stream;base64,${base64}`

    // バッファを追加
    const bufferIndex = json.buffers.length
    json.buffers.push({
      uri: dataUri,
      byteLength: byteArray.byteLength,
    })

    // バッファビューを追加
    const bufferViewIndex = json.bufferViews.length
    json.bufferViews.push({
      buffer: bufferIndex,
      byteOffset: 0,
      byteLength: byteArray.byteLength,
    })

    // アクセサを追加
    const accessorIndex = json.accessors.length
    json.accessors.push({
      bufferView: bufferViewIndex,
      componentType: 5126, // FLOAT
      count: attribute.count,
      type: 'SCALAR',
    })

    primitive.attributes['_MTOON_MATERIAL_SLOT'] = accessorIndex
  }

}

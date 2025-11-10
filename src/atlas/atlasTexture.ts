import { Document, Texture, ImageUtils, Accessor } from '@gltf-transform/core'
import { ResultAsync } from 'neverthrow'
import { AtlasError, AtlasOptions, AtlasResult, IslandRegion, PackedRect } from '../types'
import { createCanvas, getCanvasContext, canvasToDataURL } from '../utils/canvas'
import { packTextures } from './packer'

/**
 * UV 座標の再マッピング計算
 *
 * 重要: テクスチャが物理的に移動した分だけ、
 *       モデルの UV 座標も同じ量だけ移動させる
 */
function remapUVCoordinate(
  oldU: number,                    // 元の U 座標 [0, 1]
  oldV: number,                    // 元の V 座標 [0, 1]
  region: IslandRegion,            // どの島に属しているか
  atlasWidth: number,              // アトラス全体の幅（ピクセル）
  atlasHeight: number,             // アトラス全体の高さ（ピクセル）
): { newU: number; newV: number } {
  // Step 1: 元テクスチャ内でのピクセル座標を計算
  const sourcePixelX = oldU * region.sourceWidth
  const sourcePixelY = oldV * region.sourceHeight

  // Step 2: アトラス内での絶対ピクセル位置を計算
  // = 新島の位置 + (元島内での相対位置)
  const atlasPixelX = region.targetX + sourcePixelX
  const atlasPixelY = region.targetY + sourcePixelY

  // Step 3: アトラス全体の UV 座標に正規化
  const newU = atlasPixelX / atlasWidth
  const newV = atlasPixelY / atlasHeight

  return { newU, newV }
}

/**
 * glTF-Transform ドキュメント内のテクスチャをアトラス化
 * CPU + Canvas API による実装
 */
export function atlasTexturesInDocument(
  document: Document,
  options: AtlasOptions = {},
): ResultAsync<AtlasResult, AtlasError> {
  const maxSize = options.maxSize ?? 2048
  const padding = options.padding ?? 4

  return ResultAsync.fromPromise(
    _atlasImpl(document, maxSize, padding),
    (error) => ({
      type: 'UNKNOWN_ERROR' as const,
      message: `Atlas failed: ${String(error)}`,
    }),
  )
}

/**
 * 実装詳細
 */
async function _atlasImpl(
  document: Document,
  maxSize: number,
  padding: number,
): Promise<AtlasResult> {
  // Stage 1: テクスチャ抽出
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    throw new Error('NO_TEXTURES')
  }

  // Stage 1: 各テクスチャから画像を抽出
  const textureImages = await Promise.all(
    textures.map((texture) => _extractTextureImage(texture)),
  )

  // Stage 1: Bin Packing で配置計算
  const packedResult = await packTextures(
    textureImages.map((img) => ({ width: img.width, height: img.height })),
    maxSize,
    padding,
  )

  // Stage 2: Canvas でテクスチャを統合
  const atlasCanvas = createCanvas(
    packedResult.atlasWidth,
    packedResult.atlasHeight,
  )
  const ctx = getCanvasContext(atlasCanvas)

  // 背景をクリア
  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, packedResult.atlasWidth, packedResult.atlasHeight)

  // IslandRegion[] を構築しながら描画
  const islandRegions: IslandRegion[] = []

  for (let i = 0; i < packedResult.packed.length; i++) {
    const packed = packedResult.packed[i]
    const image = textureImages[i]
    const originalTexture = textures[i]

    // Canvas に描画
    const imageData = new ImageData(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height,
    )
    ctx.putImageData(imageData, packed.x, packed.y)

    // IslandRegion を記録
    islandRegions.push({
      sourceTextureIndex: i,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      targetX: packed.x,
      targetY: packed.y,
      targetWidth: packed.width,
      targetHeight: packed.height,
      rotation: 0,
      padding,
    })
  }

  const textureToIndexMap = new Map<Texture, number>();
  textures.forEach((tex, index) => textureToIndexMap.set(tex, index));

  // Stage 3: glTF-Transform ドキュメント更新
  await _updateDocumentWithAtlas(
    document,
    atlasCanvas,
    islandRegions,
    packedResult.atlasWidth,
    packedResult.atlasHeight,
    textures, // Pass original textures to remove them later
    textureToIndexMap, // Pass the map
  )

  // パッキング効率を計算
  const usedArea = islandRegions.reduce(
    (sum, r) => sum + r.targetWidth * r.targetHeight,
    0,
  )
  const totalArea = packedResult.atlasWidth * packedResult.atlasHeight
  const efficiency = usedArea / totalArea

  return {
    document,
    atlasMetadata: {
      width: packedResult.atlasWidth,
      height: packedResult.atlasHeight,
      textureCount: textures.length,
      packingEfficiency: efficiency,
    },
    islandRegions,
  }
}

/**
 * テクスチャから画像データを抽出
 */
async function _extractTextureImage(
  texture: Texture,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = texture.getImage()
  if (!image) {
    throw new Error(`Texture ${texture.getName()} has no image data.`)
  }

  const mimeType = texture.getMimeType()
  if (!mimeType) {
    throw new Error(`Texture ${texture.getName()} has no mime type.`)
  }

  // glTF-Transform の ImageUtils を使用して画像をデコード
  const { width, height, data } = await ImageUtils.decodeImage(image, mimeType)

  return { width, height, data: new Uint8ClampedArray(data.buffer) }
}

/**
 * glTF-Transform ドキュメントをアトラス情報で更新
 */
async function _updateDocumentWithAtlas(
  document: Document,
  atlasCanvas: HTMLCanvasElement | Canvas,
  islandRegions: IslandRegion[],
  atlasWidth: number,
  atlasHeight: number,
  originalTextures: Texture[],
  textureToIndexMap: Map<Texture, number>, // Added
): Promise<void> {
  const root = document.getRoot()

  // 1. アトラス画像をテクスチャとして追加
  const dataURL = await canvasToDataURL(atlasCanvas, 'image/png')
  const base64 = dataURL.split(',')[1]
  const imageBuffer = Buffer.from(base64, 'base64')

  const atlasTexture = document.createTexture('atlasTexture')
    .setImage(imageBuffer)
    .setMimeType('image/png')

  // 2. すべての Primitive の TEXCOORD_0 を再計算
  root.listMeshes().forEach((mesh) => {
    mesh.listPrimitives().forEach((primitive) => {
      const material = primitive.getMaterial()
      if (!material) return

      const baseColorTexture = material.getBaseColorTexture()
      if (!baseColorTexture) return

      const originalTextureIndex = textureToIndexMap.get(baseColorTexture)
      if (originalTextureIndex === undefined) return

      const region = islandRegions.find(r => r.sourceTextureIndex === originalTextureIndex)
      if (!region) return // Should not happen if mapping is correct

      const texcoord = primitive.getAttribute('TEXCOORD_0')
      if (texcoord) {
        const newUVs = new Float32Array(texcoord.getCount() * 2)
        for (let i = 0; i < texcoord.getCount(); i++) {
          const oldU = texcoord.getX(i)
          const oldV = texcoord.getY(i)

          const { newU, newV } = remapUVCoordinate(
            oldU,
            oldV,
            region,
            atlasWidth,
            atlasHeight,
          )
          newUVs[i * 2] = newU
          newUVs[i * 2 + 1] = newV
        }
        primitive.setAttribute('TEXCOORD_0', document.createAccessor().setArray(newUVs).setType(Accessor.Type.VEC2))
      }
    })
  })

  // 3. マテリアル参照を新アトラステクスチャに更新
  root.listMaterials().forEach((material) => {
    const baseColorTexture = material.getBaseColorTexture()
    if (baseColorTexture && originalTextures.includes(baseColorTexture)) {
      material.setBaseColorTexture(atlasTexture)
    }
    // TODO: Other texture slots (metallicRoughnessTexture, normalTexture, etc.)
  })

  // 4. 不要なテクスチャを削除
  originalTextures.forEach((texture) => {
    texture.dispose()
  })
}

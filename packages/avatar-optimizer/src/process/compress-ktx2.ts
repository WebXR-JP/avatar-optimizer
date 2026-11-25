/**
 * アトラステクスチャの KTX2 圧縮・GPU テクスチャ化モジュール
 *
 * optimizeModel の段階でアトラス生成後のテクスチャを KTX2（UASTC）へエンコードし、
 * KTX2Loader.parse() で GPU 向け CompressedTexture へトランスコードして差し替える。
 * 同時に元の KTX2 バイナリを rememberKtx2Source() でキャッシュするため、
 * 後続の exportVRM() では再エンコードなしに KTX2 のままパススルー出力できる。
 */

import {
  extractRgbaData,
  getKtx2Source,
  isCompressedTexture,
  rememberKtx2Source,
  resolveKtx2Loader,
} from '@webxr-jp/mtoon-atlas'
import { compressToKtx2, initBasisEncoder } from '@webxr-jp/texture-compression'
import { err, ok, Result, ResultAsync, safeTry } from 'neverthrow'
import { RepeatWrapping, SRGBColorSpace, Texture } from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type {
  AtlasImageMap,
  MToonLikeMaterial,
  OptimizationError,
  OptimizeModelOptions,
  TextureCompressionOptions,
} from '../types'
import type { MaterialInfo, RenderMode } from '../util/material/types'

/**
 * MToonAtlasMaterial / MToonAtlasNodeMaterial が実際に参照する 8 スロット
 *
 * `combine.ts` の `createMToonAtlasMaterial` が `atlasedTextures` に載せるスロットと一致させる。
 * `outlineWidthMultiplyTexture` はアトラスマテリアルでは未使用、
 * `parameterTexture` は高精度が必要なため 16bit PNG 固定であり、いずれも対象外。
 */
const ATLASED_MATERIAL_SLOTS = [
  'map',
  'shadeMultiplyTexture',
  'shadingShiftTexture',
  'normalMap',
  'emissiveMap',
  'matcapTexture',
  'rimMultiplyTexture',
  'uvAnimationMaskTexture',
] as const

type AtlasedMaterialSlot = (typeof ATLASED_MATERIAL_SLOTS)[number]

/**
 * KTX2 圧縮に使う KTX2Loader を解決する
 *
 * 解決順は `loadVRM` と同じく `ktx2Loader` > `resolveKtx2Loader(ktx2TranscoderPath, ktx2Renderer)`。
 * ブラウザ環境でない場合や WebGL2 コンテキスト生成に失敗して null になった場合はエラーを返す。
 *
 * @param options - KTX2Loader 解決に関わるオプション
 * @returns KTX2Loader または INTERNAL_ERROR
 */
export function resolveKtx2LoaderForOptimization(
  options: Pick<
    OptimizeModelOptions,
    'ktx2Loader' | 'ktx2TranscoderPath' | 'ktx2Renderer'
  >,
): Result<KTX2Loader, OptimizationError> {
  const loader =
    options.ktx2Loader ??
    resolveKtx2Loader(options.ktx2TranscoderPath, options.ktx2Renderer)

  if (!loader) {
    return err({
      type: 'INTERNAL_ERROR' as const,
      message:
        'KTX2Loader を初期化できませんでした（WebGL2/WebGPU が利用可能なブラウザ環境、または options.ktx2Loader の指定が必要です）',
    })
  }

  return ok(loader)
}

/**
 * KTX2Loader.parse() を Promise として実行する
 */
function parseKtx2Texture(
  ktx2Loader: KTX2Loader,
  buffer: ArrayBuffer,
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    ktx2Loader.parse(
      buffer,
      (texture) => resolve(texture),
      (error) => reject(error),
    )
  })
}

/**
 * レンダーモードごとの代表マテリアルから、圧縮対象となるユニークなテクスチャを収集する
 */
function collectUniqueTargetTextures(
  materialInfos: MaterialInfo[],
): Map<string, Texture> {
  const seenRenderModes = new Set<RenderMode>()
  const representativeMaterials: MToonLikeMaterial[] = []

  for (const info of materialInfos) {
    if (seenRenderModes.has(info.renderMode)) continue
    seenRenderModes.add(info.renderMode)
    representativeMaterials.push(info.material)
  }

  const uniqueTextures = new Map<string, Texture>()
  for (const material of representativeMaterials) {
    for (const slot of ATLASED_MATERIAL_SLOTS) {
      const texture = getMaterialSlotTexture(material, slot)
      if (!texture) continue

      const key = texture.source?.uuid ?? texture.uuid
      if (!uniqueTextures.has(key)) {
        uniqueTextures.set(key, texture)
      }
    }
  }

  return uniqueTextures
}

function getMaterialSlotTexture(
  material: MToonLikeMaterial,
  slot: AtlasedMaterialSlot,
): Texture | null | undefined {
  return (
    material as unknown as Record<
      AtlasedMaterialSlot,
      Texture | null | undefined
    >
  )[slot]
}

function setMaterialSlotTexture(
  material: MToonLikeMaterial,
  slot: AtlasedMaterialSlot,
  texture: Texture,
): void {
  ;(
    material as unknown as Record<
      AtlasedMaterialSlot,
      Texture | null | undefined
    >
  )[slot] = texture
}

/**
 * 単一のテクスチャを KTX2 へエンコードし、KTX2Loader で GPU 向けテクスチャへトランスコードする
 */
async function encodeAndTranscodeTexture(
  texture: Texture,
  compression: TextureCompressionOptions,
  ktx2Loader: KTX2Loader,
): Promise<Result<Texture, OptimizationError>> {
  const image = texture.image as
    | { width?: number; height?: number }
    | null
    | undefined

  const width = image?.width
  const height = image?.height
  if (!image || !width || !height) {
    return err({
      type: 'ASSET_ERROR' as const,
      message: `テクスチャ "${texture.name || 'unnamed'}" に有効な画像データまたはサイズがありません`,
    })
  }

  let rgbaData: Uint8Array
  try {
    rgbaData = await extractRgbaData(image)
  } catch (error) {
    return err({
      type: 'ASSET_ERROR' as const,
      message: `テクスチャ "${texture.name || 'unnamed'}" から RGBA データを抽出できません: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const expectedLength = width * height * 4
  if (rgbaData.length !== expectedLength) {
    return err({
      type: 'ASSET_ERROR' as const,
      message: `テクスチャ "${texture.name || 'unnamed'}" の画像データサイズが不正です: expected ${expectedLength}, got ${rgbaData.length}`,
    })
  }

  const compressResult = await compressToKtx2(rgbaData, width, height, {
    quality: compression.quality,
    compressionLevel: compression.compressionLevel,
    generateMipmaps: compression.generateMipmaps,
    supercompression: compression.supercompression,
    // KTX2 の DFD transferFunction を sRGB にするため colorSpace と一致させる
    srgb: texture.colorSpace === SRGBColorSpace,
  })

  if (compressResult.isErr()) {
    return err({
      type: 'INTERNAL_ERROR' as const,
      message: `テクスチャ "${texture.name || 'unnamed'}" の KTX2 圧縮に失敗しました: ${compressResult.error.message}`,
    })
  }

  // KTX2Loader.parse() は渡した ArrayBuffer を Worker へ transfer して detach するため、
  // キャッシュ保存用と parse 用で必ず独立したバッファを用意する
  const storedKtx2Bytes = new Uint8Array(compressResult.value.data)
  const parseBuffer = compressResult.value.data.slice().buffer

  let transcodedTexture: Texture
  try {
    transcodedTexture = await parseKtx2Texture(ktx2Loader, parseBuffer)
  } catch (error) {
    return err({
      type: 'INTERNAL_ERROR' as const,
      message: `テクスチャ "${texture.name || 'unnamed'}" の KTX2 トランスコードに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  // colorSpace / minFilter / magFilter は KTX2Loader が DFD とミップマップ数に応じて
  // 設定済みなので上書きしないこと
  transcodedTexture.name = texture.name
  transcodedTexture.flipY = false
  transcodedTexture.wrapS = RepeatWrapping
  transcodedTexture.wrapT = RepeatWrapping
  transcodedTexture.needsUpdate = true

  rememberKtx2Source(transcodedTexture, storedKtx2Bytes)

  return ok(transcodedTexture)
}

/**
 * マテリアルに割り当てられたアトラステクスチャを KTX2 形式へ圧縮し、
 * トランスコード済みの CompressedTexture へ差し替える
 *
 * @param materialInfos - 最適化対象のマテリアル情報配列
 * @param atlasMap - `generateAtlasImagesFromPatterns` が生成したアトラス画像マップ
 * @param options - 圧縮オプションおよび KTX2Loader
 * @returns 成功時は ok(undefined)、失敗時は OptimizationError
 */
export function compressAtlasTexturesToKtx2(
  materialInfos: MaterialInfo[],
  atlasMap: AtlasImageMap,
  options: {
    compression: TextureCompressionOptions
    ktx2Loader: KTX2Loader
  },
): ResultAsync<void, OptimizationError> {
  return safeTry(async function* () {
    const uniqueTextures = collectUniqueTargetTextures(materialInfos)
    const texturesToCompress: Array<{ key: string; texture: Texture }> = []

    for (const [key, texture] of uniqueTextures) {
      // 既に KTX2 バイナリが紐づいている場合は再圧縮しない
      if (getKtx2Source(texture)) {
        continue
      }

      // 元バイナリ不明の圧縮テクスチャは CPU から RGBA を読めないため失敗させる
      if (isCompressedTexture(texture)) {
        return err({
          type: 'ASSET_ERROR' as const,
          message: `圧縮テクスチャ "${texture.name || 'unnamed'}" は元の KTX2 バイナリが不明なため再圧縮できません`,
        })
      }

      texturesToCompress.push({ key, texture })
    }

    if (texturesToCompress.length === 0) {
      return ok(undefined)
    }

    const encoderInitResult = await initBasisEncoder()
    if (encoderInitResult.isErr()) {
      return err({
        type: 'INTERNAL_ERROR' as const,
        message: `Basis WASM 初期化に失敗: ${encoderInitResult.error.message}`,
      })
    }

    const createdTextures: Texture[] = []
    const replacements = new Map<string, Texture>()

    for (const { key, texture } of texturesToCompress) {
      const result = await encodeAndTranscodeTexture(
        texture,
        options.compression,
        options.ktx2Loader,
      )
      if (result.isErr()) {
        // 途中失敗時は生成済みの GPU テクスチャを解放してリークを防ぐ
        for (const created of createdTextures) {
          created.dispose()
        }
        return err(result.error)
      }

      createdTextures.push(result.value)
      replacements.set(key, result.value)
    }

    // 全テクスチャが揃ってからマテリアル上を差し替え、atlasMap 由来の旧 DataTexture のみ解放する
    const atlasTexturesSet = new Set<Texture>(Object.values(atlasMap))
    const disposedOriginals = new Set<Texture>()

    for (const info of materialInfos) {
      for (const slot of ATLASED_MATERIAL_SLOTS) {
        const current = getMaterialSlotTexture(info.material, slot)
        if (!current) continue

        const key = current.source?.uuid ?? current.uuid
        const replacement = replacements.get(key)
        if (!replacement) continue

        setMaterialSlotTexture(info.material, slot, replacement)

        if (atlasTexturesSet.has(current) && !disposedOriginals.has(current)) {
          current.dispose()
          disposedOriginals.add(current)
        }
      }
    }

    return ok(undefined)
  })
}

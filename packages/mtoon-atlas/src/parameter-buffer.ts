/**
 * MToon パラメータバッファ（UBO 向け）のバケット計算・変換ユーティリティ
 *
 * WebGPURenderer（WebGPU / WebGL2 バックエンド双方）で安全に使える
 * Uniform Buffer サイズ（WebGL2 最小保証 16KB）を基準に、スロット数を
 * 固定バケットへ丸めてパディング済み Float32Array を構築する。
 *
 * 固定バケット化することで、スロット数が近い別マテリアル・別アバター間で
 * シェーダーパイプラインキャッシュを共有できるようにする。
 */

import type { ParameterBufferDescriptor, ParameterTextureDescriptor } from './types'

/** WebGL2 の MAX_UNIFORM_BLOCK_SIZE 最小保証（16 KB） */
export const MAX_PARAMETER_UBO_BYTES = 16384

/** 既定の 1 スロットあたり vec4 数 */
export const DEFAULT_TEXELS_PER_SLOT = 9

/** 1 vec4 あたりのバイト数（float32 × 4） */
const BYTES_PER_VEC4 = 16

/**
 * UBO のスロット数バケット候補（昇順）
 *
 * 既定（9 vec4/slot = 144 bytes/slot）で最大 112 スロット = 16,128 bytes となり、
 * WebGL2 最小保証の 16,384 bytes に収まる。
 */
export const PARAMETER_UBO_BUCKET_SLOTS = [8, 16, 32, 64, 112] as const

/**
 * 指定された texelsPerSlot に対して UBO に収まる最大スロット数を返す
 *
 * @param texelsPerSlot - スロットあたりの vec4 数（既定 9）
 * @returns 最大スロット数
 */
export function getMaxParameterUBOSlots(texelsPerSlot: number = DEFAULT_TEXELS_PER_SLOT): number
{
  if (!Number.isInteger(texelsPerSlot) || texelsPerSlot <= 0)
  {
    throw new RangeError(`texelsPerSlot は正の整数である必要があります（受け取った値: ${texelsPerSlot}）`)
  }
  return Math.floor(MAX_PARAMETER_UBO_BYTES / (texelsPerSlot * BYTES_PER_VEC4))
}

/**
 * スロット数に対応する UBO バケットのスロット数を決定する
 *
 * WebGL2 最小 UBO サイズ上限（16 KB）を超える場合は RangeError を投げる。
 *
 * @param slotCount - 実際のスロット数
 * @param texelsPerSlot - スロットあたりの vec4 数（既定 9）
 * @returns バケットのスロット数
 */
export function resolveParameterBucketSlots(
  slotCount: number,
  texelsPerSlot: number = DEFAULT_TEXELS_PER_SLOT,
): number
{
  if (!Number.isInteger(slotCount) || slotCount < 0)
  {
    throw new RangeError(`slotCount は 0 以上の整数である必要があります（受け取った値: ${slotCount}）`)
  }

  const maxSlots = getMaxParameterUBOSlots(texelsPerSlot)
  if (slotCount > maxSlots)
  {
    throw new RangeError(
      `マテリアルスロット数 (${slotCount}) が UBO 上限 (${maxSlots} スロット / ${MAX_PARAMETER_UBO_BYTES} bytes, ` +
      `texelsPerSlot=${texelsPerSlot}) を超えています`,
    )
  }

  const effectiveSlots = Math.max(1, slotCount)
  for (const bucket of PARAMETER_UBO_BUCKET_SLOTS)
  {
    if (effectiveSlots <= bucket && bucket <= maxSlots)
    {
      return bucket
    }
  }
  return maxSlots
}

/**
 * 生パラメータデータをバケットサイズへゼロパディングした Float32Array を構築する
 *
 * @param data - 元のパラメータ配列（slotCount × texelsPerSlot × 4 以上）
 * @param slotCount - 実際のスロット数
 * @param texelsPerSlot - スロットあたりの vec4 数（既定 9）
 * @returns パディング済みバッファとバケットスロット数
 */
export function createPaddedParameterBuffer(
  data: Float32Array,
  slotCount: number,
  texelsPerSlot: number = DEFAULT_TEXELS_PER_SLOT,
): { buffer: Float32Array, bucketSlots: number }
{
  const bucketSlots = resolveParameterBucketSlots(slotCount, texelsPerSlot)
  const paddedLength = bucketSlots * texelsPerSlot * 4
  const buffer = new Float32Array(paddedLength)
  const copyLength = Math.min(data.length, slotCount * texelsPerSlot * 4, paddedLength)
  if (copyLength > 0)
  {
    buffer.set(data.subarray(0, copyLength), 0)
  }
  return { buffer, bucketSlots }
}

/**
 * 既存の ParameterTextureDescriptor から ParameterBufferDescriptor を抽出する（後方互換用）
 *
 * DataTexture の image.data から Float32Array を取り出す。
 * 既に Float32Array の場合はそのまま参照し、Uint8/Uint16 配列の場合は 0〜1 へ正規化する。
 *
 * @param descriptor - 従来のパラメータテクスチャディスクリプタ
 * @returns パラメータバッファディスクリプタ
 */
export function extractParameterBufferFromTexture(
  descriptor: ParameterTextureDescriptor,
): ParameterBufferDescriptor
{
  const { texture, slotCount, texelsPerSlot, semantics, atlasedTextures } = descriptor
  const expectedLength = Math.max(0, slotCount * texelsPerSlot * 4)
  const image = texture.image as { data?: ArrayLike<number> } | undefined
  const raw = image?.data

  let data: Float32Array
  if (raw instanceof Float32Array)
  {
    data = raw
  }
  else if (raw instanceof Uint16Array)
  {
    data = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++)
    {
      data[i] = raw[i] / 65535
    }
  }
  else if (raw instanceof Uint8Array || raw instanceof Uint8ClampedArray)
  {
    data = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++)
    {
      data[i] = raw[i] / 255
    }
  }
  else if (raw)
  {
    data = Float32Array.from(raw)
  }
  else
  {
    data = new Float32Array(expectedLength)
  }

  return {
    data,
    slotCount,
    texelsPerSlot,
    semantics,
    atlasedTextures,
  }
}

/**
 * KTX2 パススルーのテスト (GitHub Issue #39)
 *
 * KTX2 圧縮つきでエクスポートした VRM を読み込み直して再エクスポートすると、
 * CompressedTexture から RGBA を取り出せず
 * 「サポートされていない画像形式です」で必ず失敗していた。
 *
 * ロード時に記録した元 KTX2 バイナリをそのまま書き出すことで、
 * 再エンコードせずに再エクスポートできることを確認する。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompressedTexture, DataTexture, RGBAFormat, UnsignedByteType } from 'three'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'
import { getKtx2Source, rememberKtx2Source } from '../src/extensions/ktx2-source-cache'

function createMockWriter()
{
  return {
    json: {} as any,
    pending: [] as Promise<unknown>[],
    processAccessor: vi.fn(),
    processBufferViewImage: vi.fn().mockResolvedValue(7),
    nodeMap: new Map(),
  }
}

/** KTX2 のファイルアイデンティファイア（先頭 12 バイト）を持つダミーバイナリ */
function createDummyKtx2Binary(): Uint8Array
{
  const identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]
  return new Uint8Array([...identifier, 1, 2, 3, 4])
}

/** KTX2Loader が返すのと同じ形の CompressedTexture を作る */
function createCompressedTexture(name: string): CompressedTexture
{
  const mipmaps = [{ data: new Uint8Array(8), width: 4, height: 4 }]
  const texture = new CompressedTexture(mipmaps as any, 4, 4)
  texture.name = name
  return texture
}

/** jsdom の Blob には arrayBuffer() が無いため FileReader で読み出す */
function readBlob(blob: Blob): Promise<ArrayBuffer>
{
  return new Promise((resolve, reject) =>
  {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processTexture(plugin: MToonAtlasExporterPlugin, texture: any): Promise<number>
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (plugin as any).processTextureWithFallback(texture)
}

describe('KTX2 パススルー (Issue #39)', () =>
{
  let writer: ReturnType<typeof createMockWriter>
  let plugin: MToonAtlasExporterPlugin

  beforeEach(() =>
  {
    writer = createMockWriter()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin = new MToonAtlasExporterPlugin(writer as any)
  })

  describe('ktx2-source-cache', () =>
  {
    it('記録した KTX2 バイナリを取り出せる', () =>
    {
      const texture = createCompressedTexture('atlas')
      const data = createDummyKtx2Binary()

      rememberKtx2Source(texture, data)

      expect(getKtx2Source(texture)).toEqual(data)
    })

    it('clone したテクスチャからも元 KTX2 バイナリを引ける', () =>
    {
      // MToonAtlasLoaderPlugin は GLTFLoader のキャッシュを汚さないよう clone() する。
      // Texture.clone() は userData を JSON でディープコピーするため userData には
      // ArrayBuffer を載せられない。Source 共有をキーにしていることを確認する
      const texture = createCompressedTexture('atlas')
      const data = createDummyKtx2Binary()
      rememberKtx2Source(texture, data)

      const cloned = texture.clone()

      expect(getKtx2Source(cloned)).toEqual(data)
    })

    it('記録のないテクスチャでは undefined を返す', () =>
    {
      expect(getKtx2Source(createCompressedTexture('unknown'))).toBeUndefined()
    })
  })

  describe('processTextureWithFallback', () =>
  {
    it('KTX2 由来のテクスチャは再エンコードせず元バイナリをそのまま書き出す', async () =>
    {
      const texture = createCompressedTexture('atlasBaseColor')
      const data = createDummyKtx2Binary()
      rememberKtx2Source(texture, data)

      const textureIndex = await processTexture(plugin, texture)

      expect(textureIndex).toBe(0)
      expect(writer.processBufferViewImage).toHaveBeenCalledTimes(1)

      // 書き出された Blob が元バイナリと一致すること（再エンコードされていない）
      const blob = writer.processBufferViewImage.mock.calls[0][0] as Blob
      expect(blob.type).toBe('image/ktx2')
      expect(new Uint8Array(await readBlob(blob))).toEqual(data)
    })

    it('KTX2 パススルーでも glTF 定義が KHR_texture_basisu 付きで登録される', async () =>
    {
      const texture = createCompressedTexture('atlasBaseColor')
      rememberKtx2Source(texture, createDummyKtx2Binary())

      await processTexture(plugin, texture)

      expect(writer.json.images[0]).toMatchObject({
        name: 'atlasBaseColor',
        mimeType: 'image/ktx2',
        bufferView: 7,
      })
      expect(writer.json.textures[0]).toMatchObject({
        source: 0,
        extensions: { KHR_texture_basisu: { source: 0 } },
      })
      expect(writer.json.extensionsUsed).toContain('KHR_texture_basisu')
    })

    it('圧縮オプション未設定でも KTX2 由来ならパススルーされる（PNG 化を試みない）', async () =>
    {
      // 圧縮テクスチャは CPU から RGBA を読めないため PNG には変換できない。
      // 修正前はここで 1x1 プレースホルダ PNG に差し替わって無言で壊れていた
      const texture = createCompressedTexture('atlasNormal')
      const data = createDummyKtx2Binary()
      rememberKtx2Source(texture, data)

      await processTexture(plugin, texture)

      expect(writer.json.images[0].mimeType).toBe('image/ktx2')
      const blob = writer.processBufferViewImage.mock.calls[0][0] as Blob
      expect(new Uint8Array(await readBlob(blob))).toEqual(data)
    })

    it('元バイナリ不明の圧縮テクスチャは原因の分かるエラーで失敗する', async () =>
    {
      const texture = createCompressedTexture('foreignAtlas')

      await expect(processTexture(plugin, texture)).rejects.toThrow(
        /圧縮テクスチャ "foreignAtlas" は元の KTX2 バイナリが不明/
      )
      // プレースホルダを書き出して成功扱いにしていないこと
      expect(writer.processBufferViewImage).not.toHaveBeenCalled()
    })

    it('同じ画像ソースの clone は1回しか書き出さない', async () =>
    {
      // MToonAtlasLoaderPlugin はマテリアルごとに clone() するため、
      // texture.uuid でキャッシュすると同じアトラスがマテリアル数ぶん重複し、
      // 再エクスポートのたびにファイルサイズが膨らむ
      const texture = createCompressedTexture('atlasBaseColor')
      rememberKtx2Source(texture, createDummyKtx2Binary())

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withCache = (t: any) => (plugin as any).processTextureWithCache(t)
      const indices = await Promise.all([
        withCache(texture),
        withCache(texture.clone()),
        withCache(texture.clone()),
      ])

      expect(indices).toEqual([0, 0, 0])
      expect(writer.json.images).toHaveLength(1)
      expect(writer.processBufferViewImage).toHaveBeenCalledTimes(1)
    })

    it('非圧縮テクスチャは従来どおり PNG 経路で処理される', async () =>
    {
      const texture = new DataTexture(
        new Uint8Array([255, 0, 0, 255]),
        1,
        1,
        RGBAFormat,
        UnsignedByteType
      )
      texture.name = 'plain'

      await processTexture(plugin, texture)

      expect(writer.json.images[0].mimeType).toBe('image/png')
      expect(writer.json.textures[0].extensions).toBeUndefined()
    })
  })
})

/**
 * KTX2 由来テクスチャの元バイナリを保持するキャッシュ
 *
 * KTX2Loader が生成する CompressedTexture は image が
 * `{ width, height, depth }` + `mipmaps`（トランスコード済みブロック）という形で、
 * RGBA ピクセルを取り出す手段が CPU 側に存在しません。
 * そのため一度 KTX2 で読み込んだテクスチャは、そのままでは再エクスポートできません。
 *
 * ここでロード時の KTX2 バイナリを覚えておくことで、
 * エクスポート時に「再エンコードせず元バイナリをそのまま書き出す」
 * パススルーが可能になります。再エンコードによる画質劣化も避けられます。
 *
 * WeakMap のキーに `texture.source`（three.js の Source）を使う理由:
 * - `Texture.clone()` は userData を JSON でディープコピーするため、
 *   ArrayBuffer を userData に載せると空オブジェクトに潰れる
 * - `Source` はクローン間で共有されるため、clone 後も元バイナリを引ける
 */
import type { Source, Texture } from 'three'

const ktx2SourceByTextureSource = new WeakMap<Source<unknown>, Uint8Array>()

/**
 * テクスチャの元 KTX2 バイナリを記録する
 *
 * @param texture - KTX2 から生成されたテクスチャ
 * @param data - 元の KTX2 バイナリ
 */
export function rememberKtx2Source(
  texture: Texture,
  data: ArrayBuffer | Uint8Array
): void
{
  if (!texture.source)
  {
    return
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  ktx2SourceByTextureSource.set(texture.source, bytes)
}

/**
 * テクスチャに紐づく元 KTX2 バイナリを取得する
 *
 * @param texture - 対象テクスチャ（clone 済みでも可）
 * @returns 記録済みの KTX2 バイナリ。無い場合は undefined
 */
export function getKtx2Source(texture: Texture): Uint8Array | undefined
{
  if (!texture.source)
  {
    return undefined
  }

  return ktx2SourceByTextureSource.get(texture.source)
}

/**
 * テクスチャが CPU からピクセルを読めない圧縮テクスチャかどうかを判定する
 *
 * `instanceof CompressedTexture` は three のバンドル実体違いで不成立になり得るため、
 * three が付与するフラグを見るダックタイピングで判定する。
 *
 * @param texture - 対象テクスチャ
 */
export function isCompressedTexture(texture: Texture): boolean
{
  return (texture as unknown as { isCompressedTexture?: boolean })
    .isCompressedTexture === true
}

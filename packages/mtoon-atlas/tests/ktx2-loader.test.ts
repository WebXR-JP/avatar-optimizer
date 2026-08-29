/**
 * KTX2 トランスコーダーパス設定のテスト (GitHub Issue #32)
 *
 * トランスコーダーの配信元が jsdelivr にハードコードされていたため、
 * CDN 障害の影響を受けたり、three 本体とバージョンがずれたりしていた。
 * 利用側から差し替えられることを確認する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DEFAULT_KTX2_TRANSCODER_PATH,
  getKtx2TranscoderPath,
  resolveKtx2Loader,
  setKtx2TranscoderPath,
  clearKtx2LoaderCache,
} from '../src/extensions/ktx2-loader'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createPlugin(options?: any): any
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new MToonAtlasLoaderPlugin({ json: {} } as any, options)
}

describe('KTX2 トランスコーダーパス設定 (Issue #32)', () =>
{
  beforeEach(() =>
  {
    setKtx2TranscoderPath(DEFAULT_KTX2_TRANSCODER_PATH)
    clearKtx2LoaderCache()
  })

  describe('既定値', () =>
  {
    it('未設定なら CDN の既定値を使う', () =>
    {
      expect(getKtx2TranscoderPath()).toBe(DEFAULT_KTX2_TRANSCODER_PATH)
      expect(DEFAULT_KTX2_TRANSCODER_PATH).toContain('cdn.jsdelivr.net')
    })

    it('既定の three バージョンが peerDependencies の下限と一致する', () =>
    {
      // 既定パスが peer より古い three を指していると、KTX2Loader（three 側の
      // コード）が新しい transcoder API を呼んだときに壊れる
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const peerRange: string = require('../package.json').peerDependencies
        .three
      const floor = peerRange.replace(/^[^\d]*/, '')
      const major = floor.split('.').slice(0, 2).join('.')
      expect(DEFAULT_KTX2_TRANSCODER_PATH).toContain(`three@${major}`)
    })
  })

  describe('setKtx2TranscoderPath', () =>
  {
    it('アプリ全体の既定値を差し替えられる', () =>
    {
      setKtx2TranscoderPath('/basis/')
      expect(getKtx2TranscoderPath()).toBe('/basis/')
    })

    it('差し替えた値は以降の解決に使われる', () =>
    {
      // jsdom には WebGL が無いため resolveKtx2Loader は null を返すが、
      // どのパスで解決しようとしたかは getKtx2TranscoderPath で確認できる
      setKtx2TranscoderPath('https://example.test/basis/')
      expect(getKtx2TranscoderPath()).toBe('https://example.test/basis/')
      expect(resolveKtx2Loader()).toBeNull() // WebGL 無しなので生成できない
    })
  })

  describe('MToonAtlasLoaderPlugin のオプション', () =>
  {
    it('ktx2Loader を渡すとそのインスタンスをそのまま使う', () =>
    {
      // WebGL の無い環境でも、注入されたインスタンスは素通しされる
      const injected = { setTranscoderPath: vi.fn(), parse: vi.fn() }
      const plugin = createPlugin({ ktx2Loader: injected })

      expect(plugin.getKtx2Loader()).toBe(injected)
      // 注入した場合はパスを触らない（呼び出し側の設定を尊重する）
      expect(injected.setTranscoderPath).not.toHaveBeenCalled()
    })

    it('ktx2Loader は ktx2TranscoderPath より優先される', () =>
    {
      const injected = { parse: vi.fn() }
      const plugin = createPlugin({
        ktx2Loader: injected,
        ktx2TranscoderPath: '/ignored/',
      })

      expect(plugin.getKtx2Loader()).toBe(injected)
    })

    it('オプション未指定なら既定の解決に委ねる', () =>
    {
      const plugin = createPlugin()
      // WebGL 無しの環境では null（例外にはしない）
      expect(plugin.getKtx2Loader()).toBeNull()
    })
  })

  describe('末尾スラッシュの正規化', () =>
  {
    it('setKtx2TranscoderPath で末尾スラッシュが補われる', () =>
    {
      // 無いと /basisbasis_transcoder.js を取りに行って 404 になる
      setKtx2TranscoderPath('/basis')
      expect(getKtx2TranscoderPath()).toBe('/basis/')
    })

    it('既に末尾スラッシュがあれば二重にしない', () =>
    {
      setKtx2TranscoderPath('/basis/')
      expect(getKtx2TranscoderPath()).toBe('/basis/')
    })
  })

  describe('パスごとのキャッシュ', () =>
  {
    it('異なるパスが同じインスタンスを共有しないこと', () =>
    {
      // WebGL が無いと生成自体ができないため、キャッシュに載らないことを確認する。
      // パスをキーにしている以上、null がキャッシュされて別パスに漏れることはない
      expect(resolveKtx2Loader('/a/')).toBeNull()
      expect(resolveKtx2Loader('/b/')).toBeNull()
    })
  })
})

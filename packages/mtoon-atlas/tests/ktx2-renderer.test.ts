/**
 * KTX2 の対応形式を描画用レンダラーで判定するテスト
 *
 * 既定では一時 WebGLRenderer で判定するが、WebGPURenderer で描画するアプリでは
 * WebGL と WebGPU で使える圧縮形式が異なりうる。描画に使うレンダラーを渡すと
 * そのレンダラーで判定されること、判定できない場合に安全に戻ることを確認する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearKtx2LoaderCache,
  getKtx2Renderer,
  resolveKtx2Loader,
  setKtx2Renderer,
  type Ktx2SupportRenderer,
} from '../src/extensions/ktx2-loader'
import { MToonAtlasLoaderPlugin } from '../src/extensions/MToonAtlasLoaderPlugin'

interface WorkerConfig
{
  astcSupported: boolean
  bptcSupported: boolean
  etc2Supported: boolean
  dxtSupported: boolean
}

/**
 * WebGPURenderer の代わりに使う最小限のオブジェクト
 * （KTX2Loader.detectSupport は isWebGPURenderer と hasFeature だけを見る）
 */
function createWebGPURenderer(features: string[]): Ktx2SupportRenderer
{
  return {
    isWebGPURenderer: true,
    hasFeature: (name: string) => features.includes(name),
  } as unknown as Ktx2SupportRenderer
}

function workerConfigOf(loader: unknown): WorkerConfig
{
  return (loader as { workerConfig: WorkerConfig }).workerConfig
}

describe('KTX2 の対応形式をレンダラーで判定する', () =>
{
  beforeEach(() =>
  {
    setKtx2Renderer(null)
    clearKtx2LoaderCache()
  })

  it('setKtx2Renderer で設定したレンダラーを取得できる', () =>
  {
    expect(getKtx2Renderer()).toBeNull()
    const renderer = createWebGPURenderer([])
    setKtx2Renderer(renderer)
    expect(getKtx2Renderer()).toBe(renderer)
  })

  it('setKtx2Renderer のレンダラーの機能で対応形式を判定する', () =>
  {
    setKtx2Renderer(createWebGPURenderer(['texture-compression-bc']))

    const loader = resolveKtx2Loader('/basis/')
    expect(loader).not.toBeNull()
    expect(workerConfigOf(loader)).toMatchObject({
      bptcSupported: true,
      astcSupported: false,
      etc2Supported: false,
    })
  })

  it('引数のレンダラーは setKtx2Renderer より優先される', () =>
  {
    setKtx2Renderer(createWebGPURenderer(['texture-compression-bc']))

    const loader = resolveKtx2Loader('/basis/', createWebGPURenderer(['texture-compression-astc']))
    expect(workerConfigOf(loader)).toMatchObject({ astcSupported: true, bptcSupported: false })
  })

  it('同じレンダラー・同じパスではローダーを使い回し、レンダラーが違えば分ける', () =>
  {
    const a = createWebGPURenderer(['texture-compression-bc'])
    const b = createWebGPURenderer(['texture-compression-etc2'])

    expect(resolveKtx2Loader('/basis/', a)).toBe(resolveKtx2Loader('/basis', a))
    expect(resolveKtx2Loader('/basis/', a)).not.toBe(resolveKtx2Loader('/basis/', b))
    expect(resolveKtx2Loader('/basis/', a)).not.toBe(resolveKtx2Loader('/other/', a))
  })

  it('判定に失敗したら警告して従来の判定に戻す（init() 前の WebGPURenderer など）', () =>
  {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const uninitialized = {
      isWebGPURenderer: true,
      hasFeature: () =>
      {
        throw new Error('Renderer: .hasFeature() called before the backend is initialized.')
      },
    } as unknown as Ktx2SupportRenderer

    // テスト環境には WebGL が無いため、従来の判定に戻った結果は null になる
    expect(resolveKtx2Loader('/basis/', uninitialized)).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('clearKtx2LoaderCache でレンダラー別のローダーも破棄される', () =>
  {
    const renderer = createWebGPURenderer(['texture-compression-bc'])
    const loader = resolveKtx2Loader('/basis/', renderer)!
    const dispose = vi.spyOn(loader, 'dispose')

    clearKtx2LoaderCache()

    expect(dispose).toHaveBeenCalled()
    expect(resolveKtx2Loader('/basis/', renderer)).not.toBe(loader)
  })

  it('MToonAtlasLoaderPlugin の ktx2Renderer オプションで判定に使うレンダラーを渡せる', () =>
  {
    const renderer = createWebGPURenderer(['texture-compression-astc'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugin = new MToonAtlasLoaderPlugin({ json: {} } as any, { ktx2Renderer: renderer }) as any

    const loader = plugin.getKtx2Loader()
    expect(loader).toBe(resolveKtx2Loader(undefined, renderer))
    expect(workerConfigOf(loader)).toMatchObject({ astcSupported: true })
  })
})

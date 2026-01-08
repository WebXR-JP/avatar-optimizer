import { useCallback, useRef, useEffect, useState } from 'react'

/**
 * Spector.jsを使用したWebGLデバッグフック
 * 開発環境でのみSpectorをロードし、フレームキャプチャ機能を提供
 *
 * @param canvas - WebGLコンテキストを持つcanvas要素
 * @returns captureFrame: フレームキャプチャ関数, isReady: Spector準備完了フラグ
 */
export function useSpector(canvas: HTMLCanvasElement | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spectorRef = useRef<any>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // 本番環境ではSpectorをロードしない
    if (!canvas || import.meta.env.PROD) return

    let disposed = false

    // 動的インポートでSpectorを遅延ロード
    import('spectorjs').then(({ Spector }) => {
      if (disposed) return
      const spector = new Spector()
      // 全てのcanvasをスパイ対象にする
      spector.spyCanvases()
      spectorRef.current = spector
      setIsReady(true)
    })

    return () => {
      disposed = true
      spectorRef.current = null
      setIsReady(false)
    }
  }, [canvas])

  const captureFrame = useCallback(() => {
    if (!canvas || !spectorRef.current) return
    // 次のフレームをキャプチャしてSpector UIを表示
    spectorRef.current.captureNextFrame(canvas)
  }, [canvas])

  const displayUI = useCallback(() => {
    if (!spectorRef.current) return
    // Spector UIを表示（キャプチャなしでUIだけ表示）
    spectorRef.current.displayUI()
  }, [])

  return { captureFrame, displayUI, isReady }
}

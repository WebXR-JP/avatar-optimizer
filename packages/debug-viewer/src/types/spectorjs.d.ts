/**
 * Spector.js 型定義
 * @see https://github.com/BabylonJS/Spector.js
 */
declare module 'spectorjs' {
  export class Spector {
    /**
     * 全てのcanvas要素をスパイ対象にする
     */
    spyCanvases(): void

    /**
     * 次のフレームをキャプチャしてSpector UIを表示
     * @param canvas - キャプチャ対象のcanvas要素
     */
    captureNextFrame(canvas: HTMLCanvasElement): void

    /**
     * キャプチャを開始
     * @param canvas - キャプチャ対象のcanvas要素
     * @param commandCount - キャプチャするコマンド数
     * @param quickCapture - クイックキャプチャモード
     */
    captureCanvas(
      canvas: HTMLCanvasElement,
      commandCount?: number,
      quickCapture?: boolean
    ): void

    /**
     * Spector UIを表示
     */
    displayUI(): void

    /**
     * Spectorを破棄
     */
    dispose(): void
  }
}

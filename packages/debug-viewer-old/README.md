# @xrift/avatar-optimizer-debug-viewer

VRM モデル表示用のシンプルなデバッグビューアライブラリです。Three.js と @pixiv/three-vrm を使用して、VRM モデルをリアルタイムで表示できます。

## 特徴

- ✨ **軽量**: 最小限の実装でVRM表示を実現
- 🎨 **Three.js ベース**: 標準的な WebGL レンダリング
- 📦 **ESM/CJS**: ブラウザとNode.js環境に対応
- 🔧 **Result 型**: neverthrow によるエラーハンドリング

## インストール

```bash
pnpm add @xrift/avatar-optimizer-debug-viewer
```

ピア依存関係をインストール:

```bash
pnpm add three @pixiv/three-vrm
```

## 基本的な使用方法

### ブラウザでの使用

```typescript
import { VRMViewer } from '@xrift/avatar-optimizer-debug-viewer'

// ビューア初期化
const viewer = new VRMViewer({
  container: document.getElementById('canvas-container'),
  width: 800,
  height: 600,
})

// VRM ファイルをロード
const result = await viewer.loadVRM('/models/avatar.vrm')

if (result.isErr()) {
  console.error(`Failed to load VRM: ${result.error.message}`)
} else {
  console.log('VRM loaded successfully')
}

// クリーンアップ
viewer.dispose()
```

### File オブジェクトからのロード

```typescript
const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')

fileInput?.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const result = await viewer.loadVRMFile(file)

  if (result.isErr()) {
    console.error('Failed to load:', result.error.message)
  }
})
```

### ウィンドウリサイズへの対応

```typescript
window.addEventListener('resize', () => {
  viewer.resize(window.innerWidth, window.innerHeight)
})
```

## API リファレンス

### VRMViewer クラス

#### コンストラクタ

```typescript
new VRMViewer(options: VRMViewerOptions)
```

#### メソッド

- `loadVRM(url: string): ResultAsync<void, ViewerError>`
  - URL から VRM を読み込み

- `loadVRMFile(file: File): ResultAsync<void, ViewerError>`
  - File オブジェクトから VRM を読み込み

- `resize(width: number, height: number): void`
  - ビューアをリサイズ

- `dispose(): void`
  - ビューアをクリーンアップ

- `getState(): Readonly<VRMViewerState>`
  - 内部状態を取得（デバッグ用）

### ユーティリティ関数

```typescript
// VRM ローダー
loadVRM(url: string): ResultAsync<VRM, ViewerError>
loadVRMFromFile(file: File): ResultAsync<VRM, ViewerError>

// シーン操作
setupScene(options: VRMViewerOptions): VRMViewerState
resizeRenderer(state: VRMViewerState, width: number, height: number): void
disposeScene(state: VRMViewerState): void
```

## 開発

### ビルド

```bash
pnpm -F debug-viewer run build
```

### 開発モード（ウォッチ）

```bash
pnpm -F debug-viewer run dev
```

### テスト

```bash
pnpm -F debug-viewer run test
```

### 手動確認

```bash
pnpm -F debug-viewer run manual-viewer
```

## ライセンス

MIT

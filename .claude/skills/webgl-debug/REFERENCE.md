# WebGL Debug リファレンス

## 使用可能な API

### window.__spector (Spector.js インスタンス)

```javascript
// フレームキャプチャ実行（結果は自動的にコンソールに出力される）
window.__spector.captureNextFrame(document.querySelector('canvas'))

// または startCapture で詳細制御
window.__spector.startCapture(document.querySelector('canvas'), 1)
```

### コンソール出力形式

キャプチャ完了時、以下の形式でコンソールに出力される：

```
[SpectorCapture:Start] Capture started
[SpectorCapture:Summary] { drawCalls, bindTextures, bindPrograms, totalCommands }
[SpectorCapture:Commands] [ ...最初の50コマンド... ]
```

### 既存の WebGL デバッグ出力

```
[WebGLDebug:TextureList] Found N textures
[WebGLDebug:TextureList] [ { name, uuid, size }, ... ]
[WebGLDebug:Base64] data:image/png;base64,...
[WebGLDebug:Info] { ...WebGL情報... }
```

## ワークフロー例

### 1. 基本的なキャプチャ

```
1. browser_navigate({ url: "http://localhost:5173/" })
2. browser_wait_for({ text: "VRM loaded" })
3. browser_evaluate({
     function: "() => { window.__spector.captureNextFrame(document.querySelector('canvas')); return 'capture started'; }"
   })
4. browser_wait_for({ time: 2 })
5. browser_console_messages({ level: "debug" })
   → [SpectorCapture:Summary] と [SpectorCapture:Commands] を確認
```

### 2. テクスチャ一覧取得

```
1. browser_snapshot() でボタンの ref を確認
2. browser_click({ element: "List Tex button", ref: "確認したref" })
3. browser_console_messages({ level: "debug" })
   → [WebGLDebug:TextureList] を確認
```

### 3. フレームバッファ取得

```
1. browser_snapshot() でボタンの ref を確認
2. browser_click({ element: "Dump FB button", ref: "確認したref" })
3. browser_console_messages({ level: "debug" })
   → [WebGLDebug:Base64] から画像データを取得
```

### 4. スクリーンショット取得

```
browser_take_screenshot({ filename: "debug-capture.png" })
```

## デバッグ対象

- **ドローコール**: どのメッシュがどの順序で描画されているか
- **テクスチャバインド**: どのテクスチャがどのユニットにバインドされているか
- **シェーダープログラム**: 使用されているプログラムの切り替え
- **ステート変更**: blend, depth, stencil などの状態変更

## トラブルシューティング

### window.__spector が undefined
- 開発環境でのみ利用可能（本番ビルドでは無効）
- ページリロード後、Spector 初期化完了まで待機が必要
- `browser_wait_for({ time: 3 })` で待機してから再試行

### キャプチャ結果が空
- アニメーションループが動作していることを確認
- canvas 要素が正しく取得できているか確認

### ブラウザが起動しない
- `browser_install()` でブラウザをインストール

## 関連ファイル

- `packages/debug-viewer/src/hooks/useSpector.ts` - Spector.js 統合
- `packages/debug-viewer/src/hooks/useWebGLDebug.ts` - デバッグユーティリティ
- `packages/debug-viewer/src/types/spectorjs.d.ts` - 型定義

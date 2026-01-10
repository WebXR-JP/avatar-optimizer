# debug-viewer CLAUDE.md

## WebGLデバッグ機能（PlaywrightMCP連携）

debug-viewerには、Claude CodeからPlaywrightMCP経由でWebGLの内部状態を確認できるデバッグ機能が実装されています。

### Spector.js スクリプトアクセス

開発環境では `window.__spector` に Spector.js インスタンスが公開されます。

```javascript
// Playwright MCP から直接キャプチャ実行
window.__spector.captureNextFrame(document.querySelector('canvas'))

// 結果は自動的にコンソールに出力される:
// [SpectorCapture:Summary] { drawCalls, bindTextures, bindPrograms, totalCommands }
// [SpectorCapture:Commands] [ ...最初の50コマンド... ]
```

### 利用可能なボタン

デバッグパネル（右下）に以下のボタンがあります：

| ボタン | 機能 | 出力形式 |
|--------|------|----------|
| **Capture Frame** | Spector.jsでフレームキャプチャ | Spector UI表示 + コンソール出力 |
| **Spector UI** | Spector.js UIを表示 | オーバーレイUI |
| **List Tex** | シーン内のテクスチャ一覧 | JSON |
| **Dump Tex** | 最初のテクスチャをBase64出力 | Base64 PNG |
| **Dump FB** | フレームバッファをBase64出力 | Base64 PNG |
| **GL Info** | WebGL情報を出力 | JSON |

### PlaywrightMCPでの使用例

#### 基本的なフレームキャプチャ

```typescript
// 1. debug-viewerを開く
browser_navigate({ url: "http://localhost:5173/" })

// 2. VRMロード完了を待つ
browser_wait_for({ text: "VRM loaded" })

// 3. Spector.js でフレームキャプチャ（スクリプト経由）
browser_evaluate({
  function: "() => { window.__spector.captureNextFrame(document.querySelector('canvas')); return 'capture started'; }"
})

// 4. キャプチャ完了を待つ
browser_wait_for({ time: 2 })

// 5. コンソールからキャプチャ結果を取得
browser_console_messages({ level: "debug" })
// → [SpectorCapture:Summary] と [SpectorCapture:Commands] を確認
```

#### テクスチャ一覧取得

```typescript
// 1. ボタンクリック
browser_click({ element: "List Tex button", ref: "e61" })

// 2. コンソールからデータ取得
browser_console_messages({ level: "debug" })
// → [WebGLDebug:TextureList] のログにJSON形式でテクスチャ情報
```

#### フレームバッファ取得

```typescript
// 1. ボタンクリック
browser_click({ element: "Dump FB button", ref: "e63" })

// 2. コンソールからデータ取得
browser_console_messages({ level: "debug" })
// → [WebGLDebug:Base64] のログにdata:image/png;base64,...形式で画像データ
```

### コンソールログのフォーマット

#### Spector.js キャプチャ結果
```
[SpectorCapture:Start] Capture completed
[SpectorCapture:Summary] {"drawCalls":5,"bindTextures":12,"bindPrograms":3,"totalCommands":150}
[SpectorCapture:Commands] [{"name":"bindTexture","args":[...]}, ...]
```

#### WebGL デバッグ出力
```
[WebGLDebug:TextureList] Found N textures
[WebGLDebug:TextureList] [...JSON配列...]

[WebGLDebug:Texture] ラベル名
[WebGLDebug:Base64] data:image/png;base64,...
[WebGLDebug:Size] 幅x高さ

[WebGLDebug:Framebuffer] ラベル名
[WebGLDebug:Base64] data:image/png;base64,...
[WebGLDebug:Size] 幅x高さ

[WebGLDebug:Info] {...WebGL情報JSON...}
```

### 関連ファイル

- `src/hooks/useSpector.ts` - Spector.js統合フック（window.__spector 公開）
- `src/hooks/useWebGLDebug.ts` - WebGLデバッグユーティリティ
- `src/types/spectorjs.d.ts` - Spector.js型定義

# debug-viewer CLAUDE.md

## WebGLデバッグ機能（PlaywrightMCP連携）

debug-viewerには、Claude CodeからPlaywrightMCP経由でWebGLの内部状態を確認できるデバッグ機能が実装されています。

### 利用可能なボタン

デバッグパネル（右下）に以下のボタンがあります：

| ボタン | 機能 | 出力形式 |
|--------|------|----------|
| **Capture Frame** | Spector.jsでフレームキャプチャ | Spector UI表示 |
| **Spector UI** | Spector.js UIを表示 | オーバーレイUI |
| **List Tex** | シーン内のテクスチャ一覧 | JSON |
| **Dump Tex** | 最初のテクスチャをBase64出力 | Base64 PNG |
| **Dump FB** | フレームバッファをBase64出力 | Base64 PNG |
| **GL Info** | WebGL情報を出力 | JSON |

### PlaywrightMCPでの使用例

```typescript
// 1. debug-viewerを開く
browser_navigate({ url: "http://localhost:5173/" })

// 2. VRMロード完了を待つ
browser_wait_for({ text: "VRM loaded" })

// 3. テクスチャ一覧を取得
browser_click({ element: "List Tex button", ref: "e61" })

// 4. コンソールからデータ取得
browser_console_messages({ level: "debug" })
// → [WebGLDebug:TextureList] のログにJSON形式でテクスチャ情報

// 5. フレームバッファをBase64で取得
browser_click({ element: "Dump FB button", ref: "e63" })
browser_console_messages({ level: "debug" })
// → [WebGLDebug:Base64] のログにdata:image/png;base64,...形式で画像データ
```

### コンソールログのフォーマット

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

- `src/hooks/useSpector.ts` - Spector.js統合フック
- `src/hooks/useWebGLDebug.ts` - WebGLデバッグユーティリティ
- `src/types/spectorjs.d.ts` - Spector.js型定義

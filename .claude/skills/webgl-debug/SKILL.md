---
name: webgl-debug
description: WebGL デバッグと GPU トレース取得。テクスチャ問題、描画異常、シェーダーバグの調査時に使用
allowed-tools: mcp__playwright__*, Bash(pnpm:*)
---

# WebGL Debug Skill

Playwright MCP と Spector.js を使った WebGL デバッグワークフロー。
debug-viewer で VRM の描画問題を調査する際に自動的に使用される。

## 起動条件

以下のような問題が報告されたときに使用:
- テクスチャが正しく表示されない
- 描画が黒い/白い/おかしい
- シェーダーエラー
- GPU パフォーマンス問題

## クイックスタート

```bash
# 1. debug-viewer が起動しているか確認
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null || echo "not running"
# → 200 なら起動済み、それ以外なら以下で起動

# 2. debug-viewer 起動（未起動の場合、別ターミナルで）
pnpm -F debug-viewer run dev
```

```javascript
// 2. Playwright MCP でブラウザ操作
browser_navigate({ url: "http://localhost:5173/" })
browser_wait_for({ text: "VRM loaded" })

// 3. フレームキャプチャ
browser_evaluate({
  function: "() => { window.__spector.captureNextFrame(document.querySelector('canvas')); return 'started'; }"
})
browser_wait_for({ time: 2 })

// 4. 結果取得
browser_console_messages({ level: "debug" })
```

## 詳細は REFERENCE.md を参照

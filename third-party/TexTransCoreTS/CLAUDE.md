# TexTransCoreTS

**TexTransCoreTS** は、C# で実装された [TexTransCore](../TexTransCore/) テクスチャ処理ライブラリを TypeScript に移植したものです。WebXR/VRM 最適化向けに必要最低限の機能を実装することを目指しています。

## プロジェクト概要

### 目的

- TexTransCore の主要機能（テクスチャアトラス化、圧縮など）を TypeScript で実装
- ブラウザ環境で動作するテクスチャ処理パイプラインを提供
- @xrift/vrm-optimizer に統合して、VRM モデルの最適化を強化

### スタック

- **TypeScript** (5.0+): 型安全な実装
- **Canvas API / OffscreenCanvas**: 画像処理（ブラウザ環境）
- **Node.js Buffer / sharp** (オプション): Node.js 環境での高速処理

### ディレクトリ構成

```
TexTransCoreTS/
├── CLAUDE.md                 # このファイル
├── package.json              # 依存関係管理
├── tsconfig.json             # TypeScript 設定
├── src/
│   ├── index.ts              # メインエントリーポイント
│   ├── types.ts              # 型定義集約
│   ├── atlas/
│   │   ├── atlasTexture.ts   # テクスチャアトラス化
│   │   └── packer.ts         # レイアウトアルゴリズム（bin packing）
│   ├── compression/
│   │   ├── compress.ts       # テクスチャ圧縮（WebP, AVIF）
│   │   └── formatter.ts      # フォーマット変換
│   └── utils/
│       ├── canvas.ts         # Canvas 操作ユーティリティ
│       └── image.ts          # 画像処理ヘルパー
├── __tests__/
│   ├── fixtures/             # テスト用画像サンプル
│   ├── atlas.test.ts         # アトラス化テスト
│   └── compression.test.ts   # 圧縮テスト
└── dist/                      # ビルド出力
```

## 開発ロードマップ

### MVP: テクスチャアトラス化実装

**目標**: テクスチャアトラス化とそれに伴うモデル編集機能のみを実装

- [ ] プロジェクト構造・パッケージング設定
- [ ] 型定義（AtlasInfo, TextureRegion, など）
- [ ] Canvas ベースの画像処理ユーティリティ
- [ ] Bin packing アルゴリズム（簡易版）
- [ ] テクスチャアトラス化の基本実装
- [ ] UV 座標再マッピング
- [ ] glTF-Transform による モデル編集統合
- [ ] ユニットテスト + 手動確認スクリプト

**注**: テクスチャ圧縮やその他の処理は @xrift/vrm-optimizer の責務として分離

## 開発コマンド

```bash
# 依存関係インストール（npm workspace 経由）
npm install -w third-party/TexTransCoreTS

# TypeScript コンパイル
npm run build -w third-party/TexTransCoreTS

# ウォッチモード
npm run dev -w third-party/TexTransCoreTS

# テスト実行
npm test -w third-party/TexTransCoreTS

# 手動テスト（開発確認用）
npx tsx third-party/TexTransCoreTS/__tests__/manual/atlas.manual.ts
```

## API 設計

### テクスチャアトラス化とモデル編集

```typescript
import { atlasTexturesInDocument } from '@xrift/textranscore-ts'
import { Document } from '@gltf-transform/core'

// glTF-Transform ドキュメント内のテクスチャをアトラス化
const result = await atlasTexturesInDocument(document, {
  maxSize: 2048,
  padding: 4,
})

if (result.isErr()) {
  console.error(`Atlas failed: ${result.error.message}`)
  return
}

const { document: atlasedDoc, mapping } = result.value

// document には以下の変更が加えられている:
// - テクスチャが結合されたアトラスに置き換わる
// - プリミティブの UV 座標が新しいアトラス座標に再マッピングされる
// - 不要なテクスチャ参照が削除される
```

### 低レベル API（必要に応じて）

```typescript
import { packTextures, createAtlasCanvas } from '@xrift/textranscore-ts'

// テクスチャ画像データを渡して、アトラス化のみ行う
const packing = await packTextures(
  [
    { width: 512, height: 512, data: imageData1 },
    { width: 256, height: 256, data: imageData2 },
  ],
  { maxSize: 2048, padding: 4 },
)

// アトラス Canvas から Uint8Array を取得
const atlasImageData = await createAtlasCanvas(packing).then((canvas) =>
  canvas.toDataURL('image/png'),
)
```

## 重要な開発ルール

### テスト駆動開発

重要なロジック（Bin packing、UV マッピング計算）はテストでカバレッジを確保。

```typescript
// __tests__/packer.test.ts
describe('BinPacker', () => {
  it('should pack rectangles efficiently', () => {
    const packer = new BinPacker(2048, 2048)
    const rects = [
      { width: 512, height: 512 },
      { width: 256, height: 256 },
    ]
    const result = packer.pack(rects)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ x: 0, y: 0, width: 512, height: 512 })
  })
})
```

### ブラウザ互換性

Canvas API を使用して、ブラウザとノード環境の両方で動作するよう設計：

```typescript
// utils/canvas.ts
export function createCanvas(width: number, height: number): Canvas {
  // ブラウザ環境
  if (typeof document !== 'undefined') {
    return document.createElement('canvas')
  }
  // Node.js 環境
  return new Canvas(width, height)
}
```

### エラーハンドリング（neverthrow）

すべての非同期関数は `ResultAsync` を返す：

```typescript
import { ResultAsync } from 'neverthrow'

export function atlasTextures(
  textures: TextureInput[],
  options: AtlasOptions,
): ResultAsync<AtlasResult, AtlasError> {
  // 実装
}
```

### 型定義の集約

`src/types.ts` にすべての型定義をまとめて管理。

## C# オリジナルからの機能移植

本ライブラリは **テクスチャアトラス化のみ** を実装します：

| 機能 | C# クラス | TS 実装 | 状態 |
| --- | --- | --- | --- |
| テクスチャアトラス化 | `AtlasTexture` | `atlasTexturesInDocument()` | ✅ 必須 |
| Bin Packing | `MaxRectsBinPack` | `BinPacker` | ✅ 必須 |
| UV 座標再マッピング | `AtlasTexture` | `remapUVs()` | ✅ 必須 |

以下の機能は **実装しない**（@xrift/vrm-optimizer の責務）：

- テクスチャ圧縮 (TextureCompressor)
- フォーマット変換 (TextureFormatter)
- ノーマルマップ処理 (NormalMapProcessor)

## 参考情報

- **C# オリジナル**: `../TexTransCore/`
  - `AtlasTexture.cs`: アトラス化ロジック
  - `MaxRectsBinPack.cs`: レイアウトアルゴリズム
  - `TextureCompressor.cs`: 圧縮処理

## 手動確認フロー

視覚的な確認が必要な処理（アトラス化、圧縮品質）は `__tests__/manual/` に確認スクリプトを配置：

```bash
# 手動テスト実行
npx tsx __tests__/manual/atlas.manual.ts

# 出力: __tests__/output/atlas-result.png
# 確認: ビューアで視覚的に検証
```

## トラブルシューティング

### Canvas API が利用できない

Node.js 環境で Canvas API を使用する場合、`canvas` パッケージをインストール：

```bash
npm install canvas
```

### メモリ不足エラー

大きなテクスチャ処理時は、最大アトラスサイズを削減：

```typescript
const result = await atlasTextures(textures, {
  maxSize: 1024, // 2048 から削減
})
```

## 今後の検討事項

将来的な最適化の可能性：

- WASM による高速化（C# オリジナルとの性能比較）
- GPU 処理（WebGL/WebGPU）対応
- より高度な Bin packing アルゴリズム（Guillotine など）

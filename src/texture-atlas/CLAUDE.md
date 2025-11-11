# texture-atlas

**texture-atlas** は、ブラウザと Node.js 環境の両方で動作するテクスチャアトラス化ライブラリです。

## プロジェクト概要

### 目的

- ブラウザとNode.js両環境で動作するテクスチャアトラス化
- @xrift/vrm-optimizer に組み込むための軽量な実装
- テクスチャアトラス化とそれに伴うモデル UV 再マッピングのみに特化

### 主要機能

- **Bin Packing** (`MaxRects` アルゴリズム): 効率的なテクスチャレイアウト計算
- **テクスチャアトラス化**: 複数のテクスチャを1つのアトラスに統合
- **UV 座標再マッピング**: glTF-Transform ドキュメント内のプリミティティブ UV を更新
- **テクスチャダウンスケーリング**: アトラス化時にテクスチャサイズを調整

### スタック

- **TypeScript** (5.0+): 型安全な実装
- **@gltf-transform/core** (4.0+): glTF ドキュメント操作
- **neverthrow**: 6.0+ (Result 型によるエラーハンドリング)
- **tsup**: 8.0+ (ビルドツール)

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
│   │   ├── draw-image.ts     # Canvas への描画処理
│   │   ├── packing.ts        # レイアウトアルゴリズム（bin packing）
│   │   ├── process-gltf-atlas.ts # glTF ドキュメントのアトラス処理
│   │   └── uv-remapping.ts   # UV 座標再マッピング
│   └── utils/
│       └── canvas.ts         # Canvas 操作ユーティリティ
├── __tests__/
│   ├── draw-image.test.ts    # draw-image のユニットテスト
│   ├── integration.test.ts   # 統合テスト
│   ├── packing.test.ts       # packing アルゴリズムのユニットテスト
│   ├── uv-remapping.test.ts  # UV 再マッピングのユニットテスト
│   ├── fixtures/             # テスト用画像サンプル
│   ├── manual/               # 手動確認用スクリプト
│   │   └── atlas.manual.ts   # アトラス化の手動確認
│   └── output/               # 手動確認スクリプトの出力
└── dist/                      # ビルド出力
```

## 開発コマンド

TexTransCoreTS は **pnpm workspace** として管理されているため、ルートディレクトリから操作できます：

```bash
# TexTransCoreTS のみをビルド
pnpm -F textranscore-ts run build

# テスト実行
pnpm -F textranscore-ts run test

# 開発モード（ウォッチ）
pnpm -F textranscore-ts run dev

# 型チェック
pnpm -F textranscore-ts run type-check

# 特定のワークスペースディレクトリで作業する場合
cd third-party/TexTransCoreTS
pnpm run build  # ローカルスクリプトを実行
pnpm test       # 短縮形
```

## API 概要

```typescript
import { atlasTexturesInDocument } from '@xrift/textranscore-ts'
import { createCanvas } from 'canvas' // Node.js 環境の場合

// glTF-Transform ドキュメント内のテクスチャをアトラス化
const result = await atlasTexturesInDocument(
  document,
  { maxSize: 2048, padding: 4, textureScale: 0.5 }, // textureScale オプションを追加
  createCanvas // Canvas ファクトリ関数を注入
)

if (result.isErr()) {
  console.error(`Error: ${result.error.message}`)
}
const { document: atlasedDoc, mapping } = result.value
```

## 重要な開発ルール

### テスト駆動開発

重要なロジック（Bin packing、UV マッピング計算）はテストでカバレッジを確保。

```typescript
// __tests__/packing.test.ts
describe('MaxRects Bin Packing', () => {
  it('should pack rectangles efficiently', () => {
    // ... テスト実装 ...
  })
})
```

### ブラウザ互換性

Canvas API を使用して、ブラウザとノード環境の両方で動作するよう設計：

```typescript
// utils/canvas.ts
export function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  // ... 実装 ...
}
```

### エラーハンドリング（neverthrow）

すべての非同期関数は `ResultAsync` を返す：

```typescript
import { ResultAsync } from 'neverthrow'

export function atlasTexturesInDocument(
  document: Document,
  options: AtlasOptions,
  createCanvas: CanvasFactory,
): ResultAsync<AtlasResult, AtlasError> {
  // ... 実装 ...
}
```

### 型定義の集約

`src/types.ts` にすべての型定義をまとめて管理。

## 実装状態（2025-11-10 - 完全実装）

TexTransCoreTS は、テクスチャアトラス化機能に関して完全に実装されています。

#### 完成済みの機能 ✅

**Phase 1: 基盤実装**
1.  **MaxRects Bin Packing アルゴリズム** (src/atlas/packing.ts)
    *   効率的なテクスチャレイアウト計算
    *   テスト: 5/5 pass ✓
2.  **Canvas 互換性の確保** (src/utils/canvas.ts)
    *   node-canvas の putImageData 非サポート問題を修正
    *   ブラウザと Node.js 環境の両方で動作
    *   Canvas ファクトリ関数による依存性注入

**Phase 2: アトラス化と統合** (src/atlas/process-gltf-atlas.ts)
1.  **アトラス画像の glTF-Transform へ登録** ✅
    *   Canvas → PNG バッファ変換
    *   glTF-Transform テクスチャとして登録
    *   マテリアルの参照更新
    *   不要なテクスチャ削除（メモリ効率化）
    *   テスト: 3/3 pass ✓

**Phase 3: UV 座標再マッピング** (src/atlas/uv-remapping.ts)
1.  **UV 座標変換アルゴリズム** ✅
    *   remapUVCoordinate() 実装
    *   ピクセル座標 → 正規化 UV 変換
    *   アスペクト比自動保証
    *   テスト: 6/6 pass ✓
2.  **プリミティブ UV 更新** ✅
    *   TEXCOORD_0 属性取得・更新
    *   Float32Array サポート
    *   全プリミティブへの一括適用

**Phase 4: テクスチャダウンスケーリング** (NEW)
1.  **テクスチャダウンスケーリング機能** ✅
    *   AtlasOptions.textureScale (0.1-1.0)
    *   _scaleTextureImage() 実装
    *   ニアレストネイバー法による高速処理

**CLI 統合** (src/cli.ts)
1.  **完全な CLI サポート** ✅
    *   `--option-max-texture-size` オプション
    *   `--texture-scale` オプション
    *   エラーハンドリングと検証
    *   進捗表示とファイルサイズレポート
    *   テスト実績：2 個のテスト VRM ファイルで検証済み

#### 実装完了パイプライン

```
入力ファイル (.glb/.gltf/.vrm)
    ↓
[glTF-Transform ドキュメント解析]
    ↓
[テクスチャ抽出]（glTF 汎用）
    ↓
[✅ テクスチャダウンスケーリング]（オプション）
    ↓
[Bin Packing 計算]（MaxRects アルゴリズム）
    ↓
[Canvas アトラス生成]（ブラウザ/Node.js 対応）
    ↓
[✅ アトラス画像をドキュメントに登録]
    ↓
[✅ UV マッピング情報生成]
    ↓
[✅ マテリアル参照更新]
    ↓
[✅ プリミティブ UV 座標再マッピング]
    ↓
出力ファイル（最適化済み）
```

### テスト結果（検証済み）

| テスト | ファイル | 入力 | 出力 | 削減率 | スケール |
| --- | --- | --- | --- | --- | --- |
| 1 | Seed-san.vrm | 10.41 MB | 5.29 MB | 49.19% | 0.5x |
| 2 | fem_vroid.vrm | 11.48 MB | 10.45 MB | 9.03% | 1.0x |
| 3 | fem_vroid.vrm | 11.48 MB | 8.89 MB | 22.59% | 0.75x |

## 次のステップ（今後の改善）

### テスト戦略

#### ユニットテスト
- MaxRects packing アルゴリズム（既存）
- UV マッピング計算（新規）

#### 統合テスト
- 複数テクスチャの Canvas 合成
- glTF ドキュメントへの登録と読み込み確認

#### 手動確認
```bash
# Phase 2 完成後
npx tsx __tests__/manual/atlas-integration.manual.ts

# 出力ファイルを Blender や VRM Viewer で視覚的確認
```

### 既知の制限

1.  **VRM メタデータ非依存**
    *   現在の実装は純粋な glTF 処理のみ
    *   VRM 固有の機能（アーマチュア、形状キー）には対応していない
    *   `.vrm` ファイルでも `.glb` ファイルと同じように処理される
2.  **テクスチャ品質**
    *   PNG 形式での出力（可逆圧縮）
    *   WebP/AVIF への圧縮は別の処理として実装予定
3.  **メモリ効率**
    *   大きなテクスチャ（2048x2048 以上）処理時のメモリ使用量に注意
    *   Node.js 環境での canvas バッファ管理に留意

## 手動確認フロー

視覚的な確認が必要な処理（アトラス化、圧縮品質）は `__tests__/manual/` に確認スクリプトを配置：

```bash
# 手動テスト実行
pnpm exec tsx __tests__/manual/atlas.manual.ts

# 出力: __tests__/output/atlas-result.png
# 確認: ビューアで視覚的に検証
```

## トラブルシューティング

### メモリ不足エラー

大きなテクスチャ処理時は、最大アトラスサイズを削減：

```typescript
const result = await atlasTexturesInDocument(document, {
  maxSize: 1024, // 2048 から削減
})
```

## 今後の検討事項

将来的な最適化の可能性：

-   WASM による高速化（C# オリジナルとの性能比較）
-   **GPU 画像処理への移行**（リアルタイム処理が必須になった場合）
-   より高度な Bin packing アルゴリズム（Guillotine など）

# CLAUDE.md

このファイルは、@xrift/avatar-optimizer (3D モデル最適化ユーティリティライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

## 会話について

日本語で会話すること

## プロジェクト概要

**@xrift/avatar-optimizer** は WebXR アプリケーション向けの 3D モデル最適化ユーティリティライブラリです。glTF-Transform ベースの軽量ライブラリで、React 依存がなくブラウザ環境で動作します。

## プロジェクト構成

### スタック

- **TypeScript** (5.0+): 型安全なユーティリティ開発
- **pnpm** (workspace): monorepo パッケージ管理
- **tsup** (8.0+): ビルドツール (ESM/CJS 出力)
- **Vitest** (2.0+): ライブラリ/ビューア双方のユニットテスト
- **Three.js / @pixiv/three-vrm**: debug-viewer パッケージでの VRM 描画

### ディレクトリ構成（pnpm monorepo）

```
packages/
├── avatar-optimizer/              # メインライブラリ (VRM最適化 + テクスチャアトラス)
│   ├── src/
│   │   ├── process/              # 最適化プロセス
│   │   │   ├── gen-atlas.ts       # テクスチャアトラス生成
│   │   │   ├── packing.ts         # パッキングアルゴリズム
│   │   │   └── set-uv.ts          # UV リマッピング
│   │   ├── util/                 # ユーティリティ
│   │   │   ├── material/          # マテリアル処理
│   │   │   │   ├── index.ts
│   │   │   │   ├── combine.ts
│   │   │   │   └── types.ts
│   │   │   ├── mesh/              # メッシュ処理
│   │   │   │   ├── merge-mesh.ts
│   │   │   │   ├── uv.ts
│   │   │   │   └── deleter.ts
│   │   │   └── texture/           # テクスチャ処理
│   │   │       ├── index.ts
│   │   │       ├── composite.ts
│   │   │       ├── packing.ts
│   │   │       └── types.ts
│   │   ├── avatar-optimizer.ts    # メイン API 実装
│   │   ├── index.ts               # ライブラリエクスポート管理
│   │   └── types.ts               # 型定義集約
│   ├── tests/                     # Vitest 自動テスト
│   │   ├── *.test.ts              # 最適化/アトラス/アダプタ検証
│   ├── dist/                      # ビルド出力 (ESM/型定義)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── tsup.config.ts
│
├── mtoon-atlas/             # MToon Atlas マテリアル
│   ├── src/
│   │   ├── shaders/
│   │   │   ├── mtoon.frag
│   │   │   └── mtoon.vert
│   │   ├── MToonAtlasMaterial.ts
│   │   ├── declarations.d.ts
│   │   ├── index.ts
│   │   └── types.ts
│   ├── tests/                    # Vitest テスト
│   ├── dist/                     # ビルド出力
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── tsup.config.ts
│   └── README.md
│
└── debug-viewer/                 # VRM ビューア (React + Three.js)
    ├── src/
    │   ├── components/            # React コンポーネント
    │   │   ├── VRMCanvas.tsx
    │   │   ├── VRMScene.tsx
    │   │   ├── VRMViewer.tsx
    │   │   ├── Viewport3D.tsx
    │   │   ├── TextureViewer.tsx
    │   │   ├── TexturePreviewScene.tsx
    │   │   ├── SceneInspector.tsx
    │   │   ├── UVPreviewDialog.tsx
    │   │   └── index.ts
    │   ├── hooks/                 # React カスタムフック
    │   │   ├── useVRMLoader.ts     # VRM 読み込み処理
    │   │   ├── useVRMScene.ts      # VRM シーン管理
    │   │   ├── useTextureReplacement.ts
    │   │   └── index.ts
    │   ├── assets/                # 静的アセット
    │   ├── App.tsx                # アプリケーションエントリー
    │   ├── main.tsx               # React マウントポイント
    │   └── index.css / App.css    # スタイル定義
    ├── dist/                      # ビルド出力
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── vite.config.ts
    └── index.html

pnpm-workspace.yaml               # workspace 設定
package.json                       # ルート package.json (scripts 集約)
```

### 主要な API

#### ライブラリ API

- `optimizeVRM(file, options)`: テクスチャ圧縮・メッシュ削減による最適化
- `calculateVRMStatistics(file)`: VRM 統計計算 (ポリゴン数、テクスチャ数など)

詳細は `README.md` を参照してください。

## 開発コマンド

このプロジェクトは **pnpm monorepo** として構成されており、`packages/` ディレクトリ下に複数のパッケージが管理されています。

### ルートディレクトリでの操作

```bash
# 依存関係インストール（全ワークスペース）
pnpm install

# ビルド（全パッケージ）
pnpm build

# ウォッチモード（全パッケージ、開発時）
pnpm dev

# テスト実行（全パッケージ）
pnpm test

# Lint チェック
pnpm lint

# コード フォーマット
pnpm format

# 公開前ビルド
pnpm prepublishOnly
```

### 特定のパッケージ操作

```bash
# avatar-optimizer のビルド
pnpm -F avatar-optimizer run build

# avatar-optimizer の開発モード
pnpm -F avatar-optimizer run dev

# avatar-optimizer のテスト
pnpm -F avatar-optimizer run test

# mtoon-atlas (MToon インスタンシング)
pnpm -F mtoon-atlas run build
pnpm -F mtoon-atlas run dev
pnpm -F mtoon-atlas run test

# debug-viewer (VRM 確認用)
pnpm -F debug-viewer run build
pnpm -F debug-viewer run dev
pnpm -F debug-viewer run test
```

テクスチャアトラス機能は `packages/avatar-optimizer/src/process/` および `packages/avatar-optimizer/src/util/texture/` に分散して実装されています。`pnpm -F avatar-optimizer run test` がアトラス関連テストも実行します。

## 開発ルール

2. **モジュール形式**: 名前付きエクスポートを使用 (ESM 形式をサポート)
3. **テスト**: `packages/avatar-optimizer/tests/` や `packages/debug-viewer/tests/` で純粋関数のテストを記述

## AI 支援開発のためのコーディング規約

これらの規約は AI コード生成と自己修正向けに最適化されています。AI の誤りを防ぐため複雑性を制約しながらコード品質を維持します。

### 自己説明的なコード

コード再訪時に一貫性を維持するため、ファイルヘッダーに仕様コメントを含めます：

```typescript
/**
 * VRM モデルからテクスチャ統計を抽出して分析します。
 * baseColor テクスチャをスキャンし、
 * 総テクスチャメモリ使用量と圧縮可能性を評価します。
 *
 * @param document - glTF-Transform ドキュメント
 * @returns テクスチャ統計オブジェクト
 */
export function analyzeTextureStatistics(document: Document): TextureStats {
  // 実装
}
```

### 型集約 (真実の唯一の源)

**ドメインモデルを統合** して集約型ファイルでファイル読み込み削減：

```typescript
// ❌ 悪い例: 型がファイル全体に散在
// src/optimize.ts
export interface OptimizationOptions { ... }

// src/statistics.ts
export interface StatisticsResult { ... }

// ✅ 良い例: src/types.ts に型を集約
// src/types.ts
export interface OptimizationOptions { ... }
export interface StatisticsResult { ... }
export interface PreprocessingResult { ... }

// 一貫してインポート
import { OptimizationOptions, StatisticsResult } from './types'
```

これはトークン消費を削減し、型定義の競合を防ぎます。

### 関数型アプローチ

**クラスより関数** を優先し、純粋関数で実装：

```typescript
// ❌ 悪い例: 副作用のあるクラス
class VRMOptimizer {
  private document: Document | null = null

  async loadVRM(file: File): Promise<void> {
    this.document = await loadDocument(file)
  }

  optimize(): void {
    if (!this.document) throw new Error('Document not loaded')
    // 直接ドキュメントを変異
    this.document.getRoot().scale([0.5, 0.5, 0.5])
  }
}

// ✅ 良い例: 純粋な関数型
async function optimizeVRMDocument(
  file: File,
  options: OptimizationOptions,
): Promise<Document> {
  const document = await loadDocument(file)
  const optimized = document.clone()
  // 新しいドキュメントを返す
  applyOptimizations(optimized, options)
  return optimized
}
```

**利点**:

- テスタビリティ向上 (入出力が明確)
- 副作用なし (バグの原因が減少)
- 再利用性向上 (組み合わせ可能)

### 例外処理のベストプラクティス (neverthrow による Result 型に統一)

エラーハンドリングは `neverthrow` のパターンに統一し、条件判定を簡潔にします。
内部で例外または Result が発生するパターンでは同期、非同期を問わず原則として Result または ResultAsync を使用する。
基本的に safeTry を使用し yeild\*でエラーの場合都度 Result を返却

```typescript
import { ok, err, Result } from 'neverthrow'

function someFileProcessingFunc(file: File): Result<ProcessedFile, SomeError> {
  return safeTry(function* () {
    if (!file) {
      return err({
        type: 'SOME_ERROR_TYPE',
        message: 'File is required',
      })
    }
    const processedFile = yield* someSubProcessFuncThatReturnResult(file)
    return ok(processedFile)
  })
}
```

呼び出し側では統一されたパターンで処理します：

```typescript
// 呼び出し側（外部向けでも内部向けでも同じパターン）
const result = await optimizeVRM(file, options)

if (result.isErr()) {
  console.error(
    `Optimization failed (${result.error.type}): ${result.error.message}`,
  )
  // エラー時の処理
  return
}

const optimizedFile = result.value
// 成功時の処理
```

**エラー型の定義** (src/types.ts):

大まかな括りで type を指定する。だいたいパッケージあたり 1 つくらいでいい

```typescript
export type OptimizationError =
  | { type: 'ASSET_ERROR'; message: string }
  | { type: 'INVALID_OPERATION'; message: string }
  | { type: 'INVALID_PARAMETER'; message: string }
  | { type: 'INTERNAL_ERROR'; message: string }
```

**使い分けの原則**:

| 関数タイプ          | 戻り値型            | エラー処理        | 用途                     |
| ------------------- | ------------------- | ----------------- | ------------------------ |
| 非同期関数（全て）  | `ResultAsync<T, E>` | Result 型チェーン | Public API・内部向け共通 |
| 同期/バリデーション | `Result<T, E>`      | Result 型チェーン | 純粋なバリデーション処理 |

この統一パターンにより、外部向け・内部向けを区別せず、一貫したエラーハンドリングロジックを適用できます。

### モジュールインターフェース管理

**すべてをエクスポートしない。** 明確なパブリック API を作成：

```typescript
// ❌ 悪い例: 内部実装詳細をエクスポート
export function _parseVRMExtension(/* ... */) {}
export function _validateMeshData(/* ... */) {}
export function optimizeVRM(file: File) {}
export function _cacheTextureData() {}
export function debugGetInternalState() {}

// ✅ 良い例: クリアなパブリック API、内部は隠蔽
// optimize.ts
function _parseVRMExtension(/* ... */) {} // プライベートヘルパー
function _validateMeshData(/* ... */) {} // プライベートヘルパー

export async function optimizeVRM(
  file: File,
  options: OptimizationOptions,
): Promise<File> {
  const document = await _loadVRMDocument(file)
  _validateMeshData(document)
  const optimized = applyOptimizations(document, options)
  return _serializeDocument(optimized)
}

// index.ts (メインエクスポート)
export { optimizeVRM, calculateVRMStatistics }
export type { OptimizationOptions, VRMStatistics }
```

これは AI が間違った内部関数を呼び出すのを防ぎます。

## 開発時の重要なポイント

1. **テスト駆動開発**: カバレッジを指標に、重要なロジック・エラーハンドリング・エッジケースを優先的にテスト
2. **エクスポート管理**: `index.ts` でパブリック API を明確に定義
3. **型定義**: `src/types.ts` に集約して管理
4. **エラーハンドリング**: 汎用キャッチブロック禁止、具体的に対応
5. **副作用最小化**: 可能な限り純粋関数を使用
6. **ドキュメント**: ファイルヘッダーに関数の仕様を記載

## 依存関係とバージョン管理

このプロジェクトのコアスタック：

- **TypeScript**: 5.0+
- **neverthrow**: 6.0+ (同期バリデーション・内部非同期処理の Result 型)
- **tsup**: 8.0+ (ビルドツール)

ピア依存関係を安装するユーザーに対して同じバージョンを強制してください。

## Texture-atlas 機能について

 テクスチャアトラス化機能は以下のディレクトリに分散して実装されています。

 - `packages/avatar-optimizer/src/process/`:
   - `gen-atlas.ts`: テクスチャアトラス生成のメインロジック
   - `packing.ts`: パッキングの準備とパターン抽出
   - `set-uv.ts`: UV リマッピング処理
 - `packages/avatar-optimizer/src/util/texture/`:
   - `composite.ts`: 画像合成処理
   - `packing.ts`: Bin packing アルゴリズム
   - `types.ts`: テクスチャ関連の型定義

## MToon atlas パッケージについて

**@xrift/mtoon-atlas** (`packages/mtoon-atlas/`) はアトラス化したテクスチャを使って MToon と同等の表現をするための専門的なマテリアルです。`@xrift/avatar-optimizer` で生成されたパラメータテクスチャとテクスチャアトラスを消費し、SkinnedMesh でマテリアルを統合できます。

### 主な機能

- **MToonAtlasMaterial**: MToonMaterial を拡張したクラス
  - 全 19 種類の数値パラメータを自動サンプリング（ParameterTexture から）
  - 8 種類のテクスチャマップを自動設定（AtlasedTextureSet から）
- **スロット属性管理**: 頂点属性経由でマテリアルスロットをインスタンスごとに指定
- **SkinnedMesh 対応**: InstancedMesh 不要でスキニングアニメーションと互換

### API 利用例

```typescript
import { MToonatlasMaterial } from '@xrift/mtoon-atlas'

const material = new MToonatlasMaterial()
material.setParameterTexture({
  texture: packedParameterTexture,
  slotCount: 10,
  texelsPerSlot: 8,
  atlasedTextures: {
    baseColor: atlasBaseColorTexture,
    normal: atlasNormalTexture,
    shade: atlasShadeTexture,
    // 他のテクスチャ...
  },
})
```

### MToon Atlas クイックリンク

```bash
# ビルド
pnpm -F mtoon-atlas run build

# ウォッチ
pnpm -F mtoon-atlas run dev

# テスト
pnpm -F mtoon-atlas run test

# ドキュメント
cat packages/mtoon-atlas/README.md
```

### 対応パラメータ

パッケージ内の README を参照すること

---

## Debug-Viewer パッケージについて

**@xrift/avatar-optimizer-debug-viewer** (`packages/debug-viewer/`) は最適化済み VRM の挙動を即座に確認する lightweight ビューアです。Three.js と @pixiv/three-vrm を使用し、neverthrow ベースの Result 型でエラーを通知します。

- `src/viewer/`: シーン初期化、リサイズ、破棄
- `src/utils/`: Canvas/loader 周辺のユーティリティ
- `README.md`: API とブラウザでの利用ガイド

### Debug-Viewer クイックリンク

```bash
# ビルド
pnpm -F debug-viewer run build

# ウォッチ
pnpm -F debug-viewer run dev

# テスト
pnpm -F debug-viewer run test

# ドキュメント
cat packages/debug-viewer/README.md
```

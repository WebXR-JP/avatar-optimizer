---
root: true
targets:
  - claudecode
description: '@xrift/avatar-optimizer development guide for Claude Code'
globs:
  - '**/*'
---
# CLAUDE.md

> **注意:** このコンテンツは `.rulesync/rules/CLAUDE.md` を編集してから `rulesync generate --targets claudecode --features rules` を実行することで `CLAUDE.md` に反映されます。`CLAUDE.md` そのものを直接編集しないでください。

このファイルは、@xrift/avatar-optimizer (3Dモデル最適化ユーティリティライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

## プロジェクト概要

**@xrift/avatar-optimizer** は WebXR アプリケーション向けの 3Dモデル最適化ユーティリティライブラリです。glTF-Transform ベースの軽量ライブラリで、React 依存がなくブラウザとノード環境の両方で動作します。
## プロジェクト構成

### スタック

- **TypeScript** (5.0+): 型安全なユーティリティ開発
- **@gltf-transform/core** (4.0+): glTF/VRM モデル操作
- **@gltf-transform/extensions** (4.0+): VRM 拡張機能サポート
- **pnpm** (workspace): monorepo パッケージ管理
- **tsup** (8.0+): ビルドツール (ESM/CJS 出力)

### ディレクトリ構成（pnpm monorepo）

```
packages/
├── avatar-optimizer/              # メインライブラリ + CLI パッケージ
│   ├── src/
│   │   ├── index.ts              # ライブラリエクスポート管理
│   │   ├── cli.ts                # CLI エントリーポイント (Commander ベース)
│   │   ├── optimizer.ts          # 最適化ロジック
│   │   └── types.ts              # 型定義集約
│   ├── __tests__/
│   │   ├── *.test.ts             # Jest 自動テスト
│   │   ├── fixtures/             # テスト用サンプルファイル (git追跡)
│   │   ├── input/                # 手動確認用入力ファイル (.gitignore)
│   │   ├── output/               # 手動実行スクリプトの出力 (.gitignore)
│   │   └── manual/               # 手動実行確認スクリプト
│   ├── dist/                     # ビルド出力 (ESM/型定義 + CLI)
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   └── tsup.config.ts
│
└── texture-atlas/                 # テクスチャアトラスライブラリ
    ├── src/
    │   ├── index.ts              # メインエントリーポイント
    │   ├── types.ts              # 型定義集約
    │   ├── atlas/                # アトラス処理ロジック
    │   │   ├── packing.ts        # Bin packing アルゴリズム
    │   │   ├── draw-image-jimp.ts # Canvas 画像描画
    │   │   ├── process-gltf-atlas.ts # glTF ドキュメント統合
    │   │   └── uv-remapping.ts   # UV 座標再マッピング
    │   └── utils/                # ユーティリティ
    │       └── canvas.ts         # Canvas 操作
    ├── __tests__/
    │   ├── *.test.ts             # Jest テスト
    │   ├── fixtures/             # テスト用画像
    │   ├── manual/               # 手動確認スクリプト
    │   └── output/               # 出力結果
    ├── dist/                     # ビルド出力
    ├── package.json
    ├── tsconfig.json
    ├── jest.config.js
    └── tsup.config.ts

pnpm-workspace.yaml               # workspace 設定
package.json                       # ルート package.json (scripts 集約)
```

### 主要な API

#### ライブラリ API

- `optimizeVRM(file, options)`: テクスチャ圧縮・メッシュ削減による最適化
- `calculateVRMStatistics(file)`: VRM 統計計算 (ポリゴン数、テクスチャ数など)

#### CLI コマンド

```bash
xrift-optimize <input> -o <output> [options]
```

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

# texture-atlas のビルド
pnpm -F texture-atlas run build

# texture-atlas のテスト
pnpm -F texture-atlas run test

# texture-atlas の手動テスト
pnpm -F texture-atlas run manual-atlas
```

### CLI のテスト

```bash
# ローカル CLI テスト（avatar-optimizer パッケージから）
cd packages/avatar-optimizer
node dist/cli.mjs <input> -o <output>

# または、グローバルコマンドでテスト（pnpm link 後）
pnpm link --global
xrift-optimize <input> -o <output>
```

### 手動テストスクリプト

```bash
# avatar-optimizer の手動テスト
pnpm -F avatar-optimizer exec tsx __tests__/manual/cli.manual.ts

# texture-atlas の手動テスト
pnpm -F texture-atlas exec tsx __tests__/manual/atlas.manual.ts
```

**pnpm monorepo コマンドの基本**:

| コマンド | 説明 |
| --- | --- |
| `pnpm install` | 全ワークスペースの依存関係をインストール |
| `pnpm build` | 全パッケージをビルド（ルートスクリプト） |
| `pnpm -F <package> run <script>` | 特定のパッケージのスクリプトを実行 |
| `pnpm -r run <script>` | すべてのパッケージでスクリプトを実行 |
| `pnpm -F <package> add <dep>` | 特定のパッケージに依存関係を追加 |
| `pnpm link --global` | パッケージをグローバルにリンク |
| `pnpm exec <command>` | ローカル node_modules の実行可能ファイルを実行 |

## 重要な開発ルール

1. **React 依存なし**: このライブラリは React に依存しない純粋なユーティリティライブラリです
2. **ブラウザ互換**: @gltf-transform/core の WebIO を使用してブラウザ環境で動作
3. **モジュール形式**: 名前付きエクスポートを使用 (ESM/CJS の両形式をサポート)
4. **依存関係最小化**: ピア依存関係は @gltf-transform のみ
5. **テスト**: `__tests__/` ディレクトリ内で純粋関数のテストを記述
6. **CLI ビルド**: `src/cli.ts` は ES Module (`.mjs`) として独立ビルド。ブラウザとの互換性は不要

## CLI 開発ガイドライン

### CLI アーキテクチャ

- **エントリーポイント**: `packages/avatar-optimizer/src/cli.ts`
- **ビルド出力**: `packages/avatar-optimizer/dist/cli.mjs` (Node.js 実行可能、shebang 付き)
- **パーサー**: Commander.js
- **ファイル I/O**: `fs/promises` (Node.js 専用)

### CLI 実装のベストプラクティス

#### 1. ライブラリ関数の再利用

CLI は `optimizeVRM`, `calculateVRMStatistics` などのライブラリ関数をラッパーとして使用：

```typescript
import { optimizeVRM, type OptimizationOptions } from './index'

async function runCLI() {
  // ファイル読み込み → File オブジェクト変換 → ライブラリ関数呼び出し → 出力
  const file = new File([buffer], filename, { type: 'model/gltf-binary' })
  const result = await optimizeVRM(file, options)

  if (result.isErr()) {
    // neverthrow エラー処理
    console.error(`Error: ${result.error.message}`)
    process.exit(1)
  }
}
```

#### 2. エラーハンドリング

- ライブラリ関数は `ResultAsync` を返すため、`.isErr()` でチェック
- CLI 固有のエラー（ファイルシステム）は try-catch で対応
- 常に適切な exit code を設定 (`process.exit(0)` / `process.exit(1)`)

```typescript
try {
  const buffer = await readFile(inputPath)
  // ... ライブラリ呼び出し ...
} catch (error) {
  console.error(`❌ Unexpected error: ${String(error)}`)
  process.exit(1)
}
```

#### 3. ユーザーフレンドリーな出力

- 進捗表示 (📖, ⚙️, 💾 など適度なシンボルを使用)
- 成功メッセージ (✅)
- エラーメッセージ (❌)
- ファイルサイズ削減率の表示

#### 4. オプション管理

Commander で定義したオプションは型安全に処理：

```typescript
program
  .option('-o, --output <path>', 'Path to output', 'output.vrm')
  .option('--max-texture-size <size>', 'Max texture size', '2048')
  .action(async (input, options) => {
    // options は { output: string, maxTextureSize: string } 型
    const maxSize = parseInt(options.maxTextureSize, 10)
  })
```

### ビルド設定

`tsup.config.ts` で CLI を独立ビルド：

```typescript
{
  name: 'cli',
  entry: ['src/cli.ts'],
  format: ['esm'],           // Node.js 用 ES Module
  outExtension: () => ({ js: '.mjs' }),  // .mjs 拡張子
  dts: false,                // CLI は型定義不要
  sourcemap: false,          // パフォーマンス最適化
}
```

`package.json` の `bin` フィールド：

```json
{
  "bin": {
    "xrift-optimize": "./dist/cli.mjs"
  }
}
```

### CLI テスト戦略

- **機能テスト**: `packages/avatar-optimizer/__tests__/manual/cli.manual.ts` で実際のファイル処理を確認
- **テスト入力ファイル**:
  - `packages/avatar-optimizer/__tests__/fixtures/`: git 追跡されるサンプル（CI/CD でも使用）
  - `packages/avatar-optimizer/__tests__/input/`: 開発者が配置する実ファイル（.gitignore）
- **出力確認**: `packages/avatar-optimizer/__tests__/output/` で結果を検証

```bash
# 手動テスト実行
pnpm -F avatar-optimizer exec tsx __tests__/manual/cli.manual.ts

# ローカル CLI テスト
cd packages/avatar-optimizer
node dist/cli.mjs __tests__/fixtures/sample.glb -o __tests__/output/result.glb

# グローバルコマンドでテスト（pnpm link 後）
xrift-optimize __tests__/fixtures/sample.glb -o __tests__/output/result.glb
```

## AI 支援開発のためのコーディング規約

これらの規約は AI コード生成と自己修正向けに最適化されています。AI の誤りを防ぐため複雑性を制約しながらコード品質を維持します。

### テスト駆動開発 (最重要)

**コード実装と共にテストを生成します。** テストは自己修正を可能にする実行可能な仕様として機能します。**すべての関数にテストが必要というわけではなく、カバレッジを指標として適切なテスト範囲を決定します。** 重要なロジック、エラーハンドリング、エッジケースを優先的にテストしてください：

```typescript
// ❌ 悪い例: テストなしのコード
export function calculateDistance(a: Vector3, b: Vector3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

// ✅ 良い例: テスト付きのコード
export function calculateDistance(a: Vector3, b: Vector3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

// __tests__/utils.test.ts 内
describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const result = calculateDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })
    expect(result).toBeCloseTo(5)
  })
})
```

**純粋関数 (ロジック検証用)**: 重要なビジネスロジックや複雑な計算は `__tests__/` ディレクトリ内の Jest テストでカバレッジを確保

**手動確認が必要な機能**: テクスチャアトラス化、メッシュ処理、ジオメトリ最適化など視覚的な確認が重要な場合、各パッケージの `__tests__/` ディレクトリに**手動実行用スクリプト**を配置：

```typescript
// packages/texture-atlas/__tests__/manual/atlas.manual.ts
// 手動実行用スクリプト: pnpm -F texture-atlas exec tsx __tests__/manual/atlas.manual.ts

import { atlasTexturesInDocument } from '../../src/index'
import fs from 'fs'
import path from 'path'

/**
 * テクスチャアトラス化の処理を確認するためのスクリプト
 * 出力ファイルを視覚的に検証してからコミット
 */
async function manualCheckTextureAtlas() {
  // fixtures: git追跡されるテスト用サンプルファイル
  const fixtureFile = path.join(__dirname, '../fixtures/sample.glb')

  // input: 手動確認用の一時的な入力ファイル (開発者が配置, .gitignore)
  const inputFile = path.join(__dirname, '../input/my-avatar.vrm')

  // 存在するファイルで処理
  const targetFile = fs.existsSync(inputFile) ? inputFile : fixtureFile
  const fileData = fs.readFileSync(targetFile)
  const result = await atlasTexturesInDocument(fileData, { maxSize: 2048 })

  // output: スクリプト実行時の出力結果 (.gitignore)
  const outputDir = path.join(__dirname, '../output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(path.join(outputDir, 'atlas-result.glb'), result)
  console.log('✓ 出力ファイル: __tests__/output/atlas-result.glb')
  console.log('  BlenderやVRM ビューアで視覚的に確認してください')
}

manualCheckTextureAtlas()
```

**Fixture フォルダの使い分け**:

| フォルダ    | 内容                         | Git追跡       | 用途                   |
| ----------- | ---------------------------- | ------------- | ---------------------- |
| `fixtures/` | 小さなテスト用VRM サンプル   | ✅ 必須       | CI/CD やテストで使用   |
| `input/`    | 開発者が配置する実際のモデル | ❌ .gitignore | 手動実行時の処理検証用 |
| `output/`   | スクリプト実行時の出力結果   | ❌ .gitignore | ビジュアル確認用       |

**.gitignore 設定例**:

```
__tests__/input/*
__tests__/output/*
!__tests__/input/.gitkeep
!__tests__/output/.gitkeep
```

**手動スクリプトの運用フロー**:

1. `input/` に確認したいモデルを配置
2. 手動スクリプトを実行: `npx tsx __tests__/manual/texture-atlas.manual.ts`
3. `output/` の結果を Blender/VRM ビューアで目視確認
4. ビジュアル品質を確認してからコミット
5. コミットメッセージに「手動確認済み」と記載

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

#### 1. 同期関数またはバリデーション：Result 型

同期関数や純粋なバリデーション処理では `neverthrow` の `Result` 型を使用します：

```typescript
import { ok, err, Result } from 'neverthrow'

// 同期的なバリデーション：Result 型を返す
function validateFile(file: File): Result<void, ValidationError> {
  if (!file) {
    return err({
      type: 'INVALID_FILE_TYPE' as const,
      message: 'File is required',
    })
  }
  if (file.type !== 'model/gltf-binary') {
    return err({
      type: 'INVALID_FILE_TYPE' as const,
      message: 'Expected VRM binary file',
    })
  }
  return ok(undefined)
}

// 使用
const validationResult = validateFile(file)
if (validationResult.isErr()) {
  console.error(validationResult.error.message)
  return
}
```

#### 2. 非同期関数：ResultAsync（外部向け・内部向け統一）

すべての非同期関数は `ResultAsync` を使用し、エラーハンドリングを型安全に組み立てます。これにより条件判定が統一され、`Promise + throw` の複雑性を排除できます：

```typescript
import { ResultAsync, ok, err } from 'neverthrow'

// Public API でも内部向けでも ResultAsync を使用
export function optimizeVRM(
  file: File,
  options: OptimizationOptions,
): ResultAsync<File, OptimizationError> {
  // ファイル型の同期バリデーション
  const validationResult = validateFileSync(file)
  if (validationResult.isErr()) {
    return ResultAsync.fromSomePromise(Promise.reject(validationResult.error))
  }

  // 非同期処理をチェーン
  return ResultAsync.fromPromise(
    file.arrayBuffer(),
    (error) => ({
      type: 'LOAD_FAILED' as const,
      message: `Failed to read file: ${String(error)}`,
    })
  )
    .andThen((arrayBuffer) =>
      ResultAsync.fromPromise(
        loadDocument(arrayBuffer),
        (error) => ({
          type: 'DOCUMENT_PARSE_FAILED' as const,
          message: String(error),
        })
      )
    )
    .map((document) => processFile(document))
}

// 内部向けヘルパー
function _processTextureAsync(
  texture: Texture,
): ResultAsync<Texture, ProcessingError> {
  return ResultAsync.fromPromise(
    compressTexture(texture),
    (error) => ({
      type: 'PROCESSING_FAILED' as const,
      message: String(error),
    })
  )
}

// チェーン例
_processTextureAsync(texture)
  .map((t) => optimizeTexture(t))
  .andThen((t) => _validateTextureAsync(t))
  .mapErr((err) => {
    // 最終的なエラーハンドリング（ロギングなど）
    console.error(`Error: ${err.message}`)
    return err
  })
```

呼び出し側では統一されたパターンで処理します：

```typescript
// 呼び出し側（外部向けでも内部向けでも同じパターン）
const result = await optimizeVRM(file, options)

if (result.isErr()) {
  console.error(`Optimization failed (${result.error.type}): ${result.error.message}`)
  // エラー時の処理
  return
}

const optimizedFile = result.value
// 成功時の処理
```

**エラー型の定義** (src/types.ts):

```typescript
export type OptimizationError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'LOAD_FAILED'; message: string }
  | { type: 'DOCUMENT_PARSE_FAILED'; message: string }
  | { type: 'TEXTURE_EXTRACTION_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

export type ValidationError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'VALIDATION_FAILED'; message: string }

export type ProcessingError =
  | { type: 'PROCESSING_FAILED'; message: string }
  | OptimizationError
```

**使い分けの原則**:

| 関数タイプ | 戻り値型 | エラー処理 | 用途 |
| --- | --- | --- | --- |
| 非同期関数（全て） | `ResultAsync<T, E>` | Result 型チェーン | Public API・内部向け共通 |
| 同期/バリデーション | `Result<T, E>` | Result 型チェーン | 純粋なバリデーション処理 |

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

export async function calculateVRMStatistics(
  file: File,
): Promise<VRMStatistics> {
  const document = await _loadVRMDocument(file)
  return _computeStats(document)
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
- **@gltf-transform/core**: 4.0+ (ピア依存関係)
- **@gltf-transform/extensions**: 4.0+ (ピア依存関係)
- **neverthrow**: 6.0+ (同期バリデーション・内部非同期処理の Result 型)
- **tsup**: 8.0+ (ビルドツール)

ピア依存関係を安装するユーザーに対して同じバージョンを強制してください。

**neverthrow の使用対象**:
- ✅ 同期関数の戻り値（Result 型）
- ✅ 内部向けの複雑な非同期処理（ResultAsync 型）
- ❌ 外部向けの非同期関数（Promise + throw を使用）

## Texture-Atlas パッケージについて

**texture-atlas** (`packages/texture-atlas/`) は テクスチャアトラス化機能を提供する独立したパッケージです。

詳細な開発ガイドは `packages/texture-atlas/CLAUDE.md` を参照してください：

- **Bin Packing アルゴリズム**: 効率的なテクスチャレイアウト計算
- **テクスチャアトラス化**: 複数のテクスチャを1つのアトラスに統合
- **UV 座標再マッピング**: glTF-Transform ドキュメント内のプリミティティブ UV を更新
- **開発コマンド**: ビルド、テスト実行方法

### クイックリンク

```bash
# texture-atlas のビルド
pnpm -F texture-atlas run build

# texture-atlas のテスト
pnpm -F texture-atlas run test

# texture-atlas の手動テスト
pnpm -F texture-atlas run manual-atlas

# texture-atlas の開発ガイド
cat packages/texture-atlas/CLAUDE.md
```

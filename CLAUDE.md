# CLAUDE.md

このファイルは、@xrift/vrm-optimizer (VRM モデル最適化ユーティリティライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

## プロジェクト概要

**@xrift/vrm-optimizer** は WebXR アプリケーション向けの VRM モデル最適化ユーティリティライブラリです。glTF-Transform ベースの軽量ライブラリで、React 依存がなくブラウザとノード環境の両方で動作します。

## プロジェクト構成

### スタック

- **TypeScript** (5.0+): 型安全なユーティリティ開発
- **@gltf-transform/core** (4.0+): glTF/VRM モデル操作
- **@gltf-transform/extensions** (4.0+): VRM 拡張機能サポート
- **tsup** (8.0+): ビルドツール (ESM/CJS 出力)

### ディレクトリ構成

```
src/
  ├── index.ts          # メインエントリーポイント (エクスポート管理)
  └── [実装ファイル]

__tests__/
  ├── *.test.ts         # Jest 自動テスト
  ├── fixtures/         # テスト用サンプルファイル (git追跡)
  ├── input/            # 手動確認用入力ファイル (.gitignore)
  ├── output/           # 手動実行スクリプトの出力 (.gitignore)
  └── manual/           # 手動実行確認スクリプト (git追跡)

dist/                   # ビルド出力 (ESM/CJS/型定義)
```

### 主要な API

- `preprocessVRM(file, options)`: VRM 検証→最適化→統計計算の一括処理
- `optimizeVRM(file, options)`: テクスチャ圧縮・メッシュ削減による最適化
- `calculateVRMStatistics(file)`: VRM 統計計算 (ポリゴン数、テクスチャ数など)

詳細は `README.md` を参照してください。

## 開発コマンド

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# ウォッチモード (開発時)
npm run dev

# 公開前ビルド
npm run prepublishOnly
```

## 重要な開発ルール

1. **React 依存なし**: このライブラリは React に依存しない純粋なユーティリティライブラリです
2. **ブラウザ互換**: @gltf-transform/core の WebIO を使用してブラウザ環境で動作
3. **モジュール形式**: 名前付きエクスポートを使用 (ESM/CJS の両形式をサポート)
4. **依存関係最小化**: ピア依存関係は @gltf-transform のみ
5. **テスト**: `__tests__/` ディレクトリ内で純粋関数のテストを記述

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

**手動確認が必要な機能**: テクスチャアトラス化、メッシュ処理、ジオメトリ最適化など視覚的な確認が重要な場合、`__tests__/` ディレクトリに**手動実行用スクリプト**を配置：

```typescript
// __tests__/manual/texture-atlas.manual.ts
// 手動実行用スクリプト: npx tsx __tests__/manual/texture-atlas.manual.ts

import { createTextureAtlas } from '../../src/optimize'
import fs from 'fs'
import path from 'path'

/**
 * テクスチャアトラス化の処理を確認するためのスクリプト
 * 出力ファイルを視覚的に検証してからコミット
 */
async function manualCheckTextureAtlas() {
  // fixtures: git追跡されるテスト用サンプルファイル
  const fixtureFile = path.join(__dirname, '../fixtures/sample-vrm.glb')

  // input: 手動確認用の一時的な入力ファイル (開発者が配置, .gitignore)
  const inputFile = path.join(__dirname, '../input/my-avatar.vrm')

  // 存在するファイルで処理
  const targetFile = fs.existsSync(inputFile) ? inputFile : fixtureFile
  const fileData = fs.readFileSync(targetFile)
  const result = await createTextureAtlas(fileData)

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

### 例外処理のベストプラクティス (neverthrow による Result 型)

**例外は原則として Result 型で扱う。** `neverthrow` ライブラリを使用して、エラーハンドリングを型安全かつ明示的に行います：

```typescript
import { ok, err, Result } from 'neverthrow'

// ❌ 悪い例: 例外をスロー
export async function loadVRMDocument(file: File): Promise<Document> {
  if (!file || file.type !== 'model/gltf-binary') {
    throw new Error('Invalid file: expected VRM binary file')
  }
  try {
    const io = new WebIO()
    const document = await io.readBinary(
      new Uint8Array(await file.arrayBuffer()),
    )
    if (!document) {
      throw new Error('Failed to parse VRM document')
    }
    return document
  } catch (error) {
    throw error
  }
}

// ✅ 良い例: Result 型でエラーを返す
export async function loadVRMDocument(
  file: File,
): Promise<Result<Document, LoadError>> {
  if (!file || file.type !== 'model/gltf-binary') {
    return err({
      type: 'INVALID_FILE_TYPE' as const,
      message: 'Expected VRM binary file',
    })
  }

  try {
    const io = new WebIO()
    const document = await io.readBinary(
      new Uint8Array(await file.arrayBuffer()),
    )
    if (!document) {
      return err({
        type: 'PARSE_FAILED' as const,
        message: 'Failed to parse VRM document',
      })
    }
    return ok(document)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return err({
      type: 'LOAD_ERROR' as const,
      message: `Failed to load VRM: ${message}`,
    })
  }
}

// Result 型の使用方法
const documentResult = await loadVRMDocument(file)

// パターンマッチング
documentResult
  .map((doc) => doc.getRoot().listMeshes())
  .mapErr((err) => console.error(`Load failed: ${err.message}`))

// またはマニュアルチェック
if (documentResult.isErr()) {
  const error = documentResult.error
  console.error(`Failed (${error.type}): ${error.message}`)
} else {
  const document = documentResult.value
  // document を使用
}
```

**エラー型の定義**:

```typescript
// src/types.ts
export type LoadError =
  | { type: 'INVALID_FILE_TYPE'; message: string }
  | { type: 'PARSE_FAILED'; message: string }
  | { type: 'LOAD_ERROR'; message: string }

export type OptimizationError =
  | { type: 'VALIDATION_FAILED'; message: string }
  | { type: 'OPTIMIZATION_FAILED'; message: string }
```

**メリット**:

- エラーが型安全（`type` フィールドで分岐）
- 呼び出し元が強制的にエラーハンドリングを考慮
- try-catch が不要で制御フローが明確
- 予期しない例外から守られる

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
export { optimizeVRM, calculateVRMStatistics, preprocessVRM }
export type { OptimizationOptions, VRMStatistics, PreprocessingResult }
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
- **neverthrow**: 6.0+ (Result 型によるエラーハンドリング)
- **tsup**: 8.0+ (ビルドツール)

ピア依存関係を安装するユーザーに対して同じバージョンを強制してください。

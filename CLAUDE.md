# CLAUDE.md

このファイルは、@xrift/avatar-optimizer (3D モデル最適化ユーティリティライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

## 会話について

日本語で会話すること

## プロジェクト概要

**@xrift/avatar-optimizer** は WebXR アプリケーション向けの 3D モデル最適化ユーティリティライブラリです。glTF-Transform ベースの軽量ライブラリで、React 依存がなくブラウザ環境で動作します。

## プロジェクト構成

### スタック

- **TypeScript** (5.0+): 型安全なユーティリティ開発
- **@gltf-transform/core** (4.0+): glTF/VRM モデル操作
- **@gltf-transform/extensions** (4.0+): VRM 拡張機能サポート
- **pnpm** (workspace): monorepo パッケージ管理
- **tsup** (8.0+): ビルドツール (ESM/CJS 出力)
- **Vitest** (2.0+): ライブラリ/ビューア双方のユニットテスト
- **Three.js / @pixiv/three-vrm**: debug-viewer パッケージでの VRM 描画

### ディレクトリ構成（pnpm monorepo）

```
packages/
├── avatar-optimizer/              # メインライブラリ (VRM最適化 + テクスチャアトラス)
│   ├── src/
│   │   ├── core/                 # 最適化ロジック
│   │   ├── texture-atlas/        # 旧 texture-atlas 機能の統合モジュール
│   │   ├── vrm/                  # VRM 読み込み/エクスポート層
│   │   ├── index.ts              # ライブラリエクスポート管理
│   │   └── types.ts              # 型定義集約
│   ├── tests/                    # Vitest 自動テスト
│   │   ├── *.test.ts             # 最適化/アトラス/アダプタ検証
│   │   └── texture-atlas/        # アトラス関連の治具
│   ├── docs/                     # 仕様メモや VRM マッピング資料
│   ├── dist/                     # ビルド出力 (ESM/型定義)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── tsup.config.ts
│
├── mtoon-instancing/             # MToon インスタンシング マテリアル
│   ├── src/
│   │   ├── index.ts              # MToonInstancingMaterial クラス
│   │   └── types.ts              # 型定義 (ParameterTextureDescriptor, AtlasedTextureSet など)
│   ├── tests/                    # Vitest テスト
│   ├── dist/                     # ビルド出力
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── tsup.config.ts
│   └── README.md
│
└── debug-viewer/                 # VRM 表示用の簡易デバッグビューア
    ├── src/
    │   ├── viewer/               # Three.js + three-vrm 実装
    │   ├── utils/                # レンダリングユーティリティ
    │   ├── index.ts              # エントリーポイント
    │   └── types.ts              # 型定義集約
    ├── __tests__/
    │   ├── fixtures/             # テスト用 VRM サンプル (git追跡)
    │   ├── input/                # 手動確認用入力ファイル (.gitignore)
    │   ├── output/               # manual スクリプト出力 (.gitignore)
    │   └── manual/               # viewer.manual.ts
    ├── dist/                     # ビルド出力
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── tsup.config.ts

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

# mtoon-instancing (MToon インスタンシング)
pnpm -F mtoon-instancing run build
pnpm -F mtoon-instancing run dev
pnpm -F mtoon-instancing run test

# debug-viewer (VRM 確認用)
pnpm -F debug-viewer run build
pnpm -F debug-viewer run dev
pnpm -F debug-viewer run test
```

テクスチャアトラス機能は `packages/avatar-optimizer/src/texture-atlas/` に統合されたため、個別パッケージ向けのコマンドは不要です。`pnpm -F avatar-optimizer run test` がアトラス関連テストも実行します。

**pnpm monorepo コマンドの基本**:

| コマンド                         | 説明                                           |
| -------------------------------- | ---------------------------------------------- |
| `pnpm install`                   | 全ワークスペースの依存関係をインストール       |
| `pnpm build`                     | 全パッケージをビルド（ルートスクリプト）       |
| `pnpm -F <package> run <script>` | 特定のパッケージのスクリプトを実行             |
| `pnpm -r run <script>`           | すべてのパッケージでスクリプトを実行           |
| `pnpm -F <package> add <dep>`    | 特定のパッケージに依存関係を追加               |
| `pnpm link --global`             | パッケージをグローバルにリンク                 |
| `pnpm exec <command>`            | ローカル node_modules の実行可能ファイルを実行 |

## 重要な開発ルール

1. **React 依存なし**: このライブラリは React に依存しない純粋なユーティリティライブラリです
2. **ブラウザ環境専用**: @gltf-transform/core の WebIO を使用してブラウザ環境で動作
3. **モジュール形式**: 名前付きエクスポートを使用 (ESM/CJS の両形式をサポート)
4. **依存関係最小化**: ピア依存関係は @gltf-transform のみ
5. **テスト**: `packages/avatar-optimizer/tests/` や `packages/debug-viewer/__tests__/` で純粋関数のテストを記述

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

// tests/utils.test.ts 内
describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const result = calculateDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })
    expect(result).toBeCloseTo(5)
  })
})
```

**純粋関数 (ロジック検証用)**: 重要なビジネスロジックや複雑な計算は `packages/avatar-optimizer/tests/` や `packages/debug-viewer/__tests__/` で実行する Vitest テストでカバレッジを確保

**手動確認が必要な機能**: テクスチャアトラス化、メッシュ処理、ジオメトリ最適化など視覚的な確認が重要な場合、ブラウザベースのツールで検証します。

`packages/avatar-optimizer/tests/*.test.ts` でロジックを Vitest から実行し、ビジュアル検証はブラウザで行います。

**テスト Fixture フォルダ**:

| フォルダ    | パス                                             | 内容                        | Git 追跡 | 用途               |
| ----------- | ------------------------------------------------ | --------------------------- | -------- | ------------------ |
| `fixtures/` | `packages/debug-viewer/__tests__/fixtures/`      | 小さなテスト用 VRM サンプル | ✅ 必須  | CI/CD やテストで使用 |

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
  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'LOAD_FAILED' as const,
    message: `Failed to read file: ${String(error)}`,
  }))
    .andThen((arrayBuffer) =>
      ResultAsync.fromPromise(loadDocument(arrayBuffer), (error) => ({
        type: 'DOCUMENT_PARSE_FAILED' as const,
        message: String(error),
      })),
    )
    .map((document) => processFile(document))
}

// 内部向けヘルパー
function _processTextureAsync(
  texture: Texture,
): ResultAsync<Texture, ProcessingError> {
  return ResultAsync.fromPromise(compressTexture(texture), (error) => ({
    type: 'PROCESSING_FAILED' as const,
    message: String(error),
  }))
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
- **neverthrow**: 6.0+ (同期バリデーション・内部非同期処理の Result 型)
- **tsup**: 8.0+ (ビルドツール)

ピア依存関係を安装するユーザーに対して同じバージョンを強制してください。

**neverthrow の使用対象**:

- ✅ 同期関数の戻り値（Result 型）
- ✅ 内部向けの複雑な非同期処理（ResultAsync 型）
- ❌ 外部向けの非同期関数（Promise + throw を使用）

## Texture-Atlas モジュールについて

テクスチャアトラス化機能は `packages/avatar-optimizer/src/texture-atlas/` に統合されています。

- `index.ts`: `buildTextureAtlas` などメイン API をエクスポート
- `packing.ts`: Bin packing/Island 配置アルゴリズム
- `image.ts`: Jimp/canvas を用いた画像合成
- `uv-remapping.ts`: UV 書き換え + padding 処理
- `types.ts`: `AtlasBuildResult` などの型定義

ユニットテストは `packages/avatar-optimizer/tests/atlas.test.ts` や `packages/avatar-optimizer/tests/uv-remap.test.ts` にまとまっています。追加の治具は `packages/avatar-optimizer/tests/texture-atlas/` に配置して管理してください。

## MToon Instancing パッケージについて

**@xrift/mtoon-instancing** (`packages/mtoon-instancing/`) は複数の MToon マテリアルをインスタンシング化するための専門的なマテリアルです。`@xrift/avatar-optimizer` で生成されたパラメータテクスチャとテクスチャアトラスを消費し、SkinnedMesh でマテリアルを統合できます。

### 主な機能

- **MToonInstancingMaterial**: MToonNodeMaterial を拡張したクラス
  - 全19種類の数値パラメータを自動サンプリング（ParameterTexture から）
  - 8種類のテクスチャマップを自動設定（AtlasedTextureSet から）
- **スロット属性管理**: 頂点属性経由でマテリアルスロットをインスタンスごとに指定
- **SkinnedMesh 対応**: InstancedMesh 不要でスキニングアニメーションと互換

### ファイル構成

- `src/index.ts`: `MToonInstancingMaterial` クラス実装
- `src/types.ts`: 型定義
  - `ParameterTextureDescriptor`: パラメータテクスチャ情報（19パラメータ）
  - `AtlasedTextureSet`: アトラス化テクスチャセット（8種類）
  - `MaterialSlotAttributeConfig`: スロット属性メタデータ
  - `ParameterSemanticId`: パラメータセマンティクス ID（19種）
  - `DEFAULT_PARAMETER_LAYOUT`: デフォルトレイアウト定義

### API 利用例

```typescript
import { MToonInstancingMaterial } from '@xrift/mtoon-instancing'

const material = new MToonInstancingMaterial()
material.setParameterTexture({
  texture: packedParameterTexture,
  slotCount: 10,
  texelsPerSlot: 8,
  atlasedTextures: {
    baseColor: atlasBaseColorTexture,
    normal: atlasNormalTexture,
    shade: atlasShadeTexture,
    // 他のテクスチャ...
  }
})
```

### MToon Instancing クイックリンク

```bash
# ビルド
pnpm -F mtoon-instancing run build

# ウォッチ
pnpm -F mtoon-instancing run dev

# テスト
pnpm -F mtoon-instancing run test

# ドキュメント
cat packages/mtoon-instancing/README.md
```

### 対応パラメータ

| カテゴリ | パラメータ | テクセル | チャンネル |
|---------|-----------|---------|----------|
| 基本カラー | baseColor, shadeColor, emissiveColor, emissiveIntensity | 0-2 | RGB/A |
| シェーディング | shadingShift, shadingToony, shadingShiftTextureScale | 0-1 | RGB/A |
| リムライティング | rimLightingMix, parametricRimColor/Lift/FresnelPower | 5-6 | RGB/A |
| Matcap | matcapColor | 3 | RGB |
| アウトライン | outlineWidth/Color/LightingMix | 3-4 | RGB/A |
| UV アニメーション | uvAnimationScrollX/Y/Rotation | 6-7 | RGB/A |
| ノーマルマップ | normalScale | 7 | RG |

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

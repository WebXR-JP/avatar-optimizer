# @xrift/avatar-optimizer

XRift用アバターモデル最適化ライブラリ。

> ⚠️ **警告**: このプロジェクトは **開発進行中** です。実装の完成度は約 70-75% で、テスト失敗やビルドエラーがあります。本番環境での使用はお控えください。詳細は[実装状況](#実装状況)セクションを参照してください。

## 機能

- **テクスチャアトラス化**: 各マテリアルのテクスチャをアトラス化して1枚にする
- **Three.jsベース**: Three.js上で各編集を行う

## プロジェクト構成

このプロジェクトは **pnpm monorepo** として構成されています。

```
packages/
├── avatar-optimizer/              # メインライブラリ (VRM最適化 + テクスチャアトラス)
│   ├── src/
│   │   ├── core/                 # 最適化ロジック
│   │   ├── material/             # マテリアル・アトラス化処理
│   │   ├── vrm/                  # VRM 読み込み/エクスポート層
│   │   ├── types.ts              # 型定義集約
│   │   └── index.ts              # ライブラリエクスポート管理
│   ├── tests/                    # Vitest ユニットテスト
│   ├── dist/                     # ビルド出力 (ESM/型定義)
│   └── package.json
│
├── mtoon-instancing/             # MToon インスタンシング マテリアル
│   ├── src/
│   │   ├── index.ts              # MToonInstancingMaterial クラス
│   │   └── types.ts              # 型定義 (ParameterTextureDescriptor など)
│   ├── tests/                    # Vitest ユニットテスト
│   ├── dist/                     # ビルド出力 (ESM/型定義)
│   └── package.json
│
└── debug-viewer/                 # VRM 表示用デバッグビューア
    ├── src/
    │   ├── viewer/               # Three.js + @pixiv/three-vrm 実装
    │   ├── utils/                # レンダリングユーティリティ
    │   └── types.ts              # 型定義
    ├── __tests__/
    │   ├── fixtures/             # テスト用 VRM サンプル
    │   └── __tests__/            # Vitest ユニットテスト
    └── dist/                     # ビルド出力
```

## 実装状況

プロジェクトは **70-75% 完成** です。以下は各パッケージの実装状況です。

### パッケージ別の完成度

| パッケージ | 完成度 | 状態 |
|----------|--------|------|
| **avatar-optimizer** | 80% | 主要機能実装済み、テスト2件失敗 |
| **mtoon-instancing** | ~~95%~~ | ~~本体完成、シェーダーグラフ拡張待ち~~ 作り直しが必要 |
| **debug-viewer** | 60% | ビルドエラーで実行不可 |

### ✅ 実装済みの主要機能

**avatar-optimizer:**
- `optimizeModelMaterials()` - Three.js マテリアル最適化（完全実装）
- `combineMToonMaterials()` - マテリアル結合処理（724行）
- `createParameterTexture()` - パラメータテクスチャ生成（19パラメータ対応）
- `packTextures()` - MaxRects テクスチャパッキング
- `composeImagesToAtlas()` - WebGL オフスクリーン描画によるアトラス合成
- `applyPlacementsToGeometries()` - UV 座標再マッピング

**mtoon-instancing:**
- **NodeMaterialがWebXRで使えないことが発覚したので現状白紙**
- ~~`MToonInstancingMaterial` クラス（380行、完全実装）~~
- ~~パラメータテクスチャの自動サンプリング~~
- ~~アトラステクスチャの自動設定~~
- ~~スロット属性管理~~

**debug-viewer:**
- VRM ファイル読み込み機能
- 3D レンダリング表示
- テクスチャビューア

### ❌ 未実装・進行中の機能

| 機能 | 状態 |
|------|------|
| `calculateVRMStatistics()` | 未実装（型定義のみ） |
| UV アニメーション scroll パラメータ | 部分実装（TODO コメント） |
| SkinnedMesh 完全対応 | 部分実装（スキニング情報が破棄） |
| debug-viewer ビルド | 失敗中（TypeScript エラー 6件） |

### 🧪 テスト状況

- **成功**: 28/36件 (78%)
- **失敗**: 3件（UV 変換関連）
- **mtoon-instancing**: 3/3 成功 ✓

### 🏗️ ビルド状況

- `avatar-optimizer`: ✓ 成功
- `mtoon-instancing`: ✓ 成功
- `debug-viewer`: ✗ 失敗（TypeScript コンパイルエラー）

---

## API

### `optimizeModelMaterials(objects: Object3D[], options?: OptimizationOptions): ResultAsync<OptimizedMaterialResult, MaterialOptimizationError>`

Three.js オブジェクトのマテリアルを最適化します。複数の MToonNodeMaterial をテクスチャパッキング・アトラス化し、MToonInstancingMaterial に統合します。

#### パラメータ

- `objects`: 最適化対象の Three.js オブジェクトの配列
- `options` (オプション): 最適化オプション

#### 戻り値

- `ResultAsync<OptimizedMaterialResult, MaterialOptimizationError>`: 最適化結果を返す


## 開発

### セットアップ

```bash
# 依存関係をインストール（全ワークスペース）
pnpm install
```

### ビルド・開発コマンド

**全パッケージ操作:**

```bash
# 全パッケージのビルド
pnpm build

# 全パッケージをウォッチモード
pnpm dev

# 全パッケージのテスト実行
pnpm test

# Lint チェック
pnpm lint

# コード フォーマット
pnpm format
```

**特定パッケージ操作:**

```bash
# avatar-optimizer のビルド
pnpm -F avatar-optimizer run build

# avatar-optimizer の開発モード（ウォッチ）
pnpm -F avatar-optimizer run dev

# avatar-optimizer のテスト
pnpm -F avatar-optimizer run test

# mtoon-instancing のビルド
pnpm -F mtoon-instancing run build

# mtoon-instancing の開発モード（ウォッチ）
pnpm -F mtoon-instancing run dev

# mtoon-instancing のテスト
pnpm -F mtoon-instancing run test

# debug-viewer のビルド
pnpm -F debug-viewer run build

# debug-viewer の開発モード
pnpm -F debug-viewer run dev
```

## ライセンス

MIT

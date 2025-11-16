# @xrift/avatar-optimizer

XRift用アバターモデル最適化ライブラリ。

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

## API

### `setAtlasTexturesToObjectsWithCorrectUV(rootNode: Object3D, atlasSize?: number): Promise<Result<void, Error>>`

Three.js オブジェクトのツリーのメッシュ及びそのマテリアルを走査し、複数の MToonMaterial をテクスチャパッキングしてアトラス化。アトラス化したテクスチャを各マテリアルに設定し、対応するメッシュの UV を自動修正します。

#### パラメータ

- `rootNode`: 最適化対象の Three.js オブジェクトのルートノード
- `atlasSize` (オプション): 生成するアトラス画像のサイズ（ピクセル、デフォルト: `2048`）

#### 戻り値

- `Promise<Result<void, Error>>`: 成功時は `ok()`、失敗時は `err(error)` を返す

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

# debug-viewer のビルド
pnpm -F debug-viewer run build

# debug-viewer の開発モード
pnpm -F debug-viewer run dev
```

## ライセンス

MIT

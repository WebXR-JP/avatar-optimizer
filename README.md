# @xrift/avatar-optimizer

WebXR アプリケーション向け VRM モデル最適化ライブラリ。

## 機能

- **VRM 読み込み/エクスポート**: URL / File / Blob / ArrayBuffer から VRM を読み込み、バイナリとしてエクスポート
- **テクスチャアトラス化**: 複数マテリアルのテクスチャを 1 枚のアトラスに統合
- **マテリアル統合**: MToon マテリアルを統合してドローコール数を削減
- **VRM0 → VRM1 マイグレーション**: スケルトン・SpringBone の自動変換

## インストール

```bash
npm install @xrift/avatar-optimizer
# または
pnpm add @xrift/avatar-optimizer
```

### Peer Dependencies

```bash
npm install @gltf-transform/core @gltf-transform/extensions @pixiv/three-vrm @pixiv/three-vrm-materials-mtoon three
```

## 使い方

### VRM の読み込み

```typescript
import { loadVRM } from '@xrift/avatar-optimizer'

// URL から読み込み
const result = await loadVRM('/path/to/model.vrm')

if (result.isOk()) {
  const vrm = result.value
  scene.add(vrm.scene)
}

// File から読み込み (ファイルアップロード)
const fileResult = await loadVRM(file)

// ArrayBuffer から読み込み
const bufferResult = await loadVRM(arrayBuffer)
```

### VRM のエクスポート

```typescript
import { exportVRM } from '@xrift/avatar-optimizer'

const result = await exportVRM(vrm)

if (result.isOk()) {
  // ブラウザでダウンロード
  const blob = new Blob([result.value], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'model.vrm'
  a.click()
  URL.revokeObjectURL(url)

  // Node.js でファイル書き出し
  // fs.writeFileSync('output.vrm', Buffer.from(result.value))
}
```

### VRM の最適化

```typescript
import { loadVRM, optimizeModel, exportVRM } from '@xrift/avatar-optimizer'

// VRM を読み込み
const loadResult = await loadVRM('/model.vrm')
if (loadResult.isErr()) {
  console.error(loadResult.error)
  return
}
const vrm = loadResult.value

// 最適化を実行
const optimizeResult = await optimizeModel(vrm, {
  migrateVRM0ToVRM1: true,  // VRM0 → VRM1 マイグレーション
  atlas: {
    defaultResolution: 2048,  // アトラス解像度
    slotResolutions: {        // スロットごとの解像度
      normalMap: 1024,
      emissiveMap: 512,
    },
  },
})

if (optimizeResult.isErr()) {
  console.error(optimizeResult.error)
  return
}

// 最適化結果を確認
console.log('統合グループ数:', optimizeResult.value.groups.size)

// エクスポート
const exportResult = await exportVRM(vrm)
```

## API リファレンス

### `loadVRM(source): ResultAsync<VRM, VRMLoaderError>`

VRM を読み込みます。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `source` | `string \| File \| Blob \| ArrayBuffer` | VRM ソース |

### `exportVRM(vrm, options?): ResultAsync<ArrayBuffer, ExportVRMError>`

VRM をバイナリとしてエクスポートします。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `vrm` | `VRM` | エクスポート対象 |
| `options.binary` | `boolean` | バイナリ形式で出力 (default: `true`) |

### `optimizeModel(vrm, options?): ResultAsync<CombinedMeshResult, OptimizationError>`

VRM のマテリアルを最適化します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `vrm` | `VRM` | 最適化対象 |
| `options.migrateVRM0ToVRM1` | `boolean` | VRM0→VRM1 マイグレーション |
| `options.atlas.defaultResolution` | `number` | デフォルトアトラス解像度 (default: `2048`) |
| `options.atlas.slotResolutions` | `Record<string, number>` | スロットごとの解像度オーバーライド |

### ユーティリティ関数

| 関数 | 説明 |
|------|------|
| `migrateSkeletonVRM0ToVRM1(scene)` | スケルトンを VRM0 から VRM1 形式に変換 |
| `migrateSpringBone(vrm)` | SpringBone を VRM1 形式に調整 |

## プロジェクト構成

このプロジェクトは **pnpm monorepo** として構成されています。

```
packages/
├── avatar-optimizer/    # メインライブラリ
├── mtoon-atlas/         # MToon Atlas マテリアル
└── debug-viewer/        # VRM デバッグビューア
```

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

# mtoon-atlas のビルド
pnpm -F mtoon-atlas run build

# mtoon-atlas の開発モード（ウォッチ）
pnpm -F mtoon-atlas run dev

# mtoon-atlas のテスト
pnpm -F mtoon-atlas run test

# debug-viewer のビルド
pnpm -F debug-viewer run build

# debug-viewer の開発モード
pnpm -F debug-viewer run dev
```

## ライセンス

MIT

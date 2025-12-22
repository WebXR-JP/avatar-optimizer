# @webxr-jp/avatar-optimizer

WebXR アプリケーション向け VRM モデル最適化ライブラリ。

## 機能

- **VRM 読み込み/エクスポート**: URL / File / Blob / ArrayBuffer から VRM を読み込み、バイナリとしてエクスポート
- **テクスチャアトラス化**: 複数マテリアルのテクスチャを 1 枚のアトラスに統合
- **マテリアル統合**: MToon マテリアルを統合してドローコール数を削減
- **VRM0 → VRM1 マイグレーション**: スケルトン・SpringBone の自動変換
- **メッシュ簡略化**: meshoptimizer による頂点削減でポリゴン数を削減
- **テクスチャ圧縮**: KTX2 形式（UASTC）でアトラステクスチャを圧縮し、ファイルサイズとメモリ効率を改善

## インストール

```bash
npm install @webxr-jp/avatar-optimizer
# または
pnpm add @webxr-jp/avatar-optimizer
```

### Peer Dependencies

```bash
npm install @gltf-transform/core @gltf-transform/extensions @pixiv/three-vrm @pixiv/three-vrm-materials-mtoon three
```

## 使い方

### VRM の読み込み

```typescript
import { loadVRM } from '@webxr-jp/avatar-optimizer'

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
import { exportVRM } from '@webxr-jp/avatar-optimizer'

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

### テクスチャ圧縮 (KTX2)

エクスポート時に `textureCompression` オプションを指定すると、アトラステクスチャを KTX2 形式（UASTC）で圧縮できます。GPU 対応の圧縮フォーマットでファイルサイズを削減しつつ、ランタイムのメモリ効率を向上させます。

```typescript
import { exportVRM, UastcQuality } from '@webxr-jp/avatar-optimizer'

const result = await exportVRM(vrm, {
  textureCompression: {
    quality: UastcQuality.Default,  // 品質レベル (0-4)
    compressionLevel: 3,            // 圧縮レベル (0-5)
    generateMipmaps: false,         // ミップマップ生成
    supercompression: true,         // Zstandard 超圧縮
  },
})
```

> **注意**: テクスチャ圧縮はブラウザ環境専用です（WebAssembly 使用）。KTX2 テクスチャを読み込むには `KTX2Loader` が必要です。

### VRM の最適化

```typescript
import { loadVRM, optimizeModel, exportVRM } from '@webxr-jp/avatar-optimizer'

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
  simplify: {                 // メッシュ簡略化オプション
    targetRatio: 0.5,         // 頂点数を50%に削減
    targetError: 0.01,        // 許容エラー値
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
| `options.textureCompression` | `TextureCompressionOptions` | テクスチャ圧縮オプション（省略時は圧縮なし） |

#### TextureCompressionOptions

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|------------|------|
| `quality` | `UastcQuality` | `2` (Default) | UASTC 品質レベル (0=Fastest, 4=VerySlow) |
| `compressionLevel` | `number` | `3` | 圧縮レベル (0-5) |
| `generateMipmaps` | `boolean` | `false` | ミップマップを生成するか |
| `supercompression` | `boolean` | `true` | Zstandard 超圧縮を使用するか |

### `optimizeModel(vrm, options?): ResultAsync<CombinedMeshResult, OptimizationError>`

VRM のマテリアルを最適化します。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `vrm` | `VRM` | 最適化対象 |
| `options.migrateVRM0ToVRM1` | `boolean` | VRM0→VRM1 マイグレーション |
| `options.atlas.defaultResolution` | `number` | デフォルトアトラス解像度 (default: `2048`) |
| `options.atlas.slotResolutions` | `Record<string, number>` | スロットごとの解像度オーバーライド |
| `options.simplify` | `SimplifyOptions` | メッシュ簡略化オプション |

#### SimplifyOptions

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|------------|------|
| `targetRatio` | `number` | `0.5` | 目標頂点削減率 (0.0-1.0)。0.5 = 頂点数を50%に削減 |
| `targetError` | `number` | `0.01` | 許容エラー値 (0.0-1.0)。形状変化の許容度 |
| `lockBorder` | `boolean` | `true` | 境界頂点をロック。メッシュ端の頂点を固定 |
| `uvWeight` | `number` | `1.0` | UV属性の重み。高いほどテクスチャ座標を保護 |
| `normalWeight` | `number` | `0.5` | 法線属性の重み。高いほどシェーディングを保護 |
| `morphTargetHandling` | `'skip' \| 'discard'` | `'skip'` | MorphTarget持ちメッシュの処理方法 |

> **注意**: 表情用メッシュ（excludedMeshes）は自動的に簡略化対象から除外されます。MorphTargetを持つメッシュは `morphTargetHandling` オプションで制御できます。

### ユーティリティ関数

| 関数 | 説明 |
|------|------|
| `migrateSkeletonVRM0ToVRM1(scene)` | スケルトンを VRM0 から VRM1 形式に変換 |
| `migrateSpringBone(vrm)` | SpringBone を VRM1 形式に調整 |

## プロジェクト構成

このプロジェクトは **pnpm monorepo** として構成されています。

```
packages/
├── avatar-optimizer/      # メインライブラリ
├── mtoon-atlas/           # MToon Atlas マテリアル
├── texture-compression/   # KTX2 テクスチャ圧縮ユーティリティ
└── debug-viewer/          # VRM デバッグビューア
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

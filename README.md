# @xrift/avatar-optimizer

WebXR アプリケーション向けアバターモデル最適化ライブラリ。

## 機能

- **テクスチャ分析**: VRM モデルから baseColor テクスチャを抽出・分析
- **統計計算**: ポリゴン数、テクスチャ数、マテリアル数などを計算
- **前処理パイプライン**: VRM モデル向けの包括的な前処理ワークフロー
- **ブラウザ互換**: @gltf-transform/core の WebIO を使用してブラウザ環境で動作

## インストール

```bash
npm install @xrift/avatar-optimizer
```

### ピア依存関係

このライブラリには以下のピア依存関係が必要です：

```bash
npm install @gltf-transform/core @gltf-transform/extensions
```

## 使用方法

### 基本的な前処理

```typescript
import { preprocessVRM } from '@xrift/avatar-optimizer'

const file: File = // ... あなたの VRM ファイル
const result = await preprocessVRM(file, {
  optimize: true,
  optimization: {
    compressTextures: true,
    maxTextureSize: 2048,
    reduceMeshes: false,
  },
})

console.log('元の統計:', result.originalStats)
console.log('最終統計:', result.finalStats)
```

### 手動最適化

```typescript
import { optimizeVRM, calculateVRMStatistics } from '@xrift/avatar-optimizer'

// 統計を計算
const stats = await calculateVRMStatistics(file)

// VRM を最適化
const optimizedFile = await optimizeVRM(file, {
  compressTextures: true,
  maxTextureSize: 2048,
  reduceMeshes: false,
})
```

## API

### `preprocessVRM(file: File, options: PreprocessingOptions): Promise<PreprocessingResult>`

検証、最適化、統計計算を実行するメイン前処理関数。

#### パラメータ

- `file`: 処理対象の VRM ファイル
- `options`: 前処理オプション
  - `optimize`: 最適化を有効化
  - `optimization`: 最適化設定 (オプション)

#### 戻り値

- `PreprocessingResult`: 処理済みファイルと統計を含むオブジェクト

### `optimizeVRM(file: File, options: OptimizationOptions): Promise<File>`

テクスチャ圧縮とメッシュ削減により VRM モデルを最適化。

#### パラメータ

- `file`: 最適化対象の VRM ファイル
- `options`: 最適化オプション
  - `compressTextures`: テクスチャ圧縮を有効化
  - `maxTextureSize`: 最大テクスチャサイズ (ピクセル)
  - `reduceMeshes`: メッシュ削減を有効化
  - `targetPolygonCount`: ターゲットポリゴン数 (オプション)

### `calculateVRMStatistics(file: File): Promise<VRMStatistics>`

VRM モデルの統計を計算。

#### 戻り値

- `VRMStatistics`: 以下を含む統計オブジェクト：
  - `polygonCount`: ポリゴン数
  - `textureCount`: テクスチャ数
  - `materialCount`: マテリアル数
  - `boneCount`: ボーン数
  - `meshCount`: メッシュ数
  - `fileSizeMB`: ファイルサイズ (MB)
  - `vramEstimateMB`: 推定 VRAM 使用量 (MB)

## 開発

```bash
# 依存関係をインストール
npm install

# ビルド
npm run build

# ウォッチモード
npm run dev
```

## ライセンス

MIT

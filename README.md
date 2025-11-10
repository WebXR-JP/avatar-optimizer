# @xrift/avatar-optimizer

WebXR アプリケーション向けアバターモデル最適化ライブラリ。

## 機能

- **テクスチャ圧縮**: VRM モデルのテクスチャサイズを削減
- **メッシュ削減**: ポリゴン数を削減してファイルサイズを最適化
- **統計計算**: ポリゴン数、テクスチャ数、マテリアル数などを計算
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

### 基本的な最適化

```typescript
import { optimizeVRM } from '@xrift/avatar-optimizer'

const file: File = // ... あなたの VRM ファイル
const optimizedFile = await optimizeVRM(file, {
  compressTextures: true,
  maxTextureSize: 2048,
  reduceMeshes: false,
})
```

### 統計情報の計算

```typescript
import { calculateVRMStatistics } from '@xrift/avatar-optimizer'

const stats = await calculateVRMStatistics(file)
console.log('統計情報:', stats)
```

## API

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

## CLI (コマンドラインツール)

`xrift-optimize` CLI を使用して、コマンドラインから VRM ファイルを最適化できます。

### インストール

グローバルにインストール：

```bash
npm install -g @xrift/avatar-optimizer
```

または、ローカル開発時：

```bash
npm link
```

### 基本的な使用方法

```bash
xrift-optimize input.vrm -o output.vrm
```

### コマンドラインオプション

```
Usage: xrift-optimize [options] <input>

VRM model optimization CLI tool

Arguments:
  input                           Path to input VRM file

Options:
  -V, --version                   output the version number
  -o, --output <path>             Path to output VRM file (default: "output.vrm")
  --compress-textures             Enable texture compression (default: true)
  --max-texture-size <size>       Maximum texture size in pixels (default: "2048")
  --reduce-meshes                 Enable mesh reduction (default: false)
  --target-polygon-count <count>  Target polygon count for mesh reduction
  -h, --help                      display help for command
```

### 使用例

#### デフォルト設定で最適化

```bash
xrift-optimize avatar.vrm -o avatar-optimized.vrm
```

#### テクスチャサイズを指定

```bash
xrift-optimize avatar.vrm -o avatar-optimized.vrm --max-texture-size 1024
```

#### メッシュ削減を有効化

```bash
xrift-optimize avatar.vrm -o avatar-optimized.vrm --reduce-meshes --target-polygon-count 10000
```

#### ヘルプを表示

```bash
xrift-optimize --help
```

#### バージョンを確認

```bash
xrift-optimize --version
```

## 開発

```bash
# 依存関係をインストール
npm install

# ビルド
npm run build

# ウォッチモード
npm run dev

# CLI のローカルテスト
node dist/cli.cjs input.vrm -o output.vrm

# または npm link を使用して
npm link
xrift-optimize input.vrm -o output.vrm
```

### テストディレクトリ

```
__tests__/
  ├── fixtures/        # テスト用サンプルファイル (git追跡)
  ├── input/          # 手動テスト用入力ファイル (.gitignore)
  ├── output/         # CLI出力ファイル (.gitignore)
  └── manual/         # 手動テストスクリプト (git追跡)
```

手動テストスクリプトの実行：

```bash
npx tsx __tests__/manual/cli.manual.ts
```

## ライセンス

MIT

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

### サブコマンド

```
Usage: xrift-optimize [options] [command]

Commands:
  validate <input>               VRMファイルのバリデーションを実行
  show-json <input>              VRM内部のGLTF JSON全体を表示（デフォルト整形出力・純JSON）
  optimize <input>               VRM最適化を実行（従来の動作）
  help [command]                 display help for command
```

`optimize` コマンド共通オプション:

- `-o, --output <path>`: 出力パス (デフォルト: `output.vrm`)
- `--compress-textures`: テクスチャ圧縮を有効化 (デフォルト: `true`)
- `--max-texture-size <size>`: 最大テクスチャサイズ (デフォルト: `2048`)
- `--reduce-meshes`: メッシュ削減を有効化
- `--target-polygon-count <count>`: メッシュ削減の目標ポリゴン数

`show-json` コマンドオプション:

- `--no-pretty`: GLTF JSON をコンパクト表示に切り替える（デフォルトは整形出力）

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

#### GLTF JSON を確認

```bash
xrift-optimize show-json avatar.vrm                   # デフォルトで整形表示
xrift-optimize show-json avatar.vrm --no-pretty       # コンパクト表示
xrift-optimize show-json avatar.vrm > avatar.json     # 標準出力が純JSONなのでそのまま保存可
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
node dist/cli.mjs input.vrm -o output.vrm

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

## 外部ライブラリ

### TexTransCore

このプロジェクトは、高度なテクスチャ処理を実現するために [TexTransCore](https://github.com/ReinaS-64892/TexTransCore) を統合しています。

#### TexTransCore とは

**TexTransCore** は、[Reina_Sakiria](https://github.com/ReinaS-64892)さんが開発したテクスチャ処理のための .NET ライブラリです。[TexTransTool](https://github.com/ReinaS-64892/TexTransTool) の汎用 C# コアコンポーネントとして設計されており、Unity に依存しない純粋な .NET ライブラリとして利用できます。

#### WASM 化の進捗

本リポジトリ内におけるTexTransCore は現在、WebAssembly (WASM) への対応を進めています：

- **Phase 1 (完了)**: NativeAOT-LLVM 化
  - .NET 10.0 RC2 + NativeAOT-LLVM による WASM ビルド対応
  - WIT (WebAssembly Interface Types) インターフェース定義
  - マネージド DLL の生成と最適化

- **Phase 2 (進行中)**: componentize-dotnet 統合
  - JavaScript からの直接呼び出し対応
  - WIT コンポーネントモデルの実装
  - WASM ネイティブバイナリ生成 (Windows CI/CD)

#### 開発者向け情報

TexTransCore の開発や WASM 化ロードマップの詳細は、以下を参照してください：

```bash
cat third-party/TexTransCore/CLAUDE.md
```

#### ライセンス

TexTransCore は MIT ライセンスの下で公開されています。詳細は [ThirdPartyNotices.txt](./ThirdPartyNotices.txt) を参照してください。

---

## ライセンス

MIT

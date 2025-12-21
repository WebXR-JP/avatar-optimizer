# @xrift/texture-compression

avatar-optimizer向けのテクスチャ圧縮ユーティリティパッケージ。Basis Universal WASMを使用してKTX2形式（UASTC）でテクスチャを圧縮します。

## 特徴

- **KTX2形式出力**: GPU対応の圧縮テクスチャフォーマット
- **UASTC圧縮**: 高品質なユニバーサルテクスチャ圧縮
- **Zstandard超圧縮**: オプションでさらなるファイルサイズ削減
- **ブラウザ専用**: WebAssemblyベースで高速処理

## インストール

```bash
pnpm add @xrift/texture-compression
```

## 使用方法

### 基本的な圧縮

```typescript
import { compressToKtx2, initBasisEncoder } from '@xrift/texture-compression'

// WASMモジュールを初期化（初回のみ）
const initResult = await initBasisEncoder()
if (initResult.isErr()) {
  console.error('初期化エラー:', initResult.error)
  return
}

// RGBAピクセルデータを圧縮
const imageData = new Uint8Array(width * height * 4) // RGBA
const result = await compressToKtx2(imageData, width, height)

if (result.isOk()) {
  const ktx2Data = result.value.data // Uint8Array
  console.log(`圧縮完了: ${result.value.originalSize} → ${result.value.compressedSize} bytes`)
}
```

### オプション設定

```typescript
import { compressToKtx2, UastcQuality } from '@xrift/texture-compression'

const result = await compressToKtx2(imageData, width, height, {
  quality: UastcQuality.Default,    // 品質レベル (0-4)
  compressionLevel: 3,              // 圧縮レベル (0-5)
  generateMipmaps: false,           // ミップマップ生成
  supercompression: true,           // Zstandard超圧縮
})
```

### Y軸反転

WebGLテクスチャ座標系（左下原点）からKTX2座標系（左上原点）への変換が必要な場合：

```typescript
import { flipImageY, compressToKtx2 } from '@xrift/texture-compression'

const flippedData = flipImageY(imageData, width, height)
const result = await compressToKtx2(flippedData, width, height)
```

### エンコーダー管理

```typescript
import {
  initBasisEncoder,
  disposeBasisEncoder,
  isBasisEncoderReady,
} from '@xrift/texture-compression'

// 初期化確認
if (!isBasisEncoderReady()) {
  await initBasisEncoder()
}

// 使用後にリソース解放（オプション）
disposeBasisEncoder()
```

## API

### `compressToKtx2(imageData, width, height, options?)`

RGBAピクセルデータをKTX2形式に圧縮します。

- `imageData`: `Uint8Array` - RGBAピクセルデータ（width × height × 4 bytes）
- `width`: `number` - 画像の幅
- `height`: `number` - 画像の高さ
- `options`: `Ktx2CompressionOptions` - 圧縮オプション（省略可）

戻り値: `ResultAsync<Ktx2CompressionResult, CompressionError>`

### `flipImageY(imageData, width, height)`

Y軸を反転したピクセルデータを生成します。

### `initBasisEncoder(wasmDir?)`

BasisEncoder WASMモジュールを初期化します。

- `wasmDir`: `string` - WASMファイルのディレクトリURL（省略時はパッケージ内のwasmディレクトリ）

### `disposeBasisEncoder()`

キャッシュされたモジュールを解放します。

### `isBasisEncoderReady()`

WASMモジュールが初期化済みかどうかを返します。

## 型定義

### `Ktx2CompressionOptions`

```typescript
interface Ktx2CompressionOptions {
  quality?: UastcQuality      // UASTC品質レベル (デフォルト: Default)
  compressionLevel?: number   // 圧縮レベル 0-5 (デフォルト: 3)
  generateMipmaps?: boolean   // ミップマップ生成 (デフォルト: false)
  supercompression?: boolean  // Zstandard超圧縮 (デフォルト: true)
}
```

### `UastcQuality`

```typescript
enum UastcQuality {
  Fastest = 0,   // 最速、最低品質
  Faster = 1,    // 高速
  Default = 2,   // デフォルト
  Slower = 3,    // 低速、高品質
  VerySlow = 4,  // 最高品質
}
```

### `Ktx2CompressionResult`

```typescript
interface Ktx2CompressionResult {
  data: Uint8Array      // 圧縮後のKTX2バイナリデータ
  originalSize: number  // 元のサイズ (bytes)
  compressedSize: number // 圧縮後のサイズ (bytes)
  width: number         // 画像の幅
  height: number        // 画像の高さ
}
```

## 注意事項

- ブラウザ環境専用です（Node.js非対応）
- 2のべき乗でないサイズの画像は警告が出ますが処理は継続します
- 大きなテクスチャの場合、出力バッファは最大24MBに制限されています

## ライセンス

MIT

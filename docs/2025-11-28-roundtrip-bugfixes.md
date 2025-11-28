# MToonAtlas ラウンドトリップバグ修正

## 概要

MToonAtlasMaterial を使用した最適化済み VRM のエクスポート → インポート（ラウンドトリップ）で発生していた2つのバグを修正しました。

1. **パラメータテクスチャが真っ黒になる問題**
2. **テクスチャの colorSpace が正しく保持されない問題**

## 修正内容

### 1. パラメータテクスチャが真っ黒になる問題

#### 原因

MToonAtlasExporterPlugin でパラメータテクスチャを PNG にエクスポートする際、2つの問題がありました：

1. **Float32Array の変換不正**: パラメータテクスチャは `Float32Array`（0.0〜1.0）で格納されているが、`new Uint8ClampedArray(image.data)` で直接変換していたため、浮動小数点値が整数値（0〜1）にクリップされていた

2. **プリマルチプライドアルファ問題**: PNG 形式は alpha=0 のピクセルを「完全に透明」として扱い、Canvas API 経由での保存時に RGB 値が失われる。パラメータテクスチャでは alpha=0 でも RGB 値が意味を持つため、データが消失していた

#### 修正箇所

**packages/mtoon-atlas/src/extensions/MToonAtlasExporterPlugin.ts**

```typescript
// Float32Array の場合は 0.0-1.0 を 0-255 に変換
const srcData = image.data
const isFloatData = srcData instanceof Float32Array ||
  srcData.constructor?.name === 'Float32Array'
const pixelCount = image.width * image.height * 4
const uint8Data = new Uint8ClampedArray(pixelCount)
for (let i = 0; i < pixelCount; i++) {
  const value = srcData[i]
  let convertedValue = isFloatData
    ? Math.round(Math.min(1, Math.max(0, value)) * 255)
    : value

  // alpha チャンネル（i % 4 === 3）を強制的に 255 にする
  // PNG 保存時にアルファが 0 だと RGB 値が失われるため
  if (forceOpaqueAlpha && i % 4 === 3) {
    convertedValue = 255
  }

  uint8Data[i] = convertedValue
}
```

### 2. テクスチャの colorSpace が正しく保持されない問題

#### 原因

2つの問題がありました：

1. **アトラス生成時に colorSpace が未設定**: avatar-optimizer でアトラステクスチャを生成する際、colorSpace を設定していなかった

2. **GLTFLoader のテクスチャキャッシュ問題**: GLTFLoader は同じインデックスのテクスチャを内部でキャッシュし、同一オブジェクトを返す。並列で複数のテクスチャをロードすると、後から設定した colorSpace が以前のテクスチャの colorSpace を上書きしてしまっていた

#### 修正箇所

**packages/avatar-optimizer/src/types.ts** - colorSpace 定義を追加

```typescript
export const MTOON_TEXTURE_SLOT_COLOR_SPACES: Record<MToonTextureSlot, ColorSpace> = {
  map: SRGBColorSpace,
  normalMap: NoColorSpace,
  emissiveMap: SRGBColorSpace,
  shadeMultiplyTexture: SRGBColorSpace,
  shadingShiftTexture: NoColorSpace,
  matcapTexture: SRGBColorSpace,
  rimMultiplyTexture: SRGBColorSpace,
  outlineWidthMultiplyTexture: NoColorSpace,
  uvAnimationMaskTexture: NoColorSpace,
}
```

**packages/avatar-optimizer/src/util/texture/composite.ts** - colorSpace オプション追加

```typescript
export interface ComposeImageOptions {
  width: number
  height: number
  colorSpace?: ColorSpace  // 追加
}

// テクスチャ生成時に colorSpace を設定
tex.colorSpace = colorSpace
```

**packages/avatar-optimizer/src/process/gen-atlas.ts** - colorSpace を指定

```typescript
const atlas = yield* composeImagesToAtlas(layers, {
  width: 2048,
  height: 2048,
  colorSpace: MTOON_TEXTURE_SLOT_COLOR_SPACES[slot],
})
```

**packages/mtoon-atlas/src/extensions/MToonAtlasLoaderPlugin.ts** - テクスチャを clone

```typescript
const loadedTexture = await this.parser.loadTexture(textureInfo.index)
// GLTFLoader がテクスチャをキャッシュするため、clone() して独立したオブジェクトを使用
const texture = loadedTexture.clone()
texture.source = loadedTexture.source // image ソースを共有
texture.flipY = false

const srgbTextures = ['baseColor', 'shade', 'emissive', 'matcap', 'rim']
if (srgbTextures.includes(key)) {
  texture.colorSpace = SRGBColorSpace
} else {
  texture.colorSpace = NoColorSpace
}
```

## 追加したテスト

**packages/avatar-optimizer/tests/browser/MToonAtlasRoundtrip.test.ts**

| テスト名 | 検証内容 |
|---------|---------|
| `should preserve parameter texture pixel data after roundtrip` | パラメータテクスチャのピクセルデータがラウンドトリップ後も保持されることを確認 |
| `should preserve texture colorSpace after roundtrip` | アトラステクスチャの colorSpace がラウンドトリップ後も正しく保持されることを確認 |

## テクスチャの colorSpace 分類

### sRGB（カラーデータ）
- `map` (baseColor)
- `emissiveMap`
- `shadeMultiplyTexture`
- `matcapTexture`
- `rimMultiplyTexture`

### NoColorSpace/Linear（非カラーデータ）
- `normalMap`
- `shadingShiftTexture`
- `outlineWidthMultiplyTexture`
- `uvAnimationMaskTexture`

## テスト実行

```bash
# avatar-optimizer のテスト
pnpm -F avatar-optimizer run test

# mtoon-atlas のビルド
pnpm -F mtoon-atlas run build
```

## 関連ファイル

- `packages/mtoon-atlas/src/extensions/MToonAtlasExporterPlugin.ts`
- `packages/mtoon-atlas/src/extensions/MToonAtlasLoaderPlugin.ts`
- `packages/avatar-optimizer/src/types.ts`
- `packages/avatar-optimizer/src/util/texture/composite.ts`
- `packages/avatar-optimizer/src/process/gen-atlas.ts`
- `packages/avatar-optimizer/tests/browser/MToonAtlasRoundtrip.test.ts`

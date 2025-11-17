# @xrift/mtoon-atlas

MToon shader atlas optimization utilities for three-vrm WebGL applications.

## Overview

`@xrift/mtoon-atlas` provides `MToonAtlasMaterial` - a WebGL-based custom MToon material that consumes the atlas + packed parameter textures produced by `@xrift/avatar-optimizer`.

本パッケージは `SkinnedMesh` で使用中の複数 `MToonMaterial` を 1 つにまとめ、頂点属性経由で元マテリアルを参照する形に統一することを目的としています。

**架構戦略**: `MToonAtlasMaterial` は `THREE.ShaderMaterial` を継承した WebGL ベースの実装です。WebXR 環境での互換性を重視しており、WebGPU 対応は将来の検討事項となっています。

## Features

- **ShaderMaterial ベースのカスタムマテリアル**: WebGL 標準対応、WebXR 環境で動作確実
- **パラメータテクスチャサポート**: 全19種類の数値パラメータをテクスチャからサンプリング
  - baseColor, shadeColor, emissiveColor, emissiveIntensity
  - shadingShift, shadingToony, shadingShiftTextureScale
  - rimLightingMix, parametricRimColor, parametricRimLift, parametricRimFresnelPower
  - matcapColor, outlineWidth, outlineColor, outlineLightingMix
  - uvAnimationScrollX, uvAnimationScrollY, uvAnimationRotation, normalScale
- **アトラステクスチャ自動設定**: 8種類のテクスチャマップを自動バインディング
  - baseColor, shade, shadingShift, normal, emissive, matcap, rim, uvAnimationMask
- **頂点属性ベースのスロット管理**: 元マテリアルのスロット index を頂点属性で受け取る
- **SkinnedMesh 対応**: InstancedMesh 不要でスキニングアニメーションと互換

## Installation

```bash
pnpm add @xrift/mtoon-atlas
```

## Requirements

- Three.js r181+
- @pixiv/three-vrm 3.4.4+
- @pixiv/three-vrm-materials-mtoon 3.4.4+

## Usage

### 基本的な使い方

```typescript
import { Float32BufferAttribute, Mesh } from 'three'
import { MToonAtlasMaterial } from '@xrift/mtoon-atlas'

// 1. SkinnedMesh のジオメトリに slot index 属性を追加する
const slotIndices = new Float32Array(vertexCount) // avatar-optimizer から得たインデックス
geometry.setAttribute('mtoonMaterialSlot', new Float32BufferAttribute(slotIndices, 1))

// 2. パラメータテクスチャとアトラステクスチャを設定
const material = new MToonAtlasMaterial()
material.setParameterTexture({
  texture: packedParameterTexture,
  slotCount: packedSlotCount,
  texelsPerSlot: 8,

  // アトラス化されたテクスチャを指定すると自動的にマテリアルに設定されます
  atlasedTextures: {
    baseColor: atlasMainTexture,
    normal: atlasNormalTexture,
    emissive: atlasEmissiveTexture,
    shade: atlasShadeTexture,
    matcap: atlasMatcapTexture,
    rim: atlasRimTexture,
    shadingShift: atlasShadingShiftTexture,
    uvAnimationMask: atlasUvAnimationMaskTexture,
  }
})

const mesh = new Mesh(geometry, material)
```

### コンストラクタで一括設定

```typescript
const material = new MToonAtlasMaterial({
  // THREE.ShaderMaterial のパラメータ
  transparent: true,
  depthWrite: true,
  fog: true,
  lights: true,

  // パラメータテクスチャ設定
  parameterTexture: {
    texture: packedParameterTexture,
    slotCount: packedSlotCount,
    texelsPerSlot: 8,
    atlasedTextures: {
      baseColor: atlasMainTexture,
      normal: atlasNormalTexture,
      shade: atlasShadeTexture,
      emissive: atlasEmissiveTexture,
      // ... その他のテクスチャ
    }
  },

  // スロット属性設定（オプション）
  slotAttribute: {
    name: 'mtoonMaterialSlot' // デフォルト値
  }
})
```

### 手動でテクスチャを設定する場合（従来の方法）

```typescript
const material = new MToonAtlasMaterial({
  // MToonNodeMaterial のテクスチャプロパティを直接設定
  map: atlasMainTexture,
  normalMap: atlasNormalTexture,
  emissiveMap: atlasEmissiveTexture,

  parameterTexture: {
    texture: packedParameterTexture,
    slotCount: packedSlotCount,
    texelsPerSlot: 8,
    // atlasedTextures を省略した場合は手動設定が必要
  },
})
```

## Material slot attribute specification

SkinnedMesh で複数マテリアルを結合するため、各頂点には「元マテリアルに対応する slot index」を記録した `BufferAttribute` を追加します。

```ts
// root geometry に直接書き込む
geometry.setAttribute(
  'mtoonMaterialSlot', // デフォルト名。MaterialOptions で変更可能
  new Float32BufferAttribute(slotIndices, 1),
)
```

頂点属性を使用しているため `InstancedMesh` を組む必要はなく、スキニング後もそのまま varying としてシェーダに渡せます。

**Vertex Shader での処理**:
```glsl
attribute float mtoonMaterialSlot;  // 頂点属性として受け取る
varying float vMaterialSlot;         // Fragment Shader へ渡す

void main() {
  vMaterialSlot = mtoonMaterialSlot;
  // ... 通常の頂点変換処理
}
```

**Fragment Shader での処理**:
```glsl
varying float vMaterialSlot;  // Vertex Shader から受け取る

void main() {
  // vMaterialSlot を使用してパラメータテクスチャからパラメータをサンプリング
  vec4 param0 = sampleParameter(vMaterialSlot, 0.0);
  // ...
}
```

## API Reference

### MToonAtlasMaterial

#### Constructor

```typescript
new MToonAtlasMaterial(options?: MToonAtlasOptions)
```

`THREE.ShaderMaterialParameters` を継承し、以下のインスタンシング固有オプションを追加サポート：

- `parameterTexture?: ParameterTextureDescriptor` - パラメータテクスチャディスクリプタ
- `slotAttribute?: MaterialSlotAttributeConfig` - スロット属性設定

#### Methods

**`setParameterTexture(descriptor: ParameterTextureDescriptor | null): this`**

パラメータテクスチャをバインドします。`atlasedTextures` が指定されている場合、テクスチャマップが自動設定されます。

**`setSlotAttribute(attribute: MaterialSlotAttributeConfig): this`**

スロット属性メタデータを更新します。

#### Properties

**`slotAttribute: MaterialSlotAttributeConfig` (読み取り専用)**

現在のスロット属性設定を取得します。

**`parameterTexture: ParameterTextureDescriptor | undefined` (読み取り専用)**

現在のパラメータテクスチャディスクリプタを取得します。

**`isMToonAtlasMaterial: true` (読み取り専用)**

マテリアル識別用フラグ。

### Types

#### `ParameterTextureDescriptor`

```typescript
interface ParameterTextureDescriptor {
  texture: Texture                    // パック済みパラメータテクスチャ
  slotCount: number                   // スロット数
  texelsPerSlot: number               // スロットあたりのテクセル数（通常8）
  semantics?: ParameterSemantic[]     // カスタムレイアウト（省略時はデフォルト）
  atlasedTextures?: AtlasedTextureSet // アトラステクスチャセット
}
```

#### `AtlasedTextureSet`

```typescript
interface AtlasedTextureSet {
  baseColor?: Texture        // MToonNodeMaterial.map
  shade?: Texture            // shadeMultiplyTexture
  shadingShift?: Texture     // shadingShiftTexture
  normal?: Texture           // normalMap
  emissive?: Texture         // emissiveMap
  matcap?: Texture           // matcapTexture
  rim?: Texture              // rimMultiplyTexture
  uvAnimationMask?: Texture  // uvAnimationMaskTexture
}
```

#### `MaterialSlotAttributeConfig`

```typescript
interface MaterialSlotAttributeConfig {
  name: string          // 属性名（デフォルト: 'mtoonMaterialSlot'）
  description?: string  // オプション説明
}
```

## Parameter texture layout

avatar-optimizer で生成されたパラメータテクスチャは、各スロット（元マテリアル）あたり 8 texel（`texelsPerSlot = 8`）の RGBA チャンネルに、以下の順番で 19 個のパラメータを詰め込んだ構造になっています。

`MToonAtlasMaterial` の Fragment Shader はこのレイアウトを前提にパラメータをサンプリングします：

```glsl
// Fragment Shader でのサンプリング例
vec4 param0 = sampleParameter(vMaterialSlot, 0.0);  // Texel 0: baseColor + shadingShift
vec3 baseColor = param0.rgb;
float shadingShift = param0.a;

vec4 param1 = sampleParameter(vMaterialSlot, 1.0);  // Texel 1: shadeColor + shadingShiftTextureScale
vec3 shadeColor = param1.rgb;
float shadingShiftTextureScale = param1.a;

// ... 以下同様に各テクセルをサンプリング
```

| Texel index | Channel(s) | Semantic | 内容 |
| ----------- | ---------- | -------- | ---- |
| 0 | RGB | `baseColor` | ベースディフューズカラー (linear RGB) |
| 0 | A | `shadingShift` | シェーディングシフト係数 |
| 1 | RGB | `shadeColor` | Shade pass 用カラー |
| 1 | A | `shadingShiftTextureScale` | Shading shift texture スケール |
| 2 | RGB | `emissiveColor` | エミッシブカラー |
| 2 | A | `emissiveIntensity` | エミッシブ強度 |
| 3 | RGB | `matcapColor` | Matcap カラー係数 |
| 3 | A | `outlineWidth` | アウトライン幅 |
| 4 | RGB | `outlineColor` | アウトラインカラー |
| 4 | A | `outlineLightingMix` | アウトラインのライティングブレンド |
| 5 | RGB | `parametricRimColor` | Parametric rim カラー |
| 5 | A | `parametricRimLift` | Parametric rim lift |
| 6 | R | `parametricRimFresnelPower` | Parametric rim フレネル係数 |
| 6 | G | `shadingToony` | Toon 化係数 |
| 6 | B | `rimLightingMix` | ランバート/リムブレンド比 |
| 6 | A | `uvAnimationRotation` | UV アニメーション回転速度 |
| 7 | RG | `normalScale` | ノーマルマップスケール (x, y) |
| 7 | B | `uvAnimationScrollX` | UV アニメーション X 方向スクロール |
| 7 | A | `uvAnimationScrollY` | UV アニメーション Y 方向スクロール |

## Development

### Build

```bash
pnpm -F mtoon-atlas run build
```

現在、大枠の実装が完成しており、ビルド・型定義生成が成功しています。詳細な実装は `docs/IMPLEMENTATION_PLAN.md` を参照してください。

### Implementation Status

**実装完了** ✅
- クラス構造と骨組み（`MToonAtlasMaterial`）
- 型定義（`ParameterTextureDescriptor`, `AtlasedTextureSet` など）
- パブリック API の定義と Getter/Setter メソッド
- シェーダーファイル（TODO コメント付き）
- ビルドシステム（tsup + esbuild シェーダーローダー）

**実装予定** 📋
- Uniform 初期化（THREE.UniformsLib マージ）
- `setParameterTexture()` の完全実装
- `copy()/clone()` メソッド
- `update()` メソッド（UV アニメーション更新）
- Fragment Shader のパラメータサンプリング実装
- テストの修正・充実

詳細は [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) を参照してください。

### Test

```bash
pnpm -F mtoon-atlas run test
```

*現在、シェーダー parse エラーで成功していません。これは vitest の設定最適化で解決予定です。*

### Watch Mode

```bash
pnpm -F mtoon-atlas run dev
```

## License

MIT

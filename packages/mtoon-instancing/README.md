# @xrift/mtoon-instancing

MToon shader instancing optimization utilities for three-vrm WebGL applications.

## Overview

`@xrift/mtoon-instancing` provides a custom MToon material that consumes the atlas + packed parameter textures produced by `@xrift/avatar-optimizer`.  
本パッケージは `SkinnedMesh` で使用中の複数 `MToonNodeMaterial` を 1 つにまとめ、頂点属性経由で元マテリアルを参照する形に統一することを目的としています。

## Features

- **MToonNodeMaterial ベースのカスタムマテリアル**: 完全な MToon シェーダー互換性
- **パラメータテクスチャサポート**: 全19種類の数値パラメータを自動サンプリング
  - baseColor, shadeColor, emissiveColor, emissiveIntensity
  - shadingShift, shadingToony, shadingShiftTextureScale
  - rimLightingMix, parametricRimColor, parametricRimLift, parametricRimFresnelPower
  - matcapColor, outlineWidth, outlineColor, outlineLightingMix
  - uvAnimationScrollX, uvAnimationScrollY, uvAnimationRotation
  - normalScale
- **アトラステクスチャ自動設定**: 8種類のテクスチャマップを自動バインディング
  - baseColor, shade, shadingShift, normal, emissive, matcap, rim, uvAnimationMask
- **頂点属性ベースのスロット管理**: 元マテリアルのスロット index を頂点属性で受け取る
- **SkinnedMesh 対応**: InstancedMesh 不要でスキニングアニメーションと互換

## Installation

```bash
pnpm add @xrift/mtoon-instancing
```

## Requirements

- Three.js r181+
- @pixiv/three-vrm 3.4.4+
- @pixiv/three-vrm-materials-mtoon 3.4.4+

## Usage

### 基本的な使い方

```typescript
import { Float32BufferAttribute, Mesh } from 'three'
import { MToonInstancingMaterial } from '@xrift/mtoon-instancing'

// 1. SkinnedMesh のジオメトリに slot index 属性を追加する
const slotIndices = new Float32Array(vertexCount) // avatar-optimizer から得たインデックス
geometry.setAttribute('mtoonMaterialSlot', new Float32BufferAttribute(slotIndices, 1))

// 2. パラメータテクスチャとアトラステクスチャを設定
const material = new MToonInstancingMaterial()
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
const material = new MToonInstancingMaterial({
  // MToonNodeMaterial の既存パラメータも使用可能
  transparent: true,
  depthWrite: true,

  // パラメータテクスチャ設定
  parameterTexture: {
    texture: packedParameterTexture,
    slotCount: packedSlotCount,
    texelsPerSlot: 8,
    atlasedTextures: {
      baseColor: atlasMainTexture,
      normal: atlasNormalTexture,
    }
  }
})
```

### 手動でテクスチャを設定する場合（従来の方法）

```typescript
const material = new MToonInstancingMaterial({
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

頂点属性を使用しているため `InstancedMesh` を組む必要はなく、スキニング後もそのまま varying としてシェーダに渡せます。次のステップではこの index を基にパラメータテクスチャから元 uniform 値を復元する TSL ノードを構築します。

## API Reference

### MToonInstancingMaterial

#### Constructor

```typescript
new MToonInstancingMaterial(options?: MToonInstancingOptions)
```

`MToonNodeMaterialParameters` のすべてのオプションに加え、以下のインスタンシング固有オプションをサポート：

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

**`isMToonInstancingMaterial: true` (読み取り専用)**

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

インスタンス化前の MToon マテリアルから取り出した uniform 値は、1 スロットあたり 8 texel（`texelsPerSlot = 8`）の RGBA に下記の順番で詰め込みます。`MToonInstancingMaterial` のシェーダはこのレイアウトを前提に TSL ノードを生成します。

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
pnpm -F mtoon-instancing run build
```

### Test

```bash
pnpm -F mtoon-instancing run test
```

### Watch Mode

```bash
pnpm -F mtoon-instancing run dev
```

## License

MIT

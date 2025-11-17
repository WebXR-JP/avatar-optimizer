# MToonAtlasMaterial 実装計画

## 概要

このドキュメントは、`@xrift/mtoon-atlas` パッケージの `MToonAtlasMaterial` クラスの実装方針をまとめています。

## 設計背景

### 問題背景

`mtoon-atlas` パッケージはもともと **MToonNodeMaterial** をベースにしていたが、以下の不都合があったため **MToonMaterial** ベースに置き換えることが決定された：

- MToonNodeMaterial は Three.js r167+ の WebGPU 対応マテリアル（TSL ベース）
- **WebXR環境で使用できない**

### 目的

avatar-optimizer で生成されたアトラス化テクスチャとパラメータテクスチャを用いて、複数の MToon マテリアルを 1 つに統合し、ドローコール削減を実現する。

## 継承戦略

### ShaderMaterial ベース（推奨）

**基本方針**：

```typescript
export class MToonAtlasMaterial extends THREE.ShaderMaterial {
  // 実装
}
```

**選定理由**：

1. **three-vrm の MToonMaterial** は既に ShaderMaterial を継承しており、成熟した実装
2. **Uniform 管理が直感的** - パラメータテクスチャのサンプリング処理が単純
3. **既存エコシステムと互換** - three-vrm との互換性を保証
4. **WebGL 標準対応** - 現在の主流環境で動作確実

**参考実装**：`packages/three-vrm-materials-mtoon/src/MToonMaterial.ts`

### WebGPU 対応への将来的な移行

**時期**：**ブラウザとThree.js両方でWebGPU×WebXR対応が十分に行われたあと**

**方針**：

- 新たに `MToonAtlasMaterialNode` を派生クラスとして実装
- 既存の `MToonAtlasMaterial` は ShaderMaterial ベースで保守
- TSL ノードベースでパラメータサンプリング処理を再実装

## パラメータテクスチャ仕様

### レイアウト

avatar-optimizer の `combine.ts` で定義された DEFAULT_PARAMETER_LAYOUT に準拠：

| Texel | Channel(s) | パラメータ | 説明 |
|-------|-----------|-----------|------|
| 0 | RGB | `baseColor` | ベースディフューズカラー（Linear RGB） |
| 0 | A | `shadingShift` | シェーディング offset |
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

### テクスチャフォーマット

- **フォーマット**: `RGBA` (Float32)
- **寸法**: `slotCount × texelsPerSlot` pixels
- **標準設定**: `texelsPerSlot = 8`
- **最大スロット数**: GPU メモリに応じて可変

### サンプリング方式

Fragment Shader 内での実装例：

```glsl
varying float vMaterialSlot;  // 頂点属性から渡される

uniform sampler2D uParameterTexture;
uniform vec2 uParameterTextureSize;      // (slotCount, texelsPerSlot)
uniform float uTexelsPerSlot;

// パラメータテクスチャからサンプリング
vec4 sampleParameter(float slotIndex, float texelIndex) {
  float y = (slotIndex + 0.5) / uParameterTextureSize.y;
  float x = (texelIndex + 0.5) / uParameterTextureSize.x;
  return texture2D(uParameterTexture, vec2(x, y));
}

// 使用例
void main() {
  // Texel 0: baseColor (RGB) + shadingShift (A)
  vec4 param0 = sampleParameter(vMaterialSlot, 0.0);
  vec3 baseColor = param0.rgb;
  float shadingShift = param0.a;

  // Texel 1: shadeColor (RGB) + shadingShiftTextureScale (A)
  vec4 param1 = sampleParameter(vMaterialSlot, 1.0);
  vec3 shadeColor = param1.rgb;
  float shadingShiftTextureScale = param1.a;

  // ... 以下同様に必要なパラメータをサンプリング
}
```

## API 設計

### クラス定義

```typescript
export class MToonAtlasMaterial extends THREE.ShaderMaterial {
  // 識別フラグ
  readonly isMToonAtlasMaterial = true

  // パラメータテクスチャ
  private _parameterTexture: ParameterTextureDescriptor | undefined

  get parameterTexture(): ParameterTextureDescriptor | undefined
  setParameterTexture(descriptor: ParameterTextureDescriptor | null): this

  // スロット属性メタデータ
  private _slotAttribute: MaterialSlotAttributeConfig

  get slotAttribute(): MaterialSlotAttributeConfig
  setSlotAttribute(config: MaterialSlotAttributeConfig): this

  // ライフサイクル
  constructor(parameters?: MToonAtlasOptions)
  copy(source: this): this
  clone(): this

  // アニメーション更新（UV アニメーション対応）
  update(deltaTime: number): void
}
```

### オプション型

```typescript
interface MToonAtlasOptions extends THREE.ShaderMaterialParameters {
  // MToonNodeMaterial の既存パラメータをサポート
  color?: THREE.ColorRepresentation
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  transparent?: boolean
  depthWrite?: boolean

  // インスタンシング固有オプション
  parameterTexture?: ParameterTextureDescriptor
  slotAttribute?: MaterialSlotAttributeConfig
}
```

### Uniform 管理

```typescript
uniforms: {
  // パラメータテクスチャ関連
  uParameterTexture: { value: null }              // DataTexture
  uParameterTextureSize: { value: new Vector2() } // (slotCount, texelsPerSlot)
  uTexelsPerSlot: { value: 8 }

  // アトラステクスチャ（既存の MToonMaterial から継承）
  map: { value: null }                       // baseColor atlas
  shadeMultiplyTexture: { value: null }      // shade atlas
  shadingShiftTexture: { value: null }       // shadingShift atlas
  normalMap: { value: null }                 // normal atlas
  emissiveMap: { value: null }               // emissive atlas
  matcapTexture: { value: null }             // matcap atlas
  rimMultiplyTexture: { value: null }        // rim atlas
  uvAnimationMaskTexture: { value: null }    // uvAnimationMask atlas

  // テクスチャUV変換行列
  mapUvTransform: { value: new Matrix3() }
  normalMapUvTransform: { value: new Matrix3() }
  // ... その他の UV transform

  // 従来の互換 Uniform（パラメータテクスチャが無い場合のフォールバック）
  litFactor: { value: new Color(1, 1, 1) }
  shadeColorFactor: { value: new Color(0.97, 0.81, 0.86) }
  shadingShiftFactor: { value: 0 }
  shadingToonyFactor: { value: 0.9 }
  // ... その他（合計19個のパラメータに対応）
}
```

## スロット属性管理

### 仕様

各頂点に対して、元のマテリアルに対応する **スロットインデックス** を記録する頂点属性。

```typescript
interface MaterialSlotAttributeConfig {
  name: string          // 属性名（デフォルト: 'mtoonMaterialSlot'）
  description?: string  // 説明（オプション）
}
```

### ジオメトリへの設定

```typescript
const slotIndices = new Float32Array(vertexCount)
// ... avatar-optimizer から得たインデックスを詰める ...

geometry.setAttribute(
  'mtoonMaterialSlot',
  new Float32BufferAttribute(slotIndices, 1)
)
```

### Vertex Shader での処理

```glsl
attribute float mtoonMaterialSlot;
varying float vMaterialSlot;

void main() {
  vMaterialSlot = mtoonMaterialSlot;

  // 通常の頂点処理
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // ...
}
```

## アトラステクスチャ統合

### 自動マッピング

`setParameterTexture()` 内で `atlasedTextures` が指定されている場合、自動的にマテリアルのテクスチャプロパティへ割り当てられる。

```typescript
interface AtlasedTextureSet {
  baseColor?: Texture
  shade?: Texture
  shadingShift?: Texture
  normal?: Texture
  emissive?: Texture
  matcap?: Texture
  rim?: Texture
  uvAnimationMask?: Texture
}

setParameterTexture(descriptor: ParameterTextureDescriptor | null): this {
  this._parameterTexture = descriptor ?? undefined

  if (descriptor?.atlasedTextures) {
    const atlases = descriptor.atlasedTextures

    // 自動マッピング
    this.uniforms.map.value = atlases.baseColor ?? null
    this.uniforms.shadeMultiplyTexture.value = atlases.shade ?? null
    this.uniforms.shadingShiftTexture.value = atlases.shadingShift ?? null
    this.uniforms.normalMap.value = atlases.normal ?? null
    this.uniforms.emissiveMap.value = atlases.emissive ?? null
    this.uniforms.matcapTexture.value = atlases.matcap ?? null
    this.uniforms.rimMultiplyTexture.value = atlases.rim ?? null
    this.uniforms.uvAnimationMaskTexture.value = atlases.uvAnimationMask ?? null
  }

  // パラメータテクスチャをセット
  if (descriptor?.texture) {
    this.uniforms.uParameterTexture.value = descriptor.texture
    this.uniforms.uParameterTextureSize.value.set(
      descriptor.slotCount,
      descriptor.texelsPerSlot
    )
    this.uniforms.uTexelsPerSlot.value = descriptor.texelsPerSlot
  }

  return this
}
```

### 手動設定

`atlasedTextures` を省略した場合、従来の方法で個別にテクスチャを設定可能：

```typescript
const material = new MToonAtlasMaterial({
  map: myAtlasBaseColor,
  normalMap: myAtlasNormal,
  // ...
})
```

## 既存実装との互換性

### three-vrm MToonMaterial との互換性

| 項目 | 互換性 | 説明 |
|------|--------|------|
| Uniform 名 | ✅ | `litFactor`, `shadeColorFactor` など同じ名前 |
| テクスチャフォーマット | ✅ | RGBA, Float32 で一致 |
| シェーダー | ✅ | `mtoon.frag`, `mtoon.vert` の基本構造を流用 |
| API パターン | ✅ | `copy()`, `clone()` メソッド実装 |

### avatar-optimizer との連携

| 項目 | 互換性 | 説明 |
|------|--------|------|
| パラメータレイアウト | ✅ | `combine.ts` の `PARAMETER_LAYOUT` と同一 |
| ParameterTextureDescriptor | ✅ | スロット数、テクセル数の仕様が一致 |
| スロット属性 | ✅ | 頂点属性経由でのマテリアルスロット指定に対応 |

## シェーダーの構成

### Vertex Shader (`mtoon.vert`)

**責務**：

1. 標準的な頂点変換（位置、法線、UV）
2. **スロット属性の varying へ転送** ← インスタンシング対応
3. UV アニメーション（頂点シェーダ側）
4. アウトライン処理

**新規追加**：

```glsl
// 新規属性
attribute float mtoonMaterialSlot;

// 新規 varying
varying float vMaterialSlot;

void main() {
  vMaterialSlot = mtoonMaterialSlot;

  // 既存の処理...
}
```

### Fragment Shader (`mtoon.frag`)

**責務**：

1. **パラメータテクスチャからパラメータをサンプリング** ← インスタンシング対応
2. MToon ライティング計算（既存と同様）
3. Rim ライティング、Matcap、Emissive

**新規追加**：

```glsl
// パラメータテクスチャサンプリング関数
vec4 sampleParameter(float slotIndex, float texelIndex) {
  float y = (slotIndex + 0.5) / uParameterTextureSize.y;
  float x = (texelIndex + 0.5) / uParameterTextureSize.x;
  return texture2D(uParameterTexture, vec2(x, y));
}

void main() {
  // パラメータテクスチャからサンプリング
  vec4 param0 = sampleParameter(vMaterialSlot, 0.0);  // baseColor + shadingShift
  vec3 baseColor = param0.rgb;
  float shadingShift = param0.a;

  vec4 param1 = sampleParameter(vMaterialSlot, 1.0);  // shadeColor + shadingShiftTextureScale
  vec3 shadeColor = param1.rgb;
  float shadingShiftTextureScale = param1.a;

  // ... 以下、同様にパラメータを復元

  // 既存の MToon ライティング処理...
}
```

## 実装ステップ

### フェーズ 1: 基本構造

1. **`src/MToonAtlasMaterial.ts`** - クラス定義
   - コンストラクタ、Uniform 初期化
   - `setParameterTexture()`, `setSlotAttribute()` メソッド実装
   - Getter メソッド
   - `copy()`, `clone()` メソッド

2. **`src/types.ts`** - 型定義集約
   - `MToonAtlasOptions`
   - `ParameterTextureDescriptor`
   - `AtlasedTextureSet`
   - `MaterialSlotAttributeConfig`

3. **`src/index.ts`** - パブリック API
   - クラス、型のエクスポート

### フェーズ 2: シェーダー実装

1. **`src/shaders/mtoon.vert`** 更新
   - スロット属性の受け取り
   - `vMaterialSlot` varying の追加

2. **`src/shaders/mtoon.frag`** 更新
   - パラメータテクスチャサンプリング関数実装
   - パラメータ復元ロジック
   - 既存の Uniform 使用部分の検証

### フェーズ 3: テスト・統合

1. **Unit テスト** (`tests/mtoon-atlas.test.ts`)
   - `setParameterTexture()` のテスト
   - `setSlotAttribute()` のテスト
   - `copy()`, `clone()` のテスト

2. **Integration テスト**
   - avatar-optimizer の `combineMToonMaterials()` との連携確認
   - 実際のジオメトリ + パラメータテクスチャでのレンダリング確認

3. **互換性確認**
   - three-vrm の既存マテリアルとの互換性
   - ドローコール削減の効果測定

## 参考リソース

- **three-vrm MToonMaterial**: `packages/three-vrm-materials-mtoon/src/MToonMaterial.ts`
- **avatar-optimizer combine**: `packages/avatar-optimizer/src/material/combine.ts`
- **MToonMaterial Uniform 定義**: `packages/three-vrm-materials-mtoon/src/MToonMaterial.ts` の uniforms セクション

## 今後の拡張（ロードマップ）

### WebGPU 対応（Three.js r180+）

```typescript
export class MToonAtlasMaterialNode extends MToonNodeMaterial {
  // TSL ベースのパラメータサンプリング実装
  setupCustomNodes() {
    // パラメータテクスチャから値を復元するノードツリー
  }
}
```

### カスタムセマンティクス対応

```typescript
interface ParameterTextureDescriptor {
  texture: Texture
  slotCount: number
  texelsPerSlot: number
  semantics?: ParameterSemantic[]  // カスタムレイアウト対応
  atlasedTextures?: AtlasedTextureSet
}
```

## まとめ

`MToonAtlasMaterial` は以下を実現する設計となっています：

1. ✅ **複数マテリアルの統一** - パラメータテクスチャ + スロット属性で実装
2. ✅ **ドローコール削減** - avatar-optimizer との統合で効果測定可能
3. ✅ **既存エコシステム互換** - three-vrm との API 互換性確保
4. ✅ **拡張性** - 将来の WebGPU 対応を想定した設計

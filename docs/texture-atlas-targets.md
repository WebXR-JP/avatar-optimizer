# VRM テクスチャアトラス化対象の識別

## 概要

このドキュメントは、VRM マテリアルからテクスチャアトラス化の対象として含めるべきテクスチャを識別するためのガイダンスを提供します。テクスチャアトラス化は複数の個別テクスチャを1つの大きなテクスチャに統合し、ドローコールを削減してパフォーマンスを向上させながら、視覚品質を維持します。

## アトラス化の基本原則

**重要：** アトラス化の実施時には、UV座標も同時に変更する必要があります。そのため、**UV依存のテクスチャはすべてを同様にアトラス化する必要があります。**

一つのマテリアルに複数のUV依存テクスチャが存在する場合、それらはすべて同じアトラスに含める必要があります。これにより、UV座標の変換をシェーダーで一度に行うことができ、すべてのテクスチャが正しくアトラス内の位置を参照するようになります。

## 主要な概念

### UV 依存テクスチャ vs 非 UV テクスチャ

**UV 依存テクスチャ（アトラス化必須）：** メッシュ UV 座標を使用してサンプリングされるテクスチャはすべてアトラス化の対象です。以下が含まれます：
- ベースカラー/ディフューズテクスチャ
- ノーマルマップ
- シェードカラーテクスチャ
- ラフネス/メタリックテクスチャ
- 標準 UV 座標を使用するすべてのテクスチャ

これらは**必ずアトラス化する必要があります。** アトラス化によって UV 座標が変更されるため、これらのテクスチャは一緒にアトラスに統合する必要があります。

**非 UV テクスチャ（アトラス化不可）：** 別の方法でマッピングされるテクスチャはアトラス化できません：
- **MatCap テクスチャ**: メッシュ UV ではなく、ビューイング空間の法線ベクトルを使用してサンプリングされます。これらは環境マッピングテクスチャであり、分離したままである必要があります。

---

## VRM 1.x（VRMC_materials_mtoon）

VRM 1.x は MToon マテリアルを `VRMC_materials_mtoon` という独立した glTF 拡張として標準化しました。これにより、明確で明示的なマテリアル仕様が提供されます。

### アトラス化可能なテクスチャ（UV 依存）

| テクスチャプロパティ | 必須 | 目的 | 備考 |
|---|---|---|---|
| `baseColorTexture` | 暗黙的に必須 | ベース色（明るい領域） | 標準 glTF コアテクスチャ。サンプリング位置は `baseColorTexture.texCoord`（デフォルト: 0）で制御されます。 |
| `normalTexture` | いいえ | サーフェス法線マップ | 標準 glTF コアテクスチャ。法線ベクトルを介してサーフェスディテールを定義します。サンプリング位置: `normalTexture.texCoord`。 |
| `shadeMultiplyTexture` | いいえ | シェード色（暗い領域） | MToon 固有。`shadeColorFactor` と乗算されて、影の中のシェード色を作成します。サンプリング位置: `shadeMultiplyTexture.texCoord`。 |
| `shadingShiftTexture` | いいえ | シェーディング境界調整 | MToon 固有。`shadingShiftTextureInfo.texCoord` を使用して、明暗の境界位置をピクセル単位で制御します。通常はグレースケール。 |
| `rimMultiplyTexture` | いいえ | リムライトマスク | MToon 固有。リムライトの強度を変調します。サンプリング位置: `rimMultiplyTexture.texCoord`。 |
| `outlineWidthMultiplyTexture` | いいえ | アウトライン幅制御 | MToon 固有。アウトラインの厚さ変動を制御します。サンプリング位置: `outlineWidthMultiplyTexture.texCoord`。RGB: アウトライン幅、G: アウトライン制御。 |
| `uvAnimationMaskTexture` | いいえ | アニメーションマスク | MToon 固有。特定の領域でアニメーションを選別的に有効にします。サンプリング位置: `uvAnimationMaskTexture.texCoord`。B チャンネルがマスキングに使用されます。 |

### アトラス化不可能なテクスチャ（ビューイング空間マップ）

| テクスチャプロパティ | 目的 | 理由 |
|---|---|---|
| `matcapTexture` | マテリアルキャプチャ / スフィアマッピング | **UV 依存ではありません。** メッシュ UV ではなく、ビューイング空間の法線ベクトルを使用してサンプリングされます。スフィアマッピング効果を失うことなくアトラス化できません。 |

---

## VRM 0.x（VRM_material_mtoon）

VRM 0.x は異なるマテリアル表現を使用し、MToon プロパティは glTF マテリアルの `extensions` 内のカスタムシェーダープロパティとして保存されます。マテリアルデータは以下のように表現されます：

```json
{
  "name": "MToon",
  "shader": "VRM/MToon",
  "floatProperties": { /* 数値パラメータ */ },
  "vectorProperties": { /* 色/ベクトルパラメータ */ },
  "textureProperties": { /* テクスチャ参照 */ },
  "keywordMap": { /* シェーダーキーワードトグル */ }
}
```

### アトラス化可能なテクスチャ

以下のテクスチャは `textureProperties` で参照され、UV マッピングを使用します：

| テクスチャ名 | glTF 相当 | 目的 | 備考 |
|---|---|---|---|
| `_MainTex` | (`baseColorTexture` に類似) | ベース色テクスチャ + アルファ | 主要色。通常最大のテクスチャ。UV 座標: 標準メッシュ UV。 |
| `_ShadeTexture` | (`shadeMultiplyTexture` に類似) | シェード色/暗い領域テクスチャ | 影のある領域の色。UV 座標: 標準メッシュ UV。 |
| `_BumpMap` | (`normalTexture` に類似) | ノーマルマップ | サーフェスディテール。スケール係数 `_BumpScale` で参照されます。UV 座標: 標準メッシュ UV。 |
| `_ReceiveShadowTexture` | N/A | シャドウ受信マスク | どの領域が影を受けるかを制御します。グレースケールマスク。 |
| `_ShadingGradeTexture` | (`shadingShiftTexture` に類似) | シェーディング境界制御 | ピクセル単位で明暗遷移を微調整します。グレースケールマスク。 |
| `_RimTexture` | (`rimMultiplyTexture` に類似) | リムライトマスク | 領域ごとのリムライト強度を制御します。グレースケールマスク。 |

**注記：** VRM 0.x はすべての実装で標準化された `matcapTexture` プロパティを持っていません。MatCap が使用される場合、カスタムシェーダープロパティとしてエンコードされる可能性があります。標準的な実装は通常、VRM 0.x MToon では MatCap を使用しません。

### VRM 0.x の典型的な MToon シェーダープロパティ

```
_MainTex           - ベース色テクスチャ（色 + アルファ）
_ShadeTexture      - シェード色テクスチャ
_BumpMap           - ノーマルマップ
_ReceiveShadowTexture - シャドウマスク
_ShadingGradeTexture - シェーディンググレード/境界テクスチャ
_RimTexture        - リムライトテクスチャ
_OutlineWidthTexture - アウトライン幅（アウトライン有効時）
_EmissionMap       - エミッション/グロウテクスチャ（エミッシブ時）
```

---

## アトラス化候補の実践的な識別

### ステップ 1：マテリアルタイプでフィルター

1. **VRM モデル内の MToon マテリアルを識別します：**
   - VRM 1.x: マテリアル定義内の `extensions.VRMC_materials_mtoon` をチェック
   - VRM 0.x: `shader` プロパティに "MToon" またはそれに類似するものが含まれているかチェック

2. **非 MToon マテリアルを除外します**（UV マッピングも使用する場合を除く）：
   - `VRM/UnlitTexture`、`VRM/UnlitCutout`、`VRM/UnlitTransparent` - テクスチャを使用しているかチェック
   - 標準 PBR マテリアル - 使用例に応じた候補となる可能性があります

### ステップ 2：非 UV テクスチャを除外

- **`matcapTexture`**（VRM 1.x）をアトラス候補から削除します
- MatCap テクスチャは分離したままである必要があります

### ステップ 3：UV 依存テクスチャをすべてアトラス化

**重要：** マテリアル内のすべての UV 依存テクスチャは同じアトラスに含める必要があります。

UV 依存テクスチャの完全なリスト：

**VRM 1.x:**
- `baseColorTexture`
- `normalTexture`
- `shadeMultiplyTexture`
- `shadingShiftTexture`
- `rimMultiplyTexture`
- `outlineWidthMultiplyTexture`
- `uvAnimationMaskTexture`

**VRM 0.x:**
- `_MainTex`
- `_ShadeTexture`
- `_BumpMap`
- `_ReceiveShadowTexture`
- `_ShadingGradeTexture`
- `_RimTexture`
- `_OutlineWidthTexture`（存在する場合）
- `_EmissionMap`（存在する場合）

これらはすべて同じアトラスに統合されます。UV座標の変換は一度に行われ、すべてのテクスチャがアトラス内の正しい位置を参照します。

### ステップ 4：UV セット使用法の検証

各テクスチャプロパティには、オプションのテクスチャ座標セット情報が含まれます：

**VRM 1.x:**
```json
{
  "baseColorTexture": {
    "index": 0,
    "texCoord": 0,  // 使用する UV セット（デフォルト: 0）
    "scale": [1.0, 1.0]
  }
}
```

**重要な制約：** 同じアトラス内のすべてのテクスチャは同じ UV セットを使用する必要があります。

マテリアル内のテクスチャが異なる UV セット（`texCoord` 値）を使用している場合：
1. **推奨：** すべてのテクスチャが同じ UV セットを使用するようにモデルを正規化する
2. **代替案：** UV セットごとに個別のアトラスを作成する（複数アトラス）

多くの場合、すべてのテクスチャが同じ UV セット（デフォルトは 0）を使用するため、単一アトラスでの統合が可能です。

---

## 実装チェックリスト

テクスチャアトラス化ターゲティングロジックを実装する場合：

- [ ] **VRM 1.x サポート**: `VRMC_materials_mtoon` 拡張をチェック
- [ ] **VRM 0.x サポート**: MToon ベースのシェーダー名とプロパティをチェック
- [ ] **MatCap 除外**: `matcapTexture` をアトラスに含めないようにします
- [ ] **UV 依存テクスチャ抽出**: マテリアル内のすべての UV 依存テクスチャを識別
- [ ] **同一アトラス統合**: 抽出したすべての UV 依存テクスチャを同じアトラスに統合
- [ ] **UV セット検証**: アトラス化されたすべてのテクスチャが同じ UV 座標セットを使用していることを確認（異なる場合は複数アトラスを検討）
- [ ] **テクスチャサイズチェック**: アトラス化によって作成されるテクスチャ寸法が妥当な場合（例：4096x4096 以下）にのみ実施
- [ ] **フォーマット互換性**: すべてのテクスチャが互換性のあるカラースペースを使用していることを確認（色は sRGB、法線は線形）
- [ ] **アルファチャンネル処理**: ノーマルマップとマスクはアルファを保持または削除する必要がある場合があります
- [ ] **ミップマップ考慮**: テクスチャにミップマップがある場合、アトラス化はフィルタリング品質に影響する可能性があります
- [ ] **エラーログ**: デバッグのため、テクスチャ処理とアトラス化の詳細をログに記録します

---

## 参考資料

- [VRM 仕様（公式 GitHub）](https://github.com/vrm-c/vrm-specification)
- [VRMC_materials_mtoon 1.0 仕様](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md)
- [VRM 0.x マテリアルプロパティ](https://github.com/vrm-c/vrm-specification/tree/master/specification/0.0)
- [glTF 2.0 マテリアル仕様](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)
- [KHR_texture_transform 拡張](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_transform)

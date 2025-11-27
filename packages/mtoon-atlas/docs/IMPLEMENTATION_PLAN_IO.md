# MToonAtlas VRM Import/Export Implementation Plan

## 概要
`avatar-optimizer` で最適化されたモデル（`MToonAtlasMaterial` を使用）を VRM としてエクスポートし、再度インポートした際に `MToonAtlasMaterial` として正しく復元するための設計と実装計画です。

## 設計方針
GLTF の拡張機構（Extension）を利用して、`MToonAtlasMaterial` 固有の情報を保持します。
標準の `VRMLoaderPlugin` を直接改造するのではなく、独立した GLTF Loader/Exporter Plugin として実装することで、既存の VRM エコシステムとの互換性を保ちます。

### 1. GLTF Extension Schema (`XRIFT_mtoon_atlas`)
GLTF ファイル内の `materials` 定義に拡張データを追加します。

```json
{
  "materials": [
    {
      "name": "MToonAtlasMaterial",
      "extensions": {
        "XRIFT_mtoon_atlas": {
          "version": "1.0",
          "parameterTexture": {
            "index": 0, // texture index
            "texelsPerSlot": 8,
            "slotCount": 16
          },
          "slotAttributeName": "_MTOON_MATERIAL_SLOT",
          "atlasedTextures": {
            "baseColor": { "index": 1 },
            "normal": { "index": 2 },
            // ... other textures
          }
        }
      }
    }
  ]
}
```

### 2. Exporter Plugin (`MToonAtlasExporterPlugin`)
`THREE.GLTFExporter` に登録するプラグインです。
- `MToonAtlasMaterial` を検知した場合、標準の PBR マテリアルへのフォールバック（互換性のため）を行いつつ、`extensions.XRIFT_mtoon_atlas` に必要な情報を書き込みます。
- パラメータテクスチャやアトラステクスチャを GLTF のテクスチャとして登録します。
- メッシュのジオメトリに含まれる `mtoonMaterialSlot` 属性を、GLTF のカスタム属性（例: `_MTOON_MATERIAL_SLOT`）としてエクスポートされるようにします（Three.js の GLTFExporter はカスタム属性をサポートしていますが、プレフィックスの調整が必要な場合があります）。

### 3. Loader Plugin (`MToonAtlasLoaderPlugin`)
`THREE.GLTFLoader` に登録するプラグインです。
- マテリアルのパース時に `XRIFT_mtoon_atlas` 拡張を検知します。
- 拡張データから `MToonAtlasMaterial` をインスタンス化します。
- 読み込まれたテクスチャ（パラメータテクスチャ、アトラステクスチャ）をマテリアルに設定します。
- メッシュの読み込み時に、カスタム属性 `_MTOON_MATERIAL_SLOT` を `mtoonMaterialSlot` として読み込み、マテリアルが正しく参照できるようにします。

## 実装ステップ

### Step 1: パッケージ構成の更新
`packages/mtoon-atlas` に以下のファイルを追加します。
- `src/extensions/MToonAtlasLoaderPlugin.ts`
- `src/extensions/MToonAtlasExporterPlugin.ts` (必要であれば)
- `src/extensions/types.ts` (Schema 定義)

### Step 2: Loader Plugin の実装
`GLTFLoaderPlugin` インターフェースに従い、`MToonAtlasLoaderPlugin` を実装します。
`extendMaterialParams` フックを使用して、マテリアル生成プロセスに介入します。

### Step 3: Exporter Plugin の実装
`GLTFExporterPlugin` インターフェースに従い、エクスポート処理を実装します。
`debug-viewer` 側でのエクスポート処理にこのプラグインを適用します。

### Step 4: Debug Viewer での検証
`debug-viewer` で最適化したモデルをエクスポートし、それを再度読み込んで `MToonAtlasMaterial` として認識されるか、表示が崩れないかを確認します。

## 懸念点と対策
- **VRM Extension との競合**: VRM 拡張（`VRMC_vrm`）もマテリアル情報を扱いますが、`MToonAtlasMaterial` は VRM の仕様外のカスタムシェーダーです。VRM ローダーが MToon として解釈しようとするのを防ぐ、あるいは上書きする必要があります。Loader Plugin の実行順序や、VRM ローダーとの共存に注意が必要です。通常、カスタム拡張が優先されるように実装します。
- **属性名の制約**: GLTF のカスタム属性は `_` で始まる必要があります。`mtoonMaterialSlot` を `_MTOON_MATERIAL_SLOT` にマッピングする処理が必要です。


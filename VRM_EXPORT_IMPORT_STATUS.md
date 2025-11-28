# VRM Export/Import 実装状況

## 概要

`avatar-optimizer`で最適化されたモデル（`MToonAtlasMaterial`を使用）をVRMとしてエクスポートし、再度インポートできるようにするための実装を進めました。

## 実装済み機能

### 1. MToonAtlas GLTF拡張プラグイン

#### MToonAtlasLoaderPlugin
- **場所**: `packages/mtoon-atlas/src/extensions/MToonAtlasLoaderPlugin.ts`
- **機能**: GLTF読み込み時に`XRIFT_mtoon_atlas`拡張を検知し、`MToonAtlasMaterial`を復元
- **状態**: ✅ 実装完了、ビルド成功

#### MToonAtlasExporterPlugin
- **場所**: `packages/mtoon-atlas/src/extensions/MToonAtlasExporterPlugin.ts`
- **機能**: GLTF出力時に`MToonAtlasMaterial`の情報を`XRIFT_mtoon_atlas`拡張として保存
- **状態**: ✅ 実装完了、ビルド成功

### 2. VRM GLTF拡張プラグイン

#### VRMExporterPlugin
- **場所**: `packages/avatar-optimizer/src/exporter/VRMExporterPlugin.ts`
- **機能**: VRMオブジェクトから`VRMC_vrm`拡張データを生成してGLTFに追加
- **実装内容**:
  - `setVRM(vrm)`: VRMオブジェクトを設定
  - `exportMeta()`: VRM 0.0/1.0のメタデータをVRM 1.0形式に変換
  - `exportHumanoid()`: ヒューマノイドボーン情報をエクスポート
  - `exportExpressions()`: 表情（BlendShape）情報をエクスポート
  - `exportLookAt()`: 視線制御情報をエクスポート
  - `exportFirstPerson()`: 一人称視点設定をエクスポート
- **状態**: ✅ 実装完了、テスト通過

### 3. debug-viewerへの統合

- **場所**: `packages/debug-viewer/src/App.tsx`
- VRM読み込み時に`MToonAtlasLoaderPlugin`を登録（`useVRMLoader.ts`）
- GLTF出力時に`MToonAtlasExporterPlugin`と`VRMExporterPlugin`を登録
- **状態**: ✅ 統合完了

## 解決済みの問題

### VRMExporterPluginの`afterParse`フック問題

#### 問題の詳細
`afterParse()`フックでJSONに`VRMC_vrm`拡張を追加していたが、最終的なGLTF出力には拡張が含まれていなかった。

#### 原因
Three.jsの`GLTFExporter`の`afterParse`フックは、**入力オブジェクト（Scene/Object3D）のみを引数として受け取る**。JSONオブジェクトは引数として渡されない。

#### 解決策
`afterParse`内で引数ではなく、`this.writer.json`に直接アクセスして拡張を追加するように修正。

```typescript
// 修正前（動作しない）
public afterParse(input: any) {
  const json = Array.isArray(input) ? input[0] : input
  json.extensions = json.extensions || {}
  // ...
}

// 修正後（正しく動作）
public afterParse(_input: any) {
  const json = this.writer.json  // writer.jsonに直接アクセス
  json.extensions = json.extensions || {}
  // ...
}
```

## 次のステップ

### 中期的な対応

1. **MToonAtlasExporterPluginの動作確認**
   - 同様の問題がないか確認
   - 必要に応じて修正

2. **統合テストの追加**
   - エクスポート→インポートのラウンドトリップテスト（完全なVRMボーン構成が必要）
   - データの整合性確認

## 技術的な詳細

### GLTF拡張スキーマ

#### XRIFT_mtoon_atlas
```json
{
  "materials": [{
    "extensions": {
      "XRIFT_mtoon_atlas": {
        "version": "1.0",
        "parameterTexture": { "index": 0, "texelsPerSlot": 8, "slotCount": 16 },
        "slotAttributeName": "_MTOON_MATERIAL_SLOT",
        "atlasedTextures": {
          "baseColor": { "index": 1 },
          "shade": { "index": 2 }
        }
      }
    }
  }]
}
```

#### VRMC_vrm
```json
{
  "extensions": {
    "VRMC_vrm": {
      "specVersion": "1.0",
      "meta": { "name": "...", "version": "...", "authors": [...] },
      "humanoid": { "humanBones": {...} },
      "expressions": {...},
      "lookAt": {...},
      "firstPerson": {...}
    }
  },
  "extensionsUsed": ["VRMC_vrm"]
}
```

## ファイル構成

```
packages/
├── mtoon-atlas/
│   └── src/
│       ├── extensions/
│       │   ├── MToonAtlasLoaderPlugin.ts    ✅
│       │   ├── MToonAtlasExporterPlugin.ts  ✅
│       │   └── types.ts                     ✅
│       └── index.ts                         ✅ (プラグインをエクスポート)
│
├── avatar-optimizer/
│   └── src/
│       ├── exporter/
│       │   ├── VRMExporterPlugin.ts         ⚠️ (動作に問題)
│       │   └── index.ts                     ✅
│       └── index.ts                         ✅ (VRMExporterPluginをエクスポート)
│
└── debug-viewer/
    └── src/
        ├── hooks/
        │   └── useVRMLoader.ts              ✅ (MToonAtlasLoaderPlugin登録)
        └── App.tsx                          ✅ (両プラグイン登録)
```

## 参考資料

- [VRM 1.0 Specification](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm-1.0)
- [Three.js GLTFExporter](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/exporters/GLTFExporter.js)
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)

## 更新履歴

- 2025-11-28: VRMExporterPluginの問題を修正、テスト通過
- 2025-11-28: 初版作成、VRMExporterPluginの問題を特定

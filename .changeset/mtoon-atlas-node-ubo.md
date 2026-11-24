---
"@webxr-jp/mtoon-atlas": minor
"@webxr-jp/avatar-optimizer": patch
---

`MToonAtlasNodeMaterial`（WebGPURenderer / TSL 版）のパラメータ参照をパラメータテクスチャからマテリアル個別の Uniform Buffer（UBO）へ移行し、シェーダーキャッシュ共有を有効化した。

- `ParameterBufferDescriptor`・`setParameterBuffer()`・`parameterBuffer` および UBO バケット計算ユーティリティ（`PARAMETER_UBO_BUCKET_SLOTS` / `resolveParameterBucketSlots` / `createPaddedParameterBuffer` / `getMaxParameterUBOSlots`）を追加した。従来の `parameterTexture` / `setParameterTexture()` も内部で UBO バッファへ変換して後方互換を維持する
- `MToonAtlasNodeMaterial` のアトラステクスチャ参照を `materialReference` へ移行し、`customProgramCacheKey()` から `this.uuid` を削除した。同じ UBO バケットサイズ（8 / 16 / 32 / 64 / 112 スロット）・構成の別マテリアル／別アバター間でシェーダーキャッシュを共有できる
- UBO 上限（WebGL2 最小保証 16 KB 基準、既定 9 vec4/slot で最大 113 スロット）を超えるスロット数は明示的にエラー（`MToonAtlasNodeMaterial` では `RangeError`、`combineMToonMaterials` では `PARAMETER_TEXTURE_FAILED`）を返すようにした
- `avatar-optimizer` 側で `packMaterialParameters()`（生 `Float32Array` 生成）を分離し、`MToonAtlasNodeMaterial` の最適化・`MToonAtlasLoaderPlugin` での再読み込み・`MToonAtlasExporterPlugin` での書き出しでパラメータ用の `DataTexture` を生成しないようにした（glTF 拡張 `XRIFT_mtoon_atlas` の保存形式は既存互換を維持）

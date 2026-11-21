---
"@webxr-jp/avatar-optimizer": minor
---

`loadVRM` に `mtoonMaterialType` / `mtoonAtlasMaterialType` オプションを追加した。three-vrm の `MToonMaterialLoaderPlugin` の `materialType` にそのまま渡され、`@pixiv/three-vrm/nodes` の `MToonNodeMaterial` を指定すると WebGPURenderer で描画できる VRM として読み込める。最適化済み VRM 向けには `mtoonAtlasMaterialType` を追加し、`@webxr-jp/mtoon-atlas/nodes` の `MToonAtlasNodeMaterial` を渡すと WebGPURenderer で描画できる

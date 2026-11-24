---
"@webxr-jp/avatar-optimizer": minor
---

`optimizeModel` が three-vrm の `MToonNodeMaterial`（WebGPURenderer 向け）を持つ VRM も最適化できるようにした。統合後のマテリアルは新しい `atlasMaterialType` オプションで選び、`@webxr-jp/mtoon-atlas/nodes` の `MToonAtlasNodeMaterial` を渡すと WebGPURenderer で描画できる。`MToonNodeMaterial` を含むモデルで `atlasMaterialType` を省略した場合は、描画できないマテリアルを黙って作らないよう、モデルを変更せずに `INVALID_PARAMETER` を返す。MToon の判定は instanceof から three-vrm の識別フラグに変えたため、three-vrm が二重に読み込まれた環境でもアトラス化が外れなくなった

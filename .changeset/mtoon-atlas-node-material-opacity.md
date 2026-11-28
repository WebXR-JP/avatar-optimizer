---
'@webxr-jp/mtoon-atlas': patch
---

MToonAtlasNodeMaterial（WebGPURenderer 用）が `material.opacity` を無視していた不具合を修正しました。スロットのアルファに `material.opacity` を掛けるので、ゴースト表示など外から半透明にできます。

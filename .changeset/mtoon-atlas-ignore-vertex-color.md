---
'@webxr-jp/mtoon-atlas': patch
---

COLOR_0頂点カラーを持つVRMを最適化すると、再読込時にシェーダーがコンパイルエラーになりアバターが不可視になる問題を修正。MToonAtlasMaterialに、上流three-vrmのMToonMaterialが既定で設定しているのと同じ`IGNORE_VERTEX_COLOR` defineを追加する（VRM0.x MToonの「頂点カラーを無視する」意味論とも一致）

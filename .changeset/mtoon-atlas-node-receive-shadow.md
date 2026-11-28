---
"@webxr-jp/mtoon-atlas": patch
---

MToonAtlasNodeMaterial が receiveShadow: false でも平行光源の影を受けていた不具合を修正

ライトノードはオブジェクト間で共有され、影を受ける床などを一度ビルドすると shadowNode が残る。
これを見て影を掛けていたため、WebGPURenderer で影を受けないアバターに bias なしの自己影が乗り、
滑らかな面に縞（シャドウアクネ）が出ていた。three が影ありの色を渡したときだけ影を分けるようにした

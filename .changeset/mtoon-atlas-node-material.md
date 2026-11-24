---
"@webxr-jp/mtoon-atlas": minor
---

WebGPURenderer 向けに TSL 版の `MToonAtlasNodeMaterial` を追加した。`@webxr-jp/mtoon-atlas/nodes` から読み込む。描画結果は GLSL 版の `MToonAtlasMaterial` に合わせてある。あわせて `MToonAtlasLoaderPlugin` に `materialType` オプションを追加し、再読み込み時に生成するマテリアルを選べるようにした。パラメータテクスチャの既定レイアウト `DEFAULT_PARAMETER_LAYOUT` と、両マテリアル共通の型 `MToonAtlasMaterialLike` / `MToonAtlasMaterialConstructor` も公開した。`MToonAtlasExporterPlugin` は両マテリアルを書き出せるようにし、アトラスマテリアルを GLTFExporter 標準のマテリアル変換に通さないようにした（GLSL 版で出ていた `GLTFExporter: THREE.ShaderMaterial not supported.` の警告も出なくなる）

再読み込み時に `MToonAtlasMaterial` のマテリアル名が `MToonAtlasMaterial` に置き換わっていた問題も修正した。コンストラクタが `name` を反映していなかった

`MToonAtlasMaterialLike` に `createOutlineMaterial()` を追加した

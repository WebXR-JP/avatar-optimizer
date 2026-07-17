---
'@webxr-jp/texture-compression': patch
'@webxr-jp/mtoon-atlas': patch
---

KTX2圧縮でsRGB転送関数が指定されず、カラーテクスチャがリニア扱いになり表示が白く浮く問題を修正。`Ktx2CompressionOptions`に`srgb`オプションを追加し、`MToonAtlasExporterPlugin`はテクスチャの`colorSpace`から自動判定して渡す

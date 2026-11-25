---
'@webxr-jp/avatar-optimizer': minor
---

`optimizeModel` に KTX2 テクスチャ圧縮オプション（`textureCompression` / `ktx2Loader` / `ktx2TranscoderPath` / `ktx2Renderer`）を追加しました。最適化時に GPU 向け `CompressedTexture` へトランスコードして差し替えつつ元の KTX2 バイナリをキャッシュするため、ランタイム VRAM を削減でき、後続の `exportVRM` でも再エンコードなしで KTX2 パススルー出力されます。`exportVRM` 側の `textureCompression` オプションは互換維持しつつ `@deprecated` にしました。あわせて、`composeImagesToAtlas` が入力テクスチャの `colorSpace` を復元するよう修正しました。

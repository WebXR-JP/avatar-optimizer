# @webxr-jp/texture-compression

## 0.2.0

### Minor Changes

- 6b4dbcd: Basis エンコーダーの WASM を再ビルドし、入力画像の上限を 6,291,456 ピクセル（2048×3072）から 4096×4096 に引き上げました。これまで失敗していた 4096px テクスチャの KTX2 圧縮（ミップマップあり / なし）ができます。再ビルド手順は `scripts/build-wasm.sh`（`build:wasm`）にまとめています。あわせて Node 向けビルド（`exports` の `node` 条件）を追加し、Node では WASM をファイルから読み込むため Vite の `?url` import に依存せず `initBasisEncoder` / `compressToKtx2` を使えるようにしました。ブラウザ / バンドラー向けの読み込み方法は変わりません。

## 0.1.1

### Patch Changes

- 8e72ddd: KTX2圧縮でsRGB転送関数が指定されず、カラーテクスチャがリニア扱いになり表示が白く浮く問題を修正。`Ktx2CompressionOptions`に`srgb`オプションを追加し、`MToonAtlasExporterPlugin`はテクスチャの`colorSpace`から自動判定して渡す

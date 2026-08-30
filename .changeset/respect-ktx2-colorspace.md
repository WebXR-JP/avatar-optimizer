---
'@webxr-jp/mtoon-atlas': minor
---

KTX2 テクスチャの colorSpace を上書きしないようにした (#40)

`MToonAtlasLoaderPlugin` はアトラステクスチャの読み込み時、スロット名から `colorSpace` を強制的に設定していた。three.js は圧縮テクスチャのアップロード時に `colorSpace` を見て内部フォーマット（sRGB 版かどうか）を選ぶため、**KTX2 の DFD `transferFunction` が誤っていても結果的に正しく表示されてしまい、エンコード側のバグを隠していた**。

実際 #36 で修正した「KTX2 がリニアタグになる」不具合は、debug-viewer 上では修正前でも正常に見えていた。DFD をそのまま使う実環境（独自ローダー）では表示が破綻するため、ビューアと実環境で結果が食い違う原因にもなっていた。

KTX2Loader は DFD から正しい `colorSpace` を設定するので、KTX2 由来のテクスチャは上書きしないようにした。KTX2 以外（PNG など）は DFD を持たないため、従来どおりスロット名から設定する。

判定は `applyAtlasTextureColorSpace()` として公開した。

## 挙動の変更

`@webxr-jp/texture-compression@0.1.1`（2026-08-05、#36 の修正）より前に KTX2 圧縮したモデルは、baseColor などがリニアタグで書き出されている。従来はこの上書きによって正しく表示されていたが、本バージョン以降は DFD のとおりに扱われるため**色が白く浮く**。

該当するモデルがある場合は、次のいずれかで対応できる。

- **DFD の書き換え**（推奨）… KTX2 の `transferFunction` を Linear(1) → sRGB(2) に変えるだけでよい。ファイル内の 1 バイトを書き換える操作で、画像データの再エンコードは不要。元の VRM を保持していなくても適用できる
- **再最適化** … 元の VRM があるなら最適化をやり直す

DFD 書き換えの対象はカラー系スロット（`baseColor` / `shade` / `emissive` / `matcap` / `rim`）のみ。`normal` などの非カラースロットは Linear が正しいので触らないこと。

---
'@webxr-jp/mtoon-atlas': patch
---

KTX2 テクスチャの colorSpace を上書きしないようにした (#40)

`MToonAtlasLoaderPlugin` はアトラステクスチャの読み込み時、スロット名から `colorSpace` を強制的に設定していた。three.js は圧縮テクスチャのアップロード時に `colorSpace` を見て内部フォーマット（sRGB 版かどうか）を選ぶため、**KTX2 の DFD `transferFunction` が誤っていても結果的に正しく表示されてしまい、エンコード側のバグを隠していた**。

実際 #36 で修正した「KTX2 がリニアタグになる」不具合は、debug-viewer 上では修正前でも正常に見えていた。DFD をそのまま使う実環境（独自ローダー）では表示が破綻するため、ビューアと実環境で結果が食い違う原因にもなっていた。

KTX2Loader は DFD から正しい `colorSpace` を設定するので、圧縮テクスチャの場合は上書きしないようにした。非圧縮テクスチャ（PNG など）は DFD を持たないため、従来どおりスロット名から設定する。

判定は `applyAtlasTextureColorSpace()` として公開した。

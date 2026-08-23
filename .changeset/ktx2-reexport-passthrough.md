---
'@webxr-jp/mtoon-atlas': patch
---

KTX2圧縮済みVRMを再読み込み後にエクスポートすると「サポートされていない画像形式です」で必ず失敗する問題を修正 (#39)

- `MToonAtlasLoaderPlugin` がロード時の元 KTX2 バイナリを記録し、`MToonAtlasExporterPlugin` が再エンコードせずそのまま書き出すようになった（画質劣化なし）。`textureCompression` オプションの有無に関わらず、KTX2 由来のテクスチャは KTX2 のまま出力される
- アトラステクスチャの重複書き込みを解消。エクスポータのキャッシュキーを `texture.uuid` から `texture.source.uuid` に変更した。ローダーがマテリアルごとに `clone()` するため、従来は同じアトラス画像がマテリアル数ぶん重複して書き込まれ、再エクスポートのたびにファイルサイズが膨らんでいた（パラメータテクスチャはマテリアルごとに別 `DataTexture` として生成されるため対象外。数百バイト規模のため実害は小さい）
- 元 KTX2 バイナリの複製を画像インデックス単位でメモ化。同じアトラス画像を参照するマテリアルの数だけ複製を確保していた
- 独自ローダーで KTX2 を読み込むケース向けに `rememberKtx2Source` を公開 API に追加
- 元バイナリの分からない圧縮テクスチャは、無言でプレースホルダに差し替えず原因の分かるエラーで失敗するようになった
- `imageToBlobAsync` の未ガードな `ImageBitmap` 参照を修正（`ImageBitmap` が無い環境で PNG 経路が ReferenceError になっていた）

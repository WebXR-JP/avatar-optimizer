# @webxr-jp/mtoon-atlas

## 0.1.6

### Patch Changes

- fe18d0a: KTX2圧縮済みVRMを再読み込み後にエクスポートすると「サポートされていない画像形式です」で必ず失敗する問題を修正 (#39)
  - `MToonAtlasLoaderPlugin` がロード時の元 KTX2 バイナリを記録し、`MToonAtlasExporterPlugin` が再エンコードせずそのまま書き出すようになった（画質劣化なし）。`textureCompression` オプションの有無に関わらず、KTX2 由来のテクスチャは KTX2 のまま出力される
  - アトラステクスチャの重複書き込みを解消。エクスポータのキャッシュキーを `texture.uuid` から `texture.source.uuid` に変更した。ローダーがマテリアルごとに `clone()` するため、従来は同じアトラス画像がマテリアル数ぶん重複して書き込まれ、再エクスポートのたびにファイルサイズが膨らんでいた（パラメータテクスチャはマテリアルごとに別 `DataTexture` として生成されるため対象外。数百バイト規模のため実害は小さい）
  - 元 KTX2 バイナリの複製を画像インデックス単位でメモ化。同じアトラス画像を参照するマテリアルの数だけ複製を確保していた
  - 独自ローダーで KTX2 を読み込むケース向けに `rememberKtx2Source` を公開 API に追加
  - 元バイナリの分からない圧縮テクスチャは、無言でプレースホルダに差し替えず原因の分かるエラーで失敗するようになった
  - `imageToBlobAsync` の未ガードな `ImageBitmap` 参照を修正（`ImageBitmap` が無い環境で PNG 経路が ReferenceError になっていた）

- b20943a: COLOR_0頂点カラーを持つVRMを最適化すると、再読込時にシェーダーがコンパイルエラーになりアバターが不可視になる問題を修正。MToonAtlasMaterialに、上流three-vrmのMToonMaterialが既定で設定しているのと同じ`IGNORE_VERTEX_COLOR` defineを追加する（VRM0.x MToonの「頂点カラーを無視する」意味論とも一致）

## 0.1.5

### Patch Changes

- 8e72ddd: KTX2圧縮でsRGB転送関数が指定されず、カラーテクスチャがリニア扱いになり表示が白く浮く問題を修正。`Ktx2CompressionOptions`に`srgb`オプションを追加し、`MToonAtlasExporterPlugin`はテクスチャの`colorSpace`から自動判定して渡す
- Updated dependencies [8e72ddd]
  - @webxr-jp/texture-compression@0.1.1

## 0.1.4

### Patch Changes

- e8e9155: fix: テクスチャなしマテリアルがアトラス統合時に黒くなる問題を修正、デバッグ用console.logを削除

## 0.1.3

### Patch Changes

- Bug fixes and improvements

## 0.1.2

### Patch Changes

- f783179: Cutoutマテリアルが不透明になる問題を修正

## 0.1.1

### Patch Changes

- cfb6b18: Bug fixes and improvements

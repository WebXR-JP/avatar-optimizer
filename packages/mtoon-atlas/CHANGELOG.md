# @webxr-jp/mtoon-atlas

## 0.3.0

### Minor Changes

- 421c88d: KTX2 テクスチャの colorSpace を上書きしないようにした (#40)

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

## 0.2.0

### Minor Changes

- 4f61fb0: KTX2 トランスコーダーの配信元を設定できるようにした (#32)

  これまで jsdelivr の CDN URL がハードコードされており、CDN 障害の影響を受けても利用側で対処できなかった（実際に本番で CORS エラーが発生し、`patch-package` でビルド成果物を書き換えて回避されていた）。また three@0.175.0 固定のため、利用側がインストールしている three とバージョンがずれていた。

  差し替え方法を 3 通り追加した。優先順位は上から順。
  - `MToonAtlasLoaderPlugin(parser, { ktx2Loader })` — 設定済みインスタンスを注入する。GLTFLoader 側と共有すれば二重生成も避けられる
  - `MToonAtlasLoaderPlugin(parser, { ktx2TranscoderPath })` — プラグイン単位でパスを指定する
  - `setKtx2TranscoderPath(path)` — アプリ全体の既定値を変える。起動時に一度呼ぶだけでよく、プラグインを複数箇所で生成している場合に便利

  `loadVRM(source, options)` も同じオプションを受け取るようになった。あわせて、これまで GLTFLoader 用と `MToonAtlasLoaderPlugin` 用に別々の KTX2Loader を生成していたのを、1 つを共有するようにした（初期化用の一時 WebGLRenderer が 2 つ作られなくなる）。

  既定値は従来どおり CDN のままなので、既存の利用者に影響はない。

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

# @webxr-jp/mtoon-atlas

## 0.5.1

### Patch Changes

- 8261855: MToonAtlasLoaderPlugin でアトラステクスチャとパラメータをキャッシュ共有するようにしました。

## 0.5.0

### Minor Changes

- 9a9e5d2: `MToonAtlasNodeMaterial`（WebGPURenderer / TSL 版）のパラメータ参照をパラメータテクスチャからマテリアル個別の Uniform Buffer（UBO）へ移行し、シェーダーキャッシュ共有を有効化した。
  - `ParameterBufferDescriptor`・`setParameterBuffer()`・`parameterBuffer` および UBO バケット計算ユーティリティ（`PARAMETER_UBO_BUCKET_SLOTS` / `resolveParameterBucketSlots` / `createPaddedParameterBuffer` / `getMaxParameterUBOSlots`）を追加した。従来の `parameterTexture` / `setParameterTexture()` も内部で UBO バッファへ変換して後方互換を維持する
  - `MToonAtlasNodeMaterial` のアトラステクスチャ参照を `materialReference` へ移行し、`customProgramCacheKey()` から `this.uuid` を削除した。同じ UBO バケットサイズ（8 / 16 / 32 / 64 / 112 スロット）・構成の別マテリアル／別アバター間でシェーダーキャッシュを共有できる
  - UBO 上限（WebGL2 最小保証 16 KB 基準、既定 9 vec4/slot で最大 113 スロット）を超えるスロット数は明示的にエラー（`MToonAtlasNodeMaterial` では `RangeError`、`combineMToonMaterials` では `PARAMETER_TEXTURE_FAILED`）を返すようにした
  - `avatar-optimizer` 側で `packMaterialParameters()`（生 `Float32Array` 生成）を分離し、`MToonAtlasNodeMaterial` の最適化・`MToonAtlasLoaderPlugin` での再読み込み・`MToonAtlasExporterPlugin` での書き出しでパラメータ用の `DataTexture` を生成しないようにした（glTF 拡張 `XRIFT_mtoon_atlas` の保存形式は既存互換を維持）

## 0.4.0

### Minor Changes

- ef1e7b4: KTX2 の対応形式（ASTC / BC / ETC2 など）を、描画に使うレンダラーで判定できるようにした。`setKtx2Renderer(renderer)` でアプリ全体の既定を、`MToonAtlasLoaderPlugin` / `loadVRM` の `ktx2Renderer` オプションで呼び出しごとに指定できる。WebGPURenderer（`init()` 済み）も渡せる。これまでは常に一時 WebGLRenderer で判定していたため、WebGPURenderer で描画すると WebGPU で扱えない形式が選ばれることがあった。指定しない場合の挙動は従来どおり
- ef1e7b4: WebGPURenderer 向けに TSL 版の `MToonAtlasNodeMaterial` を追加した。`@webxr-jp/mtoon-atlas/nodes` から読み込む。描画結果は GLSL 版の `MToonAtlasMaterial` に合わせてある。あわせて `MToonAtlasLoaderPlugin` に `materialType` オプションを追加し、再読み込み時に生成するマテリアルを選べるようにした。パラメータテクスチャの既定レイアウト `DEFAULT_PARAMETER_LAYOUT` と、両マテリアル共通の型 `MToonAtlasMaterialLike` / `MToonAtlasMaterialConstructor` も公開した。`MToonAtlasExporterPlugin` は両マテリアルを書き出せるようにし、アトラスマテリアルを GLTFExporter 標準のマテリアル変換に通さないようにした（GLSL 版で出ていた `GLTFExporter: THREE.ShaderMaterial not supported.` の警告も出なくなる）

  再読み込み時に `MToonAtlasMaterial` のマテリアル名が `MToonAtlasMaterial` に置き換わっていた問題も修正した。コンストラクタが `name` を反映していなかった

  `MToonAtlasMaterialLike` に `createOutlineMaterial()` を追加した

### Patch Changes

- ef1e7b4: three.js r187 に対応した。開発・テストに使う three を 0.187 に上げ、`@webxr-jp/avatar-optimizer` の peerDependencies の `three` を `^0.181.1`（0.181.x のみ）から `>=0.181` に広げた（`@webxr-jp/mtoon-atlas` と同じ範囲）

  r187 の WebGPURenderer では、影パスでマルチマテリアルの side が交互に変わるたびにレンダーパイプラインが作り直される不具合が直っている。r186 以前では、MToon の本体（FrontSide）とアウトライン（BackSide）を持つメッシュで毎フレーム大量のパイプラインが作られ、Safari では描画が極端に遅くなる

  `MToonAtlasNodeMaterial` を r187 の型定義（`@types/three` 0.187）でビルドできるようにした。実行時の挙動は変わらない。KTX2 のソースキャッシュは、r186 で `Source` から改名された `TextureSource` を使うようにした

  注意: 2026 年 11 月時点の `@pixiv/three-vrm`（3.5.5 まで）の `@pixiv/three-vrm/nodes` は、r187 で削除された `transformedNormalView` を import しているため、r187 では読み込めない（pixiv/three-vrm#1889）。WebGPURenderer で元の `MToonNodeMaterial` を使う場合は、three-vrm の修正版が出るまで r186 以下を使うか、three-vrm にパッチを当てる必要がある

## 0.3.2

### Patch Changes

- e364c5f: MToon 以外のマテリアル（KHR_materials_specular などを使う PBR のアクセサリ）を含むアバターをエクスポートすると、`extensionsUsed` から `VRMC_vrm` / `VRMC_springBone` / `XRIFT_mtoon_atlas` / `KHR_texture_basisu` が消え、読み込み直しても VRM として認識されない問題を修正した。GLTFExporter は書き出し時に `writer.extensionsUsed` のキー一覧で `json.extensionsUsed` を上書きするため、プラグインが `json.extensionsUsed` に直接追加した拡張名は、組み込み拡張が 1 つでも使われると失われていた。拡張名を `writer.extensionsUsed` に登録するようにした

## 0.3.1

### Patch Changes

- 46cde63: ローダーの afterRoot でアウトライン（isOutline）マテリアルのメッシュの renderOrder を本体より下げるようにした。renderOrder は glTF に保存されず、再読み込み後は透明グループの黒いアウトラインが本体の後に描かれて髪などが真っ黒になっていた（#66）
- 3358f8f: 半透明マテリアルを深度書き込みの有無で別グループ（transparentZWrite / transparent）に分け、MToon の TransparentWithZWrite を最適化後も保持するようにした。これまでは半透明を一律 depthWrite=false にまとめていたため、髪など TransparentWithZWrite のマテリアルで作者が意図した深度による前後関係（毛束の重なり・アウトラインの隠蔽）が失われていた。あわせて拡張に `transparentWithZWrite` を保存して読み込み時に depthWrite を復元し、ローダーの描画順は three-vrm と同じ規則（深度書き込みなしの半透明を renderOrder 19 で後に描く）に揃えた（#66）

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

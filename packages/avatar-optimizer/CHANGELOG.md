# @webxr-jp/avatar-optimizer

## 0.2.1

### Patch Changes

- Updated dependencies [421c88d]
  - @webxr-jp/mtoon-atlas@0.3.0

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

### Patch Changes

- Updated dependencies [4f61fb0]
  - @webxr-jp/mtoon-atlas@0.2.0

## 0.1.6

### Patch Changes

- 407f83a: NodeConstraint拡張がエクスポートで全件欠落する問題を修正（instanceof によるクラス判定が @pixiv/three-vrm バンドル内のクラス別実体と不成立になるため、プロパティ有無での判定に変更）
- Updated dependencies [8e72ddd]
  - @webxr-jp/texture-compression@0.1.1
  - @webxr-jp/mtoon-atlas@0.1.5

## 0.1.5

### Patch Changes

- 47a60b3: VRM0の装飾メッシュ（Antenna・剣など、IBMにノードtranslationが焼き込まれたSkinnedMesh）が最適化後に原点へ移動する問題を修正
  - メッシュ統合の統一先を「基準メッシュのバインド空間」から「正準なモデル空間」（IBM=ボーンワールドの逆、bindMatrix=identity）に変更。VRM0→VRM1マイグレーションのIBM再計算と整合するようにした
  - SpringBoneのcenterノードに付与される実行時userData（inverseCacheProxy）がglTFのextrasへ直列化され、再インポート時にSpringBone初期化がクラッシュする問題を修正
  - VRM0→VRM1マイグレーションで非ゼロpositionのSkinnedMeshやボーン直下の非Boneメッシュの位置が保持されるように修正

  その他の挙動変更:
  - MToonマテリアルを持たないモデルは `optimizeModel` がエラーではなく成功を返すようになった（アトラス化・マテリアル統合をスキップし、簡略化とマイグレーションのみ実行）
  - 非SkinnedMesh（ボーン直下のリジッドな装飾メッシュ）はボーンペアレント保持のためメッシュ統合・簡略化の対象外になった
  - アトラス生成時、全マテリアルが持たないテクスチャスロットは黒アトラスではなく中立色のダミーテクスチャで埋まるようになった

## 0.1.4

### Patch Changes

- e8e9155: fix: テクスチャなしマテリアルがアトラス統合時に黒くなる問題を修正、デバッグ用console.logを削除
- Updated dependencies [e8e9155]
  - @webxr-jp/mtoon-atlas@0.1.4

## 0.1.3

### Patch Changes

- 8ca8223: NodeConstraint拡張（aim/roll/rotation制約）のロード・エクスポートに対応

## 0.1.2

### Patch Changes

- f783179: Cutoutマテリアルが不透明になる問題を修正
- Updated dependencies [f783179]
  - @webxr-jp/mtoon-atlas@0.1.2

## 0.1.1

### Patch Changes

- cfb6b18: Bug fixes and improvements
- Updated dependencies [cfb6b18]
  - @webxr-jp/mtoon-atlas@0.1.1

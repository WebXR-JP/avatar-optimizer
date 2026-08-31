# @webxr-jp/avatar-optimizer

## 0.3.0

### Minor Changes

- 81f2454: アトラス化をスキップした場合に理由を返すようにした (#41)

  `optimizeModel` は MToonMaterial が見つからない場合、アトラス化とマテリアル統合をスキップして正常終了する。仕様どおりの挙動だが、呼び出し側から「スキップされた」ことを知る手段が無く、**最適化を実行したのに何も起きていない状態に気づけなかった**。

  後続の KTX2 テクスチャ圧縮はアトラス化されたマテリアルにしか適用されないため、スキップに気づかないまま圧縮されていない VRM が出力される点も問題だった。

  `CombinedMeshResult` に `atlasSkipped` を追加した。スキップした場合のみ入る。

  ```ts
  const result = await optimizeModel(vrm)
  if (result.isOk() && result.value.atlasSkipped) {
    console.warn(result.value.atlasSkipped.message)
  }
  ```

  理由は 2 種類ある。
  - `ALREADY_OPTIMIZED` … 既にアトラス化済み。アトラス化するとマテリアルは `MToonAtlasMaterial` に置き換わるため、2 回目以降は MToonMaterial が見つからない
  - `NO_MTOON_MATERIAL` … モデルに MToonMaterial が 1 つも無い

  **あわせて重複実行時の破壊を防ぐようにした。** これまで `ALREADY_OPTIMIZED` に該当するケースでも簡略化とマイグレーションは実行されていたが、どちらも冪等ではない。
  - 簡略化は再実行のたびに頂点が減り続ける
  - `migrateSkeletonVRM0ToVRM1` は Y 軸 180 度回転と頂点／bindMatrix の焼き込みを行うが `vrm.meta.metaVersion` を更新しないため、VRM0 モデルでは二重適用されてアバターが後ろ向きになる

  既に最適化済みと判定した場合は、これらも含めて何も行わない。

  `message` は呼び出し側でそのまま表示できる説明文。

  既存フィールドは変更していないため後方互換性は保たれる。あわせて `CombinedMeshResult`（`optimizeModel` の戻り値型）を公開 API に追加した。

- f29f1b9: VRM 0.x のライセンス・権限情報が最適化後に失われる問題を修正しました。

  VRM 0.x と VRM 1.0 では権限フィールドの名前が異なる（`allowedUserName` / `avatarPermission` など）ため、読み替えないと未定義扱いになり、最も制限的な既定値で書き出されていました。「誰でも利用可・商用可」のモデルが「作者のみ・非営利」として記録されます。

  変換規則は UniVRM のリファレンス実装（`MigrationVrmMeta.cs`）に準拠しています。「きつくなる方向は許すが、緩くなる方向は許さない」という方針で、`commercialUssageName: Allow` は `corporation` ではなく `personalProfit` に落とします。

  `licenseName`（CC ライセンス）は権限に反映しません。UniVRM も同様で、CC の条文から権限を推論して緩めることを避けています。そのため CC0 のモデルでも `modification` は `prohibited` のままです。

  VRM 0.x の CC ライセンスは `licenseUrl` ではなく `otherLicenseUrl` に記録します。CC の URL を `licenseUrl` に書くと、three-vrm の `acceptLicenseUrls`（既定は VRM 1.0 の URL のみ）に弾かれ、標準設定のアプリで開けないファイルになるためです。

  あわせて、VRM 0.x / 1.0 を問わず起きていた 2 つの欠落も直しました。
  - `otherLicenseUrl` / `otherPermissionUrl` が常に消えていた（`licenseName: Other` では条文への唯一のリンク）
  - サムネイルが失われていた。仕様上 `meta.thumbnailImage` は `gltf.images` のインデックスですが、`textures` のインデックスを書いていました

  VRM 1.0 のモデルで既に指定済みの権限は変わりません。

### Patch Changes

- c702e7d: `loadVRM` で冗長だった `VRMNodeConstraintLoaderPlugin` の個別登録を削除 (#43)

  傘パッケージ `@pixiv/three-vrm` の `VRMLoaderPlugin` は、`options.nodeConstraintPlugin` が未指定なら内部で `VRMNodeConstraintLoaderPlugin` を生成する。`loadVRM` は `metaPlugin` しか渡していないため、その隣で行っていた個別登録は重複していた。

  VRM が掴む `nodeConstraintManager` は常に傘側が生成したものなので、個別登録したプラグインは manager を二重に作るだけで実際には使われていなかった。挙動の変更はない。

  傘に同梱されたクラスと単体パッケージのクラスは別実体になり、`instanceof` 判定が成立しないという紛らわしさの温床にもなっていた（エクスポート側は #37 でダックタイピング化済み）。

- 4ea142f: VRMC_node_constraint のエクスポート時、spec 外のカスタム制約を rotation 制約として書き出す際に警告を出すようにしました。

  VRMC_node_constraint 1.0 が定義するのは roll / aim / rotation の 3 種のみですが、`VRMNodeConstraint` を直接継承した独自の制約もこの経路に落ちて rotation として出力されます。これまでは無言だったため、再生側で意図しない回転コピーが起きても原因を追えませんでした。

  出力される glTF は変わりません。診断用の `console.warn` が増えるだけです。

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

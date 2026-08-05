# @webxr-jp/avatar-optimizer

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

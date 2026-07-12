---
'@webxr-jp/avatar-optimizer': patch
---

VRM0の装飾メッシュ（Antenna・剣など、IBMにノードtranslationが焼き込まれたSkinnedMesh）が最適化後に原点へ移動する問題を修正

- メッシュ統合の統一先を「基準メッシュのバインド空間」から「正準なモデル空間」（IBM=ボーンワールドの逆、bindMatrix=identity）に変更。VRM0→VRM1マイグレーションのIBM再計算と整合するようにした
- SpringBoneのcenterノードに付与される実行時userData（inverseCacheProxy）がglTFのextrasへ直列化され、再インポート時にSpringBone初期化がクラッシュする問題を修正
- VRM0→VRM1マイグレーションで非ゼロpositionのSkinnedMeshやボーン直下の非Boneメッシュの位置が保持されるように修正

その他の挙動変更:

- MToonマテリアルを持たないモデルは `optimizeModel` がエラーではなく成功を返すようになった（アトラス化・マテリアル統合をスキップし、簡略化とマイグレーションのみ実行）
- 非SkinnedMesh（ボーン直下のリジッドな装飾メッシュ）はボーンペアレント保持のためメッシュ統合・簡略化の対象外になった
- アトラス生成時、全マテリアルが持たないテクスチャスロットは黒アトラスではなく中立色のダミーテクスチャで埋まるようになった

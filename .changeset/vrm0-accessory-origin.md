---
'@webxr-jp/avatar-optimizer': patch
---

VRM0の装飾メッシュ（Antenna・剣など、IBMにノードtranslationが焼き込まれたSkinnedMesh）が最適化後に原点へ移動する問題を修正

- メッシュ統合の統一先を「基準メッシュのバインド空間」から「正準なモデル空間」（IBM=ボーンワールドの逆、bindMatrix=identity）に変更。VRM0→VRM1マイグレーションのIBM再計算と整合するようにした
- SpringBoneのcenterノードに付与される実行時userData（inverseCacheProxy）がglTFのextrasへ直列化され、再インポート時にSpringBone初期化がクラッシュする問題を修正
- VRM0→VRM1マイグレーションで非ゼロpositionのSkinnedMeshやボーン直下の非Boneメッシュの位置が保持されるように修正

---
'@webxr-jp/avatar-optimizer': patch
---

`optimizeModel` 実行後に元の VRM リソースへの強参照が残らないよう修正しました。`vrm.materials`・`vrm.firstPerson.meshAnnotations`・`vrm.expressionManager` を最適化後の構成へ更新し、置換済みの元マテリアル（アウトライン含む）・未使用テクスチャ・削除メッシュの非共有ジオメトリ／スケルトン・結合ジオメトリの一時 `userData` 参照・`CombinedMeshResult.materialSlotIndex`、および `migrateVRM0ToVRM1` 時の旧 `meta.texture` を解放します。

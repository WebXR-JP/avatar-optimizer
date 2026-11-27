---
'@webxr-jp/avatar-optimizer': minor
---

VRM の表情（`vrm.expressionManager`）から参照されていない BlendShape（MorphTarget）をまとめて削除する機能を追加しました。`OptimizeModelOptions.removeUnusedBlendShapes: true`（既定は `false`）または単体 API `removeUnusedBlendShapes(vrm)` で実行でき、残存 BlendShape に合わせて表情バインドのインデックスを自動でリマップします。削除統計は `CombinedMeshResult.statistics.blendShapes`（`RemoveUnusedBlendShapesStatistics`）に記録されます。

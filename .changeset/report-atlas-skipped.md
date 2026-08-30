---
'@webxr-jp/avatar-optimizer': minor
---

アトラス化をスキップした場合に理由を返すようにした (#41)

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

`message` は呼び出し側でそのまま表示できる説明文。

既存フィールドは変更していないため後方互換性は保たれる。あわせて `CombinedMeshResult`（`optimizeModel` の戻り値型）を公開 API に追加した。

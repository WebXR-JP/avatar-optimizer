# テクスチャアトラス座標リファクタ進捗メモ

## 2025-02-14 進捗

- `types.ts` にマテリアル中心の新型 (`TextureSlot`, `AtlasTextureDescriptor`, `AtlasMaterialDescriptor`, `SlotAtlasImage`, `MaterialPlacement` など) を整備。
  - 既存の `Vector2` / `IslandTransform` は未使用だったため削除。
- パッキング結果を UV 正規化座標へ変換するユーティリティ `toNormalizedPackingResult` を追加。
  - これにより、今後の描画・行列計算はピクセル解像度に依存せず、正規化矩形を基準に扱える。
- `draw-image-jimp.ts` を正規化入力対応へ刷新。
  - Jimp 合成前に `uvMin/uvMax` からピクセル単位の矩形に変換し、代表テクスチャ以外でも同じ矩形を共有できる準備が整った。
- `packAndCreateAtlas` は既に `toNormalizedPackingResult` を通した結果を Jimp 処理へ渡すよう更新。
- 新コア `buildAtlases` のスタブ (`src/core/atlas-builder.ts`) を作成。ここへマテリアル記述子ベースのロジックを集約予定。
- Jest 実行 (`pnpm --filter @xrift/avatar-optimizer-texture-atlas test`) は既存問題により worker 異常終了。新変更による失敗は未確認。

## TODO
- `buildAtlases` へ代表テクスチャによるパッキング・UV 行列計算・スロット別アトラス生成を実装。
- glTF Adapter 層整備、および旧 `process-gltf-atlas` からの段階移行。
- UV 更新は adapter (呼び出し元) に委譲する方針で、`MaterialPlacement` の行列仕様を最終確定。

# avatar-optimizer TODO (2024-XX-XX)

- [ ] CLI の最適化結果がアトラス適用前後で差分を持たない問題を調査する。
  - `applyAtlasResult()`→`consumePendingPlacements()`→`remapPrimitiveUVs()` の呼び出し順は `core/optimizer.ts` で完了しているが、書き出した GLB を inspect/validate するとテクスチャ構成が元のまま。
  - suspicion: `ScenegraphAdapter.flush()` 後に `scenegraph.unwrap()` した内容が `writeVRMDocumentWithLoadersGL()` まで伝搬していない可能性、または `buildAtlases()` が descriptor 0 件で終わっている。
  - CLI 再現手順: `pnpm -F avatar-optimizer run build` → `node dist/cli.mjs optimize tmp/dairichan_purebunny.vrm -o tmp/dairichan_purebunny_cli.vrm` → `pnpm dlx @gltf-transform/cli inspect tmp/dairichan_purebunny_cli.vrm --format=md`。

- [ ] glTF Transform Validator をテストに組み込み、`ACCESSOR_MIN/MAX_MISMATCH` や `UNEXPECTED_PROPERTY` を回帰テストで検出する。
  - `packages/avatar-optimizer/__tests__/` に軽量 VRM/GLB フィクスチャを置き、`optimizeVRM()` 出力をメモリ上で検証するユニットテストを追加。

- [ ] ScenegraphAdapter の `pendingPlacements` から複数 TEXCOORD を拾うロジックを見直す。
  - 既に UV リマップは min/max 更新済みだが、`texCoordIndices` を導入するとリマップ対象が増えるため、描画崩れの根本原因を突き止めてから再導入したい。

- [ ] CLI ログにテクスチャ削減やアトラス作成状況を表示し、不具合時に即座に検知できるようにする。

- [ ] docs/VRM_Texture_Mapping.csv を拡充し、ベースとなるテクスチャ解像度や推奨圧縮設定をまとめる。


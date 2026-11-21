---
"@webxr-jp/avatar-optimizer": patch
"@webxr-jp/mtoon-atlas": patch
---

three.js r187 に対応した。開発・テストに使う three を 0.187 に上げ、`@webxr-jp/avatar-optimizer` の peerDependencies の `three` を `^0.181.1`（0.181.x のみ）から `>=0.181` に広げた（`@webxr-jp/mtoon-atlas` と同じ範囲）

r187 の WebGPURenderer では、影パスでマルチマテリアルの side が交互に変わるたびにレンダーパイプラインが作り直される不具合が直っている。r186 以前では、MToon の本体（FrontSide）とアウトライン（BackSide）を持つメッシュで毎フレーム大量のパイプラインが作られ、Safari では描画が極端に遅くなる

`MToonAtlasNodeMaterial` を r187 の型定義（`@types/three` 0.187）でビルドできるようにした。実行時の挙動は変わらない。KTX2 のソースキャッシュは、r186 で `Source` から改名された `TextureSource` を使うようにした

注意: 2026 年 11 月時点の `@pixiv/three-vrm`（3.5.5 まで）の `@pixiv/three-vrm/nodes` は、r187 で削除された `transformedNormalView` を import しているため、r187 では読み込めない（pixiv/three-vrm#1889）。WebGPURenderer で元の `MToonNodeMaterial` を使う場合は、three-vrm の修正版が出るまで r186 以下を使うか、three-vrm にパッチを当てる必要がある

---
'@webxr-jp/avatar-optimizer': patch
---

`loadVRM` で冗長だった `VRMNodeConstraintLoaderPlugin` の個別登録を削除 (#43)

傘パッケージ `@pixiv/three-vrm` の `VRMLoaderPlugin` は、`options.nodeConstraintPlugin` が未指定なら内部で `VRMNodeConstraintLoaderPlugin` を生成する。`loadVRM` は `metaPlugin` しか渡していないため、その隣で行っていた個別登録は重複していた。

VRM が掴む `nodeConstraintManager` は常に傘側が生成したものなので、個別登録したプラグインは manager を二重に作るだけで実際には使われていなかった。挙動の変更はない。

傘に同梱されたクラスと単体パッケージのクラスは別実体になり、`instanceof` 判定が成立しないという紛らわしさの温床にもなっていた（エクスポート側は #37 でダックタイピング化済み）。

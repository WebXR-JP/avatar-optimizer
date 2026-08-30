---
'@webxr-jp/avatar-optimizer': patch
---

VRMC_node_constraint のエクスポート時、spec 外のカスタム制約を rotation 制約として書き出す際に警告を出すようにしました。

VRMC_node_constraint 1.0 が定義するのは roll / aim / rotation の 3 種のみですが、`VRMNodeConstraint` を直接継承した独自の制約もこの経路に落ちて rotation として出力されます。これまでは無言だったため、再生側で意図しない回転コピーが起きても原因を追えませんでした。

出力される glTF は変わりません。診断用の `console.warn` が増えるだけです。

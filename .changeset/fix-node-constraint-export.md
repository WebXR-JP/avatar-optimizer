---
"@webxr-jp/avatar-optimizer": patch
---

NodeConstraint拡張がエクスポートで全件欠落する問題を修正（instanceof によるクラス判定が @pixiv/three-vrm バンドル内のクラス別実体と不成立になるため、プロパティ有無での判定に変更）

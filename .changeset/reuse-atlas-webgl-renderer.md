---
'@webxr-jp/avatar-optimizer': minor
---

アトラス合成処理ごとに `WebGLRenderer`（WebGL コンテキスト）が新規生成・破棄されていた問題を修正し、共有のオフスクリーン `WebGLRenderer` を遅延生成して再利用するようにしました。コンテキストロスト時は自動的に再生成されます。あわせて、共有レンダラーと WebGL コンテキストを明示的に解放する `disposeAtlasRenderer()` を公開します。

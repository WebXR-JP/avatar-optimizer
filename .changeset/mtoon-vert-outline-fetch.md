---
'@webxr-jp/mtoon-atlas': patch
---

GLSL 頂点シェーダー（`mtoon.vert`）の `outlineWidthFactor` サンプリングを `#ifdef OUTLINE` ブロック内へ移動し、本体描画パスでの不要な頂点テクスチャフェッチを除去しました。

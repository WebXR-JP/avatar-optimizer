# Issue #40 の比較スクリーンショット

PR #55 の説明用。#36 修正前に最適化された VRM（baseColor がリニアタグの KTX2）を
debug-viewer で表示したもの。

- `before-fix.png` … 従来の挙動（ローダーが colorSpace を上書きするため正しく見える）
- `after-fix.png`  … PR #55 適用後（DFD のとおりに扱われ白く浮く）

このブランチは画像のホスティング専用で、main にはマージしない。

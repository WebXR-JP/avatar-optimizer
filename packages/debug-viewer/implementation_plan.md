# Implementation Plan - Scene Inspector

debug-viewerにシーンインスペクタを追加しました。

## 変更内容

1.  **SceneInspectorコンポーネントの作成**
    *   `src/components/SceneInspector.tsx` を新規作成しました。
    *   シーンヒエラルキーを表示するツリービュー (`SceneNode`) を実装しました。
    *   選択されたノードの詳細を表示するパネル (`InspectorPanel`) を実装しました。
    *   MUIの `List`, `ListItemButton`, `Collapse` などを使用してUIを構築しました。
    *   **修正:** ライトモード（白背景）での視認性を確保するため、テキスト色を黒（`black` または `rgba(0, 0, 0, 0.6)`）に固定しました。

2.  **コンポーネントのエクスポート**
    *   `src/components/index.ts` に `SceneInspector` のエクスポートを追加しました。

3.  **App.tsxの更新**
    *   `SceneInspector` をインポートしました。
    *   `Tabs` に "Scene Inspector" タブを追加しました。
    *   タブ切り替え時に `SceneInspector` を表示するロジックを追加しました。

## 検証手順

1.  `debug-viewer` を起動します (`pnpm dev`)。
2.  "Scene Inspector" タブをクリックします。
3.  シーンヒエラルキーが表示されることを確認します。
4.  **視認性確認:** 白い背景に対して黒いテキストで情報が表示され、読みやすいことを確認します。
5.  ノードを展開・選択して、右側のパネルに詳細情報（名前、タイプ、UUID、Transform、Material、Geometry）が表示されることを確認します。

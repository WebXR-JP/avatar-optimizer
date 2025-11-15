# @xrift/avatar-optimizer Debug Viewer

VRM デバッグビューア - React Three Fiber ベースの VRM モデル表示ツール。

## 概要

このビューアは、最適化された VRM モデルのリアルタイム確認を目的とした簡易ビューアです。React + React Three Fiber を使用して、WebGL でのハイパフォーマンス 3D 表示を実現しています。

## 機能

- **VRM ファイルのアップロード**: ローカルの VRM ファイルをブラウザにロード
- **リアルタイム表示**: Three.js + React Three Fiber によるスムーズな 3D レンダリング
- **自動アニメーション更新**: VRM モデルのアニメーションを自動更新
- **ライティング**: 太陽光と環境光による実況的な陰影付け
- **グリッド表示**: 床グリッドで空間配置を可視化

## 開発

```bash
# インストール
pnpm install

# 開発サーバー起動
pnpm -F debug-viewer run dev

# ビルド
pnpm -F debug-viewer run build

# プロダクション確認
pnpm -F debug-viewer run preview
```

## 依存関係

- **React 19**: UI フレームワーク
- **React Three Fiber**: Three.js の React バインディング
- **Three.js**: 3D グラフィックス
- **@pixiv/three-vrm**: VRM ローダー
- **neverthrow**: 関数型エラーハンドリング

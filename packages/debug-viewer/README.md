# @webxr-jp/avatar-optimizer Debug Viewer

VRM デバッグビューア - React Three Fiber ベースの VRM モデル表示ツール。

## 概要

このビューアは、最適化された VRM モデルのリアルタイム確認を目的とした簡易ビューアです。React + React Three Fiber を使用して、WebGL でのハイパフォーマンス 3D 表示を実現しています。

## 機能

- **VRM ファイルのアップロード**: ローカルの VRM ファイルをブラウザにロード
- **リアルタイム表示**: Three.js + React Three Fiber によるスムーズな 3D レンダリング
- **自動アニメーション更新**: VRM モデルのアニメーションを自動更新
- **ライティング**: 太陽光と環境光による実況的な陰影付け
- **グリッド表示**: 床グリッドで空間配置を可視化
- **ライセンス表示**: 読み込んだ VRM の利用条件をサイドバーに一覧表示

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

### 同梱モデル

モデル選択のドロップダウンから読み込めます。

| モデル | 用途 |
| --- | --- |
| AliciaSolid | 通常の動作確認用 |
| AliciaSolid (COLOR_0) | 頂点カラーの回帰確認用（下記） |
| Vivi / Vita | 通常の動作確認用 |

#### AliciaSolid (COLOR_0) について

`AliciaSolid.vrm` の全プリミティブに `COLOR_0`（頂点カラー・VEC4・全成分 1.0）を注入したものです。

**なぜ必要か**: `COLOR_0` を持つモデルを最適化して読み込み直すと、`MToonAtlasMaterial` のシェーダーがコンパイルエラーになりアバターが不可視になる不具合がありました（[#45](https://github.com/WebXR-JP/avatar-optimizer/pull/45)）。`COLOR_0` が VEC4 だと three.js が `USE_COLOR_ALPHA` を注入して `vColor` が vec4 になり、`mtoon.frag` の `diffuseColor.rgb *= vColor` が vec3 \*= vec4 になるためです。

VRoid や UniVRM の書き出しは通常 `COLOR_0` を含まないため、同梱の他のモデルではこの経路を踏めません。Blender など汎用 DCC 経由の VRM は頂点カラーを保持していることがあり、`COLOR_0` は glTF 2.0 の正規属性です。

**確認手順**: このモデルを選択 → `Optimize + Migrate` → `Reload Export`。アバターが正常に描画されれば OK です。不具合が再発している場合、**アバターだけが消えて影は残り**、コンソールに `WebGL: INVALID_OPERATION: useProgram: program not valid` が大量に出ます。

全成分を 1.0（純白）にしてあるので、頂点カラーが無視されても乗算されても見た目は変わりません。差が出るのはシェーダーのコンパイル可否だけです。

**再生成**: `node packages/avatar-optimizer/tools/inject-color0.js <input.vrm> <output.vrm>` で任意の VRM から作れます。

### ライセンス情報の確認

サイドバーの「ライセンス」セクションに、読み込んだ VRM の利用条件を表示します。
VRM 0.x と 1.0 ではフィールド名も値も違うため、同じ並びの行に正規化しています。
ファイルに入っている値をそのまま出し、括弧内に意味を添えます。

最適化でライセンスが落ちていないか確かめるには、メタの変換がエクスポート時に
行われる点に注意してください。`Optimize + Migrate` を押しただけでは表示は
VRM 0.x のままです。`Reload Export` で書き出して読み直すと VRM 1.0 の
メタに切り替わり、権限が保たれているか比較できます。

AliciaSolid（VRM 0.x）の場合は次のように変わります。

| | 変換前 | 変換後 |
| --- | --- | --- |
| 利用者 | `Everyone` | `everyone` |
| 商用利用 | `Allow` | `personalProfit` |

### サンプルモーション

開発時の動作確認用モーションとして、以下のページから VRMA ファイルをダウンロードし、`public/vrma/` に配置してください（ディレクトリがない場合は作成してください）。
今はVRMA_03.vrmaだけ使ってます

https://booth.pm/ja/items/5512385?srsltid=AfmBOop7sRKuMxeJwy_4IiEbqh4LKRcvTrI3b2AlYSh2IAC-48yIXH0Q

## 依存関係

- **React 19**: UI フレームワーク
- **React Three Fiber**: Three.js の React バインディング
- **Three.js**: 3D グラフィックス
- **@pixiv/three-vrm**: VRM ローダー
- **neverthrow**: 関数型エラーハンドリング

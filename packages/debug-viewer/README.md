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
- **マルチ VRM ストレステスト**: `/stress` で数十体を同時描画し、WebGL / WebGPU の性能を比較

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

### GitHub Pages での公開

`main` に push すると `.github/workflows/deploy-pages.yml` がビルドして
GitHub Pages へ公開します。

https://webxr-jp.github.io/avatar-optimizer/

- 初回のみ、リポジトリの **Settings > Pages > Source** を **GitHub Actions** にしておく
- プロジェクトページは `/avatar-optimizer/` のサブパス配信になるため、CI では
  Vite の `base` をリポジトリ名から決めている（ローカル開発は `/` のまま）。
  独自ドメインなどで配信する場合は `PAGES_BASE=/ pnpm -F debug-viewer run build` のように上書きする
- `public/` 配下のファイルは `publicUrl()`（`src/public-url.ts`）で参照する。
  ルート絶対パス（`/AliciaSolid.vrm` など）を直接書くとサブパス配信で 404 になる
- `/textures` や `/stress` を直接開いた場合は `dist/404.html`（index.html のコピー）で
  SPA を起動して復帰する。このとき HTTP ステータスは 404 になる

### レンダラーの切り替え（WebGL / WebGPU）

サイドバー「モデル」のレンダラー選択で切り替えます（URL の `?renderer=webgpu` でも指定可能）。切り替えるとページを再読み込みします。

- WebGPU では MToon を three-vrm の `MToonNodeMaterial`、最適化済み VRM を mtoon-atlas の `MToonAtlasNodeMaterial` で読み込み、`WebGPURenderer` で描画します
- WebGPU のアダプタが取得できない環境では three が WebGL2 バックエンドに自動でフォールバックします。実際のバックエンドはレンダラー選択の下に表示されます
- Spector.js と「WebGL ツール」は WebGL のときのみ使えます
- WebGPU での `Optimize` は `atlasMaterialType: MToonAtlasNodeMaterial` を指定して最適化します
- 開発時は `window.__viewer`（`renderer` / `scene` / `camera` / `rendererMode`）から描画状態を参照できます
- 開発時は `window.__viewerApp` から読み込み・最適化・表示を呼べます。WebGL 用マテリアルで読み込んで最適化した結果を WebGPU で表示する、といった比較に使えます

```javascript
const app = window.__viewerApp
const src = await app.loadVRMWithWebGLMaterials('/AliciaSolid.vrm')
await app.optimizeModel(src.value, { migrateVRM0ToVRM1: true })
const buf = await app.exportVRM(src.value)
const result = await app.loadVRM(buf.value) // 現在のレンダラーに合ったマテリアルで読み込む
app.setVRM(result.value)
```

### マルチ VRM ストレステスト（`/stress`）

数十体の VRM を同時に描画して、WebGL / WebGPU の描画性能・GPU メモリ・
テクスチャ数を比較するページです。サイドバー「その他」の
**Multi-VRM Stress Test**、または直接 `/stress` を開きます。

```
/stress?count=50&renderer=webgpu&optimize=1
```

条件はすべて URL クエリで指定でき、同じ URL を開けば同じ条件で再現できます。

| パラメータ | 内容 |
| --- | --- |
| `count` | 表示する VRM の数（既定 24 / 最大 100） |
| `model` | 使う VRM のパス（既定 `/AliciaSolid.vrm`） |
| `cols` | グリッドの列数（省略時は `count` から自動） |
| `springbone` | `0` で SpringBone の更新を止める（既定は有効） |
| `shadows` | `1` で影を有効にする（既定は無効） |
| `dpr` | 描画の devicePixelRatio（例: `1`）。省略時はディスプレイ依存 |
| `optimize` | `1` で最適化を 1 回だけ実行し、その結果を全員分に使い回す |
| `renderer` | `webgpu` で WebGPU 描画（通常ビューアと同じ） |

#### 計測値の読み方

| 項目 | 内容 |
| --- | --- |
| `fps` / `frame` | 実測のフレームレートとフレーム間隔。vsync で上限が付くため、60fps に張り付いているときは CPU 時間（`render()` の内訳）で比べる |
| `VRM update` | three-vrm の更新（SpringBone・表情など）にかかった時間 |
| `draw calls` | WebGL は実測値。WebGPU は three r187 が記録しないため `n/a` |
| `triangles` | WebGPU では `info.render.triangles` が 0 のため、メッシュの静的な合計を `(mesh)` 付きで表示 |
| `textures` | GPU に確保されたテクスチャ数。WebGL は `Texture.source` 単位、WebGPU は `Texture` インスタンス単位で数えるため、同じモデルでも値が異なる |

#### 最適化を 1 回だけ実行する

`optimize=1`（パネルの **Optimize (once)**）では、生の VRM を 1 回だけ
最適化 + エクスポートし、そのバイナリを全員分の読み込みに使い回します。
体数を変えても再最適化はしません（モデル・レンダラー・アトラス解像度が
変わったときだけ再実行）。最適化結果はパネルに、サイズ・マテリアル数・
スケルトン統合の結果として表示されます。

#### カスタム VRM

パネルの **Upload VRM** から手元の VRM を読み込めます。直近 1 件だけ
IndexedDB に保存し、再読み込みやレンダラー切替の後も復元します
（**Clear custom** で削除）。

#### 自動操作向け

開発時は `window.__stressViewer` から `renderer` / `scene` / `camera` /
`count()` を参照できます（通常ビューアの `window.__viewer` と同じ用途）。

### 描画性能の計測モード（`?perfprobe=1`）

Safari・Quest など、手元で DevTools を開けないブラウザで描画の問題を調べるための開発用モードです。`pnpm dev` の開発サーバーでのみ動きます。

```
https://<dev サーバー>/?renderer=webgpu&perfprobe=1
```

VRM を読み込むと、次の順に計測します。

1. 条件を変えながら描画時間を測る（そのまま / 影なし / VRM 非表示 / VRM の影なし / メッシュ 1 つずつの影）
2. 測り終えたら、5 秒ごとに状態を送り続ける

記録はページから開発サーバーの `/__perf-log` に送られ、`node_modules/.cache/perf-log.jsonl` に JSON Lines で追記されます。

| kind | 内容 |
|------|------|
| `env` | UA、実際のバックエンド、dpr、キャンバスサイズ |
| `meshes` | VRM の各メッシュ（頂点数・モーフ数・マテリアル） |
| `stage` / `monitor` | フレーム間隔、`render()` の CPU 時間、GPU 完了待ち、ドローコール、パイプラインの生成回数（`pipelineCreations`） |
| `gpu-error` | 捕捉されなかった WebGPU のエラー |
| `shader-compile` | WGSL のコンパイルエラー（該当行付き） |
| `console-error` / `console-warn` | console 出力。長いもの（Metal のコンパイルエラーなど）はエラー行と末尾だけ |
| `ui-click` / `ui-change` | ボタン操作・入力の変更（何をした直後に壊れたかを追うため） |
| `setSize` | レンダラーのリサイズ |

```bash
# 最新の記録を見る
tail -f packages/debug-viewer/node_modules/.cache/perf-log.jsonl
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

動作確認用の VRMA は `public/samples/test.vrma` に同梱しています。
これは [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) のサンプルモーションをそのまま置いたもので、
`Play Animation` を押すと再生されます。追加のダウンロードは不要です。

```bash
# 同梱ファイルを three-vrm の最新サンプルで更新する場合
curl -sL -o packages/debug-viewer/public/samples/test.vrma \
  https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm-animation/examples/models/test.vrma
```

自前のモーションで確認したい場合は、サイドバー「その他」セクションの **Upload VRMA** から
`.vrma` ファイルを選択すると、そのモーションに差し替えて再生します（リポジトリには保存されません）。
再生中のモーション名はボタンの下に表示されます。

`public/vrma/` に置いて起動時から使いたい場合は、`src/App.tsx` の `SAMPLE_VRMA_PATH` を
そのパスに変更してください（`public/vrma/` はリポジトリに含めないよう `.gitignore` 済みです）。

## 依存関係

- **React 19**: UI フレームワーク
- **React Three Fiber**: Three.js の React バインディング
- **Three.js**: 3D グラフィックス
- **@pixiv/three-vrm**: VRM ローダー
- **neverthrow**: 関数型エラーハンドリング

---
'@webxr-jp/mtoon-atlas': minor
'@webxr-jp/avatar-optimizer': minor
---

KTX2 トランスコーダーの配信元を設定できるようにした (#32)

これまで jsdelivr の CDN URL がハードコードされており、CDN 障害の影響を受けても利用側で対処できなかった（実際に本番で CORS エラーが発生し、`patch-package` でビルド成果物を書き換えて回避されていた）。また three@0.175.0 固定のため、利用側がインストールしている three とバージョンがずれていた。

差し替え方法を 3 通り追加した。優先順位は上から順。

- `MToonAtlasLoaderPlugin(parser, { ktx2Loader })` — 設定済みインスタンスを注入する。GLTFLoader 側と共有すれば二重生成も避けられる
- `MToonAtlasLoaderPlugin(parser, { ktx2TranscoderPath })` — プラグイン単位でパスを指定する
- `setKtx2TranscoderPath(path)` — アプリ全体の既定値を変える。起動時に一度呼ぶだけでよく、プラグインを複数箇所で生成している場合に便利

`loadVRM(source, options)` も同じオプションを受け取るようになった。あわせて、これまで GLTFLoader 用と `MToonAtlasLoaderPlugin` 用に別々の KTX2Loader を生成していたのを、1 つを共有するようにした（初期化用の一時 WebGLRenderer が 2 つ作られなくなる）。

既定値は従来どおり CDN のままなので、既存の利用者に影響はない。

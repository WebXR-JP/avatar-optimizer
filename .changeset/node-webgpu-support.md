---
'@webxr-jp/avatar-optimizer': minor
---

Node でも `loadVRM` → `optimizeModel` → `exportVRM` を実行できるようにしました。`AtlasGenerationOptions.renderer` でアトラス合成に使うレンダラー（WebGLRenderer / WebGPURenderer）を指定でき、Node 向けにはポリフィル（`installNodePolyfills`）と Dawn でアトラス合成用の WebGPURenderer を作る `createNodeAtlasRenderer` を `@webxr-jp/avatar-optimizer/node` から提供します。DOM の無い環境でも VRM 1.0 のサムネイルを保持します。内部のアトラス合成（`composeImagesToAtlas` / `generateAtlasImagesFromPatterns`）は非同期になりましたが、公開 API の `optimizeModel` は従来どおり `ResultAsync` を返します。KTX2 圧縮では `OptimizeModelOptions.ktx2Transcode: false` を指定すると KTX2Loader を使わずにエンコードだけを行い、`exportVRM` で KTX2 を出力できます（Node 向け）。

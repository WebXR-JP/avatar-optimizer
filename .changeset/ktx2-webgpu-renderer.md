---
"@webxr-jp/mtoon-atlas": minor
"@webxr-jp/avatar-optimizer": minor
---

KTX2 の対応形式（ASTC / BC / ETC2 など）を、描画に使うレンダラーで判定できるようにした。`setKtx2Renderer(renderer)` でアプリ全体の既定を、`MToonAtlasLoaderPlugin` / `loadVRM` の `ktx2Renderer` オプションで呼び出しごとに指定できる。WebGPURenderer（`init()` 済み）も渡せる。これまでは常に一時 WebGLRenderer で判定していたため、WebGPURenderer で描画すると WebGPU で扱えない形式が選ばれることがあった。指定しない場合の挙動は従来どおり

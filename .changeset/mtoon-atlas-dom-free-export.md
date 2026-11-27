---
'@webxr-jp/mtoon-atlas': patch
---

`MToonAtlasExporterPlugin` と `extractRgbaData` が `document` / `HTMLCanvasElement` / `HTMLImageElement` の無い環境（Node・Worker）でも動くよう、DOM が無い場合は `OffscreenCanvas` を使うようにしました。

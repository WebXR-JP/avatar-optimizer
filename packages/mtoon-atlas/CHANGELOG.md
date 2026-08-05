# @webxr-jp/mtoon-atlas

## 0.1.5

### Patch Changes

- 8e72ddd: KTX2圧縮でsRGB転送関数が指定されず、カラーテクスチャがリニア扱いになり表示が白く浮く問題を修正。`Ktx2CompressionOptions`に`srgb`オプションを追加し、`MToonAtlasExporterPlugin`はテクスチャの`colorSpace`から自動判定して渡す
- Updated dependencies [8e72ddd]
  - @webxr-jp/texture-compression@0.1.1

## 0.1.4

### Patch Changes

- e8e9155: fix: テクスチャなしマテリアルがアトラス統合時に黒くなる問題を修正、デバッグ用console.logを削除

## 0.1.3

### Patch Changes

- Bug fixes and improvements

## 0.1.2

### Patch Changes

- f783179: Cutoutマテリアルが不透明になる問題を修正

## 0.1.1

### Patch Changes

- cfb6b18: Bug fixes and improvements

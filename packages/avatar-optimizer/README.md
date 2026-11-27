# @webxr-jp/avatar-optimizer

3D model optimization library for WebXR applications.

## Features

- VRM model loading and export
- Texture atlas generation for material consolidation
- Mesh simplification using meshoptimizer
- KTX2 texture compression support
- VRM0 to VRM1 skeleton migration utilities
- Runs in browsers and in Node (atlas composition via WebGPU / Dawn)

## Installation

```bash
npm install @webxr-jp/avatar-optimizer
```

### Peer Dependencies

```bash
npm install @gltf-transform/core @gltf-transform/extensions @pixiv/three-vrm @pixiv/three-vrm-materials-mtoon three
```

## Usage

### Basic Optimization

```typescript
import { loadVRM, optimizeModel, exportVRM } from '@webxr-jp/avatar-optimizer'

// Load VRM file
const vrmResult = await loadVRM(file)
if (vrmResult.isErr()) {
  console.error(vrmResult.error)
  return
}
const vrm = vrmResult.value

// Optimize model
const optimizedResult = await optimizeModel(vrm, {
  atlas: {
    resolution: { base: 2048, blend: 1024 },
  },
})
if (optimizedResult.isErr()) {
  console.error(optimizedResult.error)
  return
}
const optimizedVrm = optimizedResult.value

// Export VRM
const exportResult = await exportVRM(optimizedVrm)
if (exportResult.isErr()) {
  console.error(exportResult.error)
  return
}
const blob = new Blob([exportResult.value], { type: 'model/gltf-binary' })
```

### With Texture Compression

```typescript
import {
  optimizeModel,
  exportVRM,
  UastcQuality,
} from '@webxr-jp/avatar-optimizer'

const optimizeResult = await optimizeModel(vrm, {
  textureCompression: {
    quality: UastcQuality.Default,
    supercompression: true,
  },
})

// Exports with the cached KTX2 textures without re-encoding
const exportResult = await exportVRM(vrm)
```

`optimizeModel` transcodes the KTX2 textures with `KTX2Loader` (Web Worker) and swaps them into the materials, so the optimized VRM renders with GPU-compressed textures right away. Pass `ktx2Transcode: false` to only encode them (no `KTX2Loader` needed; the in-memory textures stay uncompressed, while `exportVRM` still writes KTX2). This is the way to use KTX2 compression on Node.

### Mesh Simplification

```typescript
import { simplifyMeshes } from '@webxr-jp/avatar-optimizer'

const result = await simplifyMeshes(vrm, {
  targetRatio: 0.5,
  targetError: 0.01,
})
```

## API

### Main Functions

| Function                       | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `loadVRM(source, options?)`    | Load VRM from File, URL, or ArrayBuffer                                  |
| `optimizeModel(vrm, options?)` | Apply optimization pipeline (including KTX2 compression)                 |
| `exportVRM(vrm, options?)`     | Export VRM to GLB binary (`options.textureCompression` is `@deprecated`) |
| `simplifyMeshes(vrm, options)` | Reduce polygon count                                                     |

### WebGPURenderer で読み込む

`loadVRM` に TSL 版のマテリアルを渡すと、WebGPURenderer で描画できる VRM として読み込みます。
`mtoonMaterialType` は通常の MToon、`mtoonAtlasMaterialType` は最適化済み VRM（`XRIFT_mtoon_atlas`）に使われます。

```typescript
import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'

const result = await loadVRM(file, {
  mtoonMaterialType: MToonNodeMaterial,
  mtoonAtlasMaterialType: MToonAtlasNodeMaterial,
})
```

KTX2 テクスチャを含む場合は、圧縮形式の判定を描画に使う WebGPURenderer で行わせてください（`await renderer.init()` の後に `setKtx2Renderer(renderer)`、または `loadVRM` の `ktx2Renderer` オプション）。省略すると一時的な WebGLRenderer で判定するため、WebGPU で扱えない形式が選ばれることがあります。

`MToonNodeMaterial` で読み込んだ VRM を最適化するときは、`atlasMaterialType` に `MToonAtlasNodeMaterial` を渡します。
省略すると、WebGPURenderer で描画できない `MToonAtlasMaterial` を作らないよう `INVALID_PARAMETER` を返します（モデルは変更されません）。

```typescript
const result = await optimizeModel(vrm, {
  atlasMaterialType: MToonAtlasNodeMaterial,
})
```

### Node で実行する

アトラス合成は既定でオフスクリーンの WebGLRenderer を使うため、WebGL の無い Node では
`atlas.renderer` に WebGPURenderer を渡します。`@webxr-jp/avatar-optimizer/node` に、
Node に足りないブラウザ API のポリフィルと、[`webgpu`](https://www.npmjs.com/package/webgpu)（Dawn）で
アトラス合成用の WebGPURenderer を作る関数があります。

```bash
npm install webgpu
```

```typescript
import fs from 'node:fs'
import { create, globals } from 'webgpu'
import { exportVRM, loadVRM, optimizeModel } from '@webxr-jp/avatar-optimizer'
import {
  createNodeAtlasRenderer,
  installNodePolyfills,
} from '@webxr-jp/avatar-optimizer/node'

Object.assign(globalThis, globals) // GPUBufferUsage などの定数
installNodePolyfills() // createImageBitmap / OffscreenCanvas（2D）/ FileReader など

const renderer = (
  await createNodeAtlasRenderer({ gpu: create([]) })
)._unsafeUnwrap()

const bytes = fs.readFileSync('input.vrm')
const vrm = (
  await loadVRM(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  )
)._unsafeUnwrap()
await optimizeModel(vrm, { atlas: { renderer } })
const output = (await exportVRM(vrm))._unsafeUnwrap()
fs.writeFileSync('output.vrm', Buffer.from(output))

renderer.dispose()
```

`tools/optimize-node.mjs` が同じ処理をする CLI です（`node tools/optimize-node.mjs input.vrm output.vrm`）。

- GPU アダプタが必要です（Vulkan / Metal / D3D12）。GPU の無い Linux でも、Mesa の lavapipe（ソフトウェア Vulkan）があれば動きます
- `installNodePolyfills()` の画像デコード / エンコードは PNG と JPEG のみ対応です（純 JS の pngjs / jpeg-js）
- KTX2 圧縮は `optimizeModel(vrm, { textureCompression, ktx2Transcode: false })` で行います。GPU 向けへのトランスコード（KTX2Loader が Web Worker を使う）を省き、エンコード結果を記録するだけにするので、続く `exportVRM(vrm)` の出力が KTX2 になります。`ktx2Transcode` を省略すると KTX2Loader を初期化できずにエラーを返します
- ブラウザは画像をデコードするときにアルファを premultiply するため、アルファの低い画素の RGB はブラウザ版よりも Node 版の方が元画像に忠実になります（アルファ 128 以上の画素は ±2 以内で一致します）

ブラウザでも、描画に使っている WebGPURenderer を `atlas.renderer` に渡せばアトラス合成をそのレンダラーで行えます（レンダーターゲットとクリア色は合成後に元へ戻します）。

### Types

- `OptimizeModelOptions` - Configuration for `optimizeModel` pipeline (including `textureCompression`, `ktx2Transcode`, `ktx2Loader`, `ktx2TranscoderPath`, `ktx2Renderer`)
- `AtlasGenerationOptions` - Atlas resolution and `renderer` (WebGLRenderer / WebGPURenderer) used for atlas composition
- `NodeAtlasRendererOptions` - Options for `createNodeAtlasRenderer` (`@webxr-jp/avatar-optimizer/node`)
- `OptimizationOptions` - Legacy optimization options type
- `ExportVRMOptions` - Export settings (`textureCompression` is `@deprecated`)
- `SimplifyOptions` - Mesh simplification parameters
- `TextureCompressionOptions` - KTX2 compression settings

## License

MIT

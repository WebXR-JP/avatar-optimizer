# @webxr-jp/avatar-optimizer

3D model optimization library for WebXR applications.

## Features

- VRM model loading and export
- Texture atlas generation for material consolidation
- Mesh simplification using meshoptimizer
- KTX2 texture compression support
- VRM0 to VRM1 skeleton migration utilities

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

### Types

- `OptimizeModelOptions` - Configuration for `optimizeModel` pipeline (including `textureCompression`, `ktx2Loader`, `ktx2TranscoderPath`, `ktx2Renderer`)
- `OptimizationOptions` - Legacy optimization options type
- `ExportVRMOptions` - Export settings (`textureCompression` is `@deprecated`)
- `SimplifyOptions` - Mesh simplification parameters
- `TextureCompressionOptions` - KTX2 compression settings

## License

MIT

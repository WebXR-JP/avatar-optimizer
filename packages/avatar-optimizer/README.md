# @xrift/avatar-optimizer

3D model optimization library for WebXR applications.

## Features

- VRM model loading and export
- Texture atlas generation for material consolidation
- Mesh simplification using meshoptimizer
- KTX2 texture compression support
- VRM0 to VRM1 skeleton migration utilities

## Installation

```bash
npm install @xrift/avatar-optimizer
```

### Peer Dependencies

```bash
npm install @gltf-transform/core @gltf-transform/extensions @pixiv/three-vrm @pixiv/three-vrm-materials-mtoon three
```

## Usage

### Basic Optimization

```typescript
import { loadVRM, optimizeModel, exportVRM } from '@xrift/avatar-optimizer'

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
import { exportVRM, UastcQuality } from '@xrift/avatar-optimizer'

const exportResult = await exportVRM(vrm, {
  textureCompression: {
    quality: UastcQuality.Default,
    supercompression: true,
  },
})
```

### Mesh Simplification

```typescript
import { simplifyMeshes } from '@xrift/avatar-optimizer'

const result = await simplifyMeshes(vrm, {
  targetRatio: 0.5,
  targetError: 0.01,
})
```

## API

### Main Functions

| Function                       | Description                             |
| ------------------------------ | --------------------------------------- |
| `loadVRM(source)`              | Load VRM from File, URL, or ArrayBuffer |
| `optimizeModel(vrm, options)`  | Apply optimization pipeline             |
| `exportVRM(vrm, options?)`     | Export VRM to GLB binary                |
| `simplifyMeshes(vrm, options)` | Reduce polygon count                    |

### Types

- `OptimizationOptions` - Configuration for optimization pipeline
- `ExportVRMOptions` - Export settings including texture compression
- `SimplifyOptions` - Mesh simplification parameters
- `TextureCompressionOptions` - KTX2 compression settings

## License

MIT

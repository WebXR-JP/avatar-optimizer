# @xrift/mtoon-instancing

MToon shader instancing optimization utilities for three-vrm WebGL applications.

## Overview

`@xrift/mtoon-instancing` provides optimizations for rendering multiple MToon-shaded objects efficiently using WebGL instancing and other performance techniques.

## Features

- MToon shader instancing support
- Batch rendering optimization
- Shader compilation caching

## Installation

```bash
pnpm add @xrift/mtoon-instancing
```

## Requirements

- Three.js r167+
- @pixiv/three-vrm 2.0.0+
- @pixiv/three-vrm-materials-mtoon 2.0.0+

## Usage

```typescript
import { type MToonInstancingOptions } from '@xrift/mtoon-instancing'

const options: MToonInstancingOptions = {
  enabled: true,
  maxInstancesPerBatch: 128,
  optimizeShaders: true,
}
```

## Development

### Build

```bash
pnpm -F mtoon-instancing run build
```

### Test

```bash
pnpm -F mtoon-instancing run test
```

### Watch Mode

```bash
pnpm -F mtoon-instancing run dev
```

## License

MIT

import { ResultAsync } from 'neverthrow'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'

import type { OptimizationError } from '../types'

export interface ThreeVRMLoadResult {
  gltf: GLTF
  vrm: VRM | null
}

let polyfillsInstalled = false

export function loadVRMWithThree(
  file: File,
): ResultAsync<ThreeVRMLoadResult, OptimizationError> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file')),
      () => ({
        type: 'INVALID_FILE_TYPE' as const,
        message: 'Invalid file: expected a File object',
      }),
    )
  }

  return ResultAsync.fromPromise(
    (async () => {
      installNodePolyfills()
      const arrayBuffer = await file.arrayBuffer()
      return loadVRMFromArrayBuffer(arrayBuffer, file.name)
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to load VRM via three-vrm: ${String(error)}`,
    }),
  )
}

async function loadVRMFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  resourceName: string,
): Promise<ThreeVRMLoadResult> {
  const loader = createThreeVRMLoader()
  const gltf = await (typeof loader.parseAsync === 'function'
    ? loader.parseAsync(arrayBuffer, resourceName)
    : parseAsyncFallback(loader, arrayBuffer, resourceName))
  const vrm = (gltf.userData?.vrm as VRM | undefined) ?? null
  return { gltf, vrm }
}

function createThreeVRMLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  return loader
}

function parseAsyncFallback(
  loader: GLTFLoader,
  data: Parameters<GLTFLoader['parse']>[0],
  path: Parameters<GLTFLoader['parse']>[1],
): Promise<GLTF> {
  return new Promise<GLTF>((resolve, reject) => {
    loader.parse(data, path, resolve, reject)
  })
}

function installNodePolyfills() {
  if (polyfillsInstalled) {
    return
  }

  const globalAny = globalThis as typeof globalThis & {
    self?: typeof globalThis
    createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>
  }

  if (typeof globalAny.self === 'undefined') {
    globalAny.self = globalThis
  }

  if (typeof globalAny.createImageBitmap === 'undefined') {
    globalAny.createImageBitmap = async (blob: Blob) => {
      const buffer = await blob.arrayBuffer()
      const { width, height } = readImageDimensions(buffer)
      return new NodeImageBitmap(width, height, buffer)
    }
  }

  polyfillsInstalled = true
}

class NodeImageBitmap implements ImageBitmap {
  readonly width: number
  readonly height: number
  constructor(width: number, height: number, readonly buffer: ArrayBuffer) {
    this.width = width
    this.height = height
  }

  close(): void {
    // noop for Node environments
  }
}

function readImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const view = new DataView(buffer)

  const pngSignature = 0x89504e47
  const pngMagic = view.byteLength >= 24 ? view.getUint32(0, false) : 0
  if (pngMagic === pngSignature && view.getUint32(4, false) === 0x0d0a1a0a) {
    return {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    }
  }

  if (view.byteLength > 2 && view.getUint16(0, false) === 0xffd8) {
    const jpegSize = readJpegDimensions(view)
    if (jpegSize) {
      return jpegSize
    }
  }

  return { width: 1, height: 1 }
}

function readJpegDimensions(view: DataView): { width: number; height: number } | null {
  let offset = 2
  while (offset + 1 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      return null
    }

    const marker = view.getUint8(offset + 1)
    offset += 2

    if (marker === 0xd8 || marker === 0xd9) {
      continue
    }

    const length = view.getUint16(offset, false)
    if (length < 2 || offset + length > view.byteLength) {
      return null
    }

    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = view.getUint16(offset + 3, false)
      const width = view.getUint16(offset + 5, false)
      return { width, height }
    }

    offset += length
  }

  return null
}

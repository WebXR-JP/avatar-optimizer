import { encode, load } from '@loaders.gl/core'
import { GLTFLoader, GLTFWriter, type GLTFWithBuffers } from '@loaders.gl/gltf'
import { ResultAsync } from 'neverthrow'

import type { OptimizationError } from '../types'

type BinaryLike = ArrayBuffer | ArrayBufferView | SharedArrayBuffer

const GLB_ALIGNMENT = 4

export interface LoadersGLVRMDocument {
  gltf: GLTFWithBuffers
}

function toArrayBuffer(binary: BinaryLike): ArrayBuffer {
  if (binary instanceof ArrayBuffer) {
    return binary
  }

  if (typeof SharedArrayBuffer !== 'undefined' && binary instanceof SharedArrayBuffer) {
    const copy = new ArrayBuffer(binary.byteLength)
    new Uint8Array(copy).set(new Uint8Array(binary))
    return copy
  }

  if (ArrayBuffer.isView(binary)) {
    const copy = new ArrayBuffer(binary.byteLength)
    const tempView = new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)
    new Uint8Array(copy).set(tempView)
    return copy
  }

  throw new TypeError('Unsupported binary data type')
}

function normalizeBuffers(gltf: GLTFWithBuffers): GLTFWithBuffers {
  if (gltf.buffers && gltf.buffers.length > 0) {
    return gltf
  }

  if (gltf.binary) {
    return {
      ...gltf,
      buffers: [
        {
          arrayBuffer: gltf.binary,
          byteOffset: 0,
          byteLength: gltf.binary.byteLength,
        },
      ],
    }
  }

  return { ...gltf, buffers: [] }
}

function alignTo(value: number, alignment: number): number {
  if (alignment <= 0) {
    return value
  }
  return (value + (alignment - 1)) & ~(alignment - 1)
}

function collapseBuffersToSingleBuffer(gltf: GLTFWithBuffers): GLTFWithBuffers {
  const bufferViews = gltf.json.bufferViews ?? []
  if (bufferViews.length === 0) {
    if (!gltf.json.buffers || gltf.json.buffers.length === 0) {
      gltf.json.buffers = [{ byteLength: 0 }]
    } else if (gltf.json.buffers.length > 1) {
      gltf.json.buffers = [gltf.json.buffers[0]]
    }
    return {
      ...gltf,
      buffers: gltf.buffers && gltf.buffers.length > 0 ? [gltf.buffers[0]] : gltf.buffers,
    }
  }

  const originalBufferCount = gltf.json.buffers?.length ?? 0
  if (originalBufferCount > 1) {
    return gltf
  }

  const runtimeBuffers = gltf.buffers ?? []
  if (runtimeBuffers.length === 0) {
    return gltf
  }

  const requiresCollapse =
    runtimeBuffers.length > 1 || bufferViews.some((view) => (view.buffer ?? 0) !== 0)
  if (!requiresCollapse) {
    const primaryBuffer = runtimeBuffers[0]
    const mergedJsonBuffer = {
      ...(gltf.json.buffers?.[0] ?? {}),
      uri: undefined,
      byteLength: primaryBuffer?.byteLength ?? gltf.json.buffers?.[0]?.byteLength ?? 0,
    }

    return {
      ...gltf,
      buffers: primaryBuffer ? [primaryBuffer] : [],
      json: {
        ...gltf.json,
        buffers: [mergedJsonBuffer],
      },
    }
  }

  const layout = bufferViews.map((view) => ({
    view,
    sourceBufferIndex: view.buffer ?? 0,
    sourceByteOffset: view.byteOffset ?? 0,
    byteLength: view.byteLength ?? 0,
  }))

  let cursor = 0
  for (const entry of layout) {
    cursor = alignTo(cursor, GLB_ALIGNMENT)
    entry.view.buffer = 0
    entry.view.byteOffset = cursor
    cursor += entry.byteLength
  }

  const totalByteLength = alignTo(cursor, GLB_ALIGNMENT)
  const mergedBuffer = new ArrayBuffer(totalByteLength)
  const mergedView = new Uint8Array(mergedBuffer)

  for (const entry of layout) {
    if (entry.byteLength === 0) {
      continue
    }

    const sourceBuffer = runtimeBuffers[entry.sourceBufferIndex]
    if (!sourceBuffer) {
      throw new Error(`Missing GLB buffer at index ${entry.sourceBufferIndex}`)
    }

    const sourceStart = (sourceBuffer.byteOffset ?? 0) + entry.sourceByteOffset
    const sourceArray = new Uint8Array(sourceBuffer.arrayBuffer, sourceStart, entry.byteLength)
    mergedView.set(sourceArray, entry.view.byteOffset ?? 0)
  }

  const mergedRuntimeBuffer = {
    arrayBuffer: mergedBuffer,
    byteOffset: 0,
    byteLength: totalByteLength,
  }

  const mergedJsonBuffer = {
    ...(gltf.json.buffers?.[0] ?? {}),
    uri: undefined,
    byteLength: totalByteLength,
  }

  return {
    ...gltf,
    binary: mergedBuffer,
    buffers: [mergedRuntimeBuffer],
    json: {
      ...gltf.json,
      buffers: [mergedJsonBuffer],
    },
  }
}

export function readVRMDocumentWithLoadersGL(
  binary: BinaryLike,
): ResultAsync<LoadersGLVRMDocument, OptimizationError> {
  const arrayBuffer = toArrayBuffer(binary)

  return ResultAsync.fromPromise(
    load(arrayBuffer, GLTFLoader, {
      gltf: {
        loadImages: false,
        decompressMeshes: false,
      },
    }) as Promise<GLTFWithBuffers>,
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to read VRM with loaders.gl: ${String(error)}`,
    })
  ).map((gltf) => {
    const normalized = normalizeBuffers(gltf)
    const collapsed = collapseBuffersToSingleBuffer(normalized)
    return {
      gltf: collapsed,
    }
  })
}

export function writeVRMDocumentWithLoadersGL(
  document: LoadersGLVRMDocument,
): ResultAsync<ArrayBuffer, OptimizationError> {
  return ResultAsync.fromPromise(
    encode(document.gltf, GLTFWriter, {
      gltf: {
        postProcess: false,
      },
    }) as Promise<ArrayBuffer>,
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to write VRM with loaders.gl: ${String(error)}`,
    })
  )
}

export const __testing__ = {
  collapseBuffersToSingleBuffer,
}

import { load } from '@loaders.gl/core'
import { GLBLoader, type GLB } from '@loaders.gl/gltf'
import { ResultAsync } from 'neverthrow'

import type { OptimizationError } from '../types'

type BinaryLike = ArrayBuffer | ArrayBufferView | SharedArrayBuffer

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

function readJsonWithLoadersGL(binary: BinaryLike): ResultAsync<GLB, OptimizationError> {
  const arrayBuffer = toArrayBuffer(binary)
  return ResultAsync.fromPromise(
    load(arrayBuffer, GLBLoader) as Promise<GLB>,
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to parse glTF JSON with loaders.gl: ${String(error)}`,
    }),
  )
}

export function extractJsonFromGLB(
  binaryData: BinaryLike,
): ResultAsync<Record<string, any>, OptimizationError> {
  return readJsonWithLoadersGL(binaryData).map((glb) => glb.json)
}

export async function parseGLBJson(binaryData: BinaryLike): Promise<Record<string, any>> {
  const result = await extractJsonFromGLB(binaryData)
  if (result.isErr()) {
    throw new Error(result.error.message)
  }
  return result.value
}

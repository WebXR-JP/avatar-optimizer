import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  readVRMDocumentWithLoadersGL,
  writeVRMDocumentWithLoadersGL,
  __testing__,
} from '../src/vrm/loaders-gl'
import { parseGLBJson } from '../src/vrm/document'
import type { GLTFWithBuffers } from '@loaders.gl/gltf'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function loadFixtureBuffer(): Promise<Buffer> {
  const fixturePath = path.join(__dirname, 'fixtures', 'Seed-san.vrm')
  return readFile(fixturePath)
}

function createRuntimeBuffer(bytes: number[]): {
  arrayBuffer: ArrayBuffer
  byteOffset: number
  byteLength: number
} {
  const view = Uint8Array.from(bytes)
  return {
    arrayBuffer: view.buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
  }
}

describe('loaders.gl VRM I/O', () => {
  it('loaders.gl で VRM(GLB) を読み取れること', async () => {
    const fileBuffer = await loadFixtureBuffer()
    const result = await readVRMDocumentWithLoadersGL(fileBuffer)
    if (result.isErr()) {
      throw new Error(result.error.message)
    }

    const { json } = result.value.gltf
    expect(json.meshes?.length ?? 0).toBeGreaterThan(0)
    expect(json.nodes?.length ?? 0).toBeGreaterThan(0)
    expect(json.asset).toBeDefined()
  })

  it('読み取った VRM をそのまま書き戻せること', async () => {
    const fileBuffer = await loadFixtureBuffer()
    const readResult = await readVRMDocumentWithLoadersGL(fileBuffer)
    if (readResult.isErr()) {
      throw new Error(readResult.error.message)
    }

    const writeResult = await writeVRMDocumentWithLoadersGL(readResult.value)
    if (writeResult.isErr()) {
      throw new Error(writeResult.error.message)
    }

    const gltfJson = parseGLBJson(writeResult.value)
    expect(gltfJson).toEqual(readResult.value.gltf.json)

    const writeSize = writeResult.value.byteLength
    const originalSize = fileBuffer.byteLength
    const sizeDelta = Math.abs(writeSize - originalSize)
    expect(sizeDelta).toBeLessThanOrEqual(Math.max(1024, originalSize * 0.01))
  })

  it('書き出し前に JSON を編集できること', async () => {
    const fileBuffer = await loadFixtureBuffer()
    const readResult = await readVRMDocumentWithLoadersGL(fileBuffer)
    if (readResult.isErr()) {
      throw new Error(readResult.error.message)
    }

    readResult.value.gltf.json.asset = {
      ...(readResult.value.gltf.json.asset ?? {}),
      generator: 'loaders-gl-test',
    }

    const writeResult = await writeVRMDocumentWithLoadersGL(readResult.value)
    if (writeResult.isErr()) {
      throw new Error(writeResult.error.message)
    }

    const gltfJson = parseGLBJson(writeResult.value)
    expect(gltfJson.asset?.generator).toBe('loaders-gl-test')
  })
})

describe('collapseBuffersToSingleBuffer', () => {
  it('merges multiple runtime buffers back into a single buffer view layout', () => {
    const bufferA = createRuntimeBuffer([1, 2, 3, 4])
    const bufferB = createRuntimeBuffer([9, 10, 11, 12])

    const gltf: GLTFWithBuffers = {
      json: {
        buffers: [{ byteLength: 0 }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 4 },
          { buffer: 1, byteOffset: 0, byteLength: 2 },
          { buffer: 1, byteOffset: 2, byteLength: 2 },
        ],
      },
      buffers: [bufferA, bufferB],
    } as GLTFWithBuffers

    const collapsed = __testing__.collapseBuffersToSingleBuffer(gltf)
    const mergedBuffer = collapsed.buffers?.[0]
    expect(mergedBuffer?.byteLength).toBe(12)
    expect(collapsed.json.buffers).toHaveLength(1)
    expect(collapsed.json.bufferViews?.every((view) => view.buffer === 0)).toBe(true)
    expect(collapsed.json.bufferViews?.[0]?.byteOffset).toBe(0)
    expect(collapsed.json.bufferViews?.[1]?.byteOffset).toBe(4)
    expect(collapsed.json.bufferViews?.[2]?.byteOffset).toBe(8)

    const mergedBytes = new Uint8Array(
      mergedBuffer!.arrayBuffer,
      mergedBuffer!.byteOffset ?? 0,
      mergedBuffer!.byteLength,
    )
    expect(Array.from(mergedBytes.slice(0, 4))).toEqual([1, 2, 3, 4])
    expect(Array.from(mergedBytes.slice(4, 6))).toEqual([9, 10])
    expect(Array.from(mergedBytes.slice(8, 10))).toEqual([11, 12])
  })

  it('ensures real VRM files expose a single buffer after reading', async () => {
    const fileBuffer = await loadFixtureBuffer()
    const readResult = await readVRMDocumentWithLoadersGL(fileBuffer)
    if (readResult.isErr()) {
      throw new Error(readResult.error.message)
    }

    const jsonBuffers = readResult.value.gltf.json.buffers ?? []
    expect(jsonBuffers).toHaveLength(1)
    const bufferRefs = new Set(
      (readResult.value.gltf.json.bufferViews ?? []).map((view: any) => view.buffer ?? 0),
    )
    expect(bufferRefs.size).toBeLessThanOrEqual(1)
    expect([...bufferRefs][0]).toBe(0)

    const writeResult = await writeVRMDocumentWithLoadersGL(readResult.value)
    if (writeResult.isErr()) {
      throw new Error(writeResult.error.message)
    }

    const gltfJson = parseGLBJson(writeResult.value)
    expect(gltfJson.buffers).toHaveLength(1)
    const maxBufferIndex =
      Math.max(
        ...(gltfJson.bufferViews ?? []).map((view: { buffer?: number }) => view.buffer ?? 0),
      ) ?? 0
    expect(maxBufferIndex).toBe(0)
  })
})

import type { Document, JSONDocument } from '@gltf-transform/core'
import { ResultAsync } from 'neverthrow'

import type { OptimizationError } from '../types'

export function loadDocument(
  arrayBuffer: ArrayBuffer,
): ResultAsync<Document, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const { WebIO } = await import('@gltf-transform/core')
      const io = new WebIO()
      const document = await io.readBinary(new Uint8Array(arrayBuffer))
      if (!document) {
        throw new Error('Document is null')
      }
      return document
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to parse VRM document: ${String(error)}`,
    })
  )
}

export function extractVRMExtensionFromBinary(
  arrayBuffer: ArrayBuffer,
): ResultAsync<Record<string, any> | null, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const gltfJson = parseGLBJson(arrayBuffer)
      return gltfJson.extensions?.VRM ?? null
    })(),
    (error) => ({
      type: 'DOCUMENT_PARSE_FAILED' as const,
      message: `Failed to extract VRM extension from binary: ${String(error)}`,
    })
  )
}

export function mergeVRMIntoJSON(
  jsonDoc: JSONDocument,
  vrmExtension: Record<string, any> | null,
): JSONDocument {
  if (!vrmExtension) {
    return jsonDoc
  }

  const mergedJson = {
    ...jsonDoc.json,
    extensions: {
      ...(jsonDoc.json.extensions || {}),
      VRM: vrmExtension,
    },
  }

  if (!mergedJson.extensionsUsed) {
    mergedJson.extensionsUsed = []
  }

  if (!mergedJson.extensionsUsed.includes('VRM')) {
    mergedJson.extensionsUsed.push('VRM')
  }

  return {
    json: mergedJson,
    resources: jsonDoc.resources,
  }
}

export async function documentToJSON(document: Document): Promise<JSONDocument> {
  const { WebIO } = await import('@gltf-transform/core')
  const io = new WebIO()
  return io.writeJSON(document)
}

export async function jsonDocumentToGLB(jsonDoc: JSONDocument): Promise<ArrayBuffer> {
  const { WebIO } = await import('@gltf-transform/core')
  const io = new WebIO()
  const document = await io.readJSON(jsonDoc)
  const glbData = await io.writeBinary(document)

  const glbArrayBuffer = (() => {
    if (glbData instanceof ArrayBuffer) {
      return glbData
    }
    if (glbData instanceof Uint8Array) {
      return glbData.buffer.slice(glbData.byteOffset, glbData.byteOffset + glbData.byteLength)
    }
    return (glbData as any).buffer
  })()

  return injectVRMIntoGLB(glbArrayBuffer as ArrayBuffer, jsonDoc.json.extensions?.VRM ?? null)
}

export function getMaxTextureSize(
  document: Document,
): { width: number; height: number } | undefined {
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    return undefined
  }

  let maxWidth = 0
  let maxHeight = 0

  for (const texture of textures) {
    const size = texture.getSize()
    if (size) {
      const [width, height] = size
      if (width) maxWidth = Math.max(maxWidth, width)
      if (height) maxHeight = Math.max(maxHeight, height)
    }
  }

  return maxWidth > 0 && maxHeight > 0 ? { width: maxWidth, height: maxHeight } : undefined
}

export function calculateTextureScale(
  currentSize: { width: number; height: number },
  targetMaxSize: number,
): number {
  const currentMax = Math.max(currentSize.width, currentSize.height)
  if (currentMax <= targetMaxSize) {
    return 1.0
  }

  const scale = targetMaxSize / currentMax
  return Math.max(0.1, Math.min(1.0, scale))
}

function parseGLBJson(arrayBuffer: ArrayBuffer): Record<string, any> {
  const view = new DataView(arrayBuffer)
  const magic = view.getUint32(0, true)

  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file format')
  }

  let offset = 12
  const chunks: Map<number, Uint8Array> = new Map()

  while (offset < arrayBuffer.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)

    offset += 8

    const chunkData = new Uint8Array(arrayBuffer, offset, chunkLength)
    chunks.set(chunkType, chunkData)

    offset += chunkLength
  }

  const jsonChunk = chunks.get(0x4e4f534a)
  if (!jsonChunk) {
    throw new Error('No JSON chunk found in GLB')
  }

  const jsonText = new TextDecoder().decode(jsonChunk)
  return JSON.parse(jsonText)
}

function injectVRMIntoGLB(
  glbData: ArrayBuffer,
  vrmExtension: Record<string, any> | null,
): ArrayBuffer {
  if (!vrmExtension) {
    return glbData
  }

  const view = new DataView(glbData)
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file format')
  }

  const version = view.getUint32(4, true)

  let offset = 12
  const chunks: Array<{ type: number; data: Uint8Array }> = []

  while (offset < glbData.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)

    offset += 8

    const chunkData = new Uint8Array(glbData, offset, chunkLength)
    chunks.push({ type: chunkType, data: new Uint8Array(chunkData) })

    offset += chunkLength
  }

  const jsonChunkIndex = chunks.findIndex((c) => c.type === 0x4e4f534a)
  if (jsonChunkIndex >= 0) {
    const jsonText = new TextDecoder().decode(chunks[jsonChunkIndex].data)
    const json = JSON.parse(jsonText)

    if (!json.extensions) {
      json.extensions = {}
    }
    json.extensions.VRM = vrmExtension

    if (!json.extensionsUsed) {
      json.extensionsUsed = []
    }
    if (!json.extensionsUsed.includes('VRM')) {
      json.extensionsUsed.push('VRM')
    }

    const newJsonText = JSON.stringify(json)
    const newJsonData = new TextEncoder().encode(newJsonText)

    const paddingSize = (4 - (newJsonData.byteLength % 4)) % 4
    const paddedJsonData = new Uint8Array(newJsonData.byteLength + paddingSize)
    paddedJsonData.set(newJsonData)
    for (let i = newJsonData.byteLength; i < paddedJsonData.byteLength; i++) {
      paddedJsonData[i] = 0x20
    }

    chunks[jsonChunkIndex].data = paddedJsonData
  }

  let totalSize = 12

  for (const chunk of chunks) {
    totalSize += 8 + chunk.data.byteLength
  }

  const buffer = new ArrayBuffer(totalSize)
  const newView = new DataView(buffer)
  const newData = new Uint8Array(buffer)

  newView.setUint32(0, magic, true)
  newView.setUint32(4, version, true)
  newView.setUint32(8, totalSize, true)

  let writeOffset = 12
  for (const chunk of chunks) {
    newView.setUint32(writeOffset, chunk.data.byteLength, true)
    newView.setUint32(writeOffset + 4, chunk.type, true)
    writeOffset += 8

    newData.set(chunk.data, writeOffset)
    writeOffset += chunk.data.byteLength
  }

  return buffer
}

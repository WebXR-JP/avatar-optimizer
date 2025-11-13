import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  readVRMDocumentWithLoadersGL,
  writeVRMDocumentWithLoadersGL,
} from '../../src/vrm/loaders-gl'

/**
 * loaders.gl ベースで VRM(GLB) を読み込み → そのまま書き出すだけの簡易手動テスト。
 * 入力:
 *   - __tests__/input/loaders-gl-input.vrm (存在すれば優先)
 *   - なければ fixtures/Seed-san.vrm
 * 出力:
 *   - __tests__/output/loaders-gl-roundtrip.glb
 *
 * 実行例:
 *   NODE_OPTIONS=--experimental-specifier-resolution=node pnpm -F avatar-optimizer exec node --loader ts-node/esm __tests__/manual/loaders-gl.manual.ts
 */
async function runManualLoadersGlRoundtrip(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const manualDir = path.resolve(__dirname, '..')
  const inputDir = path.join(manualDir, 'input')
  const fixturesDir = path.join(manualDir, 'fixtures')
  const outputDir = path.join(manualDir, 'output')

  const preferredInput = path.join(inputDir, 'loaders-gl-input.vrm')
  const fallbackInput = path.join(fixturesDir, 'Seed-san.vrm')

  const inputPath = (await exists(preferredInput)) ? preferredInput : fallbackInput
  const outputPath = path.join(outputDir, 'loaders-gl-roundtrip.glb')

  console.log(`📖 Input: ${inputPath}`)
  const fileBuffer = await readFile(inputPath)

  const readResult = await readVRMDocumentWithLoadersGL(fileBuffer)
  if (readResult.isErr()) {
    throw new Error(readResult.error.message)
  }

  const nodeCount = readResult.value.gltf.json.nodes?.length ?? 0
  const meshCount = readResult.value.gltf.json.meshes?.length ?? 0
  console.log(`⚙️  Loaded glTF: nodes=${nodeCount}, meshes=${meshCount}`)

  const writeResult = await writeVRMDocumentWithLoadersGL(readResult.value)
  if (writeResult.isErr()) {
    throw new Error(writeResult.error.message)
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, bufferFromArrayBuffer(writeResult.value))
  console.log(`💾 Wrote: ${outputPath}`)

  const originalJson = parseGLBJson(fileBuffer)
  const roundtripJson = parseGLBJson(writeResult.value)
  reportJsonDiff(originalJson, roundtripJson)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function bufferFromArrayBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer))
}

function parseGLBJson(binaryData: ArrayBuffer | ArrayBufferView | ArrayBufferLike): Record<string, any> {
  const arrayBuffer = toArrayBuffer(binaryData)
  const view = new DataView(arrayBuffer)
  const magic = view.getUint32(0, true)
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file format')
  }

  let offset = 12
  const chunks = new Map<number, Uint8Array>()
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

function toArrayBuffer(binaryData: ArrayBuffer | ArrayBufferView | ArrayBufferLike): ArrayBuffer {
  if (binaryData instanceof ArrayBuffer) {
    return binaryData
  }
  if (ArrayBuffer.isView(binaryData)) {
    const { buffer, byteOffset, byteLength } = binaryData
    return buffer.slice(byteOffset, byteOffset + byteLength)
  }
  const buffer = new ArrayBuffer(binaryData.byteLength)
  new Uint8Array(buffer).set(new Uint8Array(binaryData as ArrayBufferLike))
  return buffer
}

function reportJsonDiff(original: Record<string, any>, roundtrip: Record<string, any>): void {
  const originalLines = stableJsonLines(original)
  const roundtripLines = stableJsonLines(roundtrip)
  const maxLines = Math.max(originalLines.length, roundtripLines.length)
  const diffs: string[] = []

  for (let i = 0; i < maxLines; i++) {
    const left = originalLines[i]
    const right = roundtripLines[i]
    if (left !== right) {
      diffs.push(`L${i + 1}:`)
      if (typeof left !== 'undefined') {
        diffs.push(`- ${left}`)
      }
      if (typeof right !== 'undefined') {
        diffs.push(`+ ${right}`)
      }
      if (diffs.length >= 60) {
        diffs.push('... (diff truncated)')
        break
      }
    }
  }

  if (diffs.length === 0) {
    console.log('✅ JSON chunks match (key-sorted comparison)')
  } else {
    console.log('⚠️ JSON diff detected between input/output (showing first differences):')
    for (const line of diffs) {
      console.log(`  ${line}`)
    }
  }
}

function stableJsonLines(value: unknown): string[] {
  return JSON.stringify(sortJsonKeys(value), null, 2).split('\n')
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys)
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    const sorted: Record<string, unknown> = {}
    for (const [key, val] of entries) {
      sorted[key] = sortJsonKeys(val)
    }
    return sorted
  }
  return value
}

runManualLoadersGlRoundtrip().catch((error) => {
  console.error(`❌ loaders.gl manual test failed: ${String(error)}`)
  process.exit(1)
})

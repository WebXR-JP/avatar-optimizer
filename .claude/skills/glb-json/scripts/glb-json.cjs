#!/usr/bin/env node
/**
 * GLB/VRM ファイルから JSON チャンクを抽出する
 *
 * Usage:
 *   node glb-json.js <file.glb|file.vrm> [jsonPath]
 *
 * Examples:
 *   node glb-json.js model.vrm                    # 全 JSON を出力
 *   node glb-json.js model.vrm extensions         # extensions のみ
 *   node glb-json.js model.vrm extensions.VRM     # VRM 拡張のみ
 *   node glb-json.js model.vrm materials[0]       # 最初のマテリアル
 */

const fs = require('fs')
const path = require('path')

const GLB_MAGIC = 0x46546c67 // 'glTF'
const JSON_CHUNK_TYPE = 0x4e4f534a // 'JSON'

function extractGlbJson(filePath) {
  const buf = fs.readFileSync(filePath)

  // GLB ヘッダー検証
  const magic = buf.readUInt32LE(0)
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB file: magic number mismatch`)
  }

  const version = buf.readUInt32LE(4)
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`)
  }

  // JSON チャンク読み取り (offset 12)
  const jsonChunkLength = buf.readUInt32LE(12)
  const jsonChunkType = buf.readUInt32LE(16)

  if (jsonChunkType !== JSON_CHUNK_TYPE) {
    throw new Error(`First chunk is not JSON chunk`)
  }

  const jsonString = buf.slice(20, 20 + jsonChunkLength).toString('utf8')
  return JSON.parse(jsonString)
}

function getNestedValue(obj, pathStr) {
  if (!pathStr) return obj

  // パスを解析: "extensions.VRM" や "materials[0].name" に対応
  const parts = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.')

  let current = obj
  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined
    }
    current = current[part]
  }
  return current
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: glb-json.js <file.glb|file.vrm> [jsonPath]')
    console.error('')
    console.error('Examples:')
    console.error('  glb-json.js model.vrm                    # Full JSON')
    console.error('  glb-json.js model.vrm extensions         # extensions only')
    console.error('  glb-json.js model.vrm extensions.VRM     # VRM extension')
    console.error('  glb-json.js model.vrm materials[0]       # First material')
    process.exit(1)
  }

  const filePath = args[0]
  const jsonPath = args[1] || null

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  try {
    const json = extractGlbJson(filePath)
    const result = getNestedValue(json, jsonPath)

    if (result === undefined) {
      console.error(`Path not found: ${jsonPath}`)
      process.exit(1)
    }

    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }
}

main()

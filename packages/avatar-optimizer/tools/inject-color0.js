/**
 * GLB(VRM) の全プリミティブに COLOR_0 (VEC4 / FLOAT / 全成分 1.0) を注入する
 *
 * 全成分 1.0 = 純白なので、頂点カラーが無視されても乗算されても見た目は変わらない。
 * つまり「COLOR_0 が存在すること」だけを再現する検証用データになる。
 *
 * 使い方: node inject-color0.js <input.vrm> <output.vrm>
 */
const fs = require('fs')

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('GLB ではありません')
  const chunks = []
  let off = 12
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) })
    off += 8 + len
  }
  const jsonChunk = chunks.find((c) => c.type === CHUNK_JSON)
  const binChunk = chunks.find((c) => c.type === CHUNK_BIN)
  return { json: JSON.parse(jsonChunk.data.toString('utf8')), bin: binChunk.data }
}

function pad4(n) {
  return (4 - (n % 4)) % 4
}

function buildGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length), 0x20) // スペース埋め
  const binPad = Buffer.alloc(pad4(bin.length), 0x00)
  const jsonLen = jsonBuf.length + jsonPad.length
  const binLen = bin.length + binPad.length
  const total = 12 + 8 + jsonLen + 8 + binLen

  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonLen, 0)
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4)

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binLen, 0)
  binHeader.writeUInt32LE(CHUNK_BIN, 4)

  return Buffer.concat([header, jsonHeader, jsonBuf, jsonPad, binHeader, bin, binPad])
}

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('使い方: node inject-color0.js <input.vrm> <output.vrm>')
  process.exit(1)
}

const { json, bin } = parseGlb(fs.readFileSync(input))

// 各プリミティブの頂点数を調べ、最大値ぶんの白カラーデータを1つだけ作る。
// accessor は count が違っても同じ bufferView を先頭から参照できるので、
// バッファは最大頂点数ぶんあれば全プリミティブで共有できる
let maxCount = 0
const targets = []
for (const mesh of json.meshes || []) {
  for (const prim of mesh.primitives || []) {
    const posIndex = prim.attributes?.POSITION
    if (posIndex === undefined) continue
    if (prim.attributes.COLOR_0 !== undefined) continue // 既にあるものは触らない
    const count = json.accessors[posIndex].count
    maxCount = Math.max(maxCount, count)
    targets.push({ prim, count })
  }
}

if (targets.length === 0) {
  console.error('注入対象のプリミティブがありません')
  process.exit(1)
}

// 全成分 1.0 の Float32 データ
const colorData = Buffer.alloc(maxCount * 4 * 4)
for (let i = 0; i < maxCount * 4; i++) colorData.writeFloatLE(1.0, i * 4)

// BIN チャンク末尾に追記（4バイト境界を維持）
const alignPad = Buffer.alloc(pad4(bin.length), 0)
const newBin = Buffer.concat([bin, alignPad, colorData])
const byteOffset = bin.length + alignPad.length

json.buffers[0].byteLength = newBin.length

const bufferViewIndex = json.bufferViews.length
json.bufferViews.push({
  buffer: 0,
  byteOffset,
  byteLength: colorData.length,
  target: 34962, // ARRAY_BUFFER
})

// count ごとに accessor を使い回す
const accessorByCount = new Map()
for (const { prim, count } of targets) {
  let accessorIndex = accessorByCount.get(count)
  if (accessorIndex === undefined) {
    accessorIndex = json.accessors.length
    json.accessors.push({
      bufferView: bufferViewIndex,
      componentType: 5126, // FLOAT
      count,
      type: 'VEC4',
    })
    accessorByCount.set(count, accessorIndex)
  }
  prim.attributes.COLOR_0 = accessorIndex
}

fs.writeFileSync(output, buildGlb(json, newBin))
console.log(
  `COLOR_0 を ${targets.length} プリミティブに注入 ` +
    `(accessor ${accessorByCount.size} 個 / 最大頂点数 ${maxCount})`,
)
console.log(`出力: ${output}`)

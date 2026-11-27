/**
 * Node で VRM を最適化する CLI（@webxr-jp/avatar-optimizer/node の利用例を兼ねる）
 *
 *   pnpm -F @webxr-jp/avatar-optimizer run build
 *   node tools/optimize-node.mjs input.vrm output.vrm [--resolution 2048] [--remove-unused-blend-shapes]
 *
 * アトラス合成は WebGPU（`webgpu` パッケージ = Dawn）で行う。
 * GPU の無い環境でも、Vulkan のソフトウェア実装（lavapipe など）があれば動く。
 */
import fs from 'node:fs'
import { create, globals } from 'webgpu'
import { exportVRM, loadVRM, optimizeModel } from '@webxr-jp/avatar-optimizer'
import {
  createNodeAtlasRenderer,
  installNodePolyfills,
} from '@webxr-jp/avatar-optimizer/node'

const args = process.argv.slice(2)
const [input, output] = args.filter((a) => !a.startsWith('--'))
const resolutionIndex = args.indexOf('--resolution')
const resolution =
  resolutionIndex >= 0 ? Number(args[resolutionIndex + 1]) : 2048
const removeUnusedBlendShapes = args.includes('--remove-unused-blend-shapes')

if (!input || !output) {
  console.error(
    'usage: node tools/optimize-node.mjs input.vrm output.vrm [--resolution 2048] [--remove-unused-blend-shapes]',
  )
  process.exit(2)
}

Object.assign(globalThis, globals)
installNodePolyfills()

const rendererResult = await createNodeAtlasRenderer({ gpu: create([]) })
if (rendererResult.isErr()) {
  console.error(rendererResult.error.message)
  process.exit(1)
}
const renderer = rendererResult.value

const fail = (stage, error) => {
  console.error(`${stage} に失敗しました (${error.type}): ${error.message}`)
  renderer.dispose()
  process.exit(1)
}

const bytes = fs.readFileSync(input)
const t0 = performance.now()
const loaded = await loadVRM(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
)
if (loaded.isErr()) fail('読み込み', loaded.error)
const vrm = loaded.value

const t1 = performance.now()
const optimized = await optimizeModel(vrm, {
  atlas: { defaultResolution: resolution, renderer },
  removeUnusedBlendShapes,
})
if (optimized.isErr()) fail('最適化', optimized.error)
if (optimized.value.atlasSkipped) {
  console.warn(
    `アトラス化をスキップしました: ${optimized.value.atlasSkipped.message}`,
  )
}

const t2 = performance.now()
const exported = await exportVRM(vrm)
if (exported.isErr()) fail('書き出し', exported.error)
fs.writeFileSync(output, Buffer.from(exported.value))
const t3 = performance.now()

renderer.dispose()

const mb = (n) => (n / 1048576).toFixed(2)
console.log(
  `${input} -> ${output}: ${mb(bytes.byteLength)}MB -> ${mb(exported.value.byteLength)}MB ` +
    `(load ${Math.round(t1 - t0)}ms / optimize ${Math.round(t2 - t1)}ms / export ${Math.round(t3 - t2)}ms)`,
)

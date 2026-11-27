/**
 * @webxr-jp/avatar-optimizer/node - Node で最適化を実行するための補助
 *
 * 使い方:
 *   import { create, globals } from 'webgpu'
 *   import { installNodePolyfills, createNodeAtlasRenderer } from '@webxr-jp/avatar-optimizer/node'
 *   import { loadVRM, optimizeModel, exportVRM } from '@webxr-jp/avatar-optimizer'
 *
 *   Object.assign(globalThis, globals)
 *   installNodePolyfills()
 *   const renderer = await createNodeAtlasRenderer({ gpu: create([]) })
 *   // loadVRM(arrayBuffer) → optimizeModel(vrm, { atlas: { renderer } }) → exportVRM(vrm)
 */
export type { NodeAtlasRendererOptions, NodeGPU, NodeGPUDevice } from '../types'
export { installNodePolyfills } from './polyfills'
export { createNodeAtlasRenderer } from './renderer'

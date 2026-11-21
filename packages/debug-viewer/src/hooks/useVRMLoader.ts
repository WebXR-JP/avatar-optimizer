/**
 * VRM ローダーのラッパー
 * @webxr-jp/avatar-optimizer の loadVRM に、選択中のレンダラーに合った
 * MToon マテリアルの種類を渡す。
 * WebGPU のときは TSL 版のマテリアル（three-vrm の MToonNodeMaterial と
 * mtoon-atlas の MToonAtlasNodeMaterial）で読み込む。
 */
import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes'
import { MToonAtlasNodeMaterial } from '@webxr-jp/mtoon-atlas/nodes'
import {
  loadVRM as loadVRMCore,
  type VRMLoaderError,
  type VRMSource,
} from '@webxr-jp/avatar-optimizer'
import { rendererMode } from '../renderer-mode'

export type { VRMLoaderError }

const loadOptions =
  rendererMode === 'webgpu'
    ? { mtoonMaterialType: MToonNodeMaterial, mtoonAtlasMaterialType: MToonAtlasNodeMaterial }
    : {}

/**
 * URL / File / Blob からVRMモデルを非同期で読み込みます。
 */
export const loadVRM = (source: VRMSource) => loadVRMCore(source, loadOptions)

/**
 * File オブジェクトからVRMモデルを読み込みます。
 */
export const loadVRMFromFile = loadVRM

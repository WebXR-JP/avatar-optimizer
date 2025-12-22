/**
 * VRM ローダーのラッパー
 * @webxr-jp/avatar-optimizer の loadVRM を re-export
 */
import { loadVRM as loadVRMCore, type VRMLoaderError } from '@webxr-jp/avatar-optimizer'

export type { VRMLoaderError }

/**
 * URLからVRMモデルを非同期で読み込みます。
 */
export const loadVRM = loadVRMCore

/**
 * File オブジェクトからVRMモデルを読み込みます。
 */
export const loadVRMFromFile = loadVRMCore

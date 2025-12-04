/**
 * VRM ローダーのラッパー
 * @xrift/avatar-optimizer の loadVRM を re-export
 */
import { loadVRM as loadVRMCore, type VRMLoaderError } from '@xrift/avatar-optimizer'

export type { VRMLoaderError }

/**
 * URLからVRMモデルを非同期で読み込みます。
 */
export const loadVRM = loadVRMCore

/**
 * File オブジェクトからVRMモデルを読み込みます。
 */
export const loadVRMFromFile = loadVRMCore

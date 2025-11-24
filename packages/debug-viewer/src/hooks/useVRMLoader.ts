import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import { ResultAsync } from 'neverthrow'
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type VRMLoaderError =
  | { type: 'VRM_LOAD_FAILED'; message: string }
  | { type: 'INVALID_VRM'; message: string }

/**
 * URLからVRMモデルを非同期で読み込みます。
 * GLTFLoaderにVRMLoaderPluginを登録してVRM拡張機能をサポートします。
 *
 * @param url - VRMファイルのURL
 * @returns VRMオブジェクトまたはエラー
 */
export function loadVRM(url: string): ResultAsync<VRM, VRMLoaderError>
{
  return ResultAsync.fromPromise(
    (async () =>
    {
      const loader = new GLTFLoader()
      loader.register(parser => new VRMLoaderPlugin(parser))

      const gltf = await loader.loadAsync(url)
      const vrm = gltf.userData.vrm as VRM | undefined
      console.log(vrm)

      if (!vrm)
      {
        throw new Error('VRM data not found in loaded file')
      }

      return vrm
    })(),
    (error) => ({
      type: 'VRM_LOAD_FAILED' as const,
      message: `Failed to load VRM: ${String(error)}`,
    }),
  )
}

/**
 * File オブジェクトからVRMモデルを読み込みます。
 * ブラウザ環境でファイルアップロード後に使用します。
 *
 * @param file - VRMのFileオブジェクト
 * @returns VRMオブジェクトまたはエラー
 */
export function loadVRMFromFile(file: File): ResultAsync<VRM, VRMLoaderError>
{
  return ResultAsync.fromPromise(
    (async () =>
    {
      const url = URL.createObjectURL(file)
      try
      {
        const loader = new GLTFLoader()
        loader.register((parser: GLTFParser) => new VRMLoaderPlugin(parser))

        const gltf = await loader.loadAsync(url)
        const vrm = gltf.userData.vrm as VRM | undefined

        if (!vrm)
        {
          throw new Error('VRM data not found in loaded file')
        }

        return vrm
      } finally
      {
        URL.revokeObjectURL(url)
      }
    })(),
    (error) => ({
      type: 'VRM_LOAD_FAILED' as const,
      message: `Failed to load VRM from file: ${String(error)}`,
    }),
  )
}

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, type VRMAnimation } from '@pixiv/three-vrm-animation'
import { ResultAsync } from 'neverthrow'

export type VRMAnimationLoaderError =
  | { type: 'VRMA_LOAD_FAILED'; message: string }
  | { type: 'INVALID_VRMA'; message: string }

/**
 * URLからVRMアニメーション(VRMA)を非同期で読み込みます。
 *
 * @param url - VRMAファイルのURL
 * @returns VRMAnimationオブジェクトまたはエラー
 */
export function loadVRMAnimation(url: string): ResultAsync<VRMAnimation, VRMAnimationLoaderError>
{
  return ResultAsync.fromPromise(
    (async () =>
    {
      const loader = new GLTFLoader()
      loader.register(parser => new VRMAnimationLoaderPlugin(parser))

      const gltf = await loader.loadAsync(url)
      const vrmAnimation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined

      if (!vrmAnimation)
      {
        throw new Error('VRM Animation data not found in loaded file')
      }

      return vrmAnimation
    })(),
    (error) => ({
      type: 'VRMA_LOAD_FAILED' as const,
      message: `Failed to load VRMA: ${String(error)}`,
    }),
  )
}

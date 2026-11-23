import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, type VRMAnimation } from '@pixiv/three-vrm-animation'
import { ResultAsync } from 'neverthrow'

export type VRMAnimationLoaderError =
  | { type: 'VRMA_LOAD_FAILED'; message: string }
  | { type: 'INVALID_VRMA'; message: string }

/** VRMA の拡張が入っていない glTF を読み込んだときに投げる内部用エラー */
class MissingVRMAnimationError extends Error
{
  constructor()
  {
    super('VRM Animation data not found in loaded file')
    this.name = 'MissingVRMAnimationError'
  }
}

function createLoader(): GLTFLoader
{
  const loader = new GLTFLoader()
  loader.register(parser => new VRMAnimationLoaderPlugin(parser))
  return loader
}

function extractVRMAnimation(gltf: GLTF): VRMAnimation
{
  const vrmAnimation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined

  if (!vrmAnimation)
  {
    throw new MissingVRMAnimationError()
  }

  return vrmAnimation
}

function toLoaderError(error: unknown): VRMAnimationLoaderError
{
  if (error instanceof MissingVRMAnimationError)
  {
    return {
      type: 'INVALID_VRMA',
      message: 'VRMA データが含まれていません (VRMC_vrm_animation 拡張がありません)',
    }
  }

  return {
    type: 'VRMA_LOAD_FAILED',
    message: `Failed to load VRMA: ${String(error)}`,
  }
}

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
      const gltf = await createLoader().loadAsync(url)
      return extractVRMAnimation(gltf)
    })(),
    toLoaderError,
  )
}

/**
 * ローカルの VRMA ファイル (File) を非同期で読み込みます。
 * URL を用意せずに手元のモーションで動作確認するために使います。
 *
 * @param file - VRMAファイル
 * @returns VRMAnimationオブジェクトまたはエラー
 */
export function loadVRMAnimationFromFile(file: File): ResultAsync<VRMAnimation, VRMAnimationLoaderError>
{
  return ResultAsync.fromPromise(
    (async () =>
    {
      const data = await file.arrayBuffer()
      const gltf = await createLoader().parseAsync(data, '')
      return extractVRMAnimation(gltf)
    })(),
    toLoaderError,
  )
}

import { errAsync, ResultAsync } from 'neverthrow'

import {
  buildAtlases,
  type AtlasBuildResult,
  type AtlasError,
  type AtlasMaterialDescriptor,
} from '@xrift/avatar-optimizer-texture-atlas'

import type { OptimizationError, OptimizationOptions } from '../types'
import {
  readVRMDocumentWithLoadersGL,
  writeVRMDocumentWithLoadersGL,
  type LoadersGLVRMDocument,
} from '../vrm/loaders-gl'
import { ScenegraphAdapter } from '../vrm/scenegraph-adapter'
import { remapPrimitiveUVs } from './uv-remap'

interface OptimizationContext {
  document: LoadersGLVRMDocument
  adapter: ScenegraphAdapter
  descriptors: AtlasMaterialDescriptor[]
  atlasResult?: AtlasBuildResult
}

/**
 * VRM モデルを最適化します
 * テクスチャアトラス化と UV 再計算を含む最小限のパイプライン。
 */
export function optimizeVRM(
  file: File,
  options: OptimizationOptions,
): ResultAsync<File, OptimizationError> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file')),
      () => ({
        type: 'INVALID_FILE_TYPE' as const,
        message: 'Invalid file: expected a File object',
      }),
    )
  }

  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'LOAD_FAILED' as const,
    message: `Failed to read file: ${String(error)}`,
  }))
    .andThen((arrayBuffer) =>
      readVRMDocumentWithLoadersGL(arrayBuffer).map((document) => ({
        document,
      })),
    )
    .andThen((state) => {
      const adapterResult = ScenegraphAdapter.from(state.document.gltf)
      if (adapterResult.isErr()) {
        return errAsync(adapterResult.error)
      }

      const adapter = adapterResult.value
      return ResultAsync.fromPromise(
        (async () => {
          const descriptors = await adapter.createAtlasMaterialDescriptors()
          return {
            ...state,
            adapter,
            descriptors,
          }
        })(),
        (error) => ({
          type: 'PROCESSING_FAILED' as const,
          message: `Failed to enumerate textures: ${String(error)}`,
        }),
      )
    })
    .andThen((state) =>
      ResultAsync.fromPromise(
        processAtlases(state, options),
        (error) => mapAtlasError(error),
      ),
    )
    .andThen((state) =>
      writeVRMDocumentWithLoadersGL(state.document).mapErr((error) => ({
        type: 'PROCESSING_FAILED' as const,
        message: `Failed to write optimized file: ${String(error)}`,
      })),
    )
    .map((arrayBuffer) => {
      const newUint8Array = new Uint8Array(arrayBuffer)
      return new File([newUint8Array], file.name, { type: file.type })
    })
}

async function processAtlases(
  context: OptimizationContext,
  options: OptimizationOptions,
): Promise<OptimizationContext> {
  if (!context.descriptors.length) {
    return context
  }

  const textureScale = resolveTextureScaleFromDescriptors(
    context.descriptors,
    options.maxTextureSize,
  )

  const atlasResult = await buildAtlases(context.descriptors, {
    maxSize: options.maxTextureSize,
    textureScale,
  })

  context.adapter.applyAtlasResult(atlasResult, { mimeType: 'image/png' })
  const placements = context.adapter.consumePendingPlacements()
  const scenegraph = context.adapter.unwrap()
  remapPrimitiveUVs(scenegraph, placements)
  context.adapter.flush()
  context.document = {
    gltf: scenegraph.gltf,
  }

  return {
    ...context,
    atlasResult,
  }
}

function resolveTextureScaleFromDescriptors(
  descriptors: AtlasMaterialDescriptor[],
  targetMaxSize: number,
): number {
  let maxWidth = 0
  let maxHeight = 0

  for (const descriptor of descriptors) {
    for (const texture of descriptor.textures) {
      maxWidth = Math.max(maxWidth, texture.width)
      maxHeight = Math.max(maxHeight, texture.height)
    }
  }

  const currentMax = Math.max(maxWidth, maxHeight)
  if (!currentMax || currentMax <= targetMaxSize) {
    return 1.0
  }

  const scale = targetMaxSize / currentMax
  return Math.max(0.1, Math.min(1.0, scale))
}

function mapAtlasError(error: unknown): OptimizationError {
  const atlasError = error as AtlasError | Error

  if ((atlasError as AtlasError)?.type) {
    switch ((atlasError as AtlasError).type) {
      case 'INVALID_TEXTURE':
      case 'PACKING_FAILED':
      case 'CANVAS_ERROR':
      case 'DOCUMENT_ERROR':
      case 'UV_MAPPING_FAILED':
        return {
          type: 'PROCESSING_FAILED',
          message: `Texture atlasing failed: ${(atlasError as AtlasError).message}`,
        }
      case 'UNKNOWN_ERROR':
      default:
        return {
          type: 'UNKNOWN_ERROR',
          message: `Texture atlasing failed: ${(atlasError as AtlasError).message}`,
        }
    }
  }

  return {
    type: 'PROCESSING_FAILED',
    message: `Texture atlasing failed: ${String(error)}`,
  }
}

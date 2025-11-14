import { ResultAsync } from 'neverthrow'

import {
  buildAtlases,
  type AtlasBuildResult,
  type AtlasError,
  type AtlasMaterialDescriptor,
} from '@xrift/avatar-optimizer-texture-atlas'

import type { OptimizationError, OptimizationOptions, ThreeVRMDocument } from '../types'
import { importVRMWithThreeVRM } from '../vrm/three-vrm-loader'
import { exportVRMDocumentToGLB } from '../vrm/exporter'
import { ScenegraphAdapter } from '../vrm/scenegraph-adapter'
import { remapPrimitiveUVs } from './uv-remap'

interface OptimizationContext {
  document: ThreeVRMDocument
  adapter: ScenegraphAdapter
  descriptors: AtlasMaterialDescriptor[]
  atlasResult?: AtlasBuildResult
}

/**
 * VRM モデルを最適化します
 * テクスチャアトラス化と UV 再計算を含む最小限のパイプライン。
 */
export function optimizeVRM(
  input: File,
  options: OptimizationOptions,
): ResultAsync<File, OptimizationError>
export function optimizeVRM(
  input: ThreeVRMDocument,
  options: OptimizationOptions,
): ResultAsync<ThreeVRMDocument, OptimizationError>
export function optimizeVRM(
  input: File | ThreeVRMDocument,
  options: OptimizationOptions,
): ResultAsync<File | ThreeVRMDocument, OptimizationError> {
  if (isThreeVRMDocument(input)) {
    return optimizeThreeDocument(input, options)
  }
  return optimizeFileInput(input, options)
}

function optimizeFileInput(
  file: File,
  options: OptimizationOptions,
): ResultAsync<File, OptimizationError> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file input')),
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
    .andThen((arrayBuffer) => importVRMWithThreeVRM(arrayBuffer))
    .andThen((document) => optimizeThreeDocument(document, options))
    .andThen((optimizedDocument) =>
      exportVRMDocumentToGLB(optimizedDocument).map((arrayBuffer) => {
        const uint8 = new Uint8Array(arrayBuffer)
        return new File([uint8], file.name, { type: file.type })
      }),
    )
}

function optimizeThreeDocument(
  document: ThreeVRMDocument,
  options: OptimizationOptions,
): ResultAsync<ThreeVRMDocument, OptimizationError> {
  return ResultAsync.fromPromise(
    (async () => {
      const adapterResult = ScenegraphAdapter.from(document)
      if (adapterResult.isErr()) {
        throw adapterResult.error
      }

      const adapter = adapterResult.value
      const descriptors = await adapter.createAtlasMaterialDescriptors()
      const context = await processAtlases(
        {
          document,
          adapter,
          descriptors,
        },
        options,
      )

      return context.document
    })(),
    (error) => normalizeOptimizationError(error),
  )
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

  let atlasResult: AtlasBuildResult
  try {
    atlasResult = await buildAtlases(context.descriptors, {
      maxSize: options.maxTextureSize,
      textureScale,
    })
  } catch (error) {
    throw mapAtlasError(error)
  }

  const placements = await context.adapter.applyAtlasResult(atlasResult)
  remapPrimitiveUVs(context.document, placements)

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

function isThreeVRMDocument(input: unknown): input is ThreeVRMDocument {
  return Boolean(
    input &&
      typeof input === 'object' &&
      'gltf' in input &&
      'vrm' in input,
  )
}

function normalizeOptimizationError(error: unknown): OptimizationError {
  if (isOptimizationError(error)) {
    return error
  }
  return {
    type: 'UNKNOWN_ERROR',
    message: `Failed to optimize VRM: ${String(error)}`,
  }
}

function isOptimizationError(error: unknown): error is OptimizationError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'type' in error &&
      typeof (error as { type?: unknown }).type === 'string' &&
      'message' in error,
  )
}

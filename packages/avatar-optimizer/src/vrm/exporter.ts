import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { ResultAsync } from 'neverthrow'

import type { OptimizationError, ThreeVRMDocument } from '../types'

export function exportVRMDocumentToGLB(
  document: ThreeVRMDocument,
): ResultAsync<ArrayBuffer, OptimizationError> {
  return ResultAsync.fromPromise(
    new Promise<ArrayBuffer>((resolve, reject) => {
      const exporter = new GLTFExporter()
      const scenes = collectScenes(document)
      if (!scenes.length) {
        reject(new Error('VRM document does not contain any scene objects.'))
        return
      }

      exporter.parse(
        scenes.length === 1 ? scenes[0] : scenes,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result)
            return
          }
          const encoder = new TextEncoder()
          resolve(encoder.encode(JSON.stringify(result)).buffer)
        },
        reject,
        {
          binary: true,
          includeCustomExtensions: true,
          animations: document.gltf.animations ?? [],
        },
      )
    }),
    (error) => ({
      type: 'PROCESSING_FAILED' as const,
      message: `Failed to export VRM document: ${String(error)}`,
    }),
  )
}

function collectScenes(document: ThreeVRMDocument) {
  if (document.gltf.scenes?.length) {
    return document.gltf.scenes
  }
  if (document.gltf.scene) {
    return [document.gltf.scene]
  }
  return []
}

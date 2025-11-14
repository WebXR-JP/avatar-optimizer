import { expect } from 'vitest'
import { validateBytes } from 'gltf-validator'

export async function expectNoGltfValidatorIssues(options: {
  binary: Uint8Array
  uri?: string
  maxIssues?: number
}): Promise<void> {
  const report = await validateBytes(options.binary, {
    uri: options.uri ?? 'optimized.vrm',
    format: 'glb',
    maxIssues: options.maxIssues ?? 50,
  })

  const failingIssues = (report?.issues?.messages ?? []).filter(
    (issue: any) => issue?.severity === 'Error',
  )
  const codes = failingIssues.map((issue: any) => `${issue.code}: ${issue.message}`)

  expect({
    errorCount: report?.issues?.numErrors ?? 0,
    errors: codes,
  }).toEqual({
    errorCount: 0,
    errors: [],
  })
}

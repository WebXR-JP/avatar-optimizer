import { ResultAsync } from 'neverthrow'

import type { ValidationError, VRMValidationIssue, VRMValidationResult } from '../types'

/**
 * VRM ファイルをバリデーションします
 * vrm-validator を使用して VRM の整合性と仕様準拠を確認
 *
 * @param file VRM ファイル
 * @returns バリデーション結果
 */
export function validateVRMFile(
  file: File,
): ResultAsync<VRMValidationResult, ValidationError> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return ResultAsync.fromPromise(
      Promise.reject(new Error('Invalid file')),
      () => ({
        type: 'INVALID_FILE_TYPE' as const,
        message: 'Invalid file: expected a File object',
      })
    )
  }

  return ResultAsync.fromPromise(file.arrayBuffer(), (error) => ({
    type: 'INVALID_FILE_TYPE' as const,
    message: `Failed to read file: ${String(error)}`,
  })).andThen((arrayBuffer) => validateVRMBytes(new Uint8Array(arrayBuffer)))
}

function validateVRMBytes(
  data: Uint8Array,
): ResultAsync<VRMValidationResult, ValidationError> {
  return ResultAsync.fromPromise(
    (async () => {
      // vrm-validator を動的にインポート
      // @ts-expect-error - vrm-validator は型定義がないため
      const vrmValidator = await import('vrm-validator')

      const report = await vrmValidator.validateBytes(data, {
        uri: 'model.vrm',
        format: 'glb',
      })

      const messages = (report.issues?.messages || []) as any[]
      const isValid = (report.issues?.numErrors || 0) === 0
      const issues: VRMValidationIssue[] = messages.map((message: any) => ({
        code: message.code || 'UNKNOWN',
        message: message.message || 'Unknown issue',
        severity: mapSeverity(message.severity),
        pointer: message.pointer,
      }))

      return {
        isValid,
        issues,
        info: report.info,
      } as VRMValidationResult
    })(),
    (error) => ({
      type: 'VALIDATOR_ERROR' as const,
      message: `VRM validation failed: ${String(error)}`,
    })
  )
}

function mapSeverity(severity: string): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'Error':
      return 'error'
    case 'Warning':
      return 'warning'
    case 'Information':
      return 'info'
    default:
      return 'info'
  }
}

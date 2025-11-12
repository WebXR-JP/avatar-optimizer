/**
 * Type definitions for vrm-validator
 */

export interface ValidationOptions {
  uri?: string
  format?: 'glb' | 'gltf'
  externalResourceFunction?: (uri: string) => Promise<Uint8Array>
  writeTimestamp?: boolean
  maxIssues?: number
  ignoredIssues?: string[]
  onlyIssues?: string[]
  severityOverrides?: Record<string, string>
}

export interface ValidationIssue {
  code: string
  message: string
  severity: string
  pointer?: string
}

export interface ValidationReport {
  severity: string
  issues?: ValidationIssue[]
  info?: {
    generator?: string
    version?: string
  }
}

export function version(): string

export function supportedExtensions(): string[]

export function validateBytes(
  data: Uint8Array,
  options?: ValidationOptions
): Promise<ValidationReport>

export function validateString(
  json: string,
  options?: ValidationOptions
): Promise<ValidationReport>

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { validateVRMFile } from '../src/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('validateVRMFile', () => {
  // Use a fixture file if available, otherwise skip
  const fixtureDir = path.join(__dirname, 'fixtures')
  const testVrmFile = path.join(fixtureDir, 'sample.glb')
  const hasFixture = fs.existsSync(testVrmFile)

  describe('File input validation', () => {
    it('should reject invalid file objects', async () => {
      const invalidFile = {} as any
      const result = await validateVRMFile(invalidFile)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_FILE_TYPE')
      }
    })

    it('should reject null file', async () => {
      const result = await validateVRMFile(null as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_FILE_TYPE')
      }
    })

    it('should reject undefined file', async () => {
      const result = await validateVRMFile(undefined as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.type).toBe('INVALID_FILE_TYPE')
      }
    })
  })

  describe('VRM validation', () => {
    it('should return a validation result for valid VRM', async () => {
      if (!hasFixture) {
        console.log(
          'ℹ️  Skipping test: No test fixture found at',
          testVrmFile
        )
        return
      }

      const fileBuffer = fs.readFileSync(testVrmFile)
      const file = new File([fileBuffer], 'sample.glb', { type: 'model/gltf-binary' })

      const result = await validateVRMFile(file)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const validation = result.value
        expect(validation).toHaveProperty('isValid')
        expect(validation).toHaveProperty('issues')
        expect(Array.isArray(validation.issues)).toBe(true)

        // Validate issue structure
        validation.issues.forEach((issue) => {
          expect(issue).toHaveProperty('code')
          expect(issue).toHaveProperty('message')
          expect(issue).toHaveProperty('severity')
          expect(['error', 'warning', 'info']).toContain(issue.severity)
        })
      }
    })

    it('should categorize issues by severity', async () => {
      if (!hasFixture) {
        console.log(
          'ℹ️  Skipping test: No test fixture found at',
          testVrmFile
        )
        return
      }

      const fileBuffer = fs.readFileSync(testVrmFile)
      const file = new File([fileBuffer], 'sample.glb', { type: 'model/gltf-binary' })

      const result = await validateVRMFile(file)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const validation = result.value
        const { issues } = validation

        // Count issues by severity
        const errorCount = issues.filter((i) => i.severity === 'error').length
        const warningCount = issues.filter((i) => i.severity === 'warning').length
        const infoCount = issues.filter((i) => i.severity === 'info').length

        // Basic validation: should have proper counts
        expect(errorCount + warningCount + infoCount).toBe(issues.length)
      }
    })
  })

  describe('Result handling', () => {
    it('should return Ok when validation succeeds', async () => {
      if (!hasFixture) {
        console.log(
          'ℹ️  Skipping test: No test fixture found at',
          testVrmFile
        )
        return
      }

      const fileBuffer = fs.readFileSync(testVrmFile)
      const file = new File([fileBuffer], 'sample.glb', { type: 'model/gltf-binary' })

      const result = await validateVRMFile(file)

      expect(result.isOk()).toBe(true)
      expect(result.isErr()).toBe(false)
    })

    it('should have correct Result type structure', async () => {
      const invalidFile = {} as any
      const result = await validateVRMFile(invalidFile)

      // Test Result type methods
      expect(typeof result.isOk).toBe('function')
      expect(typeof result.isErr).toBe('function')

      // One should be true, one false
      const isOk = result.isOk()
      const isErr = result.isErr()
      expect(isOk).not.toBe(isErr)
    })
  })
})

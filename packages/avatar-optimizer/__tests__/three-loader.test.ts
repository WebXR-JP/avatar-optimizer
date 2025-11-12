import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { loadVRMWithThree } from '../src/vrm/three-loader'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('loadVRMWithThree', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'Seed-san.vrm')
  const hasFixture = existsSync(fixturePath)

  it('rejects invalid file inputs', async () => {
    const result = await loadVRMWithThree({} as File)
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_FILE_TYPE')
    }
  })

  it('loads VRM meta information using three-vrm', async () => {
    if (!hasFixture) {
      console.log('ℹ️  Skipping test: missing fixture at', fixturePath)
      return
    }

    const buffer = await readFile(fixturePath)
    const file = new File([buffer], 'Seed-san.vrm', {
      type: 'model/gltf-binary',
    })

    const result = await loadVRMWithThree(file)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const { vrm, gltf } = result.value
      expect(gltf.asset?.version).toBeDefined()
      expect(gltf.parser).toBeDefined()
      expect(vrm).not.toBeNull()

      const meta = vrm?.meta
      expect(meta).toBeDefined()
      if (!meta) {
        return
      }

      if ('name' in meta) {
        expect(meta.name).toBeTruthy()
      } else {
        expect(meta.metaVersion).toBeTruthy()
        expect(meta.author).toBeTruthy()
      }
    }
  })
})

/**
 * Integration test for atlasTexturesInDocument
 *
 * Tests the complete atlas workflow:
 * 1. Document with multiple textures
 * 2. Canvas/Jimp creation and atlas generation
 * 3. Texture registration and material updates
 *
 * Note: Canvas factory injection is no longer needed as draw-image
 * automatically detects the environment and uses Jimp (Node.js) or Canvas (browser)
 */

import { Document } from '@gltf-transform/core'
import { atlasTexturesInDocument } from '../src/atlas/process-gltf-atlas'

describe('atlasTexturesInDocument', () => {
  let document: Document

  beforeEach(() => {
    // Create a minimal test document
    document = new Document()
  })

  afterEach(() => {
    // Cleanup if needed
  })

  it('should handle document with no textures', async () => {
    // Document without textures should not fail
    const result = await atlasTexturesInDocument(
      document,
      { maxSize: 1024 },
    )

    // Should error since no textures to atlas
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('No textures')
    }
  })

  it('should process document with single texture', async () => {
    // Create a simple texture (minimum valid PNG)
    // PNG signature + minimal IHDR chunk
    const pngData = new Uint8Array([
      // PNG signature
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      // IHDR chunk (13 bytes: width=1, height=1, 8-bit RGBA)
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89,
      // IDAT chunk with minimal data
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
      0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
      0x00, 0x03, 0x00, 0x01, 0x79, 0xb9, 0xfb, 0x56,
      // IEND chunk
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ])

    const texture = document.createTexture('test-texture')
      .setImage(pngData)
      .setMimeType('image/png')

    // Create a material using the texture
    const material = document.createMaterial('test-material')
      .setBaseColorTexture(texture)

    // Create a node and mesh with the material
    const mesh = document.createMesh('test-mesh')
    const primitive = document.createPrimitive()
    primitive.setMaterial(material)
    mesh.addPrimitive(primitive)

    const node = document.createNode('test-node')
      .setMesh(mesh)

    // Run atlas
    const result = await atlasTexturesInDocument(
      document,
      { maxSize: 1024 },
    )

    if (result.isErr()) {
      console.error('Atlas error:', result.error)
    }
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const { document: atlasedDoc, mapping, atlasMetadata } = result.value

      // Verify atlas metadata
      expect(atlasMetadata.textureCount).toBe(1)
      expect(atlasMetadata.width).toBeGreaterThan(0)
      expect(atlasMetadata.height).toBeGreaterThan(0)
      expect(atlasMetadata.packingEfficiency).toBeGreaterThan(0)
      expect(atlasMetadata.packingEfficiency).toBeLessThanOrEqual(1)

      // Verify mapping information
      expect(mapping).toBeDefined()
      expect(Array.isArray(mapping)).toBe(true)

      // Verify document was modified
      expect(atlasedDoc).toBe(document) // Same instance
    }
  })

  it('should calculate packing efficiency correctly', async () => {
    // Create two minimal PNG textures
    const pngData1 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde,
      0x00, 0x00, 0x00, 0x1c, 0x49, 0x44, 0x41, 0x54,
      0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0xc0, 0xc0,
      0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0,
      0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0x00, 0x00, 0x3a,
      0xa6, 0x07, 0xc4, 0xcd, 0x98, 0x2d, 0x4f,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ])

    const pngData2 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89,
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
      0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
      0x00, 0x03, 0x00, 0x01, 0x79, 0xb9, 0xfb, 0x56,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ])

    const texture1 = document.createTexture('texture-1')
      .setImage(pngData1)
      .setMimeType('image/png')

    const texture2 = document.createTexture('texture-2')
      .setImage(pngData2)
      .setMimeType('image/png')

    const material = document.createMaterial('multi-texture')
      .setBaseColorTexture(texture1)
      .setNormalTexture(texture2)

    const mesh = document.createMesh('test-mesh')
    const primitive = document.createPrimitive()
    primitive.setMaterial(material)
    mesh.addPrimitive(primitive)

    const node = document.createNode('test-node').setMesh(mesh)

    const result = await atlasTexturesInDocument(
      document,
      { maxSize: 512 },
    )

    if (result.isErr()) {
      console.error('Atlas error:', result.error)
    }
    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const { atlasMetadata } = result.value

      // Verify packing efficiency is reasonable
      expect(atlasMetadata.packingEfficiency).toBeGreaterThan(0)
      expect(atlasMetadata.packingEfficiency).toBeLessThanOrEqual(1)
      expect(atlasMetadata.textureCount).toBe(2)
    }
  })
})

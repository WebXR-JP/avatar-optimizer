/**
 * Manual test for texture packing and atlas creation
 *
 * This script demonstrates using the packAndCreateAtlas function to:
 * 1. Load multiple images from disk
 * 2. Pack them efficiently into a single atlas
 * 3. Save the atlas as a PNG image for visual verification
 */

import { promises as fs } from 'fs'
import { createCanvas, loadImage } from 'canvas'
import { packAndCreateAtlas } from '../../src/index.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/orig')
const OUTPUT_DIR = path.resolve(__dirname, '../fixtures/out')
const IMAGE_FILES = [
  'gochiharu_512.png',
  'mafuyuchan_2048.png',
  '代理ちゃん新衣装_icon_1024.png',
]
const ATLAS_SIZES = [4096, 2048, 1024]

/**
 * Extract raw image data from a loaded canvas Image
 */
function extractImageData(canvasImage: any): {
  width: number
  height: number
  data: Uint8ClampedArray
} {
  const tempCanvas = createCanvas(canvasImage.width, canvasImage.height)
  const ctx = tempCanvas.getContext('2d')
  ctx.drawImage(canvasImage, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvasImage.width, canvasImage.height)
  return {
    width: canvasImage.width,
    height: canvasImage.height,
    data: new Uint8ClampedArray(imageData.data),
  }
}

/**
 * Canvas ファクトリ for node-canvas (type cast wrapper)
 */
function createCanvasFactory(width: number, height: number): any {
  return createCanvas(width, height)
}

async function main() {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const imagePaths = IMAGE_FILES.map((file) => path.join(FIXTURES_DIR, file))

  // 1. Load images and extract their data
  console.log('📖 Loading images...')
  const canvasImages = await Promise.all(imagePaths.map((p) => loadImage(p)))
  const imageDataList = canvasImages.map((img) => extractImageData(img))

  const sizes = imageDataList.map((data) => ({
    width: data.width,
    height: data.height,
  }))
  const images = imageDataList.map((data) => data.data)

  console.log(`   Loaded ${images.length} images`)
  imageDataList.forEach((data, idx) => {
    console.log(`   [${idx}] ${data.width}x${data.height}`)
  })

  // 2. Generate atlases for each size
  console.log(`\n⚙️  Generating atlases (${ATLAS_SIZES.length} patterns)...\n`)

  for (const atlasSize of ATLAS_SIZES) {
    console.log(`\n📦 Creating ${atlasSize}x${atlasSize} atlas...`)

    try {
      const { packing, atlasBuffer } = await packAndCreateAtlas(
        sizes,
        images,
        atlasSize, // maxSize
        4, // padding
        createCanvasFactory, // Canvas factory
      )

      // 3. Log packing results
      console.log(`   ✓ Atlas created: ${packing.atlasWidth}x${packing.atlasHeight}`)
      console.log(`   ✓ Packed textures: ${packing.packed.length}`)
      packing.packed.forEach((rect, idx) => {
        console.log(
          `     [${idx}] Image #${rect.index} → (${rect.x}, ${rect.y}) ${rect.width}x${rect.height}`,
        )
      })

      // 4. Save the atlas image
      const outputPath = path.join(OUTPUT_DIR, `atlas_${atlasSize}.png`)
      await fs.writeFile(outputPath, atlasBuffer)

      const stats = await fs.stat(outputPath)
      console.log(`   💾 Saved: atlas_${atlasSize}.png (${(stats.size / 1024).toFixed(2)} KB)`)
    } catch (error) {
      console.log(`   ❌ Failed to create ${atlasSize}x${atlasSize} atlas`)
      console.log(`      Error: ${String(error)}`)
    }
  }

  console.log(`\n✅ All atlases generated in: ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error('❌ Error creating texture atlas:', err)
  process.exit(1)
})

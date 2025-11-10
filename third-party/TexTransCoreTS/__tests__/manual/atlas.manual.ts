/**
 * Manual test for texture packing
 *
 * This script takes a list of images, packs them into an atlas,
 * and saves the result as a PNG image for visual verification.
 */

import { promises as fs } from 'fs'
import { createCanvas, loadImage } from 'canvas'
import { packTexturesNFDH } from '../../src/atlas/nfdh-packer.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures')
const OUTPUT_DIR = path.resolve(__dirname, '../output')
const IMAGE_FILES = [
  'gochiharu_512.png',
  'mafuyuchan_2048.png',
  '代理ちゃん新衣装_icon_1024.png',
]

async function main() {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const imagePaths = IMAGE_FILES.map((file) => path.join(FIXTURES_DIR, file))

  // 1. Load images and get their dimensions
  const images = await Promise.all(imagePaths.map((p) => loadImage(p)))
  const sizes = images.map((img) => ({
    width: img.width,
    height: img.height,
  }))

  // 2. Run the packer
  const atlasWidth = 4096
  const atlasHeight = 4096
  const { packed } = await packTexturesNFDH(sizes, atlasWidth, atlasHeight)

  // 3. Create the atlas image
  const canvas = createCanvas(atlasWidth, atlasHeight)
  const ctx = canvas.getContext('2d')

  // Optional: Fill background for better visibility
  ctx.fillStyle = '#cccccc'
  ctx.fillRect(0, 0, atlasWidth, atlasHeight)

  // 4. Draw images onto the atlas
  for (let i = 0; i < packed.length; i++) {
    const rect = packed[i]
    const image = images[rect.index]
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  }

  // 5. Save the result
  const outputPath = path.join(OUTPUT_DIR, 'atlas.png')
  const buffer = canvas.toBuffer('image/png')
  await fs.writeFile(outputPath, buffer)

  console.log(`Atlas image saved to: ${outputPath}`)
}

main().catch((err) => {
  console.error('Error creating texture atlas:', err)
  process.exit(1)
})

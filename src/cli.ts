#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { Command } from 'commander'
import { optimizeVRM, type OptimizationOptions } from './index'
import type { CreateCanvasFactory } from '@xrift/textranscore-ts'
import { createCanvas as nodeCreateCanvas } from 'canvas'

const program = new Command()

program
  .name('xrift-optimize')
  .description('VRM model optimization CLI tool')
  .version('0.1.0')
  .argument('<input>', 'Path to input VRM file')
  .option('-o, --output <path>', 'Path to output VRM file', 'output.vrm')
  .option('--compress-textures', 'Enable texture compression', true)
  .option('--option-max-texture-size <size>', 'Maximum texture size in pixels', '2048')
  .option('--texture-scale <scale>', 'Texture downscaling factor (0.1-1.0)', '1.0')
  .option('--reduce-meshes', 'Enable mesh reduction', false)
  .option('--target-polygon-count <count>', 'Target polygon count for mesh reduction')
  .action(async (input, options) => {
    try {
      // Validate input file exists
      const inputPath = path.resolve(input)
      const outputPath = path.resolve(options.output)

      console.log(`📁 Input:  ${inputPath}`)
      console.log(`📁 Output: ${outputPath}`)

      // Read input file
      console.log('📖 Reading input file...')
      const fileBuffer = await readFile(inputPath)

      // Convert to File object
      const file = new File([fileBuffer], path.basename(inputPath), {
        type: 'model/gltf-binary',
      })

      // Prepare optimization options
      const textureScale = parseFloat(options.textureScale)
      if (isNaN(textureScale) || textureScale < 0.1 || textureScale > 1.0) {
        console.error('❌ Error: Texture scale must be between 0.1 and 1.0')
        process.exit(1)
      }

      const optimizationOptions: OptimizationOptions = {
        compressTextures: options.compressTextures,
        maxTextureSize: parseInt(options.optionMaxTextureSize, 10),
        textureScale: textureScale,
        reduceMeshes: options.reduceMeshes,
        targetPolygonCount: options.targetPolygonCount
          ? parseInt(options.targetPolygonCount, 10)
          : undefined,
      }

      // Node.js 環境用の createCanvasFactory を定義
      const createCanvasFactory: CreateCanvasFactory = (width, height) => {
        return nodeCreateCanvas(width, height) as any // 型アサーションで Canvas 型に合わせる
      }

      // Run optimization
      console.log('⚙️  Optimizing VRM...')
      const result = await optimizeVRM(file, optimizationOptions, createCanvasFactory)

      if (result.isErr()) {
        const error = result.error
        console.error(
          `\n❌ Error (${error.type}): ${error.message}`,
        )
        process.exit(1)
      }

      // Write output file
      console.log('💾 Writing output file...')
      const optimizedBuffer = await result.value.arrayBuffer()
      await writeFile(outputPath, Buffer.from(optimizedBuffer))

      const originalSize = fileBuffer.byteLength / 1024 / 1024
      const optimizedSize = optimizedBuffer.byteLength / 1024 / 1024
      const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(2)

      console.log(`\n✅ Optimization complete!`)
      console.log(`   Original: ${originalSize.toFixed(2)} MB`)
      console.log(`   Optimized: ${optimizedSize.toFixed(2)} MB`)
      console.log(`   Reduction: ${reduction}%`)
    } catch (error) {
      console.error(`\n❌ Unexpected error: ${String(error)}`)
      process.exit(1)
    }
  })

program.parse(process.argv)

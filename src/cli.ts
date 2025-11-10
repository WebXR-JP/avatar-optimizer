#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { Command } from 'commander'
import { optimizeVRM, type OptimizationOptions } from './index'

const program = new Command()

program
  .name('xrift-optimize')
  .description('VRM model optimization CLI tool')
  .version('0.1.0')
  .argument('<input>', 'Path to input VRM file')
  .option('-o, --output <path>', 'Path to output VRM file', 'output.vrm')
  .option('--compress-textures', 'Enable texture compression', true)
  .option('--max-texture-size <size>', 'Maximum texture size in pixels', '2048')
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
      const optimizationOptions: OptimizationOptions = {
        compressTextures: options.compressTextures,
        maxTextureSize: parseInt(options.maxTextureSize, 10),
        reduceMeshes: options.reduceMeshes,
        targetPolygonCount: options.targetPolygonCount
          ? parseInt(options.targetPolygonCount, 10)
          : undefined,
      }

      // Run optimization
      console.log('⚙️  Optimizing VRM...')
      const result = await optimizeVRM(file, optimizationOptions)

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

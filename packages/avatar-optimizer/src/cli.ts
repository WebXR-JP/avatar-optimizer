#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { Command } from 'commander'
import { optimizeVRM, validateVRMFile, type OptimizationOptions } from './index'

const program = new Command()

// Validate command
program
  .command('validate <input>')
  .description('Validate VRM file')
  .option('-v, --verbose', 'Show detailed validation issues', false)
  .action(async (input, options) => {
    try {
      const inputPath = path.resolve(input)

      console.log(`📁 Validating: ${inputPath}`)
      console.log('🔍 Running validation...')

      // Read input file
      const fileBuffer = await readFile(inputPath)

      // Convert to File object
      const file = new File([fileBuffer], path.basename(inputPath), {
        type: 'model/gltf-binary',
      })

      // Run validation
      const result = await validateVRMFile(file)

      if (result.isErr()) {
        const error = result.error
        console.error(`\n❌ Validation error (${error.type}): ${error.message}`)
        process.exit(1)
      }

      const validation = result.value

      if (validation.isValid) {
        console.log(`\n✅ VRM is valid!`)
      } else {
        console.log(`\n⚠️  VRM has validation issues:`)
      }

      // Show issues
      if (validation.issues.length > 0) {
        const errors = validation.issues.filter((i) => i.severity === 'error')
        const warnings = validation.issues.filter((i) => i.severity === 'warning')
        const infos = validation.issues.filter((i) => i.severity === 'info')

        if (errors.length > 0) {
          console.log(`\n  ❌ Errors: ${errors.length}`)
          if (options.verbose) {
            errors.forEach((issue) => {
              console.log(`     - [${issue.code}] ${issue.message}`)
              if (issue.pointer) {
                console.log(`       at ${issue.pointer}`)
              }
            })
          }
        }

        if (warnings.length > 0) {
          console.log(`\n  ⚠️  Warnings: ${warnings.length}`)
          if (options.verbose) {
            warnings.forEach((issue) => {
              console.log(`     - [${issue.code}] ${issue.message}`)
              if (issue.pointer) {
                console.log(`       at ${issue.pointer}`)
              }
            })
          }
        }

        if (infos.length > 0 && options.verbose) {
          console.log(`\n  ℹ️  Info: ${infos.length}`)
          infos.forEach((issue) => {
            console.log(`     - [${issue.code}] ${issue.message}`)
          })
        }
      } else {
        console.log(`\n  No issues found!`)
      }

      process.exit(validation.isValid ? 0 : 1)
    } catch (error) {
      console.error(`\n❌ Unexpected error: ${String(error)}`)
      process.exit(1)
    }
  })

// Optimize command (default)
program
  .command('optimize <input>')
  .description('Optimize VRM model (default)')
  .option('-o, --output <path>', 'Path to output VRM file', 'output.vrm')
  .option('--compress-textures', 'Enable texture compression', true)
  .option('--option-max-texture-size <size>', 'Maximum texture size in pixels', '2048')
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
      const maxTextureSize = parseInt(options.optionMaxTextureSize, 10)
      if (isNaN(maxTextureSize) || maxTextureSize < 64) {
        console.error('❌ Error: Max texture size must be a number >= 64')
        process.exit(1)
      }

      const optimizationOptions: OptimizationOptions = {
        compressTextures: options.compressTextures,
        maxTextureSize: maxTextureSize,
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

program
  .name('xrift-optimize')
  .description('VRM model optimization CLI tool')
  .version('0.1.0')

program.parse(process.argv)

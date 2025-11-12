/**
 * Manual CLI testing script
 *
 * This script demonstrates how to test the xrift-optimize CLI tool manually.
 * It can be run with:
 *
 * 1. Using tsx directly:
 *    npx tsx src/cli/index.ts __tests__/fixtures/sample.vrm -o __tests__/output/optimized.vrm
 *
 * 2. Using the built CLI:
 *    npm run build
 *    node dist/cli.js __tests__/fixtures/sample.vrm -o __tests__/output/optimized.vrm
 *
 * 3. Using the global CLI (after npm link):
 *    xrift-optimize __tests__/fixtures/sample.vrm -o __tests__/output/optimized.vrm
 *
 * After running the CLI, verify the output file:
 * - Check file size reduction
 * - Open the output.vrm in a VRM viewer or Blender to visually confirm optimization
 * - Compare with original file for quality loss
 *
 * Test Cases:
 * - Successfully optimize a VRM file with default settings
 * - Optimize with custom options (texture size, mesh reduction)
 * - Handle missing input file gracefully
 * - Handle invalid file format gracefully
 */

import { exec } from 'child_process'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function manualTestCLI() {
  const fixtureFile = path.join(__dirname, '../fixtures/sample.vrm')
  const outputFile = path.join(__dirname, '../output/cli-test-output.vrm')

  console.log('🧪 VRM Optimizer CLI Manual Test')
  console.log('═'.repeat(50))

  // Test 1: Check if fixture file exists
  console.log('\n📋 Test 1: Check fixture file')
  if (!existsSync(fixtureFile)) {
    console.warn(`⚠️  Fixture file not found: ${fixtureFile}`)
    console.log('   Please place a sample VRM file at __tests__/fixtures/sample.vrm')
    console.log('   Then run this script again to test the CLI.')
    return
  }
  const fixtureSize = statSync(fixtureFile).size / 1024 / 1024
  console.log(`✅ Fixture file found: ${fixtureSize.toFixed(2)} MB`)

  // Test 2: Run CLI with default options
  console.log('\n📋 Test 2: Run CLI with default options')
  try {
    const cliPath = path.join(__dirname, '../../src/cli/index.ts')
    const command = `npx tsx "${cliPath}" "${fixtureFile}" -o "${outputFile}"`
    console.log(`   Command: ${command}`)

    const { stdout, stderr } = await execAsync(command)
    console.log(stdout)
    if (stderr) {
      console.error('stderr:', stderr)
    }

    if (existsSync(outputFile)) {
      const outputSize = statSync(outputFile).size / 1024 / 1024
      const reduction = ((1 - outputSize / fixtureSize) * 100).toFixed(2)
      console.log(`✅ Output file created: ${outputSize.toFixed(2)} MB (${reduction}% reduction)`)
    } else {
      console.error('❌ Output file was not created')
    }
  } catch (error) {
    console.error(`❌ CLI execution failed: ${String(error)}`)
  }

  // Test 3: Test CLI with custom options
  console.log('\n📋 Test 3: Run CLI with custom options')
  try {
    const customOutputFile = path.join(__dirname, '../output/cli-test-custom.vrm')
    const cliPath = path.join(__dirname, '../../src/cli/index.ts')
    const command = `npx tsx "${cliPath}" "${fixtureFile}" -o "${customOutputFile}" --compress-textures --max-texture-size 1024`
    console.log(`   Command: ${command}`)

    const { stdout, stderr } = await execAsync(command)
    console.log(stdout)
    if (stderr) {
      console.error('stderr:', stderr)
    }

    if (existsSync(customOutputFile)) {
      const outputSize = statSync(customOutputFile).size / 1024 / 1024
      console.log(`✅ Custom output file created: ${outputSize.toFixed(2)} MB`)
    }
  } catch (error) {
    console.error(`❌ CLI with custom options failed: ${String(error)}`)
  }

  console.log('\n✨ Manual tests completed!')
  console.log('Next steps:')
  console.log('  1. Verify output files in __tests__/output/')
  console.log('  2. Open in VRM viewer or Blender to confirm visual quality')
  console.log('  3. Check file size reduction matches expectations')
}

manualTestCLI().catch(console.error)

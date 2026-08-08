import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import {
  MToonAtlasExporterPlugin,
  MToonAtlasLoaderPlugin,
  MToonAtlasMaterial,
} from '@webxr-jp/mtoon-atlas'
import {
  AmbientLight,
  BufferAttribute,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { optimizeModel } from '../../src/avatar-optimizer'
import { VRMExporterPlugin } from '../../src/exporter/VRMExporterPlugin'

/**
 * COLOR_0頂点カラーを持つVRMのラウンドトリップ回帰テスト
 *
 * ジオメトリにCOLOR_0(VEC4)を持つVRMを最適化・エクスポートすると、
 * 再読込時にGLTFLoaderが `vertexColors = true` を設定し、VEC4のため
 * three.jsが `USE_COLOR_ALPHA` を注入して `vColor` がvec4になる。
 * MToonAtlasMaterialに `IGNORE_VERTEX_COLOR` defineが無いと
 * mtoon.fragの `diffuseColor.rgb *= vColor` / `material.shadeColor.rgb *= vColor`
 * が vec3 *= vec4 のGLSLコンパイルエラーとなり、メッシュが一切
 * 描画されない（アバターが不可視になる）。
 *
 * VRoid/UniVRM系の書き出しは通常COLOR_0を含まないが、Blender等の
 * 汎用DCCツール経由のVRMは頂点カラーを保持していることがある。
 * COLOR_0はglTF 2.0の正規属性であり、上流three-vrmのMToonMaterialは
 * `ignoreVertexColor = true` を既定にしてこのケースを吸収している。
 */
describe('VertexColor Roundtrip', () => {
  const VRM_FILE_PATH = '/AliciaSolid.vrm'
  const RENDER_SIZE = 256

  let reloadedVRM: VRM

  async function loadVRM(
    buffer: ArrayBuffer,
  ): Promise<{ gltf: GLTF; vrm: VRM }> {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    loader.register((parser) => new MToonAtlasLoaderPlugin(parser))

    const gltf = await loader.parseAsync(buffer, '')
    const vrm = gltf.userData.vrm as VRM

    return { gltf, vrm }
  }

  async function exportVRM(vrm: VRM): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter()
    exporter.register((writer) => {
      const plugin = new VRMExporterPlugin(writer)
      plugin.setVRM(vrm)
      return plugin
    })
    exporter.register((writer) => new MToonAtlasExporterPlugin(writer))

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const exportScene = new Scene()
      const children = [...vrm.scene.children].filter(
        (child) =>
          child.name !== 'VRMHumanoidRig' &&
          !child.name.startsWith('VRMExpression'),
      )
      children.forEach((child) => exportScene.add(child))

      exporter.parse(
        exportScene,
        (result) => {
          children.forEach((child) => vrm.scene.add(child))
          if (result instanceof ArrayBuffer) {
            resolve(result)
          } else {
            reject(new Error('Expected ArrayBuffer output'))
          }
        },
        (error) => {
          children.forEach((child) => vrm.scene.add(child))
          reject(error)
        },
        { binary: true },
      )
    })
  }

  /**
   * 全メッシュにCOLOR_0(VEC4, 全成分1.0)を注入する
   * 全て1.0=純白なので、頂点カラーが正しく無視されても乗算されても
   * 見た目は変わらない（コンパイル可否だけが差になる）
   */
  function injectVertexColors(vrm: VRM): number {
    let injected = 0
    vrm.scene.traverse((object) => {
      if (object instanceof Mesh) {
        const geometry = object.geometry
        const position = geometry.getAttribute('position')
        if (!position) return
        const colors = new Float32Array(position.count * 4).fill(1)
        geometry.setAttribute('color', new BufferAttribute(colors, 4))
        injected++
      }
    })
    return injected
  }

  /**
   * 実際にレンダリングして、シェーダーコンパイル診断と
   * 描画ピクセル被覆率（アバターが見えているか）を測る
   */
  function renderAndInspect(vrm: VRM): {
    brokenProgramCount: number
    pixelCoverage: number
  } {
    const canvas = document.createElement('canvas')
    canvas.width = RENDER_SIZE
    canvas.height = RENDER_SIZE
    const renderer = new WebGLRenderer({ canvas, alpha: true })
    renderer.setClearAlpha(0)

    const scene = new Scene()
    scene.add(new AmbientLight(0xffffff, 1))
    const light = new DirectionalLight(0xffffff, 2)
    light.position.set(1, 1, 1)
    scene.add(light)
    scene.add(vrm.scene)
    vrm.scene.traverse((object) => {
      object.frustumCulled = false
    })

    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 1, 3)
    camera.lookAt(0, 1, 0)

    const target = new WebGLRenderTarget(RENDER_SIZE, RENDER_SIZE)
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)

    const pixels = new Uint8Array(RENDER_SIZE * RENDER_SIZE * 4)
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      RENDER_SIZE,
      RENDER_SIZE,
      pixels,
    )
    let covered = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) covered++
    }

    // WebGLProgram.diagnostics はコンパイル/リンク失敗時のみ設定される
    const programs = renderer.info.programs ?? []
    const brokenProgramCount = programs.filter(
      (program) =>
        (program as unknown as { diagnostics?: unknown }).diagnostics !==
        undefined,
    ).length

    scene.remove(vrm.scene)
    target.dispose()
    renderer.dispose()

    return {
      brokenProgramCount,
      pixelCoverage: covered / (RENDER_SIZE * RENDER_SIZE),
    }
  }

  beforeAll(async () => {
    const response = await fetch(VRM_FILE_PATH)
    const originalBuffer = await response.arrayBuffer()
    const { vrm } = await loadVRM(originalBuffer)

    const injected = injectVertexColors(vrm)
    expect(injected).toBeGreaterThan(0)

    const optimizeResult = await optimizeModel(vrm)
    expect(optimizeResult.isOk()).toBe(true)

    const exportedBuffer = await exportVRM(vrm)
    const { vrm: reloaded } = await loadVRM(exportedBuffer)
    reloadedVRM = reloaded
  })

  it('should keep COLOR_0 through the roundtrip (test premise)', () => {
    // COLOR_0がエクスポートで消えるとこのテストはトリガーを失う。
    // その場合はここが落ちて、テストの前提が壊れたことを知らせる
    let found = 0
    reloadedVRM.scene.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        const color = object.geometry.getAttribute('color')
        if (color && color.itemSize === 4) found++
      }
    })
    expect(found).toBeGreaterThan(0)
  })

  it('should compile all shader programs after reload', () => {
    const { brokenProgramCount } = renderAndInspect(reloadedVRM)
    expect(brokenProgramCount).toBe(0)
  })

  it('should actually draw the avatar (not invisible)', () => {
    const { pixelCoverage } = renderAndInspect(reloadedVRM)
    // シェーダーが壊れているとメッシュが1ピクセルも描かれず0になる
    expect(pixelCoverage).toBeGreaterThan(0.01)
  })

  it('should define IGNORE_VERTEX_COLOR on reloaded atlas materials', () => {
    const materials: MToonAtlasMaterial[] = []
    reloadedVRM.scene.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        const meshMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of meshMaterials) {
          if (material && 'isMToonAtlasMaterial' in material) {
            materials.push(material as MToonAtlasMaterial)
          }
        }
      }
    })
    expect(materials.length).toBeGreaterThan(0)
    for (const material of materials) {
      expect(material.defines).toHaveProperty('IGNORE_VERTEX_COLOR')
    }
  })
})

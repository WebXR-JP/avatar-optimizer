/**
 * ブラウザテスト共通の VRM ラウンドトリップヘルパー
 *
 * 読み込み・エクスポートの手順（プラグインの登録順、エクスポート対象から
 * VRMHumanoidRig / VRMExpression を外して終了後に戻す扱い）は
 * ラウンドトリップ系テストで共通なので、ここに集約する。
 */
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'
import {
  MToonAtlasExporterPlugin,
  MToonAtlasLoaderPlugin,
} from '@webxr-jp/mtoon-atlas'
import { Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMExporterPlugin } from '../../../src/exporter/VRMExporterPlugin'

/**
 * GLB バイナリから VRM を読み込む
 *
 * @param buffer - GLB バイナリ
 * @returns 読み込んだ gltf と VRM
 */
export async function loadVRMFromBuffer(
  buffer: ArrayBuffer,
): Promise<{ gltf: GLTF; vrm: VRM }> {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  loader.register((parser) => new MToonAtlasLoaderPlugin(parser))

  const gltf = await loader.parseAsync(buffer, '')
  const vrm = gltf.userData.vrm as VRM

  return { gltf, vrm }
}

/**
 * VRM を GLB としてエクスポートする
 *
 * VRMHumanoidRig と VRMExpression* はエクスポート対象から外し、
 * 成否によらず元の vrm.scene に戻す。
 *
 * @param vrm - エクスポートする VRM
 * @returns GLB バイナリ
 */
export async function exportVRMToBuffer(vrm: VRM): Promise<ArrayBuffer> {
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

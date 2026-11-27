import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { describe, expect, it } from 'vitest'
import { MToonAtlasExporterPlugin } from '../src/extensions/MToonAtlasExporterPlugin'

interface ExportedGLTF {
  meshes: Array<{
    primitives: Array<{
      targets?: Array<{ POSITION?: number }>
    }>
  }>
  accessors: Array<{
    bufferView: number
    byteOffset?: number
    count: number
  }>
  bufferViews: Array<{
    buffer: number
    byteOffset?: number
    byteLength: number
  }>
  buffers: Array<{ uri: string }>
}

function decodeBuffer(uri: string): ArrayBuffer {
  const base64 = uri.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function readAccessorFloat32(gltf: ExportedGLTF, accessorIndex: number): Float32Array {
  const acc = gltf.accessors[accessorIndex]
  const bv = gltf.bufferViews[acc.bufferView]
  const buffer = decodeBuffer(gltf.buffers[bv.buffer].uri)
  const offset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  return new Float32Array(buffer, offset, acc.count * 3)
}

async function exportWithMToonAtlas(root: Group): Promise<ExportedGLTF> {
  const exporter = new GLTFExporter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GLTFWriter type difference across three versions
  exporter.register((writer) => new MToonAtlasExporterPlugin(writer as any))

  return new Promise<ExportedGLTF>((resolve, reject) => {
    exporter.parse(
      root,
      (result) => resolve(result as unknown as ExportedGLTF),
      (err) => reject(err),
      { binary: false },
    )
  })
}

describe('MToonAtlasExporterPlugin morph attribute sharing', () => {
  it('先頭・中間・末尾がすべて 0 で途中の別頂点のみ異なるモーフターゲット同士を誤って共有しない', async () => {
    const vertexCount = 100
    const basePos = new Float32Array(vertexCount * 3)
    const normal = new Float32Array(vertexCount * 3)
    for (let i = 0; i < vertexCount; i++) {
      basePos[i * 3] = i * 0.01
      normal[i * 3 + 2] = 1
    }

    // 頂点 20 だけ非ゼロ（先頭 16 要素・中間 16 要素・末尾 16 要素はすべて 0）
    const morphA = new Float32Array(vertexCount * 3)
    morphA[20 * 3] = 0.25

    // 頂点 75 だけ非ゼロ（同様に先頭・中間・末尾はすべて 0）
    const morphB = new Float32Array(vertexCount * 3)
    morphB[75 * 3 + 1] = -0.5

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(basePos, 3))
    geo.setAttribute('normal', new BufferAttribute(normal, 3))
    geo.morphAttributes.position = [
      new BufferAttribute(morphA, 3),
      new BufferAttribute(morphB, 3),
    ]
    geo.morphTargetsRelative = true

    const mesh = new Mesh(geo, new MeshStandardMaterial())
    mesh.updateMorphTargets()

    const root = new Group()
    root.add(mesh)

    const gltf = await exportWithMToonAtlas(root)
    const targets = gltf.meshes[0].primitives[0].targets!
    expect(targets).toHaveLength(2)

    const accA = targets[0].POSITION!
    const accB = targets[1].POSITION!
    expect(accA).not.toBe(accB)

    const outA = readAccessorFloat32(gltf, accA)
    const outB = readAccessorFloat32(gltf, accB)
    expect(outA[20 * 3]).toBeCloseTo(0.25, 6)
    expect(outA[75 * 3 + 1]).toBe(0)
    expect(outB[20 * 3]).toBe(0)
    expect(outB[75 * 3 + 1]).toBeCloseTo(-0.5, 6)
  })

  it('全バイトが完全に一致する別 BufferAttribute インスタンスは同一アクセサを共有して重複排除する', async () => {
    const vertexCount = 40
    const makeMesh = (offsetX: number) => {
      const pos = new Float32Array(vertexCount * 3)
      const norm = new Float32Array(vertexCount * 3)
      for (let i = 0; i < vertexCount; i++) {
        pos[i * 3] = offsetX + i * 0.01
        norm[i * 3 + 2] = 1
      }
      const morph = new Float32Array(vertexCount * 3)
      morph[18 * 3 + 2] = 0.125

      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(pos, 3))
      geo.setAttribute('normal', new BufferAttribute(norm, 3))
      geo.morphAttributes.position = [new BufferAttribute(morph, 3)]
      geo.morphTargetsRelative = true

      const mesh = new Mesh(geo, new MeshStandardMaterial())
      mesh.updateMorphTargets()
      return mesh
    }

    const root = new Group()
    root.add(makeMesh(0), makeMesh(1))

    const gltf = await exportWithMToonAtlas(root)
    const acc0 = gltf.meshes[0].primitives[0].targets![0].POSITION!
    const acc1 = gltf.meshes[1].primitives[0].targets![0].POSITION!
    expect(acc0).toBe(acc1)
  })
})

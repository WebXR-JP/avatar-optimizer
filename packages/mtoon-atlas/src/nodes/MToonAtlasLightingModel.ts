/**
 * MToonAtlasNodeMaterial 用のライティングモデル（TSL）
 *
 * GLSL 版（shaders/mtoon.frag の RE_Direct_MToon / RE_IndirectDiffuse_MToon）と
 * 同じ計算を行う。three-vrm の MToonLightingModel とは次の点で異なる。
 *
 * - 影はライト色ではなくシェーディング係数に掛ける。影の中は黒ではなく
 *   shadeColor になる（WebGL 版 MToon と同じ見た目）
 * - リムの乗算値は rimLightingMix を使わず、常に「直接光 + 環境光」を使う
 *   （WebGL 版 MToon の `mix( vec3( 1.0 ), directSpecular, 1.0 )` に合わせる）
 *
 * マテリアル側で計算した値は、setupVariants で下記の PropertyNode に代入され、
 * このモデルから参照される。
 */

import {
  BRDF_Lambert,
  diffuseColor,
  float,
  mix,
  normalView,
  property,
} from 'three/tsl'
import { LightingModel } from 'three/webgpu'
import type { Node, NodeBuilder } from 'three/webgpu'
import type { LightingModelDirectInput } from 'three/src/nodes/core/LightingModel.js'

/**
 * LightingModel に渡される反射光の出力先
 *
 * @types/three では型パラメータなしの Node として宣言されており、
 * そのままでは addAssign / mul などの演算メソッドが型の上で使えない。
 * three 側の実体は vec3 なので、型だけ付け直して扱う。
 */
interface ReflectedLight
{
  directDiffuse: Node<'vec3'>
  directSpecular: Node<'vec3'>
  indirectDiffuse: Node<'vec3'>
  indirectSpecular: Node<'vec3'>
}

/** 影色（shadeColorFactor × shadeMultiplyTexture） */
export const shadeColor = property('vec3').toVar('MToonAtlasShadeColor')
/** シェーディングシフト（shadingShiftFactor + shadingShiftTexture × scale） */
export const shadingShift = property('float').toVar('MToonAtlasShadingShift')
/** トゥーン度（shadingToonyFactor） */
export const shadingToony = property('float').toVar('MToonAtlasShadingToony')
/** リム（パラメトリックリム + matcap）× rimMultiplyTexture */
export const rim = property('vec3').toVar('MToonAtlasRim')

/**
 * three のライトノードのうち、影の分離に使うプロパティ
 *
 * AnalyticLightNode.setupShadow は影ありの色で colorNode を置き換え、
 * 元の色を baseColorNode に退避する。
 */
interface ShadowedLightNode
{
  light?: { isDirectionalLight?: boolean }
  shadowNode?: Node | null
  baseColorNode?: Node | null
}

/**
 * 影を除いたライト色と影の係数を求める
 *
 * 平行光源は lightColor = baseColorNode × shadowNode なので分離できる。
 * 点光源・スポットライトは減衰も掛かった値しか渡されないため分離せず、
 * three 既定の「ライト色に影を掛ける」挙動のままにする。
 */
function splitShadow(lightColor: Node, lightNode: Node): { color: Node<'vec3'>, shadow: Node<'float'> }
{
  const node = lightNode as unknown as ShadowedLightNode
  if (node.light?.isDirectionalLight && node.shadowNode && node.baseColorNode)
  {
    return { color: node.baseColorNode as Node<'vec3'>, shadow: node.shadowNode as Node<'float'> }
  }
  return { color: lightColor as Node<'vec3'>, shadow: float(1) }
}

/**
 * Lambert BRDF（diffuseColor / PI）
 *
 * @types/three の BRDF_Lambert は戻り値が型パラメータなしの OperatorNode のため、
 * vec3 として型を付け直す。
 */
function lambert(diffuse: Node<'vec3'>): Node<'vec3'>
{
  return BRDF_Lambert({ diffuseColor: diffuse }) as unknown as Node<'vec3'>
}

/**
 * MToon のトゥーンシェーディングを行うライティングモデル
 */
export class MToonAtlasLightingModel extends LightingModel
{
  direct({ lightDirection, lightColor, lightNode, reflectedLight }: LightingModelDirectInput): void
  {
    const { color, shadow } = splitShadow(lightColor, lightNode)
    const out = reflectedLight as ReflectedLight

    const dotNL = normalView.dot(lightDirection as Node<'vec3'>).clamp(-1, 1)
    // linearstep( -1 + toony, 1 - toony, dotNL + shift ) × shadow
    const a = float(-1).add(shadingToony)
    const b = float(1).sub(shadingToony)
    const shading = dotNL.add(shadingShift).sub(a).div(b.sub(a)).clamp().mul(shadow)

    const feathered = mix(shadeColor, diffuseColor.rgb, shading)
    out.directDiffuse.addAssign(color.mul(lambert(feathered)))

    // directSpecular はリムに使う（GLSL 版では Σライト色 / PI を rim に掛ける）
    out.directSpecular.addAssign(color.mul(lambert(rim)))
  }

  indirect(builder: NodeBuilder): void
  {
    const context = (builder as unknown as { context: { irradiance: Node<'vec3'>, reflectedLight: ReflectedLight } }).context
    const { irradiance, reflectedLight } = context

    // 環境光は shadeColor を使わず diffuseColor のみ
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(lambert(diffuseColor.rgb)))
    reflectedLight.indirectSpecular.addAssign(irradiance.mul(lambert(rim)))
  }
}

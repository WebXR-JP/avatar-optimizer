/**
 * MToon インスタンシング マテリアル エントリーポイント。
 *
 * このパッケージは、MToonNodeMaterial のパブリック API をミラーリングしながら、
 * パック済みのマテリアルごとのデータをサンプリングするために必要なフックを
 * 公開する専門的なマテリアルを提供することに焦点を当てています。
 * テクスチャアトラス生成およびインスタンス化されたメッシュ準備は
 * @xrift/avatar-optimizer で処理されます。
 */

import {
  MToonNodeMaterial,
  type MToonNodeMaterialParameters,
} from '@pixiv/three-vrm-materials-mtoon/nodes'
import {
  attribute,
  float,
  texture,
  vec2,
  type ShaderNodeObject,
} from 'three/tsl'
import type { NodeBuilder } from 'three/webgpu'
import type {
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonInstancingOptions,
  ParameterSemantic,
  ParameterSemanticId,
  ParameterTextureDescriptor,
} from './types'
import {
  DEFAULT_PARAMETER_LAYOUT,
  DEFAULT_PARAMETER_TEXELS_PER_SLOT,
} from './types'

const DEFAULT_SLOT_ATTRIBUTE: MaterialSlotAttributeConfig = Object.freeze({
  name: 'mtoonMaterialSlot',
  description: 'パック済みマテリアルスロットのインデックス。インスタンスごとに設定されます。',
})

type InstancingUserData = {
  parameterTexture?: ParameterTextureDescriptor['texture']
  slotCount?: number
  texelsPerSlot?: number
}

/**
 * パック済みテクスチャからマテリアルごとのデータを取得する方法を知っている
 * 専門的な MToon マテリアル。実際のサンプリング ノードは今後のステップで
 * ワイヤリングされます。詳細なシェーダー作業は現在のところ TODO として
 * 残されています。
 */
export class MToonInstancingMaterial extends MToonNodeMaterial {
  /**
   * ダウンストリームコードがマテリアルを素早く区別するためのフラグ。
   */
  public readonly isMToonInstancingMaterial = true

  #slotAttribute: MaterialSlotAttributeConfig
  #parameterTexture?: ParameterTextureDescriptor
  #slotIndexNode?: ShaderNodeObject<any>
  #slotIndexAttributeName?: string
  #parameterSemantics: readonly ParameterSemantic[] = DEFAULT_PARAMETER_LAYOUT
  #parameterValueCache = new Map<
    ParameterSemanticId,
    ShaderNodeObject<any>
  >()

  constructor(options: MToonInstancingOptions = {}) {
    const { parameterTexture, slotAttribute, ...baseParameters } = options
    super(baseParameters as MToonNodeMaterialParameters)
    this.#slotAttribute = slotAttribute ?? DEFAULT_SLOT_ATTRIBUTE
    this.#slotIndexNode = undefined
    this.#slotIndexAttributeName = undefined
    if (parameterTexture) {
      this.setParameterTexture(parameterTexture)
    }
  }

  /**
   * パラメータスロットの参照に使用される属性構成を返します。
   */
  get slotAttribute(): MaterialSlotAttributeConfig {
    return this.#slotAttribute
  }

  /**
   * スロット属性メタデータを更新します。
   */
  setSlotAttribute(attribute: MaterialSlotAttributeConfig): this {
    this.#slotAttribute = attribute
    this.#slotIndexNode = undefined
    this.#slotIndexAttributeName = undefined
    this.#parameterValueCache.clear()
    // TODO: シェーダーグラフが利用可能になったら属性メタデータを伝播させる。
    return this
  }

  /**
   * 現在使用中のパラメータテクスチャディスクリプタを返します。
   */
  get parameterTexture():
    | ParameterTextureDescriptor
    | undefined {
    return this.#parameterTexture
  }

  /**
   * パック済みマテリアル定数を含むパラメータテクスチャをバインドします。
   *
   * @remarks
   *   ディスクリプタは現在のところ userData に保存されているため、
   *   ダウンストリームツーリングからアクセスできます。
   *   実際のシェーダーノードは、パッキングレイアウトが確定した後の
   *   今後のリビジョンでディスクリプタから読み込みます。
   *
   *   atlasedTextures が指定されている場合、マテリアルのテクスチャマップが
   *   自動的に設定されます。
   */
  setParameterTexture(
    descriptor: ParameterTextureDescriptor | null,
  ): this {
    if (descriptor) {
      this.#parameterTexture = descriptor
      this.#parameterSemantics =
        descriptor.semantics ?? DEFAULT_PARAMETER_LAYOUT
      this.#parameterValueCache.clear()

      // アトラステクスチャを自動設定
      if (descriptor.atlasedTextures) {
        this.#applyAtlasedTextures(descriptor.atlasedTextures)
      }

      const userData = ensureInstancingUserData(this)
      userData.parameterTexture = descriptor.texture
      userData.slotCount = descriptor.slotCount
      userData.texelsPerSlot =
        descriptor.texelsPerSlot ?? DEFAULT_PARAMETER_TEXELS_PER_SLOT
    } else {
      this.#parameterTexture = undefined
      this.#parameterSemantics = DEFAULT_PARAMETER_LAYOUT
      this.#parameterValueCache.clear()
      this.#clearAtlasedTextures()
      const userData = ensureInstancingUserData(this)
      delete userData.parameterTexture
      delete userData.slotCount
      delete userData.texelsPerSlot
    }
    return this
  }

  /**
   * マテリアル複製時にインスタンシング固有の状態をコピーします。
   */
  override copy(source: this): this {
    super.copy(source)
    this.#slotAttribute = { ...source.slotAttribute }
    this.#slotIndexNode = undefined
    this.#slotIndexAttributeName = undefined
    this.#parameterValueCache.clear()
    if (source.parameterTexture) {
      this.setParameterTexture(source.parameterTexture)
    } else {
      this.setParameterTexture(null)
    }
    return this
  }

  override clone(): this {
    const MaterialCtor = this.constructor as {
      new (options?: MToonInstancingOptions): this
    }
    return new MaterialCtor().copy(this)
  }

  override setupVariants(): void {
    const restoreOverrides = this.#applyParameterOverrides()
    super.setupVariants()
    restoreOverrides()
  }

  override setupPosition(
    builder: NodeBuilder,
  ): ReturnType<MToonNodeMaterial['setupPosition']> {
    this.#injectMaterialSlotAttribute(builder)
    return super.setupPosition(builder)
  }

  #injectMaterialSlotAttribute(builder: NodeBuilder): void {
    const slotNode = this.#getSlotIndexNode()
    const context = (builder.context.mtoonInstancing ??= {}) as Record<
      string,
      unknown
    >
    context.slotIndexNode = slotNode
    builder.stack.addToStack(slotNode)
  }

  #getSlotIndexNode(): ShaderNodeObject<any> {
    if (
      !this.#slotIndexNode ||
      this.#slotIndexAttributeName !== this.#slotAttribute.name
    ) {
      const attributeNode = attribute(this.#slotAttribute.name, 'float')
      this.#slotIndexNode = varying(attributeNode).toVar(
        'mtoonMaterialSlotIndex',
      )
      this.#slotIndexAttributeName = this.#slotAttribute.name
    }
    return this.#slotIndexNode
  }

  #applyParameterOverrides(): () => void {
    if (!this.#parameterTexture) {
      return () => {}
    }
    const material = this as Record<string, unknown>
    const overrides: Array<[string, unknown]> = []
    const overrideNode = (
      key: string,
      semanticId: ParameterSemanticId,
    ) => {
      if (material[key] != null) {
        return
      }
      const node = this.#tryGetParameterValueNode(semanticId)
      if (!node) {
        return
      }
      overrides.push([key, material[key] ?? null])
      material[key] = node
    }

    // 基本カラー
    overrideNode('colorNode', 'baseColor')
    overrideNode('shadeColorNode', 'shadeColor')
    overrideNode('emissiveNode', 'emissiveColor')
    overrideNode('emissiveIntensityNode', 'emissiveIntensity')

    // シェーディング
    overrideNode('shadingShiftNode', 'shadingShift')
    overrideNode('shadingToonyNode', 'shadingToony')
    overrideNode('shadingShiftTextureScaleNode', 'shadingShiftTextureScale')

    // リムライティング
    overrideNode('rimLightingMixNode', 'rimLightingMix')
    overrideNode('parametricRimColorNode', 'parametricRimColor')
    overrideNode('parametricRimLiftNode', 'parametricRimLift')
    overrideNode('parametricRimFresnelPowerNode', 'parametricRimFresnelPower')

    // Matcap
    overrideNode('matcapNode', 'matcapColor')

    // アウトライン
    overrideNode('outlineWidthNode', 'outlineWidth')
    overrideNode('outlineColorNode', 'outlineColor')
    overrideNode('outlineLightingMixNode', 'outlineLightingMix')

    // UV アニメーション
    overrideNode('uvAnimationScrollXSpeedNode', 'uvAnimationScrollX')
    overrideNode('uvAnimationScrollYSpeedNode', 'uvAnimationScrollY')
    overrideNode('uvAnimationRotationSpeedNode', 'uvAnimationRotation')

    // ノーマルマップ
    overrideNode('normalScaleNode', 'normalScale')

    return () => {
      for (const [key, value] of overrides) {
        material[key] = value
      }
    }
  }

  #tryGetParameterValueNode(
    semanticId: ParameterSemanticId,
  ): ShaderNodeObject<any> | undefined {
    if (!this.#parameterTexture) {
      return undefined
    }
    const cached = this.#parameterValueCache.get(semanticId)
    if (cached) {
      return cached
    }
    const semantic = this.#parameterSemantics.find(
      (entry) => entry.id === semanticId,
    )
    if (!semantic) {
      return undefined
    }
    const node = this.#sampleParameterSemantic(semantic)
    this.#parameterValueCache.set(semanticId, node)
    return node
  }

  #sampleParameterSemantic(
    semantic: ParameterSemantic,
  ): ShaderNodeObject<any> {
    if (!this.#parameterTexture) {
      throw new Error('Parameter texture not bound')
    }

    const texelsPerSlot =
      this.#parameterTexture.texelsPerSlot ?? DEFAULT_PARAMETER_TEXELS_PER_SLOT
    const slotCount = this.#parameterTexture.slotCount
    const clampedTexel = Math.min(
      semantic.texel,
      Math.max(texelsPerSlot - 1, 0),
    )
    const column = float((clampedTexel + 0.5) / texelsPerSlot)
    const slotIndex = this.#getSlotIndexNode().floor()
    const row = slotIndex.add(float(0.5)).div(float(Math.max(slotCount, 1)))
    const uvNode = vec2(column, row)
    const sampleNode = texture(this.#parameterTexture.texture, uvNode)
    return this.#swizzleSample(sampleNode, semantic)
  }

  #swizzleSample(
    sample: ShaderNodeObject<any>,
    semantic: ParameterSemantic,
  ): ShaderNodeObject<any> {
    if (semantic.channels.length === 4) {
      return sample
    }
    const key = semantic.channels.join('')
    return (sample as Record<string, ShaderNodeObject<any>>)[key]
  }

  /**
   * アトラス化されたテクスチャをマテリアルに適用します。
   */
  #applyAtlasedTextures(textures: AtlasedTextureSet): void {
    if (textures.baseColor !== undefined) {
      this.map = textures.baseColor
    }
    if (textures.shade !== undefined) {
      this.shadeMultiplyTexture = textures.shade
    }
    if (textures.shadingShift !== undefined) {
      this.shadingShiftTexture = textures.shadingShift
    }
    if (textures.normal !== undefined) {
      this.normalMap = textures.normal
    }
    if (textures.emissive !== undefined) {
      this.emissiveMap = textures.emissive
    }
    if (textures.matcap !== undefined) {
      this.matcapTexture = textures.matcap
    }
    if (textures.rim !== undefined) {
      this.rimMultiplyTexture = textures.rim
    }
    if (textures.uvAnimationMask !== undefined) {
      this.uvAnimationMaskTexture = textures.uvAnimationMask
    }
  }

  /**
   * アトラス化されたテクスチャをクリアします。
   */
  #clearAtlasedTextures(): void {
    this.map = null
    this.shadeMultiplyTexture = null
    this.shadingShiftTexture = null
    this.normalMap = null
    this.emissiveMap = null
    this.matcapTexture = null
    this.rimMultiplyTexture = null
    this.uvAnimationMaskTexture = null
  }
}

function ensureInstancingUserData(
  material: { userData: Record<string, unknown> },
): InstancingUserData {
  material.userData.mtoonInstancing ??= {}
  return material.userData.mtoonInstancing as InstancingUserData
}

// Export types for downstream packages
export type {
  MToonInstancingOptions,
  MaterialSlotAttributeConfig,
  ParameterTextureDescriptor,
  AtlasedTextureSet,
} from './types'

/**
 * ツーリング用のパッケージバージョン。
 */
export const version = '0.1.0'

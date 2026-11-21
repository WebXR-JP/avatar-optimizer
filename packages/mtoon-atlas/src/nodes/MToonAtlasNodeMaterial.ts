/**
 * MToonAtlasNodeMaterial
 *
 * MToonAtlasMaterial（GLSL / WebGLRenderer 専用）の TSL 版。
 * WebGPURenderer（WebGPU / WebGL2 バックエンドの両方）で描画できる。
 *
 * avatar-optimizer が生成したアトラステクスチャとパラメータテクスチャを読み、
 * 頂点属性（既定 `mtoonMaterialSlot`）で指定されたスロットの MToon パラメータを
 * フラグメントごとに復元する。計算内容は GLSL 版と同じにしてある
 * （ライティングは MToonAtlasLightingModel を参照）。
 *
 * テクスチャノードはマテリアルごとに作り、同じテクスチャを複数回読む場合は
 * `texture().sample(uv)` で 1 つのバインディングを共有する。
 * （materialReference を UV コンテキストだけ変えて複数回使うと、TSL が
 * 最初のサンプリング結果を使い回してしまい、パラメータが全てテクセル 0 になる）
 * テクスチャをノードに直接持たせるため、マテリアル間でシェーダーを共有しない
 * よう customProgramCacheKey にマテリアル ID を含めている。
 */

import {
  attribute,
  cameraProjectionMatrix,
  cos,
  float,
  int,
  length,
  materialNormal,
  mix,
  modelNormalMatrix,
  modelViewMatrix,
  normalLocal,
  normalMap,
  normalView,
  positionLocal,
  positionViewDirection,
  sin,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { BackSide, FrontSide, NodeMaterial, Vector2 } from 'three/webgpu'
import type { Node, NodeBuilder, NodeMaterialParameters, Texture, TextureNode } from 'three/webgpu'
import type {
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  OutlineWidthMode,
  ParameterTextureDescriptor,
} from '../types'
import {
  MToonAtlasLightingModel,
  rim,
  shadeColor,
  shadingShift,
  shadingToony,
} from './MToonAtlasLightingModel'

/**
 * MToonAtlasNodeMaterial のコンストラクタオプション
 */
export interface MToonAtlasNodeOptions extends NodeMaterialParameters
{
  /** パラメータテクスチャディスクリプタ（アトラステクスチャを含む） */
  parameterTexture?: ParameterTextureDescriptor

  /** スロット属性設定 */
  slotAttribute?: MaterialSlotAttributeConfig
}

const DEFAULT_SLOT_ATTRIBUTE_NAME = 'mtoonMaterialSlot'

/** サンプリング対象になるテクスチャプロパティ */
type TextureProperty =
  | 'parameterTextureMap'
  | 'map'
  | 'normalMap'
  | 'emissiveMap'
  | 'shadeMultiplyTexture'
  | 'shadingShiftTexture'
  | 'matcapTexture'
  | 'rimMultiplyTexture'
  | 'uvAnimationMaskTexture'

/**
 * MToon のパラメータテクスチャとアトラスを使う統合マテリアル（TSL 版）
 */
export class MToonAtlasNodeMaterial extends NodeMaterial
{
  /** マテリアル識別フラグ（GLSL 版と共通。エクスポーターが参照する） */
  readonly isMToonAtlasMaterial = true as const

  /** TSL 版であることを示すフラグ */
  readonly isMToonAtlasNodeMaterial = true as const

  // ---- シェーダーから参照されるテクスチャ・パラメータ ----
  // 自前のプロパティは three がキャッシュキーに含めるため、
  // テクスチャの有無が変わるとシェーダーが作り直される

  /** パラメータテクスチャ（スロット × テクセル） */
  parameterTextureMap: Texture | null = null
  /** パラメータテクスチャの大きさ（x = テクセル数/スロット、y = スロット数） */
  parameterTextureSize = new Vector2(1, 1)
  /** ベースカラーアトラス */
  map: Texture | null = null
  /** ノーマルマップアトラス */
  normalMap: Texture | null = null
  /** エミッシブアトラス */
  emissiveMap: Texture | null = null
  /** 影色乗算アトラス */
  shadeMultiplyTexture: Texture | null = null
  /** シェーディングシフトアトラス */
  shadingShiftTexture: Texture | null = null
  /** matcap テクスチャ */
  matcapTexture: Texture | null = null
  /** リム乗算アトラス */
  rimMultiplyTexture: Texture | null = null
  /** UV アニメーションマスクアトラス */
  uvAnimationMaskTexture: Texture | null = null

  /**
   * エミッシブを差し替えるノード（NodeMaterial.setupLighting が参照する）。
   * 通常は null のままで、パラメータテクスチャから求めた値が使われる
   */
  emissiveNode: Node | null = null

  private _parameterTexture: ParameterTextureDescriptor | undefined
  private _slotAttribute: MaterialSlotAttributeConfig = { name: DEFAULT_SLOT_ATTRIBUTE_NAME }
  private _isOutline = false
  private _outlineWidthMode: OutlineWidthMode = 'none'

  // シェーダー構築中に使うテクスチャノード（構築ごとに作り直す）
  private _textureNodes = new Map<TextureProperty, TextureNode>()
  private _parameterTextureSizeNode: Node<'vec2'> | null = null

  /**
   * コンストラクタ
   *
   * @param parameters - オプション
   */
  constructor(parameters: MToonAtlasNodeOptions = {})
  {
    super()
    this.lights = true

    const { parameterTexture, slotAttribute, ...rest } = parameters
    this.setValues(rest)

    if (parameterTexture)
    {
      this.setParameterTexture(parameterTexture)
    }
    if (slotAttribute)
    {
      this.setSlotAttribute(slotAttribute)
    }
  }

  /**
   * パラメータテクスチャを設定する
   *
   * atlasedTextures を含む場合は各アトラステクスチャも設定する。
   *
   * @param descriptor - パラメータテクスチャディスクリプタ。null で解除
   * @returns this
   */
  setParameterTexture(descriptor: ParameterTextureDescriptor | null): this
  {
    this._parameterTexture = descriptor ?? undefined

    if (descriptor)
    {
      this.parameterTextureMap = descriptor.texture
      this.parameterTextureSize.set(descriptor.texelsPerSlot, descriptor.slotCount)
      if (descriptor.atlasedTextures)
      {
        this._setAtlasedTextures(descriptor.atlasedTextures)
      }
    }
    else
    {
      this.parameterTextureMap = null
      this.parameterTextureSize.set(1, 1)
    }

    this.needsUpdate = true
    return this
  }

  /**
   * スロット属性を設定する
   *
   * @param config - スロット属性設定
   * @returns this
   */
  setSlotAttribute(config: MaterialSlotAttributeConfig): this
  {
    if (config.name !== this._slotAttribute.name)
    {
      this.needsUpdate = true
    }
    this._slotAttribute = { ...config }
    return this
  }

  /** パラメータテクスチャディスクリプタ */
  get parameterTexture(): ParameterTextureDescriptor | undefined
  {
    return this._parameterTexture
  }

  /** スロット属性設定 */
  get slotAttribute(): MaterialSlotAttributeConfig
  {
    return this._slotAttribute
  }

  /** アウトライン用マテリアルかどうか。true にすると裏面を描画する */
  get isOutline(): boolean
  {
    return this._isOutline
  }

  set isOutline(value: boolean)
  {
    if (this._isOutline === value) return
    this._isOutline = value
    this.side = value ? BackSide : FrontSide
    this.needsUpdate = true
  }

  /** アウトライン幅の計算方式 */
  get outlineWidthMode(): OutlineWidthMode
  {
    return this._outlineWidthMode
  }

  set outlineWidthMode(value: OutlineWidthMode)
  {
    if (this._outlineWidthMode === value) return
    this._outlineWidthMode = value
    this.needsUpdate = true
  }

  /**
   * このマテリアルを元にアウトライン用マテリアルを作る
   *
   * @param widthMode - アウトライン幅の計算方式
   * @returns アウトライン用マテリアル
   */
  createOutlineMaterial(widthMode: Exclude<OutlineWidthMode, 'none'> = 'worldCoordinates'): MToonAtlasNodeMaterial
  {
    const outline = this.clone()
    outline.outlineWidthMode = widthMode
    outline.isOutline = true
    outline.polygonOffset = true
    outline.polygonOffsetFactor = 1
    outline.polygonOffsetUnits = 1
    return outline
  }

  /**
   * UV アニメーションの更新（GLSL 版と同じく現状は何もしない）
   *
   * パラメータテクスチャのオフセット値をそのまま使うため、時間経過による
   * 更新は行わない。three-vrm の VRM.update() から呼ばれる。
   */
  update(_deltaTime: number): void
  {
    // 意図的に何もしない
  }

  customProgramCacheKey(): string
  {
    // is〜 で始まるプロパティと _ で始まるプロパティは three のキャッシュキーに
    // 含まれないため、シェーダー構成に影響するものをここで加える
    // テクスチャをノードに直接持たせているため、マテリアル ID も含めて
    // 別マテリアルとシェーダー（バインディング）を共有しないようにする
    return (
      super.customProgramCacheKey() +
      `mtoonAtlas:${this.uuid},${this._isOutline},${this._outlineWidthMode},${this._slotAttribute.name},`
    )
  }

  copy(source: MToonAtlasNodeMaterial): this
  {
    super.copy(source)

    this.parameterTextureMap = source.parameterTextureMap
    this.parameterTextureSize.copy(source.parameterTextureSize)
    this.map = source.map
    this.normalMap = source.normalMap
    this.emissiveMap = source.emissiveMap
    this.shadeMultiplyTexture = source.shadeMultiplyTexture
    this.shadingShiftTexture = source.shadingShiftTexture
    this.matcapTexture = source.matcapTexture
    this.rimMultiplyTexture = source.rimMultiplyTexture
    this.uvAnimationMaskTexture = source.uvAnimationMaskTexture

    this._parameterTexture = source._parameterTexture ? { ...source._parameterTexture } : undefined
    this._slotAttribute = { ...source._slotAttribute }
    this._isOutline = source._isOutline
    this._outlineWidthMode = source._outlineWidthMode

    return this
  }

  // ---- ノード構築 ----

  setup(builder: NodeBuilder): void
  {
    this._textureNodes = new Map()
    this._parameterTextureSizeNode = uniform(this.parameterTextureSize)
    super.setup(builder)
  }

  /**
   * テクスチャプロパティを指定 UV でサンプリングする
   *
   * 同じテクスチャは 1 つの TextureNode を元に sample() するので、
   * 何回読んでもバインディングは 1 つで済む。
   *
   * @param property - 読むテクスチャのプロパティ名（null でないこと）
   * @param uvNode - サンプリングする UV
   */
  private _sample(property: TextureProperty, uvNode: Node<'vec2'>): Node<'vec4'>
  {
    let base = this._textureNodes.get(property)
    if (!base)
    {
      base = texture(this[property] as Texture)
      this._textureNodes.set(property, base)
    }
    return base.sample(uvNode)
  }

  /** 現在のフラグメント / 頂点のスロット番号 */
  private _slot(): Node<'float'>
  {
    return attribute(this._slotAttribute.name, 'float')
  }

  /**
   * パラメータテクスチャの 1 テクセルを読む
   *
   * GLSL 版の sampleParameter と同じく、テクセル中心の UV で読む。
   * float テクスチャ（NearestFilter）は three が textureLoad に変換する。
   *
   * @param texel - スロット内のテクセル番号
   */
  private _param(texel: number): Node<'vec4'>
  {
    const size = this._parameterTextureSizeNode ?? uniform(this.parameterTextureSize)
    const texelUV = vec2(float(texel).add(0.5), this._slot().add(0.5)).div(size)
    return this._sample('parameterTextureMap', texelUV)
  }

  /**
   * UV アニメーション（回転 → スクロール）を適用した UV
   *
   * GLSL 版と同じく、マスクは B チャンネル、回転は (0.5, 0.5) 中心。
   */
  private _animatedUV(): Node<'vec2'>
  {
    const p6 = this._param(6)
    const p7 = this._param(7)
    const mask = this.uvAnimationMaskTexture
      ? this._sample('uvAnimationMaskTexture', uv()).b
      : float(1)

    const phase = p6.a.mul(mask)
    const c = cos(phase)
    const s = sin(phase)
    const centered = uv().sub(0.5)
    // mat2( c, -s, s, c ) * centered（GLSL は列優先）
    const rotated = vec2(
      c.mul(centered.x).add(s.mul(centered.y)),
      s.negate().mul(centered.x).add(c.mul(centered.y)),
    ).add(0.5)
    return rotated.add(vec2(p7.b, p7.a).mul(mask))
  }

  setupLightingModel(): MToonAtlasLightingModel
  {
    return new MToonAtlasLightingModel()
  }

  setupDiffuseColor(builder: NodeBuilder): void
  {
    const p0 = this._param(0)
    let color: Node<'vec4'> = vec4(p0.rgb, 1)
    if (this.map)
    {
      color = color.mul(this._sample('map', this._animatedUV()))
    }

    const prevColor = this.colorNode
    const prevOpacity = this.opacityNode
    this.colorNode = color
    this.opacityNode = p0.a
    super.setupDiffuseColor(builder)
    this.colorNode = prevColor
    this.opacityNode = prevOpacity
  }

  setupVariants(): void
  {
    const animatedUV = this._animatedUV()

    // 影色
    let shade: Node<'vec3'> = this._param(1).rgb
    if (this.shadeMultiplyTexture)
    {
      shade = shade.mul(this._sample('shadeMultiplyTexture', animatedUV).rgb)
    }
    shadeColor.assign(shade)

    // シェーディングシフト（0〜1 で保存されているので -1〜1 に戻す）
    let shift: Node<'float'> = this._param(8).r.mul(2).sub(1)
    if (this.shadingShiftTexture)
    {
      shift = shift.add(this._sample('shadingShiftTexture', animatedUV).r.mul(this._param(1).a))
    }
    shadingShift.assign(shift)

    shadingToony.assign(this._param(6).g)

    rim.assign(this._rimNode(animatedUV))
  }

  /**
   * パラメトリックリム + matcap に rimMultiplyTexture を掛けたもの
   *
   * @param animatedUV - UV アニメーション適用済みの UV
   */
  private _rimNode(animatedUV: Node<'vec2'>): Node<'vec3'>
  {
    const p3 = this._param(3)
    const p5 = this._param(5)
    const p6 = this._param(6)
    const viewDir = positionViewDirection

    // parametricRimColor × pow( saturate( 1 - dot( viewDir, normal ) + lift ), fresnelPower )
    let rimColor: Node<'vec3'> = p5.rgb.mul(
      float(1).sub(viewDir.dot(normalView)).add(p5.a).clamp().pow(p6.r),
    )

    if (this.matcapTexture)
    {
      // GLSL 版と同じ球面 UV
      const x = vec3(viewDir.z, 0, viewDir.x.negate()).normalize()
      const y = viewDir.cross(x)
      const sphereUV = vec2(x.dot(normalView), y.dot(normalView).negate()).mul(0.5).add(0.5)
      rimColor = rimColor.add(p3.rgb.mul(this._sample('matcapTexture', sphereUV).rgb))
    }

    if (this.rimMultiplyTexture)
    {
      rimColor = rimColor.mul(this._sample('rimMultiplyTexture', animatedUV).rgb)
    }

    return rimColor
  }

  setupNormal(): Node
  {
    let normal: Node<'vec3'> = materialNormal
    if (this.normalMap)
    {
      const normalScale = this._param(7).xy
      normal = normalMap(this._sample('normalMap', this._animatedUV()), normalScale)
    }
    if (this._isOutline)
    {
      normal = normal.negate()
    }
    return normal
  }

  setupLighting(builder: NodeBuilder): Node
  {
    const p2 = this._param(2)
    let emissive: Node<'vec3'> = p2.rgb.mul(p2.a)
    if (this.emissiveMap)
    {
      emissive = emissive.mul(this._sample('emissiveMap', this._animatedUV()).rgb)
    }

    const prevEmissive = this.emissiveNode
    this.emissiveNode = emissive
    const result = super.setupLighting(builder)
    this.emissiveNode = prevEmissive
    return result
  }

  setupPosition(builder: NodeBuilder): Node
  {
    if (!this._hasOutlineWidth())
    {
      return super.setupPosition(builder)
    }

    // GLSL 版と同じく、法線方向に outlineWidthFactor × ワールド法線長だけ押し出す
    const normalLocalNormalized = normalLocal.normalize()
    const width = this._param(3).a
    const worldNormalLength = length(modelNormalMatrix.mul(normalLocalNormalized))
    let offset: Node<'vec3'> = width.mul(worldNormalLength).mul(normalLocalNormalized)

    if (this._outlineWidthMode === 'screenCoordinates')
    {
      // 画面上で一定幅にするため、視点距離 / 投影スケールを掛ける
      // projectionMatrix[1][1]。@types/three は mat4 の element() を宣言していないため型を付け直す
      const projection = cameraProjectionMatrix as unknown as { element: (index: Node) => Node<'vec4'> }
      const clipScale = projection.element(int(1)).y
      const viewZ = modelViewMatrix.mul(vec4(positionLocal, 1)).z
      offset = offset.div(clipScale).mul(viewZ.negate())
    }

    const prevPosition = this.positionNode
    this.positionNode = ((prevPosition as Node<'vec3'> | null) ?? positionLocal).add(offset)
    const result = super.setupPosition(builder)
    this.positionNode = prevPosition
    return result
  }

  setupOutput(builder: NodeBuilder, outputNode: Node): Node
  {
    let output = outputNode
    if (this._hasOutlineWidth())
    {
      // outlineColor × mix( 1, 陰影込みの色, outlineLightingMix )
      const p4 = this._param(4)
      const color = outputNode as Node<'vec4'>
      output = vec4(p4.rgb.mul(mix(vec3(1), color.xyz, p4.a)), color.w)
    }
    return super.setupOutput(builder, output)
  }

  /** アウトラインとして押し出し・着色するかどうか */
  private _hasOutlineWidth(): boolean
  {
    return this._isOutline && this._outlineWidthMode !== 'none'
  }

  private _setAtlasedTextures(atlases: AtlasedTextureSet): void
  {
    if (atlases.baseColor) this.map = atlases.baseColor
    if (atlases.shade) this.shadeMultiplyTexture = atlases.shade
    if (atlases.shadingShift) this.shadingShiftTexture = atlases.shadingShift
    if (atlases.normal) this.normalMap = atlases.normal
    if (atlases.emissive) this.emissiveMap = atlases.emissive
    if (atlases.matcap) this.matcapTexture = atlases.matcap
    if (atlases.rim) this.rimMultiplyTexture = atlases.rim
    if (atlases.uvAnimationMask) this.uvAnimationMaskTexture = atlases.uvAnimationMask
  }
}

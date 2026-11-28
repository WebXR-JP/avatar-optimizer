/**
 * MToonAtlasNodeMaterial
 *
 * MToonAtlasMaterial（GLSL / WebGLRenderer 専用）の TSL 版。
 * WebGPURenderer（WebGPU / WebGL2 バックエンドの両方）で描画できる。
 *
 * avatar-optimizer が生成したアトラステクスチャとパック済みパラメータバッファを読み、
 * 頂点属性（既定 `mtoonMaterialSlot`）で指定されたスロットの MToon パラメータを
 * 頂点 / フラグメントごとに復元する。計算内容は GLSL 版と同じにしてある
 * （ライティングは MToonAtlasLightingModel を参照）。
 *
 * パラメータはテクスチャではなくマテリアル個別の Uniform Buffer（UBO）として
 * バケット化（8 / 16 / 32 / 64 / 112 スロット）して保持し、
 * `materialReference('parameterBufferData', 'vec4')` で参照する。
 * アトラステクスチャも同様に `materialReference` 経由で参照するため、
 * 同じバケットサイズ・構成のマテリアル間でシェーダーキャッシュを共有できる。
 */

import {
  attribute,
  cameraProjectionMatrix,
  cos,
  float,
  int,
  length,
  materialNormal,
  materialOpacity,
  materialReference,
  mix,
  modelNormalMatrix,
  modelViewMatrix,
  normalLocal,
  normalMap,
  normalView,
  positionLocal,
  positionViewDirection,
  sin,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { BackSide, FrontSide, NodeMaterial } from 'three/webgpu'
import type { Node, NodeBuilder, NodeMaterialParameters, Texture } from 'three/webgpu'
import {
  createPaddedParameterBuffer,
  DEFAULT_TEXELS_PER_SLOT,
  extractParameterBufferFromTexture,
  PARAMETER_UBO_BUCKET_SLOTS,
} from '../parameter-buffer'
import type {
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  OutlineWidthMode,
  ParameterBufferDescriptor,
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
  /**
   * パック済みパラメータバッファディスクリプタ（推奨）
   * DataTexture を介さず直接 UBO として消費する
   */
  parameterBuffer?: ParameterBufferDescriptor

  /**
   * パラメータテクスチャディスクリプタ（後方互換用）
   * 渡された場合は内部で Float32Array を抽出して UBO に載せる。
   * `parameterBuffer` と両方指定された場合は `parameterBuffer` を優先する
   */
  parameterTexture?: ParameterTextureDescriptor

  /** スロット属性設定 */
  slotAttribute?: MaterialSlotAttributeConfig
}

const DEFAULT_SLOT_ATTRIBUTE_NAME = 'mtoonMaterialSlot'
const MIN_BUCKET_SLOTS = PARAMETER_UBO_BUCKET_SLOTS[0]

/** サンプリング対象になるアトラステクスチャプロパティ */
type AtlasTextureProperty =
  | 'map'
  | 'normalMap'
  | 'emissiveMap'
  | 'shadeMultiplyTexture'
  | 'shadingShiftTexture'
  | 'matcapTexture'
  | 'rimMultiplyTexture'
  | 'uvAnimationMaskTexture'

/**
 * `@types/three` の ReferenceNode には `element()` の型宣言が欠けているため、
 * UBO 配列アクセスに使う最小限のインターフェースを補う
 */
interface ParameterBufferRefNode
{
  count: number | null
  element(indexNode: Node): Node<'vec4'>
}

/**
 * アトラステクスチャの共有 materialReference（シェーダーキャッシュ共有用）
 *
 * 各アトラステクスチャは 1 シェーダー内で 1 種類の UV でのみ参照するため、
 * three-vrm の MToonNodeMaterial と同じく `.context({ getUV })` で安全に共有できる。
 */
const _atlasTextureRefs: Record<AtlasTextureProperty, Node<'vec4'>> = {
  map: materialReference('map', 'texture') as unknown as Node<'vec4'>,
  normalMap: materialReference('normalMap', 'texture') as unknown as Node<'vec4'>,
  emissiveMap: materialReference('emissiveMap', 'texture') as unknown as Node<'vec4'>,
  shadeMultiplyTexture: materialReference('shadeMultiplyTexture', 'texture') as unknown as Node<'vec4'>,
  shadingShiftTexture: materialReference('shadingShiftTexture', 'texture') as unknown as Node<'vec4'>,
  matcapTexture: materialReference('matcapTexture', 'texture') as unknown as Node<'vec4'>,
  rimMultiplyTexture: materialReference('rimMultiplyTexture', 'texture') as unknown as Node<'vec4'>,
  uvAnimationMaskTexture: materialReference('uvAnimationMaskTexture', 'texture') as unknown as Node<'vec4'>,
}

/**
 * vec4 配列長（= bucketSlots × texelsPerSlot）ごとの共有 UBO materialReference
 *
 * ReferenceNode は `count` を設定すると内部で `buffer(null, 'vec4', count)` を
 * 生成し、`NodeUpdateType.OBJECT` で描画中のマテリアルの `parameterBufferData` に
 * 自動追従する。
 */
const _parameterBufferRefs = new Map<number, ParameterBufferRefNode>()

function getParameterBufferRef(vec4Count: number): ParameterBufferRefNode
{
  let ref = _parameterBufferRefs.get(vec4Count)
  if (!ref)
  {
    const node = materialReference('parameterBufferData', 'vec4') as unknown as ParameterBufferRefNode
    node.count = vec4Count
    ref = node
    _parameterBufferRefs.set(vec4Count, ref)
  }
  return ref
}

/**
 * MToon のパラメータ UBO とアトラステクスチャを使う統合マテリアル（TSL 版）
 */
export class MToonAtlasNodeMaterial extends NodeMaterial
{
  /**
   * avatar-optimizer や MToonAtlasLoaderPlugin に対し、
   * DataTexture ではなく生 Float32Array（parameterBuffer）の直接受け渡しを要求するフラグ
   */
  static readonly prefersParameterBuffer = true as const

  /** マテリアル識別フラグ（GLSL 版と共通。エクスポーターが参照する） */
  readonly isMToonAtlasMaterial = true as const

  /** TSL 版であることを示すフラグ */
  readonly isMToonAtlasNodeMaterial = true as const

  // ---- シェーダーから materialReference 経由で参照されるプロパティ ----
  // 自前のプロパティは three がキャッシュキーに含めるため、
  // テクスチャの有無・サンプラーが変わると自動でシェーダーが切り替わる

  /** UBO 転送用のパディング済みパラメータ配列（bucketSlots × texelsPerSlot × 4） */
  parameterBufferData: Float32Array = new Float32Array(
    MIN_BUCKET_SLOTS * DEFAULT_TEXELS_PER_SLOT * 4,
  )
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
   * 通常は null のままで、パラメータバッファから求めた値が使われる
   */
  emissiveNode: Node | null = null

  private _parameterBuffer: ParameterBufferDescriptor | undefined
  private _parameterTexture: ParameterTextureDescriptor | undefined
  private _parameterBucketSlots: number = MIN_BUCKET_SLOTS
  private _texelsPerSlot: number = DEFAULT_TEXELS_PER_SLOT
  private _slotAttribute: MaterialSlotAttributeConfig = { name: DEFAULT_SLOT_ATTRIBUTE_NAME }
  private _isOutline = false
  private _outlineWidthMode: OutlineWidthMode = 'none'

  // シェーダー構築中に共有するアニメーション適用済み UV ノード（setup ごとに作り直す）
  private _animatedUVNode: Node<'vec2'> | null = null

  /**
   * コンストラクタ
   *
   * @param parameters - オプション
   */
  constructor(parameters: MToonAtlasNodeOptions = {})
  {
    super()
    this.lights = true

    const { parameterBuffer, parameterTexture, slotAttribute, ...rest } = parameters
    this.setValues(rest)

    if (parameterBuffer)
    {
      this.setParameterBuffer(parameterBuffer)
    }
    else if (parameterTexture)
    {
      this.setParameterTexture(parameterTexture)
    }
    if (slotAttribute)
    {
      this.setSlotAttribute(slotAttribute)
    }
  }

  /**
   * パラメータバッファを設定する（推奨 API）
   *
   * スロット数が UBO 上限（WebGL2 最小 16KB 基準で既定 112 スロット）を
   * 超える場合は RangeError を投げる。
   * atlasedTextures を含む場合は各アトラステクスチャも設定する。
   *
   * @param descriptor - パラメータバッファディスクリプタ。null で解除
   * @returns this
   */
  setParameterBuffer(descriptor: ParameterBufferDescriptor | null): this
  {
    if (descriptor)
    {
      const { buffer, bucketSlots } = createPaddedParameterBuffer(
        descriptor.data,
        descriptor.slotCount,
        descriptor.texelsPerSlot,
      )
      const prevBucketSlots = this._parameterBucketSlots
      const prevTexelsPerSlot = this._texelsPerSlot

      this._parameterBuffer = descriptor
      this._parameterTexture = undefined
      this._parameterBucketSlots = bucketSlots
      this._texelsPerSlot = descriptor.texelsPerSlot
      this.parameterBufferData = buffer

      if (descriptor.atlasedTextures)
      {
        const prevMask = this._atlasTexturePresenceMask()
        this._setAtlasedTextures(descriptor.atlasedTextures)
        if (this._atlasTexturePresenceMask() !== prevMask)
        {
          this.needsUpdate = true
        }
      }

      if (prevBucketSlots !== bucketSlots || prevTexelsPerSlot !== descriptor.texelsPerSlot)
      {
        this.needsUpdate = true
      }
    }
    else
    {
      this._parameterBuffer = undefined
      this._parameterTexture = undefined
      this._parameterBucketSlots = MIN_BUCKET_SLOTS
      this._texelsPerSlot = DEFAULT_TEXELS_PER_SLOT
      this.parameterBufferData = new Float32Array(
        MIN_BUCKET_SLOTS * DEFAULT_TEXELS_PER_SLOT * 4,
      )
      this.needsUpdate = true
    }

    return this
  }

  /**
   * パラメータテクスチャを設定する（後方互換 API）
   *
   * 受け取った DataTexture から生 Float32Array を抽出して UBO に載せる。
   * 描画時にパラメータテクスチャはサンプリングしない。
   *
   * @param descriptor - パラメータテクスチャディスクリプタ。null で解除
   * @returns this
   */
  setParameterTexture(descriptor: ParameterTextureDescriptor | null): this
  {
    if (!descriptor)
    {
      return this.setParameterBuffer(null)
    }

    const bufferDescriptor = extractParameterBufferFromTexture(descriptor)
    this.setParameterBuffer(bufferDescriptor)
    this._parameterTexture = descriptor
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

  /** パラメータバッファディスクリプタ */
  get parameterBuffer(): ParameterBufferDescriptor | undefined
  {
    return this._parameterBuffer
  }

  /** パラメータテクスチャディスクリプタ（後方互換。setParameterTexture 経由時のみ設定される） */
  get parameterTexture(): ParameterTextureDescriptor | undefined
  {
    return this._parameterTexture
  }

  /** 現在の UBO バケットのスロット数（8 / 16 / 32 / 64 / 112） */
  get parameterBucketSlots(): number
  {
    return this._parameterBucketSlots
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
   * パラメータバッファのオフセット値をそのまま使うため、時間経過による
   * 更新は行わない。three-vrm の VRM.update() から呼ばれる。
   */
  update(_deltaTime: number): void
  {
    // 意図的に何もしない
  }

  customProgramCacheKey(): string
  {
    // is〜 で始まるプロパティと _ で始まるプロパティは three のキャッシュキーに
    // 含まれないため、シェーダー構成に影響するものをここで加える。
    // UBO 配列長（バケットサイズ × texelsPerSlot）が一致し、テクスチャ有無や
    // アウトライン設定も同じマテリアル同士はシェーダーキャッシュを共有する。
    return (
      super.customProgramCacheKey() +
      `mtoonAtlas:${this._parameterBucketSlots},${this._texelsPerSlot},${this._isOutline},${this._outlineWidthMode},${this._slotAttribute.name},`
    )
  }

  copy(source: MToonAtlasNodeMaterial): this
  {
    super.copy(source)

    this.parameterBufferData = source.parameterBufferData.slice()
    this.map = source.map
    this.normalMap = source.normalMap
    this.emissiveMap = source.emissiveMap
    this.shadeMultiplyTexture = source.shadeMultiplyTexture
    this.shadingShiftTexture = source.shadingShiftTexture
    this.matcapTexture = source.matcapTexture
    this.rimMultiplyTexture = source.rimMultiplyTexture
    this.uvAnimationMaskTexture = source.uvAnimationMaskTexture

    this._parameterBuffer = source._parameterBuffer ? { ...source._parameterBuffer } : undefined
    this._parameterTexture = source._parameterTexture ? { ...source._parameterTexture } : undefined
    this._parameterBucketSlots = source._parameterBucketSlots
    this._texelsPerSlot = source._texelsPerSlot
    this._slotAttribute = { ...source._slotAttribute }
    this._isOutline = source._isOutline
    this._outlineWidthMode = source._outlineWidthMode

    return this
  }

  // ---- ノード構築 ----

  setup(builder: NodeBuilder): void
  {
    this._animatedUVNode = null
    super.setup(builder)
  }

  /**
   * アトラステクスチャを指定 UV でサンプリングする
   *
   * モジュール共有の materialReference を使うことで、マテリアルごとに
   * シェーダーを再コンパイルせずバインディングだけを切り替えられる。
   *
   * @param property - 読むテクスチャのプロパティ名（null でないこと）
   * @param uvNode - サンプリングする UV
   */
  private _sampleAtlas(property: AtlasTextureProperty, uvNode: Node<'vec2'>): Node<'vec4'>
  {
    return _atlasTextureRefs[property].context({ getUV: () => uvNode })
  }

  /** 現在のフラグメント / 頂点のスロット番号（補間誤差を避けるため四捨五入し範囲内に丸める） */
  private _slotIndex(): Node<'int'>
  {
    const slotAttr = attribute(this._slotAttribute.name, 'float')
    return int(slotAttr.add(0.5).clamp(0, this._parameterBucketSlots - 1))
  }

  /**
   * パラメータ UBO の 1 vec4 を読む
   *
   * @param texel - スロット内の vec4 インデックス（0〜8）
   */
  private _param(texel: number): Node<'vec4'>
  {
    const vec4Count = this._parameterBucketSlots * this._texelsPerSlot
    const index = this._slotIndex().mul(int(this._texelsPerSlot)).add(int(texel))
    return getParameterBufferRef(vec4Count).element(index)
  }

  /**
   * UV アニメーション（回転 → スクロール）を適用した UV（フラグメント内で 1 回計算して共有）
   *
   * GLSL 版と同じく、マスクは B チャンネル、回転は (0.5, 0.5) 中心。
   */
  private _getAnimatedUV(): Node<'vec2'>
  {
    if (!this._animatedUVNode)
    {
      const p6 = this._param(6)
      const p7 = this._param(7)
      const mask = this.uvAnimationMaskTexture
        ? this._sampleAtlas('uvAnimationMaskTexture', uv()).b
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
      this._animatedUVNode = rotated.add(vec2(p7.b, p7.a).mul(mask)).toVar('MToonAtlasAnimatedUV')
    }
    return this._animatedUVNode
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
      color = color.mul(this._sampleAtlas('map', this._getAnimatedUV()))
    }

    const prevColor = this.colorNode
    const prevOpacity = this.opacityNode
    this.colorNode = color
    // opacityNode を置くと NodeMaterial は material.opacity を掛けなくなるので自分で掛ける
    // （スロットのアルファ × material.opacity。ゴーストなど外から薄くするときに効かせる）
    this.opacityNode = p0.a.mul(materialOpacity)
    super.setupDiffuseColor(builder)
    this.colorNode = prevColor
    this.opacityNode = prevOpacity
  }

  setupVariants(): void
  {
    // 影色
    let shade: Node<'vec3'> = this._param(1).rgb
    if (this.shadeMultiplyTexture)
    {
      shade = shade.mul(this._sampleAtlas('shadeMultiplyTexture', this._getAnimatedUV()).rgb)
    }
    shadeColor.assign(shade)

    // シェーディングシフト（0〜1 で保存されているので -1〜1 に戻す）
    let shift: Node<'float'> = this._param(8).r.mul(2).sub(1)
    if (this.shadingShiftTexture)
    {
      shift = shift.add(this._sampleAtlas('shadingShiftTexture', this._getAnimatedUV()).r.mul(this._param(1).a))
    }
    shadingShift.assign(shift)

    shadingToony.assign(this._param(6).g)

    rim.assign(this._rimNode())
  }

  /**
   * パラメトリックリム + matcap に rimMultiplyTexture を掛けたもの
   */
  private _rimNode(): Node<'vec3'>
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
      rimColor = rimColor.add(p3.rgb.mul(this._sampleAtlas('matcapTexture', sphereUV).rgb))
    }

    if (this.rimMultiplyTexture)
    {
      rimColor = rimColor.mul(this._sampleAtlas('rimMultiplyTexture', this._getAnimatedUV()).rgb)
    }

    return rimColor
  }

  setupNormal(): Node
  {
    let normal: Node<'vec3'> = materialNormal
    if (this.normalMap)
    {
      const normalScale = this._param(7).xy
      normal = normalMap(this._sampleAtlas('normalMap', this._getAnimatedUV()), normalScale)
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
      emissive = emissive.mul(this._sampleAtlas('emissiveMap', this._getAnimatedUV()).rgb)
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

  private _atlasTexturePresenceMask(): number
  {
    return (
      (this.map ? 1 : 0) |
      (this.shadeMultiplyTexture ? 2 : 0) |
      (this.shadingShiftTexture ? 4 : 0) |
      (this.normalMap ? 8 : 0) |
      (this.emissiveMap ? 16 : 0) |
      (this.matcapTexture ? 32 : 0) |
      (this.rimMultiplyTexture ? 64 : 0) |
      (this.uvAnimationMaskTexture ? 128 : 0)
    )
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

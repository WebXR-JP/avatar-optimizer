/**
 * MToonAtlasMaterial
 *
 * avatar-optimizer で生成されたアトラス化テクスチャとパラメータテクスチャを使用して、
 * 複数の MToon マテリアルを 1 つに統合するマテリアルクラス。
 *
 * ShaderMaterial を継承し、パラメータテクスチャからマテリアルパラメータを復元します。
 */

import * as THREE from 'three'
import vertexShader from './shaders/mtoon.vert?raw'
import fragmentShader from './shaders/mtoon.frag?raw'
import type {
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonAtlasOptions,
} from './types'

/**
 * デバッグモードの種類
 *
 * - 'none': デバッグなし（通常描画）
 * - 'uv': UV座標を可視化（RG = UV）
 * - 'normal': ワールド法線を可視化
 * - 'shadow': シャドウ座標を可視化（シャドウマップが無効なら黄色）
 * - 'shadowValue': 実際のシャドウ値を可視化（白=影なし、黒=影あり）
 * - 'receiveShadow': receiveShadowフラグの確認（緑=有効、赤=無効）
 * - 'lightDir': ライト方向を可視化
 * - 'dotNL': 法線とライト方向の内積を可視化
 * - 'shading': MToonシェーディング結果を可視化
 * - 'shadingParams': shadingShift/shadingToonyの値を可視化
 * - 'litShadeRate': 明暗のグラデーションを可視化
 */
export type DebugMode =
  | 'none'
  | 'uv'
  | 'normal'
  | 'shadow'
  | 'shadowValue'
  | 'receiveShadow'
  | 'lightDir'
  | 'dotNL'
  | 'shading'
  | 'shadingParams'
  | 'paramRaw'
  | 'litShadeRate'

/**
 * MToonAtlasMaterial
 *
 * パラメータテクスチャベースの統合 MToon マテリアル
 */
export class MToonAtlasMaterial extends THREE.ShaderMaterial
{
  /**
   * マテリアル識別フラグ
   */
  readonly isMToonAtlasMaterial = true as const

  /**
   * パラメータテクスチャディスクリプタ
   *
   * @internal
   */
  private _parameterTexture: ParameterTextureDescriptor | undefined

  /**
   * スロット属性設定
   *
   * @internal
   */
  private _slotAttribute: MaterialSlotAttributeConfig = {
    name: 'mtoonMaterialSlot',
  }

  /**
   * 現在のデバッグモード
   *
   * @internal
   */
  private _debugMode: DebugMode = 'none'

  /**
   * Uniform インターフェース
   *
   * TODO: 完全な型定義を追加
   */
  declare public uniforms: {
    // Three.js 標準 Uniform (UniformsLib から継承)
    [key: string]: THREE.IUniform<any>
  } & {
    // パラメータテクスチャ関連
    uParameterTexture: THREE.IUniform<THREE.Texture | null>
    uParameterTextureSize: THREE.IUniform<THREE.Vector2>
    uTexelsPerSlot: THREE.IUniform<number>

    // アトラステクスチャ
    map: THREE.IUniform<THREE.Texture | null>
    shadeMultiplyTexture: THREE.IUniform<THREE.Texture | null>
    shadingShiftTexture: THREE.IUniform<THREE.Texture | null>
    normalMap: THREE.IUniform<THREE.Texture | null>
    emissiveMap: THREE.IUniform<THREE.Texture | null>
    matcapTexture: THREE.IUniform<THREE.Texture | null>
    rimMultiplyTexture: THREE.IUniform<THREE.Texture | null>
    uvAnimationMaskTexture: THREE.IUniform<THREE.Texture | null>
  }

  /**
   * コンストラクタ
   *
   * @param parameters オプション
   */
  constructor(parameters?: MToonAtlasOptions)
  {
    super({
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      alphaTest: 0,
      fog: true,
      lights: true,
      clipping: true,
      defines: {
        THREE_VRM_THREE_REVISION: parseInt(THREE.REVISION).toString(),
      },
    })

    // Uniform 初期化
    // Three.js 標準 Uniform とマージ
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.lights,
      {
        // パラメータテクスチャ関連
        uParameterTexture: { value: null },
        uParameterTextureSize: { value: new THREE.Vector2(1, 1) },
        uTexelsPerSlot: { value: 8 },

        // アトラステクスチャ
        map: { value: null },
        shadeMultiplyTexture: { value: null },
        shadingShiftTexture: { value: null },
        normalMap: { value: null },
        emissiveMap: { value: null },
        matcapTexture: { value: null },
        rimMultiplyTexture: { value: null },
        uvAnimationMaskTexture: { value: null },

        // MToon パラメータ
        litFactor: { value: new THREE.Color(1, 1, 1) },
        opacity: { value: 1.0 },
        shadeColorFactor: { value: new THREE.Color(0.97, 0.97, 0.97) },
        shadingShiftFactor: { value: 0.0 },
        shadingToonyFactor: { value: 0.9 },
        giEqualizationFactor: { value: 0.9 },
        parametricRimColorFactor: { value: new THREE.Color(0, 0, 0) },
        rimLightingMixFactor: { value: 0.0 },
        parametricRimFresnelPowerFactor: { value: 5.0 },
        parametricRimLiftFactor: { value: 0.0 },
        matcapFactor: { value: new THREE.Color(1, 1, 1) },
        emissive: { value: new THREE.Color(0, 0, 0) },
        emissiveIntensity: { value: 0.0 },
        outlineColorFactor: { value: new THREE.Color(0, 0, 0) },
        outlineLightingMixFactor: { value: 1.0 },
        uvAnimationScrollXOffset: { value: 0.0 },
        uvAnimationScrollYOffset: { value: 0.0 },
        uvAnimationRotationPhase: { value: 0.0 },

        // UV Transform 行列
        mapUvTransform: { value: new THREE.Matrix3() },
        shadeMultiplyTextureUvTransform: { value: new THREE.Matrix3() },
        shadingShiftTextureUvTransform: { value: new THREE.Matrix3() },
        emissiveMapUvTransform: { value: new THREE.Matrix3() },
        matcapTextureUvTransform: { value: new THREE.Matrix3() },
        rimMultiplyTextureUvTransform: { value: new THREE.Matrix3() },
        uvAnimationMaskTextureUvTransform: { value: new THREE.Matrix3() },
        normalMapUvTransform: { value: new THREE.Matrix3() },
      },
    ]) as typeof this.uniforms

    // パラメータ適用
    if (parameters)
    {
      // Uniform を設定
      if (parameters.color !== undefined)
      {
        this.uniforms.litFactor.value.set(parameters.color)
      }
      if (parameters.emissive !== undefined)
      {
        this.uniforms.emissive.value.set(parameters.emissive)
      }
      if (parameters.emissiveIntensity !== undefined)
      {
        this.uniforms.emissiveIntensity.value = parameters.emissiveIntensity
      }
    }

    // パラメータテクスチャ設定
    if (parameters?.parameterTexture)
    {
      this.setParameterTexture(parameters.parameterTexture)
    }

    // スロット属性設定
    if (parameters?.slotAttribute)
    {
      this.setSlotAttribute(parameters.slotAttribute)
    }
  }

  /**
   * パラメータテクスチャを設定
   *
   * @param descriptor パラメータテクスチャディスクリプタ
   * @returns this（チェーン可能）
   */
  setParameterTexture(descriptor: ParameterTextureDescriptor | null): this
  {
    this._parameterTexture = descriptor ?? undefined

    if (descriptor)
    {
      // パラメータテクスチャをセット
      this.uniforms.uParameterTexture.value = descriptor.texture
      // シェーダーでは x = texelIndex, y = slotIndex として使用するため
      // x = texelsPerSlot (テクスチャ幅), y = slotCount (テクスチャ高さ)
      this.uniforms.uParameterTextureSize.value.set(
        descriptor.texelsPerSlot,
        descriptor.slotCount,
      )
      this.uniforms.uTexelsPerSlot.value = descriptor.texelsPerSlot

      // atlasedTextures がある場合、自動的にテクスチャをマッピング
      if (descriptor.atlasedTextures)
      {
        this._setAtlasedTextures(descriptor.atlasedTextures)
      }
    } else
    {
      // パラメータテクスチャをクリア
      this.uniforms.uParameterTexture.value = null
      this.uniforms.uParameterTextureSize.value.set(1, 1)
      this.uniforms.uTexelsPerSlot.value = 8
    }

    this._updateDefines()

    return this
  }

  /**
   * Definesを更新
   */
  private _updateDefines(): void
  {
    if (!this.defines) return

    const uniforms = this.uniforms

    const setDefine = (name: string, condition: boolean) =>
    {
      if (condition)
      {
        this.defines![name] = ''
      } else
      {
        delete this.defines![name]
      }
    }

    setDefine('USE_MAP', !!uniforms.map.value)
    setDefine('USE_SHADEMULTIPLYTEXTURE', !!uniforms.shadeMultiplyTexture.value)
    setDefine('USE_SHADINGSHIFTTEXTURE', !!uniforms.shadingShiftTexture.value)
    setDefine('USE_NORMALMAP', !!uniforms.normalMap.value)
    setDefine('USE_EMISSIVEMAP', !!uniforms.emissiveMap.value)
    setDefine('USE_MATCAPTEXTURE', !!uniforms.matcapTexture.value)
    setDefine('USE_RIMMULTIPLYTEXTURE', !!uniforms.rimMultiplyTexture.value)
    setDefine('USE_UVANIMATIONMASKTEXTURE', !!uniforms.uvAnimationMaskTexture.value)

    // UVを使用するかどうか
    // テクスチャを使用する場合、またはUVアニメーションが有効な場合に有効化
    const useUv =
      !!uniforms.map.value ||
      !!uniforms.shadeMultiplyTexture.value ||
      !!uniforms.shadingShiftTexture.value ||
      !!uniforms.normalMap.value ||
      !!uniforms.emissiveMap.value ||
      !!uniforms.matcapTexture.value ||
      !!uniforms.rimMultiplyTexture.value ||
      !!uniforms.uvAnimationMaskTexture.value ||
      this.uniforms.uvAnimationScrollXOffset.value !== 0.0 ||
      this.uniforms.uvAnimationScrollYOffset.value !== 0.0 ||
      this.uniforms.uvAnimationRotationPhase.value !== 0.0

    setDefine('MTOON_USE_UV', useUv)

    this.needsUpdate = true
  }

  /**
   * スロット属性を設定
   *
   * シェーダー内の属性名を動的に変更します。
   * GLTFLoaderはカスタム属性名を小文字に変換するため、
   * ローダーで設定された属性名に合わせてシェーダーを更新します。
   *
   * @param config スロット属性設定
   * @returns this（チェーン可能）
   */
  setSlotAttribute(config: MaterialSlotAttributeConfig): this
  {
    const oldName = this._slotAttribute.name
    this._slotAttribute = config

    // シェーダー内の属性名を更新
    // デフォルト属性名 'mtoonMaterialSlot' を新しい名前に置換
    if (config.name !== oldName)
    {
      this.vertexShader = this.vertexShader.replace(
        /attribute float \w+;\s*\/\/ SLOT_ATTRIBUTE/g,
        `attribute float ${config.name}; // SLOT_ATTRIBUTE`
      )
      this.vertexShader = this.vertexShader.replace(
        /vMaterialSlot = \w+;/g,
        `vMaterialSlot = ${config.name};`
      )
      this.needsUpdate = true
    }

    return this
  }

  /**
   * パラメータテクスチャを取得
   *
   * @returns パラメータテクスチャディスクリプタ
   */
  get parameterTexture(): ParameterTextureDescriptor | undefined
  {
    return this._parameterTexture
  }

  /**
   * スロット属性を取得
   *
   * @returns スロット属性設定
   */
  get slotAttribute(): MaterialSlotAttributeConfig
  {
    return this._slotAttribute
  }

  /**
   * アトラス化テクスチャを設定
   *
   * @param atlases アトラス化テクスチャセット
   * @internal
   */
  private _setAtlasedTextures(atlases: AtlasedTextureSet): void
  {
    // 各テクスチャを uniforms に設定
    if (atlases.baseColor)
    {
      this.uniforms.map.value = atlases.baseColor
    }
    if (atlases.shade)
    {
      this.uniforms.shadeMultiplyTexture.value = atlases.shade
    }
    if (atlases.shadingShift)
    {
      this.uniforms.shadingShiftTexture.value = atlases.shadingShift
    }
    if (atlases.normal)
    {
      this.uniforms.normalMap.value = atlases.normal
    }
    if (atlases.emissive)
    {
      this.uniforms.emissiveMap.value = atlases.emissive
    }
    if (atlases.matcap)
    {
      this.uniforms.matcapTexture.value = atlases.matcap
    }
    if (atlases.rim)
    {
      this.uniforms.rimMultiplyTexture.value = atlases.rim
    }
    if (atlases.uvAnimationMask)
    {
      this.uniforms.uvAnimationMaskTexture.value = atlases.uvAnimationMask
    }
  }

  /**
   * マテリアルをコピー
   *
   * @param source ソースマテリアル
   * @returns this
   */
  copy(source: this): this
  {
    super.copy(source)

    // パラメータテクスチャのコピー
    if (source._parameterTexture)
    {
      this._parameterTexture = { ...source._parameterTexture }
      this.setParameterTexture(this._parameterTexture)
    }

    // スロット属性のコピー
    this._slotAttribute = { ...source._slotAttribute }

    return this
  }

  /**
   * マテリアルをクローン
   *
   * @returns クローンされたマテリアル
   */
  clone(): this
  {
    const cloned = new MToonAtlasMaterial() as this

    // 親クラスのコピー（uniforms を含む）
    cloned.copy(this)

    return cloned
  }

  /**
   * フレーム更新（アニメーション対応）
   *
   * UV アニメーションやその他の時間依存パラメータを更新
   *
   * @param deltaTime フレーム経過時間（秒）
   */
  update(_deltaTime: number): void
  {
    // UV アニメーション更新
    if (this.uniforms.uvAnimationScrollXOffset && this.uniforms.uvAnimationScrollYOffset && this.uniforms.uvAnimationRotationPhase)
    {
      // パラメータテクスチャから UV アニメーション値を取得して、オフセットを加算
      const paramTexture = this._parameterTexture
      if (paramTexture)
      {
        // TODO: パラメータテクスチャからサンプリングした値でアニメーション計算
        // 現在は単純な時間ベースの更新のみ
        // フレームレート非依存にするため、_deltaTime を使用
        // 実装例: scrollX += uvAnimationScrollX * _deltaTime
      }
    }
  }

  /**
   * デバッグモードを設定
   *
   * シャドウの問題を調査するために、様々なパラメータを可視化できます。
   *
   * @param mode デバッグモード
   * @returns this（チェーン可能）
   *
   * @example
   * ```typescript
   * // シャドウ値を可視化（白=影なし、黒=影あり）
   * material.setDebugMode('shadowValue')
   *
   * // 通常描画に戻す
   * material.setDebugMode('none')
   * ```
   */
  setDebugMode(mode: DebugMode): this
  {
    this._debugMode = mode

    if (!this.defines) return this

    // すべてのデバッグdefineをクリア
    const debugDefines = [
      'DEBUG_UV',
      'DEBUG_NORMAL',
      'DEBUG_SHADOW',
      'DEBUG_SHADOW_VALUE',
      'DEBUG_RECEIVE_SHADOW',
      'DEBUG_LIGHT_DIR',
      'DEBUG_DOT_NL',
      'DEBUG_SHADING',
      'DEBUG_SHADING_PARAMS',
      'DEBUG_PARAM_RAW',
      'DEBUG_LITSHADERATE',
    ]

    for (const define of debugDefines)
    {
      delete this.defines[define]
    }

    // 選択されたモードのdefineを設定
    const modeToDefine: Record<DebugMode, string | null> = {
      'none': null,
      'uv': 'DEBUG_UV',
      'normal': 'DEBUG_NORMAL',
      'shadow': 'DEBUG_SHADOW',
      'shadowValue': 'DEBUG_SHADOW_VALUE',
      'receiveShadow': 'DEBUG_RECEIVE_SHADOW',
      'lightDir': 'DEBUG_LIGHT_DIR',
      'dotNL': 'DEBUG_DOT_NL',
      'shading': 'DEBUG_SHADING',
      'shadingParams': 'DEBUG_SHADING_PARAMS',
      'paramRaw': 'DEBUG_PARAM_RAW',
      'litShadeRate': 'DEBUG_LITSHADERATE',
    }

    const define = modeToDefine[mode]
    if (define)
    {
      this.defines[define] = ''
    }

    this.needsUpdate = true

    return this
  }

  /**
   * 現在のデバッグモードを取得
   *
   * @returns 現在のデバッグモード
   */
  get debugMode(): DebugMode
  {
    return this._debugMode
  }

  /**
   * 利用可能なデバッグモードの一覧を取得
   *
   * @returns デバッグモードの配列
   */
  static getAvailableDebugModes(): DebugMode[]
  {
    return [
      'none',
      'uv',
      'normal',
      'shadow',
      'shadowValue',
      'receiveShadow',
      'lightDir',
      'dotNL',
      'shading',
      'shadingParams',
      'paramRaw',
      'litShadeRate',
    ]
  }
}

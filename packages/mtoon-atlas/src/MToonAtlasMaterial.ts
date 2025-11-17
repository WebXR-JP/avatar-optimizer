/**
 * MToonAtlasMaterial
 *
 * avatar-optimizer で生成されたアトラス化テクスチャとパラメータテクスチャを使用して、
 * 複数の MToon マテリアルを 1 つに統合するマテリアルクラス。
 *
 * ShaderMaterial を継承し、パラメータテクスチャからマテリアルパラメータを復元します。
 */

import * as THREE from 'three'
import vertexShader from './shaders/mtoon.vert'
import fragmentShader from './shaders/mtoon.frag'
import type {
  ParameterTextureDescriptor,
  AtlasedTextureSet,
  MaterialSlotAttributeConfig,
  MToonAtlasOptions,
} from './types'

/**
 * MToonAtlasMaterial
 *
 * パラメータテクスチャベースの統合 MToon マテリアル
 */
export class MToonAtlasMaterial extends THREE.ShaderMaterial {
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
   * Uniform インターフェース
   *
   * TODO: 完全な型定義を追加
   */
  declare public uniforms: {
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

    // Three.js 標準 Uniform (UniformsLib から継承)
    [key: string]: THREE.IUniform<any>
  }

  /**
   * コンストラクタ
   *
   * @param parameters オプション
   */
  constructor(parameters?: MToonAtlasOptions) {
    super({
      vertexShader,
      fragmentShader,
      side: THREE.FrontSide,
      alphaTest: 0,
      fog: true,
      lights: true,
      clipping: true,
    })

    // TODO: Uniform 初期化
    // - Three.js 標準 Uniform とマージ
    // - パラメータテクスチャ関連 Uniform
    // - アトラステクスチャ関連 Uniform
    // - UV 変換行列

    // TODO: シェーダープログラムキャッシュキー生成
    // TODO: onBeforeCompile で shader defines を注入

    // パラメータ適用
    // TODO: ShaderMaterial のメンバーに対しパラメータを適用
    // setValues が型定義されていないため、必要に応じて個別に割り当て

    // パラメータテクスチャ設定
    if (parameters?.parameterTexture) {
      this.setParameterTexture(parameters.parameterTexture)
    }

    // スロット属性設定
    if (parameters?.slotAttribute) {
      this.setSlotAttribute(parameters.slotAttribute)
    }
  }

  /**
   * パラメータテクスチャを設定
   *
   * @param descriptor パラメータテクスチャディスクリプタ
   * @returns this（チェーン可能）
   */
  setParameterTexture(descriptor: ParameterTextureDescriptor | null): this {
    this._parameterTexture = descriptor ?? undefined

    if (descriptor) {
      // TODO: パラメータテクスチャをセット
      // - uParameterTexture に texture を設定
      // - uParameterTextureSize に (slotCount, texelsPerSlot) を設定
      // - uTexelsPerSlot に texelsPerSlot を設定

      // TODO: atlasedTextures がある場合、自動的にテクスチャをマッピング
      if (descriptor.atlasedTextures) {
        this._setAtlasedTextures(descriptor.atlasedTextures)
      }
    }

    return this
  }

  /**
   * スロット属性を設定
   *
   * @param config スロット属性設定
   * @returns this（チェーン可能）
   */
  setSlotAttribute(config: MaterialSlotAttributeConfig): this {
    this._slotAttribute = config

    // TODO: ジオメトリと連動するメタデータの更新（必要に応じて）

    return this
  }

  /**
   * パラメータテクスチャを取得
   *
   * @returns パラメータテクスチャディスクリプタ
   */
  get parameterTexture(): ParameterTextureDescriptor | undefined {
    return this._parameterTexture
  }

  /**
   * スロット属性を取得
   *
   * @returns スロット属性設定
   */
  get slotAttribute(): MaterialSlotAttributeConfig {
    return this._slotAttribute
  }

  /**
   * アトラス化テクスチャを設定
   *
   * @param atlases アトラス化テクスチャセット
   * @internal
   */
  private _setAtlasedTextures(atlases: AtlasedTextureSet): void {
    // TODO: 各テクスチャを uniforms に設定
    // - baseColor → map
    // - shade → shadeMultiplyTexture
    // - shadingShift → shadingShiftTexture
    // - normal → normalMap
    // - emissive → emissiveMap
    // - matcap → matcapTexture
    // - rim → rimMultiplyTexture
    // - uvAnimationMask → uvAnimationMaskTexture
  }

  /**
   * マテリアルをコピー
   *
   * @param source ソースマテリアル
   * @returns this
   */
  copy(source: this): this {
    super.copy(source)

    // TODO: パラメータテクスチャのコピー
    // TODO: スロット属性のコピー
    // TODO: テクスチャの再バインド（Three.js r133 対応）

    return this
  }

  /**
   * マテリアルをクローン
   *
   * @returns クローンされたマテリアル
   */
  clone(): this {
    const cloned = new MToonAtlasMaterial(this as any) as this

    // TODO: パラメータテクスチャのクローン
    // TODO: スロット属性のクローン

    return cloned
  }

  /**
   * フレーム更新（アニメーション対応）
   *
   * UV アニメーションやその他の時間依存パラメータを更新
   *
   * @param deltaTime フレーム経過時間（秒）
   */
  update(deltaTime: number): void {
    // TODO: UV アニメーション更新
    // - uvAnimationScrollXOffset
    // - uvAnimationScrollYOffset
    // - uvAnimationRotationPhase

    // TODO: テクスチャ行列の自動更新（matrixAutoUpdate 対応）
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VRM } from '@pixiv/three-vrm'
import { Bone, Object3D, Vector3 } from 'three'

export class VRMExporterPlugin {
  public readonly name = 'VRMC_vrm'
  private writer: any
  private vrm: VRM | null = null
  // 動的に作成されたtailノードを追跡（エクスポート後にクリーンアップするため）
  private createdTailNodes: Bone[] = []

  constructor(writer: any) {
    this.writer = writer
  }

  public setVRM(vrm: VRM) {
    this.vrm = vrm
  }

  public beforeParse(input: Object3D | Object3D[]) {
    const root = Array.isArray(input) ? input[0] : input
    if (!root) return

    // Find VRM instance in userData
    // This assumes the input object or its children have userData.vrm set
    // which is common when loading via VRMLoaderPlugin
    root.traverse((obj: any) => {
      if (obj.userData && obj.userData.vrm && !this.vrm) {
        this.vrm = obj.userData.vrm as VRM
      }
    })

    // SpringBone末端ジョイントに仮想tailノードを作成
    // VRM1.0仕様ではjointsの最後にtailノードが必要だが、
    // VRM0.xモデルや一部のVRM1.0モデルでは末端ボーンに子がない
    this.createVirtualTailNodes()
  }

  /**
   * SpringBone末端ジョイントに仮想tailノードを作成
   * three-vrmと同様に、ボーン方向に7cmのオフセットを持つ仮想ノードを追加
   */
  private createVirtualTailNodes(): void {
    if (!this.vrm?.springBoneManager) return

    const springBoneManager = this.vrm.springBoneManager
    const joints = springBoneManager.joints
    if (!joints || joints.size === 0) return

    // ジョイントをボーンでマッピング
    const jointsByBone = new Map<any, any>()
    joints.forEach((joint: any) => {
      jointsByBone.set(joint.bone, joint)
    })

    // 末端ジョイント（childを持たないジョイント）を見つける
    joints.forEach((joint: any) => {
      const bone = joint.bone
      if (!bone) return

      // joint.childがなく、bone.childrenにBoneがない場合は末端
      const hasJointChild = joint.child != null
      const hasBoneChild = bone.children.some(
        (child: any) => child.type === 'Bone' || child.isBone,
      )

      if (!hasJointChild && !hasBoneChild) {
        // 仮想tailノードを作成
        const tailBone = new Bone()
        tailBone.name = `${bone.name}_tail`

        // three-vrmと同様のロジック: ボーン方向に7cmオフセット
        // bone.positionを正規化して0.07を掛ける
        const direction = new Vector3().copy(bone.position)
        if (direction.lengthSq() > 0) {
          direction.normalize().multiplyScalar(0.07)
        } else {
          // positionがゼロの場合はY軸方向に7cm
          direction.set(0, 0.07, 0)
        }
        tailBone.position.copy(direction)

        // 親ボーンに追加
        bone.add(tailBone)
        tailBone.updateMatrixWorld(true)

        this.createdTailNodes.push(tailBone)
      }
    })
  }

  /**
   * エクスポート後に作成した仮想tailノードをクリーンアップ
   */
  public cleanupTailNodes(): void {
    for (const tailNode of this.createdTailNodes) {
      if (tailNode.parent) {
        tailNode.parent.remove(tailNode)
      }
    }
    this.createdTailNodes = []
  }

  public afterParse(_input: any) {
    if (!this.vrm) {
      return
    }

    // writer.jsonに直接アクセスして拡張を追加
    // afterParseの引数はinputオブジェクトのみで、JSONは含まれない
    const json = this.writer.json
    const vrm = this.vrm

    json.extensions = json.extensions || {}
    json.extensions.VRMC_vrm = {
      specVersion: '1.0',
      meta: this.exportMeta(vrm),
      humanoid: this.exportHumanoid(vrm),
      expressions: this.exportExpressions(vrm),
      lookAt: this.exportLookAt(vrm),
      firstPerson: this.exportFirstPerson(vrm),
    }

    json.extensionsUsed = json.extensionsUsed || []
    if (!json.extensionsUsed.includes('VRMC_vrm')) {
      json.extensionsUsed.push('VRMC_vrm')
    }

    // SpringBone拡張をエクスポート
    const springBoneExtension = this.exportSpringBone(vrm)
    if (springBoneExtension) {
      json.extensions.VRMC_springBone = springBoneExtension
      if (!json.extensionsUsed.includes('VRMC_springBone')) {
        json.extensionsUsed.push('VRMC_springBone')
      }
    }
  }

  private exportMeta(vrm: VRM) {
    if (!vrm.meta) return undefined

    const meta = vrm.meta as any // Cast to any to handle both VRM 0.0 and 1.0 meta types

    // Map VRM 0.0 meta to VRM 1.0 if necessary, or just use what's available
    // VRM 0.0 uses 'title', VRM 1.0 uses 'name'

    // VRM 0.0のライセンス名をVRM 1.0のライセンスURLに変換
    let licenseUrl = meta.licenseUrl
    if (!licenseUrl && meta.licenseName) {
      // VRM 0.0のライセンス名からVRM 1.0のURLへマッピング
      const licenseMapping: Record<string, string> = {
        Redistribution_Prohibited: 'https://vrm.dev/licenses/1.0/',
        CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
        CC_BY: 'https://creativecommons.org/licenses/by/4.0/',
        CC_BY_NC: 'https://creativecommons.org/licenses/by-nc/4.0/',
        CC_BY_SA: 'https://creativecommons.org/licenses/by-sa/4.0/',
        CC_BY_NC_SA: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        CC_BY_ND: 'https://creativecommons.org/licenses/by-nd/4.0/',
        CC_BY_NC_ND: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
        Other: 'https://vrm.dev/licenses/1.0/',
      }
      licenseUrl =
        licenseMapping[meta.licenseName] ?? 'https://vrm.dev/licenses/1.0/'
    }

    // licenseUrlが未定義の場合はデフォルトを設定
    if (!licenseUrl) {
      licenseUrl = 'https://vrm.dev/licenses/1.0/'
    }

    return {
      name: meta.name ?? meta.title,
      version: meta.version,
      authors: meta.authors ?? (meta.author ? [meta.author] : undefined),
      copyrightInformation: meta.copyrightInformation,
      contactInformation: meta.contactInformation,
      references:
        meta.references ?? (meta.reference ? [meta.reference] : undefined),
      thirdPartyLicenses: meta.thirdPartyLicenses,
      thumbnailImage: meta.thumbnailImage
        ? this.writer.processTexture(meta.thumbnailImage)
        : undefined,
      licenseUrl,
      avatarPermission: meta.avatarPermission ?? 'onlyAuthor',
      allowExcessivelyViolentUsage: meta.allowExcessivelyViolentUsage ?? false,
      allowExcessivelySexualUsage: meta.allowExcessivelySexualUsage ?? false,
      commercialUsage: meta.commercialUsage ?? 'personalNonProfit',
      allowPoliticalOrReligiousUsage:
        meta.allowPoliticalOrReligiousUsage ?? false,
      allowAntisocialOrHateUsage: meta.allowAntisocialOrHateUsage ?? false,
      creditNotation: meta.creditNotation ?? 'required',
      allowRedistribution: meta.allowRedistribution ?? false,
      modification: meta.modification ?? 'prohibited',
    }
  }

  private exportHumanoid(vrm: VRM) {
    if (!vrm.humanoid) return undefined

    const humanBones: any = {}

    // Iterate over all possible human bone names
    Object.entries(vrm.humanoid.humanBones).forEach(([name, bone]) => {
      if (bone && bone.node) {
        // Find the node index in the exported GLTF
        // The writer should have a map of Object3D to node index
        // However, standard GLTFExporter doesn't expose this easily in public API
        // We rely on the fact that writer.processNode returns the index,
        // but we are in afterParse, so nodes are already processed.
        // We need to find the node index.
        // A common workaround is to use the cache or map if available,
        // or re-traverse. But GLTFExporter usually attaches the index to userData during parse?
        // No, it doesn't.

        // We can use writer.nodeMap if it exists (it's a Map<Object3D, number>)
        // In Three.js GLTFExporter, it uses a Map called `nodeMap`.
        const nodeIndex = this.writer.nodeMap.get(bone.node)
        if (nodeIndex !== undefined) {
          humanBones[name] = { node: nodeIndex }
        }
      }
    })

    return {
      humanBones,
    }
  }

  private exportExpressions(vrm: VRM) {
    if (!vrm.expressionManager) return undefined

    // VRM 1.0 の preset 表情名リスト
    const presetNames = new Set([
      'happy',
      'angry',
      'sad',
      'relaxed',
      'surprised',
      'aa',
      'ih',
      'ou',
      'ee',
      'oh',
      'blink',
      'blinkLeft',
      'blinkRight',
      'lookUp',
      'lookDown',
      'lookLeft',
      'lookRight',
      'neutral',
    ])

    const preset: any = {}
    const custom: any = {}

    if (vrm.expressionManager.expressions) {
      vrm.expressionManager.expressions.forEach((expression) => {
        const expr = expression as any // Cast to access binds
        const exprDef: any = {}

        // isBinary, overrideBlink などはデフォルト値(false/none)でなければ出力
        if (expr.isBinary) exprDef.isBinary = expr.isBinary
        if (expr.overrideBlink && expr.overrideBlink !== 'none')
          exprDef.overrideBlink = expr.overrideBlink
        if (expr.overrideLookAt && expr.overrideLookAt !== 'none')
          exprDef.overrideLookAt = expr.overrideLookAt
        if (expr.overrideMouth && expr.overrideMouth !== 'none')
          exprDef.overrideMouth = expr.overrideMouth

        // three-vrm では _binds に VRMExpressionMorphTargetBind が格納されている
        const binds = expr._binds || expr.binds || []
        const morphTargetBinds = binds.filter(
          (b: any) => b.type === 'morphTarget' || b.primitives,
        )
        if (morphTargetBinds.length > 0) {
          // 各 bind の primitives すべてに対してエントリを作成
          const allBinds: any[] = []
          morphTargetBinds.forEach((bind: any) => {
            const primitives = bind.primitives || []
            primitives.forEach((mesh: any) => {
              const nodeIndex = this.writer.nodeMap.get(mesh)
              if (nodeIndex !== undefined) {
                allBinds.push({
                  node: nodeIndex,
                  index: bind.index,
                  weight: bind.weight,
                })
              }
            })
          })

          if (allBinds.length > 0) {
            exprDef.morphTargetBinds = allBinds
          }
        }

        if (expr.materialColorBinds && expr.materialColorBinds.length > 0) {
          exprDef.materialColorBinds = expr.materialColorBinds.map(
            (bind: any) => {
              const materialIndex = this.writer.processMaterial(bind.material)
              return {
                material: materialIndex,
                type: bind.type,
                targetValue: bind.targetValue.toArray(),
              }
            },
          )
        }

        if (
          expr.textureTransformBinds &&
          expr.textureTransformBinds.length > 0
        ) {
          exprDef.textureTransformBinds = expr.textureTransformBinds.map(
            (bind: any) => {
              const materialIndex = this.writer.processMaterial(bind.material)
              return {
                material: materialIndex,
                scale: bind.scale.toArray(),
                offset: bind.offset.toArray(),
              }
            },
          )
        }

        // preset か custom かを判定して振り分け
        const name = expr.expressionName
        if (presetNames.has(name)) {
          preset[name] = exprDef
        } else {
          custom[name] = exprDef
        }
      })
    }

    const result: any = { preset }
    if (Object.keys(custom).length > 0) {
      result.custom = custom
    }
    return result
  }

  private exportLookAt(vrm: VRM) {
    if (!vrm.lookAt) return undefined

    const lookAt = vrm.lookAt as any

    // rangeMapが存在しない場合はデフォルト値を使用
    const defaultRangeMap = { inputMaxValue: 90, outputScale: 10 }

    return {
      offsetFromHeadBone: lookAt.offsetFromHeadBone?.toArray?.() ?? [0, 0, 0],
      type: lookAt.applier?.type ?? 'bone', // 'bone' or 'expression'
      rangeMapHorizontalInner: lookAt.rangeMapHorizontalInner
        ? {
            inputMaxValue: lookAt.rangeMapHorizontalInner.inputMaxValue,
            outputScale: lookAt.rangeMapHorizontalInner.outputScale,
          }
        : defaultRangeMap,
      rangeMapHorizontalOuter: lookAt.rangeMapHorizontalOuter
        ? {
            inputMaxValue: lookAt.rangeMapHorizontalOuter.inputMaxValue,
            outputScale: lookAt.rangeMapHorizontalOuter.outputScale,
          }
        : defaultRangeMap,
      rangeMapVerticalDown: lookAt.rangeMapVerticalDown
        ? {
            inputMaxValue: lookAt.rangeMapVerticalDown.inputMaxValue,
            outputScale: lookAt.rangeMapVerticalDown.outputScale,
          }
        : defaultRangeMap,
      rangeMapVerticalUp: lookAt.rangeMapVerticalUp
        ? {
            inputMaxValue: lookAt.rangeMapVerticalUp.inputMaxValue,
            outputScale: lookAt.rangeMapVerticalUp.outputScale,
          }
        : defaultRangeMap,
    }
  }

  private exportFirstPerson(vrm: VRM) {
    if (!vrm.firstPerson) return undefined

    const meshAnnotations: any[] = []
    if (vrm.firstPerson.meshAnnotations) {
      vrm.firstPerson.meshAnnotations.forEach((annotation) => {
        const ann = annotation as any
        // In three-vrm, annotation might hold 'mesh' (Object3D) instead of 'node' index
        // If it holds 'mesh', we need to find its node index.
        // If it holds 'node' (from raw GLTF), it might be an index or object.
        // Usually in loaded VRM, it holds the Mesh object.
        const mesh = ann.mesh || ann.node
        const nodeIndex = this.writer.nodeMap.get(mesh)
        if (nodeIndex !== undefined) {
          meshAnnotations.push({
            node: nodeIndex,
            type: ann.type,
          })
        }
      })
    }

    return {
      meshAnnotations,
    }
  }

  /**
   * VRMC_springBone 拡張をエクスポート
   * three-vrm の VRMSpringBoneManager から SpringBone データを抽出
   */
  private exportSpringBone(vrm: VRM) {
    const springBoneManager = vrm.springBoneManager
    if (!springBoneManager) return undefined

    const joints = springBoneManager.joints
    if (!joints || joints.size === 0) return undefined

    // コライダーをインデックス化
    const colliders = springBoneManager.colliders
    const colliderIndexMap = new Map<any, number>()
    const colliderDefs: any[] = []

    colliders.forEach((collider: any) => {
      const nodeIndex = this.writer.nodeMap.get(collider)
      if (nodeIndex === undefined) return

      const shape = collider.shape
      let shapeDef: any

      if (shape.type === 'sphere') {
        shapeDef = {
          sphere: {
            offset: shape.offset
              ? [shape.offset.x, shape.offset.y, shape.offset.z]
              : [0, 0, 0],
            radius: shape.radius ?? 0,
          },
        }
      } else if (shape.type === 'capsule') {
        shapeDef = {
          capsule: {
            offset: shape.offset
              ? [shape.offset.x, shape.offset.y, shape.offset.z]
              : [0, 0, 0],
            radius: shape.radius ?? 0,
            tail: shape.tail
              ? [shape.tail.x, shape.tail.y, shape.tail.z]
              : [0, 0, 0],
          },
        }
      } else {
        // plane などその他のシェイプはスキップ
        return
      }

      const colliderIndex = colliderDefs.length
      colliderIndexMap.set(collider, colliderIndex)
      colliderDefs.push({
        node: nodeIndex,
        shape: shapeDef,
      })
    })

    // コライダーグループをインデックス化
    const colliderGroups = springBoneManager.colliderGroups
    const colliderGroupIndexMap = new Map<any, number>()
    const colliderGroupDefs: any[] = []

    colliderGroups.forEach((group: any) => {
      const colliderIndices: number[] = []
      group.colliders.forEach((collider: any) => {
        const index = colliderIndexMap.get(collider)
        if (index !== undefined) {
          colliderIndices.push(index)
        }
      })

      if (colliderIndices.length > 0) {
        const groupIndex = colliderGroupDefs.length
        colliderGroupIndexMap.set(group, groupIndex)
        colliderGroupDefs.push({
          name: group.name,
          colliders: colliderIndices,
        })
      }
    })

    // ジョイントをスプリングにグループ化
    // three-vrm では各ジョイントが独立しているが、
    // VRMC_springBone 仕様ではジョイントチェーンとして表現する
    // ボーンの親子関係からチェーンを再構築する
    const springDefs: any[] = []
    const processedJoints = new Set<any>()

    // ジョイントをボーンノードでグループ化
    const jointsByBone = new Map<any, any>()
    joints.forEach((joint: any) => {
      jointsByBone.set(joint.bone, joint)
    })

    // ルートジョイント（親がジョイントでないもの）を見つけてチェーンを構築
    joints.forEach((joint: any) => {
      if (processedJoints.has(joint)) return

      // このジョイントがチェーンのルートかどうかを確認
      const parentBone = joint.bone.parent
      if (parentBone && jointsByBone.has(parentBone)) {
        // 親もジョイントなのでルートではない
        return
      }

      // チェーンを構築
      const chainJoints: any[] = []
      let currentJoint = joint

      while (currentJoint && !processedJoints.has(currentJoint)) {
        processedJoints.add(currentJoint)
        chainJoints.push(currentJoint)

        // 子ボーンを持つジョイントを探す
        const childBone = currentJoint.child
        currentJoint = childBone ? jointsByBone.get(childBone) : null
      }

      if (chainJoints.length === 0) return

      // ジョイント定義を作成
      const jointDefs: any[] = []

      for (let i = 0; i < chainJoints.length; i++) {
        const j = chainJoints[i]
        const nodeIndex = this.writer.nodeMap.get(j.bone)
        if (nodeIndex === undefined) continue

        jointDefs.push({
          node: nodeIndex,
          hitRadius: j.settings.hitRadius,
          stiffness: j.settings.stiffness,
          gravityPower: j.settings.gravityPower,
          gravityDir: j.settings.gravityDir
            ? [
                j.settings.gravityDir.x,
                j.settings.gravityDir.y,
                j.settings.gravityDir.z,
              ]
            : [0, -1, 0],
          dragForce: j.settings.dragForce,
        })
      }

      // 末端ノード（tail）を追加
      // VRM1.0仕様: SpringBoneチェーンの最後にはtailノードが必要
      // beforeParseで仮想tailノードを作成済みなので、bone.childrenから取得できる
      const lastJoint = chainJoints[chainJoints.length - 1]
      let tailNode = lastJoint?.child

      // child がない場合、bone.children から子ボーンを探す
      // (beforeParseで作成した仮想tailノードを含む)
      if (!tailNode && lastJoint?.bone) {
        const boneChildren = lastJoint.bone.children.filter(
          (child: any) => child.type === 'Bone' || child.isBone,
        )
        if (boneChildren.length > 0) {
          tailNode = boneChildren[0]
        }
      }

      if (tailNode) {
        const tailNodeIndex = this.writer.nodeMap.get(tailNode)
        if (tailNodeIndex !== undefined) {
          // tailノードをjointsに追加（nodeのみ、物理パラメータなし）
          jointDefs.push({
            node: tailNodeIndex,
          })
        }
      }

      if (jointDefs.length === 0) return

      // コライダーグループのインデックスを収集
      const colliderGroupIndices: number[] = []
      const firstJoint = chainJoints[0]
      if (firstJoint.colliderGroups) {
        firstJoint.colliderGroups.forEach((group: any) => {
          const index = colliderGroupIndexMap.get(group)
          if (index !== undefined && !colliderGroupIndices.includes(index)) {
            colliderGroupIndices.push(index)
          }
        })
      }

      // センターノードのインデックス
      let centerNodeIndex: number | undefined
      if (firstJoint.center) {
        centerNodeIndex = this.writer.nodeMap.get(firstJoint.center)
      }

      const springDef: any = {
        joints: jointDefs,
      }

      if (centerNodeIndex !== undefined) {
        springDef.center = centerNodeIndex
      }

      if (colliderGroupIndices.length > 0) {
        springDef.colliderGroups = colliderGroupIndices
      }

      springDefs.push(springDef)
    })

    // 何もエクスポートするものがなければ undefined を返す
    if (springDefs.length === 0 && colliderDefs.length === 0) {
      return undefined
    }

    const result: any = {
      specVersion: '1.0',
    }

    if (colliderDefs.length > 0) {
      result.colliders = colliderDefs
    }

    if (colliderGroupDefs.length > 0) {
      result.colliderGroups = colliderGroupDefs
    }

    if (springDefs.length > 0) {
      result.springs = springDefs
    }

    return result
  }
}

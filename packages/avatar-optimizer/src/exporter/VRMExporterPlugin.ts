/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VRM } from '@pixiv/three-vrm'
import { Object3D } from 'three'

export class VRMExporterPlugin
{
  public readonly name = 'VRMC_vrm'
  private writer: any
  private vrm: VRM | null = null

  constructor(writer: any)
  {
    this.writer = writer
  }

  public setVRM(vrm: VRM)
  {
    this.vrm = vrm
  }

  public beforeParse(input: Object3D | Object3D[])
  {
    const root = Array.isArray(input) ? input[0] : input
    if (!root) return

    // Find VRM instance in userData
    // This assumes the input object or its children have userData.vrm set
    // which is common when loading via VRMLoaderPlugin
    root.traverse((obj: any) =>
    {
      if (obj.userData && obj.userData.vrm && !this.vrm)
      {
        this.vrm = obj.userData.vrm as VRM
      }
    })
  }

  public afterParse(_input: any)
  {
    if (!this.vrm)
    {
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
    if (!json.extensionsUsed.includes('VRMC_vrm'))
    {
      json.extensionsUsed.push('VRMC_vrm')
    }
  }

  private exportMeta(vrm: VRM)
  {
    if (!vrm.meta) return undefined

    const meta = vrm.meta as any // Cast to any to handle both VRM 0.0 and 1.0 meta types

    // Map VRM 0.0 meta to VRM 1.0 if necessary, or just use what's available
    // VRM 0.0 uses 'title', VRM 1.0 uses 'name'

    // VRM 0.0のライセンス名をVRM 1.0のライセンスURLに変換
    let licenseUrl = meta.licenseUrl
    if (!licenseUrl && meta.licenseName)
    {
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
      licenseUrl = licenseMapping[meta.licenseName] ?? 'https://vrm.dev/licenses/1.0/'
    }

    // licenseUrlが未定義の場合はデフォルトを設定
    if (!licenseUrl)
    {
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
      allowPoliticalOrReligiousUsage: meta.allowPoliticalOrReligiousUsage ?? false,
      allowAntisocialOrHateUsage: meta.allowAntisocialOrHateUsage ?? false,
      creditNotation: meta.creditNotation ?? 'required',
      allowRedistribution: meta.allowRedistribution ?? false,
      modification: meta.modification ?? 'prohibited',
    }
  }

  private exportHumanoid(vrm: VRM)
  {
    if (!vrm.humanoid) return undefined

    const humanBones: any = {}

    // Iterate over all possible human bone names
    Object.entries(vrm.humanoid.humanBones).forEach(([name, bone]) =>
    {
      if (bone && bone.node)
      {
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
        if (nodeIndex !== undefined)
        {
          humanBones[name] = { node: nodeIndex }
        }
      }
    })

    return {
      humanBones,
    }
  }

  private exportExpressions(vrm: VRM)
  {
    if (!vrm.expressionManager) return undefined

    const expressions: any = {}

    if (vrm.expressionManager.expressions)
    {
      vrm.expressionManager.expressions.forEach((expression) =>
      {
        const expr = expression as any // Cast to access binds
        const exprDef: any = {
          isBinary: expr.isBinary,
          overrideBlink: expr.overrideBlink,
          overrideLookAt: expr.overrideLookAt,
          overrideMouth: expr.overrideMouth,
        }

        if (expr.morphTargetBinds && expr.morphTargetBinds.length > 0)
        {
          exprDef.morphTargetBinds = expr.morphTargetBinds
            .map((bind: any) =>
            {
              const nodeIndex = this.writer.nodeMap.get(bind.node)
              return {
                node: nodeIndex,
                index: bind.index,
                weight: bind.weight,
              }
            })
            .filter((b: any) => b.node !== undefined)
        }

        if (expr.materialColorBinds && expr.materialColorBinds.length > 0)
        {
          exprDef.materialColorBinds = expr.materialColorBinds.map(
            (bind: any) =>
            {
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
        )
        {
          exprDef.textureTransformBinds = expr.textureTransformBinds.map(
            (bind: any) =>
            {
              const materialIndex = this.writer.processMaterial(bind.material)
              return {
                material: materialIndex,
                scale: bind.scale.toArray(),
                offset: bind.offset.toArray(),
              }
            },
          )
        }

        expressions[expr.expressionName] = exprDef
      })
    }

    return {
      preset: {},
      ...expressions,
    }
  }

  private exportLookAt(vrm: VRM)
  {
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

  private exportFirstPerson(vrm: VRM)
  {
    if (!vrm.firstPerson) return undefined

    const meshAnnotations: any[] = []
    if (vrm.firstPerson.meshAnnotations)
    {
      vrm.firstPerson.meshAnnotations.forEach((annotation) =>
      {
        const ann = annotation as any
        // In three-vrm, annotation might hold 'mesh' (Object3D) instead of 'node' index
        // If it holds 'mesh', we need to find its node index.
        // If it holds 'node' (from raw GLTF), it might be an index or object.
        // Usually in loaded VRM, it holds the Mesh object.
        const mesh = ann.mesh || ann.node
        const nodeIndex = this.writer.nodeMap.get(mesh)
        if (nodeIndex !== undefined)
        {
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
}

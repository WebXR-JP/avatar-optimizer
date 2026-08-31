import type { VRM } from '@pixiv/three-vrm'
import { describe, expect, it } from 'vitest'
import { exportVRM } from '../../src/io/export'
import { loadVRM } from '../../src/io/load'

/**
 * VRMC_vrm.meta のエクスポートラウンドトリップテスト
 *
 * fixture: AliciaSolid.vrm（VRM 0.x。(c) DWANGO Co., Ltd. / licenseName: Other /
 * allowedUserName: Everyone / commercialUssageName: Allow）
 *
 * 回帰の対象: VRM 0.x のメタは権限フィールドの名前が 1.0 と異なるため、
 * 読み替えないと未定義扱いになり、最も制限的な既定値
 * （onlyAuthor / personalNonProfit）で書き出される。
 * 「誰でも利用可・商用可」のモデルが逆の内容で記録されてしまう。
 */
const VRM_FILE = '/AliciaSolid.vrm'

interface GlbJson {
  images?: unknown[]
  extensions?: {
    VRM?: { meta?: Record<string, unknown> }
    VRMC_vrm?: { meta?: Record<string, unknown> }
  }
}

/** GLB バイナリから JSON チャンクを取り出す */
function parseGlbJson(buf: ArrayBuffer): GlbJson {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  const jsonBytes = new Uint8Array(buf, 20, jsonLen)
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as GlbJson
}

/**
 * ライブラリ本来の loadVRM で読み込む
 *
 * サムネイルの保持はローダ側の設定（needThumbnailImage）に依存するため、
 * 素の GLTFLoader ではなく本番と同じ経路を通す。
 */
async function loadVrmFromBuffer(buf: ArrayBuffer): Promise<VRM> {
  const result = await loadVRM(buf)
  return result._unsafeUnwrap()
}

describe('Meta Export Roundtrip (VRM 0.x)', () => {
  it('fixture が想定どおりの権限を宣言していること', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const meta = parseGlbJson(buf).extensions?.VRM?.meta

    expect(meta?.allowedUserName).toBe('Everyone')
    expect(meta?.commercialUssageName).toBe('Allow')
    expect(meta?.licenseName).toBe('Other')
  })

  it('VRM 0.x の権限を 1.0 へ読み替えて書き出す', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const vrm = await loadVrmFromBuffer(buf)

    const exported = await exportVRM(vrm, {})
    expect(exported.isOk()).toBe(true)

    const json = parseGlbJson(exported._unsafeUnwrap())
    const meta = json.extensions?.VRMC_vrm?.meta

    // 作者の意思表示が保たれること
    expect(meta?.avatarPermission).toBe('everyone')
    expect(meta?.commercialUsage).toBe('personalProfit')
    expect(meta?.allowExcessivelyViolentUsage).toBe(false)
    expect(meta?.allowExcessivelySexualUsage).toBe(false)

    // licenseName: Other の条文リンクは otherLicenseUrl に残ること
    expect(meta?.otherLicenseUrl).toBe(
      'https://3d.nicovideo.jp/alicia/rule.html',
    )

    // 0.x に対応フィールドが無いものは保守的な既定値のまま
    expect(meta?.modification).toBe('prohibited')
    expect(meta?.allowRedistribution).toBe(false)

    expect(meta?.name).toBe('Alicia Solid')
    expect(meta?.authors).toEqual(['© DWANGO Co., Ltd.'])
  })

  it('サムネイルを images のインデックスとして書き出す', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const vrm = await loadVrmFromBuffer(buf)

    const json = parseGlbJson((await exportVRM(vrm, {}))._unsafeUnwrap())
    const thumbnail = json.extensions?.VRMC_vrm?.meta?.thumbnailImage

    // 仕様上 textures ではなく images のインデックス
    expect(typeof thumbnail).toBe('number')
    expect(thumbnail as number).toBeLessThan((json.images ?? []).length)
  })

  it('再ロードしても権限が保たれる', async () => {
    const buf = await (await fetch(VRM_FILE)).arrayBuffer()
    const vrm = await loadVrmFromBuffer(buf)

    const outBuf = (await exportVRM(vrm, {}))._unsafeUnwrap()
    const meta = (await loadVrmFromBuffer(outBuf)).meta as Record<
      string,
      unknown
    >

    expect(meta.metaVersion).toBe('1')
    expect(meta.avatarPermission).toBe('everyone')
    expect(meta.commercialUsage).toBe('personalProfit')
  })
})

/**
 * fixture: VRM1_Constraint_Twist_Sample.vrm（pixiv/three-vrm 公式サンプル。
 * VRM Public License 1.0 / (c) 2022 pixiv Inc.）
 *
 * 全権限が許可側に振り切れているため、既定値で潰されると必ず検出できる。
 */
const VRM1_FILE = '/VRM1_Constraint_Twist_Sample.vrm'

describe('Meta Export Roundtrip (VRM 1.0)', () => {
  it('許可された権限を既定値で潰さない', async () => {
    const buf = await (await fetch(VRM1_FILE)).arrayBuffer()
    const original = parseGlbJson(buf).extensions?.VRMC_vrm?.meta

    const vrm = await loadVrmFromBuffer(buf)
    const outBuf = (await exportVRM(vrm, {}))._unsafeUnwrap()
    const meta = parseGlbJson(outBuf).extensions?.VRMC_vrm?.meta

    for (const key of [
      'avatarPermission',
      'commercialUsage',
      'modification',
      'creditNotation',
      'allowRedistribution',
      'allowExcessivelyViolentUsage',
      'allowExcessivelySexualUsage',
      'allowPoliticalOrReligiousUsage',
      'allowAntisocialOrHateUsage',
      'licenseUrl',
      'copyrightInformation',
    ] as const) {
      expect({ key, value: meta?.[key] }).toEqual({
        key,
        value: original?.[key],
      })
    }

    expect(meta?.authors).toEqual(original?.authors)
  })

  it('サムネイルを images のインデックスとして書き出す', async () => {
    const buf = await (await fetch(VRM1_FILE)).arrayBuffer()
    const vrm = await loadVrmFromBuffer(buf)

    const json = parseGlbJson((await exportVRM(vrm, {}))._unsafeUnwrap())
    const thumbnail = json.extensions?.VRMC_vrm?.meta?.thumbnailImage

    // textures のインデックスを書くと images の範囲を超えたり別画像を指す
    expect(typeof thumbnail).toBe('number')
    expect(thumbnail as number).toBeLessThan((json.images ?? []).length)
  })
})

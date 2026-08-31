import type { VRM0Meta, VRM1Meta } from '@pixiv/three-vrm'
import { describe, expect, it } from 'vitest'
import { buildVRM1MetaDef } from '../../src/exporter/meta'

/**
 * VRM 0.x -> 1.0 のメタ変換のテスト
 *
 * 変換規則は UniVRM の MigrationVrmMeta.cs に準拠する。
 * 「きつくなる方向は許すが、緩くなる方向は許さない」が方針。
 */

function vrm0(meta: Partial<VRM0Meta>): VRM0Meta {
  return { metaVersion: '0', ...meta } as VRM0Meta
}

describe('buildVRM1MetaDef: VRM 0.x からの移行', () => {
  it('allowedUserName を avatarPermission に読み替える', () => {
    const cases = [
      ['OnlyAuthor', 'onlyAuthor'],
      ['ExplicitlyLicensedPerson', 'onlySeparatelyLicensedPerson'],
      ['Everyone', 'everyone'],
    ] as const

    for (const [from, to] of cases) {
      const def = buildVRM1MetaDef(vrm0({ allowedUserName: from }), undefined)
      expect(def.avatarPermission).toBe(to)
    }
  })

  it('commercialUssageName: Allow を personalProfit にする（corporation にはしない）', () => {
    // corporation まで許すのは緩めすぎなので、きつい側の personalProfit を選ぶ
    expect(
      buildVRM1MetaDef(vrm0({ commercialUssageName: 'Allow' }), undefined)
        .commercialUsage,
    ).toBe('personalProfit')

    expect(
      buildVRM1MetaDef(vrm0({ commercialUssageName: 'Disallow' }), undefined)
        .commercialUsage,
    ).toBe('personalNonProfit')
  })

  it('violent / sexual の Allow を真偽値に読み替える', () => {
    const allowed = buildVRM1MetaDef(
      vrm0({ violentUssageName: 'Allow', sexualUssageName: 'Allow' }),
      undefined,
    )
    expect(allowed.allowExcessivelyViolentUsage).toBe(true)
    expect(allowed.allowExcessivelySexualUsage).toBe(true)

    const denied = buildVRM1MetaDef(
      vrm0({ violentUssageName: 'Disallow', sexualUssageName: 'Disallow' }),
      undefined,
    )
    expect(denied.allowExcessivelyViolentUsage).toBe(false)
    expect(denied.allowExcessivelySexualUsage).toBe(false)
  })

  it('未指定の権限は最も制限的な既定値にする', () => {
    const def = buildVRM1MetaDef(vrm0({ title: 'test' }), undefined)

    expect(def.avatarPermission).toBe('onlyAuthor')
    expect(def.commercialUsage).toBe('personalNonProfit')
    expect(def.allowExcessivelyViolentUsage).toBe(false)
    expect(def.allowExcessivelySexualUsage).toBe(false)
  })

  it('licenseName は権限に反映しない（CC0 でも改変禁止のまま）', () => {
    // CC の条文から権限を推論して緩めることはしない。UniVRM も同じ。
    const def = buildVRM1MetaDef(vrm0({ licenseName: 'CC0' }), undefined)

    expect(def.modification).toBe('prohibited')
    expect(def.allowRedistribution).toBe(false)
    expect(def.creditNotation).toBe('required')

    // licenseUrl は VRM 1.0 の URL で固定する。CC の URL を書くと
    // three-vrm の既定 acceptLicenseUrls に弾かれて読めなくなる
    expect(def.licenseUrl).toBe('https://vrm.dev/licenses/1.0/')

    // 条文の URL は otherLicenseUrl に残す
    expect(def.otherLicenseUrl).toBe(
      'https://creativecommons.org/publicdomain/zero/1.0/',
    )
  })

  it('CC の URL を otherLicenseUrl の既存値と併記する', () => {
    const own = 'https://a.test'
    const cc = 'https://creativecommons.org/licenses/by/4.0/'
    const def = buildVRM1MetaDef(
      vrm0({ licenseName: 'CC_BY', otherLicenseUrl: own }),
      undefined,
    )

    expect(def.otherLicenseUrl).toBe(`'${own}', '${cc}'`)
  })

  it('name / authors は必須なので空でも undefined にしない', () => {
    const def = buildVRM1MetaDef(vrm0({}), undefined)

    expect(def.name).toBe('')
    expect(def.authors).toEqual([])
  })

  it('空文字の権限は既定値に落とす', () => {
    // ?? だと空文字が素通りし、列挙値として不正な値を書き出してしまう
    const def = buildVRM1MetaDef(
      vrm0({
        allowedUserName: '' as VRM0Meta['allowedUserName'],
        licenseName: '' as VRM0Meta['licenseName'],
      }),
      undefined,
    )

    expect(def.avatarPermission).toBe('onlyAuthor')
    expect(def.licenseUrl).toBe('https://vrm.dev/licenses/1.0/')
  })

  it('title / author しか無いメタも VRM 0.x として扱う', () => {
    // metaVersion も allowedUserName も無い手組みのメタ
    const def = buildVRM1MetaDef(
      { title: 'Foo', author: 'Bar' } as unknown as VRM0Meta,
      undefined,
    )

    expect(def.name).toBe('Foo')
    expect(def.authors).toEqual(['Bar'])
  })

  it('title / author / reference を 1.0 の名前と配列に移す', () => {
    const def = buildVRM1MetaDef(
      vrm0({ title: 'Alicia', author: 'DWANGO', reference: 'https://x.test' }),
      undefined,
    )

    expect(def.name).toBe('Alicia')
    expect(def.authors).toEqual(['DWANGO'])
    expect(def.references).toEqual(['https://x.test'])
  })

  describe('otherLicenseUrl と otherPermissionUrl の統合', () => {
    const url = (meta: Partial<VRM0Meta>) =>
      buildVRM1MetaDef(vrm0(meta), undefined).otherLicenseUrl

    it('片方だけならそのまま使う', () => {
      expect(url({ otherLicenseUrl: 'https://a.test' })).toBe('https://a.test')
      expect(url({ otherPermissionUrl: 'https://b.test' })).toBe(
        'https://b.test',
      )
    })

    it('同じ内容なら 1 つにまとめる', () => {
      expect(
        url({
          otherLicenseUrl: 'https://a.test',
          otherPermissionUrl: 'https://a.test',
        }),
      ).toBe('https://a.test')
    })

    it('内容が違えば両方を残す', () => {
      // VRM 1.0 には片方しか無いが、どちらも失わない（UniVRM#1611）
      const a = 'https://a.test'
      const b = 'https://b.test'
      expect(url({ otherLicenseUrl: a, otherPermissionUrl: b })).toBe(
        `'${a}', '${b}'`,
      )
    })

    it('どちらも無ければ undefined', () => {
      expect(url({})).toBeUndefined()
    })
  })

  it('metaVersion が無くても VRM 0.x として扱う', () => {
    // 手組みのメタでは metaVersion が付かないことがある
    const def = buildVRM1MetaDef(
      { allowedUserName: 'Everyone' } as unknown as VRM0Meta,
      undefined,
    )
    expect(def.avatarPermission).toBe('everyone')
  })
})

describe('buildVRM1MetaDef: VRM 1.0 はそのまま写す', () => {
  it('指定済みの権限を書き換えない', () => {
    const meta = {
      metaVersion: '1',
      name: 'test',
      authors: ['me'],
      licenseUrl: 'https://vrm.dev/licenses/1.0/',
      avatarPermission: 'everyone',
      commercialUsage: 'corporation',
      modification: 'allowModificationRedistribution',
      allowRedistribution: true,
      creditNotation: 'unnecessary',
    } as VRM1Meta

    const def = buildVRM1MetaDef(meta, undefined)

    expect(def.avatarPermission).toBe('everyone')
    expect(def.commercialUsage).toBe('corporation')
    expect(def.modification).toBe('allowModificationRedistribution')
    expect(def.allowRedistribution).toBe(true)
    expect(def.creditNotation).toBe('unnecessary')
  })

  it('0.x のフィールドが紛れていても metaVersion を優先する', () => {
    const def = buildVRM1MetaDef(
      {
        metaVersion: '1',
        name: 'ただしい名前',
        authors: ['me'],
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
        avatarPermission: 'everyone',
        // 何かの拍子に 0.x のキーが残っていても 1.0 として扱う
        title: 'まちがった名前',
      } as unknown as VRM1Meta,
      undefined,
    )

    expect(def.name).toBe('ただしい名前')
    expect(def.avatarPermission).toBe('everyone')
  })

  it('未指定の権限は制限的な既定値で埋める', () => {
    const def = buildVRM1MetaDef(
      { metaVersion: '1', name: 'x', authors: [], licenseUrl: '' } as VRM1Meta,
      undefined,
    )

    expect(def.avatarPermission).toBe('onlyAuthor')
    expect(def.commercialUsage).toBe('personalNonProfit')
    expect(def.modification).toBe('prohibited')
    expect(def.licenseUrl).toBe('https://vrm.dev/licenses/1.0/')
  })
})

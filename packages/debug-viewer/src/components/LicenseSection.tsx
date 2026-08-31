import type { VRM, VRM0Meta, VRM1Meta, VRMMeta } from '@pixiv/three-vrm'
import { Fragment } from 'react'

/**
 * VRM のライセンス・利用条件を一覧表示するサイドバーセクション
 *
 * VRM 0.x と 1.0 でフィールド名も値も異なるため、同じ並びの行に正規化して
 * 表示する。最適化の前後で見比べれば、権限が落ちていないか確認できる。
 * 値はファイルに入っているとおりを主に出し、日本語の意味を添える。
 */

/** 表示する 1 行 */
interface Row {
  label: string
  /** ファイルに記録されている生の値 */
  value: string | undefined
  /** 値の意味（生の値だけでは分かりにくいもの） */
  gloss?: string
  /** リンクとして開くか */
  href?: string
}

const AVATAR_PERMISSION_GLOSS: Record<string, string> = {
  onlyAuthor: '作者のみ',
  onlySeparatelyLicensedPerson: '許諾された人のみ',
  everyone: '誰でも',
  OnlyAuthor: '作者のみ',
  ExplicitlyLicensedPerson: '許諾された人のみ',
  Everyone: '誰でも',
}

const COMMERCIAL_GLOSS: Record<string, string> = {
  personalNonProfit: '非営利のみ',
  personalProfit: '個人の営利利用まで',
  corporation: '法人利用まで',
  Allow: '許可',
  Disallow: '禁止',
}

const MODIFICATION_GLOSS: Record<string, string> = {
  prohibited: '改変禁止',
  allowModification: '改変のみ可',
  allowModificationRedistribution: '改変・再配布可',
}

const ALLOW_GLOSS: Record<string, string> = {
  Allow: '許可',
  Disallow: '禁止',
}

/** 真偽値を「許可 / 禁止」にする。未指定は undefined のまま */
function boolRow(label: string, value: boolean | undefined): Row {
  if (value === undefined) return { label, value: undefined }
  return { label, value: String(value), gloss: value ? '許可' : '禁止' }
}

/** URL らしき文字列ならリンクにする */
function urlRow(label: string, value: string | undefined): Row {
  return { label, value, href: value?.startsWith('http') ? value : undefined }
}

function rowsOfVRM0(meta: VRM0Meta): Row[] {
  return [
    { label: 'タイトル', value: meta.title },
    { label: '作者', value: meta.author },
    { label: 'バージョン', value: meta.version },
    urlRow('連絡先', meta.contactInformation),
    {
      label: '利用者',
      value: meta.allowedUserName,
      gloss: meta.allowedUserName && AVATAR_PERMISSION_GLOSS[meta.allowedUserName],
    },
    {
      label: '商用利用',
      value: meta.commercialUssageName,
      gloss: meta.commercialUssageName && COMMERCIAL_GLOSS[meta.commercialUssageName],
    },
    {
      label: '暴力表現',
      value: meta.violentUssageName,
      gloss: meta.violentUssageName && ALLOW_GLOSS[meta.violentUssageName],
    },
    {
      label: '性的表現',
      value: meta.sexualUssageName,
      gloss: meta.sexualUssageName && ALLOW_GLOSS[meta.sexualUssageName],
    },
    { label: 'ライセンス', value: meta.licenseName },
    urlRow('条文 URL', meta.otherLicenseUrl),
    urlRow('許諾 URL', meta.otherPermissionUrl),
  ]
}

function rowsOfVRM1(meta: VRM1Meta): Row[] {
  return [
    { label: 'タイトル', value: meta.name },
    { label: '作者', value: meta.authors?.join(', ') },
    { label: 'バージョン', value: meta.version },
    urlRow('連絡先', meta.contactInformation),
    { label: '著作権', value: meta.copyrightInformation },
    {
      label: '利用者',
      value: meta.avatarPermission,
      gloss: meta.avatarPermission && AVATAR_PERMISSION_GLOSS[meta.avatarPermission],
    },
    {
      label: '商用利用',
      value: meta.commercialUsage,
      gloss: meta.commercialUsage && COMMERCIAL_GLOSS[meta.commercialUsage],
    },
    boolRow('暴力表現', meta.allowExcessivelyViolentUsage),
    boolRow('性的表現', meta.allowExcessivelySexualUsage),
    boolRow('政治・宗教', meta.allowPoliticalOrReligiousUsage),
    boolRow('反社会的', meta.allowAntisocialOrHateUsage),
    {
      label: '改変',
      value: meta.modification,
      gloss: meta.modification && MODIFICATION_GLOSS[meta.modification],
    },
    boolRow('再配布', meta.allowRedistribution),
    {
      label: 'クレジット',
      value: meta.creditNotation,
      gloss: meta.creditNotation === 'required' ? '必須' : '不要',
    },
    urlRow('ライセンス URL', meta.licenseUrl),
    urlRow('条文 URL', meta.otherLicenseUrl),
  ]
}

/** VRM 0.x か判定する。avatar-optimizer 側の判定と揃えている */
function isVRM0(meta: VRMMeta): meta is VRM0Meta {
  return meta.metaVersion === '0'
}

export function LicenseSection({ vrm }: { vrm: VRM }) {
  const meta = vrm.meta as VRMMeta | undefined

  if (!meta) {
    return <p className="vrm-note">メタ情報がありません</p>
  }

  const isV0 = isVRM0(meta)
  const rows = isV0 ? rowsOfVRM0(meta) : rowsOfVRM1(meta as VRM1Meta)

  return (
    <>
      <p className="vrm-note">
        <strong>VRM {isV0 ? '0.x' : '1.0'}</strong> のメタ情報
      </p>
      <dl className="vrm-stats">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.value === undefined || row.value === '' ? (
                <span className="vrm-stats__sub">—</span>
              ) : row.href ? (
                <a
                  className="vrm-link"
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  title={row.value}
                >
                  {row.value}
                </a>
              ) : (
                row.value
              )}
              {row.gloss && (
                <span className="vrm-stats__sub"> ({row.gloss})</span>
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
    </>
  )
}

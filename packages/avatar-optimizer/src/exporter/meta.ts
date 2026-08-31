/**
 * VRM のメタ情報を VRM 1.0 の glTF 表現へ変換する
 *
 * VRM 0.x と 1.0 では権限フィールドの名前も値も異なるため、読み替えないと
 * 「誰でも利用可・商用可」のモデルが最も制限的な既定値で書き出される。
 *
 * 変換規則は UniVRM のリファレンス実装
 * (Packages/VRM10/Runtime/Migration/MigrationVrmMeta.cs) に合わせている。
 * 同実装の方針は「きつくなる方向は許すが、緩くなる方向は許さない」で、
 * 移行によって権限が緩むことを事故として扱う。
 *
 * licenseName (CC ライセンス) は意図的に変換しない。UniVRM も未実装のまま
 * 保守的な既定値 (modification: prohibited 等) を残しており、CC の条文から
 * 権限を推論して緩めることを避けている。結果として CC0 のモデルでも
 * modification は prohibited になるが、逆よりは安全側に倒れる。
 */
import type { VRM0Meta, VRM1Meta, VRMMeta } from '@pixiv/three-vrm'
import type { VRM1MetaDef } from '../types'

/** VRM 1.0 の既定ライセンス URL */
const DEFAULT_LICENSE_URL = 'https://vrm.dev/licenses/1.0/'

/**
 * VRM 0.x の licenseName に対応する条文の URL
 *
 * licenseUrl には入れない。three-vrm の VRMMetaLoaderPlugin は
 * acceptLicenseUrls の既定が VRM 1.0 の URL のみで、それ以外を書くと
 * 「The license url ... is not accepted」で読み込めないファイルになる。
 * UniVRM も licenseUrl は VRM 1.0 の URL で固定している。
 * 情報を失わないよう otherLicenseUrl 側へ寄せる。
 */
const LICENSE_URL_BY_NAME: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  CC_BY: 'https://creativecommons.org/licenses/by/4.0/',
  CC_BY_NC: 'https://creativecommons.org/licenses/by-nc/4.0/',
  CC_BY_SA: 'https://creativecommons.org/licenses/by-sa/4.0/',
  CC_BY_NC_SA: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  CC_BY_ND: 'https://creativecommons.org/licenses/by-nd/4.0/',
  CC_BY_NC_ND: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
}

/** VRM 0.x の allowedUserName から VRM 1.0 の avatarPermission へ */
const AVATAR_PERMISSION_BY_ALLOWED_USER: Record<
  string,
  VRM1MetaDef['avatarPermission']
> = {
  OnlyAuthor: 'onlyAuthor',
  ExplicitlyLicensedPerson: 'onlySeparatelyLicensedPerson',
  Everyone: 'everyone',
}

/**
 * VRM 0.x のメタか判定する
 *
 * metaVersion だけに頼らないのは、メタを手で組み立てた VRM では
 * 付いていないことがあるため。VRM 0.x にしかないフィールドも見る。
 */
function isVRM0Meta(meta: VRMMeta): meta is VRM0Meta {
  if (meta.metaVersion === '0') return true
  if (meta.metaVersion === '1') return false
  // VRM 1.0 にしかないフィールドが無く、0.x にしかないものがあれば 0.x
  const vrm0Only = [
    'allowedUserName',
    'commercialUssageName',
    'title',
    'author',
    'licenseName',
    'texture',
  ]
  return vrm0Only.some((key) => key in meta)
}

/**
 * VRM 0.x の otherLicenseUrl と otherPermissionUrl を 1 つにまとめる
 *
 * VRM 1.0 には otherLicenseUrl しかない。UniVRM は内容が異なる場合に
 * どちらも失わないよう連結する (vrm-c/UniVRM#1611)。
 */
function mergeOtherUrls(...urls: (string | undefined)[]): string | undefined {
  const unique = [...new Set(urls.map((url) => url?.trim()).filter(Boolean))]

  if (unique.length === 0) return undefined
  if (unique.length === 1) return unique[0]
  return unique.map((url) => `'${url}'`).join(', ')
}

/**
 * VRM 0.x のメタを VRM 1.0 へ変換する
 *
 * @param meta - VRM 0.x のメタ情報
 * @param thumbnailImage - gltf.images 上のサムネイルのインデックス
 */
function migrateVRM0Meta(
  meta: VRM0Meta,
  thumbnailImage: number | undefined,
): VRM1MetaDef {
  return {
    // name / authors は VRM 1.0 の必須フィールドなので undefined にしない
    name: meta.title || '',
    version: meta.version,
    authors: meta.author ? [meta.author] : [],
    contactInformation: meta.contactInformation,
    references: meta.reference ? [meta.reference] : undefined,
    thumbnailImage,

    licenseUrl: DEFAULT_LICENSE_URL,
    // CC の条文 URL は licenseUrl ではなくこちらへ寄せる
    otherLicenseUrl: mergeOtherUrls(
      meta.otherLicenseUrl,
      meta.otherPermissionUrl,
      meta.licenseName ? LICENSE_URL_BY_NAME[meta.licenseName] : undefined,
    ),

    // 空文字が来ても既定値に落とすため ?? ではなく ||
    avatarPermission:
      (meta.allowedUserName &&
        AVATAR_PERMISSION_BY_ALLOWED_USER[meta.allowedUserName]) ||
      'onlyAuthor',
    allowExcessivelyViolentUsage: meta.violentUssageName === 'Allow',
    allowExcessivelySexualUsage: meta.sexualUssageName === 'Allow',
    // Allow を corporation ではなく personalProfit に落とすのが
    // 「きつくなる方向」の選択
    commercialUsage:
      meta.commercialUssageName === 'Allow'
        ? 'personalProfit'
        : 'personalNonProfit',

    // VRM 0.x に対応するフィールドがないものは保守的な既定値のまま残す
    allowPoliticalOrReligiousUsage: false,
    allowAntisocialOrHateUsage: false,
    creditNotation: 'required',
    allowRedistribution: false,
    modification: 'prohibited',
  }
}

/**
 * VRM 1.0 のメタを glTF 表現へ写す
 *
 * 未指定の権限フィールドは最も制限的な既定値で埋める。
 */
function convertVRM1Meta(
  meta: VRM1Meta,
  thumbnailImage: number | undefined,
): VRM1MetaDef {
  return {
    name: meta.name || '',
    version: meta.version,
    authors: meta.authors ?? [],
    copyrightInformation: meta.copyrightInformation,
    contactInformation: meta.contactInformation,
    references: meta.references,
    thirdPartyLicenses: meta.thirdPartyLicenses,
    thumbnailImage,

    licenseUrl: meta.licenseUrl || DEFAULT_LICENSE_URL,
    otherLicenseUrl: meta.otherLicenseUrl,

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

/**
 * VRM 0.x / 1.0 いずれのメタも VRM 1.0 の glTF 表現へ変換する
 *
 * @param meta - three-vrm が読み込んだメタ情報
 * @param thumbnailImage - gltf.images 上のサムネイルのインデックス
 */
export function buildVRM1MetaDef(
  meta: VRMMeta,
  thumbnailImage: number | undefined,
): VRM1MetaDef {
  return isVRM0Meta(meta)
    ? migrateVRM0Meta(meta, thumbnailImage)
    : convertVRM1Meta(meta as VRM1Meta, thumbnailImage)
}

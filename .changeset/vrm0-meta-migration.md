---
'@webxr-jp/avatar-optimizer': minor
---

VRM 0.x のライセンス・権限情報が最適化後に失われる問題を修正しました。

VRM 0.x と VRM 1.0 では権限フィールドの名前が異なる（`allowedUserName` / `avatarPermission` など）ため、読み替えないと未定義扱いになり、最も制限的な既定値で書き出されていました。「誰でも利用可・商用可」のモデルが「作者のみ・非営利」として記録されます。

変換規則は UniVRM のリファレンス実装（`MigrationVrmMeta.cs`）に準拠しています。「きつくなる方向は許すが、緩くなる方向は許さない」という方針で、`commercialUssageName: Allow` は `corporation` ではなく `personalProfit` に落とします。

`licenseName`（CC ライセンス）は権限に反映しません。UniVRM も同様で、CC の条文から権限を推論して緩めることを避けています。そのため CC0 のモデルでも `modification` は `prohibited` のままです。

VRM 0.x の CC ライセンスは `licenseUrl` ではなく `otherLicenseUrl` に記録します。CC の URL を `licenseUrl` に書くと、three-vrm の `acceptLicenseUrls`（既定は VRM 1.0 の URL のみ）に弾かれ、標準設定のアプリで開けないファイルになるためです。

あわせて、VRM 0.x / 1.0 を問わず起きていた 2 つの欠落も直しました。

- `otherLicenseUrl` / `otherPermissionUrl` が常に消えていた（`licenseName: Other` では条文への唯一のリンク）
- サムネイルが失われていた。仕様上 `meta.thumbnailImage` は `gltf.images` のインデックスですが、`textures` のインデックスを書いていました

VRM 1.0 のモデルで既に指定済みの権限は変わりません。

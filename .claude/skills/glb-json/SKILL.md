---
name: glb-json
description: GLB/VRM ファイルから JSON チャンクを抽出・閲覧する。VRM の extensions、materials、nodes などの構造を調査したいとき、GLB の JSON 部分を確認したいときに使用。
---

# GLB JSON Extractor

GLB/VRM ファイルから JSON チャンクを抽出し、特定のパスを指定して部分的に取得できる。

## 使い方

```bash
node scripts/glb-json.cjs <file.glb|file.vrm> [jsonPath]
```

## 例

```bash
# 全 JSON を出力
node scripts/glb-json.cjs model.vrm

# VRM 拡張のメタ情報
node scripts/glb-json.cjs model.vrm extensions.VRM.meta

# マテリアル一覧
node scripts/glb-json.cjs model.vrm materials

# 最初のマテリアル
node scripts/glb-json.cjs model.vrm materials[0]

# ノード一覧
node scripts/glb-json.cjs model.vrm nodes

# 使用している拡張の一覧
node scripts/glb-json.cjs model.vrm extensionsUsed
```

## よく使うパス

| パス | 内容 |
|------|------|
| `asset` | glTF バージョン、generator |
| `extensions` | 全拡張データ |
| `extensions.VRM` | VRM 0.x 拡張 |
| `extensions.VRMC_vrm` | VRM 1.0 拡張 |
| `extensionsUsed` | 使用拡張の配列 |
| `materials` | マテリアル配列 |
| `meshes` | メッシュ配列 |
| `nodes` | ノード配列 |
| `textures` | テクスチャ参照配列 |
| `images` | 画像配列 |

## scripts/

- `glb-json.cjs` - GLB から JSON チャンクを抽出する Node.js スクリプト

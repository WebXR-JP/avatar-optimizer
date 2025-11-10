# VRM メタデータ保持計画

## 問題の背景

現在の最適化処理では、glTF-Transform を使用してドキュメントを処理していますが、**VRM固有の拡張機能メタデータが失われている** という問題があります。

### 具体例

**元の Seed-san.vrm**
```json
{
  "extensionsUsed": [
    "VRMC_springBone",
    "VRMC_vrm",
    "KHR_materials_unlit",
    "VRMC_materials_mtoon",
    "KHR_texture_transform",
    "KHR_materials_emissive_strength",
    "VRMC_node_constraint"
  ],
  "extensions": {
    "VRMC_vrm": {
      "expressions": {
        "preset": {
          "aa": { "morphTargetBinds": [...], "overrideBlink": "none", ... },
          "angry": { "morphTargetBinds": [...], "isBinary": true, ... },
          "blink": { "morphTargetBinds": [...], ... },
          // ... 多数の表情定義
        }
      },
      "humanoid": { /* ボーン構造マッピング */ },
      "meta": { /* VRM メタデータ */ }
    },
    "VRMC_springBone": { /* 物理演算設定 */ }
  }
}
```

**最適化後のファイル（現在）**
```json
{
  "extensionsUsed": [],  // ❌ 空になってしまう
  "extensions": {}       // ❌ メタデータが全て削除
}
```

**Web版Validator の出力**
```json
{
  "code": "VRM1_NO_VRM_EXTENSION",
  "message": "The VRMC_vrm extension is missing",
  "severity": 0  // 🔴 ERROR
}
```

## 影響範囲

| 機能 | 影響 | 重要度 |
|------|------|--------|
| **表情（Expression）** | VTuber アプリで表情が使用不可 | 🔴 高 |
| **物理演算（SpringBone）** | 髪・衣装の動きが失われる | 🔴 高 |
| **ボーン構造（Humanoid）** | IK や動作カスタマイズが不可 | 🟡 中 |
| **マテリアル拡張** | MToon シェーダー設定が失われる可能性 | 🟡 中 |
| **VRM 仕様準拠** | Web版Validator でエラー | 🔴 高 |

## 根本原因

### glTF-Transform の制限

```typescript
// 現在のコード
const document = await io.readBinary(new Uint8Array(buffer))
const optimizedDoc = await atlasTexturesInDocument(document, {...})
const newArrayBuffer = await io.writeBinary(optimizedDoc)

// 問題: glTF-Transform は以下をサポートしていない
// ❌ VRMC_vrm の拡張機能オブジェクトの解析・保持
// ❌ listExtensionsUsed() は常に空
// ❌ addExtension() は存在しない
```

### GLB ファイル構造

VRM ファイル（GLB 形式）は以下の構造：

```
GLB Header (12 bytes)
├─ magic: "glTF" (0x46546c67)
├─ version: 2
└─ length: total file size

Chunk 0: JSON (JSON チャンク)
├─ length: JSON データサイズ
├─ type: "JSON"
└─ data: glTF JSON スキーマ
   ├─ asset
   ├─ scene
   ├─ nodes
   ├─ meshes
   ├─ extensionsUsed: ["VRMC_vrm", ...]  ← ここに拡張機能リスト
   ├─ extensions:
   │  ├─ VRMC_vrm: { ... }              ← VRM メタデータ
   │  └─ VRMC_springBone: { ... }
   └─ ... その他の glTF データ

Chunk 1: BIN (バイナリ チャンク)
├─ length: バイナリサイズ
├─ type: "BIN"
└─ data: メッシュ・テクスチャ・アニメーション等のバイナリデータ
```

**glTF-Transform の処理フロー：**

```
GLB ファイル
  ↓
JSON チャンク抽出
  ↓
JSON パース
  ↓
Document オブジェクト作成
  ×  ← ここで拡張機能は無視される
  ↓
処理実行（アトラス化、最適化等）
  ↓
Document → JSON 出力
  ×  ← 拡張機能データが失われる
  ↓
新しい GLB ファイル作成
```

## 解決方法

### アプローチ 1: JSON チャンク直接操作（推奨）

**利点:**
- glTF-Transform の制限を回避できる
- 最小限の変更で実装可能
- 確実にメタデータを保持

**フロー:**

```
1. 元の VRM ファイルを読み込み
   ↓
2. GLB チャンクから JSON を抽出
   ↓
3. JSON から拡張機能セクションを抽出・保存
   {
     "extensionsUsed": [...],
     "extensions": {
       "VRMC_vrm": {...},
       "VRMC_springBone": {...},
       ...
     }
   }
   ↓
4. glTF-Transform で処理（テクスチャアトラス化等）
   ↓
5. 処理済みドキュメントを GLB に出力
   ↓
6. 出力の GLB から JSON チャンクを抽出
   ↓
7. JSON に保存した拡張機能セクションをマージ
   {
     ...他の glTF データ,
     "extensionsUsed": [元のリスト],
     "extensions": {元のメタデータ}
   }
   ↓
8. JSON チャンクを GLB に再挿入
   ↓
9. 最終的な VRM ファイルを出力
```

**実装例（疑似コード）:**

```typescript
/**
 * VRM メタデータを保持しながら最適化
 */
async function optimizeVRMPreservingMetadata(
  file: File,
  options: OptimizationOptions
): Promise<File> {
  // Step 1: 元ファイルをバイナリで読み込み
  const originalBuffer = await file.arrayBuffer()

  // Step 2: 元の JSON チャンクを抽出
  const originalJson = extractGLBJsonChunk(new Uint8Array(originalBuffer))
  const originalMetadata = {
    extensionsUsed: originalJson.extensionsUsed || [],
    extensions: originalJson.extensions || {}
  }

  // Step 3: glTF-Transform で処理
  const document = await loadGltfDocument(new Uint8Array(originalBuffer))
  const optimizedDoc = await optimizeDocument(document, options)

  // Step 4: 最適化済みドキュメントを出力
  const optimizedBuffer = await writeGltfDocument(optimizedDoc)
  const optimizedJson = extractGLBJsonChunk(new Uint8Array(optimizedBuffer))

  // Step 5: メタデータをマージ
  const finalJson = {
    ...optimizedJson,
    extensionsUsed: originalMetadata.extensionsUsed,
    extensions: originalMetadata.extensions
  }

  // Step 6: GLB を再構築
  const finalBuffer = reconstructGLB(
    new Uint8Array(optimizedBuffer),
    finalJson
  )

  return new File([finalBuffer], file.name, { type: file.type })
}
```

### アプローチ 2: glTF-Transform ラッパー実装

**利点:**
- 将来的に他の拡張機能にも対応しやすい

**欠点:**
- 実装が複雑
- 保守コストが高い

### アプローチ 3: 外部ツール連携

**利点:**
- VRM 専門ツール（VRM-Optimizer 等）を使用

**欠点:**
- プロセス外の処理が必要
- 環境依存性が増加

## 推奨：アプローチ 1 の詳細実装計画

### Phase 1: ユーティリティ関数の実装

**ファイル:** `src/glb-utils.ts`

```typescript
/**
 * GLB ファイルから JSON チャンクを抽出
 */
export function extractGLBJsonChunk(buffer: Uint8Array): any {
  // GLB ヘッダー解析
  // JSON チャンク位置の特定
  // JSON データ抽出
  // JSON パース
  return jsonData
}

/**
 * GLB ファイルに新しい JSON チャンクを挿入
 */
export function injectGLBJsonChunk(
  buffer: Uint8Array,
  jsonData: any
): Uint8Array {
  // GLB ヘッダーの更新
  // JSON チャンクの置き換え
  // GLB ファイル再構築
  return newBuffer
}

/**
 * VRM メタデータを抽出
 */
export function extractVRMMetadata(json: any): VRMMetadata {
  return {
    extensionsUsed: json.extensionsUsed || [],
    extensions: {
      VRMC_vrm: json.extensions?.VRMC_vrm,
      VRMC_springBone: json.extensions?.VRMC_springBone,
      VRMC_materials_mtoon: json.extensions?.VRMC_materials_mtoon,
      // ... その他のVRM拡張機能
    }
  }
}

/**
 * VRM メタデータを JSON にマージ
 */
export function mergeVRMMetadata(
  json: any,
  metadata: VRMMetadata
): any {
  return {
    ...json,
    extensionsUsed: metadata.extensionsUsed,
    extensions: {
      ...json.extensions,
      ...metadata.extensions
    }
  }
}
```

### Phase 2: optimizer.ts の改修

```typescript
export function optimizeVRM(
  file: File,
  options: OptimizationOptions,
  createCanvasFactory: CreateCanvasFactory
): ResultAsync<File, OptimizationError> {
  // 既存のエラーチェック...

  return ResultAsync.fromPromise(file.arrayBuffer(), ...)
    .andThen((arrayBuffer) => {
      const buffer = new Uint8Array(arrayBuffer)

      // ✨ NEW: メタデータを抽出・保存
      const originalJson = extractGLBJsonChunk(buffer)
      const vrmMetadata = extractVRMMetadata(originalJson)

      return _loadDocument(buffer)
        .map(doc => ({ document: doc, metadata: vrmMetadata }))
    })
    .andThen(({ document, metadata }) => {
      // 既存の最適化処理...
      return atlasTexturesInDocument(document, {...})
        .map(result => ({ ...result, originalMetadata: metadata }))
    })
    .andThen(({ document, originalMetadata }) => {
      return ResultAsync.fromPromise(
        (async () => {
          const { WebIO } = await import('@gltf-transform/core')
          const io = new WebIO()
          const outputBuffer = await io.writeBinary(document)

          // ✨ NEW: メタデータを再挿入
          const outputJson = extractGLBJsonChunk(new Uint8Array(outputBuffer))
          const finalJson = mergeVRMMetadata(outputJson, originalMetadata)
          const finalBuffer = injectGLBJsonChunk(
            new Uint8Array(outputBuffer),
            finalJson
          )

          return new File([finalBuffer], file.name, { type: file.type })
        })(),
        (error) => ({ type: 'PROCESSING_FAILED' as const, message: String(error) })
      )
    })
}
```

### Phase 3: テスト・検証

**単体テスト:**
- `extractGLBJsonChunk()`: JSON 抽出の正確性
- `injectGLBJsonChunk()`: JSON 挿入後のGLB 有効性
- `extractVRMMetadata()`: メタデータの抽出完全性
- `mergeVRMMetadata()`: マージ時のデータ一貫性

**統合テスト:**
- 元の VRM → 最適化 → バリデーション → 確認

**Web版 Validator での検証:**
- `VRM1_NO_VRM_EXTENSION` エラーが消える
- すべての表情・物理演算データが保持される

## スケジュール

| フェーズ | 作業内容 | 期間 | 優先度 |
|---------|--------|------|--------|
| **Phase 1** | GLB ユーティリティ関数実装 | 1-2 日 | 🔴 高 |
| **Phase 2** | optimizer.ts 改修 | 1 日 | 🔴 高 |
| **Phase 3** | テスト・検証 | 1 日 | 🟡 中 |
| **Phase 4** | CLI・ドキュメント更新 | 半日 | 🟢 低 |

## 成功基準

✅ 最適化後のファイルが Web版 Validator でエラーなしで通過
✅ 表情データ（expressions）が完全に保持される
✅ 物理演算データ（springBone）が完全に保持される
✅ ファイルサイズ削減率が損なわれない
✅ バリデーション実行時間に大きな変化がない

## 参考情報

### GLB フォーマット仕様

- [Khronos glTF 2.0 仕様](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [GLB ファイル形式](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#file-format-specification)

### VRM 仕様

- [VRM 1.0 仕様](https://github.com/vrm-c/vrm-specification)
- [VRMC_vrm 拡張機能](https://github.com/vrm-c/vrm-specification/tree/main/specification)

### glTF-Transform API

- [glTF-Transform Documentation](https://gltf-transform.dev/)
- [Extension API](https://gltf-transform.dev/modules/extensions)

## FAQ

### Q: なぜ glTF-Transform が拡張機能を保持しないのか？

**A:** glTF-Transform は VRM などの特定フォーマット用ライブラリではなく、一般的な glTF ツールです。
実装の都合上、認識できない拡張機能のカスタムデータは無視されます。

### Q: このアプローチで他の拡張機能にも対応できるか？

**A:** はい。`extractVRMMetadata()` を拡張することで、任意の拡張機能に対応可能です。

### Q: ファイルサイズへの影響は？

**A:** JSON チャンクのサイズは変わらないため、最適化効果は損なわれません。


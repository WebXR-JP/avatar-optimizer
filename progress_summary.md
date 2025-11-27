# 顔メッシュ統合除外機能の実装進捗

## 概要
VRMの表情（Expression）情報を使用して顔メッシュを特定し、メッシュ統合処理から除外する機能を実装しました。これにより、表情用のMorphTargetが保持されます。

## 実装内容

### 1. `combine.ts` の変更
[combine.ts](file:///home/halby/repos/webxr/avatar-optimizer/packages/avatar-optimizer/src/util/material/combine.ts)

- `combineMToonMaterials` 関数に `excludedMeshes?: Set<Mesh>` パラメータを追加
- メッシュ統合時に `excludedMeshes` に含まれるメッシュをスキップする処理を実装

```typescript
export function combineMToonMaterials(
  materialMeshMap: Map<MToonMaterial, Mesh[]>,
  options: CombineMaterialOptions = {},
  excludedMeshes?: Set<Mesh>,
): Result<CombinedMeshResult, OptimizationError>
```

### 2. `avatar-optimizer.ts` の変更
[avatar-optimizer.ts](file:///home/halby/repos/webxr/avatar-optimizer/packages/avatar-optimizer/src/avatar-optimizer.ts)

- `optimizeModel` 関数のシグネチャを変更し、`vrm: VRM` のみを受け取るように変更
- 内部で `vrm.scene` を `rootNode` として取得
- VRMの `expressionManager` から表情で使用されているメッシュを収集
- 収集したメッシュを `excludedMeshes` として `combineMToonMaterials` に渡す
- メッシュ削除処理でも `excludedMeshes` を除外

```typescript
export function optimizeModel(
  vrm: VRM,
): ResultAsync<CombinedMeshResult, OptimizationError>
```

**顔メッシュ特定ロジック:**
```typescript
const excludedMeshes = new Set<Mesh>()
if (vrm.expressionManager)
{
  for (const expression of vrm.expressionManager.expressions)
  {
    for (const bind of expression.binds)
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mesh = (bind as any).primitives?.[0] as Mesh
      if (mesh && mesh.isMesh)
      {
        excludedMeshes.add(mesh)
      }
    }
  }
}
```

### 3. `App.tsx` の変更
[App.tsx](file:///home/halby/repos/webxr/avatar-optimizer/packages/debug-viewer/src/App.tsx)

- `optimizeModel` 呼び出し時に `vrm` オブジェクトのみを渡すように変更

```typescript
const result = await optimizeModel(vrm)
```

## 現在の状態

✅ **完了:**
- Implementation Plan作成
- コード実装完了
  - `combine.ts` の更新
  - `avatar-optimizer.ts` の更新
  - `App.tsx` の更新

🔄 **進行中:**
- 検証作業

## 次のステップ

### 手動検証
1. `debug-viewer` で `AliciaSolid.vrm` を読み込み
2. Scene Inspector で最適化前のメッシュ構造を確認
3. Optimize ボタンをクリック
4. 最適化後、以下を確認:
   - 顔メッシュが `CombinedMToonMesh` に統合されていないこと
   - 顔メッシュが独立したメッシュとして残っていること
   - 他のメッシュ（体、服など）は統合されていること
   - MorphTarget が保持されていること

### 自動テスト（今後の課題）
- `combineMToonMaterials` の `excludedMeshes` パラメータのテストケース追加を検討

## 注意事項

> [!IMPORTANT]
> `optimizeModel` のシグネチャ変更は破壊的変更ですが、`vrm` パラメータはオプショナルなため、既存コードとの互換性は保たれます。ただし、顔メッシュ除外機能を利用するには `vrm` オブジェクトを渡す必要があります。

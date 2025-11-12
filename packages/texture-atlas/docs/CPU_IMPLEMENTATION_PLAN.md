# CPU ベース実装計画：TexTransCoreTS テクスチャアトラス化

TexTransCoreTS の **テクスチャアトラス化** は Canvas API（CPU）で実装します。

## 実装アーキテクチャ概要

```
┌──────────────────────────────────────────────────────────────────┐
│  TexTransCoreTS CPU ベース テクスチャアトラス化パイプライン       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  入力: Document (glTF-Transform)                                  │
│  ├─ Texture[] (複数テクスチャ)                                     │
│  └─ Primitive[] (UV 座標参照情報)                                  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Stage 1: テクスチャ抽出＆パッキング計算                      │  │
│  │                                                             │  │
│  │  1a. テクスチャ画像を gltf-transform から抽出               │  │
│  │  1b. 各画像のサイズを計測                                   │  │
│  │  1c. MaxRects Bin Packing で配置計算                       │  │
│  │      → PackedRect[] { x, y, width, height }                │  │
│  │                                                             │  │
│  │  出力: IslandRegion[]（元位置 → 新位置の対応表）           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Stage 2: Canvas でテクスチャ画像を統合                      │  │
│  │                                                             │  │
│  │  2a. アトラス Canvas を作成 (maxSize × maxSize)             │  │
│  │  2b. 各テクスチャ画像を Canvas に描画                        │  │
│  │      ctx.drawImage(image, targetX, targetY)                │  │
│  │  2c. アトラス画像をメモリ内に保持                           │  │
│  │                                                             │  │
│  │  出力: HTMLCanvasElement | ImageData                       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Stage 3: glTF-Transform ドキュメント更新（CPU）             │  │
│  │                                                             │  │
│  │  3a. アトラス画像をテクスチャとして追加                     │  │
│  │  3b. すべての Primitive をイテレート                        │  │
│  │  3c. 各 Primitive の TEXCOORD_0 (UV座標) を再計算           │  │
│  │      newUV = (oldUV - oldIslandPos) * scale + newIslandPos │  │
│  │  3d. 不要なテクスチャ参照を削除                             │  │
│  │  3e. マテリアル参照を新アトラステクスチャに更新             │  │
│  │                                                             │  │
│  │  出力: Document (更新済み)                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                      │
│  最終出力:                                                        │
│  - Document (アトラステクスチャ + 新 UV 座標)                    │
│  - IslandRegion[] (マッピング情報)                               │
│  - AtlasMetadata (パッキング効率等)                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## 核となる概念：IslandRegion

TexTransCore の `IslandTransform` パターンを応用。

```typescript
/**
 * テクスチャ内の領域（島）を表現
 * 元位置とアトラス内新位置の対応付けに使用
 */
interface IslandRegion {
  // 元テクスチャ内の位置・サイズ（ピクセル座標）
  sourceTextureIndex: number     // 元のテクスチャインデックス
  sourceX: number                // 元テクスチャ内の X 位置
  sourceY: number                // 元テクスチャ内の Y 位置
  sourceWidth: number            // 元テクスチャ内の幅
  sourceHeight: number           // 元テクスチャ内の高さ

  // アトラス内の新位置・サイズ（ピクセル座標）
  targetX: number                // アトラス内の X 位置
  targetY: number                // アトラス内の Y 位置
  targetWidth: number            // アトラス内の幅
  targetHeight: number           // アトラス内の高さ

  // メタデータ
  rotation: number               // 回転角（将来対応）
  padding: number                // パディング幅
}

/**
 * UV 座標の再マッピング計算
 *
 * 重要: テクスチャが物理的に移動した分だけ、
 *       モデルの UV 座標も同じ量だけ移動させる
 */
function remapUVCoordinate(
  oldU: number,                    // 元の U 座標 [0, 1]
  oldV: number,                    // 元の V 座標 [0, 1]
  region: IslandRegion,            // どの島に属しているか
  atlasWidth: number,              // アトラス全体の幅（ピクセル）
  atlasHeight: number,             // アトラス全体の高さ（ピクセル）
): { newU: number; newV: number } {
  // Step 1: 元テクスチャ内でのピクセル座標を計算
  const sourcePixelX = oldU * region.sourceWidth
  const sourcePixelY = oldV * region.sourceHeight

  // Step 2: アトラス内での絶対ピクセル位置を計算
  // = 新島の位置 + (元島内での相対位置)
  const atlasPixelX = region.targetX + sourcePixelX
  const atlasPixelY = region.targetY + sourcePixelY

  // Step 3: アトラス全体の UV 座標に正規化
  const newU = atlasPixelX / atlasWidth
  const newV = atlasPixelY / atlasHeight

  return { newU, newV }
}
```

**同期メカニズムの保証**:
- `sourceWidth / sourceHeight` : 元テクスチャのサイズ
- `targetWidth / targetHeight` : アトラス内のサイズ
- UV の再計算時に、スケーリングは自動的に適用される
- テクスチャピクセル移動量 ≡ UV 移動量（常に同期）

## 実装フェーズ

### Phase 1: 基盤実装（優先度：高）

#### 1.1 型定義の実装 (`src/types.ts`)

```typescript
// テクスチャアトラス化のエラー型
export type AtlasError =
  | { type: 'NO_TEXTURES'; message: string }
  | { type: 'INVALID_SIZE'; message: string }
  | { type: 'PACKING_FAILED'; message: string }
  | { type: 'CANVAS_ERROR'; message: string }
  | { type: 'REMAP_FAILED'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string }

// アトラス化オプション
export interface AtlasOptions {
  maxSize?: number              // 最大アトラスサイズ (デフォルト: 2048)
  padding?: number              // パディング幅 (デフォルト: 4)
  format?: 'png' | 'jpeg'       // 出力形式 (デフォルト: 'png')
}

// アトラス化結果
export interface AtlasResult {
  document: Document            // 更新済み glTF-Transform ドキュメント
  atlasMetadata: {
    width: number              // アトラス幅
    height: number             // アトラス高さ
    textureCount: number       // 統合されたテクスチャ数
    packingEfficiency: number  // パッキング効率 (0-1)
  }
  islandRegions: IslandRegion[] // マッピング情報（デバッグ用）
}

// パッキング結果
export interface PackedRect {
  textureIndex: number
  x: number
  y: number
  width: number
  height: number
  rotated?: boolean            // 将来対応
}
```

#### 1.2 Canvas ユーティリティ (`src/utils/canvas.ts`)

```typescript
/**
 * ブラウザ・Node.js 両環境で動作する Canvas 作成
 */
export function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | Canvas {
  if (typeof document !== 'undefined') {
    // ブラウザ環境
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  } else {
    // Node.js 環境
    return new Canvas(width, height)
  }
}

export function getCanvasContext(
  canvas: HTMLCanvasElement | Canvas,
): CanvasRenderingContext2D {
  return canvas.getContext('2d')!
}

export async function canvasToImageData(
  canvas: HTMLCanvasElement | Canvas,
): Promise<ImageData> {
  const ctx = getCanvasContext(canvas)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export async function canvasToDataURL(
  canvas: HTMLCanvasElement | Canvas,
  type: string = 'image/png',
): Promise<string> {
  // ブラウザ環境
  if ('toDataURL' in canvas) {
    return canvas.toDataURL(type)
  }
  // Node.js 環境 (canvas パッケージ)
  return (canvas as any).toDataURL(type)
}
```

#### 1.3 Bin Packing アルゴリズム (`src/atlas/packer.ts`)

```typescript
/**
 * MaxRects Bin Packing アルゴリズム（簡易版）
 * 複数のテクスチャを指定サイズのキャンバスに効率的に配置
 */
export class BinPacker {
  private width: number
  private height: number
  private usedRectangles: Rect[] = []
  private freeRectangles: Rect[] = []

  constructor(width: number, height: number, padding: number = 0) {
    this.width = width
    this.height = height
    this.freeRectangles = [{ x: 0, y: 0, width, height }]
  }

  /**
   * 複数の矩形を配置
   * @param sizes 配置対象の矩形サイズ配列
   * @returns 配置結果 { x, y, width, height }[]
   */
  pack(sizes: { width: number; height: number }[]): PackedRect[] {
    const results: PackedRect[] = []

    for (let i = 0; i < sizes.length; i++) {
      const best = this.findBestPosition(sizes[i].width, sizes[i].height)
      if (!best) {
        throw new Error(`Cannot pack texture ${i}: size too large`)
      }
      results.push({
        textureIndex: i,
        x: best.x,
        y: best.y,
        width: sizes[i].width,
        height: sizes[i].height,
      })
      this.addUsedRectangle(best)
    }

    return results
  }

  private findBestPosition(
    width: number,
    height: number,
  ): Rect | null {
    // 最適フィッティング: スコアが最小の空き領域を選択
    let best: Rect | null = null
    let bestScore = Number.MAX_VALUE

    for (const free of this.freeRectangles) {
      if (free.width >= width && free.height >= height) {
        const score = Math.min(free.width - width, free.height - height)
        if (score < bestScore) {
          best = { x: free.x, y: free.y, width, height }
          bestScore = score
        }
      }
    }

    return best
  }

  private addUsedRectangle(rect: Rect): void {
    this.usedRectangles.push(rect)
    this.splitFreeRectangles(rect)
  }

  private splitFreeRectangles(usedRect: Rect): void {
    const newFree: Rect[] = []

    for (const free of this.freeRectangles) {
      // 重なりがない場合はそのまま
      if (!this.intersect(free, usedRect)) {
        newFree.push(free)
        continue
      }

      // 水平・垂直スプリット
      if (free.x < usedRect.x) {
        newFree.push({
          x: free.x,
          y: free.y,
          width: usedRect.x - free.x,
          height: free.height,
        })
      }
      if (free.x + free.width > usedRect.x + usedRect.width) {
        newFree.push({
          x: usedRect.x + usedRect.width,
          y: free.y,
          width: free.x + free.width - (usedRect.x + usedRect.width),
          height: free.height,
        })
      }
      if (free.y < usedRect.y) {
        newFree.push({
          x: free.x,
          y: free.y,
          width: free.width,
          height: usedRect.y - free.y,
        })
      }
      if (free.y + free.height > usedRect.y + usedRect.height) {
        newFree.push({
          x: free.x,
          y: usedRect.y + usedRect.height,
          width: free.width,
          height: free.y + free.height - (usedRect.y + usedRect.height),
        })
      }
    }

    this.freeRectangles = newFree
  }

  private intersect(a: Rect, b: Rect): boolean {
    return !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    )
  }
}

export async function packTextures(
  textures: { width: number; height: number }[],
  maxSize: number = 2048,
  padding: number = 4,
): Promise<{ packed: PackedRect[]; atlasWidth: number; atlasHeight: number }> {
  // パディング考慮してパック
  const withPadding = textures.map((t) => ({
    width: t.width + padding * 2,
    height: t.height + padding * 2,
  }))

  const packer = new BinPacker(maxSize, maxSize, padding)
  const packed = packer.pack(withPadding)

  // アトラスの実際のサイズを計算
  let atlasWidth = 0
  let atlasHeight = 0
  for (const rect of packed) {
    atlasWidth = Math.max(atlasWidth, rect.x + rect.width)
    atlasHeight = Math.max(atlasHeight, rect.y + rect.height)
  }

  return {
    packed,
    atlasWidth,
    atlasHeight,
  }
}
```

#### 1.4 アトラス化メイン処理 (`src/atlas/atlasTexture.ts`)

```typescript
/**
 * glTF-Transform ドキュメント内のテクスチャをアトラス化
 * CPU + Canvas API による実装
 */
export function atlasTexturesInDocument(
  document: Document,
  options: AtlasOptions = {},
): ResultAsync<AtlasResult, AtlasError> {
  const maxSize = options.maxSize ?? 2048
  const padding = options.padding ?? 4

  return ResultAsync.fromPromise(
    _atlasImpl(document, maxSize, padding),
    (error) => ({
      type: 'UNKNOWN_ERROR' as const,
      message: `Atlas failed: ${String(error)}`,
    }),
  )
}

/**
 * 実装詳細
 */
async function _atlasImpl(
  document: Document,
  maxSize: number,
  padding: number,
): Promise<AtlasResult> {
  // Stage 1: テクスチャ抽出
  const textures = document.getRoot().listTextures()
  if (textures.length === 0) {
    throw new Error('NO_TEXTURES')
  }

  // Stage 1: 各テクスチャから画像を抽出
  const textureImages = await Promise.all(
    textures.map((texture) => _extractTextureImage(texture)),
  )

  // Stage 1: Bin Packing で配置計算
  const packedResult = await packTextures(
    textureImages.map((img) => ({ width: img.width, height: img.height })),
    maxSize,
    padding,
  )

  // Stage 2: Canvas でテクスチャを統合
  const atlasCanvas = createCanvas(
    packedResult.atlasWidth,
    packedResult.atlasHeight,
  )
  const ctx = getCanvasContext(atlasCanvas)

  // 背景をクリア
  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, packedResult.atlasWidth, packedResult.atlasHeight)

  // IslandRegion[] を構築しながら描画
  const islandRegions: IslandRegion[] = []

  for (let i = 0; i < packedResult.packed.length; i++) {
    const packed = packedResult.packed[i]
    const image = textureImages[i]
    const originalTexture = textures[i]

    // Canvas に描画
    const imageData = new ImageData(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height,
    )
    ctx.putImageData(imageData, packed.x, packed.y)

    // IslandRegion を記録
    islandRegions.push({
      sourceTextureIndex: i,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: image.width,
      sourceHeight: image.height,
      targetX: packed.x,
      targetY: packed.y,
      targetWidth: packed.width,
      targetHeight: packed.height,
      rotation: 0,
      padding,
    })
  }

  // Stage 3: glTF-Transform ドキュメント更新
  await _updateDocumentWithAtlas(
    document,
    atlasCanvas,
    islandRegions,
    packedResult.atlasWidth,
    packedResult.atlasHeight,
  )

  // パッキング効率を計算
  const usedArea = islandRegions.reduce(
    (sum, r) => sum + r.targetWidth * r.targetHeight,
    0,
  )
  const totalArea = packedResult.atlasWidth * packedResult.atlasHeight
  const efficiency = usedArea / totalArea

  return {
    document,
    atlasMetadata: {
      width: packedResult.atlasWidth,
      height: packedResult.atlasHeight,
      textureCount: textures.length,
      packingEfficiency: efficiency,
    },
    islandRegions,
  }
}

/**
 * テクスチャから画像データを抽出
 */
async function _extractTextureImage(
  texture: Texture,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  // TODO: glTF-Transform API で画像を取得・デコード
  // 仮実装: throw
  throw new Error('Not implemented: texture extraction')
}

/**
 * glTF-Transform ドキュメントをアトラス情報で更新
 */
async function _updateDocumentWithAtlas(
  document: Document,
  atlasCanvas: HTMLCanvasElement | Canvas,
  islandRegions: IslandRegion[],
  atlasWidth: number,
  atlasHeight: number,
): Promise<void> {
  // TODO: 実装
  // 1. アトラス画像をテクスチャとして追加
  // 2. すべての Primitive の TEXCOORD_0 を再計算
  // 3. マテリアル参照を新テクスチャに更新
  // 4. 不要なテクスチャを削除
}
```

### Phase 2: UV 再マッピング実装（優先度：高）

- UV 座標再計算ロジックの実装
- すべての Primitive への適用
- マテリアル参照の統合

### Phase 3: テスト＆検証（優先度：高）

- ユニットテスト（Bin Packing 等）
- 手動確認スクリプト
- VRM モデルでの動作確認

### Phase 4: 最適化＆ドキュメント（優先度：中）

- パフォーマンス測定
- エッジケース対応
- API ドキュメント完成

## 重要な実装ポイント

1. **IslandRegion の正確性**
   - 元位置と新位置の対応を正確に管理
   - スケーリング・回転情報を含める

2. **UV 再マッピング計算の正確性**
   - 浮動小数点計算による誤差に注意
   - すべてのテクスチャピクセルが正確に対応

3. **テクスチャ参照の統合**
   - 複数のマテリアルが同じテクスチャを参照する場合への対応
   - 参照カウントによる削除判定

4. **メモリ効率**
   - 大きなテクスチャの処理時は段階的に処理
   - Canvas 生成後の即座な破棄

## テスト戦略

```typescript
// __tests__/atlas.test.ts
describe('Atlas Texturing', () => {
  it('should pack rectangles without overlap', async () => {
    const sizes = [
      { width: 512, height: 512 },
      { width: 256, height: 256 },
      { width: 1024, height: 512 },
    ]
    const result = await packTextures(sizes, 2048, 4)
    // 重なりがないことを確認
    expect(validateNoOverlap(result.packed)).toBe(true)
  })

  it('should remap UV coordinates correctly', () => {
    const region: IslandRegion = {
      sourceTextureIndex: 0,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 512,
      sourceHeight: 512,
      targetX: 0,
      targetY: 0,
      targetWidth: 512,
      targetHeight: 512,
      rotation: 0,
      padding: 0,
    }
    const { newU, newV } = remapUVCoordinate(0.5, 0.5, region, 2048, 2048)
    expect(newU).toBeCloseTo(0.5 * 512 / 2048)
    expect(newV).toBeCloseTo(0.5 * 512 / 2048)
  })
})
```

## デザイン根拠：CPU ベース実装の選択

### Canvas API を使用する理由

1. **環境互換性**
   - ブラウザ・Node.js 両環境で動作
   - WebGPU は Safari で未対応、互換性に課題

2. **パフォーマンス**
   - 小～中規模モデル（テクスチャ数 < 10）では CPU が高速
   - GPU のメリットは大規模処理（1000+ テクスチャ）時のみ

3. **メモリ転送効率**
   - テクスチャ → GPU メモリアップロード → 処理 → ダウンロードが不要
   - メモリ内で処理完結

4. **オフライン処理**
   - VRM ファイル最適化は通常、アップロード時の 1 回限り
   - リアルタイム性は不要、GPU 初期化オーバーヘッドが無駄

### 将来的な GPU 移行

リアルタイム処理が必須になった場合、TypeGPU での実装移行を検討:

```typescript
// 将来の GPU パイプライン（オプション）
if (isRealtimeProcessing && textureCount > 1000) {
  // TypeGPU で画像合成 + UV 再マッピングを統合実行
  const result = await processAllOnGPU(gpuTextures)
}
```

# WebGPU JSブリッジ実装プラン

**作成日**: 2025-11-10
**バージョン**: Phase 1 (基盤実装)
**状況**: 計画段階

## 概要

TexTransCore を .NET 10 browser-wasm で WASM ビルドする際、GPU ComputeShader にアクセスするため、JavaScript ブリッジ経由で WebGPU API を呼び出すための設計・実装プラン。

.NET 10 browser-wasm (Mono) では C++ Emscripten ライブラリの統合が困難なため、JSImport/JSExport 属性を使用した JavaScript ブリッジアプローチを採用。

## 実装範囲

### Phase 1: 基盤実装のみ

本フェーズでは、WebGPU へのアクセス基盤を構築します:

**実装項目**:
- [x] JavaScript WebGPU ラッパー（デバイス初期化、リソース管理）
- [x] C# JSImport バインディング
- [x] ITTRenderTexture / ITTStorageBuffer の部分実装
- [ ] ComputeShader 実行（Phase 2）
- [ ] テクスチャ/バッファのアップロード・ダウンロード（Phase 2）
- [ ] ブラウザ統合テスト（Phase 2-3）

### 配置場所

```
third-party/TexTransCore/
├── src/webgpu/              # JavaScript/TypeScript
└── src/WebGPUBridge/        # C# JSImport バインディング
```

## 技術背景

### .NET 10 browser-wasm の制限

**.NET 10 browser-wasm** (Mono ベース) では:
- ✅ JavaScript 相互運用: JSImport/JSExport 属性でサポート
- ✅ Span<T> メモリシェアリング: `[JSMarshalAs<JSType.MemoryView>]` でサポート
- ❌ C++ Emscripten ライブラリ: P/Invoke での統合が困難
- ❌ WebGPU 直接バインディング: native WASM API が存在しない

**結論**: JavaScript ブリッジ経由で WebGPU API にアクセスするのが最適。

### JSImport/JSExport の特徴

| 機能 | 説明 |
|------|------|
| JSImport | JavaScript 関数を C# から呼び出す |
| JSExport | C# メソッドを JavaScript から呼び出し可能にする |
| 非同期相互運用 | Task ↔ Promise の自動マーシャリング |
| メモリシェアリング | Span<T> をメモリビュー経由でシェア（コピーなし） |
| JSPI サポート | JavaScript Promise Integration で同期的 C# コードと非同期 JS の統合 |

## アーキテクチャ

### データフロー

```
C# (TexTransCore)
    ↓
JSImport バインディング (WebGPUBridge.cs)
    ↓
JavaScript WebGPU ラッパー (webgpu-bridge.ts)
    ↓
WebGPU API (navigator.gpu.*)
    ↓
GPU (ComputeShader, Texture, Buffer)
```

### リソース管理

**JavaScript 側**:
- ResourceRegistry: Map<ID, GPUResource> でリソースを管理
- ID: 1, 2, 3, ... の順序で発行（32-bit int）
- リソース破棄: C# 側の Dispose から DestroyResource(id) を呼び出し

**C# 側**:
- WebGPURenderTexture: `private int _jsHandle` でリソース ID を保持
- Dispose() 時に JavaScript の DestroyResource を呼び出し
- IDisposable パターンに準拠

## 実装詳細

### 1. JavaScript/TypeScript ファイル

#### ファイル構成

```
third-party/TexTransCore/src/webgpu/
├── webgpu-bridge.ts         # メインエントリーポイント
├── device-manager.ts        # GPUDevice 初期化・管理
├── resource-registry.ts     # リソース ID 管理
├── texture-manager.ts       # GPUTexture 作成・破棄
├── buffer-manager.ts        # GPUBuffer 作成・破棄
└── types.ts                 # WebGPU 型定義
```

#### webgpu-bridge.ts（メインエントリーポイント）

```typescript
// C# から JSImport で呼び出される関数をエクスポート
export const webgpu = {
  async initializeDevice(): Promise<boolean> { ... },
  createTexture(width: number, height: number, format: number): number { ... },
  destroyTexture(handle: number): void { ... },
  allocateBuffer(size: number, usage: number): number { ... },
  destroyBuffer(handle: number): void { ... },
};
```

**責務**:
- Device の初期化
- リソースマネージャーのインスタンス化
- C# との関数インターフェース定義

#### device-manager.ts

```typescript
export class WebGPUDeviceManager {
  private device: GPUDevice | null = null;

  async initialize(): Promise<boolean> {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return false;
    this.device = await adapter.requestDevice();
    return true;
  }

  getDevice(): GPUDevice {
    if (!this.device) throw new Error('WebGPU device not initialized');
    return this.device;
  }

  destroy(): void {
    // WebGPU では明示的な destroy は不要だが、リソース参照をクリア
    this.device = null;
  }
}
```

**責務**:
- WebGPU Device の生成と管理
- GPU ドライバの初期化

#### resource-registry.ts

```typescript
export class ResourceRegistry<T> {
  private resources = new Map<number, T>();
  private nextId = 1;

  allocate(resource: T): number {
    const id = this.nextId++;
    this.resources.set(id, resource);
    return id;
  }

  get(id: number): T {
    const resource = this.resources.get(id);
    if (!resource) throw new Error(`Resource ${id} not found`);
    return resource;
  }

  free(id: number): void {
    this.resources.delete(id);
  }

  clear(): void {
    this.resources.clear();
  }
}
```

**責務**:
- リソース（テクスチャ、バッファ）の ID 管理
- リソース参照のハンドリング

#### texture-manager.ts

```typescript
export class WebGPUTextureManager {
  private registry: ResourceRegistry<GPUTexture>;
  private device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
    this.registry = new ResourceRegistry();
  }

  createTexture(width: number, height: number, format: GPUTextureFormat): number {
    const texture = this.device.createTexture({
      size: { width, height },
      format,
      usage: GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.COPY_SRC |
             GPUTextureUsage.COPY_DST,
    });
    return this.registry.allocate(texture);
  }

  destroyTexture(handle: number): void {
    const texture = this.registry.get(handle);
    texture.destroy();
    this.registry.free(handle);
  }

  getTexture(handle: number): GPUTexture {
    return this.registry.get(handle);
  }
}
```

**責務**:
- GPUTexture の作成・破棄
- テクスチャメタデータの管理

#### buffer-manager.ts

```typescript
export class WebGPUBufferManager {
  private registry: ResourceRegistry<GPUBuffer>;
  private device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
    this.registry = new ResourceRegistry();
  }

  allocateBuffer(size: number, usage: GPUBufferUsageFlags): number {
    const buffer = this.device.createBuffer({
      size,
      usage,
      mappedAtCreation: false,
    });
    return this.registry.allocate(buffer);
  }

  destroyBuffer(handle: number): void {
    const buffer = this.registry.get(handle);
    buffer.destroy();
    this.registry.free(handle);
  }

  getBuffer(handle: number): GPUBuffer {
    return this.registry.get(handle);
  }
}
```

**責務**:
- GPUBuffer の作成・破棄
- バッファ使用フラグの管理

### 2. C# JSImport バインディング

#### ファイル構成

```
third-party/TexTransCore/src/WebGPUBridge/
├── WebGPUBridge.cs           # JSImport 関数定義
├── WebGPUDevice.cs           # ITexTransCoreEngine 部分実装
├── WebGPURenderTexture.cs   # ITTRenderTexture 実装
├── WebGPUStorageBuffer.cs   # ITTStorageBuffer 実装
└── WebGPUException.cs       # 例外クラス
```

#### WebGPUBridge.cs

```csharp
using System.Runtime.InteropServices.JavaScript;

namespace net.rs64.TexTransCore.WebGPU;

/// <summary>
/// JavaScript WebGPU ブリッジの JSImport 関数定義
/// </summary>
internal static partial class WebGPUBridge
{
    [JSImport("webgpu.initializeDevice", "webgpu-bridge.js")]
    internal static partial Task<bool> InitializeDeviceAsync();

    [JSImport("webgpu.createTexture", "webgpu-bridge.js")]
    internal static partial int CreateTexture(int width, int height, int format);

    [JSImport("webgpu.destroyTexture", "webgpu-bridge.js")]
    internal static partial void DestroyTexture(int handle);

    [JSImport("webgpu.allocateBuffer", "webgpu-bridge.js")]
    internal static partial int AllocateBuffer(int size, int usage);

    [JSImport("webgpu.destroyBuffer", "webgpu-bridge.js")]
    internal static partial void DestroyBuffer(int handle);
}
```

**責務**:
- JavaScript WebGPU 関数の C# インターフェース定義
- JSImport 属性による自動バインディング
- 型マーシャリングの自動化

#### WebGPUDevice.cs

```csharp
namespace net.rs64.TexTransCore.WebGPU;

/// <summary>
/// ITexTransCoreEngine の WebGPU 実装（部分実装）
/// </summary>
public class WebGPUDevice : ITexTransCreateTexture, ITexTransDriveStorageBufferHolder
{
    private bool _initialized = false;

    public async Task InitializeAsync()
    {
        _initialized = await WebGPUBridge.InitializeDeviceAsync();
        if (!_initialized)
            throw new WebGPUException("Failed to initialize WebGPU device");
    }

    // ITexTransCreateTexture の実装
    public ITTRenderTexture CreateRenderTexture(
        int width,
        int height,
        TexTransCoreTextureChannel channel = TexTransCoreTextureChannel.RGBA)
    {
        if (!_initialized)
            throw new InvalidOperationException("Device not initialized");

        var format = GetFormatCode(channel);
        return new WebGPURenderTexture(width, height, channel);
    }

    // ITexTransDriveStorageBufferHolder の実装
    public ITTStorageBuffer AllocateStorageBuffer<T>(int length, bool downloadable = false)
        where T : unmanaged
    {
        if (!_initialized)
            throw new InvalidOperationException("Device not initialized");

        int byteSize = length * Marshal.SizeOf<T>();
        return new WebGPUStorageBuffer(byteSize);
    }

    public ITTStorageBuffer UploadStorageBuffer<T>(ReadOnlySpan<T> data, bool downloadable = false)
        where T : unmanaged
    {
        // Phase 2: アップロード機能実装
        throw new NotImplementedException("Use AllocateStorageBuffer in Phase 1");
    }

    public void DownloadBuffer<T>(Span<T> dist, ITTStorageBuffer takeToFrom) where T : unmanaged
    {
        // Phase 2: ダウンロード機能実装
        throw new NotImplementedException("Available in Phase 2");
    }

    private static int GetFormatCode(TexTransCoreTextureChannel channel)
    {
        // GPU テクスチャフォーマットコード（WebGPU 側で定義）
        return (int)channel; // 簡略版
    }
}
```

**責務**:
- WebGPU Device の C# ラッパー
- ITexTransCoreEngine インターフェースの部分実装
- リソース初期化とライフサイクル管理

#### WebGPURenderTexture.cs

```csharp
namespace net.rs64.TexTransCore.WebGPU;

/// <summary>
/// ITTRenderTexture の WebGPU 実装
/// </summary>
public class WebGPURenderTexture : ITTRenderTexture
{
    private readonly int _jsHandle;
    private bool _disposed = false;

    public int Width { get; }
    public int Hight { get; }
    public TexTransCoreTextureChannel ContainsChannel { get; }
    public string Name { get; set; } = "";

    public WebGPURenderTexture(int width, int height, TexTransCoreTextureChannel channel)
    {
        Width = width;
        Hight = height;
        ContainsChannel = channel;

        var format = (int)channel;
        _jsHandle = WebGPUBridge.CreateTexture(width, height, format);
    }

    public void Dispose()
    {
        if (_disposed) return;
        WebGPUBridge.DestroyTexture(_jsHandle);
        _disposed = true;
    }

    internal int GetHandle() => _jsHandle;
}
```

**責務**:
- ITTRenderTexture インターフェースの実装
- JavaScript 側の GPUTexture リソースのラッピング
- リソース破棄の確実な実行

#### WebGPUStorageBuffer.cs

```csharp
namespace net.rs64.TexTransCore.WebGPU;

/// <summary>
/// ITTStorageBuffer の WebGPU 実装
/// </summary>
public class WebGPUStorageBuffer : ITTStorageBuffer
{
    private readonly int _jsHandle;
    private bool _disposed = false;

    public int SizeInBytes { get; }

    public WebGPUStorageBuffer(int sizeInBytes)
    {
        SizeInBytes = sizeInBytes;
        const int usage = (int)(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
        _jsHandle = WebGPUBridge.AllocateBuffer(sizeInBytes, usage);
    }

    public void Dispose()
    {
        if (_disposed) return;
        WebGPUBridge.DestroyBuffer(_jsHandle);
        _disposed = true;
    }

    internal int GetHandle() => _jsHandle;
}
```

**責務**:
- ITTStorageBuffer インターフェースの実装
- JavaScript 側の GPUBuffer リソースのラッピング

#### WebGPUException.cs

```csharp
namespace net.rs64.TexTransCore.WebGPU;

/// <summary>
/// WebGPU ブリッジ固有の例外
/// </summary>
[Serializable]
public class WebGPUException : Exception
{
    public WebGPUException() { }
    public WebGPUException(string message) : base(message) { }
    public WebGPUException(string message, Exception inner) : base(message, inner) { }

    protected WebGPUException(
        System.Runtime.Serialization.SerializationInfo info,
        System.Runtime.Serialization.StreamingContext context)
        : base(info, context) { }
}
```

### 3. ビルド設定

#### TypeScript ビルド設定

**tsup.config.ts** (TexTransCore ルートに新規作成):

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'webgpu-bridge': 'src/webgpu/webgpu-bridge.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  outDir: 'bin/Release/net10.0/browser-wasm/publish/webgpu',
  clean: true,
  external: ['@webgpu/types'],
});
```

#### package.json 設定

TexTransCore ルートの `package.json` に以下を追加:

```json
{
  "scripts": {
    "build:webgpu": "tsup",
    "build:webgpu:watch": "tsup --watch",
    "build:webgpu:dev": "tsup --sourcemap"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "@webgpu/types": "^0.1.0"
  }
}
```

#### TexTransCore.csproj 設定

```xml
<!-- ビルド前に TypeScript をビルド -->
<Target Name="BuildWebGPUBridge" BeforeTargets="Build">
  <Exec Command="npm run build:webgpu" />
</Target>

<!-- WebGPU JavaScript ファイルを publish に含める -->
<ItemGroup>
  <Content Include="bin/Release/net10.0/browser-wasm/publish/webgpu/**/*"
           CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```

### 4. Program.cs の更新

```csharp
using System.Runtime.InteropServices.JavaScript;

public static class TexTransCoreProgram
{
    [JSImport("globalThis.console.log")]
    internal static partial void ConsoleLog(string message);

    public static async Task Main(string[] args)
    {
        // WebGPU ブリッジモジュールのインポート
        try
        {
            await JSHost.ImportAsync("webgpu", "./webgpu/webgpu-bridge.js");
            ConsoleLog("✅ TexTransCore WASM initialized with WebGPU bridge support");
        }
        catch (Exception ex)
        {
            ConsoleLog($"❌ Failed to import WebGPU bridge: {ex.Message}");
        }
    }
}
```

## 最小限のテスト（動作確認）

### C# テストコード（手動実行用）

```csharp
public class WebGPUBridgeTest
{
    public static async Task Main()
    {
        var device = new WebGPUDevice();
        await device.InitializeAsync();
        Console.WriteLine("✅ WebGPU device initialized");

        // テクスチャ作成
        var texture = device.CreateRenderTexture(512, 512);
        Console.WriteLine($"✅ Created texture: {texture.Width}x{texture.Hight}");

        // バッファ作成
        var buffer = device.AllocateStorageBuffer<uint>(1024);
        Console.WriteLine($"✅ Allocated buffer: {buffer.SizeInBytes} bytes");

        // リソース破棄
        texture.Dispose();
        buffer.Dispose();
        Console.WriteLine("✅ Resources disposed");
    }
}
```

## 依存関係

### TypeScript
- `tsup@^8.0.0`: ビルドツール
- `typescript@^5.0.0`: TypeScript コンパイラ
- `@webgpu/types@^0.1.0`: WebGPU 型定義

### C#
- `.NET 10.0 RC2` 以上

### ブラウザ要件
- Chrome 113+ / Edge 113+ (WebGPU サポート)
- Firefox 139+ (JSPI サポート)

## 既知の制限と注意点

### Phase 1 の制限

1. **ComputeShader 実行**: 実装されていない（Phase 2）
2. **データ転送**: テクスチャ/バッファのアップロード・ダウンロード未実装（Phase 2）
3. **完全な ITTEngine 実装**: 部分実装のため、CPU 処理専用（Phase 2 以降で GPU 機能追加）

### メモリ管理

- WASM 線形メモリは 4GB 制限
- 大きなテクスチャは複数回に分割してアップロード必要（Phase 2 で対応予定）

### デバッグ

- JavaScript ↔ C# 境界のデバッグは複雑
- Chrome DevTools で WebGPU API 呼び出しは確認可能
- C# WASM スタックトレースは限定的

## 次のステップ（Phase 2）

1. **ComputeShader 実行の実装**
   - WGSL シェーダーコンパイル
   - BindGroup 管理
   - ディスパッチロジック

2. **データ転送の実装**
   - テクスチャアップロード（`UploadTexture()`, `DownloadTexture()`）
   - バッファアップロード（`UploadStorageBuffer()`, `DownloadBuffer()`）

3. **統合テスト**
   - ブラウザ実行テスト
   - パフォーマンス測定
   - エッジケース対応

4. **npm パッケージ化**
   - `@xrift/textrans-core` として公開準備

## 参考リソース

- [.NET JSImport/JSExport (Microsoft Learn)](https://learn.microsoft.com/en-us/aspnet/core/client-side/dotnet-interop/)
- [WebGPU Specification](https://gpuweb.github.io/gpuweb/)
- [JSPI (V8 Blog)](https://v8.dev/blog/jspi)
- [tsup Documentation](https://tsup.egoist.dev/)

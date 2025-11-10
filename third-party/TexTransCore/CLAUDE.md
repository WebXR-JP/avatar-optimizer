# CLAUDE.md - TexTransCore

このファイルは、TexTransCore (テクスチャ処理 C# ライブラリ) を扱う際に Claude Code へ のガイダンスを提供します。

## プロジェクト概要

**TexTransCore** は VRM モデルのテクスチャ処理に特化した .NET ライブラリです。**Phase 1 (NativeAOT-LLVM 化)** が完了し、現在は `net10.0` で WASM ビルド対応になっています。将来的には componentize-dotnet を使用して JavaScript から直接呼び出せるようになります。

## プロジェクト構成

### スタック

- **.NET**: 10.0 RC2 (Preview) + NativeAOT-LLVM
- **C#**: 12.0
- **MSBuild**: プロジェクトビルドシステム
- **NuGet**: 実験的パッケージソース (dotnet-experimental)

### ディレクトリ構成

```
third-party/TexTransCore/
  ├── TexTransCore.csproj         # プロジェクトファイル (NativeAOT-LLVM 対応)
  ├── TexTransCore.sln            # ソリューションファイル
  ├── textrans.wit                # WIT インターフェース定義 (WASM コンポーネント)
  ├── nuget.config                # NuGet 設定 (実験的パッケージソース)
  ├── src/                        # ソースコード
  │   ├── *.cs                   # C# 実装ファイル
  │   └── [サブディレクトリ]      # 機能別モジュール
  ├── bin/Release/net10.0/wasi-wasm/  # WASM ビルド出力 (git追跡外)
  │   └── publish/               # Publish 出力 (DLL + deps.json)
  │   └── publish/               # Publish 出力 (DLL + deps.json)
  ├── obj/                        # ビルド中間ファイル (git追跡外)
  ├── LICENSE.md                  # ライセンス
  └── README.md                   # プロジェクト説明
```

## 開発コマンド

```bash
# .NET 10 RC2 への PATH 設定（初回のみ）
export PATH="$HOME/.dotnet:$HOME/.wasmtime/bin:$PATH"

# 推奨: フルパス使用（PATH 設定が引き継がれやすい）
/home/halby/.dotnet/dotnet build -c Release

# プロジェクトのビルド (.NET 10 で自動的に wasi-wasm ターゲット)
dotnet build

# リリースビルド (WASM ターゲット) - Linux/macOS ではここまで
dotnet build -c Release

# WIT バインディング確認（自動生成）
ls -la obj/Release/net10.0/wasi-wasm/wit_bindgen/

# WASM Publish (DLL + 依存関係) - 現在 componentize-dotnet のターゲット制限で失敗
# dotnet publish -c Release -r wasi-wasm

# クリーンビルド
dotnet clean && dotnet build -c Release

# 標準 .NET ライブラリとしてのビルド
dotnet build -p:RuntimeIdentifier=""

# 🪟 Windows のみ: NativeAOT-LLVM WASM コンパイル
# PowerShell で実行: $env:PATH = "$env:USERPROFILE\.dotnet;$env:PATH"
# dotnet build -c Release  # WASM バイナリ生成
```

### ビルド出力の確認

```bash
# マネージド DLL 確認（Linux/macOS/Windows で利用可能）
ls -lh bin/Release/net10.0/wasi-wasm/TexTransCore.dll

# WIT バインディング確認（自動生成）
ls -la obj/Release/net10.0/wasi-wasm/wit_bindgen/

# WASM ネイティブバイナリ（Windows のみ）
ls -lh bin/Release/net10.0/wasi-wasm/native/  # 生成されていない (Linux/macOS)
```

## WASM 化ロードマップ

### 進捗状況

#### Phase 1: NativeAOT-LLVM 化 ✅ 完了

TexTransCore は **Phase 1** で以下の更新が完了しました:

- ✅ **.NET 10 RC2 (Preview)** への更新
- ✅ **NativeAOT-LLVM ターゲット** (wasi-wasm) への対応
- ✅ **WIT インターフェース定義** (`textrans.wit`) の作成
- ✅ **nuget.config** による実験的パッケージソースの設定
- ✅ **WASM ビルド・Publish** の成功確認
- ✅ **ILLink エラー修正** (PublishTrimmed/TrimmerSingleWarn設定)

**出力**:
- `bin/Release/net10.0/wasi-wasm/TexTransCore.dll` (マネージド DLL)
- `bin/Release/net10.0/wasi-wasm/publish/` (Publish 出力)

#### Phase 2: componentize-dotnet 統合 🟡 進行中

**実装完了**:
- ✅ **BytecodeAlliance.Componentize.DotNet.Wasm.SDK v0.7.0-preview00010** インストール
- ✅ **wit-bindgen による自動バインディング生成**
  - `TextransComponentWorld.wit.exports.textrans.core.v0_1_0.ICore` インターフェース
  - `CoreInterop` interop レイヤー
  - `TextureResource` resource パターン実装
- ✅ **src/WasmComponent.cs で CoreImpl 実装**
  - テクスチャリソース管理 (作成・破棄・検証)
  - メモリ制限チェック (256MB/テクスチャ)
  - グローバル using による型解決
- ✅ **プロジェクト設定の最適化**
  - `PublishTrimmed=true` による NativeAOT-LLVM 対応
  - `MSBuildEnableWorkloadResolver=false` で componentize-dotnet の最適化

**WIT バインディング出力** (自動生成):
```
obj/Release/net10.0/wasi-wasm/wit_bindgen/
  ├── TextransComponent.cs
  ├── TextransComponentWorld.wit.exports.textrans.core.v0_1_0.CoreInterop.cs
  ├── TextransComponentWorld.wit.exports.textrans.core.v0_1_0.ICore.cs
  ├── TextransComponentWorld_component_type.wit
  └── TextransComponentWorld_wasm_import_linkage_attribute.cs
```

**未実装 (プラットフォーム制限)**:
- ⚠️ **NativeAOT-LLVM WASM コンパイル** (Windows のみサポート)
  - Linux/macOS では ilc コンパイラ不可
  - Windows CI/CD パイプラインで実行予定

### Phase 2 以降の課題

1. **WASM 互換性の低さ**: Unity 向けに設計されており、WASM ランタイムが提供しない機能に依存している可能性あり
2. **ファイル I/O**: OS ファイルシステムへの直接アクセスが必要な場合、WASM では制限される
3. **メモリ管理**: WASM の線形メモリ（4GB 制限）に対応する必要がある
4. **パフォーマンス**: WASM での実行速度が要件を満たすか検証が必要

### 実装完了: componentize-dotnet による WIT コンポーネント化

NativeAOT-LLVM + WebAssembly Interface Types (WIT) による実装が完了しました。

**実装ファイル**:
- `textrans.wit`: WIT インターフェース定義（既存）
- `src/WasmComponent.cs`: CoreImpl 実装（新規）
- `src/GlobalUsings.cs`: グローバル using 指示文（新規）

**実装例** (src/WasmComponent.cs):
```csharp
using System;
using System.Collections.Generic;
using TextransComponentWorld.wit.exports.textrans.core.v0_1_0;

/// <summary>
/// WASM component implementation of the textrans:core interface.
/// </summary>
public static class CoreImpl
{
    public class TextureResource : ICore.TextureResource, ICore.ITextureResource
    {
        // テクスチャメタデータ (width, height, channel, memory_size)
        public uint Width() { /* ... */ }
        public uint Height() { /* ... */ }
        public uint MemorySize() { /* ... */ }
    }

    // 静的メソッド（WIT component model 仕様）
    public static string GetVersion() => "1.0.0";
    public static string GetName() => "TexTransCore";
    public static uint CreateRenderTexture(uint width, uint height, byte channel) { /* ... */ }
    public static void DisposeRenderTexture(uint id) { /* ... */ }
    public static bool IsTextureValid(uint id) { /* ... */ }
    public static (uint, uint, byte, uint) GetTextureInfo(uint id) { /* ... */ }
}
```

**WIT インターフェース** (textrans.wit - 既存):
```wit
interface core {
  type render-texture-id = u32;
  type texture-channel = u8;

  resource texture-resource {
    width: func() -> u32;
    height: func() -> u32;
    memory-size: func() -> u32;
  }

  get-version: func() -> string;
  get-name: func() -> string;
  create-render-texture: func(width: u32, height: u32, channel: texture-channel) -> result<render-texture-id, string>;
  dispose-render-texture: func(id: render-texture-id);
  is-texture-valid: func(id: render-texture-id) -> bool;
  get-texture-info: func(id: render-texture-id) -> result<tuple<u32, u32, u8, u32>, string>;
}

world textrans-component {
  export core;
}
```

### WASM 化実装チェックリスト

WASM 化を実装する際は、以下のチェックリストを参照：

- [ ] **1. 依存関係の調査**
  - [ ] System.IO などの OS 依存機能の識別
  - [ ] 外部 NuGet パッケージの WASM 互換性確認
  - [ ] Unity 固有の API の削除/置き換え

- [ ] **2. インターフェース設計**
  - [ ] JavaScript 呼び出し用パブリック API の定義
  - [ ] WIT 定義またはネイティブアドオン署名の作成

- [ ] **3. テストの準備**
  - [ ] ユニットテストで基本機能を検証
  - [ ] パフォーマンステストで WASM の性能を確認

- [ ] **4. ビルド設定**
  - [ ] WASM ランタイムの設定 (Mono AOT / NativeAOT)
  - [ ] ビルドスクリプトの作成

- [ ] **5. JavaScript 統合**
  - [ ] WebAssembly ローダーの実装
  - [ ] メモリ管理とリソース解放

- [ ] **6. CI/CD パイプライン**
  - [ ] WASM ビルドステップの追加
  - [ ] ブラウザテストの自動化

### Phase 2 実装計画

**Phase 2 進捗状況:**

1. **componentize-dotnet の統合** ✅ 完了
   - ✅ BytecodeAlliance.Componentize.DotNet.Wasm.SDK v0.7.0-preview00010 インストール
   - ✅ WIT インターフェース実装 (textrans.wit)
   - ✅ C# バインディング自動生成 (wit-bindgen)
   - ✅ CoreImpl WIT component 実装

2. **NativeAOT-LLVM ビルド完成化** 🟡 進行中
   - ⚠️ Windows 環境での WASM バイナリ生成
     - ilc コンパイラは Windows のみ利用可能
     - GitHub Actions ワークフローで Windows ランナー使用予定
   - [ ] dist/textrans-core.wasm 生成
   - [ ] ファイルサイズ最適化

3. **JavaScript ローダー実装** ⏳ 予定
   - [ ] WASM モジュールローダー (dist/textrans-core.js)
   - [ ] TypeScript 型定義 (dist/textrans-core.d.ts)
   - [ ] メモリ管理とリソース生存期間管理
   - [ ] エラーハンドリング

4. **vrm-optimizer への統合** ⏳ 予定
   - [ ] WASM モジュールの npm パッケージ化
   - [ ] TypeScript API 設計
   - [ ] E2E テスト (ブラウザ環境)

## 依存関係とバージョン管理

### ターゲットフレームワーク (Phase 1)

- **.NET**: 10.0 RC2 (Preview) + NativeAOT-LLVM
- **C#**: 12.0
- **WASM Runtime**: wasi-wasm (WebAssembly System Interface)

### 外部依存関係

現在のところ、TexTransCore は最小限の外部依存を持つことを目指しています。新しい NuGet パッケージを追加する際は、以下を確認してください：

- WASM 互換性
- ライセンス互換性
- メンテナンス状況

## 開発時の重要なポイント

1. **WASM 互換性を意識**: ファイル I/O や OS 固有機能を避ける
2. **既存実装の保全**: C# コード自体に大きな変更を加えない
3. **ビルド可能性の維持**: WASM 化への道筋を明確にしておく

### Phase 2 開発に関する注意事項

**プラットフォーム別ビルド機能**:
| 機能 | Linux/macOS | Windows |
|------|-----------|---------|
| C# コンパイル | ✅ | ✅ |
| WIT バインディング自動生成 | ✅ | ✅ |
| マネージド DLL (WASM ターゲット) | ✅ | ✅ |
| NativeAOT-LLVM WASM ネイティブ | ❌ | ✅ |
| WASM コンポーネント (wasm ファイル) | ❌ | ✅ |

**Core Implementation (src/WasmComponent.cs) の修正時の注意**:
- `TextureResource` クラスは `ICore.TextureResource` を継承必須
- 静的メソッド（`GetVersion`, `GetName`, `CreateRenderTexture` など）は wit-bindgen の生成コードから直接呼び出される
- ネストされたクラス `CoreImpl.TextureResource` の構造は変更禁止（WIT resource パターン）
- メモリ制限チェック (256MB/テクスチャ) は WASM 互換性の重要要件

**グローバル using の重要性** (src/GlobalUsings.cs):
- wit-bindgen 生成コードに `System`, `System.Collections.Generic` などの using が不足している
- グローバル using により、生成コード側での型解決を支援
- 新しいシステム型を使用する場合は GlobalUsings.cs に追加すること

## ビルド出力

### 現在のビルド出力 (Phase 2 進行中)

**Linux/macOS/Windows で利用可能**:
```bash
# マネージド DLL (WIT バインディング付き)
bin/Release/net10.0/wasi-wasm/TexTransCore.dll         # 75 KB (最適化済み)
bin/Release/net10.0/wasi-wasm/TexTransCore.deps.json   # 依存関係情報

# WIT バインディング (自動生成)
obj/Release/net10.0/wasi-wasm/wit_bindgen/
  ├── TextransComponent.cs                              # WIT component 登録
  ├── TextransComponentWorld.wit.exports.*.CoreInterop.cs   # Interop レイヤー
  ├── TextransComponentWorld.wit.exports.*.ICore.cs     # インターフェース定義
  └── TextransComponentWorld_component_type.wit         # Component metadata
```

**Windows のみで生成** (Windows CI/CD で実行):
```bash
# WASM ネイティブバイナリ (NativeAOT-LLVM コンパイル)
bin/Release/net10.0/wasi-wasm/native/TexTransCore.wasm      # WASM バイナリ
bin/Release/net10.0/wasi-wasm/native/TexTransCore.txt       # ビルドログ
bin/Release/net10.0/wasi-wasm/native/TexTransCore.unopt.il  # 最適化前 IL
```

### Phase 2 完成時の予定出力

```bash
# JavaScript インターフェース
dist/textrans-core.wasm                  # WASM バイナリ (NativeAOT-LLVM)
dist/textrans-core.loader.js             # WASM ローダー
dist/textrans-core.d.ts                  # TypeScript 型定義
dist/textrans-core.component.wit         # WIT コンポーネント定義
```

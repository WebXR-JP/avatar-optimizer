# CLAUDE.md - TexTransCore

このファイルは、TexTransCore (テクスチャ処理 C# ライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

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
  ├── obj/                        # ビルド中間ファイル (git追跡外)
  ├── LICENSE.md                  # ライセンス
  └── README.md                   # プロジェクト説明
```

## 開発コマンド

```bash
# .NET 10 RC2 への PATH 設定（初回のみ）
export PATH="$HOME/.dotnet:$HOME/.wasmtime/bin:$PATH"

# プロジェクトのビルド (.NET 10 で自動的に wasi-wasm ターゲット)
dotnet build

# リリースビルド (WASM ターゲット)
dotnet build -c Release

# WASM Publish (DLL + 依存関係)
dotnet publish -c Release -r wasi-wasm

# クリーンビルド
dotnet clean && dotnet build -c Release

# 標準 .NET ライブラリとしてのビルド
dotnet build -p:RuntimeIdentifier=""
```

## WASM 化ロードマップ

### 現状 (Phase 1: NativeAOT-LLVM 化 完了)

TexTransCore は **Phase 1** で以下の更新が完了しました:

- ✅ **.NET 10 RC2 (Preview)** への更新
- ✅ **NativeAOT-LLVM ターゲット** (wasi-wasm) への対応
- ✅ **WIT インターフェース定義** (`textrans.wit`) の作成
- ✅ **nuget.config** による実験的パッケージソースの設定
- ✅ **WASM ビルド・Publish** の成功確認

**現在の出力**:
- `bin/Release/net10.0/wasi-wasm/TexTransCore.dll` (マネージド DLL)
- `bin/Release/net10.0/wasi-wasm/publish/` (Publish 出力)

**次フェーズ**: Phase 2 では componentize-dotnet を統合し、JavaScript/WebGPU との連携実装を開始予定

### Phase 2 以降の課題

1. **WASM 互換性の低さ**: Unity 向けに設計されており、WASM ランタイムが提供しない機能に依存している可能性あり
2. **ファイル I/O**: OS ファイルシステムへの直接アクセスが必要な場合、WASM では制限される
3. **メモリ管理**: WASM の線形メモリ（4GB 制限）に対応する必要がある
4. **パフォーマンス**: WASM での実行速度が要件を満たすか検証が必要

### 実装状況と推奨アプローチ (Phase 2 以降)

#### 1. **Mono AOT + Emscripten による WASM コンパイル** (最も完全)

C# → IL → Mono AOT コンパイル → ネイティブコード → Emscripten → WASM

**利点**:
- 既存のコードをほぼ変更なしで使用可能
- 完全なランタイムサポート
- パフォーマンスが良い

**課題**:
- Mono ランタイムのバイナリサイズが大きい
- セットアップが複雑

**参考資料**:
- [Mono WASM Support](https://github.com/dotnet/runtime/tree/main/src/mono/wasm)
- [Emscripten ドキュメント](https://emscripten.org/docs/)

#### 2. **componentize-dotnet による WIT コンポーネント化** (推奨)

NativeAOT-LLVM + WebAssembly Interface Types (WIT)

**利点**:
- 言語非依存のインターフェース定義
- バイナリサイズがより小さい
- JavaScript との相互運用がシンプル

**課題**:
- インターフェース定義作成が必要
- componentize-dotnet はまだ実験的

**実装ステップ**:
```csharp
// src/ITextureProcessor.cs
namespace TexTransCore;

/// <summary>
/// WIT インターフェース定義
/// </summary>
public interface ITextureProcessor
{
    public record ProcessingInput(byte[] TextureData, int MaxSize);
    public record ProcessingOutput(byte[] CompressedData, int OriginalSize, int CompressedSize);

    ProcessingOutput ProcessTexture(ProcessingInput input);
}
```

#### 3. **C# → C++ → WASM の段階的変換** (最も手動)

CppSharp や SWIG を使用して C# ロジックを C++ に変換

**利点**:
- 既存の C# ツールが使える
- きめ細かい制御が可能

**課題**:
- 手動作業が多い
- 変換の過程でバグが混入しやすい

#### 4. **代替案: Node.js ネイティブアドオン (FFI)**

.NET DLL を Node.js ネイティブアドオン (node-ffi / NAPI) でラップ

**利点**:
- C# コードを変更しない
- 開発が簡単

**課題**:
- ブラウザ環境で動作しない（Node.js のみ）
- プラットフォーム固有のバイナリが必要

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

**Phase 1 完了後の次ステップ:**

1. **componentize-dotnet の統合** (2-3 週間)
   - [ ] componentize-dotnet NuGet パッケージの導入
   - [ ] WIT インターフェースの実装 (textrans.wit)
   - [ ] C# バインディング生成

2. **WebGPU 連携の実装** (2-4 週間)
   - [ ] JavaScript 側 WebGPU ドライバの実装
   - [ ] HLSL → WGSL シェーダー変換
   - [ ] Compute Shader 実行インターフェース

3. **vrm-optimizer への統合** (1-2 週間)
   - [ ] WASM モジュールの npm パッケージ化
   - [ ] TypeScript 型定義の自動生成
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

## ビルド出力

### Phase 1 (現在: NativeAOT-LLVM 化完了)

```bash
# WASM ターゲットのリリースビルド
dotnet build -c Release

# 出力ファイル (WASM ターゲット)
bin/Release/net10.0/wasi-wasm/TexTransCore.dll         # マネージド DLL
bin/Release/net10.0/wasi-wasm/TexTransCore.deps.json  # 依存関係情報

# Publish 出力
dotnet publish -c Release -r wasi-wasm
bin/Release/net10.0/wasi-wasm/publish/TexTransCore.dll
bin/Release/net10.0/wasi-wasm/publish/TexTransCore.deps.json
```

### Phase 2 (予定: componentize-dotnet 統合後)

```bash
# WASM バイナリ
dist/textrans-core.wasm           # IL コンパイル済み WASM モジュール
dist/textrans-core.js             # JavaScript ローダー
dist/textrans-core.d.ts           # TypeScript 型定義
dist/textrans-core.wit            # WebAssembly Interface Types
```

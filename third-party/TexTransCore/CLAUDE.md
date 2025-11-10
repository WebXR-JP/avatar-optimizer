# CLAUDE.md - TexTransCore

このファイルは、TexTransCore (テクスチャ処理 C# ライブラリ) を扱う際に Claude Code へのガイダンスを提供します。

## プロジェクト概要

**TexTransCore** は VRM モデルのテクスチャ処理に特化した .NET ライブラリです。現在は `net8.0` DLL としてビルドされており、将来的には WASM 化により JavaScript から直接呼び出せるようになります。

## プロジェクト構成

### スタック

- **.NET**: 8.0+
- **C#**: 12.0+
- **MSBuild**: プロジェクトビルドシステム

### ディレクトリ構成

```
third-party/TexTransCore/
  ├── TexTransCore.csproj    # プロジェクトファイル
  ├── TexTransCore.sln       # ソリューションファイル
  ├── src/                   # ソースコード
  │   ├── *.cs              # C# 実装ファイル
  │   └── [サブディレクトリ] # 機能別モジュール
  ├── bin/                   # ビルド出力ディレクトリ (git追跡外)
  ├── obj/                   # ビルド中間ファイル (git追跡外)
  ├── LICENSE.md             # ライセンス
  └── README.md              # プロジェクト説明
```

## 開発コマンド

```bash
# NETワークロードのセットアップ（初回のみ）
dotnet workload restore

# プロジェクトのビルド
dotnet build

# リリースビルド
dotnet build -c Release

# クリーンビルド
dotnet clean && dotnet build

# スペシフィックなフレームワークをターゲットに指定
dotnet build -f net8.0
```

## WASM 化ロードマップ

### 現状

TexTransCore は現在 .NET 8.0 DLL として動作しており、JavaScript/TypeScript との統合は保留中です。

### 課題

1. **WASM 互換性の低さ**: Unity 向けに設計されており、WASM ランタイムが提供しない機能に依存している可能性あり
2. **ファイル I/O**: OS ファイルシステムへの直接アクセスが必要な場合、WASM では制限される
3. **メモリ管理**: WASM の線形メモリ（4GB 制限）に対応する必要がある
4. **パフォーマンス**: WASM での実行速度が要件を満たすか検証が必要

### 推奨実装アプローチ (優先度順)

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

### 次のステップ

1. **アプローチの選定**: チーム内で実装方式を決定 (Mono AOT vs componentize-dotnet)
2. **依存関係調査**: TexTransCore の外部依存を詳細に分析
3. **プロトタイプ**: 小規模な機能で WASM コンパイルをテスト
4. **パフォーマンス測定**: ブラウザ/Node.js 環境での性能検証

## 依存関係とバージョン管理

### ターゲットフレームワーク

- **.NET**: 8.0+
- **C#**: 12.0+

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

```bash
# リリースビルド
dotnet build -c Release

# 出力ファイル
# bin/Release/net8.0/TexTransCore.dll
# bin/Release/net8.0/TexTransCore.pdb (デバッグシンボル)
```

### WASM 化後の期待される出力

```bash
# WASM バイナリ
# dist/textrans-core.wasm
# dist/textrans-core.d.ts (型定義)
# dist/textrans-core.js (ローダースクリプト)
```

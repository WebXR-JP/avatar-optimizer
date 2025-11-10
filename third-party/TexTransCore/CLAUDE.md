# CLAUDE.md - TexTransCore

このファイルは、TexTransCore (テクスチャ処理 C# ライブラリ) を扱う際に Claude Code へ のガイダンスを提供します。

## プロジェクト概要

**TexTransCore** は VRM モデルのテクスチャ処理に特化した .NET ライブラリです。**.NET 10 標準の WASM ブラウザビルド (browser-wasm)** により、JavaScript から直接実行可能な WebAssembly モジュールとして利用可能です。

## プロジェクト構成

### スタック

- **.NET**: 10.0 RC2 (RTM対応予定)
- **C#**: 12.0
- **MSBuild**: プロジェクトビルドシステム
- **WASM Runtime**: browser-wasm (Emscripten + Mono) - ブラウザで直接実行

### ディレクトリ構成

```
third-party/TexTransCore/
  ├── TexTransCore.csproj         # プロジェクトファイル (browser-wasm WASM ビルド対応)
  ├── TexTransCore.sln            # ソリューションファイル
  ├── src/                        # ソースコード
  │   ├── *.cs                    # C# 実装ファイル
  │   ├── Program.cs              # WASM アプリケーションエントリーポイント
  │   └── [サブディレクトリ]       # 機能別モジュール
  ├── bin/Release/net10.0/browser-wasm/  # WASM ビルド出力 (git追跡外)
  │   └── publish/                # WASM ランタイム + JavaScript ローダー
  ├── obj/                        # ビルド中間ファイル (git追跡外)
  ├── CLAUDE.md                   # このファイル (Claude Code ガイダンス)
  ├── LICENSE.md                  # ライセンス
  └── README.md                   # プロジェクト説明
```

## 開発コマンド

```bash
# .NET 10 環境確認
dotnet --version

# WASM ビルドツールの確認（初回のみ）
dotnet workload list | grep wasm

# プロジェクトのビルド (browser-wasm - ブラウザ用)
dotnet build -c Release

# WASM ランタイム + JavaScript ローダー生成
dotnet publish -c Release

# クリーンビルド
dotnet clean && dotnet build -c Release && dotnet publish -c Release

# ビルド出力確認
ls -lh bin/Release/net10.0/browser-wasm/
```

### ビルド出力の確認

```bash
# ブラウザ WASM ビルド確認（DLL）
ls -lh bin/Release/net10.0/browser-wasm/TexTransCore.dll

# WASM ランタイム出力確認（JavaScript + WASM バイナリ）
ls -lh bin/Release/net10.0/browser-wasm/publish/
  # dotnet.native.wasm (2.9 MB) - WASM バイナリ本体
  # dotnet.js (37 KB) - JavaScript ローダー
  # dotnet.runtime.js (194 KB) - ランタイムサポート
  # dotnet.native.js (142 KB) - ネイティブバインディング
  # package.json - npm パッケージメタデータ
```

## WASM 化ロードマップ

### 進捗状況

#### Phase 1: ブラウザ WASM ビルド対応 ✅ 完了

TexTransCore は **Phase 1** で以下の実装が完了しました:

- ✅ **.NET 10 RC2** で browser-wasm ビルド対応
- ✅ **browser-wasm ターゲット** (Emscripten + Mono) への対応
  - JavaScript から直接実行可能
  - 追加の WASM 依存なし（単体で完結）
  - Windows/Linux/macOS で同じビルド手順
- ✅ **Program.cs エントリーポイント** の追加
- ✅ **WASM ランタイム + JavaScript ローダー** 生成完了
- ✅ **npm パッケージ形式** での配布対応

**出力**:
- `bin/Release/net10.0/browser-wasm/TexTransCore.dll` (マネージド DLL)
- `bin/Release/net10.0/browser-wasm/publish/`
  - `dotnet.native.wasm` (2.9 MB) - WASM バイナリ
  - `dotnet.js` + ローダー (JavaScript)
  - `package.json` - npm パッケージメタデータ

#### Phase 2: 最適化・API 設計 🟡 計画中 (将来の改善向け)

**現在の状態 (2025-11-10)**:
- ✅ browser-wasm で WASM バイナリ生成成功
- ✅ JavaScript ローダー自動生成
- ⚠️ MonoAOT ネイティブ化は .NET 10 RTM 以降で再検討

**Phase 2 の検討項目**:
1. **C# パブリック API の設計**
   - JavaScript から呼び出し可能な関数インターフェース
   - JSExport 属性による JavaScript バインディング
2. **パフォーマンス最適化**
   - メモリ使用量の削減
   - WASM バイナリサイズの圧縮
3. **TypeScript サポート**
   - 自動生成される型定義の改善
   - IDE サポート向上
4. **npm パッケージ化**
   - `@xrift/textrans-core` として公開
   - バージョン管理と自動更新

**利点**:
- ✅ 現在の browser-wasm で既に ブラウザ実行可能
- ✅ すべてのプラットフォーム (Windows/Linux/macOS) で同じビルド手順
- ✅ 追加ツール不要（.NET 10 SDK のみ）
- ✅ WASM 依存なし（単体で完結）

### 現在の実装課題・検討項目

1. **JavaScript インターフェース未設計**
   - C# のパブリック API をまだ定義していない
   - JSExport 属性による JavaScript バインディングが必要

2. **メモリ管理**
   - WASM の線形メモリ（4GB 制限）への対応
   - 大きなテクスチャ処理時のメモリ最適化が必要

3. **ファイル I/O の制限**
   - WASM では OS ファイルシステムへの直接アクセスが制限される
   - Blob/File API を使用した代替実装が必要

4. **パフォーマンス検証**
   - WASM での実行速度が要件を満たすか未検証
   - 本格的な統合テスト前に性能測定が必要

### Phase 2 以降の実装計画

**短期 (Phase 2)**:
1. JavaScript 呼び出し用 C# パブリック API 設計
   - `TextureProcessor.ProcessAsync()` など基本関数の定義
   - JSExport 属性を使用したエクスポート
2. npm パッケージ化
   - `publish/` フォルダを `@xrift/textrans-core` として公開
   - package.json の更新

**中期**:
1. TypeScript 型定義の改善
2. ブラウザテスト環境の構築
3. vrm-optimizer への統合

**長期**:
1. MonoAOT ネイティブ化（.NET 10 RTM 以降）
2. パフォーマンス最適化
3. エッジケースの処理

## 依存関係とバージョン管理

### ターゲットフレームワーク

- **.NET**: 10.0 RC2 (RTM 対応予定)
- **C#**: 12.0
- **WASM Runtime**: browser-wasm (Emscripten + Mono)
- **ビルドツール**: wasm-tools ワークロード

### 外部依存関係

TexTransCore は **外部 NuGet パッケージに依存しません**（.NET 標準ライブラリのみ）。

新しいパッケージを追加する際は以下を確認してください：
- ✅ WASM (browser-wasm) 互換性
- ✅ ライセンス互換性 (MIT, Apache-2.0, BSD など)
- ✅ メンテナンス状況

### ビルド環境要件

| 要件 | 最小版 | 確認方法 |
|------|--------|---------|
| .NET SDK | 10.0 RC2 | `dotnet --version` |
| wasm-tools | 10.0+ | `dotnet workload list` |
| C# | 12.0 | 自動（SDK に含まれる） |

## 開発時の重要なポイント

1. **WASM 互換性を意識**
   - ファイル I/O や OS 固有機能（レジストリアクセスなど）を避ける
   - 標準的な C# API のみを使用

2. **browser-wasm ターゲットの維持**
   - RuntimeIdentifier は `browser-wasm` を保つ
   - Program.cs の Main メソッドは削除しない（ローダー生成に必須）

3. **ビルド出力サイズの監視**
   - WASM バイナリサイズ（現在 2.9 MB）の増加に注意
   - 不要なメソッドはトリミング対象に

4. **npm パッケージ互換性**
   - package.json の メタデータを正確に管理
   - セマンティックバージョニング（MAJOR.MINOR.PATCH）を使用

### プラットフォーム別ビルド対応

| 機能 | Linux | macOS | Windows |
|------|-------|-------|---------|
| C# コンパイル | ✅ | ✅ | ✅ |
| browser-wasm DLL ビルド | ✅ | ✅ | ✅ |
| WASM ランタイム生成 | ✅ | ✅ | ✅ |
| npm パッケージ化 | ✅ | ✅ | ✅ |

## ビルド出力

### Phase 1 ビルド出力（現在）

**すべてのプラットフォーム (Linux/macOS/Windows) で生成**:

```
bin/Release/net10.0/browser-wasm/
├── TexTransCore.dll                    # マネージド DLL (74 KB)
└── publish/                            # WASM ランタイム + ローダー (3.3 MB)
    ├── dotnet.native.wasm              # WASM バイナリ (2.9 MB)
    ├── dotnet.js                       # メインローダー (37 KB)
    ├── dotnet.runtime.js               # ランタイムサポート (194 KB)
    ├── dotnet.native.js                # ネイティブバインディング (142 KB)
    ├── dotnet.diagnostics.js           # 診断ツール (8.6 KB)
    ├── dotnet.es6.*.js                 # ES6 モジュールサポート (補助)
    ├── dotnet.d.ts                     # TypeScript 型定義 (27 KB)
    └── package.json                    # npm パッケージメタデータ
```

### Phase 2 完成時の予定出力

```
dist/
├── textrans-core.wasm                  # WASM バイナリ (要・C# API設計)
├── textrans-core.js                    # JavaScript ラッパー
├── textrans-core.d.ts                  # TypeScript 型定義
└── package.json                        # npm パッケージ定義
```

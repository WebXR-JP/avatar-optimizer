# CLAUDE.md - TexTransCore

このファイルは、TexTransCore (テクスチャ処理 C# ライブラリ) を扱う際に Claude Code へ のガイダンスを提供します。

## プロジェクト概要

**TexTransCore** は VRM モデルのテクスチャ処理に特化した .NET ライブラリです。**.NET 10 標準の WASM ビルド (MonoAOT)** により、ブラウザ環境で動作する WebAssembly モジュールとして利用可能です。

## プロジェクト構成

### スタック

- **.NET**: 10.0 (RTM) 標準の WASM ビルドサポート
- **C#**: 12.0
- **MSBuild**: プロジェクトビルドシステム
- **WASM Runtime**: wasi-wasm (WebAssembly System Interface)

### ディレクトリ構成

```
third-party/TexTransCore/
  ├── TexTransCore.csproj         # プロジェクトファイル (MonoAOT WASM ビルド対応)
  ├── TexTransCore.sln            # ソリューションファイル
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
# .NET 10 への PATH 設定（初回のみ）
export PATH="$HOME/.dotnet:$PATH"

# プロジェクトのビルド (.NET 10 で WASM ターゲット)
dotnet build

# リリースビルド (WASM マネージド DLL)
dotnet build -c Release

# WASM Publish (DLL + 依存関係)
dotnet publish -c Release -r wasi-wasm

# クリーンビルド
dotnet clean && dotnet build -c Release

# WIT バインディング確認（自動生成）
ls -la obj/Release/net10.0/wasi-wasm/wit_bindgen/

# ビルド出力確認
ls -lh bin/Release/net10.0/wasi-wasm/
```

### ビルド出力の確認

```bash
# マネージド DLL 確認
ls -lh bin/Release/net10.0/wasi-wasm/TexTransCore.dll

# Publish 出力確認（依存関係含む）
ls -lh bin/Release/net10.0/wasi-wasm/publish/
```

## WASM 化ロードマップ

### 進捗状況

#### Phase 1: .NET 10 標準 WASM ビルド対応 ✅ 完了

TexTransCore は **Phase 1** で以下の更新が完了しました:

- ✅ **.NET 10 (RTM)** への更新
- ✅ **.NET 10 標準の WASM ビルドサポート** (wasi-wasm) への対応
  - NativeAOT-LLVM に依存しない標準ビルドツール
  - Windows/Linux/macOS で同じビルド手順
- ✅ **WIT インターフェース定義** (`textrans.wit`) の作成
- ✅ **WASM ビルド・Publish** の成功確認

**出力**:
- `bin/Release/net10.0/wasi-wasm/TexTransCore.dll` (マネージド DLL)
- `bin/Release/net10.0/wasi-wasm/publish/` (Publish 出力 - 依存関係含む)

#### Phase 2: MonoAOT WASM ネイティブ化 🟡 計画中 (環境制限あり)

**最新情報 (2025-11-10)**:
- ✅ マネージド DLL（WASM ターゲット）のビルドに成功
  - `bin/Release/net10.0/wasi-wasm/TexTransCore.dll` (83KB)
- ⚠️ 現在の .NET 10 RC2 環境では、MonoAOT-LLVM の完全な AOT コンパイルが未サポート
  - ILC（IL Compiler）ツールチェーンが利用できない
  - componentize-dotnet SDK が LLVM IL Compiler に依存している

.NET 10 正式リリース後の継続的な開発を計画しています。

**Phase 2 の実装計画**:
- MonoAOT コンパイラによる WASM ネイティブバイナリ生成（.NET 10 RTM 以降）
- JavaScript/TypeScript ラッパーの実装
- ブラウザ環境での動作確認

**利点**:
- ✅ すべてのプラットフォーム (Windows/Linux/macOS) で同じビルド手順
- ✅ .NET 10 のツール群に含まれているため追加インストール不要
- ✅ マネージド DLL/Publish 出力は全プラットフォームで利用可能

### Phase 2 以降の課題

1. **WASM 互換性の低さ**: Unity 向けに設計されており、WASM ランタイムが提供しない機能に依存している可能性あり
2. **ファイル I/O**: OS ファイルシステムへの直接アクセスが必要な場合、WASM では制限される
3. **メモリ管理**: WASM の線形メモリ（4GB 制限）に対応する必要がある
4. **パフォーマンス**: WASM での実行速度が要件を満たすか検証が必要

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

### Phase 2 実装計画 (.NET 10 RTM 以降)

**現在の状態 (2025-11-10)**:
- ✅ **Phase 1 完了**: マネージド DLL ビルド成功、WIT インターフェース定義完了
- ⚠️ **Phase 2 遅延**: .NET 10 RC2 環境では ILC ツールチェーンが利用できない

**Phase 2 進捗状況:**

1. **MonoAOT WASM コンパイル準備** 🟡 .NET 10 RTM待ち
   - [ ] MonoAOT ツールチェーンの設定確認 (.NET 10 RTM 以降)
   - [ ] ILC（IL Compiler）環境セットアップ
   - [ ] WASM ネイティブバイナリ生成パイプラインの構築
   - [ ] dist/textrans-core.wasm 生成

2. **JavaScript ローダー実装** ⏳ Phase 2 並行実装
   - [ ] WASM モジュールローダー (dist/textrans-core.js)
   - [ ] TypeScript 型定義 (dist/textrans-core.d.ts)
   - [ ] メモリ管理とリソース生存期間管理
   - [ ] エラーハンドリング

3. **vrm-optimizer への統合** ⏳ Phase 2 後期実装
   - [ ] WASM モジュールの npm パッケージ化
   - [ ] TypeScript API 設計
   - [ ] E2E テスト (ブラウザ環境)

## 依存関係とバージョン管理

### ターゲットフレームワーク

- **.NET**: 10.0 (RTM) 標準の WASM ビルドサポート
- **C#**: 12.0
- **WASM Runtime**: wasi-wasm + MonoAOT (WebAssembly System Interface)

### 外部依存関係

現在のところ、TexTransCore は最小限の外部依存を持つことを目指しています。新しい NuGet パッケージを追加する際は、以下を確認してください：

- WASM 互換性
- ライセンス互換性
- メンテナンス状況

## 開発時の重要なポイント

1. **WASM 互換性を意識**: ファイル I/O や OS 固有機能を避ける
2. **既存実装の保全**: C# コード自体に大きな変更を加えない
3. **ビルド可能性の維持**: WASM 化への道筋を明確にしておく

### 開発に関する注意事項

**プラットフォーム別ビルド機能**:
| 機能 | Linux/macOS | Windows |
|------|-----------|---------|
| C# コンパイル | ✅ | ✅ |
| マネージド DLL (WASM ターゲット) | ✅ | ✅ |
| WASM Publish (依存関係含む) | ✅ | ✅ |
| MonoAOT WASM ネイティブ | 🟡 計画中 | 🟡 計画中 |

## ビルド出力

### 現在のビルド出力 (Phase 1 完了)

**すべてのプラットフォーム (Linux/macOS/Windows) で生成**:
```bash
# マネージド DLL
bin/Release/net10.0/wasi-wasm/TexTransCore.dll         # マネージド DLL
bin/Release/net10.0/wasi-wasm/TexTransCore.deps.json   # 依存関係情報

# WASM Publish 出力（依存関係含む）
bin/Release/net10.0/wasi-wasm/publish/
  ├── TexTransCore.dll                                  # DLL
  ├── TexTransCore.deps.json                            # 依存関係
  └── [その他の依存アセンブリ]
```

### Phase 2 完成時の予定出力

```bash
# JavaScript インターフェース
dist/textrans-core.wasm                  # WASM バイナリ (MonoAOT)
dist/textrans-core.loader.js             # WASM ローダー
dist/textrans-core.d.ts                  # TypeScript 型定義
```

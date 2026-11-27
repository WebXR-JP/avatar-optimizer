#!/usr/bin/env bash
# Basis Universal の WASM エンコーダー（wasm/basis_encoder.{js,wasm}）をビルドする。
#
# 上流のビルド済みファイルとの違い:
#   - 入力画像の上限 BASISU_ENCODER_MAX_SOURCE_IMAGE_PIXELS を 6,291,456（2048x3072）から
#     4096x4096 に引き上げる（4096px アトラスを KTX2 にするため。UASTC LDR 4x4 なら
#     初期ヒープ 512MB の範囲でエンコードできることを確認済み）
#   - 最大メモリを 4GB（32bit WASM の上限）にする
#   - ES モジュール（EXPORT_ES6）・ブラウザ向け（ENVIRONMENT=web）で出力する。
#     Node では src/wasm-source.node.ts が wasmBinary を直接渡して読み込む
#
# 必要なもの: git, python3, cmake, make, emscripten（emcmake / emmake が PATH にあること）
#   例: nix shell nixpkgs#emscripten nixpkgs#cmake nixpkgs#gnumake -c ./scripts/build-wasm.sh
#   確認済みの環境: emscripten 5.0.6
#
# 使い方: packages/texture-compression で ./scripts/build-wasm.sh
set -euo pipefail

BASIS_REPO="https://github.com/BinomialLLC/basis_universal.git"
# 2025-11-18 "rebuild WASM"（従来同梱していた WASM と同じ API のソース）
BASIS_COMMIT="5179a063436a7e39d159afa2eb22c789ceeeb533"
MAX_SOURCE_IMAGE_PIXELS="(4096*4096)"

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
SRC_DIR="$WORK_DIR/basis_universal"

for cmd in git python3 emcmake emmake; do
  command -v "$cmd" >/dev/null || { echo "$cmd が見つかりません" >&2; exit 1; }
done

if [ ! -d "$SRC_DIR/.git" ]; then
  git clone --filter=blob:none "$BASIS_REPO" "$SRC_DIR"
fi
git -C "$SRC_DIR" -c advice.detachedHead=false checkout --force "$BASIS_COMMIT"

python3 - "$SRC_DIR" "$MAX_SOURCE_IMAGE_PIXELS" <<'PY'
import sys
src, max_pixels = sys.argv[1], sys.argv[2]

wrappers = f"{src}/webgl/transcoder/basis_wrappers.cpp"
s = open(wrappers).read()
old = "#define BASISU_ENCODER_MAX_SOURCE_IMAGE_PIXELS (6291456)"
assert old in s, "basis_wrappers.cpp の上限定義が見つかりません"
open(wrappers, "w").write(
    s.replace(old, f"#define BASISU_ENCODER_MAX_SOURCE_IMAGE_PIXELS {max_pixels}")
)

cmake = f"{src}/webgl/encoder/CMakeLists.txt"
s = open(cmake).read()
old = '-s MODULARIZE=1 -s EXPORT_NAME=BASIS -s ASSERTIONS=0  -s EXPORTED_RUNTIME_METHODS'
assert s.count(old) == 1, "シングルスレッド版の LINK_FLAGS が見つかりません"
open(cmake, "w").write(s.replace(
    old,
    '-s MAXIMUM_MEMORY=4GB -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web '
    '-s EXPORT_NAME=BASIS -s ASSERTIONS=0  -s EXPORTED_RUNTIME_METHODS',
))
PY

BUILD_DIR="$SRC_DIR/webgl/encoder/build-avatar-optimizer"
rm -rf "$BUILD_DIR"
emcmake cmake -S "$SRC_DIR/webgl/encoder" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release
emmake make -C "$BUILD_DIR" -j"$(nproc 2>/dev/null || echo 4)" basis_encoder.js

cp "$BUILD_DIR/basis_encoder.js" "$BUILD_DIR/basis_encoder.wasm" "$PACKAGE_DIR/wasm/"
cp "$SRC_DIR/LICENSE" "$PACKAGE_DIR/wasm/LICENSE"
(cd "$PACKAGE_DIR" && npx prettier --write wasm/basis_encoder.js >/dev/null)

echo "wasm/basis_encoder.{js,wasm} を更新しました（basis_universal ${BASIS_COMMIT:0:7}）"

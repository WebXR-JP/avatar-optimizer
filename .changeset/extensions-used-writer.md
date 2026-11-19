---
'@webxr-jp/avatar-optimizer': patch
'@webxr-jp/mtoon-atlas': patch
---

MToon 以外のマテリアル（KHR_materials_specular などを使う PBR のアクセサリ）を含むアバターをエクスポートすると、`extensionsUsed` から `VRMC_vrm` / `VRMC_springBone` / `XRIFT_mtoon_atlas` / `KHR_texture_basisu` が消え、読み込み直しても VRM として認識されない問題を修正した。GLTFExporter は書き出し時に `writer.extensionsUsed` のキー一覧で `json.extensionsUsed` を上書きするため、プラグインが `json.extensionsUsed` に直接追加した拡張名は、組み込み拡張が 1 つでも使われると失われていた。拡張名を `writer.extensionsUsed` に登録するようにした

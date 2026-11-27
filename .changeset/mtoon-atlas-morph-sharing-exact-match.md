---
'@webxr-jp/mtoon-atlas': patch
---

`MToonAtlasExporterPlugin` の `optimizeMorphAttributeSharing` が配列の先頭・中間・末尾サンプルのみでアクセサ重複を判定していたため、大半が 0 で途中頂点のみ異なる別モーフターゲット同士が誤って同じアクセサに共有されて表情が崩れる不具合を修正しました。FNV-1a ハッシュによるバケット化と全バイト完全一致比較で重複排除するようにしています。

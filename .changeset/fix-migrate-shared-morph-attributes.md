---
'@webxr-jp/avatar-optimizer': patch
---

VRM 0.x → VRM 1.0 マイグレーション時に、マルチプリミティブメッシュなどで複数ジオメトリが同一のモーフターゲット属性を共有している場合に BlendShape が二重反転して壊れる不具合を修正しました。`rotateAllVertexBuffers` で属性単位キャッシュと `editBufferAttribute` を使用し、元の配列を破壊せず 1 回のみ回転しつつ属性共有を維持します。

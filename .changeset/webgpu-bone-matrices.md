---
"@webxr-jp/avatar-optimizer": patch
---

VRM0→VRM1 スケルトンマイグレーション後に WebGPURenderer でスキニングが更新されない問題を修正した。マイグレーションが `skeleton.computeBoneTexture()` を呼んで `boneMatrices` を WebGL のボーンテクスチャ用の大きさに広げていたため、ボーン数ぶんの uniform バッファへの書き込みが毎フレーム拒否されていた。ボーンテクスチャは WebGLRenderer が描画時に自分で作るので、マイグレーションでは作らないようにした

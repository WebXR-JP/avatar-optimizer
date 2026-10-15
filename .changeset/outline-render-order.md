---
'@webxr-jp/mtoon-atlas': patch
---

ローダーの afterRoot でアウトライン（isOutline）マテリアルのメッシュの renderOrder を本体より下げるようにした。renderOrder は glTF に保存されず、再読み込み後は透明グループの黒いアウトラインが本体の後に描かれて髪などが真っ黒になっていた（#66）

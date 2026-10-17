---
'@webxr-jp/avatar-optimizer': patch
'@webxr-jp/mtoon-atlas': patch
---

半透明マテリアルを深度書き込みの有無で別グループ（transparentZWrite / transparent）に分け、MToon の TransparentWithZWrite を最適化後も保持するようにした。これまでは半透明を一律 depthWrite=false にまとめていたため、髪など TransparentWithZWrite のマテリアルで作者が意図した深度による前後関係（毛束の重なり・アウトラインの隠蔽）が失われていた。あわせて拡張に `transparentWithZWrite` を保存して読み込み時に depthWrite を復元し、ローダーの描画順は three-vrm と同じ規則（深度書き込みなしの半透明を renderOrder 19 で後に描く）に揃えた（#66）

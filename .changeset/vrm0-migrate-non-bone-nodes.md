---
'@webxr-jp/avatar-optimizer': patch
---

VRM0→VRM1 マイグレーションで、スキンの joint でない末端ノード（`*_end` など Bone でない Object3D）や、Bone でない中間ノード配下のボーンも Y 軸 180° 回転に合わせて補正するようにした。これまでは Bone だけを辿っていたため末端ノードの位置が前後逆になり、SpringBone の静止方向が体の内側を向いてコライダーに押され、胸が背中側へ振れていた（#65）

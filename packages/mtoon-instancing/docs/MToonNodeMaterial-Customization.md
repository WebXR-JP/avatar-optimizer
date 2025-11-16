# MToonNodeMaterialのカスタマイズについて

## 概要

MToonNodeMaterialは、three-vrmをライブラリとして利用するプロジェクトから**完全にカスタマイズ可能**です。

## 公開API

`@pixiv/three-vrm-materials-mtoon/nodes`から以下がエクスポートされています：

```javascript
import {
  MToonNodeMaterial,
  MToonNodeMaterialParameters,
  MToonLightingModel,
  MToonAnimatedUVNode
} from '@pixiv/three-vrm-materials-mtoon/nodes';
```

## カスタマイズ方法

### 1. ノードベースのカスタマイズ（推奨）

コンストラクタで9個のカスタムノードを指定できます：

```javascript
const customMaterial = new MToonNodeMaterial({
  color: 0xffffff,
  shadeColorNode: /* your custom node */,
  shadingShiftNode: /* your custom node */,
  shadingToonyNode: /* your custom node */,
  rimLightingMixNode: /* your custom node */,
  rimMultiplyNode: /* your custom node */,
  matcapNode: /* your custom node */,
  parametricRimColorNode: /* your custom node */,
  parametricRimLiftNode: /* your custom node */,
  parametricRimFresnelPowerNode: /* your custom node */,
});
```

Three.jsのTSL（Texture Shader Language）を使ってシェーダーロジックを自由に記述できます。

### 2. クラス継承による拡張

以下のメソッドをオーバーライドしてカスタマイズ可能：

```javascript
class MyCustomMToonMaterial extends MToonNodeMaterial {
  setupLighting(builder) {
    // 独自のライティング処理
    return /* your custom lighting node */;
  }

  setupDiffuseColor(builder) {
    // 独自のディフューズ色処理
    super.setupDiffuseColor(builder);
  }

  setupVariants() {
    // 独自のバリアント設定
    super.setupVariants();
  }

  setupNormal(builder) {
    // 独自の法線処理
    return /* your custom normal node */;
  }

  setupPosition(builder) {
    // 独自のポジション処理
    return /* your custom position node */;
  }

  setupLightingModel() {
    // 独自のライティングモデル
    return super.setupLightingModel();
  }
}
```

## 要件

- Three.js r167以上
- TypeScriptの型定義も公開されているため、IDE補完が利用可能

## 参考資料

- [three-vrm-materials-mtoon README.md](../packages/three-vrm-materials-mtoon/README.md)
- [webgpu-feature-test.html](../packages/three-vrm-materials-mtoon/examples/webgpu-feature-test.html) - 実装例
